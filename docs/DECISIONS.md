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
- **Decision.** Phase PRs target the default branch. Workflows never hard-code a branch name: image pushes and deploy steps run when `github.ref` equals `refs/heads/<default branch>`.
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
- **Decision.** The Next servers parse the browser-safe schema (`@radd/config/env` `loadPublicEnv`) at request time and pass the object to client components through a provider. Client code never reads `process.env`. The `NEXT_PUBLIC_` prefix now only marks a variable as safe to expose. Server-only variables are validated at server start (`instrumentation.ts`), not during `next build`, so images build without secrets.
- **Consequences.** One image per app serves every environment. Pages that render the provider are dynamic; P3 revisits caching for diner menu routes. CI greps the client bundles for sentinel secret values (P0-T08).

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
  - Sampling is decided by us, never by the client, and returned as 0 or 1: returning a rate would let a client force tracing, because the SDK compares it against a random number taken from the client's `baggage`. One decision per incoming request covers all of that request's root spans (a Next.js request has several). It is an HMAC of the request's `x-request-id` keyed with `TRACE_SAMPLING_SECRET`, shared by the API and both Next servers. So a page request and the API calls it forwards its ID on are kept or dropped together, and a client choosing its own IDs cannot predict the outcome. Work without a request (worker jobs) draws locally. Kept spans report a sample rate of 1: Sentry does not extrapolate throughput counts, while percentiles are unaffected.
  - The API reports 5xx only, tagged with the request ID and route. The worker reports a job's final failure only (retries are expected) and never attaches job data.
  - The Next apps capture server errors with `onRequestError`. The browser SDK is a separate chunk loaded only when a DSN is configured, reports errors only and never traces, which keeps the diner's initial JavaScript within budget (UX §10).
  - Server traces are off by default (`SENTRY_TRACES_SAMPLE_RATE=0`); raising it is an operations decision.
  - Browser source maps are uploaded only by default-branch image builds when the `SENTRY_AUTH_TOKEN` secret exists. The token is a BuildKit secret, never a build argument, and maps are deleted after upload. A failed upload fails the build, so a layer without maps is never cached. The Nest apps upload none: `--enable-source-maps` maps their stack traces before Sentry reads them. Sentry releases are created at deploy time (DEPLOYMENT §5).
  - Request IDs: the Next servers and the API give every request its `x-request-id` (a valid incoming UUID, else a fresh UUIDv7) the moment Node starts handling it (`assignRequestIds` in `@radd/shared/node`), before Sentry copies the headers, so spans and events carry it. `proxy.ts` keeps it and sets it on the response, and `serverApiClient()` forwards it to the API, which keeps it too.
  - The API and worker exit when start-up fails. With Sentry initialised, its unhandled-rejection handler would otherwise log the failure and leave a process with no listener.
- **Consequences.** Sentry issues carry no user context, so they cannot be grouped by diner. Browser errors thrown before the SDK chunk loads are missed. A new route or URL that carries a secret in its path must add a pattern to `@radd/config/logging`, which logs and Sentry share. SDK upgrades can change what an option means without a type error, so the real-SDK tests in `@radd/config` (browser event and session, a traced HTTP request) must pass before a Sentry upgrade merges.
