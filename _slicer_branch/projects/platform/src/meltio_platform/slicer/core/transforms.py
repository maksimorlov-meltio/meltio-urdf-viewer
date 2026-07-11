"""Modular mesh placement transforms applied before slicing.

Each transform takes a mesh plus a parameter dict and returns the transformed
mesh. Transforms are registered in :data:`_TRANSFORMS` and dispatched by name
through :func:`apply_transform`, so new placement/orientation steps (rotation,
translation, alignment, …) can be added without touching the call sites.
"""

from __future__ import annotations

from typing import Callable

import numpy as np
import trimesh

# A transform receives the mesh and a parameter dict, and returns the mesh.
Transform = Callable[[trimesh.Trimesh, dict], trimesh.Trimesh]


def place_vertex_on_ground(mesh: trimesh.Trimesh, params: dict) -> trimesh.Trimesh:
    """Translate the mesh so a chosen vertex sits on the build plate (z = 0).

    Args:
        mesh: The mesh to translate (modified in place).
        params: Must contain ``vertex_index`` identifying the vertex to drop to
            ``z = 0``.

    Returns:
        The translated mesh.

    Raises:
        ValueError: If ``vertex_index`` is missing or out of range.
    """
    vertex_index = params.get("vertex_index")
    if vertex_index is None:
        raise ValueError("place_vertex_on_ground requires 'vertex_index'")
    if not 0 <= vertex_index < len(mesh.vertices):
        raise ValueError(f"vertex_index {vertex_index} out of range")

    z = float(mesh.vertices[vertex_index][2])
    if z != 0.0:
        mesh.apply_translation((0.0, 0.0, -z))
    return mesh


def place_face_on_base(mesh: trimesh.Trimesh, params: dict) -> trimesh.Trimesh:
    """Rotate the mesh so a chosen face lies flat on the build plate.

    The selected triangle's outward normal is rotated to point straight down
    (``-Z``), making the face parallel to the plate, then the whole mesh is
    dropped so its lowest point rests at ``z = 0`` and centred over a target
    point in the XY plane.

    Args:
        mesh: The mesh to reorient (modified in place).
        params: Must contain ``face_index`` identifying the triangle to seat.
            May contain ``cx`` and ``cy`` giving the XY point (machine
            coordinates, mm) to centre the reoriented mesh on. Both default to
            ``0.0`` (the build-plate origin).

    Returns:
        The reoriented mesh.

    Raises:
        ValueError: If ``face_index`` is missing or out of range.
    """
    face_index = params.get("face_index")
    if face_index is None:
        raise ValueError("place_face_on_base requires 'face_index'")
    if not 0 <= face_index < len(mesh.faces):
        raise ValueError(f"face_index {face_index} out of range")

    normal = np.array(mesh.face_normals[face_index], dtype=float)
    norm = float(np.linalg.norm(normal))
    if norm == 0.0:
        raise ValueError("Selected face has a degenerate normal")
    normal /= norm

    # Rotate the face's outward normal to point down so the face seats on the
    # plate. ``align_vectors`` returns a 4x4 homogeneous rotation.
    rotation = trimesh.geometry.align_vectors(normal, np.array([0.0, 0.0, -1.0]))
    mesh.apply_transform(rotation)

    # Rest the reoriented mesh on the plate and centre it over the target point
    # in XY.
    cx = float(params.get("cx", 0.0))
    cy = float(params.get("cy", 0.0))
    lower, upper = mesh.bounds
    mesh.apply_translation(
        (
            cx - (lower[0] + upper[0]) / 2.0,
            cy - (lower[1] + upper[1]) / 2.0,
            -float(lower[2]),
        )
    )
    return mesh


def translate_on_base(mesh: trimesh.Trimesh, params: dict) -> trimesh.Trimesh:
    """Slide the mesh across the build plate in the XY plane.

    Args:
        mesh: The mesh to translate (modified in place).
        params: May contain ``dx`` and ``dy`` offsets in millimetres. The Z
            position is left untouched so the part stays on the plate.

    Returns:
        The translated mesh.
    """
    dx = float(params.get("dx", 0.0))
    dy = float(params.get("dy", 0.0))
    if dx != 0.0 or dy != 0.0:
        mesh.apply_translation((dx, dy, 0.0))
    return mesh


def center_on_base(mesh: trimesh.Trimesh, params: dict) -> trimesh.Trimesh:
    """Centre the mesh over a target point on the build plate in the XY plane.

    The Z position is left untouched so the part keeps resting on the plate.

    Args:
        mesh: The mesh to centre (modified in place).
        params: May contain ``cx`` and ``cy`` giving the target XY point (in
            machine coordinates, mm) to centre the mesh's bounding box on.
            Both default to ``0.0`` (the build-plate origin).

    Returns:
        The centred mesh.
    """
    cx = float(params.get("cx", 0.0))
    cy = float(params.get("cy", 0.0))
    lower, upper = mesh.bounds
    dx = cx - (lower[0] + upper[0]) / 2.0
    dy = cy - (lower[1] + upper[1]) / 2.0
    if dx != 0.0 or dy != 0.0:
        mesh.apply_translation((dx, dy, 0.0))
    return mesh


def rotate_z(mesh: trimesh.Trimesh, params: dict) -> trimesh.Trimesh:
    """Rotate the mesh about the vertical (Z) axis, spinning it in place.

    The rotation is about the mesh's current XY centre (so the part does not
    drift across the plate) and leaves Z untouched (it stays resting on the
    plate). Used for the "rotate 90°" model tool.

    Args:
        mesh: The mesh to rotate (modified in place).
        params: May contain ``degrees`` (default ``90``) — the clockwise-about-Z
            rotation angle in degrees.

    Returns:
        The rotated mesh.
    """
    degrees = float(params.get("degrees", 90.0))
    if degrees % 360.0 == 0.0:
        return mesh
    lower, upper = mesh.bounds
    cx = (lower[0] + upper[0]) / 2.0
    cy = (lower[1] + upper[1]) / 2.0
    matrix = trimesh.transformations.rotation_matrix(
        np.radians(degrees), (0.0, 0.0, 1.0), point=(cx, cy, 0.0)
    )
    mesh.apply_transform(matrix)
    return mesh


_TRANSFORMS: dict[str, Transform] = {
    "place_vertex_on_ground": place_vertex_on_ground,
    "place_face_on_base": place_face_on_base,
    "translate_on_base": translate_on_base,
    "center_on_base": center_on_base,
    "rotate_z": rotate_z,
}


def available_transforms() -> tuple[str, ...]:
    """Return the names of all registered transforms."""
    return tuple(_TRANSFORMS)


def apply_transform(
    mesh: trimesh.Trimesh, transform_type: str, params: dict | None = None
) -> trimesh.Trimesh:
    """Apply a registered transform to ``mesh`` by name.

    Args:
        mesh: The mesh to transform.
        transform_type: The registered transform name.
        params: Parameters forwarded to the transform.

    Returns:
        The transformed mesh.

    Raises:
        ValueError: If ``transform_type`` is not registered.
    """
    transform = _TRANSFORMS.get(transform_type)
    if transform is None:
        raise ValueError(f"Unknown transform: {transform_type}")
    return transform(mesh, params or {})
