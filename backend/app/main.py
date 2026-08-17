"""
FastAPI app entrypoint. Mounted on Vercel via api/index.py; run locally with
    uvicorn backend.app.main:app --reload --port 8000
See plans/03-backend-fastapi.md and plans/07-deployment-vercel.md.
"""
import logging

from fastapi import Depends, FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session
from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import settings
from .db import get_db
from .routers import admin, ai, orders, public

logging.basicConfig(level=logging.INFO)

# /docs and /redoc enumerate every route including admin ones — free
# reconnaissance for anyone who finds the API. Disabled in production.
app = FastAPI(
    title="Mayra Store API",
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None if settings.is_production else "/redoc",
    openapi_url=None if settings.is_production else "/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request, exc: StarletteHTTPException):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc: RequestValidationError):
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request, exc: Exception):
    # Never echo exception text to the browser — SQLAlchemy errors cheerfully
    # include table/column names. Full trace goes to the logs only.
    logging.getLogger("mayra.error").exception("Unhandled exception on %s", request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Something went wrong. Please try again or message us on WhatsApp."})


@app.get("/api/health")
def health(db: Session = Depends(get_db)):
    """Also what the daily Vercel cron pings to keep the free Supabase
    project from pausing after 7 days idle — plans/02 §7, plans/07 §6."""
    try:
        db.execute(text("select 1"))
        return {"ok": True, "db": True}
    except Exception:  # noqa: BLE001
        return {"ok": True, "db": False}


app.include_router(public.router)
app.include_router(orders.router)
app.include_router(admin.auth_router)
app.include_router(admin.router)
app.include_router(ai.router)
