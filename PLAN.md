# Mayra Store — Master Build Plan

**Project:** university coursework e-commerce site — minimal, not production-grade, but genuinely functional.
**Status:** frontend prototype complete (Claude Design artifact). Backend, database, admin, email: not started.
**Supersedes:** `frontend/uploads/mayra-store-plan.md` — that document planned the *prototype* and is now historical. Its design decisions (§2 typography, §3 palette, §6 variant/stock model, §19 accessibility floor) still hold and carry forward unchanged; its §17 "wiring in a real database later" is what this plan actually executes.

---

## 0. The plan set

| Document | Covers |
|---|---|
| **PLAN.md** (this) | Architecture, stack decisions, repo layout, risks, definition of done |
| [plans/01-architecture.md](plans/01-architecture.md) | How the three runtimes fit together; request lifecycle; the trust boundary |
| [plans/02-database.md](plans/02-database.md) | Supabase setup, full schema DDL, Storage bucket, seed script |
| [plans/03-backend-fastapi.md](plans/03-backend-fastapi.md) | FastAPI layout, every endpoint, the order transaction, security |
| [plans/04-frontend-nextjs.md](plans/04-frontend-nextjs.md) | Porting the artifact to Next.js — directive-by-directive, route-by-route |
| [plans/05-admin-panel.md](plans/05-admin-panel.md) | The separate admin view, auth, and every screen in it |
| [plans/06-email.md](plans/06-email.md) | Brevo setup, both email templates, failure handling |
| [plans/07-deployment-vercel.md](plans/07-deployment-vercel.md) | One Vercel project running Next.js + Python, env vars, the keepalive cron |
| [plans/08-build-sequence.md](plans/08-build-sequence.md) | Ordered task list with dependencies — the thing you actually work through |

---

## 1. Stack — decided

| Layer | Choice | Why this one |
|---|---|---|
| Frontend | **Next.js 15 (App Router) + React 19 + TypeScript** | "Convert to Node.js" for a shopping site means Next.js. Your existing logic is a `DCLogic` class with `state`/`setState`/`componentDidMount` — that is React with different labels, so the port is mechanical, not a rewrite. TypeScript because the variant/stock model is the load-bearing, easy-to-break part. |
| Backend | **Python 3.12 + FastAPI** | Your call. Runs on Vercel's Python runtime as a serverless ASGI app. |
| Database | **Supabase Postgres** (free tier) | Postgres, 500 MB, plus a connection pooler that serverless actually needs. |
| Image hosting | **Supabase Storage** (free tier, 1 GB) | The decider. The admin has to upload product photos somewhere, and Supabase is the only free option that bundles the database and a CDN-backed file store in one account. Neon would have meant a second service (Cloudinary) just for images. |
| Email | **Brevo** HTTP API | 300 emails/day free, and — critically — it verifies a **single sender address** rather than a whole domain. You have no domain, so Resend would silently only deliver to your own inbox and every customer confirmation would vanish. |
| Deployment | **One Vercel project** | Next.js at the repo root, FastAPI as a Python serverless function under `/api`. Hobby tier, free. |
| Payments | **COD + bank transfer real, card simulated** | See §4. |

### 1.1 What is not in scope

No customer accounts (guest checkout only — matches the prototype). No real payment gateway. No Instagram Graph API — the strip uses stored images and the follow button deep-links. No WhatsApp Business API — the WhatsApp buttons build a `wa.me` URL, which is what you asked for and is genuinely the right call.

---

## 2. Repo layout after the build

The frontend and backend are separate top-level folders — `frontend/` for everything Next.js, `backend/` for everything FastAPI, `reference/` for the original prototype. Vercel's Project Root Directory is set to `frontend/`, and the Python function lives at `frontend/api/index.py`, importing the sibling `backend/` package (details in [plans/07 §1-2](plans/07-deployment-vercel.md)).

