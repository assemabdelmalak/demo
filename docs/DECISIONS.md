# DECISIONS (ADRs) — Radd Menu

Format: `ADR-NNN — Title · Date · Status`, then Context, Decision, Consequences. Append only. To change a decision, add a new ADR that supersedes the old one.

## ADR-001 — TypeScript end to end in a pnpm/Turborepo monorepo · 2026-10-19 · Accepted

- **Context.** One founder works with AI coding agents. Diner, console, API and worker share many types: money, billing and allergen rules.
- **Decision.** All apps and packages use TypeScript. Shared zod schemas are the single source of truth.
- **Consequences.** Fewer type mismatches and one toolchain. The backend is not on the JVM or .NET, which is acceptable at our scale; heavy compute can later become a separate service.

## ADR-002 — NestJS (Fastify) API + Socket.IO + BullMQ, PostgreSQL + Valkey · 2026-10-19 · Accepted

- **Context.** The product needs a proven restaurant-tech core: relational database, cache, queues and realtime.
- **Decision.** Use the stack in ARCHITECTURE §3.
- **Consequences.** A familiar enterprise structure. Horizontal scale through the Valkey adapter and stateless containers.

## ADR-003 — RLS as tenant backstop from day one · 2026-10-19 · Accepted

- **Context.** Cross-tenant leaks would destroy trust, and retrofitting RLS later is painful.
- **Decision.** Use `withTenant()` with `SET LOCAL app.org_id`. Every tenant table has RLS. The runtime role has no BYPASSRLS.
- **Consequences.** Every request runs inside a transaction (small overhead). The setup is compatible with PgBouncer transaction pooling.

## ADR-004 — Anthropic Claude behind our own `LlmClient`; Haiku 5.5 for chat, Sonnet 5.5 for jobs, Opus 5.5 fallback · 2026-10-19 · Accepted

- **Context.** We need strong Arabic and dialect handling, strict tool use, structured outputs, prompt caching, vision/PDF input and batch pricing.
- **Decision.** Use the official SDK behind an interface. Model IDs come from env. Upgrades are gated by evals.
- **Consequences.** We depend on a single vendor today, mitigated by the interface. Costs per restaurant stay low thanks to Haiku 5.5 pricing and caching.

## ADR-005 — Allergen facts never authored by the LLM · 2026-10-19 · Accepted

- **Context.** Liability, and LLMs are sometimes wrong about allergies.
- **Decision.** Allergen facts are shown only through deterministic cards built from confirmed data, with a pre-router, forced tool calls, an output guard and server-enforced escalation.
- **Consequences.** Some answers feel less conversational. That trade-off is intentional and is part of the brand.

## ADR-006 — Hetzner + Coolify + Cloudflare for Stage 1 · 2026-10-19 · Accepted

- **Context.** Lowest cost, portable, and a solo operator can run it.
- **Decision.** Docker images deploy through Coolify. Cloudflare handles the edge and R2 holds storage and backups.
- **Consequences.** We do more operations work than on a managed PaaS. Mitigations: backups, restore drills and runbooks. The scale path is in DEPLOYMENT §9.

## ADR-007 — Default ordering mode `diner_with_approval` · 2026-10-19 · Accepted

- **Context.** Prank risk, and Lebanese restaurants are used to having waiters in control (Omega uses waiter approval too).
- **Decision.** New restaurants default to diner orders with staff approval.
- **Consequences.** Slightly slower order flow. Restaurants can switch to direct ordering.

## ADR-008 — Valkey instead of Redis · 2026-10-19 · Accepted

- **Decision.** Use Valkey 8 (BSD licence, Redis-protocol compatible) for BullMQ, the Socket.IO adapter and caching.
- **Consequences.** None functionally. Redis 8 can be swapped in if needed.

<!-- Claude Code: append new ADRs below -->

## ADR-009 — English is the default locale, always shown first; Arabic stays first-class · 2026-10-20 · Accepted

- **Context.** The owner decided on 2026-10-20 that the default language is English and that everyone sees English until they choose otherwise. The specs had assumed Arabic as the default (DATA_MODEL defaults, SEED, ARCH §10, P0-T06, the P3 demo, OWNER_CHECKLIST §1).
- **Decision.**
  1. `DEFAULT_LOCALE = 'en'` is a single constant in `packages/shared`. Both Next apps, Drizzle column defaults, zod defaults and the seed use it. There is no env variable for it.
  2. UI locale resolution: the `NEXT_LOCALE` cookie (set by the language switch) → the restaurant's `default_locale` (diner, once a restaurant is known) → `en`. `Accept-Language` is deliberately **not** used: a phone set to Arabic still opens in English until the diner taps "ع". The console and pages with no restaurant use cookie → `en`.
  3. Content fallback: requested → restaurant default → `en` → first available (en, ar, fr). Missing UI messages show the English string at runtime; CI still fails on missing `ar` or `en` keys.
  4. DB defaults (built in P1): `restaurants.default_locale 'en'`, `enabled_locales '{en,ar}'`, `session_participants.locale 'en'`. Restaurants can change their own default.
  5. Beit Tayta (the demo restaurant) defaults to `en`, with `ar` and `fr` enabled.
  6. Unchanged: Arabic is first-class (RTL, typography, search normalisation, dialect-aware AI); every screen is verified in `ar` and `en`; ALLERGEN_SAFETY wording; the assistant replies in the diner's language and script.
- **Consequences.**
  - CLAUDE §2.3(a) would favour honouring an Arabic browser so safety text appears in the reader's language. The owner chose predictability instead; the language switch is always visible top-end, and allergen cards render in the chosen UI locale.
  - Arabic becomes the less-exercised path. Mitigation: `ar` Playwright projects, `ar` visual snapshots and axe in both locales stay mandatory.
  - Specs updated: CLAUDE §3.5, PRD §7, ARCH §10, DATA_MODEL §3/§7/§11, SEED, UX §6.1, IMPLEMENTATION_PLAN P0-T06 and the P3 demo, OWNER_CHECKLIST §1/§8.

## ADR-010 — The default branch is `master` · 2026-10-20 · Accepted

- **Context.** The specs say "PR to `main`" and "push images on `main`", but this repository's default branch is `master`. The owner chose to keep it.
- **Decision.** Phase PRs target the default branch. Workflow logic never hard-codes a branch name: image pushes and deploy steps run when `github.ref` equals `refs/heads/<default branch>`. The one exception is CodeQL's `push` trigger, where GitHub allows no expression, so it lists both `master` and `main`.
- **Consequences.** Renaming `master` to `main` later needs no code change. Docs now say "default branch (`master`)".

## ADR-011 — Toolchain pins and module format · 2026-10-20 · Accepted

