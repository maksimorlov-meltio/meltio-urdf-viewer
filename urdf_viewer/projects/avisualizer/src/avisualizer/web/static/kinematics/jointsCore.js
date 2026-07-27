// Robot kinematics core (extracted from urdf_viewer.js). Owns the joint-motion
// primitives shared across the app: the joint-state lookups, value set/display,
// the per-frame transition Map + tweening, and the motion presets (maintenance /
// print position / palpador). The joint-state store stays god-file-owned (rebuilt
// on every URDF load) and is read through ctx.getJointStates(); helpers, DOM and
// tuning constants also arrive via ctx. createJointsCore(ctx) -> the motion API
// that cloudStl3D, print-sim, the slicer bridge and the Controls panel consume.
import * as THREE from "three";

export function createJointsCore(ctx) {
  const {
    getJointStates,
    clamp,
    approachValue,
    millimetersToMeters,
    setMotionStatus,
    palpadorSweepButtonEl,
    MIN_CONTROL_DURATION_SEC,
    MOTION_PRESET_DURATION_SEC,
    Z_AXIS_JOINT,
    EJE_X_JOINT,
    EJE_Y_JOINT,
    PRINT_POSITION_Z_MM,
    PRINT_POSITION_X_MM,
    PRINT_POSITION_Y_MM,
    PALPADOR_PRO_JOINT,
    PALPADOR_SWEEP_DURATION_SEC,
    PALPADOR_TOGGLE_DURATION_SEC,
  } = ctx;

  const jointControlTransitions = new Map();
  let palpadorSweepTimeoutId = null;

  // Convert an internal joint value (meters / radians) to its display unit (mm / deg).
  function formatJointDisplay(state, value) {
    return state.kind === "linear" ? value * 1000 : THREE.MathUtils.radToDeg(value);
  }

  // Convert a typed display value (mm / deg) back to the internal joint value.
  function jointDisplayToInternal(state, displayValue) {
    return state.kind === "linear" ? displayValue / 1000 : THREE.MathUtils.degToRad(displayValue);
  }

  // Update the joint's value readout, whether it is a static label or an editable
  // number input. Skips the input while the operator is typing into it.
  function writeJointValueDisplay(state, value) {
    if (!state.valueEl) {
      return;
    }
    const display = formatJointDisplay(state, value).toFixed(1);
    if (state.valueEl.tagName === "INPUT") {
      if (document.activeElement !== state.valueEl) {
        state.valueEl.value = display;
      }
    } else {
      const unit = state.kind === "linear" ? "mm" : "deg";
      state.valueEl.textContent = `${display} ${unit}`;
    }
  }

  function setJointValue(state, value, options = {}) {
    const syncSlider = options.syncSlider !== false;
    state.value = value;

    if (state.kind === "linear") {
      state.motionGroup.position.set(0, 0, 0);
      state.motionGroup.position.addScaledVector(state.axis, value);
    } else {
      state.motionGroup.setRotationFromAxisAngle(state.axis, value);
    }

    writeJointValueDisplay(state, value);

    if (syncSlider && state.sliderEl && document.activeElement !== state.sliderEl) {
      state.sliderEl.value = String(value);
    }
  }

  function wrapJointValue(state, value) {
    if (!Number.isFinite(state.lower) || !Number.isFinite(state.upper) || state.upper <= state.lower) {
      return value;
    }

    const span = state.upper - state.lower;
    let wrapped = value;
    while (wrapped > state.upper) {
      wrapped -= span;
    }
    while (wrapped < state.lower) {
      wrapped += span;
    }
    return clamp(wrapped, state.lower, state.upper);
  }

  function getJointStateByName(name) {
    return getJointStates().find((state) => state.name === name) || null;
  }

  function getLinearJointStateByName(name) {
    const state = getJointStateByName(name);
    if (!state || state.kind !== "linear") {
      return null;
    }
    return state;
  }

  function getLinearJointWorldAxis(state) {
    if (!state || state.kind !== "linear" || !state.motionGroup) {
      return null;
    }

    state.motionGroup.updateWorldMatrix(true, true);
    const axisWorld = state.axis.clone().transformDirection(state.motionGroup.matrixWorld);
    if (axisWorld.lengthSq() <= 1e-10) {
      return null;
    }

    return axisWorld.normalize();
  }

  function clearPalpadorSweepTimeout() {
    if (palpadorSweepTimeoutId !== null) {
      window.clearTimeout(palpadorSweepTimeoutId);
      palpadorSweepTimeoutId = null;
    }
  }

  function startJointControlTransition(key, stepFn) {
    jointControlTransitions.set(key, stepFn);
  }

  function clearJointControlTransitions() {
    jointControlTransitions.clear();
  }

  function updateJointControlTransitions(deltaSeconds) {
    for (const [key, stepFn] of Array.from(jointControlTransitions.entries())) {
      const done = stepFn(deltaSeconds);
      if (done) {
        jointControlTransitions.delete(key);
      }
    }
  }

  function computeMotionSpeedForDuration(distanceRadians, durationSeconds) {
    const safeDuration = Math.max(durationSeconds, MIN_CONTROL_DURATION_SEC);
    return Math.max(distanceRadians, 0) / safeDuration;
  }

  function moveJointToValue(state, targetValue, durationSeconds = MOTION_PRESET_DURATION_SEC) {
    if (!state) {
      return;
    }

    const clampedTarget = clamp(targetValue, state.lower, state.upper);
    const distance = Math.abs(clampedTarget - state.value);
    if (distance <= 1e-6) {
      setJointValue(state, clampedTarget);
      return;
    }

    const speed = computeMotionSpeedForDuration(distance, durationSeconds);
    const transitionKey = `joint-preset:${state.name}`;
    startJointControlTransition(transitionKey, (deltaSeconds) => {
      const next = approachValue(state.value, clampedTarget, speed * deltaSeconds);
      setJointValue(state, next);
      return Math.abs(next - clampedTarget) <= 1e-4;
    });
  }

  function runMotionPreset(targetsByJointName, label) {
    const missingLinearJoints = [];
    for (const [jointName, targetMm] of Object.entries(targetsByJointName)) {
      const state = getJointStateByName(jointName);
      if (!state || state.kind !== "linear") {
        missingLinearJoints.push(jointName);
        continue;
      }

      moveJointToValue(state, millimetersToMeters(targetMm));
    }

    if (missingLinearJoints.length) {
      setMotionStatus(`${label} unavailable (${missingLinearJoints.join(", ")})`);
      return false;
    }

    setMotionStatus(`${label} running`);
    return true;
  }

  function runMaintenancePositionAction() {
    return runMotionPreset(
      {
        [Z_AXIS_JOINT]: 100,
        [EJE_X_JOINT]: 0,
        [EJE_Y_JOINT]: 0,
      },
      "Maintenance position",
    );
  }

  function runPrintPositionAction() {
    return runMotionPreset(
      {
        [Z_AXIS_JOINT]: PRINT_POSITION_Z_MM,
        [EJE_X_JOINT]: PRINT_POSITION_X_MM,
        [EJE_Y_JOINT]: PRINT_POSITION_Y_MM,
      },
      "Print position",
    );
  }

  function runPalpadorSweepAction() {
    const state = getJointStateByName(PALPADOR_PRO_JOINT);
    if (!state || state.kind !== "linear") {
      setMotionStatus("Palpador sweep unavailable");
      return false;
    }

    clearPalpadorSweepTimeout();
    const lower = Math.min(state.lower, state.upper);
    const upper = Math.max(state.lower, state.upper);
    moveJointToValue(state, upper, PALPADOR_SWEEP_DURATION_SEC);
    setMotionStatus("Palpador sweep forward");

    const forwardDurationMs = Math.max(PALPADOR_SWEEP_DURATION_SEC * 1000, 200);
    palpadorSweepTimeoutId = window.setTimeout(() => {
      moveJointToValue(state, lower, PALPADOR_SWEEP_DURATION_SEC);
      setMotionStatus("Palpador sweep return");
      palpadorSweepTimeoutId = null;
    }, forwardDurationMs + 120);

    return true;
  }

  // Palpador as a POSITION TOGGLE (not a one-shot sweep): deployed = glide to the
  // RIGHT limit, home = glide back to the LEFT limit. Slow + smooth via the shared
  // joint-motion tween. Returns the resulting deployed state (or null if the joint
  // is unavailable) so the caller can sync the button.
  function setPalpadorDeployed(deployed) {
    const state = getJointStateByName(PALPADOR_PRO_JOINT);
    if (!state || state.kind !== "linear") {
      setMotionStatus("Palpador unavailable");
      return null;
    }
    clearPalpadorSweepTimeout(); // cancel any legacy auto-return sweep still pending
    const right = Math.max(state.lower, state.upper); // deployed (right)
    const left = Math.min(state.lower, state.upper);  // home (left)
    moveJointToValue(state, deployed ? right : left, PALPADOR_TOGGLE_DURATION_SEC);
    setMotionStatus(deployed ? "Palpador → right (deployed)" : "Palpador → left (home)");
    if (palpadorSweepButtonEl) palpadorSweepButtonEl.setAttribute("aria-pressed", deployed ? "true" : "false");
    return deployed;
  }

  return {
    formatJointDisplay,
    jointDisplayToInternal,
    writeJointValueDisplay,
    setJointValue,
    wrapJointValue,
    getJointStateByName,
    getLinearJointStateByName,
    getLinearJointWorldAxis,
    clearPalpadorSweepTimeout,
    startJointControlTransition,
    clearJointControlTransitions,
    updateJointControlTransitions,
    computeMotionSpeedForDuration,
    moveJointToValue,
    runMaintenancePositionAction,
    runPrintPositionAction,
    runPalpadorSweepAction,
    setPalpadorDeployed,
    jointControlTransitions,
  };
}
