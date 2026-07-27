import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import avisualizer.web.app as app_module


def _write_credential(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, username: str, password: str) -> Path:
  store = tmp_path / "credentials.json"
  store.write_text(json.dumps({username: app_module._hash_password(password)}), encoding="utf-8")
  monkeypatch.setattr(app_module, "CREDENTIALS_STORE", store)
  return store


def _write_permissions(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, users: list[dict]) -> Path:
  store = tmp_path / "permissions.json"
  store.write_text(json.dumps({"users": users}), encoding="utf-8")
  monkeypatch.setattr(app_module, "PERMISSIONS_STORE", store)
  return store


def test_login_succeeds_and_returns_user_with_role(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
  _write_credential(tmp_path, monkeypatch, "operator1", "s3cret")
  _write_permissions(tmp_path, monkeypatch, [
    {"username": "operator1", "name": "Alex Operator", "roleId": "support"},
  ])

  client = TestClient(app_module.create_app())
  response = client.post("/api/auth/login", json={"username": "operator1", "password": "s3cret"})

  assert response.status_code == 200
  user = response.json()["user"]
  assert user["username"] == "operator1"
  assert user["name"] == "Alex Operator"
  assert user["roleId"] == "support"


def test_login_rejects_wrong_password(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
  _write_credential(tmp_path, monkeypatch, "operator1", "s3cret")
  monkeypatch.setattr(app_module, "PERMISSIONS_STORE", tmp_path / "missing.json")

  client = TestClient(app_module.create_app())
  response = client.post("/api/auth/login", json={"username": "operator1", "password": "wrong"})

  assert response.status_code == 401


def test_login_rejects_unknown_user(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
  _write_credential(tmp_path, monkeypatch, "operator1", "s3cret")

  client = TestClient(app_module.create_app())
  response = client.post("/api/auth/login", json={"username": "ghost", "password": "s3cret"})

  assert response.status_code == 401


def test_login_fails_closed_when_store_absent(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
  monkeypatch.setattr(app_module, "CREDENTIALS_STORE", tmp_path / "missing.json")

  client = TestClient(app_module.create_app())
  response = client.post("/api/auth/login", json={"username": "operator1", "password": "s3cret"})

  assert response.status_code == 401


def test_login_requires_both_fields(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
  _write_credential(tmp_path, monkeypatch, "operator1", "s3cret")

  client = TestClient(app_module.create_app())
  response = client.post("/api/auth/login", json={"username": "operator1"})

  assert response.status_code == 401


def test_login_falls_back_to_username_when_no_profile(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
  _write_credential(tmp_path, monkeypatch, "operator1", "s3cret")
  _write_permissions(tmp_path, monkeypatch, [])

  client = TestClient(app_module.create_app())
  response = client.post("/api/auth/login", json={"username": "operator1", "password": "s3cret"})

  assert response.status_code == 200
  user = response.json()["user"]
  assert user["name"] == "operator1"
  assert user["roleId"] is None
