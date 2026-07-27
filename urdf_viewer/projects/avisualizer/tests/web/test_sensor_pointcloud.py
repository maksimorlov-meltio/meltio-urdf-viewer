from collections import OrderedDict
from pathlib import Path

import numpy as np
import pytest

import avisualizer.web.services.sensor_pointcloud as spc
from avisualizer.web.services.sensor_pointcloud import _iter_sensor_rows, load_sensor_pointcloud


def test_iter_sensor_rows_reads_xyz_and_attribute(tmp_path: Path) -> None:
    csv_path = tmp_path / "Sensors.csv"
    csv_path.write_text(
        "x,y,z,loadCell\n"
        "1,2,3,100\n"
        "2,3,4,200\n"
        "3,4,5,300\n",
        encoding="utf-8",
    )

    rows = list(_iter_sensor_rows(csv_path, "loadCell"))

    assert len(rows) == 3
    assert rows[0] == (1.0, 2.0, 3.0, 100.0)
    assert [row[3] for row in rows] == [100.0, 200.0, 300.0]


def test_iter_sensor_rows_raises_for_missing_columns(tmp_path: Path) -> None:
    csv_path = tmp_path / "Sensors.csv"
    csv_path.write_text("x,y,z\n1,2,3\n", encoding="utf-8")

    with pytest.raises(ValueError, match="missing required columns"):
        list(_iter_sensor_rows(csv_path, "loadCell"))


def test_iter_sensor_rows_skips_zero_laser_power_by_default(tmp_path: Path) -> None:
    csv_path = tmp_path / "Sensors.csv"
    csv_path.write_text(
        "x,y,z,loadCell,laserPower\n"
        "1,2,3,100,0\n"
        "2,3,4,200,120\n"
        "3,4,5,300,0\n",
        encoding="utf-8",
    )

    rows = list(_iter_sensor_rows(csv_path, "loadCell"))

    assert len(rows) == 1
    assert rows[0] == (2.0, 3.0, 4.0, 200.0)


def test_load_sensor_pointcloud_voxel_mode(tmp_path: Path) -> None:
    csv_path = tmp_path / "Sensors.csv"
    csv_path.write_text(
        "x,y,z,loadCell\n"
        "0.0,0.0,0.0,10\n"
        "0.5,0.5,0.5,20\n"
        "2.1,2.0,2.0,30\n"
        "2.2,2.1,2.0,40\n",
        encoding="utf-8",
    )

    result = load_sensor_pointcloud(
        csv_path=csv_path,
        dataset_name="test-dataset",
        attribute="loadCell",
        view_mode="voxel",
        voxel_size_mm=2.0,
        max_points=100,
    )

    assert result.view_mode == "voxel"
    assert result.voxel_size_mm == 2.0
    assert result.total_points == 4
    assert 1 <= result.rendered_points <= result.total_points
    assert result.backend_engine in {"open3d", "numpy"}


def test_voxel_centers_start_half_voxel_above_min_z(tmp_path: Path) -> None:
    csv_path = tmp_path / "Sensors.csv"
    csv_path.write_text(
        "x,y,z,loadCell\n"
        "0.0,0.0,10.0,10\n"
        "0.2,0.3,10.1,20\n"
        "1.0,1.0,11.5,30\n",
        encoding="utf-8",
    )

    voxel_size_z = 1.2
    result = load_sensor_pointcloud(
        csv_path=csv_path,
        dataset_name="test-dataset",
        attribute="loadCell",
        view_mode="voxel",
        voxel_size_mm=2.0,
        voxel_size_z_mm=voxel_size_z,
        max_points=100,
    )

    raw_z_values = [p[2] + result.center[2] for p in result.points]
    assert raw_z_values
    assert min(raw_z_values) == pytest.approx(10.0 + voxel_size_z / 2, abs=1e-6)


