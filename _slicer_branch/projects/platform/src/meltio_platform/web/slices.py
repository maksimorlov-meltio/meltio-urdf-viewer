"""Versioned G-code slices for a part, with a current/legacy lifecycle.

``POST /api/parts/{id}/slices/import`` saves G-code produced interactively in the
slicer UI (the slicer engine runs there, against the scoped profile library). The
newest slice becomes **current** and the previous current is demoted to **legacy**
with an ``expires_at`` (~1 month). Legacy + expired + never-printed slices are
removed by :func:`cleanup_legacy_slices`; a printed slice is protected.
"""

from __future__ import annotations

import io
import re
import uuid
from datetime import datetime, timezone
from pathlib import PurePosixPath

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import audit, permissions, storage
from ..slicer import SLICER_VERSION
from ..auth import PRIVATE_SCOPE, active_org, get_current_user, require_cap
from ..db import get_db
from ..models import LEGACY_RETENTION, Part, SliceVersion, User
from .parts import _get_owned_part

router = APIRouter(prefix="/api", tags=["slices"])


def _slice_payload(s: SliceVersion) -> dict:
    return {
        "id": str(s.id),
        "version": s.version,
        "name": s.name,
        "profileName": s.profile_name,
        "layerCount": s.layer_count,
        "totalExtrusionMm": round(s.total_extrusion_mm, 2),
        "estimatedWeightG": round(s.estimated_weight_g, 2),
        "gcodeFilename": s.gcode_filename,
        "slicerVersion": s.slicer_version,
        "hasProfile": s.profile_snapshot is not None,
        "machineName": s.machine_key or None,  # the machine label (model name)
        "stlFileId": str(s.stl_file_id) if s.stl_file_id else None,
        "isCurrent": s.is_current,
        "isLegacy": not s.is_current,
        "supersededAt": s.superseded_at.isoformat() if s.superseded_at else None,
        "expiresAt": s.expires_at.isoformat() if s.expires_at else None,
        "simAvailable": s.sim_object_key is not None,
        "toolpathAvailable": s.toolpath_object_key is not None,
        "printCount": len(s.print_runs),
        "createdAt": s.created_at.isoformat(),
        "slicedBy": s.creator.email if s.creator else None,
    }


def get_owned_slice(db: Session, user: User, scope, slice_id: uuid.UUID) -> SliceVersion:
    stmt = (
        select(SliceVersion)
        .join(Part, SliceVersion.part_id == Part.id)
        .where(SliceVersion.id == slice_id)
    )
    if scope == PRIVATE_SCOPE:
        stmt = stmt.where(Part.created_by_id == user.id, Part.is_private.is_(True))
    else:
        stmt = stmt.where(Part.org_id == scope, Part.is_private.is_(False))
    sv = db.scalar(stmt)
    if sv is None:
        raise HTTPException(status_code=404, detail="Slice not found")
    return sv


def _record_slice(
    db: Session,
    user: User,
    part: Part,
    *,
    gcode_bytes: bytes,
    profile_name: str,
    name: str = "",
    layer_count: int,
    total_extrusion_mm: float,
    estimated_weight_g: float,
    slicer_version: str = "",
    profile_snapshot: str | None = None,
    machine_key: str = "",
    sim_bytes: bytes | None = None,
) -> SliceVersion:
    """Store G-code in the part's folder and record the next versioned slice.

    Demotes the part's previous current slice to legacy (kept ~1 month, then
    eligible for cleanup unless it was printed).
    """
    now = datetime.now(timezone.utc)
    for prior in db.scalars(
        select(SliceVersion).where(
            SliceVersion.part_id == part.id, SliceVersion.is_current.is_(True)
        )
    ).all():
        prior.is_current = False
        prior.superseded_at = now
        prior.expires_at = now + LEGACY_RETENTION

    version = (
        db.scalar(
            select(func.count(SliceVersion.id)).where(SliceVersion.part_id == part.id)
        )
        or 0
    ) + 1
    slice_id = uuid.uuid4()
    latest_stl = part.stl_files[-1] if part.stl_files else None
    stem = PurePosixPath(latest_stl.filename).stem if latest_stl else "model"
    gcode_filename = f"{stem}.gcode"
    base = f"orgs/{part.org_id}/parts/{part.id}/slices/{slice_id}"
    key = f"{base}/{gcode_filename}"
    storage.put_fileobj(key, io.BytesIO(gcode_bytes), "text/plain; charset=utf-8")

    sim_key: str | None = None
    sim_at = None
    if sim_bytes:
        sim_key = f"{base}/simulation.json"
        storage.put_fileobj(sim_key, io.BytesIO(sim_bytes), "application/json")
        sim_at = now

    sv = SliceVersion(
        id=slice_id,
        part_id=part.id,
        created_by_id=user.id,
        version=version,
        profile_name=profile_name,
        name=name,
        slicer_version=slicer_version,
        profile_snapshot=profile_snapshot,
        machine_key=machine_key,
        stl_file_id=latest_stl.id if latest_stl else None,
        gcode_object_key=key,
        gcode_filename=gcode_filename,
        layer_count=layer_count,
        total_extrusion_mm=total_extrusion_mm,
        estimated_weight_g=estimated_weight_g,
        sim_object_key=sim_key,
        sim_created_at=sim_at,
        is_current=True,
    )
    db.add(sv)
    db.commit()
    db.refresh(sv)
    return sv


