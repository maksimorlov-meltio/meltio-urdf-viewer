# URDF Visualizer Implementation and Preferences

## 1. Purpose

This document captures how the current URDF visualizer is implemented and the preferred UI/UX rules so it can be rebuilt in a different project.

Target rebuild structure:

- Python minimal desktop GUI launcher
- Embedded or external web interface for the 3D URDF viewer
- Three.js-based rendering
- FastAPI backend to serve static assets and optional APIs

This is the baseline preference specification.

## 2. Current System Overview

The current implementation is a Python + web hybrid:

- Python launcher (`scripts/run_avisualizer.py`) starts the backend and provides a small desktop control window.
- Backend (`projects/avisualizer/src/avisualizer/web/app.py`) serves:
  - web pages (`/`, `/urdf`)
  - static files (`/static`)
  - model assets (`/assets`)
  - sensor APIs (`/api/sensors`, `/api/attribute-series`, `/api/datasets/stl`)
- Frontend (`projects/avisualizer/src/avisualizer/web/static/urdf_viewer.js`) loads and renders URDF meshes with joint controls.

## 3. Software Architecture (Preferred)

### 3.1 Layered components

1. Desktop shell (Python minimal GUI)
- Responsibilities:
  - start/stop backend process
  - show service status and logs
  - open viewer URL
  - run basic diagnostics
- Current implementation uses Tkinter.

2. Web backend (FastAPI)
- Responsibilities:
  - static hosting for HTML/CSS/JS
  - asset hosting for URDF and mesh files
  - optional domain APIs (point cloud, trend data)
  - health endpoint for GUI polling

3. Web viewer (Three.js)
- Responsibilities:
  - parse URDF XML
  - load mesh assets (OBJ/GLTF/GLB)
  - create scene, camera, controls, lighting
  - expose joint sliders and model controls

### 3.2 Runtime flow

1. Python GUI starts Uvicorn with `avisualizer.web.app:create_app`.
2. GUI polls `/health` until ready.
3. User opens `/urdf`.
4. Viewer fetches URDF file and referenced meshes.
5. Viewer builds scene graph and interactive joint controls.

## 4. URDF Viewer Rendering Pipeline

### 4.1 URDF parse model

The viewer extracts:

- robot name
- links and visuals (`<link><visual><geometry><mesh>`)
- joints with:
  - type
  - parent/child links
  - origin (`xyz`, `rpy`)
  - axis
  - limits (`lower`, `upper`)

### 4.2 Mesh loading

Supported formats in current implementation:

- `.obj` via `OBJLoader`
- `.gltf` and `.glb` via `GLTFLoader`

Mesh paths are resolved relative to URDF location.

### 4.3 Coordinate convention

Viewer uses Z-up.

Current behavior:

- camera up vector is set to `(0, 0, 1)`
- model root rotates by +90 degrees around X (`Math.PI * 0.5`) to convert Y-up authored CAD assets into Z-up viewer space

Preference: keep this conversion explicit and centralized.

### 4.4 Joint control behavior

Controllable joint types:

- revolute
- continuous

Behavior:

- each controllable joint gets a slider
- slider updates rotation around joint axis
- value is displayed in degrees
- fallback range is `[-pi, +pi]` if limits are missing

## 5. Material Preferences

Current tuning is intentionally not physically exact; it is readability-first for industrial geometry.

Preferred defaults (per material where property exists):

- `metalness = 0.24`
- `roughness = 0.66`
- `envMapIntensity = 1.35`
- `specularIntensity = 0.72`
- `clearcoat = 0.1`
- `clearcoatRoughness = 0.5`

Readability rules:

- If material base luminance is very dark (`< 0.08`), blend toward mid gray (`0x2d2d2d`) by ~0.28.
- If luminance is dark (`< 0.14`), apply faint emissive boost:
  - emissive RGB `(0.018, 0.018, 0.02)`
  - emissive intensity `0.5`

Preference goal: preserve original material identity while guaranteeing shape readability in dark scenes.

## 6. Lighting Preferences

### 6.1 Renderer/scene baseline

- antialiasing on
- shadow map enabled (`PCFSoftShadowMap`)
- tone mapping: `ACESFilmicToneMapping`
- tone mapping exposure: `1.35`

### 6.2 Preferred light rig

1. Ambient fill
- color: white
- intensity: `0.588`

2. Top directional key light
- color: white
- intensity: `1.0`
- position: `(0, 0, 5)`
- casts shadows with high-resolution map (`2048 x 2048`)

