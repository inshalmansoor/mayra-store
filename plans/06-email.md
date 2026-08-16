# 06 — Email (Brevo)

Two emails per order: one to the customer, one to the owner. You called these important; they are also the part most likely to fail silently, so this document is mostly about failure.

---

## 1. Why Brevo

You have no domain — the site will live on `something.vercel.app`. That single fact decides the provider.

| Provider | Free tier | Without a domain |
|---|---|---|
| **Brevo** | 300/day | ✅ Verify a **single sender address** (a plain Gmail works). Sends to anyone. |
| Resend | 3,000/month | ❌ Without a verified domain you may only send to your own account address. Every customer confirmation would silently not arrive. |
| SendGrid | trial only for new accounts | ❌ Unreliable to depend on |
| Mailgun | sandbox | ❌ Sandbox delivers only to pre-authorised recipients |
| Gmail SMTP | 500/day | ⚠️ Works, but SMTP handshakes are slow from serverless, app passwords keep getting restricted, and deliverability is worse |

Brevo, sending over its HTTP API rather than SMTP — one HTTPS POST, no connection setup, which is what you want inside a function with a time budget.

300/day is roughly 150 orders/day. Not a constraint you will meet.

---

## 2. Setup — do this on day one

It involves waiting for an email, so it is the worst possible thing to leave until the night before.

1. [app.brevo.com](https://app.brevo.com) → free account.
2. **Senders, Domains & Dedicated IPs → Senders → Add a sender.**
   Name `Mayra Store`, email — your Gmail or the shop's address.
3. Brevo emails that address a confirmation link. **Click it.** Until you do, every API call fails with a sender error.
4. **SMTP & API → API Keys → Generate a new API key (v3).** Copy it into `BREVO_API_KEY`.
5. Put the verified address in `MAIL_FROM_EMAIL` and the owner's inbox in `OWNER_EMAIL`. They can be the same address; the owner then gets a copy of every order at the sending address.
6. Verify end to end before building anything else:

```powershell
curl -X POST https://api.brevo.com/v3/smtp/email `
  -H "api-key: YOUR_KEY" -H "content-type: application/json" `
  -d '{\"sender\":{\"email\":\"verified@gmail.com\",\"name\":\"Mayra Store\"},\"to\":[{\"email\":\"you@gmail.com\"}],\"subject\":\"test\",\"htmlContent\":\"<p>works</p>\"}'
```

A `201` with a `messageId` means you are done. Check the spam folder — first sends from a new sender often land there.

---

## 3. The client

`backend/app/email/sender.py`:

```python
import httpx
from ..config import settings

BREVO_URL = "https://api.brevo.com/v3/smtp/email"

def send_email(to_email: str, to_name: str, subject: str,
               html: str, reply_to: str | None = None) -> str:
    payload = {
        "sender": {"email": settings.MAIL_FROM_EMAIL, "name": settings.MAIL_FROM_NAME},
        "to": [{"email": to_email, "name": to_name}],
        "subject": subject,
        "htmlContent": html,
    }
    if reply_to:
        payload["replyTo"] = {"email": reply_to}

    r = httpx.post(BREVO_URL, json=payload,
                   headers={"api-key": settings.BREVO_API_KEY,
                            "content-type": "application/json"},
                   timeout=8.0)                       # hard cap — see §6
    r.raise_for_status()
    return r.json().get("messageId", "")
```

`timeout=8.0` is deliberate. Without it, a hung provider holds the function open until Vercel kills it, and the customer stares at a spinner on a checkout that already succeeded.

`replyTo` on the owner's email is set to the **customer's** address, so the owner can hit Reply and be talking to the buyer. Small thing, genuinely useful.

---

## 4. Email 1 — customer confirmation

**To:** the customer · **Subject:** `Your Mayra Store order MYR-1042` · **Reply-To:** `OWNER_EMAIL`

Contents, in order:

1. `MAYRA` wordmark, letter-spaced, on the cream ground — the site's palette carries over
2. *"Thank you, {first name} — we've got your order."*
3. Order number and date
4. Itemised table: thumbnail, name, selection label (`Gold · 18"`), qty, line total
5. Subtotal · discount (only when one applied) · delivery · **total**
6. Delivery address as entered, so mistakes are catchable while there is still time
7. **Payment block, which varies by method:**
   - `cod` — *"Pay in cash when your order arrives."*
   - `bank` — the account details from `.env`, plus *"Send the receipt on WhatsApp and we'll confirm."*
   - `card` — *"This is a demonstration store. No card was charged and no card details were stored."*
8. WhatsApp button → `wa.me/923113136446` pre-filled with *"Hi Mayra! About my order MYR-1042…"*
9. Footer: Instagram link, store name

Point 7's card case matters. The customer just typed something card-shaped into a form; the confirmation is the right moment to be unambiguous that nothing was charged. It costs one line and prevents the worst possible misunderstanding.

---

## 5. Email 2 — owner notification

**To:** `OWNER_EMAIL` · **Subject:** `New order MYR-1042 — Rs 4,800 — {customer name}` · **Reply-To:** the customer

The subject line is designed to be actionable from a phone lock screen: number, value, who. No greeting, no branding, no marketing polish — this is an internal work order.

1. **Order number, total, payment method** — large, at the top
2. **Customer:** name, phone as a `tel:` link, email, full address, city, postal code
3. **Order note**, if any
4. **Items with SKUs** — SKUs matter here and nowhere else; it is what the owner picks from
5. **Stock warning:** *"⚠ Heart Charm Necklace (Gold · 18") is down to 2 after this order."* for anything at or below `LOW_STOCK_AT`
6. **Payment action:** for `bank`, *"Mark as paid in the admin panel once the transfer lands."*
7. Links: **Open in admin** → `/admin/orders/{id}` · **WhatsApp the customer** → `wa.me/{their number}`

