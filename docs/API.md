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
| Owner / manager / staff / kitchen | Better Auth session cookie `<prefix>.session_token` (prefix `radd` in production, `radd-<APP_ENV>` elsewhere, so staging never accepts a production cookie; `__Secure-` added over HTTPS). Domain is `.<domain>` (`AUTH_COOKIE_DOMAIN`; host-only on `localhost`), HttpOnly, Secure over HTTPS, SameSite=Lax. Sessions last 7 days and are refreshed at most once a day; no cookie cache, so revocation is immediate (ADR-023). CSRF: Better Auth checks `Origin` against `TRUSTED_ORIGINS` on `/v1/auth/*`; our own `/v1/*` writes rely on SameSite=Lax and on every write needing a JSON body or an `Idempotency-Key` header (both force a CORS preflight). An `Origin` check on cookie-authenticated writes is open item L3 of `docs/SECURITY_REVIEW_P1.md`. |
| Staff quick-switch | `POST /v1/staff-devices/{id}/switch` with `{ memberId, pin }` on a registered device (its `__Host-radd_device` cookie, ADR-026). It issues a 12 h session bound to the device, with the member's staff or kitchen permissions only. |
| Diner device | `rm_dev` cookie: a signed UUID (HMAC with `DEVICE_COOKIE_SECRET`), 1 year, HttpOnly, Secure, SameSite=Lax. Issued by `POST /v1/public/devices` or implicitly on first public mutation. |
| Diner participant | `rm_pt` cookie: a JWT (HS256, `PARTICIPANT_TOKEN_SECRET`), 12 h, with claims `{ sid, pid, rid, oid, dev }`. It is also returned in the join response for Socket.IO auth (`auth: { token }`). Every `/public/sessions/{sid}/…` route verifies `token.sid === sid`, the participant is `active`, and the session is not closed. |
| Super admin | Better Auth user whose verified email is in `SUPER_ADMIN_EMAILS`, who has 2FA (TOTP) enabled, and whose session passed a TOTP or backup-code check within the last 12 hours ("remember this device" does not count). Admin routes require all three (ADR-027). |

### Better Auth endpoints — `/v1/auth/*` (exception to §1)

Better Auth (pinned 1.7.18) is mounted at `/v1/auth/*` as a raw route. Its responses keep **Better Auth's own JSON shape** (`{ code, message }` errors, its own success bodies), because its client depends on them; they are not problem+json. Every other route follows §1 (ADR-023).

- **Used by the console:** `sign-up/email`, `sign-in/email`, `sign-in/email-otp`, `email-otp/send-verification-otp` (types `sign-in`, `email-verification`), `email-otp/verify-email` (signs the user in), `email-otp/request-password-reset`, `email-otp/reset-password`, `get-session`, `sign-out`, the TOTP and backup-code endpoints (`two-factor/enable`, `disable`, `get-totp-uri`, `verify-totp`, `verify-backup-code`, `generate-backup-codes`), and the invitation answers (`organization/get-invitation`, `accept-invitation`, `reject-invitation`).
- **Also mounted** (Better Auth 1.7.18 with these plugins, minus the disabled list): `change-password`, `verify-password`, `update-user` (name and image only; server-set fields are not writable), `update-session` (server-set fields are not writable), `list-sessions`, `revoke-session`, `revoke-sessions`, `revoke-other-sessions`, `list-accounts`, `email-otp/check-verification-otp`, the organisation reads (`organization/list`, `get-organization`, `get-full-organization`, `list-members`, `get-active-member`, `get-active-member-role`, `list-invitations`, `list-user-invitations`, `check-slug`, `has-permission`) and `organization/set-active`. `delete-user` answers 404 because account deletion is not enabled. Open items from the security review: `list-sessions` returns raw tokens of the user's other sessions (L1), and `update-user` accepts any string as `image` (L2).
- **Disabled** (404): link-based reset and verification, email change, social sign-in and its account endpoints, two-factor by email or SMS code, and the organisation writes our own API wraps (`organization/create`, `update`, `delete`, `invite-member`, `cancel-invitation`, `remove-member`, `update-member-role`, `leave`). The list is `DISABLED_AUTH_PATHS` in `apps/api/src/auth/auth.config.ts`.
- **Codes:** 6 digits, valid 5 minutes, 3 attempts, stored hashed. An account with two-factor on cannot sign in by code, and `verify-email` refuses an account that is already verified or has two-factor on; both answer like a wrong code (`INVALID_OTP`).
- **Malformed IDs:** a body or query field named `id` or `…Id` that is not a UUID answers `400 INVALID_ID`.
- **PIN sessions** may call only `get-session` (never refreshed) and `sign-out`; anything else answers `403 PIN_SESSION_FORBIDDEN` (ADR-026).
- **Limits:** §8. Better Auth's own limiter (for example 3 sign-in attempts per 10 s per IP) stores in Valkey and fails closed: with Valkey down, these endpoints answer 429.

