// Optional live-machine transport for the M600 viewer.
//
// The machine link is OPTIONAL and OFF by default: the scene runs against the
// local print simulation unless `window.AVIS_MACHINE = { enabled: true }` is
// injected or `?machine=1` is appended to the URL (the gate lives in
// machineLinkConfig() in urdf_viewer.js). Until a connection is actually
// established, isConnected() stays false and every command rejects, so the
// local simulation remains the authority and callers fall back gracefully.
//
// SAFETY (security): permissions.js only gates the UI (it disables buttons); it
// is NOT a security boundary. The REAL authorization for motion MUST be enforced
// server-side by the controller/firmware (role check on every motion-bearing
// command) — a local process can POST to {base}/api/machine/* directly, bypassing
// this client entirely. PRODUCTION PREREQUISITE (blocking): do NOT point `base`
// at a transport that can move the real machine until that server-side role
// authorization exists. This file cannot provide that guarantee.
//
// SAFETY (operational, in-repo): as accident-prevention distinct from the above,
// motion-INITIATING commands (arm, start-print, resume) require an explicit
// `allowMotion: true` acknowledgment in the config. Merely enabling the link
// (e.g. `?machine=1` to watch telemetry) must NOT be able to start motion. This
// is NOT a security control — it only stops the HMI itself from accidentally
// commanding motion. De-escalating commands (stop, pause, emergency-stop) are
// ALWAYS permitted (fail-safe: never block a stop).
//
// Controller contract this client expects (to be implemented by the machine
// backend when it exists):
//   GET  {base}/health                 -> 200 when the controller is reachable
//   GET  {base}/telemetry              -> optional JSON snapshot
//                                         { state: "printing"|"paused"|"completed", progress: 0..1 }
//   POST {base}/api/machine/<command>  -> JSON; commands: arm, start-print,
//                                         stop, pause, resume, emergency-stop

const HEALTH_POLL_MS = 5000;

// Commands that START or RESUME machine motion. Gated behind allowMotion.
// Stop/pause/emergency-stop are intentionally excluded so a halt is never blocked.
const MOTION_INITIATING_COMMANDS = new Set(["arm", "start-print", "resume"]);

export function createMachineLink(config = {}) {
  const base = String(config.base || "").replace(/\/+$/, "");
  const allowMotion = config.allowMotion === true;
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
    if (MOTION_INITIATING_COMMANDS.has(name) && !allowMotion) {
      // Accident-prevention gate (see the SAFETY note at the top). This is not a
      // security boundary: the controller/firmware must still authorize motion
      // server-side. It only stops the HMI from initiating motion unless the
      // integrator explicitly acknowledged it via AVIS_MACHINE.allowMotion.
      throw new Error(
        `motion command "${name}" blocked: set AVIS_MACHINE.allowMotion = true `
          + "only after the controller enforces server-side role authorization",
      );
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
