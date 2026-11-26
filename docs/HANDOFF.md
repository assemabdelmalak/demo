# HANDOFF — the one file to read first

This is the central record of the project: what is done, what is next, how to set up, the rules,
the risks and what only the owner can do. Any session, on any day, starts here and can continue
where the last one stopped with no chat history.

**One task per session.** Read this file, do the one task at the top of §3 "Next up", update this
file and `docs/PROGRESS.md`, commit, push, stop. If something here is wrong, fix it in the same
commit as your work.

---

## 0. For the owner: what to paste into a new session

Open a new Claude Code session on the repository and paste this. It works for every task; the
session finds its task in §3.

> Read docs/HANDOFF.md and follow it. Do the first task in its "Next up" list and nothing else.
> You may push to the branch named in HANDOFF §4 ("Branches") as well as to your own session
> branch. When the gates pass and CI is green, update docs/HANDOFF.md (status, session log, next
> up, risks) and docs/PROGRESS.md, push, and give me a short plain-language report: what works
> now, the test numbers, and anything I need to decide.

The second sentence matters: cloud sessions are only allowed to push to their own `claude/…`
branch unless you say otherwise. Without it, the session leaves its work on its own branch and
the next session must pick it up from there (§4 explains how).

Per-task prompts with more detail are in `docs/sessions/` (one file per task); the prompt above is
enough on its own.

---

## 1. The project in one paragraph

**Radd Menu** is a multi-tenant SaaS for restaurants in Lebanon: diners scan a table QR code and
get a fast bilingual menu (English default, Arabic first-class), can ask an AI assistant, order
together and see a per-person tab; restaurants import menus with AI, confirm allergen facts
(the AI never composes them), and run orders from staff and kitchen screens. Rules and stack:
`CLAUDE.md`. What and why: `docs/PRD.md`. The build plan (11 phases, task IDs like `P4-T07`):
`docs/IMPLEMENTATION_PLAN.md`.

---

## 2. Where we are

### All phases

