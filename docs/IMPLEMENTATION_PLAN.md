# IMPLEMENTATION PLAN — Radd Menu

## How to use this plan

**Order.** Work strictly in order: Phase 0 → Phase 10. Each task has the following parts:

- **Do**: what to build. The detailed specs are referenced, not repeated.
- **Accept**: acceptance criteria. Every item must be true before the task counts as done.
- **Test**: the tests you must write.

**Phase end.** Each phase ends with a **Demo checkpoint** for the owner. Open the phase PR, include the demo steps in it, and update `docs/PROGRESS.md`.

**Size.** Each task is roughly 0.5–2 days for an agent. If a task grows beyond that, split it into sub-tasks `PX-TYY.a`, `.b`, and so on, and record the split in PROGRESS.md.

**Spec references.**

| Short name | File |
|---|---|
| PRD | docs/PRD.md |
| ARCH | docs/ARCHITECTURE.md |
| DM | docs/DATA_MODEL.md |
| API | docs/API.md |
| GO | docs/GROUP_ORDERING.md |
| AI | docs/AI_ARCHITECTURE.md |
| AS | docs/ALLERGEN_SAFETY.md |
| UX | docs/UX_SPEC.md |
| SEC | docs/SECURITY.md |
| TEST | docs/TESTING.md |
| DEP | docs/DEPLOYMENT.md |
| SEED | docs/SEED_DATA.md |

---

## PHASE 0 — Foundation

Goal: a monorepo with all four apps running locally, quality gates in place, and green CI.

### P0-T01 Monorepo scaffold

**Do:**
- pnpm workspaces, Turborepo, Node 24 LTS (`.nvmrc`, `engines`), TypeScript 5.x strict.
- `packages/config` with:
  - tsconfig bases (`base`, `nextjs`, `nest`, `library`);
  - ESLint flat config (typescript-eslint strict, import order, no-floating-promises, react-hooks, jsx-a11y for UI);
  - Prettier.
- lefthook (or husky) + lint-staged.
- commitlint (Conventional Commits).
- `.editorconfig`, `.gitignore`, `README.md` (dev quickstart).
- Renovate config: group minor/patch updates weekly; pin exact versions.

**Accept:**
- `pnpm install && pnpm lint && pnpm typecheck` pass on the empty skeleton.
- Commit hooks run.

**Test:** CI runs lint and typecheck.

### P0-T02 Env configuration

**Do:**
- `packages/config/env`: a zod schema per app (api, worker, diner, console), built from `.env.example`.
- `loadEnv(appName)` fails fast with a readable list of missing or invalid variables.
- Next.js apps: only `NEXT_PUBLIC_*` variables reach the client, enforced by the schema split.

**Accept:**
- Starting any app with a required variable missing exits with a clear message.
- Secrets never reach client bundles (verified by grepping the build output in CI).

**Test:** unit tests for the schema parsing.

### P0-T03 Local infrastructure

**Do:** `infra/docker-compose.dev.yml` with:
- `pgvector/pgvector:pg17` (extensions pg_trgm, unaccent, citext, vector created by the init SQL);
- `valkey/valkey:8`;
- `minio` with buckets `radd-assets`, `radd-private` created by an init container, plus CORS for presigned PUT;
- `mailpit`.

Scripts: `pnpm dev:infra` and `pnpm dev:infra:down`.

**Accept:** `pnpm dev:infra` brings all services up healthy. The MinIO console and Mailpit UI are reachable.

### P0-T04 API skeleton (NestJS + Fastify)

**Do:**
- `apps/api` with the Fastify adapter and Node `--enable-source-maps`.
- Global pieces:
  - request-id (UUIDv7, `x-request-id` in and out);
  - pino logger (pretty in local, JSON elsewhere);
  - nestjs-zod pipe;
  - problem+json exception filter with a stable `code` (`packages/shared/errors.ts`);
  - Helmet;
  - CORS allowlist;
  - `@nestjs/throttler` with Valkey storage;
  - idempotency interceptor (Valkey, 24 h; see API §1).
- Health module: `/v1/health/live`, `/v1/health/ready` (pings DB, Valkey and BullMQ).
- OpenAPI via `@nestjs/swagger` + nestjs-zod at `/v1/docs` (not in production).
- `pnpm openapi` writes `packages/api-client/openapi.json`.

**Accept:**
- Health endpoints work.
- Unknown routes return problem+json 404.
- A thrown `DomainError('ITEM_UNAVAILABLE')` maps to 409 with the correct body.
- Repeating a POST with the same `Idempotency-Key` returns the cached response.

**Test:** integration tests for the filter, idempotency (same key twice; same key with a different body → 422) and health.

### P0-T05 Worker skeleton

**Do:**
- `apps/worker` as a Nest standalone app.
- BullMQ connection and a queue registry (names from ARCH §5) in `packages/shared/queues.ts`, with typed job payloads (zod).
- Graceful shutdown (drain).
- Heartbeat key in Valkey and an HTTP probe on 4100.
- Bull Board UI mounted in the **api** at `/v1/admin/queues`, super-admin only (built in P1).

**Accept:**
- A sample `noop` job enqueued from the API is processed.
- A failing job retries with exponential backoff (3 attempts) and lands in failed state.

**Test:** integration test with Testcontainers Valkey.

### P0-T06 Next.js app skeletons

**Do:**
- `apps/diner` and `apps/console`: Next.js 16 App Router, React 19, Tailwind v4, `output: 'standalone'`.
- next-intl with `en` (default, LTR) and `ar` (RTL), resolved per ADR-009 (cookie → restaurant default → `en`; no `Accept-Language`). The `<html lang dir>` come from the locale. Message catalogs in `messages/{en,ar}.json` (+ `fr.json` stub).
- Fonts via `next/font`: diner uses Readex Pro; console uses IBM Plex Sans Arabic + IBM Plex Sans.
- `packages/ui`: shadcn/ui initialised in the package (Radix), design tokens as CSS variables (UX §3–4), a ThemeProvider that maps a restaurant theme to CSS variables, and primitives: Button, Sheet, Tabs, Chip, Price, Avatar, Skeleton, Toast.
- `packages/api-client`: openapi-fetch client factory (base URL from env, `credentials: 'include'`), a TanStack Query provider, and a socket.io-client factory with typed events.

**Accept:**
- `pnpm dev` runs api :4000, worker, diner :3000 and console :3001.
- The diner home renders "Radd Menu" in English LTR by default (even when the browser prefers Arabic) and in Arabic RTL after switching language.
- A dark-mode token switch works in the console.

**Test:** Playwright smoke: both apps load in `en` by default and in `ar` after switching; `dir` is correct.

