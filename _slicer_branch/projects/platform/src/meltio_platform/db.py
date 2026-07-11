"""Database engine, session, and the declarative base.

The engine is built lazily (and cached) so importing this module never connects
to Postgres — tests override :func:`get_db` with a SQLite session and never
touch the real engine.
"""

from __future__ import annotations

from collections.abc import Iterator
from functools import lru_cache

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import get_settings


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""


@lru_cache
def get_engine() -> Engine:
    return create_engine(get_settings().database_url, pool_pre_ping=True, future=True)


@lru_cache
def _get_sessionmaker() -> sessionmaker[Session]:
    return sessionmaker(
        bind=get_engine(), autoflush=False, expire_on_commit=False, future=True
    )


def get_db() -> Iterator[Session]:
    """FastAPI dependency yielding a request-scoped session."""
    session = _get_sessionmaker()()
    try:
        yield session
    finally:
        session.close()
