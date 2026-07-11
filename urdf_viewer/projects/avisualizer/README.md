# avisualizer

Visualizer workspace for process data, beginning with a web point-cloud interface for sensor data.

## Interface

- Web viewer: Three.js rendering over FastAPI backend

## Run web viewer

From repository root:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ./projects/avisualizer
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe scripts/run_avisualizer.py
```

Open browser at `http://127.0.0.1:8080`.

URDF viewer (Three.js):

- `http://127.0.0.1:8080/urdf`
- Default model path: `projects/avisualizer/assets/M600_PRO/M600_PRO.urdf`
- Mesh files are resolved relative to the URDF file path.
- Current model assembly includes `Chassis`, `Front Door`, and `Spools Door` links.

URDF viewer notes:

- Viewer uses `Z` as up-axis; CAD assets are converted from `Y`-up at load.
- Ground/grid and top-light anchor are initialized from model bounds at load time and remain fixed during joint motion.
- A `Light Mode` toggle switches the scene background/UI to a white theme.
- Joint sliders control revolute/continuous joints discovered from URDF.

For large mesh assets, this repository uses Git LFS (`*.obj`, `*.glb`, `*.gltf` in `.gitattributes`).
If needed, initialize LFS once per machine:

```powershell
git lfs install
```

When cloning on a new machine, fetch LFS assets before running the viewer:

```powershell
git lfs pull
```

## API

- `GET /api/sensors` (primary binary endpoint)
- `GET /api/sensors/binary` (compatibility alias)
- `GET /api/attribute-series` (2D trend series)

Example query with current supported controls:

`/api/sensors?dataset=SN92_Octagon-20&attribute=loadCell&view=voxel&voxel_size_mm=2.0&voxel_size_z_mm=1.2&max_points=150000`

Key query parameters:

- `dataset`: dataset folder under `projects/avisualizer/database/`
- `attribute`: CSV attribute used for color mapping (for example `loadCell`)
- `view`: `point` or `voxel`
- `voxel_size_mm`: voxel size for X/Y in mm
- `voxel_size_z_mm`: voxel size for Z in mm
- `max_points`: backend sampling cap

Binary sensor response contract (`/api/sensors`):

- Content type: `application/octet-stream`
- Payload is packed `float32` rows
- Current row stride from `X-AV-PointStride`: `5`
- Current row layout: `[x_centered, y_centered, z_centered, attribute, source_index]`

Attribute series response contract (`/api/attribute-series`):

- JSON keys include `sampledValues` and `sampledIndices` with aligned positions.

## Test

```powershell
.\.venv\Scripts\python.exe -m pytest projects/avisualizer/tests
```

## Next extensions

- Dynamic attribute selection for color mapping
- Spatial + attribute filter endpoints
- Selection and labeling workflow
- Voxel alignment pipeline and split-screen comparison mode
