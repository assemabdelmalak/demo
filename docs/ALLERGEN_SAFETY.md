# ALLERGEN SAFETY — Non-negotiable rules

This document has the highest precedence of all specs. If any other spec conflicts with it, this one wins.

**Why it matters.**
- Allergen errors can kill.
- Regulation is moving toward *written, verified* allergen information for restaurant food:
  - EU Regulation 1169/2011 Art. 44
  - UK FSA best practice (2025)
  - US FDA Food Code 2022 §3-602.12(C)
  - Dubai Food Code
- Lebanon's restaurant rules are unclear. Being strict is our differentiator and our liability shield.
- Large language models are occasionally confidently wrong about allergies, so **the LLM never authors allergen facts.**

---

## 1. The 14 allergens (codes and display names)

| Code | English | العربية | Français |
|---|---|---|---|
| gluten | Cereals containing gluten | الحبوب التي تحتوي على الغلوتين | Céréales contenant du gluten |
| crustaceans | Crustaceans | القشريات | Crustacés |
| eggs | Eggs | البيض | Œufs |
| fish | Fish | السمك | Poissons |
| peanuts | Peanuts | الفول السوداني (فستق العبيد) | Arachides |
| soybeans | Soy | الصويا | Soja |
| milk | Milk | الحليب ومشتقاته | Lait |
| tree_nuts | Tree nuts | المكسّرات | Fruits à coque |
| celery | Celery | الكرفس | Céleri |
| mustard | Mustard | الخردل | Moutarde |
| sesame | Sesame | السمسم | Sésame |
| sulphites | Sulphites | الكبريتيت | Sulfites |
| lupin | Lupin | الترمس | Lupin |
| molluscs | Molluscs | الرخويات | Mollusques |

These live in `packages/shared/allergens.ts` with icons. The icons must be readable at 20 px. Never rely on colour alone.

## 2. Status model

| Owner status | Diner sees (if confirmed) | Diner sees (if NOT confirmed) |
|---|---|---|
| contains | **Contains** — يحتوي على | Not confirmed — ask staff |
| may_contain | **May contain (traces)** — قد يحتوي على آثار | Not confirmed — ask staff |
| free | **Not present (confirmed)** — غير موجود (مؤكَّد) | Not confirmed — ask staff |
| unknown | Not confirmed — ask staff | Not confirmed — ask staff |

- **Wording rule.** We never write "allergen-free", "safe", or "100%". The positive wording is **"Not present in this dish, per the restaurant"**. Cross-contact is always possible in a shared kitchen. The card footer says so.
- **Owner's own claim.** If the owner wants to claim a dish is suitable for coeliacs or similar, that is a separate **owner-written note**, shown verbatim, attributed to the restaurant and visually distinct. The AI never repeats it as its own words.

## 3. Owner workflow (console)

1. **Default.** Every dish starts with all 14 allergens set to `unknown` and not confirmed.
2. **Suggestions** (from AI or the import text) appear as highlighted chips: "AI suggests: contains sesame (tahini in description)".
   - Suggestions are **never pre-selected**. The owner taps each one to accept it or sets the status manually.
3. **Confirm allergens for this dish:**
   - The button is enabled only when all 14 allergens have an explicitly chosen status. `unknown` is allowed but must be chosen explicitly.
   - A modal shows the summary and the checkbox: "I confirm this reflects the current recipe and preparation of this dish."
   - Clicking **Confirm** records `confirmed_at` and `confirmed_by` on all 14 rows and on the item. An audit log `allergens.confirm` is written with before and after.
4. **Partial confirmation is not allowed.** It is all 14 or nothing per dish. This keeps the "confirmed on" stamp meaningful.
5. **Invalidation.** These changes clear confirmation (`confirmed_at = null` on all rows, `allergens_need_review = true`):
   - editing the ingredients list;
   - editing the description (any locale);
   - changing the attached modifier groups;
   - changing an attached option's `adds_allergens`.

   The console then shows "Needs re-confirmation". The diner sees "Not confirmed — ask staff" after the next publish.
6. **Changes that do NOT invalidate:** price, photo, name translation, position, availability.
7. **Options.**
   - `adds_allergens` on a modifier option needs its own confirmation (`adds_allergens_confirmed_at`).
   - If unconfirmed, the diner sees on that option: "Allergen impact of this option not confirmed".
8. **Allergen matrix page.**
   - Grid of dishes × 14 allergens, keyboard and touch friendly.
   - Filters: needs confirmation / confirmed / has unknown.
   - Bulk-setting a column for selected dishes is allowed; **confirmation is still per dish**, with one click per row.
9. **Publish warning.** "12 visible dishes have unconfirmed allergens. Diners will see 'Not confirmed — ask staff' for these." Publishing is still allowed.

## 4. Diner display rules

- **Dish sheet allergen section:**
  - Title: "Allergens" / "مسبّبات الحساسية".
  - Stamp: "Confirmed by {restaurant} on {date}" / "أكّده {المطعم} بتاريخ {date}".
  - Then lists in this order: **Contains**, **May contain**, **Not present (confirmed)**, **Not confirmed**.
  - Footer (always): "Kitchens handle many ingredients. If you have a severe allergy, please tell your server before ordering." plus a **Call staff** button.
- **Never confirmed:** if the dish has no confirmation at all, show a single line, "Allergen information not confirmed by the restaurant — please ask staff", and the Call staff button.
- **Filters ("Exclude allergens"):**
  - Matching dishes = confirmed `free` for **all** selected allergens.
  - Dishes with any `unknown` go in a collapsed group "Not confirmed (ask staff)".
  - Dishes with `contains` or `may_contain` are hidden.
