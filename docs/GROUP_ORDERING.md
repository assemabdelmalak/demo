# GROUP ORDERING & PER-PERSON TAB — Radd Menu

The goal: a table of friends orders together from their own phones, everyone can see what the table ordered, and at the end **each person sees exactly what they owe**. Shared dishes, "I'll pay for her", service and tax, and USD/LBP are all handled. The per-person amounts always add up exactly to the bill.

---

## 1. Concepts

| Concept | Meaning |
|---|---|
| **Table session** | One sitting at one table, from first scan to closing the bill. At most one live session (`open` or `bill_requested`) per table at a time. |
| **Participant** | A person in the session. Usually one phone (device cookie). Staff can also create participants for guests without a phone ("Teta", "Guest 3"). |
| **Host** | The first participant. Can send everyone's ready orders, lock the table, and remove participants who have no billable items. The host role transfers automatically if the host leaves or is removed. |
| **Item owner** | Every session item belongs to exactly one participant (the person who ordered it). |
| **Shared item** | An item split between several participants by weight (default equal). Example: hummus shared by 3 means each pays ⅓. |
| **Round** | A batch of items sent to the restaurant together. Rounds are numbered 1, 2, 3… |
| **Billable item** | Status in `accepted`, `preparing`, `ready`, `served`. Draft, pending, rejected, voided and removed items are not billed. |
| **Bill** | Computed (never stored as live state) from billable items + discounts + service + tax. A snapshot is persisted on close. |
| **Allocation** | How a payment is applied to participants' dues. |

---

## 2. Ordering modes (restaurant setting, snapshotted into the session)

| Mode | Diner can add items? | Who sends to kitchen | Use case |
|---|---|---|---|
| `browse_only` | No | — | Menu only. No sessions. The "Join table" UI is hidden. Waiter calls remain available (they need a lightweight session). |
| `staff_entry` | No | Staff (in the staff app, per participant) | Waiter takes the order but diners still get a live per-person tab on their phones |
| `diner_with_approval` | Yes | Diner sends → staff approves | **Default for pilots.** Human-in-the-loop, protects against pranks |
| `diner_direct` | Yes | Diner sends → goes straight to kitchen | Trusted venues, cafés |

In `browse_only`, a scan creates a session only when the diner uses a waiter-call button.

Changing the mode affects **new** sessions. Live sessions keep `ordering_mode_snapshot`.

---

## 3. State machines

### 3.1 Session

```
          scan + join
 (none) ─────────────► open ──request bill──► bill_requested ──settled & closed by staff──► closed
                         │  ▲                       │
                         │  └──── staff reopens ────┘
                         └── idle 90 min & no billable items ──► abandoned
```

- **Idle sessions.** `abandoned` is set by `sessions.housekeeping`. Sessions **with** billable items never auto-close. After 4 h they are flagged on the staff floor ("Long-open table").
- **Staff reopen.** A bill request can be reopened (e.g. a late dessert): `bill_requested → open`, which unlocks the rate.
- **Closing a session:**
  - The participant token stops working, and sockets receive `session.closed`.
  - The diner sees a thank-you screen with their receipt link and a 1–5 feedback prompt.
  - A new scan of the same QR starts a new session.

### 3.2 Session item

```
draft ──send──► pending_approval ──staff accept──► accepted ──kitchen──► preparing ──► ready ──► served
  │                    │                              │
  │ owner removes      └─ staff reject ─► rejected    └─ staff void (reason) ─► voided
  └────────────────────────────────────────► removed
```

- **`diner_direct`:** sending goes straight to `accepted`.
- **`staff_entry`:** staff-added items start as `accepted` (or `draft` if staff choose "hold").
- **Voiding:**
  - `waiter` can void before `preparing`.
  - `manager` can void at any time.
  - A reason is required, and the void is audited.

### 3.3 Round

```
pending_approval ──accept all──► accepted
                 ──accept some─► partially_accepted (rejected items carry reason)
                 ──reject all──► rejected
```

### 3.4 Participant

- **Lifecycle:** `active` → `left` (the person leaves voluntarily; any billable items stay theirs) or `removed` (host/staff).
- **Who can be removed:**
  - The host can remove a participant only if they have **no** billable items and are not a sharer on a billable item.
  - Staff can always remove. Their items must first be moved to someone else.
- **Locked table:** a new joiner is created as `pending_approval`. The host and staff get an approve/deny prompt. Unanswered prompts auto-deny after 120 s, and the diner sees "Ask your table to let you in".

---

## 4. Joining

