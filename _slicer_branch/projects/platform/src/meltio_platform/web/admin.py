"""Admin: user/role management and maintenance.

Scoping: an ``admin`` manages users in their own org (but can't mint superusers);
a ``superuser`` manages everyone across orgs and runs maintenance.
"""

from __future__ import annotations

import json
import re
import uuid

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

# A user may belong to at most this many organisations (home + memberships).
MAX_ORGS_PER_USER = 5

from ..auth import require_admin, require_superuser
from ..db import get_db
from .. import audit, permissions
from ..models import AuditEvent, ROLE_OPTIONS, ROLE_SUPERUSER, Membership, Org, User
from ..slicer import SLICER_VERSION
from .slices import cleanup_legacy_slices

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _user_payload(u: User, memberships: list[dict] | None = None) -> dict:
    return {
        "id": str(u.id),
        "email": u.email,
        "displayName": u.display_name,
        "role": u.role,  # home-org (or platform) role
        "orgId": str(u.org_id),
        "orgSlug": u.org.slug,
        # Extra orgs the user belongs to, each with its per-org role.
        "memberships": memberships or [],
    }


class RoleUpdate(BaseModel):
    role: str


@router.get("/users")
def list_users(
    admin: User = Depends(require_admin), db: Session = Depends(get_db)
) -> dict:
    stmt = select(User)
    if not admin.is_superuser:
        stmt = stmt.where(User.org_id == admin.org_id)
    users = db.scalars(stmt.order_by(User.email)).all()
    mem: dict = {}
    for m in db.scalars(select(Membership)):
        mem.setdefault(m.user_id, []).append({"orgId": str(m.org_id), "role": m.role})
    return {"users": [_user_payload(u, mem.get(u.id, [])) for u in users]}


