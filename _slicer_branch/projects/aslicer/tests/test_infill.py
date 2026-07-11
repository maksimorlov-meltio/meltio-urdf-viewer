"""Tests for rectilinear infill generation."""

from __future__ import annotations

import numpy as np
import trimesh
from shapely.geometry import Polygon

from aslicer.core import generate_infill_lines, generate_profile_toolpath, slice_mesh
from aslicer.core.toolpath import ToolpathMove
from aslicer.profile import MachineProfile, default_profile


def _toolpath(mesh: trimesh.Trimesh, **overrides):
    """Slice ``mesh`` and trace it with a profile built from ``overrides``."""
    data = default_profile().to_dict()
    infill = overrides.pop("infill_density", None)
    data.update(overrides)
    if infill is not None:
        data["features"]["infill"]["infill_density"] = infill
    profile = MachineProfile.from_dict(data)
    model = slice_mesh(mesh, profile.to_slice_parameters())
    return generate_profile_toolpath(model, profile, mesh)


def _unit_box() -> trimesh.Trimesh:
    # 10 x 10 x 10 box centred so its base sits at z = 0.
    box = trimesh.creation.box(extents=(10.0, 10.0, 10.0))
    box.apply_translation((0.0, 0.0, 5.0))
    return box


def test_infill_lines_are_clipped_to_region() -> None:
    square = Polygon([(0, 0), (10, 0), (10, 10), (0, 10)])
    segments = generate_infill_lines(square, spacing=2.0, angle_deg=0.0)

    assert len(segments) > 0
    for seg in segments:
        assert seg.shape == (2, 2)
        # Horizontal lines: equal Y, and X spans within the square.
        assert np.isclose(seg[0, 1], seg[1, 1])
        assert seg[:, 0].min() >= -1e-6
        assert seg[:, 0].max() <= 10 + 1e-6


def test_min_length_drops_short_segments() -> None:
    # A right triangle yields progressively shorter scan lines toward the apex;
    # a minimum length removes the short ones near the tip.
    triangle = Polygon([(0, 0), (10, 0), (0, 10)])
    long_only = generate_infill_lines(
        triangle, spacing=1.0, angle_deg=0.0, min_length_mm=5.0
    )
    assert long_only, "expected some segments to survive"
    for seg in long_only:
        assert abs(seg[1, 0] - seg[0, 0]) >= 5.0 - 1e-9

    unfiltered = generate_infill_lines(triangle, spacing=1.0, angle_deg=0.0)
    assert len(long_only) < len(unfiltered)


def test_infill_disabled_by_default() -> None:
    toolpath = _toolpath(_unit_box(), infill_density=0.0)
    infill_moves = [
        m for layer in toolpath.layers for m in layer.moves if m.kind == "infill"
    ]
    assert infill_moves == []


def test_infill_adds_open_unconnected_moves() -> None:
    toolpath = _toolpath(_unit_box(), perimeter_count=1, infill_density=0.4)

    infill_moves: list[ToolpathMove] = [
        m for layer in toolpath.layers for m in layer.moves if m.kind == "infill"
    ]
    assert len(infill_moves) > 0
    for move in infill_moves:
        # Unconnected => open moves, not closed loops.
        assert move.closed is False
        assert not np.allclose(move.points[0], move.points[-1])
        assert move.length_mm > 0.0


def test_higher_density_adds_more_infill() -> None:
    low = _toolpath(_unit_box(), infill_density=0.2)
    high = _toolpath(_unit_box(), infill_density=0.8)

    def infill_length(tp) -> float:
        return sum(
            m.length_mm for layer in tp.layers for m in layer.moves if m.kind == "infill"
        )

    assert infill_length(high) > infill_length(low) > 0.0
