# 03 — Backend (FastAPI)

---

## 1. Layout

```
api/index.py                    ← Vercel entrypoint: `from backend.app.main import app`

backend/app/
├── main.py                     app, CORS, routers, /api/health
├── config.py                   Settings (pydantic-settings) — the only place os.environ is read
├── db.py                       engine + get_db dependency          [plans/02 §5]
├── models.py                   SQLAlchemy ORM models
├── schemas.py                  Pydantic request/response models
├── security.py                 admin password check, JWT issue/verify, get_current_admin
├── storage.py                  Supabase Storage upload/delete via httpx
├── pricing.py                  the money maths — one module, server-authoritative
├── serializers.py              ORM rows → the JSON shape the frontend expects
├── email/
│   ├── sender.py               Brevo client                        [plans/06]
│   └── templates/*.html        Jinja2 email bodies
├── routers/
│   ├── public.py               catalogue, settings, discount check, notify-me
│   ├── orders.py               POST /api/orders
│   └── admin.py                everything behind the password      [plans/05]
└── seed.py                     loads the 12 prototype products
```

Everything is mounted under `/api` so Vercel's routing and the Next.js rewrite line up.

---

## 2. Config

`config.py` is the only module that touches the environment. Every other module imports `settings`. A missing or malformed variable then fails loudly at import time instead of at 11 p.m. inside a checkout request.

```python
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import EmailStr

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    APP_ENV: str = "development"
    ALLOWED_ORIGINS: str = "http://localhost:3000"

    DATABASE_URL: str
    SUPABASE_URL: str
    SUPABASE_SERVICE_ROLE_KEY: str
    SUPABASE_STORAGE_BUCKET: str = "product-images"

    ADMIN_PASSWORD: str
    ADMIN_JWT_SECRET: str
    ADMIN_SESSION_HOURS: int = 8

    BREVO_API_KEY: str
    MAIL_FROM_EMAIL: EmailStr
    MAIL_FROM_NAME: str = "Mayra Store"
    OWNER_EMAIL: EmailStr
    OWNER_NAME: str = "Mayra"

    STORE_NAME: str = "Mayra Store"
    STORE_CURRENCY: str = "PKR"
    WHATSAPP_NUMBER: str
    INSTAGRAM_URL: str
    FREE_DELIVERY_THRESHOLD: int = 5000
    DELIVERY_FEE: int = 250
    LOW_STOCK_AT: int = 3
    DISCOUNT_CODE: str = "MAYRA20"
    DISCOUNT_PERCENT: int = 20

    BANK_NAME: str = ""
    BANK_ACCOUNT_TITLE: str = ""
    BANK_ACCOUNT_NUMBER: str = ""
    BANK_IBAN: str = ""

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

settings = Settings()
```

---

## 3. Public API

Base path `/api`. No authentication. All responses JSON.

### `GET /health`
`{"ok": true, "db": true}`. Runs `select 1` — which is also what keeps Supabase from pausing ([plans/02 §7](02-database.md)). Must stay cheap and never require the database to be warm.

### `GET /products`
The whole catalogue in **exactly the shape the prototype's `PRODUCTS` array already has**, so the ported `variants.ts` helpers work unchanged:

```jsonc
[{
  "id": "p-heart-charm",
  "name": "Heart Charm Necklace",
  "category": "necklaces",
  "collection": null,
  "basePrice": 2400,
  "material": "18k gold-plated stainless steel",
  "blurb": "A soft heart charm on a fine cable chain…",
  "care": ["Remove before showering or swimming", "…"],
  "isFeatured": true,
  "images": {
    "default": ["https://…/heart-1.jpg", "https://…/chain.jpg"],
    "rose":    ["https://…/flat.jpg"]
  },
  "options": [
    { "key": "colour", "label": "Colour", "type": "swatch", "values": [
      { "id": "gold", "label": "Gold", "hex": "#c8a24a", "priceDelta": 0 }
    ]},
    { "key": "length", "label": "Length", "type": "segment", "values": [
      { "id": "20", "label": "20\"", "priceDelta": 200 }
    ]}
  ],
  "variants": {
    "gold|16": { "sku": "MYR-HC-G16", "stock": 12 },
    "gold|20": { "sku": "MYR-HC-G20", "stock": 0 }
  }
}]
```

Note `id` is the **slug**, not the UUID. The prototype's ids (`p-heart-charm`) become slugs and stay the public identifier; UUIDs never leave the backend. Only `is_active = true` products appear. Options and values are ordered by `position` — see the [variant_key contract](02-database.md#4-variant_key--the-contract-between-three-layers).

