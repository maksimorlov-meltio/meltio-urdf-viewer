"""Machine presets: the kind=machine mirror of the profile library."""

from __future__ import annotations

from meltio_platform.auth import ACCESS_EMAIL_HEADER
from meltio_platform.slicer.machine_catalog import get_machine, machine_catalog
from meltio_platform.slicer.profile_store import factory_profiles

ALICE = {ACCESS_EMAIL_HEADER: "alice@meltio3d.com"}


def test_machine_catalog_seeds_two_models():
    names = {m.name for m in machine_catalog()}
    assert {"M600 Pro", "M600"} <= names
    assert "G250" in get_machine("m600_pro").start_print_macro  # Pro dialect


def test_list_machines_api(client):
    body = client.get("/api/machines", headers=ALICE).json()
    names = {m["name"] for m in body["machines"]}
    assert {"M600 Pro", "M600"} <= names
    assert all(m["kind"] == "machine" for m in body["machines"])
    assert all(m["factory"] for m in body["machines"])  # only factory so far


def test_get_machine_includes_macros(client):
    m = client.get("/api/machines/M600", headers=ALICE).json()  # by name
    assert "G215" in m["start_print_macro"]  # Standard dialect
    assert client.get("/api/machines/nope", headers=ALICE).status_code == 404


def test_create_machine_preset(client):
    created = client.post(
        "/api/machines",
        json={"name": "My M600", "start_print_macro": "G250 P1"},
        headers=ALICE,
    ).json()
    assert created["kind"] == "machine" and created["scope"] == "org"
    listed = client.get("/api/machines", headers=ALICE).json()["machines"]
    assert any(m["name"] == "My M600" and not m["factory"] for m in listed)
    # machine presets are separate from profiles (same name can coexist)
    profs = client.get("/api/profiles", headers=ALICE).json()["profiles"]
    assert all(p["kind"] == "profile" for p in profs)


def test_factory_profiles_bound_to_machines():
    by_name = {p.name: p for p in factory_profiles()}
    assert by_name["M600 Pro SS316L"].machine_key == "M600 Pro"
    assert by_name["M600 Standard SS316L"].machine_key == "M600"


def test_profile_entry_shows_machine_label(client):
    profs = client.get("/api/profiles", headers=ALICE).json()["profiles"]
    pro = next(p for p in profs if p["name"] == "M600 Pro SS316L")
    assert pro["machineName"] == "M600 Pro"
    assert pro["kind"] == "profile"
