"""Process parameters that drive slicing and toolpath generation."""

from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass(frozen=True)
class SliceParameters:
    """Physical process parameters for the geometry-only slicing stages.

    This is a slim projection of a :class:`~aslicer.profile.MachineProfile` used
    by the stages that only need geometry and feed math — mesh slicing, support
    footprint detection, and the machine-program/feed calculations. Per-feature
    toolpath strategy (perimeters, infill, head orientation) lives on the
    profile and is consumed directly by
    :mod:`aslicer.core.profile_toolpath`, not here.

    Defaults match the initial discovery target for the Meltio process.

    Attributes:
        layer_height_mm: Vertical distance between consecutive slice planes.
        bead_width_mm: Deposited bead (track) width, used for extrusion math.
        speed_mm_s: Travel/deposition speed along the toolpath.
        travel_speed_mm_s: Rapid (non-deposition) speed used for travel moves
            between deposition strokes. Emitted as the feed rate of ``G0`` moves.
        material_diameter_mm: Feedstock (wire) diameter, used for feed math.
        first_layer_offset_mm: Height of the first slice plane above the model's
            lowest point. When ``None`` it defaults to a single ``layer_height_mm``.
        support_overhang_angle_deg: Overhang threshold measured from vertical.
            Downward-facing surfaces tilted more than this from vertical are
            considered unsupported and get support material beneath them. ``0``
            would support every downward face; ``90`` disables support.
        support_min_area_mm2: Minimum cross-sectional (footprint) area of a
            support region. Overhang patches whose per-layer footprint is smaller
            than this are skipped, avoiding tiny slivers of support.
        max_travel_no_retract_mm: Longest rapid hop that is treated as a *short*
            travel and emitted without a retract/unretract. Travels longer than
            this are *long* travels and get bracketed by retract/unretract.
    """

    layer_height_mm: float = 1.0
    bead_width_mm: float = 1.2
    speed_mm_s: float = 10.0
    travel_speed_mm_s: float = 60.0
    material_diameter_mm: float = 1.0
    first_layer_offset_mm: float | None = None
    support_overhang_angle_deg: float = 25.0
    support_min_area_mm2: float = 5.0
    max_travel_no_retract_mm: float = 2.0

    def __post_init__(self) -> None:
        if self.layer_height_mm <= 0:
            raise ValueError("layer_height_mm must be positive")
        if self.bead_width_mm <= 0:
            raise ValueError("bead_width_mm must be positive")
        if self.speed_mm_s <= 0:
            raise ValueError("speed_mm_s must be positive")
        if self.travel_speed_mm_s <= 0:
            raise ValueError("travel_speed_mm_s must be positive")
        if self.material_diameter_mm <= 0:
            raise ValueError("material_diameter_mm must be positive")
        if not 0.0 <= self.support_overhang_angle_deg <= 90.0:
            raise ValueError("support_overhang_angle_deg must be within [0, 90]")
        if self.support_min_area_mm2 < 0.0:
            raise ValueError("support_min_area_mm2 must be non-negative")
        if self.max_travel_no_retract_mm < 0.0:
            raise ValueError("max_travel_no_retract_mm must be non-negative")

    @property
    def first_layer_z_offset(self) -> float:
        """Height of the first slice plane above the model's lowest point."""
        if self.first_layer_offset_mm is None:
            return self.layer_height_mm
        return self.first_layer_offset_mm

    @property
    def speed_mm_min(self) -> float:
        """Feed rate expressed in mm/min (typical G-code ``F`` units)."""
        return self.speed_mm_s * 60.0

    @property
    def travel_speed_mm_min(self) -> float:
        """Travel (rapid) feed rate expressed in mm/min (G-code ``F`` units)."""
        return self.travel_speed_mm_s * 60.0

    @property
    def bead_cross_section_mm2(self) -> float:
        """Approximate cross-sectional area of a deposited bead.

        Uses a simple rectangular approximation ``bead_width * layer_height``.
        """
        return self.bead_width_mm * self.layer_height_mm

    @property
    def feedstock_cross_section_mm2(self) -> float:
        """Cross-sectional area of the cylindrical feedstock wire."""
        radius = self.material_diameter_mm / 2.0
        return math.pi * radius * radius

    def feed_length_for_path(self, path_length_mm: float) -> float:
        """Length of feedstock required to deposit a path of ``path_length_mm``.

        Derived from volume conservation: the bead volume along the path equals
        the volume of consumed wire.
        """
        if path_length_mm <= 0:
            return 0.0
        volume = self.bead_cross_section_mm2 * path_length_mm
        return volume / self.feedstock_cross_section_mm2
