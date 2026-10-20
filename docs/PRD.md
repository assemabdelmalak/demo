# PRD — Radd Menu

**Status:** v1.0 (build spec)  **Owner:** A (founder, Radd)  **Market:** Lebanon first, then MENA

## 1. Summary

Radd Menu is an AI-powered QR menu and group table-ordering platform.

- **Diners** scan a QR code at the table and get a fast menu in Arabic and English. They can ask questions in plain language, including Lebanese dialect and Arabizi. A group can order together, and everyone sees exactly what they owe.
- **Restaurants** import their existing menu from a photo, PDF or spreadsheet. They control every fact the AI can say, run orders from staff and kitchen screens, and learn what diners ask, view and order.

It is part of the Radd product family. Radd's WhatsApp AI receptionist can later share the same menu knowledge base.

## 2. Why we win (positioning)

- **Plain QR menus are a commodity.** In Lebanon they cost $0–12/month.
- **AI chat alone is not a differentiator.** Local competitors (tamr, Omega) already advertise AI menu assistants.
- **We win on five things together:**
  1. **Verified allergen data.** Owner-confirmed only, timestamped, audited, with refusal and escalation built in.
  2. **Arabic-first conversation.** MSA, Lebanese dialect and Arabizi, plus English and French.
  3. **Lebanese money reality.** USD and LBP shown side by side, a rate set by the restaurant, mixed-currency cash payments, Whish and OMT recorded as payment methods.
  4. **Group dining done right.** Shared table cart, shared dishes, per-person tabs, and "I'll pay for her" handled cleanly.
  5. **Resilience.** The menu works on poor connections and offline from cache. AI failure never blocks anything.

## 3. Personas

| Persona | Context | Needs |
|---|---|---|
| **Diner (local)** | Android phone, often Samsung; restaurant Wi-Fi or patchy 4G; Arabic or Arabizi; often in a group | Fast menu, clear prices in both currencies, ask "fi shi bala jebne?", order with friends, know their share |
| **Diner (diaspora / tourist)** | English or French; may have allergies | Trustworthy allergen info, translations, recommendations |
| **Owner / manager** | Busy, phone-first, WhatsApp-native; menu exists as a PDF or photo | Setup in under 30 minutes, control over facts, insights without extra work, low price |
| **Waiter** | Shared tablet or own phone | See new orders, approve them, handle calls, split bills fast |
| **Kitchen** | Tablet on the wall | Clear queue by table and station, bump when ready |
| **Radd super admin (A)** | Runs the platform | Onboard restaurants, manage plans and payments, watch AI cost |

## 4. Product principles

1. **The menu is the restaurant's stage. Radd is backstage.** Restaurant branding leads; Radd stays subtle.
2. **Browsing never waits on AI.** The assistant is a helper, not a gate.
3. **Trust is visible.** Allergen info is stamped with who confirmed it and when. Unknown information is shown as unknown.
4. **Thumb-first.** Primary actions sit in the bottom 40% of the screen. Everything is usable one-handed at 360 px width.
5. **Two currencies, zero ambiguity.** Every price shows which currency it is in, and the rate is disclosed.
6. **No surprises in a group.** Nobody's items are sent or paid without their action or a staff action.

## 5. Scope

### In scope for v1 (this build)

- **Diner PWA:**
  - menu, search and filters, dish details, allergen display
  - AI assistant
  - group table session with shared cart and per-person ordering
  - order status, waiter calls, per-person bill, receipts
  - offline browsing
- **Console (owner and manager):**
  - onboarding wizard and restaurant settings
  - menu editor, modifiers, ingredients
  - allergen workflow and allergen matrix
  - AI menu import with review, translations
  - tables and QR printing
  - team management, AI settings, transcripts
  - insights and weekly AI summary
- **Staff app** (inside the console): live floor, order approval, waiter calls, bills and payments, close table, daily report.
- **Kitchen display** (inside the console).
- **Platform:**
  - plans and quotas, recorded manual subscription payments
  - super admin
  - email notifications
  - WhatsApp Cloud API notifications (flagged)
  - audit logs

### Later (designed for, not built in v1)

- POS integrations (Omega, BIM POS, Foodics) via `PosAdapter`
- Online payments (Areeba, NetCommerce, Whish Pay) via `PaymentAdapter`
- Owner WhatsApp commands (stretch in Phase 9)
- Multi-branch shared menus
- Reservations, loyalty
- Thermal printer bridge
- Semantic search with embeddings
- French UI (French is supported in data and in AI replies from v1)

## 6. Features and user stories

Each story ID is referenced by the implementation plan.

### Diner

