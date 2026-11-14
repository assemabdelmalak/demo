import { type LoggerService } from '@nestjs/common';
import { betterAuth, type GenericEndpointContext } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { emailOTP, organization, twoFactor } from 'better-auth/plugins';
import { createAccessControl } from 'better-auth/plugins/access';
import { adminAc, defaultStatements, ownerAc } from 'better-auth/plugins/organization/access';
import { type Redis } from 'ioredis';

import { type Db, findUserAuthFlags, listUserMemberships, schema } from '@radd/db';
import { hashPassword, verifyPassword } from '@radd/db/crypto';
import { uuidv7 } from '@radd/shared';

import { AUTH_CODE_TTL_SECONDS, type AuthCodeType, type AuthMailer } from './auth-mailer';
import { createValkeyRateLimitStorage } from './auth-rate-limit';
import {
  authUrlParts,
  CLIENT_IP_HEADER,
  cookiePrefixFor,
  crossSubDomainCookieDomain,
  findMalformedId,
  LOCALE_HEADER,
  parseLocaleHeader,
} from './auth.utils';
import { type ApiEnv } from '../config/env.module';

export interface CreateAuthDeps {
  env: ApiEnv;
  db: Db;
  mailer: AuthMailer;
  valkey: Redis;
  logger: LoggerService;
  /** Better Auth's own limiter (sign-in 3 per 10 s, codes 3 per minute, …). On unless a test turns it off. */
  rateLimit?: boolean;
}

const DAY_SECONDS = 24 * 60 * 60;

/**
 * Organisation roles (DATA_MODEL `member_role`). Better Auth's statements only govern its own
 * organisation endpoints, which matter for invitations: owners keep its owner statements, managers
 * its admin statements, and staff and kitchen none. What anyone may do in the product is decided
 * by `packages/shared/permissions.ts` (P1-T05), not here.
 */
const ac = createAccessControl(defaultStatements);
export const organizationRoles = {
  owner: ac.newRole(ownerAc.statements),
  manager: ac.newRole(adminAc.statements),
  staff: ac.newRole({}),
  kitchen: ac.newRole({}),
};

/**
 * Organisation endpoints our own API wraps (onboarding, invitations, members) with audit,
 * permissions and tenancy, plus flows we do not offer: links for reset and verification (codes are
 * used instead), email change, and social sign-in. Reads, set-active and the invitation answers
 * stay. Better Auth answers a disabled path with 404.
 */
export const DISABLED_AUTH_PATHS = [
  '/organization/create',
  '/organization/update',
  '/organization/delete',
  '/organization/invite-member',
  '/organization/cancel-invitation',
  '/organization/remove-member',
  '/organization/update-member-role',
  '/organization/leave',
  // Link-based reset and verification; the code flow (`/email-otp/*`) replaces them.
  '/request-password-reset',
  '/reset-password',
  '/send-verification-email',
  '/verify-email',
  // Deprecated duplicate of `/email-otp/request-password-reset`.
  '/forget-password/email-otp',
  '/change-email',
  '/email-otp/request-email-change',
  '/email-otp/change-email',
  // No social providers are configured.
  '/sign-in/social',
  '/link-social',
  '/unlink-account',
  '/get-access-token',
  '/refresh-token',
  '/account-info',
  // Two-factor by email or SMS code is not offered; TOTP and backup codes are.
  '/two-factor/send-otp',
  '/two-factor/verify-otp',
] as const;

/** The same answer a wrong code gives, so a blocked account looks like any failed attempt. */
const invalidOtp = () =>
  APIError.from('BAD_REQUEST', { code: 'INVALID_OTP', message: 'Invalid OTP' });

function localeOf(ctx: GenericEndpointContext | undefined) {
  const header = ctx?.request?.headers.get(LOCALE_HEADER) ?? ctx?.headers?.get(LOCALE_HEADER);
  return parseLocaleHeader(header);
}

