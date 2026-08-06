# Meltio HMI — release channel

Auto-published snapshot of the frontend partitions, for read-only
consumption (e.g. as a git submodule of the C# WPF host).

- `hmi/` — UI-side ES modules (DOM, host state, transports). No
  `three` imports (CI-enforced boundary).
- `viewer/` — scene-side ES modules (Three.js; DOM only under
  `overlays/`). `three` / `three/addons/*` are bare imports:
  the embedder provides them via an import map or bundler alias.
- `contract.json` — the UI↔host message contract (v2, host-owned).
- `contract-dom.json` — what these modules need FROM the embedder:
  the element ids each looks up, and the dependency keys each
  `initXxx`/`createXxx` entry point reads. Every DOM lookup is
  guarded, so an embedder that supplies none of it gets a tree that
  loads cleanly and does nothing, in silence. Read this one first.

Source: `9d958b01d1f7b9a30bab24b5a243c6779597802e` on `main` — do not edit this branch; changes land
on `main` and are re-published by the `release` workflow after
the eight-gate check (`gate.sh`).
