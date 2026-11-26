import { type LoggerService } from '@nestjs/common';
import { betterAuth, type GenericEndpointContext } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { emailOTP, organization, twoFactor } from 'better-auth/plugins';
import { createAccessControl } from 'better-auth/plugins/access';
import { adminAc, defaultStatements, ownerAc } from 'better-auth/plugins/organization/access';
import { type Redis } from 'ioredis';

import {
  countOwnedOrganizations,
  type Db,
  findUserAuthFlags,
  listUserMemberships,
  schema,
} from '@radd/db';
import { hashPassword, verifyPassword } from '@radd/db/crypto';
import { INVITATION_TTL_DAYS, type NotifyEmailPayload, type UiLocale, uuidv7 } from '@radd/shared';

import { AUTH_CODE_TTL_SECONDS, type AuthCodeType, type AuthMailer } from './auth-mailer';
import { createValkeyRateLimitStorage } from './auth-rate-limit';
import {
  authUrlParts,
  CLIENT_IP_HEADER,
  cookiePrefixFor,
  crossSubDomainCookieDomain,
  findMalformedId,
  invitationUrl,
  LOCALE_HEADER,
  parseLocaleHeader,
} from './auth.utils';
import { pinSessionDeadline } from './pin-session';
import { pinSessionPlugin } from './pin-session.plugin';
import { currentRequestLocale } from './request-locale';
import { type ApiEnv } from '../config/env.module';
import { MAX_OWNED_ORGANIZATIONS } from '../organizations/organization.rules';

export interface CreateAuthDeps {
  env: ApiEnv;
  db: Db;
  mailer: AuthMailer;
  valkey: Redis;
  logger: LoggerService;
  /**
   * Puts an email on the `notify.email` queue (the API's `QueueProducer`). Invitations go through
   * the worker; auth codes never do (ADR-029).
   */
  enqueueEmail: (payload: NotifyEmailPayload, jobId: string) => Promise<unknown>;
  /** Better Auth's own limiter (sign-in 3 per 10 s, codes 3 per minute, …). On unless a test turns it off. */
  rateLimit?: boolean;
}

const DAY_SECONDS = 24 * 60 * 60;

/**
 * Organisation roles (DATA_MODEL `member_role`). Better Auth's statements only govern its own
 * organisation endpoints, which matter for the calls our services delegate (invitations, renames):
 * owners keep its owner statements, managers its admin statements, and staff and kitchen none.
 * What anyone may do in the product is decided by `packages/shared/src/permissions.ts`
 * (ADR-025), which our wrappers check first; `auth-roles.test.ts` fails if the two drift.
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

/** The inviter's console language: from the request when there is one, else the service's scope. */
function invitationLocale(request: Request | undefined): UiLocale {
  const header = request?.headers.get(LOCALE_HEADER);
  return header ? parseLocaleHeader(header) : (currentRequestLocale() ?? parseLocaleHeader(null));
}

/** Better Auth hands us organisations as loose records; only `status` matters here. */
function isSuspended(organization: Record<string, unknown>): boolean {
  return organization.status === 'suspended';
}

const orgSuspended = () =>
  APIError.from('FORBIDDEN', { code: 'ORG_SUSPENDED', message: 'Organisation suspended' });

/**
 * Second-factor checks that, on success, stamp `twoFactorVerifiedAt` on the session they leave
 * signed in (ADR-027): during sign-in (a new session) or as a step-up on an existing one.
 * "Remember this device" skips these endpoints altogether, so a session opened that way carries
 * no stamp and never counts for admin access.
 */
export const TWO_FACTOR_VERIFY_PATHS: ReadonlySet<string> = new Set([
  '/two-factor/verify-totp',
  '/two-factor/verify-backup-code',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

/** The session token a successful two-factor answer carries (`{ token, user }`). */
function returnedToken(returned: unknown): string | undefined {
  if (!isRecord(returned) || returned instanceof Error) return undefined;
  return typeof returned.token === 'string' ? returned.token : undefined;
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

export function createAuth({
  env,
  db,
  mailer,
  valkey,
  logger,
  enqueueEmail,
  rateLimit = true,
}: CreateAuthDeps) {
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
        update: {
          // Belt and braces for ADR-026: the bridge never lets a PIN session refresh itself, and
          // should anything still extend one, its expiry stays within 12 hours of its creation.
          before: (update, ctx) => {
            const current: unknown = ctx?.context.session?.session;
            if (!isRecord(current) || current.pinSession !== true) return Promise.resolve();
            if (!(update.expiresAt instanceof Date) || !(current.createdAt instanceof Date)) {
              return Promise.resolve();
            }
            const deadline = pinSessionDeadline(current.createdAt);
            if (update.expiresAt <= deadline) return Promise.resolve();
            return Promise.resolve({ data: { ...update, expiresAt: deadline } });
          },
        },
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
      after: createAuthMiddleware(async (ctx) => {
        if (!TWO_FACTOR_VERIFY_PATHS.has(ctx.path)) return;
        // A failed check returns an APIError here; only a success carries a session token.
        const token = ctx.context.newSession?.session.token ?? returnedToken(ctx.context.returned);
        if (!token) return;
        await ctx.context.internalAdapter.updateSession(token, { twoFactorVerifiedAt: new Date() });
      }),
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
        // Onboarding goes through `POST /v1/organizations`, which checks the same two rules first
        // and answers with our problem codes; these are the backstop for any other caller.
        allowUserToCreateOrganization: (user) => user.emailVerified,
        organizationLimit: async (user) =>
          (await countOwnedOrganizations(db, user.id)) >= MAX_OWNED_ORGANIZATIONS,
        invitationExpiresIn: INVITATION_TTL_DAYS * DAY_SECONDS,
        // Inviting the same address again replaces the earlier invitation and link.
        cancelPendingInvitationsOnReInvite: true,
        // Accepting, rejecting or reading an invitation needs the invited, verified address. Our
        // custom ID generator already implies this; stated so a config change cannot drop it.
        requireEmailVerificationOnInvitation: true,
        sendInvitationEmail: async ({ id, email, role, organization, inviter }, request) => {
          await enqueueEmail(
            {
              template: 'invitation',
              to: email,
              locale: invitationLocale(request),
              params: {
                organizationName: organization.name,
                inviterName: inviter.user.name,
                // Validated by the queue schema: only manager, staff or kitchen get through.
                role: role as NotifyEmailPayload['params']['role'],
                url: invitationUrl(env.CONSOLE_PUBLIC_URL, id),
                days: INVITATION_TTL_DAYS,
              },
            },
            // One email per invitation, even if Better Auth calls us twice for it.
            `invitation-${id}`,
          );
        },
        organizationHooks: {
          // A suspended organisation can be read but not joined or grown (ORG_SUSPENDED).
          beforeCreateInvitation: ({ organization }) => {
            if (isSuspended(organization)) throw orgSuspended();
            return Promise.resolve();
          },
          beforeAcceptInvitation: ({ organization }) => {
            if (isSuspended(organization)) throw orgSuspended();
            return Promise.resolve();
          },
        },
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
            // `pin_hash` and `pin_disabled_at` are deliberately not declared: Better Auth's member
            // reads (`list-members`, `get-active-member`) ignore `returned: false` and handed every
            // member's PIN hash to the whole organisation (security review of Phase 1). Only our own
            // queries in packages/db read or write them, so Better Auth must not know they exist.
            additionalFields: {
              displayName: { type: 'string', required: false, input: false },
            },
          },
        },
      }),
      twoFactor({ issuer: 'Radd Menu' }),
      pinSessionPlugin(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
