"""Parts + STL file management.

A **Part is a per-org folder/workspace**: its artifacts live under one object-store
prefix — ``orgs/{org_id}/parts/{part_id}/stl/…`` now, and ``…/slices/…`` /
``…/prints/…`` as the pipeline grows. The STL is the simple upload point.

STL bytes are streamed **through the app** (upload and download), which works
identically behind Cloudflare and on-prem with no public object-store endpoint.
Presigned direct-to-store transfer is reserved for the large print media later.
Everything is scoped to the caller's ``org_id`` for tenant isolation.
"""

from __future__ import annotations

import io
import os
import uuid
from pathlib import PurePosixPath

from fastapi import APIRouter, Body, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import audit, permissions, storage
from ..auth import (
    PRIVATE_SCOPE,
    active_org,
    get_current_user,
    require_cap,
    _may_access_org,
)
from ..db import get_db
from ..models import Part, Project, STLFile, User

router = APIRouter(prefix="/api", tags=["parts"])


def _eff_org(user: User, scope) -> uuid.UUID:
    """The org a part physically belongs to for a scope (home org for Private)."""
    return user.org_id if scope == PRIVATE_SCOPE else scope


def _scope_parts(stmt, user: User, scope):
    """Restrict a Part query to the active scope (org id or Private space)."""
    if scope == PRIVATE_SCOPE:
        return stmt.where(Part.created_by_id == user.id, Part.is_private.is_(True))
    return stmt.where(Part.org_id == scope, Part.is_private.is_(False))


def _safe_name(filename: str) -> str:
    return PurePosixPath(filename.replace("\\", "/")).name or "upload.stl"


def _stl_payload(stl: STLFile) -> dict:
    return {
        "id": str(stl.id),
        "filename": stl.filename,
        "sizeBytes": stl.size_bytes,
        "createdAt": stl.created_at.isoformat(),
        "uploadedBy": stl.uploader.email if stl.uploader else None,
    }


def _part_summary(part: Part) -> dict:
    latest = part.stl_files[-1] if part.stl_files else None
    slices = part.slice_versions
    latest_slice = slices[-1] if slices else None
    return {
        "id": str(part.id),
        "name": part.name,
        "projectId": str(part.project_id) if part.project_id else None,
        "createdAt": part.created_at.isoformat(),
        "createdBy": part.creator.email if part.creator else None,
        "updatedAt": part.updated_at.isoformat(),
        "isPrivate": part.is_private,
        "isFavorite": part.is_favorite,
        "stlCount": len(part.stl_files),
        "latestFile": _stl_payload(latest) if latest else None,
        "sliceCount": len(slices),
        "latestSlice": (
            {
                "id": str(latest_slice.id),
                "version": latest_slice.version,
                "createdAt": latest_slice.created_at.isoformat(),
            }
            if latest_slice
            else None
        ),
    }


def _part_detail(part: Part) -> dict:
    return {**_part_summary(part), "stlFiles": [_stl_payload(s) for s in part.stl_files]}


def _get_owned_part(db: Session, user: User, scope, part_id: uuid.UUID) -> Part:
    part = db.scalar(_scope_parts(select(Part).where(Part.id == part_id), user, scope))
    if part is None:
        raise HTTPException(status_code=404, detail="Part not found")
    return part


def _fileobj_size(fileobj) -> int:
    """Byte length of an uploaded file via seek (no full read into memory)."""
    fileobj.seek(0, os.SEEK_END)
    size = fileobj.tell()
    fileobj.seek(0)
    return size


@router.post("/parts", status_code=201)
def create_part(
    name: str = Form(...),
    file: UploadFile = File(...),
    project_id: str = Form(""),
    user: User = Depends(require_cap(permissions.UPLOAD_PART)),
    org: uuid.UUID = Depends(active_org),
    db: Session = Depends(get_db),
) -> dict:
    if not name.strip():
        raise HTTPException(status_code=400, detail="name is required")
    private = org == PRIVATE_SCOPE
    eff_org = _eff_org(user, org)
    project_uuid = None
    if project_id.strip():
        try:
            project_uuid = uuid.UUID(project_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="invalid project_id") from exc
        proj_q = select(Project).where(Project.id == project_uuid)
        if private:
            proj_q = proj_q.where(
                Project.created_by_id == user.id, Project.is_private.is_(True)
            )
        else:
            proj_q = proj_q.where(
                Project.org_id == eff_org, Project.is_private.is_(False)
            )
        if db.scalar(proj_q) is None:
            raise HTTPException(status_code=404, detail="Project not found")
    part = Part(
        org_id=eff_org,
        project_id=project_uuid,
        created_by_id=user.id,
        name=name.strip(),
        is_private=private,
    )
    db.add(part)
    db.flush()  # assigns part.id for the folder key

    filename = _safe_name(file.filename or "upload.stl")
    key = f"orgs/{eff_org}/parts/{part.id}/stl/{filename}"
    size = _fileobj_size(file.file)
    storage.put_fileobj(
        key, file.file, file.content_type or "application/octet-stream"
    )

    db.add(
        STLFile(
            part_id=part.id,
            filename=filename,
            object_key=key,
            size_bytes=size,
            created_by_id=user.id,
        )
    )
    db.commit()
    db.refresh(part)
    audit.record(
        db, user, "part.upload", "part", target_id=part.id, org_id=eff_org,
        detail={"name": part.name, "filename": filename, "private": private},
    )
    return _part_detail(part)


