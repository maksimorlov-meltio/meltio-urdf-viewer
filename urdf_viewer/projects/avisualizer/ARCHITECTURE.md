# Avisualizer + Slicer — Architecture & Onboarding Guide

> **Who this is for:** a developer who is new to this codebase and wants to
> understand *what the pieces are* and *what each one is responsible for* before
> touching the code. It is a map, not a tutorial. Read the "Big picture" section
> first, then jump to whichever app you need.

---

## 1. The big picture

There are **two separate web applications** here, living in two separate folders
(and two separate git repos in the fork):

| App | What it is | Lives in | Dev port |
|-----|------------|----------|----------|
| **Viewer** ("avisualizer") | The 3D machine viewer. Shows the Meltio robot (URDF model), sensor point-clouds, menus, and the **in-scene print simulation**. This is the "host" the operator actually looks at. | `urdf_viewer/projects/avisualizer/` | `8090` |
| **Slicer** | A standalone Python **slicing engine** with its own small 3D web UI. Takes an STL, orients it, slices it into layers, builds a toolpath, and produces G-code. | `_slicer_branch/projects/platform/src/meltio_platform/slicer/` | `8765` |

They are **glued together at runtime**: the viewer embeds the slicer's web UI in
an `<iframe>`, and the two talk through browser `postMessage`. The viewer never
imports slicer Python code — it only ever talks to the slicer over HTTP and
`postMessage`. This keeps the two apps independent.

```
┌──────────────────────────── Browser ────────────────────────────┐
│                                                                  │
│   VIEWER (avisualizer)  :8090                                    │
│   ┌───────────────────────────────────────────────────────┐    │
│   │  Three.js scene: robot, print simulation, menus        │    │
│   │                                                         │    │
│   │   ┌──────────── <iframe> ─────────────────────────┐    │    │
│   │   │  SLICER web UI  :8765  (?dock=1 embed mode)    │    │    │
│   │   │  Three.js scene: the STL part + toolbar        │    │    │
│   │   └───────────────────────────────────────────────┘    │    │
│   │            ▲   postMessage bridge   │                   │    │
│   │            │  "slice-data"          │ "start-print"     │    │
│   │            │  "dock-ready"          ▼                   │    │
│   └───────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
        │  HTTP                                    │  HTTP
        ▼                                          ▼
  Viewer backend  (FastAPI)                  Slicer backend (FastAPI)
  serves pages, proxies to slicer            /api/load /api/slice /api/gcode …
  urdf_viewer/.../web/app.py                 _slicer_branch/.../slicer/web/app.py
```

**The one sentence to remember:** the *slicer* turns an STL into a toolpath; the
*viewer* takes that toolpath and animates the robot printing it.

---

## 2. The end-to-end flow (load → slice → print)

This is the single most important thing to understand. Follow the numbers:

1. **Operator picks a part** in the viewer's **Files** menu.
2. Viewer opens the slicer UI in an iframe, passing the STL location:
   `/slicer?stl=<url>&dock=1`. (`dock=1` = "embedded mode", explained below.)
3. Inside the slicer the part loads onto a virtual build plate. The operator can
   **reorient** it (rotate to a face, move on the plate, rotate 90° on Z).
4. Operator clicks **Slice**. The slicer backend runs the full pipeline
   (slice → support → toolpath → optional thermal) and returns the geometry.
5. The slicer sends the result up to the viewer with
   `postMessage({source:"meltio-slicer", type:"slice-data", …})`.
6. Operator clicks **Start print**. The slicer sends
   `postMessage({… type:"start-print"})`.
7. The viewer's **print simulation** takes the toolpath and animates it: the
   deposition bead is drawn under the nozzle while the robot axes
   (`eje_x/eje_y/eje_z`) move, layer by layer.
8. Operator clicks **Stop** → viewer resets to the Files view and shows a summary
   popup (height printed, material used, over-deposition).

If the slicer backend is **not** configured/reachable, the viewer falls back to a
simpler "clip-plane" print preview (a Z plane sweeps up the STL to fake the
reveal). Real toolpath animation only happens when the slicer is wired in.

---

## 3. The Viewer app (avisualizer)

Root: `urdf_viewer/projects/avisualizer/src/avisualizer/web/`

### 3.1 Backend — `app.py`
FastAPI server. Serves pages and acts as a **same-origin proxy** to the slicer so
the browser doesn't hit cross-origin problems.