- **Context.** Several newer majors exist on 2026-10-20 that conflict with the spec or with each other: TypeScript 7 (native compiler, no compiler API), NestJS 12 (ESM-only; nestjs-zod and the throttler storages support Nest ≤ 11), ESLint 10 (eslint-config-next and eslint-plugin-react/import crash on it), Vitest 5 (`vitest.workspace` removed), pnpm 12 (Rust rewrite). Node 24 moved to Maintenance LTS on 2026-10-20; Node 26 becomes Active LTS on 2026-10-28.
- **Decision.**
  - Node 24.22.0 (`.nvmrc`, `engines >=24.11 <25`), pnpm 10.34.7 via Corepack, TypeScript 5.9.3 (pinned through a pnpm override), NestJS 11.2.x, ESLint 10 with typescript-eslint, eslint-plugin-import-x, react-hooks, jsx-a11y (peer range relaxed; it runs cleanly on ESLint 10) and `@next/eslint-plugin-next` used directly instead of eslint-config-next, Vitest 5 with root `test.projects`.
  - Exact versions everywhere; Renovate holds majors of TypeScript, NestJS and Node for dashboard approval.
  - Workspace packages are ESM and emit `dist/` with `tsc`. Their `exports` carry a `@radd/source` condition that points at `src/`; `tsc --noEmit`, Vitest and editors resolve sources through it (`customConditions`), while builds clear the condition and consume `dist/`. NestJS apps compile to CommonJS and load the ESM packages through Node 24's `require(esm)`.
- **Consequences.** Typecheck and tests need no prior build; app builds depend on `^build` in Turborepo. Moving to Node 26 is an owner decision (listed under "Needs owner").

## ADR-012 — Next.js apps read public config at runtime · 2026-10-20 · Accepted

- **Context.** Next.js inlines `process.env.NEXT_PUBLIC_*` into bundles at build time. DEPLOYMENT promotes one image from staging to production by retagging, so build-time inlining would point production at staging URLs.
- **Decision.** The Next servers parse the browser-safe schema (`@radd/config/env` `loadPublicEnv`) at request time and render the object into the page as a JSON `<script id="radd-public-env">`, which client code reads with `readPublicEnv()`. Client code never reads `process.env`. The `NEXT_PUBLIC_` prefix now only marks a variable as safe to expose. The public schemas also carry `APP_ENV` and `GIT_SHA`, which are not secrets: the browser Sentry setup needs them for environment and release. Server-only variables are validated at server start (`instrumentation.ts`), not during `next build`, so images build without secrets.
- **Consequences.** One image per app serves every environment. Pages that render the script are dynamic; P3 revisits caching for diner menu routes. CI greps the client bundles for sentinel secret values (P0-T08).

## ADR-013 — SeaweedFS replaces MinIO for local S3 · 2026-10-20 · Accepted

- **Context.** The spec uses MinIO as the local stand-in for Cloudflare R2. The `minio/minio` and `minio/mc` images were removed from Docker Hub in September 2026, and the quay.io mirror no longer allows anonymous pulls.
- **Decision.** Local S3 runs `chrislusf/seaweedfs` (Apache-2.0) in `weed mini` mode: S3 API on `localhost:9000`, admin UI on `localhost:9001`, buckets `radd-assets` (anonymous read) and `radd-private` created at start, CORS limited to the diner and console origins, identities in `infra/seaweedfs/s3.json`. Production stays on R2.
- **Consequences.**
  - Verified locally against the 4.48 binary: signed and presigned PUT, anonymous GET on `radd-assets` only, anonymous writes and listing denied, CORS preflight allowed only for :3000/:3001.
  - The AWS SDK v3 adds a CRC32 checksum of an empty body to presigned PUT URLs by default, which SeaweedFS (and R2) reject with `BadDigest`. P2-T02's S3 client must set `requestChecksumCalculation: 'WHEN_REQUIRED'`.
  - The local access key changes from `minio` to `radd-local` in `.env.example`. ARCH §11 bucket names now match the code (`radd-assets`, `radd-private`).

## ADR-014 — Local database roles come from compose init SQL · 2026-10-20 · Accepted

- **Context.** `.env.example` connects as `app_runtime`, `app_migrator` and `app_admin`, but the real roles, grants and RLS policies are P1-T03 work. The API readiness check in P0 already needs to connect.
- **Decision.** `infra/postgres/init/02-local-roles.sql` creates the three login roles for local development only (`app_admin` with BYPASSRLS, `app_runtime` without), makes `app_migrator` the database and schema owner, and grants `CONNECT`/`USAGE`. It is marked local-only.
- **Consequences.** P1-T03's role migration must be idempotent (`IF NOT EXISTS`) so it applies cleanly on top of these roles, and is the only source of truth for staging and production.
- **Superseded by ADR-021** (2026-11-13): roles are created by a superuser bootstrap, not by a migration, and the compose file now mounts that same bootstrap; `02-local-roles.sql` is gone.

## ADR-015 — Idempotency semantics · 2026-10-20 · Accepted

- **Context.** API §1 asks for Idempotency-Key replay for 24 h, keyed by actor and route, with 422 on a different body. It leaves open what happens while the first request is still running, which outcomes are replayed, and what happens when Valkey is unavailable. A review also showed that a handler outliving a fixed in-flight lock could run twice.
- **Decision.**
  - Opt-in per route with `@Idempotent()`; the header must be a UUID (`400 IDEMPOTENCY_KEY_REQUIRED` otherwise). PUT routes may opt in too.
  - Scope: HMAC of the actor (user → participant → device → client IP) + method + route template + key. Fingerprint: SHA-256 of method, URL and canonical JSON body (keys sorted, depth capped at 64; deeper bodies get `400 BAD_REQUEST`).
  - A claim writes an in-flight marker with a random token (60 s TTL). A heartbeat extends it while the handler runs (capped at 15 min). Storing, releasing and refreshing are compare-and-set on the token, so a request that lost its claim cannot overwrite a newer one.
  - A repeat while in flight → `409 IDEMPOTENCY_IN_PROGRESS`, `Retry-After: 1`. Same key, different fingerprint → `422 IDEMPOTENCY_MISMATCH`.
  - Replayed: 2xx and deterministic 4xx (status, body, and the `Location`, `Content-Location`, `ETag`, `Last-Modified` headers), marked `Idempotent-Replayed: true`. Never replayed: 5xx, 401, 403, 408, 429; their marker is released so a retry runs again.
  - Valkey unavailable → `503 SERVICE_UNAVAILABLE` (fail closed). Duplicate orders or payments are worse than a brief retry.
- **Consequences.** The optional Postgres `idempotency_keys` fallback (DATA_MODEL §10) is not used. Clients must create a new key for a new attempt after a 4xx.

## ADR-016 — Rate limiting: sliding window per actor; client IP from one trusted header · 2026-10-20 · Accepted

- **Context.** API §8 asks for Valkey sliding windows keyed by device, participant or user, never IP alone, while diners share restaurant Wi-Fi. `@nestjs/throttler`'s community Redis storages count in fixed windows and key per handler. A review showed that trusting `X-Forwarded-For` lets clients pick their own IP, because Cloudflare appends to a client-supplied header.
- **Decision.**
  - Custom `ThrottlerStorage`: a sorted-set sliding-window log in Lua using Valkey's clock. Rejected requests are not recorded; `blockDuration` penalties are not used.
  - The default throttler is one bucket per actor across all routes (300/min). Scoped limits from API §8 are added as named throttlers with their own keys when their endpoints land.
  - Tracker: user → participant → device → client IP, hashed with HMAC-SHA256 (`ACTOR_HASH_SECRET`) before it reaches a Valkey key name. Auth that sets the principal must run in a Fastify `onRequest`/`preHandler` hook, because the global throttler guard runs before controller guards.
  - Fastify `trustProxy` is off. The client IP is the socket address, or the header named by `CLIENT_IP_HEADER` (`cf-connecting-ip` in staging and production) when it holds a valid IP. IPv6 addresses are grouped by /64.
  - If Valkey is unreachable the limiter fails open and logs a warning; health routes are never throttled.
