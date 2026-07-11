"""Scoped profile library: factory seeding + scoped CRUD + tenant isolation."""

from __future__ import annotations

from sqlalchemy import select

from meltio_platform.auth import ACCESS_EMAIL_HEADER
from meltio_platform.config import get_settings
from meltio_platform.models import ProfileRecord
from meltio_platform.web.profiles import seed_factory

ALICE = {ACCESS_EMAIL_HEADER: "alice@meltio3d.com"}
OTHER_ORG = {ACCESS_EMAIL_HEADER: "zoe@acme.com"}


def _me(client, email):
    return client.get("/api/me", headers={ACCESS_EMAIL_HEADER: email}).json()


def test_seed_factory_idempotent(session):
    seed_factory(session)
    seed_factory(session)  # second run must not duplicate
    rows = session.scalars(
        select(ProfileRecord).where(ProfileRecord.scope == "factory")
    ).all()
    names = sorted(r.name for r in rows)
    assert "M600 Pro SS316L" in names
    assert "M600 Standard SS316L" in names
    assert len(names) == len(set(names))  # no dups
    assert all(r.status == "active" for r in rows)


def test_create_list_get_delete(client):
    created = client.post("/api/profiles", json={"name": "Bracket"}, headers=ALICE)
    assert created.status_code == 200
    body = created.json()
    pid = body["id"]
    assert body["scope"] == "org" and body["factory"] is False

    listed = client.get("/api/profiles", headers=ALICE).json()["profiles"]
    assert any(p["id"] == pid and p["name"] == "Bracket" for p in listed)

    got = client.get(f"/api/profiles/{pid}", headers=ALICE).json()
    assert got["name"] == "Bracket"

    assert client.delete(f"/api/profiles/{pid}", headers=ALICE).status_code == 200
    assert client.get(f"/api/profiles/{pid}", headers=ALICE).status_code == 404


def test_tenant_isolation(client):
    pid = client.post("/api/profiles", json={"name": "Secret"}, headers=ALICE).json()["id"]
    others = client.get("/api/profiles", headers=OTHER_ORG).json()["profiles"]
    assert all(p["id"] != pid for p in others)
    assert client.get(f"/api/profiles/{pid}", headers=OTHER_ORG).status_code == 404


def test_name_conflict(client):
    client.post("/api/profiles", json={"name": "Dup"}, headers=ALICE)
    again = client.post("/api/profiles", json={"name": "Dup"}, headers=ALICE)
    assert again.status_code == 409


def test_update_renames(client):
    pid = client.post("/api/profiles", json={"name": "Old"}, headers=ALICE).json()["id"]
    upd = client.put(f"/api/profiles/{pid}", json={"name": "New"}, headers=ALICE)
    assert upd.status_code == 200 and upd.json()["name"] == "New"


def test_version_increments_on_save(client):
    created = client.post("/api/profiles", json={"name": "Verz"}, headers=ALICE).json()
    assert created["version"] == 1
    upd = client.put(
        f"/api/profiles/{created['id']}",
        json={"name": "Verz", "layer_height_mm": 2.0},
        headers=ALICE,
    ).json()
    assert upd["version"] == 2


def test_entry_shows_creator(client):
    pid = client.post("/api/profiles", json={"name": "Mine"}, headers=ALICE).json()["id"]
    row = next(
        p for p in client.get("/api/profiles", headers=ALICE).json()["profiles"]
        if p["id"] == pid
    )
    assert row["createdBy"] == "alice@meltio3d.com"
    assert row["version"] == 1


def test_operator_cannot_create_or_share(client, monkeypatch):
    org_id = _promote_admin(client, monkeypatch)  # boss = superuser
    boss = {ACCESS_EMAIL_HEADER: "boss@meltio3d.com"}
    ed = _me(client, "ed@meltio3d.com")
    client.patch(
        f"/api/admin/users/{ed['id']}", json={"role": "org_operator"}, headers=boss
    )
    ed_h = {ACCESS_EMAIL_HEADER: "ed@meltio3d.com"}
    # operators may not create org profiles nor share into the org
    assert client.post("/api/profiles", json={"name": "Nope"}, headers=ed_h).status_code == 403
    shared = client.post(
        "/api/profiles/M600 Pro SS316L/share", json={"org_id": org_id}, headers=ed_h
    )
    assert shared.status_code == 403


def test_share_forces_distinct_name(client):
    priv = {**ALICE, "X-Org-Id": "private"}
    pid = client.post("/api/profiles", json={"name": "Widget"}, headers=priv).json()["id"]
    me = _me(client, "alice@meltio3d.com")
    org_id, org_name = me["org"]["id"], me["org"]["name"]
    shared = client.post(
        f"/api/profiles/{pid}/share", json={"org_id": org_id}, headers=priv
    ).json()
    assert shared["scope"] == "org"
    assert shared["name"] == f"Widget ({org_name})"  # suffix = target org name
    # the org listing shows its provenance ("shared from")
    org_h = {ACCESS_EMAIL_HEADER: "alice@meltio3d.com"}
    row = next(
        p for p in client.get("/api/profiles", headers=org_h).json()["profiles"]
        if p["id"] == shared["id"]
    )
    assert row["sharedFrom"] == "Widget"