- **Pages:** `GET /` → `index.html`, `GET /urdf` → the main viewer page,
  `GET /health`.
- **Robot models:** `GET /api/urdf/models` lists the URDF robots in `/assets`.
- **Sensor data:** `GET /api/sensors[/binary]` (point-cloud) and
  `GET /api/attribute-series` (time series). Backed by
  `services/sensor_pointcloud.py` (reads `Sensors.csv`, filters, packs binary).
- **STL resolution:** `GET /api/datasets/stl`, `/api/stl/files`, `/api/stl/file`.
- **Auth & permissions:** `POST /api/auth/login` verifies `{username, password}`
  against the PBKDF2 credential store (`database/credentials.json`, managed with
  `tools/set_password.py`) and returns `{user}` with the role from the
  permissions document; `GET/PUT /api/permissions/config` serves/persists the
  roles+users matrix. Enforcement is UI gating only (see `static/permissions.js`).
- **CORS:** scoped to the configured slicer origin (not `*`) so only the embedded
  slicer UI can read our GET endpoints; empty when no slicer is configured.
- **Slicer glue (optional, off by default):** controlled by env vars
  `AVIS_SLICER_URL` (slicer API base) and `AVIS_SLICER_UI_URL` (slicer UI base).
  - `GET /api/slicer/status` — is the slicer configured? (menu shows/hides pane)
  - `GET /slicer` — redirects the iframe to the slicer UI, **forwarding the query
    string** (`?stl=…&dock=1`).
  - `GET /api/slicer/profiles`, `POST /api/slice/proxy` — same-origin proxies to
    the slicer.

### 3.2 Frontend core — `static/urdf_viewer.js` (~18,000 lines)
This is the whole viewer UI in one big file. It is **not** cleanly sectioned, so
here is the responsibility map by area (approximate line ranges — treat as a
rough guide, they drift as domains are extracted). The **Notifications** and
**Calendar** domains no longer live here: they were extracted to
`static/notifications/` (§3.3b) and `static/calendar/` (§3.3c); the god-file just
creates one `createNotifications(ctx)` and one `createCalendar(ctx)` instance.
The **ViewCube** navigation gizmo lives in `static/controllers/` (§3.3d). The
**3D-scene bootstrap** (renderer/scene/camera/controls/lights/IBL/grid) now lives in
`static/core/viewerScene.js` (§3.3e); the god-file just destructures its result.

| Area | Roughly | What it's responsible for |
|------|---------|---------------------------|
| **Scene & renderer** | ~484 (one line) | The whole 3D-world setup moved to `core/viewerScene.js` (§3.3e); the god-file destructures `{ scene, camera, renderer, controls, … , context: viewerCore } = createViewerScene({…})` back to the original names. The RAF `animate()` loop with adaptive quality stays in the god-file. |
| **URDF model loading** | 10,776–13,725 | Fetches the `.urdf`, builds the robot as a Three.js hierarchy (`robotRoot`), wires joint sliders (`updateJointAngle`), transparency toggles, and named camera anchors. |
| **Camera / controls** | 2,899–2,944 | `resetView()`, pan toggle, saving/restoring camera when flying to anchors. |
| **Files menu** | — | Now only the "Cloud Model" popup **shell** + the slicer postMessage bridge + docked-print flow (`setCloudModelMenuOpen()`, `loadFileToSlicer()`, `loadSlicerIframeForFile()`, `startDockedPrint()`). The **file-library UI** was extracted to `static/cloud/cloudLibrary.js` (§3.3f) and the **STL/point loaders + 3D placement/lifecycle** to `static/cloud/cloudStl3D.js` (§3.3g). The three cooperate through their public APIs + the `selectedCloudLibraryFile`/`getCloudStlObject` seams. |
| **Controls menu** | — | Left panel: model selector, transparency, feeder drive, motion presets, assembly shortcuts, joint sliders. |
| **Materials menu** | — | Bottom popup: spool cards (Spool 1/2), material dropdown, amounts, material-info panel, and per-print usage history. Key: `setMaterialsMenuOpen()`, `recordMaterialUsage()`, `updateMaterialInfoPanel()`, `renderMaterialUsageHistory()`. |
| **Print simulation orchestration** | 11,311+ | Sets up and drives the in-scene print (`initializePrintSimulation()`, `initPrintBedSimulation()`, `runStartPrintAction()`, `startDockedPrint()`). Delegates the heavy lifting to `sim/` modules. |
| **Stop-print summary** | 13,941+ | Stop confirmation + the summary modal: `confirmStopPrint()`, `buildPrintStopSummary()`, `openPrintStopSummary()`. |
| **postMessage bridge** | one unified dispatcher (near `applyChamberAtmosphere`) | A single `message` listener routes by `data.source` → origin gate → `data.type`. Slicer (`meltio-slicer`, gated by iframe `contentWindow`): `slice-data` → `handleSliceData` (stores `bridgedSliceData`, sets `bridgedToolpathFresh`), `start-print`, `dock-ready`. Sensor bridge (`meltio-m600`, gated same-origin): `chamber-atmosphere`. |

