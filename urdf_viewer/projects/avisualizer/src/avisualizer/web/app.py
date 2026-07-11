from __future__ import annotations

import json
import mimetypes
import os
from pathlib import Path
import re
from typing import Literal
import urllib.error
import urllib.request

import uvicorn
from fastapi import Body, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles

from .services.sensor_pointcloud import load_attribute_series, load_sensor_pointcloud


PROJECT_ROOT = Path(__file__).resolve().parents[3]
DATABASE_ROOT = PROJECT_ROOT / "database"
ASSETS_ROOT = PROJECT_ROOT / "assets"
STATIC_DIR = Path(__file__).resolve().parent / "static"
DEFAULT_DATASET_NAME = "small-torture-test_1-0-0"

# Optional external slicer (aslicer) integration. Disabled unless AVIS_SLICER_URL
# is set, so the viewer runs fully standalone by default. See docs/PRINT_SIM.md.
SLICER_MULTIPART_BOUNDARY = "----avisualizerSlicerBoundary"

mimetypes.add_type("text/plain", ".urdf")


def _slicer_base_url() -> str | None:
    url = os.environ.get("AVIS_SLICER_URL", "").strip()
    return url.rstrip("/") if url else None


def _slicer_ui_url() -> str | None:
    """Browser-reachable URL of the slicer web UI to embed in the Files menu.

    Prefers an explicit AVIS_SLICER_UI_URL (useful when the slicer's public UI
    origin differs from the API origin used by the proxy), and otherwise falls
    back to AVIS_SLICER_URL. Returns None when no slicer is configured, so the
    Files-menu pane degrades gracefully to a placeholder.
    """
    explicit = os.environ.get("AVIS_SLICER_UI_URL", "").strip()
    if explicit:
        return explicit.rstrip("/")
    return _slicer_base_url()


def _http_json(url: str, *, method: str = "GET", data: bytes | None = None,
               headers: dict[str, str] | None = None, timeout: float = 120.0) -> object:
    request = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310 - configured URL
        body = response.read()
    return json.loads(body.decode("utf-8")) if body else {}


def _slicer_pick_profile(base_url: str, requested: str | None) -> str | None:
    if requested:
        return requested
    try:
        info = _http_json(f"{base_url}/api/profiles", timeout=15.0)
    except Exception:  # noqa: BLE001 - profile discovery is best-effort
        return None

    candidates: list[object] = []
    if isinstance(info, dict):
        if isinstance(info.get("default"), str):
            return info["default"]
        if isinstance(info.get("profiles"), list):
            candidates = info["profiles"]
    elif isinstance(info, list):
        candidates = info

    for entry in candidates:
        if isinstance(entry, str):
            return entry
        if isinstance(entry, dict) and isinstance(entry.get("name"), str):
            return entry["name"]
    return None


def _slice_via_backend(base_url: str, stl_path: Path, profile: str | None) -> object:
    # 1) Upload the STL bytes to the slicer (multipart 'file' field).
    file_bytes = stl_path.read_bytes()
    preamble = (
        f"--{SLICER_MULTIPART_BOUNDARY}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{stl_path.name}"\r\n'
        f"Content-Type: model/stl\r\n\r\n"
    ).encode("utf-8")
    epilogue = f"\r\n--{SLICER_MULTIPART_BOUNDARY}--\r\n".encode("utf-8")
    _http_json(
        f"{base_url}/api/load",
        method="POST",
        data=preamble + file_bytes + epilogue,
        headers={"Content-Type": f"multipart/form-data; boundary={SLICER_MULTIPART_BOUNDARY}"},
        timeout=120.0,
    )

    # 2) Slice and return the toolpath payload verbatim.
    resolved_profile = _slicer_pick_profile(base_url, profile)
    slice_body = json.dumps({"profile": resolved_profile}).encode("utf-8")
    return _http_json(
        f"{base_url}/api/slice",
        method="POST",
        data=slice_body,
        headers={"Content-Type": "application/json"},
        timeout=300.0,
    )


def _normalize_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def _tokenize_name(value: str) -> list[str]:
    return [token for token in re.split(r"[^a-z0-9]+", value.lower()) if token]


def _find_global_stl_root() -> Path | None:
    for base in [PROJECT_ROOT, *PROJECT_ROOT.parents]:
        candidate = base / "STL"
        if candidate.is_dir():
            return candidate
    return None