### P0-T07 Testing harness

**Do:**
- Vitest workspace config.
- Testcontainers helpers: `startPostgres()` (applies migrations) and `startValkey()`.
- Playwright config with projects `mobile-ar` (360×780, `ar`), `mobile-en` (Pixel 7, `en`) and `tablet-console` (1024×768), plus axe integration.
- Lighthouse CI config (diner).

**Accept:** `pnpm test`, `pnpm test:int` and `pnpm test:e2e` all run (with placeholder tests).

### P0-T08 CI pipeline

**Do:** GitHub Actions per TEST §6. Required jobs: lint, typecheck, test, test-int, build, e2e-smoke. Also:
- gitleaks;
- `pnpm audit --audit-level=high`;
- CodeQL workflow;
- Docker build for each app (multi-stage, non-root, per DEP §2), pushed to GHCR on `main`.

**Accept:** CI is green on the PR. Images are pushed on merge, tagged `sha-xxxx` and `staging`.

### P0-T09 Observability bootstrap

**Do:**
- Sentry SDK in all four apps, env-gated by DSN; release = `GIT_SHA`; source maps uploaded in CI.
- Log redaction config for pino (authorization, cookie, set-cookie, token, otp, pin).
- Request IDs propagate from the Next.js server to the API via a header.

**Accept:**
- A test error appears in Sentry when a DSN is set.
- Logs never include cookies (unit test on the redaction config).

### P0-T10 Docs scaffolding

**Do:**
- Create `docs/PROGRESS.md` entries for P0.
- Write ADR-001…ADR-00N in `docs/DECISIONS.md` for any deviation.

**Demo checkpoint P0:**
- Repo cloned → `pnpm i && pnpm dev:infra && pnpm dev` → both apps load.
- CI is green.
- GHCR images exist.

---

## PHASE 1 — Data model, auth, tenancy

### P1-T01 Drizzle setup

**Do:**
- `packages/db`: drizzle-orm + drizzle-kit, the `pg` driver (node-postgres) with a pool.
- Helpers:
  - `uuidv7()` id;
  - `timestamps()`;
  - `softDelete()`;
  - `localizedText()` column type (JSONB + zod);
  - `money()` (integer).
- Schema files grouped by domain (`auth.ts`, `restaurants.ts`, `menu.ts`, `tables.ts`, `sessions.ts`, `billing.ts`, `ai.ts`, `analytics.ts`, `platform.ts`).
- Scripts: `db:generate`, `db:migrate`, `db:studio`.

**Accept:** an empty migration generates and applies on local Postgres.

### P1-T02 Full schema

**Do:**
- Implement every table, enum, index, check and partial unique index in DM §1–10.
- `menu_events` is created as a partitioned parent with the initial monthly partitions (current month plus the next 2).
- An immutable `f_unaccent()` wrapper for search columns.

**Accept:**
- Migrations apply cleanly on an empty DB and are reversible in dev (drizzle drop + reapply).
- A schema snapshot test fails if a migration was not generated.

**Test:** integration tests for:
- the one-live-session-per-table constraint;
- the participant unique (session, device) constraint;
- the share PK;
- check constraints (quantity, note length, price ≥ 0).

### P1-T03 DB roles and Row Level Security

**Do:**
- Hand-written SQL migration creating the roles `app_migrator` (owner), `app_runtime` and `app_admin` (`BYPASSRLS`), with grants.
- Enable RLS on every tenant table, with the policy:

  ```sql
  USING (organization_id = current_setting('app.org_id', true)::uuid)
  WITH CHECK (same)
  ```

- Public read policies:
  - `menu_versions` rows referenced by a live restaurant's pointer are readable when `current_setting('app.public', true) = 'on'`;
  - the same for `restaurants` public columns via a dedicated SQL view `public_restaurants`.
- Helpers:
  - `withTenant(orgId, fn)` — transaction + `SET LOCAL app.org_id`;
  - `withPublic(fn)` — `SET LOCAL app.public='on'`;
  - `withAdmin(fn)` — separate pool using `app_admin`.
- `BaseTenantRepository` requires an org context and is used by every repository.

**Accept:**
- With `app_runtime`, a query without `withTenant` returns zero rows from tenant tables.
- Org A cannot read or write Org B rows even with crafted IDs.

**Test:** a generated test runs for every tenant table: insert as A, read and update as B → 0 rows / 0 affected (TEST tenancy).

### P1-T04 Better Auth

**Do:**
- Mount Better Auth in the API at `/v1/auth/*` (Fastify handler) with:
  - Drizzle adapter;
  - email + password (argon2id);
  - email OTP plugin (sign-in and verification) through the `Mailer` interface (Mailpit locally, Resend later);
  - organization plugin with roles `owner`, `manager`, `staff`, `kitchen` and access-control statements mirroring `permissions.ts`;
  - twoFactor plugin (TOTP).
- Cookies on the parent domain. Trusted origins from env.
- Run `npx @better-auth/cli generate` and reconcile the output with the Drizzle schema (DM §2 additional fields).
- **Console pages:**
  - sign up (name, email, password);
  - verify email (OTP);
  - sign in (password or OTP);
  - forgot password;
  - 2FA setup.
- **Onboarding step 0:** create an organisation (name). The current user becomes owner.

**Accept:**
- Full sign-up → verify → create org → sign out → sign in works on staging-like config.
- Invite flow works through Mailpit.

**Test:** integration tests for the auth flows. E2E: sign up and create an org (`ar` + `en`).

### P1-T05 Authorisation layer

**Do:**
- `packages/shared/permissions.ts`: actions × roles matrix (PRD + GO §6). Includes `assertCan(actor, action, resource)`.
- Nest pieces:
  - `@CurrentActor()`;
  - `RestaurantScopeGuard`, which resolves `:rid` → org, checks membership, and sets the tenant context (via AsyncLocalStorage + `withTenant` per request);
  - `@RequirePermission(action)` decorator.

**Accept:** every console route declares a permission. CI lint rule (custom ESLint or a unit test scanning Nest metadata) fails on undecorated routes.

**Test:** table-driven authZ matrix test (SEC §3).

### P1-T06 Super admin and staff devices

**Do:**
- Admin guard: allowlisted email + 2FA verified within the session.
- `/v1/admin/*` skeleton. Bull Board at `/v1/admin/queues`.
- `staff_devices` registration: a manager registers a device and receives a one-time token, stored as an HttpOnly device cookie on the console origin.
- PIN switch endpoint (argon2id hash, 5 attempts → 5-minute lockout).

**Accept:**
- A non-admin gets 403.
- PIN switching creates a 12 h session limited to staff/kitchen permissions of that member.