def cleanup_legacy_slices(db: Session) -> int:
    """Remove legacy slices past expiry that were never printed; return count.

    Printed slices (with a ``PrintRun``) are protected and kept indefinitely.
    """
    now = datetime.now(timezone.utc)
    stale = db.scalars(
        select(SliceVersion).where(
            SliceVersion.is_current.is_(False),
            SliceVersion.expires_at.is_not(None),
            SliceVersion.expires_at < now,
        )
    ).all()
    removed = 0
    for sv in stale:
        if sv.print_runs:  # printed → protected
            continue
        storage.delete_object(sv.gcode_object_key)
        if sv.sim_object_key:
            storage.delete_object(sv.sim_object_key)
        if sv.toolpath_object_key:
            storage.delete_object(sv.toolpath_object_key)
        db.delete(sv)
        removed += 1
    db.commit()
    return removed


@router.post("/parts/{part_id}/slices/import", status_code=201)
def import_slice(
    part_id: uuid.UUID,
    file: UploadFile = File(...),
    profile_name: str = Form("imported"),
    name: str = Form(""),
    profile_snapshot: str = Form(""),
    machine_key: str = Form(""),
    layer_count: int = Form(0),
    total_extrusion_mm: float = Form(0.0),
    estimated_weight_g: float = Form(0.0),
    user: User = Depends(require_cap(permissions.SLICE)),
    org: uuid.UUID = Depends(active_org),
    db: Session = Depends(get_db),
) -> dict:
    """Persist G-code produced interactively in the slicer UI as a versioned
    slice on the part, with the full profile snapshot and slicer version."""
    part = _get_owned_part(db, user, org, part_id)
    sv = _record_slice(
        db,
        user,
        part,
        gcode_bytes=file.file.read(),
        profile_name=profile_name,
        name=name,
        layer_count=layer_count,
        total_extrusion_mm=total_extrusion_mm,
        estimated_weight_g=estimated_weight_g,
        slicer_version=SLICER_VERSION,
        profile_snapshot=profile_snapshot or None,
        machine_key=machine_key,
    )
    audit.record(
        db, user, "slice.create", "slice", target_id=sv.id, org_id=part.org_id,
        detail={"part": str(part.id), "version": sv.version, "profile": sv.profile_name},
    )
    return _slice_payload(sv)


@router.get("/parts/{part_id}/slices")
def list_slices(
    part_id: uuid.UUID,
    user: User = Depends(get_current_user),
    org=Depends(active_org),
    db: Session = Depends(get_db),
) -> dict:
    part = _get_owned_part(db, user, org, part_id)
    # Current first, then legacy by most-recent version.
    ordered = sorted(
        part.slice_versions, key=lambda s: (not s.is_current, -s.version)
    )
    return {"slices": [_slice_payload(s) for s in ordered]}


def _gcode_download_name(sv: SliceVersion) -> str:
    """Filename for a downloaded G-code: the slice's user-given name, else its
    stored stem-based filename. The name is sanitised of characters illegal in
    filenames so it is safe in the Content-Disposition header.
    """
    raw = (sv.name or "").strip()
    if not raw:
        return sv.gcode_filename
    safe = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "", raw).strip().rstrip(".")
    if not safe:
        return sv.gcode_filename
    return safe if safe.lower().endswith(".gcode") else f"{safe}.gcode"


