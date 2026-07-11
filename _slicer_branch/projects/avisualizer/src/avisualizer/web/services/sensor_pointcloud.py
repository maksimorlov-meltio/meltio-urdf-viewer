from __future__ import annotations

import csv
import tempfile
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import numpy as np

try:
    import open3d as o3d
except ImportError:  # pragma: no cover - exercised only if optional dependency missing
    o3d = None


# Progress callback set by the request handler while it processes an upload, so
# the parse loops can report progress without threading a parameter through every
# loader. A module global (not thread-local) so it's visible from the threadpool
# thread the processing runs in. One in-flight processing at a time is assumed
# (fine for this internal tool's handful of sporadic users).
_progress_lock = threading.Lock()
_progress_callback = None


def set_progress_callback(callback) -> None:
    """Set (or clear with ``None``) the parse-progress callback.

    ``callback`` is invoked as ``callback(phase: str, percent: float)``.
    """
    global _progress_callback
    with _progress_lock:
        _progress_callback = callback


def _report(phase: str, percent: float) -> None:
    with _progress_lock:
        callback = _progress_callback
    if callback is not None:
        try:
            callback(phase, float(percent))
        except Exception:  # pragma: no cover - progress is best-effort
            pass


class _ProgressLineReader:
    """Iterate a text handle line-by-line, counting bytes read to report parse
    progress. We can't use ``file.tell()`` here because Python disables it while
    a text file is being iterated; counting line lengths is accurate enough for
    a progress bar on these (mostly-ASCII) CSVs.
    """

    def __init__(self, handle, file_size: int) -> None:
        self._handle = handle
        self._size = max(1, file_size)
        self._read = 0
        # ~50 updates across the file, but no more often than every 256 KB.
        self._every = max(256 * 1024, self._size // 50)
        self._next = self._every

    def __iter__(self) -> "_ProgressLineReader":
        return self

    def __next__(self) -> str:
        line = self._handle.readline()
        if not line:
            raise StopIteration
        self._read += len(line)
        if self._read >= self._next:
            self._next += self._every
            _report("Parsing CSV", min(99.0, self._read / self._size * 100.0))
        return line


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


@dataclass(slots=True)
class MultiPointCloudResult:
    """Point-cloud render set carrying values for several attributes at once.

    The geometry (xyz + print-order index) is identical across attributes, so a
    single payload lets the frontend recolour instantly when the user switches
    attribute or toggles split view, with no extra backend round-trip.
    """

    dataset_name: str
    attributes: list[str]
    total_points: int
    rendered_points: int
    center: list[float]
    bounds_min: list[float]
    bounds_max: list[float]
    attribute_ranges: list[tuple[float, float]]
    backend_engine: str
    # Columns: [cx, cy, cz, index, a0, a1, ... a(K-1)]; stride = 4 + K.
    packed_points: np.ndarray


@dataclass(slots=True)
class MultiAttributeSeriesResult:
    dataset_name: str
    attributes: list[str]
    total_samples: int
    sampled_indices: list[int]
    sampled_coords: list[list[float]]
    # attribute name -> (sampled_values, min_value, max_value)
    series: dict[str, tuple[list[float], float, float]]


_PARSED_DATA_CACHE: dict[tuple[str, str, int, int], tuple[np.ndarray, np.ndarray]] = {}
_PARSED_DATA_CACHE_LOCK = threading.Lock()

# Cache for the unified multi-attribute parse: key -> (coords, attrs_2d, names).
_MULTI_DATA_CACHE: dict[
    tuple[str, str, int, int], tuple[np.ndarray, np.ndarray, list[str]]
] = {}
_MULTI_DATA_CACHE_LOCK = threading.Lock()

# Per-dataset build locks so concurrent requests for the same CSV (e.g. the
# point-cloud and the attribute-series endpoints fired in parallel by the
# frontend) only parse the file once instead of racing into duplicate parses.
_MULTI_BUILD_LOCKS: dict[str, threading.Lock] = {}
_MULTI_BUILD_LOCKS_GUARD = threading.Lock()


def _get_multi_build_lock(key_token: str) -> threading.Lock:
    with _MULTI_BUILD_LOCKS_GUARD:
        lock = _MULTI_BUILD_LOCKS.get(key_token)
        if lock is None:
            lock = threading.Lock()
            _MULTI_BUILD_LOCKS[key_token] = lock
        return lock


def _normalize_column_name(name: str | None) -> str:
    if not name:
        return ""
    return "".join(ch for ch in name.lower() if ch.isalnum())


def _build_normalized_field_lookup(fieldnames: list[str]) -> dict[str, str]:
    lookup: dict[str, str] = {}
    for field in fieldnames:
        normalized = _normalize_column_name(field)
        if normalized and normalized not in lookup:
            lookup[normalized] = field
    return lookup


def _resolve_field_name(
    fieldnames: list[str],
    requested: str,
    *,
    aliases: tuple[str, ...] = (),
) -> str | None:
    if requested in fieldnames:
        return requested

    normalized_lookup = _build_normalized_field_lookup(fieldnames)
    candidates = (requested, *aliases)
    for candidate in candidates:
        normalized = _normalize_column_name(candidate)
        if normalized in normalized_lookup:
            return normalized_lookup[normalized]

    return None


def _get_cache_key(csv_path: Path, attribute: str) -> tuple[str, str, int, int]:
    stat = csv_path.stat()
    return (str(csv_path.resolve()), attribute, int(stat.st_mtime_ns), int(stat.st_size))


def _get_npz_cache_path(csv_path: Path, attribute: str) -> Path:
    return csv_path.with_name(f"Sensors.{attribute}.cache.npz")


def _parse_all_points(csv_path: Path, attribute: str) -> tuple[np.ndarray, np.ndarray]:
    coords_list: list[tuple[float, float, float]] = []
    attrs_list: list[float] = []

    with csv_path.open("r", encoding="utf-8", errors="replace", newline="") as handle:
        reader = csv.DictReader(_ProgressLineReader(handle, csv_path.stat().st_size))
        fieldnames = reader.fieldnames or []
        x_field = _resolve_field_name(fieldnames, "x", aliases=("posX", "coordX"))
        y_field = _resolve_field_name(fieldnames, "y", aliases=("posY", "coordY"))
        z_field = _resolve_field_name(fieldnames, "z", aliases=("posZ", "coordZ"))
        attribute_field = _resolve_field_name(fieldnames, attribute)

        missing = []
        if x_field is None:
            missing.append("x")
        if y_field is None:
            missing.append("y")
        if z_field is None:
            missing.append("z")
        if attribute_field is None:
            missing.append(attribute)

        if missing:
            missing_text = ", ".join(sorted(missing))
            raise ValueError(f"CSV is missing required columns: {missing_text}")

        laser_power_field = _resolve_field_name(fieldnames, "laserPower")

        for row in reader:
            x = _parse_float(row.get(x_field))
            y = _parse_float(row.get(y_field))
            z = _parse_float(row.get(z_field))
            attr = _parse_float(row.get(attribute_field))
            if x is None or y is None or z is None or attr is None:
                continue

            if laser_power_field is not None:
                laser_power = _parse_float(row.get(laser_power_field))
                if laser_power is not None and laser_power == 0.0:
                    continue

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
    # Average source index (timestamp proxy) per voxel, so downstream consumers
    # can identify the voxel with the highest average timestamp.
    index_sums = np.bincount(inverse, weights=point_indices.astype(np.float64))
    mean_indices = index_sums / counts.astype(np.float64)

    centers = min_bounds + (unique_indices.astype(np.float64) + 0.5) * step
    return centers.astype(np.float32), means.astype(np.float32), mean_indices.astype(np.float64)


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

    if total_points == 0:
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
            points=[] if include_points_list else [],
        )

    center, min_bound, max_bound, backend_engine = _compute_bounds_and_center(
        coords_all,
        require_open3d=view_mode == "voxel",
    )

    coords = coords_all
    attrs = attrs_all
    point_indices = np.arange(total_points, dtype=np.int64)
    if total_points > max_points:
        sample_indices = rng.choice(total_points, size=max_points, replace=False)
        coords = coords_all[sample_indices]
        attrs = attrs_all[sample_indices]
        point_indices = point_indices[sample_indices]

    render_coords = coords
    render_attrs = attrs
    if view_mode == "voxel":
        _report("Voxelizing", 99.0)
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


