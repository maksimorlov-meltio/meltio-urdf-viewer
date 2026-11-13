"""Bind a full textured M600 delivery (2026-11 "M600.rar" layout) into the viewer.

Delivery layout (Blender 3.6 export, textures loose):
    <src>/Meshes/<Part>.glb              material names, UVs, NO textures
    <src>/Textures/<Set>/<Set>_{BaseColor,Metallic,Roughness,Normal}.png   4096^2
    <src>/Textures/Display_Atlas/Display_Atlas_{BaseColor,Metallic,Roughness,Normal}.png   2048^2
        (base colour only until 2026-11-12; "Display (6).rar" added the other three maps)

Usage (defaults: assets = ../assets/M600_PRO next to this file, suffix _2611):
    python tools/build_textured_assembly.py check            # placement report only, no writes
    python tools/build_textured_assembly.py textures|glbs|urdf|all  [--src DIR] [--assets DIR] [--suffix S]

What it does
  * Textures: packs Metallic+Roughness into one glTF metallicRoughness map (G=rough,
    B=metal), downscales to 2048 for the HMI, keeps the 4K originals in Textures/4k/.
  * GLBs: rewrites the JSON chunk so each material references the PNGs by relative
    URI (GLTFLoader resolves them against the GLB). The viewer recognises atlas
    materials by NAME (urdf_viewer.js ATLAS_MATERIAL_NAME_RE = /_atlas(?:_\\d+)?$/i),
    so: Metal_Atlas_01/02 and Plastic_Atlas_01 keep their names; PrintedMetal is
    renamed PrintedMetal_Atlas; Glass becomes the Chamber Window Glass transmission
    pane (tools/bake_front_door_glass.py).
  * Display_Atlas is split by what the triangles show (split_display_surfaces):
    the PICTURE surfaces (HMI console screenshot, chiller control panel, chassis
    patch) become Display_Screen -- base colour only, generic viewer shading -- and
    only the ribbed hose strip (u >= 0.8, added 2026-11-12) stays Display_Atlas with
    the full PBR set. Bound whole to the atlas path the screen washed out (studio
    reflections + roughness 0.43 on a flat screenshot: median luminance 27 -> 122),
    and the delivered maps are constant everywhere except on the hose strip.
  * Display hose (route_display_hose, tools/display_hose.py): the ribbed hose in
    Display.glb is modelled for a display that stands VERTICAL, but the URDF tilts
    the display 4 deg back at display_joint (since 2026-05), so as delivered its
    chassis end stops 46 mm beside the SCREEN CONNECTION elbow. It is also a coarse
    tube (24 rings of 12 sides) that arrives at the elbow 10 deg off its axis.
    Bending that mesh into place (2026-11-12/13) stretched some rings by up to 37 %,
    and with them the rib texture. So the delivered hose is now only MEASURED -- its
    display-side end ring, its radius, its strip of the atlas and how much texture
    it carries per millimetre -- and a new one is built between the two fittings:
    the shape a conduit of the given length hangs in by itself (an elastic rod
    clamped straight in the display gland and in the elbow's bore), as a round tube
    with close rings and the texture laid evenly by length. The tilt is read from
    the URDF, so changing it and re-running `glbs` re-routes the hose.
  * Node fix: some exports carry the Blender object LOCATION as a node translation
    (Feeder, Z in the 2026-11 delivery) while their vertex data already sits in the
    link frame -- the translation is stripped (STRIP_NODE_TRANSLATION). Node
    ROTATIONS are kept (gas springs rely on theirs).
  * Placement check: old and new vertices rotated by the URDF visual rpy the way
    the viewer applies it (THREE Euler XYZ) and compared by bounding box and
    nearest-neighbour distance both ways. The live scene is the final arbiter:
    load the previous and the new assembly and diff `__links()` per link.
"""
import argparse
import json
import os
import re
import shutil
import struct

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_SRC = "C:/Users/Meltio/AppData/Local/Temp/claude/e481b6074ba58a7d/cfb92517-12bc-4860-b5e2-ea1749ff020b/scratchpad/m600_rar"
DEFAULT_ASSETS = os.path.normpath(os.path.join(HERE, "..", "assets", "M600_PRO"))
WORK = 2048
TEX_VERSION = "4"  # 4 = 2026-11-10 Fix_02.rar (Head, Palpador Pro, X, Z re-baked UVs + Metal_Atlas_02 base/metallic/roughness); bump when a SAME-named PNG gets new content (browsers cache by URL); 2 = 2026-11-09 Metal_Atlas_01_Roughness revision (Telegram 13:17); 3 = Fix.rar (Display_Atlas base, Metal_Atlas_02 base+roughness, 7 meshes)