- **Consequences.** Limits are exact across API instances. Forgetting `CLIENT_IP_HEADER` in a deployed environment makes every anonymous diner share the proxy's bucket; DEPLOYMENT §4 says to set it.

## ADR-017 — HTTP error and logging conventions; full CSP deferred · 2026-10-20 · Accepted

- **Context.** API §1 fixes problem+json with stable codes but not the status for validation failures, how router-level errors are answered, or what request logs contain. SEC §2 wants CSP with nonces, which interacts with Next.js caching and Swagger UI.
- **Decision.**
  - Validation failures → `400 VALIDATION_FAILED` with `errors[]` (path, message). Unknown routes → `404 NOT_FOUND`. Fastify router errors (bad encoding, overlong params) use the same problem shape via `frameworkErrors`. 5xx bodies never carry internal messages. `type` is `https://docs.<APP_DOMAIN>/errors/<CODE>`.
  - `DomainError` extensions cannot shadow `type`, `title`, `status`, `code`, `detail`, `errors`, `requestId` or `instance`.
  - Request logs keep method, path (query string dropped, receipt tokens masked), a small header allowlist (user agent, content type and length, origin), status and request ID. No cookies, auth headers or client IPs. Errors are logged as name, message, code, stack and cause only, so client libraries cannot leak payloads (ioredis attaches full commands).
  - Helmet on the API with default CSP in production; CSP is disabled outside production so Swagger UI works. Full CSP with nonces for the Next apps is P10-T01.
- **Consequences.** Clients branch only on `code`. A route that carries a secret in its path must add a pattern to `@radd/config/logging`.

## ADR-018 — Console light and dark tokens · 2026-10-20 · Accepted

- **Context.** UX_SPEC defines restaurant presets for the diner but no console palette, while P0-T06 requires a dark-mode switch in the console, which is built on shadcn/ui token names.
- **Decision.** `packages/ui/src/styles/console.css` maps the shadcn names (`background`, `foreground`, `card`, `border`, `ring`, `destructive`, …) to a light set derived from the Plain preset with Zaatar's primary, and a dark set derived from the Rooftop preset. `data-theme="dark"` on `<html>` switches them; a cookie read by the server keeps the first paint correct. The shared primitives read the restaurant tokens, which the dark set points at the console palette.
- **Consequences.** The console stays visually related to the diner presets. The kitchen display's dark UI (P4-T10) can reuse the dark set.

## ADR-019 — Error reporting without diner data; request IDs across services · 2026-10-20 · Accepted

- **Context.** P0-T09 asks for Sentry in all four apps, gated by DSN, plus request IDs that follow a request from the Next servers to the API. CLAUDE §3.8 forbids sending diner personal data to third parties. Sentry SDK 11 attaches request data to events, streams spans separately from events (so `beforeSend` never sees them), and by default adds trace headers to every outgoing request, including those to third parties.
- **Decision.**
  - Each app initialises Sentry only when its DSN is set; without one no instrumentation is loaded. Release is `GIT_SHA`, environment is `APP_ENV`.
  - One options factory, `@radd/config/observability`, for every app, type-checked against the SDK's options (`satisfies Options`). Two layers:
    - `dataCollection` switches off what SDK 11 collects about people by default: user and IP (the browser SDK otherwise asks Sentry to infer and store the IP), cookies, request and response bodies, query strings, headers outside a small allowlist, AI prompts and outputs, database parameters and queue arguments. SDK 11 removed `sendDefaultPii`; setting it does nothing.
    - Scrubbers as a second line: `beforeSend` removes cookies, bodies, query strings, the user and unsafe headers, masks secret path segments (the same patterns as the logs) in URLs, the transaction name and Next.js's request path, and drops console breadcrumbs and breadcrumb queries. `beforeSendSpan` drops bodies, client addresses, users, unsafe headers, AI content and Redis arguments, and scrubs URLs. A `createDsc` hook scrubs the trace context in envelope headers and `baggage`.
  - No service sends trace headers (`sentry-trace`, `baggage`) to another. The API cannot tell our Next servers from a client forging them, and third parties must get none. A page request and the API calls it makes are joined by the `x-request-id` kept on their spans and events.
  - Sampling is decided by us, never by the client, and returned as 0 or 1: returning a rate would let a client force tracing, because the SDK compares it against a random number taken from the client's `baggage`. One decision per incoming request covers all of that request's root spans (a Next.js request has several). It is an HMAC of the request's `x-request-id` keyed with `TRACE_SAMPLING_SECRET`, shared by the API and both Next servers. So a page request and the API calls it forwards its ID on are kept or dropped together, and a client choosing its own IDs cannot predict the outcome. Work without a request (worker jobs) draws locally. The decision is never visible to clients: pages carry no `sentry-trace`/`baggage` meta tags (switched off after `withSentryConfig`, which adds them), and responses carry no trace headers. Otherwise a client could find an ID that is always traced and reuse it. Kept spans report a sample rate of 1: Sentry does not extrapolate throughput counts, while percentiles are unaffected.
  - The API reports 5xx only, tagged with the request ID and route. The worker reports a job's final failure only (retries are expected) and never attaches job data.
  - The Next apps capture server errors with `onRequestError`. The browser SDK is a separate chunk loaded only when a DSN is configured, reports errors only and never traces, which keeps the diner's initial JavaScript within budget (UX §10).
  - Server traces are off by default (`SENTRY_TRACES_SAMPLE_RATE=0`); raising it is an operations decision.
  - Browser source maps are uploaded only by default-branch image builds when the `SENTRY_AUTH_TOKEN` secret exists. The token is a BuildKit secret, never a build argument, and maps are deleted after upload. A failed upload fails the build, so a layer without maps is never cached. The Nest apps upload none: `--enable-source-maps` maps their stack traces before Sentry reads them. Sentry releases are created at deploy time (DEPLOYMENT §5).
  - Request IDs: the Next servers and the API give every request its `x-request-id` (a valid incoming UUID, else a fresh UUIDv7) the moment Node starts handling it (`assignRequestIds` in `@radd/shared/node`), before Sentry copies the headers, so spans and events carry it. `proxy.ts` keeps it and sets it on the response, and `serverApiClient()` forwards it to the API, which keeps it too.
  - The API and worker exit when start-up fails. With Sentry initialised, its unhandled-rejection handler would otherwise log the failure and leave a process with no listener.
- **Consequences.** Sentry issues carry no user context, so they cannot be grouped by diner. Browser errors thrown before the SDK chunk loads are missed. A new route or URL that carries a secret in its path must add a pattern to `@radd/config/logging`, which logs and Sentry share. SDK upgrades can change what an option means without a type error, so the real-SDK tests in `@radd/config` (browser event and session, a traced HTTP request) must pass before a Sentry upgrade merges.

## ADR-020 — shadcn/ui components are hand-adapted for now · 2026-11-10 · Accepted

