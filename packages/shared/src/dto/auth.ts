import { z } from 'zod';

import { displayNameSchema } from './organizations.js';

/**
 * Account forms (sign-up, sign-in, codes, reset, two-factor). The console validates with these
 * before calling Better Auth at `/v1/auth/*`; the limits match the API's Better Auth settings
 * (`apps/api/src/auth/auth.config.ts`), so a form never accepts what the server would refuse.
 */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
export const AUTH_CODE_LENGTH = 6;

/** An address as Better Auth stores it: trimmed and lower case. Empty is `too_small`, not `invalid_format`. */
export const accountEmailSchema = z.string().trim().toLowerCase().min(1).max(254).pipe(z.email());

/** A new password: length only (NIST SP 800-63B); no composition rules. */
export const newPasswordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH);

/** An existing password is checked by the server, so the form only refuses an empty one. */
export const currentPasswordSchema = z.string().min(1).max(PASSWORD_MAX_LENGTH);

/** The emailed or authenticator code: exactly six Latin digits. */
export const authCodeSchema = z.string().regex(/^\d{6}$/);

/** Backup codes are Better Auth's own format; the server checks them. */
export const backupCodeSchema = z.string().trim().min(1).max(64);

export const signUpSchema = z.strictObject({
  name: displayNameSchema,
  email: accountEmailSchema,
  password: newPasswordSchema,
});
export type SignUpInput = z.infer<typeof signUpSchema>;

export const signInPasswordSchema = z.strictObject({
  email: accountEmailSchema,
  password: currentPasswordSchema,
});
export type SignInPasswordInput = z.infer<typeof signInPasswordSchema>;

/** Asking for an emailed code: sign-in, verification or password reset. */
export const emailOnlySchema = z.strictObject({ email: accountEmailSchema });
export type EmailOnlyInput = z.infer<typeof emailOnlySchema>;

export const emailCodeSchema = z.strictObject({
  email: accountEmailSchema,
  otp: authCodeSchema,
});
export type EmailCodeInput = z.infer<typeof emailCodeSchema>;

export const resetPasswordSchema = z.strictObject({
  email: accountEmailSchema,
  otp: authCodeSchema,
  password: newPasswordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/** Turning two-factor on or off asks for the password again. */
export const passwordConfirmSchema = z.strictObject({ password: currentPasswordSchema });
export type PasswordConfirmInput = z.infer<typeof passwordConfirmSchema>;

export const totpCodeSchema = z.strictObject({ code: authCodeSchema });
export type TotpCodeInput = z.infer<typeof totpCodeSchema>;

export const backupCodeInputSchema = z.strictObject({ code: backupCodeSchema });
export type BackupCodeInput = z.infer<typeof backupCodeInputSchema>;
