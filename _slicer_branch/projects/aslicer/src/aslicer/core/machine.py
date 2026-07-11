"""Stage [3] of the slicing pipeline: the machine program.

The pipeline is intentionally layered so each stage adds a distinct concern and
can evolve independently::

    STL / mesh
        |
    [1] GeometryPlan   -> aslicer.core.slicer.SlicedModel   (where the part is)
        |
    [2] ProcessToolpath -> aslicer.core.toolpath.Toolpath   (what to deposit)
        |
    [3] MachineProgram -> aslicer.core.machine.MachineProgram (how the machine
                                                               moves)

A :class:`MachineProgram` is a flat, ordered list of *operations* that a machine
post-processor can turn into a concrete dialect (G-code today; potentially other
controllers later). It is deliberately machine-agnostic: it knows about travels,
depositions and annotation comments, but nothing about the exact text of any
particular controller. Keeping this representation separate from the emitter (see
:mod:`aslicer.core.gcode`) lets us add richer machine information — extra axes,
process M-codes, per-move power, ...  — without rewriting toolpath generation.

This stage is also where *travel* is materialised. The :class:`Toolpath` only
describes deposition strokes; here we order them to minimise rapid moves
(keeping every stroke of one "part face"/region together) and insert the rapid
travel moves that connect them, bracketed by the requested process annotations.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from ..config import SliceParameters
from .toolpath import Toolpath, ToolpathMove

# Two points within this distance are treated as coincident, so no travel move
# is emitted between consecutive deposition strokes that already join up.
_COINCIDENT_EPS_MM = 1e-6


@dataclass
class MachineComment:
    """A standalone annotation in the program (emitted as a comment).

    Attributes:
        text: The annotation text, e.g. ``"Retract"`` or ``"Print Start"``.
    """

    text: str


@dataclass
class MachineMove:
    """A single machine motion.

    Attributes:
        points: ``(N, 3)`` absolute XYZ points. A deposition keeps the full
            stroke polyline; a travel stores only its destination point.
        travel: ``True`` for a rapid, non-depositing move (``G0``); ``False``
            for a deposition move (``G1``).
        feed_mm_min: Programmed feed rate (mm/min).
        extrusion_mm: Feedstock length consumed (mm); always ``0`` for travel.
        kind: Source category — deposition kinds (``"outer_perimeter"``,
            ``"infill"``, ``"support"``, ...) or a travel kind: ``"travel"`` for a
            long (retracted) hop and ``"travel_short"`` for a short hop within
            ``max_travel_no_retract_mm`` (no retract). Useful for future
            per-process machine settings.
        orientations: Optional ``(N, 3)`` array of unit tool-axis vectors, one
            per point in ``points``. ``None`` means the head stays vertical
            (``+Z``); a post-processor can turn these into rotary-axis words.
        feeder: Wire feeder/tool used for this move (``"T0"``/``"T1"``). A
            post-processor emits a tool change when it changes.
        laser_power: Laser power for this move (machine units). A post-processor
            emits a power command when it changes; ``0`` for travels.
    """

    points: np.ndarray
    travel: bool
    feed_mm_min: float
    extrusion_mm: float
    kind: str
    orientations: np.ndarray | None = None
    feeder: str = "T0"
    laser_power: float = 0.0

    @property
    def start(self) -> np.ndarray:
        return self.points[0]

    @property
    def end(self) -> np.ndarray:
        return self.points[-1]


# An operation is either a motion or an annotation. Kept as a simple union so a
# post-processor can walk the list with ``isinstance`` checks.
MachineOp = MachineMove | MachineComment


@dataclass
class MachineProgram:
    """An ordered, machine-ready sequence of operations.

    Attributes:
        operations: Travels, depositions and comments in execution order.
        parameters: Process parameters the program was built from.
    """

    operations: list[MachineOp] = field(default_factory=list)
    parameters: SliceParameters | None = None

    @property
    def travel_length_mm(self) -> float:
        """Total rapid-travel distance (only meaningful with a known origin)."""
        total = 0.0
        prev: np.ndarray | None = None
        for op in self.operations:
            if isinstance(op, MachineMove):
                if op.travel and prev is not None:
                    total += float(np.linalg.norm(op.end - prev))
                prev = op.end
        return total

    @property
    def deposition_length_mm(self) -> float:
        """Total deposition (printing) path length."""
        total = 0.0
        for op in self.operations:
            if isinstance(op, MachineMove) and not op.travel:
                deltas = np.diff(op.points, axis=0)
                total += float(np.sqrt((deltas * deltas).sum(axis=1)).sum())
        return total


def _dist2(a: np.ndarray, b: np.ndarray) -> float:
    """Squared Euclidean distance (cheaper than the root for comparisons)."""
    d = a - b
    return float(d.dot(d))


def _group_by_region(moves: list[ToolpathMove]) -> list[list[ToolpathMove]]:
    """Group a layer's moves by region, preserving first-seen order.

    Moves that belong to the same contour/"part face" (or all share ``-1``, as
    support does) are kept as one contiguous group so the head finishes an
    island before travelling to the next one.
    """
    order: list[int] = []
    groups: dict[int, list[ToolpathMove]] = {}
    for move in moves:
        if move.region not in groups:
            groups[move.region] = []
            order.append(move.region)
        groups[move.region].append(move)
    return [groups[region] for region in order]


def _order_layer_moves(
    moves: list[ToolpathMove], head: np.ndarray | None
) -> list[ToolpathMove]:
    """Order a layer's moves to reduce travel, keeping regions together.

    Regions are visited greedily nearest-first from the current head position
    (the classic nearest-neighbour heuristic). Each region's internal move order
    — which already encodes the perimeter/infill ordering settings — is left
    untouched, so only inter-region travel is optimised here.
    """
    groups = _group_by_region(moves)
    if len(groups) <= 1:
        return [m for g in groups for m in g]

    remaining = list(groups)
    ordered: list[ToolpathMove] = []
    cursor = head
    while remaining:
        if cursor is None:
            index = 0
        else:
            index = min(
                range(len(remaining)),
                key=lambda i: _dist2(cursor, remaining[i][0].points[0]),
            )
        group = remaining.pop(index)
        ordered.extend(group)
        cursor = np.asarray(group[-1].points[-1], dtype=float)
    return ordered


def build_machine_program(
    toolpath: Toolpath, params: SliceParameters
) -> MachineProgram:
    """Lower a :class:`Toolpath` into a :class:`MachineProgram`.

    Walks the toolpath layer by layer (bottom to top). Within each layer the
    deposition strokes are ordered to minimise travel while keeping every stroke
    of the same region together. A rapid travel move is inserted whenever the
    head is not already at the next stroke's start; each travel is bracketed by
    ``Retract``/``Unretract`` annotations. The whole program is bracketed by
    ``Print Start``/``Print End`` annotations.

    Args:
        toolpath: The process toolpath to lower.
        params: Process parameters (supplies the travel feed rate).

    Returns:
        The machine program ready for a post-processor (see
        :func:`aslicer.core.gcode.program_to_gcode`).
    """
    operations: list[MachineOp] = [MachineComment("Print Start")]
    travel_feed = params.travel_speed_mm_min
    # Hops up to this length are short travels (no retract); longer ones retract.
    short_travel_max2 = max(params.max_travel_no_retract_mm, 0.0) ** 2
    head: np.ndarray | None = None

    for layer in toolpath.layers:
        for move in _order_layer_moves(layer.moves, head):
            points = np.asarray(move.points, dtype=float)
            if points.shape[0] < 2:
                continue
            start = points[0]

            orientations = (
                np.asarray(move.orientations, dtype=float)
                if move.orientations is not None
                else None
            )

            # Connect to the stroke start with a rapid travel unless the head is
            # already there (consecutive strokes that share an endpoint). The
            # very first travel just positions the head at the print start, so it
            # needs no retract. Otherwise short hops (within
            # ``max_travel_no_retract_mm``) skip the retract and are tagged
            # ``"travel_short"``; longer hops are bracketed by
            # ``Retract``/``Unretract`` and tagged ``"travel"``. Each travel
            # carries the start orientation so the head arrives already tilted.
            gap2 = None if head is None else _dist2(head, start)
            if head is None:
                operations.append(
                    MachineMove(
                        points=start.reshape(1, 3),
                        travel=True,
                        feed_mm_min=travel_feed,
                        extrusion_mm=0.0,
                        kind="travel",
                        orientations=(
                            orientations[0].reshape(1, 3)
                            if orientations is not None
                            else None
                        ),
                        feeder=move.feeder,
                        laser_power=0.0,
                    )
                )
            elif gap2 > _COINCIDENT_EPS_MM**2:
                short = gap2 <= short_travel_max2
                operations.append(
                    MachineComment("Short travel" if short else "Retract")
                )
                operations.append(
                    MachineMove(
                        points=start.reshape(1, 3),
                        travel=True,
                        feed_mm_min=travel_feed,
                        extrusion_mm=0.0,
                        kind="travel_short" if short else "travel",
                        orientations=(
                            orientations[0].reshape(1, 3)
                            if orientations is not None
                            else None
                        ),
                        feeder=move.feeder,
                        laser_power=0.0,
                    )
                )
                if not short:
                    operations.append(MachineComment("Unretract"))

            operations.append(
                MachineMove(
                    points=points,
                    travel=False,
                    feed_mm_min=move.feed_mm_min,
                    extrusion_mm=move.extrusion_mm,
                    kind=move.kind,
                    orientations=orientations,
                    feeder=move.feeder,
                    laser_power=move.laser_power,
                )
            )
            head = points[-1]

    operations.append(MachineComment("Print End"))
    return MachineProgram(operations=operations, parameters=params)