# Full PBR sets: folder/stem under <src>/Textures. Material name -> stem (same here).
PBR_SETS = {
    "Metal_Atlas_01": "Metal_Atlas_01",
    "Metal_Atlas_02": "Metal_Atlas_02",
    "Plastic_Atlas_01": "Plastic_Atlas_01",
    "PrintedMetal": "PrintedMetal",
    "Display_Atlas": "Display_Atlas",  # only the ribbed display hose ends up on it, see split_display_surfaces (2K delivery)
}
DISPLAY_SET = "Display_Atlas"
DISPLAY_SCREEN_MATERIAL = "Display_Screen"   # picture surfaces of the Display atlas: base colour only
DISPLAY_HOSE_U_MIN = 0.8                      # atlas columns right of this hold the ribbed hose strip
# Display hose (route_display_hose). bore_xy: axis of the SCREEN CONNECTION elbow's
# opening in Chassis.glb coordinates (m), bore_axis: its direction (index of the
# coordinate; +z there is world DOWN), bore_radius: the opening's inner radius,
# mouth: the plane of the opening along bore_axis. Measured 2026-11-13 from the
# opening's own inner circle in the delivery Chassis.glb (elbow component: bbox
# x 0.5275..0.5787, y 0.4329..0.5089, mouth plane z -0.4235; inner circle there
# x 0.5387..0.5723, y 0.4536..0.4882 -> centre (0.5555, 0.4709), radius 17 mm). The
# 2026-11-12 value (0.5529, 0.4705) was the centre of the elbow's BOUNDING BOX,
# which includes the mounting flange on the wall side.
# insert_m: how far the hose reaches into the elbow (as delivered). length_m: the
# hose's length -- the one design choice; 0.40 hangs 60 mm below the mouth with a
# 49 mm tightest bend (Maksim's sketch, 2026-11-13; the delivered hose is 546 mm
# and hung 160 mm). straight_*_m: the lengths the two fittings hold straight.
# gravity: weight against stiffness (dimensionless, hardly matters at this length).
# sides / ring_step_m: the tube's resolution.
DISPLAY_HOSE = {"Display.glb": {"link": "display_link", "parent": "chassis_link", "bore_xy": (0.5555, 0.4709), "bore_axis": 2,
                                "bore_radius": 0.017, "mouth": -0.4235, "insert_m": 0.0188, "length_m": 0.40,
                                "straight_display_m": 0.018, "straight_elbow_m": 0.027, "gravity": 2.0,
                                "sides": 20, "ring_step_m": 0.004}}
# Per-set cache-bust on top of TEX_VERSION: bump a set here when only ITS PNGs changed,
# so only the GLBs that use it get new URIs (the others stay byte-identical).
SET_VERSION = {
    "Display_Atlas": "5",  # 5 = 2026-11-12 Display (6).rar: ribbed hose strip added to the base colour + first Metallic/Roughness/Normal
}


def tex_version(stem):
    return SET_VERSION.get(stem, TEX_VERSION)


# Material renames so the viewer classifies them right (see module docstring).
RENAME = {"PrintedMetal": "PrintedMetal_Atlas", "Glass": "Chamber Window Glass"}
GLASS_MATERIAL = "Glass"

STRIP_NODE_TRANSLATION = {"Feeder.glb", "Z.glb"}

# 2026-11-09: the Front Door export gives the INNER window pane the plastic
# material (a 1375 cm^2 sheet ~80 mm behind the glass, where the original CAD
# door had its second transmissive pane), so the chamber reads as a dark slab
# through the window. Triangles of non-glass primitives whose centroid lies inside
# the glass pane's footprint and deeper than `min_depth_m` behind it are moved to
# the glass material. Fix the material in Blender to make this rule a no-op.
# DISABLED 2026-11-09 after checking in the viewer: the "sheet" behind the pane is
# the door's inner skin drawn with a few door-sized triangles (their centroids fall
# inside the footprint), not a second pane -- reassigning them turned the whole
# inner skin into glass. Kept as an opt-in for a future export that really has an
# inner pane on the wrong material.
REASSIGN_TO_GLASS = {}

# 2026-11-09: the Front_Door export's OUTER skin (a 6 mm sheet ~84 mm in front of
# the recessed 16 mm glass pane) is continuous across the window, so the chamber
# cannot be seen; behind the glass the chamber is open to the back wall. Cut the
# pane's footprint out of skin triangles lying 0.03..0.12 m in front of the pane
# (glb_window_cut.py). Fix the hole in Blender to make this a no-op.
CUT_WINDOW = {"Front_Door.glb": {"y_band": (0.03, 0.12)}}

# 2026-11-09: the wire COIL of each spool is a flat-colour patch of a metal atlas
# (copper for "Spool Cooper", steel for "Spool Stainless Steel"). The viewer now
# tints the coil from the material LOADED in the Materials menu, so both coils
# must start from the same neutral steel texel: move the copper coil's primitive
# onto Metal_Atlas_01 and shift its UVs from the copper patch (u .099-.338,
# v .034-.455 of atlas 02) onto the steel patch (u .644-.884, v .542-.964 of
# atlas 01) -- same footprint, pure offset. Blue plastic flanges untouched.
NEUTRAL_COIL = {"Spool Cooper.glb": {"from": "Metal_Atlas_02", "to": "Metal_Atlas_01", "uv_offset": (0.5455, 0.5085)}}

