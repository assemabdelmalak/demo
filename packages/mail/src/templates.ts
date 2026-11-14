import { dirFor, type UiLocale } from '@radd/shared';

import { type MailMessage } from './mailer.js';

/** Plain templates for the auth flows. Branded React Email templates replace them in P9-T04. */
export type EmailTemplate =
  | { name: 'sign-in-code'; code: string; minutes: number }
  | { name: 'verify-email-code'; code: string; minutes: number }
  | { name: 'reset-password-code'; code: string; minutes: number }
  | {
      name: 'invitation';
      organizationName: string;
      inviterName: string;
      roleLabel: string;
      url: string;
      days: number;
    };

interface Copy {
  subject: string;
  /** Paragraphs; a line that is only the code or the link is rendered prominently in HTML. */
  lines: string[];
  highlight: string;
}

const PRODUCT = 'Radd Menu';

function copyFor(template: EmailTemplate, locale: UiLocale): Copy {
  const ar = locale === 'ar';
  switch (template.name) {
    case 'sign-in-code':
      return ar
        ? {
            subject: `رمز الدخول إلى ${PRODUCT}: ${template.code}`,
            lines: [
              `استخدم هذا الرمز للدخول إلى ${PRODUCT}. تنتهي صلاحيته خلال ${String(template.minutes)} دقائق.`,
              'إذا لم تطلب هذا الرمز، تجاهل هذه الرسالة.',
            ],
            highlight: template.code,
          }
        : {
            subject: `Your ${PRODUCT} sign-in code: ${template.code}`,
            lines: [
              `Use this code to sign in to ${PRODUCT}. It expires in ${String(template.minutes)} minutes.`,
              'If you did not ask for this code, ignore this email.',
            ],
            highlight: template.code,
          };
    case 'verify-email-code':
      return ar
        ? {
            subject: `أكّد بريدك الإلكتروني في ${PRODUCT}: ${template.code}`,
            lines: [
              `أدخل هذا الرمز لتأكيد بريدك الإلكتروني. تنتهي صلاحيته خلال ${String(template.minutes)} دقائق.`,
              'إذا لم تنشئ حساباً، تجاهل هذه الرسالة.',
            ],
            highlight: template.code,
          }
        : {
            subject: `Confirm your email for ${PRODUCT}: ${template.code}`,
            lines: [
              `Enter this code to confirm your email address. It expires in ${String(template.minutes)} minutes.`,
              'If you did not create an account, ignore this email.',
            ],
            highlight: template.code,
          };
    case 'reset-password-code':
      return ar
        ? {
            subject: `رمز إعادة تعيين كلمة المرور في ${PRODUCT}: ${template.code}`,
            lines: [
              `أدخل هذا الرمز لاختيار كلمة مرور جديدة. تنتهي صلاحيته خلال ${String(template.minutes)} دقائق.`,
              'إذا لم تطلب ذلك، تجاهل هذه الرسالة وستبقى كلمة مرورك كما هي.',
            ],
            highlight: template.code,
          }
        : {
            subject: `Your ${PRODUCT} password reset code: ${template.code}`,
            lines: [
              `Enter this code to choose a new password. It expires in ${String(template.minutes)} minutes.`,
              'If you did not ask for this, ignore this email and your password stays the same.',
            ],
            highlight: template.code,
          };
    case 'invitation':
      return ar
        ? {
            subject: `${template.inviterName} يدعوك للانضمام إلى ${template.organizationName} على ${PRODUCT}`,
            lines: [
              `${template.inviterName} يدعوك للانضمام إلى ${template.organizationName} بصفة ${template.roleLabel}.`,
              `افتح هذا الرابط لقبول الدعوة. تنتهي صلاحيته خلال ${String(template.days)} أيام.`,
              'إذا لم تكن تتوقع هذه الدعوة، تجاهل هذه الرسالة.',
            ],
            highlight: template.url,
          }
        : {
            subject: `${template.inviterName} invited you to ${template.organizationName} on ${PRODUCT}`,
            lines: [
              `${template.inviterName} invited you to join ${template.organizationName} as ${template.roleLabel}.`,
              `Open this link to accept. It expires in ${String(template.days)} days.`,
              'If you were not expecting this invitation, ignore this email.',
            ],
            highlight: template.url,
          };
  }
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Names of people and organisations are user-written; they must never become markup. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character);
}

/** Subject, plain text and a minimal HTML body in the reader's language and direction. */
export function renderEmail(template: EmailTemplate, locale: UiLocale): Omit<MailMessage, 'to'> {
  const copy = copyFor(template, locale);
  const [first, ...rest] = copy.lines;
  const text = [first, '', copy.highlight, '', ...rest].join('\n');

  const paragraph = (line: string) => `<p style="margin:0 0 16px">${escapeHtml(line)}</p>`;
  const isLink = template.name === 'invitation';
  const safeHighlight = escapeHtml(copy.highlight);
  // The code is always left-to-right, also inside an Arabic message.
  const highlight = isLink
    ? `<p style="margin:0 0 16px"><a href="${safeHighlight}">${safeHighlight}</a></p>`
    : `<p style="margin:0 0 16px;font-size:28px;font-weight:700;letter-spacing:4px" dir="ltr">${safeHighlight}</p>`;
  const html = [
    `<div lang="${locale}" dir="${dirFor(locale)}" style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5;color:#1a1a1a">`,
    paragraph(first ?? ''),
    highlight,
    ...rest.map(paragraph),
    '</div>',
  ].join('');

  return { subject: copy.subject, text, html };
}
