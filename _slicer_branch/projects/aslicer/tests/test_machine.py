"""Tests for the machine-program stage and G-code emission."""

from __future__ import annotations

import numpy as np
import pytest
import trimesh

from aslicer.core import (
    build_machine_program,
    generate_profile_toolpath,
    program_to_gcode,
    slice_mesh,
)
from aslicer.core.machine import MachineComment, MachineMove
from aslicer.profile import MachineProfile, default_profile

_FEATURE_KEYS = (
    "outer_perimeter",
    "inner_perimeter",
    "infill",
    "support",
    "support_outer_perimeter",
    "support_inner_perimeter",
)


def _unit_box() -> trimesh.Trimesh:
    box = trimesh.creation.box(extents=(10.0, 10.0, 10.0))
    box.apply_translation((0.0, 0.0, 5.0))
    return box


def _two_box_mesh() -> trimesh.Trimesh:
    # Two separate boxes -> two islands ("part faces") per layer.
    a = trimesh.creation.box(extents=(6.0, 6.0, 10.0))
    a.apply_translation((-10.0, 0.0, 5.0))
    b = trimesh.creation.box(extents=(6.0, 6.0, 10.0))
    b.apply_translation((10.0, 0.0, 5.0))
    return trimesh.util.concatenate([a, b])


def _program(mesh, **kwargs):
    data = default_profile().to_dict()
    if "infill_density" in kwargs:
        data["features"]["infill"]["infill_density"] = kwargs.pop("infill_density")
    if "speed_mm_s" in kwargs:
        speed = kwargs.pop("speed_mm_s")
        for key in _FEATURE_KEYS:
            data["features"][key]["feed_rate_mm_s"] = speed
    data.update(kwargs)
    profile = MachineProfile.from_dict(data)
    params = profile.to_slice_parameters()
    toolpath = generate_profile_toolpath(slice_mesh(mesh, params), profile, mesh)
    return build_machine_program(toolpath, params), params


def test_program_brackets_with_print_start_end() -> None:
    program, _ = _program(_unit_box())
    comments = [op.text for op in program.operations if isinstance(op, MachineComment)]
    assert comments[0] == "Print Start"
    assert comments[-1] == "Print End"


def test_long_travels_are_bracketed_by_retract_unretract() -> None:
    # Long hops (> max_travel_no_retract_mm) retract; short hops do not. Force
    # everything to be a long travel by setting the threshold to zero. The very
    # first travel only positions the head at the print start, so it carries no
    # retract; every subsequent travel is bracketed.
    program, _ = _program(
        _unit_box(),
        perimeter_count=3,
        infill_density=1.0,
        max_travel_no_retract_mm=0.0,
    )
    ops = program.operations
    travel_indices = [
        i
        for i, op in enumerate(ops)
        if isinstance(op, MachineMove) and op.travel
    ]
    assert len(travel_indices) >= 2, "expected several travel moves"
    # First travel: no preceding Retract (it positions the head at the start).
    first = travel_indices[0]
    assert not (
        isinstance(ops[first - 1], MachineComment) and ops[first - 1].text == "Retract"
    )
    for i in travel_indices[1:]:
        assert ops[i].kind == "travel"
        assert isinstance(ops[i - 1], MachineComment) and ops[i - 1].text == "Retract"
        assert (
            isinstance(ops[i + 1], MachineComment) and ops[i + 1].text == "Unretract"
        )


def test_first_travel_has_no_retract() -> None:
    # The opening operations are Print Start then the start-positioning travel,
    # with no retract in between.
    program, _ = _program(_unit_box(), perimeter_count=2, infill_density=1.0)
    ops = program.operations
    first_travel = next(
        i for i, op in enumerate(ops) if isinstance(op, MachineMove) and op.travel
    )
    before = ops[:first_travel]
    assert not any(
        isinstance(op, MachineComment) and op.text == "Retract" for op in before
    )