Fetching this in one query without an N+1 storm: one `select` on products with `selectinload` on options → values, variants, and images.

### `GET /products/{slug}`
One product, same shape. 404 if missing or inactive — the frontend already handles this (prototype edge case 19: fall back to `/shop` with a toast rather than crashing).

### `GET /categories`
`[{ "slug": "necklaces", "label": "Necklaces" }, …]`

### `GET /settings`
Public, non-secret store configuration, so the frontend does not hardcode business rules:

```json
{
  "storeName": "Mayra Store",
  "currency": "PKR",
  "whatsappNumber": "923113136446",
  "instagramUrl": "https://www.instagram.com/mayra_.jewels/",
  "freeDeliveryThreshold": 5000,
  "deliveryFee": 250,
  "lowStockAt": 3,
  "discountCode": "MAYRA20",
  "discountPercent": 20,
  "bank": { "name": "…", "accountTitle": "…", "accountNumber": "…", "iban": "…" },
  "announcement": { "enabled": true, "text": "Launch offer — 20% off…" },
  "promoPopupEnabled": true
}
```

`discountCode` is exposed deliberately — the prototype prints it on a banner and pre-fills it from the popup, so it is not a secret. Exposure is harmless because the *server* is what decides whether a code is honoured.

Bank details are public here because they are printed on the checkout page anyway. If that bothers you, move them behind the order confirmation instead.

### `POST /discount/validate`
`{"code": "mayra20"}` → `{"valid": true, "percent": 20}`. Case-insensitive, trimmed. Used for the inline checkout feedback. **This endpoint is convenience only** — `POST /orders` re-validates independently and never trusts that this was called.

### `POST /notify-me`
`{"productSlug": "...", "email": "..."}` → 204. Upserts into `notify_requests`. Backs the "Notify me when it's back" field on sold-out products. Returns 204 whether or not the row already existed, so it cannot be used to probe who has signed up.

---

## 4. `POST /orders` — the important one

### 4.1 Request

```jsonc
{
  "items": [
    { "productSlug": "p-heart-charm", "variantKey": "gold|18", "qty": 2 }
  ],
  "customer": {
    "name": "…", "email": "…", "phone": "…",
    "address": "…", "city": "…", "postalCode": "…", "note": "…"
  },
  "paymentMethod": "cod",          // "cod" | "bank" | "card"
  "discountCode": "MAYRA20"        // optional
}
```

**What is deliberately absent:** prices, line totals, subtotal, delivery, grand total, and every card field. If the client sent them, the server would have to decide whether to believe them, and the answer is always no — so it is cleaner that there is nowhere to put them.

`paymentMethod: "card"` carries no card data at all. See [PLAN.md §3.3](../PLAN.md).

### 4.2 The transaction

```python
@router.post("/orders", status_code=201)
def create_order(payload: OrderCreate, db: Session = Depends(get_db)):
    if not payload.items:
        raise HTTPException(400, "Your bag is empty.")

    # 1. Resolve and LOCK every variant, ordered by id to keep lock order
    #    consistent across concurrent requests (otherwise: deadlock).
    variants = (
        db.query(ProductVariant)
          .join(Product)
          .filter(tuple_(Product.slug, ProductVariant.variant_key).in_(keys))
          .order_by(ProductVariant.id)
          .with_for_update()
          .all()
    )

    # 2. Check availability, collecting ALL problems before failing.
    problems = []
    for line in payload.items:
        v = index.get((line.productSlug, line.variantKey))
        if v is None or not v.product.is_active:
            problems.append({"...": "unavailable"})
        elif v.stock < line.qty:
            problems.append({"...": "insufficient", "available": v.stock})
    if problems:
        raise HTTPException(409, detail={"problems": problems})   # 409, not 400

    # 3. Price from the database. Never from the request.
    priced = [price_line(v, line.qty) for v, line in resolved]

    # 4. Totals — pricing.compute_totals(), the single source of money truth
    totals = compute_totals(priced, payload.discountCode)

    # 5. Decrement, insert, commit
    for v, line in resolved:
        v.stock -= line.qty
    order = Order(order_number=next_order_number(db), **totals, ...)
    db.add(order); db.add_all(items); db.commit()

    # 6. Email — OUTSIDE the transaction. See §4.4.
    send_order_emails(order, items)
    return {"orderNumber": order.order_number, "total": order.total, ...}
```

