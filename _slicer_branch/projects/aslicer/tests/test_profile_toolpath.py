"""Tests for the per-feature, profile-driven toolpath generator."""

from __future__ import annotations

import numpy as np
import pytest
import trimesh

from aslicer.core import (
    generate_profile_support_toolpath,
    generate_profile_toolpath,
    slice_mesh,
    support_layer_footprints,
)
from aslicer.core.support import SupportLayer
from aslicer.profile import MachineProfile, default_profile
from shapely.geometry import Polygon


def _box() -> trimesh.Trimesh:
    box = trimesh.creation.box(extents=(14.0, 14.0, 6.0))
    box.apply_translation((0.0, 0.0, 3.0))
    return box


def _funnel() -> trimesh.Trimesh:
    cone = trimesh.creation.cone(radius=6.0, height=12.0, sections=64)
    cone.apply_transform(trimesh.transformations.rotation_matrix(np.pi, (1, 0, 0)))
    cone.apply_translation((0.0, 0.0, -cone.bounds[0][2]))
    return cone


def _profile(**overrides) -> MachineProfile:
    data = default_profile().to_dict()
    data.update(overrides)
    return MachineProfile.from_dict(data)


def _all_moves(toolpath):
    return [move for layer in toolpath.layers for move in layer.moves]


def test_infill_angle_alternating_vs_rotating() -> None:
    from aslicer.core.profile_toolpath import _infill_angle

    alternating = _profile(infill_pattern="alternating", infill_angle_deg=45.0)
    assert _infill_angle(alternating, 0) == pytest.approx(45.0)
    assert _infill_angle(alternating, 1) == pytest.approx(135.0)
    assert _infill_angle(alternating, 2) == pytest.approx(45.0)

    rotating = _profile(infill_pattern="rotating", infill_angle_deg=45.0)
    assert _infill_angle(rotating, 0) == pytest.approx(45.0)
    assert _infill_angle(rotating, 1) == pytest.approx(90.0)
    assert _infill_angle(rotating, 2) == pytest.approx(135.0)
    assert _infill_angle(rotating, 3) == pytest.approx(180.0)


def _closed_perimeters(toolpath):
    return [
        m
        for m in _all_moves(toolpath)
        if m.closed and m.kind in ("outer_perimeter", "inner_perimeter")
    ]


def test_seam_rear_starts_at_rearmost_vertex() -> None:
    profile = _profile(seam_alignment="rear", perimeter_count=2)
    box = _box()
    toolpath = generate_profile_toolpath(
        slice_mesh(box, profile.to_slice_parameters()), profile, box
    )
    perims = _closed_perimeters(toolpath)
    assert perims
    for move in perims:
        pts = np.asarray(move.points)
        # The seam (start vertex) is the rear-most point of the ring.
        assert pts[0, 1] == pytest.approx(pts[:, 1].max())


def test_seam_modes_preserve_closed_rings_and_length() -> None:
    box = _box()
    base = _profile(perimeter_count=2)
    ref = generate_profile_toolpath(
        slice_mesh(box, base.to_slice_parameters()), base, box
    )
    ref_lengths = sorted(m.length_mm for m in _closed_perimeters(ref))
    for mode in ("nearest", "rear", "random"):
        profile = _profile(seam_alignment=mode, perimeter_count=2)
        toolpath = generate_profile_toolpath(
            slice_mesh(box, profile.to_slice_parameters()), profile, box
        )
        perims = _closed_perimeters(toolpath)
        assert perims
        for move in perims:
            pts = np.asarray(move.points)
            # Reseaming only rotates the ring: it stays closed and same length.
            assert np.allclose(pts[0], pts[-1])
        assert sorted(m.length_mm for m in perims) == pytest.approx(ref_lengths)


def test_seam_random_is_deterministic() -> None:
    box = _box()

    def first_starts():
        profile = _profile(seam_alignment="random", perimeter_count=2)
        toolpath = generate_profile_toolpath(
            slice_mesh(box, profile.to_slice_parameters()), profile, box
        )
        return [tuple(np.asarray(m.points)[0]) for m in _closed_perimeters(toolpath)]

    assert first_starts() == first_starts()


def test_solid_part_emits_perimeter_and_infill_kinds() -> None:
    data = default_profile().to_dict()
    data["perimeter_count"] = 2
    data["features"]["infill"]["infill_density"] = 1.0
    profile = MachineProfile.from_dict(data)

    box = _box()
    model = slice_mesh(box, profile.to_slice_parameters())
    toolpath = generate_profile_toolpath(model, profile, box)

    kinds = {move.kind for move in _all_moves(toolpath)}
    assert "outer_perimeter" in kinds
    assert "inner_perimeter" in kinds
    assert "infill" in kinds


def test_moves_carry_feeder_and_laser_from_features() -> None:
    data = default_profile().to_dict()
    data["material"] = "dual"
    data["perimeter_count"] = 2
    data["features"]["infill"]["infill_density"] = 1.0
    data["features"]["infill"]["feeder"] = "T1"
    data["features"]["infill"]["laser_power"] = 700.0
    data["features"]["outer_perimeter"]["laser_power"] = 1100.0
    profile = MachineProfile.from_dict(data)

    box = _box()
    model = slice_mesh(box, profile.to_slice_parameters())
    moves = _all_moves(generate_profile_toolpath(model, profile, box))

    infill = [m for m in moves if m.kind == "infill"]
    outer = [m for m in moves if m.kind == "outer_perimeter"]
    assert infill and outer
    assert all(m.feeder == "T1" for m in infill)
    assert all(m.laser_power == 700.0 for m in infill)
    assert all(m.feeder == "T0" for m in outer)
    assert all(m.laser_power == 1100.0 for m in outer)


