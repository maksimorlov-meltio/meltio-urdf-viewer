"""Run the aslicer web viewer.

Open this file in VS Code and press Run (the triangle), or run it directly:

    python scripts/run_aslicer_web.py

It starts the FastAPI/uvicorn backend as a subprocess, then shows a small
window with a button to open the Three.js viewer in your browser. The browser
opens automatically once the backend is healthy.
"""

from __future__ import annotations

import os
import subprocess
import sys
import threading
import tkinter as tk
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
ASLICER_SRC = REPO_ROOT / "projects" / "aslicer" / "src"

HOST = "127.0.0.1"
PORT = 8765
APP_URL = f"http://{HOST}:{PORT}"
HEALTH_URL = f"{APP_URL}/api/health"


class WebLauncher(tk.Tk):
    """Minimal control window that runs the backend and opens the viewer."""

    def __init__(self) -> None:
        super().__init__()
        self.title("aslicer web")
        self.geometry("360x150")
        self.resizable(False, False)

        self._process: subprocess.Popen[bytes] | None = None
        self._opened = False

        self._status = tk.StringVar(value="Starting backend…")
        tk.Label(self, text="aslicer", font=("Segoe UI", 13, "bold")).pack(anchor="w", padx=14, pady=(14, 0))
        tk.Label(self, textvariable=self._status, fg="#445").pack(anchor="w", padx=14, pady=(6, 8))
        tk.Button(self, text="Open viewer", command=lambda: webbrowser.open(APP_URL)).pack(padx=14, anchor="w")

        self.protocol("WM_DELETE_WINDOW", self._on_close)
        self._start_backend()
        self.after(500, self._poll_health)

    def _start_backend(self) -> None:
        cmd = [
            sys.executable,
            "-m",
            "uvicorn",
            "aslicer.web.app:create_app",
            "--factory",
            "--host",
            HOST,
            "--port",
            str(PORT),
        ]
        env = os.environ.copy()
        existing = env.get("PYTHONPATH", "")
        env["PYTHONPATH"] = f"{ASLICER_SRC}{os.pathsep}{existing}" if existing else str(ASLICER_SRC)
        self._process = subprocess.Popen(cmd, env=env)

    def _poll_health(self) -> None:
        try:
            with urllib.request.urlopen(HEALTH_URL, timeout=0.5):
                healthy = True
        except (urllib.error.URLError, OSError):
            healthy = False

        if healthy and not self._opened:
            self._opened = True
            self._status.set(f"Running at {APP_URL}")
            webbrowser.open(APP_URL)
        elif not healthy:
            self.after(500, self._poll_health)

    def _on_close(self) -> None:
        if self._process is not None:
            self._process.terminate()
        self.destroy()


def main() -> int:
    WebLauncher().mainloop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
