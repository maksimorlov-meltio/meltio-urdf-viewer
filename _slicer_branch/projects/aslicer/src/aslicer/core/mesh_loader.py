"""Load STL (and other trimesh-supported) meshes into a single solid mesh."""

from __future__ import annotations

from pathlib import Path

import trimesh


def load_mesh(path: str | Path) -> trimesh.Trimesh:
    """Load a mesh file and return a single concatenated :class:`trimesh.Trimesh`.

    Args:
        path: Path to an STL (or any format trimesh understands).

    Returns:
        A watertight-or-not single ``Trimesh`` instance.

    Raises:
        FileNotFoundError: If ``path`` does not exist.
        ValueError: If the file does not contain usable triangle geometry.
    """
    mesh_path = Path(path)
    if not mesh_path.is_file():
        raise FileNotFoundError(f"Mesh file not found: {mesh_path}")

    loaded = trimesh.load_mesh(mesh_path)

    # A file may contain a scene with several geometries; merge into one mesh.
    if isinstance(loaded, trimesh.Scene):
        if len(loaded.geometry) == 0:
            raise ValueError(f"Mesh file contains no geometry: {mesh_path}")
        loaded = loaded.dump(concatenate=True)

    if not isinstance(loaded, trimesh.Trimesh) or loaded.faces.shape[0] == 0:
        raise ValueError(f"File does not contain triangle geometry: {mesh_path}")

    # Rest the mesh on the build plate: translate so its lowest point sits at
    # z = 0. The viewer's ground plane then lies flush under the model and the
    # first slice plane starts one layer height above the plate.
    z_min = float(loaded.bounds[0][2])
    if z_min != 0.0:
        loaded.apply_translation((0.0, 0.0, -z_min))

    return loaded
