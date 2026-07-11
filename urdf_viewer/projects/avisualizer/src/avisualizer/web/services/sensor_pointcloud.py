from __future__ import annotations

import csv
import random
import tempfile
import threading
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import numpy as np

try:
    import open3d as o3d
except ImportError:  # pragma: no cover - exercised only if optional dependency missing
    o3d = None


@dataclass(slots=True)
class SensorPointCloudResult:
    dataset_name: str
    attribute: str
    view_mode: Literal["point", "voxel"]
    voxel_size_mm: float
    voxel_size_z_mm: float
    total_points: int
    rendered_points: int
    center: list[float]
    bounds_min: list[float]
    bounds_max: list[float]
    attribute_min: float
    attribute_max: float
    backend_engine: str
    packed_points: np.ndarray
    points: list[list[float]]


@dataclass(slots=True)
class AttributeSeriesResult:
    dataset_name: str
    attribute: str
    total_samples: int
    sampled_values: list[float]
    sampled_indices: list[int]
    sampled_points: list[list[float]]
    min_value: float
    max_value: float


_PARSED_DATA_CACHE: dict[tuple[str, str, int, int], tuple[np.ndarray, np.ndarray]] = {}
_PARSED_DATA_CACHE_LOCK = threading.Lock()


def _get_cache_key(csv_path: Path, attribute: str) -> tuple[str, str, int, int]:
    stat = csv_path.stat()
    return (str(csv_path.resolve()), attribute, int(stat.st_mtime_ns), int(stat.st_size))


def _get_npz_cache_path(csv_path: Path, attribute: str) -> Path:
    return csv_path.with_name(f"Sensors.{attribute}.cache.npz")


def _iter_sensor_rows(csv_path: Path, attribute: str) -> Iterator[tuple[float, float, float, float]]:
    """Yield ``(x, y, z, attribute)`` tuples for usable rows in a sensor CSV.

    Validates that the required columns exist and skips rows with non-numeric
    coordinates/values or, when a ``laserPower`` column is present, zero laser
    power (laser-off travel moves).
    """
    with csv_path.open("r", encoding="utf-8", errors="replace", newline="") as handle:
        reader = csv.DictReader(handle)
        fieldnames = reader.fieldnames or []
        missing = {col for col in ("x", "y", "z", attribute) if col not in fieldnames}
        if missing:
            missing_text = ", ".join(sorted(missing))
            raise ValueError(f"CSV is missing required columns: {missing_text}")

        has_laser_power = "laserPower" in fieldnames

        for row in reader:
            x = _parse_float(row.get("x"))
            y = _parse_float(row.get("y"))
            z = _parse_float(row.get("z"))
            attr = _parse_float(row.get(attribute))
            if x is None or y is None or z is None or attr is None:
                continue

            if has_laser_power:
                laser_power = _parse_float(row.get("laserPower"))
                if laser_power is not None and laser_power == 0.0:
                    continue

            yield x, y, z, attr


def _parse_all_points(csv_path: Path, attribute: str) -> tuple[np.ndarray, np.ndarray]:
    coords_list: list[tuple[float, float, float]] = []
    attrs_list: list[float] = []

    for x, y, z, attr in _iter_sensor_rows(csv_path, attribute):
        coords_list.append((x, y, z))
        attrs_list.append(attr)

    if not coords_list:
        return np.empty((0, 3), dtype=np.float32), np.empty((0,), dtype=np.float32)

    return np.asarray(coords_list, dtype=np.float32), np.asarray(attrs_list, dtype=np.float32)


def _load_or_build_cached_points(csv_path: Path, attribute: str) -> tuple[np.ndarray, np.ndarray]:
    key = _get_cache_key(csv_path, attribute)

    with _PARSED_DATA_CACHE_LOCK:
        cached = _PARSED_DATA_CACHE.get(key)
    if cached is not None:
        return cached

    npz_cache_path = _get_npz_cache_path(csv_path, attribute)
    csv_mtime_ns = int(csv_path.stat().st_mtime_ns)

    coords: np.ndarray
    attrs: np.ndarray
    loaded_from_npz = False

    if npz_cache_path.exists() and int(npz_cache_path.stat().st_mtime_ns) >= csv_mtime_ns:
        try:
            with np.load(npz_cache_path, allow_pickle=False) as archive:
                coords = archive["coords"].astype(np.float32, copy=False)
                attrs = archive["attrs"].astype(np.float32, copy=False)
                loaded_from_npz = True
        except Exception:
            loaded_from_npz = False

    if not loaded_from_npz:
        coords, attrs = _parse_all_points(csv_path=csv_path, attribute=attribute)
        try:
            cache_parent = npz_cache_path.parent
            with tempfile.NamedTemporaryFile(
                mode="wb",
                suffix=".npz",
                prefix=".tmp_sensor_cache_",
                dir=str(cache_parent),
                delete=False,
            ) as temp_file:
                temp_path = Path(temp_file.name)
            np.savez_compressed(temp_path, coords=coords, attrs=attrs)
            temp_path.replace(npz_cache_path)
        except Exception:
            pass

    with _PARSED_DATA_CACHE_LOCK:
        _PARSED_DATA_CACHE[key] = (coords, attrs)
    return coords, attrs