@router.get("/parts")
def list_parts(
    project_id: str = "",
    user: User = Depends(get_current_user),
    org=Depends(active_org),
    db: Session = Depends(get_db),
) -> dict:
    stmt = _scope_parts(select(Part), user, org)
    if project_id.strip():
        try:
            stmt = stmt.where(Part.project_id == uuid.UUID(project_id))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="invalid project_id") from exc
    parts = db.scalars(
        stmt.order_by(Part.is_favorite.desc(), Part.updated_at.desc())
    ).all()
    return {"parts": [_part_summary(p) for p in parts]}


@router.get("/parts/{part_id}")
def get_part(
    part_id: uuid.UUID,
    user: User = Depends(get_current_user),
    org=Depends(active_org),
    db: Session = Depends(get_db),
) -> dict:
    return _part_detail(_get_owned_part(db, user, org, part_id))


@router.patch("/parts/{part_id}")
def update_part(
    part_id: uuid.UUID,
    body: dict = Body(...),
    user: User = Depends(require_cap(permissions.UPLOAD_PART)),
    org=Depends(active_org),
    db: Session = Depends(get_db),
) -> dict:
    """Rename, move between projects, move across orgs / to-from Private
    (``orgId``: target org id or "private"), and/or (un)favourite a part."""
    part = _get_owned_part(db, user, org, part_id)
    # Cross-scope move (clears the project, which belongs to the old scope).
    if "orgId" in body:
        dest = str(body["orgId"])
        if dest == PRIVATE_SCOPE:
            part.is_private = True
            part.org_id = user.org_id
            part.project_id = None
        else:
            try:
                dest_uuid = uuid.UUID(dest)
            except ValueError as exc:
                raise HTTPException(status_code=400, detail="invalid orgId") from exc
            if not _may_access_org(db, user, dest_uuid):
                raise HTTPException(
                    status_code=403, detail="Not a member of the destination org"
                )
            part.is_private = False
            part.org_id = dest_uuid
            part.project_id = None
    if "projectId" in body:
        pid = body["projectId"]
        if pid in (None, ""):
            part.project_id = None
        else:
            try:
                pid_uuid = uuid.UUID(str(pid))
            except ValueError as exc:
                raise HTTPException(status_code=400, detail="invalid projectId") from exc
            owned = db.scalar(
                select(Project).where(
                    Project.id == pid_uuid, Project.org_id == part.org_id
                )
            )
            if owned is None:
                raise HTTPException(status_code=404, detail="Project not found")
            part.project_id = pid_uuid
    if isinstance(body.get("name"), str) and body["name"].strip():
        part.name = body["name"].strip()
    if "favorite" in body:
        part.is_favorite = bool(body["favorite"])
        # Favouriting a part also favourites its folder (so it surfaces too).
        if part.is_favorite and part.project_id:
            proj = db.get(Project, part.project_id)
            if proj is not None:
                proj.is_favorite = True
    db.commit()
    db.refresh(part)
    audit.record(
        db, user, "part.update", "part", target_id=part.id, org_id=part.org_id,
        detail={
            "name": part.name,
            "projectId": str(part.project_id) if part.project_id else None,
            "private": part.is_private,
            "favorite": part.is_favorite,
        },
    )
    return _part_detail(part)


@router.get("/parts/{part_id}/file")
def download_part(
    part_id: uuid.UUID,
    user: User = Depends(get_current_user),
    org=Depends(active_org),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    part = _get_owned_part(db, user, org, part_id)
    if not part.stl_files:
        raise HTTPException(status_code=404, detail="Part has no STL file")
    latest = part.stl_files[-1]
    body, content_type, length = storage.get_object(latest.object_key)
    headers = {"Content-Disposition": f'attachment; filename="{latest.filename}"'}
    if length is not None:
        headers["Content-Length"] = str(length)
    return StreamingResponse(body, media_type=content_type, headers=headers)


@router.delete("/parts/{part_id}")
def delete_part(
    part_id: uuid.UUID,
    user: User = Depends(require_cap(permissions.DELETE_PART)),
    org=Depends(active_org),
    db: Session = Depends(get_db),
) -> dict:
    part = _get_owned_part(db, user, org, part_id)
    name, eff_org = part.name, part.org_id
    for stl in part.stl_files:
        storage.delete_object(stl.object_key)
    db.delete(part)
    db.commit()
    audit.record(
        db, user, "part.delete", "part", target_id=part_id, org_id=eff_org,
        detail={"name": name},
    )
    return {"deleted": str(part_id)}


@router.post("/parts/{part_id}/duplicate", status_code=201)
def duplicate_part(
    part_id: uuid.UUID,
    user: User = Depends(require_cap(permissions.UPLOAD_PART)),
    org=Depends(active_org),
    db: Session = Depends(get_db),
) -> dict:
    """Copy a part (its latest STL) into a new part in the same scope/project."""
    src = _get_owned_part(db, user, org, part_id)
    dup = Part(
        org_id=src.org_id,
        project_id=src.project_id,
        created_by_id=user.id,
        name=f"{src.name} copy",
        is_private=src.is_private,
    )
    db.add(dup)
    db.flush()
    if src.stl_files:
        latest = src.stl_files[-1]
        body, content_type, _ = storage.get_object(latest.object_key)
        data = body.read()
        key = f"orgs/{dup.org_id}/parts/{dup.id}/stl/{latest.filename}"
        storage.put_fileobj(key, io.BytesIO(data), content_type or "model/stl")
        db.add(
            STLFile(
                part_id=dup.id,
                filename=latest.filename,
                object_key=key,
                size_bytes=len(data),
                created_by_id=user.id,
            )
        )
    db.commit()
    db.refresh(dup)
    audit.record(
        db, user, "part.duplicate", "part", target_id=dup.id, org_id=dup.org_id,
        detail={"from": str(src.id), "name": dup.name},
    )
    return _part_detail(dup)