# (delivery file, output stem, URDF links that use it, current asset for the check)
# Output file = "<stem><suffix>.glb". Links not in the URDF (Locking Mechanism Base) get
# the file built but no URDF change.
PARTS = [
    ("Chassis.glb", "Chassis", ["chassis_link"], "Chassis_light.glb"),
    ("Front_Door.glb", "Front Door", ["front_door_link"], "Front Door_2210.glb"),
    ("Spools_Door.glb", "Spools Door", ["spools_door_link"], "Spools Door_2210.glb"),
    ("Top_Cover.glb", "Top Cover", ["top_cover_link"], "Top Cover_2210.glb"),
    ("GasSpringMainPart.glb", "Gas Spring Main Part", ["gas_spring_main_part_left_link", "gas_spring_main_part_right_link"], "Gas Spring Main Part_2210.glb"),
    ("GasSpringSecondaryPart.glb", "Gas Spring Secondary Part", ["gas_spring_secondary_part_left_link", "gas_spring_secondary_part_right_link"], "Gas Spring Secondary Part_2210.glb"),
    ("Palpador Pro.glb", "Palpador PRO", ["palpador_pro_link"], "Palpador PRO_2509.glb"),
    ("WireDrum_Door.glb", "Wire Drum Door", ["wire_spool_door_link"], "Wire Drum Door_2210.glb"),
    ("Wire_Drum.glb", "Wire Drum", ["wire_drum_link"], "Wire Drum_2210.glb"),
    ("Handle.glb", "Handle", ["handle_link"], "Handle_2210.glb"),
    ("User_Step.glb", "User Step", ["user_step_link"], "User Step_2509.glb"),
    ("Z.glb", "Z axis", ["z_axis_link"], "Z axis_2509.glb"),
    ("X.glb", "Eje X", ["eje_x_link"], "Eje X_2509.glb"),
    ("Y.glb", "Eje Y", ["eje_y_link"], "Eje Y_2509.glb"),
    ("Spool Cooper.glb", "Spool Cooper", ["spool_1_link"], "Spool Cooper_2509.glb"),
    ("Spool Stainless Steel.glb", "Spool Stainless Steel", ["spool_2_link"], "Spool Stainless Steel_2509.glb"),
    ("Display.glb", "Display", ["display_link"], "Display_2210.glb"),
    ("Head.glb", "Head", ["head_link"], "Head_2509.glb"),
    ("Feeder.glb", "Feeder", ["feeder_link"], "Feeder_2509.glb"),
    ("Central Feeder Wheel.glb", "Central Feeder Wheel", ["central_feeder_wheel_link", "left_feeder_wheel_link", "right_feeder_wheel_link"], "Central Feeder Wheel_2509.glb"),
    ("HRS050-AF-20.glb", "HRS050-AF-20", [], "HRS050-AF-20_2509.glb"),  # chiller: CHILLER_MODEL_URL in urdf_viewer.js
    ("Locking Mechanism Base.glb", "Locking Mechanism Base", [], None),
]


# ---------------------------------------------------------------- GLB I/O
def read_glb(path):
    d = open(path, "rb").read()
    assert d[:4] == b"glTF", path
    ln = struct.unpack("<I", d[12:16])[0]
    j = json.loads(d[20:20 + ln])
    off = 20 + ln
    bl, bt = struct.unpack("<II", d[off:off + 8])
    assert bt == 0x004E4942
    return j, d[off + 8:off + 8 + bl]


def write_glb(path, j, binchunk):
    js = json.dumps(j, separators=(",", ":")).encode("utf-8")
    js += b" " * ((4 - len(js) % 4) % 4)
    b = binchunk + b"\x00" * ((4 - len(binchunk) % 4) % 4)
    with open(path, "wb") as h:
        h.write(b"glTF" + struct.pack("<II", 2, 12 + 8 + len(js) + 8 + len(b)))
        h.write(struct.pack("<II", len(js), 0x4E4F534A) + js)
        h.write(struct.pack("<II", len(b), 0x004E4942) + b)