### Language header

The console sends `x-radd-locale: en|ar` on API and auth requests. The API uses it for the language of emails it sends (codes, invitations); anything else falls back to `en` (ADR-009). It never changes response bodies.

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

Every route declares its access policy: a permission action from `packages/shared/src/permissions.ts`, "any signed-in user" or public. A route without one is refused (ADR-024).
- Routes under `/restaurants/{rid}` act in the restaurant's organisation: the caller must be a member of it. A restaurant that does not exist, is deleted or belongs to an organisation the caller is not in answers `404 NOT_FOUND`, so IDs cannot be probed.
- Other routes act in the session's active organisation: `404 NOT_FOUND` without one, `403 NOT_A_MEMBER` when the caller no longer belongs to it.
- A role without the action gets `403 FORBIDDEN`; a mutation in a suspended organisation gets `403 ORG_SUSPENDED`. Services check the same rules again with the target (`assertCan`).

**Built in Phase 1.** The routes below marked ✅ exist; their exact request and response schemas are in `packages/api-client/openapi.json` (`pnpm openapi`). Unmarked routes arrive with their phase.

Error codes added in Phase 1 (`packages/shared/src/errors.ts`): `EMAIL_NOT_VERIFIED` (403), `NOT_A_MEMBER` (403), `ORG_SUSPENDED` (403), `ORG_LIMIT_REACHED` (409), `ALREADY_A_MEMBER` (409), `TWO_FACTOR_REQUIRED` (403), `DEVICE_REVOKED` (403), `PIN_LOCKED` (429, with `retryAfter` and `pinDisabled`). Better Auth's `PIN_SESSION_FORBIDDEN` and `INVALID_ID` appear only under `/v1/auth/*`.

