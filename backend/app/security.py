"""
Admin authentication. One password, one HS256 session token, one httpOnly
cookie. See plans/03-backend-fastapi.md §6 and plans/05-admin-panel.md §2.
"""
import hmac
import time
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Cookie, HTTPException, Response, status

from .config import settings

COOKIE_NAME = "admin_session"
_ALGO = "HS256"


def check_password(candidate: str) -> bool:
    """Constant-time comparison — `==` returns early on the first differing
    byte, and that timing difference is measurable over a network."""
    ok = hmac.compare_digest(candidate.encode("utf-8"), settings.ADMIN_PASSWORD.encode("utf-8"))
    if not ok:
        # Serverless makes in-memory rate limiting useless (fresh container
        # per invocation). A fixed delay on failure plus a long passphrase
        # is the cheap mitigation available here.
        time.sleep(0.5)
    return ok


def issue_token() -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": "admin",
        "iat": now,
        "exp": now + timedelta(hours=settings.ADMIN_SESSION_HOURS),
    }
    return jwt.encode(payload, settings.ADMIN_JWT_SECRET, algorithm=_ALGO)


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        COOKIE_NAME,
        token,
        httponly=True,
        secure=settings.is_production,
        samesite="lax",
        max_age=settings.ADMIN_SESSION_HOURS * 3600,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(COOKIE_NAME, path="/")


def get_current_admin(admin_session: str | None = Cookie(default=None)) -> str:
    """FastAPI dependency. Mount at ROUTER level on every admin router so a
    newly added endpoint is protected by default rather than by remembering
    to add a decorator."""
    if not admin_session:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect password.")
    try:
        payload = jwt.decode(admin_session, settings.ADMIN_JWT_SECRET, algorithms=[_ALGO])
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect password.")
    return payload.get("sub", "admin")
