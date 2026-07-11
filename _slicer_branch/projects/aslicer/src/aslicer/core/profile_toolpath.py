"""Feature-aware toolpath generation driven by a :class:`MachineProfile`.

This is the slicer's toolpath generator: it reads each
:class:`~aslicer.profile.FeatureSettings` so every feature type gets its own
bead width (which drives the actual geometry — perimeter insets and infill line
spacing), feed rate, feeder and laser power.

Five feature types are produced, each tagged on its :class:`ToolpathMove.kind`:

* ``"outer_perimeter"`` — the outermost wall of a region.
* ``"inner_perimeter"`` — every wall inside the outer one.
* ``"infill"`` — the part interior fill.
* ``"support_outer_perimeter"`` — the outermost wall of a support island.
* ``"support_inner_perimeter"`` — every support wall inside the outer one.
* ``"support"`` — the support interior fill.

The module reuses the low-level move/geometry helpers from
:mod:`aslicer.core.toolpath` so there is a single implementation of densifying,
ring extraction and polygon iteration.
"""

from __future__ import annotations

import math
import random

import numpy as np
from shapely.geometry import Polygon

from ..profile import FeatureSettings, MachineProfile
from .infill import generate_infill_lines
from .orientation import wall_tool_axes
from .slicer import LayerContour, SlicedModel
from .support import SupportLayer
from .toolpath import (
    Toolpath,
    ToolpathLayer,
    ToolpathMove,
    _contour_to_polygon,
    _densify,
    _iter_polygons,
    _polyline_length,
    _rings_of,
)

# Closed-wall move kinds whose start vertex (the "seam") the seam-alignment pass
# may rotate. Infill and travel moves are left untouched.
_PERIMETER_KINDS = frozenset(
    {
        "outer_perimeter",
        "inner_perimeter",
        "support_outer_perimeter",
        "support_inner_perimeter",
    }
)
# Fixed RNG seed for the "random" seam mode, so re-slicing identical input gives
# an identical (but visually scattered) result instead of flickering each run.
_SEAM_RANDOM_SEED = 1234567


def _extrusion_mm(
    bead_width_mm: float,
    layer_height_mm: float,
    wire_diameter_mm: float,
    length_mm: float,
) -> float:
    """Feedstock length to deposit ``length_mm`` of a bead, by volume balance."""
    if length_mm <= 0:
        return 0.0
    bead_area = bead_width_mm * layer_height_mm
    wire_area = math.pi * (wire_diameter_mm / 2.0) ** 2
    return bead_area * length_mm / wire_area


def _ring_move(
    ring_xy: np.ndarray,
    z: float,
    profile: MachineProfile,
    feature: FeatureSettings,
    kind: str,
    mesh,
    overhang_only: bool,
) -> ToolpathMove | None:
    """Build a closed perimeter move for ``feature`` from a 2D ring."""
    if ring_xy.shape[0] < 2:
        return None

    points = np.column_stack([ring_xy, np.full(ring_xy.shape[0], z, dtype=float)])
    if not np.allclose(points[0], points[-1]):
        points = np.vstack([points, points[0]])
    points = _densify(points, profile.max_segment_length_mm)

    length = _polyline_length(points)
    if length <= 0.0:
        return None

    orientations = (
        wall_tool_axes(mesh, points, overhang_only) if mesh is not None else None
    )
    return ToolpathMove(
        points=points,
        closed=True,
        feed_mm_min=feature.feed_rate_mm_min,
        length_mm=length,
        extrusion_mm=_extrusion_mm(
            feature.bead_width_mm,
            profile.layer_height_mm,
            profile.material_diameter_mm,
            length,
        ),
        kind=kind,
        orientations=orientations,
        feeder=profile.feeder_for(_feature_key_for_kind(kind)),
        laser_power=feature.laser_power,
        bead_width_mm=feature.bead_width_mm,
    )


