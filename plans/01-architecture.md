# 01 — Architecture

How the pieces fit, and which of them is allowed to be trusted.

---

## 1. The shape of it

```
                          ┌────────────────────────────────────┐
                          │   ONE VERCEL PROJECT (Hobby, free) │
   Customer's browser     │                                    │
   ──────────────────►    │  ┌──────────────────────────────┐  │
                          │  │  Next.js 15 (Node runtime)   │  │
   /  /shop  /product/…   │  │  React 19 · TypeScript       │  │
   /cart /checkout …      │  │  Server Components fetch     │  │
                          │  │  the catalogue, cache 60s    │  │
                          │  └───────────────┬──────────────┘  │
                          │                  │ /api/*          │
                          │                  ▼                 │
   Admin's browser        │  ┌──────────────────────────────┐  │
   ──────────────────►    │  │  FastAPI (Python runtime)    │  │
   /admin  (typed by hand)│  │  serverless, per-request     │  │
                          │  └──────┬───────────────┬───────┘  │
                          └─────────┼───────────────┼──────────┘
                                    │               │
                    ┌───────────────▼──┐      ┌─────▼──────────┐
                    │  Supabase        │      │  Brevo         │
                    │  · Postgres      │      │  transactional │
                    │    (pooler 6543) │      │  email API     │
                    │  · Storage (CDN) │      └────────────────┘
                    └──────────────────┘
```

Three runtimes, one deployment. Next.js and FastAPI are separate serverless functions inside the same Vercel project, so they share a domain and there is no cross-origin problem in production. Locally they run as two processes on two ports, which is why `ALLOWED_ORIGINS` exists.

---

## 2. Why FastAPI lives under `/api` and not on its own host

Vercel's Python runtime picks up any `.py` file in a root-level `/api` directory and, if the module exposes an ASGI `app`, serves it directly. So `api/index.py` is a shim:

```python
from backend.app.main import app   # noqa: F401
```

`next.config.ts` then rewrites `/api/:path*` to that function in production, and to `http://127.0.0.1:8000/api/:path*` in development, so frontend code can always call `/api/products` regardless of environment.

The alternative — Next.js on Vercel, FastAPI on Render's free tier — was rejected because Render free instances sleep after 15 minutes and take ~50 seconds to wake. A grader clicking your link and staring at a spinner for a minute is a worse failure than anything Vercel's constraints cost you.

---

## 3. Request lifecycles

### 3.1 Browsing the catalogue (the common case — no Python involved)

```
Browser → Next.js server component
        → fetch('/api/products', { next: { revalidate: 60 } })
        → [cache hit 95% of the time] → HTML
```

The catalogue is fetched by a **server** component and cached for 60 seconds at the edge. Most visitors never cause a Python invocation at all, which is what makes cold starts a non-issue for browsing. The 60-second window is also why an admin's stock edit appears on the storefront within a minute rather than instantly — an acceptable trade, and adjustable.

### 3.2 Placing an order (the one that matters)

```
Browser (client component)
  │  POST /api/orders
  │  { items:[{product_id, variant_key, qty}], customer{…}, payment_method, discount_code? }
  │  ── note: no prices, no totals, no card digits ──
  ▼
FastAPI
  1. Validate the payload shape                          (Pydantic)
  2. BEGIN transaction
  3. SELECT … FROM product_variants WHERE id = ANY(…) FOR UPDATE   ← ordered by id
  4. Every line: variant exists? active? stock >= qty?   → else 409 with per-line detail
  5. Recompute unit prices from base_price + price_delta (DB, never the client)
  6. Validate discount_code against .env → percent or zero
  7. Recompute subtotal, discount, delivery, total
  8. UPDATE stock = stock - qty
  9. INSERT orders + order_items
 10. COMMIT
 11. Send customer email   ┐ both wrapped in try/except —
 12. Send owner email      ┘ a mail failure never rolls back a paid order
 13. Record email_status on the order
  ▼
Browser → redirect to /order/{order_number}
```

Steps 3–10 are one transaction. Step 3's `FOR UPDATE`, with rows locked in a consistent order, is what stops two simultaneous buyers from both taking the last piece. Steps 11–12 are deliberately outside the transaction: an order that succeeded must not be undone because Brevo had a bad minute.

### 3.3 Admin editing stock

```
Browser → POST /api/admin/login {password}
        → constant-time compare against ADMIN_PASSWORD
        → HS256 JWT, exp = now + ADMIN_SESSION_HOURS
        → stored in an httpOnly cookie
Browser → PATCH /api/admin/variants/{id} {stock: 4}   [Cookie: admin_session]
        → verify JWT → UPDATE → 200
Storefront picks up the change on the next revalidation (≤60s)
```

---

## 4. The trust boundary

Everything on the left is attacker-controlled. Everything on the right is authoritative.

| Untrusted (browser) | Authoritative (server + DB) |
|---|---|
| Item prices shown in the cart | `products.base_price` + `product_option_values.price_delta` |
| Subtotal, discount, delivery, total | Recomputed in `orders.py` from DB rows |
| "This discount code is valid" | Compared against `DISCOUNT_CODE` in `.env` |
| Stock counts rendered on the page | `product_variants.stock`, re-read under row lock |
| Which products exist | `products.is_active = true` |
| Card number, expiry, CVC | **Never transmitted.** Not stored, not logged, not emailed. |
| Admin session claim | JWT signature verified with `ADMIN_JWT_SECRET` on every admin request |

The client keeps its own totals maths — you need it to render the cart. It just is not the version that gets written down.

---

## 5. State ownership on the frontend

The prototype is one 400-line `DCLogic` class holding everything. That does not survive a split into nine routed pages, so state gets divided by who owns it:

| State | Owner | Persistence |
|---|---|---|
| Catalogue | Server components, fetched per request | Next.js cache, 60s |
| Cart | `CartProvider` (React context) | `localStorage` — survives refresh, which the artifact could not do |
| Wishlist | `WishlistProvider` | `localStorage` |
| Toasts | `ToastProvider` | none, ephemeral |
| PDP selection, quantity, gallery index | Local `useState` in the product page | none |
| Filters, sort, search | URL search params (`/shop?category=rings&sort=price-asc`) | shareable, back-button-correct |
| Promo popup dismissal | Local state on the landing page | none — it fires every visit, as specified |
| Admin session | httpOnly cookie | until JWT expiry |

Putting filters in the URL instead of component state is a small upgrade over the prototype and comes nearly free with the App Router. It makes `/shop?category=necklaces` a linkable thing, which the landing page's four category doors want anyway.

---

## 6. Two separate applications sharing a domain

The customer site and the admin site are both Next.js routes, but they are built as if they were separate products:

- **No shared navigation.** The customer `<Header>` has no admin link. `/admin` is reachable only by typing it.
- **No shared components that leak.** An admin component must never be imported into a customer page — that would ship admin code in the customer bundle. The App Router keeps them in separate route groups so this stays true automatically.
- **No admin data in customer responses.** Public product endpoints return only what a shopper needs; cost prices, internal notes, and order lists are on `/api/admin/*` behind the JWT.
- **`noindex` and a `robots.txt` disallow** on the whole `/admin` subtree.

That last point is worth being clear about: `robots.txt` and `noindex` deter search engines, not people. The password is the actual security control. Everything else is hygiene.
