"""Generate simple support geometry beneath overhanging surfaces.

A deliberately simple first pass: every downward-facing surface whose tilt from
vertical exceeds ``support_overhang_angle_deg`` is considered unsupported and
needs material drawn straight down to the build plate (``z = 0``).

Rather than extrude each overhang triangle into its own prism (which produces a
self-intersecting, un-sliceable solid wherever overhangs stack or overlap), the
support footprint is computed per layer in 2D: at each layer height the support
cross-section is the planar *union* of the projected overhang triangles that
still rise above that layer. Unioning in 2D dissolves all overlaps into clean,
non-self-intersecting polygons, so both the displayed solid and the toolpath are
robust. Tiny footprints (below ``support_min_area_mm2``) are dropped.

The support is returned as a *separate* model so the caller can later apply
different slicing settings (for now: infill only, no perimeters, no offset).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Iterator

import numpy as np
import trimesh
from shapely.geometry import MultiPolygon, Polygon
from shapely.ops import triangulate, unary_union

from ..config import SliceParameters

# Faces resting on (or essentially at) the build plate need no support; ignore
# anything whose highest point is within this height of the plate.
_PLATE_EPS_MM = 1e-4
# Triangles whose projected area is below this are numerically degenerate.
_DEGENERATE_AREA_MM2 = 1e-9


@dataclass
class SupportLayer:
    """The support cross-section at a single layer height.

    Attributes:
        index: Zero-based layer index (matches the part's layer indexing).
        z: Absolute Z height of the layer's slice plane (mm).
        polygons: Clean, non-overlapping footprint polygons for this layer.
    """

    index: int
    z: float
    polygons: list[Polygon] = field(default_factory=list)


def _iter_polygons(geom) -> Iterator[Polygon]:
    """Yield each simple ``Polygon`` from a polygon or multipolygon geometry."""
    if geom is None or geom.is_empty:
        return
    if isinstance(geom, Polygon):
        yield geom
    elif isinstance(geom, MultiPolygon):
        yield from geom.geoms


def _overhang_triangles(
    mesh: trimesh.Trimesh, params: SliceParameters
) -> tuple[np.ndarray, np.ndarray] | None:
    """Return the overhanging triangles needing support.

    Returns:
        ``(tri_xy, tri_max_z)`` where ``tri_xy`` is an ``(F, 3, 2)`` array of the
        triangles' XY vertices and ``tri_max_z`` is their per-triangle maximum Z,
        or ``None`` when nothing needs support.
    """
    faces = np.asarray(mesh.faces)
    if faces.shape[0] == 0:
        return None

    normals = np.asarray(mesh.face_normals, dtype=float)
    vertices = np.asarray(mesh.vertices, dtype=float)

    # A surface tilted ``a`` degrees from vertical has a normal whose downward
    # component is ``sin(a)``. Overhangs steeper than the threshold therefore
    # have ``n_z < -sin(threshold)``.
    threshold = math.sin(math.radians(params.support_overhang_angle_deg))
    downward = normals[:, 2] < -threshold

    tri = vertices[faces]  # (F, 3, 3)
    face_max_z = tri[:, :, 2].max(axis=1)
    # Skip faces lying flat on the plate (any part above the plate qualifies).
    selected = downward & (face_max_z > _PLATE_EPS_MM)
    if not selected.any():
        return None

    return tri[selected, :, :2], face_max_z[selected]


def _part_footprint(contours) -> Polygon | MultiPolygon | None:
    """Union a layer's slice contours into the part's solid cross-section.

    Each :class:`~aslicer.core.slicer.LayerContour` becomes an exterior ring with
    its holes; the union is the area the part occupies at that layer, used to
    clip support away from the part body.
    """
    polys: list[Polygon] = []
    for contour in contours:
        if contour.exterior.shape[0] < 3:
            continue
        poly = Polygon(contour.exterior, [hole for hole in contour.interiors])
        if not poly.is_valid:
            poly = poly.buffer(0)
        if not poly.is_empty:
            polys.append(poly)
    if not polys:
        return None
    return unary_union(polys)


def support_layer_footprints(
    mesh: trimesh.Trimesh,
    params: SliceParameters,
    part_layers,
) -> list[SupportLayer]:
    """Compute the support footprint polygons for each part layer.

    Args:
        mesh: The part mesh, resting on the plate (lowest point at ``z = 0``).
        params: Process parameters (overhang threshold, minimum area).
        part_layers: The part's sliced :class:`~aslicer.core.slicer.Layer`
            objects. Each provides the layer index, height, and the part's own
            cross-section, which is subtracted so support never overlaps the
            part body — support that would pass through the part stops at it and
            resumes again below.

    Returns:
        One :class:`SupportLayer` per part layer (with possibly empty
        ``polygons``), or an empty list when nothing needs support.
    """
    overhang = _overhang_triangles(mesh, params)
    if overhang is None:
        return []
    tri_xy, tri_max_z = overhang

    # Pre-build a shapely polygon per overhang triangle, skipping degenerate ones.
    tri_polys: list[Polygon | None] = []
    for verts in tri_xy:
        poly = Polygon(verts)
        if not poly.is_valid:
            poly = poly.buffer(0)
        tri_polys.append(poly if poly.area > _DEGENERATE_AREA_MM2 else None)

    min_area = params.support_min_area_mm2
    layer_height = params.layer_height_mm

    layers: list[SupportLayer] = []
    for layer in part_layers:
        index, z = layer.index, layer.z
        # A column supports a layer when the overhang above it reaches into that
        # layer, i.e. its top sits above the layer's lower bound.
        z_floor = max(0.0, z - layer_height)
        mask = tri_max_z > z_floor
        pieces = [
            tri_polys[i] for i in np.nonzero(mask)[0] if tri_polys[i] is not None
        ]
        polygons: list[Polygon] = []
        if pieces:
            merged = unary_union(pieces)
            # Carve out the part's own cross-section so support abuts but never
            # intersects the part; a column blocked by part here reappears once
            # the part no longer occupies that area on a lower layer.
            part = _part_footprint(layer.contours)
            if part is not None:
                merged = merged.difference(part)
            polygons = [p for p in _iter_polygons(merged) if p.area >= min_area]
        layers.append(SupportLayer(index=index, z=z, polygons=polygons))

    return layers


def _extrude_polygon(
    poly: Polygon, z0: float, z1: float, verts: list, faces: list
) -> None:
    """Append a vertical slab for ``poly`` spanning ``z0..z1`` to ``verts``/``faces``.

    Triangulates the cap with shapely (no external triangulation engine needed)
    and adds top/bottom caps plus side walls. Winding is not made consistent;
    the display material renders double-sided, so the slab reads as solid
    regardless. Geometry is for visualisation only — it is never sliced.
    """
    # Constrained-ish cap triangulation: Delaunay over the polygon vertices,
    # keeping only triangles whose centre lies inside the polygon (this discards
    # triangles spanning concavities or holes).
    cap_tris = [
        tri
        for tri in triangulate(poly)
        if poly.contains(tri.representative_point())
    ]
    for tri in cap_tris:
        coords = list(tri.exterior.coords)[:3]
        base = len(verts)
        for x, y in coords:
            verts.append((x, y, z0))
        for x, y in coords:
            verts.append((x, y, z1))
        faces.append((base, base + 1, base + 2))  # bottom cap
        faces.append((base + 3, base + 4, base + 5))  # top cap

    # Side walls around the exterior and every hole.
    for ring in (poly.exterior, *poly.interiors):
        coords = list(ring.coords)
        for (x0, y0), (x1, y1) in zip(coords[:-1], coords[1:]):
            base = len(verts)
            verts.extend(
                [(x0, y0, z0), (x1, y1, z0), (x1, y1, z1), (x0, y0, z1)]
            )
            faces.append((base, base + 1, base + 2))
            faces.append((base, base + 2, base + 3))


def generate_support_mesh(
    support_layers: list[SupportLayer], layer_height: float
) -> trimesh.Trimesh | None:
    """Build a display solid by stacking each layer's footprint into a slab.

    Each footprint polygon is extruded by ``layer_height`` and placed at its
    layer height, so the stacked slabs follow the overhang surface above while
    resting on the plate below. Returns ``None`` when there is no support.
    """
    verts: list[tuple[float, float, float]] = []
    faces: list[tuple[int, int, int]] = []
    for layer in support_layers:
        if not layer.polygons:
            continue
        z0 = max(0.0, layer.z - layer_height)
        z1 = z0 + layer_height
        for poly in layer.polygons:
            _extrude_polygon(poly, z0, z1, verts, faces)

    if not faces:
        return None
    return trimesh.Trimesh(
        vertices=np.asarray(verts, dtype=float),
        faces=np.asarray(faces, dtype=np.int64),
        process=False,
    )
