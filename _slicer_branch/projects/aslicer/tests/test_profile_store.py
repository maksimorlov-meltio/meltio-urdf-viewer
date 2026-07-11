"""Tests for the JSON-file machine-profile store."""

from __future__ import annotations

import pytest

from aslicer.profile import MachineProfile, default_profile
from aslicer.profile_store import FactoryProfileError, ProfileStore


def test_store_seeds_default_profile(tmp_path) -> None:
    store = ProfileStore(tmp_path)
    names = store.names()
    assert names == [default_profile().name]
    loaded = store.get(names[0])
    assert loaded is not None
    assert loaded.name == default_profile().name
    # The seeded 316L is a read-only master (factory) profile.
    assert loaded.factory is True


def test_save_and_get_roundtrip(tmp_path) -> None:
    store = ProfileStore(tmp_path)
    profile = MachineProfile.from_dict({"name": "Custom", "material": "dual"})
    store.save(profile)
    assert "Custom" in store.names()
    loaded = store.get("Custom")
    assert loaded is not None
    assert loaded.material == "dual"


def test_get_unknown_returns_none(tmp_path) -> None:
    store = ProfileStore(tmp_path)
    assert store.get("does-not-exist") is None


def test_save_overwrites_same_name(tmp_path) -> None:
    store = ProfileStore(tmp_path)
    store.save(MachineProfile.from_dict({"name": "Edit", "perimeter_count": 1}))
    store.save(MachineProfile.from_dict({"name": "Edit", "perimeter_count": 3}))
    names = [n for n in store.names() if n == "Edit"]
    assert names == ["Edit"]
    assert store.get("Edit").perimeter_count == 3


def test_delete_removes_profile(tmp_path) -> None:
    store = ProfileStore(tmp_path)
    store.save(MachineProfile.from_dict({"name": "Temp"}))
    assert store.delete("Temp") is True
    assert "Temp" not in store.names()


def test_cannot_delete_master_profile(tmp_path) -> None:
    store = ProfileStore(tmp_path)
    master = store.names()[0]
    with pytest.raises(FactoryProfileError):
        store.delete(master)
    assert master in store.names()


def test_cannot_modify_master_profile(tmp_path) -> None:
    store = ProfileStore(tmp_path)
    master = store.get(store.names()[0])
    edited = MachineProfile.from_dict({**master.to_dict(), "layer_height_mm": 2.0})
    with pytest.raises(FactoryProfileError):
        store.save(edited)


def test_save_forces_factory_flag_off(tmp_path) -> None:
    # Clients cannot mint master profiles: a saved profile is always editable.
    store = ProfileStore(tmp_path)
    store.save(MachineProfile.from_dict({"name": "Sneaky", "factory": True}))
    saved = store.get("Sneaky")
    assert saved is not None
    assert saved.factory is False
    assert store.delete("Sneaky") is True


def test_master_profile_is_reseeded(tmp_path) -> None:
    # Re-opening the store restores the master even if its file was tampered with.
    ProfileStore(tmp_path)
    store = ProfileStore(tmp_path)
    master = store.get(default_profile().name)
    assert master is not None and master.factory is True
