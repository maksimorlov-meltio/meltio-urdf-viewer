# Profile Library — design + status

A plan to turn machine profiles from a single global flat-file store into a
**scoped, shareable, org-approved library**, surfaced in the Database view next to
Parts.

## Status

- **Phase 1 — DONE (platform foundation).** `profiles` table + migration 0017;
  `web/profiles.py` = scoped CRUD API (factory/org/private) mirroring Parts'
  `active_org` scoping; factory presets seeded from the slicer's `factory_profiles()`
  (lazy on first use, so it also works under the test session). The platform's
  `GET /api/profiles` is now the DB-backed scoped one (the old flat-store list in
  `slices.py` was removed).
- **Phase 2 — TODO (consumers still on the flat store).** (a) The embedded **slicer
  GUI** profile manager talks to its own `/slicer/api/profiles` (separate sub-app,
  no user/DB context) — point it at the platform's scoped API, and have it **slice
  with the profile data** (the slicer's `/api/slice` looks a profile up by *name* in
  the flat store today). (b) The platform's server-side `slice_part` (`slices.py`)
  still uses `_profile_store().get(name)`.
- **Phase 2 — DONE.** The slicer GUI's profile manager + slicing use the platform's
  scoped DB `/api/profiles` (endpoints accept a name **or** uuid key; save is a PUT
  that renames in place; slicing sends the full profile **data**). Factory presets
  upsert on startup so preset edits propagate.
