# Python Virtual Environment Standard

## Baseline
- Use repo-local virtual environment(s): one per independently-deployed service
  or component (a single-service repo has one, e.g. `.venv/`).
- Pin the interpreter version each environment targets.
- Never rely on global Python packages for project execution.
- Keep dependency installation scriptable.

## Recommended setup flow
From repo root:
```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

## Optional dependencies
- Keep optional dependencies separate from required ones — a dedicated file
  (example: `requirements-optional.txt`) or a package extra.
- Install optional dependencies explicitly, not by default.

## Execution
- Use the environment interpreter directly in scripts/tasks.
- Activate shell only when needed:
```powershell
.\.venv\Scripts\Activate.ps1
```

## Policy
- Commit dependency declaration files, not the `.venv/` folder.
- Add `.venv/` to `.gitignore`.
- If activation is blocked on Windows, document one-time execution policy guidance.
