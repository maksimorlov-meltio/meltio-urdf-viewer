"""Roles: superuser bootstrap + cross-org visibility, admin role management."""

from __future__ import annotations

from meltio_platform.auth import ACCESS_EMAIL_HEADER
from meltio_platform.config import get_settings

ALICE = {ACCESS_EMAIL_HEADER: "alice@meltio3d.com"}
OTHER_ORG = {ACCESS_EMAIL_HEADER: "zoe@acme.com"}
BOSS = {ACCESS_EMAIL_HEADER: "boss@meltio3d.com"}
BOB = {ACCESS_EMAIL_HEADER: "bob@meltio3d.com"}


def test_superuser_bootstrap_and_cross_org(client, monkeypatch):
    # zoe (acme.com) is granted superuser via the env bootstrap list.
    monkeypatch.setattr(get_settings(), "superuser_emails", "zoe@acme.com")
    client.post("/api/projects", json={"name": "AliceProj"}, headers=ALICE)
    alice_org = client.get("/api/me", headers=ALICE).json()["org"]["id"]

    me = client.get("/api/me", headers=OTHER_ORG).json()
    assert me["isSuperuser"] is True
    # A superuser's org switcher lists every org.
    assert any(o["slug"] == "meltio3d.com" for o in me["orgs"])

    # Acting in alice's org (via the X-Org-Id header) shows her project.
    projects = client.get(
        "/api/projects", headers={**OTHER_ORG, "X-Org-Id": alice_org}
    ).json()["projects"]
    assert any(p["name"] == "AliceProj" for p in projects)


def test_membership_grants_cross_org_access(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "superuser_emails", "boss@meltio3d.com")
    client.get("/api/me", headers=BOSS)
    # zoe (acme, ordinary user) creates a project in her org.
    client.post("/api/projects", json={"name": "AcmeProj"}, headers=OTHER_ORG)
    acme_org = client.get("/api/me", headers=OTHER_ORG).json()["org"]["id"]
    alice = client.get("/api/me", headers=ALICE).json()

    # Without membership, alice can't act in acme.
    assert client.get(
        "/api/projects", headers={**ALICE, "X-Org-Id": acme_org}
    ).status_code == 403

    # Superuser assigns alice to acme; now it appears in her switcher + is readable.
    assert client.post(
        f"/api/admin/users/{alice['id']}/orgs", json={"orgId": acme_org}, headers=BOSS
    ).status_code == 201
    me = client.get("/api/me", headers=ALICE).json()
    assert acme_org in [o["id"] for o in me["orgs"]]
    projs = client.get(
        "/api/projects", headers={**ALICE, "X-Org-Id": acme_org}
    ).json()["projects"]
    assert any(p["name"] == "AcmeProj" for p in projs)

    # Removing the membership revokes access again.
    client.delete(f"/api/admin/users/{alice['id']}/orgs/{acme_org}", headers=BOSS)
    assert client.get(
        "/api/projects", headers={**ALICE, "X-Org-Id": acme_org}
    ).status_code == 403


def test_member_cannot_list_users(client):
    client.get("/api/me", headers=ALICE)
    assert client.get("/api/admin/users", headers=ALICE).status_code == 403


def test_admin_can_set_role_in_org(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "superuser_emails", "boss@meltio3d.com")
    client.get("/api/me", headers=BOSS)  # provision superuser
    alice = client.get("/api/me", headers=ALICE).json()

    users = client.get("/api/admin/users", headers=BOSS).json()["users"]
    assert any(u["email"] == "alice@meltio3d.com" for u in users)

    resp = client.patch(
        f"/api/admin/users/{alice['id']}", json={"role": "org_admin"}, headers=BOSS
    )
    assert resp.status_code == 200
    assert resp.json()["role"] == "org_admin"


def test_org_slicer_preference(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "superuser_emails", "boss@meltio3d.com")
    client.get("/api/me", headers=BOSS)  # superuser (also an admin)

    g = client.get("/api/admin/org", headers=BOSS).json()
    assert g["slicerPref"] == "latest"
    version = g["availableSlicerVersions"][0]

    r = client.patch("/api/admin/org", json={"slicerPref": version}, headers=BOSS)
    assert r.status_code == 200 and r.json()["slicerPref"] == version
    # reflected in /api/me
    assert client.get("/api/me", headers=BOSS).json()["org"]["slicerPref"] == version
    # invalid version rejected
    assert client.patch("/api/admin/org", json={"slicerPref": "9.9.9"}, headers=BOSS).status_code == 400
    # members can't read/write org settings
    client.get("/api/me", headers=ALICE)
    assert client.get("/api/admin/org", headers=ALICE).status_code == 403