def _compute_bounds_and_center(
    coords: np.ndarray,
    *,
    require_open3d: bool,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, str]:
    if o3d is not None:
        cloud = o3d.geometry.PointCloud()
        cloud.points = o3d.utility.Vector3dVector(coords.astype(np.float64))
        bounds = cloud.get_axis_aligned_bounding_box()
        center = np.asarray(bounds.get_center(), dtype=np.float32)
        min_bound = np.asarray(bounds.min_bound, dtype=np.float32)
        max_bound = np.asarray(bounds.max_bound, dtype=np.float32)
        return center, min_bound, max_bound, "open3d"

    if require_open3d:
        raise RuntimeError(
            "open3d is not installed. Re-run scripts/setup.ps1 with Python 3.11."
        )

    min_bound = np.min(coords, axis=0).astype(np.float32)
    max_bound = np.max(coords, axis=0).astype(np.float32)
    center = ((min_bound + max_bound) * 0.5).astype(np.float32)
    return center, min_bound, max_bound, "numpy"


def _parse_float(value: str) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _reservoir_sample_points(
    csv_path: Path,
    attribute: str,
    max_points: int,
) -> tuple[np.ndarray, np.ndarray, int, float, float]:
    if max_points <= 0:
        raise ValueError("max_points must be greater than 0")

    coords = np.empty((max_points, 3), dtype=np.float32)
    attrs = np.empty(max_points, dtype=np.float32)

    attribute_min = float("inf")
    attribute_max = float("-inf")
    total_points = 0

    for x, y, z, attr in _iter_sensor_rows(csv_path, attribute):
        attribute_min = min(attribute_min, attr)
        attribute_max = max(attribute_max, attr)

        if total_points < max_points:
            coords[total_points] = (x, y, z)
            attrs[total_points] = attr
        else:
            replacement_index = random.randint(0, total_points)
            if replacement_index < max_points:
                coords[replacement_index] = (x, y, z)
                attrs[replacement_index] = attr

        total_points += 1

    sampled = min(total_points, max_points)
    if sampled == 0:
        return np.empty((0, 3), dtype=np.float32), np.empty((0,), dtype=np.float32), 0, 0.0, 0.0

    return (
        coords[:sampled],
        attrs[:sampled],
        total_points,
        float(attribute_min),
        float(attribute_max),
    )


