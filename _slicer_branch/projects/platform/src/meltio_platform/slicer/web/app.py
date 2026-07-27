"""FastAPI backend for the Meltio slicer web viewer.

Serves a Three.js frontend and exposes a small API to load an STL, fetch its
geometry for preview, and slice it into a perimeter/infill toolpath.

State is **per session** (keyed by the ``X-Slicer-Session`` header the frontend
sends): each browser tab gets its own loaded mesh / sliced toolpath / progress,
so multiple users can use the slicer concurrently without clobbering each other.
Machine profiles are shared (read-mostly).
"""

from __future__ import annotations

import os
import tempfile
import threading
import time
from pathlib import Path

import trimesh
import uvicorn
from fastapi import Body, FastAPI, File, HTTPException, Request, UploadFile
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

_HERE = Path(__file__).resolve().parent
STATIC_DIR = _HERE / "static"
ASSETS_DIR = _HERE / "assets"
# Share the platform's profile store so slices use the same machine profiles.
PROFILES_DIR = Path(
    os.environ.get("PLATFORM_PROFILES_DIR", str(_HERE / "profiles"))
)

HOST = "127.0.0.1"
PORT = 8765

# Per-session bookkeeping.
SESSION_HEADER = "X-Slicer-Session"
_SESSION_TTL_S = 3600  # evict a session idle longer than this
_MAX_SESSIONS = 128
_MAX_UPLOAD_BYTES = 64 * 1024 * 1024  # reject mesh uploads larger than 64 MB


