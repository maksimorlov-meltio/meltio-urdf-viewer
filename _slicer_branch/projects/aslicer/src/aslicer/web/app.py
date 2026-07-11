"""FastAPI backend for the aslicer web viewer.

Serves a Three.js frontend and exposes a small API to load an STL, fetch its
geometry for preview, and slice it into a perimeter/infill toolpath.
"""

from __future__ import annotations

import tempfile
import threading
from pathlib import Path

import trimesh
import uvicorn
from fastapi import Body, FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from ..core.gcode import program_to_gcode
from ..core.machine import build_machine_program
from ..core.mesh_loader import load_mesh
from ..core.profile_toolpath import (
    generate_profile_support_toolpath,
    generate_profile_toolpath,
)
from ..core.slicer import slice_mesh
from ..core.support import generate_support_mesh, support_layer_footprints
from ..core.toolpath import Toolpath, merge_toolpath_layers
from ..core.transforms import apply_transform
from ..profile import MachineProfile
from ..profile_store import FactoryProfileError, ProfileStore
from ..thermal import (
    ThermalParams,
    build_thermal_segments,
    simulate_exposure,
)
from .serialize import (
    mesh_to_payload,
    thermal_to_payload,
    toolpath_to_payload,
)

STATIC_DIR = Path(__file__).resolve().parent / "static"
STL_DIR = Path(__file__).resolve().parents[3] / "stl"
ASSETS_DIR = Path(__file__).resolve().parents[3] / "assets"
PROFILES_DIR = Path(__file__).resolve().parents[3] / "profiles"

HOST = "127.0.0.1"
PORT = 8765


def _default_stl_path() -> Path | None:
    """Return the first STL file in the project's ``stl`` folder, if any."""
    if not STL_DIR.is_dir():
        return None
    candidates = sorted(STL_DIR.glob("*.stl"))
    return candidates[0] if candidates else None


def _median_layer_time_s(segments) -> float:
    """Median wall-clock time to print one layer, from thermal segments.

    Each layer's start time is the earliest segment start in that layer; the
    median of consecutive layer-to-layer gaps gives a robust cadence that the
    relative model uses to scale its cooling time constant.
    """
    starts: dict[int, float] = {}
    for s in segments:
        t = s.start_time_s
        cur = starts.get(s.layer_index)
        if cur is None or t < cur:
            starts[s.layer_index] = t
    if len(starts) < 2:
        return 0.0
    ordered = [starts[k] for k in sorted(starts)]
    gaps = [b - a for a, b in zip(ordered, ordered[1:]) if b > a]
    if not gaps:
        return 0.0
    gaps.sort()
    mid = len(gaps) // 2
    if len(gaps) % 2:
        return gaps[mid]
    return 0.5 * (gaps[mid - 1] + gaps[mid])


class _ViewerState:
    """In-memory state: the currently loaded mesh and its name.

    Guarded by a lock so concurrent requests (load + slice) stay consistent.
    Also caches the most recently sliced toolpath so the thermal simulation can
    reuse it without re-slicing; any new mesh invalidates that cache.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._mesh: trimesh.Trimesh | None = None
        self._name: str = ""
        self._toolpath: Toolpath | None = None
        self._thermal_diffusivity: float | None = None

    def set_mesh(self, mesh: trimesh.Trimesh, name: str) -> None:
        with self._lock:
            self._mesh = mesh
            self._name = name
            # A new mesh makes any previously sliced toolpath stale.
            self._toolpath = None
            self._thermal_diffusivity = None

    def get(self) -> tuple[trimesh.Trimesh, str]:
        with self._lock:
            if self._mesh is None:
                raise HTTPException(status_code=404, detail="No mesh loaded")
            return self._mesh, self._name

    def set_toolpath(
        self,
        toolpath: Toolpath,
        thermal_diffusivity_mm2_s: float | None = None,
    ) -> None:
        with self._lock:
            self._toolpath = toolpath
            self._thermal_diffusivity = thermal_diffusivity_mm2_s

    def get_toolpath(self) -> Toolpath | None:
        with self._lock:
            return self._toolpath

    def get_thermal_diffusivity(self) -> float | None:
        with self._lock:
            return self._thermal_diffusivity


class _SliceProgress:
    """Thread-safe slice progress shared between the slice and poll endpoints.

    The slice runs in FastAPI's worker threadpool while the frontend polls the
    progress endpoint on another worker, so all access is guarded by a lock.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._phase = ""
        self._percent = 0.0
        self._running = False

    def start(self, phase: str = "Working\u2026") -> None:
        with self._lock:
            self._running = True
            self._phase = phase
            self._percent = 0.0

    def update(self, phase: str, percent: float) -> None:
        with self._lock:
            self._phase = phase
            self._percent = max(0.0, min(100.0, percent))

    def finish(self) -> None:
        with self._lock:
            self._running = False
            self._phase = ""
            self._percent = 100.0

    def snapshot(self) -> dict:
        with self._lock:
            return {
                "running": self._running,
                "phase": self._phase,
                "percent": round(self._percent, 1),
            }



