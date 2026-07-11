"""Scoped library for machine **profiles** (recipes) and **machine presets**.

One ``profiles`` table holds two kinds (``kind`` = ``"profile"`` | ``"machine"``):

- **profile** — a material/process recipe (``MachineProfile``). It embeds its machine
  settings (capabilities + macros), filled from a machine preset.
- **machine** — a machine-model preset (``MachineModel``: capabilities + the G-code
  macro dialect), used to fill a profile's machine settings.

Both share the same scoping (``factory`` / ``org`` / ``private``, mirroring Parts'
``active_org``), sharing (``…/share`` → pending) and org-admin approval. The generic
``_op_*`` functions take ``kind``; the ``/api/profiles`` router uses ``kind="profile"``
and ``/api/machines`` (machines.py) uses ``kind="machine"``. See docs/MACHINE_MODELS.md.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from .. import permissions
from ..auth import (
    PRIVATE_SCOPE,
    active_org,
    caps_in_org,
    get_current_user,
    role_in_org,
)
from ..db import get_db
from ..models import Org, ProfileRecord, User
from ..slicer.machine_catalog import MachineModel, machine_catalog
from ..slicer.profile import MachineProfile
from ..slicer.profile_store import factory_profiles

router = APIRouter(prefix="/api", tags=["profiles"])

PROFILE, MACHINE = "profile", "machine"


def _now() -> datetime:
    return datetime.now(timezone.utc)


# --- kind-specific (de)serialization --------------------------------------


def _validate(kind: str, payload: dict) -> tuple[str, str, str]:
    """Validate a create/update payload for ``kind``; return (name, data_json,
    machine_key). Machines carry no machine_key of their own."""
    if kind == MACHINE:
        obj = MachineModel.from_dict(payload)
        return obj.name, json.dumps(obj.to_dict()), ""
    obj = MachineProfile.from_dict({**payload, "factory": False})
    return obj.name, json.dumps(obj.to_dict()), obj.machine_key


def _data_for(kind: str, raw: dict) -> str:
    if kind == MACHINE:
        return json.dumps(MachineModel.from_dict(raw).to_dict())
    return json.dumps(MachineProfile.from_dict(raw).to_dict())


# --- factory seeding -------------------------------------------------------


def _seed_kind(db: Session, kind: str, items: list[tuple[str, dict, str]]) -> None:
    existing = {
        rec.name: rec
        for rec in db.scalars(
            select(ProfileRecord).where(
                ProfileRecord.scope == "factory", ProfileRecord.kind == kind
            )
        )
    }
    seen: set[str] = set()
    for name, data_dict, machine_key in items:
        seen.add(name)
        data = json.dumps(data_dict)
        rec = existing.get(name)
        if rec is None:
            db.add(
                ProfileRecord(
                    kind=kind,
                    scope="factory",
                    name=name,
                    data=data,
                    status="active",
                    machine_key=machine_key,
                )
            )
        elif rec.data != data or rec.machine_key != machine_key:
            rec.data, rec.machine_key, rec.updated_at = data, machine_key, _now()
    for name, rec in existing.items():
        if name not in seen:
            db.delete(rec)


def seed_factory(db: Session) -> None:
    """Upsert the shipped factory **profiles** and **machine presets**. Idempotent;
    run on startup so the masters stay present + canonical regardless of disk/db state."""
    _seed_kind(
        db,
        PROFILE,
        [(p.name, p.to_dict(), p.machine_key) for p in factory_profiles()],
    )
    _seed_kind(db, MACHINE, [(m.name, m.to_dict(), "") for m in machine_catalog()])
    db.commit()


def _ensure_factory(db: Session) -> None:
    """Seed factory rows on first use if none are present, so the DB self-heals even
    when the startup seed couldn't run against this session (e.g. tests)."""
    if not db.scalar(
        select(ProfileRecord.id).where(ProfileRecord.scope == "factory").limit(1)
    ):
        seed_factory(db)


# --- scoping ---------------------------------------------------------------


def _is_org_admin(db: Session, user: User, org_id) -> bool:
    """Whether the caller may approve/administer the given org's library (the
    org-settings capability, which superusers also hold). Private has no admin."""
    if org_id == PRIVATE_SCOPE:
        return False
    return permissions.MANAGE_ORG_SETTINGS in caps_in_org(db, user, org_id)


