# Mayra Store — Final Build Plan

**Version:** 2 (final) · supersedes `mayra-store-correction-plan.md`
**Target environment:** Claude Design (`x-dc` template DSL + `DCLogic` class) — **no React, no Node, no build step**
**Nature of project:** portfolio piece, but with a real database and real email later. Card payment simulated; everything else must behave like a real store.

---

## 0. Decisions locked in

| # | Question | Decision |
|---|---|---|
| 1 | Fonts | My best guess — Google Fonts stand-ins, listed in §2 |
| 2 | Palette | Mix: keep the cream base, fold in the poster gold + forest green |
| 3 | Imagery | Brand posters = promotions only. Product photos = free stock images (§4). Your reference photos are **not** used |
| 4 | Promo popup | The 14th-August poster, **every visit**, **landing page only** |
| 5 | Variants | Full stock model with out-of-stock handling and every edge case (§6) |
| 6 | The three views | `Shop` / `Golden Essence` / `About` as three real pages; wordmark → landing |
| 7 | Build target | Claude Design, in-place |
| 8 | Realism | Simulated card. Everything else structured so a real DB + email drop in later |
| 9 | Responsive | Mobile-first, desktop as enhancement |
| 10–16 | WhatsApp order, Instagram strip, search, wishlist, stock urgency, care card, real About page | All in |

---

## 1. What's broken in the current build

I unpacked the bundle and read the source. Findings, with evidence:

| # | Finding | Evidence |
|---|---|---|
| 1 | Wrong fonts | `--font-heading: "Caprasimo"`, `--font-body: "Figtree"` |
| 2 | Nav links dead | All three call the same handler: `sc-camel-on-click="{{ goHome }}"` |
| 3 | Hero buttons dead | `Shop the collection` and `Gifting guide` both call `noop: () => {}` |
| 4 | No landing page | Routes are `home / product / cart / checkout / confirm`; `home` *is* the listing |
| 5 | One global variant axis | `const SIZE_OPTS = ['16"','18"','20"']` applied to every product — the bracelet stack currently offers necklace lengths |
| 6 | Listing skips variants | `onAdd: () => this.addToCart(p.id, 1, '18"')` — hardcoded |
| 7 | Posters baked in | Poster #2 is the hero at `transform: scale(3.1)`; poster #1 is a banner background; posters cropped as product shots |
| 8 | No popup | Promo exists only as an inline banner |
| 9 | Discount contradicts copy | Banner says "use code MAYRA20", checkout auto-applies `subtotal * 0.2` with no code field |
| 10 | Zero responsiveness | `repeat(3, 1fr)`, `1180px` container, no `@media` at all |
| 11 | No stock concept | Nothing in the data model tracks availability |

---

## 2. Typography

### 2.1 Four roles, not two

Your posters use four distinct type roles:

| Role | Where it appears | Stand-in (Google Fonts) |
|---|---|---|
| **Display serif** | `MAYRA`, `ON ITS WAY!`, `GOLDEN ESSENCE` — high-contrast, sharp serifs, wide tracking | **Playfair Display** 500/600 |
| **Tracked caps** | `JEWELS THAT SPEAK FOR YOU.`, `TIMELESS DESIGNS`, `PREMIUM QUALITY` | **Jost** 300 at ~0.32em tracking |
| **Script accent** | `a part of you`, `made to shine` | **Parisienne** 400 |
| **Body serif** | `We're launching our page and trust us,` | **Cormorant Garamond** 400/500 |

These are stand-ins chosen by eye from the posters — I can't read font names out of a JPEG. If you ever get the real names from the poster file, swapping them is a four-line change to the tokens below.

### 2.2 Tokens

```css
:root {
  --font-display: "Playfair Display", "Times New Roman", serif;
  --font-caps:    "Jost", system-ui, sans-serif;
  --font-script:  "Parisienne", cursive;
  --font-body:    "Cormorant Garamond", Georgia, serif;

  --tracking-wordmark: 0.42em;
  --tracking-caps:     0.32em;

  /* Cormorant runs small — bump the base or it reads as fine print */
  --fs-body: 17px;
  --lh-body: 1.65;
}
```

