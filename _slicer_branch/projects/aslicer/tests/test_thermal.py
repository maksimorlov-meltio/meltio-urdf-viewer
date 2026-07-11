"""Tests for the qualitative thermal-simulation feature.

These exercise the thermal package in isolation (it must never depend on the web
layer) by building a small toolpath by hand and asserting on segment structure,
timing and the relative heat scores produced by the moving-source model.
"""

from __future__ import annotations

import numpy as np
import pytest

from aslicer.config import SliceParameters
from aslicer.core.toolpath import Toolpath, ToolpathLayer, ToolpathMove
from aslicer.thermal import (
    ThermalParams,
    ThermalSegment,
    build_thermal_segments,
    simulate_exposure,
)


def _line_move(
    start: tuple[float, float, float],
    end: tuple[float, float, float],
    *,
    kind: str = "outer_perimeter",
    feed_mm_min: float = 600.0,
    laser_power: float = 1000.0,
    bead_width_mm: float = 1.2,
    step_mm: float = 1.0,
) -> ToolpathMove:
    """Build a straight deposition move densified to ``step_mm`` spacing.

    The segment builder accumulates existing polyline points (the slicer
    densifies long runs upstream), so points are sampled along the line rather
    than left as a single long edge.
    """
    start_a = np.asarray(start, dtype=float)
    end_a = np.asarray(end, dtype=float)
    length = float(np.linalg.norm(end_a - start_a))
    count = max(2, int(round(length / step_mm)) + 1)
    points = np.linspace(start_a, end_a, count)
    return ToolpathMove(
        points=points,
        closed=False,
        feed_mm_min=feed_mm_min,
        length_mm=length,
        extrusion_mm=length,
        kind=kind,
        laser_power=laser_power,
        bead_width_mm=bead_width_mm,
    )


def _toolpath(layers: list[ToolpathLayer]) -> Toolpath:
    return Toolpath(layers=layers, parameters=SliceParameters())


def test_segments_split_to_target_length() -> None:
    # One long 20 mm move with a 5 mm target -> four ~5 mm segments.
    move = _line_move((0.0, 0.0, 0.0), (20.0, 0.0, 0.0))
    toolpath = _toolpath([ToolpathLayer(index=0, z=1.0, moves=[move])])

    segments = build_thermal_segments(toolpath, target_segment_length_mm=5.0)

    assert len(segments) == 4
    for segment in segments:
        assert segment.length_mm == pytest.approx(5.0)
        assert isinstance(segment.center, np.ndarray)
        assert segment.center.shape == (3,)


def test_timing_is_monotonic_and_positive() -> None:
    move = _line_move((0.0, 0.0, 0.0), (20.0, 0.0, 0.0))
    toolpath = _toolpath([ToolpathLayer(index=0, z=1.0, moves=[move])])

    segments = build_thermal_segments(toolpath, target_segment_length_mm=5.0)

    prev_start = -1.0
    for segment in segments:
        assert segment.start_time_s >= prev_start
        assert segment.end_time_s > segment.start_time_s
        assert segment.duration_s > 0.0
        prev_start = segment.start_time_s


def test_feature_classification() -> None:
    moves = [
        _line_move((0.0, 0.0, 0.0), (4.0, 0.0, 0.0), kind="outer_perimeter"),
        _line_move((0.0, 1.0, 0.0), (4.0, 1.0, 0.0), kind="infill"),
        _line_move((0.0, 2.0, 0.0), (4.0, 2.0, 0.0), kind="support"),
    ]
    toolpath = _toolpath([ToolpathLayer(index=0, z=1.0, moves=moves)])

    segments = build_thermal_segments(toolpath, target_segment_length_mm=5.0)
    features = [s.feature for s in segments]

    assert features == ["wall", "hatch", "support"]


def test_simulate_returns_score_per_segment_at_least_self_heat() -> None:
    move = _line_move((0.0, 0.0, 0.0), (20.0, 0.0, 0.0))
    toolpath = _toolpath([ToolpathLayer(index=0, z=1.0, moves=[move])])
    segments = build_thermal_segments(toolpath, target_segment_length_mm=5.0)

    params = ThermalParams()
    scores = simulate_exposure(segments, params)

    assert scores.shape == (len(segments),)
    for segment, score in zip(segments, scores):
        self_heat = (
            params.absorption_efficiency * segment.laser_power * segment.duration_s
        )
        # Every segment counts at least its own deposited heat.
        assert score >= self_heat - 1e-9


def test_progress_callback_reports_and_finishes_at_total() -> None:
    move = _line_move((0.0, 0.0, 0.0), (40.0, 0.0, 0.0))
    toolpath = _toolpath([ToolpathLayer(index=0, z=1.0, moves=[move])])
    segments = build_thermal_segments(toolpath, target_segment_length_mm=2.0)

    calls: list[tuple[int, int]] = []
    simulate_exposure(segments, progress=lambda done, total: calls.append((done, total)))

    n = len(segments)
    assert calls, "progress callback was never invoked"
    assert all(total == n for _, total in calls)
    assert all(0 <= done <= n for done, _ in calls)
    # The final report always completes at the total count.
    assert calls[-1] == (n, n)


