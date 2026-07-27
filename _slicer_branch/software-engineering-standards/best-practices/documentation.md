# Documentation Best Practices

## Principles
- Keep docs short.
- Prefer command-first content.
- Keep one canonical document per topic.
- Link to canonical docs instead of duplicating text.
- Update docs in the same change that updates behavior.

## Suggested canonical docs
- `README.md` — short overview + quick start + doc index
- `docs/DEVELOPMENT.md` — setup, build, run, troubleshooting
- `docs/ARCHITECTURE.md` — boundaries, ownership, and data flow
- `docs/PROTOCOL.md` — externally consumed interfaces/contracts
- `CONTRIBUTING.md` — contribution rules and validation expectations

A canonical doc may live **next to the code it describes** (not only under
`docs/`) — what matters is exactly one canonical location per topic, with
everything else linking to it rather than restating it.

## Style rules
- Prefer bullets over long prose.
- Prefer explicit commands over narrative instructions.
- Keep roadmap/planning out of canonical technical docs.
- Remove stale content rather than keeping parallel versions.

## Update checklist
- Does this change behavior, commands, interfaces, or assumptions?
- If yes, update the relevant canonical doc now.
- If no canonical doc exists, create one (do not spread details across many files).