def _segment_move(
    segment_xy: np.ndarray,
    z: float,
    profile: MachineProfile,
    feature: FeatureSettings,
    kind: str,
) -> ToolpathMove | None:
    """Build an open infill move for ``feature`` from a 2D segment polyline."""
    if segment_xy.shape[0] < 2:
        return None

    points = np.column_stack(
        [segment_xy, np.full(segment_xy.shape[0], z, dtype=float)]
    )
    points = _densify(points, profile.max_segment_length_mm)
    length = _polyline_length(points)
    if length <= 0.0:
        return None

    return ToolpathMove(
        points=points,
        closed=False,
        feed_mm_min=feature.feed_rate_mm_min,
        length_mm=length,
        extrusion_mm=_extrusion_mm(
            feature.bead_width_mm,
            profile.layer_height_mm,
            profile.material_diameter_mm,
            length,
        ),
        kind=kind,
        feeder=profile.feeder_for(_feature_key_for_kind(kind)),
        laser_power=feature.laser_power,
        bead_width_mm=feature.bead_width_mm,
    )


def _feature_key_for_kind(kind: str) -> str:
    """Map a move ``kind`` to the profile feature key that configures it."""
    return kind


def _line_spacing(feature: FeatureSettings) -> float | None:
    """Centre-to-centre infill spacing for a filled feature, or ``None``."""
    density = feature.infill_density or 0.0
    if density <= 0.0:
        return None
    return feature.bead_width_mm / density


def _infill_angle(profile: MachineProfile, layer_index: int) -> float:
    """Infill line angle (deg) for ``layer_index`` under the profile's pattern.

    ``"alternating"`` flips the base angle by 90 deg on odd layers (the classic
    cross-hatch). ``"rotating"`` advances 45 deg per layer, cycling through four
    deposition directions so successive layers cross at finer angles.
    """
    base = profile.infill_angle_deg
    if profile.infill_pattern == "rotating":
        return base + 45.0 * layer_index
    return base + (90.0 if layer_index % 2 else 0.0)


def _reseam_move(move: ToolpathMove, cursor: np.ndarray | None, mode: str, rng: random.Random) -> None:
    """Rotate a closed perimeter move in place so it starts at its seam vertex.

    The ring's vertices are unchanged (so length/extrusion are preserved); only
    the start point — and the matching ``orientations`` entry — is rolled to the
    vertex chosen by ``mode``: ``"rear"`` picks the max-Y vertex, ``"random"``
    a scattered one, and ``"nearest"`` the vertex closest to ``cursor`` (the
    previous move's end). ``"nearest"`` with no cursor yet leaves the seam as-is.
    """
    pts = np.asarray(move.points, dtype=float)
    n = pts.shape[0]
    if n < 4 or not np.allclose(pts[0], pts[-1]):
        return  # not a usable closed ring
    distinct = n - 1  # drop the duplicated closing vertex when choosing a start

    if mode == "rear":
        start = int(np.argmax(pts[:distinct, 1]))
    elif mode == "random":
        start = rng.randrange(distinct)
    else:  # "nearest"
        if cursor is None:
            return
        deltas = pts[:distinct] - np.asarray(cursor, dtype=float)
        start = int(np.argmin((deltas * deltas).sum(axis=1)))
    if start == 0:
        return

    order = list(range(start, distinct)) + list(range(0, start + 1))
    move.points = pts[order]
    if move.orientations is not None:
        move.orientations = np.asarray(move.orientations, dtype=float)[order]


def _apply_seams(
    layers: list[ToolpathLayer], mode: str, cursor: np.ndarray | None = None
) -> None:
    """Reseam every closed perimeter move across ``layers`` in deposition order.

    Walks the moves in the same order the preview/playback reveals them,
    threading a running ``cursor`` (the previous move's end) so the ``"nearest"``
    mode minimises the travel onto each perimeter. ``"nearest"`` is approximate:
    the machine program may later reorder regions, but seams still track the
    generated order, which is exactly what the preview shows.
    """
    if mode == "nearest" and cursor is None:
        # Without a starting head position the very first seam is undefined;
        # leaving it lets the natural ring start stand.
        pass
    rng = random.Random(_SEAM_RANDOM_SEED)
    for layer in layers:
        for move in layer.moves:
            if move.closed and move.kind in _PERIMETER_KINDS:
                _reseam_move(move, cursor, mode, rng)
            pts = np.asarray(move.points, dtype=float)
            if pts.shape[0] >= 1:
                cursor = pts[-1]


def _contour_moves(
    contour: LayerContour,
    z: float,
    layer_index: int,
    profile: MachineProfile,
    mesh,
    overhang_only: bool,
    region: int,
) -> list[ToolpathMove]:
    """Perimeter walls (per-feature bead width) and infill for one contour."""
    polygon = _contour_to_polygon(contour)
    if polygon is None:
        return []

    outer = profile.features["outer_perimeter"]
    inner = profile.features["inner_perimeter"]
    infill = profile.features["infill"]

    # Collect concentric walls outer-to-inner. Each wall's centreline sits half
    # its own bead inside the previous wall's centreline (so adjacent beads just
    # touch). Because bead widths differ per feature, offsets are accumulated
    # explicitly rather than via a constant step.
    walls: list[list[ToolpathMove]] = []
    offset = 0.0
    prev_bead: float | None = None
    inner_offset = 0.0
    inner_bead = outer.bead_width_mm
    for index in range(profile.perimeter_count):
        feature = outer if index == 0 else inner
        kind = "outer_perimeter" if index == 0 else "inner_perimeter"
        if prev_bead is None:
            offset = feature.bead_width_mm / 2.0
        else:
            offset += (prev_bead + feature.bead_width_mm) / 2.0
        inset = polygon.buffer(-offset, join_style="mitre")

        wall_moves: list[ToolpathMove] = []
        for piece in _iter_polygons(inset):
            for ring in _rings_of(piece):
                move = _ring_move(ring, z, profile, feature, kind, mesh, overhang_only)
                if move is not None:
                    move.region = region
                    wall_moves.append(move)
        if not wall_moves:
            break
        walls.append(wall_moves)
        prev_bead = feature.bead_width_mm
        inner_offset = offset
        inner_bead = feature.bead_width_mm

    if profile.perimeter_order == "inside_out":
        walls.reverse()
    perimeter_moves = [move for wall in walls for move in wall]

    # If perimeters were requested but none fit, the region is thinner than a
    # single bead — skip infill rather than depositing a fill-only sliver.
    if profile.perimeter_count >= 1 and not walls:
        return perimeter_moves

    # Infill clears the inner edge of the innermost wall.
    clearance = (inner_offset + inner_bead / 2.0) if walls else outer.bead_width_mm / 2.0
    infill_moves = _infill_moves(polygon, z, layer_index, profile, infill, clearance)
    for move in infill_moves:
        move.region = region

    if profile.infill_before_perimeters:
        return infill_moves + perimeter_moves
    return perimeter_moves + infill_moves


def _infill_moves(
    polygon: Polygon,
    z: float,
    layer_index: int,
    profile: MachineProfile,
    feature: FeatureSettings,
    clearance: float,
) -> list[ToolpathMove]:
    """Rectilinear infill inside ``polygon``, inset by ``clearance``."""
    spacing = _line_spacing(feature)
    if spacing is None:
        return []

    interior = polygon.buffer(-clearance) if clearance > 0 else polygon
    if interior.is_empty:
        return []

    angle = _infill_angle(profile, layer_index)
    moves: list[ToolpathMove] = []
    for piece in _iter_polygons(interior):
        for segment in generate_infill_lines(
            piece, spacing, angle, profile.min_infill_segment_length_mm
        ):
            move = _segment_move(segment, z, profile, feature, "infill")
            if move is not None:
                moves.append(move)
    return moves


def generate_profile_toolpath(
    model: SlicedModel, profile: MachineProfile, mesh=None, progress=None
) -> Toolpath:
    """Build a part toolpath from a sliced model using a machine profile.

    Args:
        model: The sliced model to trace.
        profile: The machine profile providing per-feature process settings.
        mesh: Optional source mesh, used to orient perimeter walls when the
            profile is 5-axis and orientation is enabled.
        progress: Optional ``callback(done, total)`` invoked after each layer so
            callers can report slicing progress.

    Returns:
        A :class:`Toolpath` whose moves are tagged with the five feature kinds.
    """
    orient_mode = profile.effective_orient_perimeters
    use_mesh = mesh if orient_mode in ("all", "overhang") else None
    overhang_only = orient_mode == "overhang"

    layers: list[ToolpathLayer] = []
    total = len(model.layers)
    for done, layer in enumerate(model.layers, start=1):
        moves: list[ToolpathMove] = []
        for region_index, contour in enumerate(layer.contours):
            moves.extend(
                _contour_moves(
                    contour,
                    layer.z,
                    layer.index,
                    profile,
                    use_mesh,
                    overhang_only,
                    region_index,
                )
            )
        layers.append(ToolpathLayer(index=layer.index, z=layer.z, moves=moves))
        if progress is not None:
            progress(done, total)

    _apply_seams(layers, profile.seam_alignment)
    return Toolpath(layers=layers, parameters=profile.to_slice_parameters())


