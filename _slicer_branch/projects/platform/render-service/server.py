"""Pixel-streaming render service for the Meltio slicer.

Drives the real slicer in a headless Chromium (software WebGL) in ``?render=1``
mode and streams frames to the client. This is the only way to render the existing
Three.js toolpath/thermal scenes server-side without porting ~1.5k lines of
geometry code. See docs/PIXEL_STREAMING.md.

Transport is **WebRTC**: the page publishes its 3D canvas as a video track straight
to the client (GPU-encoded where available) and input rides a DataChannel, replayed
as mouse/wheel so the slicer's own OrbitControls handle it 1:1. (The earlier
screenshot/CDP-screencast path has been removed.)

- **Auth:** when ``PLATFORM_RENDER_SECRET`` is set, the client must present an HMAC
  token minted by the platform (``/api/render/token``); the email inside it drives the
  headless page's identity. Without a secret (local dev) the caller-supplied user is
  trusted.
- **Capacity:** caps concurrent sessions, backed by a warm page pool; a dropped
  session's page is held briefly so a reconnect resumes the exact state.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import os
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from playwright.async_api import async_playwright

PLATFORM_URL = os.environ.get("PLATFORM_URL", "http://platform:8090")
# Shared secret with the platform. Empty = dev mode (trust caller-supplied user).
RENDER_SECRET = os.environ.get("PLATFORM_RENDER_SECRET", "")
MAX_SESSIONS = int(os.environ.get("RENDER_MAX_SESSIONS", "4"))
IDLE_SECONDS = int(os.environ.get("RENDER_IDLE_SECONDS", "120"))
# Warm pool: pre-navigated slicer pages (Three.js already loaded) kept ready so a
# session skips the page-create + shell-load cold start. POOL_SIZE=0 disables it.
POOL_SIZE = int(os.environ.get("RENDER_POOL_SIZE", "2"))
# Identity used to warm the shell (loads /api/me + global profiles). The real
# user is set per-session for the part fetch, so warmed pages are user-agnostic.
WARM_USER = os.environ.get("RENDER_WARM_USER", "dev@meltio3d.com")
# Render at a higher device pixel ratio so the 3D is crisp on retina screens; the
# WebGL canvas (captured into the WebRTC track) renders at this scale.
DEVICE_SCALE_FACTOR = float(os.environ.get("RENDER_DSF", "2"))
# WebRTC (Phase 1): ICE servers JSON for the in-page RTCPeerConnection, e.g.
# '[{"urls":"turn:51.21.52.142:3478","username":"u","credential":"p"}]'. Empty =
# host candidates only (works on loopback/LAN; needs TURN for the remote path).
RENDER_ICE_SERVERS = os.environ.get("RENDER_ICE_SERVERS", "")

# Renderer backend. Default is software WebGL (SwiftShader) which runs anywhere but
# is CPU-bound. On a GPU host set RENDER_GPU=1 to use hardware GL via ANGLE; the
# exact flags are tunable (RENDER_CHROMIUM_GPU_ARGS) since headless-Chromium-on-GPU
# is finicky and we iterate on the box without rebuilds.
_BASE_ARGS = ["--disable-dev-shm-usage", "--no-sandbox"]
if os.environ.get("RENDER_GPU", "") == "1":
    CHROMIUM_ARGS = _BASE_ARGS + os.environ.get(
        "RENDER_CHROMIUM_GPU_ARGS",
        # Vulkan/ANGLE engages the NVIDIA GPU headless; gl/egl fall back to software.
        "--use-gl=angle --use-angle=vulkan --enable-features=Vulkan --enable-gpu --ignore-gpu-blocklist",
    ).split()
else:
    CHROMIUM_ARGS = _BASE_ARGS + [
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
    ]

_pw = None
_browser = None
_active_sessions = 0
_pool: "asyncio.Queue" = asyncio.Queue()

# Session resumption: when a client drops (phone lock, app switch, network blip) we keep
# its page alive for a grace period instead of tearing it down, so a reconnect re-attaches
# to the EXACT state (view, slice, simulation, camera) with no re-slice. Keyed by a session
# id handed to the client on first connect and presented back as `resume`.
GRACE_SECONDS = int(os.environ.get("RENDER_RESUME_GRACE", "300"))
_held: dict = {}  # session_id -> {"ctx", "page", "deadline"}
_sig_q: dict = {}  # id(page) -> asyncio.Queue: outbound page->client signaling for the
# currently-attached session (the __signal binding, bound once at warm time, routes here).


def verify_token(token: str) -> str | None:
    """Return the email in a valid, unexpired platform-minted token, else None.

    Token format: ``<email>:<exp>:<hex-hmac-sha256>`` over ``<email>:<exp>``.
    """
    if not token:
        return None
    try:
        email, exp, sig = token.rsplit(":", 2)
    except ValueError:
        return None
    expected = hmac.new(
        RENDER_SECRET.encode(), f"{email}:{exp}".encode(), hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(sig, expected):
        return None
    try:
        if int(exp) < int(time.time()):
            return None
    except ValueError:
        return None
    return email


def resolve_user(token: str | None, user: str | None) -> str | None:
    """The trusted identity for a request: from the signed token when a secret is
    configured, else the caller-supplied user (local dev only)."""
    if RENDER_SECRET:
        return verify_token(token or "")
    return user or "dev@meltio3d.com"


async def _warm_page(w: int = 900, h: int = 900):
    """A fresh context + page navigated to the slicer shell (no part) — Three.js
    loaded and ready to receive a part. Warmed as WARM_USER (only global assets
    load here; the real user is set per-session for the part fetch)."""
    ctx = await _browser.new_context(
        viewport={"width": w, "height": h},
        device_scale_factor=DEVICE_SCALE_FACTOR,
        extra_http_headers={"Cf-Access-Authenticated-User-Email": WARM_USER},
    )
    page = await ctx.new_page()
    await page.goto(
        f"{PLATFORM_URL}/slicer/?render=1&embed=1", wait_until="domcontentloaded"
    )
    await page.wait_for_function("() => !!window.__render", timeout=20000)
    # Bind page->client signaling ONCE (the page outlives a single session when held for
    # resume, and expose_binding can't be re-bound). Route to whichever session currently
    # owns this page via _sig_q; if none is attached, drop it.
    async def _route_signal(source, payload):
        q = _sig_q.get(id(source["page"]))
        if q is not None:
            q.put_nowait(payload)

    await page.expose_binding("__signal", _route_signal)
    return ctx, page


async def _pool_keeper():
    """Keep POOL_SIZE warm pages ready; replenish as sessions consume them."""
    while True:
        try:
            if _pool.qsize() < POOL_SIZE:
                _pool.put_nowait(await _warm_page())
            else:
                await asyncio.sleep(1)
        except asyncio.CancelledError:
            break
        except Exception:
            await asyncio.sleep(2)  # transient (e.g. platform not up yet)


async def _resume_keeper():
    """Evict held (resumable) pages whose grace period has expired."""
    while True:
        try:
            now = time.monotonic()
            for sid, h in list(_held.items()):
                if h["deadline"] < now:
                    _held.pop(sid, None)
                    try:
                        await h["ctx"].close()
                    except Exception:
                        pass
            await asyncio.sleep(5)
        except asyncio.CancelledError:
            break
        except Exception:
            await asyncio.sleep(5)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _pw, _browser
    _pw = await async_playwright().start()
    _browser = await _pw.chromium.launch(headless=True, args=CHROMIUM_ARGS)
    keeper = asyncio.create_task(_pool_keeper()) if POOL_SIZE > 0 else None
    evictor = asyncio.create_task(_resume_keeper())
    try:
        yield
    finally:
        if keeper is not None:
            keeper.cancel()
        evictor.cancel()
        await _browser.close()
        await _pw.stop()


app = FastAPI(title="meltio-render", lifespan=lifespan)


async def _wait_ready(page, timeout_ms=30000):
    # Wait for the full part load to finish (STL + any retained-toolpath / stored-slice
    # rebuild), not just first geometry — so the caller's view logic sees the final state.
    await page.wait_for_function(
        "() => window.__render && window.__render.ready() && window.__partLoadComplete === true",
        timeout=timeout_ms,
    )


async def _wait_view(page, view, timeout_ms=180000):
    """Wait until a slice/simulate finishes and the given view becomes available."""
    try:
        await page.wait_for_function(
            "(v) => window.__render.getState().views[v]", arg=view, timeout=timeout_ms
        )
    except Exception:
        pass


async def _restore_view(page, view):
    """Reproduce a toolpath/thermal view on a freshly-opened page (re-slice end-to-end if
    needed), then switch to it. Run as a background task so it doesn't block the stream
    from connecting — the client sees the STL immediately and the view appears when ready."""
    try:
        if view in ("toolpath", "thermal"):
            views = await page.evaluate("() => window.__render.getState().views")
            if not views.get(view):
                await page.evaluate(
                    "(v) => window.__render.cmd(v === 'thermal' ? 'simulate' : 'slice')", view
                )
                await _wait_view(page, view)
        await page.evaluate("(v) => window.__render.setView(v)", view)
    except Exception:
        pass


async def _open_page(part, org, slice_id, user, w, h):
    """A slicer page showing `part` for `user`. Reuses a warm pooled page when one
    is available (skips the shell cold-start), else warms one on the spot. The page
    is single-use (closed after the session) — no cross-user reuse."""
    try:
        ctx, page = _pool.get_nowait()
    except asyncio.QueueEmpty:
        ctx, page = await _warm_page(int(w), int(h))
    await page.set_viewport_size({"width": int(w), "height": int(h)})
    # Act as the real user for the part fetch (overrides the warm context header).
    await page.set_extra_http_headers({"Cf-Access-Authenticated-User-Email": user})
    # Load the part into the already-warm shell.
    await page.evaluate(
        "(d) => window.postMessage("
        "{type:'load-part', partId:d.part, sliceId:d.slice, orgId:d.org},"
        " location.origin)",
        {"part": part, "org": org, "slice": slice_id},
    )
    await _wait_ready(page)
    return ctx, page


@app.get("/healthz")
async def healthz():
    return {"ok": True, "browser": _browser is not None, "sessions": _active_sessions}


@app.websocket("/ws")
async def ws(socket: WebSocket):
    global _active_sessions
    await socket.accept()
    ctx = page = None
    session_id = None
    counted = False  # whether this socket holds an _active_sessions slot
    should_hold = False  # on disconnect, keep the page alive for a resume?
    fwd = None
    view_task = None  # background view restore (slice/sim) so the stream isn't blocked on it
    fresh_open = False  # this socket opened a fresh page (vs resumed a held one)
    try:
        init = await asyncio.wait_for(socket.receive_json(), timeout=15)
        who = resolve_user(init.get("token"), init.get("user"))
        if not who:
            await socket.send_json({"error": "unauthorized"})
            await socket.close()
            return
        w, h = int(init.get("w", 900)), int(init.get("h", 900))

        # Resume a still-warm page from a recent drop — preserves the EXACT state (view,
        # slice, simulation, camera), so a reconnect after a phone lock / tab switch /
        # network blip doesn't re-slice or fall back to the bare STL.
        rid = init.get("resume")
        held = _held.pop(rid, None) if rid else None
        if held is not None:
            ctx, page = held["ctx"], held["page"]
            session_id = rid
            _active_sessions += 1
            counted = True
            try:
                await page.set_viewport_size({"width": w, "height": h})
            except Exception:
                # The held page died — drop it and fall through to a fresh one.
                _active_sessions -= 1
                counted = False
                try:
                    await ctx.close()
                except Exception:
                    pass
                ctx = page = session_id = None

        if page is None:
            if _active_sessions >= MAX_SESSIONS:
                await socket.send_json({"error": "render server busy — try again shortly"})
                await socket.close()
                return
            _active_sessions += 1
            counted = True
            ctx, page = await _open_page(
                init["part"], init["org"], init.get("slice"), who, w, h
            )
            session_id = uuid.uuid4().hex
            fresh_open = True
            # NOTE: the view (toolpath/thermal) is restored AFTER WebRTC starts, in the
            # background — see below. Doing it here would block the stream from connecting
            # for the whole (re)slice, leaving the client stuck on "Loading…".

        if init.get("mode") == "webrtc":
            # Phase 1 WebRTC: the page publishes its 3D canvas as a hardware-encoded video
            # track straight to the client; we relay signaling and replay the client's
            # pointer input as mouse events. Page->client signaling flows through a per-page
            # queue (the __signal binding, set once at warm time, routes here) so a RESUMED
            # page can publish to its new socket.
            q: "asyncio.Queue" = asyncio.Queue()
            _sig_q[id(page)] = q

            async def _forward():
                while True:
                    payload = await q.get()
                    await socket.send_json({"signal": payload})

            fwd = asyncio.create_task(_forward())
            # Hand the client its resume id so a later drop can re-attach to this page.
            await socket.send_json({"session": session_id})

            ice = json.loads(RENDER_ICE_SERVERS) if RENDER_ICE_SERVERS else []
            await page.evaluate("(s) => window.__webrtcStart(s)", ice)

            # Restore a toolpath/thermal view in the BACKGROUND so the stream connects
            # immediately (the STL shows right away, no long "Loading…") and the toolpath
            # appears when the (re)slice finishes. Resumed pages already hold their view.
            if fresh_open and init.get("view") and init["view"] != "stl":
                view_task = asyncio.create_task(_restore_view(page, init["view"]))

            # Input/cmd arrive over the WebRTC DataChannel (applied in-page); the WS
            # branches below are only a fallback for the brief window before the channel
            # opens. State is pushed to the client over the DataChannel by the page itself.
            mouse = page.mouse
            should_hold = True  # from here, a drop should preserve the page for resume
            while True:
                try:
                    m = await asyncio.wait_for(socket.receive_json(), timeout=IDLE_SECONDS)
                except Exception:
                    break
                if "signal" in m:
                    await page.evaluate("(s) => window.__webrtcSignal(s)", json.dumps(m["signal"]))
                    continue
                t = m.get("type")
                if t == "cmd":
                    await page.evaluate(
                        "([c, a]) => window.__render.cmd(c, a)", [m.get("cmd"), m.get("arg")]
                    )
                elif t == "pm":
                    await mouse.move(float(m["x"]), float(m["y"]))
                elif t == "pd":
                    await mouse.move(float(m["x"]), float(m["y"]))
                    await mouse.down()
                elif t == "pu":
                    await mouse.move(float(m["x"]), float(m["y"]))
                    await mouse.up()
                elif t == "whl":
                    await mouse.move(float(m["x"]), float(m["y"]))
                    await mouse.wheel(0, float(m.get("dy", 0)))
                elif t == "resize":
                    nw, nh = int(float(m.get("w", 0))), int(float(m.get("h", 0)))
                    if nw > 0 and nh > 0:
                        await page.set_viewport_size({"width": nw, "height": nh})
                elif t in ("close", "_disconnect"):
                    should_hold = False  # explicit close — tear the page down, don't hold
                    break
            return
    except (WebSocketDisconnect, asyncio.TimeoutError):
        pass
    except Exception as exc:  # surface to the client for debugging
        try:
            await socket.send_json({"error": str(exc)})
        except Exception:
            pass
    finally:
        if fwd is not None:
            fwd.cancel()
        if view_task is not None:
            view_task.cancel()
        if page is not None:
            _sig_q.pop(id(page), None)
        if counted:
            _active_sessions -= 1
        # Hold the page briefly so a reconnect resumes the exact state — unless it was an
        # explicit close or we're already holding our share.
        if should_hold and page is not None and session_id and len(_held) < MAX_SESSIONS:
            _held[session_id] = {
                "ctx": ctx,
                "page": page,
                "deadline": time.monotonic() + GRACE_SECONDS,
            }
        elif ctx is not None:
            try:
                await ctx.close()
            except Exception:
                pass
