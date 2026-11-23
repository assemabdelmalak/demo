# Session prompts

One task per session keeps each chat short and cheap. The simplest way: open a **new** session and
paste the universal prompt from `docs/HANDOFF.md` §0. It reads the "Next up" list and does the
first task.

The files here are the same prompts with each task's details spelled out, if you prefer them:

1. Open a **new** session on the repository.
2. Paste the block under "Prompt" as your first message.
3. When it reports done, close the session and open a new one for the next file.

Every prompt starts by reading `docs/HANDOFF.md`, which holds the current state, the setup
commands, the rules and a log of every session. The session updates that file before it finishes,
so the next session starts from the truth.

Order: `01` (done) → `02` → `03` → `04` → `05`. Do not skip: later tasks build on earlier ones.

Each prompt allows the session to push to the phase branch. Cloud sessions are otherwise limited
to their own `claude/…` branch, and their work would not reach the phase branch by itself
(`docs/HANDOFF.md` §4).

If a session stops halfway (usage limit, restart): open a new session and paste the **same**
prompt. It checks `git status` and the session log, and continues the unfinished work.
