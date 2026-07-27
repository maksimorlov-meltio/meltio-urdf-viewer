"""Contract tests for the deployed slicing engine (`meltio_platform.slicer`).

These exercise the real pipeline in memory (mesh -> SlicedModel -> Toolpath ->
MachineProgram -> G-code) with a known 10 mm cube, so a silent regression in
layer heights, perimeter geometry or extrusion math turns a test red before it
ruins a real metal print. No disk, DB or HTTP involved.

Note: the sibling `aslicer` project has its own slicing suite, but its core has
diverged from this deployed engine (different gcode markers, no hardcoded
preamble here) — these tests assert against THIS engine's contract only.
"""

from __future__ import annotations

import math
import re
from dataclasses import replace

import numpy as np
import pytest
import trimesh

from meltio_platform.slicer.config import SliceParameters
from meltio_platform.slicer.core import (
    build_machine_program,
    generate_profile_toolpath,
    program_to_gcode,
    slice_mesh,
)
from meltio_platform.slicer.core.machine import MachineComment, MachineMove
from meltio_platform.slicer.profile import default_profile

BOX_SIZE = 10.0
LAYER_H = 1.0
BEAD_W = 1.2


@pytest.fixture(scope="module")
def box_mesh() -> trimesh.Trimesh:
    mesh = trimesh.creation.box(extents=(BOX_SIZE, BOX_SIZE, BOX_SIZE))
    mesh.apply_translation((0.0, 0.0, BOX_SIZE / 2.0))  # rest on z=0 like load_mesh does
    return mesh


@pytest.fixture(scope="module")
def pinned_profile():
    """Factory profile with geometry-relevant knobs pinned.

    Pinning bead width / layer height / a single perimeter makes the expected
    numbers below independent of tuning changes to the factory master.
    """
    profile = default_profile()
    features = {
        key: replace(value, bead_width_mm=BEAD_W, feed_rate_mm_s=10.0)
        for key, value in profile.features.items()
    }
    return replace(
        profile,
        layer_height_mm=LAYER_H,
        perimeter_count=1,
        features=features,
    )


@pytest.fixture(scope="module")
def sliced(box_mesh, pinned_profile):
    return slice_mesh(box_mesh, pinned_profile.to_slice_parameters())


@pytest.fixture(scope="module")
def toolpath(sliced, pinned_profile, box_mesh):
    return generate_profile_toolpath(sliced, pinned_profile, box_mesh)


@pytest.fixture(scope="module")
def program(toolpath, pinned_profile):
    return build_machine_program(toolpath, pinned_profile.to_slice_parameters())


@pytest.fixture(scope="module")
def gcode(program):
    return program_to_gcode(program)


def test_slice_mesh_layer_count_and_heights_for_known_box(sliced):
    zs = [layer.z for layer in sliced.layers]
    assert sliced.layer_count == 9  # first layer at z=1.0, strictly below z=10
    assert zs[0] == pytest.approx(LAYER_H)
    steps = np.diff(zs)
    assert np.allclose(steps, LAYER_H)
    assert max(zs) < BOX_SIZE


def test_outer_perimeter_is_closed_and_planar(toolpath):
    for layer in toolpath.layers:
        outer = [move for move in layer.moves if move.kind == "outer_perimeter"]
        assert outer, f"layer {layer.index} has no outer perimeter"
        for move in outer:
            points = np.asarray(move.points)
            assert np.allclose(points[0], points[-1]), "outer perimeter must be closed"
            assert np.allclose(points[:, 2], layer.z), "perimeter must lie in its layer plane"


def test_outer_perimeter_length_matches_bead_inset(toolpath):
    # A 10 mm square wall traced at half a bead width inside the surface:
    # side = 10 - 1.2 = 8.8 mm -> closed loop of 35.2 mm per layer.
    expected = 4.0 * (BOX_SIZE - BEAD_W)
    for layer in toolpath.layers:
        length = sum(move.length_mm for move in layer.moves if move.kind == "outer_perimeter")
        assert length == pytest.approx(expected, rel=1e-3)


def test_feed_length_matches_bead_feedstock_math():
    params = SliceParameters(layer_height_mm=LAYER_H, bead_width_mm=BEAD_W, material_diameter_mm=1.0)
    path_mm = 100.0
    expected = (BEAD_W * LAYER_H * path_mm) / (math.pi * 0.5**2)
    assert params.feed_length_for_path(path_mm) == pytest.approx(expected)
    assert params.feed_length_for_path(0.0) == 0.0
    assert params.feed_length_for_path(-5.0) == 0.0

    thicker = SliceParameters(layer_height_mm=LAYER_H, bead_width_mm=BEAD_W, material_diameter_mm=2.0)
    assert thicker.feed_length_for_path(path_mm) < params.feed_length_for_path(path_mm)


def test_machine_program_wraps_and_brackets_deposition(program):
    ops = program.operations
    assert isinstance(ops[0], MachineComment) and ops[0].text == "Print Start"
    assert isinstance(ops[-1], MachineComment) and ops[-1].text == "Print End"

    comments = [op.text for op in ops if isinstance(op, MachineComment)]
    assert "Start Deposition" in comments
    assert "Stop Deposition" in comments

    for op in ops:
        if isinstance(op, MachineMove):
            if op.travel:
                assert op.extrusion_mm == 0.0
            else:
                assert op.extrusion_mm > 0.0
                assert op.feed_mm_min > 0.0


def test_gcode_conserves_extrusion_volume(gcode, toolpath):
    extruded = sum(float(value) for value in re.findall(r"\bE([0-9.]+)", gcode))
    assert extruded == pytest.approx(toolpath.total_extrusion_mm, rel=1e-4)


def test_gcode_renders_moves_markers_and_sticky_z(gcode, sliced):
    assert "G0 " in gcode and "G1 " in gcode
    assert gcode.splitlines()[0] == "; Print Start"
    assert "; Start Deposition" in gcode and "; Stop Deposition" in gcode
    # Z is sticky: it is only re-emitted when the height changes, i.e. once per layer.
    z_words = re.findall(r"\bZ[0-9.-]+", gcode)
    assert len(z_words) == sliced.layer_count


@pytest.mark.parametrize(
    "kwargs",
    [
        {"layer_height_mm": 0.0},
        {"bead_width_mm": -1.0},
        {"speed_mm_s": 0.0},
        {"material_diameter_mm": 0.0},
        {"support_overhang_angle_deg": 91.0},
        {"support_min_area_mm2": -1.0},
        {"max_travel_no_retract_mm": -0.1},
    ],
)
def test_slice_parameters_rejects_invalid_values(kwargs):
    with pytest.raises(ValueError):
        SliceParameters(**kwargs)
