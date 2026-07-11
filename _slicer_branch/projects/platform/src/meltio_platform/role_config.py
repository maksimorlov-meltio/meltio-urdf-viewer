"""Persistence for superuser-edited role→capability overrides.

The live matrix lives in :mod:`permissions` (an in-memory cache). This module
loads it from the DB at startup and writes changes back, so an edit survives
restarts and applies across workers on the next load.
"""

from __future__ import annotations

import json

from sqlalchemy.orm import Session

from . import permissions
from .models import PlatformSetting

_KEY = "role_capabilities"


def load_role_overrides(db: Session) -> None:
    """Load persisted overrides into the permissions cache (best-effort)."""
    row = db.get(PlatformSetting, _KEY)
    if not row or not row.value:
        return
    try:
        permissions.set_overrides(json.loads(row.value))
    except (ValueError, TypeError):
        pass


def save_role_caps(db: Session, role: str, caps) -> None:
    """Apply + persist one role's capability set (raises ValueError if the role
    isn't editable)."""
    permissions.set_role_caps(role, caps)
    payload = json.dumps(permissions.current_overrides())
    row = db.get(PlatformSetting, _KEY)
    if row is None:
        db.add(PlatformSetting(key=_KEY, value=payload))
    else:
        row.value = payload
    db.commit()
