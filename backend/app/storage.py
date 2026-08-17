"""
Supabase Storage — upload/delete product images over the REST API using the
service_role key. See plans/03-backend-fastapi.md §6 (uploads) and
plans/05-admin-panel.md §5.2.
"""
import uuid

import httpx
from fastapi import HTTPException, UploadFile

from .config import settings

ALLOWED_CONTENT_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}
MAX_BYTES = 5 * 1024 * 1024  # 5 MB


def _object_url(path: str) -> str:
    return f"{settings.SUPABASE_URL}/storage/v1/object/public/{settings.SUPABASE_STORAGE_BUCKET}/{path}"


async def upload_product_image(product_id: str, file: UploadFile) -> tuple[str, str]:
    """Returns (public_url, storage_path). Filename is generated server-side
    and never taken from the client — a client-supplied filename like
    '../../../etc/passwd' is a real thing people try."""
    ext = ALLOWED_CONTENT_TYPES.get(file.content_type or "")
    if not ext:
        raise HTTPException(400, "Only JPEG, PNG or WEBP images are allowed.")

    body = await file.read()
    if len(body) > MAX_BYTES:
        raise HTTPException(400, "Image must be 5MB or smaller.")

    path = f"{product_id}/{uuid.uuid4()}.{ext}"
    upload_url = f"{settings.SUPABASE_URL}/storage/v1/object/{settings.SUPABASE_STORAGE_BUCKET}/{path}"

    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.post(
            upload_url,
            content=body,
            headers={
                "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
                "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
                "Content-Type": file.content_type,
                "x-upsert": "false",
                # The path is {product_id}/{uuid4}.{ext} — a fresh UUID every
                # upload, so the bytes at a given URL can never change.
                # Replacing a photo produces a new URL, not a mutation of
                # this one. That's exactly the condition "immutable" is for.
                #
                # Must be the full Cache-Control syntax, not a bare seconds
                # count — Supabase stores whatever string it's given and
                # serves it back verbatim; a bare number like "31536000" is
                # stored as-is but isn't a valid Cache-Control value, so it
                # gets served as "no-cache" instead. Confirmed empirically
                # against this project on 2026-08-17.
                "cache-control": "public, max-age=31536000, immutable",
            },
        )
    if r.status_code not in (200, 201):
        raise HTTPException(502, f"Image upload failed: {r.text[:200]}")

    return _object_url(path), path


async def delete_product_image(storage_path: str | None) -> None:
    """No-op for seed-data images (external Unsplash URLs, storage_path is
    null) — nothing to clean up there."""
    if not storage_path:
        return
    delete_url = f"{settings.SUPABASE_URL}/storage/v1/object/{settings.SUPABASE_STORAGE_BUCKET}/{storage_path}"
    async with httpx.AsyncClient(timeout=10.0) as client:
        await client.delete(
            delete_url,
            headers={
                "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
                "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
            },
        )