---

## 6. Failure handling

Order and email are deliberately decoupled ([plans/03 §4.4](03-backend-fastapi.md)):

```
commit order + stock decrement      ← must succeed
      ↓
try: customer email                 ← may fail
try: owner email                    ← may fail
      ↓
orders.email_status = sent | partial | failed
orders.email_error  = the message, truncated
```

Rationale: a customer who filled in a form and committed to a purchase must not lose that order because a third-party API had a bad thirty seconds. Losing an order is unrecoverable; a missing email is recoverable — the order is in the database and the admin panel says so.

Recovery paths:

- The dashboard shows a red count of orders with `email_status != 'sent'` ([plans/05 §4](05-admin-panel.md))
- Order detail has **Resend email** → `POST /api/admin/orders/{id}/resend-email`
- Failing everything, the order detail has the customer's WhatsApp link

The confirmation **page** never depends on the email. It renders the full order summary itself, so a customer whose email failed still has their order number on screen.

---

## 7. Writing HTML email

Email clients render like it is 2003. Rules that are not optional:

- **Tables for layout.** No flexbox, no grid, no CSS `position`. Gmail strips them.
- **Inline styles.** No `<style>` block, no classes — Gmail discards `<head>` styles.
- **Max width 600 px**, centred in an outer 100 % table.
- **Absolute image URLs.** Product thumbnails point at Supabase Storage or Unsplash; relative paths render as broken images everywhere.
- **No web fonts.** Fall back to `Georgia, serif` for the body and a system sans for labels. Playfair will not load; do not build a layout that needs it.
- **Buttons are padded `<a>` tags with a background colour**, not `<button>`.
- **Test in Gmail on a phone.** That is where these will actually be read.

Templates live in `backend/app/email/templates/` and render with Jinja2. A shared `_layout.html` holds the outer table, header and footer; both emails extend it. Use `{{ … | e }}` on every customer-supplied value — a name containing `<` will otherwise mangle the email, and HTML injection into an email you send to yourself is still HTML injection.

---

## 8. Email checklist

- [ ] Sender address verified in Brevo — confirmation link clicked
- [ ] `curl` test returns 201
- [ ] Test order → customer email arrives within a minute
- [ ] Test order → owner email arrives, subject shows number, total and name
- [ ] Owner email's Reply goes to the customer's address
- [ ] Card order's email states plainly that no card was charged
- [ ] Bank order's email shows the account details from `.env`
- [ ] COD order's email says pay on delivery
- [ ] Product thumbnails render in Gmail (not broken images)
- [ ] Legible on a phone at 360 px
- [ ] Low-stock warning appears when the order drops something to ≤ 3
- [ ] Breaking `BREVO_API_KEY` on purpose → order still saves, `email_status = failed`, dashboard flags it
- [ ] **Resend email** on that order works after the key is restored