- **Phase 3 — DONE.** Org-to-org **share** (`POST /api/profiles/{key}/share` →
  pending copy, auto-active if the sharer is an admin there; or into one's private
  space), org-admin **approve/reject** (`MANAGE_ORG_SETTINGS`-gated; admins also see
  others' pending), and the **Database-view Profiles folder** per panel with
  drag-to-share + inline Approve/Reject. Provenance via `source_profile_id`.

## Goals

- **Scopes**: Factory (shipped masters) · Org (shared within an org) · Private
  (a single user's).
- **Sharing**: drag-and-drop / "Share" a profile into an org or private repo.
- **Approval**: an org admin decides which shared profiles are accepted into the
  org and approved for use.
- **Traceability**: who authored / shared / approved a profile, and when.
- Profiles persist properly (today the slicer's `/app/profiles` dir is global).

## Current state (what we're replacing)

- `slicer/profile_store.py` `ProfileStore` = one directory, one JSON per profile,
  **global to everyone** (any user's saved profile is visible to all). Factory
  presets are seeded from code (`default_profile`) + `slicer/factory_profiles/*.json`.
- The slicer GUI talks to its own store via `/api/profiles` (slicer app), not the
  platform DB. The platform records each slice's `profile_snapshot` (good — slices
  stay reproducible regardless of what happens to the profile later).
- No org/user scoping, no sharing, no approval, no DB-level traceability.

## Proposed DB schema

A single `profiles` table (copy-on-share: each org owns its own approved copy, so
editing or deleting one scope never disturbs another). Provenance is kept via
`source_profile_id`.

```
profiles
  id                UUID   PK            default uuid4
  scope             str    NOT NULL      "factory" | "org" | "private"   (indexed)
  org_id            UUID?  FK orgs.id    org scope: the owning org; private: owner's
                                          home org; factory: NULL            (indexed)
  created_by_id     UUID?  FK users.id   author (private/org); NULL for factory
  name              str    NOT NULL
  data              JSON   NOT NULL       MachineProfile.to_dict() snapshot
  status            str    NOT NULL       "active" | "pending" | "archived"
                                          (org copies start "pending" until approved)
  source_profile_id UUID?                 the profile this was shared/copied from
  approved_by_id    UUID?  FK users.id    org admin who approved (org scope)
  approved_at       datetime?
  created_at        datetime NOT NULL
  updated_at        datetime NOT NULL

  UNIQUE (scope, org_id, created_by_id, name)   -- no dup names within one scope
```

Notes
- `factory` is just `scope == "factory"` (drop the separate bool). Factory rows are
  seeded/upserted on startup from `default_profile()` + `factory_profiles/*.json`
  (idempotent), so masters stay present and canonical — same guarantee the current
  `ProfileStore` re-seed gives, but in the DB.
- `data` is the full profile JSON, so a profile is self-describing and easy to copy.
- Copy-on-share (vs a live link table) is deliberate: a manufacturing org wants a
  **stable, independently-editable, approved** copy, not one that changes when the
  original author edits theirs.

## Access rules

| Action | Factory | Org | Private |
|---|---|---|---|
| See | everyone | members (status=active); admins also see "pending" | owner only |
| Create | seed only | `manage_profiles` cap (org users + admins, **not** operators) | owner |
| Edit / delete | ✗ (read-only) | creator or org admin | owner |
| Use for slicing | yes | only status=active | yes |

Scoping mirrors Parts exactly (`active_org` / Private scope, `created_by_id ==
user.id` for private), so it reuses the proven access pattern — and, like parts,
**superusers get no implicit cross-user/private bypass**.

## Sharing + approval workflow

1. **Share / drag-drop** a profile onto a target org (in the Database view's
   Profiles folder): `POST /api/profiles/{id}/share {orgId}` → inserts a new row
   `scope=org, org_id=target, status="pending", data=<copy>, source_profile_id=id`.
2. The target **org admin** sees a *Pending approval* group and either approves
   (`status → active`, set `approved_by_id`/`approved_at`) or rejects
   (`status → archived` / delete).
3. Only `active` org profiles are selectable for slicing in that org. Cross-org
   drag (superuser) is the same share+pending flow into the target org.

## Database-view UX

- Add a top-level **Profiles** group alongside **Parts** in the existing multi-panel
  browser (per org panel + Private), reusing the drag-between-panels mechanics that
  already move parts between orgs.
- Profile cards show scope/owner; factory masters render read-only (★).
- Dragging a card into another org panel triggers the share → *pending* state there;
  the org admin's panel surfaces an *Approve / Reject* affordance.

## Slicer integration

- Point the slicer's profile manager at the platform's **scoped** profile API
  (`GET /api/profiles` returns factory + active-org active + the user's private;
  create/edit/delete gated by scope) instead of its own flat `ProfileStore`.
- Keep shipping factory presets as code/JSON, upserted into the DB as `scope=factory`
  on startup.
- Slicing already snapshots the profile into `SliceVersion.profile_snapshot` +
  `slicer_version`, so slices stay reproducible. Optionally also store a live
  `profile_id` FK on `SliceVersion` for "which library profile produced this".

## Migration

1. Alembic: create `profiles`; seed factory presets.
2. Import existing flat-store user profiles as `scope=private` (by author) or, where
   known, `scope=org`.
3. Cut the slicer over to the scoped API; retire the flat dir (or keep read-only as
   a transitional fallback).

## Related traceability gap (separate, noted in review)

`SliceVersion` links to a **Part**, not the exact `STLFile` blob it sliced — so for
a part with multiple STL uploads, "which STL produced this G-code" isn't pinned.
Adding `stl_file_id` to `SliceVersion` closes that. See also the per-slice
who/when/profile snapshot that already exists. This should be closed.

## Implemented after Phase 3 (commit 7dbf227)

- **Version counter** — `profiles.version` (migration 0018) bumps on every save, shown
  in the library row (like a slice version).
- **Creator + provenance** — each row shows `createdBy` and, for shared copies,
  `shared from <origin>` (via `source_profile_id`).
- **Copy-on-share, independent** — sharing/duplicating across scopes makes a *new
  independent snapshot*; editing the origin never changes the copy. Shared copies get
  a forced-distinct `"<name> (shared)"` name so the origin and copy never read alike.
- **`manage_profiles` capability** — required to create an org profile or share into an
  org (org users + admins; operators cannot). Superuser-tunable in the permissions matrix.
- Create in the slicer is now optimistic (the create response is adopted directly), so a
  new profile shows in the dropdown instantly.

## Planned: full version history + diff (decided — profiles are small)

The version *counter* exists; still TODO is the full append-only **history + diff +
rollback** (change-control / QA of the profile itself). Profiles are tiny, so keep a
full history rather than only on approval.

- `profile_versions` table: `id`, `profile_id` FK, `version` (int, per profile),
  `data` (JSON snapshot), `created_by_id`, `created_at`, optional `note`.
- Write a new version row on each meaningful save (debounced) and on approval.
  Show a history list with a **field-level diff** between consecutive snapshots
  (compare the two `MachineProfile.to_dict()` dicts — changed keys incl. nested
  `features`). Allow **rollback** (restore a snapshot as the current `data`).
- Tie into approval: an org profile's approved versions are the audit trail; the
  active one is the latest approved.
