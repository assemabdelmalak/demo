import { type LoggerService } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { type Mailer, type MailMessage, MemoryMailer } from '@radd/mail';

import { AuthMailer } from './auth-mailer';

const logger = () => ({ log: vi.fn(), warn: vi.fn(), error: vi.fn() }) satisfies LoggerService;

class FlakyMailer implements Mailer {
  readonly sent: MailMessage[] = [];
  attempts = 0;
  constructor(private failures: number) {}
  send(message: MailMessage): Promise<void> {
    this.attempts += 1;
    if (this.failures > 0) {
      this.failures -= 1;
      return Promise.reject(new Error(`550 rejected <${message.to}>`));
    }
    this.sent.push(message);
    return Promise.resolve();
  }
}

describe('AuthMailer', () => {
  it('returns before the email is sent and renders it in the requested language', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const memory = new MemoryMailer();
    const slow: Mailer = { send: (m) => gate.then(() => memory.send(m)) };
    const mailer = new AuthMailer(slow, logger(), []);

    mailer.sendCode({ to: 'rana@example.com', code: '123456', type: 'sign-in', locale: 'ar' });
    expect(memory.sent).toHaveLength(0);

    release();
    await mailer.settled();
    const message = memory.latestTo('rana@example.com');
    expect(message?.html).toContain('dir="rtl"');
    expect(message?.text).toContain('123456');
  });

  it('maps every code type to its template', async () => {
    const memory = new MemoryMailer();
    const mailer = new AuthMailer(memory, logger(), []);
    mailer.sendCode({ to: 'a@x.test', code: '1', type: 'sign-in', locale: 'en' });
    mailer.sendCode({ to: 'b@x.test', code: '2', type: 'email-verification', locale: 'en' });
    mailer.sendCode({ to: 'c@x.test', code: '3', type: 'forget-password', locale: 'en' });
    mailer.sendCode({ to: 'd@x.test', code: '4', type: 'change-email', locale: 'en' });
    await mailer.settled();
    expect(memory.latestTo('a@x.test')?.subject).toMatch(/sign-in code/);
    expect(memory.latestTo('b@x.test')?.subject).toMatch(/Confirm your email/);
    expect(memory.latestTo('c@x.test')?.subject).toMatch(/password reset/);
    expect(memory.latestTo('d@x.test')).toBeUndefined();
  });

  it('skips the email when the pre-send check says no or fails', async () => {
    const memory = new MemoryMailer();
    const log = logger();
    const mailer = new AuthMailer(memory, log, []);
    mailer.sendCode({
      to: 'a@x.test',
      code: '1',
      type: 'sign-in',
      locale: 'en',
      shouldSend: () => Promise.resolve(false),
    });
    mailer.sendCode({
      to: 'b@x.test',
      code: '2',
      type: 'sign-in',
      locale: 'en',
      shouldSend: () => Promise.reject(new Error('db down')),
    });
    await mailer.settled();
    expect(memory.sent).toHaveLength(0);
    expect(log.error).toHaveBeenCalledOnce();
  });

  it('retries twice, then logs without the code or the local part of the address', async () => {
    const flaky = new FlakyMailer(5);
    const log = logger();
    const mailer = new AuthMailer(flaky, log, [1, 1]);
    mailer.sendCode({
      to: 'secret.person@example.com',
      code: '987654',
      type: 'sign-in',
      locale: 'en',
    });
    await mailer.settled();

    expect(flaky.attempts).toBe(3);
    expect(log.error).toHaveBeenCalledOnce();
    const logged = JSON.stringify(log.error.mock.calls);
    expect(logged).not.toContain('987654');
    expect(logged).not.toContain('secret.person');
    expect(logged).toContain('example.com');
  });

  it('succeeds on a retry', async () => {
    const flaky = new FlakyMailer(1);
    const log = logger();
    const mailer = new AuthMailer(flaky, log, [1, 1]);
    mailer.sendCode({ to: 'a@x.test', code: '1', type: 'sign-in', locale: 'en' });
    await mailer.settled();
    expect(flaky.sent).toHaveLength(1);
    expect(log.error).not.toHaveBeenCalled();
  });
});
