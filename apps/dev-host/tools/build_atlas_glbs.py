"""Bind Maksim's loose-texture Blender exports to the viewer's PBR atlases.

Usage (from anywhere; paths default to this repo's M600_PRO asset folder):

    python tools/build_atlas_glbs.py textures   # 2K working copies + 4K originals
    python tools/build_atlas_glbs.py glbs       # <Part>_<SUFFIX>.glb + placement check
    python tools/build_atlas_glbs.py urdf       # repoint M600_PRO.urdf
    python tools/build_atlas_glbs.py all        # the three in order
    python tools/build_atlas_glbs.py check      # placement check only (no writes)

    --src DIR     Blender export folder (default D:/UI_UX/M600 Pro_glb/glb_2_test_atlas)
    --assets DIR  viewer asset folder   (default ../assets/M600_PRO next to this file)
    --suffix S    output suffix         (default _2210)

What it does
  * Textures: Blender ships BaseColor / Metallic / Roughness / Normal as separate
    4096^2 PNGs in <src>/Texture. We keep the originals in Textures/4k/, pack
    Metallic+Roughness into one glTF metallicRoughness map (G=rough, B=metal) and
    downscale to 2048 for the HMI (the 2026-10-13 perf pass: 4K = 770 MB VRAM).
  * GLBs: the exports carry NO textures, only material names + UVs. The JSON chunk
    is rewritten so each material references the PNGs by relative URI (GLTFLoader
    resolves them against the GLB path). The viewer recognises atlas materials by
    NAME (urdf_viewer.js ATLAS_MATERIAL_NAME_RE) — filenames are free.
  * "Glass" -> "Chamber Window Glass" with KHR_materials_transmission, the same
    recipe as bake_front_door_glass.py, so tuneMaterial makes the cheap 0.18 pane.
  * Placement check: old and new vertices are rotated by their URDF visual rpy the
    way the viewer applies it (THREE Euler XYZ = Rx*Ry*Rz) and compared by bounding
    box + nearest-neighbour distance. Node transforms inside the GLB are applied
    (the Sep-2026 Top Cover carries a node rotation that the new export bakes into the
    vertices; comparing raw accessors suggested a bogus 90 deg fix on 2026-10-22).
    The live scene is the final arbiter: load old and new and diff `__links()`.

History: v1 (2026-10-13, Spools Door + Wire Drum Door) lived in a scratchpad and was
lost; this is the 2026-10-22 ten-part version, kept in the repo on purpose.
"""
import argparse
import json
import os
import shutil
import struct

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_SRC = "D:/UI_UX/M600 Pro_glb/glb_2_test_atlas"
DEFAULT_ASSETS = os.path.normpath(os.path.join(HERE, "..", "assets", "M600_PRO"))
WORK = 2048

# material name -> (basecolor, metallic, roughness, normal); None = reuse existing files
SETS = {
    "Test_Metal_Atlas": None,  # byte-identical to the Oct-13 delivery
    "Test_Metal_Atlas_02": ("Test_Metal_Atlas_2_BaseColor.png", "Test_Metal_Atlas_2_Metallic.png",
                            "Test_Metal_Atlas_2_Roughness.png", "Test_Metal_Atlas_2Normal.png"),
    "Test_Plastic_Atlas": ("Test_Plastic_Atlas_BaseColor.png", "Test_Plastic_Atlas_Metallic.png",
                           "Test_Plastic_Atlas_Roughness.png", "Test_Plastic_Atlas_Normal.png"),
}
OUT_STEM = {"Test_Metal_Atlas": "Test_Metal_Atlas", "Test_Metal_Atlas_02": "Test_Metal_Atlas_2",
            "Test_Plastic_Atlas": "Test_Plastic_Atlas"}
# Cache-bust per set: bump when the SAME filename gets new content (browsers cache by URL).
VERSION = {"Test_Metal_Atlas": "2k", "Test_Metal_Atlas_02": "2k", "Test_Plastic_Atlas": "2k2"}
DISPLAY_SRC = "Test_Display.png"
DISPLAY_DST = "Test_Display_BaseColor.png"

PI, HPI = 3.141593, 1.570796
# (source glb, output stem, current asset for the placement check, current rpy, new rpy)
PARTS = [
    ("Display.glb", "Display", "Display.glb", (HPI, 0, -PI), None),
    ("Front_Door.glb", "Front Door", "Front Door.glb", (HPI, 0, -PI), None),
    ("GasSpringMainPart.glb", "Gas Spring Main Part", "Gas Spring Main Part Left.glb", (HPI, 0, -PI), None),
    ("GasSpringSecondaryPart.glb", "Gas Spring Secondary Part", "Gas Spring Secondary Part Left.glb", (HPI, 0, -PI), None),
    ("Handle.glb", "Handle", "Handle.glb", (HPI, 0, -PI), None),
    ("Locking Mechanism Base.glb", "Locking Mechanism Base", None, None, None),  # no link yet
    ("Spools Door.glb", "Spools Door", "Spools Door_atlas.glb", (HPI, 0, -PI), None),
    ("Top Cover.glb", "Top Cover", "Top Cover.glb", (-PI, 0, -PI), None),
    ("Wire Drum Door.glb", "Wire Drum Door", "Wire Drum Door_atlas.glb", (-PI, 0.0, -PI), None),
    ("Wire_Drum.glb", "Wire Drum", "Wire Drum.glb", (0, PI, 0), None),
]


