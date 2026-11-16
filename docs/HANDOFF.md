# HANDOFF — start every session here

This file lets a fresh session continue the work with no chat history. **One task per session.** Read this file, do the one task under "Next up", update this file and `docs/PROGRESS.md`, commit, push, stop.

Keep it short and current. If something here is wrong, fix it in the same commit as your work.

## 1. Where we are

- **Phase 0 (foundation):** merged to `master` (PR #1). Owner approved on 2026-11-10.
- **Phase 1 (data model, auth, tenancy):** in progress on branch **`phase/01-data-auth-tenancy`**. One PR to `master` at the end. The owner approved the plan in `docs/plans/phase-01-plan.md` on 2026-11-11; its design decisions (ADR-021 to ADR-030) are binding.

| Task | State | Notes |
|---|---|---|
| P1-T01 Drizzle setup | ✅ committed, CI green | |
| P1-T02 Full schema | ✅ committed, CI green | 52 tables; ADR-022 |
| P1-T03 Roles and RLS | ✅ committed, CI green | ADR-021; tenancy suite in `packages/db/src/rls.int.test.ts` |
| P1-T04 Better Auth (.a server, .b console, .c orgs + invites) | ✅ committed, CI green | Docs not written yet (see "Docs debt") |
| P1-T05 Authorisation layer | ✅ committed | CI result not yet checked; docs not written yet |
| P1-T06 Super admin, staff devices, PIN | 🟨 in progress | See "Next up" |
| P1-T07 Audit and outbox | ⬜ | |
| P1-T08 Seed Beit Tayta | ⬜ | |
| Security review of T01–T03 | ⬜ | Was started twice and cut off; never finished |
| Docs pass, PR, demo checkpoint | ⬜ | |

**Last verified numbers (2026-11-15, commit `725eab0`):** lint, typecheck, build pass; integration tests API 92, db 32, worker 9; Playwright 49 (en + ar). Locally 2 tests in `@radd/config` fail by design (they need PostgreSQL 17).

## 2. Next up (in this order, one per session)

Each has a ready prompt in `docs/sessions/`. Paste the prompt into a new session.

1. **`docs/sessions/01-p1-t06.md`** — super admin, staff devices, PIN sessions.
   - A previous session started this. **Check `git status` first:** if there are uncommitted files under `apps/api/src/admin`, `apps/api/src/staff`, `apps/api/src/authz` or a new migration, that is unfinished T06 work. Read it, finish it, do not start over.
2. **`docs/sessions/02-p1-t07.md`** — audit and outbox.
3. **`docs/sessions/03-p1-t08.md`** — seed.
4. **`docs/sessions/04-security-review.md`** — independent attack review of RLS, auth and PIN sessions; fix what it finds.
5. **`docs/sessions/05-docs-and-pr.md`** — docs pass, open the Phase 1 PR, stop at the demo checkpoint.

When a task is done: tick it in the table above, move "Next up" forward, add its PROGRESS row.

## 3. Start of every session (2 minutes)

```bash
git fetch origin && git checkout phase/01-data-auth-tenancy && git pull
source infra/scripts/agent-env.sh        # Node 24, pnpm, Playwright browser, TEST_* URLs
infra/scripts/agent-services.sh          # local PostgreSQL 16 + Redis, dev database, .env
pnpm install && pnpm db:migrate
git status --short                       # anything uncommitted is unfinished work: read it first
```

- The cloud container has **no Docker**. `agent-services.sh` replaces `pnpm dev:infra`. Run it again whenever Postgres or Redis is down (the container stops them when idle).
- A new shell loses the environment: `source infra/scripts/agent-env.sh` again.
- On a normal developer machine with Docker, ignore both scripts and follow the README.

## 4. Gates (run before every commit)

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm format:check
pnpm exec turbo run test:int --continue   # expect only the 2 @radd/config PostgreSQL-17 failures locally
pnpm openapi                               # after any API route change; commit the regenerated files
node scripts/check-i18n.mjs                # after any message change (en and ar must match)
```

Browser tests (needed when console or diner behaviour changes):

```bash
pnpm build
node infra/scripts/mail-catcher.mjs &                                    # stands in for Mailpit
(cd apps/api && node --enable-source-maps --env-file=../../.env dist/main.js &)
(cd apps/worker && node --enable-source-maps --env-file=../../.env dist/main.js &)
(pnpm --filter @radd/console start &) ; (pnpm --filter @radd/diner start &)
E2E_NO_WEBSERVER=1 E2E_API_URL=http://localhost:4000 pnpm test:e2e
# stop every server you started before you finish
```

**CI is the reference** (PostgreSQL 17, Valkey 8, Mailpit, Docker images under 250 MB). After pushing, check the runs for the branch with the GitHub tools; a task that depends on Docker is ✅ only when CI is green. Fix a red run before starting anything else.

## 5. Rules that are easy to miss

- **Commits:** Conventional Commits, small, one concern each. A commit hook runs lint-staged and commitlint: if `git commit` prints an error, the commit did not happen — read the output. Never rewrite pushed history.
- **Never weaken, skip or delete a safety test** (tenancy, auth, allergen, money). Fix the code or stop and report.
- **New table:** needs `organization_id` (or a deliberate entry on the global allowlist), `orgIdUnique` if referenced, composite `tenantFk` references, explicit `GRANT`s and `enable_tenant_rls()` in a NEW migration, a row in `packages/db/src/testing/tenant-fixture.ts`, and the privilege matrix in `packages/db/src/rls.int.test.ts`. The tests fail until all are done.
- **Migrations:** schema change → `pnpm db:generate` (repo root). Hand-written SQL → `cd packages/db && pnpm exec drizzle-kit generate --custom --name=<name>`. Never edit an applied migration (`0000`–`0003` and later ones already pushed). Never `drizzle-kit push`.
- **The API cannot import `drizzle-orm` directly** (CommonJS API vs ESM package types). Queries and repositories live in `packages/db` and are exported from there.
- **Every API route declares a policy** (`@RequirePermission`, `@AuthenticatedOnly`, `@Public`, or the admin policy). `apps/api/test/route-policy.test.ts` fails otherwise. Services also call `assertCan`.
- **Better Auth** is pinned at 1.7.18. Its docs for that tag: `https://raw.githubusercontent.com/better-auth/better-auth/v1.7.18/docs/content/docs/<path>.mdx` (for example `plugins/organization.mdx`, `plugins/2fa.mdx`, `concepts/plugins.mdx`, `plugins/admin.mdx`, `concepts/session-management.mdx`). Always check the installed types under `apps/api/node_modules/better-auth/dist` before using an API.
- **Dependencies:** exact versions, at least 3 days old. After adding one to the API or worker, check the production install stays small: `pnpm --filter @radd/api deploy --prod --legacy --ignore-scripts /tmp/x && du -sm /tmp/x`. The root `.pnpmfile.cjs` strips Better Auth's unused framework peers; without it the API image grows from ~130 MB to 530 MB.
- **Docs stay truthful:** a deviation from a spec is fixed in that spec and explained in `docs/DECISIONS.md` in the same PR.
- **Arabic and English:** every console string in both catalogues; check RTL, 360 px, keyboard.

## 6. Where things are

| Need | Location |
|---|---|
| Rules of the project | `CLAUDE.md` |
| Task list and acceptance criteria | `docs/IMPLEMENTATION_PLAN.md` (Phase 1 starts at "PHASE 1") |
| Approved Phase 1 plan and design decisions | `docs/plans/phase-01-plan.md` |
| Decisions made so far | `docs/DECISIONS.md` (ADR-021 roles, ADR-022 RLS are written; ADR-023 to ADR-030 are described in the plan but not yet written) |
| Per-task log and "Needs owner" | `docs/PROGRESS.md` |
| Database: schema, migrations, RLS, tenant helpers, test database | `packages/db/src/schema/*`, `packages/db/drizzle/*`, `packages/db/sql/bootstrap-roles.sql`, `packages/db/src/tenant.ts`, `packages/db/src/testing/*` |
| Auth server | `apps/api/src/auth/*` (config, Fastify bridge, session hook, rate limit, mailer) |
| Permissions | `packages/shared/src/permissions.ts`, `apps/api/src/authz/*` |
| Organisations, invitations, restaurants | `apps/api/src/organizations/*`, `apps/api/src/restaurants/*` |
| Audit placeholder to replace in T07 | `apps/api/src/audit/audit.seam.ts` (grep `recordAuditLater`) |
| Mail | `packages/mail` (interface, SMTP, templates); worker processor `apps/worker/src/processors/notify-email.processor.ts` |
| Console account pages and shells | `apps/console/src/app/(auth)`, `(owner)`, `(staff)`, `(kitchen)`, `(admin)` |
| Integration test patterns | `apps/api/test/auth.int.test.ts`, `organizations.int.test.ts`, `authz.int.test.ts`, `test/support/*` |
| Browser tests | `e2e/*.spec.ts`, `playwright.config.ts` |

## 7. Docs debt (do in session 05, or earlier if you touch the area)

- `docs/PROGRESS.md`: rows for P1-T03 (mark ✅, CI 41 / Docker 23), P1-T04.a/.b/.c, P1-T05 and later tasks.
- `docs/DECISIONS.md`: write ADR-023 to ADR-030 from `docs/plans/phase-01-plan.md`, adjusted to what was built. Known facts to record:
  - ADR-023: Better Auth responses keep their own JSON shape under `/v1/auth/*`; malformed IDs give 400 `INVALID_ID`; link-based reset and verification, social sign-in and emailed two-factor codes are disabled; `verify-email` cannot sign in a verified or two-factor account; the Origin check stays on in tests; rate limiter fails closed.
  - ADR-029: codes are sent by the API directly, invitations through the `notify.email` queue; new package `packages/mail`; invitations last 7 days.
  - ADR-025: the final action list and matrix (in `packages/shared/src/permissions.ts`); staff may "86" an item and reopen a `bill_requested` session.
  - New ADR: `.pnpmfile.cjs` and why.
- `docs/API.md` §2 and §4: `/v1/auth/*` exception, `x-radd-locale` header, `GET /v1/me`, organisation, invitation and restaurant endpoints, new error codes (`EMAIL_NOT_VERIFIED`, `NOT_A_MEMBER`, `ORG_SUSPENDED`, `ORG_LIMIT_REACHED`, `ALREADY_A_MEMBER`, plus T06's).
- `CLAUDE.md` §5 repository layout: add `packages/mail`. `DEPLOYMENT.md`: worker connects as `app_worker` (decide the env variable in T07).

## 8. Known risks, not yet addressed

- A tenant-scoped request holds one pooled connection while Better Auth takes a second (organisation rename, invitations). Under load the pool of 20 could stall. Options: lazy transaction, or opt those routes out.
- Two simultaneous organisation creates can exceed the 3-organisation limit; a slug clash in the gap between check and insert is a 500.
- An invitation row can exist without its email if the queue is down at that moment (re-inviting replaces it).
- Verification identifiers store the email in plain text (`sign-in-otp-<email>`).
- Console pages are ~72 KB heavier (zod) than the old placeholder.
- No browser coverage yet for turning two-factor off or for the staff and kitchen shells (seeded users arrive in T08).

## 9. Owner

The owner is not a developer. Reports: plain language, lead with what works and what does not, no file dumps. Stop and wait at the Phase 1 demo checkpoint (session 05).
