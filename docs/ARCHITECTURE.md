# ARCHITECTURE — Radd Menu

## 1. Goals and constraints

- **Production-grade from day one.** Typed end to end, tested, observable, secure, and multi-tenant.
- **Scales without a rewrite.** Start on one server. Split into separate services and managed databases only when load requires it. Everything is containerised and stateless except Postgres and Valkey.
- **Flexible.** Every external dependency sits behind an interface we own:
  - AI provider (`LlmClient`)
  - storage (`ObjectStorage`)
  - email (`Mailer`)
  - WhatsApp (`WhatsAppClient`)
  - payments (`PaymentAdapter`, later)
  - POS (`PosAdapter`, later)
- **Built for Lebanon.**
  - Patchy connectivity: offline cache and CDN.
  - Shared restaurant Wi-Fi IPs: rate-limit per device or session, not per IP.
  - Two currencies.
  - Cash-heavy payments.
  - Arabic, Arabizi and French.
- **Builder reality.** One founder plus AI coding agents. One language (TypeScript) across every app keeps the agents effective and makes future hiring easy.

## 2. What the market uses (and what we take from it)

| Company | What is public about their stack | Lesson |
|---|---|---|
| **sunday** (pay-at-table, EU/US) | Job posts: React + TypeScript guest-facing frontends, Kotlin-based APIs | Guest UI in React/TS is the norm; typed backend APIs |
| **Foodics** (MENA POS leader, ~30k restaurants) | Job posts: PHP/Laravel services, newer .NET services, relational DBs, Redis caching, queue systems, REST APIs | Relational DB + Redis + queues is the proven core for restaurant ops at scale |
| **Toast, Square** (US POS) | Large JVM/React estates (public engineering material) | Event-driven order state, strong idempotency |
| **Open-source QR ordering** (FeastQR, qr-ordering-rag, TastyIgniter) | Next.js/T3, Python/FastAPI with WebSockets, Laravel | Table tokens, a realtime kitchen queue, group orders with host/split options |

**Our choice.** We use the same proven building blocks (React front ends, a relational DB, Redis-class cache and queues, WebSockets, a REST API), all in TypeScript:

- **NestJS** gives a modular, enterprise-style backend structure similar to Laravel or Spring, but in TS.
- **PostgreSQL** is the industry default and gives us RLS, JSONB, full-text/trigram search and pgvector later.
- **Docker** keeps hosting portable: Hetzner today, AWS/GCP/Kubernetes tomorrow, with no code change.

## 3. Stack decisions

