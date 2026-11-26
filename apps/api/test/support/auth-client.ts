import { createHash, createHmac } from 'node:crypto';

import { type NestFastifyApplication } from '@nestjs/platform-fastify';

import { type MemoryMailer } from '@radd/mail';

import { AuthMailer } from '../../src/auth/auth-mailer';

type InjectResponse = Awaited<ReturnType<NestFastifyApplication['inject']>>;

export interface Cookie {
  name: string;
  value: string;
  attributes: string[];
}

export function parseSetCookie(header: string): Cookie {
  const [pair = '', ...attributes] = header.split(';').map((part) => part.trim());
  const eq = pair.indexOf('=');
  return { name: pair.slice(0, eq), value: pair.slice(eq + 1), attributes };
}

export function setCookies(res: InjectResponse): Cookie[] {
  const header = res.headers['set-cookie'];
  const list = header === undefined ? [] : Array.isArray(header) ? header : [header];
  return list.map(parseSetCookie);
}

/**
 * A browser stand-in for `app.inject`: keeps cookies between requests, sends the console's Origin
 * (Better Auth checks it whenever cookies are sent) and a fixed client IP.
 */
export class TestBrowser {
  readonly jar = new Map<string, string>();

  constructor(
    private readonly app: NestFastifyApplication,
    readonly options: { origin: string; ip: string; locale?: string },
  ) {}

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = { origin: this.options.origin, ...extra };
    if (this.options.locale) headers['x-radd-locale'] = this.options.locale;
    if (this.jar.size > 0) {
      headers.cookie = [...this.jar].map(([name, value]) => `${name}=${value}`).join('; ');
    }
    return headers;
  }

  private remember(res: InjectResponse): InjectResponse {
    for (const cookie of setCookies(res)) {
      const expired =
        cookie.value === '' ||
        cookie.attributes.some((attribute) => /^max-age=0$/i.test(attribute));
      if (expired) this.jar.delete(cookie.name);
      else this.jar.set(cookie.name, cookie.value);
    }
    return res;
  }

  async post(url: string, payload: unknown = {}, extra?: Record<string, string>) {
    return this.remember(
      await this.app.inject({
        method: 'POST',
        url,
        payload: payload as Record<string, unknown>,
        headers: this.headers(extra),
        remoteAddress: this.options.ip,
      }),
    );
  }

  async patch(url: string, payload: unknown = {}, extra?: Record<string, string>) {
    return this.remember(
      await this.app.inject({
        method: 'PATCH',
        url,
        payload: payload as Record<string, unknown>,
        headers: this.headers(extra),
        remoteAddress: this.options.ip,
      }),
    );
  }

  async put(url: string, payload: unknown = {}, extra?: Record<string, string>) {
    return this.remember(
      await this.app.inject({
        method: 'PUT',
        url,
        payload: payload as Record<string, unknown>,
        headers: this.headers(extra),
        remoteAddress: this.options.ip,
      }),
    );
  }

  async delete(url: string, extra?: Record<string, string>) {
    return this.remember(
      await this.app.inject({
        method: 'DELETE',
        url,
        headers: this.headers(extra),
        remoteAddress: this.options.ip,
      }),
    );
  }

  async get(url: string, extra?: Record<string, string>) {
    return this.remember(
      await this.app.inject({
        method: 'GET',
        url,
        headers: this.headers(extra),
        remoteAddress: this.options.ip,
      }),
    );
  }
}

/** The newest code emailed to `address`, after waiting for background deliveries. */
export async function latestCode(
  app: NestFastifyApplication,
  mailer: MemoryMailer,
  address: string,
): Promise<string | undefined> {
  await app.get(AuthMailer).settled();
  return mailer.latestTo(address)?.text.match(/^(\d{6})$/m)?.[1];
}

/** A random address in the private 10/8 range, so rate-limit buckets never carry over runs. */
export function randomIp(): string {
  const octet = () => Math.floor(Math.random() * 254) + 1;
  return `10.${String(octet())}.${String(octet())}.${String(octet())}`;
}

let counter = 0;
export function uniqueEmail(label: string): string {
  counter += 1;
  return `${label}.${String(Date.now())}.${String(counter)}@radd.test`;
}

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(input: string): Buffer {
  let bits = '';
  for (const char of input.replace(/=+$/, '').toUpperCase()) {
    const index = BASE32.indexOf(char);
    if (index === -1) throw new Error('invalid base32');
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8)
    bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

/** RFC 6238 TOTP (SHA-1, 6 digits, 30 s), what authenticator apps compute from the QR code. */
export function totp(secretBase32: string, now = Date.now()): string {
  const counter64 = Buffer.alloc(8);
  counter64.writeBigUInt64BE(BigInt(Math.floor(now / 1000 / 30)));
  const digest = createHmac('sha1', base32Decode(secretBase32)).update(counter64).digest();
  const offset = (digest.at(-1) ?? 0) & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 1_000_000).padStart(6, '0');
}

/** How Better Auth's email-OTP plugin stores a code with `storeOTP: 'hashed'`. */
export function hashedOtp(code: string): string {
  return createHash('sha256').update(code).digest('base64url');
}
