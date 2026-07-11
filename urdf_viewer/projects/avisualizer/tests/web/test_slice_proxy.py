from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import avisualizer.web.app as app_module


def test_slice_proxy_returns_503_when_unconfigured(monkeypatch: pytest.MonkeyPatch) -> None:
  monkeypatch.delenv("AVIS_SLICER_URL", raising=False)

  client = TestClient(app_module.create_app())
  response = client.post("/api/slice/proxy", json={"name": "part.stl"})

  assert response.status_code == 503
  assert "not configured" in response.json()["detail"].lower()


def test_slice_proxy_requires_name(monkeypatch: pytest.MonkeyPatch) -> None:
  monkeypatch.setenv("AVIS_SLICER_URL", "http://127.0.0.1:8765")

  client = TestClient(app_module.create_app())
  response = client.post("/api/slice/proxy", json={})

  assert response.status_code == 400


def test_slice_proxy_forwards_load_and_slice(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
  monkeypatch.setenv("AVIS_SLICER_URL", "http://slicer.test/")

  stl_path = tmp_path / "Part.stl"
  stl_path.write_bytes(b"solid x\nendsolid x\n")
  monkeypatch.setattr(app_module, "_resolve_global_stl_file", lambda name: stl_path)

  calls: list[tuple[str, str]] = []

  def fake_http_json(url, *, method="GET", data=None, headers=None, timeout=120.0):
    calls.append((method, url))
    if url.endswith("/api/profiles"):
      return {"default": "wire-steel"}
    if url.endswith("/api/load"):
      assert method == "POST"
      assert data is not None and b"solid x" in data
      return {"ok": True}
    if url.endswith("/api/slice"):
      assert method == "POST"
      assert data is not None and b"wire-steel" in data
      return {
        "moves": [{"points": [0, 0, 0, 1, 0, 0], "kind": "infill", "layer": 0}],
        "stats": {"layers": 1},
      }
    raise AssertionError(f"unexpected url {url}")

  monkeypatch.setattr(app_module, "_http_json", fake_http_json)

  client = TestClient(app_module.create_app())
  response = client.post("/api/slice/proxy", json={"name": "Part.stl"})

  assert response.status_code == 200
  payload = response.json()
  assert isinstance(payload["moves"], list)
  assert payload["stats"]["layers"] == 1
  # base url is normalised (trailing slash stripped) and both stages are forwarded.
  assert ("POST", "http://slicer.test/api/load") in calls
  assert ("POST", "http://slicer.test/api/slice") in calls
