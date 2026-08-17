"""
AI product agent endpoints — plans/09 Part A. Everything here is a pure
function: context in, a validated draft out. Nothing here writes to the
database except two read-only lookups (slug dedup, collections) — real
persistence goes through the existing product/option/variant/image
endpoints once the owner reviews and saves. See plans/09 §2.
"""
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session
import httpx

from ..ai.agent import (
    dedupe_sku,
    dedupe_slug,
    existing_collections,
    run_first_turn,
    run_next_turn,
    run_regenerate_copy,
    validate_draft_constraints,
)
from ..ai.models import AgentTurnOut, ContinueTurnIn
from ..ai.provider import ProviderError, to_http_exception
from ..config import settings
from ..db import get_db
from ..models import Product
from ..security import get_current_admin

router = APIRouter(prefix="/api/admin/ai", tags=["admin-ai"], dependencies=[Depends(get_current_admin)])

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_IMAGE_BYTES = 5 * 1024 * 1024


def _require_ai_enabled():
    if not settings.AI_ENABLED:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "AI assist isn't turned on for this store — use the manual form instead.",
        )


def _finalize(db: Session, out: AgentTurnOut) -> AgentTurnOut:
    """Shared post-processing every turn goes through: slug + SKU dedup
    (§5) and whole-turn rejection on constraint violations (§11). Runs on
    every turn, not just the last one — the draft's SKUs can change turn to
    turn (e.g. the owner answering "3 sizes" adds new variantPlan entries),
    so re-checking each time keeps whatever the owner is looking at always
    valid to save, not just the final version."""
    problems = validate_draft_constraints(db, out.draft)
    if problems:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "The AI's response didn't pass validation (" + "; ".join(problems) + ") — please try again.",
        )
    if out.draft.slug or out.draft.name:
        out.draft.slug = dedupe_slug(db, out.draft.slug, out.draft.name)

    # product_variants.sku is unique across the WHOLE catalogue, not just
    # this product — the agent has no way to know every SKU that already
    # exists. Dedupe the product-level SKU first so it's in `taken` before
    # any variant falls back to it (mirrors the fallback order save() uses
    # on the frontend: entry.sku || draft.sku).
    taken: set[str] = set()
    if out.draft.sku:
        out.draft.sku = dedupe_sku(db, out.draft.sku, taken)
    for entry in out.draft.variant_plan:
        if entry.state == "made":
            entry.sku = dedupe_sku(db, entry.sku or out.draft.sku, taken)
    return out


@router.post("/draft-product/start", response_model=AgentTurnOut)
async def start_draft(
    description: str = Form(""),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    _require_ai_enabled()
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only JPEG, PNG or WEBP images are allowed.")
    body = await file.read()
    if len(body) > MAX_IMAGE_BYTES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Image must be 5MB or smaller.")

    try:
        out = await run_first_turn(db, description, body, file.content_type)
    except ProviderError as e:
        raise to_http_exception(e)
    return _finalize(db, out)


@router.post("/draft-product/continue", response_model=AgentTurnOut)
async def continue_draft(payload: ContinueTurnIn, db: Session = Depends(get_db)):
    _require_ai_enabled()
    try:
        out = await run_next_turn(
            db,
            visual_facts=payload.visual_facts,
            draft=payload.draft.model_dump(by_alias=True),
            pending_questions=[q.model_dump(by_alias=True) for q in payload.pending_questions],
            answer=payload.answer,
            turn_count=payload.turn_count,
            max_turns=settings.AI_MAX_TURNS,
        )
    except ProviderError as e:
        raise to_http_exception(e)
    return _finalize(db, out)


@router.post("/regenerate-copy/{product_id}", response_model=AgentTurnOut)
async def regenerate_copy(product_id: str, db: Session = Depends(get_db)):
    _require_ai_enabled()
    try:
        pid = uuid.UUID(product_id)
    except ValueError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid id.")
    product = db.query(Product).filter(Product.id == pid).first()
    if not product:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found.")

    image_bytes: bytes | None = None
    mime_type = "image/jpeg"
    default_images = [i for i in product.images if i.colour_key == "default"] or list(product.images)
    if default_images:
        cover = sorted(default_images, key=lambda i: i.position)[0]
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.get(cover.url)
            if r.status_code == 200:
                image_bytes = r.content
                mime_type = r.headers.get("content-type", "image/jpeg").split(";")[0]
        except httpx.HTTPError:
            image_bytes = None  # fall through — copy suggestions from text context alone

    try:
        out = await run_regenerate_copy(product, image_bytes, mime_type)
    except ProviderError as e:
        raise to_http_exception(e)
    return out


@router.get("/collections")
def list_collections(db: Session = Depends(get_db)):
    """Grounding data for the agent's collection dropdown (§7) — also handy
    standalone for the admin UI's collection picker."""
    return existing_collections(db)


@router.get("/status")
def ai_status():
    """So the admin UI can offer (or hide) the AI option without a failed
    request — the manual form is always the fallback either way."""
    return {"enabled": settings.AI_ENABLED}
