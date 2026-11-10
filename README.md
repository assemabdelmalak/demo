# Radd Menu — Claude Code handoff package

This package contains the specification for **Radd Menu**, an AI-powered QR menu for restaurants in Lebanon. It covers:

- group table ordering, with a clear per-person tab;
- USD/LBP pricing;
- AI menu import;
- an allergen-safe diner assistant;
- staff and kitchen screens;
- restaurant insights.

The application is built by an AI coding agent, Claude Code, following these documents.

## Files

| File | For | Purpose |
|---|---|---|
| `CLAUDE.md` | Claude Code | Standing instructions, rules, stack, repo layout, commands, Definition of Done. Read first in every session. |
| `OWNER_CHECKLIST.md` | Founder (A) | Everything outside the code: accounts, keys, domain, server, legal, copy review, per-phase test scripts, pilot launch. |
| `.env.example` | Both | All environment variables. |
| `docs/PRD.md` | Both | Product requirements, user stories, scope, plans. |
| `docs/ARCHITECTURE.md` | Claude Code | Stack choices and why, what competitors use, system design, scaling path, open source used. |
| `docs/DATA_MODEL.md` | Claude Code | PostgreSQL schema. |
| `docs/API.md` | Claude Code | REST endpoints, auth, realtime events, rate limits. |
| `docs/GROUP_ORDERING.md` | Both | Group ordering and per-person tab: states, permissions, bill-splitting algorithm with a worked example. |
| `docs/AI_ARCHITECTURE.md` | Both | Plain-language overview of every AI component (Part A), then the full technical spec (Part B). |
| `docs/ALLERGEN_SAFETY.md` | Both | Allergen rules and exact wording in Arabic, English and French. Highest-priority spec. |
| `docs/UX_SPEC.md` | Claude Code | Design system, theme presets, screens, bilingual microcopy. |
| `docs/SECURITY.md` | Claude Code | Threat model and controls. |
| `docs/TESTING.md` | Claude Code | Test strategy and required scenarios. |
| `docs/DEPLOYMENT.md` | Claude Code | Docker, CI/CD, Coolify on Hetzner, Cloudflare, backups. |
| `docs/SEED_DATA.md` | Claude Code | Demo restaurant "Beit Tayta". |
| `docs/IMPLEMENTATION_PLAN.md` | Claude Code | The build plan: 11 phases with tasks, acceptance criteria, tests and demo checkpoints. |
| `docs/PROGRESS.md` | Claude Code | Progress log the agent keeps updated. |
| `docs/DECISIONS.md` | Claude Code | Architecture decision records. |

## Start

1. Create a private GitHub repo and put these files at its root.
2. Open Claude Code on the repo.
3. Paste the kickoff prompt from `OWNER_CHECKLIST.md` §0.

## Developer quickstart

**Prerequisites:** Node.js 24 (`.nvmrc`), pnpm 10 via Corepack (`corepack enable`), and Docker for local infrastructure.

```bash
pnpm install            # also installs git hooks (lefthook: lint-staged + commitlint)
cp .env.example .env    # local defaults; every app validates its env at start-up
pnpm dev:infra          # Postgres, Valkey, SeaweedFS (S3) and Mailpit in Docker
pnpm dev                # api, worker, diner and console in watch mode
```

| What | URL |
|---|---|
| Diner app | http://localhost:3000 |
| Console | http://localhost:3001 |
| API readiness / API docs | http://localhost:4000/v1/health/ready · http://localhost:4000/v1/docs |
| Worker health | http://localhost:4100/healthz |
| Mailpit (local email) | http://localhost:8025 |
| SeaweedFS admin (local S3) | http://localhost:9001 |

English is the default language; the **ع / EN** switch changes it and is remembered (ADR-009).

Quality gates (CI runs the same):

```bash
pnpm lint && pnpm typecheck && pnpm test    # no Docker or network needed
pnpm test:int                               # Testcontainers; needs Docker
pnpm build && pnpm test:e2e:smoke           # Playwright; run `pnpm exec playwright install chromium` once.
                                            # With the stack running, E2E_API_URL=http://localhost:4000 adds the API checks.
pnpm openapi                                # regenerate the OpenAPI spec and packages/api-client
pnpm dev:infra:down                         # stop local infrastructure
```

Commits must follow [Conventional Commits](https://www.conventionalcommits.org/), e.g. `feat(sessions): add participant join flow`. All commands are listed in `CLAUDE.md` §6.