def generate_profile_support_toolpath(
    support_layers: list[SupportLayer], profile: MachineProfile, progress=None
) -> Toolpath:
    """Build a support toolpath (perimeter + infill) using a machine profile.

    Each support footprint gets ``profile.support_perimeter_count`` concentric
    perimeter walls (outermost ``"support_outer_perimeter"``, the rest
    ``"support_inner_perimeter"``) followed by rectilinear fill (``"support"``),
    each with its own feature settings — mirroring the part perimeter logic.

    Args:
        support_layers: Per-layer support footprints.
        profile: The machine profile providing support feature settings.
        progress: Optional ``callback(done, total)`` invoked after each layer so
            callers can report support-generation progress.

    Returns:
        A :class:`Toolpath` of support moves for every layer.
    """
    support = profile.features["support"]
    outer = profile.features["support_outer_perimeter"]
    inner = profile.features["support_inner_perimeter"]
    spacing = _line_spacing(support)

    layers: list[ToolpathLayer] = []
    total = len(support_layers)
    for done, layer in enumerate(support_layers, start=1):
        moves: list[ToolpathMove] = []
        for polygon in layer.polygons:
            # Concentric perimeter walls, outer-to-inner. Each wall's centreline
            # sits half its own bead inside the previous wall's centreline, so
            # adjacent beads just touch (offsets accumulated per bead width).
            walls: list[list[ToolpathMove]] = []
            offset = 0.0
            prev_bead: float | None = None
            inner_offset = 0.0
            inner_bead = outer.bead_width_mm
            for index in range(profile.support_perimeter_count):
                feature = outer if index == 0 else inner
                kind = (
                    "support_outer_perimeter"
                    if index == 0
                    else "support_inner_perimeter"
                )
                if prev_bead is None:
                    offset = feature.bead_width_mm / 2.0
                else:
                    offset += (prev_bead + feature.bead_width_mm) / 2.0
                inset = polygon.buffer(-offset, join_style="mitre")

                wall_moves: list[ToolpathMove] = []
                for piece in _iter_polygons(inset):
                    for ring in _rings_of(piece):
                        move = _ring_move(
                            ring, layer.z, profile, feature, kind, None, False
                        )
                        if move is not None:
                            wall_moves.append(move)
                if not wall_moves:
                    break
                walls.append(wall_moves)
                prev_bead = feature.bead_width_mm
                inner_offset = offset
                inner_bead = feature.bead_width_mm

            if profile.perimeter_order == "inside_out":
                walls.reverse()
            perimeter_moves = [move for wall in walls for move in wall]

            # If support perimeters were requested but none fit, this island is
            # thinner than a single bead (e.g. a pointy overhang tip) — skip its
            # infill rather than depositing a fill-only sliver.
            if profile.support_perimeter_count >= 1 and not walls:
                moves.extend(perimeter_moves)
                continue

            # Fill inside the innermost wall (or the whole footprint if there is
            # no room for a wall).
            clearance = (inner_offset + inner_bead / 2.0) if walls else 0.0
            interior = polygon.buffer(-clearance) if clearance > 0 else polygon
            infill_moves: list[ToolpathMove] = []
            if spacing is not None and not interior.is_empty:
                angle = _infill_angle(profile, layer.index)
                for piece in _iter_polygons(interior):
                    for segment in generate_infill_lines(
                        piece, spacing, angle, profile.min_infill_segment_length_mm
                    ):
                        move = _segment_move(
                            segment, layer.z, profile, support, "support"
                        )
                        if move is not None:
                            infill_moves.append(move)

            moves.extend(perimeter_moves + infill_moves)
        layers.append(ToolpathLayer(index=layer.index, z=layer.z, moves=moves))
        if progress is not None:
            progress(done, total)

    _apply_seams(layers, profile.seam_alignment)
    return Toolpath(layers=layers, parameters=profile.to_slice_parameters())
