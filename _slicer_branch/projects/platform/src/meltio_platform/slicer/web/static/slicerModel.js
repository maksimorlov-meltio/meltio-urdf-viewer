// Pure, dependency-free slicer data logic — NO THREE, NO DOM — so it is unit
// testable in isolation (Node or browser). The stateful `app.js` calls these
// and wires the results into globals / the scene. Mirrors the viewer's
// `sim/toolpathModel.js` split (same `moves` payload contract).

// Is the model outside the printable envelope? All arguments are plain data:
//   bounds      = { min: [x,y,z], max: [x,y,z] }   (mesh bounds, mm)
//   buildVolume = { x, y, z? }                      (z defaults to unbounded)
//   offset      = { x, y, z }                       (un-committed placement drag)
export function modelOutOfBounds(bounds, buildVolume, offset) {
  if (!bounds || !buildVolume) return false;
  const bx = buildVolume.x;
  const by = buildVolume.y;
  const bz = buildVolume.z ?? Infinity;
  if (!(bx > 0) || !(by > 0)) return false;
  const ox = offset?.x || 0;
  const oy = offset?.y || 0;
  const oz = offset?.z || 0;
  const { min, max } = bounds;
  const eps = 1e-3;
  return (
    min[0] + ox < -eps || max[0] + ox > bx + eps ||
    min[1] + oy < -eps || max[1] + oy > by + eps ||
    min[2] + oz < -eps || max[2] + oz > bz + eps
  );
}

// A representative deposition speed (mm/s) for a profile: the first positive
// perimeter/infill feed rate, else any feature's, else travel speed, else null.
// Feeds true-1x print playback in the embedding viewer, so a wrong value here
// desyncs the simulation from reality.
export function representativeMoveSpeedMmPerSec(profile) {
  if (!profile) return null;
  const feats = profile.features || {};
  const preferred = ["outer_perimeter", "inner_perimeter", "infill"];
  for (const key of preferred) {
    const v = feats[key] && feats[key].feed_rate_mm_s;
    if (Number.isFinite(v) && v > 0) return v;
  }
  for (const key of Object.keys(feats)) {
    const v = feats[key] && feats[key].feed_rate_mm_s;
    if (Number.isFinite(v) && v > 0) return v;
  }
  return Number.isFinite(profile.travel_speed_mm_s) && profile.travel_speed_mm_s > 0
    ? profile.travel_speed_mm_s
    : null;
}

// Flatten the slicer `moves` payload into ordered line segments (deposition
// order) plus the per-move records the renderer/legend need.
//   moves       = [{ points:[x,y,z,...], kind, layer, orient?, bead? }, ...]
//   kindColors  = { <kind>: <color> }   defaultColor used when a kind is absent
// Returns { segments, moves: flatMoves, present:Set<kind> }.
export function flattenMoves(moves, kindColors = {}, defaultColor = 0xffffff) {
  const segments = [];
  const flatMoves = [];
  const present = new Set();
  for (const move of moves || []) {
    const flat = move.points;
    if (!Array.isArray(flat)) continue;
    const orient = move.orient || null;
    const bead = move.bead || null;
    const kind = move.kind || "outer_perimeter";
    const layer = move.layer ?? 0;
    const col = kindColors[kind] || defaultColor;
    const segCount = Math.max(0, Math.floor(flat.length / 3) - 1);
    if (segCount > 0) {
      present.add(kind);
      flatMoves.push({ pts: flat, color: col, segCount, orient, bead, kind, layer });
    }
    for (let i = 0; i + 5 < flat.length; i += 3) {
      const bIdx = i / 3 + 1; // orientation index of the segment's end point
      segments.push({
        a: [flat[i], flat[i + 1], flat[i + 2]],
        b: [flat[i + 3], flat[i + 4], flat[i + 5]],
        color: col,
        kind,
        layer,
        orient: orient
          ? [orient[bIdx * 3], orient[bIdx * 3 + 1], orient[bIdx * 3 + 2]]
          : null,
      });
    }
  }
  return { segments, moves: flatMoves, present };
}

// Whether the gaps between consecutive deposition moves contain short and/or
// long travels, relative to `threshold` (mm). Drives the legend's travel toggles.
export function detectTravels(flatMoves, threshold) {
  let hasShortTravel = false;
  let hasLongTravel = false;
  for (let i = 1; i < flatMoves.length; i += 1) {
    const prev = flatMoves[i - 1].pts;
    const cur = flatMoves[i].pts;
    const dx = cur[0] - prev[prev.length - 3];
    const dy = cur[1] - prev[prev.length - 2];
    const dz = cur[2] - prev[prev.length - 1];
    const gap = Math.hypot(dx, dy, dz);
    if (gap <= 1e-6) continue;
    if (gap > threshold) hasLongTravel = true;
    else hasShortTravel = true;
    if (hasShortTravel && hasLongTravel) break;
  }
  return { hasShortTravel, hasLongTravel };
}