def _choose_best_stl_for_dataset(stl_files: list[Path], dataset_name: str) -> Path | None:
    if not stl_files:
        return None

    normalized_dataset = _normalize_name(dataset_name)
    dataset_tokens = _tokenize_name(dataset_name)

    exact_match = [path for path in stl_files if _normalize_name(path.stem) == normalized_dataset]
    if exact_match:
        return sorted(exact_match, key=lambda p: p.as_posix().lower())[0]

    scored: list[tuple[int, int, str, Path]] = []
    for path in stl_files:
        stem = path.stem
        normalized_stem = _normalize_name(stem)
        token_hits = 0
        for token in dataset_tokens:
            if token and token in normalized_stem:
                token_hits += 1

        if token_hits > 0:
            # Prefer more token hits, then shorter name distance, then lexical stability.
            distance = abs(len(normalized_stem) - len(normalized_dataset))
            scored.append((token_hits, -distance, path.as_posix().lower(), path))

    if scored:
        scored.sort(reverse=True)
        return scored[0][3]

    if len(stl_files) == 1:
        return stl_files[0]

    return None


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


def _resolve_dataset_stl(dataset: str) -> tuple[str, Path]:
    dataset_name = Path(dataset).name

    dataset_dir = DATABASE_ROOT / dataset_name
    if dataset_dir.exists():
        stl_files = sorted(dataset_dir.glob("*.stl"), key=lambda p: p.as_posix().lower())
        if stl_files:
            return dataset_name, stl_files[0]

    global_stl_root = _find_global_stl_root()
    if global_stl_root:
        global_stl_files = sorted(global_stl_root.glob("*.stl"), key=lambda p: p.as_posix().lower())
        matched = _choose_best_stl_for_dataset(global_stl_files, dataset_name)
        if matched:
            return dataset_name, matched

    raise HTTPException(
        status_code=404,
        detail=(
            f"No STL found for dataset '{dataset_name}' "
            f"in '{dataset_dir}' or global STL directory"
        ),
    )


def _list_global_stl_files() -> list[Path]:
    global_stl_root = _find_global_stl_root()
    if not global_stl_root:
        return []
    return sorted(global_stl_root.glob("*.stl"), key=lambda p: p.as_posix().lower())


def _resolve_global_stl_file(name: str) -> Path:
    requested = Path(str(name or "")).name.strip()
    if not requested:
        raise HTTPException(status_code=400, detail="STL file name is required")

    for stl_path in _list_global_stl_files():
        if stl_path.name.lower() == requested.lower():
            return stl_path

    raise HTTPException(status_code=404, detail=f"STL file '{requested}' not found")


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
    }

    return Response(
        content=result.packed_points.astype("float32", copy=False).tobytes(order="C"),
        media_type="application/octet-stream",
        headers=headers,
    )


