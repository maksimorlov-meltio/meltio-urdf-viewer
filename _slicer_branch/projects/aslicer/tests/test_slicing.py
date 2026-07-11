"""End-to-end tests for slicing and perimeter toolpath generation."""

from __future__ import annotations

import numpy as np
import trimesh

from aslicer import SliceParameters
from aslicer.core import generate_profile_toolpath, slice_mesh
from aslicer.profile import MachineProfile, default_profile


def _toolpath(mesh: trimesh.Trimesh, **overrides):
    """Slice ``mesh`` and trace it with a profile built from ``overrides``.

    Bead width is pinned to 1.2 mm for all features so the geometry assertions
    below are independent of the shipped master profile's tuning.
    """
    data = default_profile().to_dict()
    infill = overrides.pop("infill_density", None)
    bead = overrides.pop("bead_width_mm", 1.2)
    data.update(overrides)
    for feature in data["features"].values():
        feature["bead_width_mm"] = bead
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


def test_box_layer_count_and_heights() -> None:
    params = SliceParameters(layer_height_mm=1.0)
    model = slice_mesh(_unit_box(), params)

    # First plane at z=1, then steps of 1 up to (but below) z=10 -> z in 1..9.
    zs = [layer.z for layer in model.layers]
    assert zs[0] == 1.0
    assert all(np.isclose(b - a, 1.0) for a, b in zip(zs, zs[1:]))
    assert max(zs) < 10.0


def test_box_perimeter_is_closed_and_correct_size() -> None:
    toolpath = _toolpath(_unit_box(), perimeter_count=1, infill_density=0.0)

    first = toolpath.layers[0]
    assert len(first.moves) == 1

    move = first.moves[0]
    assert move.closed
    assert np.allclose(move.points[0], move.points[-1])
    # 10 mm square inset by half a bead (0.6 mm) per side => 8.8 mm square.
    assert np.isclose(move.length_mm, 35.2)
    # Every point sits on the layer plane.
    assert np.allclose(move.points[:, 2], first.z)


def test_extrusion_and_time_are_positive() -> None:
    toolpath = _toolpath(_unit_box())
    assert toolpath.total_length_mm > 0.0
    assert toolpath.total_extrusion_mm > 0.0
    assert toolpath.estimated_time_s > 0.0


def test_multiple_perimeters_add_inset_walls() -> None:
    box = _unit_box()
    single = _toolpath(box, perimeter_count=1, infill_density=0.0)
    triple = _toolpath(box, perimeter_count=3, infill_density=0.0)

    single_moves = len(single.layers[0].moves)
    triple_moves = len(triple.layers[0].moves)

    # Three concentric walls on a simple region => more moves and more path.
    assert triple_moves > single_moves
    assert triple.total_length_mm > single.total_length_mm

    # The outer wall is offset inward by half a bead (8.8 mm square boundary).
    outer = triple.layers[0].moves[0]
    assert np.isclose(outer.length_mm, 35.2)
    # Inset walls are strictly shorter than the outer wall.
    inner = triple.layers[0].moves[1]
    assert inner.length_mm < outer.length_mm


def test_sample_stl_slices_into_toolpath(sample_mesh: trimesh.Trimesh) -> None:
    model = slice_mesh(sample_mesh, default_profile().to_slice_parameters())
    toolpath = _toolpath(sample_mesh)

    assert model.layer_count > 0
    assert any(layer.moves for layer in toolpath.layers)
    for layer in toolpath.layers:
        for move in layer.moves:
            assert move.points.shape[1] == 3
            assert move.length_mm > 0.0
