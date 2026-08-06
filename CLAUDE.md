# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A web-based 3D **operator HMI** for the Meltio M600-PRO metal-printing system. It is
**two independent FastAPI + Three.js apps** run side by side and glued at runtime, one
browser SPA embedding the other in an `<iframe>`:

| App | Package (import name) | Source root | venv | Port |
|-----|-----------------------|-------------|------|------|
| **Viewer** (`avisualizer`) | `avisualizer` | `apps/dev-host/src` (frontend partitions at repo-root `hmi/`, `viewer/`) | `.venv` (Py 3.11) | `8090` |
| **Slicer** (`meltio-platform`) | `meltio_platform` (import pkg — **not** `platform`, which shadows stdlib) | `_slicer_branch/projects/platform/src` | `venv311` (Py 3.11) | `8765` |

The viewer never imports slicer Python — they talk over **HTTP** (viewer backend
same-origin-proxies to the slicer) and browser **`postMessage`** (`source:"meltio-slicer"`,
types `dock-ready` / `slice-data` / `start-print`). The slicer turns an STL into a toolpath;
the viewer animates the robot printing that toolpath.

## Read these first

Do not rediscover the architecture by reading the two ~16k / ~5k-line frontend files. Two
existing docs are authoritative and kept current:

- **`apps/dev-host/ARCHITECTURE.md`** — the map of both apps: the
  load→slice→print flow, the responsibility-by-line-range table for the giant
  `urdf_viewer.js`, the slicer `core/` pipeline stages (in order), the postMessage bridge,
  and a "gotchas" section. Read it before touching either app.
- **`_slicer_branch/projects/platform/STYLEGUIDE.md`** — the single source of truth for UI
  look. Both apps share one dark palette via CSS `:root` design tokens (`--bg`, `--panel`,
  `--accent`, `--radius`, …). **When adding any UI element, reuse an existing token and
  component class (`.tool-btn`, `.primary`, `.card`, …); do not introduce new hex colors or
  one-off button styles.**

## Commands (PowerShell, from repo root)

Setup and running are documented in `README.md`; the essentials:

```powershell
# Run both apps + open the browser (idempotent; skips services already up)
.\Start-Viewer.bat        # or Stop-Viewer.bat to shut down
```

Tests use pytest for the backends; the pure frontend `sim/` modules have a small
`node:test` suite:

```powershell
# Viewer tests
.\.venv\Scripts\python.exe -m pytest apps/dev-host/tests
.\.venv\Scripts\python.exe -m pytest apps/dev-host/tests/web/test_slice_proxy.py::<test_name>   # single test

# Slicer tests (test_slicer_core_contracts.py exercises the real slicing pipeline in memory)
.\venv311\Scripts\python.exe -m pytest _slicer_branch/projects/platform/tests

# Frontend unit tests (pure sim/ modules only — no Three.js, no DOM)
node --test "tests/js/**/*.test.mjs"
```

**`gate.sh` (repo root) runs the nine frontend gates in one shot** — syntax,
imports, contract, boundaries, lint, tests+build, entry, dom-contract, dead-lookups —
and is what the `release` workflow requires before publishing `hmi/` + `viewer/` to
the `release` branch:

```powershell
bash gate.sh
```

**None of those nine starts the application.** They parse, lint and mount modules in
isolation; a module that throws at boot passes all nine and takes the whole HMI with
it (that is exactly what `515877b` did — two days of green merges on a dead app). The
boot check is the one that runs it for real, in headless Chrome, and fails on a single
console error. It is kept out of `gate.sh` because it needs a running server and ~30 s
of GLB parsing; CI runs it as the last step of the **`viewer pytest`** job — inside an
already-required check, because making it a required context of its own needs repo-admin
rights that are not available here, and an advisory gate is not a gate. **That job must
never be renamed or split**: a required context that stops being reported blocks every
merge until an admin intervenes.

```powershell
# with the viewer already up (Start-Viewer.bat)
node tools/check_boot.mjs
node tools/check_boot.mjs --screenshot boot.png   # 1080x1920, what the operator sees
```

The linter is eslint (`npm run lint`), enforced in CI; there is no formatter. `node --check`
catches syntax errors but **not** a `getElementById(null).addEventListener` that only
throws in the browser (see gotchas). After adding/renaming/removing any static JS module,
also run the import-resolution gate — `node --check` does **not** catch an `import` that
points at a missing file, which is a load-time-fatal 404 that kills the whole module:

```powershell
node tools/check_imports.mjs
```

**`contract.json` (repo root) is the UI↔host message contract** (v2, host-owned). Any new
machine command the frontend emits must be declared there first (camelCase name, or listed
as a legacy alias). CI enforces it:

```powershell
node tools/check_contract.mjs
```

Sign-in credentials (per-user PBKDF2 `salt`/`passwordHash` fields inside the
roles/users document `database/permissions.json`, stripped before serving it to
the browser) are managed out-of-band:

```powershell
# Bootstrap a fresh install (creates the built-in roles + the first user):
.\.venv\Scripts\python.exe apps/dev-host/tools/set_password.py --create --username admin --role role_admin

# Set/clear an existing user's password:
.\.venv\Scripts\python.exe apps/dev-host/tools/set_password.py --username <user>
```

## Non-obvious operational facts

- **Static assets are cache-busted with a `?v=` query in the HTML.** Edit CSS/JS and forget
  to bump it → the browser serves the stale file and your change appears to do nothing. The
  launcher additionally appends a `?cb=` to the URL on each open.
- **Python backend edits require a server restart** (routes, stubs, proxy). Static JS/CSS/HTML
  reload on browser refresh; Python does not. A "still broken" result is often an unrestarted
  server.
- **Removing a DOM button:** delete the element **and** its `addEventListener` calls together.
  A leftover listener on a now-missing element throws and kills the whole JS module.
- **The machine link is off by default** — the scene runs against a mock machine state. Append
  `?machine=1` to the viewer URL to enable the live transport (`hmi/ports/machineLink.js`).
  The transport stays disconnected (and every command rejects) until a `base` URL actually
  answers, so the local simulation remains the authority. **Before pointing it at real
  hardware, add server-side/firmware role authorization for motion-bearing commands** — the
  permissions gating below is UI-only.
- **Pre-print safety gate** (`hmi/prePrintCheck.js`): the Start-print flow runs a
  material + machine-signal check before `startDockedPrint()`. Material blocks route to the
  guided Materials fix; signal blocks only proceed on an authorised (Support/God) override.
- **The slicer is optional in the viewer**, gated by env vars `AVIS_SLICER_URL` (API base) and
  `AVIS_SLICER_UI_URL` (UI base). Without them, the print flow falls back to a "clip-plane"
  Z-sweep preview instead of real toolpath animation. The launcher wires both to `:8765`.
- **Auth & permissions** are two distinct vocabularies, on purpose:
  - **Role `rank`** (1 Operator · 2 Operator+ · 3 Support · 4 Administrator) authorises
    **machine commands, server-side**. `POST /api/machine/command` looks the command up in
    `contract.json` (by camelCase name or legacy alias), reads its `permission` level, and
    compares. An undeclared command is a 400; `emergencyStop` is level `none` and is
    therefore allowed signed-out, as the contract requires. Every accepted command is
    audited.
  - **Capability keys** (`files.browse`, `print.control`, `admin.users`, …) gate UI controls
    via `data-requires-permission` — **a convenience, not a security boundary** — plus
    `PUT /api/permissions/config`, which requires `admin.users` server-side.
  Sign-in is `POST /api/auth/login` (PBKDF2 against per-user fields in
  `apps/dev-host/database/permissions.json`); sessions carry a server-side TTL and
  `POST /api/auth/logout` revokes them. **A fresh clone has no `permissions.json`**: the
  backend serves four built-in roles and zero users, and the first operator is created with
  `set_password.py --create` (see Commands). The slicer package has its own `auth.py` /
  `permissions.py` / `role_config.py` (part of the dormant cloud shell).
- **Windows-only, PowerShell 5.1.** The launcher expects the exact venv folder names `.venv`
  and `venv311`. Use `py -3.11` — Python 3.11 has prebuilt wheels for the heavy native deps
  (`open3d`, `trimesh`, `scipy`, `shapely`, `rtree`); other versions may not.
- **Not tracked** (see `.gitignore`): the venvs, `apps/dev-host/database/` datasets,
  `Sensors.csv`, `.env`, and raw mesh sources. The URDF loads `.glb`, not the OBJ sources.

## Layout targets

The UI is tuned for a **vertical 1080×1920 HMI touch panel** (a 1920×1080 screen mounted
portrait), full-bleed top bar + bottom nav. Run the browser fullscreen (F11 / `--kiosk`) for a
true kiosk look.
