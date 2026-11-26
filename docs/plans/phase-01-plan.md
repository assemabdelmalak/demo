# Phase 1 — Data model, auth, tenancy: plan

## Context

Phase 0 is merged into `master` (PR #1; CI, Docker, CodeQL and Lighthouse are green on `master`, and the first images are in GHCR). The owner said "merge and continue", which is the P0 demo sign-off.

Phase 1 (IMPLEMENTATION_PLAN §PHASE 1, P1‑T01…T08) gives the product its backbone:
- the full database schema, with tenant isolation enforced by Postgres Row Level Security;
- sign-up, sign-in, organisations and roles for restaurant owners and their teams;
- the permission layer every later screen depends on;
- super admin, shared staff devices with PIN switching, audit logs and the event outbox;
- the demo restaurant "Beit Tayta" as seed data.

**What the owner can do at the end (Demo checkpoint P1):** sign up as a new owner and create an organisation; log in as the seeded owner, manager and staff users and see role-based navigation (pages are empty shells); see the tenancy tests green.

Work happens on branch `phase/01-data-auth-tenancy` (already created from `master`), with one PR to `master` at the end.

## How this plan was checked

- Two read-only explorations: the existing code's integration points, and every Phase 1 constraint in the other specs.
- A design review against the published Better Auth 1.7.20 and Drizzle 0.45 / drizzle-kit 0.31 packages and docs. It changed the design in several places; the security-relevant ones are marked **(review)** below.

## What exists and gets reused

| Need | Reuse |
|---|---|
| Package shape for `packages/db` | Copy `packages/shared` (`package.json` with `@radd/source` exports, `tsconfig.json`, `tsconfig.build.json`, `eslint.config.js`, `vitest.config.ts`); ESM, no top-level `await` (Nest loads it through `require(esm)`, ADR-011) |
| IDs | `uuidv7()` in `packages/shared/src/ids.ts` |
| Errors | `DomainError` + `ERROR_CATALOGUE` in `packages/shared/src/errors.ts` (append-only) |
| Locale default | `DEFAULT_LOCALE` in `packages/shared/src/i18n.ts` (ADR-009) |
| Env | `packages/config/src/env/schemas.ts` already has `DATABASE_URL`, `DATABASE_URL_ADMIN`, `BETTER_AUTH_*`, `AUTH_COOKIE_DOMAIN`, `TRUSTED_ORIGINS`, `SUPER_ADMIN_EMAILS`, mail settings |
| Principal for rate limits | `apps/api/src/common/actor.ts` (`request.principal`, set in a Fastify `onRequest` hook, ADR-016) |
| App assembly | `apps/api/src/app.factory.ts` `createApp()` (raw Fastify plugins register here), `AppModule.register()` |
| Rate limiter | `SlidingWindowThrottlerStorage` in `apps/api/src/throttling/` |
| Queues | `packages/shared/src/queues.ts` (`notify.email`, `outbox.dispatch` exist with placeholder payloads), `QueueProducer`, worker `ReportingWorkerHost` |
| Test database | `startPostgres({ migrate })` hook in `packages/config/src/testing/containers.ts` |
| Console plumbing | `ApiProvider`, `serverApiClient()`, `proxy.ts`, message catalogues, `Button`/`Tabs`/`Toast` primitives |

## Design decisions (each becomes an ADR in `docs/DECISIONS.md`)

Chosen by the project rule: safer for diners, then simpler to operate, then easier to change.

1. **ADR-021 Database roles.**
   - A short idempotent bootstrap SQL, run once by a superuser, creates four roles without passwords: `app_migrator` (schema owner), `app_runtime` (API; no `BYPASSRLS`), `app_worker` (worker; no `BYPASSRLS`) and `app_admin` (`BYPASSRLS`). The operator sets passwords.
   - Migrations run as `app_migrator`. Grants come from an explicit per-table matrix, not a blanket default **(review)**: for example `audit_logs` is insert + select only, `menu_versions` and `bill_snapshots` have no update or delete, `feature_flags` is select only.
   - The migration runner refuses to continue if `app_runtime` or `app_worker` could bypass RLS, owns anything, or is a member of another role.
   - This replaces the "migration creates roles" wording of ADR-014: a schema owner cannot create roles or grant `BYPASSRLS`.
2. **ADR-022 RLS shape.**
   - Every table is either on a short global allowlist (Better Auth tables, `diner_devices`, the migration journal) or has `organization_id`, RLS enabled and a policy on `organization_id = app.org_id` for reads and writes.
   - `menu_item_modifier_groups`, `import_job_pages` and `daily_dish_metrics` gain an `organization_id` column; DATA_MODEL lists none, which would have left them without RLS **(review)**.
   - Relations between tenant tables use composite `(organization_id, id)` foreign keys, so a crafted ID cannot point a row at another organisation's parent. Foreign-key checks bypass RLS, so the policy alone would not stop that **(review)**.
   - `menu_events` partitions get RLS and no direct grants **(review)**.
   - `audit_logs` is append-only for the runtime role. `feature_flags` is readable (own org plus global rows) and written only by admin.
   - Public menu reads use `app.public = 'on'`, a `public_restaurants` view that filters to live restaurants and lists only public columns, and a narrow definer function (the plan's mechanism; DM §5 and ARCH §9 wording aligned).
   - Two narrow `SECURITY DEFINER` functions cover cross-tenant lookups without the admin role: resolving a restaurant's organisation before a tenant context exists (API), and claiming undispatched outbox rows (executable by `app_worker` only, so the API role cannot read other tenants' events **(review)**). All definer functions pin `search_path` and revoke `PUBLIC`.
3. **ADR-023 Better Auth integration.**
   - Mounted at `/v1/auth/*` as a raw Fastify route. Responses there keep Better Auth's own JSON shape (its client depends on it); every other route stays problem+json. API.md records the exception.
   - UUIDv7 ids through the `generateId` function (the built-in `"uuid"` mode rejects v7), adapter transactions on, argon2id hashing with `@node-rs/argon2` (prebuilt binaries, no install script).
   - Schema hand-maintained in `packages/db`, reconciled with `npx auth generate` output. Better Auth 1.7 throws on a schema mismatch at start, which doubles as a test.
   - Sessions: 7 days sliding, no cookie cache (a revoked session must stop working at once). Cookie prefix differs per environment so staging never accepts a production cookie **(review)**.
   - Email codes are stored hashed. Code sign-in is refused for accounts with two-factor enabled, because Better Auth does not challenge it **(review)**.
   - Its rate limiter stores in Valkey and reads the client IP only from a private header the bridge sets from `CLIENT_IP_HEADER` (ADR-016). The extra "10 code emails per IP per 15 minutes" limit uses our existing limiter.
4. **ADR-024 Request model.**
   - A global default-deny guard: every route declares `@RequirePermission(action)`, `@AuthenticatedOnly()` or `@Public()`. A unit test that scans Nest metadata fails on any undeclared route. Services still call `assertCan` (SECURITY §2).
   - Tenant context lives in AsyncLocalStorage. One `withTenant` transaction per tenant-scoped request, shared by repositories, `AuditService` and `OutboxService`. Long-lived routes (the AI stream, later) opt out.
5. **ADR-025 Roles and permissions.** `packages/shared/src/permissions.ts` holds the actions × roles matrix from GO §6 and API §4.
   - Owner-only: billing and plan, deleting the organisation, changing the owner, managing managers.
   - Manager: everything else in the console.
   - Staff: live floor and bills (void only before preparing).
   - Kitchen: view the kitchen queue and bump items.
   - Reopening a `bill_requested` session is staff; reopening a closed one is manager (GO wins over API.md by precedence; API.md corrected).
   - Diner and host rules are added to the same file in P4 with sessions.
6. **ADR-026 Staff devices and PIN sessions.**
   - Registering a device sets an HttpOnly, Secure cookie scoped to the API host only, so the diner site, the CDN and staging never receive it **(review)**. Only the token's hash is stored. The plan's "console origin" wording is corrected: the API must receive the cookie.
   - PIN switch needs that cookie and is limited to staff and kitchen members of the device's organisation.
   - PINs are hashed with argon2id plus a server-side pepper. Failures are counted before verifying; 5 failures lock for 5 minutes, 15 failures in a day disable the PIN until a manager resets it, and the check fails closed if Valkey is down **(review)**.
   - A PIN session lasts 12 hours, enforced on the server at every request (Better Auth would otherwise extend it to 7 days **(review)**). It is confined to the device's organisation and to staff or kitchen permissions, and cannot call account endpoints (password, two-factor, organisations).
   - Revoking a device ends its sessions.
7. **ADR-027 Super admin.** Requires an allowlisted, verified email and a TOTP check recorded on the session (`twoFactorVerifiedAt`, stamped by a hook; "remember this device" does not count) **(review)**. `/v1/admin/*` uses `withAdmin`; every action is audited. Bull Board sits behind the same guard.
8. **ADR-028 Outbox delivery.** After commit the API emits through a `RealtimePublisher` port backed by `@socket.io/redis-emitter`. The worker's `outbox.dispatch` job (every 5 s) re-emits rows older than 5 s. The Socket.IO gateway itself arrives in P4-T03; until then emits reach Valkey only.
9. **ADR-029 Auth emails.** A `Mailer` interface with an SMTP adapter (Mailpit locally) and plain ar/en templates; Resend and React Email stay in P9-T04. Sign-in codes and reset links are sent directly by the API, so a live code never sits in the queue or shows in Bull Board **(review)**. Invitations go through the `notify.email` queue to the worker.
10. **ADR-030 Console auth UI.** No UX spec exists for these pages, and ADR-020 forbids stock shadcn components, so the forms use small hand-written primitives in `packages/ui` (Input, Label, Field, OtpInput), `react-hook-form` and the shared zod schemas. Navigation shells: `(owner)` for owner and manager, `(staff)`, `(kitchen)`, `(admin)`.
11. **Schema scope notes** (recorded in DATA_MODEL).
    - The optional `idempotency_keys` table is not created (ADR-015 says it is unused).
    - `feature_flags` uses `UNIQUE NULLS NOT DISTINCT (key, organization_id)`, since a primary key cannot contain a nullable column.
    - `updated_at` is maintained by a trigger.
    - `menu_events` is declared in the schema for typing; its migration SQL is hand-edited to `PARTITION BY RANGE`.
    - No `db:push` script exists; only committed SQL migrations change a database.

## Tasks, in order

Sub-task splits follow IMPLEMENTATION_PLAN "Size" and are recorded in PROGRESS.

### P1‑T01 Drizzle setup: new `packages/db`

- **First, three quick checks** of the toolchain risks the review found, before anything is built on them: Better Auth (ESM-only) loads from the CommonJS Nest build and under Vitest; `drizzle-kit/api` runs under Vitest 5; the argon2 binary works in the Alpine image (CI Docker job).
- `src/client.ts`: `createDb({ url, max })` (node-postgres pool + Drizzle), `closeDb`.
- `src/columns.ts`: `id()`, `timestamps()`, `softDelete()`, `localizedText()` (JSONB + zod), `money()`, `citext`.
- `src/schema/{auth,restaurants,menu,tables,sessions,billing,ai,analytics,platform}.ts` and `index.ts`.
- `drizzle.config.ts`, `drizzle/` (committed SQL and snapshots; in the package `files` so it survives `pnpm deploy`).
- `src/migrate.ts` `runMigrations()` using `drizzle-orm/node-postgres/migrator`; `apps/api/src/migrate.ts` → `dist/migrate.js` (DEPLOYMENT §3).
- Root scripts `db:generate`, `db:migrate`, `db:studio`, `db:seed`; `turbo.json` entries.
- Env: `DATABASE_URL_MIGRATOR` joins a schema (remove it from the `infraOnly` set in `env.test.ts`).
- `apps/api/src/health/readiness.service.ts` switches to the shared pool. The worker gains a DB module.
- Accept: an empty migration generates and applies on local Postgres.

### P1‑T02 Full schema (split .a auth/restaurants/assets/menu · .b tables/sessions/billing · .c AI/analytics/platform)

- Every table, enum, index, check and partial unique index in DM §1–10, with the ADR-022 additions.
- `packages/shared/src/enums.ts` is the single source for enum values; `pgEnum`s are built from it.
- Hand-written SQL in the same migration journal (`drizzle-kit generate --custom`): extensions (`pg_trgm`, `unaccent`, `citext`), a schema-qualified immutable `f_unaccent()`, the `search_text` generated column and trigram index, `set_updated_at()` triggers, `menu_events` partitioning with `ensure_menu_events_partitions()` (current month + 2, computed when the migration runs).
- Tests:
  - a unit "schema snapshot" test that fails if a migration was not generated (and that generated SQL never touches policies);
  - integration tests for one-live-session-per-table, unique (session, device), the share primary key, and the quantity / note-length / price checks;
  - migrations apply on an empty database, and again after dropping it ("reversible in dev").

### P1‑T03 Roles and RLS (split .a SQL · .b helpers and tests)

- `packages/db/sql/bootstrap-roles.sql` (superuser, idempotent, takes an advisory lock). `infra/postgres/init/02-local-roles.sql` keeps only the local passwords and gains `app_worker`. `infra/scripts/smoke-infra.sh` role assertion updated.
- Migrations: the grant matrix, `ENABLE ROW LEVEL SECURITY` and policies, the special cases and definer functions from ADR-022.
- `src/tenant.ts`: `withTenant(orgId, fn)`, `withPublic(fn)`, `withAdmin(fn)` (separate pool), `BaseTenantRepository`.
- `src/testing/`: `createTestDatabase()` (fresh database per suite: bootstrap as superuser, migrate as `app_migrator`, hand back `app_runtime`, `app_worker` and `app_admin` URLs), `factories.ts` (TESTING §5).
- Tests (safety tests, never weakened):
  - every table in the database is on the global allowlist or has `organization_id`, RLS and a policy;
  - generated per-table tenancy test: one row per tenant table is inserted for org A; as org B the runtime role reads 0 rows, updates 0, deletes 0, cannot insert with org A's id, cannot move a row to another org, and cannot reference org A's rows by ID; a tenant table with no fixture row fails the test;
  - without `withTenant`, the runtime role sees zero rows, including when it queries a partition directly;
  - `withPublic` sees only published menu versions of live restaurants;
  - the grant matrix (for example the runtime role cannot update or delete an audit row).

### P1‑T04 Better Auth (split .a server · .b console pages · .c organisations and invites)

- **API** (`apps/api/src/auth/`):
  - `auth.config.ts`: Drizzle adapter; email + password; `emailOTP`; `organization` with roles owner/manager/staff/kitchen (including Better Auth's own default statements, so owners and managers can invite) and the DM §2 additional fields, none of them writable by clients; `twoFactor`.
  - `auth.plugin.ts`: the Fastify route for `/v1/auth/*` (malformed IDs become 404, not 500), plus the `onRequest` hook that resolves the session into `request.principal`.
  - `mailer/`: `Mailer` interface, SMTP adapter, ar/en templates for code, reset and invite.
  - Endpoints from API §4: `GET /v1/me`, `GET|PATCH /v1/organizations/current`, `POST /v1/organizations` (onboarding step 0, creator becomes owner), `GET /v1/organizations/current/members`, `POST /v1/invitations`.
- **Worker:** `notify.email` processor with the same `Mailer`; the queue's real payload schema.
- **Console** (`apps/console/src/app/`):
  - `(auth)`: `/sign-up`, `/verify-email`, `/sign-in` (password or code), `/forgot-password`, `/reset-password`, `/two-factor`, `/accept-invitation/[id]`, `/onboarding/organization`.
  - `src/lib/auth-client.ts` (Better Auth React client; base URL from the runtime public env, ADR-012).
  - `serverApiClient()` forwards cookies; layouts redirect signed-out users.
  - Role-gated shells with navigation and empty pages.
  - All strings in `messages/en.json` and `ar.json`.
- `packages/ui`: Input, Label, Field, OtpInput, with tests.
- Tests:
  - integration: sign-up → verify → create org → sign out → sign in; code sign-in; code sign-in refused with two-factor on; reset; invite through the mail queue; both rate limits; clients cannot set `plan`, `status` or session flags; a run with secure cookies ("staging-like");
  - E2E in `en` and `ar`: sign up and create an organisation, reading the code from Mailpit.

### P1‑T05 Authorisation layer

- `packages/shared/src/permissions.ts`: actions, the matrix, `can()` / `assertCan(actor, action, resource)`.
- `apps/api/src/authz/`: `@CurrentActor()`, `@RequirePermission()`, `@AuthenticatedOnly()`, `@Public()`, the global guard, `RestaurantScopeGuard` (`:rid` → org → membership → tenant context), `OrgScopeGuard` for routes without `:rid`, the tenant-transaction interceptor.
- New error codes appended to the catalogue (for example `EMAIL_NOT_VERIFIED`, `NOT_A_MEMBER`, `ORG_SUSPENDED`, `TWO_FACTOR_REQUIRED`, `PIN_LOCKED`, `DEVICE_REVOKED`); `pnpm openapi` re-run.
- Tests: table-driven matrix unit test; integration matrix of every console endpoint × owner/manager/staff/kitchen/no-membership (SEC §3); the metadata scan.

### P1‑T06 Super admin and staff devices (split .a admin · .b devices and PIN)

- `apps/api/src/admin/`: the admin guard, the `/v1/admin/*` skeleton, Bull Board at `/v1/admin/queues`.
- `apps/api/src/staff/`: `POST /v1/restaurants/{rid}/staff-devices`, `DELETE /v1/staff-devices/{id}`, `PUT /v1/members/{id}/pin`, `POST /v1/staff-devices/{id}/switch` (delegating to a small Better Auth plugin endpoint that creates the session, the supported pattern).
- Tests:
  - non-admin → 403; admin without a TOTP check in the session → 403;
  - PIN lockout after 5 failures and release after 5 minutes; disable after 15; fail closed without Valkey;
  - a PIN session ends at 12 h even after refreshes, has only that member's staff or kitchen permissions, cannot act in another organisation and cannot call account endpoints;
  - device revoke ends its sessions.
- Carried from P0: one test that enqueues through the API's `QueueProducer` (an invitation mail) and sees the worker process it.

### P1‑T07 Audit and outbox (split .a audit · .b outbox)

- `AuditService.record({ action, entityType, entityId, before, after })`, enriched from the request context (actor, org, restaurant, request ID, `ipHash` as an HMAC with `ACTOR_HASH_SECRET`), written in the caller's transaction.
- `OutboxService.add(tx, { type, aggregate, rooms, payload })`; post-commit publish; `RealtimePublisher` port and Redis-emitter adapter.
- Worker: `outbox.dispatch` processor on a 5-second scheduler, connecting as `app_worker`.
- Tests: an audit row rolls back with its change; outbox rows are marked dispatched; a simulated crash between commit and emit is repaired by the worker; the API role cannot call the outbox claim function.

### P1‑T08 Seed

- `packages/db/src/seed/`: Beit Tayta per SEED_DATA (org on `pro`, four users with password accounts + staff PIN, super admin with a printed TOTP seed, restaurant settings, areas and tables, stations, modifier groups, 28 dishes with ingredients, 14 allergen rows per dish with confirmations exactly as specified, FAQ), deterministic IDs, upserts; `--with-session` for tables 5 and 9.
- Prints "publish pending" (P2-T08) and "images pending" (P2-T02).
- CI: `e2e-smoke` gains migrate and seed steps (carried from P0).
- Tests: seeding twice yields identical row counts and content; unconfirmed dishes stay unconfirmed.

### Docs (with each task, and a final pass)

- PROGRESS: P0 sign-off (2026-11-10, "merge and continue"), a row per P1 sub-task, Needs owner.
- DECISIONS: ADR-021 to ADR-030.
- Specs corrected where the build deviates: DATA_MODEL (§2, §5, §9, §10), ARCHITECTURE §9, API §2/§4, DEPLOYMENT §3–4 (four roles, bootstrap step, cookie prefix), IMPLEMENTATION_PLAN P1 wording, OWNER_CHECKLIST.

## Working method

- Per task: implement → tests → `pnpm lint && pnpm typecheck && pnpm test` → PROGRESS → Conventional Commit → push. An independent review of each task's diff before moving on, as in Phase 0.
- Library APIs are checked against current docs before use (Better Auth and Drizzle docs are readable from their GitHub repositories). Versions are pinned exactly and are at least 3 days old.
- Local database: this container has no Docker, so integration tests run here against a local PostgreSQL 16 and Redis through `TEST_DATABASE_URL` / `TEST_VALKEY_URL`, and on PostgreSQL 17 + Valkey 8 in GitHub Actions. A Docker-dependent task is marked done only after CI is green.

## Open questions (answered with defaults; say so if you want a different choice)

1. **Owner versus manager.** Default: only the owner handles billing and plan, deletes the organisation, changes ownership and manages managers. Managers do everything else.
2. **Who may use a PIN on a shared tablet.** Default: staff and kitchen only; managers and owners sign in normally.
3. **Two-factor for owners on paid plans** (SECURITY T7). Default: built as optional for everyone in Phase 1 and required for super admin; the paid-plan requirement is switched on with plans in Phase 9.
4. **Staging address.** Default: staging stays under `staging.<domain>` with its own cookie prefix, so it ignores production sessions. Using a separate domain for staging would be stricter still; that is a deployment choice for later.

## Needs owner

Nothing blocks Phase 1. Emails go to the local Mailpit inbox; a real mail provider is only needed in Phase 9.

## Verification

- **Local:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`; `pnpm test:int` against the local Postgres and Redis; `pnpm db:migrate && pnpm db:seed` twice; Playwright smoke plus the new sign-up E2E in `en` and `ar` against the running stack with a local SMTP catcher.
- **CI on the PR:** every job green, including `test-int` on PostgreSQL 17, `e2e-smoke` with migrate + seed, `openapi-drift`, the Docker images (argon2 binary present, images still under 250 MB), CodeQL.
- **Demo steps (PR body):**
  1. `pnpm dev:infra && pnpm db:migrate && pnpm db:seed && pnpm dev`.
  2. Open http://localhost:3001/sign-up, sign up, read the code in Mailpit (http://localhost:8025), create an organisation.
  3. Sign out; sign in as `owner@beit-tayta.test`, `manager@…` and `staff@…` and see the different navigation.
  4. Switch to Arabic and repeat a sign-in.
  5. See the tenancy and permission test jobs green in the PR.