def _multi_cache_key(
    csv_path: Path, attributes: list[str], cache_token: str | None = None
) -> tuple[str, str, int, int]:
    token = ",".join(attributes)
    if cache_token is not None:
        # Content-addressed (upload) cache: the token already identifies the
        # exact bytes, so the throwaway temp path / mtime must not be part of
        # the key (otherwise every upload would miss the cache).
        return (f"token:{cache_token}", token, 0, 0)
    stat = csv_path.stat()
    return (str(csv_path.resolve()), token, int(stat.st_mtime_ns), int(stat.st_size))


def _get_multi_npz_cache_path(csv_path: Path, cache_token: str | None = None) -> Path:
    if cache_token is not None:
        cache_dir = Path(tempfile.gettempdir()) / "avisualizer_cache"
        cache_dir.mkdir(parents=True, exist_ok=True)
        return cache_dir / f"{cache_token}.npz"
    return csv_path.with_name("Sensors.__multi__.cache.npz")


def _parse_multi_points(
    csv_path: Path, attributes: list[str]
) -> tuple[np.ndarray, np.ndarray, list[str]]:
    """Parse the CSV once, extracting xyz plus every requested attribute column.

    Rows are kept on the same criteria as the single-attribute parse (valid xyz
    and laserPower != 0) so the resulting point set — and therefore its sampling
    and print-order index — is identical regardless of which attribute is later
    coloured. A missing value for a given attribute is stored as NaN.
    """
    with csv_path.open("r", encoding="utf-8", errors="replace", newline="") as handle:
        reader = csv.DictReader(_ProgressLineReader(handle, csv_path.stat().st_size))
        fieldnames = reader.fieldnames or []
        x_field = _resolve_field_name(fieldnames, "x", aliases=("posX", "coordX"))
        y_field = _resolve_field_name(fieldnames, "y", aliases=("posY", "coordY"))
        z_field = _resolve_field_name(fieldnames, "z", aliases=("posZ", "coordZ"))

        missing = []
        if x_field is None:
            missing.append("x")
        if y_field is None:
            missing.append("y")
        if z_field is None:
            missing.append("z")
        if missing:
            missing_text = ", ".join(sorted(missing))
            raise ValueError(f"CSV is missing required columns: {missing_text}")

        resolved_attr_fields: list[tuple[str, str]] = []
        for attribute in attributes:
            field = _resolve_field_name(fieldnames, attribute)
            if field is not None:
                resolved_attr_fields.append((attribute, field))

        if not resolved_attr_fields:
            raise ValueError("CSV is missing all requested attribute columns")

        laser_power_field = _resolve_field_name(fieldnames, "laserPower")

        coords_list: list[tuple[float, float, float]] = []
        attrs_rows: list[list[float]] = []

        for row in reader:
            x = _parse_float(row.get(x_field))
            y = _parse_float(row.get(y_field))
            z = _parse_float(row.get(z_field))
            if x is None or y is None or z is None:
                continue

            if laser_power_field is not None:
                laser_power = _parse_float(row.get(laser_power_field))
                if laser_power is not None and laser_power == 0.0:
                    continue

            values: list[float] = []
            for _, field in resolved_attr_fields:
                parsed = _parse_float(row.get(field))
                values.append(float("nan") if parsed is None else parsed)

            coords_list.append((x, y, z))
            attrs_rows.append(values)

    names = [name for name, _ in resolved_attr_fields]
    if not coords_list:
        return (
            np.empty((0, 3), dtype=np.float32),
            np.empty((0, len(names)), dtype=np.float32),
            names,
        )

    coords = np.asarray(coords_list, dtype=np.float32)
    attrs = np.asarray(attrs_rows, dtype=np.float32)
    return coords, attrs, names


