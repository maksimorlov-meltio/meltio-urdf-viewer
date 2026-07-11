"""Slicing endpoints: versioned slices, g-code download, tenant isolation.

The heavy slicer engine is stubbed so these stay fast and deterministic;
aslicer's own test suite covers slicing correctness.
"""

from __future__ import annotations

import io

import pytest

from meltio_platform import storage
from meltio_platform.auth import ACCESS_EMAIL_HEADER

ALICE = {ACCESS_EMAIL_HEADER: "alice@meltio3d.com"}
OTHER_ORG = {ACCESS_EMAIL_HEADER: "zoe@acme.com"}


@pytest.fixture(autouse=True)
def _stub(monkeypatch):
    blobs: dict[str, bytes] = {}

    def put_fileobj(key, fileobj, content_type="application/octet-stream"):
        blobs[key] = fileobj.read()

    def get_object(key):
        data = blobs.get(key, b"")
        return io.BytesIO(data), "application/octet-stream", len(data)

    monkeypatch.setattr(storage, "put_fileobj", put_fileobj)
    monkeypatch.setattr(storage, "get_object", get_object)
    monkeypatch.setattr(storage, "delete_object", lambda key: blobs.pop(key, None))
    return blobs


def _make_part(client, headers=ALICE):
    return client.post(
        "/api/parts",
        data={"name": "Bracket"},
        files={"file": ("bracket.stl", b"solid x\nendsolid x\n", "model/stl")},
        headers=headers,
    ).json()


def _slice(client, part_id, headers=ALICE):
    """Save a slice the way the slicer UI does — import G-code + its metadata."""
    return client.post(
        f"/api/parts/{part_id}/slices/import",
        data={
            "profile_name": "Custom",
            "profile_snapshot": '{"build_volume_x_mm": 300.0}',
            "machine_key": "M600 Pro",
            "layer_count": "12",
            "total_extrusion_mm": "345.6",
            "estimated_weight_g": "7.8",
        },
        files={"file": ("slice.gcode", b"G0 X0 Y0\nG1 X10 Y0\n", "text/plain")},
        headers=headers,
    )


def test_slice_records_machine_and_stl(client):
    part = _make_part(client)
    sv = _slice(client, part["id"]).json()
    assert sv["machineName"] == "M600 Pro"  # the machine label (slicing target)
    assert sv["stlFileId"]  # the exact STL blob the G-code was sliced from


def test_profiles_lists_factory(client):
    resp = client.get("/api/profiles", headers=ALICE)
    assert resp.status_code == 200
    names = [p["name"] for p in resp.json()["profiles"]]
    assert any("316L" in n for n in names)


def test_slice_creates_incrementing_versions(client):
    part = _make_part(client)
    first = _slice(client, part["id"])
    assert first.status_code == 201
    assert first.json()["version"] == 1
    assert first.json()["layerCount"] == 12

    second = _slice(client, part["id"])
    assert second.json()["version"] == 2

    listing = client.get(f"/api/parts/{part['id']}/slices", headers=ALICE).json()
    # Current first, then legacy. The new slice demoted v1 to legacy with an expiry.
    assert [s["version"] for s in listing["slices"]] == [2, 1]
    by_version = {s["version"]: s for s in listing["slices"]}
    assert by_version[2]["isCurrent"] is True
    assert by_version[1]["isLegacy"] is True
    assert by_version[1]["expiresAt"] is not None


def test_slice_records_provenance(client):
    part = _make_part(client)
    sv = _slice(client, part["id"]).json()
    assert sv["slicerVersion"]  # stamped with the engine version
    assert sv["hasProfile"] is True
    prof = client.get(f"/api/slices/{sv['id']}/profile", headers=ALICE)
    assert prof.status_code == 200
    assert "build_volume_x_mm" in prof.text  # the full profile snapshot JSON


