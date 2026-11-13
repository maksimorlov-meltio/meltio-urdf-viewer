"""Cut the chamber-window opening out of a door skin inside a GLB.

The 2026-11 Front_Door export models the window as a 16 mm glass pane recessed
~84 mm behind the door's OUTER skin, and that skin (a 6 mm sheet, a few
door-sized triangles) is continuous across the window area -- so the pane is
hidden and the door reads as a solid slab. This module removes the rectangle
of the glass pane's footprint from every skin triangle that lies in front of the
pane (`y_band`, door-local metres along the pane normal), re-triangulating the
remaining parts with interpolated NORMAL / TEXCOORD_0, so the transparent pane
and the chamber behind it show through.

Pure numpy; appends new accessors / bufferViews to the bin chunk.
"""
import numpy as np

_DT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
_NC = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}


def read_accessor(j, b, ai):
    a = j["accessors"][ai]
    bv = j["bufferViews"][a["bufferView"]]
    off = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
    ncomp = _NC[a["type"]]
    dt = _DT[a["componentType"]]
    item = np.dtype(dt).itemsize
    stride = bv.get("byteStride", ncomp * item)
    raw = np.frombuffer(b, dtype=np.uint8, count=stride * a["count"], offset=off)
    return np.lib.stride_tricks.as_strided(raw.view(dt), (a["count"], ncomp), (stride, item)).copy()


def append_accessor(j, b, arr, component_type, type_name, target, minmax=False):
    dt = _DT[component_type]
    data = np.ascontiguousarray(arr.astype(dt)).tobytes()
    b = b + b"\x00" * ((4 - len(b) % 4) % 4)
    j["bufferViews"].append({"buffer": 0, "byteOffset": len(b), "byteLength": len(data), "target": target})
    b = b + data
    acc = {"bufferView": len(j["bufferViews"]) - 1, "componentType": component_type, "count": int(arr.shape[0]), "type": type_name}
    if minmax:
        acc["min"] = [float(x) for x in arr.min(0)]
        acc["max"] = [float(x) for x in arr.max(0)]
    j["accessors"].append(acc)
    j["buffers"][0]["byteLength"] = len(b)
    return len(j["accessors"]) - 1, b


def _clip_polygon(poly, inside):
    """Sutherland-Hodgman against one half-plane. poly: list of (u, v, bary)."""
    out = []
    n = len(poly)
    for i in range(n):
        cur, nxt = poly[i], poly[(i + 1) % n]
        cin, nin = inside(cur), inside(nxt)
        if cin:
            out.append(cur)
        if cin != nin:
            # intersection point along the edge, interpolate bary too
            du, dv = nxt[0] - cur[0], nxt[1] - cur[1]
            t = _edge_t(cur, nxt, inside)
            out.append((cur[0] + du * t, cur[1] + dv * t, cur[2] * (1 - t) + nxt[2] * t))
    return out


def _edge_t(cur, nxt, inside):
    # inside() is an axis-aligned test; recover the axis/limit from a closure attribute
    axis, limit = inside.axis, inside.limit
    a, c = cur[axis], nxt[axis]
    if abs(c - a) < 1e-12:
        return 0.0
    return (limit - a) / (c - a)


def _half_plane(axis, limit, keep_less):
    def test(p):
        return p[axis] <= limit if keep_less else p[axis] >= limit
    test.axis, test.limit = axis, limit
    return test


