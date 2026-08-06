"""Real-machine adapter: M600Pro.Platform ControlService.

This is the production counterpart to ``machine_mock.MockMachine``. It implements
the *same two methods* — ``snapshot()`` (telemetry OUT) and ``command()`` (commands
IN) — but instead of a simulated model it talks to the machine's ControlService
over its documented local REST API (``http://localhost:5080`` by default).

Design contract (unchanged by this file):
  * The HTTP endpoints (``GET /api/machine/state`` / ``POST /api/machine/command``)
    and the entire browser UI are untouched — they keep calling ``snapshot()`` /
    ``command()``. Only which object answers changes (see ``app.get_machine``).
  * We are a *client* of ControlService. We never open serial/CAN/USB ourselves;
    ControlService is the sole owner of machine IO. Nothing in the M600Pro.Platform
    repository is modified — we only read the API it already publishes.

Source of the field mapping (M600Pro.Platform, read-only reference):
  * REST:    docs/contracts/rest-api.md  →  GET /api/machine/snapshot
  * Shapes:  src/M600Pro.Contracts/{MachineContracts,ProcessContracts,
             EngineeringConsoleContracts,AlarmContracts}.cs
  * JSON is camelCase with string enum values.

Safety: this adapter is **read-only by default** (``readonly=True``). In that mode
``command()`` refuses every command locally and forwards nothing to the real
controller, so wiring the viewer to a live machine cannot move it. Command
forwarding is a deliberate, separately-enabled second step (``AVIS_MACHINE_READONLY=0``),
and even then only a small, explicitly safe subset is mapped.

Dependency-free (stdlib ``urllib`` only) to match ``machine_mock`` and the existing
slicer proxy in ``app.py``.
"""
from __future__ import annotations

import json
import time
from datetime import datetime
from typing import Any
import urllib.error
import urllib.request
from urllib.parse import quote


# ── ControlService MachineState (string enum) → viewer wire state ─────────────
# Viewer states (static/sim/machineState.js): disconnected, connecting, idle,
# homing, armed, printing, paused, completed, fault, estop. The Platform has no
# top-level "homing" (homing is a motion routine), so it is simply never produced.
_STATE_MAP: dict[str, str] = {
    "Unknown": "disconnected",
    "Disconnected": "disconnected",
    "Connecting": "connecting",
    "Idle": "idle",
    "Ready": "armed",        # ready-to-run ≈ the console's "armed"
    "Running": "printing",
    "Paused": "paused",
    "Stopping": "printing",  # transient wind-down; keeps the progress view stable
    "Stopped": "idle",       # recoverable stop → back to a safe idle
    "Faulted": "fault",
    "EmergencyStop": "estop",
}

# ControlService command name → the operator-safe subset we are willing to forward
# when (and only when) read-only mode is explicitly disabled. Everything else is
# rejected rather than silently dropped.
_FORWARDABLE = {
    "ESTOP": ("POST", "/api/machine/emergency-stop"),
    "STOP": ("POST", "/api/process/stop"),
}


def _num(value: Any) -> float | None:
    """Coerce to float, treating null/NaN/garbage as missing (None)."""
    try:
        if value is None:
            return None
        f = float(value)
        return f if f == f else None  # drop NaN
    except (TypeError, ValueError):
        return None


def _ts_to_millis(iso: Any) -> int:
    """Parse an ISO-8601 UTC timestamp ('...Z') to epoch millis; fall back to now."""
    if isinstance(iso, str) and iso:
        try:
            dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
            return int(dt.timestamp() * 1000)
        except ValueError:
            pass
    return int(time.time() * 1000)


