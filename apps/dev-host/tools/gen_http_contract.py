#!/usr/bin/env python
"""Generate contract-http.json: the HTTP surface an embedder must provide.

    .\\.venv\\Scripts\\python.exe apps/dev-host/tools/gen_http_contract.py

Why this exists
---------------
The repository publishes two contracts to the `release` branch — contract.json
(the UI<->host message contract) and contract-dom.json (the element ids and
injected deps the modules require of an embedder). Neither says anything about
HTTP, so a consumer that hosts the published `hmi/` + `viewer/` modules itself
had exactly one way to learn the backend it must provide: read app.py, which is
not in the release artefact and changes without telling them.

That matters most for the .NET-only host, where every route below has to be
reimplemented in C# — including the ones that carry authorisation. A UI-side
`data-requires-permission` attribute is a convenience, not a boundary (see
CLAUDE.md); the boundary is whatever answers `POST /api/machine/command`. This
file is what tells the other side which routes those are.

What is derived, and therefore trustworthy
------------------------------------------
Everything here is read out of the code, never hand-written:

* the route table, from the live FastAPI app;
* `auth`, from an AST walk of each handler looking for the authorisation
  helpers it actually calls, so removing a permission check changes this file
  and the gate notices;
* `calledBy`, from scanning the published hmi/ + viewer/ partitions for the
  path, which separates "the modules need this" from "only the dev host's own
  wiring uses it".

What is deliberately NOT here: response bodies. They depend on the machine's
datasets and assets, so capturing them would make the file differ between a
fresh clone and a populated one, and a gate that flaps gets ignored.
"""
from __future__ import annotations

import ast
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
APP_PY = REPO_ROOT / "apps" / "dev-host" / "src" / "avisualizer" / "web" / "app.py"
OUT = REPO_ROOT / "contract-http.json"
PUBLISHED_DIRS = [REPO_ROOT / "hmi", REPO_ROOT / "viewer"]

sys.path.insert(0, str(REPO_ROOT / "apps" / "dev-host" / "src"))

# Handler-body markers -> what the route requires of a caller. Order matters:
# the first match wins, most specific first.
AUTH_MARKERS = [
    ("_append_command_audit", "rank"),      # machine commands: rank vs contract.json
    ("_require_permission", "permission"),  # capability key, server-side
    ("_login_throttle_check", "login"),     # credential check + throttle
    ("_revoke_session", "session"),
]


def _handler_auth(tree: ast.AST) -> dict[str, object]:
    """Classify one handler by the authorisation helpers it calls."""
    called: set[str] = set()
    permissions: set[str] = set()
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        name = None
        if isinstance(node.func, ast.Name):
            name = node.func.id
        elif isinstance(node.func, ast.Attribute):
            name = node.func.attr
        if not name:
            continue
        called.add(name)
        if name == "_require_permission":
            # Signature is (request, permission): skip the first positional, or
            # every route reads as requiring a capability called "request".
            for arg in node.args[1:]:
                if isinstance(arg, ast.Constant) and isinstance(arg.value, str):
                    permissions.add(arg.value)
                elif isinstance(arg, ast.Name):
                    permissions.add(_MODULE_CONSTANTS.get(arg.id, f"<{arg.id}>"))

    kind = "none"
    for marker, label in AUTH_MARKERS:
        if marker in called:
            kind = label
            break

    entry: dict[str, object] = {"kind": kind}
    if permissions:
        entry["permissions"] = sorted(permissions)
    if "_append_command_audit" in called:
        entry["audited"] = True
    return entry


_MODULE_CONSTANTS: dict[str, str] = {}


def _collect_module_constants(tree: ast.AST) -> dict[str, str]:
    """Top-level `NAME = "literal"` so a permission passed as ADMIN_PERMISSION
    is recorded as the capability key an implementer must check, not as the
    name of a Python variable they cannot see."""
    found: dict[str, str] = {}
    for node in tree.body if isinstance(tree, ast.Module) else []:
        if not isinstance(node, ast.Assign):
            continue
        if not (isinstance(node.value, ast.Constant) and isinstance(node.value.value, str)):
            continue
        if True:
            for target in node.targets:
                if isinstance(target, ast.Name):
                    found[target.id] = node.value.value
    return found


def _collect_handlers() -> dict[str, ast.AST]:
    """Every function defined in app.py, by name — handlers are nested inside
    create_app(), so a top-level scan is not enough."""
    tree = ast.parse(APP_PY.read_text(encoding="utf-8"))
    _MODULE_CONSTANTS.update(_collect_module_constants(tree))
    handlers: dict[str, ast.AST] = {}
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            handlers[node.name] = node
    return handlers