1. **Scan.** The diner scans `https://m.<domain>/t/{qrToken}`. The page shows the restaurant name, table label, and "N people at this table" with their avatars.
2. **Join sheet.**
   - Name field, prefilled from this device's last name, 1–24 characters, emoji allowed.
   - A colour is auto-assigned from a 12-colour palette that avoids colours already in use at the table.
   - "Join table".
3. **First participant.** They become the host, and the session is created with `is_locked = restaurant.lock_new_joiners_default`.
4. **Same device again.** It gets the same participant back (status set to `active`). The name stays the same unless the person edits it.
5. **Browsing without joining is always allowed.** Joining is required only to add items, send, see the table tab, or receive status updates. Viewing the menu, chatting with the assistant and waiter calls work without joining; a waiter call triggers a silent auto-join with the name "Guest" if needed.
6. **Abuse limits:**
   - Max 20 active participants per session (configurable).
   - Join rate limit: 5 per device per minute.
   - In approval modes, staff see every round before it reaches the kitchen.

---

## 5. Adding, sharing, and sending

### 5.1 Adding items

- **Who:** a participant adds items to *their own* draft list. Staff can add to anyone (`added_by_user_id` is set).
- **Validation on add, and again on send:**
  - The item is visible and available, and its schedule is open now (restaurant timezone).
  - A variant is chosen if the item has variants.
  - Options satisfy every group's min/max rules.
  - Options and removed ingredients belong to the item.
  - Quantity is 1–20. Note is ≤ 140 characters.
  - The session is `open` and the ordering mode allows it.
- **Price snapshot.** Prices are snapshotted at add time. At send time, if the price changed, the item is updated to the new price and the diner sees a notice: "Price updated from $6.00 to $6.50". The diner must confirm again.
- **Edits.** The owner can change quantity, options and note, or remove the item, while it is `draft`. After sending, only staff can change it.
- **Moving items.** "Move to…" re-assigns `participant_id`. It is allowed for the item owner while `draft`, and for staff at any time before payment allocation. It is audited.

### 5.2 Sharing

- **From the item row:** "Share with…" → select participants. The owner is always included.
- **Weights:**
  - Default weight is 1 for each person, i.e. an equal split.
  - "Custom portions" lets you set integer weights 1–20, e.g. Rami 2, Nour 1 → ⅔ / ⅓.
- **Who can edit shares:** the owner (while `draft`) or staff (any time before payment allocation).
- **Display:** a shared badge with avatars and fractions ("½", "⅓", "2/5"). Under the "Table" tab, the item appears under each sharer with their fraction and amount.
- **Leaving a share:** a sharer cannot leave a share themselves. They ask the owner, or staff do it. This prevents disputes in which someone "escapes" a shared plate.

### 5.3 Ready and sending

- **Ready toggle.** Each participant has "I'm ready" (`is_ready`). The host sees "3 of 4 ready".
- **"Send my order"** (any participant) sends **only their own** drafts in a new round.
- **"Send everyone's ready orders"** (host or staff) sends the drafts of every participant marked ready. Drafts of participants who are not ready are **never** sent by someone else.
- **Confirmation step before sending:**
  - Shows the items, options and notes.
  - Shows the subtotal in both currencies.
  - Lists any unavailable or changed items, which must be resolved first.
- **Send rate limit.** One send per participant every 10 s. The server rejects empty sends.
- **Result:** a round is created, and the items move to `pending_approval` (or `accepted`). The session room receives `round.submitted`, the staff room gets an alert, and in direct mode the kitchen room is notified too.

### 5.4 Availability changes mid-session

When staff 86 an item:
- Drafts of that item are flagged "No longer available". The send button is disabled until the diner removes or replaces the item.
- Pending rounds containing the item are flagged for staff, who reject that line with an auto-filled reason.

---

## 6. Permissions matrix

| Action | Self (participant) | Host | Waiter (`staff`) | Manager / Owner |
|---|---|---|---|---|
| Add / edit / remove own drafts | ✓ | ✓ | ✓ (any) | ✓ (any) |
| Edit others' drafts | ✗ | ✗ | ✓ | ✓ |
| Share own item / edit shares | ✓ (draft) | ✓ (own, draft) | ✓ | ✓ |
| Send own drafts | ✓ | ✓ | ✓ | ✓ |
| Send everyone's ready drafts | ✗ | ✓ | ✓ | ✓ |
| Lock / unlock table, approve joiners | ✗ | ✓ | ✓ | ✓ |
| Remove participant | ✗ | ✓ (no billable items) | ✓ | ✓ |
| Create participant for a guest without phone | ✗ | ✗ | ✓ | ✓ |
| Accept / reject round, edit pending lines | ✗ | ✗ | ✓ | ✓ |
| Void accepted item | ✗ | ✗ | ✓ (before preparing) | ✓ |
| Apply discount | ✗ | ✗ | ✗ | ✓ |
| Record payment | ✗ | ✗ | ✓ | ✓ |
| Void payment | ✗ | ✗ | ✗ | ✓ |
| Request bill | ✓ | ✓ | ✓ | ✓ |
| Close session (balance 0) | ✗ | ✗ | ✓ | ✓ |
| Force close with balance | ✗ | ✗ | ✗ | ✓ (reason, audited) |
| Transfer session to another table | ✗ | ✗ | ✓ | ✓ |