class SliceRequest(BaseModel):
    """Slice request: the name of the machine profile to slice with."""

    profile: str = Field(min_length=1)


class TransformRequest(BaseModel):
    """A modular mesh placement transform requested by the frontend."""

    type: str
    vertex_index: int | None = Field(default=None, ge=0)
    face_index: int | None = Field(default=None, ge=0)
    dx: float | None = Field(default=None)
    dy: float | None = Field(default=None)
    cx: float | None = Field(default=None)
    cy: float | None = Field(default=None)


def create_app() -> FastAPI:
    """Build the FastAPI application."""
    app = FastAPI(title="aslicer web viewer")

    @app.middleware("http")
    async def _revalidate_static(request, call_next):
        """Make the browser revalidate the UI assets so edits/deploys are never
        masked by a stale cache (these files are tiny; ``no-cache`` still allows
        304s, so it's cheap)."""
        response = await call_next(request)
        path = request.url.path
        if path == "/" or path.startswith("/static"):
            response.headers["Cache-Control"] = "no-cache"
        return response

    state = _ViewerState()
    progress = _SliceProgress()
    sim_progress = _SliceProgress()
    profiles = ProfileStore(PROFILES_DIR)

    # Load the default STL (if present) so the viewer has something to show.
    default_path = _default_stl_path()
    if default_path is not None:
        try:
            state.set_mesh(load_mesh(default_path), default_path.name)
        except Exception:  # pragma: no cover - defensive, viewer still starts
            pass

    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

    # Serve bundled 3D assets (e.g. the wire nozzle shown during simulation).
    if ASSETS_DIR.is_dir():
        app.mount("/assets", StaticFiles(directory=str(ASSETS_DIR)), name="assets")

    @app.get("/")
    def index() -> FileResponse:
        return FileResponse(STATIC_DIR / "index.html")

    @app.get("/api/health")
    def health() -> dict:
        return {"status": "ok"}

    @app.get("/api/mesh")
    def get_mesh() -> dict:
        mesh, name = state.get()
        return mesh_to_payload(mesh, name)

    @app.post("/api/load")
    async def load(file: UploadFile = File(...)) -> dict:
        suffix = Path(file.filename or "upload.stl").suffix or ".stl"
        payload = await file.read()
        # trimesh loads from a path; write the upload to a temp file.
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as handle:
            handle.write(payload)
            temp_path = Path(handle.name)
        try:
            mesh = load_mesh(temp_path)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Could not load mesh: {exc}") from exc
        finally:
            temp_path.unlink(missing_ok=True)

        name = Path(file.filename or "upload.stl").name
        state.set_mesh(mesh, name)
        return mesh_to_payload(mesh, name)

    @app.post("/api/transform")
    def transform(request: TransformRequest) -> dict:
        mesh, name = state.get()
        params = request.model_dump(exclude={"type"}, exclude_none=True)
        try:
            mesh = apply_transform(mesh, request.type, params)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        state.set_mesh(mesh, name)
        payload = mesh_to_payload(mesh, name)
        # Report where a picked vertex landed so the viewer can mark it.
        if request.vertex_index is not None and request.vertex_index < len(mesh.vertices):
            payload["placed"] = [float(v) for v in mesh.vertices[request.vertex_index]]
        return payload

    def _params_from_request(request: SliceRequest) -> MachineProfile:
        """Load the machine profile named in the request (404 if unknown)."""
        profile = profiles.get(request.profile)
        if profile is None:
            raise HTTPException(
                status_code=404, detail=f"Unknown profile: {request.profile}"
            )
        return profile

    def _build_toolpath(mesh, profile: MachineProfile, report=None):
        """Run the geometry -> toolpath stages, returning (toolpath, support_mesh).

        When ``report`` is given it is called as ``report(phase, percent)`` with
        a human-readable phase label and an overall 0-100 completion percentage.
        """

        def emit(phase: str, percent: float) -> None:
            if report is not None:
                report(phase, percent)

        params = profile.to_slice_parameters()
        emit("Slicing geometry\u2026", 2.0)
        model = slice_mesh(mesh, params)

        support_enabled = profile.support_enabled
        # Toolpath generation dominates runtime; give it the largest share and
        # leave headroom for support work when it is enabled.
        tp_lo, tp_hi = (5.0, 55.0) if support_enabled else (5.0, 98.0)

        def tp_progress(done: int, total: int) -> None:
            frac = done / total if total else 1.0
            emit("Generating toolpath\u2026", tp_lo + (tp_hi - tp_lo) * frac)

        toolpath = generate_profile_toolpath(
            model, profile, mesh, progress=tp_progress
        )
        support_mesh = None
        if support_enabled:
            emit("Generating supports\u2026", 58.0)
            support_layers = support_layer_footprints(mesh, params, model.layers)
            support_mesh = generate_support_mesh(support_layers, params.layer_height_mm)
            if support_mesh is not None:

                def sp_progress(done: int, total: int) -> None:
                    frac = done / total if total else 1.0
                    emit("Generating supports\u2026", 60.0 + 38.0 * frac)

                support_toolpath = generate_profile_support_toolpath(
                    support_layers, profile, progress=sp_progress
                )
                toolpath = merge_toolpath_layers(toolpath, support_toolpath)
        emit("Finishing\u2026", 99.0)
        return toolpath, support_mesh

    # -- Profile management ------------------------------------------------

    @app.get("/api/profiles")
    def list_profiles() -> dict:
        return {"profiles": profiles.entries()}

    @app.get("/api/profiles/{name}")
    def get_profile(name: str) -> dict:
        profile = profiles.get(name)
        if profile is None:
            raise HTTPException(status_code=404, detail=f"Unknown profile: {name}")
        return profile.to_dict()

    @app.post("/api/profiles")
    def save_profile(payload: dict = Body(...)) -> dict:
        try:
            profile = MachineProfile.from_dict(payload)
        except (ValueError, TypeError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        try:
            saved = profiles.save(profile)
        except FactoryProfileError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc
        return saved.to_dict()

    @app.delete("/api/profiles/{name}")
    def delete_profile(name: str) -> dict:
        try:
            deleted = profiles.delete(name)
        except FactoryProfileError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc
        if not deleted:
            raise HTTPException(
                status_code=400,
                detail="Cannot delete the last remaining profile.",
            )
        return {"profiles": profiles.names()}

    @app.post("/api/slice")
    def do_slice(request: SliceRequest) -> dict:
        mesh, _ = state.get()
        profile = _params_from_request(request)
        progress.start("Slicing\u2026")
        try:
            toolpath, support_mesh = _build_toolpath(mesh, profile, progress.update)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Slicing failed: {exc}") from exc
        finally:
            progress.finish()

        # Cache the toolpath (and the thermal parameters it was built with) so a
        # follow-up thermal simulation can reuse them.
        state.set_toolpath(toolpath, profile.thermal_diffusivity_mm2_s)

        payload = toolpath_to_payload(toolpath)
        # Surface the material/weight estimate so the viewer can show part mass.
        payload["stats"]["materialDiameterMm"] = profile.material_diameter_mm
        payload["stats"]["materialDensityGCm3"] = profile.material_density_g_cm3
        payload["stats"]["estimatedWeightG"] = profile.estimated_mass_g(
            toolpath.total_extrusion_mm
        )
        if support_mesh is not None:
            payload["supportMesh"] = mesh_to_payload(support_mesh, "support")
        return payload

    @app.get("/api/slice/progress")
    def slice_progress() -> dict:
        """Report the current slice phase and overall percentage for the UI."""
        return progress.snapshot()

    @app.post("/api/simulate")
    def simulate() -> dict:
        """Run the qualitative thermal simulation on the last sliced toolpath.

        Reuses the cached toolpath from the most recent slice (a new mesh
        invalidates it), so the model must be sliced before simulating.
        """
        toolpath = state.get_toolpath()
        if toolpath is None:
            raise HTTPException(
                status_code=400, detail="Slice the model before simulating."
            )
        sim_progress.start("Preparing\u2026")
        try:
            segments = build_thermal_segments(toolpath)
            sim_progress.update("Simulating\u2026", 5.0)
            # Ground the cooling time constant in the part's real cadence: a
            # bead only "feels" the layer below if heat lingers until the next
            # layer lands on top. Using ~2x the median layer time lets interlayer
            # reheating show up instead of every layer cooling in isolation.
            layer_time_s = _median_layer_time_s(segments)
            time_decay_s = 2.0 * layer_time_s if layer_time_s > 0.0 else 30.0
            # Compound heating: a slow part-wide pool (decay ~8x layer time) so
            # the bulk warms as the build grows, instead of plateauing once the
            # short local window saturates. Weight 0.2 keeps the compound trend
            # subtle relative to local detail — provisional, tune against a real
            # printed part's measured interpass curve once available.
            background_decay_s = (
                8.0 * layer_time_s if layer_time_s > 0.0 else 240.0
            )
            params = ThermalParams(
                thermal_diffusivity_mm2_s=state.get_thermal_diffusivity(),
                time_decay_s=time_decay_s,
                background_decay_s=background_decay_s,
                background_weight=0.2,
            )

            def sim_update(done: int, total: int) -> None:
                frac = done / total if total else 1.0
                sim_progress.update("Simulating\u2026", 5.0 + 90.0 * frac)

            scores = simulate_exposure(segments, params, progress=sim_update)
            sim_progress.update("Rendering\u2026", 97.0)
        except Exception as exc:
            raise HTTPException(
                status_code=400, detail=f"Thermal simulation failed: {exc}"
            ) from exc
        finally:
            sim_progress.finish()
        return thermal_to_payload(toolpath, segments, scores)

    @app.get("/api/simulate/progress")
    def simulate_progress() -> dict:
        """Report the current thermal-simulation phase and percentage."""
        return sim_progress.snapshot()

    @app.post("/api/gcode")
    def export_gcode(request: SliceRequest) -> Response:
        mesh, name = state.get()
        profile = _params_from_request(request)
        try:
            toolpath, _ = _build_toolpath(mesh, profile)
            program = build_machine_program(toolpath, profile.to_slice_parameters())
            gcode = program_to_gcode(program)
        except Exception as exc:
            raise HTTPException(
                status_code=400, detail=f"G-code export failed: {exc}"
            ) from exc

        filename = f"{Path(name).stem or 'model'}.gcode"
        return Response(
            content=gcode,
            media_type="text/plain; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    return app


def run(host: str = HOST, port: int = PORT) -> None:
    """Run the web viewer with uvicorn (blocking)."""
    uvicorn.run("aslicer.web.app:create_app", host=host, port=port, factory=True, reload=False)


if __name__ == "__main__":
    run()
