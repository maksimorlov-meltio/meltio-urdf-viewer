# Print simulation (Files mode)

The URDF viewer can play a **layer-by-layer print build-up** of the model
selected in the existing Files workflow, rendered inside the existing Three.js
scene (no second canvas, no camera reset).

## Architecture

Isolated ES modules under `projects/avisualizer/src/avisualizer/web/static/sim/`:

| File | Responsibility |
|------|----------------|
| `simState.js` | State machine: `idle → loadingModel → slicing → ready → playing → paused → completed → error` |
| `toolpathModel.js` | Pure, testable conversion of slicer `moves[]` → line-segment buffers + per-layer ranges |
| `slicerClient.js` | Optional, configurable client for the real slicer backend |
| `printSimulation.js` | Controller + renderer (clip-plane STL reveal, or toolpath reveal); per-frame advance |

The host (`urdf_viewer.js`) creates the controller at boot (`initializePrintSimulation`),
injects its scene/renderer/model-loading helpers, advances it once per frame in
`animate()`, and guards its camera-reset paths while a simulation is active.

## Two simulation sources

**A) Client-side reveal (default — no backend).** A moving Z clipping plane
reveals the already-loaded STL bottom-up, quantized to synthetic layers. Always
available; uses the model already fetched by the Files list.

**B) Real slicer toolpath (optional).** When a slicer backend is configured, the
selected model is sliced into a real deposition toolpath and revealed
progressively via `setDrawRange`. If the backend is unavailable the controller
logs a warning and **falls back to source A**, so the viewer stays usable.

## Enabling the real slicer (source B)

1. Run an `aslicer` instance (see `projects/aslicer/README.md`). It needs heavy
   native deps (`trimesh`, `shapely`, `scipy`, `rtree`); install it into a
   Python 3.11 environment:
   ```powershell
   .\venv311\Scripts\python.exe -m pip install -e ./projects/aslicer
   .\venv311\Scripts\python.exe -m uvicorn aslicer.web.app:create_app --factory --host 127.0.0.1 --port 8765
   ```
2. Point the viewer backend at it via an environment variable (URL is **not**
   hardcoded). The viewer exposes a **same-origin proxy** `POST /api/slice/proxy`
   so the browser never makes a cross-origin (CORS) request:
   ```powershell
   $env:AVIS_SLICER_URL = "http://127.0.0.1:8765"
   .\.venv\Scripts\python.exe scripts/run_avisualizer.py
   ```
   When `AVIS_SLICER_URL` is unset the proxy returns `503` and the UI uses
   source A.
3. Enable the client in the browser (optional; the proxy must also be
   configured). Add to `urdf.html` before the module script, or set in console:
   ```html
   <script>window.AVIS_SLICER = { enabled: true, profile: "<machine-profile-name>" };</script>
   ```

## Notes / limitations

- Slicer input is **STL only** (G-code is output-only in aslicer).
- The `aslicer` tree is marked deprecated upstream; the live slicer is the
  platform copy. The integration seam is the JSON `moves[]` contract, which is
  the same for both, so re-pointing `AVIS_SLICER_URL` is all that changes.
- For a correctly placed/visible build-up the URDF meshes must be present
  (`git lfs pull`); without them there is no build plate to seat the model on.