These rules are encoded in `packages/shared/permissions.ts` and enforced in API services, not only in the UI.

---

## 7. The bill: computation

The bill is computed by `computeBill()` in `packages/shared/billing` — a **pure function**, the same code on server and client. The server is authoritative; the client uses it for instant previews.

### 7.1 Inputs

```ts
type BillInput = {
  currency: 'USD' | 'LBP';            // base currency
  participants: { id: string; joinedAt: string; status: 'active'|'left'|'removed' }[];
  items: { id: string; ownerId: string; lineTotalMinor: number; status: SessionItemStatus;
           shares?: { participantId: string; weight: number }[] }[];
  discounts: { scope: 'item'|'participant'|'bill'; targetId?: string; type: 'percent'|'amount'; value: number }[];
  serviceBps: number; taxBps: number; taxInclusive: boolean; taxAppliesToService: boolean;
  payments: { id: string; allocations: { participantId: string; amountMinor: number }[]; tipMinor: number; voided: boolean }[];
  splitMode: 'by_person' | 'equal' | 'custom';
  customAmounts?: Record<string, number>;   // for 'custom'
  secondary?: { rate: number; step: number; mode: 'nearest'|'up' };  // LBP display
};
```

### 7.2 Algorithm (by_person)

Every division uses the **largest remainder method (LRM)**:

1. Allocate the floor of each share.
2. Distribute the leftover minor units, one each, to the largest fractional remainders.
3. Break ties by participant `joinedAt`, then `id`. This makes results deterministic.

**Steps:**

1. **Billable lines.** Keep items with status in {accepted, preparing, ready, served}.
2. **Item discounts.** Apply them to the line (percent → `round_half_up(line × bps / 10000)`; amount capped at the line). Result: `net_line`.
3. **Owner allocation.**
   - No shares: the owner gets `net_line`.
   - With shares: split `net_line` by weights using LRM.
   - Result: `item_subtotal[p]`.
4. **Participant discounts.** Subtract them from `item_subtotal[p]`, capped at 0.
5. **Bill discount.** Allocate it proportionally to each participant's current subtotal using LRM. The result is `subtotal[p]`, and `S = Σ subtotal[p]`.
6. **Service.**
   - Total: `SV = round_half_up(S × serviceBps / 10000)`.
   - Allocate SV proportionally to `subtotal[p]` (LRM) to get `service[p]`.
7. **Tax.**
   - **Inclusive** (Lebanese prices usually include VAT):
     - `taxBase = S + (taxAppliesToService ? SV : 0)`
     - `TX = taxBase − round_half_up(taxBase × 10000 / (10000 + taxBps))`
     - Inclusive tax is informational only. It is **not added**; it is shown per person, allocated proportionally (LRM).
   - **Exclusive:**
     - `TX = round_half_up(taxBase × taxBps / 10000)`
     - Allocate proportionally (LRM) and **add** it to the totals.
8. **Per-person total.** `total[p] = subtotal[p] + service[p] + (exclusive ? tax[p] : 0)`.
9. **Payments and status.**
   - `paid[p]` is the sum of non-voided allocations to p. `due[p] = max(0, total[p] − paid[p])`.
   - Status is `paid` when due = 0. It is `covered_by:<payerId>` when all of p's payment came from another participant's payment. Otherwise it is `partial` or `unpaid`.
10. **Secondary currency** (display only). For base USD:
    - `lbp[p] = roundStep(total[p] × rate / 100, step, mode)`.
    - The bill total in LBP is rounded the same way.
    - Because each person's amount is rounded separately, the per-person LBP amounts may not add up exactly to the rounded LBP total. The UI shows a line "LBP rounding difference: X". The authoritative amounts are always in base currency.

**Invariants (property-tested with fast-check):**
- `Σ subtotal[p] = S`.
- `Σ service[p] = SV`.
- `Σ tax[p] = TX`.
- `Σ total[p] = billTotal`.
- No negative amounts.
- The output is identical for permuted input order.
- Adding a zero-value item changes nothing.
- Removing a participant who has no items changes nothing.

