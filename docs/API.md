# API — Radd Menu (`https://api.<domain>/v1`)

## 1. Conventions

- **Format.** JSON, camelCase. Timestamps are ISO-8601 UTC. Money fields end in `Minor` (integers in base currency).
- **Errors.** `application/problem+json`:
  ```json
  { "type": "https://docs.<domain>/errors/ITEM_UNAVAILABLE", "title": "Item unavailable", "status": 409,
    "code": "ITEM_UNAVAILABLE", "detail": "…", "requestId": "…", "errors": [{ "path": "options[0]", "message": "…" }] }
  ```
  Codes are stable strings, defined in `packages/shared/errors.ts`.
- **Idempotency.** Every POST, PATCH and DELETE that changes session, payment or menu state requires an `Idempotency-Key` header (UUID).
  - Keys are stored in Valkey for 24 h, keyed by actor and route.
  - A repeated key returns the stored response.
  - The same key with a different body → `422 IDEMPOTENCY_MISMATCH`.
  - A missing or non-UUID key on such a route → `400 IDEMPOTENCY_KEY_REQUIRED`; a repeat while the first request is still running → `409 IDEMPOTENCY_IN_PROGRESS` with `Retry-After: 1`.
  - Replays carry `Idempotent-Replayed: true`. 2xx and deterministic 4xx outcomes are replayed; 5xx, 401, 403, 408 and 429 never are (ADR-015).
- **Pagination.** `?cursor=…&limit=…` (max 100). The response is `{ items, nextCursor }`.
- **Versioning.** Path `/v1`. Breaking changes require `/v2`.
- **OpenAPI.** Generated from the zod schemas (nestjs-zod) at build time. `pnpm openapi` emits `packages/api-client/openapi.json` and its types.
- **CORS.** Allowlist: `m.<domain>`, `app.<domain>` (plus staging and localhost in non-prod). Credentials are allowed.

## 2. Authentication

| Actor | Mechanism |
|---|---|
| Owner / manager / staff / kitchen | Better Auth session cookie. Domain is `.<domain>`, HttpOnly, Secure, SameSite=Lax. CSRF uses Better Auth's trusted-origins check plus `Origin` header validation on state-changing requests. |
| Staff quick-switch | `POST /v1/staff-devices/{id}/switch` with `{ memberId, pin }` on a registered device. It issues a short session (12 h) bound to the device. |
| Diner device | `rm_dev` cookie: a signed UUID (HMAC with `DEVICE_COOKIE_SECRET`), 1 year, HttpOnly, Secure, SameSite=Lax. Issued by `POST /v1/public/devices` or implicitly on first public mutation. |
| Diner participant | `rm_pt` cookie: a JWT (HS256, `PARTICIPANT_TOKEN_SECRET`), 12 h, with claims `{ sid, pid, rid, oid, dev }`. It is also returned in the join response for Socket.IO auth (`auth: { token }`). Every `/public/sessions/{sid}/…` route verifies `token.sid === sid`, the participant is `active`, and the session is not closed. |
| Super admin | Better Auth user whose email is in `SUPER_ADMIN_EMAILS` and who has 2FA (TOTP) enabled. Admin routes require both. |

## 3. Public (diner) endpoints — `/v1/public`

