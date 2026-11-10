"""The same-origin proxy to the Meltio platform slicer (platform mode).

Why these tests exist: the current slicer is a sub-app of the platform shell
that frames only same-origin pages and whose frontend calls the platform's own
``/api/*`` with absolute paths. Embedding it means the viewer forwards a slice of
its own origin to the platform - which is also exactly the kind of route that
quietly widens an attack surface. So what is pinned here is not "the proxy
works" but the shape of the hole: off by default, default-deny on ``/api``, the
HMI's token injected server-side and never echoed, the operator's cookie never
forwarded, and the viewer's own routes always winning over the forwarder.

Upstream is a fake platform behind ``httpx.MockTransport``; nothing here talks
to a real one (there is none in CI), so the real platform's behaviour - auth,
409 duplicate bodies, X-Frame-Options - is asserted as the contract we read
from its source, not observed.
"""
from __future__ import annotations

from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

import avisualizer.web.app as app_module


class FakePlatform:
    """Records every upstream request and answers from a small script."""

    def __init__(self) -> None:
        self.requests: list[httpx.Request] = []
        self.bodies: list[bytes] = []
        self.respond = self.default_response

    async def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        self.bodies.append(await request.aread())
        return self.respond(request)

    @staticmethod
    def default_response(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            headers={"content-type": "application/json", "x-upstream": "yes"},
            json={"path": request.url.path, "query": request.url.query.decode()},
        )

    def client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(transport=httpx.MockTransport(self.handler))

    @property
    def last(self) -> httpx.Request:
        assert self.requests, "the platform was never called"
        return self.requests[-1]


@pytest.fixture
def platform(monkeypatch: pytest.MonkeyPatch) -> FakePlatform:
    fake = FakePlatform()
    monkeypatch.setattr(app_module, "_platform_client", fake.client)
    return fake


@pytest.fixture
def configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AVIS_PLATFORM_URL", "http://platform.test/")
    monkeypatch.setenv("AVIS_PLATFORM_TOKEN", "mlt_secret")
    monkeypatch.delenv("AVIS_PLATFORM_SLICER_PREFIX", raising=False)
    monkeypatch.delenv("AVIS_PLATFORM_DEV_EMAIL", raising=False)
    monkeypatch.delenv("AVIS_PLATFORM_ORG_ID", raising=False)
    monkeypatch.delenv("AVIS_SLICER_URL", raising=False)
    monkeypatch.delenv("AVIS_SLICER_UI_URL", raising=False)


@pytest.fixture
def unconfigured(monkeypatch: pytest.MonkeyPatch) -> None:
    for key in ("AVIS_PLATFORM_URL", "AVIS_PLATFORM_TOKEN", "AVIS_PLATFORM_SLICER_PREFIX",
                "AVIS_SLICER_URL", "AVIS_SLICER_UI_URL"):
        monkeypatch.delenv(key, raising=False)


# --- Off by default ----------------------------------------------------------

def test_without_a_platform_nothing_is_forwarded(unconfigured: None, platform: FakePlatform) -> None:
    client = TestClient(app_module.create_app())

    assert client.get("/slicer/api/health").status_code == 404
    assert client.get("/api/parts").status_code == 404
    assert client.post("/api/slicer/part-from-file", json={"name": "x.stl"}).status_code == 503
    me = client.get("/api/me")
    assert me.status_code == 200
    assert me.json()["id"] == "operator", "the console's own stub still answers"
    assert platform.requests == []