class ControlServiceMachine:
    """Adapter exposing a live M600 (via ControlService) as the console's machine."""

    def __init__(self, base_url: str, *, readonly: bool = True, timeout: float = 1.5) -> None:
        self.base_url = base_url.rstrip("/")
        self.readonly = readonly
        self.timeout = timeout

    # ── HTTP helper ──────────────────────────────────────────────────────────
    def _request(self, method: str, path: str, body: dict | None = None) -> Any:
        url = f"{self.base_url}{path}"
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("Accept", "application/json")
        if data is not None:
            req.add_header("Content-Type", "application/json")
        with urllib.request.urlopen(req, timeout=self.timeout) as resp:  # noqa: S310 (localhost only)
            raw = resp.read()
            if not raw:
                return {}
            return json.loads(raw.decode("utf-8"))

    # ── Telemetry OUT ─────────────────────────────────────────────────────────
    def snapshot(self) -> dict[str, Any]:
        """Fetch and translate ControlService's machine snapshot.

        Never raises: on any transport/parse error it returns a well-formed
        *disconnected* snapshot so the console degrades gracefully (its poller
        already treats a stale/disconnected snapshot as "offline") instead of the
        HTTP endpoint returning a 500.
        """
        try:
            snap = self._request("GET", "/api/machine/snapshot")
            if not isinstance(snap, dict):
                raise ValueError("snapshot payload was not an object")
            return self._map_snapshot(snap)
        except (urllib.error.URLError, OSError, ValueError, json.JSONDecodeError) as exc:
            return self._disconnected_snapshot(str(exc))

    def _map_snapshot(self, snap: dict[str, Any]) -> dict[str, Any]:
        machine_state = str(snap.get("machineState") or "Unknown")
        safety_state = str(snap.get("safetyState") or "Unknown")
        connection = str(snap.get("connectionState") or "Disconnected")
        connected = connection == "Connected"

        state = _STATE_MAP.get(machine_state, "idle")
        # A hard safety condition always wins over the nominal machine state.
        if safety_state == "EmergencyStop" or machine_state == "EmergencyStop":
            state = "estop"

        process = snap.get("process") if isinstance(snap.get("process"), dict) else {}
        motion = snap.get("motion") if isinstance(snap.get("motion"), dict) else {}
        job = process.get("job") if isinstance(process.get("job"), dict) else {}

        progress = _num(job.get("progressPercent"))
        progress = max(0.0, min(1.0, progress / 100.0)) if progress is not None else 0.0

        position = None
        px, py, pz = _num(motion.get("x")), _num(motion.get("y")), _num(motion.get("z"))
        if any(v is not None for v in (px, py, pz)):
            position = {"x": px, "y": py, "z": pz, "arm": _num(motion.get("arm"))}

        return {
            "connected": connected,
            "state": state,
            "progress": round(progress, 4),
            "layer": None,          # snapshot has no true layer index (g-code lines only)
            "layerCount": None,
            "elapsedSeconds": None,  # not carried by the machine snapshot
            "remainingSeconds": None,
            "position": position,
            "jobId": (job.get("jobId") or None),
            "program": (job.get("fileName") or None),
            "signals": self._map_signals(snap, process, connected, state),
            "activeCodes": self._map_active_codes(snap.get("alarms")),
            "ts": _ts_to_millis(snap.get("timestampUtc")),
        }

    def _map_signals(
        self, snap: dict, process: dict, connected: bool, state: str
    ) -> dict[str, Any]:
        """Map the machine snapshot onto the PRINTER_NOTIFICATION_SIGNALS schema
        the notification centre + pre-print checklist consume. Fields with a clean
        source are derived; the rest keep safe, nominal defaults."""
        argon = process.get("argon") if isinstance(process.get("argon"), dict) else {}
        chiller = process.get("chiller") if isinstance(process.get("chiller"), dict) else {}
        oxygen = process.get("oxygen") if isinstance(process.get("oxygen"), dict) else {}
        io = process.get("io") if isinstance(process.get("io"), dict) else {}
        named_inputs = io.get("namedInputs") if isinstance(io.get("namedInputs"), dict) else {}

        # Inert-gas flow low: enabled but actual well under target.
        target_flow = _num(argon.get("targetFlowLpm")) or 0.0
        actual_flow = _num(argon.get("actualFlowLpm")) or 0.0
        gas_flow_low = bool(argon.get("enabled")) and target_flow > 0 and actual_flow < 0.5 * target_flow

        # Doors: honour any door-ish named input if the machine reports one.
        doors_closed = True
        for key, value in named_inputs.items():
            if "door" in str(key).lower():
                doors_closed = doors_closed and bool(value)

        armed = state in ("armed", "printing", "paused")
        estop = state == "estop"

        return {
            "emergencyStopActive": estop,
            "machineArmedRequired": not armed,
            "machineArmedState": armed,
            "inertedSystemActive": bool(oxygen.get("safe", True)),
            "filtrationRequired": False,
            "controllerBoardConnected": connected,
            "gasFlowLow": gas_flow_low,
            "gasFlowDecreasing": False,
            "coolantFlowLow": False,
            "coolantTemperature": _num(chiller.get("temperatureC")),
            "externalSecurityFault": str(snap.get("safetyState")) == "Fault",
            "closedLoopFault": False,
            "internetConnected": True,
            "processRunning": state == "printing",
            "doorsClosed": doors_closed,
            "laserHeadReady": True,
        }

    @staticmethod
    def _map_active_codes(alarms: Any) -> list[dict[str, str]]:
        """Active AlarmDto[] → the console's activeCodes [{class, code}] list."""
        codes: list[dict[str, str]] = []
        if not isinstance(alarms, list):
            return codes
        for alarm in alarms:
            if not isinstance(alarm, dict):
                continue
            if alarm.get("clearedAtUtc"):  # only currently-active alarms
                continue
            code = alarm.get("code") or alarm.get("alarmId")
            if not code:
                continue
            severity = str(alarm.get("severity") or "Error")
            klass = "warning" if severity in ("Info", "Warning") else "error"
            codes.append({"class": klass, "code": str(code)})
        return codes

    def _disconnected_snapshot(self, reason: str) -> dict[str, Any]:
        return {
            "connected": False,
            "state": "disconnected",
            "progress": 0.0,
            "layer": None,
            "layerCount": None,
            "elapsedSeconds": None,
            "remainingSeconds": None,
            "position": None,
            "jobId": None,
            "program": None,
            "signals": {
                "controllerBoardConnected": False,
                "internetConnected": True,
                "emergencyStopActive": False,
                "processRunning": False,
            },
            "activeCodes": [],
            "ts": int(time.time() * 1000),
            "diagnostic": f"ControlService unreachable: {reason}",
        }

    # ── Program library / cloud catalog (read-only) ───────────────────────────
    def library(self) -> dict[str, Any]:
        """The machine's browsable programs: the local G-code library plus the
        Meltio Cloud catalog, mapped to a compact shape for the Files menu.

        Never raises: any transport/parse error yields empty lists so the Files
        menu simply shows "no programs" rather than erroring.
        """
        local_raw = self._safe_json("/api/gcode/library", default=[])
        cloud_doc = self._safe_json("/api/gcode/cloud/catalog", default={})
        cloud_raw = cloud_doc.get("slices") if isinstance(cloud_doc, dict) else []
        return {
            "local": [self._map_local(e) for e in (local_raw or []) if isinstance(e, dict)],
            "cloud": [self._map_cloud(s) for s in (cloud_raw or []) if isinstance(s, dict)],
        }

    def cloud_status(self) -> dict[str, Any]:
        """Meltio Cloud connection state, from ControlService's CloudAgent proxy
        (GET /api/cloud-agent/status). Tells the Files menu whether cloud models
        can be expected. Never raises — a missing/failed status reads as offline.
        """
        doc = self._safe_json("/api/cloud-agent/status", default={})
        if not isinstance(doc, dict):
            doc = {}
        return {
            "connected": bool(doc.get("online")),  # "connected to the cloud" == online
            "online": bool(doc.get("online")),
            "enrolled": bool(doc.get("enrolled")),
            "reachable": bool(doc.get("reachable")),
            "controlServiceConnected": bool(doc.get("controlServiceConnected")),
            "note": str(doc.get("note") or ""),
            "serial": str(doc.get("serial") or ""),
        }

    def _safe_json(self, path: str, *, default: Any) -> Any:
        try:
            value = self._request("GET", path)
            return value if value is not None else default
        except (urllib.error.URLError, OSError, ValueError, json.JSONDecodeError):
            return default

    @staticmethod
    def _map_local(e: dict) -> dict[str, Any]:
        return {
            "id": e.get("entryId", ""),
            "kind": "local",
            "name": e.get("fileName", "") or e.get("entryId", ""),
            "sizeBytes": e.get("sizeBytes"),
            "addedAt": e.get("addedAtUtc"),
            "source": e.get("source", "LocalUpload"),
            "layerCount": None,
            "hasThumbnail": bool(e.get("thumbnailAvailable")),
            "hasPreview": bool(e.get("largePreviewAvailable") or e.get("previewAvailable")),
        }

    @staticmethod
    def _map_cloud(s: dict) -> dict[str, Any]:
        return {
            "id": s.get("sliceId", ""),
            "kind": "cloud",
            "name": s.get("name") or s.get("partName") or s.get("fileName", ""),
            "partName": s.get("partName", ""),
            "version": s.get("version"),
            "fileName": s.get("fileName", ""),
            "sizeBytes": None,
            "addedAt": s.get("createdAtUtc"),
            "source": "Cloud",
            "layerCount": s.get("layerCount"),
            "isCurrent": bool(s.get("isCurrent")),
            "hasThumbnail": bool(s.get("previewAvailable")),
            "hasPreview": bool(s.get("largePreviewAvailable")),
        }

    def library_image(
        self, kind: str, entry_id: str, variant: str, *, if_none_match: str | None = None
    ) -> tuple[int, str | None, bytes, str | None]:
        """Proxy a library/catalog image (96x96 ``thumbnail`` or 512x512 ``preview``).

        Returns ``(status, content_type, body, etag)``. ETag/If-None-Match/304 are
        forwarded so the browser can cache. Errors map to a 4xx with empty body so
        the caller renders a placeholder rather than failing.
        """
        if kind == "local":
            path = f"/api/gcode/library/{quote(entry_id, safe='')}/{variant}"
        elif kind == "cloud":
            path = f"/api/gcode/cloud/catalog/{quote(entry_id, safe='')}/{variant}"
        else:
            return 400, None, b"", None

        headers = {"Accept": "image/png"}
        if if_none_match:
            headers["If-None-Match"] = if_none_match
        req = urllib.request.Request(f"{self.base_url}{path}", method="GET")
        for key, value in headers.items():
            req.add_header(key, value)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:  # noqa: S310
                return resp.status, resp.headers.get("Content-Type"), resp.read(), resp.headers.get("ETag")
        except urllib.error.HTTPError as exc:
            # 304 Not Modified is the expected cache-hit path (empty body).
            return exc.code, exc.headers.get("Content-Type") if exc.headers else None, b"", (
                exc.headers.get("ETag") if exc.headers else None
            )
        except (urllib.error.URLError, OSError) as exc:  # noqa: F841
            return 502, None, b"", None

    # ── Commands IN ─────────────────────────────────────────────────────────
    def command(self, command: str, args: dict[str, Any] | None = None) -> dict[str, Any]:
        """Apply a command against the real machine.

        Read-only mode (default): refuse everything locally — nothing is sent to
        the controller. Only when read-only is explicitly disabled do we forward a
        small, safe subset (emergency-stop, process stop) to ControlService.
        """
        cmd = str(command or "").upper()
        current_state = self.snapshot().get("state")

        if self.readonly:
            return {
                "accepted": False,
                "reason": "Read-only mode: real-machine commands are disabled "
                          "(set AVIS_MACHINE_READONLY=0 to enable the safe command subset).",
                "state": current_state,
            }

        mapping = _FORWARDABLE.get(cmd)
        if mapping is None:
            return {
                "accepted": False,
                "reason": f"command '{command}' is not mapped to ControlService yet",
                "state": current_state,
            }

        method, path = mapping
        try:
            self._request(method, path)
        except (urllib.error.URLError, OSError, ValueError, json.JSONDecodeError) as exc:
            return {"accepted": False, "reason": f"ControlService error: {exc}", "state": current_state}
        return {"accepted": True, "state": self.snapshot().get("state")}
