from __future__ import annotations

import binascii
from datetime import datetime, timezone
import hashlib
import hmac
import json
import logging
import mimetypes
import os
from pathlib import Path
import re
import secrets
from typing import Literal
import urllib.error
import urllib.request
from urllib.parse import urlsplit

import uvicorn
from fastapi import Body, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles

from .services.machine_controlservice import ControlServiceMachine
from .services.machine_mock import get_machine as _get_mock_machine
from .services.sensor_pointcloud import load_attribute_series, load_sensor_pointcloud


# The three fall-back paths below (unreadable permissions store, unwritable
# audit log, unreadable error-code catalog) are all deliberately non-fatal — the
# console must keep running. They were also completely silent, which made a
# corrupt data dir indistinguishable from an empty one. They log now; uvicorn's
# handler picks this up with no extra configuration.
log = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parents[3]
# Data directory (datasets, permissions.json, error_codes.json, audit log).
# Overridable so tests/deployments can point at their own data without
# touching the working tree.
DATABASE_ROOT = Path(os.environ.get("AVIS_DATABASE_ROOT") or PROJECT_ROOT / "database")
ASSETS_ROOT = PROJECT_ROOT / "assets"
STATIC_DIR = Path(__file__).resolve().parent / "static"
# Repo root (phase C layout): the hmi/ and viewer/ frontend partitions live at
# the repository root and are mounted at /hmi and /viewer below.
REPO_ROOT = Path(__file__).resolve().parents[5]
HMI_DIR = REPO_ROOT / "hmi"
VIEWER_DIR = REPO_ROOT / "viewer"
DEFAULT_DATASET_NAME = "small-torture-test_1-0-0"
# Roles/users/permission-matrix document (see /api/permissions/config).
PERMISSIONS_STORE = DATABASE_ROOT / "permissions.json"
# Engine/M600 error+warning code catalog (see /api/error-codes).
ERROR_CODES_STORE = DATABASE_ROOT / "error_codes.json"
# --- Operator sessions + machine-command authorization ---------------------
# Login (/api/auth/login) mints a server-side session and sets this HttpOnly
# cookie; privileged endpoints (POST /api/machine/command) resolve the operator
# from it and enforce a permission — never trusting the client's own gating.
SESSION_COOKIE = "avis_session"
SESSION_TTL_SECONDS = 12 * 60 * 60  # 12h backstop; the UI also auto-signs-out when idle
# Capability key required to edit the roles/users document. Same key the admin
# UI gates itself on (hmi/permissions.js isGod()), so client and server agree.
ADMIN_PERMISSION = "admin.users"
# Machine commands are NOT authorised by a capability key. Each command declares
# a minimum sign-in level in contract.json (the host-owned UI<->host contract);
# a role's `rank` is compared against it. See _command_level() below.
CONTRACT_PATH = REPO_ROOT / "contract.json"
LEVEL_RANK = {"none": 0, "operator": 1, "operatorPlus": 2, "support": 3, "god": 4}
# Append-only JSON-lines audit trail of accepted machine commands (who/when/what),
# written under DATABASE_ROOT so it moves with the data dir (and tests redirect it).
COMMAND_AUDIT_LOG_NAME = "command_audit.log"

# Roles served when no permissions.json exists yet (a fresh clone: the data dir
# is gitignored). Without this the console has no roles to show, no rank to
# authorise against, and no way out: the admin UI needs `admin.users`, which
# needs a signed-in user, which needs tools/set_password.py, which used to
# require a users list that only the admin UI could create. Ranks map to the
# contract's permission levels (LEVEL_RANK) and are what gates machine commands.
# There are deliberately NO default users — nobody can sign in until an operator
# is created with `set_password.py --create`, so this seeds no credentials.
DEFAULT_PERMISSIONS_DOC = {
    "roles": [
        {"id": "role_operator", "name": "Operator", "rank": 1, "builtin": True,
         "permissions": ["files.browse", "print.control", "materials.assign",
                         "slice.run", "slice.profileSelect", "machine.doors",
                         "data.read"]},
        {"id": "role_operator_plus", "name": "Operator+", "rank": 2, "builtin": True,
         "permissions": ["files.browse", "print.control", "materials.assign",
                         "slice.run", "slice.profileSelect", "slice.placement",
                         "machine.doors", "machine.motion", "data.read",
                         "files.upload", "files.delete", "notifications.manage",
                         "calendar.edit"]},
        {"id": "role_support", "name": "Meltio Support", "rank": 3, "builtin": True,
         "permissions": ["files.browse", "print.control", "materials.assign",
                         "slice.run", "slice.profileSelect", "slice.placement",
                         "slice.profileEdit", "machine.doors", "machine.motion",
                         "data.read", "files.upload", "files.delete",
                         "notifications.manage", "calendar.edit",
                         "setup.calibration", "setup.firmware", "setup.network"]},
        {"id": "role_admin", "name": "Administrator", "rank": 4, "builtin": True,
         "permissions": ["files.browse", "print.control", "materials.assign",
                         "slice.run", "slice.profileSelect", "slice.placement",
                         "slice.profileEdit", "machine.doors", "machine.motion",
                         "data.read", "files.upload", "files.delete",
                         "notifications.manage", "calendar.edit",
                         "setup.calibration", "setup.firmware", "setup.network",
                         ADMIN_PERMISSION]},
    ],
    "users": [],
}


def _load_command_levels() -> dict[str, str]:
    """Map every machine command name AND legacy alias to its required sign-in
    level, read from the host-owned contract.json. Returns {} if the contract
    cannot be read — callers treat that as "authorise nothing" (fail closed):
    a missing authorization table must never mean "allow"."""
    try:
        contract = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    commands = (contract.get("channels", {}).get("shell", {})
                .get("uiToHost", {}).get("commands", {}))
    levels: dict[str, str] = {}
    for name, spec in commands.items():
        if not isinstance(spec, dict):
            continue
        level = spec.get("permission", "god")
        levels[name] = level
        for alias in spec.get("aliases", []) or []:
            levels[str(alias)] = level
    return levels