def _load_or_build_multi_points(
    csv_path: Path, attributes: list[str], cache_token: str | None = None
) -> tuple[np.ndarray, np.ndarray, list[str]]:
    key = _multi_cache_key(csv_path, attributes, cache_token)

    with _MULTI_DATA_CACHE_LOCK:
        cached = _MULTI_DATA_CACHE.get(key)
    if cached is not None:
        return cached

    # Serialize the (expensive) parse per dataset so the point-cloud and
    # attribute-series endpoints — fired in parallel for the same upload — share
    # one parse instead of each re-reading the whole CSV.
    build_lock = _get_multi_build_lock(f"{key[0]}|{key[1]}")
    with build_lock:
        with _MULTI_DATA_CACHE_LOCK:
            cached = _MULTI_DATA_CACHE.get(key)
        if cached is not None:
            return cached

        npz_cache_path = _get_multi_npz_cache_path(csv_path, cache_token)

        coords: np.ndarray | None = None
        attrs: np.ndarray | None = None
        names: list[str] | None = None

        # Content-addressed caches (uploads) are keyed by the file bytes, so the
        # mere existence of the npz proves freshness. Path-based caches still
        # guard against an edited CSV via mtime.
        if cache_token is not None:
            npz_is_fresh = npz_cache_path.exists()
        else:
            npz_is_fresh = npz_cache_path.exists() and int(
                npz_cache_path.stat().st_mtime_ns
            ) >= int(csv_path.stat().st_mtime_ns)

        if npz_is_fresh:
            try:
                with np.load(npz_cache_path, allow_pickle=False) as archive:
                    stored_names = [str(n) for n in archive["names"].tolist()]
                    stored_index = {name: i for i, name in enumerate(stored_names)}
                    # Reuse the cache only if it already holds every attribute we need.
                    if all(name in stored_index for name in attributes):
                        stored_coords = archive["coords"].astype(np.float32, copy=False)
                        stored_attrs = archive["attrs"].astype(np.float32, copy=False)
                        cols = [stored_index[name] for name in attributes]
                        coords = stored_coords
                        attrs = stored_attrs[:, cols] if stored_attrs.size else stored_attrs.reshape(
                            stored_coords.shape[0], 0
                        )
                        names = list(attributes)
            except Exception:
                coords = attrs = names = None

        if coords is None or attrs is None or names is None:
            coords, attrs, names = _parse_multi_points(csv_path=csv_path, attributes=attributes)
            try:
                cache_parent = npz_cache_path.parent
                with tempfile.NamedTemporaryFile(
                    mode="wb",
                    suffix=".npz",
                    prefix=".tmp_multi_cache_",
                    dir=str(cache_parent),
                    delete=False,
                ) as temp_file:
                    temp_path = Path(temp_file.name)
                np.savez_compressed(
                    temp_path,
                    coords=coords,
                    attrs=attrs,
                    names=np.asarray(names),
                )
                temp_path.replace(npz_cache_path)
            except Exception:
                pass

        with _MULTI_DATA_CACHE_LOCK:
            _MULTI_DATA_CACHE[key] = (coords, attrs, names)
        return coords, attrs, names


