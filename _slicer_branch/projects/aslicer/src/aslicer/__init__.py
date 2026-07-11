"""aslicer: an experimental, modular Python slicer for toolpath discovery.

The package is intentionally split into small, composable pieces so new
strategies (infill, multiple perimeters, non-planar slicing, ...) can be added
without disturbing the existing pipeline:

- :mod:`aslicer.config`        parameter definitions
- :mod:`aslicer.core`          mesh loading, slicing and toolpath generation
- :mod:`aslicer.web`           the FastAPI backend for the Three.js viewer
"""

from .config import SliceParameters
from .profile import (
    FEATURE_TYPES,
    FeatureSettings,
    MachineProfile,
    default_profile,
)
from .profile_store import ProfileStore

__all__ = [
    "SliceParameters",
    "MachineProfile",
    "FeatureSettings",
    "FEATURE_TYPES",
    "default_profile",
    "ProfileStore",
]
