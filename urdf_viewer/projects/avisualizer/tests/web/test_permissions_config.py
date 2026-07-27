import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import avisualizer.web.app as app_module


def _valid_document() -> dict:
  """A minimal well-formed roles/users matrix with a God role and a God user."""
  return {
    "roles": [
      {"id": "god", "name": "God", "builtin": True, "rank": 0,
       "permissions": ["admin.users", "move.jog"]},
      {"id": "operator", "name": "Operator", "builtin": True, "rank": 3,
       "permissions": []},
    ],
    "users": [
      {"username": "admin", "name": "Admin", "roleId": "god"},
      {"username": "op1", "name": "Op One", "roleId": "operator"},
    ],
  }


def _client(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> tuple[TestClient, Path]:
  store = tmp_path / "permissions.json"
  monkeypatch.setattr(app_module, "PERMISSIONS_STORE", store)
  return TestClient(app_module.create_app()), store


def test_put_persists_valid_document_and_get_reads_it_back(
  monkeypatch: pytest.MonkeyPatch, tmp_path: Path,
) -> None:
  client, store = _client(monkeypatch, tmp_path)
  document = _valid_document()

  response = client.put("/api/permissions/config", json=document)

  assert response.status_code == 200
  assert response.json() == {"ok": True}
  assert json.loads(store.read_text(encoding="utf-8")) == document
  assert client.get("/api/permissions/config").json() == document


def test_put_rejects_non_object_body(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
  client, store = _client(monkeypatch, tmp_path)

  response = client.put("/api/permissions/config", json=["not", "an", "object"])

  assert response.status_code == 400
  assert not store.exists()  # nothing persisted on rejection


def test_put_rejects_invalid_json(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
  client, store = _client(monkeypatch, tmp_path)

  response = client.put(
    "/api/permissions/config",
    content="{not valid json",
    headers={"Content-Type": "application/json"},
  )

  assert response.status_code == 400
  assert not store.exists()


def test_put_rejects_missing_or_empty_roles(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
  client, _ = _client(monkeypatch, tmp_path)

  assert client.put("/api/permissions/config", json={"users": []}).status_code == 400
  assert client.put("/api/permissions/config", json={"roles": [], "users": []}).status_code == 400


def test_put_rejects_duplicate_role_id(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
  client, _ = _client(monkeypatch, tmp_path)
  document = _valid_document()
  document["roles"].append({"id": "god", "name": "Dup", "permissions": ["admin.users"]})

  response = client.put("/api/permissions/config", json=document)

  assert response.status_code == 400
  assert "Duplicate role id" in response.json()["detail"]


def test_put_rejects_document_with_no_god_role(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
  client, store = _client(monkeypatch, tmp_path)
  document = _valid_document()
  # Strip the God permission from every role -> nobody could administer again.
  for role in document["roles"]:
    role["permissions"] = [p for p in role["permissions"] if p != "admin.users"]

  response = client.put("/api/permissions/config", json=document)

  assert response.status_code == 400
  assert "God" in response.json()["detail"]
  assert not store.exists()


def test_put_rejects_document_with_no_god_user(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
  client, store = _client(monkeypatch, tmp_path)
  document = _valid_document()
  # A God role exists, but no user is assigned to it -> also a lockout.
  document["users"] = [{"username": "op1", "name": "Op One", "roleId": "operator"}]

  response = client.put("/api/permissions/config", json=document)

  assert response.status_code == 400
  assert not store.exists()


def test_put_rejects_oversized_body(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
  client, store = _client(monkeypatch, tmp_path)
  document = _valid_document()
  # A cosmetic field padded past the size cap; rejected before schema checks.
  document["roles"][0]["name"] = "x" * (app_module.PERMISSIONS_MAX_BYTES + 1)

  response = client.put("/api/permissions/config", json=document)

  assert response.status_code == 413
  assert not store.exists()