def test_status_reports_the_mode(unconfigured: None, monkeypatch: pytest.MonkeyPatch) -> None:
    client = TestClient(app_module.create_app())
    assert client.get("/api/slicer/status").json() == {
        "configured": False, "mode": "none", "url": None, "embedQuery": None,
    }

    monkeypatch.setenv("AVIS_SLICER_URL", "http://127.0.0.1:8765")
    assert client.get("/api/slicer/status").json() == {
        "configured": True, "mode": "legacy", "url": "/slicer", "embedQuery": "dock=1",
    }

    # Platform mode wins when both are set: the embed URL changes shape.
    monkeypatch.setenv("AVIS_PLATFORM_URL", "http://platform.test")
    assert client.get("/api/slicer/status").json() == {
        "configured": True, "mode": "platform", "url": "/slicer/", "embedQuery": "embed=1",
    }


# --- The slicer sub-app is forwarded whole, same-origin -----------------------

def test_slicer_page_is_forwarded_with_the_hmi_identity(configured: None, platform: FakePlatform) -> None:
    client = TestClient(app_module.create_app())
    platform.respond = lambda req: httpx.Response(
        200,
        headers={
            "content-type": "text/html; charset=utf-8",
            "x-frame-options": "SAMEORIGIN",
            "set-cookie": "platform=1; Path=/",
            "connection": "keep-alive",
        },
        content=b"<html>slicer</html>",
    )

    response = client.get(
        "/slicer/?embed=1&part=7",
        headers={"Cookie": "avis_session=operator-secret", "X-Slicer-Session": "tab-1",
                 "Authorization": "Bearer from-the-browser"},
    )

    assert response.status_code == 200
    assert response.content == b"<html>slicer</html>"
    assert response.headers["content-type"].startswith("text/html")
    # Same-origin framing is the whole point: the platform's header passes
    # through untouched and is satisfied because the frame IS our origin.
    assert response.headers["x-frame-options"] == "SAMEORIGIN"
    assert "set-cookie" not in response.headers
    assert "connection" not in response.headers or response.headers["connection"] != "keep-alive"

    upstream = platform.last
    assert str(upstream.url) == "http://platform.test/slicer/?embed=1&part=7"
    assert upstream.headers["authorization"] == "Bearer mlt_secret", "the HMI's token, not the browser's"
    assert "cookie" not in upstream.headers, "the operator session must not leak"
    assert upstream.headers["x-slicer-session"] == "tab-1", "the slicer's tab partition survives"
    assert upstream.headers["host"] == "platform.test"


def test_slicer_api_body_is_streamed_with_its_length(configured: None, platform: FakePlatform) -> None:
    client = TestClient(app_module.create_app())
    stl = b"solid x\n" * 1000

    response = client.post("/slicer/api/load", content=stl,
                           headers={"Content-Type": "application/octet-stream"})

    assert response.status_code == 200
    assert platform.bodies[-1] == stl
    # The platform caps the slicer upload on Content-Length (413 before it
    # buffers); a chunked re-encoding would silently defeat that.
    assert platform.last.headers["content-length"] == str(len(stl))
    assert platform.last.method == "POST"


