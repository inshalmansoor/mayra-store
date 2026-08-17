# 09 — Admin panel v2: AI product agent + shipping control

Two pieces of admin work, both about moving decisions out of code and into the owner's hands:

- **Part A (§1–14)** — adding a product currently means understanding a slug, a `variant_key`, a colour key, an SKU, an option type, and the difference between "no variant row" and "stock 0". That is a database schema wearing a form. Part A replaces it with **a photo, a sentence, and a conversation**: an agent that drafts what it can, asks the owner about what it genuinely cannot know, and explains every suggestion it makes.
- **Part B (§15–22)** — shipping is currently two hardcoded environment variables. Part B hands the owner full control: a master switch for single vs multiple rates, per-tier pricing with delivery estimates, a free-shipping switch, and a free-over-threshold — all editable without a deploy.
- **Part C (§23–28)** — caching, for faster first loads and near-instant repeat loads. Includes one measured bug (uploaded product images are served uncacheable) and the invalidation plumbing that Parts A and B both need in order to publish changes immediately.

**Decisions taken in the design conversation:**

| Question | Decision |
|---|---|
| Provider | Google **Gemini Flash**, free tier, behind a provider adapter |
| Price / stock / material | **Owner decides**, but the agent *asks* for them conversationally — see §3 |
| Interaction model | **Hybrid**: chat on the left, draft form filling in live on the right |
| Ask policy | Ask only what it cannot know; **suggest** the rest with a stated reason |
| "I don't know, you decide" | Agent decides and moves on, flagging every auto-decision — see §1 |
| Save gate | Complete draft shown for final review; nothing persists until the owner saves |
| Scope | New products **and** a regenerate-copy action on existing ones |
| Shipping, multi-rate off | The rate marked **default** applies, with no choice shown to customers |

---

# Part A — AI product agent

## 1. What the agent decides, suggests, and asks

The split is drawn along one line: **can this be known from the photo and the description?** If not, the agent asks rather than invents.

| Field | Behaviour | Why |
|---|---|---|
| `name` | **Suggests** | Naming is the hard part and the model is genuinely good at it |
| `slug` | **Suggests**, checked for collisions | Derived from the name; permanent once set — see §5 |
| `category` | **Suggests**, constrained to an enum | Only 4 legal values, all visually distinguishable |
| `collection` | **Suggests** from existing, or asks | Dropdown requirement — see §7 |
| `blurb` | **Suggests** | Pure copywriting from a visible object |
| `care` | **Suggests** from a house list | Not free invention — see §4 |
| `options` / variant structure | **Asks**, then proposes axes | "One size or several?" is unanswerable from one photo — see §6 |
| `sku` | **Suggests** | Pattern-based (`MYR-XX-01`), unique-constrained in DB |
| `alt` text | **Suggests** | Accessibility copy from the image |
| **`base_price`** | **Asks** (with a grounded range) | A margin decision. See §3 on how the suggestion is grounded |
| **`stock` per variant** | **Asks** | Physically uncountable from a photo. An invented number oversells and forces order cancellations |
| **`material`** | **Asks** (dropdown) | A photo cannot distinguish 18k gold-plated stainless steel from solid gold from brass. A wrong material is a **misleading claim to a paying customer**, not a cosmetic error |

Two rules that make this work in practice:

- **Every suggestion carries a one-line reason.** Not `name: "Golden Textured Band"` but *"I'd call it Golden Textured Band — 'textured' matches the hammered finish, and your other rings use a colour-then-detail pattern."* This is what makes the draft reviewable instead of something to rubber-stamp.
- **The agent must never fill an "asks" field from the image**, even if it thinks it can tell. Material in particular: silence is correct, guessing is not.

> The material rule is the one non-negotiable in this document. Everything else is a UX preference; that one is consumer protection.

### When the owner delegates: *"I don't know, you decide"*

The owner must always be able to hand a decision back. The agent should recognise this in natural language — *"you decide"*, *"dunno"*, *"up to you"*, *"whatever you think"*, *"skip it"* — not just one exact phrase, and then **decide and move on rather than asking again**. Re-asking a question the owner has explicitly delegated is the single most annoying thing this feature could do.

What "decide" means differs by field, because the available evidence differs:

| Delegated field | What the agent does | Basis |
|---|---|---|
| `name`, `slug`, `blurb`, `care`, `alt`, `sku`, `category` | Takes its own suggestion | Already grounded in the photo and house conventions |
| `collection` | Chooses `null` | Absence is a safe default; a wrong collection fragments filtering |
| Variant axes | Assumes a single `default` variant | The simplest structure that works; axes can be added later on the edit screen |
| `base_price` | Uses the **median of active products in the same category** | Real data from the owner's own catalogue — see §3 |
| `stock` | Sets **1** | The one piece in the photo demonstrably exists. Overselling exposure is capped at a single item, and `0` would render the product unbuyable and look like a bug |
| **`material`** | Uses the **store's default** (`18k gold-plated stainless steel`), **never visual inference** | See below — this distinction is the whole point |