def _median_layer_time_s(segments) -> float:
    """Median wall-clock time to print one layer, from thermal segments."""
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
    """In-memory state: the currently loaded mesh, its name, and last toolpath."""

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
            self._toolpath = None
            self._thermal_diffusivity = None

    def get(self) -> tuple[trimesh.Trimesh, str]:
        with self._lock:
            if self._mesh is None:
                raise HTTPException(status_code=404, detail="No mesh loaded")
            return self._mesh, self._name

    def set_toolpath(
        self, toolpath: Toolpath, thermal_diffusivity_mm2_s: float | None = None
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
    """Thread-safe slice/sim progress shared between work + poll endpoints."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._phase = ""
        self._percent = 0.0
        self._running = False

    def start(self, phase: str = "Working…") -> None:
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


class _Session:
    """One user's slicer session: its mesh, toolpath, and progress trackers."""

    def __init__(self) -> None:
        self.state = _ViewerState()
        self.progress = _SliceProgress()
        self.sim_progress = _SliceProgress()
        self.touched = time.monotonic()


class _Sessions:
    """Bounded, idle-evicting registry of per-session state."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._sessions: dict[str, _Session] = {}

    def get(self, session_id: str) -> _Session:
        now = time.monotonic()
        with self._lock:
            for key in [
                k for k, s in self._sessions.items() if now - s.touched > _SESSION_TTL_S
            ]:
                self._sessions.pop(key, None)
            session = self._sessions.get(session_id)
            if session is None:
                if len(self._sessions) >= _MAX_SESSIONS:
                    oldest = min(self._sessions, key=lambda k: self._sessions[k].touched)
                    self._sessions.pop(oldest, None)
                session = _Session()
                self._sessions[session_id] = session
            session.touched = now
            return session


def _session_id(request: Request) -> str:
    # Missing header → a single shared "default" session (direct/legacy access).
    return request.headers.get(SESSION_HEADER) or "default"


class SliceRequest(BaseModel):
    """Slice request: a machine profile to slice with — either the full profile
    ``profile_data`` (preferred; what's loaded/edited in the GUI) or, for
    back-compat, the ``profile`` name of a stored (flat-store) profile."""

    profile: str | None = None
    profile_data: dict | None = None
    # The machine model to slice for; its macros + capabilities are merged onto the
    # profile. Falls back to the profile's own machine_key.
    machine_key: str | None = None


class TransformRequest(BaseModel):
    """A modular mesh placement transform requested by the frontend."""

    type: str
    vertex_index: int | None = Field(default=None, ge=0)
    face_index: int | None = Field(default=None, ge=0)
    dx: float | None = Field(default=None)
    dy: float | None = Field(default=None)
    cx: float | None = Field(default=None)
    cy: float | None = Field(default=None)
    degrees: float | None = Field(default=None)


def create_app() -> FastAPI:
    """Build the FastAPI application."""
    app = FastAPI(title="Meltio slicer web viewer")

    @app.middleware("http")
    async def _revalidate_static(request, call_next):
        response = await call_next(request)
        path = request.url.path
        if path == "/" or path.startswith("/static"):
            response.headers["Cache-Control"] = "no-cache"
        return response

    sessions = _Sessions()
    profiles = ProfileStore(PROFILES_DIR)

    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
    if ASSETS_DIR.is_dir():
        app.mount("/assets", StaticFiles(directory=str(ASSETS_DIR)), name="assets")

    @app.get("/")
    def index() -> FileResponse:
        return FileResponse(STATIC_DIR / "index.html")

    @app.get("/api/health")
    def health() -> dict:
        return {"status": "ok"}

    # The slicer serves the SAME shared front-end shell as the full platform,
    # whose boot code calls the platform-only endpoints /api/me (header account)
    # and /api/machines (machine-preset picker). This standalone slicer has no
    # user/DB, so those routes would 404 and spam the console (visible as
    # "127.0.0.1 ... 404" errors when the slicer is embedded in the viewer).
    # Serve benign standalone defaults so the shell boots cleanly; both front-end
    # calls already degrade gracefully on the empty payloads.
    @app.get("/api/me")
    def me() -> dict:
        # No authenticated user standalone → blank account label, no remote scene.
        return {"email": ""}

    @app.get("/api/machines")
    def machines() -> dict:
        # Machine presets live in the platform DB; standalone has none. The
        # machine-preset dropdown falls back to just "+ New machine…".
        return {"machines": []}

    @app.get("/api/mesh")
    def get_mesh(req: Request) -> dict:
        mesh, name = sessions.get(_session_id(req)).state.get()
        return mesh_to_payload(mesh, name)

    # Sync `def` (not `async`): reading the upload and load_mesh() are CPU/IO
    # bound, so FastAPI runs this in its worker threadpool — keeping the event
    # loop free to serve progress polls / other sessions during a slow parse.
    # Upload is size-capped so a huge/malformed file can't exhaust process RAM.
    @app.post("/api/load")
    def load(req: Request, file: UploadFile = File(...)) -> dict:
        suffix = Path(file.filename or "upload.stl").suffix or ".stl"
        payload = file.file.read(_MAX_UPLOAD_BYTES + 1)
        if len(payload) > _MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"Mesh upload exceeds the {_MAX_UPLOAD_BYTES // (1024 * 1024)} MB limit.",
            )
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
        sessions.get(_session_id(req)).state.set_mesh(mesh, name)
        return mesh_to_payload(mesh, name)

    @app.post("/api/transform")
    def transform(request: TransformRequest, req: Request) -> dict:
        state = sessions.get(_session_id(req)).state
        mesh, name = state.get()
        params = request.model_dump(exclude={"type"}, exclude_none=True)
        try:
            mesh = apply_transform(mesh, request.type, params)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        state.set_mesh(mesh, name)
        payload = mesh_to_payload(mesh, name)
        if request.vertex_index is not None and request.vertex_index < len(mesh.vertices):
            payload["placed"] = [float(v) for v in mesh.vertices[request.vertex_index]]
        return payload

    def _params_from_request(request: SliceRequest) -> MachineProfile:
        # The profile embeds its machine settings (filled from a machine preset in the
        # GUI), so we slice with it directly — no machine merge. Prefer the full
        # profile_data from the GUI; fall back to a flat-store name for back-compat.
        if request.profile_data is not None:
            try:
                return MachineProfile.from_dict(request.profile_data)
            except (ValueError, TypeError) as exc:
                raise HTTPException(
                    status_code=400, detail=f"Invalid profile: {exc}"
                ) from exc
        profile = profiles.get(request.profile) if request.profile else None
        if profile is None:
            raise HTTPException(
                status_code=404, detail=f"Unknown profile: {request.profile}"
            )
        return profile

    def _build_toolpath(mesh, profile: MachineProfile, report=None):
        def emit(phase: str, percent: float) -> None:
            if report is not None:
                report(phase, percent)

        params = profile.to_slice_parameters()
        emit("Slicing geometry…", 2.0)
        model = slice_mesh(mesh, params)
        support_enabled = profile.support_enabled
        tp_lo, tp_hi = (5.0, 55.0) if support_enabled else (5.0, 98.0)

        def tp_progress(done: int, total: int) -> None:
            frac = done / total if total else 1.0
            emit("Generating toolpath…", tp_lo + (tp_hi - tp_lo) * frac)

        toolpath = generate_profile_toolpath(model, profile, mesh, progress=tp_progress)
        support_mesh = None
        if support_enabled:
            emit("Generating supports…", 58.0)
            support_layers = support_layer_footprints(mesh, params, model.layers)
            support_mesh = generate_support_mesh(support_layers, params.layer_height_mm)
            if support_mesh is not None:

                def sp_progress(done: int, total: int) -> None:
                    frac = done / total if total else 1.0
                    emit("Generating supports…", 60.0 + 38.0 * frac)

                support_toolpath = generate_profile_support_toolpath(
                    support_layers, profile, progress=sp_progress
                )
                toolpath = merge_toolpath_layers(toolpath, support_toolpath)
        emit("Finishing…", 99.0)
        return toolpath, support_mesh

    # -- Profile management (shared across sessions) -----------------------

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
                status_code=400, detail="Cannot delete the last remaining profile."
            )
        return {"profiles": profiles.names()}

    @app.post("/api/slice")
    def do_slice(request: SliceRequest, req: Request) -> dict:
        session = sessions.get(_session_id(req))
        mesh, _ = session.state.get()
        profile = _params_from_request(request)
        session.progress.start("Slicing…")
        try:
            toolpath, support_mesh = _build_toolpath(mesh, profile, session.progress.update)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Slicing failed: {exc}") from exc
        finally:
            session.progress.finish()

        session.state.set_toolpath(toolpath, profile.thermal_diffusivity_mm2_s)
        payload = toolpath_to_payload(toolpath)
        payload["stats"]["materialDiameterMm"] = profile.material_diameter_mm
        payload["stats"]["materialDensityGCm3"] = profile.material_density_g_cm3
        payload["stats"]["estimatedWeightG"] = profile.estimated_mass_g(
            toolpath.total_extrusion_mm
        )
        if support_mesh is not None:
            payload["supportMesh"] = mesh_to_payload(support_mesh, "support")
        return payload

    @app.get("/api/slice/progress")
    def slice_progress(req: Request) -> dict:
        return sessions.get(_session_id(req)).progress.snapshot()

    @app.post("/api/simulate")
    def simulate(req: Request) -> dict:
        session = sessions.get(_session_id(req))
        toolpath = session.state.get_toolpath()
        if toolpath is None:
            raise HTTPException(
                status_code=400, detail="Slice the model before simulating."
            )
        session.sim_progress.start("Preparing…")
        try:
            segments = build_thermal_segments(toolpath)
            session.sim_progress.update("Simulating…", 5.0)
            layer_time_s = _median_layer_time_s(segments)
            time_decay_s = 2.0 * layer_time_s if layer_time_s > 0.0 else 30.0
            background_decay_s = 8.0 * layer_time_s if layer_time_s > 0.0 else 240.0
            params = ThermalParams(
                thermal_diffusivity_mm2_s=session.state.get_thermal_diffusivity(),
                time_decay_s=time_decay_s,
                background_decay_s=background_decay_s,
                background_weight=0.2,
            )

            def sim_update(done: int, total: int) -> None:
                frac = done / total if total else 1.0
                session.sim_progress.update("Simulating…", 5.0 + 90.0 * frac)

            scores = simulate_exposure(segments, params, progress=sim_update)
            session.sim_progress.update("Rendering…", 97.0)
        except Exception as exc:
            raise HTTPException(
                status_code=400, detail=f"Thermal simulation failed: {exc}"
            ) from exc
        finally:
            session.sim_progress.finish()
        return thermal_to_payload(toolpath, segments, scores)

    @app.get("/api/simulate/progress")
    def simulate_progress(req: Request) -> dict:
        return sessions.get(_session_id(req)).sim_progress.snapshot()

    @app.post("/api/gcode")
    def export_gcode(request: SliceRequest, req: Request) -> Response:
        mesh, name = sessions.get(_session_id(req)).state.get()
        profile = _params_from_request(request)
        try:
            toolpath, _ = _build_toolpath(mesh, profile)
            program = build_machine_program(toolpath, profile.to_slice_parameters())
            gcode = program_to_gcode(program, profile=profile)
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
    uvicorn.run(
        "meltio_platform.slicer.web.app:create_app",
        host=host,
        port=port,
        factory=True,
        reload=False,
    )


if __name__ == "__main__":
    run()
