"""Post-processor that emits G-code from a :class:`MachineProgram`.

This is the final, dialect-specific stage of the pipeline. It is deliberately
the *only* place that knows the concrete text of a controller, so supporting a
different machine later is a matter of adding another emitter beside this one
rather than touching slicing or toolpath generation.

The dialect is a widely-compatible X/Y/Z flavour with optional A/B rotary axes:

* ``G0`` for rapid travel moves, ``G1`` for deposition moves.
* When a move carries a tilted tool axis (head orientation), the rotary ``A``
  and ``B`` words are appended; moves that stay vertical remain purely Cartesian
  (X/Y/Z only), so unoriented programs are unchanged. Deposition vs. travel is
  conveyed by ``G1`` vs. ``G0``.
* ``MachineComment`` operations become ``; <text>`` lines, so the requested
  ``Print Start`` / ``Print End`` and ``Retract`` / ``Unretract`` markers appear
  verbatim in the output.
* ``Z`` is *sticky*: it is only written when it changes from the previous line,
  so layer moves omit the unchanged height.

Each deposition move carries a relative feedstock increment on the ``E`` axis
(declared with ``M83``), derived from the wire diameter via volume conservation
(:meth:`SliceParameters.feed_length_for_path`) and split across the move's
segments in proportion to their length. Travels deposit nothing and carry no
``E``. When a move's feeder changes a tool-change line (``T0``/``T1``) is
emitted. Laser power is currently emitted only as a ``; Laser Power: <n>W``
comment (no M-code yet); it is (re-)stated after each unretraction — a retract
is assumed to turn the laser off — and whenever the power changes.
"""

from __future__ import annotations

import numpy as np

from .machine import MachineComment, MachineMove, MachineProgram

# Tool-axis vectors within this of vertical are treated as untilted, so a head
# that is effectively straight up emits no rotary words.
_VERTICAL_EPS = 1e-9


def _format_xyz(
    point: np.ndarray, precision: int, last_z: str | None
) -> tuple[str, str | None]:
    """Format a point as ``X.. Y.. [Z..]`` with sticky Z.

    ``Z`` is only included when its formatted value differs from ``last_z`` (the
    previously written Z string), so a run of moves at one layer height omits the
    redundant ``Z``. Returns the formatted words and the Z string to carry
    forward.
    """
    z_str = f"{point[2]:.{precision}f}"
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


def program_to_gcode(program: MachineProgram, *, precision: int = 2) -> str:
    """Render a :class:`MachineProgram` as G-code text.

    Args:
        program: The machine program to emit.
        precision: Number of decimal places for coordinates (and rotary axes).

    Returns:
        The complete G-code as a single newline-terminated string.
    """
    lines: list[str] = [
        "G21 ; units in millimetres",
        "G90 ; absolute positioning",
        "M83 ; relative extrusion (E values are per-move increments)",
    ]

    # Only re-emit the feed rate word when it changes, keeping the file compact.
    last_feed: float | None = None
    # Track feeder so a tool change is emitted only when it changes.
    last_feeder: str | None = None
    # Laser power is stated as a comment. A retract is assumed to turn the laser
    # off (``laser_off``), so power is re-stated at the next deposition; it is
    # also re-stated whenever ``last_laser`` changes. The laser starts off.
    last_laser: float | None = None
    laser_off = True
    # Sticky Z: the last written Z string, so unchanged heights are omitted.
    last_z: str | None = None

    for op in program.operations:
        if isinstance(op, MachineComment):
            # A retract turns the laser off, so it must be re-established after
            # the following unretract (handled at the next deposition).
            if op.text == "Retract":
                laser_off = True
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
            xyz, last_z = _format_xyz(op.end, precision, last_z)
            words = f"G0 {xyz}{ab}"
            if feed != last_feed:
                words += f" F{feed}"
                last_feed = feed
            lines.append(words)
        else:
            # Switch the feeder before the deposition when it changes.
            if op.feeder != last_feeder:
                lines.append(f"{op.feeder} ; tool change")
                last_feeder = op.feeder
            # (Re-)state the laser power after an unretract or on a change.
            if laser_off or op.laser_power != last_laser:
                lines.append(f"; Laser Power: {round(op.laser_power)}W")
                last_laser = op.laser_power
                laser_off = False

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
                xyz, last_z = _format_xyz(op.points[i], precision, last_z)
                words = f"G1 {xyz}{ab}"
                words += f" E{extrusions[i - 1]:.5f}"
                if feed != last_feed:
                    words += f" F{feed}"
                    last_feed = feed
                lines.append(words)

    return "\n".join(lines) + "\n"
