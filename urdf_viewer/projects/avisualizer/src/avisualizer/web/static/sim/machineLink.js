// Machine transport layer — the single seam between the console and a real M600.
//
// Everything machine-facing goes through here: it owns the connection, streams
// telemetry IN, and sends commands OUT. Today it talks to the in-process mock
// machine (web/services/machine_mock.py) over plain HTTP (poll telemetry + POST
// commands) so the whole console runs end-to-end with NO hardware and NO extra
// server deps. Swapping in the real machine means pointing this at the real
// endpoint (or upgrading the transport to a WebSocket) WITHOUT touching the UI:
// the contract below is what the M600 adapter must satisfy.
//
// ── Protocol contract ──────────────────────────────────────────────────────
// GET  {base}/api/machine/state  → telemetry snapshot (source of truth):
//   {
//     connected: true,
//     state: "idle|homing|armed|printing|paused|completed|fault|estop",
//     progress: 0..1, layer: int, layerCount: int,
//     elapsedSeconds: number, remainingSeconds: number,
//     position: { x, y, z } | null,        // mm, machine frame
//     jobId: string|null, program: string|null,
//     signals: { ...PRINTER_NOTIFICATION_SIGNALS schema... },
//     activeCodes: [ { class: "error"|"warning", code: "106.1.3" }, ... ],
//     ts: epoch-ms
//   }
// POST {base}/api/machine/command  body: { id, command, args, ts }
//   → { id, accepted: bool, reason?: string, state: <telemetry.state> }
//
// Commands (args in parens):
//   ARM · DISARM · HOME · START_PRINT({jobId, program, estimatedSeconds})
//   PAUSE · RESUME · STOP · CLEAR_FAULT
//   ESTOP  — highest priority, must be honored out-of-band even mid-command
//   JOG({axis:"x|y|z", direction:+1|-1, distanceMm})
//   FEEDER({action:"side|vertical|stop", side:"left|right"})
//
// SAFETY: the console is an operator aid, NOT a safety controller. A software
// ESTOP here is a request; the machine's hardware E-stop and interlocks are the
// real safety layer and must remain independent of this code.

import { createMachineStateMachine, MachineState } from "./machineState.js";

const DEFAULT_POLL_MS = 500;      // telemetry cadence (2 Hz)
const COMMAND_TIMEOUT_MS = 8000;  // give up on an un-ACKed command
const STALE_TELEMETRY_MS = 3000;  // no snapshot within this → treat as stale

// Map a telemetry state string to a MachineState enum value (defensive: unknown
// strings do not throw, they log and leave the current state untouched).
const STATE_BY_WIRE = Object.fromEntries(
  Object.values(MachineState).map((s) => [s, s]),
);