### 2.3 Role assignment

- `h1`, `h2`, product names, prices → `--font-display`
- Eyebrows, badges, nav, buttons, feature strip, form labels → `--font-caps`
- All paragraph copy, product blurbs, About page → `--font-body`
- `--font-script` appears **exactly twice** in the whole site: one line on the landing hero, one line on the Golden Essence page. Any more and it stops being special.

Sweep all 26 `font-family: var(--font-heading)` occurrences and reassign by role.

---

## 3. Palette

Keep the cream ground. Retune the accents toward the posters.

```css
:root {
  --color-bg:          #f5ead8;  /* unchanged — the cream you liked */
  --color-surface:     #fdf8ef;
  --color-text:        #2e2b25;

  /* Primary accent: brand gold, replacing the terracotta */
  --color-gold-100: #faf1de;
  --color-gold-300: #e6cf9a;
  --color-gold-500: #c8a24a;   /* from the poster foil */
  --color-gold-700: #97741f;

  /* Secondary: the deep forest green from the launch poster */
  --color-forest-500: #3d4a35;
  --color-forest-700: #2d3a2b;

  /* Kept from the current build so the theme still feels like itself */
  --color-clay-500: #d67f48;   /* now used sparingly: sale tags, urgency */
}
```

Gold does the work terracotta was doing (buttons, links, price). Forest green becomes the dark surface (footer, promo bar, confirmation). Clay survives only as the urgency/sale colour, which gives it a job instead of making it the whole personality.

---

## 4. Product imagery — stock placeholders

Your reference photos are out. These are free-license Unsplash images, hotlinkable, no attribution required, free for commercial use.

**URL pattern:** `https://images.unsplash.com/photo-<ID>?auto=format&fit=crop&w=900&q=80`

### Necklaces

| Slot | Photo ID | What it is |
|---|---|---|
| Heart Charm Necklace | `photo-1623321673989-830eff0fd59f` | hand holding a gold heart charm on a chain |
| Fine Chain Necklace | `photo-1611107683227-e9060eccd846` | gold chain on white surface |
| Pendant Necklace | `photo-1569397288884-4d43d6738fbd` | gold-tone pendant necklace |
| Celestial Pendant | `photo-1685970731194-e27b477e87ba` | gold necklace with a crown motif |
| Layered set (on model) | `photo-1620656798579-1984d9e87df7` | gold necklace worn |
| Two-tone Necklace | `photo-1601121141461-920cb1993441` | gold and silver worn together |
| Studio shot | `photo-1722410180687-b05b50922362` | necklace and earring on a display bust |
| Flat lay | `photo-1722410180644-5955f83ec8b1` | necklace laid on a table |

### Bracelets

| Slot | Photo ID | What it is |
|---|---|---|
| Golden Essence Stack | `photo-1611591437281-460bfbe1220a` | layered gold chains |
| Rope Chain Bracelet | `photo-1602173574767-37ac01994b2a` | gold chain bracelet on a magazine |
| Everyday Bracelet | `photo-1633810543462-77c4a3b13f07` | bracelet worn, close crop |
| Charm Bracelet | `photo-1721206624492-3d05631471ea` | bracelet with a charm, worn |
| Bracelet pair | `photo-1679156271456-d6068c543ee7` | two bracelets on a table |

### Rings

| Slot | Photo ID | What it is |
|---|---|---|
| Leaf Ring | `photo-1689367436629-1d288f1e23b6` | gold ring, close crop |
| Slim Band | `photo-1655707063513-a08dad26440e` | gold ring on white |
| Stacking Ring | `photo-1689367436442-76c859315008` | gold ring on a table |

### Earrings

| Slot | Photo ID | What it is |
|---|---|---|
| Solitaire Studs | `photo-1722410180681-9f5a22d7ebb6` | necklace and earrings on a bust |
| Drop Earrings | `photo-1722410180670-b6d5a2e704fa` | display bust, earrings visible |
| Everyday Hoops | `photo-1728646998199-127b357a464d` | earrings worn, hand to face |