Four details that are easy to get wrong:

- **`order_by(id)` before `with_for_update()`.** Two customers buying the same two products in opposite cart order will deadlock if lock order is not deterministic. Postgres will detect it and kill one transaction, and you will get a mystery 500 that never reproduces locally.
- **Collect all problems, then fail once.** Failing on the first bad line means the customer fixes it, resubmits, and discovers a second problem. Return them all so the cart page can mark every affected line at once.
- **409 Conflict, not 400.** 400 means "your request was malformed"; the request was fine, the world changed underneath it. The frontend distinguishes these: 409 → re-render the cart with per-line notices (prototype edge cases 12–13), 400 → a form error.
- **`payment_status` is derived server-side** from `payment_method`: `cod → pending`, `bank → awaiting_transfer`, `card → simulated`. The client does not get to propose it.

### 4.3 Money maths — `pricing.py`

One module, so there is exactly one place where money is calculated:

```python
def unit_price(product, option_values_for_variant) -> int:
    return product.base_price + sum(v.price_delta for v in option_values_for_variant)

def compute_totals(lines, discount_code):
    subtotal = sum(l.unit_price * l.qty for l in lines)
    percent  = settings.DISCOUNT_PERCENT if _code_ok(discount_code) else 0
    discount = round(subtotal * percent / 100)
    payable  = subtotal - discount
    delivery = 0 if payable >= settings.FREE_DELIVERY_THRESHOLD else settings.DELIVERY_FEE
    return dict(subtotal=subtotal, discount_amount=discount,
                delivery_fee=delivery, total=payable + delivery)

def _code_ok(code: str | None) -> bool:
    return bool(code) and code.strip().upper() == settings.DISCOUNT_CODE.upper()
```

This mirrors the prototype's `computeTotals()` exactly — including free delivery when the **post-discount** amount clears Rs 5,000, which is what the existing code does (`(subtotalRaw - discountRaw) < 5000`). Keep them in step: if you change the rule here, change `lib/pricing.ts` too, or the cart will show one number and the confirmation email another.

`round()` on the discount is the only rounding in the system, and it happens once, on the subtotal — not per line. Per-line rounding drifts by a rupee or two on multi-item carts.

### 4.4 Emails, and why they are outside the transaction

```python
db.commit()                       # order is now real, stock is decremented
try:
    send_customer_confirmation(order, items)
    customer_ok = True
except Exception as e:
    customer_ok = False; log.exception(...)
try:
    send_owner_notification(order, items)
    owner_ok = True
except Exception as e:
    owner_ok = False; log.exception(...)

order.email_status = "sent" if (customer_ok and owner_ok) else \
                     "failed" if not (customer_ok or owner_ok) else "partial"
db.commit()
```

An order that succeeded must never be rolled back because Brevo had a bad minute. The customer paid attention, filled a form, and committed — losing that to a mail timeout would be the worst possible failure. So the order commits first, email is best-effort, and the outcome is recorded on the row. The admin panel surfaces `email_status != 'sent'` with a **Resend** button ([plans/05 §6](05-admin-panel.md)).

Both sends are inline rather than backgrounded. On Vercel, `BackgroundTasks` runs after the response is flushed, at which point the function may already be frozen — the task silently never completes. Roughly 1–2 seconds of extra checkout latency is the correct price for emails that actually arrive.

Give the Brevo HTTP call a hard `timeout=8` so a hung provider cannot burn the whole function budget.

---

## 5. Admin API

All routes under `/api/admin`, all requiring a valid session, detailed in [plans/05](05-admin-panel.md). Summary:

| Method | Path | Does |
|---|---|---|
| `POST` | `/admin/login` | password → sets httpOnly session cookie |
| `POST` | `/admin/logout` | clears it |
| `GET` | `/admin/me` | `{ok: true}` — the frontend's auth probe |
| `GET` | `/admin/products` | all products, **including inactive** |
| `POST` | `/admin/products` | create |
| `PATCH` | `/admin/products/{id}` | edit fields / toggle active / toggle featured |
| `DELETE` | `/admin/products/{id}` | soft delete → `is_active = false` |
| `PUT` | `/admin/products/{id}/options` | replace the option set (rebuilds variant keys — §5.3 of plans/05) |
| `POST` | `/admin/products/{id}/images` | multipart upload → Supabase Storage |
| `DELETE` | `/admin/images/{id}` | delete row + the stored file |
| `PATCH` | `/admin/variants/{id}` | `{stock, sku}` — the most-used endpoint in the whole app |
| `POST` | `/admin/products/{id}/variants` | add a combination |
| `DELETE` | `/admin/variants/{id}` | mark a combination as never-made |
| `GET` | `/admin/orders` | list, filter by status, paginated |
| `GET` | `/admin/orders/{id}` | one order with items |
| `PATCH` | `/admin/orders/{id}` | `{status, payment_status}` |
| `POST` | `/admin/orders/{id}/resend-email` | retry a failed send |
| `GET` | `/admin/notify-requests` | who is waiting on restocks |
| `GET`/`PATCH` | `/admin/settings` | the `settings` table |