3. Rim/fill directional light
- color: `0xbfd6ff`
- intensity: `0.28`
- position: `(-2.2, -1.5, 1.6)`

4. Camera-attached viewer light
- color: `0xdfefff`
- intensity: `2.4`
- position relative to camera: `(0.15, 0.2, 0.35)`
- target in front of camera

Preference goal: dark materials remain legible from arbitrary orbit angles.

## 7. Scene Anchoring and Framing Preferences

### 7.1 Camera framing

When model loads:

- compute world bounds
- set orbit target to model center
- set camera distance from bounding radius
- adjust near/far planes from model scale

### 7.2 Grid/ground behavior

- grid and shadow plane are positioned from model bounds at load time
- anchors stay fixed during joint motion

Preference: avoid moving world reference planes while animating joints.

## 8. Theme Preferences

Current behavior has dark mode as baseline plus a light mode toggle.

Preferred theme settings:

- dark background: `0x060a12`
- light background: `0xffffff`
- fog color matches background color
- light mode changes body classes and control styling for readability

Preference: keep both modes, default to dark for visual contrast of metallic machine parts.

## 9. Preferred Menu and Control Layout

This section is the explicit UI preference baseline.

### 9.1 Panel placement

1. Status panel
- fixed top-left
- shows:
  - viewer title
  - model load status
  - mesh status

2. Controls panel
- fixed bottom-left
- scrollable for long joint lists
- contains two subpanels:
  - Model
  - Joints

### 9.2 Control rows and fixed sizing

Preferred dimensions from current implementation:

- `control-label` fixed width: `84px`
- `control-input` height: `28px`
- controls panel max width: `420px` (or viewport-limited)
- controls panel corner radius: `12px`
- subpanel corner radius: `10px`
- button/select corner radius: `8px`

Preference for consistency in rebuild:

- keep fixed label width so rows align vertically
- keep uniform field/button heights
- keep fixed spacing between label and input (`12px` gap)

### 9.3 Mandatory controls

Model section:

- URDF selector dropdown
- Reload button
- Reset View button
- Light Mode toggle button

Joints section:

- one slider row per controllable joint
- each row includes:
  - joint name label
  - range slider
  - numeric angle value (degrees)
- if no joints exist: show explicit empty-state message

### 9.4 Mobile behavior

At smaller widths (around `<= 900px`):

- reduce title size
- expand controls panel width to viewport minus margins
- reduce panel max height for usability

## 10. Python Minimal GUI Preferences

The desktop launcher should remain minimal and operational:

- title, status line, and serving URL detail
- buttons:
  - Open UI
  - Open URDF Viewer
  - Run Diagnostics
  - Clear Logs
- scrollable log output
- graceful shutdown of backend process
- automatic handling for occupied port when possible (Windows fast path can kill owned previous instance)

Preference: launcher is utility-first, not a heavy desktop UI.

## 11. Rebuild Blueprint for a New Project

Recommended folder shape:

```text
new-project/
  launcher/
    run_visualizer.py
  backend/
    app.py
    services/
  web/
    static/
      urdf.html
      urdf_viewer.css
      urdf_viewer.js
      vendor/
    assets/
      <robot>/
        robot.urdf
        meshes/
```

Implementation order:

1. Build backend with `/health`, `/urdf`, `/static`, `/assets`.
2. Build URDF page shell (`urdf.html`) with status and control panels.
3. Add Three.js renderer, camera, orbit controls, light rig.
4. Add URDF parse and mesh loading.
5. Add joint slider generation and update loop.
6. Add material readability tuning and light mode toggle.
7. Add desktop launcher for lifecycle and diagnostics.

## 12. Acceptance Checklist

A rebuild is considered correct when all are true:

- URDF and mesh assets load from relative paths.
- Model appears in Z-up orientation and frames correctly.
- Joint sliders control revolute/continuous joints.
- Material tuning keeps dark parts readable.
- Lighting matches preferred rig and shadow behavior.
- Dark/light mode toggle works.
- Menu structure and fixed control sizes match preference baseline.
- Python launcher can start backend, show health, open viewer, and stop cleanly.

## 13. Custom Preference Notes

Use this section to preserve future preference changes without losing baseline defaults.

- Preferred default robot model:
- Preferred camera starting angle:
- Preferred color palette tweaks:
- Additional mandatory controls:
- Forbidden UI patterns:
