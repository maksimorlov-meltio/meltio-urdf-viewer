"""A corrupt authorization store must deny, not fall back to the built-ins.

Finding SEG-4. `permissions.json` holds every role's rank and every operator's
credential, and it had two ways to go wrong at once:

  * it was written with a plain `write_text`, which truncates first and fills
    after — a window measured on NTFS with an observing thread, and there are
    TWO uncoordinated writers (this route and tools/set_password.py);
  * "the file is absent" and "the file is unreadable" shared a `return`, so a
    truncated document silently produced the BUILT-IN roles. That fails open:
    an administrator who had lowered a built-in role's rank has the restriction
    quietly undone by a bad write.

The app deliberately does not die on a corrupt data dir — the console must keep
running. What it must not do is keep authorising.
"""
import binascii
import hashlib
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import avisualizer.web.app as app_module
from avisualizer.web.services.atomic_file import write_text_atomic

_SALT = "00112233445566778899aabbccddeeff"


def _hash(password: str, salt_hex: str) -> str:
  dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), binascii.unhexlify(salt_hex), 100000)
  return binascii.hexlify(dk).decode()


def _doc() -> dict:
  return {
    "roles": [
      {"id": "role_admin", "name": "Administrator", "rank": 4,
       "permissions": ["files.browse", "admin.users"]},
    ],
    "users": [{"id": "u_adm", "name": "adm", "username": "adm", "roleId": "role_admin",
               "salt": _SALT, "passwordHash": _hash("adm-pass", _SALT)}],
  }


# The six ways this file has been seen to go wrong, or plausibly can. Each is a
# separate failure of the loader, not six spellings of one.
CORRUPTIONS = {
  "truncated mid-write": '{"roles": [{"id": "role_admin", "ra',
  "empty file": "",
  "a single NUL byte": "\x00",
  "valid JSON, no roles key": '{"users": []}',
  "valid JSON, roles empty": '{"roles": [], "users": []}',
  "valid JSON, not an object": '["role_admin"]',
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


# --- The loader tells absent from unreadable ---------------------------------

@pytest.mark.parametrize("label", sorted(CORRUPTIONS))
def test_a_corrupt_store_grants_nothing(label: str, store: Path, client: TestClient) -> None:
  store.write_text(CORRUPTIONS[label], encoding="utf-8")
  served = client.get("/api/permissions/config")
  assert served.status_code == 200, "the console must keep running"
  body = served.json()
  # NOT the built-in roles. Serving those is the fail-open: it silently restores
  # whatever rank the built-ins carry over whatever the administrator configured.
  assert body.get("roles") == [], f"{label}: fell back to a usable role set"
  assert body.get("users") == []


@pytest.mark.parametrize("label", sorted(CORRUPTIONS))
def test_a_corrupt_store_cannot_be_signed_into(label: str, store: Path, client: TestClient) -> None:
  store.write_text(CORRUPTIONS[label], encoding="utf-8")
  r = client.post("/api/auth/login", json={"username": "adm", "password": "adm-pass"})
  assert r.status_code == 401, f"{label}: a corrupt store must not authenticate anyone"


def test_an_absent_store_still_serves_the_built_in_roles(store: Path, client: TestClient) -> None:
  # The other half of the distinction, and the reason this is not just "deny on
  # anything unexpected": a fresh clone has no store, and the console needs
  # ranks to authorise against before the first operator exists.
  store.unlink()
  body = client.get("/api/permissions/config").json()
  assert len(body["roles"]) == 4, "a fresh install keeps its built-in roles"
  assert body["users"] == [], "and still has nobody who can sign in"


# --- A corrupt store must not be overwritten ---------------------------------

@pytest.mark.parametrize("label", sorted(CORRUPTIONS))
def test_saving_over_a_corrupt_store_never_wipes_the_credentials(
    label: str, store: Path, client: TestClient) -> None:
  # The sharp edge: the PUT merges incoming users onto the STORED ones to keep
  # each salt/passwordHash. With an unreadable store there are no stored users,
  # so a merge would write a document with every credential gone — turning a
  # recoverable corrupt file into a permanently locked-out machine.
  #
  # Which refusal arrives is not the property worth pinning, and asserting one
  # would be asserting the implementation: with no roles nobody resolves to
  # admin.users, so _require_permission answers first (401 signed out, 403 with
  # a stale session) and the 409 in put_permissions_config is a TOCTOU backstop
  # behind it. What must hold either way is that the file is not touched.
  store.write_text(CORRUPTIONS[label], encoding="utf-8")
  before = store.read_text(encoding="utf-8")
  r = client.put("/api/permissions/config", json=_doc())
  assert r.status_code in (401, 403, 409), f"{label}: got {r.status_code}"
  assert store.read_text(encoding="utf-8") == before, f"{label}: the corrupt file was overwritten"


# --- The write itself is atomic ----------------------------------------------

def test_the_writer_never_leaves_a_partial_file(tmp_path: Path) -> None:
  target = tmp_path / "permissions.json"
  target.write_text('{"roles": ["old"]}', encoding="utf-8")
  write_text_atomic(target, '{"roles": ["new"]}')
  assert json.loads(target.read_text(encoding="utf-8")) == {"roles": ["new"]}
  # And no litter beside it: a stray .permissions.json.*.tmp invites someone to
  # "restore" a half-written document.
  assert [p.name for p in tmp_path.iterdir()] == ["permissions.json"]


def test_a_failed_write_leaves_the_previous_document_intact(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
  # The property `write_text` cannot offer at all: whatever goes wrong, the OLD
  # document is still there afterwards. Failure injected at the fsync, which is
  # the last thing before the rename and therefore the worst moment.
  target = tmp_path / "permissions.json"
  target.write_text('{"roles": ["old"]}', encoding="utf-8")

  def boom(_fd: int) -> None:
    raise OSError("disk full")

  monkeypatch.setattr("avisualizer.web.services.atomic_file.os.fsync", boom)
  with pytest.raises(OSError):
    write_text_atomic(target, '{"roles": ["new"]}')
  assert target.read_text(encoding="utf-8") == '{"roles": ["old"]}'
  assert [p.name for p in tmp_path.iterdir()] == ["permissions.json"], (
    "a failed write must not leave a temporary file next to the store")
