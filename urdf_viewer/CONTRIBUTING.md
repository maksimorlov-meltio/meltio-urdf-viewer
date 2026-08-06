# Contributing

## Change discipline

- Keep one logical change per commit or PR.
- Keep scope focused on changed components.
- Update docs in the same change when behavior changes.

## Required local validation

Run from repository root:

```powershell
.\.venv\Scripts\python.exe -m pytest
```

For the `avisualizer` project only:

```powershell
.\.venv\Scripts\python.exe -m pytest apps/dev-host/tests   # (project moved to apps/dev-host in phase C)
```

## Definition of done

- Code updated
- Relevant docs updated
- Validation commands pass
- No unrelated files changed
