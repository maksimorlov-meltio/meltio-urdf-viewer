"""Tests for the web viewer payload serialisation."""

from __future__ import annotations

import trimesh

from aslicer.core import generate_profile_toolpath, slice_mesh
from aslicer.profile import MachineProfile, default_profile
from aslicer.web.serialize import toolpath_to_payload


def _box() -> trimesh.Trimesh:
    box = trimesh.creation.box(extents=(14.0, 14.0, 6.0))
    box.apply_translation((0.0, 0.0, 3.0))
    return box


def _payload(max_travel_no_retract_mm: float) -> dict:
    data = default_profile().to_dict()
    data["perimeter_count"] = 2
    data["features"]["infill"]["infill_density"] = 1.0
    data["max_travel_no_retract_mm"] = max_travel_no_retract_mm
    profile = MachineProfile.from_dict(data)
    box = _box()
    toolpath = generate_profile_toolpath(
        slice_mesh(box, profile.to_slice_parameters()), profile, box
    )
    return toolpath_to_payload(toolpath)


def test_payload_exposes_travel_threshold_for_the_viewer() -> None:
    # The viewer builds + reveals the travel overlay client-side, so it only
    # needs the short/long classification threshold carried on the stats.
    payload = _payload(3.5)
    assert payload["stats"]["maxTravelNoRetractMm"] == 3.5
    # Core move data is still present and ordered.
    assert payload["moves"]
    assert all("points" in m and "kind" in m for m in payload["moves"])


def test_payload_has_no_legacy_travels_field() -> None:
    # Travels are no longer precomputed server-side (the viewer derives them from
    # the visible moves so they reveal in step with the progress slider).
    assert "travels" not in _payload(2.0)
