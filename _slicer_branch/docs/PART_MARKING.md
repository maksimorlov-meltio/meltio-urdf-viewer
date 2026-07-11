# Part ID + marking — design outline (not yet implemented)

Give every print job a short, human/scanner-friendly **alphanumeric code** that maps
back to its full provenance, and optionally **mark it onto the part** with the laser
(no wire) so the physical part carries its own ID. Decided to pursue; captured here.

## The code

- Unique IDs already exist (`PrintRun.id`, `SliceVersion.id`) but UUIDs (36 chars)
  are unmarkable. Add a short `short_code` to the print job (and/or slice), unique.
- Scheme: Crockford base32 of a per-org sequence + a check char, ambiguous chars
  removed (no 0/O, 1/I/L). E.g. `ACME-7K3PQ` or `M600-000042`. Short, scannable,
  type-able.
- It resolves to: print job → slice (`profile_snapshot`, `slicer_version`) → part →
  STL → who/when. "Scan the part, get its birth certificate." Useful immediately in
  the Database view / records, **before** any lasering — so build this first.

## Marking it (laser, no wire)

- Wire deposition is too coarse for legible text (bead ≈ 1.5 mm); use the laser in a
  low-power **marking** pass (laser on, no wire feed, no process control).
- Text → toolpath via a **single-stroke (Hershey) font** → polylines → `G1` moves.
  Single-stroke suits laser marking (no fill). Contained addition to the slicer's
  existing geometry→toolpath path.
- Emit as a dedicated **marking pass** wrapped in a marking macro (fits the existing
  macro system — set marking laser power, wire off; on the M600 likely expressible
  via `G108`/`G123`). Run at print end.
- Placement (profile setting): a flat face of the **part** (travels with the part —
  best for traceability) or the **buildplate** (note: permanent on a reusable plate).
  Configurable size + marking power.

## Phasing

1. `short_code` per print job + surface it everywhere (cheap, immediately useful).
2. Hershey text→toolpath.
3. "Part marking" profile option (enable / placement / size / marking power) emitting
   the marking pass.
