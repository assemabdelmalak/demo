#!/usr/bin/env node
// A stand-in for Mailpit where Docker is not available: an SMTP server that keeps every message
// in memory and serves them over HTTP in the subset of Mailpit's API that the E2E tests read
// (`GET /api/v1/messages`, `GET /api/v1/message/{id}`). Local development only: no TLS, no auth,
// nothing written to disk.
//
//   node infra/scripts/mail-catcher.mjs            # SMTP on 1025, HTTP on 8025 (SMTP_URL in .env.example)
//   SMTP_PORT=2525 HTTP_PORT=8026 node infra/scripts/mail-catcher.mjs
import { randomUUID } from 'node:crypto';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createTcpServer } from 'node:net';

const SMTP_PORT = Number(process.env.SMTP_PORT ?? 1025);
const HTTP_PORT = Number(process.env.HTTP_PORT ?? 8025);
const HOST = process.env.HOST ?? '127.0.0.1';
// Enough for a test run; the oldest messages are dropped first.
const MAX_MESSAGES = 500;
const MAX_MESSAGE_BYTES = 5 * 1024 * 1024;

/** Newest first, like Mailpit. */
const messages = [];

/** Header block → lower-cased name → unfolded value. */
function parseHeaders(block) {
  const headers = new Map();
  for (const line of block.replace(/\r\n[ \t]+/g, ' ').split('\r\n')) {
    const colon = line.indexOf(':');
    if (colon > 0)
      headers.set(line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim());
  }
  return headers;
}

function splitEntity(raw) {
  const end = raw.indexOf('\r\n\r\n');
  return end === -1
    ? { headers: parseHeaders(raw), body: '' }
    : { headers: parseHeaders(raw.slice(0, end)), body: raw.slice(end + 4) };
}

function param(value, name) {
  const match = new RegExp(`${name}="?([^";]+)"?`, 'i').exec(value ?? '');
  return match?.[1];
}

function decodeBody(body, encoding, charset = 'utf-8') {
  const bytes =
    encoding === 'base64'
      ? Buffer.from(body.replace(/\s+/g, ''), 'base64')
      : encoding === 'quoted-printable'
        ? Buffer.from(
            body
              .replace(/=\r\n/g, '')
              .replace(/=([0-9A-F]{2})/gi, (_, hex) =>
                String.fromCharCode(Number.parseInt(hex, 16)),
              ),
            'latin1',
          )
        : Buffer.from(body, 'latin1');
  return new TextDecoder(charset.toLowerCase() === 'us-ascii' ? 'utf-8' : charset).decode(bytes);
}

/** RFC 2047 encoded words in headers (`=?UTF-8?B?…?=`), which nodemailer uses for non-ASCII subjects. */
function decodeWords(value = '') {
  return value
    .replace(/\?=\s+=\?/g, '?==?')
    .replace(/=\?([^?]+)\?([BQ])\?([^?]*)\?=/gi, (_, charset, kind, text) =>
      kind.toUpperCase() === 'B'
        ? decodeBody(text, 'base64', charset)
        : decodeBody(text.replace(/_/g, ' '), 'quoted-printable', charset),
    );
}

/** The text and HTML parts of a (possibly multipart) entity. */
function collectParts(raw, found = { text: '', html: '' }) {
  const { headers, body } = splitEntity(raw);
  const type = headers.get('content-type') ?? 'text/plain';
  const boundary = param(type, 'boundary');
  if (/^multipart\//i.test(type) && boundary) {
    for (const part of body.split(`--${boundary}`).slice(1)) {
      if (part.startsWith('--')) break;
      collectParts(part.replace(/^\r\n/, ''), found);
    }
    return found;
  }
  const decoded = decodeBody(
    body,
    (headers.get('content-transfer-encoding') ?? '7bit').toLowerCase(),
    param(type, 'charset') ?? 'utf-8',
  );
  if (/^text\/html/i.test(type) && !found.html) found.html = decoded;
  else if (/^text\/plain/i.test(type) && !found.text) found.text = decoded;
  return found;
}

function address(value) {
  const decoded = decodeWords(value).trim();
  const match = /^(.*)<([^>]+)>$/.exec(decoded);
  return match
    ? { Name: match[1].trim().replace(/^"|"$/g, ''), Address: match[2].trim() }
    : { Name: '', Address: decoded };
}

