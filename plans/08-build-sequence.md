# 08 — Build sequence

The working list. Ten phases; each ends with something you can verify, so you are never more than a few hours from knowing whether the thing works.

Time estimates assume you are comfortable with React and Python and are working alone.

---

## Phase 0 — Accounts and scaffolding · ~1 hour

**Do this first: both external accounts involve waiting.**

- [ ] Supabase project created, region Singapore/Mumbai, DB password saved
- [ ] `DATABASE_URL` (transaction pooler, **port 6543**, `postgresql+psycopg://`) in `.env`
- [ ] `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in `.env`
- [ ] Storage bucket `product-images` created, **public**
- [ ] Brevo account, sender address added, **verification link clicked**
- [ ] `BREVO_API_KEY`, `MAIL_FROM_EMAIL`, `OWNER_EMAIL` in `.env`
- [ ] `curl` test email sends and arrives — [plans/06 §2](06-email.md)
- [ ] `ADMIN_PASSWORD` chosen (20+ characters, not reused)
- [ ] Bank details filled in
- [ ] `git init`, first commit, **`.env` confirmed absent from `git status`**
- [ ] `frontend/` moved to `reference/`; brand posters copied to `public/promo/`

**Verify:** the test email is in your inbox and `.env` has no `<PLACEHOLDER>` left.

---

## Phase 1 — Database · ~2 hours

- [ ] Run the DDL from [plans/02 §3](02-database.md) in the Supabase SQL editor
- [ ] Enable RLS with no policies (§3.1)
- [ ] `pip install -r backend/requirements.txt` into `myenv`
- [ ] `backend/app/config.py` — Settings
- [ ] `backend/app/db.py` — engine with `NullPool` + `prepare_threshold=None`
- [ ] `backend/app/models.py` — ORM models for all ten tables
- [ ] `backend/app/seed.py` — the 12 prototype products, idempotent, with `--reset`
- [ ] Run the seed

**Verify:** Supabase Table Editor shows 12 products, their options, values, variants and images. Stock numbers match the prototype (`p-heart-charm` gold|18 = 4, gold|20 = 0).

---

## Phase 2 — Public API · ~3 hours

- [ ] `main.py` — app, CORS, router mounting, `/api/health`
- [ ] `serializers.py` — ORM → the prototype's JSON shape ([plans/03 §3](03-backend-fastapi.md))
- [ ] `routers/public.py` — `/products`, `/products/{slug}`, `/categories`, `/settings`, `/discount/validate`, `/notify-me`
- [ ] `uvicorn backend.app.main:app --reload --port 8000`

**Verify:** `/api/products` returns JSON whose shape matches the prototype's `PRODUCTS` array field for field. Diff it against the array in `reference/Mayra Store.dc.html` if unsure — the entire frontend port depends on this matching. `/api/health` returns `db: true`.

---

## Phase 3 — Frontend skeleton · ~4 hours

- [ ] `create-next-app` at the root, TypeScript, App Router, no Tailwind
- [ ] `next.config.ts` — the `/api/*` rewrite and remote image patterns
- [ ] `app/globals.css` — tokens and helmet rules from the prototype
- [ ] `next/font/google` for the four families
- [ ] `lib/types.ts`, `lib/variants.ts` (verbatim port), `lib/pricing.ts`, `lib/format.ts`, `lib/api.ts`, `lib/whatsapp.ts`
- [ ] `CartProvider`, `WishlistProvider`, `ToastProvider`
- [ ] `Header`, `Footer`, `MobileTabBar`, `Toast`

**Verify:** `npm run dev` renders a header and footer in the right fonts and colours. `lib/api.ts` fetches products from the running FastAPI. No hydration warnings in the console.

---

## Phase 4 — Catalogue · ~6 hours

- [ ] `ProductCard`, `ProductGrid`
- [ ] `/shop` — grid, category chips, sort, `In stock only`, search, all from `searchParams`
- [ ] `SearchOverlay` with the 200 ms debounce and live count
- [ ] `/product/[slug]` — gallery, `SwatchPicker`, `SegmentPicker`, `QtyStepper`, `StockLine`, care accordion, size guide, related items
- [ ] `VariantSheet` from the listing
- [ ] Empty states 15, 16, 17, 18, 20

**Verify:** walk **every row of the [plans/04 §7](04-frontend-nextjs.md) checklist** on the seeded data. It contains deliberate sold-out and never-made combinations for exactly this. Do not move on with rows unticked — these bugs are far more expensive to find later.

---

## Phase 5 — Cart and checkout · ~5 hours

- [ ] `/cart` — lines, steppers, remove, totals, free-delivery hint, unavailable-line handling (12, 13)
- [ ] `/checkout` — fields, inline blur validation, three payment methods
- [ ] Discount code field → `POST /api/discount/validate`
- [ ] Card fields: format validation only, **never in the request body**
- [ ] Bank transfer shows the account details from `/api/settings`
- [ ] `WhatsAppButton` on the PDP, cart, checkout and confirmation

**Verify:** open the Network tab, fill in card details, submit — the request body contains no card digits. This is a one-minute check and it is the point of [PLAN.md §3.3](../PLAN.md).

---

## Phase 6 — Orders and email · ~5 hours

- [ ] `pricing.py` — server-authoritative totals
- [ ] `routers/orders.py` — locked transaction, stock decrement, 409 with per-line problems
- [ ] `email/sender.py` — Brevo client with `timeout=8`
- [ ] `email/templates/_layout.html`, `customer_confirmation.html`, `owner_notification.html`
- [ ] `email_status` recording + resend endpoint
- [ ] `/order/[orderNumber]` reading from `sessionStorage`

**Verify:**
1. Place an order → both emails arrive, totals match the cart exactly
2. Check the database: stock decremented on the right variant, `orders` and `order_items` rows correct
3. Set a variant to stock 1 in Supabase, try to order 3 → 409, cart shows a per-line notice, **nothing is written**
4. Break `BREVO_API_KEY`, order again → order saves, `email_status = failed`

Step 3 is the one people skip. It is the one that matters.

---

## Phase 7 — Admin panel · ~7 hours

- [ ] `security.py` — `compare_digest`, JWT, `get_current_admin`, httpOnly cookie
- [ ] `routers/admin.py` — router-level dependency, every endpoint from [plans/03 §5](03-backend-fastapi.md)
- [ ] `storage.py` — Supabase Storage upload/delete over httpx
- [ ] `app/admin/` route group with its own layout and `noindex`
- [ ] Login gate, dashboard, product list/edit (4 tabs), order list/detail, settings, notify-requests
- [ ] Options rebuild flow with the pre-commit consequence preview ([plans/05 §5.3](05-admin-panel.md))

**Verify:** the full checklist in [plans/05 §8](05-admin-panel.md). Especially: `curl` every `/api/admin/*` route with no cookie and confirm 401 on all of them.

---

## Phase 8 — Remaining pages · ~4 hours

- [ ] `/` landing — hero, four category doors, tracked-caps strip, four featured pieces
- [ ] `PromoPopup` — launch poster, 600 ms delay, every visit, landing only
- [ ] `AnnouncementBar` + the `20% OFF` header chip that reopens the popup
- [ ] `/golden-essence` — story layout, `Shop the full stack`
- [ ] `/about` — real content: materials, care, delivery, returns, contact
- [ ] `/wishlist` — including sold-out items with `Notify me` (case 14)
- [ ] `InstagramStrip` → `https://www.instagram.com/mayra_.jewels/`

**Verify:** every route reachable from the header, no dead handlers, wordmark returns to `/`.

---

## Phase 9 — Responsive and accessibility · ~4 hours

- [ ] 360 / 480 / 768 / 1024 px — no horizontal scroll at any width
- [ ] `isMobile` layout branches converted to CSS media queries
- [ ] Touch targets ≥ 44 × 44 everywhere
- [ ] Mobile bottom tab bar; sticky add-to-bag on the PDP
- [ ] `next/image` with `sizes` on every product image
- [ ] The full [plans/04 §9](04-frontend-nextjs.md) accessibility list
- [ ] Contrast: `--gold-700` for text on cream, `--gold-500` for fills only

**Verify:** Chrome DevTools at 360 px wide, tab through a full purchase without a mouse, run Lighthouse.

---

## Phase 10 — Deploy · ~3 hours

- [ ] `frontend/requirements.txt` kept as a full duplicate of `backend/requirements.txt` — see plans/07 §2, do not use a `-r ../backend/requirements.txt` include, it fails Vercel's Python function bundler
- [ ] `vercel.json` — function config, cron, admin headers
- [ ] `public/robots.txt` disallowing `/admin`
- [ ] `/docs` and `/redoc` disabled when `APP_ENV == "production"`
- [ ] Push to GitHub — **confirm `.env` is absent**
- [ ] Import to Vercel, add every env var, deploy
- [ ] `ALLOWED_ORIGINS` → the production URL, redeploy
- [ ] Full order on the production URL, both emails received
- [ ] `pg_dump` backup, stored outside the repo
- [ ] The [plans/07 §9](07-deployment-vercel.md) checklist

---

## Dependency graph

```
Phase 0 ──┬── 1 ── 2 ──┬── 4 ── 5 ── 6 ── 10
          │            │
          └── 3 ───────┤        7 ──────────┤
                       │        (needs 2)   │
                       └── 8 ── 9 ──────────┘
```

Phases 3 and 1–2 are independent — if you get stuck on the backend, the frontend skeleton is unblocked work.

**Rough total: 40–45 hours.** Phases 4 and 7 are the two that will overrun.

---

## If you have to cut scope

In the order I would cut, most expendable first:

1. `/admin/notify-requests` — the capture still works, just read the table in Supabase
2. `/admin/settings` — hardcode the announcement text
3. Options rebuild flow — seed products via `seed.py` and let the admin edit stock and images only
4. Wishlist — the heart on cards is nice, the page is optional
5. `/golden-essence` — it is `/shop?collection=golden-essence` with better typography

**Never cut:** the order transaction's stock locking, server-side total recomputation, the card-fields-stay-in-the-browser rule, or the admin password check. Each of those is either a correctness bug or a security bug rather than a missing feature, and each is much harder to add back than to build once.
