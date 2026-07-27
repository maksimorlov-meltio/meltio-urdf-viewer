// Unit tests for the pure slicer data logic (no THREE, no DOM).
// Run with: node --test "_slicer_branch/projects/platform/tests/js/**/*.test.mjs"
import test from "node:test";
import assert from "node:assert/strict";

import {
  modelOutOfBounds,
  representativeMoveSpeedMmPerSec,
  flattenMoves,
  detectTravels,
} from "../../src/meltio_platform/slicer/web/static/slicerModel.js";

const BOUNDS = { min: [0, 0, 0], max: [10, 10, 10] };
const VOL = { x: 100, y: 100, z: 100 };

test("modelOutOfBounds: inside the envelope is not out of bounds", () => {
  assert.equal(modelOutOfBounds(BOUNDS, VOL, { x: 0, y: 0, z: 0 }), false);
});

test("modelOutOfBounds: a placement offset can push it past a wall", () => {
  assert.equal(modelOutOfBounds(BOUNDS, VOL, { x: 95, y: 0, z: 0 }), true); // 10+95 > 100
  assert.equal(modelOutOfBounds(BOUNDS, VOL, { x: -1, y: 0, z: 0 }), true); // 0-1 < 0
});

test("modelOutOfBounds: Z is unbounded when build volume z is missing", () => {
  const noZ = { x: 100, y: 100 };
  assert.equal(modelOutOfBounds({ min: [0, 0, 0], max: [10, 10, 9999] }, noZ, {}), false);
});

test("modelOutOfBounds: degenerate/missing inputs are treated as in-bounds", () => {
  assert.equal(modelOutOfBounds(null, VOL, {}), false);
  assert.equal(modelOutOfBounds(BOUNDS, { x: 0, y: 100 }, {}), false);
});

test("representativeMoveSpeedMmPerSec: prefers perimeter/infill feed rate", () => {
  const profile = {
    features: {
      infill: { feed_rate_mm_s: 15 },
      outer_perimeter: { feed_rate_mm_s: 8 },
    },
    travel_speed_mm_s: 60,
  };
  assert.equal(representativeMoveSpeedMmPerSec(profile), 8); // outer_perimeter wins order
});

test("representativeMoveSpeedMmPerSec: falls back to any feature, then travel, then null", () => {
  assert.equal(
    representativeMoveSpeedMmPerSec({ features: { support: { feed_rate_mm_s: 5 } } }),
    5,
  );
  assert.equal(representativeMoveSpeedMmPerSec({ features: {}, travel_speed_mm_s: 42 }), 42);
  assert.equal(representativeMoveSpeedMmPerSec({ features: {} }), null);
  assert.equal(representativeMoveSpeedMmPerSec(null), null);
});

const COLORS = { outer_perimeter: 0x111111, infill: 0x222222 };

test("flattenMoves: builds one segment per point pair and records present kinds", () => {
  const payload = {
    moves: [
      { points: [0, 0, 0, 10, 0, 0, 10, 10, 0], kind: "outer_perimeter", layer: 0 },
      { points: [0, 0, 1, 5, 0, 1], kind: "infill", layer: 1 },
    ],
  };
  const { segments, moves, present } = flattenMoves(payload.moves, COLORS, 0xffffff);
  assert.equal(segments.length, 3); // 2 + 1
  assert.equal(moves.length, 2);
  assert.equal(moves[0].segCount, 2);
  assert.equal(segments[0].color, 0x111111);
  assert.deepEqual([...present].sort(), ["infill", "outer_perimeter"]);
});

test("flattenMoves: skips moves with fewer than 2 points and tolerates junk", () => {
  const { segments, moves } = flattenMoves(
    [{ points: [1, 2, 3], kind: "infill" }, { kind: "infill" }],
    COLORS,
    0xffffff,
  );
  assert.equal(segments.length, 0);
  assert.equal(moves.length, 0);
});

test("detectTravels: classifies gaps between moves against the threshold", () => {
  const moves = [
    { pts: [0, 0, 0, 1, 0, 0] },
    { pts: [1.5, 0, 0, 2, 0, 0] }, // gap 0.5 -> short
    { pts: [50, 0, 0, 51, 0, 0] }, // gap 48 -> long
  ];
  assert.deepEqual(detectTravels(moves, 2.0), { hasShortTravel: true, hasLongTravel: true });
  assert.deepEqual(detectTravels(moves.slice(0, 2), 2.0), {
    hasShortTravel: true,
    hasLongTravel: false,
  });
});