### Notes on using these

- Skip anything on `plus.unsplash.com` — those are Unsplash+ paid, not free.
- Two ways to wire them in Claude Design: hotlink the URL directly, or download once and let Claude Design embed them as bundle resources. Embedding makes the file self-contained and immune to Unsplash rate-limiting; hotlinking keeps the file small. **Embed** if you plan to host this anywhere.
- Add `&w=400` variants for the listing grid and `&w=1200` for the product hero, so phones aren't downloading 3000px files.
- These are stand-ins. Before this becomes a real store with real orders, they have to be replaced with photos of what you actually ship — showing stock photography as your product is the kind of thing that generates refund requests.

---

## 5. Routes and navigation

```
landing    entry page — the arrival moment, promo popup fires here
shop       full catalogue: search, filter, sort
collection Golden Essence — the curated bracelet story
product    one item, variant picker, gallery, care card
cart       bag
checkout   details + payment
confirm    order placed
about      brand story, delivery, returns
wishlist   saved pieces
```

**Header:** wordmark (→ `landing`) · `Shop` · `Golden Essence` · `About` · search icon · heart icon with count · bag icon with count.
Active page gets a hairline gold underline. On mobile the three links collapse into a bottom tab bar (`Shop · Saved · Bag`) plus a search field pinned under the header.

Every dead handler gets a real destination. `Gifting guide` is cut — it was a button pointing at a page that doesn't exist, and adding a whole gifting page isn't worth it right now.

### 5.1 The landing page

Not a splash screen. It does a job: establish the brand in three seconds, then send people into the catalogue.

```
┌──────────────────────────────────────────┐
│ MAYRA        Shop  Golden Essence  About │
├──────────────────────────────────────────┤
│                                          │
│      Jewels that speak                   │  display serif
│      for you.                            │
│      ──────── ✦ ────────                 │
│      every piece, a part of you          │  script — one of only two uses
│                                          │
│      [ Enter the collection ]            │
│                                          │
├──────────────────────────────────────────┤
│  Necklaces │ Bracelets │ Rings │ Earrings│  four doors → shop, pre-filtered
├──────────────────────────────────────────┤
│  TIMELESS DESIGNS · PREMIUM QUALITY ·    │  tracked caps strip
│  MADE FOR YOU                            │
├──────────────────────────────────────────┤
│  ✦ Four featured pieces                  │
├──────────────────────────────────────────┤
│  Instagram strip                         │
│  Footer (forest green)                   │
└──────────────────────────────────────────┘
```

The category doors route to `shop` with the filter already applied, so the landing page earns its place rather than being something you click past.

---

## 6. Data model, variants and stock

### 6.1 Shape

Replace the flat product objects and the global `SIZE_OPTS` with this:

```js
const PRODUCTS = [
  {
    id: 'p-heart-charm',
    name: 'Heart Charm Necklace',
    category: 'necklaces',
    collection: null,                   // or 'golden-essence'
    basePrice: 2400,
    material: '18k gold-plated stainless steel',
    blurb: 'A soft heart charm on a fine cable chain…',
    care: ['Remove before showering or swimming',
           'Keep away from perfume and lotion',
           'Store dry, in the pouch it arrives in'],
    images: {                            // keyed by colour id, fallback 'default'
      gold:  ['photo-1623321673989-830eff0fd59f', 'photo-1611107683227-e9060eccd846'],
      rose:  ['photo-1722410180644-5955f83ec8b1'],
      steel: ['photo-1601121141461-920cb1993441']
    },
    options: [
      { key: 'colour', label: 'Colour', type: 'swatch', values: [
          { id: 'gold',  label: 'Gold',      hex: '#c8a24a' },
          { id: 'rose',  label: 'Rose gold', hex: '#d9a08c' },
          { id: 'steel', label: 'Silver',    hex: '#c8ccd0' }
      ]},
      { key: 'length', label: 'Length', type: 'segment', values: [
          { id: '16', label: '16"' },
          { id: '18', label: '18"' },
          { id: '20', label: '20"', priceDelta: 200 }
      ]}
    ],
    // every combination that EXISTS gets an entry. Missing = not made.
    variants: {
      'gold|16':  { sku: 'MYR-HC-G16', stock: 12 },
      'gold|18':  { sku: 'MYR-HC-G18', stock: 4  },
      'gold|20':  { sku: 'MYR-HC-G20', stock: 0  },   // out of stock
      'rose|18':  { sku: 'MYR-HC-R18', stock: 2  },
      'steel|16': { sku: 'MYR-HC-S16', stock: 0  },
      'steel|18': { sku: 'MYR-HC-S18', stock: 7  }
      // 'rose|16', 'rose|20', 'steel|20' don't exist — never made
    }
  }
  // …11 more
];

const LOW_STOCK_AT = 3;   // "Only N left" threshold
```

