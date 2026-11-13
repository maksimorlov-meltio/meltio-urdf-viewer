"""The display hose as a real conduit would hang: shape and tube mesh (numpy only).

Used by build_textured_assembly.route_display_hose. Coordinates are those of
Chassis.glb (metres), where +z is world DOWN.

The centreline is a planar elastic rod of a given length -- bending stiffness plus
its own weight -- clamped straight at both fittings: it leaves the display gland
along the gland, and enters the chassis elbow straight up its bore. That is the
shape a corrugated conduit takes by itself, so nothing about the curve is drawn by
hand; the only choice is the length (Maksim, 2026-11-13: "the curvature should look
natural", after arcs and Bezier curves did not).
"""
import numpy as np

DOWN = np.array([0.0, 0.0, 1.0])


def hang(delta_e, delta_z, length, psi_a, straight_a, straight_b, gravity=2.0, n=240):
    """Angles of n equal segments, measured from DOWN toward the far end.

    The rod starts at the origin heading psi_a (about 0: down, out of the display
    gland) and must end `delta_e` further along the horizontal and `delta_z` lower,
    heading UP (pi) into the elbow. `straight_a` / `straight_b` are the lengths the
    fittings hold straight. gravity = w L^3 / EI (dimensionless; a short conduit is
    stiffness-dominated, so it hardly matters). Damped Newton iteration on the KKT
    system of: bending energy + gravity potential, subject to the end position.
    Returns (angles, segment length, end-position error, gradient norm).
    """
    ds = length / n
    na = max(1, int(round(straight_a / ds)))
    nb = max(1, int(round(straight_b / ds)))
    psi = np.empty(n)
    psi[:na] = psi_a
    psi[n - nb:] = np.pi
    free = np.arange(na, n - nb)
    psi[free] = np.linspace(psi_a, np.pi, len(free) + 2)[1:-1]
    weight = (n - np.arange(n)) * ds * ds * (gravity / length ** 3)   # EI = 1
    lam = np.zeros(2)

    def parts(p, lm):
        d = np.diff(p)
        g = np.zeros(n)
        g[:-1] -= d / ds
        g[1:] += d / ds
        g += weight * np.sin(p)                                # gravity: minimise -w * sum(z)
        c = np.array([ds * np.sin(p).sum() - delta_e, ds * np.cos(p).sum() - delta_z])
        jac = np.vstack([ds * np.cos(p), -ds * np.sin(p)])
        diag = np.full(n, 2.0 / ds)
        diag[0] = diag[-1] = 1.0 / ds
        diag += weight * np.cos(p) - lm[0] * ds * np.sin(p) - lm[1] * ds * np.cos(p)
        return g, c, jac, diag

    m = len(free)
    idx = np.arange(m)
    for _ in range(400):
        g, c, jac, diag = parts(psi, lam)
        res = np.r_[g[free] + jac[:, free].T @ lam, c]
        if np.linalg.norm(res) < 1e-10:
            break
        H = np.zeros((m, m))
        H[idx, idx] = diag[free]
        H[idx[:-1], idx[1:]] = -1.0 / ds
        H[idx[1:], idx[:-1]] = -1.0 / ds
        shift = 0.0
        while True:                                            # keep the Hessian block positive definite
            try:
                np.linalg.cholesky(H + shift * np.eye(m))
                break
            except np.linalg.LinAlgError:
                shift = max(1e-3 / ds, shift * 4)
        K = np.zeros((m + 2, m + 2))
        K[:m, :m] = H + shift * np.eye(m)
        K[:m, m:] = jac[:, free].T
        K[m:, :m] = jac[:, free]
        step = np.linalg.solve(K, -res)
        scale = min(1.0, 0.25 / max(1e-12, np.abs(step[:m]).max()))
        psi[free] += scale * step[:m]
        lam += scale * step[m:]
    g, c, jac, diag = parts(psi, lam)
    return psi, ds, float(np.linalg.norm(c)), float(np.linalg.norm(g[free] + jac[:, free].T @ lam))


