# Machine models — design + status

A machine is **part of the profile**, filled from a reusable **machine preset**. This
separates three concerns that used to be one "profile": the machine (hardware + G-code
dialect), the recipe (material/process), and the job (per-part). See PROFILE_LIBRARY.md.

## Model

- **Machine preset** (*M600 Pro*, *M600*, + user-defined) — a `kind="machine"` row in the
  **same library table** as profiles (one `profiles` table + a `kind` discriminator). It
  owns capabilities (axes, build volume, origin) and the **G-code macro dialect**
  (PRINT_START/END, deposition, short travel). Because it's the same library, it inherits
  *all* the machinery: factory/org/private scoping, org-to-org share + admin approval,
  versioning. `/api/machines` is the `kind="machine"` mirror of `/api/profiles` (shared
  `_op_*` handlers). Factory presets seed from `slicer/factory_machines/*.json`
  (Pro = `G250`; M600 = `G215/G108/G123`).
- **Profile** = the recipe. It **embeds** its machine settings (capabilities + macros),
  filled from a preset via the Machine-settings combo, then **editable + saved with the
  profile** — so a profile is self-contained and the engine slices it directly (no
  slice-time merge). It carries `machine_key` = the machine **label** (the preset name =
  the slicing target).
- **Serial number / unit** — *post-print only*. A slice targets a model; the same G-code
  prints on any unit of that model. The SN binds on the `PrintRun` at log-upload time.

## Implemented (deployed to beta)

- **A — backend.** `kind` discriminator on `profiles` (migration 0021); `/api/machines`
  CRUD mirrors `/api/profiles`; factory machine presets seed as `kind=machine`; a
  profile's `machine_key` holds the machine label (name); slices record `machine_key` +
  `stl_file_id` (migration 0020; 0019 added `profiles.machine_key`).
- **B — slicer.** The machine is chosen inside the profile's **Machine settings** via a
  combo (Duplicate / Delete + rename, like the profile combo) that **fills** the profile's
  machine fields from a preset; macros are editable + part of the profile; the status line
  shows **"Machine · Profile"**. (Reverted from the first attempt: the top machine
  dropdown, the mobile printer button, the read-only macros, and the slice-time merge.
  New + Duplicate collapsed to one.)
- **C — Database.** A **Machines folder** beside Profiles in each panel; profile + machine
  rows share one kind-aware renderer (drag-to-share, approve/reject, rename, delete).
- **D — traceability.** Each slice records the machine label + the exact STL blob.

> History: the first attempt made the machine a separate top-level selector with a
> slice-time macro merge; per design feedback it was reworked into the in-profile preset
> model above. `machine_catalog.apply_machine` / `get_machine` are now unused (seeding
> uses `machine_catalog()`).

## Follow-ups (not done)

- **Job layer**: move `support_enabled` to a per-job setting (one desktop toggle / mobile
  icon right of Center); capture the effective value on the slice.
- **Print-time SN**: `PrintRun.machine_serial` bound at log upload.
- **Audit logging** of profile/machine actions; queryable `profile_id`/`profile_version`
  on `SliceVersion` (the snapshot already embeds them).