def cut_window_opening(j, b, glass_material_name, y_band, normal_min=0.9, verbose=print):
    """Remove the glass pane's footprint from skin triangles in front of it.

    y_band = (y_lo, y_hi): door-local Y (the pane's normal axis) range, relative to
    the pane's near face, in which skin triangles are cut (positive = in front).
    """
    glass_mat = next((i for i, m in enumerate(j["materials"]) if m.get("name") == glass_material_name), None)
    if glass_mat is None:
        verbose("  window cut: no glass material")
        return b, 0
    glass_prims = [p for m in j["meshes"] for p in m["primitives"] if p.get("material") == glass_mat]
    G = np.concatenate([read_accessor(j, b, p["attributes"]["POSITION"]) for p in glass_prims]).astype(np.float64)
    gmin, gmax = G.min(0), G.max(0)
    depth_axis = int(np.argmin(gmax - gmin))
    u_axis, v_axis = [ax for ax in range(3) if ax != depth_axis]
    rect = (gmin[u_axis], gmax[u_axis], gmin[v_axis], gmax[v_axis])
    pane_front = gmax[depth_axis]
    y_lo, y_hi = pane_front + y_band[0], pane_front + y_band[1]
    cut_total = 0
    for m in j["meshes"]:
        for p in m["primitives"]:
            if p.get("material") == glass_mat or "indices" not in p:
                continue
            attrs = p["attributes"]
            P = read_accessor(j, b, attrs["POSITION"]).astype(np.float64)
            N = read_accessor(j, b, attrs["NORMAL"]).astype(np.float64) if "NORMAL" in attrs else None
            T = read_accessor(j, b, attrs["TEXCOORD_0"]).astype(np.float64) if "TEXCOORD_0" in attrs else None
            I = read_accessor(j, b, p["indices"]).reshape(-1, 3).astype(np.int64)
            tri = P[I]
            nrm = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
            nrm /= (np.linalg.norm(nrm, axis=1)[:, None] + 1e-12)
            cy = tri[:, :, depth_axis].mean(1)
            facing = np.abs(nrm[:, depth_axis]) >= normal_min
            in_band = (cy >= y_lo) & (cy <= y_hi)
            # bbox overlap with the rectangle in the pane plane
            tu, tv = tri[:, :, u_axis], tri[:, :, v_axis]
            overlap = (tu.max(1) > rect[0]) & (tu.min(1) < rect[1]) & (tv.max(1) > rect[2]) & (tv.min(1) < rect[3])
            cand = facing & in_band & overlap
            if not cand.any():
                continue
            new_P, new_N, new_T = [P], [N] if N is not None else None, [T] if T is not None else None
            new_tris = [I[~cand]]
            next_index = len(P)
            regions = [
                [_half_plane(0, rect[0], True)],                                                   # u <= umin
                [_half_plane(0, rect[1], False)],                                                  # u >= umax
                [_half_plane(0, rect[0], False), _half_plane(0, rect[1], True), _half_plane(1, rect[2], True)],   # inside u, v <= vmin
                [_half_plane(0, rect[0], False), _half_plane(0, rect[1], True), _half_plane(1, rect[3], False)],  # inside u, v >= vmax
            ]
            for ti in np.nonzero(cand)[0]:
                idx = I[ti]
                base = [(P[idx[k], u_axis], P[idx[k], v_axis], np.eye(3)[k]) for k in range(3)]
                for region in regions:
                    poly = base
                    for hp in region:
                        poly = _clip_polygon(poly, hp)
                        if len(poly) < 3:
                            break
                    if len(poly) < 3:
                        continue
                    # drop degenerate slivers
                    pts = np.array([[q[0], q[1]] for q in poly])
                    area = 0.5 * abs(np.sum(pts[:, 0] * np.roll(pts[:, 1], -1) - np.roll(pts[:, 0], -1) * pts[:, 1]))
                    if area < 1e-9:
                        continue
                    verts = []
                    for q in poly:
                        w = q[2]
                        verts.append(next_index)
                        new_P.append((w @ P[idx])[None, :])
                        if N is not None:
                            n_i = w @ N[idx]
                            n_i /= (np.linalg.norm(n_i) + 1e-12)
                            new_N.append(n_i[None, :])
                        if T is not None:
                            new_T.append((w @ T[idx])[None, :])
                        next_index += 1
                    for k in range(1, len(verts) - 1):
                        new_tris.append(np.array([[verts[0], verts[k], verts[k + 1]]]))
            cut_total += int(cand.sum())
            P2 = np.concatenate(new_P)
            I2 = np.concatenate(new_tris).reshape(-1)
            attrs["POSITION"], b = append_accessor(j, b, P2, 5126, "VEC3", 34962, minmax=True)
            if N is not None:
                attrs["NORMAL"], b = append_accessor(j, b, np.concatenate(new_N), 5126, "VEC3", 34962)
            if T is not None:
                attrs["TEXCOORD_0"], b = append_accessor(j, b, np.concatenate(new_T), 5126, "VEC2", 34962)
            for extra in [k for k in attrs if k not in ("POSITION", "NORMAL", "TEXCOORD_0")]:
                del attrs[extra]  # TANGENT / COLOR etc. would be stale for the new vertices
            p["indices"], b = append_accessor(j, b, I2, 5125, "SCALAR", 34963)
    verbose(f"  window cut: {cut_total} skin triangles clipped around the {int((rect[1]-rect[0])*1000)}x{int((rect[3]-rect[2])*1000)} mm pane")
    return b, cut_total
