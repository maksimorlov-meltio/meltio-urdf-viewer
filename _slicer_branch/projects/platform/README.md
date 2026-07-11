# Meltio platform

The product shell that unifies the standalone slicer (`aslicer`) and sensor
visualizer (`avisualizer` / "Meltio Orbit") into one multi-user application:
login, per-user storage, file management, versioned slices, print history, and
(later) printer fleet management.

Built as a **modular monolith** and grown **alongside** the existing apps — they
keep running until the platform reaches parity and hostnames cut over. See
[`docs/PLATFORM_ARCHITECTURE.md`](../../docs/PLATFORM_ARCHITECTURE.md) for the
full design and roadmap.

> Import package is `meltio_platform` (not `platform`, which would shadow the
> Python stdlib module).

## Run locally

The platform needs Postgres + an object store, so the stack is the easiest path:

```bash
cp .env.example .env      # at the repo root; defaults target the bundled services
docker compose up --build # platform http://localhost:8090, MinIO console :9001
```

Migrations (`alembic upgrade head`) run automatically on container start. With
`PLATFORM_DEV_USER_EMAIL` set in `.env`, `GET /api/me` returns a provisioned user
locally (no Cloudflare Access needed).

Bare (no DB) still works for the static page and `/health`:

```bash
pip install -e .
meltio-platform           # serves on http://127.0.0.1:8090
```

## Frontend

A static Vite + React SPA in [`frontend/`](frontend/), built at image-build time
(multi-stage Dockerfile) and served by this service — no SSR, no Node at runtime.

```bash
cd frontend && npm install && npm run dev   # http://localhost:5173, proxies /api → :8090
```

For dev you also need the backend running (`docker compose up platform db minio`,
with `PLATFORM_DEV_USER_EMAIL` set so `/api/me` resolves).

## Endpoints (so far)

- `GET /` — the SPA (placeholder page when unbuilt) · `GET /health` — liveness
- `GET /health/db` — Postgres connectivity · `GET /health/storage` — object store
- `GET /api/me` — the authenticated current user (provisioned on first sight)
- `GET /api/parts` · `POST /api/parts` (multipart `name` + STL `file`, streamed
  through the app into the part's folder)
- `GET /api/parts/{id}` · `DELETE /api/parts/{id}` · `GET /api/parts/{id}/file`
- `GET /api/profiles` — slicer machine profiles
- `POST /api/parts/{id}/slices` (slice → versioned G-code) · `GET /api/parts/{id}/slices`
- `GET /api/slices/{id}/gcode` — download a slice's G-code

## Status

- **PR1** — scaffold: FastAPI app + placeholder page, wired into Compose + CI.
- **PR2** — foundation: Postgres (SQLAlchemy + Alembic) with the `Org`/`User`
  identity model; auth seam reading Cloudflare Access (`Cf-Access-Authenticated-
  User-Email`) with a `PLATFORM_DEV_USER_EMAIL` fallback; bundled MinIO object
  store. Org is derived from the email domain → tenant-ready (`org_id` everywhere).
- **PR3/PR4** — file management: `Part`/`STLFile` models (org-scoped). A Part is
  a **shared folder** (`orgs/{org}/parts/{id}/stl|slices|prints/…`); the STL
  uploads/downloads **stream through the app** (works behind Cloudflare and
  on-prem). React SPA shows the user/org and uploads/lists/downloads/deletes
  parts. (Presigned direct-to-store kept for large print media later.)
- **PR5** — part pipeline: slice a part's STL into versioned `SliceVersion`s
  (G-code in the part's `slices/` folder, with layer/extrusion/weight stats).
  SPA gains Slice + slice-history + G-code download.
- **PR6** — **vendored the slicer engine** into the package as
  `meltio_platform.slicer` (a *copy* of the aslicer core, not a shared import),
  so the platform can evolve its slicing freely while `slicer.meltio.cloud` stays
  frozen. The image is self-contained again (`projects/platform` build context).
  The C++ core will later replace the internals behind this package boundary.

- **PR7** — **vendored + served the slicer UI** at `/slicer` (the aslicer web
  app + Three.js viewer, URLs made relative for the mount, nozzle asset bundled).
  The SPA's **Slice** opens `/slicer/?part=<id>`, which auto-loads that part's STL;
  there you slice + run **thermal sim** interactively. This is the **unified-viewer
  basis** — the STL/Toolpath/Thermal toggle is already there to grow onto.
  (Quick-slice still persists a versioned `SliceVersion`; wiring the interactive
  UI's slices back to the part is a later step.)

- **PR8** — the slicer UI's **Save to part** button persists the interactive
  slice as a versioned `SliceVersion` (per user/org) via
  `POST /api/parts/{id}/slices/import`; vendored docstrings tidied of `aslicer`
  references.

- **PR9** — projects, versioning & roles:
  - **Projects** (folders) group parts; the SPA is projects-first (sidebar +
    upload-into-project + parts).
  - **Slice versioning**: re-slicing demotes the previous slice to **legacy**
    with a ~1-month expiry; expired, never-printed legacy slices are cleaned up
    (`cleanup_legacy_slices`), while **printed** slices are protected forever.
  - **Prints** (`PrintRun`): protected sub-entries tied to the exact slice
    printed; never auto-deleted.
  - **Roles**: `member`/`admin`/`superuser` (bootstrap via
    `PLATFORM_SUPERUSER_EMAILS`); superusers see all orgs; an **Admin panel**
    manages user roles. Optional simulation artifact per slice.

Next: the unified viewer (overlay a print's sensor results on the scene),
user groups, storage-quota warnings, a retention cron, and on-prem local login.