def test_short_travels_skip_retract() -> None:
    # With a generous no-retract threshold the close perimeter/infill hops become
    # short travels: tagged "travel_short", preceded by a "Short travel" comment,
    # and never followed by an Unretract.
    program, _ = _program(
        _unit_box(),
        perimeter_count=3,
        infill_density=1.0,
        max_travel_no_retract_mm=1000.0,
    )
    ops = program.operations
    short = [
        i
        for i, op in enumerate(ops)
        if isinstance(op, MachineMove) and op.kind == "travel_short"
    ]
    assert short, "expected at least one short travel"
    for i in short:
        assert isinstance(ops[i - 1], MachineComment) and ops[i - 1].text == "Short travel"
        assert not (
            isinstance(ops[i + 1], MachineComment) and ops[i + 1].text == "Unretract"
        )
    # Only the initial positioning hop (no prior head position) retracts; every
    # other hop is short, so at most one "Retract" remains.
    retracts = sum(
        1 for op in ops if isinstance(op, MachineComment) and op.text == "Retract"
    )
    assert retracts <= 1


def test_deposition_moves_carry_no_retract_inline() -> None:
    # Every deposition move must be preceded by either a travel/unretract or a
    # prior deposition (continuous), never by a bare Retract.
    program, _ = _program(_unit_box(), perimeter_count=2, infill_density=1.0)
    ops = program.operations
    for i, op in enumerate(ops):
        if isinstance(op, MachineMove) and not op.travel:
            prev = ops[i - 1]
            assert not (isinstance(prev, MachineComment) and prev.text == "Retract")


def test_gcode_uses_g0_for_travel_and_g1_for_deposition() -> None:
    program, _ = _program(_unit_box(), perimeter_count=2, infill_density=1.0)
    gcode = program_to_gcode(program)
    lines = gcode.splitlines()
    assert "; Print Start" in lines
    assert "; Print End" in lines
    assert "; Retract" in lines
    assert "; Unretract" in lines
    assert any(line.startswith("G0 ") for line in lines)
    assert any(line.startswith("G1 ") for line in lines)
    # Header declares mm + absolute positioning.
    assert "G21 ; units in millimetres" in lines
    assert "G90 ; absolute positioning" in lines


def test_gcode_cartesian_moves_use_expected_axis_words() -> None:
    program, _ = _program(_unit_box(), perimeter_count=2, infill_density=1.0)
    gcode = program_to_gcode(program)
    for line in gcode.splitlines():
        if line.startswith(("G0", "G1")):
            # Vertical head -> Cartesian X/Y/Z plus feed F and relative E only.
            tokens = line.split()[1:]
            for token in tokens:
                assert token[0] in "XYZEF", f"unexpected axis word: {token}"



def test_travel_speed_is_emitted_for_travel_moves() -> None:
    program, params = _program(
        _unit_box(), perimeter_count=3, speed_mm_s=10.0, travel_speed_mm_s=50.0
    )
    travels = [
        op for op in program.operations if isinstance(op, MachineMove) and op.travel
    ]
    assert travels
    for travel in travels:
        assert travel.feed_mm_min == params.travel_speed_mm_min


def test_inside_out_reverses_first_and_last_perimeter() -> None:
    outside_in, _ = _program(_unit_box(), perimeter_count=3)
    inside_out, _ = _program(_unit_box(), perimeter_count=3, perimeter_order="inside_out")

    def first_deposition_start(program):
        for op in program.operations:
            if isinstance(op, MachineMove) and not op.travel:
                return op.start

    out_start = first_deposition_start(outside_in)
    in_start = first_deposition_start(inside_out)
    # The outer wall (outside-in) and the inner wall (inside-out) start at
    # different offsets from the box centre, so the first stroke differs.
    assert not np.allclose(out_start, in_start)


def test_infill_before_perimeters_changes_first_kind() -> None:
    perim_first, _ = _program(_unit_box(), perimeter_count=1, infill_density=1.0)
    infill_first, _ = _program(
        _unit_box(),
        perimeter_count=1,
        infill_density=1.0,
        infill_before_perimeters=True,
    )

    def first_kind(program):
        for op in program.operations:
            if isinstance(op, MachineMove) and not op.travel:
                return op.kind

    assert first_kind(perim_first) == "outer_perimeter"
    assert first_kind(infill_first) == "infill"


def test_regions_are_kept_together() -> None:
    # With two islands, all of one region's strokes must be deposited before the
    # head moves on to the other region (only one region-to-region travel jump).
    program, _ = _program(_two_box_mesh(), perimeter_count=2)
    # Inspect the first layer only: collect deposition region ids in order until
    # we have seen both regions; the sequence must not interleave.
    regions_seen: list[int] = []
    # Reconstruct region grouping from start coordinates: cluster by sign of X.
    side_order: list[int] = []
    for op in program.operations:
        if isinstance(op, MachineMove) and not op.travel:
            side = 0 if op.start[0] < 0 else 1
            if not side_order or side_order[-1] != side:
                side_order.append(side)
    # A non-interleaved layout alternates sides at most once per layer change.
    # The number of side switches should be far smaller than the stroke count.
    switches = sum(
        1 for i in range(1, len(side_order)) if side_order[i] != side_order[i - 1]
    )
    assert switches <= program_layer_count(program) + 1