### 7.3 Equal split

`billTotal` is split equally across **active participants who have at least one billable item or share**, or all active participants if the host chooses "include everyone". Use LRM with the same tie-breaker. Service and tax are already included in `billTotal`.

### 7.4 Custom split

Staff (or the table, with staff confirmation) enter amounts per participant. These must add up to `billTotal`. The UI shows the remaining amount live and blocks confirmation until it is zero.

### 7.5 Worked example (by_person)

Restaurant settings: USD base, service 10%, VAT 11% inclusive (applies to service), LBP rate 89,500, rounding step 5,000 (nearest).

| Participant (join order) | Items |
|---|---|
| Rami (host) | Shish taouk $12.00 |
| Nour | Fattoush $6.50; Lemonade ×2 $8.00 |
| Karim | Mixed grill $18.00 |
| shared by all 3 | Hummus $5.00 (weights 1/1/1) |

**Steps:**
- **Hummus.** 500 ÷ 3 = 166.67 each. Floors are 166 ×3 = 498, leaving 2. The remainders are equal, so the tie-break by join order gives the extra cents to Rami and Nour: Rami 167, Nour 167, Karim 166.
- **Subtotals.** Rami 1367 · Nour 1617 · Karim 1966. **S = 4950** ✓
- **Service.** SV = 495.
  - Exact shares: 136.70, 161.70, 196.60. Floors are 136 / 161 / 196 = 493, leaving 2.
  - The largest remainders are .70 (Rami) and .70 (Nour), so service is Rami 137 · Nour 162 · Karim 196. Σ = 495 ✓
- **Totals.** Rami **$15.04** · Nour **$17.79** · Karim **$21.62**. Σ = **$54.45** = 4950 + 495 ✓
- **Inclusive VAT shown.** On 5445: TX = 5445 − round(5445 / 1.11) = 5445 − 4905 = 540. Allocated proportionally (info only).
- **LBP (nearest 5,000):**
  - Rami: 1,346,080 → **1,345,000**
  - Nour: 1,592,205 → **1,590,000**
  - Karim: 1,934,990 → **1,935,000**
  - Bill: 4,873,275 → 4,875,000. Rounding difference: 5,000.
- **Equal split instead.** 5445 ÷ 3 = 1815 each, **$18.15**.

**Payment example.** Rami pays for himself and Nour with $40 cash:
- `amount = 3283`
- `allocations = [{Rami,1504},{Nour,1779}]`
- `tendered = [{USD, 4000}]`
- Change of 717 ($7.17) is given as $7 + 15,000 LBP ($0.17 × 89,500 = 15,215, rounded to the nearest 5,000), or as staff choose. The change calculator suggests options; staff confirm the change actually handed over.
- Nour's status: **Covered by Rami**.

---

## 8. Requesting the bill and paying

1. **Request.** Any participant (or staff) taps "Request bill". The session moves to `bill_requested`, `lbp_rate_snapshot` is locked, and staff get an alert.
2. **Diner Bill tab:**
   - Mode switch: By person / Equal (sharing to Custom is staff-only).
   - Each person card: items with fractions, subtotal, service, tax line (inclusive: "incl. VAT $x"), **total in USD + LBP**, status chip.
   - **"I'll pay for…"** — a participant selects others. This creates a *payment note* that staff see ("Rami will pay for Rami + Nour"). It is not a payment.
   - Payment method hints for staff ("Nour: Whish").
3. **Staff bill screen:**
   - The same cards plus actions:
     - **Record payment** for one or several participants: choose method, enter tendered amounts in any currency mix, and the change calculator works out change.
     - Apply a **discount** (manager).
     - **Void a payment** (manager, reason).
     - **Print or share the receipt.**
   - Tip is an optional field per payment.
   - Overpayment beyond the due amount must be classed as a tip or as change. It is never left silently as credit.
4. **Close.** When every participant's due is 0, "Close table" is enabled. On close:
   - The bill snapshot is persisted.
   - The session moves to `closed`.
   - Sockets receive `session.closed`.
   - Receipts remain viewable at `/session/{sid}/receipt/{pid}` for 30 days via signed link.
5. **Force close.** Closing with a balance requires a manager, a reason and an audit record. The daily report then shows "Unsettled amount".

---

## 9. Realtime events (session room)

All payloads include `sessionId`, `sessionVersion` and `at`.

