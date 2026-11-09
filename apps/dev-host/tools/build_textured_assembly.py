"""Bind a full textured M600 delivery (2026-11 "M600.rar" layout) into the viewer.

Delivery layout (Blender 3.6 export, textures loose):
    <src>/Meshes/<Part>.glb              material names, UVs, NO textures
    <src>/Textures/<Set>/<Set>_{BaseColor,Metallic,Roughness,Normal}.png   4096^2
    <src>/Textures/Display_Atlas/Display_Atlas_BaseColor.png                2048^2

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
    renamed PrintedMetal_Atlas; Display_Atlas is renamed Display_Screen (base colour
    only -- the atlas path would force metalness 1 without a metallic map); Glass
    becomes the Chamber Window Glass transmission pane (tools/bake_front_door_glass.py).
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
TEX_VERSION = "1"  # bump when a SAME-named PNG gets new content (browsers cache by URL)

# Full PBR sets: folder/stem under <src>/Textures. Material name -> stem (same here).
PBR_SETS = {
    "Metal_Atlas_01": "Metal_Atlas_01",
    "Metal_Atlas_02": "Metal_Atlas_02",
    "Plastic_Atlas_01": "Plastic_Atlas_01",
    "PrintedMetal": "PrintedMetal",
}
# Material renames so the viewer classifies them right (see module docstring).
RENAME = {"PrintedMetal": "PrintedMetal_Atlas", "Display_Atlas": "Display_Screen", "Glass": "Chamber Window Glass"}
DISPLAY_MATERIAL = "Display_Atlas"
DISPLAY_PNG = ("Display_Atlas", "Display_Atlas_BaseColor.png")
GLASS_MATERIAL = "Glass"

STRIP_NODE_TRANSLATION = {"Feeder.glb", "Z.glb"}

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
    folder, png = DISPLAY_PNG
    shutil.copyfile(os.path.join(src, "Textures", folder, png), os.path.join(tex_dst, png))
    print(f"textures: {png} copied")


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
            bc, mr, nm = add_textures(j, [f"Textures/{stem}_BaseColor.png?v={TEX_VERSION}",
                                          f"Textures/{stem}_MetallicRoughness.png?v={TEX_VERSION}",
                                          f"Textures/{stem}_Normal.png?v={TEX_VERSION}"])
            pbr.update({"baseColorFactor": [1, 1, 1, 1], "metallicFactor": 1, "roughnessFactor": 1,
                        "baseColorTexture": {"index": bc}, "metallicRoughnessTexture": {"index": mr}})
            mat["normalTexture"] = {"index": nm, "scale": 1}
            mat["doubleSided"] = True
        elif name == DISPLAY_MATERIAL:
            (bc,) = add_textures(j, [f"Textures/{DISPLAY_PNG[1]}?v={TEX_VERSION}"])
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
        rewrite_materials(j)
        out = f"{stem}{suffix}.glb"
        if write:
            write_glb(os.path.join(assets, out), j, b)
        tris = sum(j["accessors"][p["indices"]]["count"] // 3 for m in j["meshes"] for p in m["primitives"] if "indices" in p)
        line = f"{out:34s} tris={tris:7d} mats={[m['name'] for m in j['materials']]}"
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
