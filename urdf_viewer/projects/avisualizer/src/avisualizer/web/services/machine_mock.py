"""In-process mock M600 machine.

This is the stand-in for a real machine controller. It lets the whole operator
console run end-to-end — Start/Pause/Stop/E-stop, live progress, faults — with
NO hardware attached, and it defines the exact telemetry/command contract that
the real M600 adapter must implement (see static/sim/machineLink.js).

Replacing this with the real machine means implementing the same two methods —
``snapshot()`` (telemetry OUT) and ``command()`` (commands IN) — against the
real controller, and leaving the HTTP endpoints and the whole JS UI untouched.

Deliberately dependency-free (stdlib only) and thread-safe for the poll+command
access pattern of a single FastAPI worker.
"""
from __future__ import annotations

import threading
import time
from typing import Any


# Operational states — mirror MachineState in static/sim/machineState.js.
IDLE = "idle"
HOMING = "homing"
ARMED = "armed"
PRINTING = "printing"
PAUSED = "paused"
COMPLETED = "completed"
FAULT = "fault"
ESTOP = "estop"

# Nominal, all-clear signal block (matches the PRINTER_NOTIFICATION_SIGNALS
# schema the console consumes). The real adapter fills this from live sensors.
NOMINAL_SIGNALS: dict[str, Any] = {
    "emergencyStopActive": False,
    "machineArmedRequired": True,
    "machineArmedState": False,
    "inertedSystemActive": True,
    "filtrationRequired": False,
    "controllerBoardConnected": True,
    "gasFlowLow": False,
    "gasFlowDecreasing": False,
    "coolantFlowLow": False,
    "coolantTemperature": 24.0,
    "externalSecurityFault": False,
    "closedLoopFault": False,
    "internetConnected": True,
    "processRunning": False,
    # Pre-print interlock signals (consumed by the pre-print self-check).
    "doorsClosed": True,
    "laserHeadReady": True,
}

HOMING_SECONDS = 4.0
DEFAULT_PRINT_SECONDS = 90.0


