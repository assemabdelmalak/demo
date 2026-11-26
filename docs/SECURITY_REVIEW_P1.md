# Security review of Phase 1 (2026-11-26)

An attacker's pass over everything Phase 1 built: database isolation, authentication and
authorisation. It follows `docs/sessions/04-security-review.md`. Every finding below was
reproduced against the real stack: the local PostgreSQL 16 database `radd` built by
`infra/scripts/agent-services.sh` for the SQL, and the API in-process (`app.inject`, rate limits
on) for HTTP. The fixture rows were deleted afterwards.

Severity: **High** = breaks a documented security control with a request anyone in the stated
position can send; **Medium** = weakens a control or needs resources (many IPs) to exploit;
**Low** = defence in depth, an operator mistake, or a future screen's problem.

| # | Finding | Severity | State |
|---|---|---|---|
| F1 | A PIN session escaped its confinement through a reworded `Cookie` header | High | Fixed, `63d2cb9` |
| F2 | Better Auth's member reads gave every member everyone's PIN hash | High | Fixed, `3a225db` |
| M1 | Emailed sign-in codes are limited per IP only | Medium | Open (HANDOFF §10) |
| M2 | Password sign-in is limited per IP only | Medium | Open (HANDOFF §10) |
| L1–L7 | Defence in depth and operations | Low | Open (HANDOFF §10) |

## F1 · PIN session escape through the cookie header (High, fixed)

**What:** ADR-026 confines a shared tablet's PIN session to `get-session` and `sign-out` under
`/v1/auth/*`, and to its device. The bridge decided whether to apply that check with its own
`hasCookie()`, which only recognises `name=value`. Better Auth (better-call's `parseCookies`)
trims white space around the name, so `name =value` was skipped by the bridge and accepted by
Better Auth as the session.

**Request** (PIN session of a staff member, cookie alone, from any machine):

```
GET /v1/auth/list-sessions
Origin: http://localhost:3001
Cookie: radd-test.session_token =<the PIN session's cookie value>
```

**Real output before the fix:** `200` with the user's other sessions, **raw tokens included**:
`[{"expiresAt":"2026-12-03T14:13:56.995Z","token":"xzjInzF8hZrg…","ipAddress":"10.124.8.146",…}]`.
In the same way `POST /v1/auth/update-user {"name":"Renamed"}` gave `200 {"status":true}` and
`GET /v1/auth/organization/list-members` gave `200` with every member's name and email. The device
binding did not hold either: the same request without the device cookie also passed.

**Fix:** the bridge now asks Better Auth (`auth.api.getSession`) whenever the request carries any
`Cookie` header, so the confinement depends on Better Auth's own reading of the cookie, never on
ours (`apps/api/src/auth/auth.fastify.ts`). `hasCookie()` is kept only where a miss fails closed
(the session hook for `/v1/*`, which then treats the request as signed out).

**Test:** `apps/api/test/staff.int.test.ts` › "confines a PIN session however its cookie header is
written": four spellings (space, tab, reordered, cookie alone off the tablet) against
`list-sessions`, `organization/list-members` and `update-user`. It failed before the fix
(`expected 200 not to be 200`) and passes after.

## F2 · Every member could read every member's PIN hash (High, fixed)

**What:** `member.pin_hash` was declared to Better Auth with `returned: false`, but Better Auth
1.7.18's `/organization/list-members` and `/organization/get-active-member` ignore that flag for
member fields. Any member, staff and kitchen included, received the argon2id PIN hash and lock
state of every member. With the server pepper (one secret) a 4–6 digit PIN falls to an offline
search in minutes, so the hash must never leave the server (ADR-026: "never returned").

**Request** (signed in as the kitchen member):
`GET /v1/auth/organization/list-members` → **real output:** `200
{"members":[…,{"role":"staff","pinHash":"ARGON2-PIN-HASH-SENTINEL","pinDisabledAt":null,…}]}`.
`get-active-member` returned the caller's own hash the same way. (`get-full-organization` and our
own `/v1/organizations/current/members` were already clean and tested.)