def centreline(a_end, a_dir, b_end, length, straight_a, straight_b, gravity=2.0, n=240):
    """Polyline (n + 1 points, equal spacing) from the display end to the elbow end.

    a_end / a_dir: centre of the display-side end ring and the direction the hose
    leaves it. b_end: centre of the elbow-side end ring; the hose arrives there
    heading straight up. Returns (points, arc lengths, stats).
    """
    a_dir = a_dir / np.linalg.norm(a_dir)
    e = np.array(b_end, dtype=np.float64) - a_end
    e[2] = 0.0
    delta_e = float(np.linalg.norm(e))
    e /= delta_e
    side = np.cross(DOWN, e)
    psi_a = float(np.arctan2(a_dir @ e, a_dir @ DOWN))
    psi, ds, c_err, g_err = hang(delta_e, float(b_end[2] - a_end[2]), length, psi_a, straight_a, straight_b, gravity, n)
    s = np.arange(n + 1) * ds
    along = np.r_[0.0, np.cumsum(np.sin(psi))] * ds
    drop = np.r_[0.0, np.cumsum(np.cos(psi))] * ds
    # The gland is tilted a few degrees out of the hanging plane: stay on the gland's
    # own line for the straight piece, then ease back into the plane by `ease`
    # (offset 0 and slope 0 there).
    ease = 0.15
    slope = float(a_dir @ side) / max(1e-9, float(a_dir @ DOWN))
    t = np.clip((s - straight_a) / (ease - straight_a), 0.0, 1.0)
    lateral = slope * s * (1 - t * t * (3 - 2 * t))
    pts = a_end + along[:, None] * e + drop[:, None] * DOWN + lateral[:, None] * side
    curvature = np.abs(np.diff(psi)) / ds
    stats = {
        "closure_error": c_err, "gradient": g_err,
        "lowest_z": float(pts[:, 2].max()),
        "min_bend_radius": float(1.0 / max(curvature.max(), 1e-9)),
        "end_error": float(np.linalg.norm(pts[-1] - b_end)),
    }
    return pts, s, stats


def _rot_between(a, b):
    v = np.cross(a, b)
    s2 = float(v @ v)
    if s2 < 1e-18:
        return np.eye(3)
    vx = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + vx + vx @ vx * ((1 - float(a @ b)) / s2)


def tube(points, arc, radius, sides, ring_step, u_lo, u_hi, v_start, v_per_m, first_dir, last_dir):
    """Round tube along the centreline.

    Rings every `ring_step` (the last gap shared out), `sides` faces round with one
    duplicated seam column. Texture: u runs once round the tube from u_lo to u_hi,
    v = v_start + arc length * v_per_m -- the same amount of texture per millimetre
    everywhere, so the ribs keep one size along the whole hose. The frame is carried
    along without twist. Returns (positions, normals, uvs, triangle indices).
    """
    k = max(2, int(round(arc[-1] / ring_step)) + 1)
    s = np.linspace(0.0, arc[-1], k)
    cen = np.stack([np.interp(s, arc, points[:, i]) for i in range(3)], axis=1)
    tan = np.gradient(cen, axis=0)
    tan /= np.linalg.norm(tan, axis=1, keepdims=True)
    tan[0] = first_dir / np.linalg.norm(first_dir)             # end rings stand square in their fittings
    tan[-1] = last_dir / np.linalg.norm(last_dir)
    n1 = np.cross(tan[0], [0.0, 1.0, 0.0])
    if np.linalg.norm(n1) < 1e-6:
        n1 = np.cross(tan[0], [1.0, 0.0, 0.0])
    n1 /= np.linalg.norm(n1)
    angles = np.linspace(0.0, 2 * np.pi, sides + 1)
    pos = np.empty((k, sides + 1, 3))
    nrm = np.empty((k, sides + 1, 3))
    uv = np.empty((k, sides + 1, 2))
    for i in range(k):
        if i:
            n1 = _rot_between(tan[i - 1], tan[i]) @ n1
            n1 -= tan[i] * float(n1 @ tan[i])
            n1 /= np.linalg.norm(n1)
        n2 = np.cross(tan[i], n1)
        radial = np.cos(angles)[:, None] * n1 + np.sin(angles)[:, None] * n2
        pos[i] = cen[i] + radius * radial
        nrm[i] = radial
        uv[i, :, 0] = u_lo + (u_hi - u_lo) * angles / (2 * np.pi)
        uv[i, :, 1] = v_start + s[i] * v_per_m
    idx = []
    w = sides + 1
    for i in range(k - 1):
        for m in range(sides):
            a, b, c, d = i * w + m, i * w + m + 1, (i + 1) * w + m, (i + 1) * w + m + 1
            idx += [a, c, b, b, c, d]
    idx = np.array(idx, dtype=np.int64).reshape(-1, 3)
    p, q = pos.reshape(-1, 3), nrm.reshape(-1, 3)
    face = np.cross(p[idx[0, 1]] - p[idx[0, 0]], p[idx[0, 2]] - p[idx[0, 0]])
    if float(face @ q[idx[0, 0]]) < 0:                         # front faces outward
        idx = idx[:, [0, 2, 1]]
    return p, q, uv.reshape(-1, 2), idx
