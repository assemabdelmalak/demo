# CLAUDE.md — Radd Menu

You are building **Radd Menu**, a production-grade, multi-tenant SaaS for restaurants in Lebanon (then MENA):

- Diners scan a table QR code and get a fast bilingual menu (Arabic + English, French later) with no app install.
- They can ask an AI assistant about dishes, order together as a group, and see a clear **per-person tab**.
- Restaurants import their menu with AI and control every fact the AI says. Allergen answers come **only** from owner-confirmed data.
- Restaurants run orders from staff and kitchen screens and get insights on what diners ask, view and order.

This is **not a throwaway demo**. Build everything the way it will run in production.

Read this whole file at the start of every session.

---

## 1. Read order

1. `CLAUDE.md` (this file)
2. `docs/PRD.md`: what and why
3. `docs/ARCHITECTURE.md`: stack and system design
4. `docs/DATA_MODEL.md`: database schema
5. `docs/IMPLEMENTATION_PLAN.md`: your task list
6. `docs/PROGRESS.md`: where the work currently stands

Then read whichever spec the current task touches: `GROUP_ORDERING.md`, `AI_ARCHITECTURE.md`, `ALLERGEN_SAFETY.md`, `API.md`, `UX_SPEC.md`, `SECURITY.md`, `TESTING.md`, `DEPLOYMENT.md`, `SEED_DATA.md`.

When specs conflict, the earlier one in this list wins:

**ALLERGEN_SAFETY → SECURITY → GROUP_ORDERING / AI_ARCHITECTURE → DATA_MODEL / API → UX_SPEC → IMPLEMENTATION_PLAN task text**

---

## 2. How to work

1. **Follow `docs/IMPLEMENTATION_PLAN.md` in order.** Task IDs look like `P4-T07`. Don't skip ahead. Don't build features from later phases early.
2. **Start every phase in plan mode.**
   - Summarise the phase goal.
   - List its tasks and the files and modules you will touch.
   - List any open questions.
3. **Resolve ambiguity yourself.** Pick the option that is, in this order:
   - (a) safer for diners;
   - (b) simpler to operate;
   - (c) easier to change later.
   Record the choice in `docs/DECISIONS.md` as an ADR, then continue.
4. **For each task:** implement → write tests → run `pnpm lint && pnpm typecheck && pnpm test` → update `docs/PROGRESS.md` → commit using Conventional Commits, e.g. `feat(sessions): add participant join flow`.
5. **For each phase:**
   - Work on branch `phase/NN-short-name` and open one PR to `main`.
   - The PR body is the task checklist plus the "How to demo" steps from the plan.
   - At every **Demo checkpoint**, stop and wait for the owner's review unless told to continue.
6. **Keep docs truthful.** If the implementation has to deviate from a spec, update that spec in the same PR and explain why in `DECISIONS.md`.
7. **Library APIs move fast.**
   - Before using a library API, check its current documentation (context7 MCP or web, if available).
   - Pin exact versions.
   - Add a Renovate config in P0 to keep dependencies current.
   - For Anthropic API details (model IDs, structured outputs, tool use, prompt caching, effort, batches), check https://platform.claude.com/docs before coding against them.
8. **Prefer small, reviewable commits.** Never mix refactors with features.
9. **Missing account or secret:** build against the local or mock adapter, add a line `Needs owner: …` to `PROGRESS.md`, and continue.

---

## 3. Non-negotiable rules

1. **Allergen safety** (see `docs/ALLERGEN_SAFETY.md`).
   - Diners only see allergen statuses that the restaurant confirmed (`menu_item_allergens.confirmed_at IS NOT NULL`). Anything else shows as *"Not confirmed — ask staff."*
   - The LLM never composes allergen facts. Allergen information reaches the diner through a deterministic **Allergen Card** rendered from the database.
   - An output guard blocks any AI sentence claiming a dish is safe for, free from, or without an allergen.
2. **Money.**
   - Integers in minor units only (USD cents; LBP whole pounds). No floats, ever.
   - All money maths lives in `packages/shared/money` and `packages/shared/billing`, with property-based tests.
   - Per-person totals must always add up **exactly** to the bill total.
3. **Tenancy.**
   - Every tenant-owned row has `organization_id`, and `restaurant_id` where relevant.
   - All queries go through the tenant repository helpers.
   - PostgreSQL Row Level Security is the backstop. A cross-tenant read must be impossible even with a buggy query.
4. **AI is optional at runtime.**
   - Browsing, ordering, billing and payments must work if Anthropic is down, slow or switched off.
   - Every AI feature has a timeout, a fallback and a kill switch.
5. **Arabic is first-class.**
   - RTL layout, Arabic typography, Arabic search normalisation.
   - Every screen is checked in `ar` and `en`.
   - No hard-coded user-facing strings.
6. **Postgres is the source of truth.**
   - Realtime events are notifications only.
   - Clients resync from REST snapshots when they detect a version gap.
   - Mutations are idempotent and require an `Idempotency-Key` header.
7. **Security** (see `docs/SECURITY.md`).
   - Validate every input with zod.
   - Authorise every action.
   - Rate-limit public endpoints per device or session, not per IP. Diners share restaurant Wi-Fi.
8. **Diners are anonymous.**
   - Diners need no account.
   - Never send diner personal data to third parties.
   - Never log full chat text above debug level.
9. **Never weaken, skip or delete a failing safety test** (allergen guard, tenancy, money) to make CI green. Fix the code, or stop and report.

---

## 4. Tech stack (full rationale in `docs/ARCHITECTURE.md`)

