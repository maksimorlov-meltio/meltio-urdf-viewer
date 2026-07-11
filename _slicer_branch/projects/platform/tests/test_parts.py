"""Parts + STL file management, including tenant isolation.

Storage is stubbed so tests need no MinIO/S3: uploads land in an in-memory dict
and downloads read back from it.
"""

from __future__ import annotations

import io

import pytest

from meltio_platform import storage
from meltio_platform.auth import ACCESS_EMAIL_HEADER

ALICE = {ACCESS_EMAIL_HEADER: "alice@meltio3d.com"}
OTHER_ORG = {ACCESS_EMAIL_HEADER: "zoe@acme.com"}


@pytest.fixture(autouse=True)
def _fake_storage(monkeypatch):
    blobs: dict[str, bytes] = {}

    def put_fileobj(key, fileobj, content_type="application/octet-stream"):
        blobs[key] = fileobj.read()

    def get_object(key):
        data = blobs[key]
        return io.BytesIO(data), "application/octet-stream", len(data)

    monkeypatch.setattr(storage, "put_fileobj", put_fileobj)
    monkeypatch.setattr(storage, "get_object", get_object)
    monkeypatch.setattr(storage, "delete_object", lambda key: blobs.pop(key, None))
    return blobs


def _upload(client, headers, name="Bracket", content=b"solid x\nendsolid x\n"):
    return client.post(
        "/api/parts",
        data={"name": name},
        files={"file": ("bracket.stl", content, "application/octet-stream")},
        headers=headers,
    )


def test_upload_requires_auth(client):
    assert _upload(client, {}).status_code == 401


def test_create_and_list_part(client, _fake_storage):
    me = client.get("/api/me", headers=ALICE).json()
    created = _upload(client, ALICE)
    assert created.status_code == 201
    body = created.json()
    assert body["name"] == "Bracket"
    assert body["stlCount"] == 1
    assert body["latestFile"]["filename"] == "bracket.stl"

    # Stored under the part's folder prefix.
    key = next(iter(_fake_storage))
    assert key.startswith(f"orgs/{me['org']['id']}/parts/{body['id']}/stl/")

    listing = client.get("/api/parts", headers=ALICE).json()
    assert [p["id"] for p in listing["parts"]] == [body["id"]]


def test_download_streams_bytes(client):
    content = b"solid cube\nendsolid cube\n"
    part = _upload(client, ALICE, content=content).json()
    resp = client.get(f"/api/parts/{part['id']}/file", headers=ALICE)
    assert resp.status_code == 200
    assert resp.content == content
    assert "bracket.stl" in resp.headers["content-disposition"]


def test_tenant_isolation(client):
    part = _upload(client, ALICE).json()
    assert client.get("/api/parts", headers=OTHER_ORG).json()["parts"] == []
    assert client.get(f"/api/parts/{part['id']}", headers=OTHER_ORG).status_code == 404
    assert client.get(f"/api/parts/{part['id']}/file", headers=OTHER_ORG).status_code == 404


def test_delete_part(client, _fake_storage):
    part = _upload(client, ALICE).json()
    assert client.delete(f"/api/parts/{part['id']}", headers=ALICE).status_code == 200
    assert client.get("/api/parts", headers=ALICE).json()["parts"] == []
    assert _fake_storage == {}  # blob removed too
