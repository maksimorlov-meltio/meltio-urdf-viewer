# AGENTS.md — rules for AI agents working on this repo

This is a web-based 3D operator HMI for the Meltio M600-PRO: two FastAPI +
Three.js apps glued at runtime (viewer on :8090, slicer on :8765). Read
`apps/dev-host/ARCHITECTURE.md` before touching anything — it is authoritative
and kept current. UI look & feel is governed by
`_slicer_branch/projects/platform/STYLEGUIDE.md` (reuse existing CSS tokens
and component classes; never invent new hex colors or one-off button styles).

## Layout (phase C)

| Path | What it is | Rules |
|---|---|---|
| `hmi/` | UI-side frontend partition (DOM, host state, transports) | must NOT import `three` (CI-enforced) |
| `viewer/` | scene-side partition (Three.js) | must NOT touch the DOM, except under `viewer/overlays/` (CI-enforced) |
| `apps/dev-host/` | the FastAPI dev server + remaining static shell (`urdf_viewer.js`, html, css) + URDF assets + backend tests | Python edits need a server restart |
| `tools/` | the JS gates (`check_imports`, `check_contract`, `check_boundaries`) | keep them green |
| `tests/js/`, `tests/smoke/` | unit tests (pure modules) and full-stack smoke | extend when you add pure modules |
| `contract.json` | the UI↔host message contract, v2, **host-owned** | see below |
| `release` branch | auto-published `hmi/` + `viewer/` + `contract.json` | **never commit to it** — the `release` workflow owns it |

The dev server mounts `/hmi` and `/viewer` from the repo root; the app entry
imports them with root-absolute specifiers (`"/hmi/x.js"`), which `build.mjs`
resolves via its esbuild plugin. Intra-partition imports stay relative.

## Non-negotiable rules

1. **The gate must pass before any PR**: `bash gate.sh` (six checks: syntax,
   imports, contract, boundaries, lint, tests+build). CI enforces the same;
   `main` is protected — all changes go through PRs with 3 required checks.
2. **`contract.json` is host-owned and now ENFORCED.** Any new machine command
   the frontend emits must be declared there first (camelCase, or a legacy
   alias) — an undeclared command is a 400. Its `permission` level is compared
   against the operator's role `rank` server-side in `POST /api/machine/command`;
   the browser's `data-requires-permission` gating is a convenience, NOT a
   security boundary. Declaring a command with too low a level is a real
   authorization change: think before picking one.
3. **Respect the partition when carving code out of
   `apps/dev-host/.../urdf_viewer.js`** (the shrinking god-file): what the
   scene shows → `viewer/`; hardware/UI state → `hmi/`. Two established
   extraction patterns — study an existing module first:
   - state/UI domains: **named exports under the old identifiers** (ES live
     bindings keep call-sites working) + `initXxx(deps)` for host/scene edges
     (see `hmi/materials.js`, `hmi/fileLibrary.js`, `hmi/utilities.js`);
   - factories with injected deps (see `hmi/calendar.js`,
     `viewer/overlays/assemblyAnnotations.js`).
4. **Scene edges are injected, never imported into `hmi/`.** If your hmi code
   needs the 3D scene, take a hook via `deps` at the boot wiring in
   `urdf_viewer.js`.
5. **Per-frame DOM writes are forbidden.** Anything reached from `animate()`
   must memoize its rendered state and only touch the DOM on change (see
   `updateBottomNavState`).
6. **Removing a DOM element? Delete its `addEventListener` wiring in the same
   change** — a listener on a missing element throws at load and kills the
   whole module.
7. **Mesh assets are Git LFS** (root `.gitattributes`). If you move them,
   verify the pointer state afterwards:
   `git show HEAD:<path>.glb | head -1` must show an LFS pointer.
8. Static JS/CSS reloads on browser refresh; **Python does not** — restart the
   server. Legacy `?v=` cache-busters still exist in `urdf.html` for
   non-bundled files; bump them when editing those.

## Commands (from the repo root)

```bash
bash gate.sh                                   # the six gates (frontend)
node --test "tests/js/**/*.test.mjs"           # JS unit tests only
npm run build                                  # hashed bundle + html rewrite
npm run build:dev                              # point urdf.html at raw source
```

```powershell
.\.venv\Scripts\python.exe -m pytest apps/dev-host/tests tests/smoke   # backend + smoke
.\Start-Viewer.bat                                                     # run both apps
```

## Where new code goes

- New UI feature (menus, panels, popups, persistence) → a module in `hmi/`,
  wired at the boot section of `urdf_viewer.js` with injected deps.
- New scene behaviour (meshes, materials, animation) → `viewer/`; if it must
  position DOM over the 3D view, it belongs in `viewer/overlays/`.
- New backend endpoint → `apps/dev-host/src/avisualizer/web/app.py` + a test
  in `apps/dev-host/tests/web/`.
- New machine command → `contract.json` FIRST, then `hmi/ports/machineLink.js`.
