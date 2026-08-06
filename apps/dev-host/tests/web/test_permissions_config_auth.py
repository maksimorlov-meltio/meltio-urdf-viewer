"""The roles/users document must not be writable by an anonymous caller, and
sessions must actually expire.

These reproduce the two attacks the 2026-08-06 evaluation demonstrated against
PUT /api/permissions/config (finding SEG-1) — wiping the credential store, and
escalating a role — plus the missing session TTL (SEG-2) and the per-command
authorization levels that replaced the single `machine.command` bit (SEG-3).
"""
import binascii
import hashlib
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import avisualizer.web.app as app_module

_SALT = "00112233445566778899aabbccddeeff"


def _hash(password: str, salt_hex: str) -> str:
  dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), binascii.unhexlify(salt_hex), 100000)
  return binascii.hexlify(dk).decode()


def _user(uid: str, username: str, role_id: str) -> dict:
  return {"id": uid, "name": username, "username": username, "roleId": role_id,
          "salt": _SALT, "passwordHash": _hash(username + "-pass", _SALT)}


def _doc() -> dict:
  return {
    "roles": [
      {"id": "role_operator", "name": "Operator", "rank": 1, "permissions": ["files.browse"]},
      {"id": "role_admin", "name": "Administrator", "rank": 4,
       "permissions": ["files.browse", "admin.users"]},
    ],
    "users": [_user("u_op", "op", "role_operator"), _user("u_adm", "adm", "role_admin")],
  }


@pytest.fixture()
def store(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Path:
  perms = tmp_path / "permissions.json"
  perms.write_text(json.dumps(_doc()), encoding="utf-8")
  monkeypatch.setattr(app_module, "DATABASE_ROOT", tmp_path)
  monkeypatch.setattr(app_module, "PERMISSIONS_STORE", perms)
  return perms


@pytest.fixture()
def client(store: Path) -> TestClient:
  return TestClient(app_module.create_app())


def _login(client: TestClient, username: str) -> None:
  r = client.post("/api/auth/login", json={"username": username, "password": username + "-pass"})
  assert r.status_code == 200, r.text


# --- SEG-1: the config PUT is an authorization boundary ----------------------

def test_anonymous_put_cannot_wipe_the_store(client: TestClient, store: Path) -> None:
  before = store.read_text(encoding="utf-8")
  assert client.put("/api/permissions/config", json={}).status_code == 401
  assert store.read_text(encoding="utf-8") == before, "anonymous PUT must not touch the store"


def test_anonymous_put_cannot_escalate_a_role(client: TestClient, store: Path) -> None:
  escalated = _doc()
  escalated["roles"][0]["rank"] = 4  # operator -> full rank
  assert client.put("/api/permissions/config", json=escalated).status_code == 401
  # And the operator still cannot command the machine afterwards.
  _login(client, "op")
  assert client.post("/api/machine/command", json={"command": "ARM"}).status_code == 403


def test_signed_in_operator_without_admin_users_is_refused(client: TestClient) -> None:
  _login(client, "op")
  assert client.put("/api/permissions/config", json=_doc()).status_code == 403


def test_administrator_can_save_the_matrix(client: TestClient, store: Path) -> None:
  _login(client, "adm")
  doc = _doc()
  doc["roles"][0]["permissions"].append("materials.assign")
  assert client.put("/api/permissions/config", json=doc).status_code == 200
  saved = json.loads(store.read_text(encoding="utf-8"))
  assert "materials.assign" in saved["roles"][0]["permissions"]
  # Credentials are merged back in, never round-tripped through the browser.
  assert saved["users"][0]["passwordHash"] == _doc()["users"][0]["passwordHash"]


def test_empty_body_is_refused_instead_of_emptying_the_store(client: TestClient, store: Path) -> None:
  _login(client, "adm")
  before = store.read_text(encoding="utf-8")
  assert client.put("/api/permissions/config", json={}).status_code == 400
  assert store.read_text(encoding="utf-8") == before


# --- SEG-2: sessions expire server-side --------------------------------------

def test_session_expires_after_the_ttl(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
  _login(client, "adm")
  assert client.post("/api/machine/command", json={"command": "DISARM"}).status_code == 200
  # The cookie is still valid and still being sent; only the server-side age
  # check rejects it. Before this existed, `_sessions` had no timestamp at all
  # and a token stayed good for the lifetime of the process.
  monkeypatch.setattr(app_module, "SESSION_TTL_SECONDS", 0)
  assert client.post("/api/machine/command", json={"command": "DISARM"}).status_code == 401


def test_logout_revokes_the_session_immediately(client: TestClient) -> None:
  _login(client, "adm")
  assert client.post("/api/machine/command", json={"command": "DISARM"}).status_code == 200
  assert client.post("/api/auth/logout").status_code == 200
  assert client.post("/api/machine/command", json={"command": "DISARM"}).status_code == 401


# --- SEG-3 / ARQ-2: per-command levels from contract.json --------------------

def test_command_levels_come_from_the_contract(client: TestClient) -> None:
  _login(client, "op")  # rank 1 == "operator"
  # DISARM is declared `operator` and de-escalating: allowed.
  assert client.post("/api/machine/command", json={"command": "DISARM"}).status_code == 200
  # ARM is `operatorPlus`, JOG is `support`: both above this rank.
  assert client.post("/api/machine/command", json={"command": "ARM"}).status_code == 403
  assert client.post("/api/machine/command", json={"command": "JOG"}).status_code == 403


def test_emergency_stop_is_allowed_signed_out_and_still_audited(
    client: TestClient, tmp_path: Path) -> None:
  # contract.json: emergencyStop is `permission: "none"` — "always allowed, from
  # any state, signed-in or not". Refusing a stop because nobody is logged in is
  # the wrong failure direction.
  r = client.post("/api/machine/command", json={"id": "e1", "command": "ESTOP"})
  assert r.status_code == 200
  entry = json.loads((tmp_path / "command_audit.log").read_text(encoding="utf-8").splitlines()[-1])
  assert entry["command"] == "ESTOP" and entry["operatorName"] == "anonymous"


def test_undeclared_command_is_refused(client: TestClient) -> None:
  _login(client, "adm")
  r = client.post("/api/machine/command", json={"command": "SELF_DESTRUCT"})
  assert r.status_code == 400
  assert "Unknown command" in r.json()["detail"]


# --- ARQ-2: a fresh install has roles to authorise against -------------------

def test_fresh_install_serves_builtin_roles_and_no_users(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
  monkeypatch.setattr(app_module, "DATABASE_ROOT", tmp_path)
  monkeypatch.setattr(app_module, "PERMISSIONS_STORE", tmp_path / "permissions.json")
  client = TestClient(app_module.create_app())
  config = client.get("/api/permissions/config").json()
  ranks = {r["id"]: r["rank"] for r in config["roles"]}
  assert ranks == {"role_operator": 1, "role_operator_plus": 2,
                   "role_support": 3, "role_admin": 4}
  assert config["users"] == [], "a default install must seed no credentials"
  # ...and with no users, nothing is authorised.
  assert client.post("/api/machine/command", json={"command": "ARM"}).status_code == 401