**Test:** integration tests for the guard, PIN lockout and device revoke.

### P1-T07 Audit and outbox services

**Do:**
- `AuditService.record({ action, entityType, entityId, before, after })`, automatically enriched with actor, org, restaurant, requestId and ipHash.
- `OutboxService.add(tx, { type, aggregate, rooms, payload })` inside the same transaction. A `publishAfterCommit` hook emits to Socket.IO. The worker job `outbox.dispatch` re-emits rows not dispatched within 5 s.

**Accept:** audit rows are written in the same transaction as the change. Outbox rows are marked dispatched.

**Test:** integration tests, including a simulated crash between commit and emit (the outbox worker re-emits).

### P1-T08 Seed

**Do:**
- `pnpm db:seed` implementing SEED fully: org, users, restaurant, settings, areas, tables, stations, modifier groups, items, ingredients, allergen rows with confirmations as specified, FAQ.
- Deterministic IDs. Idempotent.
- `--with-session` flag.
- Publishing v1 is done by calling the publish service once P2-T08 exists; until then the seed prints "publish pending".

**Accept:** running the seed twice gives the same state, with no duplicates.

**Demo checkpoint P1:**
- Sign up as a new owner and create an org.
- Log in as the seeded owner, manager and staff users and see the role-based navigation (empty pages are fine).
- RLS tests are green.

---

## PHASE 2 — Restaurant setup and menu management (console)

### P2-T01 Restaurant settings

**Do:**
- **Console:** Settings with sections Profile (names AR/EN/FR, description, address, phone, WhatsApp, Instagram, logo, cover, hours), Languages, Currency & charges, Ordering, Theme.
- **API:** `PATCH /restaurants/{rid}` and `PUT …/exchange-rate` (writes history and emits `restaurant.settings_changed`).
- **Theme editor:**
  - preset picker with a live preview (mini diner mock);
  - primary colour picker with an automatic contrast check — warn if the AA contrast for `onPrimary` fails, and auto-pick black or white for `onPrimary`.
- **Slug:** editable once, with an availability check.

**Accept:**
- All settings persist and validate (e.g. rounding step ∈ {0, 1000, 5000, 10000}; bps 0–3000).
- Rate history is recorded.

**Test:** API integration tests. E2E settings form in `ar`.

### P2-T02 Assets pipeline

**Do:**
- `ObjectStorage` interface with an S3 implementation (`@aws-sdk/client-s3` + presigner) for MinIO and R2.
- `POST /assets/presign`: enforce type and size limits (images ≤ 10 MB jpeg/png/webp/heic; pdf ≤ 20 MB; xlsx/csv ≤ 5 MB).
- `complete` endpoint → `image.process` job:
  - sharp: auto-orient, strip metadata;
  - variants 320/640/1280 in AVIF + WebP;
  - thumbhash;
  - validate magic bytes;
  - mark the asset `ready`.
- Console upload component with drag-drop, camera capture (`accept="image/*" capture`), progress bar and preview.

**Accept:**
- A 12 MP phone photo becomes variants under 150 KB at 640 w (AVIF).
- A spoofed MIME type is rejected.

**Test:** unit (variant naming), integration (job with a fixture image), security (polyglot rejected).

### P2-T03 Categories

**Do:**
- CRUD, drag-reorder (dnd-kit, keyboard accessible), visibility toggle, schedule editor (days + time ranges), kitchen station select.
- Delete is a soft delete, blocked if items exist (offer "move items to…").

**Accept:** reordering persists; RTL drag works.

**Test:** API integration. E2E reorder.

### P2-T04 Items (menu editor)

**Do:**
- **Item list per category:**
  - thumbnail, name, price inline-editable;
  - a quick "Available today" switch (86);
  - visibility;
  - badges: "Allergens need review", "Missing translation".
- **Item drawer tabs:** Basics (names/descriptions per locale, category, tags, diets, spice, calories, prep minutes, station, photo) · Prices (base or variants list) · Ingredients · Allergens (P2-T07) · Options (P2-T05) · Visibility (schedule) · Translations (side-by-side view, "machine" badge).
- **Bulk actions:** move, hide/show, 86/un-86.
- **Validation:**
  - name required in the restaurant default locale;
  - price > 0 unless the item is tagged free;
  - variants: names unique and exactly one default.
- `content_version` bump on diner-visible change.

**Accept:**
- An owner can build the full Beit Tayta menu by hand on a 360 px phone.
- Every change is audited for price and availability.

**Test:** API integration (validation cases). E2E create/edit item in `ar`.

### P2-T05 Modifier groups and options

**Do:**
- CRUD for groups (min/max) and options (price delta, default, availability, `adds_allergens` with a separate "Confirm allergen impact" action).
- Attach groups to items (ordered).
- Changing an option's `adds_allergens` clears that option's confirmation **and** invalidates the allergens of attached items (AS §3.5).

**Accept:** min/max validation (max ≥ 1, max ≥ min, at most one default when max = 1).

**Test:** unit (rule validation) + integration (invalidation cascade).

### P2-T06 Ingredients

**Do:** an ordered list per item with localized names, `is_key` and `is_removable`. Replacing the list invalidates allergens.

**Accept / Test:** the invalidation test.

### P2-T07 Allergen workflow and matrix

**Do:** implement AS §3 completely:
- per-item allergen panel (14 rows, 4-state segmented control, suggestion chips, owner note);
- the "Confirm allergens" modal with acknowledgement;
- the invalidation rules;
- the matrix page (filters, bulk set per column for selected rows, per-row confirm, counters);
- audit of every confirmation with before and after.
- **Suggestions source:** a stub service returning nothing until P6.

**Accept:**
- Confirm is impossible until all 14 are explicitly set.
- Every invalidating change flips `allergens_need_review`.
- The matrix works with keyboard and touch, in RTL.

**Test:** unit + integration per AS §6. E2E: confirm a dish, edit its ingredients → "Needs re-confirmation".

### P2-T08 Preview and publish

**Do:**
- `SnapshotBuilder`: builds DM §11 from the DB, applying **diner status = confirmed ? status : unknown**, excluding suggestions and hidden items, and assigning tokens D1..Dn and G1..Gn.
- `buildAiContext()` per AI §B4. Leave a stub for the token count.
- **Publish:**
  - validates;
  - computes stats and a diff against the previous version (added, removed, price changes);
  - inserts `menu_versions`;
  - updates the pointer;
  - invalidates Valkey;
  - calls the diner revalidate webhook (secret);
  - emits `menu.published`.
