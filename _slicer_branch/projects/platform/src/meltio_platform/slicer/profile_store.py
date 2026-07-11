"""Persistence for :class:`~meltio_platform.slicer.profile.MachineProfile` objects.

Profiles are stored as one JSON file per profile in a directory, so they are
human-inspectable, diff-friendly and easy to back up. The store is the single
place that knows the on-disk layout; the rest of the app works with
:class:`MachineProfile` objects.
"""

from __future__ import annotations

import json
import re
from dataclasses import replace
from pathlib import Path

from .profile import MachineProfile, default_profile


class FactoryProfileError(Exception):
    """Raised when trying to modify or delete a read-only factory profile."""


# Bundled factory presets shipped as JSON next to this module (in addition to the
# code-defined default_profile). Drop a profile JSON in here to ship a new master.
_FACTORY_DIR = Path(__file__).parent / "factory_profiles"


def factory_profiles() -> tuple[MachineProfile, ...]:
    """The read-only "master" presets shipped with the slicer.

    The code-defined :func:`default_profile` plus any JSON presets bundled in
    ``factory_profiles/``. All are forced ``factory=True`` so they ship with
    every build and are always present and canonical, regardless of disk state.
    """
    presets: list[MachineProfile] = []
    if _FACTORY_DIR.is_dir():
        for path in sorted(_FACTORY_DIR.glob("*.json")):
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                presets.append(replace(MachineProfile.from_dict(data), factory=True))
            except (ValueError, OSError, json.JSONDecodeError):
                continue
    # Fallback so the GUI always has a master even if the bundled files are missing.
    if not presets:
        presets = [default_profile()]
    return tuple(presets)


def _slug(name: str) -> str:
    """Filesystem-safe stem for a profile name (lowercase, alnum + ``_``)."""
    slug = re.sub(r"[^a-z0-9]+", "_", name.strip().lower()).strip("_")
    return slug or "profile"


class ProfileStore:
    """A directory-backed collection of machine profiles.

    On every open the store (re)writes the read-only :func:`factory_profiles`
    presets, so the shipped master profiles are always present and canonical
    (this also upgrades a store created before the ``factory`` flag existed).
    """

    def __init__(self, directory: Path) -> None:
        self._dir = Path(directory)
        self._dir.mkdir(parents=True, exist_ok=True)
        # Always (re)seed the factory presets so they are present and canonical,
        # even upgrading a store that predates the factory flag. This also
        # guarantees the GUI always has at least one profile to show.
        for preset in factory_profiles():
            self._write(preset)

    def _files(self) -> list[Path]:
        return sorted(self._dir.glob("*.json"))

    def _load_file(self, path: Path) -> MachineProfile | None:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            return MachineProfile.from_dict(data)
        except (ValueError, OSError, json.JSONDecodeError):
            return None

    def names(self) -> list[str]:
        """All profile names, sorted alphabetically (case-insensitive)."""
        names = [
            profile.name
            for path in self._files()
            if (profile := self._load_file(path)) is not None
        ]
        return sorted(names, key=str.lower)

    def get(self, name: str) -> MachineProfile | None:
        """Return the profile with ``name``, or ``None`` if it does not exist."""
        for path in self._files():
            profile = self._load_file(path)
            if profile is not None and profile.name == name:
                return profile
        return None

    def entries(self) -> list[dict]:
        """All profiles as ``{"name", "factory"}`` dicts, sorted by name."""
        items = [
            {"name": profile.name, "factory": profile.factory}
            for path in self._files()
            if (profile := self._load_file(path)) is not None
        ]
        return sorted(items, key=lambda e: e["name"].lower())

    def _path_for(self, name: str) -> Path:
        """File to write ``name`` to: its existing file, or a fresh slug path."""
        for path in self._files():
            existing = self._load_file(path)
            if existing is not None and existing.name == name:
                return path
        target = self._dir / f"{_slug(name)}.json"
        # Avoid clobbering a different profile that slugged the same.
        suffix = 1
        while target.exists():
            target = self._dir / f"{_slug(name)}_{suffix}.json"
            suffix += 1
        return target

    def _write(self, profile: MachineProfile) -> MachineProfile:
        """Write ``profile`` to disk unconditionally (no factory guard)."""
        self._path_for(profile.name).write_text(
            json.dumps(profile.to_dict(), indent=2), encoding="utf-8"
        )
        return profile

    def save(self, profile: MachineProfile) -> MachineProfile:
        """Create or overwrite ``profile`` (keyed by its name).

        Refuses to overwrite a factory (master) profile, and never lets a caller
        create one — the ``factory`` flag is forced off for saved profiles.
        """
        existing = self.get(profile.name)
        if existing is not None and existing.factory:
            raise FactoryProfileError(
                f"{profile.name!r} is a master profile and cannot be modified"
            )
        if profile.factory:
            profile = replace(profile, factory=False)
        return self._write(profile)

    def delete(self, name: str) -> bool:
        """Delete the profile named ``name``.

        Refuses to delete the final remaining profile (returns ``False``) so the
        GUI always has something to fall back to, and raises
        :class:`FactoryProfileError` for read-only master profiles.
        """
        files = self._files()
        for path in files:
            profile = self._load_file(path)
            if profile is not None and profile.name == name:
                # Factory check first, so master profiles report the right reason
                # even when they are the only profile present.
                if profile.factory:
                    raise FactoryProfileError(
                        f"{name!r} is a master profile and cannot be deleted"
                    )
                if len(files) <= 1:
                    return False
                path.unlink(missing_ok=True)
                return True
        return False
