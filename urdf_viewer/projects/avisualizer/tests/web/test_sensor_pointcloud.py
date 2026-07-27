from pathlib import Path

import pytest

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