- **Preview:** `GET …/preview-snapshot` renders in the diner app at `/preview/{token}` (signed, 1 h).
- **Console:** a "Publish" button with a stats summary and warnings (AS §3.9).

**Accept:**
- Seed publish creates v1.
- Editing a price and publishing creates v2.
- The old version URL still serves v1 (immutable).

**Test:** unit (snapshot builder rules; AI context excludes allergen statuses). Integration (publish flow).

### P2-T09 Live availability

**Do:**
- `PATCH /items/{id}/availability` updates the DB and the Valkey set `avail:{rid}:unavailable` and emits `menu.availability_changed` to `restaurant:{rid}:public`. No republish is needed.
- `GET /public/restaurants/{id}/availability` endpoint.
- Option availability works the same way.

**Accept:** the toggle reflects on a diner page within 2 s.

**Test:** integration (socket event received).

### P2-T10 Tables, areas and QR printing

**Do:**
- CRUD for areas and tables. `qr_token` = 12-char base58 from crypto random, retried on collision.
- Regenerate token with a confirm dialog warning that "Old printed codes will stop working".
- `GET /tables/{id}/qr.svg` (qrcode lib, error correction M, quiet zone).
- `qr.pdf` via @react-pdf/renderer:
  - A6 tent: logo, restaurant name, table label (large), QR, short URL `m.<domain>/t/{token}`, bilingual line «امسح الرمز لتصفّح القائمة والطلب» / "Scan to see the menu & order", "Powered by Radd" (small);
  - A4 4-up layout.

**Accept:** printed codes scan reliably from 40 cm on a phone camera (manual check). The PDF embeds Arabic fonts correctly (Readex Pro).

**Test:** unit (token generator entropy and format). Integration (PDF generation returns a valid PDF with N pages).

### P2-T11 Team management

**Do:**
- Members list, invite by email with a role, change role, remove.
- Set a staff PIN.
- Staff devices list with register and revoke.

**Accept:** an invited staff member signs up via the link and lands in the staff view.

**Test:** E2E invite flow (Mailpit).

**Demo checkpoint P2:**
- Owner completes settings, edits the Beit Tayta menu on a phone, confirms allergens for 3 dishes, sees the "needs re-confirmation" flip after editing ingredients, prints the QR PDF, and publishes v2.

---

## PHASE 3 — Diner menu PWA

### P3-T01 Routing and data loading

**Do:**
- Routes per ARCH §5.
- `/t/[qrToken]`: a server component fetches `GET /public/tables/{qrToken}` then the snapshot by version, with Next.js fetch cache tags `menu:{rid}` and revalidate-on-webhook.
- Error pages for TABLE_NOT_FOUND, TABLE_INACTIVE, suspended and closed-now (UX §6.8).
- `/r/[slug]` is browse-only.
- `/api/revalidate` route protected by a secret header.

**Accept:**
- TTFB < 300 ms from cache.
- The page works with JavaScript disabled for browsing: categories and dishes are server-rendered, and sheets fall back to dish pages.

**Test:** E2E for all error states.

### P3-T02 Menu layout and theming

**Do:** implement UX §6.1–6.2:
- header, status line (open/closed computed in the restaurant timezone, including past-midnight hours);
- language switch;
- sticky category tabs with scroll-spy (IntersectionObserver);
- dish rows;
- the unavailable state;
- footer with rate disclosure and links.
- Theme: preset → CSS variables, primary override, dark preset.

**Accept:** pixel-check against UX in `ar` and `en` at 360 px. No layout shift on font load (CLS < 0.05).

**Test:** Playwright visual snapshots. Unit for `isOpenNow()`.

### P3-T03 Money formatting

**Do:**
- `packages/shared/money`:
  - `format(minor, currency, locale)`;
  - `toSecondary(minorUsd, rate, step, mode)`;
  - `roundStep`;
  - parse helpers.
- Western digits by default. LBP shows no decimals.
- The `Price` component shows base currency on top and secondary below.

**Accept:**
- USD 650 → "$6.50".
- At rate 89,500 with step 5,000 nearest → "580,000 ل.ل." (ar) and "580,000 LBP" (en). (6.50 × 89,500 = 581,750, which rounds to 580,000.)

**Test:** unit + property tests (monotonic, idempotent rounding).

### P3-T04 Dish sheet

**Do:** implement UX §6.3:
- option groups with min/max validation, live price, ingredients with the removable flag;
- the allergen section (AS §4) rendered from the snapshot;
- CTA state machine (joined / not joined / browse-only);
- deep-link route `/r/[slug]/d/[dishId]`;
- the back gesture closes the sheet (history state).

**Accept:**
- Required option groups block "Add" until satisfied.
- Unconfirmed allergens display exactly per AS.
- Screen reader announces the sheet title.

**Test:** unit (option validation shared with the API). E2E (Beit Tayta Fattoush + G1; Vine leaves "not confirmed").

### P3-T05 Search and filters

**Do:**
- `packages/shared/search` normaliser (AI §B10) used client-side over the snapshot.
- Filters:
  - diets;
  - exclude allergens, with the confirmed-free vs not-confirmed grouping (AS §4);
  - max price;
  - spice.
- Results list with match highlighting.

**Accept:**
- "fatoush", "فتوش", "fattouch" and "salata" all find Fattoush.
- Excluding tree_nuts never lists Muhammara or Kibbeh, and lists Vine leaves under "Not confirmed".

**Test:** unit (normaliser cases ≥ 60, including Arabizi). E2E for filters.

### P3-T06 PWA and offline

**Do:**
- Serwist:
  - precache shell and fonts;
  - runtime caching: snapshot JSON (StaleWhileRevalidate), images (CacheFirst, 200 entries, 7 days), API availability (NetworkFirst, 3 s timeout);
  - offline fallback page that renders the last cached menu for the last visited restaurant.
- Offline banner via `navigator.onLine` plus a fetch heartbeat.
- Dynamic manifest per restaurant (name, theme colour, icon from logo) — optional; no install prompts.

**Accept:** in airplane mode after one visit, the menu and dish sheets still work. Ordering buttons are disabled with a message.

**Test:** Playwright offline emulation.

### P3-T07 Analytics client

**Do:**
- `track(event)` buffers events in memory and localStorage. They are sent via `navigator.sendBeacon('/v1/public/events')` every 10 s and on `visibilitychange`. Max 50 per batch.
- Events (DM `menu_events.type`): scan (once per session/day), menu_view, category_view, dish_view, search (normalised query only), filter, add_to_cart, send_round, chat_open, chat_message, waiter_call, bill_view, receipt_view.
- API ingest endpoint (validated) → Valkey stream → `events.flush` job batch-inserts.

**Accept:** events land in `menu_events` within 15 s. No PII.