---

## 6. Security

**Admin authentication** (`security.py`):

```python
import hmac, jwt
from datetime import datetime, timedelta, timezone

def check_password(candidate: str) -> bool:
    return hmac.compare_digest(candidate.encode(), settings.ADMIN_PASSWORD.encode())
```

`compare_digest`, not `==`. A plain comparison returns early on the first differing byte, and the timing difference is measurable over a network — it lets an attacker recover the password one character at a time. It costs nothing to do correctly.

Token: HS256, claims `{"sub": "admin", "exp": now + ADMIN_SESSION_HOURS}`, signed with `ADMIN_JWT_SECRET`. Delivered as a cookie:

```python
response.set_cookie("admin_session", token,
    httponly=True,                                    # JavaScript cannot read it → XSS cannot steal it
    secure=(settings.APP_ENV == "production"),
    samesite="lax",                                   # blocks cross-site CSRF on state-changing requests
    max_age=settings.ADMIN_SESSION_HOURS * 3600,
    path="/")
```

`get_current_admin` is a FastAPI dependency that verifies the signature and expiry, raising 401 on failure. Every admin router is declared `dependencies=[Depends(get_current_admin)]` at **router level**, not per endpoint — so a new endpoint is protected by default, and forgetting a decorator cannot silently open a hole.

**Login brute-force.** Serverless makes in-memory rate limiting useless (each invocation may be a fresh container). Two cheap mitigations: a fixed `time.sleep(0.5)` on every failed attempt, and a password long enough that 2 attempts/second is irrelevant. Use a 20+ character passphrase. Do not reuse a password from anywhere else.

**Uploads** (`storage.py`): allow only `image/jpeg`, `image/png`, `image/webp`; cap at 5 MB; ignore the client-supplied filename entirely and generate `{product_id}/{uuid4}.{ext}`. A client filename of `../../../etc/passwd` is a real thing people try, and the cheapest defence is never using it.

**CORS**: `allow_origins=settings.origins`, `allow_credentials=True`. Never `allow_origins=["*"]` with credentials enabled — browsers reject that combination anyway, and reaching for `*` to make an error go away is how the cookie ends up readable cross-site.

**Never logged:** card fields (they do not exist server-side), `ADMIN_PASSWORD`, `SUPABASE_SERVICE_ROLE_KEY`, `BREVO_API_KEY`. Customer addresses appear in logs only at ERROR level with a stack trace.

---

## 7. Errors

Consistent envelope so the frontend has one thing to parse:

```json
{ "detail": "Enter a phone number we can reach you on" }
{ "detail": { "problems": [ { "productSlug": "…", "variantKey": "…",
                              "reason": "insufficient", "available": 1 } ] } }
```

| Code | Means | Frontend does |
|---|---|---|
| 400 | Malformed request | Inline field errors |
| 401 | Admin session missing/expired | Redirect to `/admin` login |
| 404 | Product gone | Fall back to `/shop` with a toast |
| 409 | Stock changed underneath the cart | Re-render cart with per-line notices |
| 422 | Pydantic validation | Map to fields |
| 500 | Unexpected | Generic apology + a WhatsApp link, so the sale is still recoverable |

In production, 500 responses must return a generic message. Never echo exception text to the browser — SQLAlchemy exceptions cheerfully include table names, column names, and sometimes parameter values.

---

## 8. Running it locally

```powershell
myenv\Scripts\activate
pip install -r backend\requirements.txt
uvicorn backend.app.main:app --reload --port 8000
```

Docs at `http://localhost:8000/docs`. Keep `/docs` and `/redoc` enabled in development and **disable them in production** (`docs_url=None` when `APP_ENV == "production"`) — the schema enumerates every admin endpoint, which is free reconnaissance for anyone who finds the API.
