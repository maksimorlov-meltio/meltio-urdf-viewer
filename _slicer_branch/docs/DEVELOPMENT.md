# Development

## Environment setup

From repository root:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

## Run

Run an individual web app from source:

```powershell
.\.venv\Scripts\python.exe scripts/run_avisualizer.py   # Meltio Orbit (visualizer)
.\.venv\Scripts\python.exe scripts/run_aslicer_web.py   # slicer
```

Run the full stack (platform + Orbit + slicer) in containers — matches how it
runs on the server:

```bash
docker compose up --build
```

- Platform: http://localhost:8090
- Meltio Orbit (visualizer): http://localhost:8080
- Slicer: http://localhost:8765

See [DEPLOYMENT.md](../DEPLOYMENT.md) for the server/on-prem story and
[PLATFORM_ARCHITECTURE.md](PLATFORM_ARCHITECTURE.md) for where this is heading.

## Test

```powershell
.\.venv\Scripts\python.exe -m pytest
```

## Troubleshooting

- If PowerShell script execution is blocked:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

- Reinstall dependencies:

```powershell
.\.venv\Scripts\python.exe -m pip install --force-reinstall -r requirements.txt
```

- If UI behavior does not reflect recent code changes, check for a stale process
  already listening on `127.0.0.1:8080` (or `:8765` / `:8090`):

```powershell
Get-NetTCPConnection -LocalPort 8080 -State Listen | Select-Object LocalAddress, LocalPort, OwningProcess
```

- Inspect the owning process command line (replace PID):

```powershell
(Get-CimInstance Win32_Process -Filter "ProcessId = <PID>").CommandLine
```

- If needed, force-stop stale listeners before relaunch:

```powershell
taskkill /PID <PID> /F
```

- Run a backend from workspace source explicitly:

```powershell
$env:PYTHONPATH = "d:\Meltio\process-intelligence-repo\projects\avisualizer\src"
.\.venv\Scripts\python.exe -m uvicorn avisualizer.web.app:create_app --factory --host 127.0.0.1 --port 8080
```