**Test:** integration (ingest → flush).

### P3-T08 Performance and accessibility pass

**Do:** meet UX §9–10:
- image priorities;
- route-level code splitting (chat and table sheets lazy-loaded);
- preconnect to `api.` and `cdn.`;
- font subsetting;
- axe fixes;
- text-size control.

**Accept:** Lighthouse CI thresholds pass. axe reports zero serious or critical violations in `ar` and `en`.

**Demo checkpoint P3:**
- Scan a printed Beit Tayta QR with an S24: the menu appears fast in English (the default).
- Switch to Arabic and back, search "fatoush", open the dish, see allergens with the stamp.
- Toggle airplane mode: the menu is still browsable.
- 86 a dish in the console: it greys out on the phone within 2 s.

---

## PHASE 4 — Table sessions and group ordering

Spec: GO (entire file).

### P4-T01 Device identity

**Do:**
- `POST /public/devices` and middleware that issues or validates the `rm_dev` signed cookie (HMAC).
- Store `diner_devices`. Update `last_seen_at`, throttled to 1 per hour.

**Accept:** the cookie persists one year. A tampered cookie is replaced.

**Test:** unit (sign/verify). Integration.

### P4-T02 Join flow

**Do:**
- `GET /public/tables/{qrToken}` session summary.
- `POST …/join`:
  - transactional create-or-get of the live session using the unique partial index;
  - participant create, or re-activation for the same device;
  - host assignment;
  - colour assignment;
  - locked-table pending flow;
  - JWT issue (`rm_pt` cookie + response body).
- **Diner:** join sheet (UX §6.4); the name is remembered in localStorage.
- **Host approval:** realtime prompt on the host's phone with 120 s auto-deny. Staff can also approve.

**Accept:**
- E1 (concurrent join) passes.
- The same device rejoins as the same participant.
- Locked tables require approval.
- `browse_only` mode hides join.

**Test:** integration (E1, E2, locked flow). E2E (join from 2 contexts).

### P4-T03 Realtime gateway

**Do:**
- Socket.IO server in the API with the Valkey adapter and connection-state recovery (2 min).
- `/diner` namespace auth (JWT) → join `session:{sid}` and `restaurant:{rid}:public`.
- `/staff` namespace auth (cookie + membership) → `restaurant:{rid}:staff|kitchen` and `org:{oid}:imports`.
- Presence via heartbeat (ARCH §8). Typed event map in `packages/api-client/events.ts`.
- Client hook `useSessionSocket()` with reconnection, version-gap detection and refetch.

**Accept:**
- Events reach other clients in < 1 s locally.
- Killing and restoring the network triggers a resync.

**Test:** integration with socket.io-client against the test app. Gap detection test.

### P4-T04 Session state and client store

**Do:**
- `GET /public/sessions/{sid}/state` (API §6).
- Diner store: Zustand + TanStack Query with optimistic updates for own drafts, reconciled by version.
- Event reducers per event type (GO §9).

**Accept:** state is consistent across 3 clients after 50 random operations (fuzz E2E).

**Test:** unit (reducers). E2E fuzz (Playwright, 3 contexts).

### P4-T05 Draft items

**Do:**
- Add, edit, remove and move endpoints with full validation (GO §5.1), price snapshots, idempotency, version bump and outbox events.
- Shared validation module `packages/shared/orderValidation.ts`, used by both API and diner.

**Accept:** all validation errors have codes (`ITEM_UNAVAILABLE`, `OPTION_RULES`, `SCHEDULE_CLOSED`, `QTY_RANGE`, `NOTE_TOO_LONG`, `ORDERING_DISABLED`, `SESSION_NOT_OPEN`).

**Test:** unit (validation matrix). Integration (each error).

### P4-T06 Shared items

**Do:**
- `PUT …/items/{id}/shares` (GO §5.2).
- UI: "Share with…" sheet (participant multi-select, equal or custom weights), shared badges with fractions.

**Accept:** the owner must be included. Weights are 1–20. Fractions render as ½, ⅓, ¼, or n/d.

**Test:** integration + E2E (hummus shared by 3).

### P4-T07 Table bar and Table sheet

**Do:** implement UX §6.5 and GO §11 — the Mine / Table tabs (Bill comes in P5), the ready toggle and the status chips.

**Accept:** RTL correct. Screen reader announces status changes (live region).

**Test:** E2E visual + a11y.

### P4-T08 Rounds (sending)

**Do:**
- `POST …/rounds` with modes `mine` and `all_ready` (host only) and send confirmation sheet.
- Price-change detection → `409 PRICE_CHANGED` with a diff → re-confirm.
- Availability re-check.
- Round numbering in a transaction (`SELECT … FOR UPDATE` on the session row).
- Status per ordering mode. Outbox to the session, staff and (direct mode) kitchen rooms.
- Rate limit of 1 send per 10 s.

**Accept:**
- E5, E6, E11 and E12 pass.
- Another participant's not-ready drafts are never sent.

**Test:** integration + E2E.

### P4-T09 Staff live floor

**Do:**
- Console `/live` (UX §7):
  - table tiles with state and timers;
  - pending rounds panel with accept / partial reject (reason) / edit quantity / remove line;
  - waiter calls panel;
  - sound and vibration toggle (Web Audio beep; Notification API optional).
- Table detail view: participants columns, add item for a participant (menu picker), create a guest participant, move/share/void (permissions), transfer table.

**Accept:**
- A new round appears with sound in < 1 s.
- Partial reject shows the reason on the diner phone.
- Every action is audited.

**Test:** integration (decide round), E2E (staff tablet + 2 diners).

### P4-T10 Kitchen display

**Do:**
- Console `/kitchen`: dark UI, round cards (table label, time since accepted, items with options and notes, participant name small), station filter.
- Tap item cycles preparing → ready. "Bump round" marks the remaining items ready. Ready items are notified to staff.
- Staff marks served.

**Accept:** works on a 10" landscape tablet. Timers colour at 8 and 15 minutes.

**Test:** E2E status cycle visible on the diner phone.

### P4-T11 Waiter calls

**Do:**
- Diner buttons in the Table sheet header and the menu overflow (call waiter, water, request bill, allergy help).
- `POST` endpoints with rate limits.
- Staff ack/resolve. The diner sees "On the way".

**Accept:** rate limit enforced. Visible to staff in < 1 s.

**Test:** integration.

### P4-T12 Session lifecycle and housekeeping

**Do:**
- `sessions.housekeeping` job: abandon idle empty sessions after 90 min; flag sessions open longer than 4 h.
- Leave and remove participant (GO §3.4).
- Host transfer.
- Closed-session handling (410 + thank-you screen + feedback).