| Method & path | Purpose | Notes |
|---|---|---|
| `POST /devices` | Ensure device cookie | Returns `{ deviceId }`. Idempotent. |
| `GET /restaurants/{slug}` | Public profile + `menuVersion` + open status | Cache 15 s |
| `GET /tables/{qrToken}` | Resolve table → `{ restaurant, table:{id,label,area}, session?: {id, participantCount, hostName, isLocked}, menuVersion }` | Cache 15 s. 404 `TABLE_NOT_FOUND`, 410 `TABLE_INACTIVE` |
| `GET /menus/{restaurantId}/versions/{version}` | Immutable snapshot | `Cache-Control: public, max-age=31536000, immutable`. ETag = hash. |
| `GET /restaurants/{id}/availability` | `{ unavailableItemIds, unavailableOptionIds, closedCategoryIds, lbpRate, at }` | Cache 10 s |
| `POST /tables/{qrToken}/join` | Body `{ displayName, locale, emoji? }` → `{ session, participant, token, state }` | Creates the session if none exists. Locked → `202 { participant.status:'pending_approval' }`. Mode `browse_only` → `409 ORDERING_DISABLED` (except for waiter calls via `/tables/{qrToken}/waiter-calls`). |
| `POST /tables/{qrToken}/waiter-calls` | Waiter call without joining | Rate-limited per device |
| `GET /sessions/{sid}/state` | Full session state (see §6) | Participant auth |
| `PATCH /sessions/{sid}/participants/me` | `{ displayName?, emoji?, isReady?, locale? }` | |
| `POST /sessions/{sid}/participants/me/leave` | Leave | |
| `POST /sessions/{sid}/participants/{pid}/approve` | Host approves a pending joiner | Host only |
| `POST /sessions/{sid}/participants/{pid}/remove` | Host removes | Rules in GROUP_ORDERING §3.4 |
| `POST /sessions/{sid}/lock` / `unlock` | Host | |
| `POST /sessions/{sid}/items` | `{ menuItemId, variantId?, quantity, optionIds[], removedIngredientIds[], note? }` → item | Validations in GROUP_ORDERING §5.1 |
| `PATCH /sessions/{sid}/items/{itemId}` | Edit own draft | |
| `DELETE /sessions/{sid}/items/{itemId}` | Remove own draft | |
| `POST /sessions/{sid}/items/{itemId}/move` | `{ toParticipantId }` | Own draft only |
| `PUT /sessions/{sid}/items/{itemId}/shares` | `{ shares:[{participantId, weight}] }` (empty = unshare) | Owner, draft only |
| `POST /sessions/{sid}/rounds` | `{ mode:'mine'|'all_ready', confirmPriceChanges?: boolean }` → round | `409 PRICE_CHANGED` with a diff if confirmation is needed |
| `POST /sessions/{sid}/waiter-calls` | `{ type, note? }` | 1 per type per participant per 60 s |
| `POST /sessions/{sid}/bill-request` | Request bill | |
| `GET /sessions/{sid}/bill?mode=by_person|equal` | Computed bill | |
| `POST /sessions/{sid}/payment-notes` | `{ payForParticipantIds[], methodHint? }` | Informational for staff |
| `POST /sessions/{sid}/feedback` | `{ rating 1–5, comment? }` | After close |
| `GET /receipts/{token}` | Per-person receipt | Signed token, 30 days |
| `POST /chat` | SSE chat (AI_ARCHITECTURE B5.4). Body `{ restaurantId, conversationId?, sessionId?, message, locale }` | Device cookie required. Participant token optional. |
| `POST /chat/messages/{id}/feedback` | `{ value: 1 | -1 }` | |
| `POST /events` | Batch analytics `{ events:[{type, dishId?, categoryId?, payload?, occurredAt}] }` (≤ 50) | `202`. Validated, sampled if abused. |

## 4. Console endpoints — `/v1` (authenticated)

Every route under `/restaurants/{rid}` checks membership of the restaurant's organisation and the required role (see `packages/shared/permissions.ts`).

**Organisation and restaurants**
- `GET /me`
- `GET /organizations/current`
- `POST /organizations` (onboarding)
- `PATCH /organizations/current`
- `GET /restaurants`
- `POST /restaurants`
- `GET|PATCH /restaurants/{rid}`
- `PUT /restaurants/{rid}/exchange-rate` with `{ lbpRate }` (writes history)
- `GET|PUT /restaurants/{rid}/faq`
- `GET|PUT /restaurants/{rid}/glossary`
- `GET|PATCH /restaurants/{rid}/ai-settings`

**Assets**
- `POST /assets/presign` with `{ kind, mime, bytes, filename }` → `{ assetId, uploadUrl, headers }`
- `POST /assets/{id}/complete`
- `GET /assets/{id}`

**Menu**
- `GET /restaurants/{rid}/menu` — full editable draft tree
- `POST|PATCH|DELETE /restaurants/{rid}/categories[/{id}]`
- `PUT /restaurants/{rid}/categories/order` with `{ ids[] }`
- `POST|PATCH|DELETE /restaurants/{rid}/items[/{id}]`
- `PUT /restaurants/{rid}/categories/{cid}/items/order`
- `POST /restaurants/{rid}/items/bulk` with `{ ids[], action:'hide'|'show'|'86'|'un86'|'move', categoryId? }`
- `PUT /items/{id}/variants` (replace list)
- `PUT /items/{id}/ingredients` (replace list; invalidates allergens)
- `PUT /items/{id}/modifier-groups` with `{ groupIds[] }` (invalidates allergens)
- `POST|PATCH|DELETE /restaurants/{rid}/modifier-groups[/{id}]`
- `POST|PATCH|DELETE /modifier-groups/{gid}/options[/{id}]`
- `POST /modifier-options/{id}/confirm-allergens`
- `PATCH /items/{id}/availability` with `{ isAvailable }` — fast path; updates Valkey and emits an event
- `GET /restaurants/{rid}/allergens/matrix?filter=`
- `PUT /items/{id}/allergens` with `{ statuses: { [code]: status }, notes? }` (sets owner statuses; does not confirm)
- `POST /items/{id}/allergens/confirm` with `{ acknowledgement: true }` — requires all 14 explicitly set
- `POST /items/{id}/allergens/suggest` (AI, async)
- `POST /restaurants/{rid}/allergens/suggest` with `{ itemIds[] }`
- `POST /restaurants/{rid}/translate` with `{ itemIds?[], categoryIds?[], targetLocales[] }` (AI, async)
- `GET /restaurants/{rid}/menu/preview-snapshot` (draft as a snapshot, for preview)
- `POST /restaurants/{rid}/menu/publish` → `{ version, stats, diff }`
- `GET /restaurants/{rid}/menu/versions`
- `GET /restaurants/{rid}/menu/export?format=json|csv`

