// Tube (bead) geometry for the toolpath, built to mirror the slicer's "Tubes"
// preview so the printed model reads as solid weld beads rather than thin lines.
//
// Design constraint: reveal must stay in lock-step with the line reveal and the
// bed tracing, both of which work per line-SEGMENT. So we build ONE octagonal
// bead prism per line segment, in the same order as the line buffers, with a
// fixed index count per segment. Revealing the first N segments is then a single
// setDrawRange(0, N * INDICES_PER_SEGMENT) — identical granularity to the lines.
//
// The cross-section is a flat weld bead: wider (beadWidth) than tall (layerHeight),
// matching the slicer's separate halfWidth/halfHeight sweep. Corners are faceted
// (each segment is its own straight prism); for the dense real toolpaths this is
// visually indistinguishable from the slicer's rounded sweep at normal zoom.
//
// Pure THREE geometry, no DOM. Source parity: slicer app.js buildSweptTube /
// buildToolpathTubes (flat-bead octagon, per-feature bead width).

const SIDES = 8;
export const INDICES_PER_SEGMENT = SIDES * 6; // 8 side quads -> 16 tris -> 48 indices
const VERTS_PER_SEGMENT = SIDES * 2; // one ring at each end

// Unit octagon ring offsets (cos, sin) reused for every segment.
const RING = [];
for (let k = 0; k < SIDES; k += 1) {
  const a = (k / SIDES) * Math.PI * 2;
  RING.push([Math.cos(a), Math.sin(a)]);
}

// Build a merged, indexed bead mesh from the line-segment buffers produced by
// toolpathModel.buildLineSegmentBuffers (positions in host world units, 2 verts
// per segment; colors matching). `beadWidthMm`/`layerHeightMm` set the flat
// cross-section; `unitScale` converts mm to the buffers' units (metres).
//
// Returns { positions, normals, colors, indices, totalSegments, indicesPerSegment }.
export function buildTubeBuffers(lineBuffers, options = {}) {
  const src = lineBuffers && lineBuffers.positions;
  const totalSegments = lineBuffers ? lineBuffers.totalSegments : 0;
  if (!src || totalSegments <= 0) {
    return null;
  }
  const srcColors = lineBuffers.colors;
  const unitScale = Number.isFinite(options.unitScale) ? options.unitScale : 0.001;
  const halfW = Math.max(((options.beadWidthMm || 1.0) * unitScale) / 2, 1e-5);
  const halfH = Math.max(((options.layerHeightMm || options.beadWidthMm || 0.6) * unitScale) / 2, 1e-5);

  const positions = new Float32Array(totalSegments * VERTS_PER_SEGMENT * 3);
  const normals = new Float32Array(totalSegments * VERTS_PER_SEGMENT * 3);
  const colors = new Float32Array(totalSegments * VERTS_PER_SEGMENT * 3);
  const indices = new Uint32Array(totalSegments * INDICES_PER_SEGMENT);

  let vp = 0; // vertex-float cursor
  let ip = 0; // index cursor
  for (let s = 0; s < totalSegments; s += 1) {
    const o = s * 6;
    const ax = src[o], ay = src[o + 1], az = src[o + 2];
    const bx = src[o + 3], by = src[o + 4], bz = src[o + 5];
    // Segment direction.
    let dx = bx - ax, dy = by - ay, dz = bz - az;
    const dl = Math.hypot(dx, dy, dz) || 1;
    dx /= dl; dy /= dl; dz /= dl;
    // u = horizontal perpendicular (bead width), v = the remaining perpendicular
    // (bead height). d x worldZ gives an in-plane width axis; degenerate only for
    // a perfectly vertical segment, where we fall back to world X.
    let ux = dy * 1 - dz * 0, uy = dz * 0 - dx * 1, uz = dx * 0 - dy * 0; // d x (0,0,1)
    let ul = Math.hypot(ux, uy, uz);
    if (ul < 1e-6) { ux = 1; uy = 0; uz = 0; ul = 1; }
    ux /= ul; uy /= ul; uz /= ul;
    const vx = dy * uz - dz * uy, vy = dz * ux - dx * uz, vz = dx * uy - dy * ux; // d x u
    const baseVert = s * VERTS_PER_SEGMENT;
    for (let k = 0; k < SIDES; k += 1) {
      const c = RING[k][0], sn = RING[k][1];
      const ox = c * halfW * ux + sn * halfH * vx;
      const oy = c * halfW * uy + sn * halfH * vy;
      const oz = c * halfW * uz + sn * halfH * vz;
      const nl = Math.hypot(ox, oy, oz) || 1;
      // ring A (at a), then ring B (at b) — interleaved per side index k.
      positions[vp] = ax + ox; positions[vp + 1] = ay + oy; positions[vp + 2] = az + oz;
      normals[vp] = ox / nl; normals[vp + 1] = oy / nl; normals[vp + 2] = oz / nl;
      vp += 3;
      positions[vp] = bx + ox; positions[vp + 1] = by + oy; positions[vp + 2] = bz + oz;
      normals[vp] = ox / nl; normals[vp + 1] = oy / nl; normals[vp + 2] = oz / nl;
      vp += 3;
    }
    // Per-segment colour = the segment's line colour (first vertex of the pair).
    let cr = 0.55, cg = 0.7, cb = 0.9;
    if (srcColors) { cr = srcColors[o]; cg = srcColors[o + 1]; cb = srcColors[o + 2]; }
    for (let k = 0; k < VERTS_PER_SEGMENT; k += 1) {
      const ci = (baseVert + k) * 3;
      colors[ci] = cr; colors[ci + 1] = cg; colors[ci + 2] = cb;
    }
    // Side quads: vertex layout per side k is [Ak, Bk] at baseVert + k*2.
    for (let k = 0; k < SIDES; k += 1) {
      const k2 = (k + 1) % SIDES;
      const a0 = baseVert + k * 2;      // A_k
      const b0 = baseVert + k * 2 + 1;  // B_k
      const a1 = baseVert + k2 * 2;     // A_{k+1}
      const b1 = baseVert + k2 * 2 + 1; // B_{k+1}
      indices[ip++] = a0; indices[ip++] = b0; indices[ip++] = b1;
      indices[ip++] = a0; indices[ip++] = b1; indices[ip++] = a1;
    }
  }

  return { positions, normals, colors, indices, totalSegments, indicesPerSegment: INDICES_PER_SEGMENT };
}
