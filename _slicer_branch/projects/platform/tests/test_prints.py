"""Prints: recording a print of a slice, listing, and tenant isolation."""

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


def _part_with_slice(client):
    part = client.post(
        "/api/parts",
        data={"name": "P"},
        files={"file": ("p.stl", b"solid x\n", "model/stl")},
        headers=ALICE,
    ).json()
    sv = client.post(
        f"/api/parts/{part['id']}/slices/import",
        data={"profile_name": "X"},
        files={"file": ("s.gcode", b"G1\n", "text/plain")},
        headers=ALICE,
    ).json()
    return part, sv


def test_create_and_list_prints(client):
    part, sv = _part_with_slice(client)
    created = client.post(
        f"/api/slices/{sv['id']}/prints", json={"label": "Run A"}, headers=ALICE
    )
    assert created.status_code == 201
    assert created.json()["sliceVersion"] == sv["version"]

    prints = client.get(f"/api/parts/{part['id']}/prints", headers=ALICE).json()["prints"]
    assert [p["label"] for p in prints] == ["Run A"]


def test_print_increments_slice_print_count(client):
    part, sv = _part_with_slice(client)
    client.post(f"/api/slices/{sv['id']}/prints", json={"label": "R"}, headers=ALICE)
    slices = client.get(f"/api/parts/{part['id']}/slices", headers=ALICE).json()["slices"]
    assert slices[0]["printCount"] == 1


def test_print_tenant_isolation(client):
    _part, sv = _part_with_slice(client)
    resp = client.post(
        f"/api/slices/{sv['id']}/prints", json={"label": "R"}, headers=OTHER_ORG
    )
    assert resp.status_code == 404