### 3.3 Print-simulation modules — `static/sim/`
These do the actual print animation. They are small and single-purpose (the good
place to start reading):

- **`printSimulation.js`** — the controller. `createPrintSimulation(context)`
  returns `{prepare, play, pause, reset, setProgress, …}`. Handles the two reveal
  modes (real toolpath vs. clip-plane fallback) and calls back to move the bed.
- **`simState.js`** — a tiny state machine
  (`idle→loadingModel→slicing→ready→playing⇄paused→completed/error`) that blocks
  illegal transitions.
- **`slicerClient.js`** — HTTP client to the slicer backend
  (`sliceByName()`); degrades gracefully if the slicer is unreachable.
- **`toolpathModel.js`** — pure data: converts the slicer's `moves` payload into
  flat typed arrays for Three.js. Also `segmentsVisibleForProgress()`.
- **`toolpathTubes.js`** — builds the volumetric **bead** (tube) geometry so the
  deposition looks like a real weld bead, not a thin line.
- **`machineLink.js`** — optional live-machine transport (`createMachineLink`).
  OFF unless `?machine=1` / `window.AVIS_MACHINE.enabled`; stays disconnected
  (commands reject, simulation stays authoritative) until a `base` URL answers.
  Commands (`arm`/`startPrint`/`stop`/`pause`/`resume`/`emergencyStop`) return
  Promises. **UI gating is not a security boundary — real motion needs
  server-side/firmware role auth.**
- **`prePrintCheck.js`** — the Start-print safety gate (`createPrePrintCheck`):
  `open()` runs the material + machine-signal checks, routes material blocks to
  the guided fix, and only proceeds past a signal block on an authorised override.

> **Import gotcha:** these are static `import`s in `urdf_viewer.js`, resolved at
> module load — a missing `sim/*.js` is a fatal 404 that kills the whole viewer
> module. `node --check` won't catch it; run `tools/check_imports.mjs` after
> touching any static import. The pure modules (`simState`, `toolpathModel`) are
> covered by `tests/js/` (`node --test`).

### 3.3b Notifications modules — `static/notifications/`
The **first full domain extracted out of the god-file** (ARQ-2 pilot). Pure,
no-DOM slices first, then the stateful factory:
- **`notificationFormat.js`** — pure formatters (timestamp, severity/status
  normalizers, icon SVG builder).
- **`notificationCatalog.js`** — the severity/status/filter constants, the
  `NOTIFICATION_TYPE_DEFINITIONS` table (default title/severity/icon/… per type),
  `NOTIFICATION_DETAIL_CAUSES`, the classify/sort helpers, and
  `normalizeNotificationRecord`.
- **`notifications.js`** — `createNotifications(ctx)`, the **stateful factory**
  that owns all notification state (the `notificationsById` record map, the
  signal mocks, arrival-toast / bell / history bookkeeping, center-open +
  active-filter UI state) and the render/DOM logic (Notification Center, arrival
  toasts, bell, details modal, history screen, signal→record sync, and the
  chiller/fan utility-error glue). ~980 lines moved byte-exact from the god-file.

The two pure modules are imported directly by `notifications.js` and by the
god-file where still needed. The god-file creates **one** instance
(`const notifications = createNotifications({…})`, just before the top-level init
calls) and **destructures the returned API back to the original function names**,
so all ~25 call sites are unchanged. What crosses the boundary via `ctx`:
notification DOM refs; the shared helpers `escapeHtml` / `formatCalendarDateTime`
/ `markUserActivity`; navigation callbacks (`setCalendarScreenOpen`,
`setTopbarSettingsMenuOpen`, `setSettings{Calibrate,Advanced}MenuOpen`); and
**getters** for mutable god-file state read from inside the domain
(`isCalendarScreenOpen`, `isChillerEnabled`, `isFanEnabled`). Two pieces of state
the god-file still reads are exposed as getters on the instance
(`notifications.isCenterOpen`, `notifications.selectedDetailId`), and
`window.MeltioNotifications` (the `error_codes.js` bridge) delegates to
`raiseRecord` / `resolveRecordById`.