| Layer | Choice | Why | Alternatives considered |
|---|---|---|---|
| Monorepo | pnpm workspaces + Turborepo | Shared types and schemas, cached builds, one CI | Nx (heavier), separate repos (type drift) |
| Diner app | Next.js 16 App Router, React 19 | SSR/streaming for fast first paint; ISR and caching for menus; huge ecosystem; AI agents know it well | Remix/React Router 7, Astro (less suited to the app-like cart), Flutter Web (slow first load) |
| Styling | Tailwind CSS v4 + CSS variables for restaurant themes | Fast, consistent, RTL via logical properties | CSS-in-JS (runtime cost) |
| i18n | next-intl | App Router native, ICU messages, RTL `dir` handling | i18next |
| PWA / offline | Serwist (`@serwist/next`) | Maintained Workbox-based SW for Next.js | next-pwa (unmaintained) |
| Console UI | shadcn/ui (Radix) + TanStack Query/Table + dnd-kit + Recharts | Accessible primitives, we own the code, RTL-capable | MUI (heavy), Ant (styling lock-in) |
| API | NestJS 11 on Fastify | Module boundaries, DI, guards, interceptors, Socket.IO gateway, BullMQ integration, OpenAPI. Fastify for throughput. | Hono/Fastify only (less structure), tRPC (couples clients to TS, weaker for future POS partners) |
| Validation | zod (+ nestjs-zod) | One schema for API, console and diner | class-validator (duplicated types) |
| DB | PostgreSQL 17 | RLS, JSONB, partitioning, pg_trgm, pgvector later; managed options everywhere | MySQL (weaker RLS/JSONB) |
| ORM | Drizzle ORM + drizzle-kit | SQL-first, typed, light; native support for Postgres features (RLS, pgvector) | Prisma (heavier runtime, less control over SQL) |
| Cache / queue / pub-sub | Valkey 8 | Redis-compatible (BullMQ, Socket.IO adapter), BSD-licensed | Redis 8 (fine too), RabbitMQ (extra system) |
| Jobs | BullMQ | Retries, backoff, scheduling, rate limits, dashboards | pg-boss (fine; BullMQ is more battle-tested at volume) |
| Realtime | Socket.IO 4 + `@socket.io/redis-adapter` | Rooms, reconnection, connection-state recovery, horizontal scale via Redis | Raw WS (reinventing), Pusher/Ably (cost, lock-in), Centrifugo (extra Go service; good future option) |
| Auth (staff/owners) | Better Auth (self-hosted, MIT) | Organizations, roles, invitations, email OTP, phone OTP plugin, Drizzle adapter; data stays in our DB | Clerk/Auth0 (cost, data abroad), Keycloak (heavy) |
| Diner identity | Signed device cookie + participant JWT | Anonymous, no PII, no login friction | Accounts (friction kills adoption) |
| Storage | S3 API → Cloudflare R2 (prod), MinIO (local) | Zero egress fees on R2, CDN-friendly, portable | AWS S3 (egress cost) |
| Images | sharp in worker → AVIF/WebP variants + thumbhash | Fast, cheap, no third-party dependency | Cloudflare Images (paid; possible later) |
| AI | Anthropic Claude (Haiku 5.5 / Sonnet 5.5 / Opus 5.5) via `@anthropic-ai/sdk` behind `packages/ai` | Strong Arabic, tool use with strict schemas, structured outputs, prompt caching, vision + native PDF, batch discounts. See AI_ARCHITECTURE.md | Multi-vendor gateway (added complexity now; the interface allows it later) |
| LLM observability | Langfuse (Cloud Hobby first, self-host later; MIT core) | Traces, cost, prompt versions, eval datasets | LangSmith (closed), Phoenix |
| Email | Resend + React Email | Simple API, good deliverability, templates in React | Postmark, SES |
| WhatsApp | Meta WhatsApp Cloud API (direct) | No BSP margin; same platform as Radd receptionist | BSPs (Twilio, 360dialog) |
| Errors / APM | Sentry | Next.js + Nest SDKs, source maps, performance | Highlight, Datadog (cost) |
| Hosting | Hetzner Cloud + Coolify v4 (open source PaaS) | Very low cost, Docker-native, S3 backups, easy deploys; no lock-in | Vercel + Railway/Render + Neon (easier but 5–10× cost at scale; vendor sprawl), AWS (more ops) |
| Edge | Cloudflare (DNS, proxy/CDN, WAF, R2, Beirut PoP) | Fast static and menu delivery in Lebanon, DDoS protection, free tier | — |
| CI/CD | GitHub Actions → GHCR → Coolify webhook | Standard, cheap | — |

## 4. System diagram

```
                    ┌────────────────────────── Cloudflare (DNS, CDN, WAF, R2) ───────────────────────────┐
 Diner phone  ──►   m.<domain>  ──────────┐        cdn.<domain> (R2 public: images, QR PDFs)              │
 Staff tablet ──►   app.<domain> ───────┐ │                                                               │
 Owner phone  ──►   app.<domain>        │ │        api.<domain>  (REST /v1, Socket.IO, SSE chat)          │
                    └───────────────────┼─┼───────────────┬───────────────────────────────────────────────┘
                                        │ │               │
                         Hetzner Cloud server(s) managed by Coolify (Docker)
        ┌───────────────────────────────┼─┼───────────────┼────────────────────────────────────────────┐
        │  ┌─────────────┐   ┌──────────▼─▼──┐   ┌────────▼────────┐        ┌─────────────────────┐    │
        │  │ console      │   │ diner          │   │ api (NestJS)    │◄──────►│ Valkey               │    │
        │  │ (Next.js)    │   │ (Next.js+SW)   │   │ REST · WS · SSE │  pub/  │ cache · queues ·     │    │
        │  └──────┬───────┘   └──────┬────────┘   └───┬─────┬───────┘  sub    │ socket adapter ·     │    │
        │         └── server fetch ──┴──────────────►│     │                 │ rate limits          │    │
        │                                             │     │ enqueue         └──────────┬──────────┘    │
        │                                    ┌────────▼┐  ┌─▼──────────────┐             │               │
        │                                    │Postgres │◄─┤ worker (BullMQ)│◄────────────┘               │
        │                                    │ 17 + RLS│  │ import · images│                             │
        │                                    └────┬────┘  │ insights · mail│                             │
        │                                         │       └──┬──────┬──────┘                             │
        └─────────────────────────────────────────┼──────────┼──────┼──────────────────────────────────────┘
                     daily backups → R2 (private) ┘          │      │
                                                              ▼      ▼
                                      Anthropic API (Claude)   Resend · Meta WhatsApp Cloud API
                                      Langfuse (traces)        Sentry (errors)
```