**Imports**
- `POST /restaurants/{rid}/imports` with `{ assetIds[], options }`
- `GET /imports/{id}`
- `PATCH /imports/{id}/draft` (save edits)
- `POST /imports/{id}/pages/{pageId}/retry`
- `POST /imports/{id}/apply`
- `POST /imports/{id}/cancel`

**Tables**
- `POST|PATCH|DELETE /restaurants/{rid}/areas[/{id}]`
- `POST|PATCH|DELETE /restaurants/{rid}/tables[/{id}]`
- `POST /tables/{id}/regenerate-qr`
- `GET /restaurants/{rid}/tables/qr.pdf?layout=a6|a4x4&tableIds=`
- `GET /tables/{id}/qr.svg`

**Staff and floor**
- `GET /restaurants/{rid}/live` — tables with session summaries, pending rounds, open calls, bill requests
- `GET /sessions/{sid}` — staff view of the full state
- `POST /sessions/{sid}/participants` with `{ displayName }` (guest without phone)
- `POST /sessions/{sid}/participants/{pid}/remove`
- `POST /sessions/{sid}/participants/merge` with `{ fromId, intoId }`
- `POST /sessions/{sid}/items` with `{ participantId, …, hold?: boolean }`
- `PATCH /session-items/{id}` (qty / options / note while pending)
- `POST /session-items/{id}/move`
- `PUT /session-items/{id}/shares`
- `POST /session-items/{id}/void` with `{ reason }`
- `POST /rounds/{id}/decide` with `{ decisions:[{itemId, accept:boolean, reason?}], kitchenNote? }`
- `PATCH /session-items/{id}/status` with `{ status:'preparing'|'ready'|'served' }`
- `POST /waiter-calls/{id}/ack`
- `POST /waiter-calls/{id}/resolve`
- `POST /sessions/{sid}/transfer` with `{ toTableId }`
- `POST /sessions/{sid}/merge` with `{ otherSessionId }` (manager)
- `POST /sessions/{sid}/reopen` (manager)

**Bills and payments**
- `GET /sessions/{sid}/bill?mode=`
- `PUT /sessions/{sid}/split-mode` with `{ mode, customAmounts? }`
- `POST /sessions/{sid}/discounts` (manager)
- `DELETE /discounts/{id}` (manager)
- `POST /sessions/{sid}/payments` with `{ method, allocations[], tipMinor, tendered[], changeGiven[], externalReference? }`
- `POST /payments/{id}/void` with `{ reason }` (manager)
- `POST /sessions/{sid}/close` with `{ force?: boolean, reason? }`
- `GET /sessions/{sid}/receipt.pdf`
- `GET /restaurants/{rid}/reports/daily?date=` (+ `.csv`)

**Kitchen**
- `GET /restaurants/{rid}/kitchen?stationId=` — accepted, preparing and ready items grouped by round and table

**Insights**
- `GET /restaurants/{rid}/insights/overview?from&to`
- `GET /restaurants/{rid}/insights/dishes?from&to`
- `GET /restaurants/{rid}/insights/questions?from&to` — topics, gaps
- `GET /restaurants/{rid}/insights/reports`
- `GET /restaurants/{rid}/conversations?filter=flagged|allergen|unanswered&cursor=`
- `GET /conversations/{id}`
- `POST /restaurants/{rid}/assistant/test` — owner test chat (SSE), uses draft or published (`?menu=draft|published`)

