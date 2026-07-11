"""Tests for modular mesh placement transforms."""

from __future__ import annotations

import numpy as np
import pytest
import trimesh

from aslicer.core import apply_transform, available_transforms


def _unit_box() -> trimesh.Trimesh:
    # 10 x 10 x 10 box with its base at z = 0 (corners span z in [0, 10]).
    box = trimesh.creation.box(extents=(10.0, 10.0, 10.0))
    box.apply_translation((0.0, 0.0, 5.0))
    return box


def test_place_vertex_on_ground_drops_chosen_vertex_to_zero() -> None:
    mesh = _unit_box()
    top_index = int(np.argmax(mesh.vertices[:, 2]))  # a top corner at z = 10

    apply_transform(mesh, "place_vertex_on_ground", {"vertex_index": top_index})

    assert np.isclose(mesh.vertices[top_index][2], 0.0)
    # The whole part shifted down by 10, so the old base now sits at z = -10.
    assert np.isclose(mesh.bounds[0][2], -10.0)


def test_place_vertex_on_ground_validates_index() -> None:
    mesh = _unit_box()
    with pytest.raises(ValueError):
        apply_transform(mesh, "place_vertex_on_ground", {"vertex_index": 10_000})
    with pytest.raises(ValueError):
        apply_transform(mesh, "place_vertex_on_ground", {})


def test_place_face_on_base_seats_face_on_plate() -> None:
    # Tilt the box so no face is axis-aligned, then seat a chosen face.
    mesh = _unit_box()
    mesh.apply_transform(
        trimesh.transformations.rotation_matrix(0.6, (1.0, 0.4, 0.0))
    )

    face_index = 0
    apply_transform(mesh, "place_face_on_base", {"face_index": face_index})

    # The seated face now points straight down (normal ~ -Z)…
    normal = mesh.face_normals[face_index]
    assert np.allclose(normal, (0.0, 0.0, -1.0), atol=1e-6)
    # …and the mesh rests on the plate.
    assert np.isclose(mesh.bounds[0][2], 0.0, atol=1e-6)
    # …and is centred over the origin in XY.
    center = mesh.bounds.mean(axis=0)
    assert np.allclose(center[:2], (0.0, 0.0), atol=1e-6)


def test_place_face_on_base_validates_index() -> None:
    mesh = _unit_box()
    with pytest.raises(ValueError):
        apply_transform(mesh, "place_face_on_base", {"face_index": 10_000})
    with pytest.raises(ValueError):
        apply_transform(mesh, "place_face_on_base", {})


def test_place_face_on_base_centers_on_target_point() -> None:
    mesh = _unit_box()
    mesh.apply_transform(
        trimesh.transformations.rotation_matrix(0.6, (1.0, 0.4, 0.0))
    )

    apply_transform(
        mesh, "place_face_on_base", {"face_index": 0, "cx": 150.0, "cy": 200.0}
    )

    # Seated on the plate and centred over the requested point.
    assert np.isclose(mesh.bounds[0][2], 0.0, atol=1e-6)
    center = mesh.bounds.mean(axis=0)
    assert np.allclose(center[:2], (150.0, 200.0), atol=1e-6)


def test_translate_on_base_moves_in_xy_only() -> None:
    mesh = _unit_box()
    before = mesh.bounds.copy()

    apply_transform(mesh, "translate_on_base", {"dx": 12.0, "dy": -5.0})

    after = mesh.bounds
    assert np.allclose(after[:, 0], before[:, 0] + 12.0)
    assert np.allclose(after[:, 1], before[:, 1] - 5.0)
    # Z (height on the plate) is untouched.
    assert np.allclose(after[:, 2], before[:, 2])


def test_translate_on_base_defaults_to_no_move() -> None:
    mesh = _unit_box()
    before = mesh.bounds.copy()

    apply_transform(mesh, "translate_on_base", {})

    assert np.allclose(mesh.bounds, before)


def test_center_on_base_centers_in_xy_only() -> None:
    mesh = _unit_box()
    mesh.apply_translation((15.0, -8.0, 0.0))  # shove it off-centre in XY
    z_before = mesh.bounds[:, 2].copy()

    apply_transform(mesh, "center_on_base", {})

    center = mesh.bounds.mean(axis=0)
    assert np.allclose(center[:2], (0.0, 0.0), atol=1e-6)
    # Z (height on the plate) is untouched.
    assert np.allclose(mesh.bounds[:, 2], z_before)


def test_center_on_base_targets_given_point() -> None:
    mesh = _unit_box()
    z_before = mesh.bounds[:, 2].copy()

    apply_transform(mesh, "center_on_base", {"cx": 150.0, "cy": 200.0})

    center = mesh.bounds.mean(axis=0)
    assert np.allclose(center[:2], (150.0, 200.0), atol=1e-6)
    # Z (height on the plate) is untouched.
    assert np.allclose(mesh.bounds[:, 2], z_before)


def test_unknown_transform_raises() -> None:
    mesh = _unit_box()
    with pytest.raises(ValueError):
        apply_transform(mesh, "no_such_transform", {})


def test_transforms_are_registered() -> None:
    registered = available_transforms()
    assert "place_vertex_on_ground" in registered
    assert "place_face_on_base" in registered
    assert "translate_on_base" in registered
    assert "center_on_base" in registered
