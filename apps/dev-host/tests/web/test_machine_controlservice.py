"""The ControlService adapter maps M600Pro.Platform telemetry onto the console's
machine snapshot, stays read-only by default, and never crashes the endpoint.

These are pure unit tests: ControlService's HTTP layer is stubbed, so no live
machine (or .NET runtime) is required. The canned payload mirrors the real
MachineSnapshotDto (camelCase names, string enum values) documented in
M600Pro.Platform/docs/contracts/rest-api.md.
"""
import urllib.error

import pytest

from avisualizer.web.services.machine_controlservice import ControlServiceMachine
import avisualizer.web.app as app_module


# A representative running-print snapshot, shaped exactly like ControlService's
# GET /api/machine/snapshot response.
_RUNNING_SNAPSHOT = {
  "contractVersion": "1.0",
  "timestampUtc": "2026-07-27T10:00:00Z",
  "machineInfo": {"machineName": "M600Pro", "machineSerialNumber": "2609500"},
  "machineState": "Running",
  "safetyState": "Safe",
  "safetyMode": "Ready",
  "connectionState": "Connected",
  "motion": {"x": 12.5, "y": -3.0, "z": 40.0, "arm": 1.25},
  "process": {
    "argon": {"enabled": True, "targetFlowLpm": 20.0, "actualFlowLpm": 4.0, "isFresh": True},
    "chiller": {"running": True, "targetTemperatureC": 22.0, "temperatureC": 23.4},
    "oxygen": {"oxygenPpm": 40, "safe": True, "isFresh": True},
    "io": {"namedInputs": {"frontDoorClosed": True}, "namedOutputs": {}},
    "job": {"jobId": "job-7", "fileName": "bracket.gcode", "progressPercent": 42.5, "totalLines": 1000, "currentLine": 425},
  },
  "alarms": [
    {"alarmId": "a1", "severity": "Warning", "code": "106.1.3", "message": "gas", "clearedAtUtc": None},
    {"alarmId": "a2", "severity": "Error", "code": "200.4", "message": "x", "clearedAtUtc": "2026-07-27T09:59:00Z"},
  ],
}


def _adapter_returning(payload, *, readonly=True):
  """A ControlServiceMachine whose HTTP layer returns `payload` (or raises it)."""
  adapter = ControlServiceMachine("http://localhost:5080", readonly=readonly)

  def fake_request(method, path, body=None):
    if isinstance(payload, Exception):
      raise payload
    return payload

  adapter._request = fake_request  # type: ignore[method-assign]
  return adapter


def test_snapshot_maps_running_print():
  snap = _adapter_returning(_RUNNING_SNAPSHOT).snapshot()
  assert snap["connected"] is True
  assert snap["state"] == "printing"
  assert snap["progress"] == pytest.approx(0.425)
  assert snap["jobId"] == "job-7"
  assert snap["program"] == "bracket.gcode"
  assert snap["position"] == {"x": 12.5, "y": -3.0, "z": 40.0, "arm": 1.25}
  # coolant temp flows through; argon at 4/20 LpM (<50% of target) => gas flow low
  assert snap["signals"]["coolantTemperature"] == pytest.approx(23.4)
  assert snap["signals"]["gasFlowLow"] is True
  assert snap["signals"]["processRunning"] is True
  assert snap["signals"]["controllerBoardConnected"] is True
  # Only the ACTIVE alarm (uncleared) becomes a code; severity maps to class.
  assert snap["activeCodes"] == [{"class": "warning", "code": "106.1.3"}]


def test_estop_safety_overrides_state():
  payload = dict(_RUNNING_SNAPSHOT, machineState="Running", safetyState="EmergencyStop")
  snap = _adapter_returning(payload).snapshot()
  assert snap["state"] == "estop"
  assert snap["signals"]["emergencyStopActive"] is True


def test_snapshot_never_raises_when_controlservice_down():
  # A transport failure yields a well-formed disconnected snapshot, not a 500.
  snap = _adapter_returning(urllib.error.URLError("connection refused")).snapshot()
  assert snap["connected"] is False
  assert snap["state"] == "disconnected"
  assert snap["signals"]["controllerBoardConnected"] is False
  assert "diagnostic" in snap


def test_readonly_command_is_refused_and_forwards_nothing():
  adapter = _adapter_returning(_RUNNING_SNAPSHOT, readonly=True)
  sent = []
  original = adapter._request

  def spy(method, path, body=None):
    if path != "/api/machine/snapshot":  # snapshot() is allowed (state read-back)
      sent.append((method, path))
    return original(method, path, body)

  adapter._request = spy  # type: ignore[method-assign]
  ack = adapter.command("ESTOP")
  assert ack["accepted"] is False
  assert "read-only" in ack["reason"].lower()
  assert sent == []  # nothing was forwarded to the controller


def test_resolver_selects_adapter_when_configured(monkeypatch):
  monkeypatch.setenv("AVIS_MACHINE_URL", "http://localhost:5080")
  monkeypatch.setattr(app_module, "_controlservice_machine", None)
  assert isinstance(app_module.get_machine(), ControlServiceMachine)