## 5. Components

### apps/diner (Next.js) — public, cacheable, tiny

**Routes:**
- `/t/[qrToken]` — table entry: resolve, join, menu
- `/r/[slug]` — browse-only menu, e.g. from an Instagram link
- `/r/[slug]/d/[dishId]` — deep link to a dish
- `/session/[sessionId]/receipt/[participantId]`
- `/offline`

**Data:**
- Server components fetch the **immutable menu snapshot** by version. Next.js caches it with tags.
- Client components handle the cart, chat, socket and filters.

**State:** TanStack Query for server state plus a small Zustand store for session and cart state, reconciled by `sessionVersion`.

**Service worker:**
- Precache the app shell.
- Stale-while-revalidate for snapshot JSON.
- Cache-first for images, with expiry.
- Offline fallback page.

### apps/console (Next.js) — authenticated

Route groups:
- `(owner)` — onboarding, menu, allergens, import, tables, team, AI settings, insights, settings
- `(staff)` — live floor, bills
- `(kitchen)` — KDS
- `(admin)` — super admin

Layouts are role-gated and work on phone and tablet. Built with shadcn/ui.

### apps/api (NestJS + Fastify)

- REST `/v1/*`. OpenAPI at `/v1/docs` in non-production environments.
- Better Auth handler mounted at `/v1/auth/*`.
- Socket.IO namespaces:
  - `/diner` — participant token auth
  - `/staff` — console session auth plus restaurant membership
- SSE endpoint for chat: `POST /v1/public/chat`.
- Global pieces:
  - request ID
  - pino logger
  - zod pipe
  - problem+json filter
  - throttler (Valkey storage)
  - Helmet
  - CORS allowlist
  - idempotency interceptor

### apps/worker (NestJS standalone + BullMQ)

| Queue | Purpose | Concurrency |
|---|---|---|
| `image.process` | sharp variants, thumbhash, EXIF strip | 4 |
| `menu.publish` | build snapshot + AI context, cache warm, revalidate diner | 2 |
| `import.extract` | per-page extraction via Claude | 3 (rate-limited per org) |
| `import.finalize` | merge, translate, suggest allergens, validate | 2 |
| `ai.translate` | on-demand translation batches | 2 |
| `ai.allergen_suggest` | on-demand allergen suggestions | 2 |
| `events.flush` | batch-insert analytics events from a Valkey stream | 1 |
| `chat.classify` | nightly: submit and poll a Message Batch | 1 |
| `insights.daily` | nightly rollups | 1 |
| `insights.weekly` | Monday report generation + delivery | 1 |
| `notify.email` / `notify.whatsapp` | outbound messages | 4 / 2 |
| `sessions.housekeeping` | abandon idle sessions, flag long ones (every 5 min) | 1 |
| `db.maintenance` | create future partitions, purge retained data (daily) | 1 |
| `subscriptions.reminders` | expiry reminders, downgrade after grace (daily) | 1 |
| `outbox.dispatch` | reliable domain events → sockets / integrations | 2 |

### packages

- `db` — schema, migrations, RLS SQL, `withTenant()`, repositories base, seed.
- `shared`:
  - enums
  - zod DTOs
  - `money` (format, convert, round)
  - `billing` (split engine)
  - `permissions`
  - `plans`
  - `search` (Arabic normalisation, Arabizi map)
  - `allergens` (codes + AR/EN/FR names)
  - `diets`
- `ai`:
  - `LlmClient`, Anthropic adapter, cost table
  - prompts (versioned)
  - tools
  - safety (lexicons, guards, templates)
  - context builder
  - eval runner and datasets