Two distinct states that must not be conflated:

- **Doesn't exist** — no key in `variants`. The option renders greyed with a subtle diagonal hatch. Tooltip: *"Not made in this combination."*
- **Exists but stock 0** — key present, `stock: 0`. Renders greyed with a strikethrough. Tooltip: *"Sold out."*

### 6.2 Derived helpers

```js
variantKey(sel)            // {colour:'gold',length:'18'} → 'gold|18'
getVariant(p, sel)         // → {sku, stock} | undefined
variantPrice(p, sel)       // basePrice + Σ priceDelta of chosen values
isAvailable(p, sel)        // variant exists && stock > 0
valueState(p, sel, k, v)   // 'available' | 'soldout' | 'nonexistent'
                           //   — holds the other axes fixed, tests this value
firstAvailable(p)          // → selection object, or null if nothing in stock
productStock(p)            // Σ stock across all variants
isSoldOut(p)               // productStock(p) === 0
```

`valueState` is the important one: it's what lets a colour swatch grey out the moment the currently-chosen length isn't available in it.

### 6.3 Edge cases — all of them

| # | Situation | Behaviour |
|---|---|---|
| 1 | One variant is out of stock | That option is disabled and struck through. Not clickable, not keyboard-focusable, `aria-disabled="true"` |
| 2 | A combination was never made | Disabled with hatching, distinct tooltip. Never presented as "sold out" — it isn't |
| 3 | **Everything** is out of stock | Product page opens normally. Every option disabled. Button becomes `Sold out`, disabled. A `Notify me when it's back` field appears (writes to the DB later). Listing card shows a `Sold out` badge and no add button |
| 4 | Default selection lands on a dead variant | On open, run `firstAvailable(p)`. If it returns null, enter the sold-out state from row 3 |
| 5 | Changing colour orphans the current length | If `gold|18` → switch to `rose`, and `rose|18` doesn't exist, auto-move to the first available length for rose and show a one-line note: *"18\" isn't available in rose gold — switched to 20\"."* Never silently change a selection without saying so |
| 6 | Colour available in no lengths at all | The colour swatch itself is disabled — you can't select a dead end |
| 7 | Stock between 1 and `LOW_STOCK_AT` | `Only 2 left` in clay, next to the button. **Driven by the real number, never randomised.** If the DB says 40, it says nothing |
| 8 | Quantity stepper vs stock | `+` is capped at `stock`. At the cap, the button disables and a line reads `2 available` |
| 9 | Already have some in the bag | The stepper cap accounts for it: `stock − qtyAlreadyInCart`. Prevents ordering 5 of a thing with 3 left |
| 10 | Adding from the listing with one possible combination | Skip the variant sheet, add directly, toast |
| 11 | Adding from the listing on a sold-out product | The card's button reads `View` instead of `Add to bag` |
| 12 | Cart line goes out of stock while you shop | Line renders dimmed with `Sold out — remove to continue`. Checkout button disabled until it's removed. **Never silently drop it** — people notice things vanishing |
| 13 | Cart line stock drops below your quantity | `Only 1 left — quantity reduced from 3`. Adjust automatically, but say so |
| 14 | Wishlist holds a sold-out item | Allowed. Shows `Sold out` and a `Notify me` link, no add button |
| 15 | Search returns nothing | Empty state: *"Nothing matches 'xyz'."* + `Clear search` + four suggested pieces |
| 16 | Filter + search combine to nothing | Same empty state, but the primary action is `Clear filters` since that's the likelier culprit |
| 17 | Empty bag | *"Your bag is empty."* + `Browse the collection`. Not a sad-face illustration |
| 18 | Empty wishlist | *"Nothing saved yet. Tap the heart on a piece to keep it here."* |
| 19 | Deep link to a product id that doesn't exist | Fall back to `shop` with a note rather than crashing on `PRODUCTS.find(...)` returning undefined — which is what the current code does |
| 20 | Every item filtered out by an active category | Show the empty state, keep the filter chips visible so it's obvious why |

