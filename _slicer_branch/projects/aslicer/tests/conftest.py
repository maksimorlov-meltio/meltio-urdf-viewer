"""Shared pytest fixtures for the aslicer test suite."""

from __future__ import annotations

from pathlib import Path

import pytest
import trimesh

from aslicer.core import load_mesh

_STL_DIR = Path(__file__).resolve().parents[1] / "stl"


@pytest.fixture(scope="session")
def stl_path() -> Path:
    candidates = sorted(_STL_DIR.glob("*.stl"))
    if not candidates:
        pytest.skip(f"No sample STL available in {_STL_DIR}")
    return candidates[0]


@pytest.fixture(scope="session")
def sample_mesh(stl_path: Path) -> trimesh.Trimesh:
    return load_mesh(stl_path)
