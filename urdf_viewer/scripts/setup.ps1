$ErrorActionPreference = "Stop"

if (-not (Test-Path ".\.venv\Scripts\python.exe")) {
	if (Get-Command py -ErrorAction SilentlyContinue) {
		try {
			py -3.11 -m venv .venv
		}
		catch {
			py -3 -m venv .venv
		}
	}
	elseif (Get-Command python -ErrorAction SilentlyContinue) {
		python -m venv .venv
	}
	else {
		throw "Python was not found. Install Python 3 or enable the py launcher."
	}
}

.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt

Write-Host "Environment setup complete."
