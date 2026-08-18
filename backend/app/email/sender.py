"""
Brevo HTTP API client + the two order emails. See plans/06-email.md.

Order and email are deliberately decoupled (plans/03 §4.4): an order that
already committed must never be undone because a mail provider had a bad
thirty seconds. Both sends are best-effort; failures are recorded on the
order row (email_status/email_error) and are recoverable from the admin
panel's Resend button.
"""
import logging
from pathlib import Path

import httpx
from jinja2 import Environment, FileSystemLoader, select_autoescape
from sqlalchemy.orm import Session

from ..config import settings
from ..models import Order, Setting

log = logging.getLogger("mayra.email")

BREVO_URL = "https://api.brevo.com/v3/smtp/email"

_env = Environment(
    loader=FileSystemLoader(str(Path(__file__).parent / "templates")),
    autoescape=select_autoescape(["html"]),
)


def _fmt(n: int) -> str:
    return f"Rs {n:,}"


def send_email(to_email: str, to_name: str, subject: str, html: str, reply_to: str | None = None) -> str:
    payload = {
        "sender": {"email": settings.MAIL_FROM_EMAIL, "name": settings.MAIL_FROM_NAME},
        "to": [{"email": to_email, "name": to_name}],
        "subject": subject,
        "htmlContent": html,
    }
    if reply_to:
        payload["replyTo"] = {"email": reply_to}

    r = httpx.post(
        BREVO_URL,
        json=payload,
        headers={"api-key": settings.BREVO_API_KEY, "content-type": "application/json"},
        timeout=8.0,  # hard cap — a hung provider must not burn the whole function budget
    )
    r.raise_for_status()
    return r.json().get("messageId", "")


def _setting(db: Session, key: str, default: str = "") -> str:
    row = db.query(Setting).filter(Setting.key == key).first()
    return row.value if row else default


def _order_context(db: Session, order: Order) -> dict:
    return {
        "order": order,
        "fmt": _fmt,
        "store_name": settings.STORE_NAME,
        "whatsapp_number": _setting(db, "whatsapp_number", ""),
        "instagram_url": settings.INSTAGRAM_URL,
        "bank": {
            "name": _setting(db, "bank_name", ""),
            "account_title": _setting(db, "bank_account_title", ""),
            "account_number": _setting(db, "bank_account_number", ""),
            "iban": _setting(db, "bank_iban", ""),
        },
        "low_stock_at": settings.LOW_STOCK_AT,
        "admin_url": "/admin/orders",
    }


def send_customer_confirmation(db: Session, order: Order) -> str:
    tpl = _env.get_template("customer_confirmation.html")
    html = tpl.render(**_order_context(db, order))
    first_name = order.customer_name.split(" ")[0]
    return send_email(
        to_email=order.customer_email,
        to_name=order.customer_name,
        subject=f"Your {settings.STORE_NAME} order {order.order_number}",
        html=html,
        reply_to=settings.OWNER_EMAIL,
    )


def send_owner_notification(db: Session, order: Order, low_stock_lines: list[str]) -> str:
    tpl = _env.get_template("owner_notification.html")
    ctx = _order_context(db, order)
    ctx["low_stock_lines"] = low_stock_lines
    html = tpl.render(**ctx)
    return send_email(
        to_email=settings.OWNER_EMAIL,
        to_name=settings.OWNER_NAME,
        subject=f"New order {order.order_number} — {_fmt(order.total)} — {order.customer_name}",
        html=html,
        reply_to=order.customer_email,
    )


def send_order_emails(db: Session, order: Order, low_stock_lines: list[str]) -> tuple[str, str | None]:
    """Returns (email_status, email_error). Never raises — callers commit the
    order first and call this after, recording whatever happens here."""
    customer_ok = owner_ok = False
    errors: list[str] = []

    try:
        send_customer_confirmation(db, order)
        customer_ok = True
    except Exception as e:  # noqa: BLE001
        log.exception("customer confirmation email failed for %s", order.order_number)
        errors.append(f"customer: {e}")

    try:
        send_owner_notification(db, order, low_stock_lines)
        owner_ok = True
    except Exception as e:  # noqa: BLE001
        log.exception("owner notification email failed for %s", order.order_number)
        errors.append(f"owner: {e}")

    if customer_ok and owner_ok:
        return "sent", None
    if not customer_ok and not owner_ok:
        return "failed", " | ".join(errors)[:2000]
    return "partial", " | ".join(errors)[:2000]