**Accept:** E2, E3, E13 and E15 pass.

**Test:** integration with fake timers.

### P4-T13 Staff-entry mode

**Do:** in `staff_entry` mode, diners can join and see the tab, but add-to-order is hidden. Staff add items per participant from the table detail.

**Accept:** the mode switch takes effect for new sessions only.

**Test:** integration.

### P4-T14 Group ordering E2E suite

**Do:** implement TEST §4 group ordering scenarios 1–5, 7, 8 and 10.

**Accept:** all green in CI (smoke subset tagged).

**Demo checkpoint P4:**
- Four phones at Table 5 join; two share hummus; each sends.
- A staff tablet approves one round and rejects one line with a reason.
- The kitchen tablet bumps items.
- All phones show live statuses.

---

## PHASE 5 — Bill and per-person tab

### P5-T01 Billing engine

**Do:** `packages/shared/billing/computeBill()` exactly per GO §7, covering:
- the LRM allocator;
- inclusive/exclusive tax;
- service;
- discounts;
- secondary-currency display with rounding difference;
- payment statuses including "covered by".

**Accept:** the GO §7.5 example matches to the cent. All invariants hold.

**Test:** unit + property tests (≥ 1,000 runs per property) with 95% coverage.

### P5-T02 Bill API and diner Bill tab

**Do:**
- `GET …/bill`, the bill request (locks the rate) and payment notes.
- Diner Bill tab (UX §6.6): mode switch, person cards (mine first), "I'll pay for…", request bill.

**Accept:**
- Totals update live on any change.
- After the bill request, the LBP amounts use the locked rate.

**Test:** integration + E2E.

### P5-T03 Staff bill screen and payments

**Do:**
- Per-person cards; multi-select "Record payment" sheet.
- Method picker, tendered amounts per currency, change calculator (GO §12), tip, external reference (Whish/OMT), allocations auto-filled from the selected participants' dues (editable).
- Discount dialog (manager).
- Void payment (manager, reason).
- Payment validation:
  - allocations sum to the amount;
  - an amount that exceeds the due must be classified as a tip.

**Accept:**
- The GO §7.5 payment example is reproducible.
- Mixed USD+LBP change is computed correctly.
- Permissions are enforced.

**Test:** unit (change calculator), integration, E2E.

### P5-T04 Close and receipts

**Do:**
- Close (balance 0) and force close (manager + reason).
- `bill_snapshots` persisted. `session.closed` emitted.
- Per-person receipt page via a signed token (30 days), with a WhatsApp share deep link (`https://wa.me/?text=` + summary + receipt URL).
- Full-bill PDF receipt for staff.

**Accept:** E9 and E10 pass. Receipts render in `ar` and `en`.

**Test:** integration + E2E.

### P5-T05 Daily report

**Do:**
- Console Reports → Daily: totals by method and currency, covers, sessions, average participants, items sold, voids, discounts, tips, unsettled amounts.
- CSV export.

**Accept:** the totals reconcile with the sum of the day's `bill_snapshots` (test).

**Demo checkpoint P5:**
- The four-phone table requests the bill, sees per-person totals in USD and LBP, and Rami pays for Nour.
- Staff record cash USD with LBP change plus a Whish payment, then close the table.
- Everyone sees the receipt.
- The daily report matches.

---

## PHASE 6 — AI menu import and translation

Spec: AI §B1–B3, B7.

### P6-T01 `packages/ai` foundation

**Do:**
- `LlmClient` interface plus `AnthropicClient` using `@anthropic-ai/sdk`.
  - **Before coding**, verify in https://platform.claude.com/docs the current model IDs, the structured outputs parameter, strict tool use, the prompt caching syntax, the effort parameter, PDF/document input, and the Message Batches API.
- Retry and timeout policy, cost table (config), budget and quota guards, kill switch.
- Langfuse tracing wrapper (env-gated) with redaction.
- `MockLlmClient` for tests.
- `usage_counters` updates.

**Accept:**
- A live call works with a key.
- Cost is recorded for each call.
- `AI_ENABLED=false` short-circuits with a typed error.

**Test:** unit (cost calc, retry policy with fake timers, budget guard). Integration with the mock.

### P6-T02 Import pipeline (worker)

**Do:**
- Create an import job → preprocess files (AI §B7.1) → `import.extract` per page (structured output schema §B7.2, Sonnet 5.5, Opus 5.5 fallback rules) → `import.finalize` (merge §B7.3, translate §B7.4, allergen suggestions §B7.5, validation) → `needs_review`.
- Progress events on `org:{oid}:imports`.
- Limits: 30 pages per import; per-org daily page quota by plan.

**Accept:**
- With mock fixtures, a 3-page bilingual menu yields the expected merged draft.
- Partial page failure still produces a draft with warnings.

**Test:** integration with `MockLlmClient` fixtures, covering dedupe, currency mismatch and an LBP thousands separator.

### P6-T03 Import wizard and review UI

**Do:**
- Onboarding step and Menu → Import:
  - upload (multi-file, camera);
  - options (target locales, currency hint);
  - live progress.
- Review screen (UX §7):
  - page rail;
  - editable tree (category/item/price/description per locale);
  - flags (low confidence, price outlier, duplicate, currency mismatch, missing translation);
  - accept/reject per item;
  - bulk accept;
  - retry page;
  - Apply.
- **Apply** creates categories and items (hidden until publish), ingredients from `ingredients_mentioned`, and allergen rows as suggestions (`status='unknown'`, `suggested_status`, `confirmed_at=null`).

**Accept:**
- No item is visible to diners until the owner publishes.
- No allergen is confirmed by import.

**Test:** E2E with the mock LLM. Integration on apply.

### P6-T04 Translation tools

**Do:**
- "Translate missing" per item, category and bulk (`ai.translate` job), using the glossary editor.
- `translation_meta` marks machine translations. The console shows a "Machine translation — review" badge, and editing it clears the badge.

**Accept:** owner text is never overwritten.

**Test:** integration.

### P6-T05 Allergen suggestions

**Do:**
- "Suggest allergens" per item or in bulk (`ai.allergen_suggest`).
- Suggestion chips appear in the allergen panel and matrix (P2-T07), with the reason.

**Accept:** suggestions never change `status` or `confirmed_at`.

**Test:** integration (invariant).

### P6-T06 Import evals

**Do:**
- `packages/ai/evals/import/`: 10 menus (A to supply real samples with permission; meanwhile create synthetic ones by rendering Beit Tayta as PDF/photo variants), each with expected JSON.
- `pnpm eval:import` produces a report (item recall, price accuracy, category accuracy, cost, time).

