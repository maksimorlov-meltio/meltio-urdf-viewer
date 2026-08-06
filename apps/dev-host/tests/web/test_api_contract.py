from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import avisualizer.web.app as app_module


def _write_dataset(root: Path, dataset: str) -> None:
  dataset_dir = root / dataset
  dataset_dir.mkdir(parents=True, exist_ok=True)
  (dataset_dir / "Sensors.csv").write_text(
    "x,y,z,loadCell,laserPower\n"
    "0,0,0,100,120\n"
    "1,1,1,110,120\n"
    "2,2,2,120,120\n"
    "3,3,3,130,0\n"
    "4,4,4,140,120\n",
    encoding="utf-8",
  )


def _write_stl(root: Path, dataset: str) -> None:
  dataset_dir = root / dataset
  dataset_dir.mkdir(parents=True, exist_ok=True)
  (dataset_dir / "Part.stl").write_text(
    "solid part\n"
    "facet normal 0 0 1\n"
    "  outer loop\n"
    "    vertex 0 0 0\n"
    "    vertex 1 0 0\n"
    "    vertex 0 1 0\n"
    "  endloop\n"
    "endfacet\n"
    "endsolid part\n",
    encoding="utf-8",
  )


def _write_asset_urdf(root: Path, model_name: str) -> None:
  model_dir = root / model_name
  model_dir.mkdir(parents=True, exist_ok=True)
  (model_dir / "model.urdf").write_text(
    "<?xml version=\"1.0\"?>\n"
    "<robot name=\"test\"></robot>\n",
    encoding="utf-8",
  )


def test_sensors_binary_contract_headers_and_stride(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
  dataset = "contract-dataset"
  _write_dataset(tmp_path, dataset)
  monkeypatch.setattr(app_module, "DATABASE_ROOT", tmp_path)

  client = TestClient(app_module.create_app())
  response = client.get(
    "/api/sensors",
    params={
      "dataset": dataset,
      "attribute": "loadCell",
      "view": "point",
      "max_points": 10,
    },
  )

  assert response.status_code == 200
  assert response.headers["content-type"].startswith("application/octet-stream")
  assert response.headers["x-av-pointstride"] == "5"

  rendered_points = int(response.headers["x-av-renderedpoints"])
  assert rendered_points > 0
  assert len(response.content) == rendered_points * 5 * 4


def test_attribute_series_includes_index_aligned_samples(
  monkeypatch: pytest.MonkeyPatch,
  tmp_path: Path,
) -> None:
  dataset = "contract-dataset"
  _write_dataset(tmp_path, dataset)
  monkeypatch.setattr(app_module, "DATABASE_ROOT", tmp_path)

  client = TestClient(app_module.create_app())
  response = client.get(
    "/api/attribute-series",
    params={
      "dataset": dataset,
      "attribute": "loadCell",
        "max_samples": 10,
    },
  )

  assert response.status_code == 200
  payload = response.json()

  sampled_values = payload["sampledValues"]
  sampled_indices = payload["sampledIndices"]
  sampled_points = payload["sampledPoints"]
  total_samples = payload["totalSamples"]

  assert len(sampled_values) == len(sampled_indices)
  assert len(sampled_points) == len(sampled_indices)
  assert len(sampled_values) <= 10
  assert sampled_indices == sorted(sampled_indices)
  assert all(0 <= idx < total_samples for idx in sampled_indices)
  assert all(len(point) == 5 for point in sampled_points)
  for point, idx, value in zip(sampled_points, sampled_indices, sampled_values):
    assert int(point[4]) == idx
    assert point[3] == pytest.approx(value, abs=1e-6)

  # zero-laserPower row is skipped by parser, so expected attribute stream is compacted.
  expected_values = [100.0, 110.0, 120.0, 140.0]
  assert total_samples == len(expected_values)
  for idx, value in zip(sampled_indices, sampled_values):
    assert value == pytest.approx(expected_values[idx], abs=1e-6)


def test_dataset_stl_endpoint_serves_file(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
  dataset = "dataset-with-stl"
  _write_dataset(tmp_path, dataset)
  _write_stl(tmp_path, dataset)
  monkeypatch.setattr(app_module, "DATABASE_ROOT", tmp_path)

  client = TestClient(app_module.create_app())
  response = client.get("/api/datasets/stl", params={"dataset": dataset})

  assert response.status_code == 200
  assert response.headers["content-type"].startswith("model/stl")
  assert "solid part" in response.text


def test_dataset_stl_endpoint_returns_404_when_missing(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
  dataset = "dataset-no-stl"
  _write_dataset(tmp_path, dataset)
  monkeypatch.setattr(app_module, "DATABASE_ROOT", tmp_path)

  client = TestClient(app_module.create_app())
  response = client.get("/api/datasets/stl", params={"dataset": dataset})

  assert response.status_code == 404


def test_urdf_index_route_serves_page() -> None:
  client = TestClient(app_module.create_app())
  response = client.get("/urdf")

  assert response.status_code == 200
  assert response.headers["content-type"].startswith("text/html")
  assert "URDF Viewer" in response.text


def test_urdf_models_endpoint_lists_assets(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
  _write_asset_urdf(tmp_path, "beta")
  _write_asset_urdf(tmp_path, "alpha")
  monkeypatch.setattr(app_module, "ASSETS_ROOT", tmp_path)

  client = TestClient(app_module.create_app())
  response = client.get("/api/urdf/models")

  assert response.status_code == 200
  payload = response.json()
  assert payload["defaultModelUrl"] == "/assets/alpha/model.urdf"
  assert [model["url"] for model in payload["models"]] == [
    "/assets/alpha/model.urdf",
    "/assets/beta/model.urdf",
  ]


def test_assets_static_mount_serves_urdf(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
  _write_asset_urdf(tmp_path, "unit-model")
  monkeypatch.setattr(app_module, "ASSETS_ROOT", tmp_path)

  client = TestClient(app_module.create_app())
  response = client.get("/assets/unit-model/model.urdf")

  assert response.status_code == 200
  assert response.headers["content-type"].startswith("text/plain")
  assert "<robot" in response.text
