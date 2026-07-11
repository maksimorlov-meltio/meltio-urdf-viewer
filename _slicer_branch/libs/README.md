# libs/

Shared libraries reused across the platform and its engines. Kept here (rather
than inside any one project) so the platform stays self-contained and a future
extraction into its own repo remains a clean `git filter-repo` / `subtree split`.

Planned first occupant: **`slicer-core`** — a stable Python API around the slicing
engine, behind which the slicer internals can later be reimplemented in C++
(Linux-only, compiled inside the Docker image) without changing callers. See
[`docs/PLATFORM_ARCHITECTURE.md`](../docs/PLATFORM_ARCHITECTURE.md).

Empty for now — added as the modules that need sharing emerge.
