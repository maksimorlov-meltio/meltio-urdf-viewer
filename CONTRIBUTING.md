# Contributing

How to develop this repository so changes land safely. This is the
project-specific companion to the generic
[`software-engineering-standards/`](urdf_viewer/software-engineering-standards/README.md)
templates — the standards hold the *principles*, this file holds the *exact
commands and conventions* for this repo. Read it before your first change.

## What this repo is

Two **independent** apps glued at runtime, served as a Windows kiosk HMI. The
frontend is vanilla ES modules served as-is — `main` ships the raw-source app
entry and the launcher runs no `npm`. esbuild exists, but only as a gate (proof
the module graph resolves) and to build the bundle published on the `release`
branch for the C# host; see "The app entry" below.

| App | Root | venv | Port |
|-----|------|------|------|
| Viewer (`avisualizer`) | `apps/dev-host` (frontend partitions at repo-root `hmi/`, `viewer/`) | `.venv` (Py 3.11) | `8090` |
| Slicer (`meltio-platform`) | `_slicer_branch/projects/platform` | `venv311` (Py 3.11) | `8765` |

They talk **only** over HTTP (same-origin proxy) and browser `postMessage` —
never by importing each other's Python. Everything under `meltio_platform/web`
(Postgres/S3/admin) + `frontend/` is a **dormant** cloud product not started
locally; ignore it unless your change targets that deployment.

