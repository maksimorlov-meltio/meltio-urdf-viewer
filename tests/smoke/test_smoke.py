"""Behavioral baseline of the main operator journeys, over real HTTP.

These encode what the app DOES today (pre-refactor), not what it should do.
If a refactor changes one of these outcomes, that's a behavior change and must
be deliberate.
"""
from __future__ import annotations

import json
import urllib.error
import urllib.request

from conftest import SMOKE_PASSWORD


class Http:
    """Tiny cookie-keeping client (stdlib-only) for one origin."""

    def __init__(self, base: str):
        self.base = base
        self.cookie: str | None = None

    def request(self, path: str, method: str = "GET", body: dict | None = None):
        req = urllib.request.Request(self.base + path, method=method)
        if self.cookie:
            req.add_header("Cookie", self.cookie)
        data = None
        if body is not None:
            data = json.dumps(body).encode()
            req.add_header("Content-Type", "application/json")
        try:
            resp = urllib.request.urlopen(req, data=data, timeout=120)
            status, raw = resp.status, resp.read()
            set_cookie = resp.headers.get("Set-Cookie")
        except urllib.error.HTTPError as err:
            status, raw = err.code, err.read()
            set_cookie = err.headers.get("Set-Cookie")
        if set_cookie:
            self.cookie = set_cookie.split(";", 1)[0]
        try:
            parsed = json.loads(raw)
        except ValueError:
            parsed = raw
        return status, parsed


# --- Journey 1: the shell boots ---------------------------------------------

def test_viewer_serves_the_app_shell(stack):
    client = Http(stack["viewer"])
    status, body = client.request("/urdf")
    assert status == 200
    # Whatever the data-app-entry marker points at MUST serve: `main` ships the
    # raw source (/static/urdf_viewer.js), `npm run build` swaps in the hashed
    # bundle. A 404 here means a dead HMI — see finding ARQ-1.
    import re

    match = re.search(rb'data-app-entry src="([^"]+)"', body)
    assert match, "app entry script not found in /urdf HTML"
    status, entry = client.request(match.group(1).decode())
    assert status == 200 and len(entry) > 100_000, "app entry does not serve"


def test_hoisted_partitions_are_mounted(stack):
    # Phase C layout: hmi/ and viewer/ live at the repo root and are served by
    # dedicated mounts (dev mode + classic scripts load them raw as /hmi/…).
    client = Http(stack["viewer"])
    for url in ("/hmi/materials.js", "/hmi/permissions.js", "/viewer/core/sceneCore.js"):
        status, body = client.request(url)
        assert status == 200 and len(body) > 500, f"{url} not served"


def test_urdf_model_catalog_resolves_and_assets_serve(stack):
    client = Http(stack["viewer"])
    status, catalog = client.request("/api/urdf/models")
    assert status == 200 and catalog["models"], "no URDF models found"
    default_url = catalog["defaultModelUrl"]
    status, urdf = client.request(default_url)
    assert status == 200 and b"<robot" in urdf


# --- Journey 2: the slicer is embedded and reachable -------------------------

def test_slicer_is_configured_and_proxied(slicer_stack):
    client = Http(slicer_stack["viewer"])
    status, body = client.request("/api/slicer/status")
    assert status == 200 and body["configured"] is True
    status, _ = client.request("/slicer")
    assert status == 200  # same-origin embed path answers


# --- Journey 3: sign-in and permission gating over real HTTP -----------------

def test_login_rejects_bad_credentials(stack):
    status, _ = Http(stack["viewer"]).request(
        "/api/auth/login", "POST", {"username": "smoke-admin", "password": "wrong"})
    assert status == 401


def test_machine_commands_are_gated_by_session_and_role(stack):
    anon = Http(stack["viewer"])
    status, _ = anon.request("/api/machine/command", "POST", {"command": "home"})
    assert status == 401, "signed-out caller must be rejected"

    watcher = Http(stack["viewer"])
    status, body = watcher.request(
        "/api/auth/login", "POST", {"username": "smoke-watch", "password": SMOKE_PASSWORD})
    assert status == 200
    status, _ = watcher.request("/api/machine/command", "POST", {"command": "home"})
    assert status == 403, "role without machine.command must be rejected"

    admin = Http(stack["viewer"])
    status, me = admin.request(
        "/api/auth/login", "POST", {"username": "smoke-admin", "password": SMOKE_PASSWORD})
    assert status == 200 and me["user"]["username"] == "smoke-admin"
    status, ack = admin.request("/api/machine/command", "POST", {"command": "home"})
    assert status == 200 and "accepted" in ack and "state" in ack

    audit = stack["db_root"] / "command_audit.log"
    assert audit.exists(), "accepted command must be audited"
    entry = json.loads(audit.read_text(encoding="utf-8").splitlines()[-1])
    assert entry["command"] == "home" and entry["operatorName"] == "smoke-admin"


# --- Journey 4: slice an STL end to end (viewer proxy -> real slicer) --------

def test_slice_proxy_produces_a_toolpath(slicer_stack):
    client = Http(slicer_stack["viewer"])
    status, files = client.request("/api/stl/files")
    assert status == 200
    assert "smoke-cube.stl" in files["files"]  # names, not objects

    status, payload = client.request(
        "/api/slice/proxy", "POST", {"name": "smoke-cube.stl"})
    assert status == 200, f"slice failed: {payload}"
    moves = payload.get("moves")
    assert isinstance(moves, list) and moves, "real slicer must return moves"
    first = moves[0]
    assert "points" in first and "layer" in first
    layers = {m["layer"] for m in moves}
    assert len(layers) > 1, "a 10mm cube must produce multiple layers"


# --- Journey 5: mock machine state (default transport) -----------------------

def test_machine_state_snapshot_shape(stack):
    status, snap = Http(stack["viewer"]).request("/api/machine/state")
    assert status == 200
    for key in ("connected", "state", "progress", "position"):
        assert key in snap, f"machine snapshot lost key '{key}'"