COMMAND_LEVELS = _load_command_levels()

# Optional external slicer (aslicer) integration. Disabled unless AVIS_SLICER_URL
# is set, so the viewer runs fully standalone by default. See docs/PRINT_SIM.md.
SLICER_MULTIPART_BOUNDARY = "----avisualizerSlicerBoundary"

mimetypes.add_type("text/plain", ".urdf")


def _slicer_base_url() -> str | None:
    url = os.environ.get("AVIS_SLICER_URL", "").strip()
    return url.rstrip("/") if url else None


def _slicer_ui_url() -> str | None:
    """Browser-reachable URL of the slicer web UI to embed in the Files menu.

    Prefers an explicit AVIS_SLICER_UI_URL (useful when the slicer's public UI
    origin differs from the API origin used by the proxy), and otherwise falls
    back to AVIS_SLICER_URL. Returns None when no slicer is configured, so the
    Files-menu pane degrades gracefully to a placeholder.
    """
    explicit = os.environ.get("AVIS_SLICER_UI_URL", "").strip()
    if explicit:
        return explicit.rstrip("/")
    return _slicer_base_url()


# --- Real-machine backend (M600Pro.Platform ControlService) ----------------
# The viewer talks to a real M600 by proxying to the machine's local
# ControlService REST API. Like the slicer, it is DISABLED unless configured:
# with no AVIS_MACHINE_URL the viewer uses its in-process mock and runs fully
# standalone. When set (e.g. "http://localhost:5080"), telemetry comes from the
# real machine. Command forwarding stays OFF (read-only) unless AVIS_MACHINE_READONLY=0.
_controlservice_machine: ControlServiceMachine | None = None


def _machine_base_url() -> str | None:
    url = os.environ.get("AVIS_MACHINE_URL", "").strip()
    return url.rstrip("/") if url else None


def _machine_readonly() -> bool:
    return os.environ.get("AVIS_MACHINE_READONLY", "1").strip().lower() not in ("0", "false", "no")


def get_machine():
    """Resolve the machine backend used by the /api/machine/* endpoints.

    Returns the real ControlService adapter when AVIS_MACHINE_URL is set, else the
    in-process mock — so the HTTP endpoints and the whole JS UI never change.
    """
    base = _machine_base_url()
    if not base:
        return _get_mock_machine()
    global _controlservice_machine
    if _controlservice_machine is None or _controlservice_machine.base_url != base:
        _controlservice_machine = ControlServiceMachine(base, readonly=_machine_readonly())
    return _controlservice_machine


def _origin_of(url: str | None) -> str | None:
    """Return the ``scheme://host[:port]`` origin of ``url``, or None."""
    if not url:
        return None
    parts = urlsplit(url)
    if not parts.scheme or not parts.netloc:
        return None
    return f"{parts.scheme}://{parts.netloc}"


def _allowed_cors_origins() -> list[str]:
    """Cross-origin allowlist for the browser API.

    The only legitimate cross-origin caller is the embedded slicer UI, which
    fetches STL files from us (see ``/api/stl/file``) while running on its own
    origin. Same-origin requests from the viewer's own page do not use CORS at
    all, so we never need a wildcard. Restricting to the configured slicer
    origin stops any other site the operator has open from reading the console's
    data (sensor CSVs, machine state, model files) over CORS.
    """
    origins: list[str] = []
    for url in (_slicer_ui_url(), _slicer_base_url()):
        origin = _origin_of(url)
        if origin and origin not in origins:
            origins.append(origin)
    return origins


def _http_json(url: str, *, method: str = "GET", data: bytes | None = None,
               headers: dict[str, str] | None = None, timeout: float = 120.0) -> object:
    request = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310 - configured URL
        body = response.read()
    return json.loads(body.decode("utf-8")) if body else {}


def _slicer_pick_profile(base_url: str, requested: str | None) -> str | None:
    if requested:
        return requested
    try:
        info = _http_json(f"{base_url}/api/profiles", timeout=15.0)
    except Exception:  # noqa: BLE001 - profile discovery is best-effort
        return None

    candidates: list[object] = []
    if isinstance(info, dict):
        if isinstance(info.get("default"), str):
            return info["default"]
        if isinstance(info.get("profiles"), list):
            candidates = info["profiles"]
    elif isinstance(info, list):
        candidates = info

    for entry in candidates:
        if isinstance(entry, str):
            return entry
        if isinstance(entry, dict) and isinstance(entry.get("name"), str):
            return entry["name"]
    return None


def _slice_via_backend(base_url: str, stl_path: Path, profile: str | None) -> object:
    # 1) Upload the STL bytes to the slicer (multipart 'file' field).
    file_bytes = stl_path.read_bytes()
    preamble = (
        f"--{SLICER_MULTIPART_BOUNDARY}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{stl_path.name}"\r\n'
        f"Content-Type: model/stl\r\n\r\n"
    ).encode("utf-8")
    epilogue = f"\r\n--{SLICER_MULTIPART_BOUNDARY}--\r\n".encode("utf-8")
    _http_json(
        f"{base_url}/api/load",
        method="POST",
        data=preamble + file_bytes + epilogue,
        headers={"Content-Type": f"multipart/form-data; boundary={SLICER_MULTIPART_BOUNDARY}"},
        timeout=120.0,
    )

    # 2) Slice and return the toolpath payload verbatim.
    resolved_profile = _slicer_pick_profile(base_url, profile)
    slice_body = json.dumps({"profile": resolved_profile}).encode("utf-8")
    return _http_json(
        f"{base_url}/api/slice",
        method="POST",
        data=slice_body,
        headers={"Content-Type": "application/json"},
        timeout=300.0,
    )


