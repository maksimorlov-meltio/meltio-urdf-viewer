// viewer/effects/feedstockHighlight.js -- the Materials-menu highlight.
//
// Runs against the REAL vendored three (geometry + math only, no renderer): the
// module's whole job is geometry that follows a part, which a stub cannot hold
// to account. What is pinned: a drum gets sweeping rings sized to its outline,
// a spool gets the spinning arc, the meshes live in the scene (never under the
// part, so they cannot leak into a bounds measurement), and everything is
// disposed again the moment nothing is highlighted.
import test from "node:test";
import assert from "node:assert/strict";

import * as THREE from "../../apps/dev-host/src/avisualizer/web/static/vendor/three.module.js";
import { createFeedstockHighlight } from "../../viewer/effects/feedstockHighlight.js";

function world() {
  const scene = new THREE.Scene();
  let renders = 0;
  const highlight = createFeedstockHighlight({ THREE, scene, requestRender: () => { renders += 1; } });
  return { scene, highlight, renders: () => renders };
}

// A part = a "link:" group holding one mesh, like the URDF loader builds them.
function part(scene, linkName, geometry, position = [0, 0, 0]) {
  const link = new THREE.Group();
  link.name = `link:${linkName}`;
  link.position.set(...position);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  link.add(mesh);
  scene.add(link);
  return { link, mesh };
}

function drumGeometry(radius = 0.25, height = 0.6) {
  const geometry = new THREE.CylinderGeometry(radius, radius, height, 48, 6);
  geometry.rotateX(Math.PI / 2); // axis along world Z (up), like the drum
  return geometry;
}

test("nothing highlighted: update() is a no-op that asks for no redraw", () => {
  const { scene, highlight, renders } = world();
  part(scene, "wire_drum_link", drumGeometry());
  assert.equal(highlight.update(0), false);
  assert.equal(highlight.isActive(), false);
  assert.equal(renders(), 0);
  assert.equal(scene.children.length, 1, "nothing but the part is in the scene");
});

test("a drum gets a set of sweeping rings sized to its outline, parented to the scene", () => {
  const { scene, highlight, renders } = world();
  const drum = part(scene, "wire_drum_link", drumGeometry(0.25, 0.6), [1, 2, 0.3]);
  highlight.set(drum.mesh, true);
  assert.equal(highlight.update(0), true);
  assert.ok(renders() >= 1, "a highlighted part must keep the scene drawing");

  const sets = [...highlight.getSets().values()];
  assert.equal(sets.length, 1);
  const set = sets[0];
  assert.notEqual(set.kind, "spin", "a drum is scanned, not circled");
  assert.equal(set.rings.length, 10);
  assert.equal(set.group.parent, scene, "the rings must not be children of the part");

  for (const ring of set.rings) {
    // round outline -> a circle at the drum radius plus the 14 mm gap
    assert.ok(Math.abs(ring.scale.x - 0.264) < 0.01, `ring radius ${ring.scale.x}`);
    assert.ok(Math.abs(ring.scale.y - 0.264) < 0.01);
    // centred on the drum's axis, inside its height
    assert.ok(Math.abs(ring.position.x - 1) < 0.01 && Math.abs(ring.position.y - 2) < 0.01);
    assert.ok(ring.position.z >= 0.3 - 0.3 - 1e-6 && ring.position.z <= 0.3 + 0.3 + 1e-6, `ring z ${ring.position.z}`);
  }
  assert.ok(set.rings[0].material.opacity > set.rings[9].material.opacity, "the lead ring is the brightest");
});

test("the rings sweep: the lead ring is at the top at t=0 and at the bottom half a cycle later", () => {
  const { scene, highlight } = world();
  const drum = part(scene, "wire_drum_link", drumGeometry(0.25, 0.6));
  highlight.set(drum.mesh, true);
  highlight.update(0);
  const lead = [...highlight.getSets().values()][0].rings[0];
  assert.ok(Math.abs(lead.position.z - 0.3) < 0.01, `top, got ${lead.position.z}`);
  highlight.update(2400);
  assert.ok(Math.abs(lead.position.z + 0.3) < 0.01, `bottom, got ${lead.position.z}`);
});

test("the rings follow the part when it moves", () => {
  const { scene, highlight } = world();
  const drum = part(scene, "wire_drum_2_link", drumGeometry());
  highlight.set(drum.mesh, true);
  highlight.update(0);
  drum.link.position.set(0, 0.7, 0);
  scene.updateMatrixWorld(true);
  highlight.update(0);
  const lead = [...highlight.getSets().values()][0].rings[0];
  assert.ok(Math.abs(lead.position.y - 0.7) < 0.01);
});

test("a spool gets the spinning arc on its outer face, and a frozen wave pins it", () => {
  const { scene, highlight } = world();
  // flange disc in the Y/Z plane (axis X), like a spool in its compartment
  const geometry = new THREE.CylinderGeometry(0.15, 0.15, 0.08, 48);
  geometry.rotateZ(Math.PI / 2);
  const spool = part(scene, "spool_1_link", geometry);
  highlight.set(spool.mesh, true);
  highlight.update(800);
  const set = [...highlight.getSets().values()][0];
  assert.equal(set.kind, "spin");
  assert.ok(Math.abs(set.spinner.rotation.x - (800 / 3200) * Math.PI * 2) < 1e-6, "a quarter turn after a quarter of 3.2 s");
  assert.ok(set.group.position.x < -0.04, "the arc sits on the outer (-X) face so the flange cannot hide it");

  highlight.tune({ wave: 0.5 });
  highlight.update(123456);
  assert.ok(Math.abs(set.spinner.rotation.x - Math.PI) < 1e-6, "frozen at half a turn whatever the clock says");
});

test("a hidden part hides its highlight without disposing it", () => {
  const { scene, highlight } = world();
  const drum = part(scene, "wire_drum_link", drumGeometry());
  highlight.set(drum.mesh, true);
  highlight.update(0);
  const set = [...highlight.getSets().values()][0];
  drum.mesh.visible = false;
  highlight.update(16);
  assert.equal(set.group.visible, false);
  drum.mesh.visible = true;
  highlight.update(32);
  assert.equal(set.group.visible, true);
});

test("un-highlighting removes the meshes from the scene and frees their materials", () => {
  const { scene, highlight } = world();
  const drum = part(scene, "wire_drum_link", drumGeometry());
  highlight.set(drum.mesh, true);
  highlight.update(0);
  const set = [...highlight.getSets().values()][0];
  let disposed = 0;
  for (const ring of set.rings) ring.material.addEventListener("dispose", () => { disposed += 1; });

  highlight.set(drum.mesh, false);
  assert.equal(highlight.update(16), false);
  assert.equal(highlight.getSets().size, 0);
  assert.equal(set.group.parent, null);
  assert.equal(disposed, set.rings.length);
  assert.equal(scene.children.length, 1);
});

test("clear() forgets every part (the robot was unloaded)", () => {
  const { scene, highlight } = world();
  const a = part(scene, "wire_drum_link", drumGeometry());
  const b = part(scene, "wire_drum_2_link", drumGeometry(), [0, 0.7, 0]);
  highlight.set(a.mesh, true);
  highlight.set(b.mesh, true);
  highlight.update(0);
  assert.equal(highlight.getSets().size, 2);
  highlight.clear();
  assert.equal(highlight.getSets().size, 0);
  assert.equal(highlight.isActive(), false);
  assert.equal(scene.children.length, 2);
});
