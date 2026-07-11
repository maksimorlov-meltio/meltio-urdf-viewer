"""Convert meshes and toolpaths into JSON-friendly payloads for the web viewer."""

from __future__ import annotations

import numpy as np
import trimesh

from ..core.toolpath import Toolpath
from ..thermal.segments import ThermalSegment


def mesh_to_payload(mesh: trimesh.Trimesh, name: str) -> dict:
    """Serialise a mesh into indexed positions for Three.js BufferGeometry.

    Args:
        mesh: The mesh to serialise.
        name: Display name (typically the file name).

    Returns:
        A dict with flat ``positions`` (xyz per vertex), triangle ``indices``,
        and the axis-aligned ``bounds``.
    """
    vertices = np.asarray(mesh.vertices, dtype=np.float32)
    faces = np.asarray(mesh.faces, dtype=np.uint32)
    bounds = np.asarray(mesh.bounds, dtype=float)

    return {
        "name": name,
        "positions": vertices.reshape(-1).tolist(),
        "indices": faces.reshape(-1).tolist(),
        "bounds": {
            "min": bounds[0].tolist(),
            "max": bounds[1].tolist(),
        },
    }


def toolpath_to_payload(toolpath: Toolpath) -> dict:
    """Serialise a toolpath into per-kind polylines for line rendering.

    Each move becomes a flat ``[x, y, z, ...]`` list. Moves are grouped by
    ``kind`` so the frontend can colour perimeters, infill and support
    separately. An ordered ``moves`` list preserves the deposition order for the
    print simulation.

    Returns:
        A dict with ``perimeters``, ``infill`` and ``support`` polyline lists, an
        ordered ``moves`` list, plus summary ``stats`` (including
        ``maxTravelNoRetractMm``, the short/long travel threshold the viewer uses
        to classify and reveal the travel-line overlay in step with playback).
    """
    perimeters: list[list[float]] = []
    infill: list[list[float]] = []
    support: list[list[float]] = []
    moves: list[dict] = []

    for layer in toolpath.layers:
        for move in layer.moves:
            flat = np.asarray(move.points, dtype=np.float32).reshape(-1).tolist()
            if move.kind == "infill":
                infill.append(flat)
            elif move.kind in (
                "support",
                "support_outer_perimeter",
                "support_inner_perimeter",
            ):
                support.append(flat)
            else:
                perimeters.append(flat)
            entry = {"points": flat, "kind": move.kind, "layer": layer.index}
            # Per-move bead width so the preview can size each stroke's rendered
            # thickness to its feature (outer vs inner perimeter, infill, ...).
            # ``0.0`` means unset; the frontend falls back to the nominal width.
            if move.bead_width_mm > 0.0:
                entry["bead"] = float(move.bead_width_mm)
            # Per-point head orientation (unit tool-axis vectors) for moves that
            # follow tilted walls; omitted when the head stays vertical.
            if move.orientations is not None:
                entry["orient"] = (
                    np.asarray(move.orientations, dtype=np.float32).reshape(-1).tolist()
                )
            moves.append(entry)

    return {
        "perimeters": perimeters,
        "infill": infill,
        "support": support,
        "moves": moves,
        "stats": {
            "layers": len(toolpath.layers),
            "totalLengthMm": toolpath.total_length_mm,
            "totalExtrusionMm": toolpath.total_extrusion_mm,
            "estimatedTimeS": toolpath.estimated_time_s,
            "beadWidthMm": toolpath.parameters.bead_width_mm,
            "layerHeightMm": toolpath.parameters.layer_height_mm,
            "maxTravelNoRetractMm": float(
                getattr(toolpath.parameters, "max_travel_no_retract_mm", 2.0)
            ),
        },
    }


