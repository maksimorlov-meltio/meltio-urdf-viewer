"""Machine-preset library API — the ``kind="machine"`` mirror of /api/profiles.

Machine presets (M600 Pro, M600, + user-defined) are scoped/shareable/approvable just
like profiles; the slicer's Machine-settings dropdown picks one to fill a profile's
machine settings. All logic is the shared ``_op_*`` from profiles.py with kind=machine.
"""

from __future__ import annotations

from fastapi import APIRouter, Body, Depends
from sqlalchemy.orm import Session

from ..auth import active_org, get_current_user
from ..db import get_db
from .profiles import (
    MACHINE,
    _op_approve,
    _op_create,
    _op_delete,
    _op_get,
    _op_list,
    _op_reject,
    _op_rename,
    _op_share,
    _op_update,
)

router = APIRouter(prefix="/api", tags=["machines"])


@router.get("/machines")
def list_machines(user=Depends(get_current_user), scope=Depends(active_org), db: Session = Depends(get_db)) -> dict:
    return _op_list(db, user, scope, MACHINE)


@router.get("/machines/{key}")
def get_machine_preset(key: str, user=Depends(get_current_user), scope=Depends(active_org), db: Session = Depends(get_db)) -> dict:
    return _op_get(db, user, scope, key, MACHINE)


@router.post("/machines")
def create_machine(payload: dict = Body(...), user=Depends(get_current_user), scope=Depends(active_org), db: Session = Depends(get_db)) -> dict:
    return _op_create(db, user, scope, MACHINE, payload)


@router.put("/machines/{key}")
def update_machine(key: str, payload: dict = Body(...), user=Depends(get_current_user), scope=Depends(active_org), db: Session = Depends(get_db)) -> dict:
    return _op_update(db, user, scope, key, MACHINE, payload)


@router.patch("/machines/{key}")
def rename_machine(key: str, payload: dict = Body(...), user=Depends(get_current_user), scope=Depends(active_org), db: Session = Depends(get_db)) -> dict:
    return _op_rename(db, user, scope, key, MACHINE, payload)


@router.delete("/machines/{key}")
def delete_machine(key: str, user=Depends(get_current_user), scope=Depends(active_org), db: Session = Depends(get_db)) -> dict:
    return _op_delete(db, user, scope, key, MACHINE)


@router.post("/machines/{key}/share")
def share_machine(key: str, payload: dict = Body(...), user=Depends(get_current_user), scope=Depends(active_org), db: Session = Depends(get_db)) -> dict:
    return _op_share(db, user, scope, key, MACHINE, payload)


@router.post("/machines/{key}/approve")
def approve_machine(key: str, user=Depends(get_current_user), scope=Depends(active_org), db: Session = Depends(get_db)) -> dict:
    return _op_approve(db, user, scope, key, MACHINE)


@router.post("/machines/{key}/reject")
def reject_machine(key: str, user=Depends(get_current_user), scope=Depends(active_org), db: Session = Depends(get_db)) -> dict:
    return _op_reject(db, user, scope, key, MACHINE)