def test_higher_laser_power_yields_proportionally_more_self_heat() -> None:
    # Two identical beads differing only in laser power: the hotter beam must
    # deposit proportionally more heat, confirming per-segment power is applied.
    base = _line_move((0.0, 0.0, 0.0), (3.0, 0.0, 0.0), laser_power=1000.0)
    hot = _line_move((0.0, 0.0, 0.0), (3.0, 0.0, 0.0), laser_power=2000.0)

    base_seg = build_thermal_segments(
        _toolpath([ToolpathLayer(index=0, z=1.0, moves=[base])]),
        target_segment_length_mm=5.0,
    )
    hot_seg = build_thermal_segments(
        _toolpath([ToolpathLayer(index=0, z=1.0, moves=[hot])]),
        target_segment_length_mm=5.0,
    )

    base_score = simulate_exposure(base_seg, ThermalParams(background_weight=0.0))
    hot_score = simulate_exposure(hot_seg, ThermalParams(background_weight=0.0))

    assert hot_score.max() == pytest.approx(2.0 * base_score.max())


def test_repeated_nearby_deposition_scores_hotter() -> None:
    # Stack many short moves in the same small region: later segments should
    # accumulate lingering heat and score higher than an isolated single move.
    hot_moves = [
        _line_move((0.0, 0.0, float(i)), (3.0, 0.0, float(i))) for i in range(8)
    ]
    hot_toolpath = _toolpath(
        [
            ToolpathLayer(index=i, z=float(i), moves=[m])
            for i, m in enumerate(hot_moves)
        ]
    )
    hot_segments = build_thermal_segments(hot_toolpath, target_segment_length_mm=5.0)
    hot_scores = simulate_exposure(hot_segments)

    single = _toolpath(
        [
            ToolpathLayer(
                index=0,
                z=0.0,
                moves=[_line_move((0.0, 0.0, 0.0), (3.0, 0.0, 0.0))],
            )
        ]
    )
    single_scores = simulate_exposure(
        build_thermal_segments(single, target_segment_length_mm=5.0)
    )

    # The hottest point in the repeatedly-heated stack exceeds an isolated bead.
    assert hot_scores.max() > single_scores.max()


def test_diffusivity_derives_spatial_decay_and_spreads_heat_further() -> None:
    # Two stacked beads a few mm apart: a higher material diffusivity lengthens
    # the derived spatial decay (sqrt(alpha * tau)), so the earlier bead's heat
    # reaches the later one more strongly and its score rises.
    moves = [
        _line_move((0.0, 0.0, 0.0), (3.0, 0.0, 0.0)),
        _line_move((0.0, 0.0, 6.0), (3.0, 0.0, 6.0)),
    ]
    toolpath = _toolpath(
        [ToolpathLayer(index=i, z=float(i * 6), moves=[m]) for i, m in enumerate(moves)]
    )
    segments = build_thermal_segments(toolpath, target_segment_length_mm=5.0)

    low = simulate_exposure(segments, ThermalParams(thermal_diffusivity_mm2_s=1.0))
    high = simulate_exposure(segments, ThermalParams(thermal_diffusivity_mm2_s=20.0))

    # The later bead (last segment) picks up more lingering heat with the more
    # conductive material; the first bead's own heat is unchanged.
    assert high[-1] > low[-1]
    assert high[0] == pytest.approx(low[0])


def test_empty_toolpath_yields_no_segments_and_empty_scores() -> None:
    toolpath = _toolpath([])
    segments = build_thermal_segments(toolpath)

    assert segments == []
    assert simulate_exposure(segments).shape == (0,)


def test_background_weight_zero_matches_pure_local_model() -> None:
    # The background pool is disabled by default (weight 0): scores must be
    # identical to the pure local model so existing behaviour is preserved.
    toolpath = _stacked_toolpath(6)
    segments = build_thermal_segments(toolpath, target_segment_length_mm=5.0)

    local = simulate_exposure(segments, ThermalParams(background_weight=0.0))
    explicit = simulate_exposure(
        segments, ThermalParams(background_weight=0.0, background_decay_s=500.0)
    )

    assert np.allclose(local, explicit)


def test_background_pool_adds_compound_interlayer_heating() -> None:
    # With the part-wide pool enabled, heat from every earlier bead lingers and
    # compounds, so upper layers score strictly higher than with the local-only
    # model — and higher than lower layers (the bulk warms as the build grows).
    toolpath = _stacked_toolpath(12)
    segments = build_thermal_segments(toolpath, target_segment_length_mm=5.0)

    local = simulate_exposure(segments, ThermalParams(background_weight=0.0))
    compound = simulate_exposure(
        segments, ThermalParams(background_weight=1.0, background_decay_s=400.0)
    )

    top_layer = max(s.layer_index for s in segments)

    def mean_at(scores, layer):
        return float(np.mean([v for s, v in zip(segments, scores) if s.layer_index == layer]))

    # The pool only adds heat, and it accumulates with height.
    assert np.all(compound >= local - 1e-9)
    assert mean_at(compound, top_layer) > mean_at(local, top_layer)
    assert mean_at(compound, top_layer) > mean_at(compound, top_layer // 2)



def test_segment_is_thermal_segment_instance() -> None:
    move = _line_move((0.0, 0.0, 0.0), (5.0, 0.0, 0.0))
    toolpath = _toolpath([ToolpathLayer(index=0, z=1.0, moves=[move])])

    segments = build_thermal_segments(toolpath)

    assert all(isinstance(s, ThermalSegment) for s in segments)


# --- Stacked-toolpath helper ------------------------------------------------


def _stacked_toolpath(n_layers: int, layer_height: float = 1.0) -> Toolpath:
    """A vertical stack of identical short beads, one per layer.

    Each layer deposits the same bead directly above the previous one, giving
    real inter-layer reheating for the background-pool tests.
    """
    layers = []
    for i in range(n_layers):
        z = (i + 1) * layer_height
        move = _line_move((0.0, 0.0, z), (10.0, 0.0, z))
        layers.append(ToolpathLayer(index=i, z=z, moves=[move]))
    return _toolpath(layers)

