# PROGRESS — Radd Menu

Claude Code keeps this file up to date after **every** task.

- **Status values:** ⬜ todo · 🟨 in progress · ✅ done · ⛔ blocked
- **Needs owner:** list anything A must do, such as keys, accounts, copy or decisions.

## Current phase

Phase 0 — Foundation (in progress on branch `phase/00-foundation`, PR to `master`)

**Environment note.** The agent's container has no Docker daemon. Anything that needs Docker (`pnpm dev:infra`, `pnpm test:int`, e2e-smoke, image builds) is verified in GitHub Actions. A task that depends on Docker is marked ✅ only after its CI job is green; until then it stays 🟨 "awaiting CI".

## Needs owner

- [ ] (example) ANTHROPIC_API_KEY for staging evals

## Log

Phase 0 tasks were split into sub-tasks (IMPLEMENTATION_PLAN "Size") and run in this order, because the API and worker integration tests need the T07 test helpers and the T06 smoke tests need the T07.b Playwright config:
T01 → T02 → T03 → T07.a → T04.a–c → T05 → T04.d → T06.a–c → T07.b → T08 → T09 → T10.

| Task | Status | Date | Notes / follow-ups | PR |
|---|---|---|---|---|
| P0-T01 Monorepo scaffold | ✅ | 2026-10-20 | pnpm 10 + Turborepo 2, Node 24, TS 5.9 strict, `packages/config` (tsconfig bases, ESLint 10 flat configs, Prettier), lefthook + lint-staged + commitlint (bad messages rejected), Renovate, CI lint/format/typecheck green ([run 1](https://github.com/assemabdelmalak/demo/actions/runs/39401029840)). | |
| P0-T02 Env configuration | 🟨 | 2026-10-20 | `@radd/config/env`: zod schema per app, `loadEnv` / `loadEnvOrExit` (lists every problem, never echoes values), placeholder secrets rejected in staging/production, browser-safe public schemas, drift tests against `.env.example` (22 unit tests). Apps call it from T04–T06; the client-bundle secret grep lands in T08. | |
| P0-T03 Local infrastructure | ✅ | 2026-10-20 | `infra/docker-compose.dev.yml`: pgvector pg17 (extensions + local-only roles), Valkey 8 (password, AOF), SeaweedFS S3 (buckets, anonymous read on `radd-assets`, CORS for :3000/:3001; replaces MinIO, ADR-013), Mailpit; ports on 127.0.0.1. `infra/scripts/smoke-infra.sh` runs in the CI `infra-smoke` job. S3 checks verified locally against the SeaweedFS 4.48 binary; all services healthy and every check green in CI ([run 4](https://github.com/assemabdelmalak/demo/actions/runs/39402235813)). | |
| P0-T07.a Test harness: Vitest + Testcontainers | 🟨 | 2026-10-20 | Root `vitest.config.ts` (`test.projects`), shared `raddProject()` (unit vs `*.int.test.ts`, `@radd/source` resolution, SWC for Nest decorators), `@radd/config/testing` with `startPostgres()` (migrate hook for P1-T01) and `startValkey()`, `TEST_DATABASE_URL` / `TEST_VALKEY_URL` overrides. Without Docker, integration suites skip locally with a reason and fail in CI. Valkey test verified locally against `redis-server`; Postgres container test awaits the CI `test-int` job. | |
| P0-T04.a API bootstrap: logger, request ID, errors, live health | ⬜ | | | |
| P0-T04.b API security: Helmet, CORS, rate limiting | ⬜ | | | |
| P0-T04.c API idempotency | ⬜ | | | |
| P0-T05 Worker skeleton | ⬜ | | | |
| P0-T04.d API readiness, Swagger, `pnpm openapi` | ⬜ | | | |
| P0-T06.a Next.js apps (diner, console) | ⬜ | | | |
| P0-T06.b `packages/ui`: tokens, theme, primitives | ⬜ | | | |
| P0-T06.c `packages/api-client` | ⬜ | | | |
| P0-T07.b Test harness: Playwright, axe, Lighthouse CI | ⬜ | | | |
| P0-T08 CI pipeline | ⬜ | | | |
| P0-T09 Observability bootstrap | ⬜ | | | |
| P0-T10 Docs scaffolding | ⬜ | | | |

Add rows for later phases when each phase starts.

## Demo checkpoint sign-offs

| Phase | Date | Owner verdict | Notes |
|---|---|---|---|
| P0 | | | |
