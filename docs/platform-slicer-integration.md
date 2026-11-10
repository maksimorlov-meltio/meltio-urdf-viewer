# Files → Meltio platform slicer: analysis and integration plan

*2026-11-10. Branch `platform-slicer-integration`. Status: phase 1 implemented
and unit-tested; not yet run against a live platform.*

The ask: when the operator presses **Files** in the viewer
(`maksimorlov-meltio/meltio-urdf-viewer`), hand off to the **current** slicer
software, which lives in Lukas's `Machine-Software/process-intelligence-repo`.

## 1. What the two sides are today

### 1.1 The viewer (this repo)

Two FastAPI + Three.js apps glued at runtime. **Files** opens the slicer in an
`<iframe>` at `/slicer?dock=1&stl=<url>`; the viewer's `/slicer` route 307s to
the slicer's own origin (`AVIS_SLICER_UI_URL`, `:8765`). The slicer posts
`dock-ready` / `slice-data` / `start-print` back (`source:"meltio-slicer"`), and
the viewer animates the toolpath on the real gantry (`apps/dev-host/ARCHITECTURE.md` §5).

That slicer is **a vendored snapshot** in `_slicer_branch/` — the mid-2026
`slicer-viewer-bridge` build (`slicer/web/app.py` is 513 lines, 15 routes, the
Python slicing pipeline, `/api/me` + `/api/machines` stubs so it boots alone).

### 1.2 Lukas's repo today (`beta` is the live branch — 94 commits ahead of `main` on 2026-11-09)

