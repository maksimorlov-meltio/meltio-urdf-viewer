# Meltio HMI — release channel

Auto-published snapshot of the frontend partitions, for read-only
consumption (e.g. as a git submodule of the C# WPF host).

- `hmi/` — UI-side ES modules (DOM, host state, transports). No
  `three` imports (CI-enforced boundary).
- `viewer/` — scene-side ES modules (Three.js; DOM only under
  `overlays/`). `three` / `three/addons/*` are bare imports:
  the embedder provides them via an import map or bundler alias.
- `contract.json` — the UI↔host message contract (v2, host-owned).

Source: `3995e087883d86e39ce5f072147b30ebf6c88773` on `main` — do not edit this branch; changes land
on `main` and are re-published by the `release` workflow after
the six-gate check (`gate.sh`).
