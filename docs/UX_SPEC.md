# UX SPEC — Radd Menu

## 1. Design direction

**Diner app: "the restaurant's menu, made easy to read".**
- The restaurant's brand leads: logo, cover photo, one primary colour, and a font pair from a curated list.
- Radd appears only as a small "Powered by Radd" line in the footer (hidden on paid plans if the owner chooses).
- The memorable element is the **table bar**: a living strip of the friends at the table (avatars in their colours) that turns ordering into a shared moment.
- Everything else stays quiet and disciplined: generous dish rows, clear prices, calm motion.

**Console: "a calm tool for a busy room".**
- Dense where it helps (allergen matrix, live floor).
- Big tap targets where staff have wet hands (kitchen, floor).

**Avoid generic AI-UI tells:**
- cream backgrounds with terracotta accents;
- tracked all-caps eyebrow labels;
- identical rounded cards with soft grey shadows everywhere;
- gradient washes;
- "→" appended to every button.

Use corner radius by hierarchy, not one radius for everything.

## 2. Typography

| Role | Typeface | Notes |
|---|---|---|
| Diner default | **Readex Pro** (variable; designed for Arabic and Latin together) | Body 16 px / 1.55 (Arabic) and 16 px / 1.5 (Latin). Dish names 17–18 px, weight 600. Prices use tabular numbers. |
| Diner alternates (owner picks) | **Alexandria** (modern geometric) · **Noto Naskh Arabic + Noto Serif** (classic) · **El Messiri** for headings only + Readex Pro body (festive) | Self-host all fonts with `next/font`, subset Arabic + Latin, `display: swap` |
| Console | **IBM Plex Sans Arabic + IBM Plex Sans** | 14 px base for dense tables, 16 px for forms |
| Kitchen display | IBM Plex Sans Arabic, 24–32 px | Read from 2 m away |

Type scale (diner): 13 / 15 / 16 / 18 / 22 / 28 px. Lines are capped at about 70 characters in dish descriptions. Arabic text gets slightly more line-height than Latin.

## 3. Colour: restaurant theme presets

Every preset defines `surface`, `ink`, `muted`, `primary`, `onPrimary`, `accent`, `line`. Owners can override `primary`; contrast is auto-checked to WCAG AA and auto-adjusted for `onPrimary`.

| Preset | surface | ink | muted | primary | accent | line | Mood |
|---|---|---|---|---|---|---|---|
| **Zaatar** (default) | #FFFFFF | #1F2A1C | #5B6656 | #4E6B2F | #B8892B | #E3E8DD | Olive and thyme; mezze houses |
| **Corniche** | #F7FAFB | #0E2A3B | #4D6472 | #0F6E8C | #F2B134 | #DCE6EB | Seaside, fish restaurants |
| **Sumac** | #FFFFFF | #241418 | #6E5A5E | #8E1B3A | #D9A441 | #EEE1E4 | Grills, wine bars |
| **Rooftop** (dark) | #1B1D24 | #F3F1EC | #A9ABB3 | #E5484D | #7DD3C0 | #2C2F38 | Bars, nightlife |
| **Plain** | #FFFFFF | #1A1A1A | #616161 | #2B2B2B | #2B2B2B | #E6E6E6 | Brand-neutral |

**System colours** (not themeable):
- success #1E7A46
- warning #A15C00
- danger #B42318
- info #1D5FA8
- allergen "contains" #B42318
- "may contain" #A15C00
- "not present (confirmed)" #1E7A46
- "not confirmed" #5F6B7A

Allergen states always pair colour with an icon and text.

**Participant palette** (12, distinct on both light and dark): #E4572E #17BEBB #FFC914 #76B041 #2E86AB #A23B72 #F18F01 #6A4C93 #1B998B #C5283D #3D5A80 #8AC926.

## 4. Spacing, shape, motion

- **Spacing:** 4-px grid, scale 4/8/12/16/20/24/32/40.
- **Corner radius by hierarchy:**
  - sheets 20 px (top corners only)
  - dish images 12 px
  - buttons 12 px
  - chips 999 px
  - inputs 10 px
  - allergen card 6 px (more "official")
- **Elevation:** only sheets and the table bar float. Dish rows are flat, separated by 1 px `line` dividers.
- **Motion:**
  - Bottom sheets slide at 220 ms ease-out.
  - The table bar pulses once when someone joins or sends.
  - Status chips cross-fade.
  - No entrance animations on lists.
  - Respect `prefers-reduced-motion`.

## 5. RTL rules

- Use logical CSS properties only (`ms-`, `me-`, `ps-`, `pe-`, `start`, `end`). Tailwind v4 logical utilities.
- **Mirror** chevrons, back arrows and swipe directions.
- **Do not mirror** media controls, the QR code, numbers, or the clock icon.
- **Prices:**
  - LTR runs inside RTL text are wrapped with `<bdi>`.
  - The currency symbol position follows the locale: `$6.50` in both; `580,000 ل.ل.` in Arabic and `580,000 LBP` in English.
- **Mixed-script dish names** (e.g. "Fattoush فتوش"): render the primary-locale name first and the secondary below in `muted`, at 14 px.

