"""tools/display_hose.py -- the display hose's hanging shape and its tube.

The numbers are the real fittings (Chassis.glb coordinates, +z is world DOWN): the
display-side end ring of the delivered hose and the SCREEN CONNECTION elbow's bore.
What is pinned is what a look at the render cannot settle: the hose really has the
length asked for, it leaves both fittings straight, it never kinks, and the tube
carries the same amount of texture per millimetre along its whole length (the ribs
were visibly uneven when the delivered mesh was bent into place).
"""
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import display_hose  # noqa: E402

A = np.array([0.7207, 0.5474, -0.5919])       # display end ring centre
A_DIR = np.array([-0.001, 0.072, 0.997])      # the hose leaves the gland downward (display tilted 4 deg)
B = np.array([0.5555, 0.4709, -0.4423])       # elbow end ring centre, 18.8 mm inside the bore
MOUTH = -0.4235                               # plane of the elbow's opening
STRAIGHT_A, STRAIGHT_B = 0.018, 0.027
RADIUS = 0.0159


def route(length=0.40):
    return display_hose.centreline(A, A_DIR, B, length, STRAIGHT_A, STRAIGHT_B)


def test_the_hose_has_the_length_asked_for_and_ends_in_both_fittings():
    pts, arc, stats = route()
    assert arc[-1] == pytest.approx(0.40)
    assert np.linalg.norm(np.diff(pts, axis=0), axis=1).sum() == pytest.approx(0.40, abs=3e-4)
    assert np.linalg.norm(pts[0] - A) < 1e-12
    assert np.linalg.norm(pts[-1] - B) < 1e-6
    assert stats["closure_error"] < 1e-8 and stats["gradient"] < 1e-6, "the solver did not converge"


def test_it_leaves_each_fitting_straight():
    pts, arc, _ = route()
    out_of_gland = pts[arc <= STRAIGHT_A]
    direction = out_of_gland[-1] - out_of_gland[0]
    direction /= np.linalg.norm(direction)
    assert np.degrees(np.arccos(direction @ (A_DIR / np.linalg.norm(A_DIR)))) < 0.3
    in_elbow = pts[arc >= arc[-1] - STRAIGHT_B + 1e-9]
    assert len(in_elbow) >= 10
    assert np.abs(in_elbow[:, :2] - B[:2]).max() < 1e-6, "inside the elbow the hose runs up its bore"
    assert (np.diff(in_elbow[:, 2]) < 0).all(), "... upward"


def test_it_hangs_below_the_elbow_and_never_kinks():
    pts, arc, stats = route()
    hangs = pts[:, 2].max() - MOUTH
    assert 0.050 < hangs < 0.070, f"hangs {hangs * 1000:.0f} mm below the mouth"
    assert stats["min_bend_radius"] > 0.045, "a conduit of this size does not bend tighter than that"
    seg = np.diff(pts, axis=0)
    seg /= np.linalg.norm(seg, axis=1, keepdims=True)
    turn = np.degrees(np.arccos(np.clip((seg[1:] * seg[:-1]).sum(1), -1, 1)))
    assert turn.max() < 2.5, "a corner in the centreline"


def test_a_longer_hose_hangs_lower():
    short, long_ = route(0.40)[0], route(0.46)[0]
    assert long_[:, 2].max() > short[:, 2].max() + 0.02


def test_the_tube_is_round_faces_outward_and_carries_the_texture_evenly():
    pts, arc, _ = route()
    sides, u_lo, u_hi, v_start, v_per_m = 20, 0.8152, 0.9917, 1.0, -1.0 / 0.546
    p, n, uv, idx = display_hose.tube(pts, arc, RADIUS, sides, 0.004, u_lo, u_hi, v_start, v_per_m,
                                      A_DIR, np.array([0.0, 0.0, -1.0]))
    w = sides + 1
    rings = len(p) // w
    assert rings == 101 and len(p) == rings * w and len(idx) == (rings - 1) * sides * 2
    assert idx.min() == 0 and idx.max() == len(p) - 1
    ring_p, ring_n, ring_uv = p.reshape(rings, w, 3), n.reshape(rings, w, 3), uv.reshape(rings, w, 2)
    centres = ring_p[:, :-1].mean(1)
    assert np.abs(np.linalg.norm(ring_p - centres[:, None, :], axis=2) - RADIUS).max() < 1e-9, "not round"
    assert np.abs(ring_p[:, 0] - ring_p[:, -1]).max() < 1e-12, "the seam column must close the tube"
    assert np.abs(np.linalg.norm(n, axis=1) - 1).max() < 1e-9
    assert ((ring_n * (ring_p - centres[:, None, :])).sum(2) > 0).all(), "normals point inward"
    face = np.cross(p[idx[:, 1]] - p[idx[:, 0]], p[idx[:, 2]] - p[idx[:, 0]])
    assert ((face * n[idx[:, 0]]).sum(1) > 0).all(), "a triangle faces into the hose"
    # end rings stand square in their fittings
    assert np.abs((ring_p[0] - centres[0]) @ (A_DIR / np.linalg.norm(A_DIR))).max() < 1e-9
    assert np.abs(ring_p[-1][:, 2] - B[2]).max() < 1e-9
    # texture: once round the tube in u, and the same v per metre everywhere
    assert ring_uv[:, 0, 0] == pytest.approx(u_lo) and ring_uv[:, -1, 0] == pytest.approx(u_hi)
    s = np.linspace(0.0, arc[-1], rings)
    assert np.abs(ring_uv[:, :, 1] - (v_start + s * v_per_m)[:, None]).max() < 1e-12
    spacing = np.linalg.norm(np.diff(centres, axis=0), axis=1)
    assert spacing.max() / spacing.min() < 1.02, "rings unevenly spaced: the ribs would stretch"
