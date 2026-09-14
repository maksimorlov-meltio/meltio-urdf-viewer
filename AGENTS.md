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
| `tests/js/`, `tests/smoke/` | unit tests and full-stack smoke | extend when you add a module. `support/domStub.mjs` = import an `hmi/` module with no DOM (pure logic); `support/domFixture.mjs` = the real `urdf.html` under jsdom (rendering, listeners) |
| `contract.json` | the UI↔host message contract, v2, **host-owned** | see below |
| `contract-dom.json` | generated: the DOM ids, injected deps and `window` globals the published modules require of an embedder | never hand-edit — `node tools/gen_dom_contract.mjs` |
| `contract-http.json` | generated: the HTTP routes an embedder must provide, which published module calls each, and which enforce authorisation server-side | never hand-edit — `.\.venv\Scripts\python.exe apps/dev-host/tools/gen_http_contract.py` |
| `release` branch | auto-published `hmi/` + `viewer/` + both contracts | **never commit to it** — the `release` workflow owns it |

The dev server mounts `/hmi` and `/viewer` from the repo root; the app entry
imports them with root-absolute specifiers (`"/hmi/x.js"`), which `build.mjs`
resolves via its esbuild plugin. Intra-partition imports stay relative.

## Non-negotiable rules

1. **The gate must pass before any PR**: `bash gate.sh` (nine checks: syntax,
   imports, contract, boundaries, lint, tests+build, entry, dom-contract,
   dead-lookups). CI enforces the same; `main` is protected — all PRs need 3
   required checks. Adding a `getElementById`, a `deps` key or a `window.X`
   read to `hmi/` or `viewer/` changes the published artefact's contract:
   regenerate `contract-dom.json` and commit it in the same change.
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
   whole module. The reverse direction is now gated: `getElementById` on an id
   that is not in `urdf.html` fails **silently** (every lookup is guarded), so
   `tools/check_dead_lookups.mjs` refuses new ones. The same gate holds the
   URDF: a link/joint name the code binds to (`front_door_joint`,
   `wire_drum_link`, …) must be declared in `M600_PRO.urdf`. Renaming one there
   throws nothing — the part simply stops moving. 36 pre-existing dead
   lookups are grandfathered in its list; that number may only go down.
7. **Mesh assets are Git LFS** (root `.gitattributes`). If you move them,
   verify the pointer state afterwards:
   `git show HEAD:<path>.glb | head -1` must show an LFS pointer.
8. Static JS/CSS reloads on browser refresh; **Python does not** — restart the
   server. Legacy `?v=` cache-busters still exist in `urdf.html` for
   non-bundled files; bump them when editing those.
9. **Verify every test you write by mutation.** Break the code it defends and
   confirm the test dies; a test that stays green proves nothing. Commit
   before mutating — revert scripts use `git checkout <file>`, which targets
   HEAD and discards uncommitted work.
10. **A refactor that must change nothing is proved, not asserted.** Capture
    `node tools/check_boot.mjs --footprint before.txt`, make the change, then
    `--expect-footprint before.txt`. Screenshots do **not** work for this: two
    captures of identical code already differ.
11. **When you delete code, reword the comments that name it.** The DOM
    contract generator scans source text, so a comment mentioning a removed
    `window.X` or `deps.y` keeps it in `contract-dom.json`.

## Commands (from the repo root)

```bash
bash gate.sh                                   # the nine gates (frontend)
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

## Before you open the PR

[`TODO.md`](TODO.md) is the short recurring checklist — the same rules as here
and in `CONTRIBUTING.md`, in the order you actually hit them, with the reason
each one exists. Run it on every change. For a whole feature, the repo has its
own orchestrator: `/feature` (see [`.claude/README.md`](.claude/README.md)).
