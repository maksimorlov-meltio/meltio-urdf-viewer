// The move panel (hmi/movePanel.js): jog, homing, step and readout.
//
// This is the first test this code has ever had. It commands the machine's
// linear axes and it lived inside the 13k-line host, where it could not be
// imported. The rules worth pinning are the ones a refactor would silently
// break: the mm->m conversion, the "N taps == N steps mid-glide" accumulation,
// clamping to the joint limits, and both refusal paths (no permission, print
// running) — a jog that slips through during a print corrupts the toolpath.
import test from "node:test";
import assert from "node:assert/strict";

import { mountUrdfDom, el } from "./support/domFixture.mjs";

mountUrdfDom();
const { createMovePanelUi, canOperateMotion, JOG_SPEED_MM_S, JOG_MIN_DURATION_SEC } =
  await import("../../hmi/movePanel.js");

const JOINTS = { x: "eje_x_joint", y: "eje_y_joint", z: "z_axis_joint", probe: "palpador_pro_joint" };
const HOME_DURATION_SEC = 1.3;

// A joint as the engine models it: metres, with limits.
function joint(name, value, lower = -1, upper = 1) {
  return { name, value, lower, upper };
}

/** Build a panel over a controllable fake engine. Returns the panel plus the
 *  recording surfaces, so a test asserts on commands, not on internals. */
function makePanel(overrides = {}) {
  const states = {
    [JOINTS.x]: joint(JOINTS.x, 0),
    [JOINTS.y]: joint(JOINTS.y, 0),
    [JOINTS.z]: joint(JOINTS.z, 0),
    [JOINTS.probe]: joint(JOINTS.probe, 0.0123),
  };
  const commands = [];
  const notices = [];
  const motionStatuses = [];
  const transitions = new Set();
  let printRunning = false;

  const ui = createMovePanelUi({
    joints: JOINTS,
    getJointStateByName: (name) => states[name] || null,
    jointControlTransitions: transitions,
    moveJointToValue: (state, value, duration) => {
      commands.push({ name: state.name, value, duration });
    },
    isPrintActivelyRunning: () => printRunning,
    showPrintNotice: (text) => notices.push(text),
    setMotionStatus: (text) => motionStatuses.push(text),
    markUserActivity: () => {},
    homeDurationSec: HOME_DURATION_SEC,
    ...overrides,
  });

  return {
    ui, states, commands, notices, motionStatuses, transitions,
    setPrintRunning: (value) => { printRunning = value; },
    /** Apply the last command to the joint, as the animation loop eventually would. */
    settle() {
      const last = commands[commands.length - 1];
      if (last) states[last.name].value = last.value;
    },
  };
}

// canOperateMotion reads the global bridge; keep it grantable per test.
function grantMotion(can) {
  globalThis.window.MeltioPermissions = { can: () => can };
}
grantMotion(true);

test("a jog commands the step in metres, not millimetres", () => {
  const panel = makePanel();
  panel.ui.setStepMm(10);
  panel.ui.jogAxis("x", 1);

  assert.equal(panel.commands.length, 1);
  assert.equal(panel.commands[0].name, JOINTS.x);
  // 10 mm of step must reach the joint as 0.01, not 10.
  assert.equal(panel.commands[0].value, 0.01);
});

test("direction is honoured", () => {
  const panel = makePanel();
  panel.ui.setStepMm(10);
  panel.ui.jogAxis("x", -1);
  assert.equal(panel.commands[0].value, -0.01);
});

test("N taps equal N steps while a glide is already running", () => {
  // The rule the comment in the source calls out: repeated presses accumulate
  // from the last COMMANDED target, not from the mid-glide joint value. Without
  // it, three fast taps of 10 mm land somewhere short of 30 mm.
  const panel = makePanel();
  panel.ui.setStepMm(10);
  panel.transitions.add(`joint-preset:${JOINTS.x}`); // a glide is in flight

  panel.ui.jogAxis("x", 1);
  panel.ui.jogAxis("x", 1);
  panel.ui.jogAxis("x", 1);

  const values = panel.commands.map((c) => c.value);
  assert.deepEqual(values.map((v) => Number(v.toFixed(6))), [0.01, 0.02, 0.03],
    "three taps of 10 mm must command 10, 20, 30 mm");
});