def _published_callers(path: str) -> list[str]:
    """Which published modules reference this path.

    A plain substring search on purpose: machineLink builds `${base}/api/...`
    and permissions.js holds paths in consts, so anything cleverer would miss
    them. False positives are visible in review; a missed caller is not.
    """
    # "/" is a substring of every file on earth; a one-character path cannot be
    # searched for and claiming 30 callers for it is worse than claiming none.
    callers: list[str] = []
    if len(path) < 2:
        return callers
    for root in PUBLISHED_DIRS:
        if not root.is_dir():
            continue
        for js in sorted(root.rglob("*.js")):
            if _mentions_path(js.read_text(encoding="utf-8", errors="replace"), path):
                callers.append(js.relative_to(REPO_ROOT).as_posix())
    return callers


def _mentions_path(text: str, path: str) -> bool:
    """Substring match, but not mid-identifier.

    Without the trailing check, `/slicer` matches the comment "see
    hmi/slicerPane.js" and the contract claims a caller that never issues the
    request. The character after the path must not continue a name.
    """
    start = 0
    while True:
        at = text.find(path, start)
        if at == -1:
            return False
        after = text[at + len(path):at + len(path) + 1]
        if not (after.isalnum() or after in {"_", "-"}):
            return True
        start = at + 1


def build() -> dict:
    from avisualizer.web.app import create_app  # noqa: PLC0415  (needs sys.path)

    app = create_app()
    handlers = _collect_handlers()

    routes = []
    for route in app.routes:
        path = getattr(route, "path", None)
        methods = getattr(route, "methods", None)
        if not path or not methods:
            # Mounts (StaticFiles) have no methods; recorded separately below.
            continue
        endpoint = getattr(route, "endpoint", None)
        name = getattr(endpoint, "__name__", None) or getattr(route, "name", "")
        for method in sorted(m for m in methods if m not in {"HEAD", "OPTIONS"}):
            node = handlers.get(name)
            entry = {
                "method": method,
                "path": path,
                "handler": name,
                "auth": _handler_auth(node) if node else {"kind": "none"},
                "calledBy": _published_callers(path),
            }
            if node is None:
                # FastAPI's own /docs, /redoc, /openapi.json. Recorded rather
                # than filtered out: they are a live API explorer on a kiosk
                # build, which is a decision someone should make on purpose.
                entry["framework"] = True
            routes.append(entry)

    routes.sort(key=lambda r: (r["path"], r["method"]))

    mounts = []
    for route in app.routes:
        directory = getattr(getattr(route, "app", None), "directory", None)
        if directory is not None:
            mounts.append({
                "path": route.path,
                "servesDirectory": Path(str(directory)).name,
                "calledBy": _published_callers(route.path),
            })
    mounts.sort(key=lambda m: m["path"])

    required = [r for r in routes if r["calledBy"]]
    return {
        "$comment": (
            "GENERATED by apps/dev-host/tools/gen_http_contract.py — never hand-edit. "
            "The HTTP surface an embedder of the published hmi/ + viewer/ modules must "
            "provide. `calledBy` non-empty means a PUBLISHED module calls it, so an "
            "embedder cannot skip it; empty means only this repo's own dev host uses "
            "it. `auth` is derived from the handler's body: a route whose kind is not "
            "'none' enforces authorisation SERVER-SIDE, and reimplementing it without "
            "that enforcement moves the security boundary, it does not remove it. "
            "Response bodies are out of scope on purpose — they depend on local "
            "datasets and would make this file differ between machines."
        ),
        "contractVersion": 2,
        "totals": {
            "routes": len(routes),
            "requiredByPublishedModules": len(required),
            "authBearing": len([r for r in routes
                                if r["auth"]["kind"] != "none" and not r.get("framework")]),
            "frameworkRoutes": len([r for r in routes if r.get("framework")]),
            "staticMounts": len(mounts),
        },
        "staticMounts": mounts,
        "routes": routes,
    }


def main() -> int:
    contract = build()
    text = json.dumps(contract, indent=2, ensure_ascii=False) + "\n"
    OUT.write_text(text, encoding="utf-8", newline="\n")
    totals = contract["totals"]
    print(
        f"contract-http: {totals['routes']} routes "
        f"({totals['requiredByPublishedModules']} required by published modules, "
        f"{totals['authBearing']} auth-bearing), "
        f"{totals['staticMounts']} static mounts -> {OUT.name}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