def _normalize_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def _tokenize_name(value: str) -> list[str]:
    return [token for token in re.split(r"[^a-z0-9]+", value.lower()) if token]


def _find_global_stl_root() -> Path | None:
    # Explicit override first; otherwise the legacy convention of an "STL"
    # folder somewhere at/above the project (machine-specific, undocumented).
    override = os.environ.get("AVIS_STL_ROOT", "").strip()
    if override:
        candidate = Path(override)
        return candidate if candidate.is_dir() else None
    for base in [PROJECT_ROOT, *PROJECT_ROOT.parents]:
        candidate = base / "STL"
        if candidate.is_dir():
            return candidate
    return None


def _choose_best_stl_for_dataset(stl_files: list[Path], dataset_name: str) -> Path | None:
    if not stl_files:
        return None

    normalized_dataset = _normalize_name(dataset_name)
    dataset_tokens = _tokenize_name(dataset_name)

    exact_match = [path for path in stl_files if _normalize_name(path.stem) == normalized_dataset]
    if exact_match:
        return sorted(exact_match, key=lambda p: p.as_posix().lower())[0]

    scored: list[tuple[int, int, str, Path]] = []
    for path in stl_files:
        stem = path.stem
        normalized_stem = _normalize_name(stem)
        token_hits = 0
        for token in dataset_tokens:
            if token and token in normalized_stem:
                token_hits += 1

        if token_hits > 0:
            # Prefer more token hits, then shorter name distance, then lexical stability.
            distance = abs(len(normalized_stem) - len(normalized_dataset))
            scored.append((token_hits, -distance, path.as_posix().lower(), path))

    if scored:
        scored.sort(reverse=True)
        return scored[0][3]

    if len(stl_files) == 1:
        return stl_files[0]

    return None


def _list_urdf_models() -> list[dict[str, str]]:
    models: list[dict[str, str]] = []
    for urdf_path in sorted(ASSETS_ROOT.rglob("*.urdf"), key=lambda p: p.as_posix().lower()):
        if not urdf_path.is_file():
            continue

        relative_path = urdf_path.relative_to(ASSETS_ROOT).as_posix()
        model_name = urdf_path.with_suffix("").relative_to(ASSETS_ROOT).as_posix()
        models.append(
            {
                "name": model_name,
                "url": f"/assets/{relative_path}",
            }
        )
    return models


def _resolve_sensor_csv(dataset: str) -> tuple[str, Path]:
    dataset_name = Path(dataset).name
    csv_path = DATABASE_ROOT / dataset_name / "Sensors.csv"
    if not csv_path.exists():
        raise HTTPException(status_code=404, detail=f"Dataset '{dataset_name}' not found")
    return dataset_name, csv_path


def _resolve_dataset_stl(dataset: str) -> tuple[str, Path]:
    dataset_name = Path(dataset).name

    dataset_dir = DATABASE_ROOT / dataset_name
    if dataset_dir.exists():
        stl_files = sorted(dataset_dir.glob("*.stl"), key=lambda p: p.as_posix().lower())
        if stl_files:
            return dataset_name, stl_files[0]

    global_stl_root = _find_global_stl_root()
    if global_stl_root:
        global_stl_files = sorted(global_stl_root.glob("*.stl"), key=lambda p: p.as_posix().lower())
        matched = _choose_best_stl_for_dataset(global_stl_files, dataset_name)
        if matched:
            return dataset_name, matched

    raise HTTPException(
        status_code=404,
        detail=(
            f"No STL found for dataset '{dataset_name}' "
            f"in '{dataset_dir}' or global STL directory"
        ),
    )


def _list_global_stl_files() -> list[Path]:
    global_stl_root = _find_global_stl_root()
    if not global_stl_root:
        return []
    return sorted(global_stl_root.glob("*.stl"), key=lambda p: p.as_posix().lower())


def _resolve_global_stl_file(name: str) -> Path:
    requested = Path(str(name or "")).name.strip()
    if not requested:
        raise HTTPException(status_code=400, detail="STL file name is required")

    for stl_path in _list_global_stl_files():
        if stl_path.name.lower() == requested.lower():
            return stl_path

    raise HTTPException(status_code=404, detail=f"STL file '{requested}' not found")