**Fix:** `pinHash` and `pinDisabledAt` are no longer declared in Better Auth's member schema
(`apps/api/src/auth/auth.config.ts`). Only our queries in `packages/db` read or write them, so
Better Auth's adapter drops the columns from everything it returns.

**Test:** `apps/api/test/organizations.int.test.ts` › "lists members … and never returns the PIN
hash" now also reads both Better Auth endpoints as kitchen and staff. It failed before the fix
(`expected '{"members":[…' not to contain 'secret-pin-hash'`) and passes after.

## M1 · Emailed codes are limited per IP only (Medium, open)

**Request:** `POST /v1/auth/email-otp/send-verification-otp {"email":<victim>,"type":"sign-in"}`
from 12 addresses → **real output:** `[200 ×12]`, 12 emails delivered to the victim. Each code
still allows only 3 guesses (`["400:INVALID_OTP" ×3, "403:TOO_MANY_ATTEMPTS"]`), so guessing a code
takes on the order of 10⁵ emails; but nothing caps the number of codes per address, so whoever
controls many IPs can flood a mailbox, run up the email bill, and slowly guess the sign-in code
of an account without two-factor (code sign-in needs no password).
**Fix to make:** a per-address cap in the bridge on the two code-request paths (for example 5 an
hour), keyed by an HMAC of the lower-cased address and applied whether or not the address exists,
with the same answer as the per-IP limit.

## M2 · Password sign-in is limited per IP only (Medium, open)

**Request:** 15 × `POST /v1/auth/sign-in/email` with wrong passwords for one account from 15
addresses → **real output:** `[401 ×15]`, then the right password `200`: nothing slowed down. The
per-IP limit (3 per 10 s; Cloudflare's 60 a minute) is the only brake, and an IPv6 /48 holds
65 536 separate /64 buckets (L5). Passwords are at least 12 characters and argon2id, and
two-factor accounts lock after 10 wrong codes (verified below), so this is online guessing
against password-only accounts.
**Fix to make:** a per-address failure counter (keyed like M1) with a short lock or growing delay
after, for example, 10 failures in 15 minutes, documented as a deliberate trade against someone
locking a victim out.

## Low

- **L1 · `list-sessions` returns raw session tokens.** Since F1 only a full session can call it,
  and a cookie also needs the signature, but nothing in the console uses the endpoint. Disable it
  (`DISABLED_AUTH_PATHS`) or strip `token` before the console gains a sessions screen.
- **L2 · `user.image` accepts any string.** `POST /v1/auth/sign-up/email` with
  `"image":"javascript:alert(1)"` stored it as given. No screen shows the image yet; validate it
  as an `https:` URL (or disable it) before one does.
- **L3 · Our own `/v1/*` writes do not check `Origin`.** `POST /v1/organizations` with
  `Origin: https://evil.example` and a valid cookie answered `201` (Better Auth's own routes answer
  `403 INVALID_ORIGIN`). Not exploitable from a browser today: cookies are `SameSite=Lax`, every
  write needs JSON or an `Idempotency-Key` header (a `text/plain` cross-origin POST got
  `400 IDEMPOTENCY_KEY_REQUIRED`), and the preflight gives a foreign origin no CORS headers. But
  the session cookie lives on the parent domain, so `m.` and `cdn.` are the same site; an `Origin`
  check on cookie-authenticated writes would stop that ever mattering.
- **L4 · Rate limits trust `CLIENT_IP_HEADER`.** With `cf-connecting-ip` configured, anyone who
  reaches the origin directly picks their own IP. SECURITY §6 already says the firewall accepts
  only Cloudflare's ranges; Cloudflare Tunnel or Authenticated Origin Pulls would make it hold
  even if that rule slips (P10).
- **L5 · IPv6 buckets are per /64.** One /48 gives 65 536 buckets; it multiplies M1 and M2.
- **L6 · The seed's production guard reads `APP_ENV`, not the database.** A local `.env` with a
  production `DATABASE_URL` would write the demo accounts (known passwords, PIN `1234`) into
  production. Refusing a non-local database host unless a flag is given would close it.
- **L7 · The cluster's `postgres` database keeps the default `PUBLIC` rights** (connect, temporary
  tables). The bootstrap revokes them on the app database only; the app roles can still connect to
  `postgres` (no data there). Revoke them in the cluster half of `bootstrap-roles.sql`.

