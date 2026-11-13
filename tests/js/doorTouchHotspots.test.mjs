// viewer/overlays/doorTouchHotspots.js -- double tap / long press on the model.
//
// Real three (raycaster + geometry) and a jsdom canvas. The rules that matter
// and cannot be seen in review: only a DOUBLE tap acts; the nearest solid part
// under the finger decides (a part in front swallows the tap, a hidden one does
// not); a drag is never a tap; a long press is spent -- its release must not
// count as a tap.
import test, { mock } from "node:test";
import assert from "node:assert/strict";

import * as THREE from "../../apps/dev-host/src/avisualizer/web/static/vendor/three.module.js";
import { mountUrdfDom } from "./support/domFixture.mjs";

mountUrdfDom();
const { createDoorTouchHotspots } = await import("../../viewer/overlays/doorTouchHotspots.js");

function link(name, z, size = 1) {
  const group = new THREE.Group();
  group.name = `link:${name}`;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, 0.1), new THREE.MeshBasicMaterial());
  mesh.position.z = z;
  group.add(mesh);
  return { group, mesh };
}

function setup({ withBlocker = false } = {}) {
  const root = new THREE.Group();
  const door = link("front_door_link", 0);
  const drum = link("wire_drum_link", 0);
  drum.group.position.x = 10;                      // off to the side: reached with clientX >= 500
  root.add(door.group, drum.group);
  let blocker = null;
  if (withBlocker) {
    blocker = link("chassis_link", 1);             // between the camera and the door
    root.add(blocker.group);
  }
  root.updateMatrixWorld(true);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();

  const canvas = document.createElement("canvas");
  const log = { activate: 0, longPress: [], renders: 0, drumActivate: 0 };
  let enabled = true;
  const hotspots = createDoorTouchHotspots({
    THREE,
    camera,
    canvas,
    getRobotRoot: () => root,
    // clientX < 500 aims at the door (screen centre); otherwise at the drum, by
    // pointing the ray at where the drum projects.
    getPointerNdc: (event, target) => {
      if (event.clientX < 500) return target.set(0, 0);
      return target.copy(new THREE.Vector3(10, 0, 0).project(camera));
    },
    requestRender: () => { log.renders += 1; },
    hotspots: [
      { id: "frontDoor", linkName: "front_door_link", hint: "Double-tap to open the front door",
        isEnabled: () => enabled, activate: () => { log.activate += 1; } },
      { id: "wireDrum", linkName: "wire_drum_link", hint: "Double-tap to open Materials",
        isEnabled: () => true, activate: () => { log.drumActivate += 1; },
        longPress: (x, y) => { log.longPress.push([x, y]); } },
    ],
  });
  const fire = (type, x = 100, y = 100) => {
    const event = new window.Event(type, { bubbles: true });
    Object.assign(event, { clientX: x, clientY: y, pointerType: "touch", button: 0 });
    canvas.dispatchEvent(event);
  };
  const tap = (x = 100, y = 100) => { fire("pointerdown", x, y); fire("pointerup", x, y); };
  const hint = () => [...document.body.querySelectorAll("div[aria-hidden='true']")]
    .filter((el) => el.style.pointerEvents === "none" && el.style.position === "fixed").at(-1);
  return { hotspots, log, tap, fire, hint, door, blocker, setEnabled: (value) => { enabled = value; } };
}

test("one tap only shows the hint; the second tap in the same place acts, once", () => {
  const { hotspots, log, tap, hint } = setup();
  tap();
  assert.equal(log.activate, 0);
  assert.equal(hint().style.display, "block");
  assert.equal(hint().textContent, "Double-tap to open the front door");
  assert.equal(hotspots.consumedDoubleTapRecently(), false);

  tap();
  assert.equal(log.activate, 1);
  assert.equal(hint().style.display, "none");
  assert.equal(hotspots.consumedDoubleTapRecently(), true, "the host must be able to tell its own dblclick handler");
  assert.ok(log.renders >= 1, "a door that opens needs a redraw");

  tap();
  assert.equal(log.activate, 1, "a third tap starts a new pair, it is not a second double tap");
});

test("two taps far apart on screen are not a double tap", () => {
  const { log, tap } = setup();
  tap(100, 100);
  tap(160, 100);
  assert.equal(log.activate, 0);
});

test("a drag is never half of a double tap", () => {
  const { log, tap, fire } = setup();
  tap();
  fire("pointerdown", 100, 100);
  fire("pointerup", 100, 130);            // the finger moved 30 px: an orbit
  tap();
  assert.equal(log.activate, 0);
});

test("a panel that is not enabled does not answer at all", () => {
  const { log, tap, hint, setEnabled } = setup();
  setEnabled(false);
  tap();
  tap();
  assert.equal(log.activate, 0);
  assert.notEqual(hint().style.display, "block");
});

test("a part in front swallows the tap; hidden, it lets the tap through", () => {
  const { log, tap, blocker } = setup({ withBlocker: true });
  tap();
  tap();
  assert.equal(log.activate, 0, "the chassis is between the finger and the door");

  blocker.mesh.visible = false;           // THREE's raycaster ignores `visible` by itself
  tap();
  tap();
  assert.equal(log.activate, 1);
});

test("a long press runs the panel's long-press action and its release is not a tap", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const { log, fire, tap, hint } = setup();
    fire("pointerdown", 600, 300);
    mock.timers.tick(549);
    assert.deepEqual(log.longPress, []);
    mock.timers.tick(1);
    assert.deepEqual(log.longPress, [[600, 300]]);
    fire("pointerup", 600, 300);
    assert.notEqual(hint().style.display, "block", "the release of a long press shows no hint");
    tap(600, 300);
    assert.equal(log.drumActivate, 0, "and it is not the first half of a double tap either");
  } finally {
    mock.timers.reset();
  }
});

test("a press that turns into a drag, or ends early, is not a long press", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const { log, fire } = setup();
    fire("pointerdown", 600, 300);
    fire("pointermove", 620, 300);         // > 8 px: the operator is orbiting
    mock.timers.tick(1000);
    assert.deepEqual(log.longPress, []);

    fire("pointerup", 620, 300);
    fire("pointerdown", 600, 300);
    mock.timers.tick(300);
    fire("pointerup", 600, 300);           // released before 550 ms
    mock.timers.tick(1000);
    assert.deepEqual(log.longPress, []);
  } finally {
    mock.timers.reset();
  }
});

test("a panel without a long-press action ignores a held finger", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const { log, fire } = setup();
    fire("pointerdown", 100, 100);
    mock.timers.tick(2000);
    fire("pointerup", 100, 100);
    assert.equal(log.activate, 0);
    assert.deepEqual(log.longPress, []);
  } finally {
    mock.timers.reset();
  }
});