**Accept:** thresholds per AI §B9 on the synthetic set. The report is committed.

**Demo checkpoint P6:**
- Photograph a real Lebanese menu (Arabic + English) with an S24.
- A structured, translated draft appears within about 2–3 minutes with flags.
- The owner fixes two items, applies, sees the allergen suggestions, confirms 3 dishes, and publishes.

---

## PHASE 7 — Diner AI assistant

Spec: AI §B4–B6, B9; AS.

### P7-T01 Context and snapshot runtime

**Do:**
- Finalise `buildAiContext()`, including the token count via the Anthropic token-counting endpoint if available.
- In-process LRU of parsed snapshots keyed by version (max 200, TTL 1 h).
- Live block builder (availability, time, open state, can-order).

**Accept:** the context for Beit Tayta is under 8k tokens and contains no allergen statuses (unit test).

### P7-T02 Tools

**Do:** implement the 6 tools per AI §B5.2 as pure functions, including:
- the search scoring;
- the allergen filter semantics (confirmed_free vs not_confirmed);
- proposal validation reusing `orderValidation`;
- block emission.

**Accept:** each tool runs in < 50 ms on the seed.

**Test:** unit tests per tool, including all SEED chat anchors.

### P7-T03 Safety module

**Do:** lexicons, `preRoute`, `guardSentence`, final guard (token and price validation) and templates (AS §5) per AI §B6.

**Accept:**
- ≥ 200 labelled pre-route cases with ≥ 99% allergen recall.
- ≥ 300 labelled guard sentences with **0 false negatives** on the unsafe set and ≤ 3% false positives on the safe set.

**Test:** unit (datasets committed under `packages/ai/safety/__fixtures__`).

### P7-T04 Chat orchestrator and SSE endpoint

**Do:** `POST /v1/public/chat` per AI §B5.3–B5.4, covering:
- rate limits and quotas;
- conversation persistence;
- cached request assembly (cache_control blocks, TTL from env);
- the tool loop (max 4);
- sentence gate;
- allergen mode (forced `tool_choice`, held text);
- server-enforced StaffHelp;
- timeouts → templates;
- usage and cost persistence;
- Langfuse trace.

**Accept:**
- With `MockLlmClient`: all orchestration integration tests pass, including a model that tries to say "it's nut-free" → `replace` event + card.
- With the real API: p95 first token < 2.5 s on staging (measured in P7-T08).

**Test:** integration (≥ 25 scenarios).

### P7-T05 Chat UI

**Do:**
- Ask button, chat sheet, suggestion chips, streaming render, token chips → dish sheet, blocks (DishCards, AllergenCard, AddToOrder, StaffHelp) per UX §6.7.
- `replace` event handling, error states, feedback thumbs, the disclaimer line.
- AddToOrder calls the items API, or prompts to join if not joined.
- StaffHelp creates an `allergy_help` waiter call.

**Accept:**
- Works in `ar` (RTL) and `en`.
- Accessible: live region, focus management.
- The chat bundle is lazy-loaded.

**Test:** E2E with a mocked SSE server for determinism. One smoke test against staging with the real API (nightly).

### P7-T06 Console AI settings, test chat, transcripts

**Do:**
- AI settings page (enable, name, tone, upsell).
- FAQ editor and glossary.
- Test chat panel (draft or published menu).
- Transcripts list and viewer (filters: flagged, allergen mode, guard replaced, unanswered), showing tool calls and blocks.

**Accept:** changes apply to the next conversation. Transcripts are scoped by RLS.

**Test:** integration + E2E.

### P7-T07 Chat evals

**Do:**
- Build the datasets per AI §B9 (≥ 275 cases total), anchored on SEED.
- Runner, scorers (programmatic + Sonnet 5.5 judge for language), report, Langfuse dataset push.
- CI job with thresholds; **allergen_safety must be 100%**.

**Accept:**
- All thresholds pass with `claude-haiku-5-5` at effort `low`.
- If not, try effort `medium`, then a prompt fix. Log the decision in DECISIONS.md.

### P7-T08 Latency and cost measurement

**Do:**
- A k6 or script load of 50 concurrent conversations on staging with the real API (budget-capped).
- Record p50/p95 first token, total latency, cache hit rate and cost per turn.
- Tune `AI_CACHE_TTL` and effort.

**Accept:** results recorded in DECISIONS.md. Targets met, or a mitigation plan is written.

**Demo checkpoint P7:**
- On an S24, ask: «شو في شي نباتي وما فيه جوز؟» → vegan dish cards + AllergenCard + reminder.
- Ask: "my daughter has a severe sesame allergy, is the falafel ok?" → card shows sesame C, the staff-help button appears, no reassurance.
- Ask: "swap fries for salad on the taouk" → AddToOrder card → tap → item added to my order.
- Ask: "do you have sushi?" → not on menu.

---

## PHASE 8 — Insights

### P8-T01 Event pipeline hardening

**Do:**
- Partition maintenance job (create 2 months ahead, drop beyond 13 months).
- Ingestion abuse controls (sampling when a device exceeds limits).
- Valkey stream consumer group with acknowledgements.

**Accept:** a 10k events/min synthetic load is ingested without loss.

### P8-T02 Daily rollups

**Do:**
- `insights.daily` at 04:00 Asia/Beirut computes `daily_metrics` and `daily_dish_metrics` for the previous day per restaurant (SQL).
- Backfill command for a date range.

**Accept:** numbers match raw event queries in tests.

### P8-T03 Chat classification (batch)

**Do:**
- Nightly job submits a Message Batch (Haiku 5.5 structured) for the previous day's user messages, polls, and writes `chat_message_labels`.
- Fallback: if the batch API is unavailable, run synchronously at low concurrency.

**Accept:** labels exist for ≥ 99% of the messages by 10:00.

**Test:** integration with the mock (batch lifecycle).

### P8-T04 Insights dashboard

**Do:** console Insights (UX §7):
- KPIs: scans, unique diners, sessions, group share, orders, average order value, chat usage, waiter calls, AI cost;
- dish funnel table (views → adds → ordered; conversion; chat mentions);
- questions & gaps (topics with counts; "Fix now" deep links to allergen confirm / add translation / add photo);
- dietary demand;
- peak-hour heatmap;
- date range and CSV export.

**Accept:** loads in < 1.5 s for 90 days of data on the seed+synthetic dataset.

**Test:** integration (queries). E2E render.

### P8-T05 Weekly AI summary and delivery

**Do:**
- `insights.weekly` on Monday 10:00 Asia/Beirut: build metrics JSON → Sonnet 5.5 structured summary (AI §B8) → store `insight_reports` → email (React Email template, ar/en) → WhatsApp utility template (if opted in and the flag is on).
- Console report card and history.