## Tried and held

**Database (ADR-021, ADR-022), as `app_runtime` and `app_worker`, with the tenant set to B or
unset:**
- No `TEMP` and no `CREATE` anywhere (`permission denied to create temporary tables`), no role
  memberships, no default ACLs, no `BYPASSRLS`; so no search-path tricks with temporary or
  look-alike objects. Every `SECURITY DEFINER` function pins `search_path = public, pg_temp` and
  is revoked from `PUBLIC`; the worker cannot call `staff_device_by_token_hash`, the API cannot
  call the outbox functions, and the worker cannot read `outbox_events`.
- A's rows: 0 visible to B; `UPDATE … WHERE id = <A's>` → `UPDATE 0`; a B row referencing A's
  category → `violates foreign key constraint "menu_items_category_fk"` (composite keys);
  `SELECT … FOR UPDATE/SHARE` locks nothing; an invalid tenant string is an error, an empty one
  sees nothing; audit entries for another organisation are refused.
- `app.public = 'on'` shows no tenant table and no draft restaurant; `public_restaurants` and
  `is_published_menu_version` reveal nothing for a draft.
- Partitions of `menu_events` have no grants.
- **Existence oracles, accepted:** `ON CONFLICT (id) DO NOTHING` returns 0 rows for A's ID (and
  `DO UPDATE` fails with the RLS error); unique indexes such as `order_rounds (session_id,
  number)` answer for another tenant's session ID; `restaurant_org()` answers for a draft
  restaurant's ID. Each needs a full UUIDv7 or a 12-character random token that B cannot know.
  Global slugs (`restaurants_slug_unique`, `organization/check-slug`) reveal that a slug is taken,
  which public URLs require.
- **Injected `set_config('app.org_id', …)`:** it would bypass RLS, as would reading Better Auth's
  global tables (no RLS by design). It needs a SQL injection: every query is a Drizzle parameter;
  the only `sql.raw` is the seed's fixed column names. Not a realistic threat today; it stays the
  reason never to build SQL from strings.

**Authentication:**
- Enumeration: sign-up with a taken address answers like a new one and sends no email; sign-in
  answers `401 INVALID_EMAIL_OR_PASSWORD` for both, in the same time (about 20 ms either way);
  every code request answers `200 {"success":true}` for real and unknown addresses alike.
- Fields: `emailVerified`/`twoFactorEnabled` sent at sign-up are ignored; `update-session` refuses
  `pinSession`, `staffDeviceId`, `twoFactorVerifiedAt` and `activeOrganizationId`
  (`FIELD_NOT_ALLOWED`); `update-user` refuses `email`; `delete-user` is 404.
- Origin check on `/v1/auth/*`: a foreign, missing or `null` Origin → `403`.
- Two-factor: email-code sign-in for a two-factor account → `400 INVALID_OTP`; a sign-in challenge
  allows 5 wrong TOTP or backup codes (`TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE`), and 10 in a row lock
  the account for 15 minutes across challenges, factors and IPs (`429 ACCOUNT_TEMPORARILY_LOCKED`,
  even for the right code).

**Authorisation:**
- Default deny; the route-policy test pins the public and super-admin routes.
- Better Auth's organisation endpoints for another organisation's ID or slug
  (`get-full-organization`, `get-organization`, `list-members`, `list-invitations`,
  `has-permission`, `set-active`) → `403`/`401`.
- Member and device IDs from another organisation → `404` (queries are keyed on the caller's
  organisation; `member` is global, so this matters).
- PIN sessions: refused on account routes, ended after 12 hours or with a revoked device, always in
  the device's organisation (existing tests), and since F1 whatever the cookie spelling.
- Admin: needs the allowlist, a verified address, two-factor on, no PIN session and a TOTP check on
  this session within 12 hours; a trusted-device sign-in carries no stamp. Bull Board uses the
  same verdict and refuses cross-origin changes.
