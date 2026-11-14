import { describe, expect, it } from 'vitest';

import { MemoryMailer } from './mailer.js';
import { escapeHtml, renderEmail } from './templates.js';

describe('renderEmail', () => {
  it('writes the sign-in code in English, left to right', () => {
    const mail = renderEmail({ name: 'sign-in-code', code: '482913', minutes: 5 }, 'en');
    expect(mail.subject).toBe('Your Radd Menu sign-in code: 482913');
    expect(mail.text).toContain('482913');
    expect(mail.text).toContain('expires in 5 minutes');
    expect(mail.html).toContain('lang="en" dir="ltr"');
  });

  it('writes the same message in Arabic, right to left, with the code left to right', () => {
    const mail = renderEmail({ name: 'verify-email-code', code: '482913', minutes: 5 }, 'ar');
    expect(mail.subject).toContain('482913');
    expect(mail.html).toContain('lang="ar" dir="rtl"');
    expect(mail.html).toMatch(/dir="ltr">482913</);
    expect(mail.text).toContain('أدخل هذا الرمز');
  });

  it.each(['en', 'ar'] as const)('has every template in %s', (locale) => {
    const templates = [
      { name: 'sign-in-code', code: '111111', minutes: 5 },
      { name: 'verify-email-code', code: '222222', minutes: 5 },
      { name: 'reset-password-code', code: '333333', minutes: 5 },
      {
        name: 'invitation',
        organizationName: 'Beit Tayta',
        inviterName: 'Rania',
        roleLabel: 'staff',
        url: 'http://localhost:3001/accept-invitation/abc',
        days: 2,
      },
    ] as const;
    for (const template of templates) {
      const mail = renderEmail(template, locale);
      expect(mail.subject.length).toBeGreaterThan(10);
      expect(mail.text.length).toBeGreaterThan(40);
      expect(mail.html).toContain('</div>');
    }
  });

  it('never turns a name into markup', () => {
    const mail = renderEmail(
      {
        name: 'invitation',
        organizationName: '<img src=x onerror=alert(1)>',
        inviterName: 'Rania "R" & co',
        roleLabel: 'manager',
        url: 'http://localhost:3001/accept-invitation/abc?x="y"',
        days: 2,
      },
      'en',
    );
    expect(mail.html).not.toContain('<img');
    expect(mail.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(mail.html).toContain('Rania &quot;R&quot; &amp; co');
    expect(mail.html).toContain(
      'href="http://localhost:3001/accept-invitation/abc?x=&quot;y&quot;"',
    );
    expect(escapeHtml(`<a href='x'>`)).toBe('&lt;a href=&#39;x&#39;&gt;');
  });
});

describe('MemoryMailer', () => {
  it('keeps what was sent and finds the newest message to an address', async () => {
    const mailer = new MemoryMailer();
    await mailer.send({ to: 'a@example.test', subject: 'one', text: '', html: '' });
    await mailer.send({ to: 'b@example.test', subject: 'two', text: '', html: '' });
    await mailer.send({ to: 'a@example.test', subject: 'three', text: '', html: '' });
    expect(mailer.sent).toHaveLength(3);
    expect(mailer.latestTo('a@example.test')?.subject).toBe('three');
    expect(mailer.latestTo('nobody@example.test')).toBeUndefined();
  });
});
