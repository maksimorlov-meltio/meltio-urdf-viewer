# Meltio HMI — release channel

Auto-published snapshot of the frontend partitions, for read-only
consumption (e.g. as a git submodule of the C# WPF host).

- `hmi/` — UI-side ES modules (DOM, host state, transports). No
  `three` imports (CI-enforced boundary).
- `viewer/` — scene-side ES modules (Three.js; DOM only under
  `overlays/`). `three` / `three/addons/*` are bare imports:
  the embedder provides them via an import map or bundler alias.
- `contract.json` — the UI↔host message contract (v2, host-owned).
- `contract-http.json` — the HTTP surface the embedder must provide.
  Generated from the backend, so it cannot drift: which routes exist,
  which of them a PUBLISHED module actually calls (`calledBy`
  non-empty — those you cannot skip), and which enforce authorisation
  SERVER-SIDE. Reimplementing one of those without its check moves the
  security boundary, it does not remove it.
- `contract-dom.json` — what these modules need FROM the embedder:
  the element ids each looks up, and the dependency keys each
  `initXxx`/`createXxx` entry point reads. Every DOM lookup is
  guarded, so an embedder that supplies none of it gets a tree that
  loads cleanly and does nothing, in silence. Read this one first.

Source: `e773a576d08debc357599ef9fc461556080d2632` on `main` — do not edit this branch; changes land
on `main` and are re-published by the `release` workflow after
the eight-gate check (`gate.sh`).