Canonical docs (one per topic — read, don't duplicate):
- [`README.md`](README.md) — overview + setup + run.
- [`CLAUDE.md`](CLAUDE.md) — commands, non-obvious facts, gotchas.
- [`apps/dev-host/ARCHITECTURE.md`](apps/dev-host/ARCHITECTURE.md) — both apps' map, flow, endpoints, pipeline.
- [`_slicer_branch/projects/platform/STYLEGUIDE.md`](_slicer_branch/projects/platform/STYLEGUIDE.md) — the single source of UI look (design tokens + component classes).
- [`AGENTS.md`](AGENTS.md) — the partition rules and the two extraction patterns.

## Environments

Two repo-local venvs, both Python 3.11 (heavy native wheels — `open3d`,
`trimesh`, `scipy`, `shapely`, `rtree` — have 3.11 wheels). Full setup is in
[`README.md`](README.md#setup-one-time); the viewer's point-cloud extra is
optional (`avisualizer[pointcloud]`). Never rely on global Python packages.

## Validate before every PR (definition of green)

**CI is the contract.** [`.github/workflows/ci.yml`](.github/workflows/ci.yml)
runs on every PR and `main` is protected behind its three required checks
(viewer pytest + smoke + boot, slicer pytest, frontend js checks). The commands below
are how you get the same answer locally, before pushing — not a substitute.

```powershell
# The nine frontend gates in one shot — exactly what CI and the release workflow
# run (syntax, imports, contract, boundaries, lint, tests+build, entry,
# dom-contract, dead-lookups). None of them starts the app; see the boot check.
bash gate.sh

# The boot check — the only thing that runs the application. Needs the viewer up.
node tools/check_boot.mjs

# Python — per venv (run the suite whose app you touched; both if in doubt)
.\.venv\Scripts\python.exe -m pytest apps/dev-host/tests tests/smoke
.\venv311\Scripts\python.exe -m pytest _slicer_branch/projects/platform/tests
```

The gates exist because each catches a defect the others miss:

- **imports** (`tools/check_imports.mjs`) — a static `import` of a missing file
  is a load-time-fatal 404 that kills the whole module, and `node --check` does
  **not** catch it. This class of defect once left the viewer unbootable.
- **entry** (`tools/check_entry.mjs`) — `urdf.html` may only reference files a
  fresh clone actually gets. Pointing the app entry at the gitignored esbuild
  bundle shipped a dead HMI on `main` while every dev machine looked fine.
- **smoke** (`tests/smoke`) — boots the real servers over HTTP and walks the
  operator journeys. Locally, with both venvs, all 8 run; CI runs it viewer-only
  and the two slicer journeys skip themselves.
- **boot** (`tools/check_boot.mjs`) — loads `/urdf` in headless Chrome and fails
  on one uncaught exception, one `console.error`, one unexpected failed request,
  or a missing `window.Meltio*` bridge. The smoke tests prove the *server*
  answers; only this proves the *page* runs. `515877b` left a TypeError in a
  boot-time dep thunk that killed the module before the URDF loader — blank
  scene, no models — and it survived two days and nine merges because every
  other check passes on an application that never starts. It runs as a step of
  the `viewer pytest` job rather than a job of its own: a required status check
  is matched by job name, and adding a new required context needs repo-admin
  rights nobody on this side has. Permanently, therefore:
  **never rename or split `viewer-python`** — a required context that stops
  being reported blocks every merge until an admin intervenes, which is exactly
  the intervention that is unavailable. Its boot steps carry
  `if: ${{ !cancelled() }}` so a failing pytest cannot silently skip them.

If a venv doesn't exist yet, create it (setup above) — don't report a suite as
passing when it was never run.

## The app entry

`urdf.html` has one `data-app-entry` `<script>`. On `main` it points at the raw
source (`/static/urdf_viewer.js`), which is what the launcher serves; there is
no build step to run. `npm run build` rewrites it to a hashed esbuild bundle in
the gitignored `static/dist/` — useful to check the bundle, but **never commit
that state**: `npm run build:dev` puts it back, and the entry gate fails the PR
if you forget.

## Frontend conventions

- **Cache-buster:** the classic `<script>`/`<link>` tags in `urdf.html` still
  carry a `?v=N`. Bump `N` on **each** of those files you edit or the browser
  serves the stale version and your change "does nothing". (ES-module imports
  inside `hmi/` and `viewer/` no longer need it.)
- **Listener/DOM pairing:** a listener on `getElementById(null)` throws and kills
  the whole JS module. Add/remove a DOM element **and** its `addEventListener`
  together; every new `getElementById("x")` needs its `id="x"` in the HTML.
- **Styling:** reuse an existing token/class from the STYLEGUIDE
  (`--accent`, `--panel`, `.tool-btn`, `.primary`, `.card`, …). No ad-hoc hex; a
  genuinely new token goes into the STYLEGUIDE table + `:root` first.
- **UI strings in English**, operator-facing language.
- Prefer small, pure, testable modules in the repo-root `hmi/` and `viewer/`
  partitions over adding to the ~12k-line `urdf_viewer.js`; new pure modules
  should get a `tests/js/` test. `AGENTS.md` documents the two extraction
  patterns and the CI-enforced boundaries (`hmi/` never imports `three`;
  `viewer/` touches no DOM outside `overlays/`; and the `export let` census
  below).
- **`export let` is frozen per file.** The live bindings in `hmi/state/` are the
  scaffold that let the god-file's globals move out without rewriting ~150 read
  sites — a migration shape, not a target one. `tools/check_boundaries.mjs`
  holds an exact census: a count above its entry fails; a count **below** it
  fails too, so closing one means lowering its ceiling in the same commit (a
  ceiling nobody lowers is a ratchet that quietly stopped); and a file absent
  from the table with any `export let` fails as unregistered. Lowering a number
  needs no justification, raising one needs it in the PR.

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
- **Indentation:** 4 spaces everywhere **except** `apps/dev-host/tests/`,
  which uses 2 spaces — match the file you're in.
- **Tests:** pytest + `TestClient`. Viewer stubs I/O with `monkeypatch.setattr`
  on the app module's privates (not library mocks); the platform suite uses the
  `client` fixture (in-memory SQLite + storage). Every new route/contract gets a
  test. Physically-critical logic (the slicing engine) must keep contract tests
  (`_slicer_branch/.../tests/test_slicer_core_contracts.py`).

## The boundary and safety

- **Never** import across the viewer↔slicer boundary in Python — HTTP /
  `postMessage` (`source:"meltio-slicer"`) only.
- Role gating (`hmi/permissions.js`) is a **UI convenience, not a security
  boundary**. Any control for a physically dangerous action (motion, laser,
  feeder) must be authorized server-side/in firmware before the live
  machine transport (`?machine=1` → `hmi/ports/machineLink.js`) is pointed at real
  hardware.
- **Do not add an emergency-stop control to the UI.** Emergency stop is a
  hardware function (physical E-stop + interlocks, with the electronics
  watchdogging this software), and the console deliberately offers no software
  equivalent. `stopPrint` is a *recoverable* process halt, not an emergency stop,
  which is why it requires an operator. See `apps/dev-host/ARCHITECTURE.md` §1.1.

## Change hygiene

- One logical change per commit/PR; keep it small and reviewable. Match the
  style of the files you touch.
- Avoid broad refactors unless explicitly requested (e.g. the `urdf_viewer.js`
  decomposition is a deliberate follow-up, not a drive-by).
- Update the relevant canonical doc **in the same change** that alters behavior,
  commands, endpoints, or UI tokens.
- **Don't sweep unrelated files into a PR.** Untracked tooling (`.claude/`) and
  unrelated scripts should not ride along in a product change — decide their
  home consciously. Third-party developer tooling lives in `tools/dev/`, never
  at the repo root where it reads as part of the HMI setup.
- Commit messages: short, English, no conventional-commits prefixes required —
  `<Area> pass: <changes>` or `<Verb> <object>: <detail>`.

## Definition of done

- [ ] Code updated, matching existing style.
- [ ] Relevant canonical doc updated.
- [ ] Validation commands above run green (or explicitly reported as not run, with why).
- [ ] No unrelated changes included.
