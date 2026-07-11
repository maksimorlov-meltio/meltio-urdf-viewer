"""Tool-orientation conventions for tilting the head to follow walls.

The deposition head has a single *tool axis*: a unit vector pointing from the
deposition point up toward the nozzle mount (the direction the nozzle "looks"
away from the part). The default tool axis is ``+Z`` — the nozzle hangs straight
down and deposits onto the horizontal layer below.

On a wall that is not vertical, we tilt the head so its axis stays *aligned with
the wall surface*: it follows the wall's up-slope tangent. A vertical wall
therefore keeps the axis at ``+Z`` (no tilt), while an inclined wall tilts the
axis toward the wall by exactly the wall's deviation from vertical. An
``overhang_only`` mode further restricts tilting to overhanging walls (those
whose surface faces downward). This single convention is shared by the slicer,
the serializer and the viewer so the head orientation is consistent end to end.
"""

from __future__ import annotations

import numpy as np

# Numerical floor below which a wall is treated as vertical (no tilt).
_HORIZONTAL_EPS = 1e-9


def tool_axes_from_normals(normals: np.ndarray, overhang_only: bool = False) -> np.ndarray:
    """Map outward wall surface normals to per-point tool-axis vectors.

    For each unit wall normal ``n`` the tool axis is the wall's up-slope
    tangent: the unit vector lying in the vertical plane that contains ``n``,
    perpendicular to ``n`` and pointing generally upward. A vertical wall (whose
    normal is horizontal) yields ``+Z``; an inclined wall tilts the axis toward
    the wall's outward horizontal direction by the wall's tilt from vertical.

    Args:
        normals: ``(N, 3)`` array of outward, unit-length wall normals.
        overhang_only: When ``True``, only tilt on overhanging walls — those
            whose normal faces downward (``n_z < 0``), i.e. material that leans
            out over open space. Upward- or horizontal-facing walls (which face
            into the supported/infilled side) keep the head vertical.

    Returns:
        ``(N, 3)`` array of unit tool-axis vectors, one per input normal.
    """
    normals = np.asarray(normals, dtype=float)
    if normals.ndim != 2 or normals.shape[1] != 3:
        raise ValueError("normals must have shape (N, 3)")

    count = normals.shape[0]
    axes = np.tile(np.array([0.0, 0.0, 1.0]), (count, 1))
    if count == 0:
        return axes

    nx, ny, nz = normals[:, 0], normals[:, 1], normals[:, 2]
    horizontal = np.hypot(nx, ny)
    tilted = horizontal > _HORIZONTAL_EPS
    if overhang_only:
        # Only downward-facing walls overhang; leave the rest vertical so the
        # head never leans into the infilled/supported side of the part.
        tilted = tilted & (nz < -_HORIZONTAL_EPS)

    # Outward horizontal unit direction of the wall (only where well defined).
    hx = nx[tilted] / horizontal[tilted]
    hy = ny[tilted] / horizontal[tilted]
    # Up-slope tangent: perpendicular to n in the {horizontal, +Z} plane.
    axes[tilted, 0] = -nz[tilted] * hx
    axes[tilted, 1] = -nz[tilted] * hy
    axes[tilted, 2] = horizontal[tilted]

    lengths = np.linalg.norm(axes, axis=1)
    lengths[lengths == 0.0] = 1.0
    axes /= lengths[:, None]
    return axes


def wall_tool_axes(mesh, points: np.ndarray, overhang_only: bool = False) -> np.ndarray:
    """Compute tool-axis vectors for ``points`` from the nearest wall surface.

    Each point is projected onto the mesh surface; the normal of the nearest
    face is fed through :func:`tool_axes_from_normals` to obtain the head
    orientation that follows the local wall.

    Args:
        mesh: The source ``trimesh.Trimesh`` the points were sliced from.
        points: ``(N, 3)`` array of deposition points.
        overhang_only: Forwarded to :func:`tool_axes_from_normals` — when
            ``True`` only overhanging (downward-facing) walls are tilted.

    Returns:
        ``(N, 3)`` array of unit tool-axis vectors (``+Z`` where the nearest
        surface is horizontal, i.e. a vertical wall, or — in overhang mode —
        where the wall is not an overhang).
    """
    points = np.asarray(points, dtype=float)
    if points.ndim != 2 or points.shape[1] != 3:
        raise ValueError("points must have shape (N, 3)")
    if points.shape[0] == 0:
        return np.zeros((0, 3), dtype=float)

    _, _, triangle_id = mesh.nearest.on_surface(points)
    normals = np.asarray(mesh.face_normals, dtype=float)[triangle_id]
    return tool_axes_from_normals(normals, overhang_only=overhang_only)
