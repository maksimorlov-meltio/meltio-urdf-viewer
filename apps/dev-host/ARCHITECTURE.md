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
| **Viewer** ("avisualizer") | The 3D machine viewer. Shows the Meltio robot (URDF model), sensor point-clouds, menus, and the **in-scene print simulation**. This is the "host" the operator actually looks at. | `apps/dev-host/` | `8090` |
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

Root: `apps/dev-host/src/avisualizer/web/`

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
- **Slicer glue (optional, off by default):** controlled by env vars
  `AVIS_SLICER_URL` (slicer API base) and `AVIS_SLICER_UI_URL` (slicer UI base).
  - `GET /api/slicer/status` — is the slicer configured? (menu shows/hides pane)
  - `GET /slicer` — redirects the iframe to the slicer UI, **forwarding the query
    string** (`?stl=…&dock=1`).
  - `GET /api/slicer/profiles`, `POST /api/slice/proxy` — same-origin proxies to
    the slicer.

### 3.2 Frontend core — `static/urdf_viewer.js` (~16,500 lines)
This is the whole viewer UI in one big file. It is **not** cleanly sectioned, so
here is the responsibility map by area (approximate line ranges):

| Area | Roughly | What it's responsible for |
|------|---------|---------------------------|
| **Scene & renderer** | 419–650 | Three.js `scene`, WebGL `renderer`, `camera`, `OrbitControls`, lights, the RAF `animate()` loop with adaptive quality. |
| **URDF model loading** | 10,776–13,725 | Fetches the `.urdf`, builds the robot as a Three.js hierarchy (`robotRoot`), wires joint sliders (`updateJointAngle`), transparency toggles, and named camera anchors. |
| **Camera / controls** | 2,899–2,944 | `resetView()`, pan toggle, saving/restoring camera when flying to anchors. |
| **Files menu** | 7,841–8,200+ | The "Cloud Model" popup: file library (USB/Cloud/Local), material/spool selection, dataset & STL pickers, and the embedded **slicer pane**. Key: `setCloudModelMenuOpen()`, `loadFileToSlicer()`, `loadSlicerIframeForFile()`. |
| **Controls menu** | — | Left panel: model selector, transparency, feeder drive, motion presets, assembly shortcuts, joint sliders. |
| **Materials menu** | — | Bottom popup: spool cards (Spool 1/2), material dropdown, amounts, material-info panel, and per-print usage history. Key: `setMaterialsMenuOpen()`, `recordMaterialUsage()`, `updateMaterialInfoPanel()`, `renderMaterialUsageHistory()`. |
| **Print simulation orchestration** | 11,311+ | Sets up and drives the in-scene print (`initializePrintSimulation()`, `initPrintBedSimulation()`, `runStartPrintAction()`, `startDockedPrint()`). Delegates the heavy lifting to `sim/` modules. |
| **Stop-print summary** | 13,941+ | Stop confirmation + the summary modal: `confirmStopPrint()`, `buildPrintStopSummary()`, `openPrintStopSummary()`. |
| **postMessage bridge** | 7,161+, 7,304+, 16,171+ | Receives `slice-data` (stored in `bridgedSliceData`, sets `bridgedToolpathFresh`), `start-print`, and `dock-ready` from the slicer iframe. |

### 3.3 The `hmi/` vs `viewer/` partition — repo-root `hmi/`, `viewer/`
The modular (non-god-file) frontend code is split into two packages with
CI-enforced boundaries (`tools/check_boundaries.mjs`): **`hmi/` never imports
`three`**, **`viewer/` never touches the DOM** (except the sanctioned
`viewer/overlays/` island for 3D→screen projections). As `urdf_viewer.js` is
carved up, code lands on one side or the other. Phase C hoisted both to the
repo root together with the FastAPI move to `apps/dev-host/`: the dev server
mounts them at `/hmi` and `/viewer`, the app entry imports them with
root-absolute specifiers ("/hmi/…"), and `build.mjs` resolves those through
its root-absolute esbuild plugin.

`hmi/` (repo root) — UI-side (DOM, host state, transports):
- **`ports/machineLink.js`** — the live-machine HTTP transport (`?machine=1`);
  polls `/api/machine/state`, sends commands, falls back to the local mock.
- **`ports/slicerClient.js`** — HTTP client to the slicer backend
  (`sliceByName()`); degrades gracefully if the slicer is unreachable.
- **`state/machineState.js`** — the HARDWARE state model + legal transitions.
- **`state/materialsState.js`** — the pure materials/feedstock data core
  (catalog, per-spool assignments and gram accounting, usage log, persistence).
- **`materials.js`** — every materials UI surface (hotspot panel, Files pane,
  bottom-nav popup): rendering, validation, the blocked-print/reassign flow and
  listeners. Named exports under the old god-file identifiers (live bindings);
  scene edges (spool highlight, wire drum, model lift) injected via
  `initMaterialsUi(deps)`.
- **`utilities.js`** — the topbar Fan/Chiller domain: on/off + settings
  popovers, the shared on-screen numpad, persistence, and the fan/chiller
  fault records pushed into the notification center. Scene effects (dust
  exhaust, chiller visibility, inert-chamber purge) react through injected
  hooks; `fanState` is a live export read by the chamber-inert simulation.
- **`fileLibrary.js`** — the Files-menu file library: source filters
  (USB/cloud/local), search, favorites, entry normalization, row rendering with
  slice-status badges, selection and the backend fetch. Scene loads and the
  THREE-rendered thumbnails stay host-side via `initFileLibrary(deps)`.
- **`calendar.js`**, **`notifications.js`**, **`settings.js`** — the
  maintenance calendar, the notification center/toasts/bell, and the settings
  menu + Advanced mode (factories `createXxxUi(deps)` instantiated at boot).
- **`prePrintCheck.js`** — the pre-print material/signal gate dialog.
- **`permissions.js`**, **`error_codes.js`**, **`i18n/`** — sign-in/roles UI,
  fault-code catalog, translations (classic scripts / DOM hydration).

`viewer/` (repo root) — scene-side (Three.js, no DOM):
- **`sim/printSimulation.js`** — the print-animation controller.
  `createPrintSimulation(context)` returns `{prepare, play, pause, reset,
  setProgress, …}`. Handles the two reveal modes (real toolpath vs. clip-plane
  fallback) and calls back to move the bed.
- **`sim/simState.js`** — a tiny state machine for what the SCENE is showing
  (`idle→loadingModel→slicing→ready→playing⇄paused→completed/error`).
- **`toolpath/toolpathModel.js`** — pure data: converts the slicer's `moves`
  payload into flat typed arrays for Three.js. Also
  `segmentsVisibleForProgress()`.
- **`toolpath/toolpathTubes.js`** — builds the volumetric **bead** (tube)
  geometry so the deposition looks like a real weld bead, not a thin line.
- **`effects/dustExhaust.js`**, **`effects/chamberInert.js`** — scene effects.
- **`overlays/`** — the sanctioned DOM island (3D→screen projections):
  **`assemblyAnnotations.js`** (`createAssemblyAnnotationManager(layerEl, deps)`
  — the floating door/feeder callout buttons: per-frame projection, silhouette
  avoidance, occlusion raycasts, SVG leader lines) and
  **`feederWheelFloat.js`** (the Up/Stop/Down jog panel that follows each
  feeder wheel while a feeder camera anchor is active). Host state and door /
  hotspot actions are injected via `deps`.

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
| `POST /api/load` | Upload an STL, load it, return the mesh. |
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
#   run from apps/dev-host, with AVIS_SLICER_URL / AVIS_SLICER_UI_URL
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