test("with no glide in flight each tap starts from where the axis actually is", () => {
  const panel = makePanel();
  panel.ui.setStepMm(10);

  panel.ui.jogAxis("x", 1);
  panel.settle();            // the axis arrives
  panel.ui.jogAxis("x", 1);

  assert.equal(Number(panel.commands[1].value.toFixed(6)), 0.02);
});

test("a stale commanded target is ignored once the glide has ended", () => {
  const panel = makePanel();
  panel.ui.setStepMm(10);
  panel.transitions.add(`joint-preset:${JOINTS.x}`);
  panel.ui.jogAxis("x", 1);          // target 0.01, mid-glide

  panel.transitions.clear();          // glide finished...
  panel.states[JOINTS.x].value = 0.5; // ...and the axis was moved elsewhere
  panel.ui.jogAxis("x", 1);

  assert.equal(Number(panel.commands[1].value.toFixed(6)), 0.51,
    "the jog must resume from the real position, not the abandoned target");
});

test("the jog clamps to the joint limits and never commands past them", () => {
  const panel = makePanel();
  panel.states[JOINTS.x] = joint(JOINTS.x, 0.98, -1, 1);
  panel.ui.setStepMm(100); // 0.1 m — would overshoot

  panel.ui.jogAxis("x", 1);
  assert.equal(panel.commands[0].value, 1, "clamped to upper");

  panel.states[JOINTS.x].value = -0.98;
  panel.ui.jogAxis("x", -1);
  assert.equal(panel.commands[1].value, -1, "clamped to lower");
});

test("glide time is distance / speed, floored so a tiny step still eases", () => {
  const panel = makePanel();

  panel.ui.setStepMm(100);
  panel.ui.jogAxis("x", 1);
  assert.equal(panel.commands[0].duration, 100 / JOG_SPEED_MM_S,
    "a long move scales with distance");

  panel.settle();
  panel.ui.setStepMm(0.1);
  panel.ui.jogAxis("x", 1);
  assert.equal(panel.commands[1].duration, JOG_MIN_DURATION_SEC,
    "a 0.1 mm step would be 0.0022 s — the floor must win");
});

test("a clamped jog charges only for the distance actually travelled", () => {
  const panel = makePanel();
  panel.states[JOINTS.x] = joint(JOINTS.x, 0.995, -1, 1);
  panel.ui.setStepMm(100);
  panel.ui.jogAxis("x", 1);
  // Travels 5 mm, not 100: 5/45 = 0.111 s, under the floor.
  assert.equal(panel.commands[0].duration, JOG_MIN_DURATION_SEC);
});

test("jogging is refused while a print is running, with a reason", () => {
  const panel = makePanel();
  panel.setPrintRunning(true);
  panel.ui.jogAxis("x", 1);

  assert.equal(panel.commands.length, 0, "no axis command may reach the engine");
  assert.deepEqual(panel.notices, ["Stop the print to jog the axes."]);
});

test("homing is refused while a print is running too", () => {
  const panel = makePanel();
  panel.setPrintRunning(true);
  panel.ui.homeAxes("xy");

  assert.equal(panel.commands.length, 0);
  assert.equal(panel.notices.length, 1);
  assert.equal(panel.motionStatuses.length, 0, "and no status is claimed");
});

test("without machine.motion nothing moves, and no notice is shown either", () => {
  // Defense in depth: the DOM gate is a convenience, this is the refusal.
  grantMotion(false);
  const panel = makePanel();
  panel.ui.jogAxis("x", 1);
  panel.ui.homeAxes("xy");

  assert.equal(panel.commands.length, 0);
  assert.equal(panel.notices.length, 0, "a permission refusal is silent, not a print notice");
  grantMotion(true);
});

test("canOperateMotion allows motion when no permission bridge is installed", () => {
  // Standalone/demo boot has no MeltioPermissions at all; the panel must work.
  const saved = globalThis.window.MeltioPermissions;
  delete globalThis.window.MeltioPermissions;
  assert.equal(canOperateMotion(), true);
  globalThis.window.MeltioPermissions = saved;
});