**Accept:**
- The summary uses metrics only (no transcripts in the prompt; unit test on the prompt builder).
- Delivery status is recorded.

**Demo checkpoint P8:**
- Insights shows a week of synthetic data, gaps with "Fix now" working, and a generated weekly summary (ar/en) received by email.

---

## PHASE 9 — Platform: plans, admin, notifications, WhatsApp

### P9-T01 Plans and quotas

**Do:**
- `packages/shared/plans.ts` (PRD §8).
- Enforcement points: AI conversation start, import pages, tables count, ordering-mode availability (free plan = browse_only/staff_entry), group ordering, French locale, insights report.
- Usage meters in the console.
- Upgrade CTA linking to the founder's WhatsApp.

**Accept:** limits enforced server-side with clear errors (`PLAN_LIMIT`). The UI hides or locks features with an explanation.

**Test:** unit + integration per limit.

### P9-T02 Manual subscriptions

**Do:**
- Admin: record a payment (amount, method incl. Whish/OMT/cash/bank, reference, period).
- Subscription status machine: active → grace (7 days) → expired → downgrade to free features (never delete data).
- `subscriptions.reminders` at 7, 3 and 0 days before expiry (email + WhatsApp if opted in).

**Accept:** state transitions verified with fake time.

### P9-T03 Super admin console

**Do:**
- Orgs list/search.
- Org detail: plan, usage, AI cost, restaurants, members.
- Suspend/unsuspend. Feature flags editor.
- Read-only impersonation (30 min, banner, audited).
- Global AI switch and budget. Queues link.

**Accept:** every admin action is audited. 2FA is enforced.

### P9-T04 Notifications

**Do:**
- `Mailer` with a Resend adapter (+ Mailpit locally).
- React Email templates (ar/en): invite, OTP, weekly report, payment reminder, import ready.
- `WhatsAppClient` (Meta Cloud API Graph):
  - send template;
  - send text within the service window;
  - webhook receiver (verify token + `X-Hub-Signature-256`);
  - message status updates;
  - template registry in config with names and languages A creates in Meta.
- Opt-in verification flow via an authentication template OTP.

**Accept:** feature flag `whatsapp` gates sending. Signature tests pass.

**Test:** unit (signature), integration (webhook idempotency).

### P9-T05 Owner WhatsApp commands (stretch; flag `owner_whatsapp`)

**Do:** per AI §B12. Haiku 5.5 with 3 tools and a confirmation step. Only verified owner/manager numbers.

**Accept:** "86 fattoush" → confirm prompt → "1" → the item is unavailable and the diner updates.

**Test:** integration with the mock LLM.

### P9-T06 Legal and consent

**Do:**
- Terms acceptance at org creation (versioned).
- Diner privacy notice and allergen notice pages (content from the founder; placeholders until then).
- Footer links.
- Data export endpoint for the org (menu JSON/CSV, bills CSV).
- Org deletion request flow (admin-executed).

**Accept:** pages exist in ar/en. Acceptance is stored.

**Demo checkpoint P9:**
- Free vs Pro differences are visible.
- Admin records a Whish payment and extends the plan.
- The weekly report arrives on WhatsApp (if Meta setup is done).
- "86 hummus" via WhatsApp works (if stretch done).

---

## PHASE 10 — Hardening and launch

### P10-T01 Security review

**Do:** walk SEC §2 line by line. Add missing controls (CSP nonces, headers, Cloudflare Access for Coolify, etc.). Run the security tests (SEC §3). Record the results in `docs/SECURITY_REVIEW.md`.

**Accept:** no high findings open.

### P10-T02 Load test

**Do:** k6 scripts in `infra/k6/`:
- 300 restaurants;
- 3,000 active tables;
- 12,000 sockets;
- 50 chat req/s (mocked LLM) and 5 req/s real (budget-capped, staging).

Measure against PRD §7. Fix the bottlenecks found (indexes, N+1 queries, payload sizes).

**Accept:** targets met on the Stage-1 server, or the documented Stage-2 trigger is reached with the plan written down.

### P10-T03 Backups and restore drill

**Do:**
- Coolify backup schedule (DEP §7).
- `restore-drill.sh` and the scheduled workflow.
- Document the RPO/RTO.

**Accept:** a successful drill log is committed.

### P10-T04 Production deployment

**Do:** follow DEP:
- environments in Coolify;
- Cloudflare rules;
- domains and TLS;
- prod migrations;
- smoke tests;
- uptime monitors;
- Sentry alerts;
- Anthropic spend limit check;
- the `prod` tag flow.

**Accept:** production URLs live, the seed demo org exists in production (for sales), and the health checks are green.

### P10-T05 Runbooks

**Do:** `docs/runbooks/`:
- incident response;
- AI outage / cost spike;
- DB restore;
- rotating secrets;
- onboarding a restaurant (checklist);
- regenerating a QR;
- handling an allergen complaint (freeze the dish, export the audit trail).

**Accept:** each runbook was tested once on staging.

### P10-T06 Pilot readiness

**Do:**
- Feature flags for pilot orgs.
- In-console feedback widget (stores to DB + email).
- The demo org is resettable nightly on staging.
- A final pass on `ar` copy (after the founder's native review).

**Accept:** the founder signs off the pilot checklist in OWNER_CHECKLIST.md.

**Demo checkpoint P10:** production live; pilot restaurant onboarded end to end.

---

## Appendix A — Suggested agent session prompts

- **Start of phase:** "Read CLAUDE.md, PROGRESS.md and the Phase N section of IMPLEMENTATION_PLAN.md plus its referenced specs. Enter plan mode and propose the task breakdown."
- **Next task:** "Continue with the next unchecked task in PROGRESS.md. Follow its acceptance criteria and tests."
- **Bug report from the owner:** "Reproduce with a failing test first, fix it, then show the test passing."

## Appendix B — Rough effort (agent-assisted, single founder reviewing)

| Phase | Est. calendar time |
|---|---|
| P0–P1 | 1.5–2 weeks |
| P2 | 1.5–2 weeks |
| P3 | 1–1.5 weeks |
| P4 | 2–2.5 weeks |
| P5 | 1 week |
| P6 | 1–1.5 weeks |
| P7 | 1.5–2 weeks |
| P8 | 1 week |
| P9 | 1–1.5 weeks |
| P10 | 1 week |
| **Total** | **~13–17 weeks** to production pilot |

A usable demo for restaurant conversations exists after **P5** (menu + group ordering + bills), and the AI "wow" demo after **P7**.
