"""Neutralise a spool's wire-coil primitive so the viewer can tint it per material.

The 2026-11 delivery gives the two spools different coils: "Spool Cooper" samples
the copper patch of Metal_Atlas_02, "Spool Stainless Steel" the steel patch of
Metal_Atlas_01 (both patches are flat colour, std < 2/255). The viewer now colours
the coil from the material the operator LOADS in the Materials menu (316L, 17-4PH,
Inconel, Ti64, bronze), which needs both coils on the SAME neutral steel texel so
one multiplier map works for either spool. This moves the coil primitive onto the
steel material and shifts its UVs onto the steel patch; the blue plastic flanges
are untouched.

Pure numpy; appends a new TEXCOORD_0 accessor to the bin chunk.
"""
import numpy as np

from glb_window_cut import read_accessor, append_accessor


def neutralize_coil(j, b, from_material, to_material, uv_offset, verbose=print):
    """Re-point every primitive on `from_material` to `to_material`, offsetting its UVs.

    uv_offset = (du, dv) in glTF UV space (v down), chosen so the primitive's UV
    footprint lands on the target material's neutral patch.
    """
    names = [m.get("name") for m in j["materials"]]
    if from_material not in names:
        verbose(f"  coil: no material {from_material!r}")
        return b, 0
    src = names.index(from_material)
    if to_material not in names:
        j["materials"].append({**j["materials"][src], "name": to_material})
        names.append(to_material)
    dst = names.index(to_material)
    moved = 0
    for m in j["meshes"]:
        for p in m["primitives"]:
            if p.get("material") != src:
                continue
            uv = read_accessor(j, b, p["attributes"]["TEXCOORD_0"]).astype(np.float64)
            uv[:, 0] += uv_offset[0]
            uv[:, 1] += uv_offset[1]
            p["attributes"]["TEXCOORD_0"], b = append_accessor(j, b, uv, 5126, "VEC2", 34962)
            p["material"] = dst
            moved += 1
    # The source material/texture stay in the file only if something else uses
    # them; drop them when orphaned so the GLB does not carry an unused atlas.
    if not any(p.get("material") == src for m in j["meshes"] for p in m["primitives"]):
        _drop_material(j, src)
    verbose(f"  coil: {moved} primitive(s) moved {from_material} -> {to_material}, uv +{uv_offset}")
    return b, moved


def _drop_material(j, index):
    del j["materials"][index]
    for m in j["meshes"]:
        for p in m["primitives"]:
            if p.get("material", -1) > index:
                p["material"] -= 1