def test_load_sensor_pointcloud_with_seed_is_deterministic(tmp_path: Path) -> None:
    csv_path = tmp_path / "Sensors.csv"
    rows = ["x,y,z,loadCell\n"]
    for i in range(120):
        rows.append(f"{i},{i * 0.5},{i * 0.1},{100 + i}\n")
    csv_path.write_text("".join(rows), encoding="utf-8")

    result_a = load_sensor_pointcloud(
        csv_path=csv_path,
        dataset_name="seeded",
        attribute="loadCell",
        view_mode="point",
        max_points=20,
        random_seed=12345,
    )
    result_b = load_sensor_pointcloud(
        csv_path=csv_path,
        dataset_name="seeded",
        attribute="loadCell",
        view_mode="point",
        max_points=20,
        random_seed=12345,
    )

    assert result_a.points == result_b.points


# --- Parsed-points cache bounding (REN-2 regression) ------------------------

@pytest.fixture
def isolated_cache(monkeypatch: pytest.MonkeyPatch) -> "OrderedDict":
    """Swap the module-global parsed-points cache for a fresh, isolated one."""
    cache: "OrderedDict" = OrderedDict()
    monkeypatch.setattr(spc, "_PARSED_DATA_CACHE", cache)
    return cache


def _cache_value() -> tuple[np.ndarray, np.ndarray]:
    return (np.zeros((1, 3), dtype=np.float32), np.zeros((1,), dtype=np.float32))


def _write_sensor_csv(directory: Path) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    csv_path = directory / "Sensors.csv"
    csv_path.write_text(
        "x,y,z,loadCell,laserPower\n"
        "0,0,0,100,120\n"
        "1,1,1,110,120\n"
        "2,2,2,120,120\n",
        encoding="utf-8",
    )
    return csv_path


def _load(csv_path: Path) -> None:
    load_sensor_pointcloud(
        csv_path=csv_path,
        dataset_name=csv_path.parent.name,
        attribute="loadCell",
        view_mode="point",
        max_points=10,
        random_seed=1,
        include_points_list=False,
    )


def test_store_evicts_stale_version_of_same_path_attribute(isolated_cache: "OrderedDict") -> None:
    with spc._PARSED_DATA_CACHE_LOCK:
        spc._store_cached_points(("/a", "loadCell", 1, 10), _cache_value())
        # A regenerated CSV changes mtime/size -> a *new* key for the same (path, attribute).
        spc._store_cached_points(("/a", "loadCell", 2, 12), _cache_value())

    # Only the latest version survives; the stale float32 arrays are dropped.
    assert list(isolated_cache) == [("/a", "loadCell", 2, 12)]


def test_store_caps_total_entries_evicting_oldest(
    isolated_cache: "OrderedDict", monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(spc, "_PARSED_DATA_CACHE_MAX", 3)

    with spc._PARSED_DATA_CACHE_LOCK:
        for i in range(5):
            spc._store_cached_points((f"/p{i}", "loadCell", 1, 1), _cache_value())

    assert len(isolated_cache) == 3
    assert [k[0] for k in isolated_cache] == ["/p2", "/p3", "/p4"]


def test_cache_hit_reorders_so_reused_entry_survives_eviction(
    isolated_cache: "OrderedDict", monkeypatch: pytest.MonkeyPatch, tmp_path: Path,
) -> None:
    monkeypatch.setattr(spc, "_PARSED_DATA_CACHE_MAX", 2)
    csv_a = _write_sensor_csv(tmp_path / "a")
    csv_b = _write_sensor_csv(tmp_path / "b")
    csv_c = _write_sensor_csv(tmp_path / "c")

    _load(csv_a)              # cache: [A]
    _load(csv_b)              # cache: [A, B]  (A is oldest)
    _load(csv_a)              # HIT -> A moves to end: [B, A]
    _load(csv_c)              # MISS -> store C, evict oldest (B): [A, C]

    paths = {key[0] for key in isolated_cache}
    assert str(csv_a.resolve()) in paths      # reused entry protected
    assert str(csv_c.resolve()) in paths      # newest entry present
    assert str(csv_b.resolve()) not in paths  # true LRU victim evicted
    assert len(isolated_cache) == 2