function stringField(body: unknown, key: string): string | undefined {
  if (body === null || typeof body !== 'object') return undefined;
  const value: unknown = (body as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Routes Better Auth's logger to ours at warn and above. Only the message and the name and
 * message of an error are kept; other arguments can hold request bodies.
 */
function authLogger(logger: LoggerService) {
  return {
    level: 'warn' as const,
    log(level: 'debug' | 'info' | 'warn' | 'error', message: string, ...args: unknown[]) {
      const error = args.find((arg): arg is Error => arg instanceof Error);
      const fields = error ? { err: { name: error.name, message: error.message } } : {};
      if (level === 'error') logger.error(fields, `better-auth: ${message}`);
      else if (level === 'warn') logger.warn(fields, `better-auth: ${message}`);
    },
  };
}

export function createAuth({ env, db, mailer, valkey, logger, rateLimit = true }: CreateAuthDeps) {
  const { origin, basePath } = authUrlParts(env.BETTER_AUTH_URL);
  const cookieDomain = crossSubDomainCookieDomain(env.AUTH_COOKIE_DOMAIN);

  const findUser = (email: string) => findUserAuthFlags(db, email);

  /**
   * Code sign-in skips the second factor (Better Auth only challenges password sign-in), and a
   * verification code would sign a verified user in through `autoSignInAfterVerification`. So
   * neither code is sent where it would bypass two-factor or is pointless.
   */
  const codeMayBeSent = async (email: string, type: AuthCodeType): Promise<boolean> => {
    if (type !== 'sign-in' && type !== 'email-verification') return true;
    const user = await findUser(email);
    // Better Auth only asks us to send these to an existing user. Not seeing the row means sign-up
    // has not committed yet (it runs in a transaction), so the account is new and unverified.
    if (!user) return true;
    if (type === 'sign-in') return !user.twoFactorEnabled;
    return !user.emailVerified;
  };

  return betterAuth({
    appName: 'Radd Menu',
    baseURL: origin,
    basePath,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: env.TRUSTED_ORIGINS,
    // Nothing about our users or setup may be sent to a third party (CLAUDE §3.8).
    telemetry: { enabled: false, debug: false },
    logger: authLogger(logger),
    database: drizzleAdapter(db, {
      provider: 'pg',
      // Keyed by Better Auth's model names; each table's export name in packages/db matches.
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        organization: schema.organization,
        member: schema.member,
        invitation: schema.invitation,
        twoFactor: schema.twoFactor,
      },
      transaction: true,
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      password: {
        hash: hashPassword,
        verify: ({ hash, password }) => verifyPassword(hash, password),
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: false,
      // Entering the emailed code proves the address; the user lands signed in.
      autoSignInAfterVerification: true,
      expiresIn: AUTH_CODE_TTL_SECONDS,
    },
    session: {
      expiresIn: 7 * DAY_SECONDS,
      updateAge: DAY_SECONDS,
      // No cookie cache: a revoked session must stop working on the next request (ADR-023).
      cookieCache: { enabled: false },
      additionalFields: {
        // Set only by the server: device PIN sessions (ADR-026) and the admin TOTP stamp (ADR-027).
        staffDeviceId: { type: 'string', required: false, input: false },
        pinSession: { type: 'boolean', required: false, defaultValue: false, input: false },
        twoFactorVerifiedAt: { type: 'date', required: false, input: false },
      },
    },
    rateLimit: {
      enabled: rateLimit,
      customStorage: createValkeyRateLimitStorage(valkey, env.ACTOR_HASH_SECRET, logger),
    },
    advanced: {
      cookiePrefix: cookiePrefixFor(env.APP_ENV),
      useSecureCookies: new URL(env.BETTER_AUTH_URL).protocol === 'https:',
      crossSubDomainCookies: cookieDomain
        ? { enabled: true, domain: cookieDomain }
        : { enabled: false },
      // The bridge overwrites this header from `request.clientIp`; nothing else is trusted.
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
      // Better Auth skips its Origin check when NODE_ENV=test; tests must see production behaviour.
      disableOriginCheck: false,
      disableCSRFCheck: false,
      database: {
        // UUIDv7 for every row (DATA_MODEL §0); the built-in "uuid" mode makes v4.
        generateId: () => uuidv7(),
      },
    },
    disabledPaths: [...DISABLED_AUTH_PATHS],
    databaseHooks: {
      session: {
        create: {
          // Most users belong to one organisation; start them in it.
          before: async (session) => {
            if (session.activeOrganizationId) return;
            const memberships = await listUserMemberships(db, session.userId);
            const [only] = memberships;
            if (memberships.length !== 1 || !only) return;
            return { data: { ...session, activeOrganizationId: only.organizationId } };
          },
        },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const malformed = findMalformedId(ctx.body) ?? findMalformedId(ctx.query);
        if (malformed) {
          throw APIError.from('BAD_REQUEST', {
            code: 'INVALID_ID',
            message: `Invalid ${malformed}`,
          });
        }
        if (ctx.path === '/sign-in/email-otp' || ctx.path === '/email-otp/verify-email') {
          const email = stringField(ctx.body, 'email');
          if (!email) return;
          const user = await findUser(email);
          if (!user) return;
          if (ctx.path === '/sign-in/email-otp' && user.twoFactorEnabled) throw invalidOtp();
          if (
            ctx.path === '/email-otp/verify-email' &&
            (user.emailVerified || user.twoFactorEnabled)
          ) {
            throw invalidOtp();
          }
        }
      }),
    },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: AUTH_CODE_TTL_SECONDS,
        allowedAttempts: 3,
        storeOTP: 'hashed',
        disableSignUp: true,
        sendVerificationOnSignUp: true,
        overrideDefaultEmailVerification: true,
        sendVerificationOTP: ({ email, otp, type }, ctx) => {
          mailer.sendCode({
            to: email,
            code: otp,
            type,
            locale: localeOf(ctx),
            shouldSend: () => codeMayBeSent(email, type),
          });
          return Promise.resolve();
        },
      }),
      organization({
        ac,
        roles: organizationRoles,
        creatorRole: 'owner',
        schema: {
          organization: {
            additionalFields: {
              country: { type: 'string', required: false, defaultValue: 'LB', input: false },
              plan: { type: 'string', required: false, defaultValue: 'free', input: false },
              status: { type: 'string', required: false, defaultValue: 'active', input: false },
              termsVersionAccepted: { type: 'string', required: false, input: false },
              termsAcceptedAt: { type: 'date', required: false, input: false },
            },
          },
          member: {
            additionalFields: {
              pinHash: { type: 'string', required: false, input: false, returned: false },
              displayName: { type: 'string', required: false, input: false },
            },
          },
        },
      }),
      twoFactor({ issuer: 'Radd Menu' }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