def _can_manage(db: Session, user: User, scope) -> bool:
    """Whether the caller may add/share in ``scope`` — their own Private space always,
    or an org where they hold the manage-profiles capability (users + admins)."""
    if scope == PRIVATE_SCOPE:
        return True
    return permissions.MANAGE_PROFILES in caps_in_org(db, user, scope)


def _visible(stmt, user: User, scope, admin: bool, kind: str):
    """Restrict a query to records of ``kind`` the caller may see in ``scope``:
    factory always, their own private (Private), or the org's active records + their
    own pending (org). Org admins also see others' pending in their org."""
    stmt = stmt.where(ProfileRecord.kind == kind)
    if scope == PRIVATE_SCOPE:
        return stmt.where(
            or_(
                ProfileRecord.scope == "factory",
                and_(
                    ProfileRecord.scope == "private",
                    ProfileRecord.created_by_id == user.id,
                ),
            )
        )
    if admin:
        return stmt.where(
            or_(
                ProfileRecord.scope == "factory",
                and_(ProfileRecord.scope == "org", ProfileRecord.org_id == scope),
            )
        )
    return stmt.where(
        or_(
            ProfileRecord.scope == "factory",
            and_(
                ProfileRecord.scope == "org",
                ProfileRecord.org_id == scope,
                or_(
                    ProfileRecord.status == "active",
                    ProfileRecord.created_by_id == user.id,
                ),
            ),
        )
    )


def _resolve(db: Session, user: User, scope, key: str, kind: str) -> ProfileRecord:
    """Look up a visible record of ``kind`` by ``key`` — UUID or name (within scope).
    Name lookup prefers an editable (non-factory) match. 404 if missing."""
    admin = _is_org_admin(db, user, scope)
    rec = None
    try:
        pid = uuid.UUID(key)
    except ValueError:
        pid = None
    if pid is not None:
        rec = db.scalar(
            _visible(
                select(ProfileRecord).where(ProfileRecord.id == pid),
                user,
                scope,
                admin,
                kind,
            )
        )
    if rec is None:
        rows = db.scalars(
            _visible(
                select(ProfileRecord).where(ProfileRecord.name == key),
                user,
                scope,
                admin,
                kind,
            )
        ).all()
        rec = next(
            (r for r in rows if r.scope != "factory"), rows[0] if rows else None
        )
    if rec is None:
        raise HTTPException(status_code=404, detail="Not found")
    return rec


def _may_edit(rec: ProfileRecord, user: User) -> bool:
    """Factory is read-only; private is owner-only; org may be edited by its creator
    or an admin/superuser."""
    if rec.scope == "factory":
        return False
    if rec.scope == "private":
        return rec.created_by_id == user.id
    return rec.created_by_id == user.id or user.is_admin or user.is_superuser


def _name_taken(
    db: Session, scope, org_id, user: User, name: str, exclude, kind: str
) -> bool:
    stmt = select(ProfileRecord).where(
        ProfileRecord.kind == kind, ProfileRecord.name == name
    )
    if scope == PRIVATE_SCOPE:
        stmt = stmt.where(
            ProfileRecord.scope == "private", ProfileRecord.created_by_id == user.id
        )
    else:
        stmt = stmt.where(ProfileRecord.scope == "org", ProfileRecord.org_id == org_id)
    if exclude is not None:
        stmt = stmt.where(ProfileRecord.id != exclude)
    return db.scalar(stmt) is not None


def _unique_share_name(
    db: Session, scope, org_id, user: User, base: str, label: str, kind: str
) -> str:
    """A distinct name for a shared copy, so it never collides with its origin —
    forced ``"<name> (<target>)"`` suffix, numbered if taken within the target scope."""
    candidate = f"{base} ({label})"
    n = 2
    while _name_taken(db, scope, org_id, user, candidate, None, kind):
        candidate = f"{base} ({label}) {n}"
        n += 1
    return candidate


def _entry(rec: ProfileRecord, source_name: str | None = None) -> dict:
    return {
        "id": str(rec.id),
        "kind": rec.kind,
        "name": rec.name,
        "scope": rec.scope,
        "factory": rec.scope == "factory",
        "status": rec.status,
        "version": rec.version,
        "createdBy": rec.creator.email if rec.creator else None,
        "sharedFrom": source_name,
        # The machine label a profile targets (its embedded machine's name).
        "machineName": rec.machine_key or None,
    }


def _full(rec: ProfileRecord) -> dict:
    """The record's JSON data plus library metadata (id/kind/scope/status/version)."""
    data = json.loads(rec.data)
    data.update(
        id=str(rec.id),
        kind=rec.kind,
        scope=rec.scope,
        status=rec.status,
        factory=rec.scope == "factory",
        version=rec.version,
    )
    return data


