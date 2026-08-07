"""The command audit trail must not be a way to fill the disk.

Finding N-A1. The log had no bound of any kind, and `emergencyStop` is declared
at level `none` in contract.json — correctly, an emergency stop must work signed
out — so an unauthenticated caller could append to it as fast as the disk would
accept. Measured at 77.6 MB/s. A full data directory takes the permissions store
and the datasets down with it, which is why an availability finding sits next to
the authorization ones.

Two bounds, because they fail differently: one enormous `args` payload, and a
million small ones.
"""
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import avisualizer.web.app as app_module


@pytest.fixture()
def data_dir(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Path:
  monkeypatch.setattr(app_module, "DATABASE_ROOT", tmp_path)
  monkeypatch.setattr(app_module, "PERMISSIONS_STORE", tmp_path / "permissions.json")
  return tmp_path


@pytest.fixture()
def client(data_dir: Path) -> TestClient:
  return TestClient(app_module.create_app())


def _audit(data_dir: Path) -> Path:
  return data_dir / app_module.COMMAND_AUDIT_LOG_NAME


def _lines(path: Path) -> list[dict]:
  return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]


# --- The unauthenticated path is the one that matters ------------------------

def test_estop_is_still_allowed_signed_out_and_still_audited(client: TestClient, data_dir: Path) -> None:
  # The precondition for everything below. If this ever starts failing, the
  # bounds are pointless AND a safety command has been broken.
  r = client.post("/api/machine/command", json={"command": "ESTOP"})
  assert r.status_code == 200
  entries = _lines(_audit(data_dir))
  assert len(entries) == 1
  assert entries[0]["command"] == "ESTOP"
  assert entries[0]["operatorName"] == "anonymous", "signed-out is a fact worth recording"


def test_a_huge_args_payload_cannot_write_a_huge_line(client: TestClient, data_dir: Path) -> None:
  payload = {"command": "ESTOP", "args": {"filler": "A" * 200_000}}
  assert client.post("/api/machine/command", json=payload).status_code == 200
  raw = _audit(data_dir).read_text(encoding="utf-8")
  assert len(raw) < app_module.COMMAND_AUDIT_MAX_LINE_CHARS + 200, (
    f"one request wrote {len(raw)} chars")
  entry = _lines(_audit(data_dir))[0]
  # WHO did WHAT survives — that is what the trail is for. Only the payload
  # that made the line huge is dropped, and its loss is recorded rather than
  # silent.
  assert entry["command"] == "ESTOP"
  assert entry["args"]["_truncated"] is True
  assert entry["args"]["_originalChars"] > 200_000


def test_ordinary_arguments_are_kept_verbatim(client: TestClient, data_dir: Path) -> None:
  # The bound must not cost the trail its usefulness: a real jog has to be
  # readable afterwards, magnitude and all.
  payload = {"command": "ESTOP", "args": {"axis": "z", "distanceMm": 10}}
  assert client.post("/api/machine/command", json=payload).status_code == 200
  assert _lines(_audit(data_dir))[0]["args"] == {"axis": "z", "distanceMm": 10}


# --- ...and a million small ones -------------------------------------------

def test_the_log_rotates_instead_of_growing_without_end(
    client: TestClient, data_dir: Path, monkeypatch: pytest.MonkeyPatch) -> None:
  # 2 KB instead of 8 MB so this is a test and not a disk benchmark. The
  # threshold is a constant precisely so it can be moved here.
  monkeypatch.setattr(app_module, "COMMAND_AUDIT_MAX_BYTES", 2048)
  for _ in range(80):
    assert client.post("/api/machine/command", json={"command": "ESTOP"}).status_code == 200

  live = _audit(data_dir)
  rotated = live.with_suffix(live.suffix + ".1")
  assert rotated.exists(), "the trail grew past its bound without rotating"
  assert live.stat().st_size < 2048 + 512
  # Two generations, never three: a kiosk's disk is not an archive.
  assert not rotated.with_suffix(rotated.suffix + ".1").exists()


def test_rotation_keeps_the_previous_generation_readable(
    client: TestClient, data_dir: Path, monkeypatch: pytest.MonkeyPatch) -> None:
  # Rotating must not corrupt what it moves aside — the reason someone reads
  # this file at all is an incident that has already happened.
  monkeypatch.setattr(app_module, "COMMAND_AUDIT_MAX_BYTES", 2048)
  for _ in range(80):
    client.post("/api/machine/command", json={"command": "ESTOP"})
  rotated = _audit(data_dir).with_suffix(_audit(data_dir).suffix + ".1")
  entries = _lines(rotated)
  assert entries and all(e["command"] == "ESTOP" for e in entries)