- `ui` — design tokens, theme presets, shared components (PriceTag, AllergenBadge, AllergenCard, DishCard, Sheet, etc.).
- `api-client` — OpenAPI-generated types (`openapi-typescript`), `openapi-fetch` client, socket event type map.
- `config` — tsconfig bases, ESLint flat config, Prettier, env zod schemas per app.

## 6. Key flows

### 6.1 Menu load (diner)

1. `GET m.<domain>/t/{qrToken}` → Next.js server calls `GET /v1/public/tables/{qrToken}`.
   - Returns: restaurant public profile, table, open-session summary, `menuVersion`.
   - Cache: 15 s at Cloudflare, keyed by token.
2. Server fetches `GET /v1/public/menus/{restaurantId}/versions/{v}`.
   - **Immutable**: `Cache-Control: public, max-age=31536000, immutable`.
   - Also cached in Next.js and Valkey.
3. HTML streams with the menu. The client hydrates small islands: search, sheets, table bar.
4. The client fetches live availability (`GET /v1/public/restaurants/{id}/availability`, 10 s TTL) and subscribes to `restaurant:{id}:public` for `menu.availability_changed`.

### 6.2 Join table and group order

1. Join: `POST /v1/public/tables/{qrToken}/join`. This sets the device cookie if missing and returns `participant`, `session` and a participant token cookie.
2. The socket connects to `/diner` with the token and joins `session:{sid}`.
3. Add item: `POST /v1/public/sessions/{sid}/items` with an Idempotency-Key.
   - DB transaction: insert item and bump `session.version`.
   - The outbox writes `item.upserted`.
   - The API emits to the session room after commit.
4. Send: `POST /v1/public/sessions/{sid}/rounds`.
   - Items move to `pending_approval` (or `accepted`).
   - The API emits to the session room, `restaurant:{rid}:staff` and, if accepted, `restaurant:{rid}:kitchen`.
5. Staff accepts the round → statuses change → the kitchen bumps items → diners see live statuses.
6. Bill: `GET /v1/public/sessions/{sid}/bill` computes with `packages/shared/billing`. Staff record payments, then close.

### 6.3 AI chat

`POST /v1/public/chat` (SSE). Details are in AI_ARCHITECTURE.md §5.

In short:
1. Pre-route (lexicon).
2. Build cached context.
3. Claude Haiku 5.5 with strict tools.
4. Execute the tool loop on the server against the snapshot and DB.
5. Stream gated sentences plus UI blocks.
6. Output guard.
7. Persist.

### 6.4 Menu import

1. Console uploads files (presigned) → `POST /v1/restaurants/{rid}/imports` → `import.extract` jobs, one per page/file.
2. `import.finalize` runs merge → translation → allergen suggestions → validation, then sets the job to `needs_review`.
3. Progress events go over `/staff` socket room `org:{orgId}:imports`.
4. The owner reviews and applies. Draft items are created; allergen rows are created as suggestions only.

### 6.5 Publish

1. `POST /v1/restaurants/{rid}/menu/publish` → `menu.publish` job.
2. The job builds `snapshot` (diner JSON) and `ai_context_text`, hashes them, inserts into `menu_versions`, and sets the pointer.
3. It warms Valkey, calls the diner revalidate webhook (`/api/revalidate` with a secret, tag `menu:{rid}`), and emits `menu.published`.

## 7. Data and caching strategy

| Data | Source of truth | Cache | Invalidation |
|---|---|---|---|
| Published menu snapshot | `menu_versions.snapshot` | Cloudflare (immutable URL by version), Next.js tag cache, Valkey `menu:{rid}:v{n}` | New version → new URL; pointer cached 15 s |
| Current version pointer | `restaurants.published_menu_version_id` | Valkey 15 s, Cloudflare 15 s | Publish deletes the key and purges the pointer URL |
| Item availability (86) | `menu_items.is_available` | Valkey set `avail:{rid}:unavailable` | Updated in the same request; socket event |
| Session state | Postgres | none (fetched on demand, small) | `session.version` bump on every change |
| Exchange rate | `restaurants.lbp_rate` (+ history) | inside snapshot and availability payload | Rate change publishes a lightweight `restaurant.settings_changed` event; bill locks the rate at request time |
| AI context | `menu_versions.ai_context_text` | Anthropic prompt cache (5 min or 1 h TTL) | New version = new prefix |
| Rate limits, idempotency keys, presence | Valkey | TTL keys | auto-expire |

