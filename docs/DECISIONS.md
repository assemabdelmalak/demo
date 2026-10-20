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
