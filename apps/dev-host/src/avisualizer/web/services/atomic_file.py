"""Write a file so a reader never sees it half-written.

Extracted from services/sensor_pointcloud.py, which already did this correctly
for its numpy cache, and decoupled from numpy so the authorization store can use
it too (finding SEG-4).

Why it matters here and not only for a cache: `permissions.json` holds every
role's rank and every operator's credentials, and it has TWO uncoordinated
writers (PUT /api/permissions/config and tools/set_password.py). A plain
`write_text` truncates the file and then fills it, so any reader — or any
process that dies mid-write — sees a partial document. The truncation window is
not theoretical: it was measured on NTFS with an observing thread.

`os.replace` is atomic on both POSIX and Windows *when source and destination
are on the same filesystem*, which is why the temporary file is created in the
destination's own directory rather than in the system temp dir.
"""
from __future__ import annotations

import os
import tempfile
from pathlib import Path


def write_text_atomic(path: Path, text: str, *, encoding: str = "utf-8") -> None:
    """Replace `path`'s contents with `text` in one indivisible step.

    Either the old file or the new one is visible to a reader at any instant,
    never a mixture and never an empty file.

    The flush + fsync before the rename is deliberate: without it a crash can
    leave the rename durable while the data behind it is not, which is the same
    corrupt file by a slower route.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding=encoding,
            newline="\n",
            suffix=".tmp",
            prefix=f".{path.name}.",
            dir=str(path.parent),
            delete=False,
        ) as handle:
            temp_path = Path(handle.name)
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
        temp_path.replace(path)
        temp_path = None
    finally:
        # A failure between creating the temporary file and renaming it must not
        # leave litter next to the store — the directory is scanned by nothing,
        # but a stray `.permissions.json.*.tmp` invites someone to "restore" it.
        if temp_path is not None:
            try:
                temp_path.unlink()
            except OSError:
                pass
