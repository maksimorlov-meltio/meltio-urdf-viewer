// hmi/ui/topbarIcons.js -- the helper that mirrors an open panel into a top bar
// icon component. The components replay their animation on every `active`
// change, so the one thing that matters is that nothing is written unless the
// state really changed.
import test from "node:test";
import assert from "node:assert/strict";

import { setTopbarIconActive } from "../../hmi/ui/topbarIcons.js";

function fakeIcon(initiallyActive = false) {
  const icon = {
    active: initiallyActive,
    writes: 0,
    hasAttribute(name) { return name === "active" && this.active; },
    toggleAttribute(name, force) {
      assert.equal(name, "active");
      this.active = force;
      this.writes += 1;
    },
  };
  return icon;
}

test("sets and clears the active attribute", () => {
  const icon = fakeIcon();
  setTopbarIconActive(icon, true);
  assert.equal(icon.active, true);
  setTopbarIconActive(icon, false);
  assert.equal(icon.active, false);
  assert.equal(icon.writes, 2);
});

test("does not touch the element when the state is unchanged", () => {
  const icon = fakeIcon(true);
  setTopbarIconActive(icon, true);
  setTopbarIconActive(icon, 1); // truthy counts as active
  assert.equal(icon.writes, 0);
});

test("a missing icon is ignored", () => {
  assert.doesNotThrow(() => setTopbarIconActive(null, true));
});