def load_sensor_pointcloud_multi(
    csv_path: Path,
    dataset_name: str,
    attributes: list[str],
    max_points: int = 150_000,
    random_seed: int | None = None,
    cache_token: str | None = None,
) -> MultiPointCloudResult:
    """Build a point-cloud render set carrying all requested attribute values.

    Point view only (no voxel aggregation): the frontend caches this once and
    recolours client-side when the attribute or split selection changes.
    """
    rng = np.random.default_rng(random_seed)
    coords_all, attrs_all, names = _load_or_build_multi_points(
        csv_path=csv_path, attributes=attributes, cache_token=cache_token
    )
    total_points = int(coords_all.shape[0])
    num_attrs = len(names)

    if total_points == 0:
        empty_packed = np.empty((0, 4 + num_attrs), dtype=np.float32)
        return MultiPointCloudResult(
            dataset_name=dataset_name,
            attributes=names,
            total_points=0,
            rendered_points=0,
            center=[0.0, 0.0, 0.0],
            bounds_min=[0.0, 0.0, 0.0],
            bounds_max=[0.0, 0.0, 0.0],
            attribute_ranges=[(0.0, 0.0) for _ in names],
            backend_engine="none",
            packed_points=empty_packed,
        )

    center, min_bound, max_bound, backend_engine = _compute_bounds_and_center(
        coords_all,
        require_open3d=False,
    )

    point_indices = np.arange(total_points, dtype=np.int64)
    coords = coords_all
    attrs = attrs_all
    if total_points > max_points:
        sample_indices = rng.choice(total_points, size=max_points, replace=False)
        coords = coords_all[sample_indices]
        attrs = attrs_all[sample_indices]
        point_indices = point_indices[sample_indices]

    centered_coords = coords - center
    packed = np.column_stack(
        (
            centered_coords,
            point_indices.astype(np.float32),
            attrs,
        )
    ).astype(np.float32)

    attribute_ranges: list[tuple[float, float]] = []
    for col in range(num_attrs):
        column = attrs[:, col]
        finite = column[np.isfinite(column)]
        if finite.size == 0:
            attribute_ranges.append((0.0, 0.0))
        else:
            attribute_ranges.append((float(np.min(finite)), float(np.max(finite))))

    return MultiPointCloudResult(
        dataset_name=dataset_name,
        attributes=names,
        total_points=total_points,
        rendered_points=int(packed.shape[0]),
        center=center.tolist(),
        bounds_min=min_bound.tolist(),
        bounds_max=max_bound.tolist(),
        attribute_ranges=attribute_ranges,
        backend_engine=backend_engine,
        packed_points=packed,
    )