- **Context.** P0-T06 asks for shadcn/ui "initialised in the package". The shadcn registry (`ui.shadcn.com`) is blocked by the agent environment's network policy, so `shadcn init` and `shadcn add` cannot run. The Phase 0 acceptance audit also found that `packages/ui/components.json` does not describe a working setup: its aliases (`@radd/ui/components`, `@radd/ui/lib/cn`, `@radd/ui/hooks`) match no package export or tsconfig path, `lucide-react` is not installed, and `console.css` maps no `muted`, `accent` or `primary-foreground` colour, because `muted`, `accent` and `primary` already name restaurant tokens used by the shared primitives.
- **Decision.** The Phase 0 primitives (Button, Sheet, Tabs, Chip, Price, Avatar, Skeleton, Toast) stay hand-written on Radix in shadcn's style, reading the Radd tokens. `components.json` stays as the record of the intended setup. P2-T01 decides, before the first console screen, between two options: make the CLI usable (working aliases, `lucide-react`, shadcn colour names mapped inside the console scope only) or keep adapting each component by hand.
- **Consequences.** A stock shadcn component pasted into the console today would be mis-coloured, so none may be added before P2-T01 settles this. The diner is unaffected: it uses only the shared primitives.

## ADR-021 — Database roles: superuser bootstrap, migrations as the schema owner · 2026-11-13 · Accepted

- **Context.** P1-T03 asks for a "hand-written SQL migration creating the roles", and ADR-014 made that migration the only source of truth. But DEPLOYMENT runs migrations as `app_migrator`, the schema owner. Creating roles needs `CREATEROLE`, granting `BYPASSRLS` needs a superuser, and a schema owner with either could undo tenant isolation. Passwords also cannot live in committed SQL.
- **Decision.**
  - `packages/db/sql/bootstrap-roles.sql`, run once by a superuser, creates four roles without passwords and sets their attributes: `app_migrator` (owns the database and schema), `app_runtime` (the API), `app_worker` (the worker) and `app_admin` (`BYPASSRLS`, super-admin module only). The operator sets the passwords. Local compose mounts the same file; only `03-local-passwords.sql` is local.
  - The worker gets its own role, so narrow cross-tenant functions (the outbox dispatcher in P1-T07) can be executable by the worker and not by the API.
  - Migrations run as `app_migrator`. Before applying anything, the runner reads the catalog and refuses to continue if a role is missing, if it is not connected as `app_migrator`, or if `app_runtime` or `app_worker` is a superuser, has `BYPASSRLS`, `CREATEROLE` or `CREATEDB`, is a member of another role, or owns a relation (`roleProblems` in `packages/db/src/roles.ts`).
  - Privileges are granted table by table in the migrations, never through blanket default privileges: history, payments, published menu versions and the audit log cannot be deleted by the application roles, and `outbox_events` only lets the API set `dispatched_at`. A test compares the catalog with the documented matrix for every table.
  - `PUBLIC` is revoked from the database and from the `public` schema.
- **Consequences.**
  - A new environment needs one manual step before the first deploy: run the bootstrap as a superuser and set four passwords (DEPLOYMENT §6). After that every deploy is `node dist/migrate.js`.
  - Every new table needs explicit `GRANT`s in its migration, or the API cannot read it and the privilege test fails.
  - Tests build each database the same way (`createTestDatabase`): bootstrap as superuser, migrate as `app_migrator`, connect as `app_runtime`, so they exercise the real permission model.

## ADR-022 — Row Level Security shape and tenant-safe foreign keys · 2026-11-13 · Accepted