def _aggregate_voxels_open3d(
    coords: np.ndarray,
    attrs: np.ndarray,
    point_indices: np.ndarray,
    voxel_size_mm: float,
    voxel_size_z_mm: float,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    if voxel_size_mm <= 0:
        raise ValueError("voxel_size_mm must be greater than 0")
    if voxel_size_z_mm <= 0:
        raise ValueError("voxel_size_z_mm must be greater than 0")
    # Anchor voxel bins at CSV minima so the first voxel center is exactly
    # min + half-voxel on each axis (including Z).
    min_bounds = np.min(coords, axis=0).astype(np.float64)
    step = np.asarray([voxel_size_mm, voxel_size_mm, voxel_size_z_mm], dtype=np.float64)
    indices = np.floor((coords.astype(np.float64) - min_bounds) / step).astype(np.int32)

    if indices.shape[0] == 0:
        return (
            np.empty((0, 3), dtype=np.float32),
            np.empty((0,), dtype=np.float32),
            np.empty((0,), dtype=np.int64),
        )

    unique_indices, inverse, counts = np.unique(
        indices,
        axis=0,
        return_inverse=True,
        return_counts=True,
    )
    sums = np.bincount(inverse, weights=attrs.astype(np.float64))
    means = sums / counts.astype(np.float64)
    representative_local = np.full(unique_indices.shape[0], indices.shape[0], dtype=np.int64)
    np.minimum.at(representative_local, inverse, np.arange(indices.shape[0], dtype=np.int64))
    representative_indices = point_indices[representative_local]

    centers = min_bounds + (unique_indices.astype(np.float64) + 0.5) * step
    return centers.astype(np.float32), means.astype(np.float32), representative_indices.astype(np.int64)


def _sample_render_set(
    coords: np.ndarray,
    attrs: np.ndarray,
    point_indices: np.ndarray,
    max_points: int,
    rng: np.random.Generator,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    if coords.shape[0] <= max_points:
        return coords, attrs, point_indices

    indices = rng.choice(coords.shape[0], size=max_points, replace=False)
    return coords[indices], attrs[indices], point_indices[indices]


def load_sensor_pointcloud(
    csv_path: Path,
    dataset_name: str,
    attribute: str = "loadCell",
    view_mode: Literal["point", "voxel"] = "point",
    voxel_size_mm: float = 2.0,
    voxel_size_z_mm: float = 1.2,
    max_points: int = 150_000,
    random_seed: int | None = None,
    include_points_list: bool = True,
) -> SensorPointCloudResult:
    rng = np.random.default_rng(random_seed)
    coords_all, attrs_all = _load_or_build_cached_points(csv_path=csv_path, attribute=attribute)
    total_points = int(coords_all.shape[0])

    coords = coords_all
    attrs = attrs_all
    point_indices = np.arange(total_points, dtype=np.int64)
    if total_points > max_points:
        sample_indices = rng.choice(total_points, size=max_points, replace=False)
        coords = coords_all[sample_indices]
        attrs = attrs_all[sample_indices]
        point_indices = point_indices[sample_indices]

    if coords.shape[0] == 0:
        empty_packed = np.empty((0, 5), dtype=np.float32)
        return SensorPointCloudResult(
            dataset_name=dataset_name,
            attribute=attribute,
            view_mode=view_mode,
            voxel_size_mm=voxel_size_mm,
            voxel_size_z_mm=voxel_size_z_mm,
            total_points=0,
            rendered_points=0,
            center=[0.0, 0.0, 0.0],
            bounds_min=[0.0, 0.0, 0.0],
            bounds_max=[0.0, 0.0, 0.0],
            attribute_min=0.0,
            attribute_max=0.0,
            backend_engine="none",
            packed_points=empty_packed,
            points=[],
        )

    center, min_bound, max_bound, backend_engine = _compute_bounds_and_center(
        coords,
        require_open3d=False,
    )

    render_coords = coords
    render_attrs = attrs
    if view_mode == "voxel":
        render_coords, render_attrs, point_indices = _aggregate_voxels_open3d(
            coords=coords,
            attrs=attrs,
            point_indices=point_indices,
            voxel_size_mm=voxel_size_mm,
            voxel_size_z_mm=voxel_size_z_mm,
        )

    render_coords, render_attrs, point_indices = _sample_render_set(
        coords=render_coords,
        attrs=render_attrs,
        point_indices=point_indices,
        max_points=max_points,
        rng=rng,
    )

    if render_coords.shape[0] == 0:
        attribute_min = 0.0
        attribute_max = 0.0
    else:
        attribute_min = float(np.min(render_attrs))
        attribute_max = float(np.max(render_attrs))

    centered_coords = render_coords - center
    packed = np.column_stack((centered_coords, render_attrs, point_indices.astype(np.float32))).astype(np.float32)
    points_list = packed.tolist() if include_points_list else []

    return SensorPointCloudResult(
        dataset_name=dataset_name,
        attribute=attribute,
        view_mode=view_mode,
        voxel_size_mm=voxel_size_mm,
        voxel_size_z_mm=voxel_size_z_mm,
        total_points=total_points,
        rendered_points=int(packed.shape[0]),
        center=center.tolist(),
        bounds_min=min_bound.tolist(),
        bounds_max=max_bound.tolist(),
        attribute_min=attribute_min,
        attribute_max=attribute_max,
        backend_engine=backend_engine,
        packed_points=packed,
        points=points_list,
    )


def load_attribute_series(
    csv_path: Path,
    dataset_name: str,
    attribute: str = "loadCell",
    max_samples: int = 1200,
) -> AttributeSeriesResult:
    if max_samples <= 0:
        raise ValueError("max_samples must be greater than 0")

    coords_all, attrs_all = _load_or_build_cached_points(csv_path=csv_path, attribute=attribute)
    total = int(attrs_all.shape[0])

    if total == 0:
        return AttributeSeriesResult(
            dataset_name=dataset_name,
            attribute=attribute,
            total_samples=0,
            sampled_values=[],
            sampled_indices=[],
            sampled_points=[],
            min_value=0.0,
            max_value=0.0,
        )

    min_value = float(np.min(attrs_all))
    max_value = float(np.max(attrs_all))

    if total <= max_samples:
        sampled = attrs_all
        sampled_indices = np.arange(total, dtype=np.int64)
        sampled_coords = coords_all
    else:
        sample_indices = np.linspace(0, total - 1, num=max_samples, dtype=np.int64)
        sampled = attrs_all[sample_indices]
        sampled_indices = sample_indices
        sampled_coords = coords_all[sample_indices]

    sampled_points = np.column_stack(
        (
            sampled_coords.astype(np.float32, copy=False),
            sampled.astype(np.float32, copy=False),
            sampled_indices.astype(np.float32, copy=False),
        )
    ).astype(np.float32, copy=False)

    return AttributeSeriesResult(
        dataset_name=dataset_name,
        attribute=attribute,
        total_samples=total,
        sampled_values=sampled.astype(np.float32, copy=False).tolist(),
        sampled_indices=sampled_indices.astype(np.int64, copy=False).tolist(),
        sampled_points=sampled_points.tolist(),
        min_value=min_value,
        max_value=max_value,
    )