All are unit-tested in `tests/js/` (the pure modules) — the factory's DOM/state
behavior has **no automated test** and must be verified in-browser. Note:
`normalizeNotificationRecord` fills text/icon/priority from the type definition
but takes `severity`/`status` from the record (fixed fallback), not the
definition — preserved behavior. The notifications↔calendar mutual-close pair
(`setCalendarScreenOpen` / `isCalendarScreenOpen`) is passed to this factory as
**lazy `ctx` arrows** from the god-file, so the two factories can be created in
sequence without a construction-order cycle (see §3.3c).

### 3.3c Calendar modules — `static/calendar/`
The **second full domain extracted** (ARQ-2 pilot, after notifications):
- **`calendarFormat.js`** — pure date formatters (`formatCalendarDateTime`,
  `formatCalendarTime`, `formatCalendarDurationHours`, `toLocalDateTimeInputValue`).
  `formatCalendarDateTime` is also imported directly by the notifications module
  (its history screen), so it is a shared pure import, **not** a cross-factory
  `ctx` dependency.
- **`calendar.js`** — `createCalendar(ctx)`, the **stateful factory** that owns
  the event list + view/anchor/selection state and the maintenance-calendar UI
  (month/week/day/agenda grids, the add/edit event modal, drag-to-reschedule
  chips, the details panel). It also holds the `CALENDAR_VIEW_VALUES` /
  `CALENDAR_EVENT_TYPE_META` constants. ~620 lines moved byte-exact from the
  god-file.