**Team**
- `GET /organizations/current/members`
- Invitations through the Better Auth organization endpoints, wrapped as `POST /invitations`
- `PATCH /members/{id}` (role, displayName)
- `PUT /members/{id}/pin`
- `DELETE /members/{id}`
- `POST /restaurants/{rid}/staff-devices` (register, returns a one-time device token)
- `DELETE /staff-devices/{id}`

**Notifications**
- `GET|PUT /me/notification-optins`
- `POST /me/notification-optins/whatsapp/verify` (OTP via WhatsApp template)

**Subscription (owner view)**
- `GET /organizations/current/subscription`
- `GET /organizations/current/usage`

## 5. Admin endpoints — `/v1/admin` (super admin + 2FA)

- `GET /orgs?search=`
- `GET /orgs/{id}`
- `PATCH /orgs/{id}` (status, plan)
- `POST /orgs/{id}/subscription-payments`
- `GET /usage?period=`
- `GET|PUT /feature-flags`
- `POST /orgs/{id}/impersonate` — read-only session for 30 min, audited
- `PUT /system/ai` with `{ enabled, monthlyBudgetUsd }`

## 6. Session state DTO (`GET /public/sessions/{sid}/state`)

```jsonc
{
  "session": { "id","status","version","isLocked","hostParticipantId","orderingMode","splitMode","lbpRateSnapshot","openedAt" },
  "me": { "participantId": "…" },
  "participants": [ { "id","displayName","color","emoji","role","status","isReady","online","joinedAt","addedByStaff": false } ],
  "items": [ { "id","participantId","menuItemId","variantId","quantity","optionIds","removedIngredientIds","note",
               "unitPriceMinor","optionsPriceMinor","lineTotalMinor","name","optionsSnapshot","status","roundId",
               "shares":[{"participantId","weight"}],"flags":["unavailable"|"price_changed"] } ],
  "rounds": [ { "id","number","status","submittedAt","decidedAt","rejectionReason" } ],
  "waiterCalls": [ { "id","type","status","createdAt" } ],
  "billSummary": { "totalMinor","paidMinor","dueMinor","currency" }
}
```

## 7. Socket.IO

- **Connection.** Endpoint `wss://api.<domain>/socket.io`.
- **Namespaces:**
  - `/diner` — auth `{ token: participantToken }`, or `{ deviceToken, restaurantId }` for public availability only
  - `/staff` — cookie auth
- **Client → server messages:**
  - `presence.ping` every 25 s
  - `staff.subscribe { restaurantId, rooms:['staff','kitchen'] }`
  - All mutations go through REST.
- **Server → client events:**
  - Session events are listed in GROUP_ORDERING §9.
  - Staff room adds `round.submitted`, `waiter_call.created`, `bill.requested`, `session.opened`, `session.flagged`.
  - Kitchen room adds `kitchen.item_added`, `kitchen.item_updated`.
  - Public room adds `menu.availability_changed { itemIds, available }`, `menu.published { version }`, `restaurant.settings_changed`.
  - Imports room adds `import.progress { importId, stage, pagesDone, pagesTotal }`, `import.ready`, `import.failed`.
- **Event envelope:**
  ```
  { "type": "...", "at": "...", "sessionVersion"?: n, "data": {...} }
  ```
  Types are generated in `packages/api-client/events.ts`.

## 8. Rate limits (Valkey sliding window; keyed by device, participant or user — never IP alone)

| Scope | Limit |
|---|---|
| Join | 5 / device / min |
| Item mutations | 60 / participant / min |
| Round send | 1 / participant / 10 s |
| Waiter call | 1 / type / participant / 60 s |
| Chat | 20 / device / 10 min; 120 / session / h; org monthly quota |
| Events ingest | 10 requests / device / min |
| Console writes | 300 / user / min |
| Auth (login / OTP) | Better Auth defaults plus 10 / IP / 15 min for OTP send (IP is acceptable here) |

Implementation notes (ADR-016):
- Every route shares one default bucket of 300 requests per actor per minute. Scoped limits above are named throttlers with their own keys.
- The actor is the user, participant or device set by auth before the throttler runs; only requests with no identity fall back to the client IP. The client IP comes from `CLIENT_IP_HEADER` (`cf-connecting-ip` behind Cloudflare), never from `X-Forwarded-For`, and IPv6 addresses are grouped by /64.
- A limit of 0 blocks the endpoint. If Valkey is unreachable the limiter allows the request (fails open); idempotency fails closed instead.

Cloudflare WAF adds coarse per-IP protection with generous thresholds: 600 req/min per IP on `/v1/public/*`, because a whole restaurant can share one IP.