| ID | Story | Key acceptance |
|---|---|---|
| D1 | As a diner I scan the table QR and see the menu in under 2 s on 4G without installing anything. | LCP < 2.0 s (throttled mid-range Android). No install prompt blocks the menu. |
| D2 | I can switch Arabic / English (French if enabled) and the layout flips correctly. | All UI strings translated. RTL mirrored. Menu content is shown in the chosen language, falling back to the default with a "translation unavailable" hint. |
| D3 | I see prices in USD and LBP side by side, with the rate disclosed. | Both currencies follow restaurant settings. The LBP rounding step is respected. |
| D4 | I can search ("fattoush", "فتوش", "fattouch", "salata") and filter by diet, price and spice, and exclude allergens. | Arabic normalisation and Arabizi mapping. Allergen exclusion only returns *confirmed-free* dishes as matches. |
| D5 | I open a dish and see photo, description, key ingredients, options, and allergen info with a "confirmed by restaurant on …" stamp. | Unconfirmed allergens are listed as "Not confirmed — ask staff". |
| D6 | I join my table's group with just a name. | Join takes ≤ 2 taps after the name. The first person becomes host. The same phone re-joins as the same person. |
| D7 | I add dishes to *my* order. My friends see what the table is ordering in real time. | Updates appear on other phones in < 1 s on a good connection, and resync after reconnect. |
| D8 | We can share a dish (e.g. hummus for three) and it's split fairly. | Shares are split by weight. Totals add up exactly. |
| D9 | I send my order (or the host sends everyone's ready orders). I see each item's status (waiting for approval → accepted → preparing → ready → served). | Confirmation step before sending. Statuses update live. |
| D10 | I can ask the assistant "what's good and vegetarian under $15?", "what's in the kibbeh?", "can I swap fries for salad?", "I'm allergic to nuts". | Grounded answers. Dish cards. The allergen card comes from the DB. Severe allergy → staff help offered. |
| D11 | I can call the waiter, ask for water, or request the bill. | Staff see the request instantly. I see "coming". |
| D12 | I see the bill grouped by person, my share in USD and LBP, and can mark that I'll pay for someone. | Per-person totals include proportional service and tax and add up exactly. Equal split is also available. |
| D13 | After paying I see a receipt and can share it on WhatsApp. | Per-person receipt page. `wa.me` share link. |
| D14 | If my connection drops, I can still browse the menu I already loaded. | Offline banner. Cached menu. Ordering is disabled with a clear message. |

### Restaurant (owner / manager)

| ID | Story | Key acceptance |
|---|---|---|
| R1 | I sign up, create my restaurant and finish setup in under 30 minutes. | Onboarding wizard with progress. Skip and resume allowed. |
| R2 | I upload photos or a PDF of my menu (or an Excel file) and get a structured bilingual draft. | 6-page menu processed in < 3 min. Review screen with flags. Nothing goes live without my approval. |
| R3 | I edit categories, dishes, sizes, options, prices, photos and availability easily from my phone. | Mobile-first editor. Drag to reorder. Quick "86" toggle. |
| R4 | I confirm allergens per dish, with AI suggestions I can accept or change, and see what still needs confirming. | Explicit confirmation required. Matrix view. Confirmation expires when ingredients change. Audit trail. |
| R5 | I control the assistant: on/off, name, tone, upsell, my own FAQ answers, and I can test it before diners do. | Test console. Settings apply to the next conversation. |
| R6 | I set tables and areas and print QR table tents. | Print-ready PDF. Each QR is unique. QR can be regenerated. |
| R7 | I set currencies, the LBP rate, rounding, service charge and tax. | Rate history kept. The rate is locked into a bill when the bill is requested. |
| R8 | I choose how ordering works: browse only, staff enters orders, diners order with approval, or diners order directly. | The mode changes the diner UI and API rules immediately. |
| R9 | I invite my team with roles (manager, staff, kitchen). | Email invites. Staff quick-switch with PIN. |
| R10 | I see insights: scans, orders, dish funnel, top questions, unanswered questions, dietary demand, peak hours. | Date-range filter. "Fix now" links. CSV export. |
| R11 | I get a weekly AI summary with up to 3 concrete actions, by email and WhatsApp. | Arabic and English. Generated from metrics only. |
| R12 | I can read chat transcripts (anonymous) to see what diners ask. | Filters: flagged, unanswered, allergen-related. |
| R13 | I see a daily sales and payments summary by method and currency. | Totals reconcile with closed bills. CSV export. |
| R14 | My data is mine. | Export menu (JSON/CSV) and reports at any time. |

### Staff and kitchen

| ID | Story | Key acceptance |
|---|---|---|
| S1 | I see a live floor of tables with clear states and timers. | Realtime. Sound and vibration alerts (opt-in). |
| S2 | I approve, edit or reject incoming orders. | Rejection needs a reason, which the diner sees. Edits are audited. |
| S3 | I add items for a guest without a phone, and create named guests at a table. | Staff-created participants. |
| S4 | I move items between people, void items, and transfer a table. | Permissions enforced. Audited. |
| S5 | I handle waiter calls and bill requests. | Acknowledge → resolve. |
| S6 | I record payments per person or for several people: cash USD, cash LBP, mixed, card, Whish, OMT, plus tips. A change calculator handles mixed currency. | The bill closes only when the balance is 0, unless a manager forces it with a reason. |
| S7 | (Kitchen) I see accepted items by table and station and bump them when ready. | Large type. Landscape tablet. Live timers. |
| S8 | I can switch staff users on a shared tablet with a PIN. | Device registered by a manager. |

### Platform

| ID | Story |
|---|---|
| P1 | Plans (Free / Pro / Bundle) with quotas enforced: AI conversations per month, tables, import pages. |
| P2 | Super admin records subscription payments (Whish, OMT, cash, bank, other), sets plan periods and sends reminders. |
| P3 | Super admin sees organisations, usage and AI cost per organisation. Super admin can suspend, set feature flags, impersonate read-only (audited), and use a global AI kill switch. |
| P4 | Notifications: email (Resend) and WhatsApp utility templates (Meta Cloud API), with opt-in. |
| P5 | Audit logs for allergen confirmations, prices, payments, voids, discounts and admin actions. |
| P6 | Legal: restaurant terms acceptance (versioned), diner privacy notice, allergen disclaimers in AR/EN/FR. |

## 7. Non-functional requirements

| Area | Requirement |
|---|---|
| Performance (diner) | LCP < 2.0 s and INP < 200 ms on a mid-range Android with throttled 4G. Initial JS < 130 KB gzipped on menu routes. Menu snapshot < 60 KB gzipped for 150 items (images excluded). |
| Performance (API) | p95 < 300 ms for non-AI endpoints at target load. Realtime fan-out p95 < 500 ms. |
| AI latency | Chat first token p95 < 2.5 s. Allergen-mode full answer p95 < 4 s. Import of a 6-page menu < 3 min. |
| Availability | POC target 99.5% monthly. Diner browsing degrades gracefully: CDN-cached snapshot plus offline cache. |
| Scale target (v1 architecture) | 300 restaurants, 3,000 concurrently active tables, 12,000 concurrent diner sockets, 50 chat requests/second. Scale-out path documented. |
| Security | OWASP ASVS L1 baseline (L2 for auth and payments). See SECURITY.md. |
| Privacy | Diners are anonymous (device ID only). Raw chat text kept 180 days. Labels kept 13 months. Data export and deletion on request for restaurants. |
| Accessibility | WCAG 2.2 AA. Text size control. Reduced motion respected. |
| Localisation | `en` (default) and `ar` (RTL, first-class) at launch (ADR-009). `fr` content and AI replies supported, `fr` UI later. Western digits by default (configurable). |
| Browsers | Android Chrome and Samsung Internet (last 2 major versions), iOS Safari 16+, desktop evergreen browsers for the console |

## 8. Plans (initial, to be validated with owners)

| Plan | Price | Includes |
|---|---|---|
| Free | $0 | 1 restaurant, menu + QR, USD/LBP, 300 AI conversations/month, browse-only or staff-entry ordering, "Powered by Radd" badge |
| Pro | $15–20/month or $150–180/year | Everything, including diner ordering + group tabs, 3,000 AI conversations/month (fair use), allergen workflow + audit, insights + weekly report, French |
| Bundle | $35–49/month | Pro + Radd WhatsApp receptionist (separate product) sharing the menu knowledge base |
| Setup (optional) | $50–100 one-time | Done-for-you import, photos, allergen interview |

Plan limits live in config (`packages/shared/plans.ts`), not hard-coded across the code.

## 9. Success metrics (pilot)

- Restaurant activation: published menu with at least 80% of dishes allergen-confirmed within 7 days.
- Diner: scans per cover ≥ 0.6; chat usage ≥ 15% of sessions; unanswered-question rate < 10%.
- Group ordering: ≥ 30% of ordering tables have 2+ participants. Bill disputes reported by staff → near zero.
- Owner weekly active usage of the console ≥ 60%.
- AI cost per restaurant per month < $5 at pilot usage.

## 10. Explicitly out of scope for v1

- Native mobile apps (the PWA is the product).
- Card payments processed inside our app.
- Inventory and stock management.
- Delivery.
- Generating dish photos with AI.
- AR/3D dishes.