@router.get("/slices/{slice_id}/gcode")
def download_gcode(
    slice_id: uuid.UUID,
    user: User = Depends(get_current_user),
    org=Depends(active_org),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    sv = get_owned_slice(db, user, org, slice_id)
    body, _content_type, length = storage.get_object(sv.gcode_object_key)
    headers = {
        "Content-Disposition": f'attachment; filename="{_gcode_download_name(sv)}"'
    }
    if length is not None:
        headers["Content-Length"] = str(length)
    return StreamingResponse(
        body, media_type="text/plain; charset=utf-8", headers=headers
    )


@router.get("/slices/{slice_id}/profile")
def slice_profile(
    slice_id: uuid.UUID,
    user: User = Depends(get_current_user),
    org=Depends(active_org),
    db: Session = Depends(get_db),
) -> Response:
    """The exact profile snapshot a slice was produced with (for reproducibility)."""
    sv = get_owned_slice(db, user, org, slice_id)
    if not sv.profile_snapshot:
        raise HTTPException(status_code=404, detail="No profile snapshot for this slice")
    return Response(content=sv.profile_snapshot, media_type="application/json")


@router.post("/slices/{slice_id}/simulation", status_code=201)
def import_simulation(
    slice_id: uuid.UUID,
    file: UploadFile = File(...),
    user: User = Depends(require_cap(permissions.SLICE)),
    org: uuid.UUID = Depends(active_org),
    db: Session = Depends(get_db),
) -> dict:
    """Attach a simulation result to a slice (stored in the part's folder)."""
    sv = get_owned_slice(db, user, org, slice_id)
    key = f"orgs/{sv.part.org_id}/parts/{sv.part_id}/slices/{sv.id}/simulation.json"
    storage.put_fileobj(key, file.file, "application/json")
    sv.sim_object_key = key
    sv.sim_created_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(sv)
    return _slice_payload(sv)


@router.get("/slices/{slice_id}/simulation")
def download_simulation(
    slice_id: uuid.UUID,
    user: User = Depends(get_current_user),
    org=Depends(active_org),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    sv = get_owned_slice(db, user, org, slice_id)
    if not sv.sim_object_key:
        raise HTTPException(status_code=404, detail="No simulation for this slice")
    body, content_type, length = storage.get_object(sv.sim_object_key)
    headers = {"Content-Disposition": 'attachment; filename="simulation.json"'}
    if length is not None:
        headers["Content-Length"] = str(length)
    return StreamingResponse(body, media_type=content_type, headers=headers)


@router.post("/slices/{slice_id}/toolpath", status_code=201)
def import_toolpath(
    slice_id: uuid.UUID,
    file: UploadFile = File(...),
    user: User = Depends(require_cap(permissions.SLICE)),
    org: uuid.UUID = Depends(active_org),
    db: Session = Depends(get_db),
) -> dict:
    """Attach the toolpath payload (buildToolpath input) to a slice so it reloads
    its 3D without re-slicing. Stored in the part's folder alongside the G-code."""
    sv = get_owned_slice(db, user, org, slice_id)
    key = f"orgs/{sv.part.org_id}/parts/{sv.part_id}/slices/{sv.id}/toolpath.json"
    storage.put_fileobj(key, file.file, "application/json")
    sv.toolpath_object_key = key
    db.commit()
    db.refresh(sv)
    return _slice_payload(sv)


@router.get("/slices/{slice_id}/toolpath")
def download_toolpath(
    slice_id: uuid.UUID,
    user: User = Depends(get_current_user),
    org=Depends(active_org),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    sv = get_owned_slice(db, user, org, slice_id)
    if not sv.toolpath_object_key:
        raise HTTPException(status_code=404, detail="No toolpath for this slice")
    body, content_type, length = storage.get_object(sv.toolpath_object_key)
    headers = {"Content-Disposition": 'attachment; filename="toolpath.json"'}
    if length is not None:
        headers["Content-Length"] = str(length)
    return StreamingResponse(body, media_type=content_type, headers=headers)
