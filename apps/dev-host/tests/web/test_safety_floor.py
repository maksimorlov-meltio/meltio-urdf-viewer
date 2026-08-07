"""Stopping the machine must not depend on a JSON file being parseable.

Finding ARQ-1(b). `_load_command_levels()` reads contract.json and returns {} if
it cannot; every command is then undeclared and refused with a 400. That is the
right answer for `arm` or `jog` and exactly the wrong one for the commands that
make a running machine stop.

One stray comma in contract.json and the app still boots, the UI still loads,
and STOP answers 400 — alive and rejecting the safety action. The electronics
watchdog does not cover this, because the software never died.
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
def broken_contract(monkeypatch: pytest.MonkeyPatch, data_dir: Path) -> None:
  """The state a stray comma leaves behind: the app runs, the table is empty."""
  monkeypatch.setattr(app_module, "COMMAND_LEVELS", {})


def test_estop_survives_an_unreadable_contract(broken_contract: None, data_dir: Path) -> None:
  client = TestClient(app_module.create_app())
  r = client.post("/api/machine/command", json={"command": "ESTOP"})
  assert r.status_code == 200, "the emergency stop must not need a parseable JSON file"


def test_stop_and_pause_survive_it_too(broken_contract: None, data_dir: Path) -> None:
  # Not only ESTOP: stopPrint is the RECOVERABLE halt an operator reaches for
  # first, and pausePrint is de-escalating. Losing those to a syntax error
  # leaves an operator watching a print they cannot interrupt from the console.
  client = TestClient(app_module.create_app())
  for command in ("STOP", "PAUSE"):
    r = client.post("/api/machine/command", json={"command": command})
    # They require an operator, so signed out this is a 401 — an AUTHORISATION
    # answer, not "I do not know what that command is". That distinction is the
    # whole fix: 401 tells the operator to sign in, 400 tells them nothing.
    assert r.status_code == 401, f"{command}: got {r.status_code}"


def test_everything_else_still_fails_closed(broken_contract: None, data_dir: Path) -> None:
  # The other half. A floor that let ARM or START_PRINT through would have
  # turned an unreadable contract into an open machine.
  client = TestClient(app_module.create_app())
  for command in ("ARM", "HOME", "START_PRINT", "JOG", "RESUME", "CLEAR_FAULT", "FEEDER"):
    r = client.post("/api/machine/command", json={"command": command})
    assert r.status_code == 400, f"{command} was not refused ({r.status_code})"


def test_the_floor_agrees_with_the_contract_it_replaces() -> None:
  # This is what keeps the floor from becoming a second, drifting source of
  # truth: while contract.json is readable it decides everything, and these
  # levels must be the ones it already declares. If someone changes a level in
  # the contract, this fails and they change it here too.
  contract = json.loads(Path(app_module.CONTRACT_PATH).read_text(encoding="utf-8"))
  declared = contract["channels"]["shell"]["uiToHost"]["commands"]
  for command, level in app_module.SAFETY_FLOOR_LEVELS.items():
    spec = declared.get(command)
    if spec is None:  # an alias
      spec = next(s for s in declared.values()
                  if command in (s.get("aliases") or []))
    assert spec["permission"] == level, (
      f"{command}: contract says {spec['permission']!r}, floor says {level!r}")


def test_a_readable_contract_is_still_the_authority(data_dir: Path,
                                                    monkeypatch: pytest.MonkeyPatch) -> None:
  # The floor must not shadow the contract. Move ESTOP up to `god` in the live
  # table and it must start requiring a session, floor or no floor.
  monkeypatch.setattr(app_module, "COMMAND_LEVELS", {**app_module.COMMAND_LEVELS, "ESTOP": "god"})
  client = TestClient(app_module.create_app())
  assert client.post("/api/machine/command", json={"command": "ESTOP"}).status_code == 401
