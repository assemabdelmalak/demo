# Session prompts

One task per session keeps each chat short and cheap. For each file here:

1. Open a **new** session on the repository.
2. Paste the block under "Prompt" as your first message.
3. When it reports done, close the session and open a new one for the next file.

Every prompt starts by reading `docs/HANDOFF.md`, which holds the current state, the setup commands and the rules. The session updates that file before it finishes, so the next session starts from the truth.

Order: `01` → `02` → `03` → `04` → `05`. Do not skip: later tasks build on earlier ones.

If a session stops halfway (usage limit, restart): open a new session and paste the **same** prompt. It checks `git status` and continues the unfinished work.