## 6. Diner screens

### 6.1 Table entry (`/t/{qrToken}`)

- **Header:** cover image (16:9, max 180 px tall, thumbhash placeholder) with the logo overlapping its bottom-start edge, then the restaurant name.
- **Status line:** "Table 12 · Open until 23:30", or "Closed now — browsing only".
- **Table pill:** if a session is open, show "3 people are at this table" with avatars and a "Join" button.
- **Language switch** sits top-end: "EN" / "ع" / "FR" segmented control, only for enabled locales. English is shown first until the diner switches or the restaurant's default is another locale (ADR-009).
- **The menu renders immediately below.** No joining is needed to browse.

### 6.2 Menu

- **Sticky category tabs.** Horizontal scroll with a scroll-spy underline in `primary`.
- **Search** is an icon in the tab row. It expands into a full-width field with filter chips:
  - dietary chips
  - "Exclude allergens…" (opens a sheet with the 14 allergens)
  - max price slider
  - spice
- **Dish row:**
  - Text column: name (600), 2-line description (`muted`), tags as small icons (vegan leaf, chilli ×n, star for chef pick).
  - Price block at the end edge: base currency on top, secondary currency below in `muted` 13 px.
  - Thumbnail 84×84 at the end edge.
  - Unavailable dishes show at 50% opacity with the chip "Not available today".
- **Footer:**
  - LBP rate disclosure: "Prices in USD. LBP at 89,500 per $1 (set by the restaurant today)."
  - Allergen notice link, privacy link.

### 6.3 Dish sheet

- Photo, full width, 4:3. Name in the primary and secondary locale. Description.
- **Key ingredients** as a wrap list. Removable ingredients show a "can remove" tag.
- **Options:**
  - Group title with its rule ("Choose 1", "Up to 2").
  - Radio or checkbox rows with the price delta.
  - Options with allergen impact show a small allergen icon with a tooltip.
- **Quantity stepper.** **Note** field (140 characters).
- **Allergen section** follows ALLERGEN_SAFETY §4.
- **Sticky bottom CTA:**
  - Joined and ordering allowed: "Add to my order · $6.50".
  - Not joined: "Join table to order".
  - Browse-only: "Ask about this dish" (opens chat pre-filled).

### 6.4 Join sheet

- Title: "Who's ordering?"
- Name input with the hint "Your friends will see this name".
- Emoji picker (optional).
- Primary button "Join table 12".
- Small print: "No account needed. We don't collect your phone number."

### 6.5 Table bar and Table sheet

- **Table bar** (64 px, sticky bottom):
  - avatars (max 5, then "+3");
  - "Table 12";
  - my items count badge;
  - my running total in base currency.
- **Table sheet:** tabs **Mine | Table | Bill** (GROUP_ORDERING §11).
  - **Status chips:**
    - Draft (outline)
    - Waiting for approval (amber)
    - In the kitchen (blue)
    - Ready (green)
    - Served (grey)
    - Not accepted (red, with reason)
  - **Send confirmation** is a full sheet: list of items, total, warnings, and the "Send to the kitchen" button.

### 6.6 Bill

- **Mode switch:** "By person" | "Split equally".
- **Person card:**
  - avatar, name;
  - items with fractions;
  - Subtotal / Service / Total;
  - VAT included line;
  - big total in USD with LBP below;
  - status chip (Unpaid · Partly paid · Paid · Covered by Rami).
- **My card** is pinned first, then the others in join order.
- **Buttons:** "I'll pay for…" (multi-select sheet) and "Request the bill".
- **After payment:** "View receipt" and "Share on WhatsApp".

### 6.7 Assistant

- **Ask button:** a floating pill at the bottom end above the table bar: "Ask" / "اسأل". It does not cover prices.
- **Chat sheet** (90% height):
  - header with the assistant name, "Powered by the restaurant's menu", and a close control;
  - suggestion chips on first open, per locale;
  - messages;
  - input with mic? **No** (v1 is text only);
  - the disclaimer line.
- **Blocks:**
  - **dish chips** — inline, tappable, open the dish sheet;
  - **dish cards** — horizontal scroll;
  - **AllergenCard** — bordered, 6 px radius, stamp, rows, footer, Call staff;
  - **AddToOrder** — dish, options, price, "Add to my order";
  - **StaffHelp** — a full-width button.
- **Suggestion chips:**

| en | ar |
|---|---|
| What's popular here? | شو الأطباق المشهورة؟ |
| Vegetarian options | خيارات نباتية |
| Something light under $10 | شي خفيف بأقل من 10$ |
| Is anything spicy? | في شي حار؟ |
| I have an allergy | عندي حساسية |

### 6.8 Other states

- **Offline:** a top banner, "You're offline — showing the saved menu. Ordering will be back when you reconnect."
- **Invalid or regenerated QR:** "This QR code is no longer active. Please ask your server."
- **Restaurant suspended:** "This menu isn't available right now."
- **Session closed:** a thank-you screen with the receipt and a 5-star rating.

## 7. Console screens (summary — build with shadcn/ui)