def load_attribute_series_multi(
    csv_path: Path,
    dataset_name: str,
    attributes: list[str],
    max_samples: int = 1200,
    cache_token: str | None = None,
) -> MultiAttributeSeriesResult:
    """Downsampled time series for every requested attribute, sharing one parse."""
    if max_samples <= 0:
        raise ValueError("max_samples must be greater than 0")

    coords_all, attrs_all, names = _load_or_build_multi_points(
        csv_path=csv_path, attributes=attributes, cache_token=cache_token
    )
    total = int(attrs_all.shape[0])

    if total == 0:
        return MultiAttributeSeriesResult(
            dataset_name=dataset_name,
            attributes=names,
            total_samples=0,
            sampled_indices=[],
            sampled_coords=[],
            series={name: ([], 0.0, 0.0) for name in names},
        )

    if total <= max_samples:
        sample_indices = np.arange(total, dtype=np.int64)
    else:
        sample_indices = np.linspace(0, total - 1, num=max_samples, dtype=np.int64)

    sampled_coords = coords_all[sample_indices]

    series: dict[str, tuple[list[float], float, float]] = {}
    for col, name in enumerate(names):
        column = attrs_all[:, col]
        sampled = column[sample_indices]
        finite = column[np.isfinite(column)]
        if finite.size == 0:
            min_value = 0.0
            max_value = 0.0
        else:
            min_value = float(np.min(finite))
            max_value = float(np.max(finite))
        series[name] = (
            sampled.astype(np.float32, copy=False).tolist(),
            min_value,
            max_value,
        )

    return MultiAttributeSeriesResult(
        dataset_name=dataset_name,
        attributes=names,
        total_samples=total,
        sampled_indices=sample_indices.astype(np.int64, copy=False).tolist(),
        sampled_coords=sampled_coords.astype(np.float32, copy=False).tolist(),
        series=series,
    )