## 8. Realtime design

**Namespaces:**
- `/diner` — auth by participant JWT
- `/staff` — auth by Better Auth session cookie plus restaurant membership check

**Rooms:**
- `session:{sid}`
- `restaurant:{rid}:public` (availability)
- `restaurant:{rid}:staff`
- `restaurant:{rid}:kitchen`
- `org:{oid}:imports`

**Delivery:** at-least-once *notification*. Every session event carries `sessionVersion`. A client that sees a gap (`incoming > local + 1`) calls `GET /sessions/{sid}/state` and replaces local state.

**Reliability:**
- Transactional outbox. Every state change inserts an `outbox_events` row in the same transaction.
- The API emits immediately after commit (fast path).
- The `outbox.dispatch` worker re-emits anything not marked dispatched within 5 s (safety net).
- Socket.IO connection-state recovery is on (2 min window).

**Scale-out:**
- Valkey adapter for cross-instance broadcast.
- With more than one API instance, either use sticky sessions (needed for the long-polling fallback) or set `transports: ['websocket', 'polling']` and sticky cookies at the load balancer.

**Presence:** Valkey sorted set `presence:{sid}` scored by last heartbeat (every 25 s). Members older than 60 s are offline.

## 9. Multi-tenancy and boundaries

- **Tenant = organization.** An organisation has 1..n restaurants.
- Every tenant table carries `organization_id`. Restaurant-scoped tables also carry `restaurant_id`.
- **RLS:**
  - Policies use `current_setting('app.org_id', true)::uuid`.
  - `withTenant(orgId, fn)` opens a transaction and runs `SET LOCAL app.org_id = $1`.
  - The runtime DB role has no `BYPASSRLS`.
  - Super admin operations use a separate `app_admin` role connection, used only by the `admin` module and fully audited.
- **Public reads** go through:
  - `menu_versions` (public data only; RLS policy allows reading published rows by restaurant)
  - dedicated public repositories that never touch private tables without an explicit restaurant scope
- **Diner tokens** carry `rid` and `sid`. Every public session endpoint verifies the path `sid` equals the token `sid`.

## 10. Internationalisation

- **UI locales:** `en` (default, LTR), `ar` (RTL). `fr` messages are added in a later phase.
- **Locale resolution (ADR-009, "always English first"):** the `NEXT_LOCALE` cookie (set when the diner taps the language switch) → the restaurant's `default_locale` → `en`. `Accept-Language` is not used. The console and pages with no restaurant (sign-in, `/offline`, errors) use cookie → `en`.
- **Content:** `LocalizedText = { ar?: string; en?: string; fr?: string }` in JSONB, with a per-field `source` (`owner` | `machine`) map in `translation_meta`.
- **Fallback order:** requested → restaurant default → `en` → first available in the order en, ar, fr. Missing UI messages fall back to the English string at runtime; CI still fails on missing `ar` or `en` keys.
- **Numbers:** Western digits by default. Currency formats live in `packages/shared/money`.
- **Search normalisation** (`packages/shared/search`):
  - strip tashkeel and tatweel
  - unify alef forms (أ إ آ → ا), ya / alef maqsura (ى → ي), ta marbuta (ة → ه)
  - lowercase Latin and strip accents
  - map Arabizi digits (2→ء/ق, 3→ع, 5→خ, 7→ح, 8→غ, 9→ق)
  - apply a curated dish synonym list (fattoush/fattouch/فتوش, kibbeh/kebbe/كبة, …)
  - Postgres side: `unaccent` + `pg_trgm` on a generated `search_text` column

## 11. Files and images

- **Upload:** presigned PUT, direct to R2/MinIO, with content-type and size enforced by the presign policy. After upload, `POST /assets/{id}/complete` → worker validates magic bytes and processes.
- **Variants:**
  - widths 320 / 640 / 1280
  - AVIF + WebP
  - quality 60–70
  - thumbhash placeholder
  - EXIF stripped
