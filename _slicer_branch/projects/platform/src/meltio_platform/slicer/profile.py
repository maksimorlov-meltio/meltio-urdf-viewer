"""Machine profiles: a structured, persistable description of *how* to build.

A :class:`MachineProfile` is the user-facing configuration object that the GUI's
profile manager edits. It bundles three concerns so the rest of the pipeline can
stay simple and the profile can grow without churn:

* **Machine capabilities** — ``axes`` (``"3-axis"``/``"5-axis"``) and
  ``material`` (``"single"``/``"dual"``). These gate what is physically
  possible (e.g. a 3-axis machine cannot tilt the head, a single-material
  machine only has feeder ``T0``).
* **Global build settings** — geometry/process values that are not specific to
  one feature type (layer height, perimeter count, ordering, travel speed, ...).
* **Per-feature process settings** — one :class:`FeatureSettings` for each
  toolpath *feature type* (outer perimeter, inner perimeters, infill, support,
  support perimeter), giving each its own feeder, feed rate, bead width, laser
  power and (where meaningful) infill density.

The profile deliberately knows nothing about toolpaths or G-code. It can be
projected onto the legacy :class:`~meltio_platform.slicer.config.SliceParameters` via
:meth:`MachineProfile.to_slice_parameters` for the geometry-only stages
(slicing, support footprints), while the feature-aware toolpath generator reads
the per-feature settings directly.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Any

from .config import SliceParameters

# Capability vocabularies kept as module constants so the API, GUI and tests
# share a single source of truth.
AXES_OPTIONS = ("3-axis", "5-axis")
MATERIAL_OPTIONS = ("single", "dual")
FEEDER_OPTIONS = ("T0", "T1")
PERIMETER_ORDER_OPTIONS = ("outside_in", "inside_out")
ORIENT_OPTIONS = ("none", "all", "overhang")
# How the infill line angle advances from one layer to the next.
# ``"alternating"`` flips 0/90 every layer (classic cross-hatch); ``"rotating"``
# adds 45 deg each layer, cycling through four directions.
INFILL_PATTERN_OPTIONS = ("alternating", "rotating")
# Order infill line segments are deposited in. ``"sequential"`` keeps the
# scan-line (boustrophedon) order, so a line split by a hole crosses the hole to
# finish on the far side. ``"shortest_travel"`` greedily visits the nearest
# unprinted segment next (nearest-neighbour), so the head fills one side before
# crossing — minimising travel around holes.
INFILL_ORDER_OPTIONS = ("sequential", "shortest_travel")
# Where each closed perimeter starts (its "seam"). ``"nearest"`` starts at the
# vertex closest to the previous move's end (minimum travel); ``"rear"`` always
# starts at the rear-most (max Y) vertex; ``"random"`` scatters the start.
SEAM_ALIGNMENT_OPTIONS = ("nearest", "rear", "random")
# Which physical corner of the build plate the machine origin (0, 0) sits at.
# ``"center"`` places the origin at the middle of the plate.
ORIGIN_CORNER_OPTIONS = (
    "top_left",
    "top_right",
    "bottom_left",
    "bottom_right",
    "center",
)

# The distinct toolpath feature types a profile configures, in display order.
# Support mirrors the part: an outer perimeter, inner perimeters and a fill.
FEATURE_TYPES = (
    "outer_perimeter",
    "inner_perimeter",
    "infill",
    "support_outer_perimeter",
    "support_inner_perimeter",
    "support",
)

# Features whose ``infill_density`` is meaningful (they are filled with lines).
DENSITY_FEATURES = ("infill", "support")

# Human-readable labels for the GUI / documentation.
FEATURE_LABELS = {
    "outer_perimeter": "Outer Perimeter",
    "inner_perimeter": "Inner Perimeters",
    "infill": "Infill",
    "support_outer_perimeter": "Support Outer Perimeter",
    "support_inner_perimeter": "Support Inner Perimeters",
    "support": "Support Infill",
}


@dataclass(frozen=True)
class FeatureSettings:
    """Per-feature deposition process settings.

    Attributes:
        feeder: Wire feeder/tool to deposit this feature with (``"T0"``/``"T1"``).
        feed_rate_mm_s: Deposition speed for this feature (mm/s).
        bead_width_mm: Deposited bead width for this feature. Drives both the
            geometry (perimeter insets / infill line spacing) and the extrusion
            (E) math for this feature.
        laser_power: Laser power for this feature (machine units, e.g. watts).
        infill_density: Fill fraction in ``[0, 1]`` for filled features (infill
            and support). ``None`` for perimeter-type features.
    """

    feeder: str = "T0"
    feed_rate_mm_s: float = 10.0
    bead_width_mm: float = 1.2
    laser_power: float = 1000.0
    infill_density: float | None = None

    def validate(self, key: str) -> None:
        """Validate against the rules for the feature ``key`` it belongs to."""
        if self.feeder not in FEEDER_OPTIONS:
            raise ValueError(f"{key}.feeder must be one of {FEEDER_OPTIONS}")
        if self.feed_rate_mm_s <= 0:
            raise ValueError(f"{key}.feed_rate_mm_s must be positive")
        if self.bead_width_mm <= 0:
            raise ValueError(f"{key}.bead_width_mm must be positive")
        if self.laser_power < 0:
            raise ValueError(f"{key}.laser_power must be non-negative")
        if key in DENSITY_FEATURES:
            if self.infill_density is None or not 0.0 <= self.infill_density <= 1.0:
                raise ValueError(f"{key}.infill_density must be within [0, 1]")

    @property
    def feed_rate_mm_min(self) -> float:
        """Feed rate expressed in mm/min (typical G-code ``F`` units)."""
        return self.feed_rate_mm_s * 60.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "feeder": self.feeder,
            "feed_rate_mm_s": self.feed_rate_mm_s,
            "bead_width_mm": self.bead_width_mm,
            "laser_power": self.laser_power,
            "infill_density": self.infill_density,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any], base: "FeatureSettings") -> "FeatureSettings":
        """Build from a (possibly partial) dict, filling gaps from ``base``."""
        return replace(
            base,
            feeder=str(data.get("feeder", base.feeder)),
            feed_rate_mm_s=float(data.get("feed_rate_mm_s", base.feed_rate_mm_s)),
            bead_width_mm=float(data.get("bead_width_mm", base.bead_width_mm)),
            laser_power=float(data.get("laser_power", base.laser_power)),
            infill_density=(
                None
                if data.get("infill_density", base.infill_density) is None
                else float(data.get("infill_density", base.infill_density))
            ),
        )


@dataclass(frozen=True)
class MachineProfile:
    """A complete, persistable machine/material build profile.

    See the module docstring for the three concerns this groups together.
    """

    name: str = "Untitled"
    axes: str = "5-axis"
    material: str = "single"
    # The factory machine model this recipe targets (key into the machine catalog,
    # e.g. "m600_pro"). At slice time the machine's macros + capabilities are merged
    # in (see machine_catalog.apply_machine). Empty = unbound / use defaults.
    machine_key: str = ""
    # Factory ("master") profiles are read-only presets shipped with the slicer:
    # they cannot be edited or deleted, only duplicated into an editable copy.
    factory: bool = False

    # Workspace / build area (machine coordinates, mm). The origin sits at one
    # corner of the plate; the build volume spans the positive quadrant from it.
    build_volume_x_mm: float = 300.0
    build_volume_y_mm: float = 400.0
    build_volume_z_mm: float = 600.0
    origin_corner: str = "top_right"
    # Default XY point that models are centred on. ``None`` means the geometric
    # centre of the build area (build_volume / 2), so a fresh profile centres
    # parts on the middle of the plate.
    center_x_mm: float | None = None
    center_y_mm: float | None = None

    # Global build / geometry settings.
    layer_height_mm: float = 1.0
    travel_speed_mm_s: float = 60.0
    material_diameter_mm: float = 1.0
    material_density_g_cm3: float = 7.8
    # Material thermal properties (used by the thermal simulation). Defaults are
    # representative room-temperature values for 316L stainless steel.
    material_thermal_conductivity_w_mk: float = 15.0
    material_specific_heat_j_kgk: float = 500.0
    first_layer_offset_mm: float | None = None
    perimeter_count: int = 1
    perimeter_order: str = "outside_in"
    infill_before_perimeters: bool = False
    infill_angle_deg: float = 45.0
    infill_pattern: str = "alternating"
    infill_order: str = "sequential"
    seam_alignment: str = "nearest"
    min_infill_segment_length_mm: float = 1.0
    max_segment_length_mm: float | None = 5.0
    # Rapid hops up to this length are short travels (no retract); longer hops
    # are long travels and get a retract/unretract in the machine program.
    max_travel_no_retract_mm: float = 2.0
    orient_perimeters: str = "none"
    support_enabled: bool = False
    support_overhang_angle_deg: float = 25.0
    support_min_area_mm2: float = 5.0
    support_perimeter_count: int = 0

    # --- Print macros: G-code blocks emitted at process boundaries. They support
    # #variables resolved at emit time: #shieldgas_flow -> shieldgas_flow_l_min,
    # and (deposition macros only) #laser_power -> the current section's laser power.
    # Multi-line text is allowed; each line is emitted verbatim after substitution.
    start_print_macro: str = ""  # once, before any motion (PRINT_START)
    end_print_macro: str = ""  # once, at the end (PRINT_END)
    start_deposition_macro: str = ""  # before each deposition run (START_DEPOSITION)
    stop_deposition_macro: str = ""  # after each deposition run (STOP_DEPOSITION)
    pre_short_travel_macro: str = ""  # before a short (no-retract) travel
    short_travel_end_macro: str = ""  # after a short travel
    # Shield/argon gas flow (L/min), referenced by macros via #shieldgas_flow.
    shieldgas_flow_l_min: float = 15.0
    # Deposition timing/feed, exposed to macros as built-in variables:
    #   #laser_on_time    -> deposition_start_laser_on_time_ms (START_DEPOSITION T)
    #   #start_extrusion  -> deposition_start_extrusion_mm      (START_DEPOSITION E)
    #   #retraction       -> deposition_end_retraction_mm       (STOP_DEPOSITION R)
    #   #retraction_power -> deposition_retraction_power_w       (STOP_DEPOSITION W)
    deposition_start_laser_on_time_ms: float = 100.0
    deposition_start_extrusion_mm: float = 2.0
    deposition_end_retraction_mm: float = 4.0
    deposition_retraction_power_w: float = 1000.0
    # First deposition layer Z: True -> 0 (shift all Z down by the first layer height,
    # the M600 behaviour); False -> the layer height (the geometric Z).
    start_z_at_zero: bool = False
    # User-defined macro variables {name: value}: each ``#name`` in any macro is
    # replaced by its value. Built-ins (#shieldgas_flow, #laser_power) take
    # precedence; names here are matched longest-first so prefixes don't clash.
    macro_variables: dict[str, float] = None  # type: ignore[assignment]

    # Per-feature process settings, one entry per FEATURE_TYPES key.
    features: dict[str, FeatureSettings] = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        # Default the feature map so callers can omit it.
        if self.features is None:
            object.__setattr__(self, "features", _default_features())
        if self.macro_variables is None:
            object.__setattr__(self, "macro_variables", {})
        self.validate()

    def validate(self) -> None:
        if not self.name.strip():
            raise ValueError("profile name must not be empty")
        if self.axes not in AXES_OPTIONS:
            raise ValueError(f"axes must be one of {AXES_OPTIONS}")
        if self.material not in MATERIAL_OPTIONS:
            raise ValueError(f"material must be one of {MATERIAL_OPTIONS}")
        if self.build_volume_x_mm <= 0 or self.build_volume_y_mm <= 0:
            raise ValueError("build volume X and Y must be positive")
        if self.build_volume_z_mm <= 0:
            raise ValueError("build_volume_z_mm must be positive")
        if self.origin_corner not in ORIGIN_CORNER_OPTIONS:
            raise ValueError(f"origin_corner must be one of {ORIGIN_CORNER_OPTIONS}")
        if self.center_x_mm is not None and not (
            0.0 <= self.center_x_mm <= self.build_volume_x_mm
        ):
            raise ValueError("center_x_mm must lie within the build area")
        if self.center_y_mm is not None and not (
            0.0 <= self.center_y_mm <= self.build_volume_y_mm
        ):
            raise ValueError("center_y_mm must lie within the build area")
        if self.layer_height_mm <= 0:
            raise ValueError("layer_height_mm must be positive")
        if self.travel_speed_mm_s <= 0:
            raise ValueError("travel_speed_mm_s must be positive")
        if self.material_diameter_mm <= 0:
            raise ValueError("material_diameter_mm must be positive")
        if self.material_density_g_cm3 <= 0:
            raise ValueError("material_density_g_cm3 must be positive")
        if self.material_thermal_conductivity_w_mk <= 0:
            raise ValueError("material_thermal_conductivity_w_mk must be positive")
        if self.material_specific_heat_j_kgk <= 0:
            raise ValueError("material_specific_heat_j_kgk must be positive")
        if self.perimeter_count < 1:
            raise ValueError("perimeter_count must be at least 1")
        if self.perimeter_order not in PERIMETER_ORDER_OPTIONS:
            raise ValueError(f"perimeter_order must be one of {PERIMETER_ORDER_OPTIONS}")
        if self.infill_pattern not in INFILL_PATTERN_OPTIONS:
            raise ValueError(f"infill_pattern must be one of {INFILL_PATTERN_OPTIONS}")
        if self.infill_order not in INFILL_ORDER_OPTIONS:
            raise ValueError(f"infill_order must be one of {INFILL_ORDER_OPTIONS}")
        if self.seam_alignment not in SEAM_ALIGNMENT_OPTIONS:
            raise ValueError(f"seam_alignment must be one of {SEAM_ALIGNMENT_OPTIONS}")
        if self.orient_perimeters not in ORIENT_OPTIONS:
            raise ValueError(f"orient_perimeters must be one of {ORIENT_OPTIONS}")
        if self.max_travel_no_retract_mm < 0.0:
            raise ValueError("max_travel_no_retract_mm must not be negative")
        if not 0.0 <= self.support_overhang_angle_deg <= 90.0:
            raise ValueError("support_overhang_angle_deg must be within [0, 90]")
        if self.support_perimeter_count < 0:
            raise ValueError("support_perimeter_count must not be negative")
        if self.shieldgas_flow_l_min < 0:
            raise ValueError("shieldgas_flow_l_min must not be negative")
        if self.deposition_start_laser_on_time_ms < 0:
            raise ValueError("deposition_start_laser_on_time_ms must not be negative")
        if self.deposition_start_extrusion_mm < 0:
            raise ValueError("deposition_start_extrusion_mm must not be negative")
        if self.deposition_end_retraction_mm < 0:
            raise ValueError("deposition_end_retraction_mm must not be negative")
        if self.deposition_retraction_power_w < 0:
            raise ValueError("deposition_retraction_power_w must not be negative")
        for name in self.macro_variables:
            if not name or any(c.isspace() for c in name) or "#" in name:
                raise ValueError(
                    f"macro variable name {name!r} must be non-empty and contain "
                    "no spaces or '#'"
                )
        missing = [key for key in FEATURE_TYPES if key not in self.features]
        if missing:
            raise ValueError(f"profile is missing feature settings: {missing}")
        for key in FEATURE_TYPES:
            self.features[key].validate(key)

    # -- Capability-aware resolution ---------------------------------------

    @property
    def effective_orient_perimeters(self) -> str:
        """Orientation mode actually applied, gated by machine capability.

        A 3-axis machine cannot tilt the head, so orientation collapses to
        ``"none"`` regardless of the stored value.
        """
        return self.orient_perimeters if self.axes == "5-axis" else "none"

    @property
    def effective_center_x_mm(self) -> float:
        """X coordinate models are centred on; geometric centre when unset."""
        if self.center_x_mm is None:
            return self.build_volume_x_mm / 2.0
        return self.center_x_mm

    @property
    def effective_center_y_mm(self) -> float:
        """Y coordinate models are centred on; geometric centre when unset."""
        if self.center_y_mm is None:
            return self.build_volume_y_mm / 2.0
        return self.center_y_mm

    def feeder_for(self, key: str) -> str:
        """Feeder used for feature ``key``, gated by the material capability.

        A single-material machine only has feeder ``T0``.
        """
        if self.material == "single":
            return "T0"
        return self.features[key].feeder

    @property
    def thermal_diffusivity_mm2_s(self) -> float:
        """Thermal diffusivity ``alpha = k / (rho * cp)`` in ``mm^2/s``.

        Combines the conductivity, density and specific heat into the single
        quantity that governs how fast heat spreads, which the thermal model
        uses to couple its spatial and temporal decay. Density is converted from
        ``g/cm^3`` to ``kg/m^3`` (x1000) and the result from ``m^2/s`` to
        ``mm^2/s`` (x1e6), a net factor of 1000.
        """
        return (
            self.material_thermal_conductivity_w_mk
            / (self.material_density_g_cm3 * self.material_specific_heat_j_kgk)
            * 1000.0
        )

    def estimated_mass_g(self, feedstock_length_mm: float) -> float:
        """Deposited mass (grams) for a consumed wire ``feedstock_length_mm``.

        Wire is conserved, so the deposited volume equals the feedstock cylinder
        volume (length x cross-section). Converted to cm^3 and multiplied by the
        material density.
        """
        radius_mm = self.material_diameter_mm / 2.0
        volume_mm3 = feedstock_length_mm * 3.141592653589793 * radius_mm * radius_mm
        return volume_mm3 / 1000.0 * self.material_density_g_cm3

    # -- Macros ------------------------------------------------------------

    def render_macro(
        self,
        text: str,
        *,
        laser_power: float | None = None,
        feature_type: str | None = None,
    ) -> str:
        """Substitute ``#variables`` in a macro and return the resulting text.

        ``#shieldgas_flow`` resolves to :attr:`shieldgas_flow_l_min`. In a
        deposition context the caller also supplies ``laser_power`` (resolving
        ``#laser_power`` to the section's power) and ``feature_type`` (resolving
        ``#feature_type`` to the feature being deposited, e.g. ``"Infill"``);
        macros with no such context pass ``None`` and leave those tokens
        untouched. Numbers are formatted compactly (no trailing zeros), so
        ``15.0`` becomes ``15``.
        """
        if not text:
            return ""
        # Built-in numeric variables. Substituted longest-name-first so a shorter
        # name (#retraction) never partly matches a longer one (#retraction_power).
        builtins = {
            "shieldgas_flow": self.shieldgas_flow_l_min,
            "laser_on_time": self.deposition_start_laser_on_time_ms,
            "start_extrusion": self.deposition_start_extrusion_mm,
            "retraction_power": self.deposition_retraction_power_w,
            "retraction": self.deposition_end_retraction_mm,
        }
        out = text
        for name in sorted(builtins, key=len, reverse=True):
            out = out.replace(f"#{name}", _fmt(builtins[name]))
        if laser_power is not None:
            out = out.replace("#laser_power", _fmt(laser_power))
        if feature_type is not None:
            out = out.replace("#feature_type", feature_type)
        # Custom variables, longest name first so e.g. #ramp_fast is not partly
        # matched by a shorter #ramp.
        for name in sorted(self.macro_variables, key=len, reverse=True):
            out = out.replace(f"#{name}", _fmt(self.macro_variables[name]))
        return out

    # -- Projections / serialisation ---------------------------------------

    def to_slice_parameters(self) -> SliceParameters:
        """Project onto :class:`SliceParameters` for the geometry-only stages.

        Only the geometry/feed fields the slicing, support and machine stages
        need are projected; per-feature toolpath strategy stays on the profile
        and is consumed directly by the profile-driven generator. Bead width and
        speed are taken from the outer-perimeter feature as a representative
        value (used for preview stats and feed math).
        """
        outer = self.features["outer_perimeter"]
        return SliceParameters(
            layer_height_mm=self.layer_height_mm,
            bead_width_mm=outer.bead_width_mm,
            speed_mm_s=outer.feed_rate_mm_s,
            travel_speed_mm_s=self.travel_speed_mm_s,
            material_diameter_mm=self.material_diameter_mm,
            first_layer_offset_mm=self.first_layer_offset_mm,
            support_overhang_angle_deg=self.support_overhang_angle_deg,
            support_min_area_mm2=self.support_min_area_mm2,
            max_travel_no_retract_mm=self.max_travel_no_retract_mm,
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "axes": self.axes,
            "material": self.material,
            "machine_key": self.machine_key,
            "factory": self.factory,
            "build_volume_x_mm": self.build_volume_x_mm,
            "build_volume_y_mm": self.build_volume_y_mm,
            "build_volume_z_mm": self.build_volume_z_mm,
            "origin_corner": self.origin_corner,
            "center_x_mm": self.center_x_mm,
            "center_y_mm": self.center_y_mm,
            "layer_height_mm": self.layer_height_mm,
            "travel_speed_mm_s": self.travel_speed_mm_s,
            "material_diameter_mm": self.material_diameter_mm,
            "material_density_g_cm3": self.material_density_g_cm3,
            "material_thermal_conductivity_w_mk": (
                self.material_thermal_conductivity_w_mk
            ),
            "material_specific_heat_j_kgk": self.material_specific_heat_j_kgk,
            "first_layer_offset_mm": self.first_layer_offset_mm,
            "perimeter_count": self.perimeter_count,
            "perimeter_order": self.perimeter_order,
            "infill_before_perimeters": self.infill_before_perimeters,
            "infill_angle_deg": self.infill_angle_deg,
            "infill_pattern": self.infill_pattern,
            "infill_order": self.infill_order,
            "seam_alignment": self.seam_alignment,
            "min_infill_segment_length_mm": self.min_infill_segment_length_mm,
            "max_segment_length_mm": self.max_segment_length_mm,
            "max_travel_no_retract_mm": self.max_travel_no_retract_mm,
            "orient_perimeters": self.orient_perimeters,
            "support_enabled": self.support_enabled,
            "support_overhang_angle_deg": self.support_overhang_angle_deg,
            "support_min_area_mm2": self.support_min_area_mm2,
            "support_perimeter_count": self.support_perimeter_count,
            "start_print_macro": self.start_print_macro,
            "end_print_macro": self.end_print_macro,
            "start_deposition_macro": self.start_deposition_macro,
            "stop_deposition_macro": self.stop_deposition_macro,
            "pre_short_travel_macro": self.pre_short_travel_macro,
            "short_travel_end_macro": self.short_travel_end_macro,
            "shieldgas_flow_l_min": self.shieldgas_flow_l_min,
            "deposition_start_laser_on_time_ms": self.deposition_start_laser_on_time_ms,
            "deposition_start_extrusion_mm": self.deposition_start_extrusion_mm,
            "deposition_end_retraction_mm": self.deposition_end_retraction_mm,
            "deposition_retraction_power_w": self.deposition_retraction_power_w,
            "start_z_at_zero": self.start_z_at_zero,
            "macro_variables": dict(self.macro_variables),
            "features": {key: self.features[key].to_dict() for key in FEATURE_TYPES},
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "MachineProfile":
        """Build a profile from a (possibly partial) dict, filling gaps.

        Unknown/missing fields fall back to the default profile, so older or
        partial payloads still load. Raises ``ValueError`` on invalid values.
        """
        base = default_profile()
        base_features = base.features
        raw_features = dict(data.get("features") or {})
        # Backward-compat: the single "support_perimeter" feature was split into
        # outer/inner support perimeters. Seed both from the old value if present.
        legacy_support_perimeter = raw_features.get("support_perimeter")
        if legacy_support_perimeter is not None:
            raw_features.setdefault("support_outer_perimeter", legacy_support_perimeter)
            raw_features.setdefault("support_inner_perimeter", legacy_support_perimeter)
        features = {
            key: FeatureSettings.from_dict(raw_features.get(key, {}), base_features[key])
            for key in FEATURE_TYPES
        }
        max_seg = data.get("max_segment_length_mm", base.max_segment_length_mm)
        first_layer = data.get("first_layer_offset_mm", base.first_layer_offset_mm)
        center_x = data.get("center_x_mm", base.center_x_mm)
        center_y = data.get("center_y_mm", base.center_y_mm)
        return cls(
            name=str(data.get("name", base.name)),
            axes=str(data.get("axes", base.axes)),
            material=str(data.get("material", base.material)),
            machine_key=str(data.get("machine_key", base.machine_key)),
            # Default to False (not base.factory): a profile is only "factory"
            # when explicitly flagged, so user payloads can't mint master profiles.
            factory=bool(data.get("factory", False)),
            build_volume_x_mm=float(
                data.get("build_volume_x_mm", base.build_volume_x_mm)
            ),
            build_volume_y_mm=float(
                data.get("build_volume_y_mm", base.build_volume_y_mm)
            ),
            build_volume_z_mm=float(
                data.get("build_volume_z_mm", base.build_volume_z_mm)
            ),
            origin_corner=str(data.get("origin_corner", base.origin_corner)),
            center_x_mm=(None if center_x is None else float(center_x)),
            center_y_mm=(None if center_y is None else float(center_y)),
            layer_height_mm=float(data.get("layer_height_mm", base.layer_height_mm)),
            travel_speed_mm_s=float(data.get("travel_speed_mm_s", base.travel_speed_mm_s)),
            material_diameter_mm=float(
                data.get("material_diameter_mm", base.material_diameter_mm)
            ),
            material_density_g_cm3=float(
                data.get("material_density_g_cm3", base.material_density_g_cm3)
            ),
            material_thermal_conductivity_w_mk=float(
                data.get(
                    "material_thermal_conductivity_w_mk",
                    base.material_thermal_conductivity_w_mk,
                )
            ),
            material_specific_heat_j_kgk=float(
                data.get(
                    "material_specific_heat_j_kgk", base.material_specific_heat_j_kgk
                )
            ),
            first_layer_offset_mm=(None if first_layer is None else float(first_layer)),
            perimeter_count=int(data.get("perimeter_count", base.perimeter_count)),
            perimeter_order=str(data.get("perimeter_order", base.perimeter_order)),
            infill_before_perimeters=bool(
                data.get("infill_before_perimeters", base.infill_before_perimeters)
            ),
            infill_angle_deg=float(data.get("infill_angle_deg", base.infill_angle_deg)),
            infill_pattern=str(data.get("infill_pattern", base.infill_pattern)),
            infill_order=str(data.get("infill_order", base.infill_order)),
            seam_alignment=str(data.get("seam_alignment", base.seam_alignment)),
            min_infill_segment_length_mm=float(
                data.get(
                    "min_infill_segment_length_mm", base.min_infill_segment_length_mm
                )
            ),
            max_segment_length_mm=(None if max_seg is None else float(max_seg)),
            max_travel_no_retract_mm=float(
                data.get("max_travel_no_retract_mm", base.max_travel_no_retract_mm)
            ),
            orient_perimeters=str(data.get("orient_perimeters", base.orient_perimeters)),
            support_enabled=bool(data.get("support_enabled", base.support_enabled)),
            support_overhang_angle_deg=float(
                data.get("support_overhang_angle_deg", base.support_overhang_angle_deg)
            ),
            support_min_area_mm2=float(
                data.get("support_min_area_mm2", base.support_min_area_mm2)
            ),
            support_perimeter_count=int(
                data.get("support_perimeter_count", base.support_perimeter_count)
            ),
            start_print_macro=str(data.get("start_print_macro", base.start_print_macro)),
            end_print_macro=str(data.get("end_print_macro", base.end_print_macro)),
            start_deposition_macro=str(
                data.get("start_deposition_macro", base.start_deposition_macro)
            ),
            stop_deposition_macro=str(
                data.get("stop_deposition_macro", base.stop_deposition_macro)
            ),
            pre_short_travel_macro=str(
                data.get("pre_short_travel_macro", base.pre_short_travel_macro)
            ),
            short_travel_end_macro=str(
                data.get("short_travel_end_macro", base.short_travel_end_macro)
            ),
            shieldgas_flow_l_min=float(
                data.get("shieldgas_flow_l_min", base.shieldgas_flow_l_min)
            ),
            deposition_start_laser_on_time_ms=float(
                data.get(
                    "deposition_start_laser_on_time_ms",
                    base.deposition_start_laser_on_time_ms,
                )
            ),
            deposition_start_extrusion_mm=float(
                data.get(
                    "deposition_start_extrusion_mm", base.deposition_start_extrusion_mm
                )
            ),
            deposition_end_retraction_mm=float(
                data.get(
                    "deposition_end_retraction_mm", base.deposition_end_retraction_mm
                )
            ),
            deposition_retraction_power_w=float(
                data.get(
                    "deposition_retraction_power_w", base.deposition_retraction_power_w
                )
            ),
            start_z_at_zero=bool(data.get("start_z_at_zero", base.start_z_at_zero)),
            macro_variables={
                str(k): float(v)
                for k, v in (data.get("macro_variables") or {}).items()
            },
            features=features,
        )


def _fmt(value: float) -> str:
    """Format a number compactly for macro substitution (no trailing zeros)."""
    if value == int(value):
        return str(int(value))
    return f"{value:.3f}".rstrip("0").rstrip(".")


def _default_features() -> dict[str, FeatureSettings]:
    """The per-feature defaults (the tuned 316L master values)."""
    return {
        "outer_perimeter": FeatureSettings(
            feeder="T0", feed_rate_mm_s=6.0, bead_width_mm=1.5, laser_power=1000.0
        ),
        "inner_perimeter": FeatureSettings(
            feeder="T0", feed_rate_mm_s=10.0, bead_width_mm=1.0, laser_power=1000.0
        ),
        "infill": FeatureSettings(
            feeder="T0",
            feed_rate_mm_s=10.0,
            bead_width_mm=1.0,
            laser_power=1000.0,
            infill_density=1.0,
        ),
        "support": FeatureSettings(
            feeder="T0",
            feed_rate_mm_s=10.0,
            bead_width_mm=1.0,
            laser_power=900.0,
            infill_density=1.0,
        ),
        "support_outer_perimeter": FeatureSettings(
            feeder="T0", feed_rate_mm_s=6.0, bead_width_mm=1.5, laser_power=1000.0
        ),
        "support_inner_perimeter": FeatureSettings(
            feeder="T0", feed_rate_mm_s=10.0, bead_width_mm=1.0, laser_power=1000.0
        ),
    }


def default_profile() -> MachineProfile:
    """The 316L master profile shipped with the slicer (read-only factory preset)."""
    return MachineProfile(
        name="M600 Pro SS316L",
        axes="3-axis",
        material="single",
        factory=True,
        perimeter_count=2,
        perimeter_order="inside_out",
        infill_order="shortest_travel",
        orient_perimeters="none",
        # M600 macros. Each carries its own readable ; Start of / ; End of comment
        # wrappers (so insertions/comments are user-editable in the macro itself).
        # PRINT_START is fully specified (argon via #shieldgas_flow); the deposition
        # /end macros carry their required params only, with the section's power via
        # #laser_power and the feature via #feature_type. Tune T/E/R/Z in the UI.
        start_print_macro=(
            "; Start of PRINT_START macro\n"
            "G250 P1 N1 T0 M0 S0 F#shieldgas_flow H1 A1 Q0 W53 X150 Y200 Z1 G1\n"
            "; End of PRINT_START macro"
        ),
        start_deposition_macro=(
            "; Start of START_DEPOSITION macro\n"
            "; Feature: #feature_type\n"
            "G250 P2 W#laser_power T#laser_on_time E#start_extrusion\n"
            "; End of START_DEPOSITION macro"
        ),
        stop_deposition_macro=(
            "; Start of STOP_DEPOSITION macro\n"
            "G250 P3 R#retraction W#retraction_power\n"
            "; End of STOP_DEPOSITION macro"
        ),
        end_print_macro=(
            "; Start of PRINT_END macro\n"
            "G250 P5 Z10\n"
            "; End of PRINT_END macro"
        ),
        pre_short_travel_macro=(
            "; Start of PRE_SHORT_TRAVEL macro\n"
            "; End of PRE_SHORT_TRAVEL macro"
        ),
        short_travel_end_macro=(
            "; Start of SHORT_TRAVEL_END macro\n"
            "; End of SHORT_TRAVEL_END macro"
        ),
        shieldgas_flow_l_min=15.0,
        # The M600 lays its first layer at Z0 (the historical behaviour).
        start_z_at_zero=True,
        features=_default_features(),
    )
