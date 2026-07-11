# Repository Standards

## Layout
Use stable top-level folders with clear ownership:
- `src/` (or service folders) for implementation
- `tests/` for automated tests
- `docs/` for canonical documentation
- `scripts/` for reproducible setup/automation

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
