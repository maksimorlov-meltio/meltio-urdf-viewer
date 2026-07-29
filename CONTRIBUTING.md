# Contributing

How to develop this repository so changes land safely. This is the
project-specific companion to the generic
[`software-engineering-standards/`](urdf_viewer/software-engineering-standards/README.md)
templates — the standards hold the *principles*, this file holds the *exact
commands and conventions* for this repo. Read it before your first change.

## What this repo is

Two **independent** apps glued at runtime, served as a Windows kiosk HMI with
**no JS build step** (ES modules served as-is):

| App | Root | venv | Port |
|-----|------|------|------|
| Viewer (`avisualizer`) | `urdf_viewer/projects/avisualizer` | `.venv` (Py 3.11) | `8090` |
| Slicer (`meltio-platform`) | `_slicer_branch/projects/platform` | `venv311` (Py 3.11) | `8765` |

They talk **only** over HTTP (same-origin proxy) and browser `postMessage` —
never by importing each other's Python. Everything under `meltio_platform/web`
(Postgres/S3/admin) + `frontend/` is a **dormant** cloud product not started
locally; ignore it unless your change targets that deployment.

Canonical docs (one per topic — read, don't duplicate):
- [`README.md`](README.md) — overview + setup + run.
- [`CLAUDE.md`](CLAUDE.md) — commands, non-obvious facts, gotchas.
- [`urdf_viewer/projects/avisualizer/ARCHITECTURE.md`](urdf_viewer/projects/avisualizer/ARCHITECTURE.md) — both apps' map, flow, endpoints, pipeline.
- [`_slicer_branch/projects/platform/STYLEGUIDE.md`](_slicer_branch/projects/platform/STYLEGUIDE.md) — the single source of UI look (design tokens + component classes).

## Environments

Two repo-local venvs, both Python 3.11 (heavy native wheels — `open3d`,
`trimesh`, `scipy`, `shapely`, `rtree` — have 3.11 wheels). Full setup is in
[`README.md`](README.md#setup-one-time); the viewer's point-cloud extra is
optional (`avisualizer[pointcloud]`). Never rely on global Python packages.

## Validate before every PR (definition of green)

There **is** a root-level CI workflow (`.github/workflows/ci.yml`) that runs on
every PR and every push to `main` — viewer pytest, slicer pytest, and frontend
JS checks (syntax + import-resolution + unit tests). A PR is only healthy once
that workflow is green; the `*/​.github/` workflows under `urdf_viewer/` and
`_slicer_branch/` are per-app/legacy and do **not** run for this repo — ignore
them. Run the same checks locally before pushing so you catch failures before
CI does (**these local commands are the contract**) — run the ones relevant to
what you touched, from the repo root (PowerShell):

```powershell
# Python — per venv (run the suite whose app you touched; both if in doubt)
.\.venv\Scripts\python.exe -m pytest urdf_viewer/projects/avisualizer/tests
.\venv311\Scripts\python.exe -m pytest _slicer_branch/projects/platform/tests

# JS — no build step, so validate statically (in this order):
node --check <each .js you touched>                              # syntax
node urdf_viewer/projects/avisualizer/tools/check_imports.mjs    # import resolution
node --test "urdf_viewer/projects/avisualizer/tests/js/**/*.test.mjs"          # viewer pure units
node --test "_slicer_branch/projects/platform/tests/js/**/*.test.mjs"          # slicer pure units
```

Why the import gate matters: a static `import` of a missing file is a
**load-time-fatal 404 that kills the whole module** — and `node --check` does
**not** catch it (it only checks syntax). `check_imports.mjs` does. This is
exactly the class of defect that once left the viewer unbootable.

If a venv doesn't exist yet, create it (setup above) — don't report a suite as
passing when it was never run.

## Frontend conventions

- **Cache-buster:** every `<script>`/`<link>` and every ES-module import carries
  a `?v=N`. Bump `N` on **each** file you edit (and its importers) or the browser
  serves the stale version and your change "does nothing".
- **Listener/DOM pairing:** a listener on `getElementById(null)` throws and kills
  the whole JS module. Add/remove a DOM element **and** its `addEventListener`
  together; every new `getElementById("x")` needs its `id="x"` in the HTML.
- **Styling:** reuse an existing token/class from the STYLEGUIDE
  (`--accent`, `--panel`, `.tool-btn`, `.primary`, `.card`, …). No ad-hoc hex; a
  genuinely new token goes into the STYLEGUIDE table + `:root` first.
- **UI strings in English**, operator-facing language.
- Prefer small, pure, testable modules (see `static/sim/`) over adding to the
  ~19k-line `urdf_viewer.js`; new pure modules should get a `tests/js/` test.

## Backend conventions

- **Routes:** viewer — inline in `create_app()` with closures (no `Depends()`);
  platform — `APIRouter(prefix="/api")` + `Depends(...)`; slicer engine — inline
  like the viewer. Heavy logic goes in `web/services/*.py` (pure functions +
  `@dataclass(slots=True)`), not in the route.
- **Errors:** always `HTTPException(status_code, detail=...)` with
  `raise ... from exc`; a broad `except Exception` needs `# noqa: BLE001` + a
  reason comment. **No `logging`** — this project doesn't use it; follow the
  `HTTPException` pattern.
- **Typing:** `from __future__ import annotations`, modern types (`str | None`),
  `snake_case` / `PascalCase`, `_`-prefixed module-privates.
- **Indentation:** 4 spaces everywhere **except** `urdf_viewer/projects/avisualizer/tests/`,
  which uses 2 spaces — match the file you're in.
- **Tests:** pytest + `TestClient`. Viewer stubs I/O with `monkeypatch.setattr`
  on the app module's privates (not library mocks); the platform suite uses the
  `client` fixture (in-memory SQLite + storage). Every new route/contract gets a
  test. Physically-critical logic (the slicing engine) must keep contract tests
  (`_slicer_branch/.../tests/test_slicer_core_contracts.py`).

## The boundary and safety

- **Never** import across the viewer↔slicer boundary in Python — HTTP /
  `postMessage` (`source:"meltio-slicer"`) only.
- Role gating (`static/permissions.js`) is a **UI convenience, not a security
  boundary**. Any control for a physically dangerous action (motion, laser,
  feeder, e-stop) must be authorized server-side/in firmware before the live
  machine transport (`?machine=1` → `sim/machineLink.js`) is pointed at real
  hardware.

## Change hygiene

- One logical change per commit/PR; keep it small and reviewable. Match the
  style of the files you touch.
- Avoid broad refactors unless explicitly requested (e.g. the `urdf_viewer.js`
  decomposition is a deliberate follow-up, not a drive-by).
- Update the relevant canonical doc **in the same change** that alters behavior,
  commands, endpoints, or UI tokens.
- **Don't sweep unrelated files into a PR.** Untracked tooling (`.claude/`) and
  unrelated scripts (`install.ps1`) should not ride along in a product change —
  decide their home consciously.
- Commit messages: short, English, no conventional-commits prefixes required —
  `<Area> pass: <changes>` or `<Verb> <object>: <detail>`.

## Definition of done

- [ ] Code updated, matching existing style.
- [ ] Relevant canonical doc updated.
- [ ] Validation commands above run green (or explicitly reported as not run, with why).
- [ ] No unrelated changes included.