### 6.4 Cart key

`p-heart-charm|gold|18` — product id plus every axis, in the order declared in `options`. Same product, different variant = separate line.

---

## 7. Product page

Order on mobile, top to bottom:

1. **Gallery** — swipeable, dot indicators. Images swap when colour changes. Pinch-zoom on the main image.
2. **Name + price.** Price updates live with `priceDelta`.
3. **Stock line** — `Only 2 left` / `In stock` / `Sold out`.
4. **Colour swatches** — circles filled with `hex`, gold ring on the selected one, disabled states per §6.3.
5. **Length/size segments** — same rules.
6. **Selection summary** — `Rs 2,600 · Gold · 20"` so there's no ambiguity about what's about to be bought.
7. **Quantity stepper** — capped per §6.3 rows 8–9.
8. **`Add to bag`** (gold, full width) and **`Order on WhatsApp`** (outline).
9. **Save** — heart toggle.
10. **Care card** — collapsible, from `product.care`. Real content: gold-plated steel genuinely does need this, and saying so signals you know the product.
11. **Size guide** — modal with a necklace-length diagram (16" choker · 18" collarbone · 20" below).
12. **Material · delivery · returns** — three short accordions.
13. **You may also like** — same category, in stock first.

Desktop: gallery left (sticky), everything else in a right column.

---

## 8. Variant sheet from the listing

Pressing `Add to bag` on a card:

1. Bottom sheet slides up on mobile; centred modal on desktop.
2. Contents: thumbnail, name, live price, the same pickers with the same disabled rules, quantity stepper.
3. Confirm button disabled until every axis is chosen. **No silent defaults** — the current build's hardcoded `'18"'` is exactly the bug this replaces.
4. On confirm: add, close, toast — `Added · Heart Charm Necklace, Gold, 18"` with a `View bag` link. Stay on the listing; don't navigate away. (The current `addCurrent` jumps to the cart, which kills browsing momentum.)
5. Single-combination products skip the sheet entirely.
6. Escape closes, focus is trapped while open, focus returns to the button that opened it.

---

## 9. Promo popup and the announcement bar

### 9.1 Popup

- Fires on `landing` only, **every visit**, ~600ms after first paint. Instant modals get dismissed reflexively.
- Content: the **14th-August launch poster** at its natural aspect ratio on a dimmed backdrop.
- Close button top-right, minimum 44×44px hit area. Escape closes. Backdrop click closes.
- One action beneath the poster: `Shop with 20% off` → routes to `shop` and pre-fills the code.
- On mobile the poster is 1:1, so cap it at `min(90vw, 90vh)` and let it scale — don't let it overflow.
- `prefers-reduced-motion`: no scale-in, fade only.

### 9.2 After dismissal

The poster does **not** get re-embedded as a full-bleed page section. Instead:

- A slim dismissible **announcement bar** under the header: `Launch offer — 20% off everything with code MAYRA20` + `Shop now`.
- A small `View offer` chip in the header that reopens the modal.

The poster stays a poster — something you can look at — rather than dissolving into page furniture.

### 9.3 Fix the discount contradiction

Add a **discount code field** at checkout. Discount is `0` until `MAYRA20` is entered, then 20%. This matches what your Instagram posts already say, and makes the code mean something. Invalid code → `That code isn't valid` inline, not a popup.

---

## 10. Cart, checkout, order

### 10.1 Cart

Line items with thumbnail, name, variant summary, quantity stepper, remove, line total. Unavailable lines per §6.3 rows 12–13. Summary: subtotal, discount (if a code is applied), delivery, total. Free delivery over Rs 5,000 — keep the existing rule, and show `Rs 800 more for free delivery` when close, since it works.

Two exits: `Checkout` and `Order on WhatsApp`.

### 10.2 Checkout

Fields: name, phone, address, city, postal code, optional order note. Payment: Cash on delivery · Card · Bank transfer.

**Card is simulated and must say so.** A small line under the card fields: *"This is a demo — card details are not sent anywhere and no charge is made."* Being straight about it costs nothing and is better than a portfolio piece that looks like it's harvesting card numbers.

Cash on delivery and bank transfer behave as if real, because they will be.

Validation: inline, on blur, specific. `Enter a phone number we can reach you on` beats `Invalid input`.

### 10.3 Order confirmation

Order number, itemised summary, delivery estimate, `Order on WhatsApp` fallback, and a note that a confirmation email is on its way.

---

## 11. Order on WhatsApp

A button that opens:

```
https://wa.me/<COUNTRY_CODE><NUMBER>?text=<encoded message>
```

Message body:

```
Hi Mayra! I'd like to order:

• Heart Charm Necklace — Gold, 18" × 1 — Rs 2,400
• Rope Chain Bracelet — Gold, M × 2 — Rs 3,600

Subtotal: Rs 6,000
Discount (MAYRA20): −Rs 1,200
Total: Rs 4,800

Name:
Address:
```

Build it with `encodeURIComponent`. Present on the product page, cart, checkout, and confirmation.

In Pakistan this will very likely out-convert the card form. I'd treat it as a primary path, not a fallback.

---

## 12. Search, filter, sort, wishlist

**Search** — icon in the header opens a full-width field. Matches name, material, category, collection. Debounced ~200ms. Live result count. Empty state per §6.3 row 15.

**Filter** — category chips (All · Necklaces · Bracelets · Rings · Earrings) plus `In stock only`. Horizontally scrollable on mobile.

**Sort** — Featured · Price low→high · Price high→low · Newest.

**Wishlist** — heart on every card and product page. Header count. Its own page with `Move to bag` per item. Sold-out items allowed to sit there.

---

## 13. Golden Essence page

The one collection page, treated as a story rather than a filtered grid:

- Full-bleed header image, `GOLDEN ESSENCE` in tracked caps over it
- The script line: *"Layered to perfection, made to shine"* — the second and final use of `--font-script`
- Short paragraph on what layering means and how to build a stack
- The stack pieces as individual products, each addable
- `Shop the full stack` — adds every in-stock piece to the bag in one action

---

## 14. About page

Real content, because for a new brand this is trust infrastructure:

- Who Mayra is and why it exists — a few honest sentences, not brand-voice filler
- What the pieces are made of: 18k gold-plated stainless steel, why that matters (doesn't tarnish like brass, safe for most skin)
- Care summary, linking to the fuller care card
- Delivery: areas covered, timelines, charges
- Returns and exchanges: the actual policy, plainly stated
- Contact: WhatsApp, email, Instagram

---

## 15. Instagram strip

Above the footer: `@mayra` heading, six square tiles, `Follow` button linking to the profile. Placeholder tiles reuse the product photography for now; a real feed needs the Instagram Basic Display API, which needs a backend — park it until §17.

---

## 16. Mobile-first

Build mobile as the primary layout, desktop as the enhancement. The current file inverts this and has no media queries at all.

**Breakpoints:** base (≤479) · `480px` · `768px` · `1024px`

**Grid:** 1 column → 2 → 3 → 4
**Container:** `100%` with `16px` padding → `1180px` at `1024px`
**Type:** `clamp()` on every display size, e.g. `font-size: clamp(34px, 8vw, 64px)` for the landing h1 — the current fixed `64px` will overflow a 360px phone
**Touch targets:** minimum 44×44px everywhere. Current swatches and quantity buttons are well under
**Bottom bar on mobile:** `Shop · Saved · Bag`, so the primary actions are inside thumb reach
**Sticky add-to-bag** on the product page once the main button scrolls out of view
**Images:** `srcset` with `w=400 / 900 / 1200` and `loading="lazy"` on everything below the fold

---

## 17. Wiring in a real database and email later

Claude Design output is client-only. It cannot hold an API key — anything you put in that file is readable by anyone who opens it. So structure it now so the swap is clean:

**Single data seam.** All product data comes from one function:

```js
async function loadProducts() {
  return PRODUCTS;            // later: return (await fetch(API + '/products')).json();
}
```

Keep `PRODUCTS` as the only place data is defined. Nothing else in the app should reference it directly.

**Single order seam.**

```js
async function submitOrder(order) {
  return { ok: true, orderId: '#MYR' + Math.floor(10000 + Math.random() * 89999) };
  // later: POST to your endpoint, which writes to the DB and triggers the email
}
```

**What the backend needs to be, eventually:** one small serverless function (Vercel, Cloudflare Workers, Supabase Edge) holding the DB credentials and the email API key. The client calls it; it never sees a secret. Order confirmation email via Resend or Brevo — both have usable free tiers and clean APIs.

**Stock is authoritative server-side.** The client showing `stock: 4` is a hint. The order endpoint must re-check availability before writing, or you'll oversell the moment two people buy the last one at once.

**No browser storage.** Claude Design artifacts can't use `localStorage`. Cart and wishlist live in component state and reset on refresh. Accept it for now; solve it with a server-side session when the backend lands.

---

## 18. Build sequence

| Phase | Work | Blocks on |
|---|---|---|
| 1 | Font + colour tokens, role sweep | — |
| 2 | Router: 9 routes, fix every dead handler | — |
| 3 | Data model rewrite: 12 products, variants, stock, images | — |
| 4 | Variant helpers (§6.2) + all 20 edge cases | 3 |
| 5 | Landing page | 1, 2 |
| 6 | Shop: grid, search, filter, sort | 3 |
| 7 | Product page: gallery, pickers, care card, size guide | 4 |
| 8 | Variant sheet + toast | 4, 6 |
| 9 | Cart, checkout, discount code, confirmation | 4 |
| 10 | WhatsApp order builder | 9 |
| 11 | Wishlist | 3 |
| 12 | Golden Essence, About, Instagram strip | 1 |
| 13 | Promo popup + announcement bar | 5 |
| 14 | Responsive pass across every route | all |
| 15 | Accessibility pass | all |

Phases 3 and 4 are the load-bearing ones. Everything after them is assembly.

---

## 19. Accessibility floor

Not optional extras — cheap now, expensive to retrofit:

- Visible focus rings on every interactive element (gold, 2px, 2px offset)
- Escape closes the popup, variant sheet, search, and size guide
- Focus trapped inside modals, returned to the trigger on close
- Disabled variants: `aria-disabled="true"` and removed from tab order
- `aria-live="polite"` on the toast, the stock line, and the result count
- Alt text on every product image describing the piece, not the filename
- `prefers-reduced-motion` respected on the popup, sheet, and toasts
- Colour never the only signal — sold-out gets a strikethrough as well as grey
- Contrast: check gold `#c8a24a` on cream `#f5ead8` — it fails AA for body text. Use `--color-gold-700` for text on cream, keep `--gold-500` for fills and borders only

---

## 20. Copy principles

- Buttons say what happens: `Add to bag`, not `Submit`. The action keeps its name through the flow — `Add to bag` produces `Added`.
- Errors are specific and blameless: `Enter a phone number we can reach you on`.
- Empty states are invitations: `Nothing saved yet. Tap the heart on a piece to keep it here.`
- Sentence case throughout except the tracked-caps utility role.
- Stock urgency is only ever true. `Only 2 left` when there are two. Silence when there are forty.

---

## 21. One thing to cut

Once the promo moves into a popup, the landing hero should get quieter. The current build stacks a hero image, a full-bleed promo banner, badges on every product, and a features strip — four things competing for attention above the fold. Let the type and the jewellery carry the hero, and let the announcement bar handle the offer.