**Why material is still safe under delegation.** Falling back to the store's documented default material is a different act from guessing a material off a photo. The default is a fact about the business — it is already the column default in `models.py` and the hardcoded value in the current new-product form, and it is what every product in the catalogue currently uses. Inferring "this looks like solid gold" from an image is a claim about *this specific object* that nothing in the input supports. Delegation gets the former, never the latter. If the owner's stock ever spans genuinely different materials, this default is the thing to revisit first.

**Everything auto-decided is flagged in the review form** — a visible `auto` badge plus the reason, distinct from ordinary suggestions. At the final review the owner can see exactly what they delegated and override any of it. Delegation is not a way to skip the review gate; it just stops the questions.

---

## 2. The agent loop

```
   photo  +  "new gold ring, textured"
                    │
                    ▼
        ┌───────────────────────────┐
        │  vision pass — ONCE       │   image tokens paid a single time,
        │  → structured visual      │   never re-sent on later turns
        │    facts + first draft    │
        └─────────────┬─────────────┘
                      │
   ┌────────── agent loop, text-only ──────────┐
   │                                            │
   │   agent  →  { message, questions[],        │
   │               draft{}, suggestions{} }     │
   │                    │                       │
   │        chat pane ◀─┴─▶ draft form          │
   │        (left)           (right, live)      │
   │                    │                       │
   │   owner  →  answers in the chat box        │
   │                                            │
   └──────────────┬─────────────────────────────┘
                  │  no blocking questions left
                  ▼
        complete draft, owner reviews the form
                  │  clicks Save
                  ▼
   existing endpoints, unchanged, in this order:
     1. POST /api/admin/products                (create)
     2. PUT  /api/admin/products/{id}/options   (confirm=true)
     3. POST /api/admin/products/{id}/variants  (one per made combo)
     4. POST /api/admin/products/{id}/images    (the photo)
```

**The agent never writes to the database.** It is a pure function — context in, JSON out. Persistence goes through the four existing endpoints after the owner confirms, so every rule already enforced there still applies for free: slug uniqueness, the four-featured cap, the `variant_key` rebuild preview in `replace_options`, `stock >= 0`, and the unique-SKU constraint. No validation is reimplemented and no tested path is bypassed.

### Every turn returns the whole draft, not just a message

Because the form updates live beside the chat, the response shape is the same on every turn:

| Field | Purpose |
|---|---|
| `message` | The conversational text shown in the chat pane |
| `questions[]` | Each with an `id`, the question text, a `blocking` flag, and optional choices for a dropdown/radio |
| `draft{}` | The complete current draft — every field the agent knows so far. The form re-renders from this |
| `suggestions{}` | Per-field rationale strings, rendered as hint text under each field |
| `done` | True when nothing blocking remains |

`blocking` is what gates the Save button: price, material, and stock cannot be left unanswered. Everything else is a suggestion the owner may ignore.

### The vision pass runs once

Re-sending the image on every conversational turn would multiply the largest cost in the request by the number of turns, for no benefit — the picture does not change. So the first call extracts structured visual facts (form, finish, colour, apparent components, any visible variants) and **subsequent turns carry those facts as text**. The image bytes are sent to the model exactly once per product.

---

## 3. Grounding the price question in real data

"What price?" is a worse question than "what price? — your other rings run Rs 2,400–4,000." So before asking, the endpoint runs a read-only query for the **min/max/median `base_price` of active products in the same category** and hands that to the agent as context.

The agent still never *sets* the price. It asks, with the owner's own catalogue as the reference range. Same technique for SKU (show the existing pattern) and collection (show what already exists).

---

## 4. Care instructions are selected, not invented

`care` is a JSONB list shown to customers as care advice. An agent inventing "safe to wear while swimming" for a plated piece is wrong in a way that damages both the product and the customer's trust.

The agent receives the house care list (currently the three lines hardcoded in `frontend/app/admin/products/new/page.tsx`) and may **select and order** from it, plus at most one addition drawn from the owner's own words. It may not author care claims from the image.

---

## 5. Slug collisions

The form labels slug **"permanent"**, and `create_product` rejects duplicates with a 400. So the agent's proposed slug is **checked against the database before it reaches the owner**, appending `-2`, `-3`… on collision. The owner sees a slug that will actually save, and it stays editable with the permanence warning intact.

This read is the one exception to "the agent endpoint doesn't touch the database" — it reads, never writes.

---

## 6. The `variant_key` trap — the agent must not generate keys

This is the highest-risk part of Part A, and the reason variant structure is handled indirectly.