The god-file creates the instance **right after the notifications instance**
(so calendar's `ctx` can pass the notification closers by value) and destructures
the API back to the original names, so its ~20 call sites are unchanged. The
toolbar nav no longer mutates calendar state directly — the prev/today/next/view
button handlers call `calendar.stepRange(±1)` / `goToToday()` / `setView()`, and
the open flag is read via `calendar.isScreenOpen`. `setCalendarScreenOpen` is a
menu coordinator: it closes the other overlays (controls, cloud/files, materials,
hotspot, settings, notifications) via `ctx` closers/getters. The pure formatters
are unit-tested in `tests/js/calendarFormat.test.mjs`; the factory's DOM/state
behavior has **no automated test** and must be verified in-browser.

### 3.3d Controllers — `static/controllers/`
Self-contained UI controllers extracted from the god-file (each already followed
the `createXxxController(...)` factory shape):
- **`viewCube.js`** — `createViewCubeController(ctx)`, the orientation-cube gizmo.
  Builds its OWN mini Three.js scene/camera/renderer; reads the MAIN camera each
  frame via `ctx.getCamera()` and drives it on click through `ctx` nav callbacks
  (`buildViewCubeCameraState`, `beginCameraTransition`, `resetCameraToRobotView`,
  all still god-file functions passed in). Holds the `VIEW_CUBE_*` consts. The
  god-file creates it early (with the annotation manager + feeder preview) and
  calls the returned `update()` from the RAF loop. Needs in-browser verification
  (no automated test for 3D interaction).
- **`feederPreview.js`** — `createFeederPreviewController(ctx)`, the feeder-camera
  preview in the Materials panel. Renders the MAIN scene from a dedicated feeder
  camera into a small viewport, isolated to a wheel render-layer. Reads core
  mutable state via `ctx` getters (`getRobotRoot`, `getActiveHotspotPanelId`,
  `getFeederDriveSide/Vertical`) and the const `scene` directly; the god-file
  calls `update()` from the RAF loop and `onPanelStateChange`/`onResize`. Holds
  the `FEEDER_PREVIEW_{RENDER_PIXEL_RATIO,MIN_FRAME_MS,WHEEL_LAYER}` consts (the
  `FEEDER_PREVIEW_DISTANCE_*` consts stay in the god-file with
  `buildFeederPanelPreviewCameraState`, which is passed in via `ctx`).

- **`annotationManager.js`** — `createAssemblyAnnotationManager(ctx)`, the assembly
  callouts. Draws SVG callouts anchored to robot parts, hides occluded ones, and on
  click runs the matching door/cover/spool action + camera focus. The most coupled
  of the controllers: ~870 lines with a **~26-entry `ctx`** — core-state getters
  (`getCamera`/`getControls`/`getRobotRoot`), `ANNOTATION_DEFINITIONS`, and ~20
  god-file action/helper functions passed by name (`isFrontDoorOpen`,
  `runFrontDoorButtonAction`, `setTopCoverOpenState`, `toggleHotspotContextPanel`,
  …). Holds the `ANNOTATION_OCCLUSION_*` / `ENABLE_ANNOTATION_OCCLUSION` /
  `ANNOTATION_{UPDATE_INTERVAL,CLICK_ACTIVE_HOLD}_MS` tuning consts. The large
  callback-heavy `ctx` is a signal that a **shared-state module** (grouping
  scene/camera/controls/robotRoot + the action functions) would collapse much of
  it — the natural next architectural step before the entangled 3D-core domains.

All three controllers are created early in the god-file and need in-browser
verification (no automated test for 3D interaction).

### 3.3e Shared 3D core — `static/core/viewerScene.js`
The **shared-state module** for the 3D core (the prerequisite the AnnotationManager's
big `ctx` pointed to). `createViewerScene({ canvas, restRenderPixelRatio,
enableRealtimeShadows })` owns the entire 3D-world bootstrap — the WebGL `renderer`,
`scene`/fog, `camera`, `OrbitControls`, the ambient/top/viewer lights, the procedural
IBL studio environment, the floor grid and the ground shadow plane (moved byte-exact
from the god-file, ~120 lines). It returns the objects the god-file still references
(`scene`, `camera`, `renderer`, `controls`, `studioEnvironmentTexture`, `grid`,
`groundShadowPlane`, `topLight`), which the god-file **destructures back to the same
names** (zero churn on ~220 references), plus a frozen **`context` accessor bundle**
(`getScene`/`getCamera`/`getControls`/`getRenderer`) exposed to the god-file as
`viewerCore`. The two tuning consts (`REST_RENDER_PIXEL_RATIO`,
`ENABLE_REALTIME_SHADOWS`) stay god-file-owned (used widely elsewhere) and are passed
in by value; `ambientLight`/`viewerLight`/`viewerLightTarget`/`buildStudioEnvironmentTexture`
are fully internal to the module. `robotRoot` is **not** owned here (the URDF loader
creates it) — its getter is still passed to the factories individually.

`viewerCore` is spread (`...viewerCore`) into the two core-touching factories that only
need getters — **AnnotationManager** and **ViewCube** — collapsing their per-getter ctx
lines and becoming the canonical ctx base for the future 3D-core domains (Materials,
Files/Cloud, scene/camera/joints). **FeederPreview** still receives `scene` directly
(a pre-existing, harmless asymmetry left untouched to avoid re-verifying that module).
No automated test — verified in-browser.

### 3.3f Cloud file library — `static/cloud/cloudLibrary.js`
The **first sub-slice carved out of the entangled Files/Cloud domain** (the largest in the
god-file). `createCloudLibrary(ctx)` owns the file-library UI: the USB/Cloud/Local source
pickers, source + favorites filters, per-row **STL thumbnail previews** (rendered by its
OWN offscreen `THREE.WebGLRenderer` + `STLLoader` — never the main scene), the file list
rows, and the row-selection handler `chooseCloudLibraryFile`. ~35 functions / ~900 lines.
What stays in the god-file: the STL/point loaders, the 3D placement math, the slicer
postMessage bridge, and the print/slice flow. The two sides meet at the
**`chooseCloudLibraryFile` / `selectedCloudLibraryFile` seam**.

State model (the crux): the shared mutable state whose primary mutators are the
staying-behind loaders (`cloudFileLibraryEntries`, `selectedCloudLibraryFileName`,
`cloudFileSourceFilter`, `cloudFileSearchQuery`, `loadedCloudLibraryFileName`,
`cloudStlObject`, `hotspotMaterialAssignments`, `autoSliceFlowActive`,
`cloudFavoritesOnlyFilter`) **stays god-file-owned**; the module reads/writes it through
`ctx` getter/setter arrows. Only truly private state moved in (the thumbnail
renderer/scene/camera/cache, the favorites `Set`, and the `CLOUD_THUMB_*` /
`CLOUD_DATASET_ALIAS` consts). `cloudFileSliceStatusByName` (a `Map` shared with the slice
flow) is passed by reference. The factory returns a **13-fn public API** destructured back
to the original names — the 8 the contract predicted plus **5 the reverse orphan-sweep
caught** (`resolveCloudFileSourceFilter`, `getCloudDatasetName`,
`syncCloudDatasetFromSelectedStl`, `setCloudLibraryMessage`, `updateCloudFavoritesFilterButton`),
which staying-behind loaders/boot call. `ctx` is large (~40) — the inherent cost of
sub-slicing an entangled domain. No automated test — verified in-browser.

### 3.3g Cloud STL 3D — `static/cloud/cloudStl3D.js`
The **second, larger sub-slice of Files/Cloud** (~1,550 lines, 45 functions — the biggest
extraction of the refactor). `createCloudStl3D(ctx)` owns the cloud STL/point-cloud **mesh
lifecycle**: load (parse STL / build point cloud) → unit-scale → attach to the `eje_y`
parent → place on the plate → align to the gantry joints → display / drag-relocate →
dispose. It **owns the mesh state** (`cloudStlObject`, `cloudPointObject`, + drag/scratch
vectors) as module-local; the god-file and the other factories read it via the exported
`getCloudStlObject()` / `getCloudPointObject()` / `getCloudStlDragState()` (the slicer/
printSim wiring was repointed to these). Everything else comes through a large (~50-entry)
`ctx`: core-3D (`scene`/`camera`/`controls`/`stlLoader`/`getRobotRoot`), a **kinematics
seam** (`getJointStateByName`/`setJointValue`/`moveJointToValue`/`getLinearJointWorldAxis`/
`getHeadLowestWorldPoint` + `EJE_*`/`CLOUD_STL_*` constants), the print-sim/slicer helpers,
and the shared cloud-file/print state as getter/setter arrows (kept god-file-owned because
their other mutators stay behind).

**The cloudStl3D ↔ cloudLibrary cycle** (cloudStl3D calls 9 cloudLibrary exports;
cloudLibrary calls 4 cloudStl3D exports — `resolveCloudStlUnitScale`, `clearCloudOverlays`,
`loadCloudOverlayFromSelectedFile`, `refreshGlobalStlFiles`) is resolved at the composition
root: `let cloudLibrary`; create **cloudStl3D first** with late-bound thunks
(`(...a) => cloudLibrary.X(...a)`) for the 9; then assign `cloudLibrary` with cloudStl3D's
exports by direct reference. No import cycle, no TDZ (the only forward ref is lazy).
`alignCloudStlToHeadContactViaEjeX` is dead code (0 callers) — moved byte-exact, not
exported, flagged for deletion. No automated test — verified in-browser.

### 3.4 Sensor/utility modules — `static/modules/`
Support the point-cloud viewer (unrelated to printing):
`api.js` (fetch/unpack sensor data), `render.js` (Three.js geometry builders),
`controls.js` (numeric input helpers), `data_refinement.js` (percentile/cut
filters), `trend_chart.js` (2D canvas time-series chart).

### 3.5 HTML & CSS
- **`urdf.html`** — all the DOM: the `#scene` canvas, topbar, bottom nav
  (Door / Materials / Files / Play / Slicer), side panels, modals, and an inline
  `window.AVIS_SLICER = {…}` config block for the embedded slicer.
- **`urdf_viewer.css`** — the dark theme design tokens and all layout. Static
  files are cache-busted with a `?v=` query in the HTML — **bump it when you edit
  CSS/JS** or the browser serves the old file.

---

## 4. The Slicer app

Root: `_slicer_branch/projects/platform/src/meltio_platform/slicer/`

### 4.1 Backend — `web/app.py`
FastAPI server hosting the slicer UI and the slicing REST API. State is
**per-session** (one loaded mesh + toolpath per browser tab, keyed by the
`X-Slicer-Session` header, evicted after ~1h idle).

Key endpoints:

| Route | Purpose |
|-------|---------|
| `POST /api/load` | Upload an STL, load it, return the mesh. Sync `def` (runs in the threadpool, not the event loop) and size-capped at 64 MB (`_MAX_UPLOAD_BYTES` → 413). |
| `POST /api/transform` | Apply a placement transform (rotate/move/place-face/center/rotate_z). |
| `POST /api/slice` + `GET /api/slice/progress` | Run the pipeline, return toolpath geometry. |
| `POST /api/simulate` + `GET /api/simulate/progress` | Run the thermal heat-exposure model. |
| `POST /api/gcode` | Slice and return a downloadable `.gcode` file. |
| `GET/POST/DELETE /api/profiles[/{name}]` | Manage machine profiles. |
| `GET /api/me`, `GET /api/machines` | **Stubs.** The shared platform UI shell calls these; standalone slicer returns empty so it boots without the full platform DB. |

- **`web/serialize.py`** — turns in-memory objects into JSON:
  `mesh_to_payload`, `toolpath_to_payload`, `thermal_to_payload`.

### 4.2 Frontend — `web/static/app.js` (~5,200 lines)
The slicer's own Three.js SPA. Major areas:

| Area | What it's responsible for |
|------|---------------------------|
| **Scene setup** | Renderer (capped pixel ratio 1.5), Z-up camera, OrbitControls, on-demand rendering (`requestRender()`, `renderDirty`). |
| **Build plate & bounds** | `buildPlate()` draws the workspace from the profile's build volume. `computeModelOutOfBounds()` / `updateBoundsState()` tint the part **red** and warn if it exceeds the envelope. `showSlicerBanner()` shows the top notification. |
| **Mesh display** | `buildMesh()` (part) and `buildSupportMesh()` (semi-transparent support). |
| **Transform tools** | `setSelectMode()` (rotate-to-face via `raycastMesh()` + face highlight), `setTranslateMode()` (drag on plate), and `applyTransform()` which POSTs to `/api/transform`. |
| **Slice/simulate calls** | `slice()` → `/api/slice`, `simulate()` → `/api/simulate`, `exportGcode()` → `/api/gcode`. `sliceDirty` gates re-slicing. |
| **Toolpath rendering** | `buildToolpath()`, `setProgress()` playback, tube vs. line modes, thermal heatmap, per-layer isolation. |
| **Dock rail (embedded mode)** | When `?dock=1` sets `<html class="dock">`, a bottom bar with Model / Slice / View / **Start print** tabs. `setActiveSection()`, and the Start-print gate (checks bounds + slice state before `postMessage("start-print")`). |
| **postMessage bridge** | `postSliceDataToParent()` broadcasts `slice-data` to the parent viewer; on load it also sends `dock-ready`. |
| **Attention highlights** | `setDockAttention()` / `setSliceAttention()` pulse a tab (`.attn`) when the part is out of bounds or not yet sliced. |

- **`web/static/index.html`** — DOM: top banner (`#slicerBanner`), the desktop
  side `.panel`, and the `#dockRail` (only shown in `dock` mode). The Model
  section has 4 icon buttons: rotate-to-base, move, center, rotate-Z-90°.
- **`web/static/styles.css`** — normal layout plus the `html.dock` overrides that
  hide the platform header/mobile rails and turn the dock rail into a full-width
  bottom bar. `.attn` is the pulsing highlight.

### 4.3 Slicing engine — `core/`
This is the heart of the slicer. Each file is one pipeline stage:

| File | Responsibility |
|------|----------------|
| `mesh_loader.py` | Load the STL (any trimesh format), merge multi-part scenes, rest it on the plate (min Z → 0). |
| `transforms.py` | Registry (`_TRANSFORMS`) of placement ops dispatched by name: `place_face_on_base`, `translate_on_base`, `center_on_base`, `place_vertex_on_ground`, **`rotate_z`**. Entry: `apply_transform()`. |
| `slicer.py` | Planar slicing: cut the mesh into horizontal contours per layer → `SlicedModel`. Entry: `slice_mesh()`. |
| `support.py` | Find overhangs and build per-layer support footprints (and a support mesh for display). |
| `orientation.py` | Compute tool-axis (head-tilt) vectors so walls can lean for overhangs (5-axis). |
| `toolpath.py` | The toolpath **data model** (`ToolpathMove/Layer/Toolpath`) + geometry helpers. |
| `profile_toolpath.py` | The brain: turns a `SlicedModel` + profile into a **feature-aware** toolpath (outer/inner perimeters, infill, support — each with its own bead width, feed, feeder, laser power). Handles seam alignment. |
| `infill.py` | Rectilinear zig-zag infill line generation for a region. |
| `machine.py` | Convert the toolpath into a flat, machine-agnostic op list (travels + depositions + comments), ordering moves to minimize travel. |
| `gcode.py` | The **only** file that writes real G-code text (Meltio dialect: `G0/G1`, `X/Y/Z`, `F`, `E`, `A/B` rotary, `T0/T1` feeder). |

### 4.4 Configuration & profiles
- **`profile.py`** — `MachineProfile`: the user-facing recipe (machine
  capabilities, global settings like layer height & perimeter count, and
  per-feature `FeatureSettings`, plus G-code macros). This is *how to build*.
- **`config.py`** — `SliceParameters`: a slim, geometry-only subset used by the
  slicing math stages.
- **`profile_store.py`** — load/save/delete profiles on disk; seeds factory
  presets (which cannot be deleted).
- **`machine_catalog.py`** — read-only factory printer models (axes, build
  volume, macros); `apply_machine()` merges a model onto a profile.

### 4.5 Thermal simulation — `thermal/`
A **relative heat-risk** model (not real temperatures), fully decoupled from
slicing (reads a finished toolpath, never feeds back):
- `segments.py` — chop the toolpath into fixed-length `ThermalSegment` nodes.
- `model.py` — `simulate_exposure()`: each segment's heat = its own laser input +
  decayed heat from earlier nearby segments → a 0..1 score for the heatmap.

### 4.6 Backend pipeline order
```
STL → mesh_loader → (transforms) → slicer → support
    → profile_toolpath (+ infill, orientation) → merge
    → machine → gcode            (and optionally → thermal for the heatmap)
    → serialize → JSON to the browser
```

---

## 5. The bridge between the two apps

All cross-app communication is browser `postMessage`. Messages are tagged
`source: "meltio-slicer"` so the viewer can ignore unrelated messages.

| Direction | `type` | Meaning |
|-----------|--------|---------|
| slicer → viewer | `dock-ready` | The embedded slicer has booted; its Start-print button is live. |
| slicer → viewer | `slice-data` | A fresh slice result: `{mesh, toolpath, thermal, plate, speedMmPerSec}`. Viewer caches it as `bridgedSliceData`. |
| slicer → viewer | `start-print` | Operator hit Start print (after bounds/slice gates passed). Viewer runs `runStartPrintAction()`. |

The `?dock=1` flag is what puts the slicer into "embedded" layout (bottom dock
bar instead of its own header/side panel). The viewer's `/slicer` route forwards
the whole query string so `stl`, `dock`, etc. survive the redirect.

---

## 6. How to run it (dev)

Two servers, wired by env vars. From memory of the working setup:

```bash
# Viewer — port 8090 (uses .venv)
#   run from urdf_viewer/projects/avisualizer, with AVIS_SLICER_URL / AVIS_SLICER_UI_URL
#   pointing at the slicer below. Open http://localhost:8090/urdf

# Slicer — port 8765 (uses venv311, from _slicer_branch)
#   Open standalone at http://localhost:8765/  (needs the /api/me + /api/machines stubs)
```

- Static files (JS/CSS/HTML) reload from disk on refresh. **Python changes need a
  server restart.**
- After editing CSS/JS, bump the `?v=` cache-buster in the HTML or the browser
  keeps the stale file.

---

## 7. Gotchas worth knowing

- **Cache-busting:** edit CSS/JS but forget to bump `?v=` → you'll swear your
  change did nothing. It's cached.
- **Removing a button:** delete the element **and** its `addEventListener` calls
  together. A leftover `getElementById(null).addEventListener` throws and kills
  the whole module (and `node --check` won't catch it — only the browser will).
- **Restart Python:** slicer/viewer backend edits (routes, stubs) don't take
  effect until you restart that server. A "still broken" report is often just a
  server that wasn't restarted.
- **Clip-plane fallback:** if the print animation shows a flat plane sweeping up
  instead of a real bead, the slicer toolpath didn't arrive — the sim fell back
  to clip mode. Check the slicer is reachable and `bridgedToolpathFresh` was set.
- **Performance:** the viewer robot is a very heavy mesh (~7.5M triangles), so the
  viewer is geometry-bound. The safe perf lever is pixel-ratio; decimation /
  render-on-demand are the deeper fixes.
- **Bounds gate:** in the slicer, an out-of-bounds part turns red and blocks
  Start print; reorienting it back inside clears the warning automatically.

---

## 8. Where to start reading (suggested order)

1. This document + `urdf.html` (viewer DOM) and the slicer `index.html`.
2. The `sim/` modules in the viewer — small, clear, and the core of the print
   animation.
3. The slicer `core/` files in **pipeline order** (§4.6) — one stage at a time.
4. Only then dive into the two big `*.js` files, using the tables above to jump to
   the area you care about.
