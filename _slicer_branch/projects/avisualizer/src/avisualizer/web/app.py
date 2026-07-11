from __future__ import annotations

import csv
import hashlib
import os
import tempfile
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Callable, Literal

import uvicorn
from fastapi import Body, FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

from .services import uploads
from .services.sensor_pointcloud import (
    load_attribute_series,
    load_attribute_series_multi,
    load_sensor_pointcloud,
    load_sensor_pointcloud_multi,
    set_progress_callback,
)


PROJECT_ROOT = Path(__file__).resolve().parents[3]
DATABASE_ROOT = Path(os.environ.get("MELTIO_ORBIT_DATABASE_ROOT", str(PROJECT_ROOT / "database")))
ASSETS_ROOT = Path(os.environ.get("MELTIO_ORBIT_ASSETS_ROOT", str(PROJECT_ROOT / "assets")))
STATIC_DIR = Path(__file__).resolve().parent / "static"
DEFAULT_DATASET_NAME = "small-torture-test_1-0-0"


async def _resolve_csv(
    sensors_file: UploadFile | None, s3_key: str
) -> tuple[Path, str, Callable[[], None]]:
    """Resolve sensor-CSV input to ``(local_path, cache_token, cleanup)``.

    Accepts either a presigned-S3 upload (``s3_key`` — downloaded once and cached
    across a dataset's many view requests) or a legacy multipart ``sensors_file``.
    The cache token keys the parsed-npz cache so repeated views reuse one parse.
    """
    if s3_key:
        try:
            path = uploads.download_to_temp(s3_key)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:  # noqa: BLE001 - S3/client errors surface as 400
            raise HTTPException(
                status_code=400, detail=f"Could not fetch upload: {exc}"
            ) from exc
        token = hashlib.blake2b(s3_key.encode("utf-8"), digest_size=16).hexdigest()
        return path, token, lambda: None

    if sensors_file is None:
        raise HTTPException(
            status_code=400, detail="No sensors file or upload key provided"
        )
    file_name = sensors_file.filename or ""
    if not file_name.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Expected a CSV sensors file")
    payload = await sensors_file.read()
    await sensors_file.close()
    if not payload:
        raise HTTPException(status_code=400, detail="Uploaded sensors file is empty")
    token = hashlib.blake2b(payload, digest_size=16).hexdigest()
    with tempfile.NamedTemporaryFile(
        prefix="avisualizer_upload_", suffix=".csv", delete=False
    ) as temp_file:
        temp_file.write(payload)
        path = Path(temp_file.name)

    def cleanup() -> None:
        path.unlink(missing_ok=True)

    return path, token, cleanup