class MockMachine:
    """A minimal but honest machine state model driven by wall-clock time."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._state = IDLE
        self._armed = False
        self._estopped = False
        self._fault_code: str | None = None
        # Print bookkeeping.
        self._job_id: str | None = None
        self._program: str | None = None
        self._print_seconds = DEFAULT_PRINT_SECONDS
        self._layer_count = 0
        # Monotonic-clock anchors for the currently-running phase.
        self._phase_started = 0.0        # when HOMING/PRINTING began
        self._elapsed_before_pause = 0.0  # print seconds banked before a pause

    # ── Telemetry OUT ──────────────────────────────────────────────────────
    def snapshot(self) -> dict[str, Any]:
        """Full telemetry snapshot — the source of truth for the console."""
        with self._lock:
            self._advance_locked()
            progress = self._progress_locked()
            elapsed = self._elapsed_locked()
            signals = dict(NOMINAL_SIGNALS)
            signals["machineArmedState"] = self._armed
            signals["machineArmedRequired"] = not self._armed
            signals["emergencyStopActive"] = self._estopped
            signals["processRunning"] = self._state == PRINTING

            active_codes: list[dict[str, str]] = []
            if self._estopped:
                # 200.x families are Engine-level; E-stop surfaces as a hard stop.
                active_codes.append({"class": "error", "code": "200.1"})
            if self._fault_code:
                active_codes.append({"class": "error", "code": self._fault_code})

            layer = int(round(progress * self._layer_count)) if self._layer_count else 0
            remaining = max(0.0, self._print_seconds - elapsed) if self._state in (PRINTING, PAUSED) else 0.0

            return {
                "connected": True,
                "state": self._state,
                "progress": round(progress, 4),
                "layer": layer,
                "layerCount": self._layer_count,
                "elapsedSeconds": round(elapsed, 1),
                "remainingSeconds": round(remaining, 1),
                "position": None,  # real adapter: live axis position (mm)
                "jobId": self._job_id,
                "program": self._program,
                "signals": signals,
                "activeCodes": active_codes,
                "ts": int(time.time() * 1000),
            }

    # ── Commands IN ────────────────────────────────────────────────────────
    def command(self, command: str, args: dict[str, Any] | None = None) -> dict[str, Any]:
        """Validate + apply a command. Returns an ACK: {accepted, reason?, state}."""
        args = args or {}
        cmd = str(command or "").upper()
        with self._lock:
            self._advance_locked()

            # E-stop is honored from ANY state, unconditionally, first.
            if cmd == "ESTOP":
                self._estopped = True
                self._armed = False
                self._state = ESTOP
                return self._ack_locked(True)

            if self._estopped and cmd != "CLEAR_FAULT":
                return self._ack_locked(False, "E-stop engaged - release and clear first")

            handler = {
                "ARM": self._cmd_arm,
                "DISARM": self._cmd_disarm,
                "HOME": self._cmd_home,
                "START_PRINT": self._cmd_start_print,
                "PAUSE": self._cmd_pause,
                "RESUME": self._cmd_resume,
                "STOP": self._cmd_stop,
                "CLEAR_FAULT": self._cmd_clear_fault,
                "JOG": self._cmd_jog,
                "FEEDER": self._cmd_feeder,
            }.get(cmd)
            if handler is None:
                return self._ack_locked(False, f"unknown command '{command}'")
            return handler(args)

    # ── Command handlers (call with lock held) ───────────────────────────────
    def _cmd_arm(self, _args: dict) -> dict:
        if self._state not in (IDLE, ARMED):
            return self._ack_locked(False, f"cannot arm from '{self._state}'")
        self._armed = True
        self._state = ARMED
        return self._ack_locked(True)

    def _cmd_disarm(self, _args: dict) -> dict:
        if self._state == PRINTING:
            return self._ack_locked(False, "cannot disarm while printing")
        self._armed = False
        self._state = IDLE
        return self._ack_locked(True)

    def _cmd_home(self, _args: dict) -> dict:
        if self._state not in (IDLE, ARMED):
            return self._ack_locked(False, f"cannot home from '{self._state}'")
        self._state = HOMING
        self._phase_started = time.monotonic()
        return self._ack_locked(True)

    def _cmd_start_print(self, args: dict) -> dict:
        if not self._armed or self._state != ARMED:
            return self._ack_locked(False, "machine must be ARMED before printing")
        self._job_id = args.get("jobId")
        self._program = args.get("program")
        try:
            self._print_seconds = float(args.get("estimatedSeconds") or DEFAULT_PRINT_SECONDS)
        except (TypeError, ValueError):
            self._print_seconds = DEFAULT_PRINT_SECONDS
        self._print_seconds = max(1.0, self._print_seconds)
        self._layer_count = max(1, int(args.get("layerCount") or 0)) or 120
        self._elapsed_before_pause = 0.0
        self._phase_started = time.monotonic()
        self._state = PRINTING
        return self._ack_locked(True)

    def _cmd_pause(self, _args: dict) -> dict:
        if self._state != PRINTING:
            return self._ack_locked(False, f"cannot pause from '{self._state}'")
        self._elapsed_before_pause = self._elapsed_locked()
        self._state = PAUSED
        return self._ack_locked(True)

    def _cmd_resume(self, _args: dict) -> dict:
        if self._state != PAUSED:
            return self._ack_locked(False, f"cannot resume from '{self._state}'")
        self._phase_started = time.monotonic()
        self._state = PRINTING
        return self._ack_locked(True)

    def _cmd_stop(self, _args: dict) -> dict:
        if self._state not in (PRINTING, PAUSED):
            return self._ack_locked(False, f"nothing to stop in '{self._state}'")
        self._reset_print_locked()
        self._state = ARMED if self._armed else IDLE
        return self._ack_locked(True)

    def _cmd_clear_fault(self, _args: dict) -> dict:
        # Clears a recoverable fault or a released E-stop back to a safe idle.
        self._estopped = False
        self._fault_code = None
        self._armed = False
        self._reset_print_locked()
        self._state = IDLE
        return self._ack_locked(True)

    def _cmd_jog(self, _args: dict) -> dict:
        if self._state not in (IDLE, ARMED):
            return self._ack_locked(False, f"cannot jog from '{self._state}'")
        return self._ack_locked(True)

    def _cmd_feeder(self, _args: dict) -> dict:
        if self._state not in (IDLE, ARMED):
            return self._ack_locked(False, f"cannot drive feeder from '{self._state}'")
        return self._ack_locked(True)

    # ── Time-driven state advance ────────────────────────────────────────────
    def _advance_locked(self) -> None:
        now = time.monotonic()
        if self._state == HOMING and now - self._phase_started >= HOMING_SECONDS:
            self._state = ARMED
            self._armed = True
        elif self._state == PRINTING and self._elapsed_locked() >= self._print_seconds:
            self._state = COMPLETED

    def _elapsed_locked(self) -> float:
        if self._state == PRINTING:
            return self._elapsed_before_pause + (time.monotonic() - self._phase_started)
        if self._state in (PAUSED, COMPLETED):
            return self._elapsed_before_pause if self._state == PAUSED else self._print_seconds
        return 0.0

    def _progress_locked(self) -> float:
        if self._state in (PRINTING, PAUSED):
            return min(1.0, self._elapsed_locked() / self._print_seconds) if self._print_seconds else 0.0
        if self._state == COMPLETED:
            return 1.0
        return 0.0

    def _reset_print_locked(self) -> None:
        self._job_id = None
        self._program = None
        self._layer_count = 0
        self._elapsed_before_pause = 0.0

    def _ack_locked(self, accepted: bool, reason: str | None = None) -> dict[str, Any]:
        ack: dict[str, Any] = {"accepted": accepted, "state": self._state}
        if reason:
            ack["reason"] = reason
        return ack


# One machine per process (the console talks to a single M600).
_MACHINE: MockMachine | None = None


def get_machine() -> MockMachine:
    global _MACHINE
    if _MACHINE is None:
        _MACHINE = MockMachine()
    return _MACHINE
