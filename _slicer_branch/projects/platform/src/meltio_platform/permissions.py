"""Roles and their capabilities — the single permissions file.

Each role maps to the set of capabilities ("options") it grants. Endpoints check
capabilities (not role names), the UI shows/hides features by capability, and the
permissions viewer renders this matrix. Edit capabilities here and they take
effect everywhere.

Roles:
- **superuser** — Meltio platform owner; can do anything, see every org's work.
- **meltio_support** — Meltio support; read-only across all orgs (to help users).
- **org_admin** — manages users + settings within their own org (+ all org_user).
- **org_user** — full features within their own org (upload, slice, print, …).
- **org_operator** — can view and record prints, but cannot slice/upload/delete.
"""

from __future__ import annotations

# --- Roles ---
SUPERUSER = "superuser"
MELTIO_SUPPORT = "meltio_support"
ORG_ADMIN = "org_admin"
ORG_USER = "org_user"
ORG_OPERATOR = "org_operator"
ROLES = (SUPERUSER, MELTIO_SUPPORT, ORG_ADMIN, ORG_USER, ORG_OPERATOR)
DEFAULT_ROLE = ORG_USER
# Platform roles live on User.role and apply across every org; org roles are
# assigned per-membership (per org).
PLATFORM_ROLES = (SUPERUSER, MELTIO_SUPPORT)
ORG_ROLES = (ORG_ADMIN, ORG_USER, ORG_OPERATOR)

ROLE_LABELS = {
    SUPERUSER: "Super user",
    MELTIO_SUPPORT: "Meltio Support",
    ORG_ADMIN: "Org Admin",
    ORG_USER: "Org User",
    ORG_OPERATOR: "Org Operator",
}

# --- Capabilities (the editable options) ---
# To ADD a capability: (1) add a constant below, (2) add one line to
# _CAPABILITY_DEFS (its key + label), (3) grant it to roles in ROLE_CAPABILITIES,
# and (4) enforce it where it applies (an endpoint check / a UI gate).
# CAPABILITIES, CAPABILITY_LABELS and the permissions matrix all derive from
# _CAPABILITY_DEFS, so the list and the labels can never drift out of sync.
VIEW = "view"
VIEW_ALL_ORGS = "view_all_orgs"
UPLOAD_PART = "upload_part"
CREATE_PROJECT = "create_project"
SLICE = "slice"
RECORD_PRINT = "record_print"
DOWNLOAD = "download"
DELETE_PART = "delete_part"
MANAGE_PROFILES = "manage_profiles"  # create / share profiles into an org
PRIVATE_SPACE = "private_space"
STREAM_RENDER = "stream_render"  # use the server-side (GPU) pixel-streaming viewer
MANAGE_ORG_USERS = "manage_org_users"
MANAGE_ORG_SETTINGS = "manage_org_settings"
MANAGE_PLATFORM = "manage_platform"  # superuser god-mode (maintenance, any role)

# Single source of truth: (capability, human label), in display order.
_CAPABILITY_DEFS: tuple[tuple[str, str], ...] = (
    (VIEW, "View own org's work"),
    (VIEW_ALL_ORGS, "View all orgs' work"),
    (UPLOAD_PART, "Upload parts"),
    (CREATE_PROJECT, "Create projects"),
    (SLICE, "Slice / save slices"),
    (RECORD_PRINT, "Record prints"),
    (DOWNLOAD, "Download G-code / STL"),
    (DELETE_PART, "Delete parts"),
    (MANAGE_PROFILES, "Add / share org profiles"),
    (PRIVATE_SPACE, "Private workspace"),
    (STREAM_RENDER, "Server-side 3D streaming"),
    (MANAGE_ORG_USERS, "Manage org users"),
    (MANAGE_ORG_SETTINGS, "Manage org settings"),
    (MANAGE_PLATFORM, "Manage platform"),
)
CAPABILITIES = tuple(key for key, _ in _CAPABILITY_DEFS)
CAPABILITY_LABELS = {key: label for key, label in _CAPABILITY_DEFS}

_ORG_USER_CAPS = {
    VIEW, UPLOAD_PART, CREATE_PROJECT, SLICE, RECORD_PRINT, DOWNLOAD, DELETE_PART,
    MANAGE_PROFILES, PRIVATE_SPACE, STREAM_RENDER,
}

ROLE_CAPABILITIES: dict[str, set[str]] = {
    SUPERUSER: set(CAPABILITIES),
    MELTIO_SUPPORT: {VIEW, VIEW_ALL_ORGS, DOWNLOAD, PRIVATE_SPACE, STREAM_RENDER},
    ORG_ADMIN: _ORG_USER_CAPS | {MANAGE_ORG_USERS, MANAGE_ORG_SETTINGS},
    ORG_USER: set(_ORG_USER_CAPS),
    ORG_OPERATOR: {VIEW, DOWNLOAD, RECORD_PRINT, STREAM_RENDER},
}


# A superuser can retune which capabilities a role grants, but: the superuser
# role itself is locked (always all-powerful), and MANAGE_PLATFORM is the master
# key — it stays superuser-only and can't be handed to another role.
EDITABLE_ROLES = (MELTIO_SUPPORT, ORG_ADMIN, ORG_USER, ORG_OPERATOR)
LOCKED_CAPABILITIES = (MANAGE_PLATFORM,)
ASSIGNABLE_CAPABILITIES = tuple(c for c in CAPABILITIES if c not in LOCKED_CAPABILITIES)

# Runtime overrides of ROLE_CAPABILITIES, persisted in the DB and loaded at
# startup (see role_config.py). Empty means "use the defaults above".
_overrides: dict[str, set[str]] = {}


def caps_for(role: str) -> set[str]:
    if role == SUPERUSER:
        return set(CAPABILITIES)  # superuser always has everything
    if role in _overrides:
        return set(_overrides[role])
    return set(ROLE_CAPABILITIES.get(role, set()))


def has_cap(role: str, cap: str) -> bool:
    caps = caps_for(role)
    return cap in caps or MANAGE_PLATFORM in caps


def set_role_caps(role: str, caps) -> None:
    """Override one editable role's capabilities (in memory)."""
    if role not in EDITABLE_ROLES:
        raise ValueError(f"role is not editable: {role}")
    _overrides[role] = {c for c in caps if c in ASSIGNABLE_CAPABILITIES}


def set_overrides(mapping) -> None:
    """Replace all overrides at once (used when loading from the DB)."""
    _overrides.clear()
    for role, caps in (mapping or {}).items():
        if role in EDITABLE_ROLES:
            _overrides[role] = {c for c in caps if c in ASSIGNABLE_CAPABILITIES}


def current_overrides() -> dict[str, list[str]]:
    """Serialisable view of the active overrides (for persistence)."""
    return {role: sorted(caps) for role, caps in _overrides.items()}


def matrix() -> dict:
    """The full role × capability matrix for the permissions viewer."""
    return {
        "capabilities": [
            {"key": c, "label": CAPABILITY_LABELS.get(c, c)} for c in CAPABILITIES
        ],
        "roles": [
            {
                "key": r,
                "label": ROLE_LABELS.get(r, r),
                "capabilities": sorted(caps_for(r)),
            }
            for r in ROLES
        ],
        "lockedRoles": [SUPERUSER],
        "lockedCapabilities": list(LOCKED_CAPABILITIES),
    }
