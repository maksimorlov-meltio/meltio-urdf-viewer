"""The machine-model catalog: which physical printer a slice targets.

A **machine model** (e.g. *M600 PRO*, *M600 (standard)*) owns the things that are
intrinsic to the hardware/controller — its capabilities (axes, build volume,
origin) and its G-code **macros** (the dialect: PRINT_START/END, deposition, short
travel). A :class:`~meltio_platform.slicer.profile.MachineProfile` is the *material/
process recipe* (powers, feeds, beads, #variable values); at slice time the chosen
machine's macros + capabilities are merged onto the profile via :func:`apply_machine`.

Models are factory-defined and read-only, shipped as JSON in ``factory_machines/``
(seeded the same way as ``factory_profiles``). Physical units / serial numbers are a
separate, post-print concern and live elsewhere.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, replace
from pathlib import Path

from .profile import MachineProfile

_FACTORY_DIR = Path(__file__).parent / "factory_machines"

# The fields a machine contributes to the effective profile at slice time.
_CAPABILITY_FIELDS = (
    "axes",
    "build_volume_x_mm",
    "build_volume_y_mm",
    "build_volume_z_mm",
    "origin_corner",
)
_MACRO_FIELDS = (
    "start_print_macro",
    "end_print_macro",
    "start_deposition_macro",
    "stop_deposition_macro",
    "pre_short_travel_macro",
    "short_travel_end_macro",
)


@dataclass(frozen=True)
class MachineModel:
    """A factory-defined printer model: identity + capabilities + G-code macros."""

    # key = a stable slug (factory presets only); user presets are identified by name.
    key: str = ""
    name: str = ""
    axes: str = "3-axis"
    build_volume_x_mm: float = 300.0
    build_volume_y_mm: float = 400.0
    build_volume_z_mm: float = 600.0
    origin_corner: str = "top_right"
    start_print_macro: str = ""
    end_print_macro: str = ""
    start_deposition_macro: str = ""
    stop_deposition_macro: str = ""
    pre_short_travel_macro: str = ""
    short_travel_end_macro: str = ""

    @classmethod
    def from_dict(cls, data: dict) -> "MachineModel":
        fields = {f for f in cls.__dataclass_fields__}
        return cls(**{k: v for k, v in data.items() if k in fields})

    def to_dict(self) -> dict:
        return asdict(self)

    def summary(self) -> dict:
        """Lightweight catalog entry (no macro text) for the picker."""
        return {
            "key": self.key,
            "name": self.name,
            "axes": self.axes,
            "build_volume_x_mm": self.build_volume_x_mm,
            "build_volume_y_mm": self.build_volume_y_mm,
            "build_volume_z_mm": self.build_volume_z_mm,
            "origin_corner": self.origin_corner,
        }


def machine_catalog() -> tuple[MachineModel, ...]:
    """All factory machine models, loaded from ``factory_machines/*.json``."""
    models: list[MachineModel] = []
    if _FACTORY_DIR.is_dir():
        for path in sorted(_FACTORY_DIR.glob("*.json")):
            try:
                models.append(
                    MachineModel.from_dict(json.loads(path.read_text(encoding="utf-8")))
                )
            except (ValueError, OSError, json.JSONDecodeError):
                continue
    return tuple(models)


def get_machine(key: str | None) -> MachineModel | None:
    """The machine model with ``key``, or ``None``."""
    if not key:
        return None
    for m in machine_catalog():
        if m.key == key:
            return m
    return None


def default_machine_key() -> str | None:
    """A sensible default machine (first in the catalog), or ``None`` if empty."""
    catalog = machine_catalog()
    return catalog[0].key if catalog else None


def apply_machine(profile: MachineProfile, machine: MachineModel) -> MachineProfile:
    """Return ``profile`` with the machine's capabilities + macros merged in — the
    effective profile to slice/generate G-code with (recipe ⊕ machine)."""
    overrides = {f: getattr(machine, f) for f in (*_CAPABILITY_FIELDS, *_MACRO_FIELDS)}
    return replace(profile, **overrides)
