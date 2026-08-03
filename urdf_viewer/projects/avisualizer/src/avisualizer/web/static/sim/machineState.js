// Machine operational-state model.
//
// This is the HARDWARE state of a real M600 — distinct from the print-view
// state machine in simState.js (which only tracks what the 3D scene is showing:
// loading/slicing/playing/…). The machine is the source of truth: telemetry
// drives this model, and the UI is derived from it. Buttons never set these
// states directly — they send commands, the machine ACKs, and the resulting
// telemetry moves the state here.
//
// Framework-free and dependency-free so it can be unit-tested without Three.js
// or a live connection.

export const MachineState = Object.freeze({
  DISCONNECTED: "disconnected", // no link to the machine (default)
  CONNECTING: "connecting",     // link opening / awaiting first telemetry
  IDLE: "idle",                 // connected, powered, not armed, not moving
  HOMING: "homing",             // running a homing/reference routine
  ARMED: "armed",               // interlocks satisfied, ready to print
  PRINTING: "printing",         // deposition in progress
  PAUSED: "paused",             // print suspended, resumable
  COMPLETED: "completed",       // print finished, awaiting operator ack
  FAULT: "fault",               // recoverable machine fault (needs clear)
  ESTOP: "estop",               // emergency stop engaged (safety disengaged)
});

// Legal transitions between operational states. Kept explicit so an out-of-band
// telemetry value surfaces as a logged illegal transition during bring-up
// instead of silently driving the UI into an impossible state.
//
// Three transitions are GLOBAL (allowed from any state) and are appended to
// every row below: DISCONNECTED (link lost), ESTOP (safety), FAULT (machine
// fault). Recovery from those is explicit and narrow.
const GLOBAL_TARGETS = [MachineState.DISCONNECTED, MachineState.ESTOP, MachineState.FAULT];

const BASE_TRANSITIONS = {
  [MachineState.DISCONNECTED]: [MachineState.CONNECTING],
  // On (re)connect we adopt whatever the machine reports — it may already be
  // printing when the console attaches. This is the reconciliation path.
  [MachineState.CONNECTING]: [
    MachineState.IDLE, MachineState.HOMING, MachineState.ARMED,
    MachineState.PRINTING, MachineState.PAUSED, MachineState.COMPLETED,
  ],
  [MachineState.IDLE]: [MachineState.HOMING, MachineState.ARMED],
  [MachineState.HOMING]: [MachineState.IDLE, MachineState.ARMED],
  [MachineState.ARMED]: [MachineState.IDLE, MachineState.PRINTING, MachineState.HOMING],
  [MachineState.PRINTING]: [MachineState.PAUSED, MachineState.COMPLETED, MachineState.ARMED],
  [MachineState.PAUSED]: [MachineState.PRINTING, MachineState.ARMED, MachineState.IDLE],
  [MachineState.COMPLETED]: [MachineState.IDLE, MachineState.ARMED],
  // FAULT clears to IDLE (or straight to DISCONNECTED); it never resumes a print
  // implicitly — the operator must re-arm and restart.
  [MachineState.FAULT]: [MachineState.IDLE],
  // ESTOP must be physically released and acknowledged; software only observes
  // the transition back to IDLE once the machine reports it cleared.
  [MachineState.ESTOP]: [MachineState.IDLE, MachineState.DISCONNECTED],
};

const TRANSITIONS = Object.freeze(
  Object.fromEntries(
    Object.entries(BASE_TRANSITIONS).map(([from, targets]) => {
      const merged = new Set([...targets, ...GLOBAL_TARGETS]);
      merged.delete(from); // self-transition handled separately
      return [from, Object.freeze([...merged])];
    }),
  ),
);

// States in which the machine is actively depositing or moving under program
// control — the console must treat these as "hands off" (no camera resets, no
// model swaps) and keep safety controls prominent.
const ACTIVE_STATES = new Set([
  MachineState.HOMING, MachineState.PRINTING, MachineState.PAUSED,
]);

export function createMachineStateMachine(onChange) {
  let current = MachineState.DISCONNECTED;
  let detail = null;

  function get() {
    return current;
  }

  function getDetail() {
    return detail;
  }

  function canTransition(next) {
    if (next === current) return true;
    return (TRANSITIONS[current] || []).includes(next);
  }

  function set(next, nextDetail = null) {
    if (!Object.values(MachineState).includes(next)) {
      console.warn(`[machine] unknown state '${next}'`);
      return false;
    }
    if (!canTransition(next)) {
      console.warn(`[machine] illegal transition ${current} -> ${next}`);
      return false;
    }
    const previous = current;
    const previousDetail = detail;
    current = next;
    detail = nextDetail;
    // Fire on a genuine state change OR a detail change while in the same state
    // (e.g. progress ticking up during PRINTING) so subscribers stay in sync.
    if ((next !== previous || nextDetail !== previousDetail) && typeof onChange === "function") {
      onChange(current, previous, detail);
    }
    return true;
  }

  function isActive() {
    return ACTIVE_STATES.has(current);
  }

  // True when the machine is in a state that must block a new print start.
  function isPrintBlockingState() {
    return (
      current === MachineState.DISCONNECTED ||
      current === MachineState.CONNECTING ||
      current === MachineState.FAULT ||
      current === MachineState.ESTOP ||
      current === MachineState.HOMING ||
      current === MachineState.PRINTING ||
      current === MachineState.PAUSED
    );
  }

  return { MachineState, get, getDetail, set, canTransition, isActive, isPrintBlockingState };
}