def urdf_replacements(suffix):
    return [
        ('filename="Display.glb"', f'filename="Display{suffix}.glb"'),
        ('filename="Front Door.glb"', f'filename="Front Door{suffix}.glb"'),
        ('filename="Gas Spring Main Part Left.glb"', f'filename="Gas Spring Main Part{suffix}.glb"'),
        ('filename="Gas Spring Main Part Right.glb"', f'filename="Gas Spring Main Part{suffix}.glb"'),
        ('filename="Gas Spring Secondary Part Left.glb"', f'filename="Gas Spring Secondary Part{suffix}.glb"'),
        ('filename="Gas Spring Secondary Part Right.glb"', f'filename="Gas Spring Secondary Part{suffix}.glb"'),
        ('filename="Handle.glb"', f'filename="Handle{suffix}.glb"'),
        ('filename="Spools Door_atlas.glb"', f'filename="Spools Door{suffix}.glb"'),
        ('filename="Wire Drum Door_atlas.glb"', f'filename="Wire Drum Door{suffix}.glb"'),
        ('filename="Wire Drum.glb"', f'filename="Wire Drum{suffix}.glb"'),
        ('filename="Top Cover.glb"', f'filename="Top Cover{suffix}.glb"'),
    ]


# ---------------------------------------------------------------- textures
def downscale(img, size):
    return img if img.size == (size, size) else img.resize((size, size), Image.LANCZOS)


def build_textures(src, assets):
    tex_src = os.path.join(src, "Texture")
    tex_dst = os.path.join(assets, "Textures")
    tex_4k = os.path.join(tex_dst, "4k")
    os.makedirs(tex_4k, exist_ok=True)
    for mat, spec in SETS.items():
        if spec is None:
            continue
        base, metal, rough, normal = spec
        stem = OUT_STEM[mat]
        for f, tag in ((base, "BaseColor"), (normal, "Normal")):
            shutil.copyfile(os.path.join(tex_src, f), os.path.join(tex_4k, f"{stem}_{tag}.png"))
        bc = Image.open(os.path.join(tex_src, base)).convert("RGB")
        nm = Image.open(os.path.join(tex_src, normal)).convert("RGB")
        me = Image.open(os.path.join(tex_src, metal)).convert("L")
        ro = Image.open(os.path.join(tex_src, rough)).convert("L")
        packed = Image.merge("RGB", (Image.new("L", me.size, 255), ro, me))  # G=rough, B=metal
        packed.save(os.path.join(tex_4k, f"{stem}_MetallicRoughness.png"), optimize=True)
        downscale(bc, WORK).save(os.path.join(tex_dst, f"{stem}_BaseColor.png"), optimize=True)
        downscale(nm, WORK).save(os.path.join(tex_dst, f"{stem}_Normal.png"), optimize=True)
        downscale(packed, WORK).save(os.path.join(tex_dst, f"{stem}_MetallicRoughness.png"), optimize=True)
        print(f"textures: {stem} -> 2K (+4k originals)")
    shutil.copyfile(os.path.join(tex_src, DISPLAY_SRC), os.path.join(tex_dst, DISPLAY_DST))
    print(f"textures: {DISPLAY_DST} copied")


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
    """Local TRS (or matrix) of a glTF node as a 4x4 row-major numpy matrix."""
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
    """World-space (scene-root) vertex positions, node transforms applied.

    The Sep-2026 _2509 exports keep a node rotation (e.g. Top Cover: 90 deg about X)
    while the Oct-2026 exports bake it into the vertices — raw accessors differ by
    that rotation even though both land in the same place in the viewer.
    """
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
            p = mesh_pts[n["mesh"]]
            out.append(p @ M[:3, :3].T + M[:3, 3])
        for c in n.get("children", []):
            walk(c, M)

    roots = j["scenes"][j.get("scene", 0)]["nodes"] if j.get("scenes") else range(len(j["nodes"]))
    for r in roots:
        walk(r, np.eye(4))
    return np.concatenate(out)


def add_textures(j, uris):
    j.setdefault("images", [])
    j.setdefault("textures", [])
    if "samplers" not in j:
        j["samplers"] = [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}]
    idx = []
    for uri in uris:
        j["images"].append({"uri": uri, "mimeType": "image/png"})
        j["textures"].append({"sampler": 0, "source": len(j["images"]) - 1})
        idx.append(len(j["textures"]) - 1)
    return idx


