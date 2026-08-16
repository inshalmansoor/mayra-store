"""
SQLAlchemy engine tuned for serverless + Supavisor's transaction pooler.
See plans/02-database.md §5 for why each non-default argument is here.
"""
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import NullPool

from .config import settings

_connect_args = {}
if "psycopg" in settings.DATABASE_URL:
    # Supavisor's transaction-mode pooler multiplexes different clients onto
    # the same backend connection between statements. A server-side prepared
    # statement can vanish underneath psycopg between calls, producing an
    # intermittent "prepared statement ... does not exist" under load.
    _connect_args["prepare_threshold"] = None

engine = create_engine(
    settings.DATABASE_URL,
    poolclass=NullPool,  # one connection per request; Supavisor pools upstream
    connect_args=_connect_args,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
