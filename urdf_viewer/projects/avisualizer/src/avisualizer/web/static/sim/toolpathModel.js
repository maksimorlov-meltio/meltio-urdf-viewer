// Pure, dependency-free conversion of the aslicer toolpath contract into
// flat buffers ready for a THREE.LineSegments / setDrawRange progressive reveal.
//
// Input shape (aslicer `POST /api/slice` -> serialize.toolpath_to_payload):
//   {
//     moves: [{ points: [x,y,z, x,y,z, ...], kind, layer, bead?, orient? }, ...],
//     stats: { layers, layerHeightMm, beadWidthMm, ... }
//   }
// Coordinates are millimetres, ordered in deposition order, model rested at z=0.
//
// This module contains NO Three.js and NO DOM access on purpose: it is the clean
// seam between the slicer data contract and the renderer, and is unit-testable in
// isolation (Node or browser).

const KIND_COLORS = Object.freeze({
  outer_perimeter: [0.36, 0.74, 1.0],
  inner_perimeter: [0.28, 0.58, 0.92],
  infill: [0.27, 0.79, 0.51],
  support: [0.85, 0.65, 0.24],
  support_outer_perimeter: [0.85, 0.65, 0.24],
  support_inner_perimeter: [0.78, 0.58, 0.2],
});

const DEFAULT_COLOR = [0.55, 0.7, 0.9];

function colorForKind(kind) {
  return KIND_COLORS[kind] || DEFAULT_COLOR;
}

// Build line-segment buffers from ordered moves.
//
// Returns:
//   {
//     positions: Float32Array,   // 2 vertices (6 floats) per segment, print order
//     colors:    Float32Array,   // matching per-vertex RGB
//     segmentLayer: Int32Array,  // layer index per segment
//     layerStartSegment: Int32Array, // first segment index of each layer
//     totalSegments: number,
//     layerCount: number,
//     scale: number              // multiply positions by this to get host world units (mm -> m)
//   }
//
// `unitScale` defaults to 0.001 (mm -> metres) to match the host viewer's world
// units; pass 1 to keep millimetres.
export function buildLineSegmentBuffers(payload, options = {}) {
  const unitScale = Number.isFinite(options.unitScale) ? options.unitScale : 0.001;
  const moves = Array.isArray(payload?.moves) ? payload.moves : [];

  // First pass: count segments so we can allocate typed arrays once.
  let totalSegments = 0;
  let maxLayer = 0;
  for (const move of moves) {
    const pts = move?.points;
    if (!Array.isArray(pts) || pts.length < 6) {
      continue;
    }
    const vertexCount = Math.floor(pts.length / 3);
    totalSegments += Math.max(0, vertexCount - 1);
    const layer = Number.isFinite(move?.layer) ? move.layer : 0;
    if (layer > maxLayer) {
      maxLayer = layer;
    }
  }

  const positions = new Float32Array(totalSegments * 6);
  const colors = new Float32Array(totalSegments * 6);
  const segmentLayer = new Int32Array(totalSegments);

  let seg = 0;
  let pathLengthMm = 0; // total polyline length in the payload's native units (mm)
  // The layer-reveal math below assumes moves arrive in print order (layer
  // indices monotonic). The slicer emits them that way; if that contract ever
  // breaks, flag it instead of silently mis-grouping the reveal.
  let lastLayer = -Infinity;
  let monotonicLayers = true;
  for (const move of moves) {
    const pts = move?.points;
    if (!Array.isArray(pts) || pts.length < 6) {
      continue;
    }
    const layer = Number.isFinite(move?.layer) ? move.layer : 0;
    if (layer < lastLayer) {
      monotonicLayers = false;
    }
    lastLayer = layer;
    const [r, g, b] = colorForKind(move?.kind);
    const vertexCount = Math.floor(pts.length / 3);
    for (let i = 0; i < vertexCount - 1; i += 1) {
      const a = i * 3;
      const c = (i + 1) * 3;
      const o = seg * 6;
      positions[o] = pts[a] * unitScale;
      positions[o + 1] = pts[a + 1] * unitScale;
      positions[o + 2] = pts[a + 2] * unitScale;
      positions[o + 3] = pts[c] * unitScale;
      positions[o + 4] = pts[c + 1] * unitScale;
      positions[o + 5] = pts[c + 2] * unitScale;
      colors[o] = r; colors[o + 1] = g; colors[o + 2] = b;
      colors[o + 3] = r; colors[o + 4] = g; colors[o + 5] = b;
      segmentLayer[seg] = layer;
      const dx = pts[c] - pts[a];
      const dy = pts[c + 1] - pts[a + 1];
      const dz = pts[c + 2] - pts[a + 2];
      pathLengthMm += Math.sqrt(dx * dx + dy * dy + dz * dz);
      seg += 1;
    }
  }

  if (!monotonicLayers) {
    console.warn(
      "[toolpathModel] moves are not in layer order; the layer-by-layer reveal may be inaccurate",
    );
  }

  const layerCount = Math.max(
    1,
    Number.isFinite(payload?.stats?.layers) ? payload.stats.layers : maxLayer + 1,
  );

  // Index of the first segment belonging to each layer (segments are already in
  // print order, so layers are contiguous and monotonic).
  const layerStartSegment = new Int32Array(layerCount);
  let cursor = 0;
  for (let layer = 0; layer < layerCount; layer += 1) {
    layerStartSegment[layer] = cursor;
    while (cursor < totalSegments && segmentLayer[cursor] === layer) {
      cursor += 1;
    }
  }

  return {
    positions,
    colors,
    segmentLayer,
    layerStartSegment,
    totalSegments,
    layerCount,
    pathLengthMm,
    monotonicLayers,
    scale: 1,
  };
}

// Map a 0..1 progress value to the number of segments that should be visible.
// Quantized to whole layers when `quantizeToLayers` is true so the print reveals
// layer-by-layer rather than mid-layer.
export function segmentsVisibleForProgress(buffers, progress, quantizeToLayers = true) {
  const clamped = Math.min(Math.max(progress, 0), 1);
  if (!buffers || buffers.totalSegments <= 0) {
    return 0;
  }
  if (!quantizeToLayers) {
    return Math.round(clamped * buffers.totalSegments);
  }
  const layer = Math.min(
    buffers.layerCount - 1,
    Math.floor(clamped * buffers.layerCount),
  );
  // Reveal everything up to and including `layer`.
  const next = layer + 1;
  return next >= buffers.layerCount
    ? buffers.totalSegments
    : buffers.layerStartSegment[next];
}
