"""Projects (folders): CRUD, part membership/filtering, tenant isolation."""

from __future__ import annotations

import io

import pytest

from meltio_platform import storage
from meltio_platform.auth import ACCESS_EMAIL_HEADER

ALICE = {ACCESS_EMAIL_HEADER: "alice@meltio3d.com"}
OTHER_ORG = {ACCESS_EMAIL_HEADER: "zoe@acme.com"}


@pytest.fixture(autouse=True)
def _stub_storage(monkeypatch):
    blobs: dict[str, bytes] = {}
    monkeypatch.setattr(storage, "put_fileobj", lambda k, f, ct="x": blobs.__setitem__(k, f.read()))
    monkeypatch.setattr(storage, "get_object", lambda k: (io.BytesIO(blobs.get(k, b"")), "application/octet-stream", len(blobs.get(k, b""))))
    monkeypatch.setattr(storage, "delete_object", lambda k: blobs.pop(k, None))


def _upload_part(client, headers, name="Part", project_id=None):
    data = {"name": name}
    if project_id:
        data["project_id"] = project_id
    return client.post(
        "/api/parts",
        data=data,
        files={"file": ("p.stl", b"solid x\nendsolid x\n", "model/stl")},
        headers=headers,
    )


def test_create_and_list_projects(client):
    created = client.post("/api/projects", json={"name": "Brackets"}, headers=ALICE)
    assert created.status_code == 201
    pid = created.json()["id"]
    projects = client.get("/api/projects", headers=ALICE).json()["projects"]
    assert any(p["id"] == pid and p["partCount"] == 0 for p in projects)


def test_part_in_project_and_filter(client):
    pid = client.post("/api/projects", json={"name": "P"}, headers=ALICE).json()["id"]
    part = _upload_part(client, ALICE, project_id=pid).json()
    assert part["projectId"] == pid

    filtered = client.get(f"/api/parts?project_id={pid}", headers=ALICE).json()["parts"]
    assert [p["id"] for p in filtered] == [part["id"]]

    proj = client.get(f"/api/projects/{pid}", headers=ALICE).json()
    assert proj["partCount"] == 1


def test_project_tenant_isolation(client):
    pid = client.post("/api/projects", json={"name": "P"}, headers=ALICE).json()["id"]
    assert client.get("/api/projects", headers=OTHER_ORG).json()["projects"] == []
    assert client.get(f"/api/projects/{pid}", headers=OTHER_ORG).status_code == 404


def test_delete_nonempty_project_conflicts(client):
    pid = client.post("/api/projects", json={"name": "P"}, headers=ALICE).json()["id"]
    _upload_part(client, ALICE, project_id=pid)
    assert client.delete(f"/api/projects/{pid}", headers=ALICE).status_code == 409


def test_create_part_rejects_foreign_project(client):
    pid = client.post("/api/projects", json={"name": "P"}, headers=ALICE).json()["id"]
    assert _upload_part(client, OTHER_ORG, project_id=pid).status_code == 404


def test_move_part_in_and_out_of_project(client):
    pid = client.post("/api/projects", json={"name": "P"}, headers=ALICE).json()["id"]
    part = _upload_part(client, ALICE).json()  # unfiled
    assert part["projectId"] is None

    moved = client.patch(f"/api/parts/{part['id']}", json={"projectId": pid}, headers=ALICE)
    assert moved.status_code == 200
    assert moved.json()["projectId"] == pid

    out = client.patch(f"/api/parts/{part['id']}", json={"projectId": None}, headers=ALICE)
    assert out.json()["projectId"] is None
