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
    # A caller is named as the CONSUMER sees it. For the partitions that is also
    # the repo path; for the assembly it is not (urdf_viewer.js ships as
    # app.js), so resolve through the generator's own map rather than assuming.
    published_files = _load_generator().PUBLISHED_FILES
    for route in required:
        for caller in route["calledBy"]:
            source = published_files.get(caller, REPO_ROOT / caller)
            assert source.is_file(), f"{caller} does not exist (resolved to {source})"
            assert caller.startswith(("hmi/", "viewer/")) or caller in published_files, (
                f"{caller} is not a published file"
            )


# --- The published set is not just the two partitions ------------------------
#
# `calledBy` decides what an embedder can skip. It was derived from hmi/ +
# viewer/ only, but the release branch also ships the ASSEMBLY (urdf_viewer.js
# as app.js) and the two helpers it imports. Six routes the assembly calls were
# therefore published as optional, and a C# host that trusted the field would
# have built a page that loads and never draws the robot.

def test_the_assembly_is_scanned_for_callers(generated: dict) -> None:
  called_by = {c for r in generated["routes"] for c in r["calledBy"]}
  assert "app.js" in called_by, (
    "the assembly calls routes no hmi/ or viewer/ module does; if it is not "
    "scanned, those routes read as optional to an embedder")


def test_the_routes_only_the_assembly_calls_are_required(generated: dict) -> None:
  # Named individually rather than counted: a count passes whatever the set
  # becomes, and the point is WHICH routes stopped being optional.
  by_path = {(r["method"], r["path"]): r for r in generated["routes"]}
  for method, path in [("GET", "/api/urdf/models"), ("GET", "/api/stl/files"),
                       ("GET", "/api/datasets/stl"), ("GET", "/api/slicer/profiles"),
                       ("GET", "/api/sensors"), ("GET", "/api/attribute-series")]:
    assert by_path[(method, path)]["calledBy"], f"{path} is published as optional"


def test_every_published_file_scanned_actually_exists() -> None:
  # The map mirrors tools/gen_artifact.mjs by hand. If a file is renamed there
  # and not here, the scan silently goes back to missing its callers.
  module = _load_generator()
  artifact = (REPO_ROOT / "tools" / "gen_artifact.mjs").read_text(encoding="utf-8")
  for published_name, source in module.PUBLISHED_FILES.items():
    assert source.is_file(), f"{published_name} -> {source} does not exist"
    leaf = published_name.rsplit("/", 1)[-1]
    assert leaf in artifact, (
      f"gen_artifact.mjs no longer ships {published_name}; the two lists have drifted")


# --- Path matching has to respect segment boundaries on both sides -----------

@pytest.mark.parametrize("text, path, expected", [
  # The three false positives that were actually in the file or one edit away.
  ('fetch("/api/urdf/models")', "/urdf", False),        # leading segment
  ('fetch("/api/sensors/binary")', "/api/sensors", False),  # trailing segment
  ('// see hmi/slicerPane.js', "/slicer", False),       # trailing name
  # ...and the shapes a real call site takes, which must still match.
  ('fetch("/api/sensors")', "/api/sensors", True),
  ('fetch("/api/sensors?ids=1")', "/api/sensors", True),
  ('fetch(`/slicer?dock=1`)', "/slicer", True),
  ('fetch("/api/stl/file?name=x")', "/api/stl/file", True),
])
def test_mentions_path_needs_a_boundary_on_both_sides(text: str, path: str,
                                                      expected: bool) -> None:
  assert _load_generator()._mentions_path(text, path) is expected
