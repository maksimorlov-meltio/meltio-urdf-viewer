// viewer/sim/printSimulation.js — the first tests this 890-line module has had.
//
// Written as the defence of one fix (REN-1), not as a suite in the abstract.
// getStats() reads like a once-per-print call and is not: the topbar progress
// pill reaches it from animate(), so it ran EVERY FRAME while a print was on
// screen, walking the whole position array and every thermal segment — 3.4 ms
// median for a 100k-segment part, on a 16 ms budget.
//
// The module takes THREE through its context object rather than importing it,
// which is what makes any of this reachable from node. The stub below is the
// smallest thing setupToolpathSource touches with no STL and no scene parent.
import test from "node:test";
import assert from "node:assert/strict";

import { createPrintSimulation } from "../../viewer/sim/printSimulation.js";

// --- The smallest THREE that the toolpath path touches -----------------------
function threeStub() {
  class Vec3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  }
  class Obj3D {
    constructor() {
      this.children = [];
      this.parent = null;
      this.position = new Vec3();
      this.rotation = { x: 0, y: 0, z: 0 };
      this.quaternion = { copy: () => {} };
      this.scale = new Vec3(1, 1, 1);
      this.visible = true;
    }
    add(child) { this.children.push(child); child.parent = this; }
    remove(child) { this.children = this.children.filter((c) => c !== child); child.parent = null; }
    updateMatrixWorld() {}
    updateWorldMatrix() {}
  }
  class Geometry {
    constructor() { this.attributes = {}; this.disposed = false; }
    setAttribute(name, attr) { this.attributes[name] = attr; }
    setDrawRange() {}
    setIndex() {}
    computeVertexNormals() {}
    dispose() { this.disposed = true; }
  }
  class Material {
    constructor(opts = {}) { Object.assign(this, opts); this.disposed = false; }
    dispose() { this.disposed = true; }
  }
  class Mesh extends Obj3D {
    constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; }
  }
  return {
    Vector3: Vec3,
    Object3D: Obj3D,
    Group: Obj3D,
    BufferGeometry: Geometry,
    BufferAttribute: class { constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; } },
    LineBasicMaterial: Material,
    MeshBasicMaterial: Material,
    MeshStandardMaterial: Material,
    LineSegments: Mesh,
    Mesh,
    Plane: class { constructor() { this.constant = 0; } },
    Box3: class {
      setFromObject() { return this; }
      isEmpty() { return true; }
    },
    DoubleSide: 2,
  };
}

// Two layers, 10 mm of path each — `points` is a FLAT xyz list, same shape the
// slicer sends and toolpathModel.test.mjs uses. 20 mm total, which is what
// makes the 1x duration arithmetic below checkable by hand.
const TOOLPATH = {
  moves: [
    { points: [0, 0, 0, 10, 0, 0], kind: "outer_perimeter", layer: 0 },
    { points: [0, 0, 1, 10, 0, 1], kind: "outer_perimeter", layer: 1 },
  ],
  stats: { beadWidthMm: 3, layerHeightMm: 1 },
};

/** A thermal payload that counts how many times its segments are walked.
 *  This is the whole measurement: memoized means read once per distinct
 *  payload, no matter how many frames ask. */
function countingThermal(segmentCount = 50) {
  const segments = Array.from({ length: segmentCount }, (_v, i) => ({
    points: [[i, 0, 0], [i + 1, 0, 0]], score: (i % 10) / 10, layer: i % 5,
  }));
  const payload = { reads: 0 };
  Object.defineProperty(payload, "segments", {
    get() { payload.reads += 1; return segments; },
    enumerable: true,
  });
  return payload;
}

function makeSim({ thermal = null, getThermal = null, speedMmPerSec = null } = {}) {
  const THREE = threeStub();
  const stl = new THREE.Object3D();
  return createPrintSimulation({
    THREE,
    renderer: null,
    // prepare() refuses without a loaded model; Box3 answers isEmpty() so the
    // whole placement block is skipped and no real geometry is needed.
    ensureModelLoaded: async () => true,
    getStlObject: () => stl,
    getSelectedModelName: () => "part.stl",
    getParentObject: () => null,
    getSlicerToolpath: () => TOOLPATH,
    getSlicerPlate: () => null,
    getNozzleTipWorld: () => null,
    getNozzleTipWorldZ: () => null,
    getSlicerSpeedMmPerSec: () => speedMmPerSec,
    getSlicerMesh: () => null,
    getSlicerThermal: getThermal || (() => thermal),
    cadToViewerRotationX: 0,
    onStatus: () => {},
    onStateChange: () => {},
    onProgress: () => {},
    slicerClient: { isEnabled: () => false },
  });
}

// --- REN-1: getStats is memoized --------------------------------------------

test("repeated getStats calls walk the thermal payload once, not once per frame", async () => {
  const thermal = countingThermal();
  const sim = makeSim({ thermal });
  await sim.prepare();

  const first = sim.getStats();
  const readsAfterFirst = thermal.reads;
  // 60 frames of a print: what animate() actually does.
  for (let i = 0; i < 60; i += 1) sim.getStats();

  assert.equal(thermal.reads, readsAfterFirst,
    `the payload was re-walked ${thermal.reads - readsAfterFirst} extra times`);
  assert.equal(sim.getStats(), first, "and the very same object comes back");
});

test("the memo is keyed on the payload, so a new thermal result is seen", async () => {
  // The failure mode of a naive cache, and the reason the key is the payload
  // itself rather than a dirty flag: the operator re-slices, and the thermal
  // summary in the completion dialog still describes the previous part.
  let thermal = countingThermal(10);
  const sim = makeSim({ getThermal: () => thermal });
  await sim.prepare();

  const before = sim.getStats();
  thermal = countingThermal(20);
  const after = sim.getStats();
  assert.notEqual(before, after, "a different payload must produce a fresh answer");
  assert.equal(after.thermal.samples, 20);
});

test("with no thermal payload at all the stats still answer", () => {
  const sim = makeSim();
  const stats = sim.getStats();
  assert.equal(stats.thermal, null);
  assert.equal(stats.source, null, "nothing prepared yet");
});

// --- The 1x duration must not outlive its toolpath ---------------------------

test("tearing the toolpath down clears the 1x duration with it", async () => {
  // 20 mm of path at 10 mm/s = 2 s. Leaving that behind meant the NEXT print
  // inherited this part's pacing, and the completion summary reported it.
  const sim = makeSim({ speedMmPerSec: 10 });
  await sim.prepare();
  assert.ok(Number.isFinite(sim.getStats().printSeconds), "a real toolpath has a 1x duration");

  sim.stop();
  assert.equal(sim.getStats().printSeconds, null,
    "the stopped print's duration must not survive into the next one");
});

test("stop() also drops the buffers the stats are derived from", async () => {
  const sim = makeSim({ speedMmPerSec: 10 });
  await sim.prepare();
  assert.ok(sim.getStats().layerCount >= 1);

  sim.stop();
  const after = sim.getStats();
  assert.equal(after.layerCount, null);
  assert.equal(after.pathLengthMm, null);
  assert.equal(after.heightMm, null);
});