```
Mayra Store v2 Implementation/
├── .env                        ← secrets, git-ignored          [DONE]
├── .env.example                ← committed template            [DONE]
├── .gitignore                                                  [DONE]
├── PLAN.md                     ← you are here
├── plans/                      ← the eight planning docs
│
├── backend/
│   ├── requirements.txt                                        [DONE]
│   └── app/
│       ├── main.py             ← FastAPI app, CORS, router mounting
│       ├── config.py           ← pydantic-settings Settings, reads .env
│       ├── db.py               ← SQLAlchemy engine (NullPool) + session dependency
│       ├── models.py           ← ORM tables
│       ├── schemas.py          ← Pydantic request/response models
│       ├── security.py         ← admin password check + JWT issue/verify
│       ├── storage.py          ← Supabase Storage upload/delete over httpx
│       ├── pricing.py          ← server-authoritative money maths
│       ├── serializers.py      ← ORM rows -> the frontend's Product JSON shape
│       ├── email/
│       │   ├── sender.py       ← Brevo client
│       │   └── templates/      ← customer_confirmation.html, owner_notification.html
│       ├── routers/
│       │   ├── public.py       ← catalogue, settings, discount check
│       │   ├── orders.py       ← POST /orders — the important one
│       │   └── admin.py        ← everything behind the password
│       └── seed.py             ← loads the 12 prototype products into Postgres
│
├── frontend/                   ← Vercel Project Root Directory
│   ├── package.json  tsconfig.json  next.config.ts  eslint.config.mjs
│   ├── requirements.txt        ← `-r ../backend/requirements.txt`
│   ├── vercel.json             ← Python function config + the keepalive cron
│   ├── .env.local              ← NEXT_PUBLIC_* values for local dev, git-ignored
│   ├── api/
│   │   └── index.py            ← Vercel entrypoint: imports ../../backend
│   ├── app/                    ← Next.js App Router
│   │   ├── layout.tsx  globals.css
│   │   ├── page.tsx             ← landing
│   │   ├── shop/  golden-essence/  about/  cart/  checkout/  wishlist/
│   │   ├── product/[slug]/
│   │   ├── order/[orderNumber]/
│   │   └── admin/               ← login, products, orders, settings
│   ├── components/             ← Header, ProductCard, VariantSheet, Toast, …
│   ├── lib/                    ← api.ts, variants.ts, format.ts, types.ts
│   └── context/                ← CartProvider, WishlistProvider, ToastProvider
│
└── reference/                  ← the prototype, kept for reference, not deployed
    ├── Mayra Store.dc.html
    ├── support.js
    └── uploads/mayra-store-plan.md
```

The images in `reference/uploads/*.jpg` are your Instagram brand posters. The `776163542_…` one is the 14 August launch poster used by the promo popup — it moves to `frontend/public/promo/launch-poster.jpg`, not into the database, because it is site furniture rather than a product.

---

## 3. Three inconsistencies in the brief, and what I did about them

These are worth reading before you start — each one changes something you asked for.

### 3.1 "All the item images must be stored in the database"

Storing image bytes in Postgres is the wrong tool. Your free tier is 500 MB total; twenty product photos at 200 KB would eat 4 MB of it while making every catalogue query drag binary blobs across the wire, and Postgres has no CDN in front of it.

**What I planned instead:** image *files* live in Supabase Storage (a public bucket, CDN-served, 1 GB free); the database stores rows in `product_images` holding the URL, alt text, colour key, and sort position. The admin upload flow is unchanged from your description — pick a file, it appears on the product. The functional outcome is identical and the failure modes are much better. If your rubric literally requires bytes-in-database, say so and I will add a `BYTEA` column instead, but I would argue against it.

### 3.2 "Deploy the whole project on Vercel" + FastAPI

This works, and [plans/07](plans/07-deployment-vercel.md) covers it. But Vercel gives you *serverless functions*, not a server, and three consequences follow:

- **No background workers.** Order confirmation emails are sent inline, inside the POST request, before it returns. That costs ~1–2 seconds of checkout latency. FastAPI's `BackgroundTasks` is not safe here — the function can be frozen the instant the response is flushed, and the email would never send.
- **No local filesystem.** Already handled: images go to Supabase Storage.
- **Connection limits.** Every cold start opens a new Postgres connection. Direct connections would exhaust Supabase's pool under any load. The fix is the transaction pooler on port 6543 plus SQLAlchemy `NullPool`, spelled out in [plans/02 §4](plans/02-database.md).

### 3.3 The card form collects card numbers it should never transmit

The prototype's checkout has `card`, `expiry`, and `cvc` fields, and `validateCheckout` regex-validates a 12–19 digit PAN. Payments are simulated — so those digits have nowhere legitimate to go, and a demo site that POSTs card numbers to a server is a bad thing to demo.