- **Buckets:**
  - `assets-public` — served at `cdn.<domain>`, immutable keys `/{orgId}/{assetId}/{variant}.{ext}`
  - `assets-private` — imports, exports, backups

## 12. Observability

- **Logs:** pino JSON with `requestId`, `orgId`, `restaurantId`, `sessionId`, `userId`. No PII or tokens. Coolify keeps them; ship to Loki/Grafana later.
- **Errors:** Sentry in all four apps. Release version = git SHA. Source maps uploaded in CI.
- **Health:** `/v1/health/live` (process) and `/v1/health/ready` (DB, Valkey, queue ping). Uptime monitor on these plus the diner home.
- **AI:** Langfuse trace per chat turn or import job (model, tokens, cache hits, cost, latency, tool calls, guard actions). Daily cost alert per organisation and globally.
- **Business metrics:** `daily_metrics` tables power insights and the admin dashboard.

## 13. Environments

| Env | Where | Data |
|---|---|---|
| local | Docker Compose (Postgres, Valkey, MinIO, Mailpit) + `pnpm dev` | seed |
| staging | `*.staging.<domain>` on the same Coolify host (separate resources) | seed + test orgs |
| production | `m.`, `app.`, `api.`, `cdn.` `<domain>` | real |

## 14. Scaling path

| Stage | Load | Topology |
|---|---|---|
| 1 (POC/pilot) | ≤ 50 restaurants | One Hetzner server (8 vCPU / 16–32 GB), all containers via Coolify, daily backups to R2 |
| 2 | ≤ 300 restaurants | Dedicated DB server (or managed Postgres), app server with 2× api + worker, Hetzner Load Balancer with sticky cookie, Valkey on its own box |
| 3 | 300+ / multi-country | Kubernetes (k3s on Hetzner or a managed K8s/ECS), Postgres HA (Patroni or managed) + read replica for insights, Centrifugo or a dedicated realtime tier if sockets exceed ~50k, region near the Gulf (e.g. AWS me-central-1) if latency demands |

Code does not change between stages. Only env vars and deployment manifests do.

## 15. Open source we use and reference

**Direct dependencies** (all permissive licences unless noted):
- Next.js, React, NestJS, Fastify, Socket.IO + Redis adapter, BullMQ
- Drizzle ORM, PostgreSQL, Valkey, Better Auth
- next-intl, Serwist, TanStack Query/Table, shadcn/ui + Radix, Tailwind, dnd-kit, Recharts, zod
- sharp, qrcode, @react-pdf/renderer, ExcelJS, papaparse, pino
- Vitest, Playwright, Testcontainers, fast-check, axe-core
- Coolify (Apache-2.0)
- Langfuse (MIT core)

**Reference projects** (study patterns; check the licence before copying any code):

| Project | What to learn |
|---|---|
| **TastyIgniter Group Order** (MIT) | Group-order UX: host invites, host pays all or split, spending limits, reminders |
| **qr-ordering-rag** | Table-token rate limiting (diners share Wi-Fi), WebSocket kitchen queue, assistant fallback when the internet is down |
| **FeastQR** | Next.js QR-menu SaaS structure, print templates |
| **split-bill** | Atomic claim operations; reconcile per-person amounts "to the last cent"; tax and service follow the bill |
| **EatSync** | Shared cart with lock/ready status, user-wise split |
| **Docling / Marker / OpenDataLoader PDF** | Fallback PDF/table parsing if needed. Primary extraction uses Claude vision + native PDF input. |

## 16. Future integrations (interfaces defined now, implemented later)

```ts
interface PosAdapter {            // packages/shared/integrations/pos.ts
  id: 'omega' | 'bimpos' | 'foodics' | string;
  syncMenu(restaurantId: string): Promise<PosMenuSyncResult>;
  pushRound(round: AcceptedRoundDTO): Promise<{ externalOrderId: string }>;
  fetchBill?(sessionId: string): Promise<PosBill>;
}
interface PaymentAdapter {        // packages/shared/integrations/payments.ts
  id: 'areeba' | 'netcommerce' | 'whish' | string;
  createIntent(input: PaymentIntentInput): Promise<{ redirectUrl?: string; reference: string }>;
  handleWebhook(req: RawWebhook): Promise<PaymentEvent>;
}
```

Both are behind feature flags, with one implementation per provider in the `integrations` module.
