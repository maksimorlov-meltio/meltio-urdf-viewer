# Repository Standards

## Layout
Use stable top-level folders with clear ownership:
- `src/` (or service folders) for implementation
- `tests/` for automated tests
- `docs/` for canonical documentation
- `scripts/` for reproducible setup/automation

A monorepo may host several independent services, each with its own
`src/`/`tests/`. When it does, keep boundaries explicit and remove superseded
copies: **do not let dead or duplicated trees (old snapshots, forks) live beside
the active code** — they mislead searches and edits.

## Change discipline
- Keep one logical change per commit/PR when possible.
- Keep changes small and reviewable.
- Avoid broad refactors unless explicitly requested.
- Match existing style in touched files.

## Interfaces and contracts
- Treat interface docs as source-of-truth contracts.
- When interfaces change, update docs in the same PR/commit.
- Avoid undocumented behavior changes.

## Dependencies
- Pin direct dependencies where practical.
- Separate required and optional dependencies.
- Keep setup automated and reproducible via scripts/tasks.

## Definition of done
- Code updated
- Relevant docs updated
- Validation commands run
- No unrelated changes included
