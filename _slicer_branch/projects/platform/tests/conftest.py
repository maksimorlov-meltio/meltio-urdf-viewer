"""Test fixtures: an app backed by an in-memory SQLite DB.

Tests never touch Postgres — ``get_db`` is overridden with a SQLite session and
tables are created from the ORM metadata, so CI needs no database service.
"""

from __future__ import annotations

import os
import tempfile

# Point the slicer profile store at a throwaway dir before the app is imported.
os.environ.setdefault(
    "PLATFORM_PROFILES_DIR", tempfile.mkdtemp(prefix="meltio_profiles_")
)

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import io as _io

from meltio_platform import models, permissions, storage  # noqa: F401 - register tables
from meltio_platform.db import Base, get_db
from meltio_platform.web.app import create_app


@pytest.fixture(autouse=True)
def _stub_storage(monkeypatch):
    """In-memory object store so upload/download tests need no S3/MinIO."""
    blobs: dict[str, bytes] = {}
    monkeypatch.setattr(
        storage, "put_fileobj", lambda k, f, ct="x": blobs.__setitem__(k, f.read())
    )
    monkeypatch.setattr(
        storage,
        "get_object",
        lambda k: (_io.BytesIO(blobs.get(k, b"")), "application/octet-stream", len(blobs.get(k, b""))),
    )
    monkeypatch.setattr(storage, "delete_object", lambda k: blobs.pop(k, None))
    monkeypatch.setattr(storage, "ensure_bucket", lambda: None)
    yield


@pytest.fixture(autouse=True)
def _reset_permission_overrides() -> Iterator[None]:
    """Role-capability overrides are module-level in-memory state; reset them
    around every test so an edit in one test can't leak into the next."""
    permissions.set_overrides({})
    yield
    permissions.set_overrides({})


@pytest.fixture
def client() -> Iterator[TestClient]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    testing_session = sessionmaker(
        bind=engine, autoflush=False, expire_on_commit=False, future=True
    )

    def override_get_db() -> Iterator[Session]:
        session = testing_session()
        try:
            yield session
        finally:
            session.close()

    app = create_app()
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def session() -> Iterator[Session]:
    """A standalone DB session for unit-testing helpers (no HTTP layer)."""
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    maker = sessionmaker(
        bind=engine, autoflush=False, expire_on_commit=False, future=True
    )
    db = maker()
    try:
        yield db
    finally:
        db.close()