def program_layer_count(program) -> int:
    # Layers are separated by a Z change between consecutive deposition moves.
    zs = [
        round(float(op.start[2]), 6)
        for op in program.operations
        if isinstance(op, MachineMove) and not op.travel
    ]
    return len(set(zs))


def _sphere() -> trimesh.Trimesh:
    # A sphere has overhanging, non-vertical walls so head orientation kicks in.
    mesh = trimesh.creation.icosphere(subdivisions=2, radius=8.0)
    mesh.apply_translation((0.0, 0.0, 9.0))
    return mesh


def test_oriented_moves_carry_orientations_into_machine_program() -> None:
    program, _ = _program(_sphere(), perimeter_count=1, axes="5-axis", orient_perimeters="all")
    oriented = [
        op
        for op in program.operations
        if isinstance(op, MachineMove)
        and not op.travel
        and op.orientations is not None
    ]
    assert oriented, "expected deposition moves to carry tool-axis orientations"
    for move in oriented:
        # One orientation vector per point.
        assert move.orientations.shape == (move.points.shape[0], 3)


def test_oriented_gcode_emits_a_and_b_words() -> None:
    program, _ = _program(_sphere(), perimeter_count=1, axes="5-axis", orient_perimeters="all")
    gcode = program_to_gcode(program)
    motion = [
        line for line in gcode.splitlines() if line.startswith(("G0", "G1"))
    ]
    ab_lines = [line for line in motion if " A" in line and " B" in line]
    assert ab_lines, "tilted head should emit A/B rotary words"
    # Every word is one of the allowed axes (now including rotary A/B and E).
    for line in motion:
        for token in line.split()[1:]:
            assert token[0] in "XYZABEF", f"unexpected axis word: {token}"


def test_vertical_head_emits_no_rotary_words() -> None:
    # Default orient_perimeters="none" keeps the head vertical -> no A/B words.
    program, _ = _program(_unit_box(), perimeter_count=2, infill_density=1.0)
    gcode = program_to_gcode(program)
    for line in gcode.splitlines():
        if line.startswith(("G0", "G1")):
            assert " A" not in line and " B" not in line


def _e_value(line: str) -> float | None:
    for token in line.split():
        if token.startswith("E"):
            return float(token[1:])
    return None


def test_gcode_declares_relative_extrusion() -> None:
    program, _ = _program(_unit_box(), perimeter_count=1)
    gcode = program_to_gcode(program)
    assert "M83 ; relative extrusion (E values are per-move increments)" in (
        gcode.splitlines()
    )


def test_deposition_moves_carry_e_and_travels_do_not() -> None:
    program, _ = _program(_unit_box(), perimeter_count=2, infill_density=1.0)
    for line in program_to_gcode(program).splitlines():
        if line.startswith("G1"):
            assert _e_value(line) is not None, f"deposition missing E: {line}"
        elif line.startswith("G0"):
            assert _e_value(line) is None, f"travel should not extrude: {line}"


def test_relative_e_increments_are_positive_and_match_feedstock() -> None:
    # The summed relative E over the whole program must equal the toolpath's
    # total feedstock length (volume conservation, wire diameter dependent).
    data = default_profile().to_dict()
    data["perimeter_count"] = 2
    data["features"]["infill"]["infill_density"] = 1.0
    profile = MachineProfile.from_dict(data)
    params = profile.to_slice_parameters()
    toolpath = generate_profile_toolpath(slice_mesh(_unit_box(), params), profile, _unit_box())
    program = build_machine_program(toolpath, params)
    e_values = [
        _e_value(line)
        for line in program_to_gcode(program).splitlines()
        if line.startswith("G1")
    ]
    assert all(e > 0.0 for e in e_values)
    total_e = sum(e_values)
    assert total_e == pytest.approx(toolpath.total_extrusion_mm, rel=1e-4)


