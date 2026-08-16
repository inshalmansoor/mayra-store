# 05 — Admin panel

Your requirement, restated as build rules:

> separate view · invisible to customers · no admin functionality on the user site · password protected · password in `.env` · reachable only by typing the URL · configures the whole storefront

---

## 1. Separation

Same Next.js app, entirely separate surface. Enforced by five rules:

1. **No inbound links.** Nothing in `Header`, `Footer`, `MobileTabBar` or any customer page references `/admin`. Not in a comment, not in a hidden element.
2. **Route group isolation.** `app/(shop)/…` and `app/admin/…` with separate `layout.tsx` files. Different chrome, different providers — the admin layout does not mount `CartProvider`.
3. **No shared imports.** An admin component must never be imported by a customer page. That would ship admin markup in the customer's JavaScript bundle, where anyone can read it.
4. **Excluded from discovery.** `app/admin/layout.tsx` exports `metadata = { robots: { index: false, follow: false } }`; `public/robots.txt` disallows `/admin`; `/admin` never appears in `sitemap.xml`.
5. **Data separation.** Admin screens call `/api/admin/*` only. Public product endpoints never return order data, customer details, or inactive products.

Point 4 deters crawlers, not people. **The password is the security control.** Everything else is hygiene.

### 1.1 Optional extra obscurity

If you want the URL itself to be non-guessable, add `ADMIN_PATH_SLUG=x7k2m9` to `.env` and mount the panel at `/admin-x7k2m9` via a rewrite. It raises the bar slightly. It is not a substitute for the password, and it makes the URL harder for you to remember — I would skip it and use a long passphrase instead.

---

## 2. Authentication

```
GET /admin
   └─ AdminGate (client) → GET /api/admin/me
        ├─ 200 → render the panel
        └─ 401 → render the login card

login card → POST /api/admin/login { password }
   ├─ 200 → Set-Cookie: admin_session (httpOnly, secure, samesite=lax)
   └─ 401 → "Incorrect password."  ← no other detail, ever
```

Backend, per [plans/03 §6](03-backend-fastapi.md):

- `hmac.compare_digest` against `ADMIN_PASSWORD`, never `==`
- HS256 JWT signed with `ADMIN_JWT_SECRET`, expiring after `ADMIN_SESSION_HOURS`
- httpOnly cookie — JavaScript cannot read it, so an XSS bug cannot exfiltrate the session
- `samesite=lax` — another site cannot make your browser fire an authenticated `DELETE`
- Every admin router carries `dependencies=[Depends(get_current_admin)]` at **router level**, so a newly added endpoint is protected by default

The login form is the whole login system. No username, no reset flow, no "remember me". One password, one field, one button.

**Error message discipline:** always "Incorrect password." Never "session expired, please log in" versus "wrong password" as distinguishable states to an unauthenticated caller — that is free information.

---

## 3. Screens

```
/admin                      login gate → dashboard
/admin/products             list: thumbnail, name, category, total stock, active toggle
/admin/products/new         create
/admin/products/[id]        edit: details · options · variants+stock · images
/admin/orders               list: number, customer, total, payment, status, email status
/admin/orders/[id]          detail: items, address, phone, status controls, resend email
/admin/notify-requests      restock waiting list
/admin/settings             announcement bar, promo popup toggle, about intro
```

Styling: plain, dense, functional. Do **not** reuse the storefront's Playfair/Cormorant/cream theme — a system font stack and a white background make the admin visibly a different application, which is the point. It is also faster to build.

---

## 4. Dashboard

Five numbers and a list, above the fold:

- New orders (status `new`)
- Orders today
- Products out of stock entirely
- Variants below `LOW_STOCK_AT`
- Orders where `email_status != 'sent'` ← **highlight this in red.** A silently failed confirmation email is the failure mode most likely to bite you, and this is the only place it surfaces.

Then the last ten orders, each linking to its detail page.

---

## 5. Product editing

The most-used screen. Four tabs on one page.

### 5.1 Details

`name`, `slug`, `category`, `collection`, `base_price`, `material`, `blurb`, `care` (repeatable text rows), `is_active`, `is_featured`, `sort_order`.

- **Slug is immutable after creation.** It is the public URL and the API identifier. Editing it breaks every existing link and any bookmarked product page. Render it read-only with a note.
- `is_active = false` hides a product from the storefront without deleting it. Past orders keep working because `order_items` snapshots the name, SKU, price and image ([plans/02 §3](02-database.md)).
- Warn when `is_featured` is set on more or fewer than four products — the landing page grid expects exactly four.

### 5.2 Images

Drag-and-drop or file picker → `POST /api/admin/products/{id}/images` (multipart) → Supabase Storage → row in `product_images`.

Each image has a **colour key** (`default`, or a colour `value_id` such as `rose`) and a position. This is what makes the gallery swap when the customer picks a different colour — `galleryImages(p, colourId)` falls back to `default` when a colour has no images of its own.

