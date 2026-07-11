# aslicer

> ⚠️ **DEPRECATED — reference only, not maintained.**
> All active slicer development happens in the vendored **platform copy** at
> `projects/platform/src/meltio_platform/slicer/` (served at `/slicer/`, deployed
> to beta). The two copies have diverged; edit the platform copy, not this one.
> This standalone tree is kept for historical reference.

Experimental, modular Python slicer for wire-arc / DED toolpath discovery.

This is an early discovery tool: it loads an STL, slices it into horizontal
planes, traces a feature-aware toolpath (per-feature perimeters, infill and
support), optionally generates support, and renders the result in a browser
viewer built on Three.js. The pipeline is intentionally split into small modules
so new strategies (non-planar slicing, new infill patterns, …) can be added
without disturbing existing code.

The slicer is driven by a **machine profile**: every feature type (outer/inner
perimeter, infill, and their support counterparts) carries its own bead width,
feed rate, feeder and laser power, and the geometry follows from those settings.

## Structure

```
src/aslicer/
  config.py            SliceParameters (geometry-only process params + feed math)
  profile.py           MachineProfile / FeatureSettings (per-feature settings)
  profile_store.py     directory-backed JSON store for saved profiles
  core/
    mesh_loader.py     load STL -> single trimesh.Trimesh
    slicer.py          slice mesh into per-layer contours (SlicedModel)
    support.py         overhang detection + support footprints / mesh
    orientation.py     tool-axis vectors for tilted / overhanging walls
    infill.py          rectilinear (unconnected) infill line generation
    toolpath.py        toolpath dataclasses, shared geometry helpers, merge
    profile_toolpath.py  profile-driven, per-feature toolpath generation
    machine.py         toolpath -> ordered machine program (travels, retracts)
    gcode.py           machine program -> G-code text
    transforms.py      mesh place / rotate transforms
  web/
    app.py             FastAPI backend (mesh / profiles / slice / gcode)
    serialize.py       mesh & toolpath -> JSON payloads for the browser
    static/            Three.js viewer (index.html, app.js, styles.css, vendor/)
stl/                   drop input .stl files here
tests/                 pytest suite
```

## Install

From the repository root:

```powershell
.\.venv\Scripts\python.exe -m pip install -e ./projects/aslicer
```

## Run (web viewer)

The slicer is used through a browser-based Three.js viewer. A FastAPI backend
serves the geometry and runs the slicer; the frontend is vendored Three.js (no
network install required).

```powershell
# Minimal launcher: starts the backend and opens the viewer in your browser
.\.venv\Scripts\python.exe scripts\run_aslicer_web.py

# Or run the server directly
.\.venv\Scripts\python.exe -m uvicorn aslicer.web.app:create_app --factory --host 127.0.0.1 --port 8765
```

The page loads the default STL, lets you **Load STL…**, edit the active machine
profile (per-feature perimeters, infill and support), **Slice**, export
**G-code**, and toggle between the STL and toolpath views. Drag to orbit, scroll
to zoom. Endpoints: `GET /api/mesh`, `POST /api/load`, `POST /api/transform`,
`/api/profiles` (CRUD), `POST /api/slice`, `GET /api/gcode`, `GET /api/health`.

Infill is *unconnected*: each clipped line is an independent move with no travel
joining the ends. Successive layers rotate the line direction 90 degrees to form
a cross-hatch.

## Programmatic use

```python
from aslicer.core import load_mesh, slice_mesh, generate_profile_toolpath
from aslicer.profile import default_profile

profile = default_profile()
mesh = load_mesh("projects/aslicer/stl/Sample.stl")
model = slice_mesh(mesh, profile.to_slice_parameters())
toolpath = generate_profile_toolpath(model, profile, mesh)
print(toolpath.layers[0].moves[0].points)  # (N, 3) XYZ of the first move
```

## Test

```powershell
.\.venv\Scripts\python.exe -m pytest projects/aslicer/tests
```

## Next extensions

- Travel-move ordering and seam placement
- Additional infill patterns (concentric, gyroid)
- Non-planar slicing
