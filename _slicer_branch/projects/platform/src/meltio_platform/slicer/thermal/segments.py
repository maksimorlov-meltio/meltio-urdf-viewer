"""Convert a deposition toolpath into fixed-length :class:`ThermalSegment` nodes.

A :class:`ThermalSegment` is the atomic unit of the thermal model — a short
piece of a deposition track with a position, timing window and process settings.
The slicer already densifies long runs to ``max_segment_length_mm``; here we walk
each move's polyline and **accumulate** consecutive sub-segments (including the
short ones produced on rounded corners) until they reach a target length, so the
node count stays bounded and roughly uniform regardless of corner tessellation.

The same segment list is reused unchanged by the moving-source model today and
by a future graph/RC solver (where each segment becomes a node).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from ..core.toolpath import Toolpath

# Fallback target length (mm) when the toolpath carries no max-segment setting.
_DEFAULT_TARGET_MM = 5.0

# Map a toolpath move ``kind`` to a coarse thermal feature category. The model
# does not yet treat these differently, but carrying the category keeps the
# segment self-describing for visualisation and for a later graph solver (which
# may, e.g., give support/contact neighbours a different conductance).
_FEATURE_BY_KIND = {
    "outer_perimeter": "wall",
    "inner_perimeter": "wall",
    "infill": "hatch",
    "support": "support",
    "support_outer_perimeter": "support",
    "support_inner_perimeter": "support",
}


def _feature_for_kind(kind: str) -> str:
    """Classify a move ``kind`` into a coarse thermal feature category."""
    return _FEATURE_BY_KIND.get(kind, "wall")


@dataclass
class ThermalSegment:
    """A small, fixed-length piece of a deposition track.

    Attributes:
        segment_id: Global zero-based index in deposition order.
        track_id: Index of the source move ("track") in deposition order — the
            move's position in the flattened ``layers[*].moves`` sequence — so
            segments of the same stroke share a track and callers can map a
            segment back onto the originating move.
        point_start: Index (within the source move's points) of this chunk's
            first point.
        point_end: Index (within the source move's points) of this chunk's last
            point. ``points[point_start:point_end + 1]`` is the chunk polyline.
        layer_index: Zero-based layer the segment belongs to.
        center: ``(3,)`` XYZ midpoint of the segment (mm).
        length_mm: Deposited length of the segment (mm).
        bead_width_mm: Bead width of the source move (mm).
        layer_height_mm: Layer height of the toolpath (mm).
        start_time_s: Time deposition of this segment starts (s).
        end_time_s: Time deposition of this segment ends (s).
        laser_power: Laser power of the source move (machine units).
        travel_speed_mm_s: Deposition speed of the source move (mm/s).
        wire_feed_mm_s: Feedstock consumption rate of the source move (mm/s).
        feature: Coarse feature category (``"wall"``/``"hatch"``/``"support"``/
            ``"repair"``).
    """

    segment_id: int
    track_id: int
    point_start: int
    point_end: int
    layer_index: int
    center: np.ndarray
    length_mm: float
    bead_width_mm: float
    layer_height_mm: float
    start_time_s: float
    end_time_s: float
    laser_power: float
    travel_speed_mm_s: float
    wire_feed_mm_s: float
    feature: str

    @property
    def duration_s(self) -> float:
        """How long this segment takes to deposit (s)."""
        return self.end_time_s - self.start_time_s


def build_thermal_segments(
    toolpath: Toolpath, target_segment_length_mm: float | None = None
) -> list[ThermalSegment]:
    """Convert a toolpath into ordered, fixed-length thermal segments.

    Walks the toolpath layer by layer (bottom to top) and, within each layer,
    move by move in deposition order. Each move's polyline is split into chunks
    of about ``target_segment_length_mm`` by accumulating consecutive points
    until the running length reaches the target (the trailing remainder becomes
    one shorter segment). A monotonically increasing clock assigns each segment a
    deposition window from its length and the move's speed; travel time between
    moves is ignored (qualitative first pass).

    Args:
        toolpath: The sliced deposition toolpath to convert.
        target_segment_length_mm: Desired segment length (mm). When ``None`` or
            non-positive, :data:`_DEFAULT_TARGET_MM` is used.

    Returns:
        The thermal segments in deposition order.
    """
    params = toolpath.parameters
    target = target_segment_length_mm
    if target is None or target <= 0:
        # ``SliceParameters`` (the toolpath's parameters) does not carry the
        # densification setting — that lives on the machine profile — so fall
        # back to the default target, which matches the profile default.
        target = _DEFAULT_TARGET_MM
    nominal_bead = params.bead_width_mm
    layer_height = params.layer_height_mm
    fallback_speed = params.speed_mm_s

    segments: list[ThermalSegment] = []
    clock = 0.0
    seg_id = 0
    move_index = -1

    for layer in toolpath.layers:
        for move in layer.moves:
            move_index += 1
            points = np.asarray(move.points, dtype=float)
            if points.shape[0] < 2:
                continue

            speed = move.feed_mm_min / 60.0
            if speed <= 0.0:
                speed = fallback_speed if fallback_speed > 0 else 1.0
            bead = move.bead_width_mm if move.bead_width_mm > 0.0 else nominal_bead
            feature = _feature_for_kind(move.kind)

            # Per-mm feedstock consumption, spread uniformly across the move.
            move_length = float(
                np.linalg.norm(np.diff(points, axis=0), axis=1).sum()
            )
            wire_feed = (
                move.extrusion_mm / (move_length / speed)
                if move_length > 0.0 and speed > 0.0
                else 0.0
            )

            chunk_start = points[0]
            chunk_start_idx = 0
            chunk_len = 0.0
            last_point_index = points.shape[0] - 1
            for k in range(1, points.shape[0]):
                a = points[k - 1]
                b = points[k]
                chunk_len += float(np.linalg.norm(b - a))
                # Emit a segment once we reach the target length, or when the
                # move ends (so the trailing remainder is not dropped).
                if chunk_len >= target or k == last_point_index:
                    if chunk_len <= 0.0:
                        chunk_start = b
                        chunk_start_idx = k
                        continue
                    duration = chunk_len / speed
                    segments.append(
                        ThermalSegment(
                            segment_id=seg_id,
                            track_id=move_index,
                            point_start=chunk_start_idx,
                            point_end=k,
                            layer_index=layer.index,
                            center=(chunk_start + b) / 2.0,
                            length_mm=chunk_len,
                            bead_width_mm=bead,
                            layer_height_mm=layer_height,
                            start_time_s=clock,
                            end_time_s=clock + duration,
                            laser_power=move.laser_power,
                            travel_speed_mm_s=speed,
                            wire_feed_mm_s=wire_feed,
                            feature=feature,
                        )
                    )
                    clock += duration
                    seg_id += 1
                    chunk_start = b
                    chunk_start_idx = k
                    chunk_len = 0.0

    return segments
