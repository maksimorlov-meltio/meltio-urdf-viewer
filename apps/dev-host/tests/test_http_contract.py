"""The HTTP contract gate.

contract-http.json is published to the `release` branch and is the only thing
that tells an embedder — notably the .NET-only WPF host, which reimplements
this backend in C# — which routes exist, which of them the published hmi/ +
viewer/ modules actually call, and which enforce authorisation server-side.

A contract nobody checks is documentation, and documentation rots. These tests
regenerate it from the live app and fail if the committed file disagrees, so a
route that is added, removed, or quietly stripped of its permission check
cannot reach `main` without the contract changing in the same diff.

This lives in pytest rather than gate.sh because generating it needs the app
imported, and gate.sh is node-only and offline by design. It runs inside
`viewer pytest`, which is a required check.
"""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
GENERATOR = REPO_ROOT / "apps" / "dev-host" / "tools" / "gen_http_contract.py"
CONTRACT = REPO_ROOT / "contract-http.json"

# Routes whose authorisation is load-bearing, and what they must enforce.
# Hard-coded on purpose: deriving BOTH sides from the same AST walk would make
# the test agree with the code no matter what the code did. This is the
# independent statement of intent that the derived contract is checked against.
EXPECTED_AUTH = {
    ("POST", "/api/machine/command"): "rank",
    ("POST", "/api/auth/login"): "login",
    ("PUT", "/api/permissions/config"): "permission",
}


def _load_generator():
    spec = importlib.util.spec_from_file_location("gen_http_contract", GENERATOR)
    module = importlib.util.module_from_spec(spec)
    sys.modules["gen_http_contract"] = module
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="module")
def generated() -> dict:
    return _load_generator().build()


@pytest.fixture(scope="module")
def committed() -> dict:
    if not CONTRACT.exists():
        pytest.fail(
            f"{CONTRACT.name} is missing. Generate it:\n"
            "  .\\.venv\\Scripts\\python.exe apps/dev-host/tools/gen_http_contract.py"
        )
    return json.loads(CONTRACT.read_text(encoding="utf-8"))


def test_contract_is_not_stale(generated: dict, committed: dict) -> None:
    if generated == committed:
        return
    gen_routes = {(r["method"], r["path"]) for r in generated["routes"]}
    com_routes = {(r["method"], r["path"]) for r in committed["routes"]}
    added = sorted(gen_routes - com_routes)
    removed = sorted(com_routes - gen_routes)
    changed = [
        (r["method"], r["path"])
        for r in generated["routes"]
        for c in committed["routes"]
        if (c["method"], c["path"]) == (r["method"], r["path"]) and c != r
    ]
    pytest.fail(
        "contract-http.json is stale — the HTTP surface changed but the published "
        "contract did not.\n"
        f"  routes added:   {added or 'none'}\n"
        f"  routes removed: {removed or 'none'}\n"
        f"  routes changed: {sorted(changed) or 'none'}\n"
        "Regenerate and commit it (the C# host implements against this file):\n"
        "  .\\.venv\\Scripts\\python.exe apps/dev-host/tools/gen_http_contract.py"
    )


@pytest.mark.parametrize(("method", "path"), sorted(EXPECTED_AUTH))
def test_security_bearing_routes_still_enforce(generated: dict, method: str, path: str) -> None:
    """A route that stops enforcing is the failure this whole file is for.

    Deleting `_require_permission` from the permissions handler is a two-token
    edit that no other check in this repository would notice: the UI keeps its
    `data-requires-permission` attribute, every unit test keeps passing, and the
    endpoint becomes open.
    """
    match = next(
        (r for r in generated["routes"] if r["method"] == method and r["path"] == path),
        None,
    )
    assert match is not None, (
        f"{method} {path} has disappeared. If that is deliberate, drop it from "
        "EXPECTED_AUTH in this file and say why in the commit."
    )
    assert match["auth"]["kind"] == EXPECTED_AUTH[(method, path)], (
        f"{method} {path} no longer enforces "
        f"{EXPECTED_AUTH[(method, path)]!r} — it reports {match['auth']!r}. "
        "The UI-side permission attributes are a convenience, not a boundary; "
        "this route IS the boundary."
    )


def test_machine_command_is_audited(generated: dict) -> None:
    match = next(
        r for r in generated["routes"]
        if (r["method"], r["path"]) == ("POST", "/api/machine/command")
    )
    assert match["auth"].get("audited") is True, (
        "every accepted machine command must be written to the audit log"
    )


def test_every_route_a_published_module_calls_is_reachable(generated: dict) -> None:
    """`calledBy` is how an embedder tells 'I must implement this' from 'this is
    only the dev host's own wiring'. If it were empty everywhere the contract
    would say nothing, which is a silent way for the generator to break."""
    required = [r for r in generated["routes"] if r["calledBy"]]
    assert required, "no published module appears to call any route — the scan broke"
    for route in required:
        for caller in route["calledBy"]:
            assert (REPO_ROOT / caller).is_file(), f"{caller} does not exist"
            assert caller.startswith(("hmi/", "viewer/")), (
                f"{caller} is not a published module"
            )