def _build_binary_sensor_response(
    dataset: str,
    attribute: str,
    view: Literal["point", "voxel"],
    voxel_size_mm: float,
    voxel_size_z_mm: float,
    max_points: int,
    random_seed: int | None,
) -> Response:
    dataset_name, csv_path = _resolve_sensor_csv(dataset)
    try:
        result = load_sensor_pointcloud(
            csv_path=csv_path,
            dataset_name=dataset_name,
            attribute=attribute,
            view_mode=view,
            voxel_size_mm=voxel_size_mm,
            voxel_size_z_mm=voxel_size_z_mm,
            max_points=max_points,
            random_seed=random_seed,
            include_points_list=False,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    headers = {
        "X-AV-Dataset": result.dataset_name,
        "X-AV-Attribute": result.attribute,
        "X-AV-ViewMode": result.view_mode,
        "X-AV-VoxelSizeMm": str(result.voxel_size_mm),
        "X-AV-VoxelSizeZMm": str(result.voxel_size_z_mm),
        "X-AV-BackendEngine": result.backend_engine,
        "X-AV-TotalPoints": str(result.total_points),
        "X-AV-RenderedPoints": str(result.rendered_points),
        "X-AV-Center": ",".join(str(v) for v in result.center),
        "X-AV-Bounds-Min": ",".join(str(v) for v in result.bounds_min),
        "X-AV-Bounds-Max": ",".join(str(v) for v in result.bounds_max),
        "X-AV-Attr-Range": f"{result.attribute_min},{result.attribute_max}",
        "X-AV-PointStride": "5",
    }

    return Response(
        content=result.packed_points.astype("float32", copy=False).tobytes(order="C"),
        media_type="application/octet-stream",
        headers=headers,
    )


def create_app() -> FastAPI:
    app = FastAPI(title="avisualizer web", version="0.1.0")
    # Allow the embedded slicer UI (a different origin) to fetch STL files from us
    # so "Load to slicer" can pre-load the chosen model. Read-only GETs, no creds.
    # Scoped to the configured slicer origin(s) only — never a wildcard — so no
    # other site the operator has open can read the console's data over CORS.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_allowed_cors_origins(),
        allow_methods=["GET"],
        allow_headers=["*"],
    )
    app.add_middleware(GZipMiddleware, minimum_size=1024)

    @app.middleware("http")
    async def _security_headers(request: Request, call_next):
        """Baseline hardening headers on every response.

        Deliberately conservative so the existing (inline-heavy) UI is not
        broken: no restrictive Content-Security-Policy is imposed here. We only
        stop MIME sniffing of the model/sensor payloads and keep model-file URLs
        out of the Referer sent to any embedded third-party origin.
        """
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        return response
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
    app.mount("/hmi", StaticFiles(directory=str(HMI_DIR)), name="hmi")
    app.mount("/viewer", StaticFiles(directory=str(VIEWER_DIR)), name="viewer")
    app.mount("/assets", StaticFiles(directory=str(ASSETS_ROOT)), name="assets")

    @app.get("/")
    def index() -> FileResponse:
        return FileResponse(STATIC_DIR / "index.html")

    @app.get("/urdf")
    def urdf_index() -> Response:
        # Serve the console shell, auto-enabling the live machine link whenever a
        # real machine is configured (AVIS_MACHINE_URL). This makes the integration
        # "always on" on the machine with no URL flag, while a plain standalone run
        # (no AVIS_MACHINE_URL) is untouched and keeps using the local mock demo.
        html = (STATIC_DIR / "urdf.html").read_text(encoding="utf-8")
        machine_on = _machine_base_url() is not None
        readonly = _machine_readonly()
        config = (
            "<script>window.AVIS_MACHINE = { enabled: "
            f"{'true' if machine_on else 'false'}, base: \"\", readonly: "
            f"{'true' if readonly else 'false'} }};</script>\n  "
        )
        if machine_on:
            # Load the read-only program-library browse panel (Files menu). Only
            # when a machine is configured, so the standalone demo is untouched.
            config += (
                '<link rel="stylesheet" href="/static/machine_library.css">\n  '
                '<script src="/static/machine_library.js" defer></script>\n  '
            )
        marker = '<script type="module" data-app-entry'
        html = html.replace(marker, config + marker, 1)
        return HTMLResponse(html)

    # --- Roles, users & login -------------------------------------------------
    # Backend is the source of truth for the roles/users/permission matrix. Users
    # authenticate with username + password against the stored table; passwords
    # are salted + PBKDF2-hashed and NEVER sent to the client. The config served
    # to the browser is stripped of auth secrets (salt/passwordHash). UI gating
    # by the returned mode level remains a client-side convenience, but login now
    # actually validates server-side.
    def _load_permissions_doc() -> dict:
        try:
            if PERMISSIONS_STORE.exists():
                doc = json.loads(PERMISSIONS_STORE.read_text(encoding="utf-8"))
                if isinstance(doc, dict) and doc.get("roles"):
                    return doc
                log.warning("%s has no roles; serving the built-in ones", PERMISSIONS_STORE)
        except (OSError, ValueError) as exc:
            log.warning("could not read %s (%s); serving the built-in roles",
                        PERMISSIONS_STORE, exc)
        # No store yet (fresh clone) or an unusable one: fall back to the built-in
        # roles so the console has ranks to authorise against. No users, so this
        # grants nobody anything until an operator is provisioned.
        return json.loads(json.dumps(DEFAULT_PERMISSIONS_DOC))

    # Allowlists, not denylists. The previous version copied the document and
    # stripped two known-secret keys from `users`, so any future secret — in a
    # user record or in a new top-level key — would have been served to the
    # browser by default. Now a field has to be named here to leave the server.
    _PUBLIC_USER_FIELDS = ("id", "name", "username", "roleId", "avatarColor")
    _PUBLIC_ROLE_FIELDS = ("id", "name", "rank", "builtin", "permissions")

    def _public_permissions_doc(doc: dict, *, include_users: bool) -> dict:
        """The roles/users document as the browser may see it.

        `include_users` is False for anonymous callers: the roster (every
        operator's name and role) is not something a signed-out kiosk visitor
        needs, and only the admin panel — which requires a session — reads it.
        """
        roles = [
            {k: v for k, v in role.items() if k in _PUBLIC_ROLE_FIELDS}
            for role in doc.get("roles", []) or [] if isinstance(role, dict)
        ]
        users = [
            {k: v for k, v in user.items() if k in _PUBLIC_USER_FIELDS}
            for user in doc.get("users", []) or [] if isinstance(user, dict)
        ] if include_users else []
        return {"roles": roles, "users": users}

    def _hash_password(password: str, salt_hex: str) -> str:
        salt = binascii.unhexlify(salt_hex)
        dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100000)
        return binascii.hexlify(dk).decode()

    def _role_for(doc: dict, role_id: str) -> dict | None:
        for role in doc.get("roles", []) or []:
            if isinstance(role, dict) and role.get("id") == role_id:
                return role
        return None

    # Server-side session store: token -> minimal operator record. In-process and
    # scoped to this app instance (so tests get a clean store per create_app()).
    _sessions: dict[str, dict] = {}

    def _operator_from_request(request: Request) -> dict | None:
        """Resolve the signed-in operator from the session cookie, or None.

        Enforces SESSION_TTL_SECONDS server-side. The cookie's own max-age is a
        browser-side courtesy: a client that keeps sending an expired token (or
        a non-browser caller) must still be rejected here."""
        token = request.cookies.get(SESSION_COOKIE)
        if not token:
            return None
        session = _sessions.get(token)
        if session is None:
            return None
        age = (datetime.now(timezone.utc) - session["createdAt"]).total_seconds()
        if age > SESSION_TTL_SECONDS:
            _sessions.pop(token, None)  # expire on read; no sweeper needed
            return None
        return session["operator"]

    def _require_permission(request: Request, permission: str) -> dict:
        """Authenticate + authorise by capability key, or raise. This is the one
        place privileged non-command endpoints go through — before it existed,
        PUT /api/permissions/config simply had no check at all."""
        operator = _operator_from_request(request)
        if operator is None:
            raise HTTPException(status_code=401, detail="Sign in to perform this action")
        role = _role_for(_load_permissions_doc(), operator.get("roleId")) or {}
        granted = role.get("permissions") or []
        # `admin.users` implies everything, matching hmi/permissions.js's isGod().
        # The client already gated this way; without the same rule here an
        # administrator would see a control enabled and get a 403 on using it.
        if permission not in granted and ADMIN_PERMISSION not in granted:
            raise HTTPException(status_code=403, detail="Not authorised to perform this action")
        return operator

    def _command_level(command: str) -> str | None:
        """The sign-in level contract.json requires for this command (by canonical
        name or legacy alias), or None when the command is not declared."""
        return COMMAND_LEVELS.get(command)

    def _append_command_audit(operator: dict, command: str, args: dict, ack: dict) -> None:
        """Append one JSON line recording an accepted (authorised + dispatched)
        machine command. Best-effort: an audit-sink hiccup never fails a command
        that has already been sent to the machine."""
        entry = {
            "ts": datetime.now(timezone.utc).isoformat(),
            # Commands the contract allows signed-out (emergencyStop) still get
            # a line; "anonymous" is a fact worth auditing, not a gap.
            "operatorId": operator.get("id"),
            "operatorName": operator.get("name") or "anonymous",
            "command": command,
            "args": args,
            "ackId": ack.get("id"),
            "accepted": ack.get("accepted"),
        }
        audit_path = DATABASE_ROOT / COMMAND_AUDIT_LOG_NAME
        try:
            audit_path.parent.mkdir(parents=True, exist_ok=True)
            with audit_path.open("a", encoding="utf-8") as fh:
                fh.write(json.dumps(entry, ensure_ascii=False) + "\n")
        except OSError as exc:
            # The command already went to the machine; losing the audit line
            # must not fail it, but it must not vanish quietly either.
            log.error("machine command '%s' was NOT audited to %s: %s", command, audit_path, exc)

    @app.get("/api/permissions/config")
    def get_permissions_config(request: Request) -> dict:
        # Roles are public: the console needs them to render before anyone signs
        # in. The user roster is not — it only feeds the admin panel.
        return _public_permissions_doc(
            _load_permissions_doc(),
            include_users=_operator_from_request(request) is not None,
        )

    # Failed-login throttle, per username. A kiosk has one physical operator, so
    # this is not a DoS surface — it is there so a shoulder-surfer (or a script
    # in the browser console) cannot grind through a 4-digit-ish password at
    # HTTP speed. Successful login clears the counter.
    _login_failures: dict[str, list[float]] = {}
    LOGIN_MAX_FAILURES = 5
    LOGIN_WINDOW_SECONDS = 60.0

    def _login_throttle_check(username: str) -> None:
        now = datetime.now(timezone.utc).timestamp()
        recent = [t for t in _login_failures.get(username, []) if now - t < LOGIN_WINDOW_SECONDS]
        _login_failures[username] = recent
        if len(recent) >= LOGIN_MAX_FAILURES:
            raise HTTPException(
                status_code=429,
                detail=f"Too many failed attempts. Try again in {LOGIN_WINDOW_SECONDS:.0f}s.",
            )

    @app.post("/api/auth/login")
    def auth_login(response: Response, payload: dict | None = Body(default=None)) -> dict:
        data = payload if isinstance(payload, dict) else {}
        username = str(data.get("username", "")).strip()
        password = str(data.get("password", ""))
        _login_throttle_check(username.lower())
        doc = _load_permissions_doc()
        match = None
        for user in doc.get("users", []) or []:
            if isinstance(user, dict) and str(user.get("username", "")).strip().lower() == username.lower():
                match = user
                break
        # Constant-ish-time: always compute a hash even on unknown user.
        salt_hex = (match or {}).get("salt") or binascii.hexlify(b"0" * 16).decode()
        expected = (match or {}).get("passwordHash") or ""
        candidate = _hash_password(password, salt_hex)
        if not match or not expected or not hmac.compare_digest(candidate, expected):
            _login_failures.setdefault(username.lower(), []).append(
                datetime.now(timezone.utc).timestamp())
            raise HTTPException(status_code=401, detail="Username or password not recognised")
        _login_failures.pop(username.lower(), None)
        role = _role_for(doc, match.get("roleId")) or {}
        user = {
            "id": match.get("id"),
            "name": match.get("name"),
            "username": match.get("username"),
            "roleId": match.get("roleId"),
            "roleName": role.get("name"),
            "rank": role.get("rank", 0),
            "permissions": role.get("permissions", []),
            "avatarColor": match.get("avatarColor"),
        }
        # Establish a server-side session so later privileged calls identify this
        # operator without trusting the client. HttpOnly => not readable from JS;
        # the browser returns it automatically on same-origin requests.
        token = secrets.token_urlsafe(32)
        _sessions[token] = {
            "createdAt": datetime.now(timezone.utc),
            "operator": {
                "id": user["id"],
                "name": user["name"],
                "roleId": user["roleId"],
            },
        }
        response.set_cookie(
            SESSION_COOKIE,
            token,
            httponly=True,
            samesite="strict",
            max_age=SESSION_TTL_SECONDS,
            path="/",
        )
        return {"ok": True, "user": user}

    @app.post("/api/auth/logout")
    def auth_logout(request: Request, response: Response) -> dict:
        token = request.cookies.get(SESSION_COOKIE)
        if token:
            _sessions.pop(token, None)
        response.delete_cookie(SESSION_COOKIE, path="/")
        return {"ok": True}

    @app.put("/api/permissions/config")
    def put_permissions_config(request: Request, payload: dict | None = Body(default=None)) -> dict:
        # This document IS the authorization store: it holds every role's rank
        # and capability keys, and the credentials of every operator. It was
        # writable anonymously — `PUT {}` left it as `{}` and locked everyone
        # out, and adding a permission to a role escalated at will (SEG-1).
        _require_permission(request, ADMIN_PERMISSION)
        data = payload if isinstance(payload, dict) else {}
        # A body carrying neither roles nor users is a no-op, not "replace the
        # document with nothing". Refuse it rather than wiping the store.
        if not isinstance(data.get("roles"), list) and not isinstance(data.get("users"), list):
            raise HTTPException(
                status_code=400,
                detail="Body must carry 'roles' and/or 'users'; refusing to empty the store",
            )
        # The client never holds password hashes, so merge incoming users onto the
        # stored ones to PRESERVE each user's salt/passwordHash (a naive overwrite
        # would wipe every credential). Roles/matrix are replaced as sent.
        existing = _load_permissions_doc()
        existing_users = {u.get("id"): u for u in existing.get("users", []) or [] if isinstance(u, dict)}
        merged_users = []
        for user in data.get("users", []) or []:
            if not isinstance(user, dict):
                continue
            prev = existing_users.get(user.get("id"), {})
            merged = dict(prev)
            merged.update({k: v for k, v in user.items() if k not in ("salt", "passwordHash")})
            merged_users.append(merged)
        if merged_users or "users" in data:
            data = dict(data)
            data["users"] = merged_users
        serialized = json.dumps(data, indent=2)
        if len(serialized.encode("utf-8")) > 512 * 1024:
            raise HTTPException(status_code=413, detail="Permissions document too large")
        try:
            PERMISSIONS_STORE.parent.mkdir(parents=True, exist_ok=True)
            PERMISSIONS_STORE.write_text(serialized, encoding="utf-8")
        except OSError as exc:
            raise HTTPException(status_code=500, detail=f"Could not save permissions: {exc}") from exc
        return {"ok": True}

    # --- Machine error/warning code catalog -----------------------------------
    # Static reference catalog of Engine/M600 fault codes (descriptions, causes,
    # remediation). The client pulls this once, caches it, and enriches live
    # codes with it. The master source is a Google Sheet; regenerate the JSON
    # with tools/import_error_codes.py. This endpoint only serves the catalog —
    # the live "which codes are active now" feed is a separate concern.
    @app.get("/api/error-codes")
    def get_error_codes() -> dict:
        try:
            if ERROR_CODES_STORE.exists():
                return json.loads(ERROR_CODES_STORE.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            log.warning("could not read %s (%s); serving an empty catalog",
                        ERROR_CODES_STORE, exc)
        return {"version": 0, "codes": []}

    @app.get("/api/slicer/status")
    def slicer_status() -> dict[str, object]:
        """Report whether an embeddable slicer UI is configured.

        The Files-menu slicer pane calls this to decide between loading the
        embedded slicer (via the same-origin `/slicer` entry) or showing its
        graceful fallback placeholder.
        """
        ui_url = _slicer_ui_url()
        return {
            "configured": ui_url is not None,
            "url": "/slicer" if ui_url else None,
        }

    @app.get("/api/slicer/profiles")
    def slicer_profiles() -> dict[str, object]:
        """List the slicer's machine/material profiles for the viewer's picker.

        Same-origin proxy to the configured slicer's ``/api/profiles`` (the
        browser cannot call the slicer directly — CORS). Normalizes the various
        shapes the slicer may return into a flat list of names plus a default.
        Returns 503 when no slicer is configured, so the Slicer-flyout profile
        picker hides itself, matching the slice proxy's graceful degradation.
        """
        base_url = _slicer_base_url()
        if not base_url:
            raise HTTPException(
                status_code=503,
                detail="Slicer backend not configured (set AVIS_SLICER_URL).",
            )

        try:
            info = _http_json(f"{base_url}/api/profiles", timeout=15.0)
        except urllib.error.URLError as exc:
            raise HTTPException(status_code=502, detail=f"Slicer unreachable: {exc.reason}") from exc
        except Exception as exc:  # noqa: BLE001 - surface as bad gateway, keep viewer usable
            raise HTTPException(status_code=502, detail=f"Slicer profile lookup failed: {exc}") from exc

        default: str | None = None
        entries: object = info
        if isinstance(info, dict):
            if isinstance(info.get("default"), str):
                default = info["default"]
            entries = info.get("profiles")

        names: list[str] = []
        if isinstance(entries, list):
            for entry in entries:
                if isinstance(entry, str):
                    names.append(entry)
                elif isinstance(entry, dict) and isinstance(entry.get("name"), str):
                    names.append(entry["name"])

        return {"profiles": names, "default": default or (names[0] if names else None)}

    @app.get("/slicer")
    def slicer_entry(request: Request) -> Response:
        """Same-origin entry point for the embedded slicer UI.

        Redirects to the configured slicer web UI when available, so the Files
        menu can iframe a stable `/slicer` path regardless of the backend URL.
        The incoming query string is forwarded verbatim so the slicer receives
        both the `stl` param (an absolute URL to one of our STL files, so it
        auto-loads that model) and UI flags like `dock=1` (embedded bottom-bar
        layout). When no slicer is configured, returns a small placeholder page
        instead of a broken frame.
        """
        ui_url = _slicer_ui_url()
        if ui_url:
            # Forward the raw query string as-received (stl is already percent-
            # encoded by the caller), so extra flags such as dock=1 survive the
            # redirect instead of being dropped.
            query = request.url.query
            target = ui_url
            if query:
                separator = "&" if "?" in ui_url else "?"
                target = f"{ui_url}{separator}{query}"
            return RedirectResponse(url=target, status_code=307)
        return HTMLResponse(
            """<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" />
<title>Slicer not configured</title>
<style>
  html,body{height:100%;margin:0;font-family:'Segoe UI',system-ui,sans-serif;
    background:#0b1622;color:#cfe8ff;display:flex;align-items:center;
    justify-content:center;text-align:center}
  .card{max-width:420px;padding:24px;line-height:1.5}
  h1{font-size:16px;letter-spacing:.06em;text-transform:uppercase;
    color:#9ec7ff;margin:0 0 10px}
  p{font-size:13px;color:#9fb4cc;margin:6px 0}
  code{background:rgba(255,255,255,.08);padding:2px 6px;border-radius:5px;
    font-size:12px;color:#e1f0ff}
</style></head>
<body><div class="card">
  <h1>Slicer not connected</h1>
  <p>The slicer software is not configured for this viewer yet.</p>
  <p>Set <code>AVIS_SLICER_URL</code> (or <code>AVIS_SLICER_UI_URL</code>)
     to the slicer service to embed it here.</p>
</div></body></html>""",
            status_code=200,
        )

    @app.get("/api/urdf/models")
    def urdf_models() -> dict[str, object]:
        models = _list_urdf_models()
        default_model_url = models[0]["url"] if models else None
        return {
            "models": models,
            "defaultModelUrl": default_model_url,
        }

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    # `/api/sensors/binary` is a compatibility alias for `/api/sensors`.
    @app.get("/api/sensors")
    @app.get("/api/sensors/binary")
    def sensors(
        dataset: str = Query(default=DEFAULT_DATASET_NAME),
        attribute: str = Query(default="loadCell"),
        view: Literal["point", "voxel"] = Query(default="point"),
        voxel_size_mm: float = Query(default=2.0, ge=0.1, le=20.0),
        voxel_size_z_mm: float = Query(default=1.2, ge=0.1, le=20.0),
        max_points: int = Query(default=150_000, ge=1, le=2_000_000),
        random_seed: int | None = Query(default=None),
    ) -> Response:
        return _build_binary_sensor_response(
            dataset=dataset,
            attribute=attribute,
            view=view,
            voxel_size_mm=voxel_size_mm,
            voxel_size_z_mm=voxel_size_z_mm,
            max_points=max_points,
            random_seed=random_seed,
        )

    @app.get("/api/attribute-series")
    def attribute_series(
        dataset: str = Query(default=DEFAULT_DATASET_NAME),
        attribute: str = Query(default="loadCell"),
        max_samples: int = Query(default=1200, ge=10, le=10000),
    ) -> dict[str, object]:
        dataset_name, csv_path = _resolve_sensor_csv(dataset)
        try:
            result = load_attribute_series(
                csv_path=csv_path,
                dataset_name=dataset_name,
                attribute=attribute,
                max_samples=max_samples,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        return {
            "dataset": result.dataset_name,
            "attribute": result.attribute,
            "totalSamples": result.total_samples,
            "sampledValues": result.sampled_values,
            "sampledIndices": result.sampled_indices,
            "sampledPoints": result.sampled_points,
            "range": {
                "min": result.min_value,
                "max": result.max_value,
            },
        }

    @app.get("/api/datasets/stl")
    def dataset_stl(
        dataset: str = Query(default=DEFAULT_DATASET_NAME),
    ) -> FileResponse:
        _, stl_path = _resolve_dataset_stl(dataset)
        return FileResponse(stl_path, media_type="model/stl")

    @app.get("/api/stl/files")
    def list_global_stl_files() -> dict[str, object]:
        global_stl_root = _find_global_stl_root()
        files = _list_global_stl_files()
        return {
            "root": str(global_stl_root) if global_stl_root else None,
            "files": [path.name for path in files],
        }

    @app.get("/api/stl/file")
    def global_stl_file(
        name: str = Query(..., min_length=1),
    ) -> FileResponse:
        stl_path = _resolve_global_stl_file(name)
        return FileResponse(stl_path, media_type="model/stl")

    @app.post("/api/slice/proxy")
    def slice_proxy(payload: dict | None = Body(default=None)) -> object:
        """Same-origin proxy to the optional aslicer backend.

        Resolves a Files-list model by name, forwards it to the configured
        slicer (load + slice), and returns the toolpath payload. Returns 503
        when no slicer is configured so the viewer degrades gracefully to its
        client-side layer reveal.
        """
        base_url = _slicer_base_url()
        if not base_url:
            raise HTTPException(
                status_code=503,
                detail="Slicer backend not configured (set AVIS_SLICER_URL).",
            )

        body = payload or {}
        name = str(body.get("name") or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Model name is required")

        stl_path = _resolve_global_stl_file(name)  # 404 if unknown
        requested_profile = body.get("profile")
        profile = requested_profile if isinstance(requested_profile, str) else None

        try:
            return _slice_via_backend(base_url, stl_path, profile)
        except urllib.error.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"Slicer error: HTTP {exc.code}") from exc
        except urllib.error.URLError as exc:
            raise HTTPException(status_code=502, detail=f"Slicer unreachable: {exc.reason}") from exc
        except Exception as exc:  # noqa: BLE001 - surface as bad gateway, keep viewer usable
            raise HTTPException(status_code=502, detail=f"Slicer proxy failure: {exc}") from exc

    # --- Machine link (telemetry + commands) ----------------------------------
    # The console's single seam to the machine. Backed today by the in-process
    # mock (services/machine_mock.py) so the whole print flow runs with no
    # hardware; the real M600 adapter implements the same snapshot()/command()
    # contract behind these two endpoints. See static/sim/machineLink.js.
    #
    # Telemetry (state) is read-only and open; issuing COMMANDS is guarded by a
    # real, server-side operator identity + permission check (see below), and
    # every accepted command is written to the audit log. Client-side gating is
    # a convenience only and is never trusted here.
    @app.get("/api/machine/state")
    def machine_state() -> dict:
        return get_machine().snapshot()

    @app.post("/api/machine/command")
    def machine_command(request: Request, payload: dict | None = Body(default=None)) -> dict:
        # Authorization is per COMMAND, not one bit for all of them: contract.json
        # declares a minimum sign-in level per command and the operator's role
        # rank is compared against it. Previously a single `machine.command`
        # capability let a role that could jog also fire ESTOP and START_PRINT —
        # and that key existed nowhere but app.py, so a clean install could not
        # grant it at all and every command 403'd (ARQ-2 / SEG-3).
        data = payload if isinstance(payload, dict) else {}
        command = data.get("command")
        if not isinstance(command, str) or not command:
            raise HTTPException(status_code=400, detail="command is required")
        level = _command_level(command)
        if level is None:
            # Undeclared command: refuse rather than forward something the
            # contract does not describe.
            raise HTTPException(status_code=400, detail=f"Unknown command '{command}'")
        required_rank = LEVEL_RANK.get(level, max(LEVEL_RANK.values()))

        operator = _operator_from_request(request)
        if required_rank > 0:
            if operator is None:
                raise HTTPException(status_code=401, detail="Sign in to control the machine")
            role = _role_for(_load_permissions_doc(), operator.get("roleId")) or {}
            if int(role.get("rank") or 0) < required_rank:
                raise HTTPException(
                    status_code=403,
                    detail=f"'{command}' requires {level} level or above",
                )
        # level "none" (today: only emergencyStop/ESTOP) is deliberately allowed
        # signed-out — the contract says so, and refusing a stop request because
        # nobody is logged in is the wrong failure direction. It is still audited.

        args = data.get("args") if isinstance(data.get("args"), dict) else {}
        ack = get_machine().command(command, args)
        ack["id"] = data.get("id")
        _append_command_audit(operator or {}, command, args, ack)
        return ack

    # --- Machine program library (read-only browse) ---------------------------
    # Surfaces the machine's stored G-code programs + the Meltio Cloud catalog in
    # the Files menu. Read-only; returns empty lists when no real machine is
    # configured (standalone demo), so the endpoint is always safe to call.
    @app.get("/api/machine/library")
    def machine_library() -> dict:
        machine = get_machine()
        if isinstance(machine, ControlServiceMachine):
            return machine.library()
        return {"local": [], "cloud": []}

    @app.get("/api/machine/cloud-status")
    def machine_cloud_status() -> dict:
        machine = get_machine()
        if isinstance(machine, ControlServiceMachine):
            return machine.cloud_status()
        return {
            "connected": False, "online": False, "enrolled": False, "reachable": False,
            "controlServiceConnected": False, "note": "", "serial": "",
        }

    @app.get("/api/machine/library/image")
    def machine_library_image(
        request: Request,
        kind: str = Query(...),
        id: str = Query(...),
        variant: str = Query(default="thumbnail"),
    ) -> Response:
        machine = get_machine()
        if not isinstance(machine, ControlServiceMachine):
            raise HTTPException(status_code=404, detail="No machine library configured")
        if kind not in ("local", "cloud") or variant not in ("thumbnail", "preview"):
            raise HTTPException(status_code=400, detail="invalid kind/variant")
        status, content_type, body, etag = machine.library_image(
            kind, id, variant, if_none_match=request.headers.get("if-none-match")
        )
        if status == 304:
            return Response(status_code=304, headers=({"ETag": etag} if etag else {}))
        if status >= 400 or not body:
            raise HTTPException(status_code=404, detail="image unavailable")
        headers = {"Cache-Control": "no-cache"}
        if etag:
            headers["ETag"] = etag
        return Response(content=body, media_type=content_type or "image/png", headers=headers)

    # --- Session / machine inventory stubs ------------------------------------
    # Minimal stand-ins so the console (and the embedded slicer) can resolve the
    # current operator and the connected machine. The real deployment replaces
    # these with the Meltio dashboard's identity + machine-registry services.
    @app.get("/api/me")
    def whoami(request: Request) -> dict:
        # Reflect the real session when one is present, so the console (and any
        # server-side check) sees the authenticated operator + their permissions.
        operator = _operator_from_request(request)
        if operator is not None:
            doc = _load_permissions_doc()
            role = _role_for(doc, operator.get("roleId")) or {}
            return {
                "id": operator.get("id"),
                "name": operator.get("name"),
                "role": operator.get("roleId"),
                "roleName": role.get("name"),
                "permissions": role.get("permissions", []),
                "authenticated": True,
            }
        # Signed-out default: the anonymous operator view.
        return {
            "id": "operator",
            "name": "Operator",
            "role": "operator",
            "authenticated": False,
        }

    @app.get("/api/machines")
    def machines() -> dict:
        snap = get_machine().snapshot()
        return {
            "machines": [
                {
                    "id": "m600-pro-1",
                    "name": "M600-PRO-1",
                    "model": "M600 Pro",
                    "connected": snap.get("connected", False),
                    "state": snap.get("state"),
                }
            ]
        }

    return app


def run(host: str = "127.0.0.1", port: int = 8080) -> None:
    uvicorn.run("avisualizer.web.app:create_app", host=host, port=port, factory=True, reload=False)