test("home XY sends both axes to the origin and says so", () => {
  const panel = makePanel();
  panel.states[JOINTS.x].value = 0.4;
  panel.states[JOINTS.y].value = -0.3;
  panel.ui.homeAxes("xy");

  assert.deepEqual(panel.commands.map((c) => [c.name, c.value, c.duration]), [
    [JOINTS.x, 0, HOME_DURATION_SEC],
    [JOINTS.y, 0, HOME_DURATION_SEC],
  ]);
  assert.deepEqual(panel.motionStatuses, ["Homing XY"]);
});

test("home Z moves Z alone", () => {
  const panel = makePanel();
  panel.ui.homeAxes("z");
  assert.deepEqual(panel.commands.map((c) => c.name), [JOINTS.z]);
  assert.deepEqual(panel.motionStatuses, ["Homing Z"]);
});

test("homing an axis whose limits exclude zero clamps instead of overshooting", () => {
  const panel = makePanel();
  panel.states[JOINTS.z] = joint(JOINTS.z, 0.5, 0.2, 1);
  panel.ui.homeAxes("z");
  assert.equal(panel.commands[0].value, 0.2, "home is clamped into the legal range");
});

test("an unknown axis and a missing joint are no-ops, not throws", () => {
  const panel = makePanel();
  panel.ui.jogAxis("w", 1);
  assert.equal(panel.commands.length, 0);

  const orphan = makePanel({ getJointStateByName: () => null });
  orphan.ui.jogAxis("x", 1);
  orphan.ui.homeAxes("xy");
  assert.equal(orphan.commands.length, 0);
  assert.equal(orphan.motionStatuses.length, 0, "nothing moved, so claim nothing");
});

test("the readout renders millimetres with one decimal", () => {
  const panel = makePanel();
  panel.states[JOINTS.x].value = 0.1234;
  panel.ui.updateReadout();
  assert.equal(el("movePosX").textContent, "123.4");
  assert.equal(el("movePosWd").textContent, "12.3", "WD reads the probe joint");
});

test("the readout shows a dash for a joint the robot does not have", () => {
  const panel = makePanel({ getJointStateByName: () => null });
  panel.ui.updateReadout();
  assert.equal(el("movePosX").textContent, "—");
});

test("the readout only writes a cell when its text changes", () => {
  // It is polled every animation frame; writing textContent unconditionally
  // would dirty the layout 60 times a second for nothing.
  const panel = makePanel();
  panel.states[JOINTS.x].value = 0.05;
  panel.ui.updateReadout();

  const cell = el("movePosX");
  let writes = 0;
  // jsdom defines textContent on Node.prototype, not HTMLElement.prototype, so
  // walk up for it rather than assuming a level.
  let descriptor = null;
  for (let proto = Object.getPrototypeOf(cell); proto && !descriptor; proto = Object.getPrototypeOf(proto)) {
    descriptor = Object.getOwnPropertyDescriptor(proto, "textContent");
  }
  assert.ok(descriptor?.set, "textContent must be an accessor for this spy to work");

  Object.defineProperty(cell, "textContent", {
    configurable: true,
    get: () => descriptor.get.call(cell),
    set: (value) => { writes += 1; descriptor.set.call(cell, value); },
  });
  try {
    panel.ui.updateReadout();
    panel.ui.updateReadout();
    assert.equal(writes, 0, "an unchanged value must not be written");

    panel.states[JOINTS.x].value = 0.06;
    panel.ui.updateReadout();
    assert.equal(writes, 1, "a changed value must be");
  } finally {
    // Leave no own property behind: the fixture document is shared by every
    // test in this file.
    delete cell.textContent;
  }
});

test("the step buttons set the step and mark exactly one active", () => {
  const panel = makePanel();
  const buttons = [...globalThis.document.querySelectorAll("[data-move-step]")];
  const hundred = buttons.find((b) => b.getAttribute("data-move-step") === "100");

  hundred.dispatchEvent(new globalThis.window.MouseEvent("click", { bubbles: true }));

  assert.equal(panel.ui.getStepMm(), 100);
  assert.deepEqual(
    buttons.filter((b) => b.classList.contains("is-active"))
      .map((b) => b.getAttribute("data-move-step")),
    ["100"],
  );
});

test("a junk step attribute falls back to the default instead of NaN", () => {
  const panel = makePanel();
  panel.ui.setStepMm("banana");
  assert.equal(panel.ui.getStepMm(), 10);
  panel.ui.jogAxis("x", 1);
  assert.equal(panel.commands[0].value, 0.01, "and the jog is still a real distance");
});
