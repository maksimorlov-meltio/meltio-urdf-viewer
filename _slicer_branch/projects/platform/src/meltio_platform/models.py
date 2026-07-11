"""Core domain models.

The hierarchy is **Org → Project (folder) → Part (repo) → {STLFile, SliceVersion,
PrintRun}**. Versioning is central:

- A Part is a "repo": its STL, its slices, and its prints all live under one
  object-store prefix (``orgs/{org}/parts/{id}/…``).
- Re-slicing makes a new **current** ``SliceVersion`` and demotes the previous
  one to **legacy** with an ``expires_at`` (kept ~1 month). A legacy slice that
  was **printed** (has a ``PrintRun``) is protected and never auto-removed.
- ``PrintRun``s are sub-entries of a part, tied to the exact slice that was
  printed; print data is never auto-deleted.

Tenancy + roles: every row is org-scoped via ``org_id``; a ``superuser`` sees
across all orgs. See docs/PLATFORM_ARCHITECTURE.md.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from . import permissions
from .db import Base

# How long a superseded (legacy) slice is retained before it becomes eligible
# for cleanup — unless it was printed, in which case it is kept indefinitely.
LEGACY_RETENTION = timedelta(days=30)

# Roles + capabilities are defined in permissions.py; re-exported here.
ROLE_OPTIONS = permissions.ROLES
ROLE_SUPERUSER = permissions.SUPERUSER


def _now() -> datetime:
    return datetime.now(timezone.utc)


class PlatformSetting(Base):
    """Platform-global key/value settings (JSON text), e.g. role-capability
    overrides edited by a superuser. Not org-scoped."""

    __tablename__ = "platform_settings"

    key: Mapped[str] = mapped_column(String, primary_key=True)
    value: Mapped[str] = mapped_column(String, default="", nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now, nullable=False
    )


class AuditEvent(Base):
    """Append-only audit trail of significant actions (deletes, role/membership/
    permission changes, uploads/slices/prints, org creation). Actor + org are
    stored as plain ids + denormalized email so entries survive user/org deletion.
    """

    __tablename__ = "audit_events"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False, index=True
    )
    actor_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    actor_email: Mapped[str] = mapped_column(String, default="", nullable=False)
    org_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True, index=True)
    action: Mapped[str] = mapped_column(String, nullable=False, index=True)
    target_type: Mapped[str] = mapped_column(String, default="", nullable=False)
    target_id: Mapped[str | None] = mapped_column(String, nullable=True)
    detail: Mapped[str | None] = mapped_column(String, nullable=True)  # JSON text


class Org(Base):
    __tablename__ = "orgs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String, nullable=False)
    slug: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    # Which slicer version this org slices with: "latest" (always newest) or a
    # pinned version string. Lets an org opt out of auto-updating its slicer.
    slicer_pref: Mapped[str] = mapped_column(String, default="latest", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )

    users: Mapped[list[User]] = relationship(back_populates="org")


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orgs.id"), index=True, nullable=False
    )
    email: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(
        String, default=permissions.DEFAULT_ROLE, nullable=False
    )
    # Per-user pixel-streaming prefs (effective only with the stream_render capability):
    # stream_always = open every part in the streamed viewer; otherwise a part hands off to
    # streaming when its sliced toolpath exceeds the device limit (MB).
    stream_always: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    stream_limit_desktop_mb: Mapped[int] = mapped_column(Integer, default=200, nullable=False)
    stream_limit_mobile_mb: Mapped[int] = mapped_column(Integer, default=18, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )

    org: Mapped[Org] = relationship(back_populates="users")

    def has(self, capability: str) -> bool:
        return permissions.has_cap(self.role, capability)

    @property
    def is_superuser(self) -> bool:
        return self.role == permissions.SUPERUSER

    @property
    def is_admin(self) -> bool:
        return self.has(permissions.MANAGE_ORG_USERS)

    @property
    def can_view_all(self) -> bool:
        return self.has(permissions.VIEW_ALL_ORGS)


class Membership(Base):
    """Extra org memberships for a user, beyond their home ``org_id`` — lets a
    user access more than one organisation's workspace (scoped via the active
    org). Role stays global on the user for now."""

    __tablename__ = "memberships"
    __table_args__ = (UniqueConstraint("user_id", "org_id", name="uq_membership"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"), index=True, nullable=False
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orgs.id"), index=True, nullable=False
    )
    # The user's role *within this org* (org_admin/org_user/org_operator). The
    # user's home-org role lives on User.role; platform roles (superuser,
    # meltio_support) live on User.role and apply across every org.
    role: Mapped[str] = mapped_column(
        String, default=permissions.DEFAULT_ROLE, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )


class Project(Base):
    """A folder/workspace grouping parts within an org."""

    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orgs.id"), index=True, nullable=False
    )
    created_by_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now, nullable=False
    )

    is_private: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    parts: Mapped[list[Part]] = relationship(
        back_populates="project", order_by="Part.created_at"
    )


class Part(Base):
    """A printable part ("repo"): source STL(s), versioned slices, and prints."""

    __tablename__ = "parts"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("orgs.id"), index=True, nullable=False
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("projects.id"), index=True, nullable=True
    )
    created_by_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now, nullable=False
    )

    # Private parts live in the owner's personal space, visible only to the
    # creator: access is hard-scoped to created_by_id everywhere (list, get-by-id,
    # slices, downloads) and superusers get no bypass. Favourites pin a part (and
    # its folder) to the top.
    is_private: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    project: Mapped[Project | None] = relationship(back_populates="parts")
    creator: Mapped[User] = relationship(lazy="joined")  # audit: who uploaded
    stl_files: Mapped[list[STLFile]] = relationship(
        back_populates="part",
        cascade="all, delete-orphan",
        order_by="STLFile.created_at",
    )
    slice_versions: Mapped[list[SliceVersion]] = relationship(
        back_populates="part",
        cascade="all, delete-orphan",
        order_by="SliceVersion.version",
    )
    print_runs: Mapped[list[PrintRun]] = relationship(
        back_populates="part",
        cascade="all, delete-orphan",
        order_by="PrintRun.created_at",
    )


class STLFile(Base):
    """An uploaded STL blob for a part (object store pointer)."""

    __tablename__ = "stl_files"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    part_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("parts.id"), index=True, nullable=False
    )
    filename: Mapped[str] = mapped_column(String, nullable=False)
    object_key: Mapped[str] = mapped_column(String, nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # Audit: who uploaded this blob and when (created_at). Nullable for rows
    # created before audit tracking existed.
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )

    part: Mapped[Part] = relationship(back_populates="stl_files")
    uploader: Mapped[User | None] = relationship(lazy="joined")


class SliceVersion(Base):
    """A versioned slice of a part: G-code + stats, optional simulation, and a
    lifecycle (current → legacy → expires, unless printed)."""

    __tablename__ = "slice_versions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    part_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("parts.id"), index=True, nullable=False
    )
    created_by_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"), nullable=False
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    # Optional user-given label for the save (shown alongside the version).
    name: Mapped[str] = mapped_column(String, default="", nullable=False)
    profile_name: Mapped[str] = mapped_column(String, nullable=False)
    # Reproducibility: the slicer engine version and the full profile settings
    # (JSON snapshot) this slice was produced with, so a slice is self-describing
    # and we can tell if it was made with an older slicer/profile.
    slicer_version: Mapped[str] = mapped_column(String, default="", nullable=False)
    profile_snapshot: Mapped[str | None] = mapped_column(String, nullable=True)
    # Traceability: the machine model this G-code was sliced for (printable on any
    # unit of that model), and the exact STL blob it was sliced from.
    machine_key: Mapped[str] = mapped_column(String, default="", nullable=False)
    stl_file_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("stl_files.id"), nullable=True
    )
    gcode_object_key: Mapped[str] = mapped_column(String, nullable=False)
    gcode_filename: Mapped[str] = mapped_column(String, nullable=False)
    layer_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_extrusion_mm: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    estimated_weight_g: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    # Lifecycle: the newest slice is current; older ones become legacy with an
    # expiry. Legacy + expired + never-printed slices are cleaned up.
    is_current: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    superseded_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Optional attached simulation result (object store pointer).
    sim_object_key: Mapped[str | None] = mapped_column(String, nullable=True)
    sim_created_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Toolpath payload (the buildToolpath input — moves/segments/supportMesh) so a
    # saved slice reloads its 3D exactly without re-slicing. G-code is just an export.
    toolpath_object_key: Mapped[str | None] = mapped_column(String, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )

    part: Mapped[Part] = relationship(back_populates="slice_versions")
    creator: Mapped[User] = relationship(lazy="joined")  # audit: who sliced
    print_runs: Mapped[list[PrintRun]] = relationship(back_populates="slice_version")


class PrintRun(Base):
    """A print of a specific slice — a protected sub-entry of the part. Print
    data is never auto-deleted; deleting it requires an explicit (warned) action."""

    __tablename__ = "print_runs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    part_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("parts.id"), index=True, nullable=False
    )
    slice_version_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("slice_versions.id"), index=True, nullable=False
    )
    created_by_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"), nullable=False
    )
    label: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, default="recorded", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )

    part: Mapped[Part] = relationship(back_populates="print_runs")
    slice_version: Mapped[SliceVersion] = relationship(back_populates="print_runs")
    creator: Mapped[User] = relationship(lazy="joined")  # audit: who recorded it


class ProfileRecord(Base):
    """A stored machine profile in the scoped profile library.

    ``scope`` is ``"factory"`` (read-only masters, seeded from code), ``"org"``
    (shared within ``org_id``) or ``"private"`` (the author's own). ``data`` is the
    full ``MachineProfile.to_dict()`` JSON. Org copies created by sharing start
    ``status="pending"`` until an org admin approves them (``"active"``); only
    active/owned profiles are usable for slicing. See docs/PROFILE_LIBRARY.md.
    """

    __tablename__ = "profiles"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    # "profile" (a material/process recipe) or "machine" (a machine-model preset:
    # capabilities + G-code macro dialect). Same table + scoping/share/approval.
    kind: Mapped[str] = mapped_column(String, default="profile", nullable=False, index=True)
    scope: Mapped[str] = mapped_column(String, nullable=False, index=True)
    # org scope: the owning org; private: the owner's home org; factory: NULL.
    org_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("orgs.id"), index=True, nullable=True
    )
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    data: Mapped[str] = mapped_column(String, nullable=False)  # MachineProfile JSON
    # The factory machine model this recipe targets (catalog key, e.g. "m600_pro");
    # mirrors the profile data's machine_key for queryable filtering by machine.
    machine_key: Mapped[str] = mapped_column(String, default="", nullable=False)
    # Bumps on every save (shown like a slice version); a copy starts back at 1.
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    status: Mapped[str] = mapped_column(String, default="active", nullable=False)
    # Provenance: the profile this one was shared/copied from (if any).
    source_profile_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    approved_by_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )
    approved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now, nullable=False
    )

    # Who created this profile (shown in the library), and its share origin.
    creator: Mapped[User | None] = relationship(
        "User", foreign_keys=[created_by_id], lazy="joined"
    )
