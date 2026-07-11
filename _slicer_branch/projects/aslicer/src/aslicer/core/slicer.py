"""Planar slicing of a mesh into horizontal cross-section contours."""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import trimesh

from ..config import SliceParameters


@dataclass
class LayerContour:
    """A single closed region of a slice.

    Attributes:
        exterior: ``(N, 2)`` array of XY points for the outer boundary ring.
        interiors: List of ``(M, 2)`` arrays for hole boundary rings.
    """

    exterior: np.ndarray
    interiors: list[np.ndarray] = field(default_factory=list)


@dataclass
class Layer:
    """All cross-section contours found at one slice height.

    Attributes:
        index: Zero-based layer index (bottom layer is 0).
        z: Absolute Z height of the slice plane (mm).
        contours: Closed regions intersected by the plane.
    """

    index: int
    z: float
    contours: list[LayerContour] = field(default_factory=list)


@dataclass
class SlicedModel:
    """Result of slicing a mesh.

    Attributes:
        layers: Ordered slice layers from bottom to top.
        parameters: Parameters used to produce the slices.
        bounds: ``(2, 3)`` array of mesh ``[min, max]`` bounds.
        mesh: The source mesh, kept so toolpath generation can sample wall
            normals for head orientation. ``None`` when unavailable.
    """

    layers: list[Layer]
    parameters: SliceParameters
    bounds: np.ndarray
    mesh: trimesh.Trimesh | None = None

    @property
    def layer_count(self) -> int:
        return len(self.layers)


def _layer_heights(z_min: float, z_max: float, params: SliceParameters) -> np.ndarray:
    """Compute absolute Z heights for each slice plane.

    The first plane sits one ``first_layer_z_offset`` above the model bottom and
    subsequent planes step up by ``layer_height_mm`` while staying below the top.
    """
    start = z_min + params.first_layer_z_offset
    if start >= z_max:
        return np.empty(0, dtype=float)
    count = int(np.floor((z_max - start) / params.layer_height_mm)) + 1
    heights = start + np.arange(count, dtype=float) * params.layer_height_mm
    # Stop strictly below the very top facet to avoid grazing/empty sections.
    epsilon = params.layer_height_mm * 1e-6
    return heights[heights < z_max - epsilon]


def slice_mesh(mesh: trimesh.Trimesh, params: SliceParameters) -> SlicedModel:
    """Slice ``mesh`` into horizontal contours using ``params``.

    Args:
        mesh: The mesh to slice.
        params: Process parameters controlling layer height and first-layer offset.

    Returns:
        A :class:`SlicedModel` holding the per-layer contours.
    """
    bounds = np.asarray(mesh.bounds, dtype=float)
    z_min, z_max = float(bounds[0][2]), float(bounds[1][2])

    heights = _layer_heights(z_min, z_max, params)
    if heights.size == 0:
        return SlicedModel(layers=[], parameters=params, bounds=bounds, mesh=mesh)

    plane_origin = np.array([0.0, 0.0, z_min], dtype=float)
    plane_normal = np.array([0.0, 0.0, 1.0], dtype=float)
    # section_multiplane wants heights relative to plane_origin.
    relative_heights = heights - z_min

    sections = mesh.section_multiplane(
        plane_origin=plane_origin,
        plane_normal=plane_normal,
        heights=relative_heights,
    )

    layers: list[Layer] = []
    for index, (z_abs, section) in enumerate(zip(heights, sections)):
        contours: list[LayerContour] = []
        if section is not None:
            for polygon in section.polygons_full:
                exterior = np.asarray(polygon.exterior.coords, dtype=float)
                interiors = [
                    np.asarray(ring.coords, dtype=float)
                    for ring in polygon.interiors
                ]
                contours.append(LayerContour(exterior=exterior, interiors=interiors))
        layers.append(Layer(index=index, z=float(z_abs), contours=contours))

    return SlicedModel(layers=layers, parameters=params, bounds=bounds, mesh=mesh)