function store(raw, recipients) {
  const { headers } = splitEntity(raw);
  const { text, html } = collectParts(raw);
  const to = headers.get('to');
  const message = {
    ID: randomUUID(),
    MessageID: (headers.get('message-id') ?? '').replace(/^<|>$/g, ''),
    From: address(headers.get('from') ?? ''),
    To: to
      ? to.split(',').map(address)
      : recipients.map((recipient) => ({ Name: '', Address: recipient })),
    Subject: decodeWords(headers.get('subject')),
    Created: new Date().toISOString(),
    Snippet: text.replace(/\s+/g, ' ').trim().slice(0, 250),
    Text: text,
    HTML: html,
  };
  messages.unshift(message);
  messages.length = Math.min(messages.length, MAX_MESSAGES);
}

const smtp = createTcpServer((socket) => {
  let buffer = '';
  let inData = false;
  let recipients = [];
  const reply = (line) => socket.write(`${line}\r\n`);
  reply('220 mail-catcher ESMTP');

  socket.on('data', (chunk) => {
    buffer += chunk.toString('latin1');
    if (buffer.length > MAX_MESSAGE_BYTES) {
      reply('552 Message too large');
      socket.end();
      return;
    }
    for (;;) {
      if (inData) {
        const end = buffer.indexOf('\r\n.\r\n');
        if (end === -1) return;
        // Dot-stuffing: a leading ".." stands for "." (RFC 5321 §4.5.2).
        store(buffer.slice(0, end).replace(/^\.\./gm, '.'), recipients);
        buffer = buffer.slice(end + 5);
        inData = false;
        recipients = [];
        reply('250 OK: queued');
        continue;
      }
      const newline = buffer.indexOf('\r\n');
      if (newline === -1) return;
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 2);
      const verb = line.slice(0, 4).toUpperCase();
      if (verb === 'EHLO') socket.write('250-mail-catcher\r\n250 8BITMIME\r\n');
      else if (verb === 'HELO') reply('250 mail-catcher');
      else if (verb === 'MAIL') reply('250 OK');
      else if (verb === 'RCPT') {
        recipients.push(/<([^>]*)>/.exec(line)?.[1] ?? '');
        reply('250 OK');
      } else if (verb === 'DATA') {
        inData = true;
        reply('354 End data with <CR><LF>.<CR><LF>');
      } else if (verb === 'RSET') {
        recipients = [];
        reply('250 OK');
      } else if (verb === 'NOOP') reply('250 OK');
      else if (verb === 'QUIT') {
        reply('221 Bye');
        socket.end();
        return;
      } else reply('502 Command not implemented');
    }
  });
  socket.on('error', () => undefined);
});

function summary({ Text: _text, HTML: _html, ...rest }) {
  return rest;
}

const http = createHttpServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://${HOST}`);
  const json = (status, body) => {
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(body));
  };
  if (request.method === 'GET' && url.pathname === '/api/v1/messages') {
    const limit = Number(url.searchParams.get('limit') ?? 50) || 50;
    const page = messages.slice(0, limit).map(summary);
    json(200, { total: messages.length, count: page.length, start: 0, messages: page });
  } else if (request.method === 'DELETE' && url.pathname === '/api/v1/messages') {
    messages.length = 0;
    json(200, 'ok');
  } else if (request.method === 'GET' && url.pathname.startsWith('/api/v1/message/')) {
    const id = decodeURIComponent(url.pathname.slice('/api/v1/message/'.length));
    const message = id === 'latest' ? messages[0] : messages.find((m) => m.ID === id);
    if (message) json(200, message);
    else json(404, { error: 'message not found' });
  } else if (url.pathname === '/readyz') {
    json(200, 'ok');
  } else {
    json(404, { error: 'not found' });
  }
});

smtp.listen(SMTP_PORT, HOST, () => {
  process.stdout.write(`mail-catcher: SMTP on ${HOST}:${String(SMTP_PORT)}` + '\n');
});
http.listen(HTTP_PORT, HOST, () => {
  process.stdout.write(
    `mail-catcher: HTTP API on http://${HOST}:${String(HTTP_PORT)}/api/v1/messages` + '\n',
  );
});
