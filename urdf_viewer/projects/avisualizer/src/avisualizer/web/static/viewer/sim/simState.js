// Print-simulation state machine.
//
// Isolated, framework-free. The host (urdf_viewer.js) never mutates the
// simulation directly; it drives the controller in printSimulation.js which in
// turn owns one of these. Kept tiny and dependency-free so it can be unit tested
// or reused without Three.js.

export const SimState = Object.freeze({
  IDLE: "idle",
  LOADING_MODEL: "loadingModel",
  SLICING: "slicing",
  READY: "ready",
  PLAYING: "playing",
  PAUSED: "paused",
  COMPLETED: "completed",
  ERROR: "error",
});

// Allowed transitions. Anything not listed is rejected (and logged) so illegal
// jumps surface during development instead of silently corrupting UI state.
const TRANSITIONS = Object.freeze({
  [SimState.IDLE]: [SimState.LOADING_MODEL, SimState.ERROR],
  [SimState.LOADING_MODEL]: [SimState.SLICING, SimState.READY, SimState.IDLE, SimState.ERROR],
  [SimState.SLICING]: [SimState.READY, SimState.IDLE, SimState.ERROR],
  [SimState.READY]: [SimState.PLAYING, SimState.LOADING_MODEL, SimState.IDLE, SimState.ERROR],
  [SimState.PLAYING]: [SimState.PAUSED, SimState.COMPLETED, SimState.READY, SimState.IDLE, SimState.ERROR],
  [SimState.PAUSED]: [SimState.PLAYING, SimState.READY, SimState.IDLE, SimState.ERROR],
  [SimState.COMPLETED]: [SimState.PLAYING, SimState.READY, SimState.IDLE, SimState.LOADING_MODEL, SimState.ERROR],
  [SimState.ERROR]: [SimState.IDLE, SimState.LOADING_MODEL],
});

export function createSimStateMachine(onChange) {
  let current = SimState.IDLE;
  let detail = null;

  function get() {
    return current;
  }

  function getDetail() {
    return detail;
  }

  function canTransition(next) {
    if (next === current) {
      return true;
    }
    const allowed = TRANSITIONS[current] || [];
    return allowed.includes(next);
  }

  function set(next, nextDetail = null) {
    if (!Object.values(SimState).includes(next)) {
      console.warn(`[printSim] unknown state '${next}'`);
      return false;
    }
    if (!canTransition(next)) {
      console.warn(`[printSim] illegal transition ${current} -> ${next}`);
      return false;
    }
    const previous = current;
    current = next;
    detail = nextDetail;
    if (typeof onChange === "function") {
      onChange(current, previous, detail);
    }
    return true;
  }

  // States in which the simulation "owns" the view: the host must not reset or
  // jump the camera while any of these are active.
  function isActive() {
    return (
      current === SimState.READY ||
      current === SimState.PLAYING ||
      current === SimState.PAUSED ||
      current === SimState.SLICING ||
      current === SimState.LOADING_MODEL ||
      current === SimState.COMPLETED
    );
  }

  return { SimState, get, getDetail, set, canTransition, isActive };
}
