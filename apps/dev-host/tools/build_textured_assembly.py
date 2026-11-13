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
  * Display hose (flex_display_hose): the ribbed hose in Display.glb is modelled for a
    display that stands VERTICAL, but the URDF tilts the display 4 deg back at
    display_joint (since 2026-05). Rigidly attached, the hose's chassis end swung
    53 mm sideways and stopped beside the SCREEN CONNECTION elbow instead of in its
    opening. The hose is therefore bent at build time: the display end keeps
    following the display, the chassis end is put where the delivery has it relative
    to the CHASSIS and centred on the elbow's bore, smooth blend in between. The tilt
    is read from the URDF, so changing it and re-running `glbs` re-bends the hose.
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
# Hose re-posing (flex_display_hose). bore_xy: axis of the SCREEN CONNECTION elbow's
# opening in Chassis.glb coordinates (m), bore_axis: its direction (index of the
# coordinate). Measured 2026-11-12 from the elbow's connected component in the
# delivery Chassis.glb (bbox x 0.5275..0.5787, y 0.4329..0.5089, mouth at z -0.4235).
HOSE_FLEX = {"Display.glb": {"link": "display_link", "parent": "chassis_link", "bore_xy": (0.5529, 0.4705), "bore_axis": 2}}
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


def flex_display_hose(j, b, urdf_text, spec):
    """Bend the display hose so its chassis end sits in the elbow (see module docstring).

    Frames (all in the parent link frame): M = display mesh as the URDF places it,
    M0 = the same with the joint rotation removed (the pose the hose was modelled
    for), C = chassis mesh. The chassis end of the hose must be at M0 * p (where the
    delivery has it relative to the chassis), moved sideways onto the bore axis; the
    display end must stay at M * p. Per ring: p' = (1-w) p + w L p with
    L = M^-1 Trans(delta) M0 and w a smoothstep of the arc length from the display end.
    Returns (bin, report string).
    """
    j_xyz, j_rpy, v_xyz, v_rpy, c_xyz, c_rpy = urdf_frames(urdf_text, spec["link"], spec["parent"])
    node = np.eye(4)
    for n in j.get("nodes", []):
        if "mesh" in n:
            node = node_matrix(n)
            break
    A = _rigid(v_xyz, v_rpy) @ node
    M = _rigid(j_xyz, j_rpy) @ A
    M0 = _rigid(j_xyz, (0.0, 0.0, 0.0)) @ A
    C = _rigid(c_xyz, c_rpy)

    names = [m.get("name") for m in j.get("materials", [])]
    atlas_mat = names.index(DISPLAY_SET)
    prim = next(p for m in j["meshes"] for p in m["primitives"] if p.get("material") == atlas_mat)
    pos = _read_accessor(j, b, prim["attributes"]["POSITION"]).astype(np.float64)
    nrm = _read_accessor(j, b, prim["attributes"]["NORMAL"]).astype(np.float64)
    uv = _read_accessor(j, b, prim["attributes"]["TEXCOORD_0"]).astype(np.float64)
    tris = _read_accessor(j, b, prim["indices"]).reshape(-1, 3).astype(np.int64)
    tris = tris[uv[tris][:, :, 0].mean(1) >= DISPLAY_HOSE_U_MIN]
    rows = np.unique(tris)                                   # GLB vertices of the hose
    key = np.round(pos[rows] / 1e-5).astype(np.int64)
    _, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    inv = inv.reshape(-1)
    wpos = pos[rows][first]                                  # welded positions
    lut = np.full(len(pos), -1, np.int64)
    lut[rows] = inv
    wtris = lut[tris]

    # open ends = boundary loops (edges used by one triangle)
    e = np.sort(np.concatenate([wtris[:, [0, 1]], wtris[:, [1, 2]], wtris[:, [2, 0]]]), axis=1)
    ue, cnt = np.unique(e, axis=0, return_counts=True)
    adj_all = [[] for _ in range(len(wpos))]
    for a, c in ue:
        adj_all[a].append(c)
        adj_all[c].append(a)
    bverts = np.unique(ue[cnt == 1])
    bset = set(int(v) for v in bverts)
    loops, seen = [], set()
    badj = {}
    for a, c in ue[cnt == 1]:
        badj.setdefault(int(a), []).append(int(c))
        badj.setdefault(int(c), []).append(int(a))
    for v in bset:
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

    def to_chassis_mesh(points_local, frame):
        ph = np.c_[points_local, np.ones(len(points_local))]
        return (ph @ (np.linalg.inv(C) @ frame).T)[:, :3]

    ax = spec["bore_axis"]
    plane = [i for i in range(3) if i != ax]
    bore = np.array(spec["bore_xy"])
    centres0 = [to_chassis_mesh(wpos[lp], M0).mean(0) for lp in loops]
    chassis_end = int(np.argmin([np.linalg.norm(c[plane] - bore) for c in centres0]))
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
    assert (layer >= 0).all() and set(layer[end]) == {layer.max()}, "display hose: rings are not a simple tube"
    cents = np.array([wpos[layer == i].mean(0) for i in range(layer.max() + 1)])
    arc = np.r_[0.0, np.cumsum(np.linalg.norm(np.diff(cents, axis=0), axis=1))]
    s = arc / arc[-1]
    w_ring = s * s * (3 - 2 * s)

    # sideways correction onto the bore axis, in chassis-mesh coordinates
    delta_c = np.zeros(3)
    delta_c[plane] = bore - centres0[chassis_end][plane]
    delta = (C[:3, :3] @ delta_c)                            # parent link frame
    T = np.eye(4)
    T[:3, 3] = delta
    L = np.linalg.inv(M) @ T @ M0

    w = w_ring[layer[lut[rows]]][:, None]
    p_old = pos[rows]
    p_new = (1 - w) * p_old + w * (np.c_[p_old, np.ones(len(rows))] @ L.T)[:, :3]
    n_old = nrm[rows]
    n_new = (1 - w) * n_old + w * (n_old @ L[:3, :3].T)
    n_new /= np.maximum(np.linalg.norm(n_new, axis=1, keepdims=True), 1e-12)

    ba = bytearray(b)
    _write_accessor_rows(j, ba, prim["attributes"]["POSITION"], rows, p_new)
    _write_accessor_rows(j, ba, prim["attributes"]["NORMAL"], rows, n_new)
    b = bytes(ba)
    allpos = _read_accessor(j, b, prim["attributes"]["POSITION"])
    acc = j["accessors"][prim["attributes"]["POSITION"]]
    acc["min"], acc["max"] = [float(x) for x in allpos.min(0)], [float(x) for x in allpos.max(0)]

    before = to_chassis_mesh(wpos[end], M).mean(0)
    lut_new = {int(r): i for i, r in enumerate(rows)}
    end_rows = [r for r in rows if lut[r] in set(int(v) for v in end)]
    after = to_chassis_mesh(p_new[[lut_new[int(r)] for r in end_rows]], M).mean(0)
    top_rows = [r for r in rows if lut[r] in set(int(v) for v in start)]
    moved_top = np.abs(p_new[[lut_new[int(r)] for r in top_rows]] - pos[top_rows]).max()
    report = ("hose: %d rings, %.0f mm long | chassis end off the bore axis %.1f mm -> %.1f mm (Chassis.glb coords %s -> %s) | display end moved %.2f mm"
              % (layer.max() + 1, arc[-1] * 1000, np.linalg.norm(before[plane] - bore) * 1000, np.linalg.norm(after[plane] - bore) * 1000,
                 np.round(before, 4), np.round(after, 4), moved_top * 1000))
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
        if src_name in HOSE_FLEX:
            b, flex_report = flex_display_hose(j, b, urdf, HOSE_FLEX[src_name])
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
