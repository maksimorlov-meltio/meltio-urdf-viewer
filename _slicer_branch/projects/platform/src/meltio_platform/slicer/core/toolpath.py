"""Core toolpath data structures and shared geometry helpers.

This module defines the toolpath dataclasses (:class:`ToolpathMove`,
:class:`ToolpathLayer`, :class:`Toolpath`) and the low-level geometry helpers
shared by the profile-driven generator in
:mod:`meltio_platform.slicer.core.profile_toolpath` (densifying, ring extraction and polygon
iteration), plus :func:`merge_toolpath_layers` for interleaving part and support
toolpaths.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterator

import numpy as np
from shapely.geometry import MultiPolygon, Polygon

from ..config import SliceParameters
from .slicer import LayerContour


@dataclass
class ToolpathMove:
    """A single continuous deposition move.

    Attributes:
        points: ``(N, 3)`` array of XYZ points. For closed loops the first and
            last points are identical.
        closed: Whether the move forms a closed loop.
        feed_mm_min: Programmed feed rate (mm/min) for the move.
        length_mm: Total planar length of the move (mm).
        extrusion_mm: Feedstock length consumed by the move (mm).
        kind: Move category, e.g. ``"outer_perimeter"``, ``"inner_perimeter"``,
            ``"infill"``, ``"support"``, ``"support_outer_perimeter"`` or
            ``"support_inner_perimeter"``.
        orientations: Optional ``(N, 3)`` array of unit tool-axis vectors, one
            per point in ``points``. ``None`` means the head stays vertical
            (``+Z``) for the whole move.
        region: Index of the source contour ("part face") within its layer, or
            ``-1`` when not associated with a specific region (e.g. support).
            Moves sharing a region are kept together during machine-program
            ordering so the head finishes one island before travelling away.
        feeder: Wire feeder/tool used for this move (``"T0"``/``"T1"``).
        laser_power: Laser power for this move (machine units, e.g. watts).
        bead_width_mm: Deposited bead width for this move (mm). ``0.0`` means
            unset (callers fall back to the toolpath's nominal bead width). The
            preview uses it to size each stroke's rendered thickness.
    """

    points: np.ndarray
    closed: bool
    feed_mm_min: float
    length_mm: float
    extrusion_mm: float
    kind: str = "perimeter"
    orientations: np.ndarray | None = None
    region: int = -1
    feeder: str = "T0"
    laser_power: float = 0.0
    bead_width_mm: float = 0.0


@dataclass
class ToolpathLayer:
    """All deposition moves at one layer height.

    Attributes:
        index: Zero-based layer index.
        z: Absolute Z height of the layer (mm).
        moves: Perimeter moves for this layer.
    """

    index: int
    z: float
    moves: list[ToolpathMove] = field(default_factory=list)


@dataclass
class Toolpath:
    """A full toolpath: ordered layers of deposition moves.

    Attributes:
        layers: Ordered toolpath layers from bottom to top.
        parameters: Process parameters used to build the toolpath.
    """

    layers: list[ToolpathLayer]
    parameters: SliceParameters

    @property
    def total_length_mm(self) -> float:
        return sum(move.length_mm for layer in self.layers for move in layer.moves)

    @property
    def total_extrusion_mm(self) -> float:
        return sum(move.extrusion_mm for layer in self.layers for move in layer.moves)

    @property
    def estimated_time_s(self) -> float:
        speed = self.parameters.speed_mm_s
        return self.total_length_mm / speed if speed > 0 else 0.0


def _polyline_length(points: np.ndarray) -> float:
    """Total length of an ordered ``(N, 3)`` polyline."""
    if points.shape[0] < 2:
        return 0.0
    deltas = np.diff(points, axis=0)
    return float(np.sqrt((deltas * deltas).sum(axis=1)).sum())


def _densify(points: np.ndarray, max_len: float | None) -> np.ndarray:
    """Subdivide any segment longer than ``max_len`` into equal sub-segments.

    Inserts evenly spaced points so no straight run exceeds ``max_len`` (mm).
    The inserted points are collinear, so the path's shape is unchanged — only
    its sampling density (and therefore its segment count) increases. Returns
    ``points`` unchanged when ``max_len`` is ``None``/non-positive or there is
    nothing to split.
    """
    if max_len is None or max_len <= 0 or points.shape[0] < 2:
        return points
    out: list[np.ndarray] = [points[0]]
    for i in range(1, points.shape[0]):
        a = points[i - 1]
        b = points[i]
        seg = b - a
        dist = float(np.sqrt((seg * seg).sum()))
        if dist > max_len:
            pieces = int(np.ceil(dist / max_len))
            for k in range(1, pieces):
                out.append(a + seg * (k / pieces))
        out.append(b)
    return np.asarray(out, dtype=float)


def _contour_to_polygon(contour: LayerContour) -> Polygon | None:
    """Build a shapely polygon (with holes) from a slice contour."""
    if contour.exterior.shape[0] < 3:
        return None
    polygon = Polygon(contour.exterior, [hole for hole in contour.interiors])
    if not polygon.is_valid:
        # ``buffer(0)`` is the standard shapely trick to repair self-touching rings.
        polygon = polygon.buffer(0)
    return polygon if (not polygon.is_empty and polygon.geom_type == "Polygon") else None


def _iter_polygons(geom) -> Iterator[Polygon]:
    """Yield each simple ``Polygon`` from a polygon or multipolygon geometry."""
    if geom is None or geom.is_empty:
        return
    if isinstance(geom, Polygon):
        yield geom
    elif isinstance(geom, MultiPolygon):
        yield from geom.geoms


def _rings_of(polygon: Polygon) -> Iterator[np.ndarray]:
    """Yield the exterior and interior rings of ``polygon`` as XY arrays."""
    yield np.asarray(polygon.exterior.coords, dtype=float)
    for interior in polygon.interiors:
        yield np.asarray(interior.coords, dtype=float)


def merge_toolpath_layers(primary: Toolpath, secondary: Toolpath | None) -> Toolpath:
    """Interleave two toolpaths by layer index, preserving print order.

    Moves from ``secondary`` (e.g. support) are appended after ``primary``
    (e.g. the part) within each shared layer, so the simulation deposits part
    and support layer by layer. Returns ``primary`` unchanged when
    ``secondary`` is ``None``.
    """
    if secondary is None:
        return primary

    merged: dict[int, ToolpathLayer] = {}
    for source in (primary, secondary):
        for layer in source.layers:
            target = merged.get(layer.index)
            if target is None:
                target = ToolpathLayer(index=layer.index, z=layer.z, moves=[])
                merged[layer.index] = target
            target.moves.extend(layer.moves)

    layers = [merged[index] for index in sorted(merged)]
    return Toolpath(layers=layers, parameters=primary.parameters)