- **The AllergenCard in chat is built from snapshot data only.** It shows the requested allergens per dish, the stamp, the footer and the Call staff button.

## 5. Assistant wording templates (exact copy; `packages/ai/safety/templates.ts`)

**ALLERGEN_CARD_INTRO**
- en: "Here's what the restaurant has confirmed — please double-check with your server, especially for severe allergies."
- ar (MSA): "هذه المعلومات كما أكّدها المطعم — يُرجى التأكّد من فريق الخدمة، خصوصًا في حالات الحساسية الشديدة."
- ar-LB: "هيدا يلي أكّدو المطعم — بس تأكّد/ي من الـserveur، خصوصًا إذا الحساسية قوية."
- fr: "Voici ce que le restaurant a confirmé — vérifiez auprès du serveur, surtout en cas d'allergie sévère."

**ALLERGEN_GUARD_REPLACEMENT** (when the output guard trips)
- en: "I can't confirm allergy safety myself. The card below shows exactly what the restaurant has confirmed, and your server can check with the kitchen."
- ar: "لا يمكنني تأكيد سلامة الطبق لحالات الحساسية. البطاقة أدناه تعرض ما أكّده المطعم تحديدًا، ويمكن لفريق الخدمة التحقّق مع المطبخ."
- ar-LB: "ما فيني أكّد إذا الطبق مناسب للحساسية. البطاقة تحت فيها شو أكّد المطعم بالضبط، والـserveur فيه يتأكّد من المطبخ."
- fr: "Je ne peux pas confirmer la sécurité pour une allergie. La carte ci-dessous indique ce que le restaurant a confirmé, et votre serveur peut vérifier en cuisine."

**SEVERE_ALLERGY** (always followed by the StaffHelp button)
- en: "For a severe allergy, please speak to your server before ordering — they'll check ingredients and preparation with the kitchen. Tap below to call them."
- ar: "في حالة الحساسية الشديدة، يُرجى التحدّث إلى النادل قبل الطلب ليتحقّق من المكوّنات وطريقة التحضير مع المطبخ. اضغط أدناه لاستدعائه."
- ar-LB: "إذا الحساسية قوية، احكي مع الـserveur قبل ما تطلب، هوّي بيتأكّد من المطبخ. كبوس تحت لتناديه."
- fr: "En cas d'allergie sévère, parlez à votre serveur avant de commander — il vérifiera avec la cuisine. Appuyez ci-dessous pour l'appeler."

**NOT_ON_MENU**
- en: "That isn't listed on the menu. Your server can tell you if the kitchen can help."
- ar: "هذا غير مذكور في القائمة. يمكن لفريق الخدمة إخبارك إن كان المطبخ يستطيع المساعدة."
- ar-LB: "هيدا مش موجود بالمنيو. الـserveur فيه يقلّك إذا المطبخ بيقدر يساعد."
- fr: "Ce n'est pas indiqué sur la carte. Votre serveur pourra vous dire si la cuisine peut s'adapter."

**AI_UNAVAILABLE**
- en: "The assistant isn't available right now. You can browse the full menu, or call your server."
- ar: "المساعد غير متاح حاليًا. يمكنك تصفّح القائمة كاملة أو استدعاء النادل."
- fr: "L'assistant n'est pas disponible pour le moment. Parcourez la carte ou appelez votre serveur."

**OFF_TOPIC**
- en: "I can only help with this restaurant's menu and your visit."
- ar: "يمكنني المساعدة فقط في ما يخصّ قائمة هذا المطعم وزيارتك."
- fr: "Je ne peux vous aider que pour la carte de ce restaurant et votre visite."

**Chat input disclaimer** (always visible under the input box)
- en: "Answers come from the restaurant's menu. For allergies, always confirm with staff."
- ar: "الإجابات من قائمة المطعم. في حالات الحساسية، تأكّد دائمًا من فريق الخدمة."
- fr: "Les réponses proviennent de la carte. Pour les allergies, confirmez toujours avec le personnel."

> The founder should have a native speaker review all Arabic and French copy before launch (OWNER_CHECKLIST).

## 6. Engineering controls (must exist and be tested)

| Control | Where | Test |
|---|---|---|
| Diner status = confirmed ? status : unknown | `menu.publish` snapshot builder | Unit: unconfirmed rows never appear in the snapshot as non-unknown |
| Snapshot excludes suggestions | snapshot builder | Unit: `suggested_*` keys absent |
| AI context excludes allergen statuses | `buildAiContext` | Unit: no status words in the context text |
| Allergen pre-router | `safety/preRoute` | ≥ 200 labelled messages; recall ≥ 99% on allergen messages |
| Forced `check_allergens` in allergen mode | orchestrator | Integration with a mocked LLM: first call has `tool_choice` set |
| Sentence gate + output guard | orchestrator + `safety/outputGuard` | ≥ 300 labelled sentences; 0 false negatives on the "unsafe claim" set |
| Severe → StaffHelp enforced server-side | orchestrator | Integration: severe message without a model tool call still yields a StaffHelp block |
| Confirmation invalidation | menu service | Unit + integration for each invalidating field |
| Audit of confirmations | audit service | Integration |
| Evals `allergen_safety` 100% | CI eval job | Required check |

## 7. Legal copy hooks

- **Restaurant terms of service** must state:
  - the restaurant is responsible for the accuracy of allergen and ingredient data;
  - Radd displays the restaurant's confirmed data faithfully and timestamps it.

  The founder gets these from a Lebanese lawyer.
- **Diner privacy notice and allergen notice** are linked from the menu footer.
- Store the terms version accepted per organisation (`organization.terms_version_accepted`).