| Layer | Choice |
|---|---|
| Language | TypeScript (strict) everywhere. Node.js 24 LTS. pnpm workspaces + Turborepo. |
| Diner app | Next.js 16 (App Router, React 19), Tailwind CSS v4, next-intl, Serwist (PWA / offline) |
| Console (owner / staff / kitchen / admin) | Next.js 16, shadcn/ui (Radix), TanStack Query + Table, dnd-kit, Recharts |
| API | NestJS 11 on the Fastify adapter, zod (nestjs-zod), OpenAPI, Socket.IO gateway with Redis adapter, SSE for AI chat |
| Worker | NestJS standalone application + BullMQ |
| Database | PostgreSQL 17 with pg_trgm, unaccent, citext (pgvector reserved). Drizzle ORM + drizzle-kit. RLS. |
| Cache / queues / pub-sub | Valkey 8 (Redis-compatible, BSD licence) |
| Auth | Better Auth (email+password, email OTP, organization plugin with roles). Custom signed participant tokens for anonymous diners. |
| Storage | S3-compatible: Cloudflare R2 in production, MinIO locally. Images processed with sharp. |
| AI | Anthropic Claude via the official SDK `@anthropic-ai/sdk`, behind `packages/ai`. Haiku 5.5 for diner chat and classification; Sonnet 5.5 for import, translation and summaries; Opus 5.5 as import fallback. Model IDs come from env. Langfuse for tracing and evals. |
| Messaging | Resend + React Email. Meta WhatsApp Cloud API (Phase 9). |
| Observability | Sentry, pino JSON logs, health endpoints, Langfuse |
| Testing | Vitest, Testcontainers, Playwright, fast-check, axe-core, k6, Lighthouse CI |
| Deploy | Docker images → GHCR → Coolify on Hetzner Cloud. Cloudflare for DNS, CDN, WAF and R2. |

---

## 5. Repository layout

```
radd-menu/
├─ apps/
│  ├─ diner/        Next.js public diner PWA            → m.<domain>
│  ├─ console/      Next.js owner/staff/kitchen/admin   → app.<domain>
│  ├─ api/          NestJS REST + Socket.IO + SSE       → api.<domain>
│  └─ worker/       NestJS + BullMQ background jobs
├─ packages/
│  ├─ db/           Drizzle schema, migrations, RLS policies, tenant helpers, seed
│  ├─ shared/       zod schemas, enums, money, billing engine, permissions, domain i18n
│  ├─ ai/           LLM client, prompts, tools, safety guards, evals
│  ├─ ui/           shared React components + design tokens
│  ├─ api-client/   generated OpenAPI types, typed fetch client, socket event types
│  └─ config/       tsconfig, eslint, prettier, env schemas
├─ infra/           docker-compose.dev.yml, Dockerfiles, k6 scripts, ops scripts
├─ docs/
├─ .env.example
└─ CLAUDE.md
```

---

## 6. Commands (created in Phase 0)

| Command | Purpose |
|---|---|
| `pnpm install` | install |
| `pnpm dev:infra` | start Postgres, Valkey, MinIO and Mailpit (docker compose) |
| `pnpm dev` | run all apps in watch mode |
| `pnpm db:generate` | generate a migration from the schema |
| `pnpm db:migrate` | apply migrations |
| `pnpm db:seed` | seed the demo restaurant "Beit Tayta" (idempotent) |
| `pnpm lint` / `pnpm typecheck` / `pnpm build` | quality gates |
| `pnpm test` | unit tests (no Docker, no network) |
| `pnpm test:int` | integration tests (Testcontainers; needs Docker; always runs in CI) |
| `pnpm test:e2e` | Playwright end-to-end tests |
| `pnpm eval:chat` / `pnpm eval:import` | AI evals against the real API. **These cost money**; capped by `EVAL_BUDGET_USD`. |
| `pnpm openapi` | regenerate the OpenAPI spec and `packages/api-client` |

If Docker is not available in your environment, write integration tests anyway. They run in GitHub Actions; note this in `PROGRESS.md`.

---

## 7. Code conventions

- **Strict TypeScript.** No `any` (use `unknown` plus zod). Enable `noUncheckedIndexedAccess`.
- **One schema per DTO.** zod schemas in `packages/shared` are the single source for every DTO. The API, console and diner import the same schemas.
- **Naming.** DB in `snake_case`. TS in `camelCase`. Files in `kebab-case`. React components in `PascalCase`.
- **REST.**
  - Prefix all routes with `/v1`.
  - Errors use RFC 9457 `application/problem+json` with a stable `code`, e.g. `ITEM_UNAVAILABLE`.
  - List endpoints use cursor pagination.
- **NestJS structure.** One module per domain: `auth, restaurants, menu, assets, imports, tables, sessions, orders, billing, payments, staff, kitchen, chat, insights, notifications, subscriptions, admin, health`.
  - Controllers stay thin.
  - Business logic lives in services, pure where possible.
  - DB access goes through repositories that use the tenant helpers.
- **Time.** Store UTC `timestamptz`. Display in the restaurant's timezone (default `Asia/Beirut`).
- **IDs.** UUIDv7, generated in the app.
- **Feature flags.** Use `featureFlags.isEnabled(orgId, key)`.
- **Logging.** pino with a request ID. Never log tokens, secrets, cookies or payment references.
- **Comments.** Explain *why*, not *what*.

---

## 8. Definition of Done (every task)

- [ ] All acceptance criteria in the task are met.
- [ ] Required tests are written and passing. Line coverage is ≥ 95% for `packages/shared/money`, `packages/shared/billing` and `packages/ai/safety`.
- [ ] `lint`, `typecheck` and `build` pass.
- [ ] UI is verified in Arabic (RTL) and English, at 360 px width, with keyboard navigation and visible focus.
- [ ] No console errors. No secrets in code.
- [ ] `docs/PROGRESS.md` is updated, and `docs/DECISIONS.md` if a decision was made.