def test_resolver_falls_back_to_mock_when_unset(monkeypatch):
  monkeypatch.delenv("AVIS_MACHINE_URL", raising=False)
  machine = app_module.get_machine()
  assert not isinstance(machine, ControlServiceMachine)
  assert hasattr(machine, "snapshot") and hasattr(machine, "command")


_LIBRARY_LOCAL = [
  {"entryId": "e1", "fileName": "bracket.gcode", "sizeBytes": 2048, "addedAtUtc": "2026-07-27T10:00:00Z",
   "source": "LocalUpload", "thumbnailAvailable": True, "largePreviewAvailable": True},
]
_CLOUD_CATALOG = {
  "slices": [
    {"sliceId": "s1", "partName": "Impeller", "name": "Impeller v3", "version": 3, "fileName": "impeller.gcode",
     "layerCount": 240, "isCurrent": True, "previewAvailable": True, "largePreviewAvailable": False},
  ],
  "downloads": [], "updatedAtUtc": "2026-07-27T10:00:00Z",
}


def test_library_maps_local_and_cloud():
  adapter = ControlServiceMachine("http://localhost:5080", readonly=True)

  def fake_request(method, path, body=None):
    if path == "/api/gcode/library":
      return _LIBRARY_LOCAL
    if path == "/api/gcode/cloud/catalog":
      return _CLOUD_CATALOG
    raise AssertionError(path)

  adapter._request = fake_request  # type: ignore[method-assign]
  lib = adapter.library()
  assert [e["name"] for e in lib["local"]] == ["bracket.gcode"]
  assert lib["local"][0] == {
    "id": "e1", "kind": "local", "name": "bracket.gcode", "sizeBytes": 2048,
    "addedAt": "2026-07-27T10:00:00Z", "source": "LocalUpload", "layerCount": None,
    "hasThumbnail": True, "hasPreview": True,
  }
  assert lib["cloud"][0]["id"] == "s1"
  assert lib["cloud"][0]["name"] == "Impeller v3"
  assert lib["cloud"][0]["layerCount"] == 240
  assert lib["cloud"][0]["hasThumbnail"] is True   # previewAvailable
  assert lib["cloud"][0]["hasPreview"] is False    # largePreviewAvailable


def test_cloud_status_maps_agent_status():
  adapter = ControlServiceMachine("http://localhost:5080", readonly=True)

  def fake_request(method, path, body=None):
    assert path == "/api/cloud-agent/status"
    return {"reachable": True, "enrolled": True, "online": True,
            "controlServiceConnected": True, "note": "", "serial": "2609500"}

  adapter._request = fake_request  # type: ignore[method-assign]
  st = adapter.cloud_status()
  assert st["connected"] is True and st["online"] is True
  assert st["enrolled"] is True and st["serial"] == "2609500"


def test_cloud_status_offline_when_down():
  adapter = ControlServiceMachine("http://localhost:5080", readonly=True)

  def boom(method, path, body=None):
    raise urllib.error.URLError("down")

  adapter._request = boom  # type: ignore[method-assign]
  st = adapter.cloud_status()
  assert st["connected"] is False and st["online"] is False
  assert st["note"] == ""


def test_cloud_status_endpoint_offline_without_machine(monkeypatch):
  from fastapi.testclient import TestClient
  monkeypatch.delenv("AVIS_MACHINE_URL", raising=False)
  with TestClient(app_module.create_app()) as client:
    r = client.get("/api/machine/cloud-status")
    assert r.status_code == 200
    assert r.json()["connected"] is False


def test_library_is_empty_when_controlservice_down():
  adapter = ControlServiceMachine("http://localhost:5080", readonly=True)

  def boom(method, path, body=None):
    raise urllib.error.URLError("down")

  adapter._request = boom  # type: ignore[method-assign]
  assert adapter.library() == {"local": [], "cloud": []}


def test_library_endpoint_empty_without_machine(monkeypatch):
  from fastapi.testclient import TestClient
  monkeypatch.delenv("AVIS_MACHINE_URL", raising=False)
  with TestClient(app_module.create_app()) as client:
    r = client.get("/api/machine/library")
    assert r.status_code == 200
    assert r.json() == {"local": [], "cloud": []}
    # image endpoint 404s when no machine is configured
    assert client.get("/api/machine/library/image", params={"kind": "local", "id": "x"}).status_code == 404


def test_urdf_page_auto_enables_link_only_when_machine_configured(monkeypatch):
  """The /urdf shell turns the machine link ON with no URL flag when a machine is
  configured, and leaves it OFF (unchanged standalone demo) otherwise."""
  from fastapi.testclient import TestClient

  monkeypatch.delenv("AVIS_MACHINE_URL", raising=False)
  with TestClient(app_module.create_app()) as client:
    body = client.get("/urdf").text
    assert "window.AVIS_MACHINE = { enabled: false" in body
    assert "/static/machine_library.js" not in body  # panel assets off by default

  monkeypatch.setenv("AVIS_MACHINE_URL", "http://localhost:5080")
  with TestClient(app_module.create_app()) as client:
    body = client.get("/urdf").text
    assert "window.AVIS_MACHINE = { enabled: true" in body
    assert "readonly: true" in body  # read-only by default
    # The library browse panel assets load only when a machine is configured.
    assert "/static/machine_library.js" in body
    assert "/static/machine_library.css" in body