def _thermal_peak_series(
    normalised: np.ndarray,
    segments: list[ThermalSegment],
    buckets: int = 300,
) -> dict:
    """Down-sample per-segment scores into a mean-over-TIME envelope.

    Buckets the scores by their deposition *time* (not segment index) into
    ``buckets`` equal time intervals and averages each, so the horizontal axis
    is true print progress: a region printed quickly stays narrow even when it
    holds many short segments (e.g. a round top), while a slow region with few
    long segments (e.g. a square base) is not compressed. ``x`` is the time
    fraction (0..1) at each bucket centre. ``indexToTime`` maps an evenly spaced
    segment-index fraction to its cumulative time fraction so the viewer can
    place its (index-based) playback cursor on this time axis. The ``peak`` key
    name is kept for frontend compatibility.
    """
    n = int(normalised.size)
    if n == 0:
        return {"x": [], "peak": [], "indexToTime": []}

    durations = np.array(
        [max(s.end_time_s - s.start_time_s, 0.0) for s in segments], dtype=float
    )
    cum_end = np.cumsum(durations)
    total = float(cum_end[-1])
    if total <= 0.0:
        # No timing info: fall back to index as a pseudo-time so the axis still
        # spans 0..1 uniformly.
        durations = np.ones(n, dtype=float)
        cum_end = np.arange(1, n + 1, dtype=float)
        total = float(n)

    # Each segment's midpoint time fraction decides which time bucket it lands in.
    mid_frac = (cum_end - 0.5 * durations) / total

    buckets = max(1, min(buckets, n))
    bucket_idx = np.clip((mid_frac * buckets).astype(int), 0, buckets - 1)
    sums = np.bincount(bucket_idx, weights=normalised, minlength=buckets)
    counts = np.bincount(bucket_idx, minlength=buckets)

    # Carry the last filled value across any empty time bucket so the curve stays
    # continuous (empty buckets are rare since travel time is not modelled).
    peak: list[float] = []
    last = 0.0
    for b in range(buckets):
        if counts[b] > 0:
            last = float(sums[b] / counts[b])
        peak.append(last)
    x = [(b + 0.5) / buckets for b in range(buckets)]

    # Playback-cursor map: cumulative time fraction at evenly spaced index
    # positions, so the frontend can interpolate its index-based cursor onto the
    # time axis cheaply.
    samples = min(200, n)
    idx = np.linspace(0, n - 1, samples + 1).astype(int)
    index_to_time = (cum_end[idx] / total).tolist()
    return {"x": x, "peak": peak, "indexToTime": index_to_time}


def thermal_to_payload(
    toolpath: Toolpath, segments: list[ThermalSegment], scores: np.ndarray
) -> dict:
    """Serialise thermal scores as coloured toolpath chunks + a heat timeline.

    Each thermal segment is emitted as the short polyline of the toolpath it
    covers (``points``) plus its normalised heat ``score`` (0..1, relative), so
    the viewer can colour the actual toolpath geometry instead of a point cloud.
    A ``series`` gives the peak-heat envelope over print progress for the
    bottom-centre chart.

    Args:
        toolpath: The sliced toolpath the segments were built from (used to look
            up each segment's source-move polyline).
        segments: Thermal segments in deposition order.
        scores: Raw per-segment heat scores aligned with ``segments``.

    Returns:
        A dict with an ordered ``segments`` list (each ``{move, points,
        score, layer}``), a ``series`` (``{x, peak}``) and summary ``stats``.
    """
    scores = np.asarray(scores, dtype=float)
    score_min = float(scores.min()) if scores.size else 0.0
    score_max = float(scores.max()) if scores.size else 0.0
    spread = score_max - score_min
    normalised = (
        ((scores - score_min) / spread) if spread > 0 else np.zeros_like(scores)
    )

    moves = [move for layer in toolpath.layers for move in layer.moves]
    seg_payload: list[dict] = []
    for segment, norm in zip(segments, normalised):
        pts = np.asarray(moves[segment.track_id].points, dtype=np.float32)
        chunk = pts[segment.point_start : segment.point_end + 1]
        seg_payload.append(
            {
                "move": int(segment.track_id),
                "points": chunk.reshape(-1).tolist(),
                "score": float(norm),
                "layer": int(segment.layer_index),
            }
        )

    return {
        "segments": seg_payload,
        "series": _thermal_peak_series(normalised, segments),
        "stats": {
            "segmentCount": len(segments),
            "minScore": score_min,
            "maxScore": score_max,
        },
    }