export function createMachineLink(options = {}) {
  const base = String(options.base || "").replace(/\/$/, "");
  const pollMs = Number(options.pollMs) || DEFAULT_POLL_MS;
  const onTelemetry = typeof options.onTelemetry === "function" ? options.onTelemetry : null;
  const onStateChange = typeof options.onStateChange === "function" ? options.onStateChange : null;

  const machine = createMachineStateMachine((next, prev, detail) => {
    if (onStateChange) onStateChange(next, prev, detail);
  });

  let enabled = false;
  let pollTimer = null;
  let commandSeq = 0;
  let lastSnapshotAt = 0;
  let lastTelemetry = null;
  // Currently-active fault codes, keyed "class:code", so we can diff each
  // snapshot and raise newly-active / clear newly-gone codes exactly once.
  const raisedCodes = new Set();

  // ── Telemetry ingestion ──────────────────────────────────────────────────
  function ingest(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return;
    lastSnapshotAt = Date.now();
    lastTelemetry = snapshot;

    // 1) Drive the notification/signal bridge. The host reads
    // window.PRINTER_NOTIFICATION_SIGNALS as an override of its mock signals.
    if (snapshot.signals && typeof snapshot.signals === "object") {
      window.PRINTER_NOTIFICATION_SIGNALS = snapshot.signals;
    }

    // 2) Reconcile live fault codes against the catalog layer (error_codes.js).
    reconcileCodes(Array.isArray(snapshot.activeCodes) ? snapshot.activeCodes : []);

    // 3) Move the operational state machine to what the machine reports.
    const wire = STATE_BY_WIRE[snapshot.state];
    if (wire) {
      machine.set(wire, {
        progress: Number(snapshot.progress) || 0,
        layer: snapshot.layer ?? null,
        layerCount: snapshot.layerCount ?? null,
        elapsedSeconds: snapshot.elapsedSeconds ?? null,
        remainingSeconds: snapshot.remainingSeconds ?? null,
        jobId: snapshot.jobId ?? null,
      });
    } else if (snapshot.state) {
      console.warn(`[machineLink] unknown telemetry state '${snapshot.state}'`);
    }

    if (onTelemetry) onTelemetry(snapshot);
  }

  function reconcileCodes(active) {
    const errs = window.MeltioErrors;
    if (!errs || typeof errs.raise !== "function") return;
    const nextKeys = new Set();
    for (const item of active) {
      if (!item || !item.code) continue;
      const cls = item.class === "error" ? "error" : "warning";
      const key = `${cls}:${item.code}`;
      nextKeys.add(key);
      if (!raisedCodes.has(key)) {
        errs.raise(cls, item.code); // enriches + surfaces + halts on safety error
        raisedCodes.add(key);
      }
    }
    // Clear codes that are no longer active.
    for (const key of [...raisedCodes]) {
      if (!nextKeys.has(key)) {
        const [cls, code] = key.split(":");
        if (typeof errs.clear === "function") errs.clear(cls, code);
        raisedCodes.delete(key);
      }
    }
  }

  // ── Polling loop ───────────────────────────────────────────────────────
  async function pollOnce() {
    try {
      const res = await fetch(`${base}/api/machine/state`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const snapshot = await res.json();
      if (machine.get() === MachineState.DISCONNECTED) {
        // First contact after a disconnect: enter CONNECTING so the reconcile
        // path (adopt-reported-state) is taken rather than an illegal jump.
        machine.set(MachineState.CONNECTING);
      }
      ingest(snapshot);
    } catch (_e) {
      // Link down or telemetry stale → drop to DISCONNECTED and stop trusting
      // the last-known state (never keep animating a print we can't see).
      if (Date.now() - lastSnapshotAt > STALE_TELEMETRY_MS) {
        window.PRINTER_NOTIFICATION_SIGNALS = { ...(window.PRINTER_NOTIFICATION_SIGNALS || {}), internetConnected: false };
        machine.set(MachineState.DISCONNECTED);
      }
    }
  }

  function loop() {
    if (!enabled) return;
    pollOnce().finally(() => {
      if (enabled) pollTimer = window.setTimeout(loop, pollMs);
    });
  }

  // ── Commands ─────────────────────────────────────────────────────────────
  // Send a command and wait for the machine's ACK. Rejects on timeout or a
  // rejected ACK. Callers MUST handle rejection (surface it; never assume the
  // machine acted). There is deliberately no auto-retry — silently re-sending a
  // START or STOP to a metal machine is unsafe.
  async function sendCommand(command, args = {}) {
    if (!enabled) {
      return Promise.reject(new Error("machine link disabled"));
    }
    const id = `cmd-${++commandSeq}`;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), COMMAND_TIMEOUT_MS);
    try {
      const res = await fetch(`${base}/api/machine/command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, command, args, ts: undefined }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`command HTTP ${res.status}`);
      const ack = await res.json();
      if (!ack || ack.accepted !== true) {
        throw new Error(ack && ack.reason ? ack.reason : "command rejected");
      }
      // Fold the ACK's authoritative state in immediately so the UI reacts
      // without waiting for the next poll.
      if (ack.state && STATE_BY_WIRE[ack.state]) {
        machine.set(STATE_BY_WIRE[ack.state]);
      }
      return ack;
    } finally {
      window.clearTimeout(timer);
    }
  }

  // Convenience wrappers (self-documenting; keep call sites readable).
  const commands = {
    arm: () => sendCommand("ARM"),
    disarm: () => sendCommand("DISARM"),
    home: () => sendCommand("HOME"),
    startPrint: (job) => sendCommand("START_PRINT", job || {}),
    pause: () => sendCommand("PAUSE"),
    resume: () => sendCommand("RESUME"),
    stop: () => sendCommand("STOP"),
    clearFault: () => sendCommand("CLEAR_FAULT"),
    emergencyStop: () => sendCommand("ESTOP"),
    jog: (axis, direction, distanceMm) => sendCommand("JOG", { axis, direction, distanceMm }),
    feeder: (action, side) => sendCommand("FEEDER", { action, side }),
  };

  // ── Lifecycle ──────────────────────────────────────────────────────────
  function start() {
    if (enabled) return;
    enabled = true;
    machine.set(MachineState.CONNECTING);
    loop();
  }

  function stop() {
    enabled = false;
    if (pollTimer) window.clearTimeout(pollTimer);
    pollTimer = null;
    machine.set(MachineState.DISCONNECTED);
  }

  function isEnabled() {
    return enabled;
  }

  function isConnected() {
    return enabled
      && machine.get() !== MachineState.DISCONNECTED
      && machine.get() !== MachineState.CONNECTING
      && Date.now() - lastSnapshotAt <= STALE_TELEMETRY_MS;
  }

  function getState() {
    return machine.get();
  }

  function getTelemetry() {
    return lastTelemetry;
  }

  return {
    MachineState,
    start, stop,
    isEnabled, isConnected,
    getState, getTelemetry,
    sendCommand,
    ...commands,
    _machine: machine, // exposed for tests
  };
}
