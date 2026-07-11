"""Vendored slicing engine — the platform's own copy of the slicer core.

Copied (not shared) from ``projects/aslicer`` so the platform can evolve its
slicing behaviour and the viewer UI without disturbing the standalone
slicer.meltio.cloud. The C++ slicer core will eventually replace the internals
behind this package boundary.
"""

# Bump when the slicing engine's output could change. Every slice records the
# version it was produced with, so we can tell (and later restore) the exact
# engine behind a stored G-code. Keeping prior engine versions importable
# (e.g. meltio_platform.slicers.vX) is the path to "re-slice with the old version".
SLICER_VERSION = "0.1.0"