| Event | Payload (extra) | Emitted when |
|---|---|---|
| `participant.joined` / `participant.updated` / `participant.left` | participant DTO | join, rename, ready toggle, leave/remove |
| `participant.join_requested` | {pendingParticipant} | locked table |
| `item.upserted` | item DTO incl. shares | add, edit, share, move, status change |
| `item.removed` | {itemId} | draft removed |
| `round.submitted` | round DTO + itemIds | send |
| `round.decided` | round DTO + per-item decisions | staff accept/reject |
| `bill.updated` | {summary} (totals only) | any billable change, discount, payment |
| `payment.recorded` / `payment.voided` | payment DTO (no external refs) | staff action |
| `waiter_call.updated` | call DTO | ack/resolve |
| `session.updated` | {status, isLocked, hostId, splitMode} | status changes |
| `session.closed` | {receiptUrls} | close |

**Client reconciliation:**
- Keep `localVersion`.
- If `event.sessionVersion === localVersion + 1`, apply the event.
- If it is lower or equal, ignore it.
- If it is greater than `localVersion + 1`, refetch `GET /sessions/{sid}/state`.
- On every reconnect, refetch state.

---

## 10. Edge cases (each needs a test)

| # | Case | Behaviour |
|---|---|---|
| E1 | Two phones join at the same instant on an empty table | One session is created (unique partial index + `INSERT … ON CONFLICT`). Both join it. The first committed becomes host. |
| E2 | Host leaves | Host moves to the earliest-joined active participant. Event emitted. |
| E3 | Participant leaves with billable items | Items stay theirs. They still appear on the bill. Staff can move them. |
| E4 | Same person, two phones | Two participants. Staff can merge participants (move all items, then remove one). |
| E5 | Item 86'd while in drafts | Flagged and send blocked (§5.4). |
| E6 | Price changes between add and send | Re-price and re-confirm (§5.1). |
| E7 | Staff rejects one line of a round | Round becomes `partially_accepted`. The diner sees the reason on that line. |
| E8 | Shared item voided | Removed from all sharers. Bill recomputed. |
| E9 | Payment recorded, then an item is added | Bill recomputed. Due > 0 again. The diner sees "New items added since your payment". |
| E10 | Payment voided after close | Not allowed. Reopening a closed session is manager-only; it creates a new adjustment entry and an audit record. |
| E11 | Network drop during send | Idempotency key: the retry returns the same round, with no duplicates. |
| E12 | Duplicate tap on "Add" | Idempotency key + client debounce: one item. |
| E13 | Diner scans a QR of a table whose session is closing | If status is `closed`, a fresh session is created. |
| E14 | Group moves to another table | Staff "Transfer" moves the session to the new table, if that table has no live session. Otherwise staff merge sessions (manager): participants and items move, and versions bump. |
| E15 | Old phone tab open after close | Socket receives `session.closed`. REST calls return `410 SESSION_CLOSED`. UI shows the thank-you screen. |
| E16 | Staff-created guest "Teta" has no phone | Appears everywhere like a normal participant, marked "added by staff". |
| E17 | 0-value items (free bread) | Allowed. Do not affect allocation. |
| E18 | Bill in LBP-base restaurant | Same algorithm. The secondary display is USD (÷ rate, 2 decimals). |
| E19 | Rate changed by owner mid-meal | Open sessions show the new rate until bill request. After request, the snapshot is locked. |
| E20 | Someone tries to join remotely with a leaked QR | Locked tables need approval. Approval modes put every round through staff. Staff can regenerate the table QR. Rate limits apply. |

---

## 11. UI summary (diner)

- **Table bar** (bottom, always visible after joining): stacked avatars · "Table 12 · 4 people" · my draft count · **my running total**. Tap to open the **Table sheet**.
- **Table sheet tabs:**
  - **Mine** — drafts (editable) and sent items with live status chips. Ready toggle. "Send my order".
  - **Table** — grouped by person (avatar, name, items, status, subtotal). Shared items show fractions. Host sees "Send everyone's ready orders".
  - **Bill** — mode switch, per-person cards, "I'll pay for…", request bill, receipt links after payment.
- **Copy tone.** Friendly and clear in Arabic and English. Never shame anyone about money ("Covered by Rami" instead of "Rami paid for you").

## 12. UI summary (staff)

- **Floor:** table tiles with state colour + timers. Badges: pending rounds, calls, bill requested.
- **Table detail:**
  - Participants and their items, add item for a participant, move or share, approve rounds, void.
  - Bill: per-person cards → record payment (multi-select participants), change calculator, discounts (manager), close.
- **Change calculator:** shows the due amount in USD and LBP. Staff enter tendered amounts per currency, and it suggests change combinations (USD notes first, remainder in LBP rounded to the nearest 5,000 by default).