class _ProcessingProgress:
    """Process-wide, coarse progress for the upload currently being processed.

    Polled by the frontend so big first-loads (parse + voxelize of a large CSV)
    show progress instead of appearing to hang. One global tracker is fine for
    this internal tool's handful of sporadic users.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._active = False
        self._phase = ""
        self._percent = 0.0

    def start(self, phase: str) -> None:
        with self._lock:
            self._active = True
            self._phase = phase
            self._percent = 0.0

    def update(self, phase: str, percent: float) -> None:
        with self._lock:
            self._phase = phase
            self._percent = percent

    def finish(self) -> None:
        with self._lock:
            self._active = False
            self._phase = "Done"
            self._percent = 100.0

    def snapshot(self) -> dict:
        with self._lock:
            return {
                "active": self._active,
                "phase": self._phase,
                "percent": round(self._percent, 1),
            }


def _detect_dataset_system(dataset_name: str) -> str:
    dataset_dir = DATABASE_ROOT / dataset_name
    has_print_info_db = (dataset_dir / "PrintInfo.db").exists()
    has_register_txt = (dataset_dir / "Register.txt").exists()

    # Engine exports include PrintInfo.db/Register.txt; legacy M600 datasets do not.
    if has_print_info_db and has_register_txt:
        return "engine"

    return "m600"


def _list_urdf_models() -> list[dict[str, str]]:
    models: list[dict[str, str]] = []
    for urdf_path in sorted(ASSETS_ROOT.rglob("*.urdf"), key=lambda p: p.as_posix().lower()):
        if not urdf_path.is_file():
            continue

        relative_path = urdf_path.relative_to(ASSETS_ROOT).as_posix()
        model_name = urdf_path.with_suffix("").relative_to(ASSETS_ROOT).as_posix()
        models.append(
            {
                "name": model_name,
                "url": f"/assets/{relative_path}",
            }
        )
    return models


def _resolve_sensor_csv(dataset: str) -> tuple[str, Path]:
    dataset_name = Path(dataset).name
    csv_path = DATABASE_ROOT / dataset_name / "Sensors.csv"
    if not csv_path.exists():
        raise HTTPException(status_code=404, detail=f"Dataset '{dataset_name}' not found")
    return dataset_name, csv_path


def _read_csv_headers(csv_path: Path) -> list[str]:
    with csv_path.open("r", encoding="utf-8", errors="replace", newline="") as handle:
        reader = csv.reader(handle)
        header = next(reader, [])
    return [str(col).strip() for col in header if str(col).strip()]


def _normalize_system_hint(system_hint: str | None) -> str:
    normalized = (system_hint or "").strip().lower()
    if normalized in {"engine", "m600"}:
        return normalized
    return "m600"


def _build_binary_sensor_response_from_csv(
    dataset_name: str,
    csv_path: Path,
    system_type: str,
    attribute: str,
    view: Literal["point", "voxel"],
    voxel_size_mm: float,
    voxel_size_z_mm: float,
    max_points: int,
    random_seed: int | None,
) -> Response:
    if not csv_path.exists():
        raise HTTPException(status_code=404, detail=f"Dataset '{dataset_name}' not found")

    grid_origin = "center" if system_type == "engine" else "corner"
    try:
        result = load_sensor_pointcloud(
            csv_path=csv_path,
            dataset_name=dataset_name,
            attribute=attribute,
            view_mode=view,
            voxel_size_mm=voxel_size_mm,
            voxel_size_z_mm=voxel_size_z_mm,
            max_points=max_points,
            random_seed=random_seed,
            include_points_list=False,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    headers = {
        "X-AV-Dataset": result.dataset_name,
        "X-AV-Attribute": result.attribute,
        "X-AV-ViewMode": result.view_mode,
        "X-AV-VoxelSizeMm": str(result.voxel_size_mm),
        "X-AV-VoxelSizeZMm": str(result.voxel_size_z_mm),
        "X-AV-BackendEngine": result.backend_engine,
        "X-AV-TotalPoints": str(result.total_points),
        "X-AV-RenderedPoints": str(result.rendered_points),
        "X-AV-Center": ",".join(str(v) for v in result.center),
        "X-AV-Bounds-Min": ",".join(str(v) for v in result.bounds_min),
        "X-AV-Bounds-Max": ",".join(str(v) for v in result.bounds_max),
        "X-AV-Attr-Range": f"{result.attribute_min},{result.attribute_max}",
        "X-AV-PointStride": "5",
        "X-AV-System": system_type,
        "X-AV-GridOrigin": grid_origin,
        # Binary float payloads are incompressible; mark as identity so the
        # GZipMiddleware skips compressing them (saves ~2.5s per request).
        "Content-Encoding": "identity",
    }

    return Response(
        content=result.packed_points.astype("float32", copy=False).tobytes(order="C"),
        media_type="application/octet-stream",
        headers=headers,
    )


def _build_binary_sensor_response(
    dataset: str,
    attribute: str,
    view: Literal["point", "voxel"],
    voxel_size_mm: float,
    voxel_size_z_mm: float,
    max_points: int,
    random_seed: int | None,
) -> Response:
    dataset_name, csv_path = _resolve_sensor_csv(dataset)
    system_type = _detect_dataset_system(dataset_name)
    return _build_binary_sensor_response_from_csv(
        dataset_name=dataset_name,
        csv_path=csv_path,
        system_type=system_type,
        attribute=attribute,
        view=view,
        voxel_size_mm=voxel_size_mm,
        voxel_size_z_mm=voxel_size_z_mm,
        max_points=max_points,
        random_seed=random_seed,
    )


def _parse_attribute_list(attributes: str) -> list[str]:
    names: list[str] = []
    for token in attributes.split(","):
        name = token.strip()
        if name and name not in names:
            names.append(name)
    if not names:
        names = ["loadCell"]
    return names


def _build_multi_sensor_response_from_csv(
    dataset_name: str,
    csv_path: Path,
    system_type: str,
    attributes: list[str],
    max_points: int,
    random_seed: int | None,
    cache_token: str | None = None,
) -> Response:
    if not csv_path.exists():
        raise HTTPException(status_code=404, detail=f"Dataset '{dataset_name}' not found")

    grid_origin = "center" if system_type == "engine" else "corner"
    try:
        result = load_sensor_pointcloud_multi(
            csv_path=csv_path,
            dataset_name=dataset_name,
            attributes=attributes,
            max_points=max_points,
            random_seed=random_seed,
            cache_token=cache_token,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    ranges_header = ";".join(f"{lo},{hi}" for lo, hi in result.attribute_ranges)
    headers = {
        "X-AV-Dataset": result.dataset_name,
        "X-AV-Attributes": ",".join(result.attributes),
        "X-AV-Attr-Ranges": ranges_header,
        "X-AV-ViewMode": "point",
        "X-AV-BackendEngine": result.backend_engine,
        "X-AV-TotalPoints": str(result.total_points),
        "X-AV-RenderedPoints": str(result.rendered_points),
        "X-AV-Center": ",".join(str(v) for v in result.center),
        "X-AV-Bounds-Min": ",".join(str(v) for v in result.bounds_min),
        "X-AV-Bounds-Max": ",".join(str(v) for v in result.bounds_max),
        "X-AV-PointStride": str(4 + len(result.attributes)),
        "X-AV-System": system_type,
        "X-AV-GridOrigin": grid_origin,
        # Binary float payloads are incompressible; mark as identity so the
        # GZipMiddleware skips compressing them (saves ~2.5s per request).
        "Content-Encoding": "identity",
    }

    return Response(
        content=result.packed_points.astype("float32", copy=False).tobytes(order="C"),
        media_type="application/octet-stream",
        headers=headers,
    )


def _multi_series_payload(result) -> dict[str, object]:
    return {
        "dataset": result.dataset_name,
        "attributes": result.attributes,
        "totalSamples": result.total_samples,
        "sampledIndices": result.sampled_indices,
        "sampledCoords": result.sampled_coords,
        "series": {
            name: {
                "sampledValues": values,
                "range": {"min": min_value, "max": max_value},
            }
            for name, (values, min_value, max_value) in result.series.items()
        },
    }


def create_app(*, include_urdf: bool = True) -> FastAPI:
    app = FastAPI(title="avisualizer web", version="0.1.0")
    app.add_middleware(GZipMiddleware, minimum_size=1024)

    @app.middleware("http")
    async def _revalidate_static(request, call_next):
        """Make the browser revalidate UI assets so edits/deploys aren't masked
        by a stale cache (cheap: ``no-cache`` still allows 304s)."""
        response = await call_next(request)
        path = request.url.path
        if path == "/" or path.startswith("/static"):
            response.headers["Cache-Control"] = "no-cache"
        return response

    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
    app.mount("/assets", StaticFiles(directory=str(ASSETS_ROOT)), name="assets")

    @app.get("/")
    def index() -> FileResponse:
        return FileResponse(STATIC_DIR / "index.html")

    if include_urdf:
        @app.get("/urdf")
        def urdf_index() -> FileResponse:
            return FileResponse(STATIC_DIR / "urdf.html")

        @app.get("/api/urdf/models")
        def urdf_models() -> dict[str, object]:
            models = _list_urdf_models()
            default_model_url = models[0]["url"] if models else None
            return {
                "models": models,
                "defaultModelUrl": default_model_url,
            }

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/api/datasets/criteria")
    def dataset_criteria(
        dataset: str = Query(default=DEFAULT_DATASET_NAME),
    ) -> dict[str, object]:
        dataset_name, csv_path = _resolve_sensor_csv(dataset)
        return {
            "dataset": dataset_name,
            "criteria": _read_csv_headers(csv_path),
        }

    @app.get("/api/sensors")
    def sensors(
        dataset: str = Query(default=DEFAULT_DATASET_NAME),
        attribute: str = Query(default="loadCell"),
        view: Literal["point", "voxel"] = Query(default="point"),
        voxel_size_mm: float = Query(default=2.0, ge=0.1, le=20.0),
        voxel_size_z_mm: float = Query(default=1.2, ge=0.1, le=20.0),
        max_points: int = Query(default=150_000, ge=1, le=2_000_000),
        random_seed: int | None = Query(default=None),
    ) -> Response:
        return _build_binary_sensor_response(
            dataset=dataset,
            attribute=attribute,
            view=view,
            voxel_size_mm=voxel_size_mm,
            voxel_size_z_mm=voxel_size_z_mm,
            max_points=max_points,
            random_seed=random_seed,
        )

    @app.get("/api/sensors/binary")
    def sensors_binary(
        dataset: str = Query(default=DEFAULT_DATASET_NAME),
        attribute: str = Query(default="loadCell"),
        view: Literal["point", "voxel"] = Query(default="point"),
        voxel_size_mm: float = Query(default=2.0, ge=0.1, le=20.0),
        voxel_size_z_mm: float = Query(default=1.2, ge=0.1, le=20.0),
        max_points: int = Query(default=150_000, ge=1, le=2_000_000),
        random_seed: int | None = Query(default=None),
    ) -> Response:
        return _build_binary_sensor_response(
            dataset=dataset,
            attribute=attribute,
            view=view,
            voxel_size_mm=voxel_size_mm,
            voxel_size_z_mm=voxel_size_z_mm,
            max_points=max_points,
            random_seed=random_seed,
        )

    processing = _ProcessingProgress()

    @app.get("/api/sensors/progress")
    def sensors_progress() -> dict:
        """Coarse progress for the upload currently being processed (UI polls this)."""
        return processing.snapshot()

    @contextmanager
    def _track_progress(downloading: bool):
        """Track parse/voxelize progress for the wrapped processing block."""
        processing.start("Downloading…" if downloading else "Reading data…")
        set_progress_callback(processing.update)
        try:
            yield
        finally:
            set_progress_callback(None)
            processing.finish()

    @app.post("/api/uploads/presign")
    def presign_upload(payload: dict = Body(...)) -> dict:
        """Return a presigned S3 ``PUT`` URL so the browser uploads the CSV once,
        directly to storage (bypassing the Cloudflare 100 MB edge limit)."""
        if not uploads.s3_enabled():
            raise HTTPException(
                status_code=503,
                detail="Direct uploads are not configured on this server.",
            )
        filename = str(payload.get("filename") or "Sensors.csv")
        return uploads.presign_put(filename)

    @app.post("/api/sensors/upload")
    async def sensors_upload(
        sensors_file: UploadFile = File(default=None),
        s3_key: str = Form(default=""),
        dataset_label: str = Form(default="selected-folder"),
        system_hint: str = Form(default="m600"),
        attribute: str = Form(default="loadCell"),
        view: Literal["point", "voxel"] = Form(default="point"),
        voxel_size_mm: float = Form(default=2.0),
        voxel_size_z_mm: float = Form(default=1.2),
        max_points: int = Form(default=150_000),
        random_seed: int | None = Form(default=None),
    ) -> Response:
        with _track_progress(bool(s3_key)):
            csv_path, _token, cleanup = await _resolve_csv(sensors_file, s3_key)
            try:
                return await run_in_threadpool(
                    _build_binary_sensor_response_from_csv,
                    dataset_name=Path(dataset_label).name or "selected-folder",
                    csv_path=csv_path,
                    system_type=_normalize_system_hint(system_hint),
                    attribute=attribute,
                    view=view,
                    voxel_size_mm=voxel_size_mm,
                    voxel_size_z_mm=voxel_size_z_mm,
                    max_points=max_points,
                    random_seed=random_seed,
                )
            finally:
                cleanup()

    @app.get("/api/sensors/multi")
    def sensors_multi(
        dataset: str = Query(default=DEFAULT_DATASET_NAME),
        attributes: str = Query(default="loadCell"),
        max_points: int = Query(default=150_000, ge=1, le=2_000_000),
        random_seed: int | None = Query(default=None),
    ) -> Response:
        dataset_name, csv_path = _resolve_sensor_csv(dataset)
        system_type = _detect_dataset_system(dataset_name)
        return _build_multi_sensor_response_from_csv(
            dataset_name=dataset_name,
            csv_path=csv_path,
            system_type=system_type,
            attributes=_parse_attribute_list(attributes),
            max_points=max_points,
            random_seed=random_seed,
        )

    @app.post("/api/sensors/multi/upload")
    async def sensors_multi_upload(
        sensors_file: UploadFile = File(default=None),
        s3_key: str = Form(default=""),
        dataset_label: str = Form(default="selected-folder"),
        system_hint: str = Form(default="m600"),
        attributes: str = Form(default="loadCell"),
        max_points: int = Form(default=150_000),
        random_seed: int | None = Form(default=None),
    ) -> Response:
        with _track_progress(bool(s3_key)):
            csv_path, cache_token, cleanup = await _resolve_csv(sensors_file, s3_key)
            try:
                return await run_in_threadpool(
                    _build_multi_sensor_response_from_csv,
                    dataset_name=Path(dataset_label).name or "selected-folder",
                    csv_path=csv_path,
                    system_type=_normalize_system_hint(system_hint),
                    attributes=_parse_attribute_list(attributes),
                    max_points=max_points,
                    random_seed=random_seed,
                    cache_token=cache_token,
                )
            finally:
                cleanup()

    @app.get("/api/attribute-series")
    def attribute_series(
        dataset: str = Query(default=DEFAULT_DATASET_NAME),
        attribute: str = Query(default="loadCell"),
        max_samples: int = Query(default=1200, ge=10, le=10000),
    ) -> dict[str, object]:
        dataset_name, csv_path = _resolve_sensor_csv(dataset)
        try:
            result = load_attribute_series(
                csv_path=csv_path,
                dataset_name=dataset_name,
                attribute=attribute,
                max_samples=max_samples,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        return {
            "dataset": result.dataset_name,
            "attribute": result.attribute,
            "totalSamples": result.total_samples,
            "sampledValues": result.sampled_values,
            "sampledIndices": result.sampled_indices,
            "sampledPoints": result.sampled_points,
            "range": {
                "min": result.min_value,
                "max": result.max_value,
            },
        }

    @app.post("/api/attribute-series/upload")
    async def attribute_series_upload(
        sensors_file: UploadFile = File(default=None),
        s3_key: str = Form(default=""),
        dataset_label: str = Form(default="selected-folder"),
        attribute: str = Form(default="loadCell"),
        max_samples: int = Form(default=1200),
    ) -> dict[str, object]:
        with _track_progress(bool(s3_key)):
            csv_path, _token, cleanup = await _resolve_csv(sensors_file, s3_key)
            try:
                result = await run_in_threadpool(
                    load_attribute_series,
                    csv_path=csv_path,
                    dataset_name=Path(dataset_label).name or "selected-folder",
                    attribute=attribute,
                    max_samples=max_samples,
                )
                return {
                    "dataset": result.dataset_name,
                    "attribute": result.attribute,
                    "totalSamples": result.total_samples,
                    "sampledValues": result.sampled_values,
                    "sampledIndices": result.sampled_indices,
                    "sampledPoints": result.sampled_points,
                    "range": {
                        "min": result.min_value,
                        "max": result.max_value,
                    },
                }
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
            finally:
                cleanup()

    @app.get("/api/attribute-series/multi")
    def attribute_series_multi(
        dataset: str = Query(default=DEFAULT_DATASET_NAME),
        attributes: str = Query(default="loadCell"),
        max_samples: int = Query(default=1200, ge=10, le=10000),
    ) -> dict[str, object]:
        dataset_name, csv_path = _resolve_sensor_csv(dataset)
        try:
            result = load_attribute_series_multi(
                csv_path=csv_path,
                dataset_name=dataset_name,
                attributes=_parse_attribute_list(attributes),
                max_samples=max_samples,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return _multi_series_payload(result)

    @app.post("/api/attribute-series/multi/upload")
    async def attribute_series_multi_upload(
        sensors_file: UploadFile = File(default=None),
        s3_key: str = Form(default=""),
        dataset_label: str = Form(default="selected-folder"),
        attributes: str = Form(default="loadCell"),
        max_samples: int = Form(default=1200),
    ) -> dict[str, object]:
        with _track_progress(bool(s3_key)):
            csv_path, cache_token, cleanup = await _resolve_csv(sensors_file, s3_key)
            try:
                result = await run_in_threadpool(
                    load_attribute_series_multi,
                    csv_path=csv_path,
                    dataset_name=Path(dataset_label).name or "selected-folder",
                    attributes=_parse_attribute_list(attributes),
                    max_samples=max_samples,
                    cache_token=cache_token,
                )
                return _multi_series_payload(result)
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
            finally:
                cleanup()

    return app


def run(host: str = "127.0.0.1", port: int = 8080) -> None:
    uvicorn.run("avisualizer.web.app:create_app", host=host, port=port, factory=True, reload=False)


def create_sensor_app() -> FastAPI:
    return create_app(include_urdf=False)


def run_sensor(host: str = "127.0.0.1", port: int = 8080) -> None:
    uvicorn.run("avisualizer.web.app:create_sensor_app", host=host, port=port, factory=True, reload=False)
