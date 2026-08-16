# 04 — Frontend: porting the artifact to Next.js

The prototype is `reference/Mayra Store.dc.html` — 1,206 lines, one `DCLogic` class, 288 inline `style="…"` attributes, 61 `<sc-if>`, 20 `<sc-for>`. It works. This document is about moving it without losing anything.

**The port is mechanical, not creative.** `DCLogic` has `state`, `setState`, `componentDidMount`, `componentWillUnmount`, arrow-function handlers and a render that returns a template. That is React with different labels. Do not redesign while porting — get it running identically first, then change things.

---

## 1. Project setup

```powershell
# from the repo root, AFTER moving frontend/ to reference/
npx create-next-app@latest . --typescript --app --no-src-dir --no-tailwind --eslint
```

No Tailwind. The prototype is 288 inline styles driven by CSS custom properties; converting those to utility classes is a rewrite with no payoff, and it would put the design tokens in two places. Keep the token block in `app/globals.css` and convert inline styles to React style objects.

`frontend/.env.local` — the public values (copy from `.env` §7):

```
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
NEXT_PUBLIC_WHATSAPP_NUMBER=923113136446
NEXT_PUBLIC_INSTAGRAM_URL=https://www.instagram.com/mayra_.jewels/
NEXT_PUBLIC_STORE_NAME=Mayra Store
```

`next.config.ts` — one rewrite so `/api/*` works in both environments:

```ts
const isDev = process.env.NODE_ENV === "development";
export default {
  async rewrites() {
    return [{
      source: "/api/:path*",
      destination: isDev ? "http://127.0.0.1:8000/api/:path*" : "/api/index",
    }];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
};
```

---

## 2. Translating the DSL

Only two directives are used, so this is a short table.

| Prototype | React |
|---|---|
| `{{ expr }}` in text | `{expr}` |
| `attr="{{ expr }}"` | `attr={expr}` |
| `onClick="{{ handler }}"` | `onClick={handler}` |
| `<sc-if value="{{ c }}"> … </sc-if>` | `{c ? (<> … </>) : null}` |
| `<sc-for list="{{ xs }}" as="x"> … </sc-for>` | `{xs.map(x => <Frag key={x.id}> … </Frag>)}` |
| `hint-placeholder-val` / `hint-placeholder-count` | delete — editor hints, no runtime meaning |
| `style="a:1;b:2"` | `style={{ a: 1, b: 2 }}` |
| `class=` | `className=` |
| `tabIndex="0"` | `tabIndex={0}` |
| `stroke-width` on SVG | `strokeWidth` |
| `for=` on labels | `htmlFor=` |

Three things `<sc-for>` does not give you that React demands:

- **`key`.** Every mapped element needs a stable one. Use `product.id`, `cartKey`, or `option.key` — never the array index. Index keys break the moment a cart line is removed from the middle, and the symptom is a stepper showing the wrong quantity.
- **Fragments.** `<sc-for>` bodies with sibling elements become `<React.Fragment key={…}>`.
- **`.map()` returns an array**, so no wrapper element is added. That matters for the CSS grids, which rely on cards being direct children.

`swatchStyle()` and `segStyle()` currently build CSS **strings**. Convert them to return `React.CSSProperties`. The hatch pattern moves from a `background-image:` string fragment to `backgroundImage: "repeating-linear-gradient(...)"`.

---

## 3. Routes

The prototype's `this.state.route` switch becomes real URLs.

| Prototype route | Next.js path | Rendering |
|---|---|---|
| `landing` | `app/page.tsx` | Server (catalogue) + a client island for the promo popup |
| `shop` | `app/shop/page.tsx` | Server shell; filters/sort/search in a client component reading `searchParams` |
| `collection` | `app/golden-essence/page.tsx` | Server |
| `product` | `app/product/[slug]/page.tsx` | Server fetch, client component for pickers |
| `cart` | `app/cart/page.tsx` | Client (cart lives in localStorage) |
| `checkout` | `app/checkout/page.tsx` | Client |
| `confirm` | `app/order/[orderNumber]/page.tsx` | Client, reads the POST result |
| `about` | `app/about/page.tsx` | Server, static |
| `wishlist` | `app/wishlist/page.tsx` | Client |
| — | `app/admin/**` | [plans/05](05-admin-panel.md) |

Two changes worth making while you are in there:

- **Product URLs use the slug** — `/product/p-heart-charm`, not an opaque id. Shareable, and the slug is already the public identifier from the API.
- **Shop filters live in the URL** — `/shop?category=rings&sort=price-asc&inStock=1`. The landing page's four category doors become plain `<Link>`s, the back button behaves, and a filtered view can be sent to someone. `go('shop', {category})` in the prototype could do none of that.

**`confirm` needs care.** The prototype keeps `orderResult` in memory. With a real URL, a refresh on `/order/MYR-1042` would lose it. Options: (a) stash the result in `sessionStorage` under the order number and read it back — simplest, and correct for a demo; (b) add a public `GET /orders/{number}?email=…` endpoint. Take (a). Do **not** add an unauthenticated `GET /orders/{number}` — order numbers are sequential, so anyone could walk them and read every customer's address.

---

## 4. Splitting the god component

`class Component extends DCLogic` holds everything. It becomes:

### 4.1 Contexts (`context/`)

**`CartProvider`** — replaces `state.cart` plus `addToCart`, `changeCartQty`, `removeCartLine`, `reconcileCartStock`, `buildCartLines`.

```ts
type CartLine = { productSlug: string; variantKey: string; selection: Record<string,string>; qty: number };
type Cart = Record<string, CartLine>;   // key: `${slug}|${variantKey}` — same as cartKeyFor()
```

Persist to `localStorage` under `mayra.cart.v1`. **Hydration rule:** initialise state as empty, then load from `localStorage` inside `useEffect`. Reading storage during the initial render makes the server HTML and the first client render disagree, and Next.js throws a hydration error. Everything cart-shaped in the header must render a stable placeholder until mounted.

The version suffix (`.v1`) is not decoration — when the cart shape changes you bump it and stale carts are ignored instead of crashing on a missing field.

**`WishlistProvider`** — `string[]` of slugs, same persistence rules, key `mayra.wishlist.v1`.

**`ToastProvider`** — `pushToast(message, linkLabel?, onLink?)`, one toast at a time, 2,800 ms, `aria-live="polite"`. Port as-is.

### 4.2 Library (`lib/`)

**`lib/types.ts`** — `Product`, `ProductOption`, `OptionValue`, `Variant`, `Selection`, `CartLine`, `Totals`, `OrderPayload`. This is where TypeScript earns its place: `Selection = Record<string, string>` and `Variants = Record<string, {sku: string; stock: number}>` make the whole variant system self-documenting.

**`lib/variants.ts`** — the twelve helpers, moved verbatim from lines 741–757 of the prototype and typed:

```
coverImage · galleryImages · variantKey · getVariant · optionValue · variantPrice
isAvailable · valueState · optionValueHasAnyStock · optionValueExistsAtAll
firstAvailable · productStock · isSoldOut · isSingleCombination
cartKeyFor · selectionLabel
```

**Copy these exactly.** They are the most tested code in the prototype and they encode all 20 edge cases. The one change: `variantKey` must sort options by `position` to match the server ([plans/02 §4](02-database.md)) — the API already returns them sorted, so preserving array order is enough.

**`lib/pricing.ts`** — the client mirror of `backend/app/pricing.py`. Same rules, including free delivery on the **post-discount** amount. Put a comment at the top of both files pointing at the other; when one changes and the other does not, the cart shows one total and the confirmation email shows a different one, and that is a genuinely confusing bug to chase.

**`lib/api.ts`** — one fetch wrapper. Server components use `{ next: { revalidate: 60 } }`; mutations use `cache: 'no-store'`. Parses the error envelope from [plans/03 §7](03-backend-fastapi.md) into a typed `ApiError` carrying `status` and `problems`.

**`lib/format.ts`** — `fmt(n)` → `Rs 2,400` via `toLocaleString('en-PK')`. **Watch this one:** `toLocaleString` can format differently on the Node server and in the browser, which produces a hydration mismatch on every price on the page. Either render prices only in client components, or pin the format with an explicit `Intl.NumberFormat('en-PK', {maximumFractionDigits: 0})` created once at module scope.

**`lib/whatsapp.ts`** — port `buildWhatsAppUrl`. Number from `NEXT_PUBLIC_WHATSAPP_NUMBER` (`923113136446`), never hardcoded. The prototype's placeholder `923001234567` is wrong and must not survive the port.

### 4.3 Components (`components/`)

