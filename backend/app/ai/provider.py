"""
The provider boundary — one function, "generate structured JSON from this
context." Swapping providers (e.g. to Claude Haiku, see plans/09 §10) means
adding a branch here, nowhere else. Deliberately not using the claude-api
tooling conventions in this repo's own dev environment — Gemini here is a
user-chosen, non-Anthropic path, picked for its free tier.
"""
import asyncio
import base64
import json

import httpx
from fastapi import HTTPException, status

from ..config import settings
from .schema import AGENT_TURN_RESPONSE_SCHEMA

# gemini-3.6-flash (tried first) was empirically slow and occasionally
# overloaded on this account: five real calls came back in 22-52s, one a 503
# "high demand". gemini-2.5-flash 404s as "no longer available to new
# users". gemini-flash-lite-latest — an alias that tracks Google's current
# best lite model, so it shouldn't need re-verifying every time their
# lineup shifts — replied in 4-6s across every real test, same output
# quality, so that's what's actually configured (see .env AI_MODEL). This
# timeout still carries real margin over that, not a tight fit.
GEMINI_TIMEOUT = 25.0

# Harmless on gemini-flash-lite-latest (confirmed: 200 OK, same ~5s
# latency) — lite tiers generally don't do extended thinking regardless of
# this setting. Kept so a future model swap that DOES support thinking
# doesn't silently burn a few hundred extra tokens per call by default.
THINKING_BUDGET = 512

# "This model is currently experiencing high demand... usually temporary" is
# Google's own wording for this — worth exactly one automatic retry before
# giving up and telling the admin to try again manually.
RETRY_ON_STATUS = {503}
RETRY_DELAY_SECONDS = 2.0


class ProviderError(Exception):
    """Raised on anything that means "the AI step failed" — caught by the
    router and turned into a client-facing degrade-to-manual-form response,
    never a raw 500. See plans/09 §11."""


async def generate_turn(
    system_instruction: str,
    contents: list[dict],
) -> dict:
    """contents is the Gemini `contents` array — a list of
    {"role": "user"|"model", "parts": [...]} turns. Returns the parsed JSON
    dict (not yet Pydantic-validated — the caller does that)."""
    if not settings.AI_ENABLED:
        raise ProviderError("AI assist is turned off.")
    if settings.AI_PROVIDER != "gemini":
        raise ProviderError(f"Unknown AI_PROVIDER: {settings.AI_PROVIDER!r}")
    if not settings.GEMINI_API_KEY:
        raise ProviderError("GEMINI_API_KEY is not set.")

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.AI_MODEL}:generateContent"
    body = {
        "systemInstruction": {"parts": [{"text": system_instruction}]},
        "contents": contents,
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": AGENT_TURN_RESPONSE_SCHEMA,
            "thinkingConfig": {"thinkingBudget": THINKING_BUDGET},
        },
    }

    try:
        async with httpx.AsyncClient(timeout=GEMINI_TIMEOUT) as client:
            r = await client.post(url, params={"key": settings.GEMINI_API_KEY}, json=body)
            if r.status_code in RETRY_ON_STATUS:
                await asyncio.sleep(RETRY_DELAY_SECONDS)
                r = await client.post(url, params={"key": settings.GEMINI_API_KEY}, json=body)
    except httpx.TimeoutException:
        raise ProviderError("The AI took too long to respond.")
    except httpx.HTTPError as e:
        raise ProviderError(f"Could not reach the AI provider: {e}")

    if r.status_code == 429:
        raise ProviderError("rate_limited")
    if r.status_code == 503:
        raise ProviderError("overloaded")
    if r.status_code != 200:
        raise ProviderError(f"AI provider returned {r.status_code}: {r.text[:300]}")

    try:
        payload = r.json()
        candidates = payload.get("candidates") or []
        if not candidates:
            # A prompt/safety block looks like this — no candidates, a
            # promptFeedback block instead. Treat it the same as any other
            # provider failure: degrade to the manual form.
            raise ProviderError(f"AI returned no candidates: {payload.get('promptFeedback')}")
        text = candidates[0]["content"]["parts"][0]["text"]
        return json.loads(text)
    except (KeyError, IndexError, ValueError) as e:
        raise ProviderError(f"Could not parse the AI response: {e}")


def image_part(image_bytes: bytes, mime_type: str) -> dict:
    return {"inlineData": {"mimeType": mime_type, "data": base64.b64encode(image_bytes).decode("ascii")}}


def text_part(text: str) -> dict:
    return {"text": text}


def to_http_exception(err: ProviderError) -> HTTPException:
    if str(err) == "rate_limited":
        return HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS, "AI assist is rate-limited right now — try again in a minute, or fill in the form manually."
        )
    if str(err) == "overloaded":
        return HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "The AI provider is at capacity right now (already retried once) — try again shortly, or fill in the form manually.",
        )
    return HTTPException(status.HTTP_502_BAD_GATEWAY, f"AI assist isn't available right now — fill in the form manually. ({err})")
