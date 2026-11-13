// hmi/materialsPeek.js -- the read-only Materials card shown on a long press.
import test, { mock } from "node:test";
import assert from "node:assert/strict";

import { mountUrdfDom } from "./support/domFixture.mjs";

mountUrdfDom();
const state = await import("../../hmi/state/materialsState.js");
const { createMaterialsPeekUi } = await import("../../hmi/materialsPeek.js");

let menuOpen = false;
const feederFeedType = { spool1: "spool", spool2: "spool" };
const peek = createMaterialsPeekUi({ isMaterialsMenuOpen: () => menuOpen, feederFeedType });

const card = () => document.querySelector(".materials-peek");
const texts = (selector) => [...card().querySelectorAll(selector)].map((el) => el.textContent);

function pointerDownOn(target) {
  target.dispatchEvent(new window.Event("pointerdown", { bubbles: true }));
}

test("nothing is in the page until the first long press", () => {
  assert.equal(card(), null);
  assert.equal(peek.isVisible(), false);
});

test("the door shows both feeders: type, loaded material and what is left", () => {
  state.hotspotMaterialAssignments.spool1 = "ti64";
  state.hotspotMaterialAssignments.spool2 = null;
  state.setSpoolAmountState("spool1", 800);
  state.spoolRemainingAmountGramsByKey.spool1 = 200;
  feederFeedType.spool2 = "drum";

  assert.equal(peek.show(["spool1", "spool2"], 300, 600), true);
  assert.equal(peek.isVisible(), true);
  assert.deepEqual(texts(".materials-peek-feeder"), ["Feeder 1 · Spool", "Feeder 2 · Drum"]);
  assert.deepEqual(texts(".materials-peek-material"), [state.getMaterialLabelById("ti64"), "No material assigned"]);
  const [amount1] = texts(".materials-peek-amount");
  assert.equal(amount1, `${state.getSpoolRemainingAmountText("spool1")} left of ${state.getSpoolInitialAmountText("spool1")}`);
  assert.equal(card().querySelector(".materials-peek-bar span").style.width, "25%", "200 g left of 800 g");
  feederFeedType.spool2 = "spool";
});

test("a drum shows only its own feeder, and showing again replaces the rows", () => {
  peek.show(["spool2"], 300, 600);
  assert.equal(card().querySelectorAll(".materials-peek-row").length, 1);
  assert.deepEqual(texts(".materials-peek-feeder"), ["Feeder 2 · Spool"]);
  assert.equal(document.querySelectorAll(".materials-peek").length, 1, "one card, reused");
});

test("the next touch anywhere else dismisses it; a touch on the card does not", () => {
  peek.show(["spool1"], 300, 600);
  pointerDownOn(card().querySelector(".materials-peek-title"));
  assert.equal(peek.isVisible(), true);
  pointerDownOn(document.body);
  assert.equal(peek.isVisible(), false);
});

test("it never opens over the Materials menu", () => {
  menuOpen = true;
  try {
    assert.equal(peek.show(["spool1"], 300, 600), false);
    assert.equal(peek.isVisible(), false);
  } finally {
    menuOpen = false;
  }
});

test("it leaves by itself after six seconds, counted from the last show", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    peek.show(["spool1"], 300, 600);
    mock.timers.tick(4000);
    peek.show(["spool1"], 320, 600);       // shown again: the clock restarts
    mock.timers.tick(4000);
    assert.equal(peek.isVisible(), true);
    mock.timers.tick(2000);
    assert.equal(peek.isVisible(), false);
  } finally {
    mock.timers.reset();
  }
});
