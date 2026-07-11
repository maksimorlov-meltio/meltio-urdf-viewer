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


def test_sensors_upload_contract_supports_local_folder_flow() -> None:
  csv_bytes = (
    "x,y,z,loadCell,laserPower\n"
    "0,0,0,10,100\n"
    "1,1,1,20,100\n"
    "2,2,2,30,100\n"
  ).encode("utf-8")

  client = TestClient(app_module.create_app())
  response = client.post(
    "/api/sensors/upload",
    data={
      "dataset_label": "local-run",
      "system_hint": "engine",
      "attribute": "loadCell",
      "view": "point",
      "max_points": "5000",
    },
    files={"sensors_file": ("Sensors.csv", csv_bytes, "text/csv")},
  )

  assert response.status_code == 200
  assert response.headers["x-av-dataset"] == "local-run"
  assert response.headers["x-av-system"] == "engine"
  rendered_points = int(response.headers["x-av-renderedpoints"])
  assert rendered_points == 3
  assert len(response.content) == rendered_points * 5 * 4


def test_attribute_series_upload_supports_local_folder_flow() -> None:
  csv_bytes = (
    "x,y,z,loadCell,laserPower\n"
    "0,0,0,10,100\n"
    "1,1,1,20,100\n"
    "2,2,2,30,100\n"
  ).encode("utf-8")

  client = TestClient(app_module.create_app())
  response = client.post(
    "/api/attribute-series/upload",
    data={
      "dataset_label": "local-run",
      "attribute": "loadCell",
      "max_samples": "10",
    },
    files={"sensors_file": ("Sensors.csv", csv_bytes, "text/csv")},
  )

  assert response.status_code == 200
  payload = response.json()
  assert payload["dataset"] == "local-run"
  assert payload["totalSamples"] == 3
  assert payload["sampledIndices"] == [0, 1, 2]