| Phase | Name | State |
|---|---|---|
| P0 | Foundation | ✅ merged to `master` ([PR #1](https://github.com/assemabdelmalak/demo/pull/1)), owner sign-off 2026-11-10 |
| **P1** | **Data model, auth, tenancy** | **🟨 in progress** (T01–T08 and the security review done; docs + PR left) |
| P2 | Restaurant setup and menu management (console) | ⬜ |
| P3 | Diner menu PWA | ⬜ |
| P4 | Table sessions and group ordering | ⬜ |
| P5 | Bill and per-person tab | ⬜ |
| P6 | AI menu import and translation | ⬜ |
| P7 | Diner AI assistant | ⬜ |
| P8 | Insights | ⬜ |
| P9 | Platform: plans, admin, notifications, WhatsApp | ⬜ |
| P10 | Hardening and launch | ⬜ |

### Phase 1 tasks

The owner approved the plan in `docs/plans/phase-01-plan.md` on 2026-11-11; its design decisions
(ADR-021 to ADR-030) are binding.

| Task | State | Notes |
|---|---|---|
| P1-T01 Drizzle setup | ✅ CI green | `packages/db` |
| P1-T02 Full schema | ✅ CI green | 52 tables; ADR-022 |
| P1-T03 Roles and RLS | ✅ CI green (CI 41, Docker 23) | ADR-021; tenancy suite `packages/db/src/rls.int.test.ts` |
| P1-T04 Better Auth (.a server, .b console, .c orgs + invites) | ✅ CI green | ADR text not written yet (§9) |
| P1-T05 Authorisation layer | ✅ CI green ([CI 52](https://github.com/assemabdelmalak/demo/actions/runs/43926461166)) | ADR text not written yet (§9) |
| P1-T06 Super admin, staff devices, PIN | ✅ CI green ([CI 62](https://github.com/assemabdelmalak/demo/actions/runs/45254520210), [Docker 34](https://github.com/assemabdelmalak/demo/actions/runs/45254520229)) | Done 2026-11-23, see §12 |
| P1-T07 Audit and outbox | ✅ CI green ([CI 68](https://github.com/assemabdelmalak/demo/actions/runs/45630173651), [Docker 38](https://github.com/assemabdelmalak/demo/actions/runs/45630173552)) | Done 2026-11-25, see §12 |
| P1-T08 Seed Beit Tayta | ✅ CI green ([CI 72](https://github.com/assemabdelmalak/demo/actions/runs/45739297307), [Docker 42](https://github.com/assemabdelmalak/demo/actions/runs/45739297263)) | Done 2026-11-26, see §12; ADR-033 |
| Security review of Phase 1 | ✅ CI green ([CI 78](https://github.com/assemabdelmalak/demo/actions/runs/45838997014), [Docker 47](https://github.com/assemabdelmalak/demo/actions/runs/45838996851)) | Done 2026-11-26, see §12; report `docs/SECURITY_REVIEW_P1.md` |
| Docs pass, Phase 1 PR, demo checkpoint | ⬜ **next** | Stops for the owner's review |

**Last verified numbers (2026-11-26, after the per-address limits):** lint, typecheck, format and
build pass. Unit tests: shared 524, api 107, config 62, console 50, ui 46, db 32, mail 10,
worker 9, diner 6, api-client 2. Integration: api 124, db 52, worker 14, config 2 of 4 (the other
2 assert PostgreSQL 17 and pgvector and fail on the local PostgreSQL 16 by design; green in CI).
Playwright: 57 passed (en + ar) after P1-T08; not re-run locally after the review (API-only
changes), CI's e2e-smoke is green on it.

---

## 3. Next up (in this order, one per session)

Each has a detailed prompt in `docs/sessions/`; the universal prompt in §0 also works.

1. **Docs pass, Phase 1 PR, demo checkpoint** — `docs/sessions/05-docs-and-pr.md`. Stops and
   waits for the owner. The PR's demo steps can now use the seeded accounts. Link
   `docs/SECURITY_REVIEW_P1.md` in the PR body and list its open items (L1–L7; F1, F2, M1 and M2
   are fixed).
2. **Phase 2 plan** — start in plan mode: summarise the phase goal, list P2-T01…T11 and the files
   to touch, list open questions, wait for approval (CLAUDE §2.2). Then one task per session.

After Phase 1 the queue is the plan itself, task by task (titles from `IMPLEMENTATION_PLAN.md`):

- **P2** settings · assets pipeline · categories · items editor · modifier groups · ingredients ·
  allergen workflow · preview and publish · live availability · tables and QR printing · team
  management (device and PIN screens go here).
- **P3** routing and data · menu layout and theming · money formatting · dish sheet · search and
  filters · PWA and offline · analytics client · performance and accessibility pass.
- **P4** device identity · join flow · realtime gateway · session state · draft items · shared
  items · table bar · rounds · staff live floor · kitchen display · waiter calls · lifecycle ·
  staff-entry mode · group-ordering E2E suite.
- **P5** billing engine · bill API and diner tab · staff bill and payments · close and receipts ·
  daily report.
- **P6** `packages/ai` foundation · import pipeline · import wizard · translation · allergen
  suggestions · import evals.
- **P7** context runtime · tools · safety module · chat orchestrator (SSE) · chat UI · console AI
  settings · chat evals · latency and cost.
- **P8** event pipeline · daily rollups · chat classification · insights dashboard · weekly summary.
- **P9** plans and quotas · manual subscriptions · super admin console · notifications · owner
  WhatsApp (stretch) · legal and consent.
- **P10** security review · load test · backups and restore drill · production deployment ·
  runbooks · pilot readiness.

Each phase: one branch `phase/NN-short-name`, plan mode first, one PR to `master`, stop at its
demo checkpoint (CLAUDE §2.5).

---

## 4. Branches and sessions

- **Phase branch (the shared truth):** `phase/01-data-auth-tenancy`. The Phase 1 PR goes from it
  to `master`.
- **Session branches:** every cloud session is given its own branch named `claude/<words>` and
  may only push there unless the owner's prompt allows the phase branch too (§0).
- **At the start of a session,** find the newest work. The session log (§12) names the branch
  each session pushed to. If that branch is ahead of the phase branch, the newest work is there:

  ```bash
  git fetch origin
  git log --oneline origin/phase/01-data-auth-tenancy..origin/<last-session-branch>   # unmerged work
  ```

  Start your session branch from the newest of the two (`git checkout -B <your-branch> origin/<newest>`).
- **At the end of a session,** push your session branch. If you are allowed to push the phase
  branch, fast-forward it to your work (`git push origin HEAD:phase/01-data-auth-tenancy`; never
  force). If not, say in your report that the phase branch needs fast-forwarding, and record your
  branch in §12.
- **Right now:** nothing pending. The security review was done on `ccr-5ac9a7bd-5ahjj9` and the
  phase branch was fast-forwarded to it (the owner's prompt allowed it), so start from
  `origin/phase/01-data-auth-tenancy`.

---

## 5. Start of every session (2 minutes)

```bash
git fetch origin && git checkout -B <your-branch> origin/<newest branch from §4>
source infra/scripts/agent-env.sh        # Node 24, pnpm, Playwright's Chromium, TEST_* URLs
infra/scripts/agent-services.sh          # local PostgreSQL 16 + Redis, dev database, .env
pnpm install && pnpm db:migrate
git status --short                       # anything uncommitted is unfinished work: read it first
pnpm db:seed                             # optional: the demo restaurant (add --with-session for tables 5 and 9)
```

- The cloud container has **no Docker**. `agent-services.sh` replaces `pnpm dev:infra`. Run it
  again whenever Postgres or Redis is down (the container stops them when idle). It also appends
  any variable `.env.example` gained to an existing `.env` (e.g. `DATABASE_URL_WORKER`).
- A new shell loses the environment: `source infra/scripts/agent-env.sh` again.
- On a normal developer machine with Docker, ignore both scripts and follow the README.

## 6. Gates (before every commit)

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm format:check
pnpm exec turbo run test:int --continue   # expect only the 2 @radd/config PostgreSQL-17 failures locally
pnpm openapi                               # after any API route change; commit the regenerated files
node scripts/check-i18n.mjs                # after any message change (en and ar must match)
```

Browser tests (when console or diner behaviour changes):

```bash
pnpm build
node infra/scripts/mail-catcher.mjs &                                    # stands in for Mailpit
(cd apps/api && node --enable-source-maps --env-file=../../.env dist/main.js &)
(cd apps/worker && node --enable-source-maps --env-file=../../.env dist/main.js &)
(pnpm --filter @radd/console start &) ; (pnpm --filter @radd/diner start &)
E2E_NO_WEBSERVER=1 E2E_API_URL=http://localhost:4000 pnpm test:e2e
# stop every server you started before you finish
```

**CI is the reference** (PostgreSQL 17, Valkey 8, Mailpit, Docker images under 250 MB). CI runs
on every push, any branch. After pushing, check the runs with the GitHub tools; a task that
depends on Docker is ✅ only when CI is green. Fix a red run before starting anything else.

## 7. Rules that are easy to miss

- **Commits:** Conventional Commits, small, one concern each. A hook runs lint-staged and
  commitlint: if `git commit` prints an error, the commit did not happen. Never rewrite pushed
  history.
- **Never weaken, skip or delete a safety test** (tenancy, auth, allergen, money). Fix the code or
  stop and report. Fixing a test *fixture* that no longer produces a valid input is allowed only
  when every assertion stays the same, and must be explained in the commit (see §12, P1-T06).
- **New table:** needs `organization_id` (or a deliberate entry on the global allowlist),
  `orgIdUnique` if referenced, composite `tenantFk` references, explicit `GRANT`s and
  `enable_tenant_rls()` in a NEW migration, a row in `packages/db/src/testing/tenant-fixture.ts`,
  and the privilege matrix in `packages/db/src/rls.int.test.ts`. The tests fail until all are done.
- **Migrations:** schema change → `pnpm db:generate` (repo root). Hand-written SQL →
  `cd packages/db && pnpm exec drizzle-kit generate --custom --name=<name>`. Never edit an applied
  migration (`0000`–`0005` are applied). Never `drizzle-kit push`.
- **The API cannot import `drizzle-orm`** (CommonJS API vs ESM types). Queries and repositories
  live in `packages/db`. Inside a Drizzle `sql` template, columns render **without their table**:
  qualify by hand in correlated subqueries.
- **Every mutation is audited** with `AuditService.record(...)` inside its tenant transaction
  (`recordIn` for the admin pool, `recordPlatform` for entries with no organisation); never pass
  secrets in `before`/`after` (a redaction list is only the backstop). **Realtime changes** go
  through `OutboxService.add(tx, ...)` in the same transaction, with rooms from `realtimeRooms`
  (`@radd/shared`); never emit to Socket.IO directly. ADR-028, ADR-031.
- **The worker reads `DATABASE_URL_WORKER`** (`app_worker`), not `DATABASE_URL`. A worker test
  without a database passes `outbox: false` to `WorkerModule.register`.
- **Every API route declares a policy** (`@RequirePermission`, `@AuthenticatedOnly`, `@Public`,
  `@RequireSuperAdmin`); `apps/api/test/route-policy.test.ts` also pins the exact list of public
  and super-admin routes. Every new console route also gets a row in the matrix in
  `apps/api/test/authz.int.test.ts` (SECURITY §3). Services still call `assertCan`.
- **Better Auth** is pinned at 1.7.18. Docs for that tag:
  `https://raw.githubusercontent.com/better-auth/better-auth/v1.7.18/docs/content/docs/<path>.mdx`.
  Check the installed types under `apps/api/node_modules/better-auth/dist` before using an API.
- **Dependencies:** exact versions, at least 3 days old. After adding one to the API or worker,
  check the production install: `pnpm --filter @radd/api deploy --prod --legacy --ignore-scripts <dir> && du -sm <dir>`
  (193 MB raw after P1-T06; the image prunes maps and types). `.pnpmfile.cjs` strips optional
  peers that drag dev tools in (Better Auth's frameworks, valibot's TypeScript).
- **The seed** (`pnpm db:seed [--with-session]`, ADR-033) is the demo restaurant of
  `docs/SEED_DATA.md`; later safety tests and evals rely on its allergen statuses. Change
  `packages/db/src/seed/data.ts` only together with SEED_DATA (the unit test restates its allergen
  table by hand and fails on drift). Tests name seeded rows with `SEED_IDS` / `seedIds` from
  `@radd/db/seed`. Rows are written only when they differ, so a second run must print "0 rows
  created, 0 updated" (CI checks it). A new tenant table the demo needs gets its rows in
  `rows.ts`, written through `upsertRows` inside the seed's `withTenant`. P2-T08 must make the
  seed publish and set the restaurant live; P2-T02 must add the photos.
- **Per-address sign-in limits** (ADR-034): 10 wrong passwords in a row for one address pause its
  password sign-in for 15 minutes, and one address gets at most 5 code emails an hour. A test that
  fails a password more than 9 times for one address, or asks one address for more than 5 codes,
  boots with `auth: { signInLockout: false }` or `codeRequestLimit: false`.
- **Docs stay truthful:** a deviation from a spec is fixed in that spec and explained in
  `docs/DECISIONS.md` in the same PR.
- **Arabic and English:** every console string in both catalogues; check RTL, 360 px, keyboard.
- **The owner is not a developer.** Reports: plain language, what works and what does not first,
  no file dumps.

## 8. Where things are

| Need | Location |
|---|---|
| Project rules | `CLAUDE.md` |
| Tasks and acceptance criteria | `docs/IMPLEMENTATION_PLAN.md` |
| Approved Phase 1 plan and design decisions | `docs/plans/phase-01-plan.md` |
| Decisions made so far | `docs/DECISIONS.md` (ADR-001…022, 028, 031, 033 and 034 written; 023…027, 029, 030 and 032 pending, §9) |
| Detailed per-task log, "Needs owner" | `docs/PROGRESS.md` |
| Database: schema, migrations, RLS, tenant helpers, test DB | `packages/db/src/schema/*`, `packages/db/drizzle/*`, `packages/db/sql/bootstrap-roles.sql`, `packages/db/src/tenant.ts`, `packages/db/src/testing/*` |
| Auth server (Better Auth bridge, sessions, PIN-session gate) | `apps/api/src/auth/*` |
| Permissions and the guard | `packages/shared/src/permissions.ts`, `apps/api/src/authz/*` |
| Staff devices, PINs, PIN switch | `apps/api/src/staff/*`, `packages/db/src/staff-queries.ts`, `packages/db/src/repositories/staff-devices.ts` |
| Super admin (`/v1/admin/orgs`, Bull Board) | `apps/api/src/admin/*`, `packages/db/src/admin-queries.ts` |
| Organisations, invitations, restaurants | `apps/api/src/organizations/*`, `apps/api/src/restaurants/*` |
| Audit log | `apps/api/src/audit/*` (`AuditService`, IP hash and redaction in `audit-state.ts`), `packages/db/src/audit-queries.ts` |
| Outbox and realtime | `apps/api/src/outbox/*`, `packages/db/src/outbox-queries.ts`, `packages/shared/src/realtime.ts` (rooms, envelope), `packages/shared/src/realtime-publisher.ts` (Redis emitter), worker `apps/worker/src/outbox/*`, migration `packages/db/drizzle/0006_outbox_dispatch.sql` |
| Mail | `packages/mail`; worker processor `apps/worker/src/processors/notify-email.processor.ts` |
| Console account pages and shells | `apps/console/src/app/(auth)`, `(owner)`, `(staff)`, `(kitchen)`, `(admin)`; gates in `apps/console/src/lib/session.server.ts` |
| Integration test patterns | `apps/api/test/*.int.test.ts`, `apps/api/test/support/*` |
| Demo seed (Beit Tayta) | `packages/db/src/seed/*` (`data.ts` is SEED_DATA as code; `run.ts` writes it; `main.ts` is `pnpm db:seed`), export `@radd/db/seed` |
| Browser tests | `e2e/*.spec.ts` (shared console helpers in `e2e/console-helpers.ts`; seeded roles in `console.roles.spec.ts`), `playwright.config.ts` |
| Phase 1 security review (findings, requests, real outputs) | `docs/SECURITY_REVIEW_P1.md` |
| Agent setup without Docker | `infra/scripts/agent-env.sh`, `infra/scripts/agent-services.sh`, `infra/scripts/mail-catcher.mjs` |

## 9. Docs debt (session "Docs pass" clears it; earlier if you touch the area)

- `docs/PROGRESS.md`: rows for P1-T03 (mark ✅, CI 41 / Docker 23), P1-T04.a/.b/.c and P1-T05
  (CI 52 / Docker 31). P1-T06 has its row.
- `docs/DECISIONS.md`: write ADR-023 to ADR-027, ADR-029 and ADR-030 from
  `docs/plans/phase-01-plan.md`, as built (ADR-028 outbox and ADR-031 audit were written in
  P1-T07):
  - ADR-023: Better Auth responses keep their JSON shape under `/v1/auth/*`; malformed IDs give
    400 `INVALID_ID`; link-based reset and verification, social sign-in and emailed two-factor
    codes are disabled; `verify-email` cannot sign in a verified or two-factor account; the Origin
    check stays on in tests; the rate limiter fails closed.
  - ADR-025: the final action list and matrix (`packages/shared/src/permissions.ts`); staff may
    "86" an item and reopen a `bill_requested` session; a PIN session never reaches the `org`,
    `team`, `devices` or `account` namespaces.
  - ADR-026 as built: device cookie `__Host-radd_device` over HTTPS (Path=/), `radd_device` with
    Path=/v1 over HTTP; host-only, HttpOnly, SameSite=Lax, one year; an Idempotency-Key replay of
    registration never sets a second cookie. PINs 4–6 digits, weak patterns refused (`isWeakPin`).
    Lockout keys include a fingerprint of the PIN hash, so a manager's new PIN clears lock and
    daily count. 30 switch attempts per device per minute. The switch signs out whoever used the
    tablet before. A PIN session without the device cookie is ignored for that request (not
    ended: the console server renders with the session cookie alone); one older than 12 hours,
    with no device, or with a revoked device is ended. Under `/v1/auth/*` it may call only
    `get-session` (never refreshed) and `sign-out`; the bridge applies this whenever a request
    carries any Cookie header, using Better Auth's own reading of the session (security review
    F1). `pin_hash` and `pin_disabled_at` are not declared to Better Auth at all (F2).
  - ADR-027 as built: `isSuperAdmin` on `/v1/me` uses the same verdict as the guard; the admin
    pool (`app_admin`, max 4 connections, application name `radd-api-admin`) lives in
    `AdminModule` only; Bull Board refuses changes whose `Origin` is not the API's own, and every
    successful change goes to the audit seam with no organisation.
  - ADR-029: codes are sent by the API directly, invitations through `notify.email`; new package
    `packages/mail`; invitations last 7 days.
  - New ADR (next free number, ADR-032): `.pnpmfile.cjs` (Better Auth's framework peers;
    valibot's TypeScript peer).
- `docs/API.md` §2, §4 and §5: `/v1/auth/*` exception, `x-radd-locale` header, `GET /v1/me`
  (with `isSuperAdmin`), organisation, invitation, restaurant, staff-device, member-PIN, switch
  and admin endpoints; error codes `EMAIL_NOT_VERIFIED`, `NOT_A_MEMBER`, `ORG_SUSPENDED`,
  `ORG_LIMIT_REACHED`, `ALREADY_A_MEMBER`, `TWO_FACTOR_REQUIRED`, `DEVICE_REVOKED`, `PIN_LOCKED`,
  and Better Auth's `PIN_SESSION_FORBIDDEN` under `/v1/auth/*`.
- `IMPLEMENTATION_PLAN.md` P1-T06 says the device cookie is on "the console origin": it is on the
  API host (ADR-026, corrected by the approved plan).
- `CLAUDE.md` §5 repository layout: add `packages/mail`. (`DEPLOYMENT.md` now names
  `DATABASE_URL_WORKER` for the worker and `DATABASE_URL_ADMIN` for the API, done in P1-T07.)

## 10. Known risks, not yet addressed

- A tenant-scoped request holds one pooled connection while Better Auth takes a second
  (organisation rename, invitations). Under load the pool of 20 could stall.
- Two simultaneous organisation creates can exceed the 3-organisation limit; a slug clash in the
  gap between check and insert is a 500.
- An invitation row can exist without its email if the queue is down at that moment.
- Verification identifiers store the email in plain text (`sign-in-otp-<email>`).
- Console pages are ~72 KB heavier (zod) than the old placeholder.
- No browser coverage yet for turning two-factor off. (The staff and kitchen shells are covered
  since P1-T08 by `e2e/console.roles.spec.ts`.)
- **New in P1-T06:**
  - The console has no screens yet for devices, PINs or the PIN switch (P2-T11 team management);
    the API is complete and tested.
  - A super admin whose TOTP check is older than 12 hours must sign out and in again; there is no
    "confirm with your code" step-up page in the console yet.
  - Bull Board's page loads its font from Google Fonts, so an admin's browser contacts Google
    (admin only; no diner data). Self-host or drop it in P10 if it matters.
  - The console's `/admin/organizations` and `/admin/queues` pages are still empty shells
    (P9-T03 builds the admin console).
- **New in P1-T07:**
  - Where Better Auth writes on its own connection (organisation create and rename,
    invitations), the change and its audit entry are separate commits: a failure between them
    leaves the change unaudited. Our own repositories' changes roll back with their entry.
  - Sign-in and sign-out are not audited yet (`recordPlatform` supports it when wanted).
  - A mutation that emits waits for the Valkey publish; with Valkey down that adds up to about
    1 s, and the worker delivers the event later. No Phase 1 mutation emits yet.
  - Dispatched outbox rows and audit rows are never purged (a `db.maintenance` retention job is
    needed before launch).
  - An outbox event that can never be delivered (unknown room or type) is logged, reported to
    Sentry and marked dispatched, i.e. dropped loudly rather than retried forever.
  - While Postgres is down, every 5-second outbox tick fails and is reported to Sentry.
  - The P4 gateway must use `@socket.io/redis-adapter` with the emitter's defaults (key
    `socket.io`, MessagePack), or it will not receive these events.
  - The worker's production install grew from 98 to 124 MB raw (`@radd/db`: pg, drizzle,
    argon2 binary); still well under the 250 MB image limit.

- **New in P1-T08:**
  - Wherever the seed runs, its accounts have the passwords written in this repository. On staging
    (ARCHITECTURE: "seed + test orgs") anyone who reads the repo could sign in to the demo
    organisation there (demo data only; RLS keeps it inside that organisation). Decide before
    staging exists whether staging gets different demo passwords.
  - Re-seeding puts back the documented demo state, including allergen statuses, prices and
    passwords someone changed by hand in the seeded restaurant (by design).
  - The seed must run with the API's `BETTER_AUTH_SECRET`: the staff PIN and the super admin's TOTP
    only verify under it. After rotating that secret, run the seed again (table QR tokens are kept).
  - The seeded super admin has no backup codes; a lost authenticator means re-running the seed.
  - The seed encrypts the TOTP secret with `better-auth/crypto` (a dev dependency of `@radd/db`);
    a Better Auth upgrade that changes that format is caught by `apps/api/test/seed.int.test.ts`.

- **New in the security review** (details, requests and real outputs in
  `docs/SECURITY_REVIEW_P1.md`):
  - **M1 and M2 are fixed** (ADR-034, approved by the owner). The accepted trade: anyone who
    knows an address can pause its password sign-in for 15 minutes at a time (10 wrong passwords)
    and stop its code emails for up to an hour (5 requests). Code sign-in still works while
    passwords are paused.
  - **L1:** `/v1/auth/list-sessions` returns the user's other sessions with raw tokens (a full
    session only since F1); disable it or strip `token` before a sessions screen exists.
  - **L2:** `user.image` accepts any string, `javascript:` URLs included; validate before a
    screen shows it.
  - **L3:** our own `/v1/*` writes do not check `Origin`; CSRF protection rests on SameSite=Lax
    and every write needing JSON or `Idempotency-Key` (preflight). Add an Origin check on
    cookie-authenticated writes, since `m.` and `cdn.` share the cookie's site.
  - **L4/L5:** rate limits trust `CLIENT_IP_HEADER` (hold the Cloudflare-only firewall rule;
    Tunnel or Authenticated Origin Pulls in P10) and give each IPv6 /64 its own bucket.
  - **L6:** the seed refuses `APP_ENV=production` but does not look at the target database; a local
    `.env` pointed at production would write the demo accounts there.
  - **L7:** the cluster's `postgres` database keeps `PUBLIC` connect and temp rights (no data);
    revoke them in the cluster half of `bootstrap-roles.sql`.

## 11. Owner: what only you can do

The full list with explanations is "Needs owner" in `docs/PROGRESS.md`; the per-phase test
scripts are in `OWNER_CHECKLIST.md` §8. Open items, most urgent first:

- **Seed decisions (ADR-033), say if you want them changed:** the side (fries, salad) and sugar
  options are seeded with their allergen impact **not confirmed** (SEED_DATA confirms only the
  protein and bread options), so diners will see "allergen impact not confirmed" on them; the local
  super admin's password is `DemoAdmin!2026`; staff names are invented.
- **Let sessions push the phase branch:** keep the sentence in §0 in your prompt (the prompts in
  `docs/sessions/` already include it).
- Repository visibility (public vs private), the licence text, branch protection on `master`,
  GHCR package visibility, the Renovate app.
- Sentry projects, a native-speaker review of the Arabic copy, Node 26 timing, and the shadcn
  registry host (before Phase 2).
- From Phase 2 on: product name and domain, pricing, default ordering mode, LBP rounding, pilot
  restaurants (`OWNER_CHECKLIST.md` §1).

## 12. Session log

Newest first. Each session adds one entry: date, task, branch and head, result, CI, notes.

### 2026-11-26 — Per-address sign-in limits (review M1, M2) · branch `ccr-5ac9a7bd-5ahjj9`
- **What now works:** one address gets at most 5 code emails an hour, whichever IPs ask; 10 wrong
  passwords in a row for one address pause its password sign-in for 15 minutes (even the right
  password answers 429 meanwhile; a successful sign-in clears the count). Addresses without an
  account behave the same, so nothing reveals which exist. Without Valkey, password sign-in is
  refused rather than left unlimited. The owner approved this in the same session.
- **Commits:** `f7e8962` (limits and tests) plus the docs commit (ADR-034; API.md §8, SECURITY T7,
  the review report, this file, PROGRESS).
- **Tests:** api unit 104 → 107, api integration 121 → 124 (codes per address; the pause; fail
  closed). All three failed against the previous bridge and pass now.
- **CI:** green on `224fcac` (code and docs): [CI 82](https://github.com/assemabdelmalak/demo/actions/runs/45850349732), [Docker 51](https://github.com/assemabdelmalak/demo/actions/runs/45850349776). The phase branch was
  fast-forwarded to this work.
- **Session:** https://claude.ai/code/session_01YNpMivNJKtXxAGFScKWo5o

### 2026-11-26 — Security review of Phase 1 · branch `ccr-5ac9a7bd-5ahjj9`
- **What now works:** a shared tablet's PIN session stays confined to reading itself and signing
  out however its cookie header is written, and its cookie alone is useless off the tablet (it
  could list the user's other sessions with their tokens, rename the account and read every
  member's email). Nobody receives a member's PIN hash from Better Auth's member reads any more
  (every member, staff and kitchen included, used to get everyone's).
- **Commits:** `63d2cb9` (F1, bridge asks Better Auth whenever a Cookie header is present),
  `3a225db` (F2, PIN columns no longer declared to Better Auth), `31216e0` (the report) plus the
  docs commit.
- **Review:** database isolation as `app_runtime` and `app_worker` (tenant B or none) against
  every item in the session prompt; auth (enumeration, fields, Origin, two-factor, limits);
  authorisation (default deny, cross-organisation IDs and Better Auth organisation endpoints, PIN
  sessions, admin TOTP freshness). What held, what is open (M1, M2, L1–L7, §10) and the exact
  requests with real outputs are in `docs/SECURITY_REVIEW_P1.md`. Fixture rows deleted.
- **Tests:** API integration 120 → 121 (new PIN-cookie test; the members test now also reads
  Better Auth's `list-members` and `get-active-member`). Both failed before their fix. No test was
  weakened.
- **CI:** green on `31216e0`: [CI 78](https://github.com/assemabdelmalak/demo/actions/runs/45838997014)
  (all ten jobs, including `test-int` on PostgreSQL 17 and `e2e-smoke`) and
  [Docker 47](https://github.com/assemabdelmalak/demo/actions/runs/45838996851). The phase branch
  was fast-forwarded to this work.
- **Session:** https://claude.ai/code/session_01YNpMivNJKtXxAGFScKWo5o

### 2026-11-26 — P1-T08 seed "Beit Tayta" · branch `ccr-4a469ea9-ynf5ub`
- **What now works:** `pnpm db:seed` creates the demo restaurant of SEED_DATA: Beit Tayta SAL on
  the pro plan for a year, four accounts that sign in with their SEED_DATA passwords (owner,
  manager, staff with PIN `1234`, kitchen), the local super admin `admin@radd.test` with its
  authenticator seed printed, the restaurant settings, 12 tables in two areas, 4 kitchen
  stations, modifier groups G1–G5, 28 dishes with ingredients and 14 allergen rows each (four
  dishes deliberately unconfirmed: vine leaves, sujuk, shish taouk, lahm bi ajeen) and the FAQ.
  `--with-session` opens table 5 (the GROUP_ORDERING §7.5 example, $49.50, round accepted) and
  table 9 (round waiting for approval). Running it again changes nothing. It prints "publish
  pending" and "images pending"; the restaurant stays a draft until P2-T08.
- **Commits:** `0317705` … `b386084` (shared e2e helpers, seed env schema, the seed with unit
  tests, db integration test, API sign-in test, role browser test, CI seed step, ADR-033 and
  SEED_DATA) plus the docs commit.
- **Decisions (ADR-033):** deterministic UUIDv7 IDs and "update only if different" writes; tenant
  rows as `app_runtime` through `withTenant`, the subscription as `app_admin`; refuses
  production; super admin only in local and test; side and sugar options not confirmed; table 9's
  contents; the restaurant stays draft.
- **Tests:** db unit 15 → 32 (SEED_DATA's allergen table restated by hand), db integration
  41 → 52 (two runs give identical rows, timestamps included; repair of hand edits; RLS; guards),
  API integration 114 → 120 (each role signs in; super admin passes TOTP; PIN switch with 1234),
  Playwright 49 → 57 (each seeded role's navigation in en and ar). Mutation check: dropping the
  "only if different" guard fails the twice-run test.
- **CI:** green on `b386084`: [CI 72](https://github.com/assemabdelmalak/demo/actions/runs/45739297307)
  (including `test-int` on PostgreSQL 17 and `e2e-smoke`, which now seeds twice and runs the role
  tests) and [Docker 42](https://github.com/assemabdelmalak/demo/actions/runs/45739297263). The
  phase branch was fast-forwarded to this work.
- **Session:** https://claude.ai/code/session_01YNpMitrdbXy9e9Z4hzC4tP

### 2026-11-25 — P1-T07 audit and outbox · branch `claude/upbeat-ride-z192ey`
- **What now works:** every change the API makes (ten so far) is written to the audit log, in the
  same transaction as the change wherever our own code makes it (so a failed change leaves no
  entry; Better Auth's own writes are the exception, §10), with who did it, which
  organisation and restaurant, the request ID and a keyed hash of the caller's IP; super-admin
  changes are logged as `super_admin`, Bull Board changes as platform entries with no
  organisation; PINs, tokens, payment references and IP addresses never reach the log. The
  outbox is in place: a change can record a realtime event in its transaction; after commit the
  API sends it to Valkey (in order, to the right Socket.IO namespaces) and marks it sent; if
  that fails, or the API dies in between, the worker (now connected to Postgres as `app_worker`)
  re-sends it within about 5 seconds. Nothing listens yet (gateway in P4) and no Phase 1 change
  emits yet (first producers in P2).
- **Commits:** `68a2802` … `c343c8a` (migration 0006 and db queries, `AuditService` and the ten
  call sites, `@radd/shared` realtime module and Redis-emitter adapter, `OutboxService`,
  `DATABASE_URL_WORKER`, worker dispatcher, tests) plus the docs commit.
- **Found on the way:** `@socket.io/redis-emitter` throws away the result of every Redis publish,
  so a Valkey failure would have been missed (and the event marked sent). The adapter now
  captures and awaits each publish.
- **Decisions:** ADR-028 (outbox delivery, as built) and ADR-031 (audit entries) written. The
  worker gets its own variable `DATABASE_URL_WORKER` and no longer reads `DATABASE_URL`.
- **Test changes (explained):** the two existing worker suites run without a database, so they
  now pass `outbox: false`; no assertion changed.
- **CI:** green on the code head `c343c8a`: [CI 68](https://github.com/assemabdelmalak/demo/actions/runs/45630173651) (including `test-int` on PostgreSQL 17 and the e2e smoke with the worker on `app_worker`), [Docker 38](https://github.com/assemabdelmalak/demo/actions/runs/45630173552) (all four images) and Lighthouse 17. The phase branch was fast-forwarded to
  this work.
- **Session:** https://claude.ai/code/session_01YNpMisjRzCpwNVu3xFu29o

### 2026-11-23 — P1-T06 finished · branch `claude/modest-einstein-d0pg1n`
- **What now works:** a manager registers a shared tablet (host-only HttpOnly cookie; only its
  SHA-256 stored), lists and revokes devices (revoking ends every session opened on it); owners
  and managers set or remove staff and kitchen PINs (argon2id with a server pepper; never
  returned; weak PINs refused); staff and kitchen switch on the tablet by PIN into a 12-hour
  device-bound session with floor or kitchen permissions only (5 wrong PINs lock for 5 minutes,
  15 in a day disable the PIN until a manager sets a new one, fails closed without Valkey, every
  failure looks the same). Super admins (allowlisted, verified, two-factor, TOTP check within
  12 hours on this session) can list, read, suspend, reinstate and re-plan organisations through
  a separate `app_admin` pool, and open Bull Board at `/v1/admin/queues`. The console shows the
  admin shell to super admins only.
- **Commits:** `e46f327` … `f6f461e` plus the docs commit (pnpmfile, admin member-count fix,
  StaffModule, AdminModule + Bull Board, OpenAPI regen, console gate, tests, E2E, agent-env fix).
- **Bug found and fixed:** the admin organisation list always reported 0 members (Drizzle `sql`
  column rendering in a correlated subquery).
- **Test fixture change (explained):** the two PIN-session tests in `authz.int.test.ts` forged a
  PIN session with no device, which ADR-026 rightly rejects, so they could not pass. The fixture
  now registers a device and sends its cookie; no assertion changed, and a new test proves a
  device-less PIN session is refused and ended.
- **Carried P0 item done:** the stack E2E now invites a staff member through the API and waits for
  the worker's email (API queue → worker → Mailpit).
- **Size:** dropping valibot's TypeScript peer took the API production install from 216 to 193 MB.
- **CI:** green on the head `e71f970`:
  [CI 62](https://github.com/assemabdelmalak/demo/actions/runs/45254520210) (including
  `test-int` on PostgreSQL 17 and the e2e smoke with the new invitation check) and
  [Docker 34](https://github.com/assemabdelmalak/demo/actions/runs/45254520229) (all four images
  under 250 MB). The owner approved fast-forwarding `phase/01-data-auth-tenancy` to this work.
- **Session:** https://claude.ai/code/session_01YNpMiwMnbJVXxZqadyT8vo

### 2026-11-16 — handoff written; P1-T06 started (partial) · branch `phase/01-data-auth-tenancy`
- Wrote this file, `docs/sessions/*` and the agent setup scripts. Started P1-T06 and committed it
  half done (`d8fb2cb`): services and queries existed but nothing was mounted and two tests were
  red. Session: https://claude.ai/code/session_01D5gQ8Ati23pYuP3cQupYps

### 2026-11-11 to 2026-11-15 — P1-T01 to P1-T05 · branch `phase/01-data-auth-tenancy`
- `packages/db` with Drizzle and committed SQL migrations; the full 52-table schema; database
  roles and Row Level Security with a catalog-driven tenancy suite; Better Auth (email and
  password, email codes, organisations, invitations, two-factor) and the console account pages
  and role shells; the default-deny authorisation guard with per-request tenant transactions.
  Details per task in `docs/PROGRESS.md`.

### 2026-10-20 to 2026-11-10 — Phase 0 · merged to `master` (PR #1)
- Monorepo, env schemas, local infrastructure, API and worker skeletons, Next.js apps, UI
  package, API client, test harness, CI (lint, types, tests, images, CodeQL, Lighthouse),
  observability, docs. Acceptance audit 2026-11-10. Details in `docs/PROGRESS.md`.

### 2026-10-20 — repository set up · branch `ccr-c58d143d-0a1piz`
- The specification package (`CLAUDE.md`, `docs/*`, `OWNER_CHECKLIST.md`, `.env.example`) was
  uploaded to the repository root.

## 13. End of every session (checklist)

1. Gates pass (§6); browser tests if console or diner behaviour changed.
2. Small Conventional Commits; push; CI green (fix anything red first).
3. Update this file: §2 status and numbers, §3 next up, §4 if the branch situation changed,
   §9 docs debt, §10 risks, §11 owner items, and a §12 session-log entry.
4. Add the task's row to `docs/PROGRESS.md` (and "Needs owner" lines if any).
5. Commit and push the docs; report to the owner in plain language.