def node_matrix(n):
    if "matrix" in n:
        return np.array(n["matrix"], dtype=np.float64).reshape(4, 4).T
    t = np.array(n.get("translation", [0, 0, 0]), dtype=np.float64)
    x, y, z, w = n.get("rotation", [0, 0, 0, 1])
    R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                  [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                  [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
    s = np.array(n.get("scale", [1, 1, 1]), dtype=np.float64)
    M = np.eye(4)
    M[:3, :3] = R * s
    M[:3, 3] = t
    return M


def positions(j, binchunk):
    """Scene-root vertex positions with node transforms applied (what the viewer sees)."""
    mesh_pts = {}
    for mi, m in enumerate(j["meshes"]):
        pts = []
        for p in m["primitives"]:
            a = j["accessors"][p["attributes"]["POSITION"]]
            bv = j["bufferViews"][a["bufferView"]]
            off = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
            stride = bv.get("byteStride", 12)
            raw = np.frombuffer(binchunk, dtype=np.uint8, count=stride * a["count"], offset=off)
            pts.append(np.lib.stride_tricks.as_strided(raw.view(np.float32), (a["count"], 3), (stride, 4)).astype(np.float64))
        mesh_pts[mi] = np.concatenate(pts)
    out = []

    def walk(ni, parent):
        n = j["nodes"][ni]
        M = parent @ node_matrix(n)
        if "mesh" in n:
            out.append(mesh_pts[n["mesh"]] @ M[:3, :3].T + M[:3, 3])
        for c in n.get("children", []):
            walk(c, M)

    roots = j["scenes"][j.get("scene", 0)]["nodes"] if j.get("scenes") else range(len(j["nodes"]))
    for r in roots:
        walk(r, np.eye(4))
    return np.concatenate(out)


# ---------------------------------------------------------------- textures
def downscale(img, size):
    return img if img.size == (size, size) else img.resize((size, size), Image.LANCZOS)


def build_textures(src, assets):
    tex_dst = os.path.join(assets, "Textures")
    tex_4k = os.path.join(tex_dst, "4k")
    os.makedirs(tex_4k, exist_ok=True)
    for stem in PBR_SETS.values():
        folder = os.path.join(src, "Textures", stem)
        bc = Image.open(os.path.join(folder, f"{stem}_BaseColor.png")).convert("RGB")
        nm = Image.open(os.path.join(folder, f"{stem}_Normal.png")).convert("RGB")
        me = Image.open(os.path.join(folder, f"{stem}_Metallic.png")).convert("L")
        ro = Image.open(os.path.join(folder, f"{stem}_Roughness.png")).convert("L")
        packed = Image.merge("RGB", (Image.new("L", me.size, 255), ro, me))  # glTF: G=rough, B=metal
        shutil.copyfile(os.path.join(folder, f"{stem}_BaseColor.png"), os.path.join(tex_4k, f"{stem}_BaseColor.png"))
        shutil.copyfile(os.path.join(folder, f"{stem}_Normal.png"), os.path.join(tex_4k, f"{stem}_Normal.png"))
        packed.save(os.path.join(tex_4k, f"{stem}_MetallicRoughness.png"), optimize=True)
        downscale(bc, WORK).save(os.path.join(tex_dst, f"{stem}_BaseColor.png"), optimize=True)
        downscale(nm, WORK).save(os.path.join(tex_dst, f"{stem}_Normal.png"), optimize=True)
        downscale(packed, WORK).save(os.path.join(tex_dst, f"{stem}_MetallicRoughness.png"), optimize=True)
        print(f"textures: {stem} -> 2K (+4k originals)")


# ---------------------------------------------------------------- GLB rewrite
def add_textures(j, uris):
    j["images"] = j.get("images", [])
    j["textures"] = j.get("textures", [])
    if "samplers" not in j:
        j["samplers"] = [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}]
    idx = []
    for uri in uris:
        j["images"].append({"uri": uri, "mimeType": "image/png"})
        j["textures"].append({"sampler": 0, "source": len(j["images"]) - 1})
        idx.append(len(j["textures"]) - 1)
    return idx


def rewrite_materials(j):
    # Drop whatever the exporter embedded (e.g. the chassis' PrintedMetal normal map):
    # every texture is re-bound to the external 2K set below.
    j["images"] = []
    j["textures"] = []
    j.setdefault("extensionsUsed", [])
    for mat in j.get("materials", []):
        name = mat.get("name", "")
        pbr = mat.setdefault("pbrMetallicRoughness", {})
        mat.pop("normalTexture", None)
        pbr.pop("baseColorTexture", None)
        pbr.pop("metallicRoughnessTexture", None)
        if name in PBR_SETS:
            stem = PBR_SETS[name]
            ver = tex_version(stem)
            bc, mr, nm = add_textures(j, [f"Textures/{stem}_BaseColor.png?v={ver}",
                                          f"Textures/{stem}_MetallicRoughness.png?v={ver}",
                                          f"Textures/{stem}_Normal.png?v={ver}"])
            pbr.update({"baseColorFactor": [1, 1, 1, 1], "metallicFactor": 1, "roughnessFactor": 1,
                        "baseColorTexture": {"index": bc}, "metallicRoughnessTexture": {"index": mr}})
            mat["normalTexture"] = {"index": nm, "scale": 1}
            mat["doubleSided"] = True
        elif name == DISPLAY_SCREEN_MATERIAL:
            (bc,) = add_textures(j, [f"Textures/{DISPLAY_SET}_BaseColor.png?v={tex_version(DISPLAY_SET)}"])
            pbr.update({"baseColorFactor": [1, 1, 1, 1], "metallicFactor": 0, "roughnessFactor": 0.5,
                        "baseColorTexture": {"index": bc}})
        elif name == GLASS_MATERIAL:
            mat["alphaMode"] = "BLEND"
            mat["doubleSided"] = True
            pbr.update({"baseColorFactor": [0.86, 0.92, 0.96, 1.0], "metallicFactor": 0, "roughnessFactor": 0.05})
            mat["extensions"] = {"KHR_materials_transmission": {"transmissionFactor": 1},
                                 "KHR_materials_specular": {"specularColorFactor": [2.0, 2.0, 2.0]}}
            for ext in ("KHR_materials_transmission", "KHR_materials_specular"):
                if ext not in j["extensionsUsed"]:
                    j["extensionsUsed"].append(ext)
        else:
            raise SystemExit(f"unhandled material {name!r}")
        if name in RENAME:
            mat["name"] = RENAME[name]
    if not j["extensionsUsed"]:
        del j["extensionsUsed"]
    if not j["images"]:
        del j["images"]
        del j["textures"]
        j.pop("samplers", None)


def strip_node_translation(j):
    for n in j["nodes"]:
        n.pop("translation", None)


def _read_accessor(j, b, ai):
    a = j["accessors"][ai]
    bv = j["bufferViews"][a["bufferView"]]
    off = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
    ncomp = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[a["type"]]
    dt = {5121: np.uint8, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}[a["componentType"]]
    stride = bv.get("byteStride", ncomp * np.dtype(dt).itemsize)
    raw = np.frombuffer(b, dtype=np.uint8, count=stride * a["count"], offset=off)
    return np.lib.stride_tricks.as_strided(raw.view(dt), (a["count"], ncomp), (stride, np.dtype(dt).itemsize)).copy()


def _append_index_accessor(j, b, indices):
    """Append a uint32 SCALAR index accessor to the bin chunk; returns (accessor id, new bin)."""
    data = np.ascontiguousarray(indices.astype(np.uint32)).tobytes()
    pad = b"\x00" * ((4 - len(b) % 4) % 4)
    b = b + pad
    j["bufferViews"].append({"buffer": 0, "byteOffset": len(b), "byteLength": len(data), "target": 34963})
    b = b + data
    j["accessors"].append({"bufferView": len(j["bufferViews"]) - 1, "componentType": 5125, "count": int(len(indices)),
                           "type": "SCALAR", "min": [int(indices.min())], "max": [int(indices.max())]})
    j["buffers"][0]["byteLength"] = len(b)
    return len(j["accessors"]) - 1, b


def _write_accessor_rows(j, ba, ai, rows, values):
    """Overwrite rows of a float32 VEC3 accessor inside the (bytearray) bin chunk."""
    a = j["accessors"][ai]
    bv = j["bufferViews"][a["bufferView"]]
    assert a["componentType"] == 5126 and a["type"] == "VEC3"
    off = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
    stride = bv.get("byteStride", 12)
    data = np.asarray(values, dtype="<f4")
    for row, v in zip(rows, data):
        ba[off + int(row) * stride: off + int(row) * stride + 12] = v.tobytes()


def _rigid(xyz, rpy):
    m = np.eye(4)
    m[:3, :3] = rot_xyz(*rpy)
    m[:3, 3] = xyz
    return m


def urdf_frames(urdf_text, link, parent):
    """(joint xyz, joint rpy, visual xyz, visual rpy of `link`, visual xyz, visual rpy of `parent`)."""
    def visual(name):
        m = re.search(r'<link name="%s">\s*<visual>\s*<origin xyz="([^"]+)" rpy="([^"]+)"/>' % re.escape(name), urdf_text)
        return [float(x) for x in m.group(1).split()], [float(x) for x in m.group(2).split()]
    jm = re.search(r'<parent link="%s"/>\s*<child link="%s"/>\s*<origin xyz="([^"]+)" rpy="([^"]+)"/>' % (re.escape(parent), re.escape(link)), urdf_text)
    j_xyz, j_rpy = [float(x) for x in jm.group(1).split()], [float(x) for x in jm.group(2).split()]
    return (j_xyz, j_rpy) + tuple(visual(link)) + tuple(visual(parent))


def _append_float_accessor(j, b, data, kind, with_bounds=False):
    """Append a float32 vertex accessor (kind "VEC2" / "VEC3") to the bin chunk; returns (accessor id, new bin)."""
    arr = np.ascontiguousarray(data, dtype="<f4")
    payload = arr.tobytes()
    b = b + bytes((4 - len(b) % 4) % 4)
    j["bufferViews"].append({"buffer": 0, "byteOffset": len(b), "byteLength": len(payload), "target": 34962})
    b = b + payload
    acc = {"bufferView": len(j["bufferViews"]) - 1, "componentType": 5126, "count": int(len(arr)), "type": kind}
    if with_bounds:
        acc["min"], acc["max"] = [float(x) for x in arr.min(0)], [float(x) for x in arr.max(0)]
    j["accessors"].append(acc)
    j["buffers"][0]["byteLength"] = len(b)
    return len(j["accessors"]) - 1, b


def route_display_hose(j, b, urdf_text, spec):
    """Replace the delivered display hose by one routed between its two fittings (see module docstring).

    The delivered hose (the triangles of the Display atlas primitive that lie in the
    hose strip) is measured and then dropped from that primitive; the new hose is
    appended as a primitive of its own on the same material, so
    split_display_surfaces still finds it by its UVs. Returns (bin, report string).
    """
    import sys as _sys
    if HERE not in _sys.path:
        _sys.path.insert(0, HERE)  # python -I does not add the script dir
    from display_hose import centreline, tube

    j_xyz, j_rpy, v_xyz, v_rpy, c_xyz, c_rpy = urdf_frames(urdf_text, spec["link"], spec["parent"])
    node = np.eye(4)
    for n in j.get("nodes", []):
        if "mesh" in n:
            node = node_matrix(n)
            break
    M = _rigid(j_xyz, j_rpy) @ _rigid(v_xyz, v_rpy) @ node   # display mesh -> parent link, as the URDF places it
    C = _rigid(c_xyz, c_rpy)                                 # chassis mesh -> parent link
    G = np.linalg.inv(C) @ M                                 # display mesh -> Chassis.glb coordinates
    Gi = np.linalg.inv(G)
    ax = spec["bore_axis"]
    assert ax == 2, "display hose: the routing assumes the elbow's bore runs along z (world vertical)"
    plane = [0, 1]
    bore = np.array(spec["bore_xy"])

    names = [m.get("name") for m in j.get("materials", [])]
    atlas_mat = names.index(DISPLAY_SET)
    mesh, prim = next((m, p) for m in j["meshes"] for p in m["primitives"] if p.get("material") == atlas_mat)
    pos = _read_accessor(j, b, prim["attributes"]["POSITION"]).astype(np.float64)
    uv = _read_accessor(j, b, prim["attributes"]["TEXCOORD_0"]).astype(np.float64)
    tris_all = _read_accessor(j, b, prim["indices"]).reshape(-1, 3).astype(np.int64)
    is_hose = uv[tris_all][:, :, 0].mean(1) >= DISPLAY_HOSE_U_MIN
    tris = tris_all[is_hose]
    rows = np.unique(tris)                                   # GLB vertices of the delivered hose
    key = np.round(pos[rows] / 1e-5).astype(np.int64)
    _, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    lut = np.full(len(pos), -1, np.int64)
    lut[rows] = inv.reshape(-1)
    wtris = lut[tris]
    wpos = (np.c_[pos[rows][first], np.ones(len(first))] @ G.T)[:, :3]   # welded, in Chassis.glb coordinates

    # open ends = boundary loops (edges used by one triangle)
    e = np.sort(np.concatenate([wtris[:, [0, 1]], wtris[:, [1, 2]], wtris[:, [2, 0]]]), axis=1)
    ue, cnt = np.unique(e, axis=0, return_counts=True)
    adj_all = [[] for _ in range(len(wpos))]
    for a, c in ue:
        adj_all[a].append(c)
        adj_all[c].append(a)
    badj = {}
    for a, c in ue[cnt == 1]:
        badj.setdefault(int(a), []).append(int(c))
        badj.setdefault(int(c), []).append(int(a))
    loops, seen = [], set()
    for v in badj:
        if v in seen:
            continue
        comp, stack = [], [v]
        while stack:
            x = stack.pop()
            if x in seen:
                continue
            seen.add(x)
            comp.append(x)
            stack.extend(badj[x])
        loops.append(np.array(comp))
    assert len(loops) == 2, f"display hose: expected 2 open ends, found {len(loops)}"
    chassis_end = int(np.argmin([np.linalg.norm(wpos[lp].mean(0)[plane] - bore) for lp in loops]))
    start, end = loops[1 - chassis_end], loops[chassis_end]

    # rings: breadth-first layers from the display end
    layer = np.full(len(wpos), -1, np.int64)
    layer[start] = 0
    frontier, k = list(start), 0
    while frontier:
        k += 1
        nxt = []
        for v in frontier:
            for u in adj_all[v]:
                if layer[u] < 0:
                    layer[u] = k
                    nxt.append(u)
        frontier = nxt
    K = int(layer.max())
    assert (layer >= 0).all() and set(layer[end]) == {K}, "display hose: rings are not a simple tube"
    cents = np.array([wpos[layer == i].mean(0) for i in range(K + 1)])
    delivered_length = float(np.linalg.norm(np.diff(cents, axis=0), axis=1).sum())
    assert cents[max(K - 3, 0)][ax] > cents[K][ax], "display hose: expected the hose to leave the elbow toward +z (down)"

    # what the new hose takes over from the delivered one
    a_end = cents[0]
    a_dir = np.linalg.svd(wpos[layer == 0] - a_end)[2][2]    # the display-side end ring's plane normal ...
    if float(a_dir @ (cents[1] - cents[0])) < 0:
        a_dir = -a_dir                                       # ... pointing into the hose
    radius = float(np.linalg.norm(wpos[layer == 0] - a_end, axis=1).mean())
    ring_of_row = layer[lut[rows]]
    u_lo, u_hi = float(uv[rows][:, 0].min()), float(uv[rows][:, 0].max())
    v_a = float(uv[rows[ring_of_row == 0]][:, 1].mean())
    v_b = float(uv[rows[ring_of_row == K]][:, 1].mean())
    v_per_m = (v_b - v_a) / delivered_length                 # texture per metre, as delivered

    b_end = np.array([bore[0], bore[1], spec["mouth"] - spec["insert_m"]])
    pts, arc, stats = centreline(a_end, a_dir, b_end, spec["length_m"], spec["straight_display_m"],
                                 spec["straight_elbow_m"], spec["gravity"])
    p_c, n_c, uv_new, idx_new = tube(pts, arc, radius, spec["sides"], spec["ring_step_m"], u_lo, u_hi, v_a, v_per_m,
                                     a_dir, np.array([0.0, 0.0, -1.0]))
    p_new = (np.c_[p_c, np.ones(len(p_c))] @ Gi.T)[:, :3]
    n_new = n_c @ Gi[:3, :3].T
    n_new /= np.maximum(np.linalg.norm(n_new, axis=1, keepdims=True), 1e-12)

    # the old primitive keeps its picture surfaces; its hose vertices are parked on a
    # vertex that stays in use, so the accessor's bounds describe what is drawn
    rest = tris_all[~is_hose]
    assert len(rest), "display hose: the atlas primitive holds nothing but the hose"
    keep_idx, b = _append_index_accessor(j, b, rest.reshape(-1))
    prim["indices"] = keep_idx
    orphans = np.setdiff1d(rows, np.unique(rest))
    ba = bytearray(b)
    _write_accessor_rows(j, ba, prim["attributes"]["POSITION"], orphans, np.repeat(pos[rest[0, 0]][None, :], len(orphans), axis=0))
    b = bytes(ba)
    allpos = _read_accessor(j, b, prim["attributes"]["POSITION"])
    acc = j["accessors"][prim["attributes"]["POSITION"]]
    acc["min"], acc["max"] = [float(x) for x in allpos.min(0)], [float(x) for x in allpos.max(0)]

    a_pos, b = _append_float_accessor(j, b, p_new, "VEC3", with_bounds=True)
    a_nrm, b = _append_float_accessor(j, b, n_new, "VEC3")
    a_uv, b = _append_float_accessor(j, b, uv_new, "VEC2")
    a_idx, b = _append_index_accessor(j, b, idx_new.reshape(-1))
    mesh["primitives"].append({"attributes": {"POSITION": a_pos, "NORMAL": a_nrm, "TEXCOORD_0": a_uv},
                               "indices": a_idx, "material": atlas_mat})

    rings = len(p_c) // (spec["sides"] + 1)
    report = ("hose: routed between its fittings, %d rings x %d sides (%d tris), %.0f mm long (delivered: %d rings x 12, %.0f mm)"
              % (rings, spec["sides"], len(idx_new), spec["length_m"] * 1000, K + 1, delivered_length * 1000))
    report += ("\n    hangs %.0f mm below the elbow's mouth, tightest bend %.0f mm | elbow end %.2f mm off the bore axis,"
               " %.1f mm inside | hose radius %.1f mm in an opening of %.1f mm | solver: end %.1e m, gradient %.1e"
               % ((stats["lowest_z"] - spec["mouth"]) * 1000, stats["min_bend_radius"] * 1000,
                  np.linalg.norm(pts[-1][plane] - bore) * 1000, (spec["mouth"] - pts[-1][ax]) * 1000,
                  radius * 1000, spec["bore_radius"] * 1000, stats["closure_error"], stats["gradient"]))
    report += ("\n    texture: %.5f v per mm everywhere (as delivered), v %.3f at the display -> %.3f at the elbow, u %.4f..%.4f"
               % (abs(v_per_m) / 1000, v_a, v_a + spec["length_m"] * v_per_m, u_lo, u_hi))
    return b, report


def split_display_surfaces(j, b):
    """Display atlas: picture surfaces -> Display_Screen, ribbed hose stays Display_Atlas.

    A triangle belongs to the hose when its UV centroid lies in the strip
    u >= DISPLAY_HOSE_U_MIN. A file without hose triangles only gets its material
    renamed; otherwise the primitive is split in two (same vertex attributes, two
    index accessors). Returns (bin, picture tris, hose tris).
    """
    mats = j.get("materials", [])
    names = [m.get("name") for m in mats]
    if DISPLAY_SET not in names:
        return b, 0, 0
    atlas_mat = names.index(DISPLAY_SET)
    work = []
    for m in j["meshes"]:
        for p in m["primitives"]:
            if p.get("material") != atlas_mat:
                continue
            uv = _read_accessor(j, b, p["attributes"]["TEXCOORD_0"]).astype(np.float64)
            tris = _read_accessor(j, b, p["indices"]).reshape(-1, 3)
            hose = uv[tris][:, :, 0].mean(1) >= DISPLAY_HOSE_U_MIN
            work.append((m, p, tris, hose))
    n_hose = sum(int(h.sum()) for _, _, _, h in work)
    n_pic = sum(int((~h).sum()) for _, _, _, h in work)
    if n_hose == 0:
        mats[atlas_mat]["name"] = DISPLAY_SCREEN_MATERIAL
        return b, n_pic, 0
    if n_pic == 0:
        return b, 0, n_hose
    mats.append({"name": DISPLAY_SCREEN_MATERIAL, "pbrMetallicRoughness": {}})
    screen_mat = len(mats) - 1
    for m, p, tris, hose in work:
        if not (~hose).any():
            continue
        if not hose.any():
            p["material"] = screen_mat
            continue
        keep_idx, b = _append_index_accessor(j, b, tris[hose].reshape(-1))
        move_idx, b = _append_index_accessor(j, b, tris[~hose].reshape(-1))
        p["indices"] = keep_idx
        picture = dict(p)
        picture["indices"] = move_idx
        picture["material"] = screen_mat
        m["primitives"].append(picture)
    return b, n_pic, n_hose


def reassign_pane_backing_to_glass(j, b, min_depth_m):
    """Move triangles hiding behind the glass pane into the glass material (see REASSIGN_TO_GLASS)."""
    glass_mat = next((i for i, m in enumerate(j["materials"]) if m.get("name") == GLASS_MATERIAL), None)
    if glass_mat is None:
        return b, 0
    glass_prims = [p for m in j["meshes"] for p in m["primitives"] if p.get("material") == glass_mat]
    if not glass_prims:
        return b, 0
    G = np.concatenate([_read_accessor(j, b, p["attributes"]["POSITION"]) for p in glass_prims]).astype(np.float64)
    gmin, gmax = G.min(0), G.max(0)
    depth_axis = int(np.argmin(gmax - gmin))
    moved_total = 0
    for m in j["meshes"]:
        new_prims = []
        for p in list(m["primitives"]):
            if p.get("material") == glass_mat or "indices" not in p:
                continue
            P = _read_accessor(j, b, p["attributes"]["POSITION"]).astype(np.float64)
            I = _read_accessor(j, b, p["indices"]).reshape(-1)
            tris = I.reshape(-1, 3)
            c = P[tris].mean(1)
            inside = np.ones(len(c), bool)
            for ax in range(3):
                if ax == depth_axis:
                    continue
                inside &= (c[:, ax] > gmin[ax] + 0.005) & (c[:, ax] < gmax[ax] - 0.005)
            # "behind" = away from the pane along its normal; both signs are tried
            # and the side that holds the bulk of the far geometry is taken.
            d_pos = c[:, depth_axis] - gmax[depth_axis]
            d_neg = gmin[depth_axis] - c[:, depth_axis]
            behind = inside & ((d_pos > min_depth_m) | (d_neg > min_depth_m))
            if not behind.any():
                continue
            moved_total += int(behind.sum())
            keep_idx, b = _append_index_accessor(j, b, tris[~behind].reshape(-1))
            move_idx, b = _append_index_accessor(j, b, tris[behind].reshape(-1))
            p["indices"] = keep_idx
            glass_p = dict(p)
            glass_p["indices"] = move_idx
            glass_p["material"] = glass_mat
            new_prims.append(glass_p)
        m["primitives"].extend(new_prims)
    return b, moved_total


# ---------------------------------------------------------------- placement
def rot_xyz(r, p, y):
    """THREE Euler XYZ as the viewer applies URDF rpy: Rx * Ry * Rz."""
    cx, sx, cy, sy, cz, sz = np.cos(r), np.sin(r), np.cos(p), np.sin(p), np.cos(y), np.sin(y)
    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    Rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return Rx @ Ry @ Rz


def nn_dist(a, b, n=400):
    rng = np.random.default_rng(0)
    sa = a[rng.choice(len(a), min(n, len(a)), replace=False)]
    d = np.sqrt(((sa[:, None, :] - b[None, :, :]) ** 2).sum(-1)).min(1)
    return d.mean(), d.max()


def urdf_visuals(urdf_text):
    out = {}
    for m in re.finditer(r'<link name="([^"]+)">\s*<visual>\s*<origin xyz="([^"]+)" rpy="([^"]+)"/>\s*<geometry>\s*<mesh filename="([^"]+)" scale="([^"]+)"', urdf_text):
        out[m.group(1)] = (tuple(float(x) for x in m.group(3).split()), m.group(4), float(m.group(5).split()[0]))
    return out


def build_glbs(src, assets, suffix, write=True):
    urdf = open(os.path.join(assets, "M600_PRO.urdf"), encoding="utf-8").read()
    visuals = urdf_visuals(urdf)
    for src_name, stem, links, current in PARTS:
        j, b = read_glb(os.path.join(src, "Meshes", src_name))
        if src_name in STRIP_NODE_TRANSLATION:
            strip_node_translation(j)
        moved = 0
        if src_name in REASSIGN_TO_GLASS:
            b, moved = reassign_pane_backing_to_glass(j, b, REASSIGN_TO_GLASS[src_name]["min_depth_m"])
        if src_name in CUT_WINDOW:
            import sys as _sys
            if HERE not in _sys.path:
                _sys.path.insert(0, HERE)  # python -I does not add the script dir
            from glb_window_cut import cut_window_opening
            b, _cut = cut_window_opening(j, b, GLASS_MATERIAL, CUT_WINDOW[src_name]["y_band"])
        if src_name in NEUTRAL_COIL:
            import sys as _sys
            if HERE not in _sys.path:
                _sys.path.insert(0, HERE)
            from glb_spool_coil import neutralize_coil
            spec = NEUTRAL_COIL[src_name]
            b, _moved = neutralize_coil(j, b, spec["from"], spec["to"], spec["uv_offset"])
        flex_report = None
        if src_name in DISPLAY_HOSE:
            b, flex_report = route_display_hose(j, b, urdf, DISPLAY_HOSE[src_name])
        b, _pic, _hose = split_display_surfaces(j, b)
        rewrite_materials(j)
        out = f"{stem}{suffix}.glb"
        if write:
            write_glb(os.path.join(assets, out), j, b)
        tris = sum(j["accessors"][p["indices"]]["count"] // 3 for m in j["meshes"] for p in m["primitives"] if "indices" in p)
        line = f"{out:34s} tris={tris:7d} mats={[m['name'] for m in j['materials']]}"
        if moved:
            line += f"  [{moved} tris behind the window pane moved to glass]"
        if flex_report:
            line += f"\n    {flex_report}"
        if current and os.path.exists(os.path.join(assets, current)):
            link = links[0] if links else None
            rpy, _, scale = visuals[link] if link else ((0.0, 0.0, 0.0), None, 1.0)
            jo, bo = read_glb(os.path.join(assets, current))
            R = rot_xyz(*rpy)
            po = (positions(jo, bo) * scale) @ R.T
            pn = positions(j, b) @ R.T
            bb = np.abs(np.r_[po.min(0), po.max(0)] - np.r_[pn.min(0), pn.max(0)]).max() * 1000
            m_on, x_on = nn_dist(po, pn)
            m_no, x_no = nn_dist(pn, po)
            line += (f"\n    vs {current}: bbox d {bb:.1f} mm | old->new {m_on * 1000:.1f}/{x_on * 1000:.0f} mm"
                     f" | new->old {m_no * 1000:.1f}/{x_no * 1000:.0f} mm")
        elif not links:
            line += "\n    (no link in the URDF: built, not placed)"
        print(line)


def repoint_urdf(assets, suffix):
    path = os.path.join(assets, "M600_PRO.urdf")
    raw = open(path, "rb").read()
    eol = b"\r\n" if raw.count(b"\r\n") else b"\n"
    text = raw.decode("utf-8")
    visuals = urdf_visuals(text)
    for _, stem, links, _ in PARTS:
        for link in links:
            _, current_file, _ = visuals[link]
            old = f'<link name="{link}">'
            i = text.index(old)
            seg_end = text.index("</link>", i)
            seg = text[i:seg_end]
            new_seg = seg.replace(f'filename="{current_file}"', f'filename="{stem}{suffix}.glb"', 1)
            assert new_seg != seg, (link, current_file)
            text = text[:i] + new_seg + text[seg_end:]
    open(path, "wb").write(text.encode("utf-8").replace(b"\r\n", b"\n").replace(b"\n", eol))
    print("URDF repointed")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("mode", choices=["all", "textures", "glbs", "urdf", "check"])
    ap.add_argument("--src", default=DEFAULT_SRC)
    ap.add_argument("--assets", default=DEFAULT_ASSETS)
    ap.add_argument("--suffix", default="_2611")
    args = ap.parse_args()
    if args.mode in ("all", "textures"):
        build_textures(args.src, args.assets)
    if args.mode in ("all", "glbs"):
        build_glbs(args.src, args.assets, args.suffix)
    if args.mode == "check":
        build_glbs(args.src, args.assets, args.suffix, write=False)
    if args.mode in ("all", "urdf"):
        repoint_urdf(args.assets, args.suffix)
