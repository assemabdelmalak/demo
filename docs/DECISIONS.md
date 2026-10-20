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