def test_part_summary_includes_slice_count(client):
    part = _make_part(client)
    _slice(client, part["id"])
    summary = client.get("/api/parts", headers=ALICE).json()["parts"][0]
    assert summary["sliceCount"] == 1
    assert summary["latestSlice"]["version"] == 1


def test_gcode_download(client):
    part = _make_part(client)
    sv = _slice(client, part["id"]).json()
    resp = client.get(f"/api/slices/{sv['id']}/gcode", headers=ALICE)
    assert resp.status_code == 200
    assert b"G1 X10" in resp.content
    assert "bracket.gcode" in resp.headers["content-disposition"]


def test_slice_tenant_isolation(client):
    part = _make_part(client)
    sv = _slice(client, part["id"]).json()
    assert _slice(client, part["id"], headers=OTHER_ORG).status_code == 404
    assert client.get(f"/api/parts/{part['id']}/slices", headers=OTHER_ORG).status_code == 404
    assert client.get(f"/api/slices/{sv['id']}/gcode", headers=OTHER_ORG).status_code == 404


def test_import_slice_persists_version(client):
    """The interactive slicer UI saves its G-code back to the part."""
    part = _make_part(client)
    resp = client.post(
        f"/api/parts/{part['id']}/slices/import",
        data={
            "profile_name": "Custom",
            "layer_count": "5",
            "total_extrusion_mm": "12.5",
            "estimated_weight_g": "3.3",
        },
        files={"file": ("slice.gcode", b"G1 X1\nG1 X2\n", "text/plain")},
        headers=ALICE,
    )
    assert resp.status_code == 201
    sv = resp.json()
    assert sv["version"] == 1
    assert sv["profileName"] == "Custom"
    assert sv["layerCount"] == 5

    gcode = client.get(f"/api/slices/{sv['id']}/gcode", headers=ALICE)
    assert gcode.status_code == 200
    assert b"G1 X2" in gcode.content

    second = client.post(
        f"/api/parts/{part['id']}/slices/import",
        data={"profile_name": "Custom"},
        files={"file": ("slice.gcode", b"G1\n", "text/plain")},
        headers=ALICE,
    )
    assert second.json()["version"] == 2


def test_import_tenant_isolation(client):
    part = _make_part(client)
    resp = client.post(
        f"/api/parts/{part['id']}/slices/import",
        data={"profile_name": "x"},
        files={"file": ("s.gcode", b"G1\n", "text/plain")},
        headers=OTHER_ORG,
    )
    assert resp.status_code == 404


def test_legacy_cleanup_removes_unprinted_keeps_printed(session):
    """Cleanup removes expired, never-printed legacy slices; keeps printed + current."""
    import datetime as dt

    from sqlalchemy import select

    from meltio_platform.models import Org, Part, PrintRun, SliceVersion, User
    from meltio_platform.web.slices import cleanup_legacy_slices

    org = Org(name="x", slug="x")
    session.add(org)
    session.flush()
    user = User(email="u@x", org_id=org.id, display_name="u")
    session.add(user)
    session.flush()
    part = Part(org_id=org.id, created_by_id=user.id, name="p")
    session.add(part)
    session.flush()

    past = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=1)
    common = dict(part_id=part.id, created_by_id=user.id, profile_name="p")
    unprinted = SliceVersion(version=1, gcode_object_key="k1", gcode_filename="a.gcode", is_current=False, expires_at=past, **common)
    printed = SliceVersion(version=2, gcode_object_key="k2", gcode_filename="b.gcode", is_current=False, expires_at=past, **common)
    current = SliceVersion(version=3, gcode_object_key="k3", gcode_filename="c.gcode", is_current=True, **common)
    session.add_all([unprinted, printed, current])
    session.flush()
    session.add(PrintRun(part_id=part.id, slice_version_id=printed.id, created_by_id=user.id, label="run"))
    session.commit()

    removed = cleanup_legacy_slices(session)
    assert removed == 1
    remaining = {s.version for s in session.scalars(select(SliceVersion)).all()}
    assert remaining == {2, 3}
