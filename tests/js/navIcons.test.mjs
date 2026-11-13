// hmi/navIcons.js -- the bottom bar icons, against the REAL page.
//
// What is worth pinning here is what the eye cannot check in review: update()
// runs every frame, so it must write nothing while a door stands still; the
// underline has to follow the door's MOTION (on when it starts to open, off
// when it starts to close), not aria-pressed; and "one random open in every 50"
// is arithmetic over a persisted block that is easy to get subtly wrong.
import test from "node:test";
import assert from "node:assert/strict";

import { mountUrdfDom } from "./support/domFixture.mjs";

mountUrdfDom();
const { createNavIconsUi, DOOR_CAT_BLOCK_SIZE, DOOR_CAT_MODES } = await import("../../hmi/navIcons.js");

// jsdom does not run the page's scripts, so the <m600-*> tags are unknown
// elements. Give the two door icons the one method the wiring calls.
function instrument(id) {
  const el = document.getElementById(id);
  assert.ok(el, `the page lost #${id}`);
  el.calls = [];
  el.setState = (state) => { el.calls.push(state); };
  return el;
}
const frontIcon = instrument("navFrontDoorIcon");
const topIcon = instrument("navTopDoorIcon");
const frontButton = document.getElementById("navDoorToggle");
const topButton = document.getElementById("annotationNavTopCover");

const doors = { front: 0, top: 0 };
let reducedMotion = false;
const egg = { mode: null, plays: 0, resets: 0, play() { this.plays += 1; }, reset() { this.resets += 1; } };
window.localStorage.clear();
const ui = createNavIconsUi({
  getFrontDoorFraction: () => doors.front,
  getTopCoverFraction: () => doors.top,
  markUserActivity() {},
  createCatEgg: (_icon, options) => { egg.mode = options.mode; return egg; },
  prefersReducedMotion: () => reducedMotion,
});

test("the first frame sends each door's position once, then nothing while it stands still", () => {
  ui.update();
  assert.deepEqual(frontIcon.calls, [{ position: 0, motion: "idle" }]);
  assert.deepEqual(topIcon.calls, [{ position: 0, motion: "idle" }]);
  ui.update();
  ui.update();
  assert.equal(frontIcon.calls.length, 1, "a still door was written again");
  assert.equal(topIcon.calls.length, 1);
});

test("all four buttons carry exactly one underline, however many frames run", () => {
  for (let i = 0; i < 5; i += 1) ui.update();
  for (const id of ["navDoorToggle", "annotationNavTopCover", "navMaterialsToggle", "navFilesToggle"]) {
    assert.equal(document.getElementById(id).querySelectorAll(".nav-door-track").length, 1, id);
  }
});

test("the underline follows the door's motion, and the end positions snap to 0 and 1", () => {
  doors.front = 0.2;
  ui.update();
  assert.deepEqual(frontIcon.calls.at(-1), { position: 0.2, motion: "opening" });
  assert.equal(frontButton.classList.contains("is-line-on"), true, "on as soon as the door starts to open");

  doors.front = 0.9995;                  // the joint transition stops just short of its target
  ui.update();
  assert.deepEqual(frontIcon.calls.at(-1), { position: 1, motion: "opening" });
  ui.update();                           // the door has stopped
  assert.deepEqual(frontIcon.calls.at(-1), { motion: "idle" });
  assert.equal(frontButton.classList.contains("is-line-on"), true);

  doors.front = 0.8;
  ui.update();
  assert.deepEqual(frontIcon.calls.at(-1), { position: 0.8, motion: "closing" });
  assert.equal(frontButton.classList.contains("is-line-on"), false,
    "off the moment the door starts to close, long before aria-pressed flips");

  doors.front = 0.0004;
  ui.update();
  assert.deepEqual(frontIcon.calls.at(-1), { position: 0, motion: "closing" });
  assert.equal(topButton.classList.contains("is-line-on"), false, "the top door never moved");
});

test("a pinned preview overrides the real door and releasing it follows the door again", () => {
  doors.top = 0;
  ui.setPreview({ top: 1 });
  ui.update();
  assert.equal(topIcon.calls.at(-1).position, 1);
  ui.setPreview(null);
  ui.update();
  ui.update();
  assert.equal(topIcon.calls.findLast((call) => "position" in call).position, 0);
});

test("the cat plays on exactly one open in every block of fifty", () => {
  for (let block = 0; block < 6; block += 1) {
    let plays = 0;
    for (let i = 0; i < DOOR_CAT_BLOCK_SIZE; i += 1) {
      if (ui.rollCat()) plays += 1;
    }
    assert.equal(plays, 1, `block ${block}`);
  }
});

test("the block survives a reload: the count continues instead of starting over", () => {
  window.localStorage.setItem("m600.frontDoor.catBlock", JSON.stringify({ n: 48, pick: 49 }));
  assert.equal(ui.rollCat(), false);     // opening 49 of the block
  assert.equal(ui.rollCat(), true);      // opening 50 is the picked one
  const next = JSON.parse(window.localStorage.getItem("m600.frontDoor.catBlock"));
  assert.equal(next.n, 0, "a new block starts after the fiftieth opening");
});

test("the Settings button cycles the three modes and tells the egg module only what it understands", () => {
  const button = document.getElementById("settingsDoorCatButton");
  assert.equal(button.textContent, "Door cat: 1 in 50 opens");
  assert.equal(egg.mode, "off", "the 1-in-50 draw is ours: the module must not also count opens");
  button.click();
  assert.equal(button.textContent, "Door cat: every open");
  assert.equal(egg.mode, "always");
  button.click();
  assert.equal(button.textContent, "Door cat: off");
  assert.equal(egg.mode, "off");
  assert.equal(egg.resets, 1, "switching off must clear a cat that is on screen");
  button.click();
  assert.equal(button.textContent, "Door cat: 1 in 50 opens");
  assert.deepEqual([...DOOR_CAT_MODES], ["random50", "always", "off"]);
});

test("in 1-in-50 mode a completed opening plays the cat only on the picked one", () => {
  window.localStorage.setItem("m600.frontDoor.catBlock", JSON.stringify({ n: 0, pick: 1 }));
  egg.plays = 0;
  frontIcon.dispatchEvent(new window.Event("door-opened"));
  assert.equal(egg.plays, 0);
  frontIcon.dispatchEvent(new window.Event("door-opened"));
  assert.equal(egg.plays, 1);
  frontIcon.dispatchEvent(new window.Event("door-opened"));
  assert.equal(egg.plays, 1);
});

test("with reduced motion the picked opening is used up but the cat stays away", () => {
  window.localStorage.setItem("m600.frontDoor.catBlock", JSON.stringify({ n: 0, pick: 0 }));
  egg.plays = 0;
  reducedMotion = true;
  try {
    frontIcon.dispatchEvent(new window.Event("door-opened"));
  } finally {
    reducedMotion = false;
  }
  assert.equal(egg.plays, 0);
  assert.equal(JSON.parse(window.localStorage.getItem("m600.frontDoor.catBlock")).n, 1);
});