# --- generic operations (shared by the profiles + machines routers) --------


def _op_list(db: Session, user: User, scope, kind: str) -> dict:
    _ensure_factory(db)
    admin = _is_org_admin(db, user, scope)
    rows = db.scalars(_visible(select(ProfileRecord), user, scope, admin, kind)).all()
    rows.sort(key=lambda r: (r.scope != "factory", r.name.lower()))
    src_ids = {r.source_profile_id for r in rows if r.source_profile_id}
    src_names: dict[uuid.UUID, str] = {}
    if src_ids:
        for s in db.scalars(select(ProfileRecord).where(ProfileRecord.id.in_(src_ids))):
            src_names[s.id] = s.name
    key = "machines" if kind == MACHINE else "profiles"
    return {
        key: [_entry(r, src_names.get(r.source_profile_id)) for r in rows],
        "canApprove": admin,
        "canManage": _can_manage(db, user, scope),
    }


def _op_get(db: Session, user: User, scope, key: str, kind: str) -> dict:
    _ensure_factory(db)
    return _full(_resolve(db, user, scope, key, kind))


def _op_create(db: Session, user: User, scope, kind: str, payload: dict) -> dict:
    if not _can_manage(db, user, scope):
        raise HTTPException(status_code=403, detail="You can't add to this org")
    name, data, machine_key = _validate(kind, payload)
    org_id = None if scope == PRIVATE_SCOPE else scope
    if _name_taken(db, scope, org_id, user, name, None, kind):
        raise HTTPException(status_code=409, detail="That name already exists")
    rec = ProfileRecord(
        kind=kind,
        scope="private" if scope == PRIVATE_SCOPE else "org",
        org_id=user.org_id if scope == PRIVATE_SCOPE else scope,
        created_by_id=user.id,
        name=name,
        data=data,
        status="active",
        machine_key=machine_key,
    )
    db.add(rec)
    db.commit()
    return _full(rec)


def _op_update(db: Session, user: User, scope, key: str, kind: str, payload: dict) -> dict:
    rec = _resolve(db, user, scope, key, kind)
    if not _may_edit(rec, user):
        raise HTTPException(status_code=403, detail="This item is read-only")
    name, data, machine_key = _validate(rec.kind, payload)
    org_id = None if rec.scope == "private" else rec.org_id
    if _name_taken(db, scope, org_id, user, name, rec.id, rec.kind):
        raise HTTPException(status_code=409, detail="That name already exists")
    rec.name, rec.data, rec.machine_key = name, data, machine_key
    rec.version += 1  # bumps on every save (shown like a slice version)
    rec.updated_at = _now()
    db.commit()
    return _full(rec)


def _op_rename(db: Session, user: User, scope, key: str, kind: str, payload: dict) -> dict:
    rec = _resolve(db, user, scope, key, kind)
    if not _may_edit(rec, user):
        raise HTTPException(status_code=403, detail="This item is read-only")
    new_name = (payload.get("name") or "").strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="A name is required")
    org_id = None if rec.scope == "private" else rec.org_id
    if _name_taken(db, scope, org_id, user, new_name, rec.id, rec.kind):
        raise HTTPException(status_code=409, detail="That name already exists")
    data = json.loads(rec.data)
    data["name"] = new_name
    rec.name = new_name
    rec.data = json.dumps(data)
    rec.version += 1
    rec.updated_at = _now()
    db.commit()
    return _full(rec)


def _op_delete(db: Session, user: User, scope, key: str, kind: str) -> dict:
    rec = _resolve(db, user, scope, key, kind)
    if not _may_edit(rec, user):
        raise HTTPException(status_code=403, detail="This item is read-only")
    db.delete(rec)
    db.commit()
    return {"ok": True}


