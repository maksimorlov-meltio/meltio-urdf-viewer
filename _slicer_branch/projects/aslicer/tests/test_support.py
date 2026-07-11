"""Tests for support generation under overhanging surfaces."""

from __future__ import annotations

import numpy as np
import trimesh
from shapely.geometry import Polygon

from aslicer import SliceParameters
from aslicer.core import (
    generate_profile_support_toolpath,
    generate_support_mesh,
    slice_mesh,
    support_layer_footprints,
)
from aslicer.profile import default_profile


def _unit_box() -> trimesh.Trimesh:
    box = trimesh.creation.box(extents=(10.0, 10.0, 10.0))
    box.apply_translation((0.0, 0.0, 5.0))
    return box


def _cone() -> trimesh.Trimesh:
    # Apex up: walls face outward and upward -> supported, no overhang.
    return trimesh.creation.cone(radius=5.0, height=10.0, sections=64)


def _funnel() -> trimesh.Trimesh:
    # Inverted cone: widening going up, so the walls face downward/outward and
    # overhang the narrower section beneath them.
    cone = trimesh.creation.cone(radius=5.0, height=10.0, sections=64)
    cone.apply_transform(trimesh.transformations.rotation_matrix(np.pi, (1, 0, 0)))
    cone.apply_translation((0.0, 0.0, -cone.bounds[0][2]))
    return cone


def _part_layers(mesh: trimesh.Trimesh, params: SliceParameters):
    return slice_mesh(mesh, params).layers


def test_box_needs_no_support() -> None:
    params = SliceParameters()
    box = _unit_box()
    layers = support_layer_footprints(box, params, _part_layers(box, params))
    assert layers == []
    assert generate_support_mesh(layers, params.layer_height_mm) is None


def test_supported_cone_needs_no_support() -> None:
    # Apex-up cone walls face upward, and its base cap sits on the plate.
    params = SliceParameters()
    cone = _cone()
    layers = support_layer_footprints(cone, params, _part_layers(cone, params))
    assert layers == []


def test_overhang_funnel_produces_support_to_plate() -> None:
    params = SliceParameters()
    funnel = _funnel()
    layers = support_layer_footprints(funnel, params, _part_layers(funnel, params))
    assert any(layer.polygons for layer in layers)

    support = generate_support_mesh(layers, params.layer_height_mm)
    assert support is not None
    assert support.vertices.shape[0] > 0
    assert support.faces.shape[0] > 0
    # The support is drawn straight down to the build plate.
    assert support.bounds[0][2] <= 1e-6
    # It must not rise above the part it supports.
    assert support.bounds[1][2] <= funnel.bounds[1][2] + 1e-6


def test_support_does_not_overlap_part() -> None:
    # Support footprints must be clear of the part's own cross-section.
    params = SliceParameters()
    funnel = _funnel()
    part_layers = _part_layers(funnel, params)
    layers = support_layer_footprints(funnel, params, part_layers)
    by_index = {layer.index: layer for layer in part_layers}
    for support in layers:
        part = by_index[support.index]
        part_polys = [
            Polygon(c.exterior, [h for h in c.interiors]).buffer(0)
            for c in part.contours
            if c.exterior.shape[0] >= 3
        ]
        for sp in support.polygons:
            for pp in part_polys:
                assert sp.intersection(pp).area <= 1e-6


def test_high_angle_threshold_disables_funnel_support() -> None:
    # The funnel walls tilt ~26.6 degrees from vertical; an 80-degree threshold
    # only supports near-horizontal ceilings, so nothing qualifies.
    params = SliceParameters(support_overhang_angle_deg=80.0)
    funnel = _funnel()
    layers = support_layer_footprints(funnel, params, _part_layers(funnel, params))
    assert layers == []


def test_min_area_drops_small_footprints() -> None:
    # With an enormous minimum area, every footprint is filtered out.
    params = SliceParameters(support_min_area_mm2=1.0e6)
    funnel = _funnel()
    layers = support_layer_footprints(funnel, params, _part_layers(funnel, params))
    assert all(not layer.polygons for layer in layers)
    assert generate_support_mesh(layers, params.layer_height_mm) is None


def test_support_toolpath_is_all_support_moves() -> None:
    profile = default_profile()
    params = profile.to_slice_parameters()
    funnel = _funnel()
    layers = support_layer_footprints(funnel, params, _part_layers(funnel, params))
    toolpath = generate_profile_support_toolpath(layers, profile)
    moves = [move for layer in toolpath.layers for move in layer.moves]
    assert moves, "expected support infill moves"
    assert all(move.kind == "support" for move in moves)
