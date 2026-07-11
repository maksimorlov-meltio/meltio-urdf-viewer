"""Authentication seam.

The app never hand-rolls login — an authenticated identity is provided by the
layer in front and read here, so the front layer stays swappable:

- **Cloud:** Cloudflare Access terminates SSO and passes the verified address in
  the ``Cf-Access-Authenticated-User-Email`` header.
- **On-prem / local dev:** no Cloudflare, so ``PLATFORM_DEV_USER_EMAIL`` supplies
  an identity. (A real local-accounts / OIDC provider slots in here later.)

On first sight of an email we provision a ``User`` and the ``Org`` for its email
domain, so every downstream row can be tenant-scoped from day one.
"""

from __future__ import annotations

import uuid

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import permissions
from .config import get_settings
from .db import get_db
from .models import ROLE_SUPERUSER, Membership, Org, User

ACCESS_EMAIL_HEADER = "Cf-Access-Authenticated-User-Email"
ORG_HEADER = "X-Org-Id"
# Sentinel X-Org-Id value selecting the caller's personal Private space.
PRIVATE_SCOPE = "private"


def _resolve_email(request: Request) -> str | None:
    """Return the authenticated email from the front layer, or the dev fallback."""
    header_email = request.headers.get(ACCESS_EMAIL_HEADER)
    email = header_email or get_settings().dev_user_email
    email = (email or "").strip().lower()
    return email or None


def _get_or_create_org(db: Session, domain: str) -> Org:
    """Return the org for ``domain``, creating it if absent.

    First-sight provisioning races: the SPA fires several requests at once, each
    of which may try to create the same org. The unique ``slug`` makes all but
    one fail with IntegrityError — we catch that, roll back, and re-read the row
    the winning request committed.
    """
    org = db.scalar(select(Org).where(Org.slug == domain))
    if org is not None:
        return org
    org = Org(name=domain, slug=domain)
    db.add(org)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        org = db.scalar(select(Org).where(Org.slug == domain))
    return org


def provision_user(db: Session, email: str) -> User:
    """Return the user for ``email``, creating it (and its org) on first sight.

    Safe under concurrent first-sight requests for the same email/domain.
    """
    user = db.scalar(select(User).where(User.email == email))
    if user is not None:
        return user

    org = _get_or_create_org(db, email.split("@")[-1])
    role = (
        ROLE_SUPERUSER
        if email in get_settings().superuser_email_set()
        else permissions.DEFAULT_ROLE
    )
    user = User(
        email=email, org_id=org.id, display_name=email.split("@")[0], role=role
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        # Another request provisioned the same user first — use its row.
        db.rollback()
        user = db.scalar(select(User).where(User.email == email))
    db.refresh(user)
    return user


def get_current_user(
    request: Request, db: Session = Depends(get_db)
) -> User:
    """FastAPI dependency: the authenticated, provisioned current user."""
    email = _resolve_email(request)
    if email is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated"
        )
    user = provision_user(db, email)
    # Keep superuser grants in sync with the env bootstrap list.
    if email in get_settings().superuser_email_set() and user.role != ROLE_SUPERUSER:
        user.role = ROLE_SUPERUSER
        db.commit()
        db.refresh(user)
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    """Dependency: the current user must be an org admin (or superuser)."""
    if not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Admin privileges required"
        )
    return user


def require_superuser(user: User = Depends(get_current_user)) -> User:
    """Dependency: the current user must be a superuser."""
    if not user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Superuser privileges required",
        )
    return user


def role_in_org(db: Session, user: User, org_id: uuid.UUID) -> str | None:
    """The user's effective role in ``org_id``: their platform role if any
    (applies everywhere), else their home-org role, else the per-org membership
    role — or ``None`` if they have no access to that org."""
    if user.role in permissions.PLATFORM_ROLES:
        return user.role
    if org_id == user.org_id:
        return user.role
    m = db.scalar(
        select(Membership).where(
            Membership.user_id == user.id, Membership.org_id == org_id
        )
    )
    return m.role if m else None


def caps_in_org(db: Session, user: User, org_id: uuid.UUID) -> set[str]:
    role = role_in_org(db, user, org_id)
    return permissions.caps_for(role) if role else set()


def caps_in_scope(db: Session, user: User, scope) -> set[str]:
    """Capabilities for the active scope — an org id, or the Private space (where
    the caller acts with their home-org role)."""
    if scope == PRIVATE_SCOPE:
        return caps_in_org(db, user, user.org_id)
    return caps_in_org(db, user, scope)


def require_cap(capability: str):
    """Dependency factory: require the current user to hold ``capability`` in the
    active scope (per-org role aware)."""

    def _dep(
        user: User = Depends(get_current_user),
        org=Depends(active_org),
        db: Session = Depends(get_db),
    ) -> User:
        caps = caps_in_scope(db, user, org)
        if capability not in caps and permissions.MANAGE_PLATFORM not in caps:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to do that",
            )
        return user

    return _dep


# --- Multi-org membership -------------------------------------------------
# A user has a home ``org_id`` plus any number of extra Memberships. A request
# operates in one "active org" (the X-Org-Id header, default = home org); data is
# scoped to it. A superuser can act in any org.


def accessible_orgs(db: Session, user: User) -> list[Org]:
    """Every org the user may act in: all orgs for a superuser/support, else the
    home org plus explicit memberships."""
    if user.can_view_all:
        return list(db.scalars(select(Org).order_by(Org.name)))
    ids = {user.org_id}
    ids.update(
        db.scalars(select(Membership.org_id).where(Membership.user_id == user.id))
    )
    return list(db.scalars(select(Org).where(Org.id.in_(ids)).order_by(Org.name)))


def _may_access_org(db: Session, user: User, org_id: uuid.UUID) -> bool:
    if user.can_view_all or org_id == user.org_id:
        return True
    return db.scalar(
        select(Membership.id).where(
            Membership.user_id == user.id, Membership.org_id == org_id
        )
    ) is not None


def active_org(
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> uuid.UUID:
    """The scope this request operates in: the caller's Private space (X-Org-Id
    "private"), an org id from the header (or ?org= query, for download links) if
    they may access it, else home org."""
    raw = request.headers.get(ORG_HEADER) or request.query_params.get("org")
    if not raw:
        return user.org_id
    if raw == PRIVATE_SCOPE:
        if not user.has(permissions.PRIVATE_SPACE):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have a private workspace",
            )
        return PRIVATE_SCOPE
    try:
        org_id = uuid.UUID(raw)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="invalid org id") from exc
    if not _may_access_org(db, user, org_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of that organization",
        )
    return org_id
