"""Rectilinear infill: parallel line segments clipped to a region.

The infill produced here is intentionally *unconnected*: every clipped line
segment is returned independently, with no travel moves joining their ends.
Consecutive scan lines are deposited in alternating directions (boustrophedon
ordering), so the nozzle only has to jump a short distance to the near end of
the next line and then run back parallel toward the far side of the part.
"""

from __future__ import annotations

from typing import Iterator

import numpy as np
from shapely.affinity import rotate
from shapely.geometry import LineString, MultiLineString, Polygon


def _iter_linestrings(geom) -> Iterator[LineString]:
    """Yield each ``LineString`` from a line or multi-line intersection result."""
    if geom is None or geom.is_empty:
        return
    if isinstance(geom, LineString):
        yield geom
    elif isinstance(geom, MultiLineString):
        yield from geom.geoms


def generate_infill_lines(
    region: Polygon,
    spacing: float,
    angle_deg: float,
    min_length_mm: float = 0.0,
) -> list[np.ndarray]:
    """Clip a set of parallel lines to ``region``.

    Args:
        region: Polygon (with optional holes) to fill.
        spacing: Centre-to-centre distance between adjacent lines (mm).
        angle_deg: Orientation of the lines in degrees, measured CCW from +X.
        min_length_mm: Shortest clipped segment to keep; shorter ones are
            dropped. ``0`` keeps every segment.

    Returns:
        A list of ``(2, 2)`` XY arrays, one per clipped segment. Segments are
        independent (unconnected). Consecutive scan lines run in alternating
        directions so the deposition order zig-zags from one side to the other.
    """
    if region.is_empty or spacing <= 0.0:
        return []

    origin = region.centroid
    # Rotate the region so the candidate lines become axis-aligned (horizontal).
    aligned = rotate(region, -angle_deg, origin=origin)
    min_x, min_y, max_x, max_y = aligned.bounds

    if not np.isfinite([min_x, min_y, max_x, max_y]).all():
        return []

    # Sweep horizontal lines across the rotated bounding box, centred so the
    # pattern is stable regardless of the region's absolute position.
    span = max_y - min_y
    count = int(np.floor(span / spacing))
    if count < 1:
        return []
    centre = (min_y + max_y) / 2.0
    offsets = (np.arange(count + 1) - count / 2.0) * spacing

    segments: list[np.ndarray] = []
    flip = False
    for offset in offsets:
        y = centre + offset
        if y <= min_y or y >= max_y:
            continue
        scan = LineString([(min_x - 1.0, y), (max_x + 1.0, y)])
        clipped = aligned.intersection(scan)
        # Collect this scan line's clipped x-intervals (aligned frame). Rotation
        # preserves length, so an interval's width is its true segment length;
        # drop any shorter than the minimum here, before they are emitted.
        intervals: list[tuple[float, float]] = []
        for piece in _iter_linestrings(clipped):
            coords = np.asarray(piece.coords, dtype=float)
            if coords.shape[0] >= 2:
                xs = coords[:, 0]
                lo, hi = float(xs.min()), float(xs.max())
                if hi - lo >= min_length_mm:
                    intervals.append((lo, hi))
        if not intervals:
            continue
        intervals.sort()
        # Alternate the deposition direction every scan line: even lines run
        # left->right, odd lines run right->left (and visit their intervals in
        # reverse). Each line stays a separate, unconnected segment — only the
        # endpoint ORDER changes, so the jump to the next line is short.
        if flip:
            ordered = [(b, a) for (a, b) in reversed(intervals)]
        else:
            ordered = [(a, b) for (a, b) in intervals]
        flip = not flip
        for x_start, x_end in ordered:
            # Rotate the directed segment back into the original frame.
            restored = rotate(LineString([(x_start, y), (x_end, y)]), angle_deg, origin=origin)
            coords = np.asarray(restored.coords, dtype=float)
            if coords.shape[0] >= 2:
                segments.append(coords)

    return segments
