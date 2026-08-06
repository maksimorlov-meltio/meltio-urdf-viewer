"""Integrated smoke harness: boots the REAL viewer + slicer servers (each from
its own venv, like Start-Viewer.bat does) against an isolated temp data root,
and tears them down afterwards.

This is the behavioral baseline required before any refactor of the frontend:
it exercises the documented load -> slice -> print-command surface over real
HTTP, not TestClient. Run from the repo root:

    .\\.venv\\Scripts\\python.exe -m pytest tests/smoke

Runs in two modes:

  * BOTH SIDES (local, Windows, after the README setup): each server boots from
    its own venv and all journeys run.
  * VIEWER ONLY (CI): when the repo venvs are absent it falls back to the
    interpreter running pytest, and the journeys that need the slicer skip
    themselves via the `slicer_stack` fixture. That is enough for the CI job
    that installs only the viewer package — and it is what catches a broken
    app entry (test_viewer_serves_the_app_shell), the failure that finding
    ARQ-1 describes. Installing the slicer's native deps (open3d, trimesh,
    scipy, shapely, rtree) on every PR to gain three journeys is not worth
    ~5 minutes of CI per run.
"""
from __future__ import annotations

import binascii
import hashlib
import json
import os
import secrets
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
VIEWER_SRC = REPO_ROOT / "apps" / "dev-host" / "src"
SLICER_SRC = REPO_ROOT / "_slicer_branch" / "projects" / "platform" / "src"


def _venv_python(name: str) -> Path | None:
    """The interpreter of a repo venv, or None when that venv isn't set up."""
    for rel in (("Scripts", "python.exe"), ("bin", "python")):  # Windows, POSIX
        candidate = REPO_ROOT / name / Path(*rel)
        if candidate.exists():
            return candidate
    return None


def _importable(python: Path, module: str) -> bool:
    return subprocess.run(
        [str(python), "-c", f"import {module}"],
        capture_output=True, timeout=120,
    ).returncode == 0


# Fall back to the interpreter running pytest: in CI only the viewer package is
# installed, and that is the mode this harness is designed to degrade into.
VIEWER_PY = _venv_python(".venv") or Path(sys.executable)
SLICER_PY = _venv_python("venv311") or Path(sys.executable)

# Same PBKDF2 parameters as avisualizer.web.app._hash_password.
def _hash_password(password: str, salt_hex: str) -> str:
    salt = binascii.unhexlify(salt_hex)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100000)
    return binascii.hexlify(dk).decode()


SMOKE_PASSWORD = "smoke-pass"


def _seed_permissions(db_root: Path) -> None:
    """Two roles/users: one that may command the machine, one that may not."""
    def user(uid: str, username: str, role_id: str) -> dict:
        salt = secrets.token_hex(16)
        return {
            "id": uid, "username": username, "name": username, "roleId": role_id,
            "salt": salt, "passwordHash": _hash_password(SMOKE_PASSWORD, salt),
        }

    doc = {
        "roles": [
            {"id": "role_admin", "name": "Administrator", "rank": 4,
             "permissions": ["admin.users", "machine.command"]},
            {"id": "role_viewer", "name": "Watcher", "rank": 1,
             "permissions": ["data.read"]},
        ],
        "users": [user("u_admin", "smoke-admin", "role_admin"),
                  user("u_watch", "smoke-watch", "role_viewer")],
    }
    db_root.mkdir(parents=True, exist_ok=True)
    (db_root / "permissions.json").write_text(json.dumps(doc, indent=2), encoding="utf-8")


# A 10 mm cube, binary STL (12 triangles) — small enough to slice in well under
# a second but a real closed solid, so the whole slicer pipeline runs.
def _write_cube_stl(path: Path, size_mm: float = 10.0) -> None:
    import struct

    s = size_mm
    v = [(0, 0, 0), (s, 0, 0), (s, s, 0), (0, s, 0),
         (0, 0, s), (s, 0, s), (s, s, s), (0, s, s)]
    # Each face as two triangles, outward normals implied (slicers recompute).
    faces = [
        (0, 2, 1), (0, 3, 2),  # bottom
        (4, 5, 6), (4, 6, 7),  # top
        (0, 1, 5), (0, 5, 4),  # front
        (1, 2, 6), (1, 6, 5),  # right
        (2, 3, 7), (2, 7, 6),  # back
        (3, 0, 4), (3, 4, 7),  # left
    ]
    with path.open("wb") as fh:
        fh.write(b"\0" * 80)
        fh.write(struct.pack("<I", len(faces)))
        for a, b, c in faces:
            fh.write(struct.pack("<3f", 0, 0, 0))  # normal (recomputed downstream)
            for idx in (a, b, c):
                fh.write(struct.pack("<3f", *v[idx]))
            fh.write(struct.pack("<H", 0))