def test_share_to_private_suffix(client):
    """Sharing an org profile into one's own private space suffixes with '(private)'."""
    pid = client.post("/api/profiles", json={"name": "Gizmo"}, headers=ALICE).json()["id"]
    shared = client.post(
        f"/api/profiles/{pid}/share", json={"org_id": "private"}, headers=ALICE
    ).json()
    assert shared["scope"] == "private" and shared["name"] == "Gizmo (private)"


def test_rename_profile(client):
    pid = client.post("/api/profiles", json={"name": "Before"}, headers=ALICE).json()["id"]
    r = client.patch(f"/api/profiles/{pid}", json={"name": "After"}, headers=ALICE)
    assert r.status_code == 200
    assert r.json()["name"] == "After"
    assert r.json()["version"] == 2  # rename counts as a save
    full = client.get(f"/api/profiles/{pid}", headers=ALICE).json()
    assert full["name"] == "After"  # embedded data name updated too
    # factory masters can't be renamed
    fac = next(
        p for p in client.get("/api/profiles", headers=ALICE).json()["profiles"]
        if p["factory"]
    )
    assert client.patch(f"/api/profiles/{fac['id']}", json={"name": "X"}, headers=ALICE).status_code == 403


def _promote_admin(client, monkeypatch):
    """boss (superuser) + alice promoted to org admin of meltio3d. Returns the org id."""
    monkeypatch.setattr(get_settings(), "superuser_emails", "boss@meltio3d.com")
    boss = {ACCESS_EMAIL_HEADER: "boss@meltio3d.com"}
    client.get("/api/me", headers=boss)  # provision the superuser
    alice = _me(client, "alice@meltio3d.com")
    client.patch(
        f"/api/admin/users/{alice['id']}", json={"role": "org_admin"}, headers=boss
    )
    return alice["org"]["id"]


def test_share_private_to_org_pending_then_approve(client, monkeypatch):
    org_id = _promote_admin(client, monkeypatch)
    admin = {ACCESS_EMAIL_HEADER: "alice@meltio3d.com"}

    # carol (org_user) shares a private profile into the org -> pending
    carol = {ACCESS_EMAIL_HEADER: "carol@meltio3d.com"}
    priv = {**carol, "X-Org-Id": "private"}
    pid = client.post("/api/profiles", json={"name": "Shared"}, headers=priv).json()["id"]
    shared = client.post(f"/api/profiles/{pid}/share", json={"org_id": org_id}, headers=priv)
    assert shared.status_code == 200
    sid = shared.json()["id"]
    assert shared.json()["status"] == "pending"

    # a different org member can't see or approve the pending share
    dave = {ACCESS_EMAIL_HEADER: "dave@meltio3d.com"}
    assert all(p["id"] != sid for p in client.get("/api/profiles", headers=dave).json()["profiles"])
    # a non-admin is blocked from approving (404 — can't even see the pending share)
    assert client.post(f"/api/profiles/{sid}/approve", headers=dave).status_code in (403, 404)

    # the admin sees it pending (canApprove) and approves it
    al = client.get("/api/profiles", headers=admin).json()
    assert al["canApprove"] is True
    assert any(p["id"] == sid and p["status"] == "pending" for p in al["profiles"])
    ap = client.post(f"/api/profiles/{sid}/approve", headers=admin)
    assert ap.status_code == 200 and ap.json()["status"] == "active"

    # now active -> visible to every org member
    assert any(p["id"] == sid for p in client.get("/api/profiles", headers=dave).json()["profiles"])


def test_admin_share_auto_approves(client, monkeypatch):
    org_id = _promote_admin(client, monkeypatch)
    admin = {ACCESS_EMAIL_HEADER: "alice@meltio3d.com"}
    priv = {**admin, "X-Org-Id": "private"}
    pid = client.post("/api/profiles", json={"name": "AdminShare"}, headers=priv).json()["id"]
    shared = client.post(f"/api/profiles/{pid}/share", json={"org_id": org_id}, headers=priv)
    assert shared.status_code == 200 and shared.json()["status"] == "active"


def test_reject_removes_pending(client, monkeypatch):
    org_id = _promote_admin(client, monkeypatch)
    admin = {ACCESS_EMAIL_HEADER: "alice@meltio3d.com"}
    carol = {ACCESS_EMAIL_HEADER: "carol@meltio3d.com"}
    priv = {**carol, "X-Org-Id": "private"}
    pid = client.post("/api/profiles", json={"name": "RejectMe"}, headers=priv).json()["id"]
    sid = client.post(f"/api/profiles/{pid}/share", json={"org_id": org_id}, headers=priv).json()["id"]
    assert client.post(f"/api/profiles/{sid}/reject", headers=admin).status_code == 200
    assert all(p["id"] != sid for p in client.get("/api/profiles", headers=admin).json()["profiles"])
