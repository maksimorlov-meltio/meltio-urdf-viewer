"""Thermal simulation for Wire-DED toolpaths.

This package is deliberately **decoupled** from the slicing core: it only *reads*
the finished :class:`~aslicer.core.toolpath.Toolpath` (and its data structures)
and never feeds anything back into slicing. No slicing module imports from here,
so the two features can evolve independently.

The first-pass model is a *moving heat-source / thermal-exposure* model
(:func:`simulate_exposure`): it converts the planned deposition into fixed-length
:class:`ThermalSegment` nodes and estimates a qualitative, relative heat-risk
score per segment by superposing the decayed heat of previously deposited
segments. The segment list, timing model, IDs and material parameters are the
same structures a future graph/RC solver would consume — there each segment
becomes a node and neighbour relations become thermal-conductance edges — so the
upgrade swaps only the solver, not the rest of the pipeline.
"""

from __future__ import annotations

from .model import ThermalParams, simulate_exposure
from .segments import ThermalSegment, build_thermal_segments

__all__ = [
    "ThermalSegment",
    "build_thermal_segments",
    "ThermalParams",
    "simulate_exposure",
]
