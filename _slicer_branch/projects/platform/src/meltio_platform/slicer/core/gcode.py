"""Post-processor that emits G-code from a :class:`MachineProgram`.

This is the final, dialect-specific stage of the pipeline. It is deliberately
the *only* place that knows the concrete text of a controller, so supporting a
different machine later is a matter of adding another emitter beside this one
rather than touching slicing or toolpath generation.

The output is intentionally macro-driven: everything that is not part of the
toolpath itself comes from the profile's macros, so the G-code contains no
hardcoded preamble or annotation comments. The emitter contributes only:

* ``G0`` for rapid travel moves, ``G1`` for deposition moves.
* When a move carries a tilted tool axis (head orientation), the rotary ``A``
  and ``B`` words are appended; moves that stay vertical remain purely Cartesian
  (X/Y/Z only), so unoriented programs are unchanged. Deposition vs. travel is
  conveyed by ``G1`` vs. ``G0``.
* A bare feeder word (``T0``/``T1``) when the active feeder changes.
* ``Z`` is *sticky*: it is only written when it changes from the previous line,
  so layer moves omit the unchanged height.

The process-boundary annotation markers (``Print Start``/``Print End``,
``Start``/``Stop Deposition``, ``Pre Short Travel``/``Short Travel End``) become
the profile's macros, with ``#variables`` substituted. Any machine setup (units,
positioning, extrusion mode, laser power, ...) therefore lives in those macros,
not here. Laser power rides ``#laser_power`` inside the start-deposition macro.

Each deposition move carries a relative feedstock increment on the ``E`` axis,
derived from the wire diameter via volume conservation
(:meth:`SliceParameters.feed_length_for_path`) and split across the move's
segments in proportion to their length. Travels deposit nothing and carry no
``E``.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import numpy as np

from .machine import MachineComment, MachineMove, MachineProgram

if TYPE_CHECKING:  # pragma: no cover - typing only
    from ..profile import MachineProfile

# Tool-axis vectors within this of vertical are treated as untilted, so a head
# that is effectively straight up emits no rotary words.
_VERTICAL_EPS = 1e-9

# Annotation markers a profile turns into macros. A deposition run is bracketed
# by Start/Stop Deposition; short, no-retract travels carry Pre/Short Travel End.
_MACRO_MARKERS = frozenset(
    {
        "Print Start",
        "Print End",
        "Start Deposition",
        "Stop Deposition",
        "Pre Short Travel",
        "Short Travel End",
    }
)

# Human labels for #feature_type, matching the profile editor's feature names.
_FEATURE_TYPE_LABELS = {
    "outer_perimeter": "Outermost perimeter",
    "inner_perimeter": "Inner perimeters",
    "infill": "Infill",
    "support_outer_perimeter": "Support outermost perimeter",
    "support_inner_perimeter": "Support inner perimeters",
    "support": "Support infill",
}


def _format_xyz(
    point: np.ndarray, precision: int, last_z: str | None, z_offset: float = 0.0
) -> tuple[str, str | None]:
    """Format a point as ``X.. Y.. [Z..]`` with sticky Z.

    ``Z`` is only included when its formatted value differs from ``last_z`` (the
    previously written Z string), so a run of moves at one layer height omits the
    redundant ``Z``. ``z_offset`` shifts the emitted Z (used to lay the first
    layer at Z0). Returns the formatted words and the Z string to carry forward.
    """
    z_str = f"{point[2] + z_offset:.{precision}f}"
    words = f"X{point[0]:.{precision}f} Y{point[1]:.{precision}f}"
    if z_str != last_z:
        words += f" Z{z_str}"
        last_z = z_str
    return words, last_z


def _tool_axis_to_ab(axis: np.ndarray) -> tuple[float, float]:
    """Decompose a unit tool-axis vector into ``A``/``B`` rotary angles (deg).

    Uses a tilt-tilt (AB) kinematic convention where the tool direction is
    reached by first rotating ``A`` about X and then ``B`` about Y from the
    vertical ``+Z`` reference::

        n = R_y(B) · R_x(A) · (0, 0, 1)
          = (cos A · sin B, -sin A, cos A · cos B)

    so ``A = asin(-n_y)`` and ``B = atan2(n_x, n_z)``. A vertical head
    (``+Z``) therefore maps to ``A = B = 0``. This is the one place the rotary
    convention lives; a machine with different kinematics only needs this
    function changed.
    """
    n = np.asarray(axis, dtype=float)
    norm = float(np.linalg.norm(n))
    if norm <= _VERTICAL_EPS:
        return 0.0, 0.0
    n = n / norm
    a = np.degrees(np.arcsin(np.clip(-n[1], -1.0, 1.0)))
    b = np.degrees(np.arctan2(n[0], n[2]))
    return float(a), float(b)


def _format_ab(axis: np.ndarray, precision: int) -> str:
    """Format the ``A``/``B`` rotary words for a tool-axis vector, or ``\"\"``.

    Returns an empty string for an effectively vertical head so untilted moves
    stay purely Cartesian.
    """
    n = np.asarray(axis, dtype=float)
    if abs(n[0]) <= _VERTICAL_EPS and abs(n[1]) <= _VERTICAL_EPS:
        return ""
    a, b = _tool_axis_to_ab(n)
    return f" A{a:.{precision}f} B{b:.{precision}f}"


def _segment_extrusions(points: np.ndarray, total_extrusion_mm: float) -> np.ndarray:
    """Split a move's total feedstock length across its segments.

    Returns an ``(N-1,)`` array of per-segment extrusion lengths (mm) aligned
    with ``points[1:]``. The split is proportional to each segment's length,
    which is exactly volume-consistent because the feedstock length is linear in
    the deposited path length (see :meth:`SliceParameters.feed_length_for_path`).
    """
    deltas = np.diff(points, axis=0)
    seg_lengths = np.sqrt((deltas * deltas).sum(axis=1))
    total = float(seg_lengths.sum())
    if total <= 0.0:
        return np.zeros(seg_lengths.shape[0], dtype=float)
    return seg_lengths * (total_extrusion_mm / total)


def _next_laser_power(operations: list, idx: int) -> float:
    """Laser power of the next deposition move at/after ``idx`` (0 if none).

    A ``Start Deposition`` marker resolves ``#laser_power`` from the deposition
    run it opens, i.e. the upcoming deposition move's per-section power.
    """
    for op in operations[idx + 1 :]:
        if isinstance(op, MachineMove) and not op.travel:
            return op.laser_power
    return 0.0


def _z_start_offset(program: MachineProgram, profile: "MachineProfile | None") -> float:
    """Z shift that lays the lowest deposition layer at Z0, or 0.0.

    When the profile asks for ``start_z_at_zero`` every Z is shifted down by the
    program's lowest move Z, so the first layer prints at Z0 and the layer
    spacing above it is unchanged.
    """
    if profile is None or not getattr(profile, "start_z_at_zero", False):
        return 0.0
    lowest: float | None = None
    for op in program.operations:
        if isinstance(op, MachineMove):
            z = float(np.asarray(op.points, dtype=float)[:, 2].min())
            lowest = z if lowest is None else min(lowest, z)
    return 0.0 if lowest is None else -lowest


def _run_feature(operations: list, idx: int, *, forward: bool) -> str:
    """Feature label of the deposition run around marker ``idx``.

    Scans ``forward`` (the run a Start-Deposition/short-travel marker opens) or
    backward (the run a Stop-Deposition marker closes) to the nearest deposition
    move and maps its kind to a human label. A run is a single feature, so the
    direction only picks the right run, never a different feature within one.
    """
    rng = range(idx + 1, len(operations)) if forward else range(idx - 1, -1, -1)
    for i in rng:
        op = operations[i]
        if isinstance(op, MachineMove) and not op.travel:
            return _FEATURE_TYPE_LABELS.get(op.kind, op.kind)
    return ""


def _render_marker(
    text: str, profile: "MachineProfile", operations: list, idx: int
) -> list[str]:
    """Rendered macro lines for an annotation marker (empty when the macro is blank)."""
    macro = {
        "Print Start": profile.start_print_macro,
        "Print End": profile.end_print_macro,
        "Start Deposition": profile.start_deposition_macro,
        "Stop Deposition": profile.stop_deposition_macro,
        "Pre Short Travel": profile.pre_short_travel_macro,
        "Short Travel End": profile.short_travel_end_macro,
    }.get(text, "")
    kwargs: dict = {}
    if text == "Start Deposition":
        kwargs["laser_power"] = _next_laser_power(operations, idx)
    # #feature_type resolves from the surrounding deposition run: forward for a
    # run being opened or a short travel within it, backward for one being closed.
    if text in ("Start Deposition", "Pre Short Travel", "Short Travel End"):
        kwargs["feature_type"] = _run_feature(operations, idx, forward=True)
    elif text == "Stop Deposition":
        kwargs["feature_type"] = _run_feature(operations, idx, forward=False)
    rendered = profile.render_macro(macro, **kwargs)
    return rendered.split("\n") if rendered else []


def program_to_gcode(
    program: MachineProgram,
    *,
    precision: int = 2,
    profile: "MachineProfile | None" = None,
) -> str:
    """Render a :class:`MachineProgram` as G-code text.

    Args:
        program: The machine program to emit.
        precision: Number of decimal places for coordinates (and rotary axes).
        profile: When given, the process-boundary annotation markers (``Print
            Start``/``Print End``, ``Start``/``Stop Deposition``, ``Pre Short
            Travel``/``Short Travel End``) are replaced by the profile's macros
            with ``#variables`` substituted, and ``start_z_at_zero`` is honoured.
            When ``None`` the markers fall back to plain ``; <text>`` comments.

    Returns:
        The complete G-code as a single newline-terminated string.
    """
    # No hardcoded preamble: any machine setup (units, positioning, extrusion
    # mode, ...) belongs in the profile's start-print macro.
    lines: list[str] = []

    # Only re-emit the feed rate word when it changes, keeping the file compact.
    last_feed: float | None = None
    # Track feeder so a tool change is emitted only when it changes.
    last_feeder: str | None = None
    # Sticky Z: the last written Z string, so unchanged heights are omitted.
    last_z: str | None = None
    # Lay the first layer at Z0 when the profile asks (else no shift).
    z_offset = _z_start_offset(program, profile)
    # A single-material machine only ever uses T0 (selected by the start macro),
    # so the feeder word is redundant; only emit it when feeders can change.
    emit_feeder = profile is None or getattr(profile, "material", "single") == "dual"
    operations = program.operations

    for idx, op in enumerate(operations):
        if isinstance(op, MachineComment):
            if profile is not None and op.text in _MACRO_MARKERS:
                # The marker becomes the profile's macro verbatim (its own
                # comments/wrappers included); a blank macro emits nothing. Each
                # non-empty macro is set off by blank lines. Laser power and
                # feature type ride #laser_power/#feature_type inside the macros.
                rendered = _render_marker(op.text, profile, operations, idx)
                if rendered:
                    if lines and lines[-1] != "":
                        lines.append("")
                    lines.extend(rendered)
                    lines.append("")
            else:
                lines.append(f"; {op.text}")
            continue

        if not isinstance(op, MachineMove):  # pragma: no cover - defensive
            continue

        feed = round(op.feed_mm_min)
        if op.travel:
            # The head is already at the previous position; a single rapid to
            # the destination point, carrying the arrival orientation if any.
            # Travels deposit nothing, so they carry no E word (relative mode).
            ab = (
                _format_ab(op.orientations[-1], precision)
                if op.orientations is not None
                else ""
            )
            xyz, last_z = _format_xyz(op.end, precision, last_z, z_offset)
            words = f"G0 {xyz}{ab}"
            if feed != last_feed:
                words += f" F{feed}"
                last_feed = feed
            lines.append(words)
        else:
            # Switch the feeder before the deposition when it changes (bare word).
            if emit_feeder and op.feeder != last_feeder:
                lines.append(op.feeder)
                last_feeder = op.feeder

            # A deposition stroke. The head is already at points[0] (placed by
            # the preceding travel or the previous stroke's end), so emit a G1
            # for every subsequent vertex only. Per-point orientations (aligned
            # with points) become A/B rotary words when the head is tilted, and
            # each segment carries its share of the move's feedstock length as a
            # relative E increment.
            extrusions = _segment_extrusions(op.points, op.extrusion_mm)
            for i in range(1, op.points.shape[0]):
                ab = (
                    _format_ab(op.orientations[i], precision)
                    if op.orientations is not None
                    else ""
                )
                xyz, last_z = _format_xyz(op.points[i], precision, last_z, z_offset)
                words = f"G1 {xyz}{ab}"
                words += f" E{extrusions[i - 1]:.5f}"
                if feed != last_feed:
                    words += f" F{feed}"
                    last_feed = feed
                lines.append(words)

    return "\n".join(lines) + "\n"