The standalone slicer is **retired** (`docker-compose.yml`: "the standalone
slicer that used to run here … was retired; its viewer lives on, vendored,
inside the platform image"). The product is the **Meltio platform**
(`projects/platform`, package `meltio_platform`): a FastAPI backend + React/Vite
shell, **Postgres** (parts, slices, prints, orgs, users), **MinIO/S3** (STL,
G-code, registers, video), **Cloudflare Access SSO** for humans, **API tokens**
(`Authorization: Bearer mlt_…`, service principals) for tooling, and a
**device API** (mTLS) through which a machine pulls its org's slices.

The slicer is a **sub-app mounted at `/slicer`** inside that shell
(`create_slicer_app(identity=request_identity, …)`), built with Vite
(`npm run build` → `dist/`, content-hashed `bundle/`), slicing with the **C++
core** (`meltio_slicer_cpp` wheel — "the ONLY slicing engine"). There is also an
**Offline Version**: the same slicer as the root app over a mounted workspace
directory, gated by a signed usage key (`slicer/web/standalone/`,
`projects/bundle/`).

### 1.3 What changed, concretely, versus the vendored snapshot

| In the vendored slicer (what the viewer relies on) | In the current slicer (beta/main, verified in source) |
|---|---|
| `?dock=1` embedded bottom-bar layout | **Gone.** Only `?embed=1` (hides its own header) and `?render=1`. |
| `?stl=<url>` auto-loads a model from the viewer's `/api/stl/file` | **Gone.** It opens **platform parts**: `/slicer/?part=<id>`. |
| `postMessage` `dock-ready` / `slice-data` / `start-print` tagged `meltio-slicer` | **Gone.** Child→parent is only `{type:"slice-saved", partId, version}` posted to `location.origin`; parent→child is `load-part` / `monitor` / `ws-command`, and the listener drops any `event.origin !== location.origin`. |
| `POST /api/load` + `POST /api/slice` → synchronous JSON `{moves:[…]}` (what `/api/slice/proxy` and the print sim consume) | `POST /api/slice` answers **202 `{job}`**; the result is a **binary container** via `GET /api/slice/result?job=` with an `X-Slice-Token`. |
| Frontend calls only its own relative `api/…` | Frontend calls ~70 **absolute platform routes**: `/api/me`, `/api/parts…`, `/api/slices…`, `/api/batches…`, `/api/profiles…`, `/api/machines…`, `/api/materials…`, `/api/printers…`, `/api/prints…`, `/api/slice-jobs…`, `/api/simulations…`, `/api/system-types`, `/api/notifications/read`. |
| No framing restriction | Shell sends **`X-Frame-Options: SAMEORIGIN`** and `frame-ancestors 'self'` (CSP report-only for now). |
| Anonymous, one session | **Identity required** (Access JWT, dev header, or Bearer token); slicer sessions are keyed per identity + `X-Slicer-Session`. Platform-reaching routes 401 without one. |
| Runs from source (`web/static`) | **Must be built** (`npm run build`); serving the source tree 404s on bare `three` specifiers. |
| Port 8765 | Platform publishes **:8090 locally** — the viewer's own port. |

Two consequences follow directly:

1. **Today's cross-origin iframe cannot work** against the current slicer: the
   shell refuses to be framed off-origin, and both ends of its message bridge
   check `location.origin`.
2. **The in-scene print simulation and Start-print hand-off have no counterpart
   yet.** The current slicer saves slices *to the platform*; it does not hand a
   toolpath to a parent. That is a phase-2 item (§5), not something this branch
   can fake.

## 2. Options

| | Option | Verdict |
|---|---|---|
| A | **Top-level navigation** (`window.location`/new tab) to the platform | Trivial, but a kiosk in `--app` mode is stranded with no way back, the 3D scene is lost, and the kiosk browser would need SSO. Keep only as a fallback. |
| B | **Cross-origin iframe** (what `/slicer` does now) | Blocked by `X-Frame-Options` + origin-checked messaging. Not viable. |
| **C** | **Same-origin reverse proxy in the viewer** (chosen) | The viewer is the browser's one origin and forwards `/slicer/*` plus an allow-listed slice of `/api/*` to the platform, injecting the HMI's identity server-side. Framing, `postMessage` and relative URLs all work unchanged on Lukas's side. Costs: a proxy to keep honest (§4), and the HMI acts as **one** platform identity. |
| D | **Vendor the current slicer into `_slicer_branch`** | Needs Postgres + MinIO (or the offline bundle + licence), the C++ wheel and a Vite build; the required `slicer pytest` CI job runs the old tree; and the bridge is gone anyway. No. |
| E | **Offline bundle as the upstream** | Same proxy, different upstream shape (slicer at `/`, platform-shaped API served locally). Supported via `AVIS_PLATFORM_SLICER_PREFIX=""`; needs Lukas's bundle image and a usage key. |
| F | **Lukas re-adds an HMI/dock mode and a toolpath hand-off** | The right long-term answer for the print sim; §6 lists the asks. Does not replace C — the proxy is still what makes it same-origin. |

## 3. What this branch implements (phase 1)

**Off by default.** With `AVIS_PLATFORM_URL` unset the app boots to the same DOM
footprint as `main` (§7) and the legacy `AVIS_SLICER_URL` embed keeps working.
What does change with the flag off: `/api/slicer/status` carries two extra
fields (`mode`, `embedQuery`), the "slicer not connected" text also names
`AVIS_PLATFORM_URL`, the CSS cache-buster moved, and the route table grew (the
new routes answer 404 — or 405 for a wrong method on an existing route, exactly
as before). When set, platform mode wins over the legacy embed.

| Env | Meaning |
|---|---|
| `AVIS_PLATFORM_URL` | Platform base, e.g. `http://127.0.0.1:8091` or `https://api-beta.meltio.cloud`. Turns platform mode on. |
| `AVIS_PLATFORM_TOKEN` | `Bearer mlt_…` service token, **read + write** (slicing is POST). Read from env only; never logged, never sent to the browser. |
| `AVIS_PLATFORM_DEV_EMAIL` | Local/on-prem stacks without Cloudflare Access: sent as `Cf-Access-Authenticated-User-Email`. |
| `AVIS_PLATFORM_ORG_ID` | Default `X-Org-Id` when a request carries none (multi-org tokens). |
| `AVIS_PLATFORM_SLICER_PREFIX` | Where the slicer lives upstream: `/slicer` (platform shell, default) or empty for the offline bundle. |

Routes (all in `apps/dev-host/src/avisualizer/web/app.py`, recorded in `contract-http.json`):

| Route | Platform mode | Otherwise |
|---|---|---|
| `GET /api/slicer/status` | `{configured, mode:"platform", url:"/slicer/", embedQuery:"embed=1"}` | `mode:"legacy"` + `dock=1`, or `mode:"none"` |
| `ANY /slicer/{path}` | Streams to `<platform><prefix>/{path}` with the HMI identity | 404 |
| `GET /slicer` | 307 → `/slicer/?…` | legacy redirect to `AVIS_SLICER_UI_URL` (unchanged) |
| `ANY /api/{path}` (registered **last**) | Forwarded **only** if the allow-list admits `(method, path)`; else 404 | 404 (as before) |
| `GET /api/me`, `GET /api/machines` | Forwarded (the slicer frontend reads them) | the console's own stubs (unchanged) |
| `POST /api/slicer/part-from-file` `{name}` | Uploads the HMI's STL as a platform **part** (`POST /api/parts`); a 409 duplicate reuses the candidate. Answers `{partId}` | 503 |
| `GET /api/slicer/profiles` | Platform `/api/profiles` with the HMI identity | legacy slicer (unchanged) |
| `POST /api/slice/proxy` | 503 (no sync-JSON slice exists any more → client's clip-plane fallback) | legacy (unchanged) |

Frontend (`hmi/slicerPane.js`, `hmi/fileLibrary.js`): the pane learns the mode
from `/api/slicer/status` at creation. **The Files button is now a pure toggle
of the slicer pane** — pressed, the pane takes the full view with
`/slicer/?embed=1` (the platform slicer's own part picker lists the org's
parts); pressed again, or the pane's X, it goes away. The button no longer
opens the local file list, opens the front door or moves the camera; its own
behaviour is the pressed state and the icon's fan animation that CSS drives
off `aria-pressed`. With no slicer configured the pane shows its fallback text.
The local STL list (`hmi/fileLibrary.js`) is still in the app for the legacy
print flow but is not reachable from the Files button; from that list, **Load
to slicer** POSTs `part-from-file` and frames `/slicer/?embed=1&part=<id>`,
and the slicer's `slice-saved` (sender-checked: `event.source ===
iframe.contentWindow` **and** same origin) badges the row **"Saved to
platform"**. Host changes in `urdf_viewer.js`: the Files toggle action and the
nav pressed-state read the pane; everything else lives in `hmi/`.

The Files flow:

```
operator taps Files            → pane fullscreen: iframe /slicer/?embed=1 (platform slicer)
operator taps Files again / X  → pane closes, button unpressed, scene as it was

(legacy list, not on the Files button) a row's "Load to slicer"
  → viewer POST /api/slicer/part-from-file {name}
      → viewer backend POST <platform>/api/parts (multipart, Bearer token)   ← HMI identity
      ← {id} (or 409 → reuse candidate)
  ← {partId}
  → iframe src = /slicer/?embed=1&part=<partId>
      → viewer proxies /slicer/… and the slicer's /api/… calls to the platform
  → operator orients, slices, SAVES in the platform slicer
      ← postMessage {type:"slice-saved", partId, version}  (same origin, so it arrives)
  → Files row badge: "Saved to platform"
```

## 4. Security posture of the proxy

* **Default deny.** `/api/{path}` forwards only `(method, path)` pairs the
  slicer frontend actually uses (derived from its `fetch()` sites). Explicitly
  absent: `POST /api/printers/*/commands` (would bypass the rank check on the
  viewer's own `POST /api/machine/command`), `/api/devices`, `/api/admin`,
  API-token minting, and **writes to the shared libraries** (profiles,
  machines, materials — an HMI operator slices with certified recipes, they do
  not edit them). The table is `PLATFORM_API_ALLOW`; the test
  `test_platform_api_allow_list` is its independent statement.
* **Identity stays server-side.** The token is read from env, added on the way
  out, never echoed. The browser's own `Authorization` and the viewer's
  `avis_session` cookie are stripped before forwarding; `Set-Cookie` from the
  platform is dropped on the way back.
* **One identity per HMI.** Everything the kiosk does on the platform is the
  token's principal (`M600-HMI-<serial>`, say), org-scoped by the platform's own
  rules. Per-operator attribution on the platform is *not* provided by this
  design (the console's operator login is a separate, local thing). If that is
  wanted, Lukas's `X-Org-Id`-style header for an acting user is the place.
* **Streaming, not buffering.** Slices are tens of MB; bodies stream both ways,
  `Content-Length` is preserved (the platform's upload cap relies on it),
  hop-by-hop headers are dropped, upstream `Location` is rewritten onto our origin.
* **Paths are judged as sent.** The allow-list and the upstream URL both use
  the raw, still-encoded path, and any segment that decodes to `.`/`..` or hides
  a separator (`%2f`, `%5c`, NUL) is refused before the allow-list runs.
  Otherwise `/api/parts/%2e%2e/printers/p1/commands` passes the parts rule and
  httpx collapses it to the printer-command route upstream (found and pinned by
  `test_dot_segments_and_hidden_separators_never_reach_the_platform`).
* **No viewer-side authentication on the proxy routes.** Anyone who can reach
  the viewer acts as the HMI's platform token. That is the same trust the
  console already extends to its LAN (its sign-in is a convenience, see
  CLAUDE.md), but it means: in platform mode keep the viewer bound to
  localhost / the kiosk, never on an open interface.
* **Standalone upstream (`AVIS_PLATFORM_SLICER_PREFIX=""`)** maps `/slicer/api/*`
  onto the upstream's `/api/*` — the offline bundle's slicer-plus-local-routes,
  which has no printers, devices or admin. The `/api/*` allow-list still applies
  to the slicer frontend's absolute calls.
* **Routes exist regardless of env** so `contract-http.json` is deterministic.
  Note for the C# host: these routes are now part of the published contract.

## 5. Not in this branch (phase 2)

1. **Print simulation from a platform slice.** The viewer animates `moves[]`;
   the platform exposes a saved slice as G-code (`GET /api/slices/{id}/gcode`),
   a segment-register parquet (`…/register/static.parquet`), the placed STL and a
   bundle. Shortest path: on `slice-saved`, fetch the G-code through the proxy
   and parse it into `moves[]` in `viewer/toolpath/` (G0/G1 + laser/wire state;
   the file is self-describing, `PRINT_IDENTITY.md`). That also re-enables the
   per-row **Start print**.
2. **Files = platform parts.** Today the Files list is the HMI's local/USB STL
   store. The natural end state lists the org's **parts and their current
   slices** from `GET /api/parts` (the allow-list already admits it) and opens
   them with `load-part`.
3. **Printing on *this* machine.** The platform's model is pull: the M600's
   ControlService fetches `GET /api/devices/slices` with its device cert. The
   HMI only needs to tell the machine *which* slice id; no viewer→platform write
   is involved. Needs the ControlService side (`m600platform` link).
4. **Port clash.** Lukas's local compose publishes the platform on `:8090`,
   the viewer's port. Run the platform on another host port
   (`docker compose … -f` override with `"8091:8090"`) or move the viewer.
5. **HMI layout.** `?embed=1` hides the platform header but the slicer's
   workspace is a desktop 240 px-rail layout; on the 1080 × 1920 portrait panel
   it will be cramped until Lukas ships an HMI/dock variant (§6). Nothing in
   this branch has been looked at visually on the panel.
6. **WebSockets are not proxied.** The platform's live print monitor and the
   remote pixel-streaming render speak WebSocket; the proxy forwards HTTP only,
   so those surfaces of the embedded slicer will not work until a WS pass-through
   is added (same allow-list idea, `/slicer/ws/*` only).

## 6. Asks for Lukas (platform side)

1. An **HMI layout flag** for the slicer (`?embed=hmi` or the old `dock`
   rail) sized for a portrait 1080 × 1920 touch panel.
2. On save, post the parent something it can **animate**: the slice id is
   enough if `…/register/static.parquet` (or a compact JSON `moves[]`) is the
   documented toolpath for consumers.
3. A **role for service principals used by HMIs**: upload, slice, read
   profiles/materials/machines, read own org's parts — no library edits, no
   printer commands. The allow-list in §4 is the viewer-side mirror of it.
4. Confirm `api-beta.meltio.cloud` (token-only host, Cloudflare out of path) is
   the intended target for kiosks, and whether `X-Frame-Options` should stay
   `SAMEORIGIN` (it can: the proxy keeps everything same-origin).

## 7. Verification

Done on this branch (2026-11-10):

* `pytest apps/dev-host/tests`: 161 passed (60 new in `tests/web/test_platform_proxy.py`
  against a fake platform on `httpx.MockTransport`); `pytest tests/smoke` viewer-only mode.
* `node --test tests/js`: 234 passed (9 new platform-mode tests in
  `slicerPane.test.mjs`, 1 badge test in `fileLibrary.test.mjs`); eslint 0 errors;
  `bash gate.sh` all nine gates green.
* Mutation-verified (each change broken on purpose, its test died, code
  restored): allow-list, token injection, cookie stripping, dot-segment guard,
  iframe sender check, platform branch of Load to slicer, badge state.
* `contract-http.json` / `contract-dom.json` regenerated (41 routes).
* **Flag off:** `tools/check_boot.mjs --expect-footprint` against a footprint
  captured from `main` — identical DOM footprint, 0 console errors.
* **Flag on, real HTTP:** viewer in platform mode against a fake platform
  (`uvicorn`, real `httpx` transport): the slicer page, its `api/health`,
  `/api/me`, `/api/parts`, `/api/slicer/profiles` forwarded with the Bearer
  token and `X-Slicer-Session`, cookie stripped, `X-Org-Id` defaulted; denied
  paths 404 without reaching upstream; `check_boot` clean in platform mode.
* **Flag on, in a browser (Chromium against the fake platform, DOM-level):**
  Files → slicer pane fullscreen framing `/slicer/?embed=1` (the frame's own
  relative `api/health` and absolute `/api/me` resolved through the proxy, same
  origin), button pressed; Files again → pane closed, button unpressed, no file
  list, door or camera change; the pane's X does the same; a row's Load to
  slicer (from the legacy list) → `/slicer/?embed=1&part=<id>` after the real
  multipart upload; a `slice-saved` from the frame → row badge "Saved to
  platform". Driven with programmatic clicks and read from the DOM in a hidden
  pane — **not inspected visually**.
* **Flag on, compression and large bodies over real HTTP:** a 356 000-byte
  bundle file fetched through the viewer is byte-identical to a direct fetch both
  as identity and as gzip (upstream's 11 521 compressed bytes passed through with
  `Content-Encoding: gzip`, not re-encoded); a 12 MB `POST /slicer/api/load`
  streamed through the viewer arrived upstream with the same SHA-256 and its
  `Content-Length` intact (no chunked re-encoding), in 0.16 s.
* **Legacy mode after the pane changes** is covered by the unit tests and the
  no-slicer boot only; the vendored slicer was not driven end to end again (the
  two slicer smoke journeys skip without its venv).

**Not verified: a live Meltio platform.** No Docker on this machine and no
token; the platform's auth, 409 body and framing headers are asserted from its
source (`beta`, 2026-11-09), not observed. First live run: point
`AVIS_PLATFORM_URL` at a local `docker compose up` of Lukas's repo with
`PLATFORM_DEV_USER_EMAIL` set and `AVIS_PLATFORM_DEV_EMAIL` matching it, open
Files → Load to slicer, and watch the viewer log for anything the allow-list
refused that the slicer needed.