def test_per_feature_bead_width_changes_inner_perimeter_offset() -> None:
    # A wider outer bead pushes the inner perimeter further inward, shrinking it.
    box = _box()

    def inner_extent(outer_bead: float) -> float:
        data = default_profile().to_dict()
        data["perimeter_count"] = 2
        data["features"]["outer_perimeter"]["bead_width_mm"] = outer_bead
        profile = MachineProfile.from_dict(data)
        model = slice_mesh(box, profile.to_slice_parameters())
        moves = _all_moves(generate_profile_toolpath(model, profile, box))
        inner = [m for m in moves if m.kind == "inner_perimeter"]
        pts = np.concatenate([np.asarray(m.points) for m in inner], axis=0)
        return float(pts[:, 0].max() - pts[:, 0].min())

    narrow = inner_extent(1.0)
    wide = inner_extent(3.0)
    assert wide < narrow


def test_support_emits_support_perimeter_and_infill() -> None:
    data = default_profile().to_dict()
    data["support_enabled"] = True
    data["support_perimeter_count"] = 1
    data["features"]["support"]["infill_density"] = 1.0
    profile = MachineProfile.from_dict(data)

    funnel = _funnel()
    params = profile.to_slice_parameters()
    model = slice_mesh(funnel, params)
    support_layers = support_layer_footprints(funnel, params, model.layers)
    assert any(layer.polygons for layer in support_layers)

    support_toolpath = generate_profile_support_toolpath(support_layers, profile)
    kinds = {move.kind for move in _all_moves(support_toolpath)}
    assert "support_outer_perimeter" in kinds
    assert "support" in kinds


def test_zero_support_perimeters_emit_only_fill() -> None:
    data = default_profile().to_dict()
    data["support_enabled"] = True
    data["support_perimeter_count"] = 0
    data["features"]["support"]["infill_density"] = 1.0
    profile = MachineProfile.from_dict(data)

    funnel = _funnel()
    params = profile.to_slice_parameters()
    model = slice_mesh(funnel, params)
    support_layers = support_layer_footprints(funnel, params, model.layers)
    assert any(layer.polygons for layer in support_layers)

    support_toolpath = generate_profile_support_toolpath(support_layers, profile)
    kinds = {move.kind for move in _all_moves(support_toolpath)}
    assert "support" in kinds
    assert "support_outer_perimeter" not in kinds
    assert "support_inner_perimeter" not in kinds


def test_single_support_perimeter_has_no_inner_walls() -> None:
    data = default_profile().to_dict()
    data["support_enabled"] = True
    data["support_perimeter_count"] = 1
    profile = MachineProfile.from_dict(data)

    funnel = _funnel()
    params = profile.to_slice_parameters()
    model = slice_mesh(funnel, params)
    support_layers = support_layer_footprints(funnel, params, model.layers)

    support_toolpath = generate_profile_support_toolpath(support_layers, profile)
    kinds = {move.kind for move in _all_moves(support_toolpath)}
    assert "support_outer_perimeter" in kinds
    assert "support_inner_perimeter" not in kinds


def test_multiple_support_perimeters_emit_inner_walls() -> None:
    data = default_profile().to_dict()
    data["support_enabled"] = True
    data["support_perimeter_count"] = 3
    profile = MachineProfile.from_dict(data)

    funnel = _funnel()
    params = profile.to_slice_parameters()
    model = slice_mesh(funnel, params)
    support_layers = support_layer_footprints(funnel, params, model.layers)

    support_toolpath = generate_profile_support_toolpath(support_layers, profile)
    moves = _all_moves(support_toolpath)
    kinds = {move.kind for move in moves}
    assert "support_outer_perimeter" in kinds
    assert "support_inner_perimeter" in kinds


def _square(side: float) -> Polygon:
    """An axis-aligned square footprint of the given side length, at the origin."""
    h = side / 2.0
    return Polygon([(-h, -h), (h, -h), (h, h), (-h, h)])


def test_tiny_support_island_skips_fill_when_perimeters_requested() -> None:
    # A footprint smaller than one bead can't hold a full perimeter; with
    # perimeters requested we'd rather print nothing there than a fill sliver.
    data = default_profile().to_dict()
    data["support_perimeter_count"] = 1
    data["features"]["support"]["infill_density"] = 1.0
    profile = MachineProfile.from_dict(data)
    bead = profile.features["support_outer_perimeter"].bead_width_mm

    tiny = SupportLayer(index=0, z=1.0, polygons=[_square(bead * 0.5)])
    big = SupportLayer(index=1, z=2.0, polygons=[_square(bead * 10.0)])

    tiny_moves = _all_moves(generate_profile_support_toolpath([tiny], profile))
    assert tiny_moves == []

    big_moves = _all_moves(generate_profile_support_toolpath([big], profile))
    big_kinds = {m.kind for m in big_moves}
    assert "support_outer_perimeter" in big_kinds
    assert "support" in big_kinds


def test_tiny_support_island_keeps_fill_when_no_perimeters() -> None:
    # With zero support perimeters (fill-only by design) the skip rule does not
    # apply: even a small island still gets its fill.
    data = default_profile().to_dict()
    data["support_perimeter_count"] = 0
    data["features"]["support"]["infill_density"] = 1.0
    profile = MachineProfile.from_dict(data)
    bead = profile.features["support"].bead_width_mm

    island = SupportLayer(index=0, z=1.0, polygons=[_square(bead * 3.0)])
    moves = _all_moves(generate_profile_support_toolpath([island], profile))
    kinds = {m.kind for m in moves}
    assert "support" in kinds
    assert "support_outer_perimeter" not in kinds
