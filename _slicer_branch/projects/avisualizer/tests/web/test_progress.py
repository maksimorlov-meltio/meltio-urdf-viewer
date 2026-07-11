"""Tests for parse-progress reporting during sensor-CSV processing."""

from __future__ import annotations

import csv

from avisualizer.web.services import sensor_pointcloud as sp


def _write_csv(path, rows: int) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["x", "y", "z", "loadCell", "laserPower"])
        for i in range(rows):
            writer.writerow([i * 0.001, i * 0.001, i * 0.001, 1.0, 100.0])


def test_parse_reports_progress(tmp_path) -> None:
    # Enough rows to cross the 25k reporting interval a few times.
    csv_path = tmp_path / "Sensors.csv"
    _write_csv(csv_path, 60_000)

    calls: list[tuple[str, float]] = []
    sp.set_progress_callback(lambda phase, pct: calls.append((phase, pct)))
    try:
        # Point view needs no open3d, so this runs anywhere.
        sp.load_sensor_pointcloud(
            csv_path=csv_path,
            dataset_name="t",
            attribute="loadCell",
            view_mode="point",
        )
    finally:
        sp.set_progress_callback(None)

    assert any(phase == "Parsing CSV" for phase, _ in calls)
    assert any(pct > 0 for _, pct in calls)


def test_progress_callback_can_be_cleared(tmp_path) -> None:
    # With no callback set, parsing must not raise.
    csv_path = tmp_path / "Sensors.csv"
    _write_csv(csv_path, 30_000)
    sp.set_progress_callback(None)
    sp.load_sensor_pointcloud(
        csv_path=csv_path, dataset_name="t", attribute="loadCell", view_mode="point"
    )
