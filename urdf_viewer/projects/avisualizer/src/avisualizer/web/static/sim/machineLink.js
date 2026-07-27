// Optional live-machine transport for the M600 viewer.
//
// The machine link is OPTIONAL and OFF by default: the scene runs against the
// local print simulation unless `window.AVIS_MACHINE = { enabled: true }` is
// injected or `?machine=1` is appended to the URL (the gate lives in
// machineLinkConfig() in urdf_viewer.js). Until a connection is actually
// established, isConnected() stays false and every command rejects, so the
// local simulation remains the authority and callers fall back gracefully.
//
// SAFETY: permissions.js only gates the UI (it disables buttons); it is NOT a
// security boundary. Do NOT point `base` at a transport that can move the real
// machine until the controller/firmware enforces role authorization
// server-side for motion-bearing commands (jog, start/stop/pause, e-stop).
//
// Controller contract this client expects (to be implemented by the machine
// backend when it exists):
//   GET  {base}/health                 -> 200 when the controller is reachable
//   GET  {base}/telemetry              -> optional JSON snapshot
//                                         { state: "printing"|"paused"|"completed", progress: 0..1 }
//   POST {base}/api/machine/<command>  -> JSON; commands: arm, start-print,
//                                         stop, pause, resume, emergency-stop

const HEALTH_POLL_MS = 5000;

export function createMachineLink(config = {}) {
  const base = String(config.base || "").replace(/\/+$/, "");
  const onStateChange = typeof config.onStateChange === "function" ? config.onStateChange : () => {};
  const onTelemetry = typeof config.onTelemetry === "function" ? config.onTelemetry : () => {};

  let state = "disconnected";
  let pollTimer = null;

  function setState(next) {
    if (next === state) {
      return;
    }
    state = next;
    try {
      onStateChange(next);
    } catch (_e) {
      // An observer error must never break the link itself.
    }
  }

  async function pollTelemetry() {
    try {
      const res = await fetch(`${base}/telemetry`, { cache: "no-store" });
      if (!res.ok) {
        return; // telemetry endpoint is optional on the controller
      }
      const snap = await res.json();
      if (snap && typeof snap === "object") {
        onTelemetry(snap);
      }
    } catch (_e) {
      // Telemetry is best-effort; connection state is tracked via /health.
    }
  }

  async function checkHealth() {
    try {
      const res = await fetch(`${base}/health`, { cache: "no-store" });
      setState(res.ok ? "connected" : "disconnected");
      if (res.ok) {
        await pollTelemetry();
      }
    } catch (_e) {
      setState("disconnected");
    }
  }

  function start() {
    if (!base) {
      // No transport configured: stay dormant so the simulation drives.
      setState("disconnected");
      return;
    }
    setState("connecting");
    checkHealth();
    if (pollTimer === null) {
      pollTimer = setInterval(checkHealth, HEALTH_POLL_MS);
    }
  }

  function dispose() {
    if (pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    setState("disconnected");
  }

  function isConnected() {
    return state === "connected";
  }

  // Every command returns a Promise: callers either await inside try/catch or
  // chain .catch() and fall back to the local simulation on rejection.
  async function command(name, payload) {
    if (!isConnected()) {
      throw new Error("machine link not connected");
    }
    const res = await fetch(`${base}/api/machine/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`machine command "${name}" failed: HTTP ${res.status}`);
    }
    try {
      return await res.json();
    } catch (_e) {
      return null; // empty/non-JSON body is a valid success
    }
  }

  return {
    start,
    dispose,
    isConnected,
    arm: () => command("arm"),
    startPrint: (job) => command("start-print", job),
    stop: () => command("stop"),
    pause: () => command("pause"),
    resume: () => command("resume"),
    emergencyStop: () => command("emergency-stop"),
  };
}