- Reorder by drag; position 0 is the card thumbnail
- Alt text field per image, with a nudge: describe the piece, not the filename
- Delete removes the DB row **and** the Storage object — otherwise the free 1 GB slowly fills with orphans nobody can see
- Server-side: only `jpeg`/`png`/`webp`, 5 MB cap, filename generated server-side and never taken from the client
- Client-side: warn above ~1 MB. There is no image transformation on the free tier, so an 8 MB phone photo is an 8 MB download for every visitor.

### 5.3 Options — the dangerous tab

Options define the axes (`colour`, `length`) and their values. **Their order and set determine every `variant_key`** ([plans/02 §4](02-database.md)).

Adding, removing, or reordering an option invalidates every existing variant key for that product. `gold|18` under `[colour, length]` becomes meaningless under `[colour, length, finish]`.

So `PUT /api/admin/products/{id}/options` is transactional and explicit:

1. Compute the new key for every existing variant by mapping old values across
2. Where a new axis was added, the old variant cannot be mapped — those variants are listed
3. **Show the customer-facing consequence before committing:** *"This will remove 4 combinations and create 9 new ones with 0 stock. Necklace 'gold|18' currently has 4 in stock and will need re-entering."*
4. Only on confirm: rewrite `product_variants` inside one transaction

`order_items.variant_id` is `ON DELETE SET NULL` and every order line snapshots its own SKU, name and price, so historical orders survive this intact.

For a product with no options, the single variant key is the literal `'default'`.

### 5.4 Variants and stock

The screen you will use most: a table of every existing combination.

| Combination | SKU | Stock | |
|---|---|---|---|
| Gold · 16" | MYR-HC-G16 | `[ 12 ]` | Remove |
| Gold · 18" | MYR-HC-G18 | `[ 4 ]` | Remove |
| Gold · 20" | MYR-HC-G20 | `[ 0 ]` | Remove |
| *Rose · 16"* | *not made* | | **Add** |

- Stock edits save on blur → `PATCH /api/admin/variants/{id}`
- **"Remove" means "we never made this"**, not "sold out". The row disappears and the customer sees the hatched *"Not made in this combination"* state. Setting stock to 0 is the sold-out state. The UI must label this distinction in plain words, because getting it backwards is the single easiest mistake to make here and it produces a wrong-but-plausible storefront.
- Missing combinations are listed greyed with an **Add** button so it is obvious what exists and what does not
- Rows at or below `LOW_STOCK_AT` are tinted; zero rows are tinted more strongly
- SKUs are globally unique — surface the constraint violation as a readable message, not a 500

---

## 6. Orders

**List:** order number, date, customer name, total, payment method + status, fulfilment status, email status. Filter by status, newest first, paginated at 25.

**Detail:** everything needed to actually pack and send the parcel — items with SKUs and selection labels, delivery address, phone (as a `tel:` link), order note, the full money breakdown, and the payment method.

Controls:

- **Fulfilment status:** `new → confirmed → packed → shipped → delivered`, plus `cancelled`
- **Payment status:** for bank transfers, `awaiting_transfer → paid` once the money lands. This is the one manual step that makes bank transfer a real payment method rather than a decorative one.
- **Resend email** — retries both sends and updates `email_status`. Needed because sending is best-effort by design ([plans/03 §4.4](03-backend-fastapi.md)).
- **Message on WhatsApp** — a `wa.me` link to the customer's own number, pre-filled with `Hi {name}, about your order {number}…`. Cheap to build, and it is how this shop will actually communicate.

**Cancelling does not restore stock automatically.** Returning stock on cancellation sounds obviously right and is a good way to double-count when a cancelled order gets cancelled twice or was never physically reserved. Show a separate *"Return N units to stock"* button on cancelled orders so it is a deliberate act.

---

## 7. Settings

Edits the `settings` table — display values only, never secrets:

- `announcement_enabled` / `announcement_text` — the strip under the header
- `promo_popup_enabled` — the launch poster modal
- `about_intro` — the About page opening paragraph

The discount code and percent, delivery threshold and fee, WhatsApp number, and bank details stay in `.env` because they are business rules the server enforces and because you asked for the owner's email to live there. If you later want them admin-editable, move them into `settings` **and** read them from there in `pricing.py` — having two sources of truth for the delivery fee is worse than not being able to edit it.

---

## 8. Admin checklist

- [ ] `/admin` reachable only by typing the URL — grep the customer bundle for `admin`, expect nothing
- [ ] Wrong password → "Incorrect password." and nothing else
- [ ] Session expires after `ADMIN_SESSION_HOURS` and returns to the login card
- [ ] Every `/api/admin/*` route returns 401 without a valid cookie (test with `curl`, no cookie)
- [ ] Create a product → it appears on `/shop` within the 60-second revalidation window
- [ ] Upload an image → it renders on the card and in the gallery
- [ ] Set a variant's stock to 0 → the storefront shows the struck-through sold-out state
- [ ] Remove a variant → the storefront shows the hatched never-made state
- [ ] Deactivate a product → gone from `/shop`, and `/product/{slug}` 404s
- [ ] Place a test order → it appears in `/admin/orders` with the right total
- [ ] Change order status → it persists across a reload
- [ ] Delete an image → the Storage object is gone too (check the Supabase dashboard)
