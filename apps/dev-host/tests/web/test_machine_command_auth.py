"""POST /api/machine/command must not trust any caller.

Covers the server-side guard added to app.py:
  - unauthenticated command            -> 401 (rejected, not audited)
  - authenticated but under-privileged -> 403 (rejected, not audited)
  - authorised command                 -> 200 and exactly one audit line
The mock machine flow still works for an authorised operator.
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


def _write_permissions(path: Path) -> None:
  """A minimal roles/users doc: operator (rank 1) + support (rank 3). Machine
  commands are authorised by RANK against the level contract.json declares per
  command, so what matters here is the rank, not the capability keys.
  Passwords are PBKDF2-hashed exactly as the app expects."""
  doc = {
    "version": 1,
    "roles": [
      {"id": "operator", "name": "Operator", "rank": 1, "permissions": ["files.browse"]},
      {
        "id": "support",
        "name": "Support",
        "rank": 3,
        "permissions": ["files.browse", "machine.motion"],
      },
    ],
    "users": [
      {
        "id": "u_op", "name": "Op", "username": "op", "roleId": "operator",
        "salt": _SALT, "passwordHash": _hash("op-pass", _SALT),
      },
      {
        "id": "u_supp", "name": "Support Tech", "username": "supp", "roleId": "support",
        "salt": _SALT, "passwordHash": _hash("supp-pass", _SALT),
      },
    ],
  }
  path.write_text(json.dumps(doc), encoding="utf-8")


def _client(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> TestClient:
  perms = tmp_path / "permissions.json"
  _write_permissions(perms)
  # DATABASE_ROOT redirects the audit log; PERMISSIONS_STORE the roles/users doc.
  monkeypatch.setattr(app_module, "DATABASE_ROOT", tmp_path)
  monkeypatch.setattr(app_module, "PERMISSIONS_STORE", perms)
  return TestClient(app_module.create_app())


def test_machine_command_requires_auth_and_audits(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
  client = _client(monkeypatch, tmp_path)
  audit = tmp_path / "command_audit.log"

  # 1) Unauthenticated (no session cookie) -> rejected, nothing audited.
  r = client.post("/api/machine/command", json={"id": "c1", "command": "ARM"})
  assert r.status_code in (401, 403)
  assert not audit.exists()

  # 2) Authenticated but rank 1 < operatorPlus (ARM's level) -> 403, not audited.
  assert client.post("/api/auth/login", json={"username": "op", "password": "op-pass"}).status_code == 200
  r = client.post("/api/machine/command", json={"id": "c2", "command": "ARM"})
  assert r.status_code == 403
  assert not audit.exists()

  # 3) Authorised operator -> 200 and exactly one audit line with who/what/ack.
  assert client.post("/api/auth/login", json={"username": "supp", "password": "supp-pass"}).status_code == 200
  r = client.post("/api/machine/command", json={"id": "c3", "command": "ARM", "args": {"axis": "z"}})
  assert r.status_code == 200
  body = r.json()
  assert body.get("id") == "c3"
  assert "accepted" in body  # normal mock ACK shape preserved

  assert audit.exists()
  lines = [ln for ln in audit.read_text(encoding="utf-8").splitlines() if ln.strip()]
  assert len(lines) == 1
  entry = json.loads(lines[0])
  assert entry["operatorId"] == "u_supp"
  assert entry["operatorName"] == "Support Tech"
  assert entry["command"] == "ARM"
  assert entry["args"] == {"axis": "z"}
  assert entry["ackId"] == "c3"
  assert entry.get("ts")


def test_authenticated_operator_keeps_mock_flow(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
  # Constraint: the guard must not break the mock flow for authorised operators.
  client = _client(monkeypatch, tmp_path)
  assert client.post("/api/auth/login", json={"username": "supp", "password": "supp-pass"}).status_code == 200
  r = client.post("/api/machine/command", json={"id": "c9", "command": "DISARM"})
  assert r.status_code == 200
  assert "state" in r.json()  # ACK always carries the machine state


def test_logout_revokes_the_session(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
  client = _client(monkeypatch, tmp_path)
  client.post("/api/auth/login", json={"username": "supp", "password": "supp-pass"})
  assert client.post("/api/machine/command", json={"id": "c1", "command": "DISARM"}).status_code == 200
  client.post("/api/auth/logout")
  # After logout the session is gone -> back to unauthenticated rejection.
  assert client.post("/api/machine/command", json={"id": "c2", "command": "DISARM"}).status_code == 401