Per `plans/02-database.md §4` and enforced by `variantKey()` in `frontend/lib/variants.ts`, a `variant_key` is **option values joined by `|` in `position` order**, or the literal `default` for a product with no options. The frontend recomputes that key from the option list on every render to look up stock.

If the agent emits `variant_key` strings directly, any disagreement with the positional contract — a reordered axis, a mismatched `valueId`, a wrong separator — produces variants **the storefront silently cannot find**. Stock appears to vanish; nothing errors. This is precisely the failure class the *"Do not 'improve' this without re-walking that checklist"* warning at the top of `variants.ts` exists to prevent.

**Therefore:** the agent asks about axes in plain language ("does this come in more than one size?"), proposes only the *axes and their values*, and the backend takes the cartesian product and generates keys with the same positional rule the frontend uses. The agent never sees or writes a `variant_key`.

### Made vs not-made must survive

`ProductVariant`'s docstring encodes a three-state distinction the form has to preserve:

| State | Storefront rendering |
|---|---|
| no row | "Not made in this combination" — hatched out |
| row, `stock = 0` | "Sold out" — struck through |
| row, `stock > 0` | Available |

So the stock step cannot be a flat list of number inputs. Each generated combination needs three states: **not made** (no row), **made but out of stock** (row, 0), **in stock** (row, N). The agent asks about this directly — *"you listed sizes 16, 18, 20 — is every size actually made, or only some?"* — because collapsing it to "just enter a number" would erase a distinction the storefront already renders three different ways.

---

## 7. Collection dropdown

`collection` is currently a nullable free-text column with no table and no constraint.

- New endpoint `GET /api/admin/collections` → `SELECT DISTINCT collection FROM products WHERE collection IS NOT NULL`.
- The form offers those values, a free-text "new collection" input, and blank.
- The agent may only pick from the existing list or return `null` — never invent a name, since a typo'd variant fragments a collection silently. If it thinks a new collection is warranted, it *asks*.

> ⚠️ **Pre-existing inconsistency worth knowing.** `ProductCard.tsx` hardcodes the collection badge to one value: `product.collection === "golden-essence"`. Any other collection is stored and filterable but renders **no badge**. Adding collections through this dropdown will not light one up. That's existing behaviour, flagged so its absence isn't mistaken for a bug in this feature.

---

## 8. Conversation state lives in the browser

The agent endpoint is **stateless**; the client sends the transcript back each turn. LLM APIs are stateless anyway, so this adds no new table and no cleanup job.

| Approach | Verdict |
|---|---|
| Client holds transcript, resends each turn | **Chosen.** No schema change, no orphan rows |
| DB-backed draft sessions | Rejected for now — needs a table, a reaper for abandoned drafts, and buys little for a two-minute flow |

The tradeoff: **a page refresh mid-conversation loses the draft.** Acceptable at this length, and worth a "you'll lose this draft" confirmation on navigate-away. If drafts later need to survive refreshes, that's the moment to add the table.

---

## 9. The image is sent twice, on purpose

The existing upload endpoint is `POST /api/admin/products/{product_id}/images` — it needs a product that already exists, since `upload_product_image` builds the storage path from `product_id`. But the agent must see the photo *before* the product exists.

| Approach | Verdict |
|---|---|
| Analyse in memory, re-upload after save | **Chosen.** Simple, no orphans |
| Stage to a temp storage path, move after save | Rejected — abandoned drafts leave orphaned objects needing a reaper |
| Create the product first, then analyse | Rejected — defeats the review gate, litters the DB with abandoned rows |

Cost: the file crosses the wire twice (≤5MB, per the existing `MAX_BYTES` cap). Cheap, and it keeps storage clean. The frontend holds the `File` in memory across the conversation.

---

## 10. Provider adapter

The provider is deliberately **not** hardcoded. A thin adapter (`backend/app/ai/provider.py`) exposes one operation — given context and a JSON schema, return validated JSON — with Gemini first.

Why this matters more than it looks:

- Gemini's free tier is **rate-limited** per minute and per day, and an agentic flow makes several calls per product rather than one. A burst of uploads can hit it. The adapter makes the fallback a config change.
- Free-tier Gemini inputs **may be used to train Google's models**.
- Paid comparison: Claude Haiku 4.5 at $1/$5 per million tokens works out to roughly **1.5–2 US cents per product** across a typical 3-turn conversation (~8,500 input including the single vision pass, ~1,800 output) — about **$1/month at 50 products**. Worth knowing the escape hatch is under a dollar.

> Note for whoever writes the code: the `claude-api` skill in this repo's tooling emits Anthropic SDK code. Gemini here is a deliberate, owner-chosen non-Anthropic path — don't let that skill silently convert this module to Claude. If the provider ever flips to Haiku, that skill becomes the right reference.

### Config

