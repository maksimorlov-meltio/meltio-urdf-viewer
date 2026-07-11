"""Tests for head tool-orientation on tilted and overhanging perimeters."""

from __future__ import annotations

import numpy as np
import trimesh

from aslicer.core import (
    generate_profile_toolpath,
    slice_mesh,
    tool_axes_from_normals,
)
from aslicer.profile import MachineProfile, default_profile

PERIMETER_KINDS = {"outer_perimeter", "inner_perimeter"}


def _toolpath(mesh: trimesh.Trimesh, orient: str, **overrides):
    """Slice ``mesh`` and trace it with a profile using ``orient`` mode."""
    data = default_profile().to_dict()
    data["axes"] = "5-axis"  # head tilting requires a 5-axis machine
    data["orient_perimeters"] = orient
    infill = overrides.pop("infill_density", None)
    data.update(overrides)
    if infill is not None:
        data["features"]["infill"]["infill_density"] = infill
    profile = MachineProfile.from_dict(data)
    model = slice_mesh(mesh, profile.to_slice_parameters())
    return generate_profile_toolpath(model, profile, mesh)


def _unit_box() -> trimesh.Trimesh:
    box = trimesh.creation.box(extents=(10.0, 10.0, 10.0))
    box.apply_translation((0.0, 0.0, 5.0))
    return box


def _cone() -> trimesh.Trimesh:
    # Apex up: walls narrow going up (supported, NOT overhangs) but still
    # non-vertical, so "all" mode tilts the head while "overhang" mode does not.
    return trimesh.creation.cone(radius=5.0, height=10.0, sections=64)


def _funnel() -> trimesh.Trimesh:
    # Inverted cone: apex down, widening going up, so upper layers overhang the
    # narrower ones below — a true overhang whose walls face downward/outward.
    cone = trimesh.creation.cone(radius=5.0, height=10.0, sections=64)
    cone.apply_transform(trimesh.transformations.rotation_matrix(np.pi, (1, 0, 0)))
    cone.apply_translation((0.0, 0.0, -cone.bounds[0][2]))
    return cone


def test_vertical_wall_normal_maps_to_z() -> None:
    axes = tool_axes_from_normals(np.array([[1.0, 0.0, 0.0], [0.0, 1.0, 0.0]]))
    assert np.allclose(axes, [[0.0, 0.0, 1.0], [0.0, 0.0, 1.0]])


def test_flat_faces_keep_head_vertical() -> None:
    # Horizontal faces have no defined in-plane direction -> stay vertical.
    axes = tool_axes_from_normals(np.array([[0.0, 0.0, 1.0], [0.0, 0.0, -1.0]]))
    assert np.allclose(axes, [[0.0, 0.0, 1.0], [0.0, 0.0, 1.0]])


def test_inclined_walls_tilt_toward_the_wall() -> None:
    inv = 1.0 / np.sqrt(2.0)
    normals = np.array(
        [
            [inv, 0.0, -inv],  # overhang/undercut: faces out and down
            [inv, 0.0, inv],  # inward lean: faces out and up
        ]
    )
    axes = tool_axes_from_normals(normals)
    # Up-slope tangent: perpendicular to the normal, pointing generally up.
    assert np.allclose(axes[0], [inv, 0.0, inv])
    assert np.allclose(axes[1], [-inv, 0.0, inv])
    # Always unit length and perpendicular to the source normal.
    assert np.allclose(np.linalg.norm(axes, axis=1), 1.0)
    assert np.allclose((axes * normals).sum(axis=1), 0.0, atol=1e-9)


def test_overhang_only_skips_non_overhanging_walls() -> None:
    inv = 1.0 / np.sqrt(2.0)
    normals = np.array(
        [
            [inv, 0.0, -inv],  # overhang: faces out and down -> tilted
            [inv, 0.0, inv],  # supported: faces out and up -> stays +Z
            [1.0, 0.0, 0.0],  # vertical wall -> stays +Z
        ]
    )
    axes = tool_axes_from_normals(normals, overhang_only=True)
    assert np.allclose(axes[0], [inv, 0.0, inv])
    assert np.allclose(axes[1], [0.0, 0.0, 1.0])
    assert np.allclose(axes[2], [0.0, 0.0, 1.0])


def test_empty_normals_returns_empty() -> None:
    assert tool_axes_from_normals(np.zeros((0, 3))).shape == (0, 3)


def test_disabled_leaves_orientations_unset() -> None:
    toolpath = _toolpath(_cone(), "none")
    for layer in toolpath.layers:
        for move in layer.moves:
            assert move.orientations is None


def test_vertical_box_perimeters_stay_vertical() -> None:
    toolpath = _toolpath(_unit_box(), "all")
    seen = False
    for layer in toolpath.layers:
        for move in layer.moves:
            if move.kind not in PERIMETER_KINDS:
                continue
            seen = True
            assert move.orientations is not None
            assert move.orientations.shape == move.points.shape
            assert np.allclose(move.orientations, [0.0, 0.0, 1.0], atol=1e-3)
    assert seen


def _max_perimeter_tilt(toolpath) -> float:
    max_tilt = 0.0
    for layer in toolpath.layers:
        for move in layer.moves:
            if move.kind in PERIMETER_KINDS and move.orientations is not None:
                horizontal = np.hypot(
                    move.orientations[:, 0], move.orientations[:, 1]
                )
                max_tilt = max(max_tilt, float(horizontal.max()))
    return max_tilt


def test_all_mode_tilts_supported_inclined_walls() -> None:
    toolpath = _toolpath(_cone(), "all")
    # The inclined (but supported) cone walls force a non-vertical head.
    assert _max_perimeter_tilt(toolpath) > 0.1


def test_overhang_mode_ignores_supported_cone() -> None:
    toolpath = _toolpath(_cone(), "overhang")
    # The cone narrows upward (no overhang), so the head stays vertical.
    assert _max_perimeter_tilt(toolpath) < 1e-3


def test_overhang_mode_tilts_true_overhang() -> None:
    toolpath = _toolpath(_funnel(), "overhang")
    # The funnel widens upward, so its walls overhang and tilt the head.
    assert _max_perimeter_tilt(toolpath) > 0.1


def test_infill_is_never_oriented() -> None:
    toolpath = _toolpath(
        _unit_box(), "all", infill_density=0.5, perimeter_count=1
    )
    infill_moves = [
        move
        for layer in toolpath.layers
        for move in layer.moves
        if move.kind == "infill"
    ]
    assert infill_moves  # the box should produce infill
    for move in infill_moves:
        assert move.orientations is None