```
Header.tsx            wordmark, nav, active underline, search toggle, wish/bag counts
MobileTabBar.tsx      Shop · Saved · Bag — the <768px bottom bar
AnnouncementBar.tsx   dismissible strip
PromoPopup.tsx        launch poster modal — focus trap, Escape, backdrop click
SearchOverlay.tsx     full-width field, 200ms debounce, live count
ProductCard.tsx       image, name, price, badge, heart, add/view button
ProductGrid.tsx       1 → 2 → 3 → 4 columns
VariantSheet.tsx      bottom sheet (mobile) / centred modal (desktop)
SwatchPicker.tsx      colour circles + all three disabled states
SegmentPicker.tsx     length/size pills + the same
QtyStepper.tsx        capped per §7 rows 8–9
StockLine.tsx         "Only 2 left" / "In stock" / "Sold out" — aria-live
Toast.tsx             aria-live region
Gallery.tsx           swipeable, dot indicators, swaps on colour change
Accordion.tsx         care card, material, delivery, returns
SizeGuideModal.tsx    necklace length diagram
InstagramStrip.tsx    six tiles + follow button
Footer.tsx            forest green
WhatsAppButton.tsx    shared by PDP, cart, checkout, confirmation
EmptyState.tsx        the five empty states from §7
```

`SwatchPicker` and `SegmentPicker` are where the edge cases concentrate. Both take `(product, selection, optionKey)` and call `valueState()` per value. Get these two right and rows 1, 2, 5 and 6 of §7 come free.

---

## 5. Data flow

```
Server Component (app/shop/page.tsx)
  const products = await api.get('/products', { revalidate: 60 })
  → <ShopClient products={products} />        // serialised into the payload
        ↓
Client Component
  uses useSearchParams() for filters, useCart()/useWishlist() for state
```

The catalogue is fetched **once, on the server, per cache window** — not per browser. Most visitors never trigger a Python invocation, which is what makes serverless cold starts a non-problem for browsing ([plans/01 §3.1](01-architecture.md)).

The prototype's `loadProducts()` seam is exactly where this plugs in. It was written for this.

---

## 6. Styling

Move the token block from the artifact's root `<div style="--gold-100:…">` into `app/globals.css`:

```css
:root {
  --gold-100:#faf1de; --gold-300:#e6cf9a; --gold-500:#c8a24a; --gold-700:#97741f;
  --forest-500:#3d4a35; --forest-700:#2d3a2b; --clay-500:#d67f48;
  --bg:#f5ead8; --surface:#fdf8ef; --ink:#2e2b25;
  --font-display:"Playfair Display",serif;
  --font-caps:"Jost",system-ui,sans-serif;
  --font-script:"Parisienne",cursive;
  --font-body:"Cormorant Garamond",Georgia,serif;
}
```

The `<helmet>` block's rules (focus-visible ring, link colours, `.mrow:hover .mimg` zoom, scrollbar) move to `globals.css` unchanged.

**Fonts:** replace the Google Fonts `@import` with `next/font/google`. The `@import` blocks rendering; `next/font` self-hosts, eliminates the layout shift, and removes a third-party request. Same four families, same weights.

**Responsive:** the prototype branches on `state.isMobile` from a resize listener. That is a client-only measurement, so the server renders the desktop branch and the client may immediately render the mobile one — a hydration mismatch plus a visible flash on every phone. Convert layout branches to CSS media queries at the documented breakpoints (480 / 768 / 1024). Keep JS-measured `isMobile` only for genuinely behavioural differences that CSS cannot express (bottom sheet vs centred modal).

**Images:** `next/image` with `sizes` set. Remote patterns for `images.unsplash.com` and `*.supabase.co` are already in the config above.

---

## 7. The 20 edge cases — port checklist

From the prototype plan §6.3. These are the acceptance criteria for the port; walk them after the frontend runs.

