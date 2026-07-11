"""Tests for the direct-to-S3 upload endpoints."""

from __future__ import annotations

from fastapi.testclient import TestClient

from avisualizer.web.app import create_app


def _client() -> TestClient:
    return TestClient(create_app(include_urdf=False))


def test_presign_disabled_without_bucket(monkeypatch) -> None:
    # No AV_S3_BUCKET configured -> direct uploads are unavailable (503), so the
    # frontend falls back to the legacy multipart upload.
    monkeypatch.delenv("AV_S3_BUCKET", raising=False)
    res = _client().post("/api/uploads/presign", json={"filename": "Sensors.csv"})
    assert res.status_code == 503


def test_upload_requires_a_source() -> None:
    # Neither a file nor an s3_key -> 400 (rather than a server error).
    res = _client().post("/api/sensors/upload", data={"dataset_label": "x"})
    assert res.status_code == 400