def test_permissions_matrix_and_caps(client):
    me = client.get("/api/me", headers=ALICE).json()
    assert me["role"] == "org_user"
    assert "slice" in me["capabilities"] and "upload_part" in me["capabilities"]

    m = client.get("/api/permissions", headers=ALICE).json()
    roles = {r["key"] for r in m["roles"]}
    assert {"superuser", "meltio_support", "org_admin", "org_user", "org_operator"} <= roles
    operator = next(r for r in m["roles"] if r["key"] == "org_operator")
    assert "slice" not in operator["capabilities"]
    assert "record_print" in operator["capabilities"]


_STL = b"solid x\nfacet normal 0 0 0\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid x\n"


def _upload(client, headers, name="P"):
    return client.post(
        "/api/parts",
        data={"name": name},
        files={"file": ("p.stl", _STL, "model/stl")},
        headers=headers,
    )


def test_private_space_isolation(client):
    priv = {**ALICE, "X-Org-Id": "private"}
    p = _upload(client, priv, "Secret").json()
    assert p["isPrivate"] is True
    # Visible to alice in private, hidden from her org view and from org-mate bob.
    assert any(x["id"] == p["id"] for x in client.get("/api/parts", headers=priv).json()["parts"])
    assert not any(x["id"] == p["id"] for x in client.get("/api/parts", headers=ALICE).json()["parts"])
    assert not any(
        x["id"] == p["id"]
        for x in client.get("/api/parts", headers=BOB).json()["parts"]
    )


def test_private_projects(client):
    priv = {**ALICE, "X-Org-Id": "private"}
    pid = client.post("/api/projects", json={"name": "Secret Proj"}, headers=priv).json()["id"]
    assert any(p["id"] == pid for p in client.get("/api/projects", headers=priv).json()["projects"])
    assert not any(
        p["id"] == pid for p in client.get("/api/projects", headers=ALICE).json()["projects"]
    )
    up = _upload(client, {**priv}, "PP")  # upload then move into the private project
    part_id = up.json()["id"]
    moved = client.patch(f"/api/parts/{part_id}", json={"projectId": pid}, headers=priv)
    assert moved.status_code == 200 and moved.json()["projectId"] == pid
    assert moved.json()["isPrivate"] is True


def test_duplicate_and_favorite(client):
    pid = _upload(client, ALICE, "Orig").json()["id"]
    dup = client.post(f"/api/parts/{pid}/duplicate", headers=ALICE)
    assert dup.status_code == 201 and dup.json()["name"] == "Orig copy"
    fav = client.patch(f"/api/parts/{pid}", json={"favorite": True}, headers=ALICE)
    assert fav.json()["isFavorite"] is True


def test_cross_org_move_for_member(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "superuser_emails", "boss@meltio3d.com")
    client.get("/api/me", headers=BOSS)
    acme = client.post("/api/admin/orgs", json={"name": "Acme"}, headers=BOSS).json()["id"]
    alice = client.get("/api/me", headers=ALICE).json()
    client.post(
        f"/api/admin/users/{alice['id']}/orgs",
        json={"orgId": acme, "role": "org_user"},
        headers=BOSS,
    )
    pid = _upload(client, ALICE, "Mover").json()["id"]
    assert client.patch(f"/api/parts/{pid}", json={"orgId": acme}, headers=ALICE).status_code == 200
    acme_parts = client.get("/api/parts", headers={**ALICE, "X-Org-Id": acme}).json()["parts"]
    assert any(x["id"] == pid for x in acme_parts)
    assert not any(x["id"] == pid for x in client.get("/api/parts", headers=ALICE).json()["parts"])


def test_audit_log(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "superuser_emails", "boss@meltio3d.com")
    client.get("/api/me", headers=BOSS)
    pid = client.post("/api/projects", json={"name": "AuditProj"}, headers=BOSS).json()["id"]
    client.delete(f"/api/projects/{pid}", headers=BOSS)
    events = client.get("/api/admin/audit", headers=BOSS).json()["events"]
    actions = [e["action"] for e in events]
    assert "project.create" in actions and "project.delete" in actions
    assert events[0]["actor"] == "boss@meltio3d.com"  # most recent first
    # The audit log is superuser-only.
    client.get("/api/me", headers=ALICE)
    assert client.get("/api/admin/audit", headers=ALICE).status_code == 403