| # | Case | ✓ |
|---|---|---|
| 1 | Out-of-stock variant: disabled, struck through, `aria-disabled`, not focusable | ☐ |
| 2 | Never-made combination: disabled with hatching, *different* tooltip — never says "sold out" | ☐ |
| 3 | Whole product sold out: page opens, all options disabled, button reads `Sold out`, `Notify me` field appears | ☐ |
| 4 | Default lands on a dead variant → `firstAvailable()`; null → case 3 | ☐ |
| 5 | Colour change orphans length → auto-switch **and say so**: *"18\" isn't available in rose gold — switched to 20\"."* | ☐ |
| 6 | Colour with no available length at all → the swatch itself is disabled | ☐ |
| 7 | `1 ≤ stock ≤ 3` → `Only 2 left` in clay. Real number. Silent at 40. | ☐ |
| 8 | `+` capped at stock; at cap, disabled + `2 available` | ☐ |
| 9 | Cap accounts for quantity already in the bag (`stock − inCart`) | ☐ |
| 10 | Single-combination product adds straight from the card, no sheet | ☐ |
| 11 | Sold-out card's button reads `View`, not `Add to bag` | ☐ |
| 12 | Cart line goes out of stock: dimmed, `Sold out — remove to continue`, checkout blocked, **never silently dropped** | ☐ |
| 13 | Stock drops below cart qty: auto-adjust **and say so** | ☐ |
| 14 | Wishlist holds sold-out items, shows `Notify me`, no add button | ☐ |
| 15 | Search empty → *"Nothing matches 'xyz'."* + `Clear search` + 4 suggestions | ☐ |
| 16 | Filter+search empty → primary action is `Clear filters` | ☐ |
| 17 | Empty bag → *"Your bag is empty."* + `Browse the collection` | ☐ |
| 18 | Empty wishlist → *"Nothing saved yet. Tap the heart on a piece to keep it here."* | ☐ |
| 19 | Unknown product slug → `notFound()` or redirect to `/shop` with a toast — **never** a crash on `undefined` | ☐ |
| 20 | Category filters everything out → empty state with filter chips still visible | ☐ |

Cases 12 and 13 change meaning after the port. In the prototype, `reconcileCartStock()` compared against a static array. Now the cart persists in `localStorage` across days while stock changes on the server, so reconciliation must happen against **fresh** data on cart mount — and again authoritatively when the server returns 409 from `POST /orders`.

---

## 8. What changes because it is no longer a sandboxed artifact

| Prototype constraint | Now |
|---|---|
| No `localStorage` — cart resets on refresh | Cart and wishlist persist |
| No routing — `state.route` only | Real URLs, back button, shareable links |
| No server — `submitOrder()` returned a fake id | Real order, real stock decrement, real emails |
| Products hardcoded in the file | Fetched from Postgres, editable by the admin |
| No SEO | `generateMetadata` per product, Open Graph tags |
| WhatsApp number was a placeholder | `+92 311 3136446` from env |
| Instagram strip linked nowhere | `https://www.instagram.com/mayra_.jewels/` |

---

## 9. Accessibility — carry it across, do not re-earn it

The prototype's §19 floor is already implemented. Porting is where it quietly gets lost, so verify each after the port:

- Gold 2 px focus rings with 2 px offset on every interactive element
- Escape closes popup, variant sheet, search, size guide
- Focus **trapped** in modals, returned to the trigger on close (`useRef` on the opener)
- Disabled variants: `aria-disabled="true"` and removed from tab order
- `aria-live="polite"` on toast, stock line, result count
- Alt text describes the piece, not the filename
- `prefers-reduced-motion` respected on popup, sheet, toasts
- Colour never the sole signal — sold out is struck through as well as grey
- **Gold `#c8a24a` on cream `#f5ead8` fails AA for body text.** Use `--gold-700` for text on cream; `--gold-500` for fills and borders only. This is easy to undo by accident while restyling.

---

## 10. Order of work

1. Scaffold, tokens, fonts, `globals.css` — nothing renders yet, everything depends on it
2. `lib/types.ts`, `lib/variants.ts`, `lib/pricing.ts`, `lib/format.ts` — pure, testable, no UI
3. `lib/api.ts` against the running FastAPI
4. Contexts + `Header` + `Footer` + `Toast`
5. `/shop` — the grid proves the data path end to end
6. `/product/[slug]` — the pickers, where the edge cases live
7. `VariantSheet` from the listing
8. `/cart` → `/checkout` → `/order/[orderNumber]`
9. `/` landing, `/golden-essence`, `/about`, `/wishlist`
10. Promo popup, announcement bar, Instagram strip
11. Responsive pass at 360 / 480 / 768 / 1024
12. Accessibility pass (§9) and the §7 checklist

Steps 2 and 6 are load-bearing. Do them carefully and the rest is assembly.
