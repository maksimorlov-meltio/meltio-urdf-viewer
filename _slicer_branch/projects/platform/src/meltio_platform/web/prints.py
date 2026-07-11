"""Prints — protected sub-entries of a part, tied to the exact slice printed.

Recording a print protects that slice from legacy cleanup (the G-code that was
actually run must be kept). Print data is never auto-deleted.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import audit, permissions
from ..auth import active_org, get_current_user, require_cap
from ..db import get_db
from ..models import PrintRun, User
from .parts import _get_owned_part
from .slices import get_owned_slice

router = APIRouter(prefix="/api", tags=["prints"])


class PrintCreate(BaseModel):
    label: str = Field(min_length=1)


def _print_payload(p: PrintRun) -> dict:
    return {
        "id": str(p.id),
        "partId": str(p.part_id),
        "sliceVersionId": str(p.slice_version_id),
        "sliceVersion": p.slice_version.version,
        "label": p.label,
        "status": p.status,
        "createdAt": p.created_at.isoformat(),
        "recordedBy": p.creator.email if p.creator else None,
    }


@router.post("/slices/{slice_id}/prints", status_code=201)
def create_print(
    slice_id: uuid.UUID,
    body: PrintCreate,
    user: User = Depends(require_cap(permissions.RECORD_PRINT)),
    org=Depends(active_org),
    db: Session = Depends(get_db),
) -> dict:
    sv = get_owned_slice(db, user, org, slice_id)
    pr = PrintRun(
        part_id=sv.part_id,
        slice_version_id=sv.id,
        created_by_id=user.id,
        label=body.label.strip(),
    )
    db.add(pr)
    db.commit()
    db.refresh(pr)
    audit.record(
        db, user, "print.record", "print", target_id=pr.id, org_id=sv.part.org_id,
        detail={"slice": str(sv.id), "version": sv.version, "label": pr.label},
    )
    return _print_payload(pr)


@router.get("/parts/{part_id}/prints")
def list_prints(
    part_id: uuid.UUID,
    user: User = Depends(get_current_user),
    org=Depends(active_org),
    db: Session = Depends(get_db),
) -> dict:
    part = _get_owned_part(db, user, org, part_id)
    return {"prints": [_print_payload(p) for p in part.print_runs]}
