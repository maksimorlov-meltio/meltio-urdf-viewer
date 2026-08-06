# Slice persistence — design plan

Goal: when a file is sliced, remember it so that (a) the Files list badges it as
sliced, and (b) re-opening it in the embedded slicer shows it **already sliced
and ready to print** — without re-slicing.

Chosen constraints (from the request): persist across reloads, and the *slicer
view itself* must reopen pre-sliced (not just a viewer-side "ready to print"
shortcut). Storage should be light on the client.

## Foundation that already exists

- The slicer stores slices **server-side**: `POST /api/parts/{partId}/slices/import`
  returns a slice version `{id, version}`, and the toolpath/thermal are stored at
  `POST /api/slices/{sliceId}/toolpath` and `/simulation`.
- The slicer can **reopen a pre-sliced part** via the deep-link
  `?part=<partId>&slice=<sliceId>` (already implemented; used by the platform shell).
- The viewer already deep-links the STL via `?stl=<url>` and receives slice data
  through the `postMessage` bridge (`bridgedSliceData`).
- The Files list already has a per-file slice badge (`cloudFileSliceStatusByName`,
  `applyCloudFileSliceBadge`: "Slicing…" / "Ready").

So the right architecture is: **store the slice once in the slicer's server-side
parts DB; the viewer persists only a tiny `file → {partId, sliceId}` map; reopen
via `?part&slice` instead of `?stl`.** This is light on the client (no large blobs
in browser storage).

## Blockers (all slicer-app / backend, not the viewer)

1. **A `?stl` load has no part.** `saveToPart()` needs `currentPartId`, but a
   deep-linked STL isn't a library part. The slicer must create/associate a part
   for a `?stl` load (or a new endpoint that ingests an STL + slice into a part).
2. **The save→parent message is same-origin.** On save the slicer posts
   `{type:"slice-saved", partId, version}` with `targetOrigin = location.origin`
   (:8765), which cannot reach the cross-origin viewer (:8090). It must post with
   `"*"` (like the existing slice-data bridge) and include the `sliceId`.
3. The viewer `file → {partId, sliceId}` map is trivial but useless until (1)+(2).

## Staged implementation

### Stage A — slicer emits reusable ids (slicer app + backend)
- On (or after) a slice of a `?stl`-loaded model, ensure a part exists: either
  auto-create a part for the STL, or add an endpoint `POST /api/parts/from-stl`
  that returns a `partId`. Associate the uploaded STL with it.
- Auto-save the slice (reuse `saveToPart`'s import + toolpath/sim upload) and
  capture `{partId, sliceId}`.
- Bridge those ids to the viewer: extend the existing slice-data `postMessage`
  (already `"*"`) with `partId`/`sliceId`, OR change the `slice-saved` message to
  `targetOrigin: "*"` and include `sliceId`. Prefer folding into the slice-data
  payload so the viewer gets ids with the slice it already caches.
- Key by STL identity (the `?stl` `name` param) so re-slicing the same file
  updates the same part rather than creating duplicates.

### Stage B — viewer persistence + reopen (viewer only)
- Persist a compact map `slicedByFile[name] = {partId, sliceId, at}` in
  `localStorage` (tiny; no toolpath blobs). Cap to N most-recent entries.
- Files list: badge a file "Sliced" when it has a map entry (extends the existing
  badge; persist the flag so it survives reload).
- `loadFileToSlicer(name)`: if `slicedByFile[name]` exists, deep-link the iframe to
  `?part=<partId>&slice=<sliceId>` (pre-sliced) instead of `?stl=<url>`. The
  slicer renders it already sliced; the bridge delivers the stored toolpath so
  "Start print" is immediately ready.
- Invalidation: if the STL file changes (size/mtime/hash from the cloud list) or
  the profile changes, drop the map entry and fall back to `?stl` (re-slice).

### Stage C — polish
- Show slice metadata on the badge (layers / weight / time) from the saved slice.
- "Re-slice" affordance to force a fresh slice and update the stored part.
- Garbage-collect orphaned parts created from `?stl` loads.

## Open questions for the backend owner
- Is there an existing endpoint to create a part from an uploaded STL, or must one
  be added? What identifies a part (id scheme) and can we look one up by STL name?
- Retention/GC policy for parts auto-created from `?stl` deep-links.
- Should the stored slice be keyed by (STL, profile) so a profile change re-slices?