@router.patch("/users/{user_id}")
def set_role(
    user_id: uuid.UUID,
    body: RoleUpdate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict:
    if body.role not in ROLE_OPTIONS:
        raise HTTPException(status_code=400, detail=f"role must be one of {ROLE_OPTIONS}")
    target = db.get(User, user_id)
    # Non-superuser admins manage only their own org and can't mint superusers.
    if target is None or (
        not admin.is_superuser and target.org_id != admin.org_id
    ):
        raise HTTPException(status_code=404, detail="User not found")
    if body.role in (ROLE_SUPERUSER, permissions.MELTIO_SUPPORT) and not admin.is_superuser:
        raise HTTPException(
            status_code=403,
            detail="Only a superuser can grant superuser or Meltio Support",
        )
    target.role = body.role
    db.commit()
    db.refresh(target)
    audit.record(
        db, admin, "user.role_set", "user", target_id=target.id,
        org_id=target.org_id, detail={"email": target.email, "role": body.role},
    )
    return _user_payload(target)


@router.get("/org")
def get_org(admin: User = Depends(require_admin)) -> dict:
    """The caller's org settings (incl. slicer-version preference)."""
    return {
        "id": str(admin.org.id),
        "name": admin.org.name,
        "slug": admin.org.slug,
        "slicerPref": admin.org.slicer_pref,
        "availableSlicerVersions": [SLICER_VERSION],
    }


@router.patch("/org")
def set_org(
    body: dict = Body(...),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict:
    """Set the org's slicer preference: "latest" or a specific version."""
    pref = str(body.get("slicerPref", "")).strip()
    if pref not in ("latest", SLICER_VERSION):
        raise HTTPException(status_code=400, detail="invalid slicerPref")
    admin.org.slicer_pref = pref
    db.commit()
    return {"slicerPref": admin.org.slicer_pref}


@router.post("/users/{user_id}/orgs", status_code=201)
def add_membership(
    user_id: uuid.UUID,
    body: dict = Body(...),
    superuser: User = Depends(require_superuser),
    db: Session = Depends(get_db),
) -> dict:
    """Superuser: add a user to another organisation (multi-org membership)."""
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    try:
        org_id = uuid.UUID(str(body.get("orgId", "")))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="invalid orgId") from exc
    if db.get(Org, org_id) is None:
        raise HTTPException(status_code=404, detail="Org not found")
    role = str(body.get("role") or permissions.DEFAULT_ROLE)
    if role not in permissions.ORG_ROLES:
        raise HTTPException(status_code=400, detail="invalid org role")
    if org_id != target.org_id:
        existing = db.scalar(
            select(Membership).where(
                Membership.user_id == user_id, Membership.org_id == org_id
            )
        )
        if existing is not None:
            existing.role = role
        else:
            count = db.scalar(
                select(func.count(Membership.id)).where(Membership.user_id == user_id)
            ) or 0
            if count + 1 >= MAX_ORGS_PER_USER:  # +1 for the home org
                raise HTTPException(
                    status_code=409,
                    detail=f"A user can belong to at most {MAX_ORGS_PER_USER} organisations",
                )
            db.add(Membership(user_id=user_id, org_id=org_id, role=role))
        db.commit()
        audit.record(
            db, superuser, "membership.add", "membership", target_id=user_id,
            org_id=org_id, detail={"user": target.email, "role": role},
        )
    return {"ok": True}


@router.patch("/users/{user_id}/orgs/{org_id}")
def set_membership_role(
    user_id: uuid.UUID,
    org_id: uuid.UUID,
    body: dict = Body(...),
    superuser: User = Depends(require_superuser),
    db: Session = Depends(get_db),
) -> dict:
    """Superuser: change a user's role within a specific org."""
    role = str(body.get("role", ""))
    if role not in permissions.ORG_ROLES:
        raise HTTPException(status_code=400, detail="invalid org role")
    m = db.scalar(
        select(Membership).where(
            Membership.user_id == user_id, Membership.org_id == org_id
        )
    )
    if m is None:
        raise HTTPException(status_code=404, detail="Membership not found")
    m.role = role
    db.commit()
    audit.record(
        db, superuser, "membership.role_set", "membership", target_id=user_id,
        org_id=org_id, detail={"role": role},
    )
    return {"ok": True, "role": role}


@router.delete("/users/{user_id}/orgs/{org_id}")
def remove_membership(
    user_id: uuid.UUID,
    org_id: uuid.UUID,
    superuser: User = Depends(require_superuser),
    db: Session = Depends(get_db),
) -> dict:
    """Superuser: remove a user from an org (their home org can't be removed)."""
    m = db.scalar(
        select(Membership).where(
            Membership.user_id == user_id, Membership.org_id == org_id
        )
    )
    if m is not None:
        db.delete(m)
        db.commit()
        audit.record(
            db, superuser, "membership.remove", "membership", target_id=user_id,
            org_id=org_id,
        )
    return {"ok": True}


def _slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug or "org"


@router.get("/orgs")
def list_orgs(
    superuser: User = Depends(require_superuser), db: Session = Depends(get_db)
) -> dict:
    """Superuser: every organisation on the platform."""
    orgs = db.scalars(select(Org).order_by(Org.name)).all()
    # Members = home-org users + extra members via Membership (disjoint sets).
    mem_counts = dict(
        db.execute(
            select(Membership.org_id, func.count()).group_by(Membership.org_id)
        ).all()
    )
    return {
        "orgs": [
            {
                "id": str(o.id),
                "name": o.name,
                "slug": o.slug,
                "userCount": len(o.users) + mem_counts.get(o.id, 0),
                "slicerPref": o.slicer_pref,
            }
            for o in orgs
        ],
        "availableSlicerVersions": [SLICER_VERSION],
    }


@router.post("/orgs", status_code=201)
def create_org(
    body: dict = Body(...),
    superuser: User = Depends(require_superuser),
    db: Session = Depends(get_db),
) -> dict:
    """Superuser: create a new organisation."""
    name = str(body.get("name", "")).strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    slug = _slugify(str(body.get("slug", "")).strip() or name)
    if db.scalar(select(Org).where(Org.slug == slug)):
        raise HTTPException(status_code=409, detail="An org with that slug exists")
    org = Org(name=name, slug=slug)
    db.add(org)
    db.commit()
    db.refresh(org)
    audit.record(
        db, superuser, "org.create", "org", target_id=org.id, org_id=org.id,
        detail={"name": org.name, "slug": org.slug},
    )
    return {"id": str(org.id), "name": org.name, "slug": org.slug, "userCount": 0}


@router.patch("/orgs/{org_id}")
def set_org_slicer(
    org_id: uuid.UUID,
    body: dict = Body(...),
    superuser: User = Depends(require_superuser),
    db: Session = Depends(get_db),
) -> dict:
    """Superuser: set an org's slicer-version preference ("latest" or pinned)."""
    org = db.get(Org, org_id)
    if org is None:
        raise HTTPException(status_code=404, detail="Org not found")
    pref = str(body.get("slicerPref", "")).strip()
    if pref not in ("latest", SLICER_VERSION):
        raise HTTPException(status_code=400, detail="invalid slicerPref")
    org.slicer_pref = pref
    db.commit()
    audit.record(
        db, superuser, "org.slicer_pref", "org", target_id=org_id, org_id=org_id,
        detail={"slicerPref": pref},
    )
    return {"ok": True, "slicerPref": pref}


def _audit_payload(e: AuditEvent) -> dict:
    return {
        "id": str(e.id),
        "createdAt": e.created_at.isoformat(),
        "actor": e.actor_email,
        "action": e.action,
        "targetType": e.target_type,
        "targetId": e.target_id,
        "orgId": str(e.org_id) if e.org_id else None,
        "detail": json.loads(e.detail) if e.detail else None,
    }


@router.get("/audit")
def list_audit(
    limit: int = 100,
    org_id: str = "",
    superuser: User = Depends(require_superuser),
    db: Session = Depends(get_db),
) -> dict:
    """Superuser: the append-only audit trail (most recent first)."""
    stmt = select(AuditEvent).order_by(AuditEvent.created_at.desc())
    if org_id.strip():
        try:
            stmt = stmt.where(AuditEvent.org_id == uuid.UUID(org_id))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="invalid org id") from exc
    stmt = stmt.limit(min(max(limit, 1), 500))
    return {"events": [_audit_payload(e) for e in db.scalars(stmt).all()]}


@router.post("/maintenance/cleanup-legacy")
def cleanup_legacy(
    superuser: User = Depends(require_superuser), db: Session = Depends(get_db)
) -> dict:
    """Remove expired, never-printed legacy slices (manual trigger for now)."""
    return {"removed": cleanup_legacy_slices(db)}
