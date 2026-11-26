# Session 06 — Phase 2 plan

## Prompt

Read docs/HANDOFF.md first and follow its "Start of every session" steps. Work only on this one task. You may push to the Phase 2 branch named in HANDOFF §4 as well as to your own session branch. Start in plan mode (CLAUDE §2.2) and do not write code. When the plan is approved: commit it, update docs/HANDOFF.md (status, "Next up", session log) and docs/PROGRESS.md, push, and give me a short plain-language report. Do not start P2-T01.

Task: plan Phase 2 — Restaurant setup and menu management (console).

1. Check that I reviewed the Phase 1 demo checkpoint (PR #2). If PR #2 is merged, create the Phase 2 branch from `origin/master`; if not, create it from `origin/phase/01-data-auth-tenancy` and say so in the plan.
2. Summarise the phase goal and the Demo checkpoint P2 from docs/IMPLEMENTATION_PLAN.md.
3. List P2-T01 to P2-T11 with the files and modules each touches, the sub-task splits, and the order. Carry in the items HANDOFF §3 and §10 name for Phase 2: the seed must publish and set the restaurant live (P2-T08) and add the photos (P2-T02); the device, PIN and switch screens (P2-T11); the shadcn/ui decision before the first screen (ADR-020, P2-T01); the first outbox producers.
4. List open questions with a recommended default for each (CLAUDE §2.3), including the owner decisions in OWNER_CHECKLIST §1 that Phase 2 needs.
5. Write the plan to `docs/plans/phase-02-plan.md` in the shape of `docs/plans/phase-01-plan.md`, then stop and wait for my approval.