| Key | Purpose |
|---|---|
| `AI_ENABLED` | Kill switch. `false` hides the agent; the manual form still works |
| `AI_PROVIDER` | `gemini` initially |
| `AI_MODEL` | Model id, so a model bump needs no code deploy |
| `AI_MAX_TURNS` | Question-loop cap — see §11 |
| `GEMINI_API_KEY` | Secret. **No `NEXT_PUBLIC_` prefix** — server-side only |

All go in `.env`, `.env.example`, and Vercel. Per `plans/07-deployment-vercel.md`, **a Vercel env change needs a fresh build**, not just a redeploy.

---

## 11. Failure must degrade, and the loop must terminate

The agent is an accelerator, not a dependency. Every failure lands the owner on the normal editable form with whatever was filled so far:

| Failure | Behaviour |
|---|---|
| `AI_ENABLED=false` | Agent not rendered; manual form only |
| Missing/invalid API key | Inline notice, manual form works |
| Rate limit (429) | "Try again in a minute, or fill it in manually" — draft stays editable |
| Timeout | Hard cap (~20s per turn, under `vercel.json`'s `maxDuration: 30`), then fall through to manual |
| Malformed JSON | Reject that turn, keep the previous draft. Never half-apply |
| **Turn cap reached** | Agent must stop asking and emit a best-effort draft with remaining gaps marked blocking |

`AI_MAX_TURNS` (default ~8) is a real safety requirement, not polish: an agent that keeps asking questions is worse than a form, and on a rate-limited free tier a runaway loop burns the daily quota. At the cap it summarises what it still needs and hands over.

Validation is Pydantic-side every turn: `category` against the real category list, `collection` against existing values or `null`, `care` against the house list, no unexpected fields. A draft failing validation is discarded whole.

---

## 12. Prompt injection surface

Low risk, worth documenting. Two untrusted-ish inputs reach the model: the owner's own typing (they are the trusted operator — negligible) and **text inside the uploaded image**, which could in principle carry instructions.

Blast radius is bounded by design: output is a constrained schema validated field-by-field against enums and existing DB values, and the endpoint has no write access. The worst achievable outcome is a bad draft the owner sees and rejects. No mitigation beyond existing validation is warranted.

---

## 13. Regenerate copy on existing products

`POST /api/admin/ai/regenerate-copy/{product_id}` regenerates **copy only**:

- **In scope:** `blurb`, `alt` text, optionally `name`.
- **Never touched:** `price`, `stock`, `material`, `slug`, `options`, `variants`. Slug is permanent and the other four are owner-only from §1 — an "improve the wording" action must not be able to silently reprice a product or change a material claim.

Same review gate, same suggestion-with-reason format. It reads the product's existing images from `product_images` rather than requiring a re-upload.

---

## 14. Build order and testing

| Phase | Work | Done when |
|---|---|---|
| 1 | Provider adapter + single-turn draft endpoint, no UI | `curl` with a real photo returns valid, schema-checked JSON |
| 2 | Multi-turn loop: transcript in, `questions[]`/`draft{}`/`suggestions{}` out | A scripted 3-turn conversation resolves all blocking fields |
| 3 | `GET /api/admin/collections`, material list, category price ranges | Grounded suggestions appear in responses |
| 4 | Hybrid UI — chat pane + live draft form | A product created end-to-end via conversation appears on the storefront |
| 5 | Per-combination stock step with the three-state control from §6 | Not-made vs sold-out vs in-stock all render correctly |
| 6 | Regenerate-copy on the existing edit page | Blurb improves without touching price/stock/material |
| 7 | Guardrails from §11 | Revoked key, rate limit, and turn cap all leave a usable form |

Phases 1–4 are the shippable core; 5 is required before using this for any product with options.

### Tests

1. **Golden set.** Five real photos — a plain chain, an obvious colour variant, a ring (size axis), an earring pair, and a deliberately bad photo. Check field-by-field, and check the *questions* are sensible, not just the draft.
2. **Ask discipline.** Confirm price, material, and stock are **never** populated without the owner answering — especially material on an ambiguous photo.
3. **Three-state variants.** Two axes, one combination not-made and one sold-out; confirm the storefront hatches the first and strikes the second.
4. **Slug collision.** Draft the same product twice; the second returns a `-2` slug that saves.
5. **Turn cap.** Answer evasively and confirm it stops at `AI_MAX_TURNS` with a usable draft instead of looping.
6. **Delegation.** Reply *"I don't know, you decide"* to each asked field in turn. Confirm the agent (a) does not re-ask, (b) fills price from the category median, stock as 1, and material from the store default rather than the image, and (c) flags every one of those with an `auto` badge in the review form.
7. **Failure paths.** Break the key, then hit the rate limit — the manual form stays fully usable.

---

# Part B — Admin-controlled shipping

## 15. What exists today, and why it can't do this

Shipping is currently **two environment variables**:

```python
FREE_DELIVERY_THRESHOLD: int = 5000
DELIVERY_FEE: int = 250
```

Consumed in one place server-side (`compute_totals` in `backend/app/pricing.py`) and mirrored client-side in `computeTotals` in `frontend/lib/pricing.ts`:

```python
delivery = 0 if payable >= settings.FREE_DELIVERY_THRESHOLD or subtotal == 0 else settings.DELIVERY_FEE
```

Three consequences that block the requirement:

1. **The owner cannot change shipping at all.** These are env vars, so a rate change means editing Vercel and triggering a fresh build — and per `plans/07-deployment-vercel.md`, a redeploy of the existing build is *not* enough. "The admin decides" is currently false.
2. **There is exactly one rate, always on.** No way to express "Standard Rs 200, 3–4 days" beside "Express Rs 400, next day" — and no way to turn multi-rate off again once it exists.
3. **`orders` cannot record which method was chosen.** `Order` has `delivery_fee` but no shipping-method column. The moment a second rate exists, an order reading "Rs 400 delivery" is ambiguous — express, or a standard rate since repriced? You cannot fulfil or explain that order.

Point 3 must be fixed *with* the feature, not after it.

---

## 16. The four switches the owner gets

| Switch | Storage | Effect |
|---|---|---|
| **Multiple rates on/off** | `shipping_multiple_rates_enabled` | On: customers choose at checkout. Off: everyone pays the **default** rate, no choice shown |
| **Free shipping on/off** | `shipping_free_all` | Zeroes every rate flagged `free_shipping_eligible` |
| **Free over ₨X** | `shipping_free_threshold` | Same, but only once the payable total reaches X. `"0"` disables |
| **Per-tier rates** | `shipping_rates` table | Label, delivery estimate, fee, and eligibility per tier |

The master switch is the piece that makes this reversible: **turning multi-rate off preserves the rate list.** The owner can run one flat rate today, flip to three tiers for the festive season, and flip back — losing nothing either way. That's why single-rate mode reuses the default rate rather than having its own separate fee field.

---

## 17. Data model

### New table: `shipping_rates`

Rates are records with their own fields and ordering, so they belong in a table — not crammed into the key/value `settings` table as a JSON blob. This mirrors how `categories` is already a table.

| Column | Type | Purpose |
|---|---|---|
| `id` | uuid PK | |
| `label` | text | `"Standard"`, `"Express"` |
| `delivery_estimate` | text | `"3–4 days"`, `"next day"`, `"within a month"` — free text, shown to customers |
| `fee` | int | Rupees, `>= 0` (a `0` rate is a legitimate always-free tier) |
| `is_active` | bool | Soft delete — see §20 |
| `is_default` | bool | Pre-selected in multi-rate mode; **the only rate charged in single-rate mode** |
| `free_shipping_eligible` | bool | Whether the free-shipping switches may zero this tier |
| `sort_order` | int | Checkout display order |

`free_shipping_eligible` resolves the otherwise-awkward interaction in §18: it lets the owner say *"free shipping applies to Standard, but Express still costs Rs 400."*

### New `settings` rows (key/value, already admin-editable)

| Key | Values | Meaning |
|---|---|---|
| `shipping_multiple_rates_enabled` | `"true"` / `"false"` | Master switch |
| `shipping_free_all` | `"true"` / `"false"` | Global free shipping |
| `shipping_free_threshold` | integer string, `"0"` disables | Free over this order value |

These are scalars, so the existing `Setting` table and its `PATCH /api/admin/settings/{key}` endpoint handle them with **no new code**. The two env vars become **seed values only** — read once to create the initial rate and threshold, then never consulted again.

### New `orders` columns

Following the denormalization philosophy already stated in `OrderItem`'s docstring — *"an order is a historical record and must not change when a product is later renamed, repriced, or deleted"* — the order snapshots the shipping choice rather than only pointing at it:

| Column | Type | Purpose |
|---|---|---|
| `shipping_rate_id` | uuid FK → `shipping_rates`, `ON DELETE SET NULL`, nullable | Provenance |
| `shipping_label` | text | Snapshot, e.g. `"Express · next day"`. Survives rename or deactivation |
| `delivery_fee` | *(exists)* | The amount actually charged |

> `plans/02-database.md` is the DDL of record and `models.py`'s header says the two stay in lockstep. Both must change together.

---

## 18. The money maths

Two steps: pick the rate, then price it.

### Step 1 — which rate applies

| Mode | Behaviour |
|---|---|
| `shipping_multiple_rates_enabled = true` | Customer chooses from active rates; the `is_default` one is pre-selected |
| `shipping_multiple_rates_enabled = false` | The `is_default` rate, always. No selector rendered, and any rate id posted by a client is ignored in favour of the default |

### Step 2 — what it costs

For the resolved rate, **first match wins**:

| # | Condition | Fee |
|---|---|---|
| 1 | Cart subtotal is 0 | `0` |
| 2 | `shipping_free_all` **and** rate is `free_shipping_eligible` | `0` |
| 3 | `shipping_free_threshold > 0` **and** payable ≥ threshold **and** rate is `free_shipping_eligible` | `0` |
| 4 | otherwise | `rate.fee` |

"Payable" means subtotal minus discount — matching the existing rule, which compares the post-discount figure against the threshold. Keeping that unchanged matters: switching to a pre-discount comparison would silently change who qualifies.

Consequences worth stating plainly:

- Global free shipping does **not** hide the paid tiers. Express stays purchasable as an upgrade — which is why rule 2 checks the per-rate flag instead of zeroing everything.
- A rate with `free_shipping_eligible = false` always costs its `fee`, whatever the switches say.
- The *"Rs X more for free delivery"* hint in `computeTotals` must be computed against the threshold **and** shown only while an eligible rate is selected — otherwise it promises a discount that will not arrive.

---

## 19. The pricing mirror is the highest risk in Part B

Both pricing files carry an explicit warning:

> *"Mirrors lib/pricing.ts on the frontend exactly — if you change a rule here, change it there too, or the cart will show one total and the confirmation email a different one."*

Part B changes the delivery rule, so **both files change in the same commit**, with §18 as the shared specification. Two signature changes:

- `compute_totals(lines, discount_code)` → also takes the resolved rate.
- `computeTotals(cart, products, discountApplied, settings)` → also takes the selected rate id; `settings` gains the rates array and the three switches.

Drift here does not throw — it silently shows one total in the cart and charges another in the email. Test 1 in §22 exists to catch exactly that.

---

## 20. The server never trusts the client's shipping fee

`validate_discount` already carries the right instinct: *"POST /orders re-validates independently and never trusts that this endpoint was called."* Shipping gets the same treatment.

The order request sends a **rate id, not a fee**. The order endpoint then:

1. Resolves the rate per §18 step 1 — in single-rate mode ignoring the client's choice entirely.
2. Rejects the order if that rate is missing or `is_active = false`.
3. Recomputes the fee itself via §18 step 2 against its own settings and totals.
4. Writes that computed value to `delivery_fee`, plus the `shipping_label` snapshot.

A client posting `{"deliveryFee": 0}` changes nothing. Accepting a client-supplied shipping amount would be a free-shipping exploit on a store that takes cash on delivery.

---

## 21. Admin UI and guardrails

A new **Shipping** section in admin settings:

- **Master switch** — multiple rates on/off, with a plain-language note on what customers see in each mode.
- **Rates table** — label, estimate, fee, eligible-for-free, active, default, reorder. Add / edit / deactivate. In single-rate mode the non-default rows stay visible but visibly inactive, so it's obvious they're preserved rather than deleted.
- **Free shipping switch** and **free-over-₨X** with an explicit off state, not a bare `0`.
- **A worked preview.** For the current settings, show what a Rs 1,500 and a Rs 6,000 order are charged per tier. Four interacting switches do not make their combined effect obvious, and this is much cheaper than discovering the interaction through a real customer order.

New endpoints, following existing admin conventions:

| Method | Path |
|---|---|
| `GET` | `/api/admin/shipping-rates` |
| `POST` | `/api/admin/shipping-rates` |
| `PATCH` | `/api/admin/shipping-rates/{id}` |
| `DELETE` | `/api/admin/shipping-rates/{id}` *(soft — sets `is_active = false`)* |

The three switches need no new endpoints — they use the existing `PATCH /api/admin/settings/{key}`.

### Storefront side

- `GET /api/settings` (public) gains the active rates and the three switches. Note this endpoint currently mixes env-sourced money values with DB-sourced announcement values; the delivery fields move to the DB side of that split.
- **Checkout** renders a rate selector in multi-rate mode, and nothing at all in single-rate mode.
- **Cart** shows the resolved default-rate fee, since no choice has been made yet.
- `StoreSettings` in `frontend/lib/types.ts` and `admin-types.ts` gain the rates and switches.

### Guardrails

Each prevents a specific way the owner could break their own checkout:

| Rule | Why |
|---|---|
| Deleting a rate is a **soft delete** | `orders.shipping_rate_id` references it and past orders must survive — same reason `deactivate_product` never hard-deletes |
| At least one active rate must always exist | Deleting the last leaves checkout with nothing to charge |
| Exactly one active rate is `is_default` | Setting a new default clears the old one in the same transaction. **In single-rate mode this rate is the entire shipping config**, so it can never be absent |
| Deactivating the default is rejected unless another is promoted first | Otherwise single-rate mode has no rate at all |
| `fee >= 0` via DB check constraint | Matches the existing `ck_products_base_price` style; a negative fee would pay customers to order |

---

## 22. Build order and testing

| Phase | Work |
|---|---|
| 1 | `shipping_rates` table + `orders` columns + DDL in `plans/02-database.md`; seed one default rate from the current env values, master switch **off** |
| 2 | Rewrite `compute_totals` **and** `computeTotals` together against §18 |
| 3 | Admin CRUD + Shipping settings UI incl. master switch and worked preview |
| 4 | Public settings exposure + checkout selector + cart default |
| 5 | Order write path: rate id in, server-recomputed fee out, label snapshotted |
| 6 | Guardrails from §21 |

Phase 1's seed matters: one rate carrying the old `DELIVERY_FEE`, the old threshold, and the master switch off means **the storefront behaves exactly as it does today**. Part B ships dark and the owner switches it on when ready.

### Tests

1. **Mirror parity — the important one.** Across a matrix (below/above threshold × with/without discount × each rate × free-all on/off × master switch on/off), assert the cart's displayed total equals the order's persisted total. This is the test that catches pricing-mirror drift.
2. **Mode switching.** With multi-rate off, confirm no selector renders and the default rate is charged even if a client posts a different rate id.
3. **Precedence.** One case per row of §18 step 2, including a `free_shipping_eligible = false` rate under global free shipping — it must still charge.
4. **Reversibility.** Turn multi-rate off, confirm the other rates survive, turn it back on, confirm they return unchanged.
5. **Tamper.** Post an order with a manipulated fee and a valid rate id; persisted `delivery_fee` must be the server's figure.
6. **Deleted-rate provenance.** Place an order, deactivate that rate, reload the order — the label must still render from the snapshot.
7. **Guardrails.** Try to delete the last rate and to deactivate the default; both refused with a clear message.
8. **Threshold edge.** An order exactly *at* the threshold qualifies (`>=`, matching current behaviour).

---

# Part C — Caching

## 23. What's in place today, measured

| Layer | Current state | Verdict |
|---|---|---|
| Next.js data cache | `api.get` defaults to `revalidate: 60` (`frontend/lib/api.ts`) | Works, but 60s is a compromise forced by having no invalidation |
| Cache **tags** | None anywhere in the codebase | **The gap.** No way to push an update when the owner publishes |
| Mutations | `no-store` on POST/PATCH/PUT/DELETE | Correct already |
| Client module cache | `useProducts.ts` / `useSettings.ts` hold a module-scope cache | Works, but never expires — see §26 |
| Uploaded images | **`Cache-Control: no-cache`** | **Bug.** See §24 |
| Seed (Unsplash) images | `public, max-age=31536000` | Correct — the contrast is what exposed the bug |
| DB query shape | `selectinload` on options/variants/images | Correct — no N+1 |

Measured against the live deployment: an uploaded product photo returns `Cache-Control: no-cache`, while a seed Unsplash photo returns `public, max-age=31536000`.

---

## 24. The image bug — one line, biggest win

`upload_product_image` in `backend/app/storage.py` sends `Authorization`, `apikey`, `Content-Type`, and `x-upsert`, but **no cache header**. Supabase Storage therefore stores the object with `no-cache` and serves that forever after. Result: every uploaded product photo is re-fetched from Supabase on every page view — no browser cache, no CDN cache, nothing.

The fix is to send `cache-control: public, max-age=31536000, immutable` on upload.

**Why a full year with `immutable` is safe here, not reckless.** The storage path is `{product_id}/{uuid4}.{ext}` — a fresh UUID per upload. The bytes at a given URL can never change; replacing a photo produces a *new* URL and a new `product_images` row. That is exactly the condition `immutable` is designed for. (Contrast: caching `/api/products` for a year would be reckless, because that URL's content changes constantly.)

Two follow-ups this implies:

- **The header is object metadata applied at upload time**, so already-uploaded images keep `no-cache` until re-uploaded. Only one product photo exists today (Golden Ring), so a manual re-upload clears it — cheaper than writing a backfill script.
- Set `images.minimumCacheTTL` in `next.config.ts` so the `/_next/image` optimizer retains its optimized derivatives instead of re-optimizing on a cold edge.

---

## 25. On-demand invalidation — what Parts A and B actually need

Today `api.get` uses `revalidate: 60` with no tags. So when the owner publishes a product through the new agent flow, **the storefront can serve stale data for over a minute** — and because Vercel serves stale-while-revalidate, the first visitor after expiry still gets the old page and merely *triggers* the refresh. The owner adds a product, reloads, doesn't see it, and reasonably concludes the feature is broken. This is the same class of confusion as the earlier empty-storefront incident, and it deserves a real fix rather than a shorter window.

The fix is tag-based invalidation:

1. **Tag the reads.** `getProducts` / `getProduct` / `getCategories` carry a `products` tag; `getSettings` carries a `settings` tag. `frontend/lib/api.ts` already funnels every read through one `request()` function, so this lands in one place.
2. **Invalidate on write.** After a successful admin mutation, revalidate the affected tag — `products` after product/variant/option/image writes, `settings` after settings or shipping-rate writes.
3. **Then raise the windows.** Once writes push updates, the 60s window is no longer load-bearing. Long windows (an hour, or fully static) become correct rather than risky, cutting function invocations and improving p50.

> ⚠️ **Sequencing matters:** raise the revalidate windows only *after* invalidation is proven working. The other order turns a 60-second staleness window into an hour-long one.

**The revalidation trigger must be authenticated.** An open revalidation endpoint lets anyone dump the cache repeatedly — a cheap way to hammer the database and stall the site. It belongs behind the existing admin session (`get_current_admin`), or as a server action reachable only from an authenticated admin path.

---

## 26. Client-side and API-edge caching

### The module cache has no expiry

`useProducts.ts` caches the catalogue at module scope with no TTL and no invalidation — it lives until a full page reload. Fine for names and prices, but it also caches **stock**, and stock is the one field that goes stale dangerously: `reconcileCart` exists specifically to cap cart quantities against current stock, and running it against a stale cache defeats its purpose.

Fixes, in order of value:

- A short TTL (~60s) so a long browsing session eventually refetches.
- A forced refetch on cart mount, since that is exactly where accurate stock matters most.
- Optionally refetch on window focus — cheap, and covers the tab-left-open-overnight case.

### Edge caching the public API

`/api/products`, `/api/categories`, and `/api/settings` are public, identical for every visitor, and change only when the owner edits something. They can carry `s-maxage` + `stale-while-revalidate` so Vercel's CDN answers most requests without waking the Python function at all.

> ⚠️ **Never cache an authenticated response at a shared CDN.** Every `/api/admin/*` route carries the admin session cookie and must stay `private, no-store`. A shared cache holding an authenticated response can serve one user's data to another — the most damaging mistake available in this section. The admin panel should also keep using `getNoStore` throughout; an owner checking stock must always see the true number.

---

## 27. Caching the agent's own context

Ties back to Part A. Across a multi-turn conversation the system prompt, house care list, material list, category price ranges, and extracted visual facts are **identical on every turn** — only the transcript grows. Providers bill and rate-limit that repetition.

Two mitigations, in order:

1. **The single vision pass** (§2), already in the plan. The image is the most expensive part of the request and is sent exactly once.
2. **Provider context caching** for the stable prefix. Worth wiring only if that prefix clears the provider's minimum cacheable size; below it, caching silently does nothing. This matters most on the Gemini free tier, where the binding constraint is quota rather than money.

Ordering rule: stable content (system prompt, house lists, visual facts) goes **first**, volatile content (transcript, latest answer) **last**. A prefix-keyed cache is defeated by anything that varies near the front.

---

## 28. Build order and verification

| Phase | Work | Why this order |
|---|---|---|
| 1 | Image `cache-control` on upload + re-upload the existing photo + `minimumCacheTTL` | Biggest measured win, smallest change, zero risk |
| 2 | Cache tags on reads + authenticated invalidation on admin writes | Required before any window can safely grow |
| 3 | Raise revalidate windows | Only correct once phase 2 works |
| 4 | Client module-cache TTL + refetch on cart mount | Fixes the stock-staleness path |
| 5 | Edge headers on public API GETs; admin routes explicitly `no-store` | Do last, and verify the admin/public split carefully |
| 6 | Agent context caching | Optimisation, not correctness |

Phase 1 is independent of Parts A and B and can ship immediately. Phase 2 is a **prerequisite for Part A feeling correct** — without it, a freshly published product appears to vanish.

### Verification

1. **Image headers.** `curl -sI` an uploaded photo and assert `max-age=31536000, immutable`. Then load `/shop` twice in a browser and confirm the second load serves photos from cache, not the network.
2. **Publish-to-visible.** Create a product through the agent flow and reload the storefront **immediately**. It must appear with no waiting. This is the acceptance test for phase 2.
3. **Shipping propagation.** Change a shipping rate and confirm checkout reflects it on the next load, not a minute later.
4. **Auth leak check — the important one.** Confirm no `/api/admin/*` response carries a shared-cache directive (`s-maxage`, `public`), and that an unauthenticated request to an admin path is refused rather than answered from cache.
5. **Invalidation endpoint is closed.** Call the revalidation trigger with no admin session; it must be refused.
6. **Stock freshness.** Load the shop, reduce stock in admin, then open the cart — reconciliation must act on the new number, not the module cache's copy.