**Rule for the port:** card fields are validated in the browser for format only and are **never** included in the request body. The order payload carries `payment_method: "card"` and nothing else about the card. The server stamps `payment_status = "simulated"`. The existing on-screen disclosure — *"This is a demo — card details are not sent anywhere and no charge is made"* — then becomes literally true rather than aspirational.

---

## 4. Payments

| Method | Treatment | Order lands as |
|---|---|---|
| **Cash on delivery** | Real. Nothing to process — recording the order *is* the whole transaction. | `payment_method=cod`, `payment_status=pending` |
| **Bank transfer** | Real. Checkout and both emails show the account details from `.env`. Admin marks it received. | `payment_method=bank`, `payment_status=awaiting_transfer` |
| **Card** | Simulated. Format-validated client-side, digits never leave the browser. | `payment_method=card`, `payment_status=simulated` |

Only the card path is fake, and it is labelled as fake on screen and in the confirmation email.

---

## 5. The trust boundary — the one rule

**The browser proposes; the server decides.**

The prototype computes subtotal, discount, delivery, and total in `computeTotals()` and trusts its own numbers. Once that logic is exposed over HTTP, anyone can POST `{"total": 1}`. So the order endpoint accepts only:

```
{ items: [{ product_id, variant_key, qty }], customer: {...}, payment_method, discount_code? }
```

and recomputes everything from database prices — price, delta, discount validity, delivery threshold, stock. The client keeps its `computeTotals()` for display; the server's answer is the one that gets written and emailed. If they disagree, the server wins silently. Full detail in [plans/03 §5](plans/03-backend-fastapi.md).

Stock is decremented in the same transaction that writes the order, with `SELECT … FOR UPDATE` on the variant rows. Without that, two people buying the last piece at the same moment both succeed.

---

## 6. What "done" means

A build is finished when all of these are true:

- [ ] Every one of the nine customer routes renders from the database, not from a hardcoded array
- [ ] All 20 variant/stock edge cases from the prototype plan §6.3 still behave correctly after the port
- [ ] Placing an order writes an `orders` row, decrements the right variant's stock, and both emails arrive
- [ ] The customer email shows the itemised order; the owner email shows the same plus delivery address and phone
- [ ] `/admin` is reachable only by typing the URL, demands the password, and is absent from every link, sitemap, and `robots.txt`-crawlable path on the customer site
- [ ] The admin can create a product, upload an image, edit stock per variant, and see the change on the live storefront without a redeploy
- [ ] The admin can list orders and change their status
- [ ] Cart and wishlist survive a page refresh
- [ ] WhatsApp buttons open a chat with `+92 311 3136446` pre-filled with the order text
- [ ] Card checkout never puts a card number in a network request (check the Network tab — this is a one-minute verification)
- [ ] The site works on a 360 px-wide phone viewport
- [ ] `.env` is not in git history

---

## 7. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **Supabase free project pauses after 7 days idle — and it pauses right before your demo** | High if you build early and present late | A Vercel cron pings `/api/health` daily. Config in [plans/07 §6](plans/07-deployment-vercel.md). Also: open the Supabase dashboard the morning of the demo. |
| Brevo sender never verified → every email fails | Medium | Do this on **day one**, not the day before. It needs a click in an inbox and can take a few minutes to propagate. |
| Vercel Python cold start makes the first page load feel broken | Medium | Catalogue reads are cached by Next.js (`revalidate: 60`) so most visitors never touch Python. The keepalive cron also keeps one instance warm-ish. |
| The port silently loses one of the 20 edge cases | Medium | [plans/04 §7](plans/04-frontend-nextjs.md) carries them as an explicit checklist. Tick them off. |
| Free-tier Unsplash placeholders still on the live site at submission | Medium | Fine for a coursework demo, and the seed data uses them deliberately. Replace via the admin panel if you have real photos. |
| Someone finds `/admin` | Low | Password + short-lived JWT + `noindex` + no inbound links. Not bank-grade, appropriate for coursework. Do not reuse a password you use elsewhere. |

---

## 8. Where to start

Go to [plans/08-build-sequence.md](plans/08-build-sequence.md). Phases 0–2 (accounts, schema, seed) unblock everything else and can be done in an evening.

Two things to do before writing any code, because both have external waiting time:

1. Create the Supabase project — provisioning takes a few minutes.
2. Create the Brevo account and **verify the sender address** — needs an email round-trip.