| Screen | Key elements |
|---|---|
| Onboarding wizard | 6 steps: Restaurant → Currency & charges → Import menu → Review → Allergens → Tables & QR → Publish. Progress saved. |
| Menu editor | Category list (drag), item list (drag, quick 86 switch, price inline edit), item drawer with tabs (Basics · Prices · Ingredients · Allergens · Options · Visibility · Translations) |
| Allergen matrix | Sticky first column (dish), 14 columns with status cycle on tap, row "Confirm" button, filters, legend, counters ("38 of 52 confirmed") |
| Import review | Pages rail (thumbnails, status), extracted tree with inline editing, flags panel, Apply |
| Tables & QR | Areas, tables grid, "Print table tents" (layout picker + preview) |
| AI settings | Toggle, name, tone, upsell, FAQ editor, test chat panel side-by-side |
| Live floor (staff) | Table tiles coloured by state; side panel with pending rounds & calls; sound toggle; works in portrait on phones |
| Table detail (staff) | Participants columns, items with status, approve/reject, add item for…, bill tab with payments & change calculator |
| Kitchen display | Dark theme, columns by round, large text, tap to cycle status, station filter, timers with colour thresholds (8/15 min) |
| Insights | KPI row, dish funnel table, questions & gaps list ("Fix now"), dietary demand bars, peak-hour heatmap, weekly report card |
| Settings / Team / Billing | Standard forms; billing shows plan, usage meters, "Renew via WhatsApp" |

## 8. Microcopy (core strings; full catalogs in `messages/*.json`)

| Key | en | ar |
|---|---|---|
| table.scanTitle | Scan to see the menu & order | امسح الرمز لتصفّح القائمة والطلب |
| join.title | Who's ordering? | مَن يطلب؟ |
| join.cta | Join table {label} | انضمّ إلى الطاولة {label} |
| item.add | Add to my order | أضِف إلى طلبي |
| item.unavailable | Not available today | غير متوفّر اليوم |
| table.sendMine | Send my order | أرسِل طلبي |
| table.sendReady | Send everyone's ready orders | أرسِل طلبات الجاهزين |
| table.ready | I'm ready | أنا جاهز |
| status.pending | Waiting for approval | بانتظار الموافقة |
| status.kitchen | In the kitchen | في المطبخ |
| status.ready | Ready | جاهز |
| status.served | Served | قُدِّم |
| status.rejected | Not accepted | لم يُقبَل |
| calls.waiter | Call waiter | نادِ النادل |
| calls.bill | Request the bill | اطلب الحساب |
| calls.water | Water, please | ماء من فضلك |
| bill.byPerson | By person | حسب الشخص |
| bill.equal | Split equally | تقسيم بالتساوي |
| bill.yourShare | Your share | حصّتك |
| bill.payFor | I'll pay for… | سأدفع عن… |
| bill.coveredBy | Covered by {name} | دفع عنه {name} |
| bill.vatIncluded | Includes VAT {amount} | يشمل ضريبة القيمة المضافة {amount} |
| allergens.title | Allergens | مسبّبات الحساسية |
| allergens.confirmedOn | Confirmed by {restaurant} on {date} | أكّده {restaurant} بتاريخ {date} |
| allergens.notConfirmed | Not confirmed — ask staff | غير مؤكَّد — يُرجى سؤال فريق الخدمة |
| allergens.contains | Contains | يحتوي على |
| allergens.mayContain | May contain traces | قد يحتوي على آثار |
| allergens.notPresent | Not present (confirmed) | غير موجود (مؤكَّد) |
| chat.ask | Ask | اسأل |
| chat.placeholder | Ask about the menu… | اسأل عن القائمة… |
| offline.banner | You're offline — showing the saved menu. | أنت غير متّصل — نعرض القائمة المحفوظة. |

**Copy rules:**
- Simple Modern Standard Arabic in the UI; the assistant may use the diner's dialect.
- Sentence case. Active verbs. An action keeps the same name through its whole flow ("Send my order" → toast "Order sent").
- Errors say what happened and what to do next.

## 9. Accessibility checklist

- Tap targets ≥ 44×44 px.
- Visible focus ring (2 px `primary` with a 2 px offset).
- Sheets trap focus and return focus to the trigger on close.
- Every icon-only button has an accessible name in the current locale.
- Text size control (A / A+ / A++) in the menu header overflow, persisted per device.
- Live regions announce item status changes and the chat streaming completion.
- Colour contrast AA; allergen states never rely on colour alone.
- axe-core has zero serious or critical violations in Playwright for every screen in both `ar` and `en`.

## 10. Performance budgets (enforced in CI via Lighthouse CI on the seed data)

- **Diner `/t/[token]`:**
  - Lighthouse mobile performance ≥ 90
  - LCP < 2.0 s
  - CLS < 0.05
  - TBT < 200 ms
  - initial JS < 130 KB gzipped
- **Images:** the dish list uses 320 w AVIF/WebP with `loading="lazy"` after the first 6. The hero uses `fetchpriority="high"`.
- **Fonts:** at most 2 font files on first load (Arabic + Latin subsets of one variable family).
