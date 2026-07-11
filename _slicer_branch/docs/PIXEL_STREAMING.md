# Pixel streaming (server-side slicer rendering)

Status: **MVP / proof-of-concept on `platform/pixel-streaming`.** Not deployed.

## Why

Slicing already runs on the server, but the **result is rendered in the browser**
with Three.js. A large toolpath (e.g. the Palpador) is hundreds of thousands of
tube segments — far more GPU/JS memory than a phone has, so the tab crashes
(see `docs/SLICER_EMBED_NOTES.md`). Pixel streaming moves the heavy render to a
server and sends the client **images**; the client only forwards camera input.

## Approach (and why)

The toolpath/thermal geometry builders are ~1.5k lines of browser Three.js. The
only way to render them server-side **without porting all of that** is to run the
**existing slicer in a headless browser** and capture frames. So:

- A separate **`render` service** (Python + Playwright + headless Chromium,
  software WebGL via SwiftShader — no GPU needed) drives the real slicer page in a
  **render mode** (`?render=1`) and captures frames.
- Same-origin auth: the headless page loads the platform over the internal Docker
  network (`http://platform:8090`) with the `Cf-Access-Authenticated-User-Email`
  header, so it fetches the part/slice exactly like a real user.
- Transport: a **WebSocket** — client sends `{partId, sliceId, view, camera, size}`
  and pointer deltas; the service replies with JPEG frames.
- The client shows the frames in a `StreamedViewer` and sends orbit/zoom input.

Keeping it a **separate service** keeps the main platform image lean (Chromium is
~400 MB) and lets it scale independently.

## Size gating

The client decides per part:

- **Small** (below the threshold) → render locally in the browser (today's path).
- **Large** (toolpath segment count / STL bytes above the threshold) → stream from
  the server.

Threshold lives in one place on the client (`STREAM_SEGMENT_THRESHOLD`). `?stream=1`
forces streaming for testing; `?stream=0` forces local.

## What's built

1. `render=1` slicer mode: hides the UI and exposes `window.__render` hooks
   (ready / setView / setLayer / render).
2. `render` service: `GET /frame` (single PNG, debug only) and a WS `/ws`
   (interactive stream).
3. Client `StreamedViewer` + size gating.
4. Verified on a **simple payload** (the Sample STL).

## Hardening (done)

- **Performance:** the WS uses CDP `Page.startScreencast` — Chromium pushes a JPEG
  on every repaint (acked immediately; latest-wins drop if the client lags) instead
  of a `page.screenshot()` per frame. Measured ~20 fps during continuous orbit on
  software WebGL (no GPU).
- **Auth:** when `PLATFORM_RENDER_SECRET` is set, the client must present a
  short-lived HMAC token from the platform's authenticated `GET /api/render/token`.
  The render service verifies it and uses the email inside as the headless page's
  identity; the platform's own auth then governs part access. No secret (local dev)
  = caller-supplied user is trusted. Verified: valid token streams, bad token →
  `unauthorized`.
- **Capacity:** `RENDER_MAX_SESSIONS` (default 4) caps concurrent sessions — excess
  connections get a "busy" message and close (verified 6 → 4 stream, 2 rejected).
  `RENDER_IDLE_SECONDS` (default 120) evicts idle sessions. The `/frame` debug
  endpoint is disabled in prod (`RENDER_ALLOW_DEBUG_FRAME=0`).
- **Warm pool:** `RENDER_POOL_SIZE` (default 2) keeps pre-navigated slicer pages
  (Three.js already loaded) ready; a session grabs one, sets the real user header,
  and posts a `load-part` instead of cold-starting the shell. Pages are single-use
  (closed after the session — no cross-user state). Warmed as `RENDER_WARM_USER`
  (global assets only; the part is fetched as the real user). Measured first frame
  ~250 ms (warm) vs ~370 ms (cold) locally — a bigger win over real network / under
  load, where the shell fetch+parse dominates.

## Beta trial (turn it on)

The beta deploy already builds the render image (`platform-render:beta`) and brings
`render-beta` up best-effort, but streaming stays **off** until it's routed + keyed.
On the server (`~/meltio`), once:

1. **Secret + URL** — add to the host env the beta stack reads:
   ```
   export PLATFORM_RENDER_SECRET=<a long random shared secret>
   export PLATFORM_RENDER_URL=wss://render-beta.meltio.cloud
   ```
2. **Cloudflare** — add a public hostname `render-beta.meltio.cloud` → `render-beta:8092`
   (WebSockets on) and an Access policy matching beta.meltio.cloud, so the browser's
   SSO cookie also guards the stream.
3. **Apply** — re-up so platform-beta picks up the env and render-beta starts:
   ```
   C="docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.beta.yml"
   $C up -d platform-beta render-beta
   ```
   `/api/me` on beta should then return a `renderUrl`; parts over the size threshold
   (or `?stream=1`) stream. Unset `PLATFORM_RENDER_URL` + re-up to turn it back off.

## Deploying to prod (manual, when ready)

1. Set `PLATFORM_RENDER_SECRET` (shared) and `PLATFORM_RENDER_URL=wss://render.<domain>`
   in the server env, then bring up the `render` service (defined in
   `docker-compose.prod.yml`; mirror the beta workflow's render build step in
   `deploy.yml` when going live).
2. Add a **Cloudflare Tunnel ingress rule** `render.<domain>` → `http://render:8092`
   (WebSockets supported) plus an **Access policy**, so the browser's existing SSO
   cookie also guards the stream (defence-in-depth over the token).
3. Empty `PLATFORM_RENDER_URL` keeps streaming off — the safe default.

## Remaining gaps

- **Transport:** a WebRTC/`<video>` pipeline would cut latency/bandwidth further; a
  real **GPU** would raise fps and capacity.
- **Toolpath parity:** the headless render is the real slicer (1:1), at the cost of
  interaction latency vs. local rendering.