def rewrite_materials(j):
    j.setdefault("extensionsUsed", [])
    for mat in j.get("materials", []):
        name = mat.get("name", "")
        pbr = mat.setdefault("pbrMetallicRoughness", {})
        if name in SETS:
            stem, v = OUT_STEM[name], VERSION[name]
            bc, mr, nm = add_textures(j, [f"Textures/{stem}_BaseColor.png?v={v}",
                                          f"Textures/{stem}_MetallicRoughness.png?v={v}",
                                          f"Textures/{stem}_Normal.png?v={v}"])
            pbr.update({"baseColorFactor": [1, 1, 1, 1], "metallicFactor": 1, "roughnessFactor": 1,
                        "baseColorTexture": {"index": bc}, "metallicRoughnessTexture": {"index": mr}})
            mat["normalTexture"] = {"index": nm, "scale": 1}
            mat["doubleSided"] = True
        elif name == "Test_Display":
            (bc,) = add_textures(j, [f"Textures/{DISPLAY_DST}?v=2k"])
            pbr.update({"baseColorFactor": [1, 1, 1, 1], "metallicFactor": 0, "roughnessFactor": 0.5,
                        "baseColorTexture": {"index": bc}})
        elif name == "Glass":
            mat["name"] = "Chamber Window Glass"
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
    if not j["extensionsUsed"]:
        del j["extensionsUsed"]


# ---------------------------------------------------------------- placement check
def rot_xyz(r, p, y):
    """THREE Euler XYZ as the viewer applies URDF rpy: Rx * Ry * Rz (not standard URDF)."""
    cx, sx, cy, sy, cz, sz = np.cos(r), np.sin(r), np.cos(p), np.sin(p), np.cos(y), np.sin(y)
    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    Rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return Rx @ Ry @ Rz


def nn_dist(a, b, n=600):
    rng = np.random.default_rng(0)
    sa = a[rng.choice(len(a), min(n, len(a)), replace=False)]
    d = np.sqrt(((sa[:, None, :] - b[None, :, :]) ** 2).sum(-1)).min(1)
    return d.mean(), d.max()


def build_glbs(src, assets, suffix, write=True):
    for glb, stem, cur, rpy_old, rpy_new in PARTS:
        j, b = read_glb(os.path.join(src, glb))
        rewrite_materials(j)
        if write:
            write_glb(os.path.join(assets, f"{stem}{suffix}.glb"), j, b)
        line = f"{stem}{suffix}.glb  mats={[m['name'] for m in j['materials']]}"
        if cur:
            jo, bo = read_glb(os.path.join(assets, cur))
            po = positions(jo, bo) @ rot_xyz(*rpy_old).T
            pn = positions(j, b) @ rot_xyz(*(rpy_new or rpy_old)).T
            bb = np.abs(np.r_[po.min(0), po.max(0)] - np.r_[pn.min(0), pn.max(0)]).max() * 1000
            m_no, x_no = nn_dist(pn, po)   # new -> old: large where the export ADDS geometry
            m_on, x_on = nn_dist(po, pn)   # old -> new: must be ~0 (old surface still covered)
            line += (f"\n    bbox delta max {bb:.1f} mm | new->old mean {m_no * 1000:.2f} max {x_no * 1000:.1f} mm"
                     f" | old->new mean {m_on * 1000:.2f} max {x_on * 1000:.1f} mm")
        else:
            line += "\n    (no current link in the URDF: built, not placed)"
        print(line)


def repoint_urdf(assets, suffix):
    urdf = os.path.join(assets, "M600_PRO.urdf")
    s = open(urdf, "rb").read()
    eol = "\r\n" if s.count(b"\r\n") else "\n"   # the URDF is CRLF; keep whatever it has
    t = s.decode("utf-8")
    for a, bb in urdf_replacements(suffix):
        a, bb = a.replace("\n", eol), bb.replace("\n", eol)
        assert t.count(a) == 1, a
        t = t.replace(a, bb)
    open(urdf, "wb").write(t.encode("utf-8"))
    print("URDF repointed")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("mode", choices=["all", "textures", "glbs", "urdf", "check"])
    ap.add_argument("--src", default=DEFAULT_SRC)
    ap.add_argument("--assets", default=DEFAULT_ASSETS)
    ap.add_argument("--suffix", default="_2210")
    args = ap.parse_args()
    if args.mode in ("all", "textures"):
        build_textures(args.src, args.assets)
    if args.mode in ("all", "glbs"):
        build_glbs(args.src, args.assets, args.suffix)
    if args.mode == "check":
        build_glbs(args.src, args.assets, args.suffix, write=False)
    if args.mode in ("all", "urdf"):
        repoint_urdf(args.assets, args.suffix)