def _free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def _wait_http_200(url: str, deadline_s: float, proc: subprocess.Popen, name: str) -> None:
    deadline = time.monotonic() + deadline_s
    last_err: Exception | None = None
    while time.monotonic() < deadline:
        if proc.poll() is not None:
            out = proc.stdout.read().decode(errors="replace") if proc.stdout else ""
            pytest.fail(f"{name} exited early (rc={proc.returncode}):\n{out[-4000:]}")
        try:
            with urllib.request.urlopen(url, timeout=2) as resp:
                if resp.status == 200:
                    return
        except Exception as exc:  # noqa: BLE001 - retry until deadline
            last_err = exc
        time.sleep(0.4)
    pytest.fail(f"{name} did not answer 200 at {url} within {deadline_s}s: {last_err}")


@pytest.fixture(scope="session")
def stack(tmp_path_factory: pytest.TempPathFactory):
    """Boot the viewer (always) and the slicer (when installed); yield their
    base URLs and the temp data root. `stack["slicer"]` is None in viewer-only
    mode — use the `slicer_stack` fixture instead of checking for it."""
    if not _importable(VIEWER_PY, "avisualizer"):
        pytest.skip("smoke needs the viewer package installed; see README setup")
    with_slicer = _importable(SLICER_PY, "meltio_platform")

    data = tmp_path_factory.mktemp("smoke-data")
    db_root = data / "database"
    stl_root = data / "STL"
    stl_root.mkdir()
    _seed_permissions(db_root)
    _write_cube_stl(stl_root / "smoke-cube.stl")

    viewer_port = _free_port()
    viewer_url = f"http://127.0.0.1:{viewer_port}"
    slicer_url = f"http://127.0.0.1:{_free_port()}" if with_slicer else None

    def spawn(python: Path, app_factory: str, port: int, extra_env: dict) -> subprocess.Popen:
        env = os.environ.copy()
        env.update(extra_env)
        return subprocess.Popen(
            [str(python), "-m", "uvicorn", app_factory, "--factory",
             "--host", "127.0.0.1", "--port", str(port)],
            cwd=str(REPO_ROOT), env=env,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if sys.platform == "win32" else 0,
        )

    viewer_env = {"PYTHONPATH": str(VIEWER_SRC),
                  "AVIS_DATABASE_ROOT": str(db_root),
                  "AVIS_STL_ROOT": str(stl_root)}
    slicer = None
    if with_slicer:
        slicer = spawn(SLICER_PY, "meltio_platform.slicer.web.app:create_app",
                       int(slicer_url.rsplit(":", 1)[1]), {"PYTHONPATH": str(SLICER_SRC)})
        viewer_env["AVIS_SLICER_URL"] = slicer_url
        viewer_env["AVIS_SLICER_UI_URL"] = slicer_url
    viewer = spawn(VIEWER_PY, "avisualizer.web.app:create_app", viewer_port, viewer_env)
    try:
        if slicer is not None:
            # The slicer imports open3d/trimesh at boot — generous deadline.
            _wait_http_200(f"{slicer_url}/api/health", 90, slicer, "slicer")
        _wait_http_200(f"{viewer_url}/health", 60, viewer, "viewer")
        yield {"viewer": viewer_url, "slicer": slicer_url, "db_root": db_root}
    finally:
        for proc in (viewer, slicer):
            if proc is not None and proc.poll() is None:
                proc.kill()
                proc.wait(timeout=15)


@pytest.fixture(scope="session")
def slicer_stack(stack):
    """Same as `stack`, but skips the test when running viewer-only (CI)."""
    if stack["slicer"] is None:
        pytest.skip("needs the slicer package (venv311); see README setup")
    return stack
