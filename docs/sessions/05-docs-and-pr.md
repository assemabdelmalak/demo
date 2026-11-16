# Session 05 — docs pass, Phase 1 PR, demo checkpoint

## Prompt

Read docs/HANDOFF.md first and follow its "Start of every session" steps. Work only on this one task, on branch `phase/01-data-auth-tenancy`. If `git status` shows uncommitted files for this task, a previous session was interrupted: read them and continue, do not start over. When the gates in HANDOFF §4 pass: commit in small Conventional Commits, push, check the CI runs for the branch and fix anything red, then update docs/HANDOFF.md (state table, "Next up", last verified numbers, any new risk) and docs/PROGRESS.md (a row for this task), commit and push that too. Finish with a short plain-language report: what works now, the test numbers, anything I need to decide. Do not start the next task.

Task: finish Phase 1.

1. Clear the "Docs debt" list in docs/HANDOFF.md §7: PROGRESS rows for every Phase 1 sub-task with CI run links, ADR-023 to ADR-030 (and one for `.pnpmfile.cjs`) written from docs/plans/phase-01-plan.md as actually built, and the spec corrections (API.md, DATA_MODEL.md, ARCHITECTURE.md, DEPLOYMENT.md, IMPLEMENTATION_PLAN.md P1 wording, CLAUDE.md §5 layout, OWNER_CHECKLIST.md). Read the code before describing it; docs must match what exists.
2. Audit Phase 1 against docs/IMPLEMENTATION_PLAN.md: every "Do", "Accept" and "Test" bullet of P1-T01 to P1-T08 is met, deferred with a recorded reason, or fixed now.
3. Run every gate and the full browser suite; confirm CI is green on the branch head, including the Docker images (each under 250 MB).
4. Open one pull request from `phase/01-data-auth-tenancy` to `master`: the task checklist, the "How to demo" steps for Demo checkpoint P1 (sign up as a new owner and create an organisation; log in as the seeded owner, manager and staff users and see the role-based navigation; tenancy tests green), "Needs owner" items, and notes on deviations.
5. Give me a way to try it: screenshots of the main screens in English and Arabic, and the steps to run it.
6. Update docs/HANDOFF.md for Phase 2 (state, next up = "Phase 2 plan: start in plan mode"), then stop and wait for my review. Do not merge.
