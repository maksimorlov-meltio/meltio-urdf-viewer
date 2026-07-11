"""FastAPI backend for the Meltio platform shell.

Serves the built SPA (or a placeholder when unbuilt) and the platform API:
Postgres-backed identity (Org/User) with the auth seam, object storage, and
parts/STL file management. See docs/PLATFORM_ARCHITECTURE.md.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import os
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import Body, Depends, FastAPI, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.orm import Session

from .. import __version__, audit, permissions, role_config, storage
from ..auth import (
    PRIVATE_SCOPE,
    accessible_orgs,
    active_org,
    caps_in_org,
    get_current_user,
    require_superuser,
    role_in_org,
)
from ..config import get_settings
from ..db import get_db
from ..models import User
from ..storage import storage_ok
from .admin import router as admin_router
from .parts import router as parts_router
from .prints import router as prints_router
from .machines import router as machines_router
from .profiles import router as profiles_router, seed_factory
from .projects import router as projects_router
from .slices import cleanup_legacy_slices, router as slices_router
from ..slicer import SLICER_VERSION
from ..slicer.web.app import create_app as create_slicer_app

# Importing models ensures they are registered on Base.metadata (migrations/tests).
from .. import models  # noqa: F401

# The built SPA is copied to PLATFORM_WEB_DIR in the image; locally (unbuilt) we
# fall back to the packaged placeholder page.
_DEFAULT_STATIC = Path(__file__).resolve().parent / "static"
STATIC_DIR = Path(os.environ.get("PLATFORM_WEB_DIR", str(_DEFAULT_STATIC)))

HOST = "127.0.0.1"
PORT = 8090


def _user_payload(
    user: User,
    orgs: list | None = None,
    role: str | None = None,
    caps: set[str] | None = None,
    private: dict | None = None,
) -> dict:
    # role/capabilities are the *effective* ones for the active org (per-org
    # roles); isAdmin/isSuperuser stay platform/home based.
    role = role or user.role
    caps = caps if caps is not None else permissions.caps_for(role)
    return {
        "id": str(user.id),
        "email": user.email,
        "displayName": user.display_name,
        "role": role,
        "roleLabel": permissions.ROLE_LABELS.get(role, role),
        "capabilities": sorted(caps),
        "isAdmin": user.is_admin,
        "isSuperuser": user.is_superuser,
        # Build/version of the deployment (env override wins so a deploy can pin
        # it to e.g. a git short SHA; falls back to the package version).
        "version": os.environ.get("PLATFORM_VERSION") or __version__,
        # Pixel-streaming render service WS base (e.g. ws://localhost:8092). Empty
        # disables streaming (client renders locally). See docs/PIXEL_STREAMING.md.
        "renderUrl": os.environ.get("PLATFORM_RENDER_URL", ""),
        # Per-user pixel-streaming: canStream gates the whole feature (role capability);
        # streamPref is the user's persistent choice (always-stream + per-device toolpath
        # MB limits that auto-activate streaming). Editable on the user settings page.
        "canStream": permissions.STREAM_RENDER in caps,
        "streamPref": {
            "always": user.stream_always,
            "desktopMb": user.stream_limit_desktop_mb,
            "mobileMb": user.stream_limit_mobile_mb,
        },
        "org": {
            "id": str(user.org.id),
            "name": user.org.name,
            "slug": user.org.slug,
            "slicerPref": user.org.slicer_pref,
        },
        # Every org the user can act in, each with the caller's per-org
        # capabilities — drives the multi-panel browser.
        "orgs": orgs
        if orgs is not None
        else [
            {
                "id": str(user.org.id),
                "name": user.org.name,
                "slug": user.org.slug,
                "capabilities": sorted(caps),
            }
        ],
        # The caller's personal Private space (if their role grants it).
        "private": private or {"enabled": False, "capabilities": []},
        "availableSlicerVersions": [SLICER_VERSION],
    }


RETENTION_SWEEP_SECONDS = 6 * 3600


def _run_retention_sweep() -> None:
    gen = get_db()
    db = next(gen)
    try:
        cleanup_legacy_slices(db)
    finally:
        gen.close()


async def _retention_loop() -> None:
    """Periodically delete expired, never-printed legacy slices (the self-delete
    timer on legacy slices actually firing)."""
    while True:
        try:
            await asyncio.sleep(RETENTION_SWEEP_SECONDS)
            await run_in_threadpool(_run_retention_sweep)
        except asyncio.CancelledError:
            break
        except Exception:  # noqa: BLE001 - best-effort housekeeping
            pass


@asynccontextmanager
async def _lifespan(app: FastAPI):
    # Self-hosted object stores (MinIO) start empty — create the bucket on boot.
    # Real AWS S3 (no endpoint URL) is assumed pre-provisioned, so skip there.
    if get_settings().s3_endpoint_url:
        try:
            storage.ensure_bucket()
        except Exception:  # noqa: BLE001 - non-fatal; /health/storage will report
            pass
    # Load superuser-edited role-capability overrides into the permissions cache.
    try:
        gen = get_db()
        db = next(gen)
        try:
            role_config.load_role_overrides(db)
            # Upsert factory profiles + machine presets on startup so preset edits
            # propagate (the lazy _ensure_factory only seeds an empty table).
            # Swallowed under the test session (the per-test DB seeds lazily instead).
            seed_factory(db)
        finally:
            gen.close()
    except Exception:  # noqa: BLE001 - fall back to default capabilities
        pass
    sweeper = asyncio.create_task(_retention_loop())
    try:
        yield
    finally:
        sweeper.cancel()


def create_app() -> FastAPI:
    """Build the FastAPI application (ASGI factory)."""
    app = FastAPI(title="Meltio platform", version="0.0.3", lifespan=_lifespan)

    @app.middleware("http")
    async def _revalidate_index(request, call_next):
        """Make the browser revalidate index.html so a new deploy is never masked
        by a stale cache. Hashed SPA assets under /assets stay cacheable."""
        response = await call_next(request)
        path = request.url.path
        # Revalidate the SPA index and the (vendored) slicer assets so a deploy
        # is never masked by a stale browser cache.
        if path == "/" or path.endswith("index.html") or path.startswith("/slicer"):
            response.headers["Cache-Control"] = "no-cache"
        return response

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/health/db")
    def health_db(db: Session = Depends(get_db)) -> dict[str, str]:
        db.execute(text("SELECT 1"))
        return {"status": "ok"}

    @app.get("/health/storage")
    def health_storage() -> dict[str, object]:
        return {"status": "ok" if storage_ok() else "unavailable"}

    @app.get("/api/me")
    def me(
        user: User = Depends(get_current_user),
        org: uuid.UUID = Depends(active_org),
        db: Session = Depends(get_db),
    ) -> dict:
        """The authenticated current user, with role + capabilities for the
        active org (X-Org-Id), plus per-org caps + Private info for the panels."""
        org_dicts = [
            {
                "id": str(o.id),
                "name": o.name,
                "slug": o.slug,
                "capabilities": sorted(caps_in_org(db, user, o.id)),
            }
            for o in accessible_orgs(db, user)
        ]
        has_private = user.has(permissions.PRIVATE_SPACE)
        private = {
            "enabled": has_private,
            "capabilities": sorted(caps_in_org(db, user, user.org_id)) if has_private else [],
        }
        active = org if org != PRIVATE_SCOPE else user.org_id
        return _user_payload(
            user,
            org_dicts,
            role=role_in_org(db, user, active) or user.role,
            caps=caps_in_org(db, user, active),
            private=private,
        )

    @app.get("/api/render/token")
    def render_token(user: User = Depends(get_current_user)) -> dict:
        """Short-lived HMAC token the client hands to the pixel-streaming render
        service so it can act as this user without trusting the raw client. Empty
        when no secret is configured (the render service then runs in dev mode), or
        when the user lacks the stream_render capability — the per-user gate for the
        (costly, GPU-backed) server-side viewer."""
        secret = os.environ.get("PLATFORM_RENDER_SECRET", "")
        if not secret or not user.has(permissions.STREAM_RENDER):
            return {"token": "", "iceServers": []}
        exp = int(time.time()) + 300
        payload = f"{user.email}:{exp}"
        sig = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
        # ICE servers (TURN) for the WebRTC viewer — the public (EIP) address the
        # browser uses to relay media. JSON in PLATFORM_RENDER_ICE_SERVERS; [] = the
        # screenshot path (no WebRTC).
        ice_raw = os.environ.get("PLATFORM_RENDER_ICE_SERVERS", "")
        try:
            ice = json.loads(ice_raw) if ice_raw else []
        except Exception:
            ice = []
        return {"token": f"{payload}:{sig}", "iceServers": ice}

    @app.get("/api/permissions")
    def permissions_matrix(user: User = Depends(get_current_user)) -> dict:
        """The role × capability matrix (for the permissions viewer)."""
        data = permissions.matrix()
        data["editable"] = user.is_superuser
        return data

    @app.put("/api/permissions/roles/{role}")
    def set_role_caps(
        role: str,
        body: dict = Body(...),
        user: User = Depends(require_superuser),
        db: Session = Depends(get_db),
    ) -> dict:
        """Superuser: retune which capabilities a role grants."""
        if role not in permissions.EDITABLE_ROLES:
            raise HTTPException(status_code=400, detail="role is not editable")
        caps = body.get("capabilities", [])
        if not isinstance(caps, list):
            raise HTTPException(status_code=400, detail="capabilities must be a list")
        role_config.save_role_caps(db, role, caps)
        audit.record(
            db, user, "permissions.role_edit", "role", target_id=role,
            detail={"capabilities": caps},
        )
        data = permissions.matrix()
        data["editable"] = True
        return data

    @app.patch("/api/me/stream-pref")
    def set_my_stream_pref(
        body: dict = Body(...),
        user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> dict:
        """The caller's own pixel-streaming preference: always-stream + per-device toolpath
        MB limits. Requires the stream_render capability."""
        if not user.has(permissions.STREAM_RENDER):
            raise HTTPException(status_code=403, detail="pixel streaming not permitted")
        if "always" in body:
            user.stream_always = bool(body["always"])
        for field, attr in (("desktopMb", "stream_limit_desktop_mb"), ("mobileMb", "stream_limit_mobile_mb")):
            if field in body:
                try:
                    v = int(body[field])
                except (TypeError, ValueError):
                    raise HTTPException(status_code=400, detail=f"{field} must be an integer")
                if v <= 0:
                    raise HTTPException(status_code=400, detail=f"{field} must be positive")
                setattr(user, attr, v)
        db.commit()
        return {
            "always": user.stream_always,
            "desktopMb": user.stream_limit_desktop_mb,
            "mobileMb": user.stream_limit_mobile_mb,
        }

    app.include_router(projects_router)
    app.include_router(parts_router)
    app.include_router(slices_router)
    app.include_router(prints_router)
    app.include_router(profiles_router)
    app.include_router(machines_router)
    app.include_router(admin_router)

    # Vendored slicer UI (the unified-viewer basis), served under /slicer. Opened
    # from the SPA as /slicer/?part=<id>, which auto-loads that part's STL.
    app.mount("/slicer", create_slicer_app(), name="slicer")

    # Mounted last so API + /slicer win; html=True serves index.html at "/".
    app.mount(
        "/", StaticFiles(directory=str(STATIC_DIR), html=True), name="spa"
    )

    return app


def run(host: str = HOST, port: int = PORT) -> None:
    """Run the platform shell with uvicorn (blocking)."""
    uvicorn.run(
        "meltio_platform.web.app:create_app",
        host=host,
        port=port,
        factory=True,
        reload=False,
    )


if __name__ == "__main__":
    run()