**Organisation and restaurants**
- ✅ `GET /me` → `{ user, session, isSuperAdmin, memberships }`. Any signed-in user, PIN sessions included. `isSuperAdmin` uses the same rule as the admin guard (ADR-027), so the console shows the admin area exactly when the API would allow it.
- ✅ `GET /organizations/current` (`org.read`)
- ✅ `POST /organizations` with `{ name }` (onboarding step 0; any verified signed-in user, not a PIN session; `Idempotency-Key`). The creator becomes owner and the new organisation becomes the session's active one. `403 EMAIL_NOT_VERIFIED`; `409 ORG_LIMIT_REACHED` at 3 owned organisations. The slug is derived from the name.
- ✅ `PATCH /organizations/current` with `{ name }` (`org.update`)
- ✅ `GET /restaurants` (`restaurant.read`, cursor pagination)
- ✅ `POST /restaurants` with `{ name, slug }` (`restaurant.create`, `Idempotency-Key`). Minimal for now; P2-T01 adds the settings.
- ✅ `GET /restaurants/{rid}` (`restaurant.read`); `PATCH` arrives in P2-T01
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
- `POST /sessions/{sid}/reopen` (staff for a `bill_requested` session; manager for a closed one, GROUP_ORDERING §3.1 and E10)

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
- ✅ `GET /organizations/current/members` (`team.read`, cursor pagination). Never includes PIN hashes.
- ✅ `POST /invitations` with `{ email, role: 'manager'|'staff'|'kitchen' }` (`team.invite.staff`; inviting a manager also needs `team.invite.manager`, owner only; `Idempotency-Key`). Wraps Better Auth's invitation; the email goes through the `notify.email` queue in the inviter's language (`x-radd-locale`). Valid 7 days; inviting the same address again replaces the earlier invitation. `409 ALREADY_A_MEMBER`; `403 ORG_SUSPENDED`. The invitee accepts on the console (`/accept-invitation/{id}`) with the invited, verified address.
- `PATCH /members/{id}` (role, displayName)
- ✅ `PUT /members/{id}/pin` with `{ pin }` and ✅ `DELETE /members/{id}/pin` (`team.pin.set`; only for staff and kitchen members the caller manages; `204`). 4–6 digits; weak patterns (`0000`, `1234`, `1212`) are refused. A new PIN clears a lock and re-enables a disabled PIN.
- `DELETE /members/{id}`
- ✅ `POST /restaurants/{rid}/staff-devices` with `{ name }` (`devices.manage`, `Idempotency-Key`): registers the calling browser as a shared tablet. The device token is set in an HttpOnly cookie for the API host only (`__Host-radd_device` over HTTPS, `radd_device` with `Path=/v1` over HTTP) and never appears in the body; a replay returns the device without setting a cookie.
- ✅ `GET /restaurants/{rid}/staff-devices` (`devices.manage`, cursor pagination; revoked devices included)
- ✅ `DELETE /staff-devices/{id}` (`devices.manage`): revokes the device and ends every session opened on it. Returns the device.
- ✅ `POST /staff-devices/{id}/switch` with `{ memberId, pin }` (public; needs the device's own cookie) → `{ memberId, organizationId, restaurantId, expiresAt }` and a session cookie. Signs out whoever used the tablet before. Every refusal is the same `403 FORBIDDEN`, except `403 DEVICE_REVOKED`, `429 PIN_LOCKED` (5 failures in a row lock for 5 min; 15 in a day disable the PIN, `pinDisabled: true`), `429 RATE_LIMITED` (30 attempts per device per minute) and `503` when Valkey is down (ADR-026).

**Notifications**
- `GET|PUT /me/notification-optins`
- `POST /me/notification-optins/whatsapp/verify` (OTP via WhatsApp template)

**Subscription (owner view)**
- `GET /organizations/current/subscription`
- `GET /organizations/current/usage`

## 5. Admin endpoints — `/v1/admin` (super admin + 2FA)

Everyone who is not a super admin gets `403 FORBIDDEN`, the same answer as any forbidden route; an allowlisted admin without a TOTP check on this session in the last 12 hours gets `403 TWO_FACTOR_REQUIRED` (ADR-027). Admin routes use the `app_admin` database pool and audit every change as `super_admin`.

- ✅ `GET /orgs?search=` (cursor pagination) → `{ id, name, slug, plan, status, memberCount, createdAt }`
- ✅ `GET /orgs/{id}`
- ✅ `PATCH /orgs/{id}` with `{ status?: 'active'|'suspended', plan? }`
- ✅ `/queues` — Bull Board (raw Fastify routes behind the same rule; changes need the API's own `Origin` and are audited)
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
| Auth (login / OTP) | Better Auth defaults plus 10 / IP / 15 min for OTP send (IP is acceptable here); per address (ADR-034): 5 code emails / h, and 10 wrong passwords in a row pause password sign-in for 15 min (even the right password answers 429) |

Implementation notes (ADR-016):
- Every route shares one default bucket of 300 requests per actor per minute. Scoped limits above are named throttlers with their own keys.
- The actor is the user, participant or device set by auth before the throttler runs; only requests with no identity fall back to the client IP. The client IP comes from `CLIENT_IP_HEADER` (`cf-connecting-ip` behind Cloudflare), never from `X-Forwarded-For`, and IPv6 addresses are grouped by /64.
- A limit of 0 blocks the endpoint. If Valkey is unreachable the limiter allows the request (fails open); idempotency fails closed instead.

Cloudflare WAF adds coarse per-IP protection with generous thresholds: 600 req/min per IP on `/v1/public/*`, because a whole restaurant can share one IP.
