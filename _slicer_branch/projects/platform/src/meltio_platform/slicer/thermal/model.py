"""Moving heat-source / thermal-exposure model (qualitative first pass).

Each :class:`~meltio_platform.slicer.thermal.segments.ThermalSegment` receives a heat input
proportional to its laser power and deposition time::

    heat_input = absorption_efficiency * laser_power * duration

The relative heat score of a segment is then its own heat plus the decayed heat
still lingering from previously deposited segments::

    influence = heat_input_j * spatial_decay(distance) * time_decay(dt)

with exponential spatial and temporal decay. The result is **qualitative**: a
relative "this region runs hotter than that one" score, not a temperature. It is
useful immediately for heat-map visualisation and interpass-heat warnings.

Performance: a full all-pairs sum is ``O(n^2)``. Because the time decay makes old
contributions negligible, the inner sum is restricted to a trailing time window
(advanced with a two-pointer cursor over the deposition-ordered segments). This
does not change the model — it only skips terms whose ``time_decay`` is already
near zero — and bounds the cost.

A future graph/RC solver would reuse the same segment nodes and replace this
decayed-superposition step with a conductance/heat-capacity update.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

import numpy as np

from .segments import ThermalSegment


@dataclass
class ThermalParams:
    """Tunable parameters for the moving-source exposure model.

    Attributes:
        absorption_efficiency: Fraction of laser power that becomes deposited
            heat (lumped, unitless).
        spatial_decay_length_mm: Fallback length scale of the spatial influence
            when no diffusivity is supplied; heat from a neighbour falls to
            ``1/e`` at this distance (mm).
        thermal_diffusivity_mm2_s: Material thermal diffusivity ``k/(rho*cp)``
            (mm^2/s). When positive it *derives* the spatial decay length from
            the physics as ``sqrt(diffusivity * time_decay_s)`` — the distance
            heat diffuses in one cooling time constant — so the spread reflects
            the real material instead of a fixed magic number. ``None`` keeps
            ``spatial_decay_length_mm``.
        time_decay_s: Cooling time constant; lingering heat falls to ``1/e``
            after this long (s).
        time_window_factor: How many ``time_decay_s`` of history to include
            before treating older contributions as negligible.
        background_decay_s: Long time constant of the part-wide "background"
            heat pool (s). Every bead adds its heat to this pool, which bleeds
            off slowly (the whole part shedding heat to the plate/air); each
            segment then also feels the pool level at its deposition time. This
            captures *compound* interlayer heating that the short-window local
            term cannot — the bulk slowly warming as the build grows.
        background_weight: Scale of the background pool's contribution relative
            to local heat. ``0`` disables it (pure local model, the default).
        max_neighbors: Hard cap on how many earlier segments contribute to any
            one segment, as a safety bound on cost.
    """

    absorption_efficiency: float = 0.4
    spatial_decay_length_mm: float = 8.0
    thermal_diffusivity_mm2_s: float | None = None
    time_decay_s: float = 30.0
    time_window_factor: float = 4.0
    background_decay_s: float = 240.0
    background_weight: float = 0.0
    max_neighbors: int = 4000


def simulate_exposure(
    segments: list[ThermalSegment],
    params: ThermalParams | None = None,
    progress: Callable[[int, int], None] | None = None,
) -> np.ndarray:
    """Compute a relative heat-exposure score for each segment.

    Args:
        segments: Thermal segments in deposition order (as produced by
            :func:`~meltio_platform.slicer.thermal.segments.build_thermal_segments`).
        params: Model parameters; defaults to :class:`ThermalParams`.
        progress: Optional ``callback(done, total)`` invoked periodically as the
            deposition-ordered sweep advances, so callers can report progress.

    Returns:
        A ``(n,)`` array of non-negative relative heat scores aligned with
        ``segments`` (a segment's own heat plus the decayed heat lingering from
        earlier segments). Empty input yields an empty array.
    """
    params = params or ThermalParams()
    n = len(segments)
    scores = np.zeros(n, dtype=float)
    if n == 0:
        return scores

    centers = np.array([s.center for s in segments], dtype=float)
    t_start = np.array([s.start_time_s for s in segments], dtype=float)
    t_end = np.array([s.end_time_s for s in segments], dtype=float)
    heat = np.array(
        [params.absorption_efficiency * s.laser_power * s.duration_s for s in segments],
        dtype=float,
    )

    decay_len = max(params.spatial_decay_length_mm, 1e-9)
    tau = max(params.time_decay_s, 1e-9)
    # Physically ground the spatial spread when a material diffusivity is given:
    # heat diffuses about sqrt(alpha * tau) in one cooling time constant, so a
    # more conductive material spreads its influence further.
    if params.thermal_diffusivity_mm2_s and params.thermal_diffusivity_mm2_s > 0:
        decay_len = max(np.sqrt(params.thermal_diffusivity_mm2_s * tau), 1e-9)
    window = params.time_window_factor * tau

    # Part-wide background heat pool: a single slow-decaying accumulator advanced
    # in deposition order (O(n)). Each segment reads the pool level already in
    # the part BEFORE adding its own heat, so it never counts itself here.
    tau_bg = max(params.background_decay_s, 1e-9)
    bg_weight = max(params.background_weight, 0.0)
    bg = 0.0
    last_t = t_start[0]

    # Report progress at ~1% granularity to keep the callback overhead trivial.
    report_every = max(1, n // 100)

    lo = 0
    for i in range(n):
        # Decay the background pool forward to this segment's deposition time.
        if bg_weight > 0.0:
            bg *= np.exp(-(t_start[i] - last_t) / tau_bg)
            last_t = t_start[i]

        # Advance the trailing cursor so only the recent time window is summed.
        while t_start[i] - t_start[lo] > window:
            lo += 1
        start = max(lo, i - params.max_neighbors)

        total = heat[i]  # a segment always counts its own deposited heat
        if bg_weight > 0.0:
            total += bg_weight * bg  # compound heat retained in the whole part
        if i > start:
            distances = np.linalg.norm(centers[start:i] - centers[i], axis=1)
            dt = t_start[i] - t_end[start:i]
            np.clip(dt, 0.0, None, out=dt)
            total += float(
                np.sum(
                    heat[start:i]
                    * np.exp(-distances / decay_len)
                    * np.exp(-dt / tau)
                )
            )
        scores[i] = total

        # This bead now joins the part: add its heat to the background pool.
        if bg_weight > 0.0:
            bg += heat[i]

        if progress is not None and i % report_every == 0:
            progress(i, n)

    if progress is not None:
        progress(n, n)

    return scores