def test_larger_wire_diameter_lowers_e_values() -> None:
    # Thicker wire deposits the same bead with less feedstock length, so E drops.
    def total_e(material_diameter_mm: float) -> float:
        program, _ = _program(
            _unit_box(),
            perimeter_count=1,
            material_diameter_mm=material_diameter_mm,
        )
        return sum(
            _e_value(line)
            for line in program_to_gcode(program).splitlines()
            if line.startswith("G1") and _e_value(line) is not None
        )

    assert total_e(2.0) < total_e(1.0)


def _profile_program(mesh, profile):
    from aslicer.core import generate_profile_toolpath

    params = profile.to_slice_parameters()
    toolpath = generate_profile_toolpath(slice_mesh(mesh, params), profile, mesh)
    return build_machine_program(toolpath, params)


def test_gcode_emits_tool_changes_for_dual_material() -> None:
    from aslicer.profile import MachineProfile, default_profile

    data = default_profile().to_dict()
    data["material"] = "dual"
    data["perimeter_count"] = 2
    data["features"]["infill"]["infill_density"] = 1.0
    data["features"]["infill"]["feeder"] = "T1"
    profile = MachineProfile.from_dict(data)

    gcode = program_to_gcode(_profile_program(_unit_box(), profile))
    lines = gcode.splitlines()
    assert any(line.startswith("T0 ") for line in lines)
    assert any(line.startswith("T1 ") for line in lines)


def test_gcode_emits_laser_power_as_comment_not_mcode() -> None:
    from aslicer.profile import MachineProfile, default_profile

    data = default_profile().to_dict()
    data["perimeter_count"] = 2
    data["features"]["infill"]["infill_density"] = 1.0
    data["features"]["outer_perimeter"]["laser_power"] = 1100.0
    data["features"]["infill"]["laser_power"] = 800.0
    profile = MachineProfile.from_dict(data)

    lines = program_to_gcode(_profile_program(_unit_box(), profile)).splitlines()
    # Laser power is a comment, not an M-code; the laser is never switched on/off
    # with M3/M5 yet.
    assert "; Laser Power: 1100W" in lines
    assert "; Laser Power: 800W" in lines
    assert not any(line.startswith(("M3", "M5")) for line in lines)


def test_laser_power_restated_after_unretract() -> None:
    # Every Unretract (the laser is assumed off after a retract) is followed by a
    # Laser Power comment before the next deposition resumes.
    program, _ = _program(_unit_box(), perimeter_count=3, infill_density=1.0)
    lines = program_to_gcode(program).splitlines()
    unretracts = [i for i, line in enumerate(lines) if line == "; Unretract"]
    assert unretracts, "expected at least one unretract"
    for i in unretracts:
        ahead = lines[i + 1 : i + 4]
        assert any(l.startswith("; Laser Power:") for l in ahead), ahead


def test_z_is_sticky() -> None:
    # Z is written on the first motion of a layer and omitted while it is
    # unchanged, so most in-layer moves carry no Z word.
    lines = program_to_gcode(
        _program(_unit_box(), perimeter_count=2, infill_density=1.0)[0]
    ).splitlines()
    motion = [l for l in lines if l.startswith(("G0", "G1"))]
    with_z = [l for l in motion if " Z" in l]
    assert motion, "expected motion lines"
    assert motion[0].count(" Z") == 1, "first motion line should set Z"
    # Far fewer Z words than motion lines (one per layer, not per move).
    assert len(with_z) < len(motion) / 2


def test_gcode_coordinates_use_two_decimals() -> None:
    lines = program_to_gcode(_program(_unit_box())[0]).splitlines()
    import re

    coord = re.compile(r"[XYZ]-?\d+\.\d+")
    for line in lines:
        if line.startswith(("G0", "G1")):
            for tok in re.findall(coord, line):
                decimals = tok.split(".")[1]
                assert len(decimals) == 2, f"{tok} in {line}"


def test_single_material_stays_on_t0() -> None:
    from aslicer.profile import MachineProfile, default_profile

    data = default_profile().to_dict()
    data["material"] = "single"
    data["perimeter_count"] = 2
    data["features"]["infill"]["infill_density"] = 1.0
    data["features"]["infill"]["feeder"] = "T1"  # ignored for single material
    profile = MachineProfile.from_dict(data)

    lines = program_to_gcode(_profile_program(_unit_box(), profile)).splitlines()
    assert not any(line.startswith("T1 ") for line in lines)