def test_per_org_role(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "superuser_emails", "boss@meltio3d.com")
    client.get("/api/me", headers=BOSS)
    acme = client.get("/api/me", headers=OTHER_ORG).json()["org"]["id"]
    alice = client.get("/api/me", headers=ALICE).json()  # home meltio3d, org_user

    # Assign alice to acme as an operator.
    assert client.post(
        f"/api/admin/users/{alice['id']}/orgs",
        json={"orgId": acme, "role": "org_operator"},
        headers=BOSS,
    ).status_code == 201

    # In acme she is an operator (no upload); at home she stays org_user.
    up = client.post(
        "/api/parts",
        data={"name": "X"},
        files={"file": ("x.stl", b"solid x\n", "model/stl")},
        headers={**ALICE, "X-Org-Id": acme},
    )
    assert up.status_code == 403
    me_acme = client.get("/api/me", headers={**ALICE, "X-Org-Id": acme}).json()
    assert me_acme["role"] == "org_operator" and "slice" not in me_acme["capabilities"]
    me_home = client.get("/api/me", headers=ALICE).json()
    assert me_home["role"] == "org_user" and "slice" in me_home["capabilities"]

    # Promote her to admin in acme; now she has org-management caps there.
    client.patch(
        f"/api/admin/users/{alice['id']}/orgs/{acme}",
        json={"role": "org_admin"},
        headers=BOSS,
    )
    me_acme2 = client.get("/api/me", headers={**ALICE, "X-Org-Id": acme}).json()
    assert "manage_org_users" in me_acme2["capabilities"]


def test_superuser_can_edit_role_capabilities(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "superuser_emails", "boss@meltio3d.com")
    client.get("/api/me", headers=BOSS)

    # Default: org_operator cannot slice. Superuser grants it.
    resp = client.put(
        "/api/permissions/roles/org_operator",
        json={"capabilities": ["view", "download", "record_print", "slice"]},
        headers=BOSS,
    )
    assert resp.status_code == 200
    operator = next(r for r in resp.json()["roles"] if r["key"] == "org_operator")
    assert "slice" in operator["capabilities"]

    # The change is now live: an org_operator may slice-import.
    alice = client.get("/api/me", headers=ALICE).json()
    client.patch(
        f"/api/admin/users/{alice['id']}", json={"role": "org_operator"}, headers=BOSS
    )
    me = client.get("/api/me", headers=ALICE).json()
    assert "slice" in me["capabilities"]


def test_role_edit_guards(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "superuser_emails", "boss@meltio3d.com")
    client.get("/api/me", headers=BOSS)
    # Non-superuser cannot edit the matrix.
    client.get("/api/me", headers=ALICE)
    assert client.put(
        "/api/permissions/roles/org_user", json={"capabilities": []}, headers=ALICE
    ).status_code == 403
    # The superuser role is locked.
    assert client.put(
        "/api/permissions/roles/superuser", json={"capabilities": []}, headers=BOSS
    ).status_code == 400
    # manage_platform can't be handed to another role (silently dropped).
    resp = client.put(
        "/api/permissions/roles/org_admin",
        json={"capabilities": ["view", "manage_platform"]},
        headers=BOSS,
    )
    admin_role = next(r for r in resp.json()["roles"] if r["key"] == "org_admin")
    assert "manage_platform" not in admin_role["capabilities"]


def test_superuser_can_create_org(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "superuser_emails", "boss@meltio3d.com")
    client.get("/api/me", headers=BOSS)
    resp = client.post("/api/admin/orgs", json={"name": "Acme Aerospace"}, headers=BOSS)
    assert resp.status_code == 201
    assert resp.json()["slug"] == "acme-aerospace"
    orgs = client.get("/api/admin/orgs", headers=BOSS).json()["orgs"]
    assert any(o["name"] == "Acme Aerospace" for o in orgs)
    # Non-superuser cannot create orgs.
    client.get("/api/me", headers=ALICE)
    assert client.post(
        "/api/admin/orgs", json={"name": "Nope"}, headers=ALICE
    ).status_code == 403


def test_operator_cannot_upload_or_slice(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "superuser_emails", "boss@meltio3d.com")
    client.get("/api/me", headers=BOSS)
    alice = client.get("/api/me", headers=ALICE).json()
    client.patch(
        f"/api/admin/users/{alice['id']}", json={"role": "org_operator"}, headers=BOSS
    )
    # As an operator, alice can no longer upload (capability gate → 403).
    up = client.post(
        "/api/parts",
        data={"name": "X"},
        files={"file": ("x.stl", b"solid x\n", "model/stl")},
        headers=ALICE,
    )
    assert up.status_code == 403


def test_admin_cannot_grant_superuser(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "superuser_emails", "boss@meltio3d.com")
    client.get("/api/me", headers=BOSS)
    alice = client.get("/api/me", headers=ALICE).json()
    client.patch(
        f"/api/admin/users/{alice['id']}", json={"role": "org_admin"}, headers=BOSS
    )  # alice is now an org admin
    bob = client.get("/api/me", headers=BOB).json()
    # An admin (alice) may not mint a superuser.
    resp = client.patch(
        f"/api/admin/users/{bob['id']}", json={"role": "superuser"}, headers=ALICE
    )
    assert resp.status_code == 403
