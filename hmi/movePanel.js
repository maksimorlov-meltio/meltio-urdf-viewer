// Move panel: X/Y/Z jog, jog step, homing and the live position readout.
// Extracted verbatim from urdf_viewer.js (step-5 phase B3d). DOM + pure logic,
// no THREE: the joints are reached through injected accessors, so this module
// never touches the scene graph.
//
// This domain is 109 lines against a 13k-line host — extracting it is not about
// the line count. It is motion-bearing code (it commands the linear axes and
// homing) that had no test of any kind because it could not be imported. The
// jog-accumulation rule in particular — "N taps always equal N steps, even
// mid-glide" — is the sort of arithmetic that silently drifts.
//
// Mirrors the WPF host's jog/home command surface.

// Defense in depth: re-check the capability inside the handler, never trusting
// the DOM's disabled state alone. A scripted/assistive-tech activation that
// slips past the visual gate must still be refused here.
//
// Exported on its own (not through the factory) because the palpador sweep
// button in the host guards on it too, and it needs no instance state.
export function canOperateMotion() {
  return !(window.MeltioPermissions && typeof window.MeltioPermissions.can === "function"
    && !window.MeltioPermissions.can("machine.motion"));
}

// Smooth jog: glide the axis to its next step (constant velocity feel) instead
// of snapping it there.
export const JOG_SPEED_MM_S = 45;          // jog velocity used to derive the glide time
export const JOG_MIN_DURATION_SEC = 0.12;  // floor so a tiny step still eases, never snaps
export const DEFAULT_JOG_STEP_MM = 10;

export function createMovePanelUi({
  // URDF joint names: { x, y, z, probe }. Injected rather than imported so the
  // module carries no knowledge of a particular robot.
  joints,
  getJointStateByName,
  jointControlTransitions,
  moveJointToValue,
  isPrintActivelyRunning,
  showPrintNotice,
  setMotionStatus,
  markUserActivity,
  homeDurationSec,
}) {
  // Jog step is in mm; linear joint values are metres, so mm/1000.
  let moveStepMm = DEFAULT_JOG_STEP_MM;
  const axisJoint = { x: joints.x, y: joints.y, z: joints.z };
  // Last COMMANDED target per axis, so repeated presses accumulate from there
  // rather than from the mid-glide value.
  const jogTargetM = { x: null, y: null, z: null };
  const readoutEls = {
    x: document.getElementById("movePosX"),
    y: document.getElementById("movePosY"),
    z: document.getElementById("movePosZ"),
    wd: document.getElementById("movePosWd"),
  };
  // Polled from animate() (the joints move continuously during glides/prints),
  // but each readout cell is only written when its formatted text changes.
  const lastReadoutText = { x: null, y: null, z: null, wd: null };

  function updateReadout() {
    const fmt = (name) => {
      const state = getJointStateByName(name);
      return state ? (state.value * 1000).toFixed(1) : "—";
    };
    const apply = (key, name) => {
      const el = readoutEls[key];
      if (!el) return;
      const text = fmt(name);
      if (text !== lastReadoutText[key]) {
        lastReadoutText[key] = text;
        el.textContent = text;
      }
    };
    apply("x", joints.x);
    apply("y", joints.y);
    apply("z", joints.z);
    apply("wd", joints.probe);
  }

  // The jog D-pad drives the same joints the print-sim pins while a print is
  // underway — jogging mid-print would corrupt the running toolpath. The Top
  // Door sub-control in the same panel stays usable; only axis motion is
  // blocked.
  function motionRefused() {
    if (!canOperateMotion()) return true;
    if (isPrintActivelyRunning()) {
      showPrintNotice("Stop the print to jog the axes.");
      return true;
    }
    return false;
  }

  function jogAxis(axis, dir) {
    if (motionRefused()) return;
    const name = axisJoint[axis];
    const state = name ? getJointStateByName(name) : null;
    if (!state) return;
    const deltaInternal = dir * (moveStepMm / 1000);
    // While a glide is already running for this axis, keep stacking onto the
    // last commanded target; otherwise start from where the axis actually is.
    const transitionKey = `joint-preset:${state.name}`;
    const base = (jointControlTransitions.has(transitionKey) && jogTargetM[axis] != null)
      ? jogTargetM[axis] : state.value;
    const next = Math.max(state.lower, Math.min(state.upper, base + deltaInternal));
    jogTargetM[axis] = next;
    // Constant-velocity feel: glide time scales with the distance actually travelled.
    const distanceMm = Math.abs(next - state.value) * 1000;
    const duration = Math.max(distanceMm / JOG_SPEED_MM_S, JOG_MIN_DURATION_SEC);
    moveJointToValue(state, next, duration); // live readout + render handled by animate()
    markUserActivity();
  }

  function homeAxes(which) {
    if (motionRefused()) return;
    const axes = which === "z" ? ["z"] : ["x", "y"];
    let moved = false;
    for (const axis of axes) {
      const name = axisJoint[axis];
      const state = name ? getJointStateByName(name) : null;
      if (!state) continue;
      const target = Math.max(state.lower, Math.min(state.upper, 0)); // home = origin (readout 0.0)
      jogTargetM[axis] = target;
      moveJointToValue(state, target, homeDurationSec);
      moved = true;
    }
    if (moved) setMotionStatus(which === "z" ? "Homing Z" : "Homing XY");
    markUserActivity();
  }

  function setStepMm(value) {
    moveStepMm = Number(value) || DEFAULT_JOG_STEP_MM;
  }

  // --- Listener wiring (moved with the domain) -------------------------------
  document.querySelectorAll("[data-move-axis]").forEach((btn) => {
    btn.addEventListener("click", () => {
      jogAxis(btn.getAttribute("data-move-axis"), Number(btn.getAttribute("data-move-dir")) || 1);
    });
  });
  document.querySelectorAll("[data-move-home]").forEach((btn) => {
    btn.addEventListener("click", () => homeAxes(btn.getAttribute("data-move-home")));
  });
  document.querySelectorAll("[data-move-step]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setStepMm(btn.getAttribute("data-move-step"));
      document.querySelectorAll("[data-move-step]")
        .forEach((other) => other.classList.toggle("is-active", other === btn));
      markUserActivity();
    });
  });

  updateReadout();

  return {
    updateReadout,
    jogAxis,
    homeAxes,
    setStepMm,
    getStepMm: () => moveStepMm,
  };
}