def _op_share(db: Session, user: User, scope, key: str, kind: str, payload: dict) -> dict:
    _ensure_factory(db)
    src = _resolve(db, user, scope, key, kind)
    target = payload.get("org_id") or payload.get("target")
    if not target:
        raise HTTPException(status_code=400, detail="target org_id required")
    raw = {**json.loads(src.data), "factory": False}
    base = raw.get("name", "item")

    if str(target) in ("private", PRIVATE_SCOPE):
        name = _unique_share_name(db, PRIVATE_SCOPE, None, user, base, "private", kind)
        raw["name"] = name
        rec = ProfileRecord(
            kind=kind,
            scope="private",
            org_id=user.org_id,
            created_by_id=user.id,
            name=name,
            data=_data_for(kind, raw),
            status="active",
            source_profile_id=src.id,
            machine_key=raw.get("machine_key", ""),
        )
    else:
        try:
            target_org = uuid.UUID(str(target))
        except ValueError:
            raise HTTPException(status_code=400, detail="invalid target org_id")
        if role_in_org(db, user, target_org) is None:
            raise HTTPException(status_code=403, detail="No access to that org")
        if not _can_manage(db, user, target_org):
            raise HTTPException(status_code=403, detail="You can't add to this org")
        org = db.get(Org, target_org)
        label = org.name if org else "shared"
        name = _unique_share_name(db, target_org, target_org, user, base, label, kind)
        raw["name"] = name
        admin = _is_org_admin(db, user, target_org)
        rec = ProfileRecord(
            kind=kind,
            scope="org",
            org_id=target_org,
            created_by_id=user.id,
            name=name,
            data=_data_for(kind, raw),
            status="active" if admin else "pending",
            source_profile_id=src.id,
            approved_by_id=user.id if admin else None,
            approved_at=_now() if admin else None,
            machine_key=raw.get("machine_key", ""),
        )
    db.add(rec)
    db.commit()
    return _full(rec)


def _op_approve(db: Session, user: User, scope, key: str, kind: str) -> dict:
    rec = _resolve(db, user, scope, key, kind)
    if rec.scope != "org":
        raise HTTPException(status_code=400, detail="Only org items are approved")
    if not _is_org_admin(db, user, rec.org_id):
        raise HTTPException(status_code=403, detail="Org admin privileges required")
    rec.status = "active"
    rec.approved_by_id = user.id
    rec.approved_at = _now()
    rec.updated_at = _now()
    db.commit()
    return _full(rec)


def _op_reject(db: Session, user: User, scope, key: str, kind: str) -> dict:
    rec = _resolve(db, user, scope, key, kind)
    if rec.scope != "org":
        raise HTTPException(status_code=400, detail="Only org items are approved")
    if not _is_org_admin(db, user, rec.org_id):
        raise HTTPException(status_code=403, detail="Org admin privileges required")
    db.delete(rec)
    db.commit()
    return {"ok": True}


# --- /api/profiles router (kind="profile") ---------------------------------


@router.get("/profiles")
def list_profiles(user=Depends(get_current_user), scope=Depends(active_org), db: Session = Depends(get_db)) -> dict:
    return _op_list(db, user, scope, PROFILE)


@router.get("/profiles/{key}")
def get_profile(key: str, user=Depends(get_current_user), scope=Depends(active_org), db: Session = Depends(get_db)) -> dict:
    return _op_get(db, user, scope, key, PROFILE)


@router.post("/profiles")
def create_profile(payload: dict = Body(...), user=Depends(get_current_user), scope=Depends(active_org), db: Session = Depends(get_db)) -> dict:
    return _op_create(db, user, scope, PROFILE, payload)


@router.put("/profiles/{key}")
def update_profile(key: str, payload: dict = Body(...), user=Depends(get_current_user), scope=Depends(active_org), db: Session = Depends(get_db)) -> dict:
    return _op_update(db, user, scope, key, PROFILE, payload)


@router.patch("/profiles/{key}")
def rename_profile(key: str, payload: dict = Body(...), user=Depends(get_current_user), scope=Depends(active_org), db: Session = Depends(get_db)) -> dict:
    return _op_rename(db, user, scope, key, PROFILE, payload)


@router.delete("/profiles/{key}")
def delete_profile(key: str, user=Depends(get_current_user), scope=Depends(active_org), db: Session = Depends(get_db)) -> dict:
    return _op_delete(db, user, scope, key, PROFILE)


@router.post("/profiles/{key}/share")
def share_profile(key: str, payload: dict = Body(...), user=Depends(get_current_user), scope=Depends(active_org), db: Session = Depends(get_db)) -> dict:
    return _op_share(db, user, scope, key, PROFILE, payload)


@router.post("/profiles/{key}/approve")
def approve_profile(key: str, user=Depends(get_current_user), scope=Depends(active_org), db: Session = Depends(get_db)) -> dict:
    return _op_approve(db, user, scope, key, PROFILE)


@router.post("/profiles/{key}/reject")
def reject_profile(key: str, user=Depends(get_current_user), scope=Depends(active_org), db: Session = Depends(get_db)) -> dict:
    return _op_reject(db, user, scope, key, PROFILE)