def create_app() -> FastAPI:
    app = FastAPI(title="avisualizer web", version="0.1.0")
    # Allow the embedded slicer UI (a different origin) to fetch STL files from us
    # so "Load to slicer" can pre-load the chosen model. Read-only GETs, no creds.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["GET"],
        allow_headers=["*"],
    )
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
    app.mount("/assets", StaticFiles(directory=str(ASSETS_ROOT)), name="assets")

    @app.get("/")
    def index() -> FileResponse:
        return FileResponse(STATIC_DIR / "index.html")

    @app.get("/urdf")
    def urdf_index() -> FileResponse:
        return FileResponse(STATIC_DIR / "urdf.html")

    @app.get("/api/slicer/status")
    def slicer_status() -> dict[str, object]:
        """Report whether an embeddable slicer UI is configured.

        The Files-menu slicer pane calls this to decide between loading the
        embedded slicer (via the same-origin `/slicer` entry) or showing its
        graceful fallback placeholder.
        """
        ui_url = _slicer_ui_url()
        return {
            "configured": ui_url is not None,
            "url": "/slicer" if ui_url else None,
        }

    @app.get("/api/slicer/profiles")
    def slicer_profiles() -> dict[str, object]:
        """List the slicer's machine/material profiles for the viewer's picker.

        Same-origin proxy to the configured slicer's ``/api/profiles`` (the
        browser cannot call the slicer directly — CORS). Normalizes the various
        shapes the slicer may return into a flat list of names plus a default.
        Returns 503 when no slicer is configured, so the Slicer-flyout profile
        picker hides itself, matching the slice proxy's graceful degradation.
        """
        base_url = _slicer_base_url()
        if not base_url:
            raise HTTPException(
                status_code=503,
                detail="Slicer backend not configured (set AVIS_SLICER_URL).",
            )

        try:
            info = _http_json(f"{base_url}/api/profiles", timeout=15.0)
        except urllib.error.URLError as exc:
            raise HTTPException(status_code=502, detail=f"Slicer unreachable: {exc.reason}") from exc
        except Exception as exc:  # noqa: BLE001 - surface as bad gateway, keep viewer usable
            raise HTTPException(status_code=502, detail=f"Slicer profile lookup failed: {exc}") from exc

        default: str | None = None
        entries: object = info
        if isinstance(info, dict):
            if isinstance(info.get("default"), str):
                default = info["default"]
            entries = info.get("profiles")

        names: list[str] = []
        if isinstance(entries, list):
            for entry in entries:
                if isinstance(entry, str):
                    names.append(entry)
                elif isinstance(entry, dict) and isinstance(entry.get("name"), str):
                    names.append(entry["name"])

        return {"profiles": names, "default": default or (names[0] if names else None)}

    @app.get("/slicer")
    def slicer_entry(request: Request) -> Response:
        """Same-origin entry point for the embedded slicer UI.

        Redirects to the configured slicer web UI when available, so the Files
        menu can iframe a stable `/slicer` path regardless of the backend URL.
        The incoming query string is forwarded verbatim so the slicer receives
        both the `stl` param (an absolute URL to one of our STL files, so it
        auto-loads that model) and UI flags like `dock=1` (embedded bottom-bar
        layout). When no slicer is configured, returns a small placeholder page
        instead of a broken frame.
        """
        ui_url = _slicer_ui_url()
        if ui_url:
            # Forward the raw query string as-received (stl is already percent-
            # encoded by the caller), so extra flags such as dock=1 survive the
            # redirect instead of being dropped.
            query = request.url.query
            target = ui_url
            if query:
                separator = "&" if "?" in ui_url else "?"
                target = f"{ui_url}{separator}{query}"
            return RedirectResponse(url=target, status_code=307)
        return HTMLResponse(
            """<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" />
<title>Slicer not configured</title>
<style>
  html,body{height:100%;margin:0;font-family:'Segoe UI',system-ui,sans-serif;
    background:#0b1622;color:#cfe8ff;display:flex;align-items:center;
    justify-content:center;text-align:center}
  .card{max-width:420px;padding:24px;line-height:1.5}
  h1{font-size:16px;letter-spacing:.06em;text-transform:uppercase;
    color:#9ec7ff;margin:0 0 10px}
  p{font-size:13px;color:#9fb4cc;margin:6px 0}
  code{background:rgba(255,255,255,.08);padding:2px 6px;border-radius:5px;
    font-size:12px;color:#e1f0ff}
</style></head>
<body><div class="card">
  <h1>Slicer not connected</h1>
  <p>The slicer software is not configured for this viewer yet.</p>
  <p>Set <code>AVIS_SLICER_URL</code> (or <code>AVIS_SLICER_UI_URL</code>)
     to the slicer service to embed it here.</p>
</div></body></html>""",
            status_code=200,
        )

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

    # `/api/sensors/binary` is a compatibility alias for `/api/sensors`.
    @app.get("/api/sensors")
    @app.get("/api/sensors/binary")
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

    @app.get("/api/datasets/stl")
    def dataset_stl(
        dataset: str = Query(default=DEFAULT_DATASET_NAME),
    ) -> FileResponse:
        _, stl_path = _resolve_dataset_stl(dataset)
        return FileResponse(stl_path, media_type="model/stl")

    @app.get("/api/stl/files")
    def list_global_stl_files() -> dict[str, object]:
        global_stl_root = _find_global_stl_root()
        files = _list_global_stl_files()
        return {
            "root": str(global_stl_root) if global_stl_root else None,
            "files": [path.name for path in files],
        }

    @app.get("/api/stl/file")
    def global_stl_file(
        name: str = Query(..., min_length=1),
    ) -> FileResponse:
        stl_path = _resolve_global_stl_file(name)
        return FileResponse(stl_path, media_type="model/stl")

    @app.post("/api/slice/proxy")
    def slice_proxy(payload: dict | None = Body(default=None)) -> object:
        """Same-origin proxy to the optional aslicer backend.

        Resolves a Files-list model by name, forwards it to the configured
        slicer (load + slice), and returns the toolpath payload. Returns 503
        when no slicer is configured so the viewer degrades gracefully to its
        client-side layer reveal.
        """
        base_url = _slicer_base_url()
        if not base_url:
            raise HTTPException(
                status_code=503,
                detail="Slicer backend not configured (set AVIS_SLICER_URL).",
            )

        body = payload or {}
        name = str(body.get("name") or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Model name is required")

        stl_path = _resolve_global_stl_file(name)  # 404 if unknown
        requested_profile = body.get("profile")
        profile = requested_profile if isinstance(requested_profile, str) else None

        try:
            return _slice_via_backend(base_url, stl_path, profile)
        except urllib.error.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"Slicer error: HTTP {exc.code}") from exc
        except urllib.error.URLError as exc:
            raise HTTPException(status_code=502, detail=f"Slicer unreachable: {exc.reason}") from exc
        except Exception as exc:  # noqa: BLE001 - surface as bad gateway, keep viewer usable
            raise HTTPException(status_code=502, detail=f"Slicer proxy failure: {exc}") from exc

    return app


def run(host: str = "127.0.0.1", port: int = 8080) -> None:
    uvicorn.run("avisualizer.web.app:create_app", host=host, port=port, factory=True, reload=False)
