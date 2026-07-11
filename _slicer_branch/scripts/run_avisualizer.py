from __future__ import annotations

import os
import queue
import subprocess
import sys
import threading
import tkinter as tk
from tkinter import scrolledtext
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from pathlib import Path
from datetime import datetime


HOST = "127.0.0.1"
PORT = 8080
HEALTH_URL = f"http://{HOST}:{PORT}/health"
APP_URL = f"http://{HOST}:{PORT}"
DEFAULT_DEBUG_DATASET = "08-06-2026 18.00 Head Gerardo Success"
REPO_ROOT = Path(__file__).resolve().parents[1]
AVISUALIZER_SRC = REPO_ROOT / "projects" / "avisualizer" / "src"


class AvisualizerLauncher(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("Meltio Orbit service")
        self.geometry("760x430")
        self.resizable(True, True)

        self._process: subprocess.Popen[str] | None = None
        self._log_queue: queue.Queue[str] = queue.Queue()
        self._is_ready = False
        self._is_closing = False
        self._port_in_use = False
        self._last_status = ""

        self._status_var = tk.StringVar(value="Starting backend...")
        self._detail_var = tk.StringVar(value=f"Serving on {APP_URL}")
        self._debug_text: scrolledtext.ScrolledText | None = None

        self._build_ui()
        self.protocol("WM_DELETE_WINDOW", self._on_close)

        self._start_backend()
        self.after(100, self._drain_logs)
        self.after(400, self._poll_health)

    def _build_ui(self) -> None:
        frame = tk.Frame(self, padx=14, pady=14)
        frame.pack(fill="both", expand=True)

        title = tk.Label(frame, text="Meltio Orbit", font=("Segoe UI", 12, "bold"))
        title.pack(anchor="w")

        status = tk.Label(frame, textvariable=self._status_var, font=("Segoe UI", 10))
        status.pack(anchor="w", pady=(8, 0))

        detail = tk.Label(frame, textvariable=self._detail_var, fg="#445", wraplength=390, justify="left")
        detail.pack(anchor="w", pady=(6, 10))

        button_row = tk.Frame(frame)
        button_row.pack(fill="x")

        open_btn = tk.Button(button_row, text="Open Meltio Orbit", command=lambda: webbrowser.open(APP_URL))
        open_btn.pack(side="left")

        diag_btn = tk.Button(button_row, text="Run Diagnostics", command=self._run_diagnostics)
        diag_btn.pack(side="left", padx=(8, 0))

        clear_btn = tk.Button(button_row, text="Clear Logs", command=self._clear_logs)
        clear_btn.pack(side="left", padx=(8, 0))

        self._debug_text = scrolledtext.ScrolledText(
            frame,
            height=16,
            wrap="word",
            font=("Consolas", 9),
            bg="#0f1620",
            fg="#cfe8ff",
            insertbackground="#cfe8ff",
        )
        self._debug_text.pack(fill="both", expand=True, pady=(10, 0))
        self._debug_text.configure(state="disabled")

    def _start_backend(self) -> None:
        if not self._force_restart_on_port():
            return

        cmd = [
            sys.executable,
            "-m",
            "uvicorn",
            "avisualizer.web.app:create_sensor_app",
            "--factory",
            "--host",
            HOST,
            "--port",
            str(PORT),
        ]

        env = os.environ.copy()
        existing_pythonpath = env.get("PYTHONPATH", "")
        src_path = str(AVISUALIZER_SRC)
        env["PYTHONPATH"] = (
            f"{src_path}{os.pathsep}{existing_pythonpath}" if existing_pythonpath else src_path
        )

        self._process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            env=env,
        )
        self._log_debug(f"Launching backend: {' '.join(cmd)}")
        self._log_debug(f"PYTHONPATH={env.get('PYTHONPATH', '')}")

        def pump_output() -> None:
            assert self._process is not None
            assert self._process.stdout is not None
            for line in self._process.stdout:
                self._log_queue.put(line.rstrip())

        threading.Thread(target=pump_output, daemon=True).start()

    def _force_restart_on_port(self) -> bool:
        self._status_var.set("Checking service port...")

        # Windows-specific fast path: find listener PID on target port and force-kill it.
        if not sys.platform.startswith("win"):
            return True

        pids = self._get_listener_pids_windows(PORT)
        if not pids:
            return True

        owned: list[int] = []
        foreign: list[int] = []

        for pid in pids:
            cmdline = self._get_process_commandline_windows(pid).lower()
            is_owned_uvicorn = "uvicorn" in cmdline and (
                "avisualizer.web.app:create_app" in cmdline
                or "avisualizer.web.app:create_sensor_app" in cmdline
            )
            is_owned_legacy = "from avisualizer.web.app import run" in cmdline
            if is_owned_uvicorn or is_owned_legacy:
                owned.append(pid)
            else:
                foreign.append(pid)

        if foreign:
            self._port_in_use = True
            self._status_var.set("Port 8080 is used by another app")
            self._detail_var.set(f"Cannot restart automatically. Stop process on {HOST}:{PORT} and retry.")
            return False

        if owned:
            self._status_var.set("Restarting avisualizer service...")

        for pid in owned:
            try:
                subprocess.run(
                    ["taskkill", "/PID", str(pid), "/F"],
                    check=False,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
            except OSError:
                pass

        if owned:
            time.sleep(0.25)

        return True

    def _get_listener_pids_windows(self, port: int) -> set[int]:
        try:
            output = subprocess.check_output(
                ["netstat", "-ano", "-p", "tcp"],
                text=True,
                encoding="utf-8",
                errors="replace",
            )
        except (subprocess.SubprocessError, OSError):
            return set()

        pids: set[int] = set()
        target = f":{port}"
        for line in output.splitlines():
            line = line.strip()
            if not line or "LISTENING" not in line:
                continue

            parts = line.split()
            if len(parts) < 5:
                continue

            local_addr = parts[1]
            pid_text = parts[-1]
            if not local_addr.endswith(target):
                continue

            try:
                pids.add(int(pid_text))
            except ValueError:
                continue

        return pids

    def _get_process_commandline_windows(self, pid: int) -> str:
        query = f'(Get-CimInstance Win32_Process -Filter "ProcessId = {pid}").CommandLine'
        try:
            output = subprocess.check_output(
                ["powershell", "-NoProfile", "-Command", query],
                text=True,
                encoding="utf-8",
                errors="replace",
            )
            return output.strip()
        except (subprocess.SubprocessError, OSError):
            return ""

    def _drain_logs(self) -> None:
        while True:
            try:
                line = self._log_queue.get_nowait()
            except queue.Empty:
                break

            self._append_log_line(line)

            if "Application startup complete" in line:
                self._status_var.set("Backend up. Waiting for UI health check...")
            elif "Uvicorn running on" in line:
                self._status_var.set("UI up")
                self._is_ready = True
            elif "[Errno 10048]" in line:
                self._port_in_use = True
                self._status_var.set("Port 8080 already in use")
            elif "Application shutdown complete" in line and not self._is_closing:
                self._status_var.set("Backend stopped")

        self.after(100, self._drain_logs)

    def _poll_health(self) -> None:
        if self._process is None:
            return

        if self._process.poll() is not None:
            if self._port_in_use:
                self._status_var.set("UI already running on 8080")
                self._detail_var.set(f"Serving on {APP_URL}")
            else:
                self._status_var.set("Backend exited")
            self._emit_status_debug_if_changed()
            return

        if not self._is_ready:
            self.after(400, self._poll_health)
            return

        try:
            with urllib.request.urlopen(HEALTH_URL, timeout=1.0) as response:
                if response.status == 200:
                    self._status_var.set("UI up")
                    self._detail_var.set(f"Serving on {APP_URL}")
                    self._emit_status_debug_if_changed()
                    self.after(1500, self._poll_health)
                    return
        except (urllib.error.URLError, TimeoutError):
            if self._port_in_use:
                self._status_var.set("Could not reach existing UI on 8080")
            else:
                self._status_var.set("UI starting...")

        self._emit_status_debug_if_changed()

        self.after(400, self._poll_health)

    def _append_log_line(self, message: str) -> None:
        if self._debug_text is None:
            return
        timestamp = datetime.now().strftime("%H:%M:%S")
        self._debug_text.configure(state="normal")
        self._debug_text.insert("end", f"[{timestamp}] {message}\n")
        self._debug_text.see("end")
        self._debug_text.configure(state="disabled")

    def _log_debug(self, message: str) -> None:
        self._log_queue.put(f"[debug] {message}")

    def _emit_status_debug_if_changed(self) -> None:
        status = self._status_var.get()
        if status == self._last_status:
            return
        self._last_status = status
        self._log_debug(f"status={status}")

    def _clear_logs(self) -> None:
        if self._debug_text is None:
            return
        self._debug_text.configure(state="normal")
        self._debug_text.delete("1.0", "end")
        self._debug_text.configure(state="disabled")
        self._log_debug("log view cleared")

    def _run_diagnostics(self) -> None:
        def worker() -> None:
            dataset = DEFAULT_DEBUG_DATASET
            encoded_dataset = urllib.parse.quote(dataset, safe="")
            targets = [
                ("health", HEALTH_URL),
                ("sensors", f"{APP_URL}/api/sensors?dataset={encoded_dataset}&view=point&max_points=5000"),
                ("series", f"{APP_URL}/api/attribute-series?dataset={encoded_dataset}&attribute=loadCell&max_samples=1200"),
                ("stl", f"{APP_URL}/api/datasets/stl?dataset={encoded_dataset}"),
            ]
            self._log_debug("diagnostics started")

            for name, url in targets:
                try:
                    with urllib.request.urlopen(url, timeout=5.0) as response:
                        content_length = response.headers.get("Content-Length", "?")
                        self._log_debug(
                            f"diag {name}: status={response.status} bytes={content_length} url={url}"
                        )
                except urllib.error.HTTPError as exc:
                    self._log_debug(
                        f"diag {name}: status={exc.code} error={exc.reason} url={url}"
                    )
                except Exception as exc:  # noqa: BLE001
                    self._log_debug(f"diag {name}: error={exc}")

            self._log_debug("diagnostics finished")

        threading.Thread(target=worker, daemon=True).start()

    def _on_close(self) -> None:
        self._is_closing = True
        self._log_debug("shutdown requested")
        if self._process is not None and self._process.poll() is None:
            self._process.terminate()
            try:
                self._process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self._process.kill()

        self.destroy()


if __name__ == "__main__":
    app = AvisualizerLauncher()
    try:
        app.mainloop()
    except KeyboardInterrupt:
        # Allow clean Ctrl+C shutdown without noisy traceback.
        try:
            app._on_close()
        except tk.TclError:
            pass