def test_standalone_prefix_maps_the_slicer_to_the_upstream_root(
    configured: None, platform: FakePlatform, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AVIS_PLATFORM_SLICER_PREFIX", "")
    client = TestClient(app_module.create_app())

    client.get("/slicer/api/health")

    assert str(platform.last.url) == "http://platform.test/api/health"


def test_upstream_redirects_stay_on_our_origin(configured: None, platform: FakePlatform) -> None:
    client = TestClient(app_module.create_app())
    platform.respond = lambda req: httpx.Response(
        307, headers={"location": "http://platform.test/slicer/?embed=1"},
    )

    response = client.get("/slicer", follow_redirects=False)
    # The viewer's own /slicer entry redirects into the proxy, keeping the query.
    assert response.status_code == 307
    assert response.headers["location"] == "/slicer/"

    response = client.get("/slicer?embed=1&part=9", follow_redirects=False)
    assert response.headers["location"] == "/slicer/?embed=1&part=9"

    response = client.get("/slicer/go", follow_redirects=False)
    assert response.status_code == 307
    assert response.headers["location"] == "/slicer/?embed=1", "the platform host is stripped"


def test_an_unreachable_platform_is_a_502_not_a_hang(configured: None, platform: FakePlatform) -> None:
    client = TestClient(app_module.create_app())

    def boom(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused", request=request)

    platform.respond = boom
    response = client.get("/slicer/api/health")
    assert response.status_code == 502
    assert "unreachable" in response.json()["detail"].lower()


def test_the_token_is_never_echoed(configured: None, platform: FakePlatform) -> None:
    client = TestClient(app_module.create_app())
    response = client.get("/api/slicer/status")
    assert "mlt_secret" not in response.text
    response = client.get("/slicer/api/health")
    assert "mlt_secret" not in response.text


# --- /api is default-deny ------------------------------------------------------

@pytest.mark.parametrize(
    ("method", "path", "allowed"),
    [
        ("GET", "/api/me", True),
        ("POST", "/api/me", False),
        ("GET", "/api/parts", True),
        ("POST", "/api/parts", True),                      # the slicer's own upload drop
        ("GET", "/api/parts/abc/placement", True),
        ("PUT", "/api/parts/abc/placement", True),
        ("DELETE", "/api/parts/abc", False),               # never destructive on parts
        ("GET", "/api/slices/abc/gcode", True),
        ("POST", "/api/slices/abc/promote", True),
        ("DELETE", "/api/slices/abc/draft", True),
        ("DELETE", "/api/slices/abc", False),
        ("GET", "/api/profiles", True),
        ("POST", "/api/profiles", False),                  # certified recipes are not edited from the HMI
        ("PUT", "/api/profiles/abc", False),
        ("GET", "/api/machines", True),
        ("POST", "/api/machines", False),
        ("GET", "/api/materials/abc", True),
        ("PATCH", "/api/materials/abc", False),
        ("GET", "/api/printers/p1/sensor", True),
        ("POST", "/api/printers/p1/commands", False),      # would bypass POST /api/machine/command's rank check
        ("GET", "/api/prints/j1/video/manifest", True),
        ("POST", "/api/prints/j1/anything", False),
        ("POST", "/api/batches", True),
        ("DELETE", "/api/batches/b1/members/m1", True),
        ("GET", "/api/slice-jobs/mine", True),
        ("DELETE", "/api/slice-jobs/j1", True),
        ("POST", "/api/simulations/r1/notify", True),
        ("POST", "/api/notifications/read", True),
        ("GET", "/api/notifications", False),
        ("GET", "/api/devices/slices", False),
        ("POST", "/api/devices/claim/start", False),
        ("GET", "/api/admin/users", False),
        ("POST", "/api/api-tokens", False),
        ("GET", "/api/partsx", False),                     # prefix must end at a segment
        ("GET", "/api/me/anything", False),
    ],
)
def test_platform_api_allow_list(method: str, path: str, allowed: bool) -> None:
    assert app_module._platform_api_allowed(method, path) is allowed


def test_api_forwarding_follows_the_allow_list(configured: None, platform: FakePlatform) -> None:
    client = TestClient(app_module.create_app())

    assert client.get("/api/parts?org=o1").status_code == 200
    assert str(platform.last.url) == "http://platform.test/api/parts?org=o1"
    assert platform.last.headers["authorization"] == "Bearer mlt_secret"

    before = len(platform.requests)
    assert client.post("/api/printers/p1/commands", json={"cmd": "home"}).status_code == 404
    assert client.delete("/api/parts/abc").status_code == 404
    assert client.get("/api/admin/users").status_code == 404
    assert len(platform.requests) == before, "a denied path must never reach the platform"


def test_the_viewers_own_routes_win_over_the_forwarder(configured: None, platform: FakePlatform) -> None:
    client = TestClient(app_module.create_app())

    response = client.get("/api/permissions/config")
    assert response.status_code == 200
    assert platform.requests == [], "/api/permissions/config is the console's, never the platform's"

    # The two stubs the OLD slicer needed now answer for the platform instead,
    # because the embedded platform slicer reads /api/me for its orgs and
    # capabilities and /api/machines for its machine presets.
    client.get("/api/me")
    assert str(platform.last.url) == "http://platform.test/api/me"
    client.get("/api/machines")
    assert str(platform.last.url) == "http://platform.test/api/machines"


def test_default_org_header_is_added_only_when_absent(
    configured: None, platform: FakePlatform, monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AVIS_PLATFORM_ORG_ID", "org-default")
    monkeypatch.setenv("AVIS_PLATFORM_DEV_EMAIL", "hmi@example.test")
    client = TestClient(app_module.create_app())

    client.get("/api/me")
    assert platform.last.headers["x-org-id"] == "org-default"
    assert platform.last.headers["cf-access-authenticated-user-email"] == "hmi@example.test"

    client.get("/api/me", headers={"X-Org-Id": "org-chosen"})
    assert platform.last.headers["x-org-id"] == "org-chosen"


def test_slice_proxy_is_unavailable_in_platform_mode(configured: None, platform: FakePlatform) -> None:
    # The legacy load+slice JSON proxy has no counterpart in the current slicer
    # (async job + binary container). 503 is the client's documented fallback.
    client = TestClient(app_module.create_app())
    response = client.post("/api/slice/proxy", json={"name": "part.stl"})
    assert response.status_code == 503
    assert "platform" in response.json()["detail"].lower()
    assert platform.requests == []


# --- Load to slicer: the HMI file becomes a platform part ---------------------

@pytest.fixture
def stl_file(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Path:
    path = tmp_path / "Bracket.stl"
    path.write_bytes(b"solid bracket\nendsolid bracket\n")
    monkeypatch.setattr(app_module, "_resolve_global_stl_file", lambda name: path)
    return path


def test_part_from_file_uploads_and_answers_the_part_id(
    configured: None, platform: FakePlatform, stl_file: Path,
) -> None:
    client = TestClient(app_module.create_app())
    platform.respond = lambda req: httpx.Response(201, json={"id": "part-123", "name": "Bracket"})

    response = client.post("/api/slicer/part-from-file", json={"name": "Bracket.stl"})

    assert response.status_code == 200
    assert response.json() == {"partId": "part-123", "name": "Bracket.stl", "reused": False}
    upstream = platform.last
    assert str(upstream.url) == "http://platform.test/api/parts"
    assert upstream.headers["authorization"] == "Bearer mlt_secret"
    assert upstream.headers["content-type"].startswith("multipart/form-data")
    body = platform.bodies[-1]
    assert b'name="name"' in body and b"Bracket" in body
    assert b'filename="Bracket.stl"' in body and b"solid bracket" in body


def test_part_from_file_reuses_a_duplicate_instead_of_creating_one(
    configured: None, platform: FakePlatform, stl_file: Path,
) -> None:
    client = TestClient(app_module.create_app())
    platform.respond = lambda req: httpx.Response(409, json={"detail": {
        "reason": "duplicate_part",
        "candidates": [{"partId": "part-old", "name": "Bracket"}],
        "moreCount": 0,
    }})

    response = client.post("/api/slicer/part-from-file", json={"name": "Bracket.stl"})

    assert response.status_code == 200
    assert response.json() == {"partId": "part-old", "name": "Bracket.stl", "reused": True}


def test_part_from_file_surfaces_platform_refusals(
    configured: None, platform: FakePlatform, stl_file: Path,
) -> None:
    client = TestClient(app_module.create_app())
    platform.respond = lambda req: httpx.Response(403, json={"detail": "no upload capability"})

    response = client.post("/api/slicer/part-from-file", json={"name": "Bracket.stl"})
    assert response.status_code == 502
    assert "403" in response.json()["detail"]

    assert client.post("/api/slicer/part-from-file", json={}).status_code == 400
