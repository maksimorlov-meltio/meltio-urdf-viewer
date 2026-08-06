// Unit tests for the pure toolpath-conversion module (no Three.js, no DOM).
// Run with: node --test urdf_viewer/projects/avisualizer/tests/js/
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildLineSegmentBuffers,
  segmentsVisibleForProgress,
} from "../../viewer/toolpath/toolpathModel.js";

// Two layer-0 moves (1 segment each) + one layer-1 move (2 segments): 4 total.
function syntheticPayload() {
  return {
    moves: [
      { points: [0, 0, 0, 10, 0, 0], kind: "outer_perimeter", layer: 0 },
      { points: [10, 0, 0, 10, 10, 0], kind: "infill", layer: 0 },
      { points: [0, 0, 1, 10, 0, 1, 10, 10, 1], kind: "outer_perimeter", layer: 1 },
    ],
  };
}

test("buildLineSegmentBuffers counts segments, layers and path length", () => {
  const buffers = buildLineSegmentBuffers(syntheticPayload(), { unitScale: 1 });
  assert.equal(buffers.totalSegments, 4);
  assert.equal(buffers.layerCount, 2);
  assert.equal(buffers.pathLengthMm, 40); // 10 + 10 + (10 + 10)
  assert.deepEqual(Array.from(buffers.layerStartSegment), [0, 2]);
  assert.deepEqual(Array.from(buffers.segmentLayer), [0, 0, 1, 1]);
  assert.equal(buffers.positions.length, 4 * 6);
  // First segment endpoints, unscaled.
  assert.deepEqual(Array.from(buffers.positions.slice(0, 6)), [0, 0, 0, 10, 0, 0]);
});

test("buildLineSegmentBuffers applies the mm->m unit scale by default", () => {
  const buffers = buildLineSegmentBuffers(syntheticPayload());
  assert.ok(Math.abs(buffers.positions[3] - 0.01) < 1e-9); // 10 mm -> 0.01 m
});

test("buildLineSegmentBuffers tolerates an empty payload", () => {
  const buffers = buildLineSegmentBuffers({});
  assert.equal(buffers.totalSegments, 0);
  assert.equal(segmentsVisibleForProgress(buffers, 0.5), 0);
});

test("segmentsVisibleForProgress quantizes to whole layers", () => {
  const buffers = buildLineSegmentBuffers(syntheticPayload(), { unitScale: 1 });
  assert.equal(segmentsVisibleForProgress(buffers, 0), 2); // layer 0 fully revealed
  assert.equal(segmentsVisibleForProgress(buffers, 0.4), 2);
  assert.equal(segmentsVisibleForProgress(buffers, 0.6), 4); // layer 1 -> everything
  assert.equal(segmentsVisibleForProgress(buffers, 1), 4);
});

test("segmentsVisibleForProgress without quantization is proportional and clamped", () => {
  const buffers = buildLineSegmentBuffers(syntheticPayload(), { unitScale: 1 });
  assert.equal(segmentsVisibleForProgress(buffers, 0, false), 0);
  assert.equal(segmentsVisibleForProgress(buffers, 0.5, false), 2);
  assert.equal(segmentsVisibleForProgress(buffers, 1, false), 4);
  assert.equal(segmentsVisibleForProgress(buffers, -1, false), 0);
  assert.equal(segmentsVisibleForProgress(buffers, 2, false), 4);
});
