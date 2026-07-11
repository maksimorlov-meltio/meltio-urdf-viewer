"""Append-only audit trail.

Call :func:`record` from endpoints after a significant mutation. It is
best-effort — a failure to write an audit row must never break the user action,
so errors are swallowed.
"""

from __future__ import annotations

import json
import uuid
from typing import Any

from sqlalchemy.orm import Session

from .models import AuditEvent, User


def record(
    db: Session,
    actor: User | None,
    action: str,
    target_type: str,
    *,
    target_id: Any = None,
    org_id: uuid.UUID | None = None,
    detail: dict | None = None,
) -> None:
    try:
        db.add(
            AuditEvent(
                actor_id=actor.id if actor else None,
                actor_email=actor.email if actor else "",
                org_id=org_id,
                action=action,
                target_type=target_type,
                target_id=str(target_id) if target_id is not None else None,
                detail=json.dumps(detail) if detail else None,
            )
        )
        db.commit()
    except Exception:  # noqa: BLE001 - auditing must never break the action
        db.rollback()
