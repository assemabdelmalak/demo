# Session 04 — independent security review of Phase 1

## Prompt

Read docs/HANDOFF.md first and follow its "Start of every session" steps. Work only on this one task, on branch `phase/01-data-auth-tenancy`. If `git status` shows uncommitted files for this task, a previous session was interrupted: read them and continue, do not start over. When the gates in HANDOFF §4 pass: commit in small Conventional Commits, push, check the CI runs for the branch and fix anything red, then update docs/HANDOFF.md (state table, "Next up", last verified numbers, any new risk) and docs/PROGRESS.md (a row for this task), commit and push that too. Finish with a short plain-language report: what works now, the test numbers, anything I need to decide. Do not start the next task.

Task: act as an attacker against Phase 1, then fix what you prove. This review was planned after P1-T03 and never completed.

Use the local database built by infra/scripts/agent-services.sh (database `radd`; roles `app_runtime`, `app_worker`, `app_admin`, `app_migrator` with passwords equal to their names; superuser `postgres` / `postgres` for setting up fixture data only).

1. Database isolation (ADR-021, ADR-022; packages/db/drizzle/*.sql, packages/db/sql/bootstrap-roles.sql, packages/db/src/tenant.ts): with two organisations set up, acting as `app_runtime` and `app_worker` with the tenant set to organisation B or not set, try to read, change, insert or reference organisation A's rows; try the public path (`app.public`), the `public_restaurants` view, every `SECURITY DEFINER` function, search-path tricks with temporary objects, default `PUBLIC` privileges (schemas, functions, types, `TEMP` on the database), unique indexes that span tenants as an existence oracle, partitions, `ON CONFLICT`, row locks, and whether injected SQL that calls `set_config('app.org_id', …)` itself is a realistic threat.
2. Auth (apps/api/src/auth/*): account enumeration through timing or wording, code and rate-limit bypasses, cookie scope, the Origin check, session fields a client could set, two-factor bypasses.
3. Authorisation (apps/api/src/authz/*, packages/shared/src/permissions.ts): a route without a policy, cross-organisation access by ID, PIN-session escapes (other organisation, longer than 12 hours, account endpoints), admin access without a fresh TOTP check.

For every finding: the exact request or SQL and the real output, a severity, and a fix with a test that fails before the fix. Fix everything critical or high in this session; list the rest in docs/HANDOFF.md "Known risks". Do not weaken any existing test. Clean up the fixture rows you created.