- **Context.** DATA_MODEL says every tenant table carries `organization_id` and has RLS, and P1-T03 requires that "Org A cannot read or write Org B rows even with crafted IDs". Three things in the specs fell short of that. `menu_item_modifier_groups`, `import_job_pages` and `daily_dish_metrics` list no `organization_id`, so a rule of "RLS on tables that have the column" would skip them. Postgres checks foreign keys without applying RLS, so with single-column keys organisation B could insert a row that points at organisation A's category, table or session. And `feature_flags` and `audit_logs` have a nullable `organization_id`, which a single uniform policy would hide or block.
- **Decision.**
  - Every table in `public` is either on a short global allowlist (Better Auth's tables, `diner_devices`) or has `organization_id`, RLS enabled and a policy comparing it with `app.org_id`. A test reads the catalog and fails on any table that is neither. The three tables above gain `organization_id` (and `restaurant_id` where the parent has one).
  - References between tenant tables are composite keys on `(organization_id, <column>)`, with `UNIQUE (organization_id, id)` on each referenced table (`tenantFk` and `orgIdUnique` in `packages/db/src/schema/tenant.ts`).
  - `feature_flags` is readable for the caller's organisation plus global rows and is written only by the admin role; it uses `UNIQUE NULLS NOT DISTINCT (key, organization_id)`. `audit_logs` is append-only for the runtime role.
  - Policies, grants, the public-read view and the narrow `SECURITY DEFINER` functions are hand-written SQL migrations (DEPLOYMENT §4), never declared in the Drizzle schema; a unit test fails if the schema ever declares a policy, because a later `generate` could then rewrite the hand-written ones. They land with P1-T03.
- **Consequences.** A crafted ID fails with a foreign-key violation even when application code forgets a check. Every new tenant table needs `organization_id`, `orgIdUnique` if it is referenced, and a fixture row in the tenancy test, or CI fails. Composite keys cannot use `ON DELETE SET NULL` on the reference alone, so optional references are `NO ACTION`; dependent rows (shares, junctions, import pages, chat labels) cascade.

## ADR-023 — Better Auth integration · 2026-11-14 · Accepted

(Approved with the Phase 1 plan on 2026-11-11; written in the Phase 1 docs pass, as built.)

- **Context.** P1-T04 mounts Better Auth (pinned at 1.7.18) in the API for email and password, email codes, organisations and two-factor. Its client expects its own JSON responses, while every other route answers problem+json. Its defaults also leave gaps that matter here: link-based flows we do not offer, a sliding session that a cookie cache would keep alive after revocation, code sign-in that skips the second factor, a limiter that trusts proxy headers, and an Origin check that turns itself off under `NODE_ENV=test`.
- **Decision.**
  - **Mounting.** Better Auth is a raw Fastify route at `/v1/auth/*` (`apps/api/src/auth/auth.fastify.ts`). Its responses keep Better Auth's JSON shape; API.md §2 records the exception. Every other route stays problem+json, and errors from the routes we wrap (`toDomainError`) become our stable codes. The same bridge resolves the session cookie into `request.principal` for the rest of the API, reading the session with `disableRefresh` so ordinary API calls do not extend it; only Better Auth's own `/get-session` slides it.
  - **Database.** Drizzle adapter with transactions on. The schema is hand-maintained in `packages/db` and reconciled with Better Auth's generated output; Better Auth fails at start on a mismatch. Every ID is a UUIDv7 through `advanced.database.generateId` (its built-in `"uuid"` mode makes v4). Passwords are argon2id through `@node-rs/argon2` (prebuilt binaries, no install script), 12 to 128 characters.
  - **Malformed IDs.** A body or query field named `id` or `…Id` that is not a UUID answers `400 INVALID_ID` (Better Auth's error shape) before Better Auth sees it; otherwise Postgres would answer 500.
  - **Flows.** Sign-up requires email verification by a 6-digit code (5 minutes, 3 attempts, stored hashed), and entering the code signs the user in. Sign-in by password or by emailed code; password reset by code. Disabled (Better Auth answers 404): link-based reset and verification, email change, social sign-in and its account endpoints, two-factor by email or SMS code, and the organisation endpoints our own API wraps (create, update, delete, invite, cancel, remove, role change, leave). `DISABLED_AUTH_PATHS` in `auth.config.ts` is the list.
  - **Two-factor and codes.** An account with two-factor on cannot sign in by email code (Better Auth only challenges password sign-in), and `verify-email` cannot sign in an account that is already verified or has two-factor on. In both cases no code is sent and a submitted code gets the same `INVALID_OTP` answer as a wrong one, so nothing reveals the account's settings.
  - **Sessions.** 7 days, refreshed at most once a day, no cookie cache, so a revoked session stops working on the next request. Server-set fields only (`staffDeviceId`, `pinSession`, `twoFactorVerifiedAt`; clients cannot write them). A new session starts in the user's organisation when they have exactly one.
  - **Cookies.** Prefix `radd` in production and `radd-<APP_ENV>` elsewhere, so staging never accepts a production cookie. Secure whenever `BETTER_AUTH_URL` is HTTPS; shared across subdomains of `AUTH_COOKIE_DOMAIN` (host-only on `localhost`).
  - **Origin.** Trusted origins come from `TRUSTED_ORIGINS`. The Origin and CSRF checks are forced on (`disableOriginCheck: false`), so tests see production behaviour.
  - **Limits.** Better Auth's own limiter stores in Valkey with HMAC'd keys (no IP addresses in Valkey) and **fails closed**: if Valkey is unreachable, auth requests answer 429. It reads the client IP only from a private header that the bridge overwrites on every request from `CLIENT_IP_HEADER` (ADR-016). On top of it: 10 code emails per IP per 15 minutes, and the per-address limits of ADR-034.
  - **Organisations.** Creator becomes `owner`; only verified users may create one; at most 3 owned organisations (`MAX_OWNED_ORGANIZATIONS`). Better Auth's role statements are kept for the endpoints our services delegate to: owners get its owner statements, managers its admin statements, staff and kitchen none; `auth-roles.test.ts` fails if they drift from ADR-025. Suspended organisations cannot invite or accept invitations. Organisation fields `plan`, `status`, `country` and the terms fields are not writable by clients.
  - **Privacy.** Telemetry is off. Better Auth's logger goes to ours at warn and above, keeping only messages and error names.
- **Consequences.** The console uses Better Auth's React client for the account pages and our typed client for everything else. A Better Auth upgrade must be checked against this list (disabled paths, hooks, schema); the pinned version's docs live in its GitHub tag (HANDOFF §7). With Valkey down nobody can sign in, by design.

## ADR-024 — Request model: default-deny route policies, one tenant transaction per request · 2026-11-15 · Accepted

(Approved with the Phase 1 plan; written in the Phase 1 docs pass, as built.)

- **Context.** P1-T05 asks for `@RequirePermission`, a restaurant scope guard and a CI check that fails on undecorated routes. SECURITY §2 also wants services to check permissions themselves, and CLAUDE §3.3 wants every query to run in a tenant context.
- **Decision.**
  - **Policies.** Every route declares exactly one access policy (`apps/api/src/authz/access.decorators.ts`): `@Public()`, `@AuthenticatedOnly()` (any signed-in user, no tenant; refused to a PIN session unless the route says `allowPinSession`, as `GET /v1/me` does), `@RequirePermission(action)` or `@RequireSuperAdmin()`. Declaring two on one target throws when the module loads. One global `AuthzGuard`, registered after the throttler so refused requests still count, refuses a route that declares none. The plan's separate `RestaurantScopeGuard` and `OrgScopeGuard` are this one guard.
  - **Scope.** A route with `:rid` acts in that restaurant's organisation, resolved with the `restaurant_org()` definer function before any tenant context exists; other routes act in the session's active organisation. A restaurant that is missing, deleted or in an organisation the caller is not in answers `404 NOT_FOUND`, so IDs cannot be probed; no active organisation is `404`, and no longer being a member of it is `403 NOT_A_MEMBER`. A role without the action gets `403 FORBIDDEN`. A suspended organisation stays readable: any method other than GET, HEAD or OPTIONS answers `403 ORG_SUSPENDED`.
  - **Tenant transaction.** `TenantTransactionInterceptor` runs each `@RequirePermission` handler inside one `withTenant` transaction, with the request context in AsyncLocalStorage; repositories (`BaseTenantRepository`), `AuditService` and `OutboxService` join it. It commits before the response is sent and rolls back on any error; it runs after the idempotency interceptor, so a stored replay is written only after the commit. `@WithoutTenantTransaction()` exists for long-lived routes (the AI stream) and is unused so far.
  - **Services check again.** The guard only checks that the role holds the action; services call `assertCan(actor, action, resource)` with the target (for example the target member's role).
  - **Tests.** `apps/api/test/route-policy.test.ts` scans Nest's metadata, fails on any route without a policy and pins the exact list of public and super-admin routes. `apps/api/test/authz.int.test.ts` runs every console endpoint against owner, manager, staff, kitchen and a non-member (SECURITY §3); each new console route adds its row.
- **Consequences.** A new route cannot ship without a policy, and making a route public or super-admin needs a deliberate change to the pinned list. A tenant-scoped request holds one pooled connection for its whole duration (HANDOFF §10 lists the pool risk where Better Auth takes a second one).

## ADR-025 — Roles and permissions · 2026-11-15 · Accepted

(Approved with the Phase 1 plan; written in the Phase 1 docs pass, as built.)

- **Context.** PRD, GROUP_ORDERING §6 and API §4 each describe what owners, managers, staff and kitchen may do, and they differ in places (for example who reopens a session). The console, the API guard and the services need one source.
- **Decision.**
  - `packages/shared/src/permissions.ts` holds the action list (`ACTIONS`, append-only: names appear in audit logs), the role matrix (`PERMISSIONS`) and `can` / `assertCan` / `holdsPermission`.
  - **Owner:** every action. **Owner only:** `org.delete`, `org.billing`, `org.ownership.transfer`, `team.invite.manager`. **Manager:** everything else. Team actions on another member are conditional on the target: an owner manages managers, staff and kitchen; a manager manages staff and kitchen; nobody changes an owner through them (ownership moves only by transfer). A conditional action checked without its target is refused.
  - **Staff:** read the organisation, team, restaurant and menu; the "86" switch (`menu.availability`, GROUP_ORDERING §5.4); the live floor, sessions, rounds, bills and payments; voiding only before preparing (`item.void.before_preparing`); closing a settled session; reopening a `bill_requested` session; transfers; waiter calls; the kitchen view and bump. Reopening a **closed** session, force-closing, merging sessions, discounts, payment voids and voiding after preparing are manager actions. Where GROUP_ORDERING and API.md disagreed, GROUP_ORDERING won (CLAUDE §1) and API.md was corrected.
  - **Kitchen:** read the organisation, team and restaurant; the kitchen view and bump.
  - **PIN sessions** (ADR-026) hold permissions only for staff and kitchen members, and never reach the `org`, `team`, `devices` or `account` namespaces (`PIN_SESSION_EXCLUDED_NAMESPACES`), whatever the role.
  - Super admins hold no console permission by that title (ADR-027); the system actor holds none. Diner and host rules join this file in P4 with sessions.
- **Consequences.** The console's navigation, the guard and the services read the same matrix, and a table-driven unit test covers every role and action. Changing who may do something is a change to one file plus its tests.

## ADR-026 — Staff devices and PIN sessions · 2026-11-23 · Accepted

(Approved with the Phase 1 plan; written in the Phase 1 docs pass, as built. Two points were changed by the security review of Phase 1, F1 and F2.)

- **Context.** P1-T06: a manager registers a shared tablet, and staff switch on it with a PIN into a short session limited to their floor or kitchen work (SECURITY T7: device-bound PIN sessions). The plan's wording put the device cookie on "the console origin", but it is the API that must receive it.
- **Decision.**
  - **Registration.** `POST /v1/restaurants/{rid}/staff-devices` (`devices.manage`, `Idempotency-Key`) creates a random 32-byte token and sets it in a cookie; the body never carries it, and only its SHA-256 is stored. An Idempotency-Key replay returns the device without setting a second cookie. The cookie is host-only on the API host (no `Domain`), HttpOnly, SameSite=Lax, one year: `__Host-radd_device` with `Path=/` over HTTPS, `radd_device` with `Path=/v1` over plain HTTP (local development), so the diner site, the console, the CDN and staging never receive it. The `staff_device_by_token_hash()` definer function, for `app_runtime` only, finds a device before a tenant is known. `DELETE /v1/staff-devices/{id}` revokes a device and ends every session opened on it.
  - **PINs.** `PUT` / `DELETE /v1/members/{id}/pin` (`team.pin.set`, only for staff and kitchen members the caller manages). 4 to 6 digits; weak patterns are refused (`isWeakPin`: one digit repeated, a run up or down by one, a shorter block repeated). Hashed with argon2id plus a server-side pepper derived from `BETTER_AUTH_SECRET`; never returned. `pin_hash` and `pin_disabled_at` are not declared to Better Auth at all, because its member reads ignore `returned: false` and handed every member's PIN hash to the whole organisation (security review F2).
  - **Switch.** `POST /v1/staff-devices/{id}/switch` with `{ memberId, pin }` is public (the tablet may have nobody signed in) and needs that device's own cookie. The attempt is counted in Valkey before the PIN is verified, with exactly one argon2id verification on every path, and every refusal is the same `403`. Limits: 5 failures in a row lock the PIN for 5 minutes (`429 PIN_LOCKED` with `Retry-After`); 15 in a day disable it until a manager sets a new one; 30 attempts per device per minute. Counter keys include a fingerprint of the PIN hash, so a manager's new PIN clears both the lock and the day's count. Without Valkey the switch is refused (`503`), never unlimited. A revoked device answers `403 DEVICE_REVOKED`. A successful switch first signs out whoever used the tablet before, then opens the PIN session through a small Better Auth plugin endpoint, and is audited as the member.
  - **PIN session.** 12 hours from creation, enforced on every request whatever Better Auth's sliding refresh would allow (a database hook also caps any update at the deadline). It is valid only with its own device's cookie, always in the device's organisation whatever the session row says, and with the member's staff or kitchen permissions only (ADR-025). A request without the device cookie ignores the session for that request without ending it, because the console's server renders pages with the session cookie alone; a session older than 12 hours, without a device, or on a revoked device is ended. Under `/v1/auth/*` a PIN session may only call `get-session` (never refreshed) and `sign-out`; everything else answers `403 PIN_SESSION_FORBIDDEN`. The bridge applies this whenever a request carries any `Cookie` header, using Better Auth's own reading of the session, because a check of our own let `name =value` past (security review F1).
  - Managers and owners never use PINs: they sign in normally (plan question 2).
- **Consequences.** The console has no device, PIN or switch screens yet; P2-T11 (team management) builds them on this API. A shared tablet must reach the API over HTTPS in production for the `__Host-` cookie.

## ADR-027 — Super admin · 2026-11-23 · Accepted

(Approved with the Phase 1 plan; written in the Phase 1 docs pass, as built.)

- **Context.** P1-T06 asks for an admin guard ("allowlisted email + 2FA verified within the session"), a `/v1/admin/*` skeleton and Bull Board at `/v1/admin/queues`. Better Auth's "remember this device" skips the second factor, so "two-factor enabled" alone would not prove a recent check.
- **Decision.**
  - A super admin is a user whose address is in `SUPER_ADMIN_EMAILS` (compared trimmed and lower-cased), verified, with two-factor on, on a session (never a PIN session) that carries a TOTP or backup-code check within the last 12 hours. A Better Auth hook stamps `twoFactorVerifiedAt` on the session after a successful `/two-factor/verify-totp` or `/two-factor/verify-backup-code`; a trusted-device sign-in skips those endpoints, so it carries no stamp. A stamp from more than a minute in the future is not trusted.
  - One pure function, `superAdminVerdict`, decides for the guard, Bull Board and `GET /v1/me` (`isSuperAdmin`), so the console's admin shell appears exactly when the API would allow it. Anyone else gets the same `403 FORBIDDEN` as any forbidden route (nothing says an admin area exists); an admin without a recent check gets `403 TWO_FACTOR_REQUIRED`.
  - `/v1/admin/orgs` lists, reads, suspends, reinstates and re-plans organisations. It uses the `app_admin` pool (`BYPASSRLS`, at most 4 connections, application name `radd-api-admin`), which only `AdminModule` provides, through `withAdmin`. Every action is audited as `super_admin` in the same transaction.
  - Bull Board (`@bull-board/fastify`, raw Fastify routes) sits behind the same verdict, refuses changes whose `Origin` is not the API's own, and audits every successful change as a platform entry with no organisation (ADR-031).
- **Consequences.** A super admin whose check is older than 12 hours must sign out and in again; there is no step-up page in the console yet. Bull Board loads its font from Google Fonts in the admin's browser (admin only; no diner data). The console's admin pages are still shells until P9-T03.

## ADR-028 — Outbox delivery: emit after commit, worker re-emits after 5 s · 2026-11-25 · Accepted

- **Context.** ARCHITECTURE §8 asks for a transactional outbox: every state change writes an `outbox_events` row in its own transaction, the API emits right after commit, and a worker re-emits anything not dispatched within 5 s. The Socket.IO gateway that delivers events to browsers is P4-T03, so in Phase 1 events reach Valkey only. The approved plan (ADR-022) also requires that the API role can never read another tenant's events, while the worker must sweep all of them.
- **Decision.**
  - `OutboxService.add(tx, { type, aggregate, rooms, payload })` writes a validated event in the current tenant transaction (`outboxEventInputSchema`: dotted lower-case types, only the rooms of ARCHITECTURE §8, payload at most 8 KB, since events are notifications and clients read the REST snapshot). `withTenant` gained `afterCommit`: queued work runs only after the commit, never after a rollback, and cannot turn a committed change into an error.
  - After commit the transaction's events are emitted in order through the `RealtimePublisher` port (`@radd/shared/realtime-publisher`, backed by `@socket.io/redis-emitter` 5.1.0 with its default `socket.io` key and MessagePack parser, which the P4 gateway's Redis adapter must match), then marked dispatched in a short tenant transaction. The first failure stops the batch so nothing overtakes it; the request still succeeds.
  - The emitter drops the promise of every Redis `publish`. The adapter hands it a client that records those promises and awaits them, so a refused message is seen (the row stays undispatched) instead of being marked sent and surfacing as an unhandled rejection.
  - Rooms are emitted only on their own namespaces: `session:*` on `/diner` and `/staff`, `restaurant:*:public` on `/diner`, `restaurant:*:staff|kitchen` and `org:*:imports` on `/staff`. The envelope is `{ eventId, type, aggregate, occurredAt, payload }`; `eventId` is the outbox row ID, so a re-emitted event has the same one and listeners de-duplicate (delivery is at least once).
  - The worker connects as `app_worker` through its own variable, `DATABASE_URL_WORKER` (locally one `.env` serves every app, and the worker must not hold the API's credential). `app_worker` has no privilege on `outbox_events`; two `SECURITY DEFINER` functions with a pinned search path, executable by `app_worker` only, do its work: `claim_outbox_events(min_age, max_events)` (`FOR UPDATE SKIP LOCKED`, oldest first, at most 500) and `mark_outbox_events_dispatched(ids)` (keeps an earlier timestamp).
  - `outbox.dispatch` runs on a BullMQ job scheduler every 5 s with one attempt (the next tick is the retry), claiming events at least 5 s old in batches of 200, up to 10 batches a run, each batch claimed, emitted and marked in one transaction. Its publisher has its own Valkey connection with a 1 s command timeout, so it never waits on Valkey while holding row locks. An event that can never be delivered (an unknown room or type, written past validation) is logged at error level, reported to Sentry and marked dispatched, so it cannot block every event behind it.
- **Consequences.** A mutation that emits waits for the publish; with Valkey down that adds up to about a second, and the worker delivers the event once Valkey is back. Dispatched rows accumulate until a retention job exists (`db.maintenance`, later). No Phase 1 mutation emits yet: nothing listens until P4, and the first producers arrive with P2 (for example `restaurant.settings_changed` in P2-T01). An undeliverable event is dropped loudly rather than retried forever.

## ADR-029 — Auth emails · 2026-11-15 · Accepted

(Approved with the Phase 1 plan; written in the Phase 1 docs pass, as built.)

- **Context.** P1-T04 sends sign-in and verification codes, password-reset codes and invitations, "through the `Mailer` interface (Mailpit locally, Resend later)". Resend and React Email are P9-T04. A code in a queue would sit in Valkey and show in Bull Board while still valid.
- **Decision.**
  - New package `packages/mail`: the `Mailer` interface, an SMTP adapter (nodemailer; Mailpit locally), an in-memory mailer for tests, and plain templates in English and Arabic (subject, text and minimal HTML with the reader's direction; user-written names are escaped). `createConfiguredMailer` picks the adapter from `MAIL_PROVIDER` and fails at boot, not at the first email.
  - **Codes are sent by the API directly**, never queued. The email's language follows the console's `x-radd-locale` header. The send happens after the response, and is skipped where a code would be pointless or would bypass two-factor (ADR-023).
  - **Invitations go through the `notify.email` queue** to the worker (job ID `invitation-<id>`, so one email per invitation even if Better Auth calls twice). An invitation lasts 7 days (`INVITATION_TTL_DAYS`), and inviting the same address again replaces the earlier one. The link opens `/accept-invitation/{id}` on the console; accepting needs the invited, verified address.
  - Logs carry only the recipient's domain, and SMTP error messages are redacted of the address and link.
- **Consequences.** If Valkey is down when someone is invited, the invitation row exists without its email (HANDOFF §10). Branded templates and the Resend adapter replace these in P9-T04 behind the same interface.

## ADR-030 — Console auth pages and role shells · 2026-11-15 · Accepted

(Approved with the Phase 1 plan; written in the Phase 1 docs pass, as built.)

- **Context.** P1-T04 asks for sign-up, verification, sign-in, forgot password, two-factor setup and onboarding in the console; the demo checkpoint needs role-based navigation. UX_SPEC has no design for these pages, and ADR-020 forbids pasting stock shadcn components.
- **Decision.**
  - Pages under `apps/console/src/app/(auth)`: `/sign-up`, `/verify-email`, `/sign-in` (password or emailed code, then the TOTP or backup-code step when two-factor is on), `/forgot-password`, `/reset-password`, `/two-factor` (turn two-factor on with a QR code and backup codes, or off), `/accept-invitation/[id]` and `/onboarding/organization` (step 0: name the organisation; the creator becomes owner).
  - Forms use `react-hook-form` with the zod schemas from `@radd/shared` and Better Auth's React client (base URL from the runtime public env, ADR-012). New hand-written primitives in `packages/ui`: Input, Label, Field, OtpInput, Alert and DropdownMenu, on the existing tokens.
  - Navigation shells by role: `(owner)` for owners and managers (menu, allergens, tables, team, insights, settings), `(staff)` (floor, bills), `(kitchen)` (kitchen) and `(admin)` for super admins (organisations, queues). Pages are placeholders until their phase. `session.server.ts` gates each shell on the server: signed-out visitors go to sign-in and come back afterwards, users without an organisation go to onboarding, and a member who opens another role's shell is sent to their own home.
  - Every string is in `messages/en.json` and `ar.json`; each page works in English and Arabic (RTL).
- **Consequences.** P2 replaces the placeholders and may restyle these pages once UX decides; the primitives are reusable. Browser tests cover sign-up and onboarding in both languages (`e2e/console.auth.spec.ts`) and each seeded role's navigation (`e2e/console.roles.spec.ts`); turning two-factor off has no browser test yet.

## ADR-031 — Audit log entries · 2026-11-25 · Accepted

- **Context.** SECURITY T8 and §2 want an append-only audit log of sensitive changes and every admin action; P1-T07 asks that each entry carry the actor, organisation, restaurant, request ID and a hashed client IP and be written in the transaction of the change. Some changes have no tenant transaction (onboarding, the public PIN switch, Bull Board's raw Fastify routes), and Better Auth writes some of them on its own connection.
- **Decision.**
  - `AuditService.record(entry)` writes in the current tenant transaction and refuses to run without one; `recordIn(tx, organizationId, entry)` writes in a transaction the caller holds (the admin pool's for `/v1/admin/*`); `recordPlatform(entry, origin)` writes an entry with no organisation in its own transaction with no tenant set, which the `audit_append` policy allows only for such entries.
  - The actor is the super admin on `@RequireSuperAdmin` routes (`super_admin`), else the member or signed-in user (`user`), else `system`. The public PIN switch names the member whose PIN matched; Bull Board passes its super admin, request ID and IP explicitly.
  - `ip_hash` is HMAC-SHA256 of the client IP (already grouped to /64 for IPv6) keyed with `ACTOR_HASH_SECRET` and labelled `audit-ip:`, so it never equals a rate-limit key fragment. The raw address is never stored.
  - `before` and `after` are what the service chooses to pass; as a backstop, fields named like credentials, codes, cookies, payment references or addresses are replaced with `[redacted]` at any depth, as is any string equal to the request's client IP.
  - Onboarding's `organization.create` is written in a short transaction of the new tenant after Better Auth has committed the organisation. Bull Board changes live in Valkey, so their entry follows the change after the response; a failed write is logged.
- **Consequences.** Entries for tenant changes made by our own repositories roll back with the change. Where Better Auth writes on its own connection (organisation create and rename, invitations), the entry and the change are separate commits: a failure between them leaves the change without an entry. Sign-in and sign-out are not audited yet; the service supports platform entries for them when that is wanted.

## ADR-032 — Unused optional peers are removed from installs (`.pnpmfile.cjs`) · 2026-11-15 · Accepted

(Written in the Phase 1 docs pass.)

- **Context.** pnpm links an optional peer dependency whenever that package exists anywhere in the workspace. `better-auth` lists every framework it can integrate with, so the API's production install pulled in Next.js, Vitest (with Vite and jsdom) and drizzle-kit: the API image went from about 130 MB to 530 MB and failed the 250 MB check (Docker runs 24 to 28). Later, `valibot` (through Bull Board's API) linked TypeScript for its type definitions only, adding 23 MB.
- **Decision.** A `readPackage` hook in `.pnpmfile.cjs` deletes those peer edges: `next`, `vitest` and `drizzle-kit` from `better-auth` and every `@better-auth/*` package, and `typescript` from `valibot`. React stays, because the console's auth client needs it. The list is explicit; nothing else is removed.
- **Consequences.** The API's production install is 193 MB raw (the image prunes source maps and types), and all four images stay under 250 MB. If one of those packages ever needs a removed peer at runtime, it fails at import; the Docker job's health check would catch it. After adding a dependency to the API or worker, check the production install size (HANDOFF §7).

## ADR-033 — The demo seed: deterministic, idempotent, and strict about what it confirms · 2026-11-26 · Accepted

- **Context.** P1-T08 asks for `pnpm db:seed`: Beit Tayta exactly as SEED_DATA describes, deterministic IDs, and a second run that changes nothing. Later safety tests and AI evals depend on its allergen statuses. SEED_DATA leaves some things open: the super admin's password, whether the side (G2) and sugar (G5) options have a confirmed allergen impact, what the table 9 demo session holds, and the people's names. It also says the seed publishes version 1 and adds two photos, which need P2-T08 and P2-T02.
- **Decision.**
  - **IDs.** Every row has a UUIDv7-shaped ID derived from its kind and key (timestamp 2026-01-01 09:00 UTC, the rest from SHA-256), exported as `SEED_IDS` / `seedIds` from `@radd/db/seed`. Confirmations carry the same fixed time, so the "confirmed on" stamp never moves.
  - **Idempotent writes.** `INSERT … ON CONFLICT DO UPDATE … WHERE (row) IS DISTINCT FROM (excluded)`: a row is updated only when it differs, so `updated_at` triggers never fire on a second run. Password and PIN hashes and the encrypted TOTP secret are kept when they still verify, since a new salt or nonce would change them every time. A table keeps its first QR token. What someone changed in a seeded row is put back; rows the seed does not know are left alone.
  - **Roles.** Tenant rows are written as `app_runtime` inside `withTenant`, so Row Level Security checks every row; only the subscription uses `DATABASE_URL_ADMIN` (the runtime role may not write plans, ADR-021). Seeded rows bypass the API, so they leave no audit entries or outbox events.
  - **Secrets.** The seed needs the API's `BETTER_AUTH_SECRET`: the staff PIN `1234` is hashed with the API's pepper scheme (written directly, although the API would refuse it as a weak PIN), and the super admin's TOTP secret is derived from it with HKDF and stored encrypted the way Better Auth does (`better-auth/crypto`, a dev dependency of `@radd/db`). QR tokens are an HMAC under the same secret, so a staging demo's tables cannot be joined by someone who has read this repository.
  - **Environments.** It refuses `APP_ENV=production`. The super admin `admin@radd.test` (password `DemoAdmin!2026`, following the pattern of the others) is created only in `local` and `test`.
  - **Safer-for-diners defaults where SEED_DATA is silent.** G2 (fries, salad) and G5 (sugar) options add no allergens but are **not** confirmed: SEED_DATA states a confirmation for G1 and G4 only, and an impact nobody confirmed is not confirmed. The restaurant stays `draft` (invisible to diners) until a menu is published in P2-T08; until then the seed prints "publish pending", and "images pending" until P2-T02.
  - **Demo sessions.** `--with-session` opens table 5 with the worked example of GROUP_ORDERING §7.5 (Rami, Nour, Karim; subtotal $49.50; round 1 accepted by the staff user) and table 9 with Lina and Omar and a pending round (falafel; kafta with salad; ayran). A table that already has another live session is skipped, not taken over.
  - **Conflicts.** If the database already has an account, organisation or restaurant with a seeded email or slug that the seed did not create, it stops and says so instead of merging into it.
- **Consequences.** Tests and later tasks can name seeded rows by ID. Re-seeding restores the documented demo state, including allergen statuses someone changed by hand. The side and sugar options show "allergen impact not confirmed" to diners until the owner says otherwise. P2-T08 must make the seed call the publish service and set the restaurant live; P2-T02 must add the photos.

## ADR-034 — Per-address limits on sign-in codes and passwords · 2026-11-26 · Accepted

- **Context.** The security review of Phase 1 (`docs/SECURITY_REVIEW_P1.md`, M1 and M2) proved that sign-in was limited per client IP only: 12 code requests from 12 IPs put 12 codes in one inbox, and 15 wrong passwords from 15 IPs were never slowed. IPv6 makes IPs cheap (one /48 holds 65 536 of the /64 buckets ADR-016 uses). A code sign-in needs no password, so unlimited codes also mean slow guessing of a password-only account. The owner approved the recommendation on 2026-11-26.
- **Decision.**
  - The auth bridge (`apps/api/src/auth/address-limits.ts`, `auth.fastify.ts`) keys two limits by the address the request body names, lower-cased and trimmed, HMAC'd with `ACTOR_HASH_SECRET` before it reaches Valkey.
  - **Codes:** at most 5 code emails an hour per address across `/email-otp/send-verification-otp` and `/email-otp/request-password-reset`, after the per-IP cap of 10 per 15 minutes. Sign-up needs no cap: it emails a code only the first time an address is used.
  - **Passwords:** each `401` from `/sign-in/email` counts a failure; the 10th within 15 minutes pauses password sign-in for that address for 15 minutes and clears the count; a `200` clears it too. While paused every attempt, the right password included, answers `429` with `Retry-After`, so the pause cannot tell a guesser they found it. Two-factor codes already lock the account after 10 failures (Better Auth's own lockout).
  - Both apply the same way to addresses with and without an account, and answer with the same `429` body as the per-IP limits, so neither reveals whether an account exists.
  - The pause fails closed like the auth limiter: if Valkey cannot be read, password sign-in answers `429`.
  - `AuthModule` options `codeRequestLimit` (both code caps) and `signInLockout` let tests turn them off; both are on by default.
- **Consequences.** Anyone who knows an address can keep its owner from signing in by password for up to 15 minutes at a time, and from receiving codes for up to an hour; the owner accepted this trade. Code sign-in (`/sign-in/email-otp`) is not paused by wrong passwords, so a paused user can still get in by code while their codes last. Support may need to explain the pause; it ends by itself.
