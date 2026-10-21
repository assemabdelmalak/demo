# TESTING — Radd Menu

## 1. Test pyramid and tools

| Layer | Tool | Scope | Runs |
|---|---|---|---|
| Unit | Vitest | Pure logic: money, billing, permissions, search normaliser, safety lexicons and guard, AI tools, validators, snapshot builder | Every commit (`pnpm test`); no Docker or network |
| Property | fast-check (in Vitest) | Billing invariants, money rounding, LRM allocation | Every commit |
| Integration | Vitest + Testcontainers (Postgres 17, Valkey) + Nest testing module | Repositories + RLS, API endpoints, sockets, BullMQ jobs with a mocked LLM | CI on every PR (`pnpm test:int`) |
| E2E | Playwright | Real browsers against local stack + seed; Pixel 7 and Galaxy-class (360×780) viewports; `ar` and `en` projects | CI on PR (smoke) and nightly (full) |
| Accessibility | @axe-core/playwright | Every E2E screen | With E2E |
| Performance | Lighthouse CI | Diner menu routes on seed data | CI on PR touching `apps/diner` |
| Load | k6 | API + sockets + chat (mocked LLM by default; real LLM at low rate optionally) | Manual before releases (P10) |
| AI evals | Custom runner (`packages/ai/evals`) + Langfuse datasets | Chat and import quality and safety | PRs touching AI + nightly |

## 2. Coverage targets

- `packages/shared/money`, `packages/shared/billing`, `packages/ai/safety`: **≥ 95% lines and branches**.
- Overall: ≥ 80% lines for `apps/api` services.
- UI coverage is not measured; E2E scenarios below are required.

## 3. LLM mocking

- `MockLlmClient` implements `LlmClient`. It replays scripted responses: text deltas, tool calls and usage. Fixtures live in `packages/ai/test/fixtures`.
- Integration tests assert:
  - orchestration (tool loop, gating, guard replacement, persistence);
  - forced `tool_choice` in allergen mode;
  - StaffHelp enforcement;
  - timeouts → fallback.
- Never hit the real API in unit or integration tests. CI fails if `ANTHROPIC_API_KEY` is used outside the `eval` job.

## 4. Required scenarios

### Billing and money (unit + property)

- The worked example in GROUP_ORDERING §7.5 produces exact numbers.
- These invariants hold for random inputs (1–20 participants, 0–60 items, random shares, discounts, inclusive/exclusive tax, service 0–20%):
  - sums are exact;
  - no negative amounts;
  - the result does not depend on input order.
- Equal split and custom split validation.
- LBP rounding: nearest and up; steps 0/1,000/5,000/10,000; correct rounding-difference line.
- Payments: partial, covering others, overpay → tip, void → recompute.

### Group ordering (integration + E2E)

1. **Three diners, two rounds.**
   - Diners A, B and C join. A is host.
   - B shares hummus with A and C.
   - B sends their own items; A sends everyone who is ready.
   - Staff accept one round and partially reject the other (reason shown).
   - Kitchen marks items ready, then served.
   - The live statuses update on all three phones.
2. **Concurrent first join on an empty table.** Exactly one session is created and one host is chosen.
3. **Item 86'd while in drafts.** Send is blocked; staff are flagged on the pending round.
4. **Price changed between add and send.** `409 PRICE_CHANGED`, then re-confirm, then sent.
5. **Locked table.** A new joiner is pending; the host approves; another is denied on timeout.
6. **Bill flow.**
   - Request bill; the rate locks.
   - "I'll pay for" note.
   - Staff record a mixed USD+LBP cash payment covering two people, plus a card payment for the third.
   - All dues reach 0, then close.
   - Receipts are visible.
   - Daily report totals match.
7. **Reconnect.** Kill the socket mid-session, make changes from other phones, reconnect → state matches.
8. **Idempotency.** Duplicate add and send requests with the same key → a single effect.
9. **Session closed.** An old tab gets 410 and sees the thank-you screen.
10. **Staff-created guest.** Staff add items for the guest, then move items between participants.

### Allergen safety (unit + integration + E2E + evals)

- The snapshot never exposes unconfirmed statuses.
- Every invalidating edit clears confirmation.
- The filter "exclude nuts" shows only confirmed-free dishes in the main group.
- Chat E2E: "عندي حساسية جوز، شو فيني آكل؟" → AllergenCard + no unsafe sentence + StaffHelp.
- Guard unit tests: ≥ 300 labelled sentences (see AI_ARCHITECTURE B6.3).

### Menu and import

- Publish creates an immutable version; the diner receives the new version within 15 s.
- Import with `MockLlmClient` fixtures: merge, dedupe, currency mismatch flag, apply creates drafts plus suggestions only.

### Tenancy and security

See SECURITY.md §3.

### i18n and RTL

- Visual snapshots (Playwright screenshots) of key screens in `ar` and `en` at 360 px, compared within a threshold.
- No missing message keys: a script compares the `ar`, `en` and `fr` catalogs. CI fails on missing `ar` or `en` keys.

## 5. Test data

- `pnpm db:seed` → Beit Tayta (SEED_DATA.md). Deterministic IDs via a seeded UUIDv7 generator so tests can reference known IDs.
- Factories in `packages/db/test/factories.ts` for orgs, restaurants, items, sessions, participants and items with shares.

## 6. CI pipeline (GitHub Actions)

1. `setup`: pnpm with cache, Turborepo remote cache optional.
2. `lint`, `typecheck`, `test` (unit + property) — parallel.
3. `test-int` — services: postgres:17 (pgvector image), valkey:8.
4. `build` — all apps.
5. `e2e-smoke` — start the stack with docker compose, seed, run the tagged `@smoke` Playwright suite.
6. `lighthouse` — if diner changed.
7. `eval-ai` — if AI paths changed. Requires `ANTHROPIC_API_KEY` secret. Budget cap.
8. `docker` — on the default branch (`master`, ADR-010): build and push images to GHCR, tagged `sha-<7>` and `staging`. Pull requests build the images without pushing.
9. Nightly: full E2E, full evals, `pnpm audit`, CodeQL.
