"""
The provider boundary — one function, "generate structured JSON from this
context." Swapping providers (e.g. to Claude Haiku, see plans/09 §10) means
adding a branch here, nowhere else. Deliberately not using the claude-api
tooling conventions in this repo's own dev environment — Gemini here is a
user-chosen, non-Anthropic path, picked for its free tier.
"""
import base64
import json

import httpx
from fastapi import HTTPException, status

from ..config import settings
from .schema import AGENT_TURN_RESPONSE_SCHEMA

GEMINI_TIMEOUT = 26.0  # seconds — vercel.json caps the function at 30; a
# real delegation turn (asking Gemini to apply several defaults in one
# response) was observed taking a little over 20s, so a tighter client-side
# timeout was cutting off requests that Vercel's own limit would have let
# finish. 26s leaves a few seconds of headroom for the surrounding request
# handling, not more.


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
        },
    }

    try:
        async with httpx.AsyncClient(timeout=GEMINI_TIMEOUT) as client:
            r = await client.post(url, params={"key": settings.GEMINI_API_KEY}, json=body)
    except httpx.TimeoutException:
        raise ProviderError("The AI took too long to respond.")
    except httpx.HTTPError as e:
        raise ProviderError(f"Could not reach the AI provider: {e}")

    if r.status_code == 429:
        raise ProviderError("rate_limited")
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
    return HTTPException(status.HTTP_502_BAD_GATEWAY, f"AI assist isn't available right now — fill in the form manually. ({err})")
