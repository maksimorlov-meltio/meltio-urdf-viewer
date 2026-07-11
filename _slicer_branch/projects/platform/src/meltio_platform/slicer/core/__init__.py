"""Core slicing pipeline: mesh loading, slicing and toolpath generation."""

from __future__ import annotations

from .mesh_loader import load_mesh
from .infill import generate_infill_lines
from .orientation import tool_axes_from_normals, wall_tool_axes
from .slicer import Layer, LayerContour, SlicedModel, slice_mesh
from .support import SupportLayer, generate_support_mesh, support_layer_footprints
from .toolpath import (
    Toolpath,
    ToolpathMove,
    merge_toolpath_layers,
)
from .profile_toolpath import (
    generate_profile_support_toolpath,
    generate_profile_toolpath,
)
from .machine import (
    MachineComment,
    MachineMove,
    MachineProgram,
    build_machine_program,
)
from .gcode import program_to_gcode
from .transforms import apply_transform, available_transforms

__all__ = [
    "load_mesh",
    "slice_mesh",
    "SlicedModel",
    "Layer",
    "LayerContour",
    "generate_infill_lines",
    "tool_axes_from_normals",
    "wall_tool_axes",
    "generate_support_mesh",
    "support_layer_footprints",
    "SupportLayer",
    "merge_toolpath_layers",
    "generate_profile_toolpath",
    "generate_profile_support_toolpath",
    "Toolpath",
    "ToolpathMove",
    "MachineProgram",
    "MachineMove",
    "MachineComment",
    "build_machine_program",
    "program_to_gcode",
    "apply_transform",
    "available_transforms",
]
