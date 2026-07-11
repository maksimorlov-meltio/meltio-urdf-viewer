# Process Intelligence Repository

Repository for process intelligence tooling. Multiple projects can live here; the first project is `avisualizer`, a web-first sensor visualization application with a Python backend.

## Quick start

From repository root:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m pytest
.\.venv\Scripts\python.exe scripts/run_avisualizer.py
```

## Repository layout

- `projects/` project folders
- `docs/` canonical documentation
- `scripts/` reproducible setup and run commands
- `software-engineering-standards/` reusable standards templates
- `projects/avisualizer/database/` example datasets used by the web visualizer

## Documentation index

- `docs/DEVELOPMENT.md`
- `docs/ARCHITECTURE.md`
- `docs/PROTOCOL.md`
- `CONTRIBUTING.md`
