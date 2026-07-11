# Platform Architecture

How the two standalone tools (`aslicer` slicer, `avisualizer` / "Meltio Orbit"
sensor visualizer) become a single multi-user **Meltio platform**: login,
per-user storage, file management, versioned slices, print history, and printer
fleet management — deployable as cloud SaaS *and* as a private on-prem install.

This is the design of record. It supersedes the narrow `docs/ARCHITECTURE.md`
(which described only the original `avisualizer` app).

## Vision

A user logs in and sees their **Parts**. A Part has an STL; an STL is sliced
into one or more **versioned Slices**; each Slice is printed one or more times,
producing **Prints** with sensor logs and video. The user can also see the live
condition of their **Printers**, control them, and push OTA updates. One 3D
workspace lets them toggle/overlay STL → toolpath → thermal simulation →
actual print result for the same part.

## Decisions (2026-06-22)

- **Stay in this monorepo; build the platform as a *new project alongside* the
  running apps.** The CI→GHCR→EC2 pipeline, the engines, the on-prem patterns,
  and git history are all here; a new repo re-pays for that to gain nothing.
  A new `projects/platform` gives the clean slate while the current `aslicer`,
  `avisualizer` (incl. the URDF viewer) stay deployed and visible. Grow the new
  app to parity, then cut over hostnames and retire the old web apps. Only the
  dead *desktop* Orbit (`webview2-host/`, PyInstaller scripts,
  `dist/meltio-orbit-releases/`) is removed now — the web apps keep running.
- **Central platform shell owns identity + data.** Users, orgs, parts, slices,
  prints, and printers live in *one* place, not bolted into each engine.
- **Modular monolith, not microservices, and one cohesive part pipeline.** The
  product is one continuum — geometry → slice → simulation → measured result —
  mirroring how `aslicer` already unifies slicing + thermal sim. The slice→sim
  and sim→point-cloud "gaps" are the same kind of gap (successive
  representations of one part), so they live together as modules in one backend,
  not in separate projects/services. Right for the scale; fewer containers, much
  easier on-prem. The frontend is a single 3D workspace over the same Part. The
  **one** genuine internal boundary is the future **C++ slicer core**, behind a
  stable Python API in `libs/slicer-core` (a language/build boundary, not a
  product one). open3d's native deps just install into the one image, as they
  already do for Orbit.
- **Multi-tenant-ready now, multi-tenant-billed later.** Put `org_id` on every
  row and scope every query from day one (cheap, agonizing to retrofit). Defer
  billing, per-tenant infra isolation, and signup flows — internal use and
  on-prem are single-org.
- **Static SPA frontend** (Vite + React or SvelteKit static/SPA mode). Compiles
  to static files at build time → zero runtime cost on the customer box. **No
  SSR / Node runtime in production** (would break "one artifact, three modes").
  **Doing it properly** (full SPA now, not the reuse-vanilla shortcut) — but the
  **visualization and look are preserved**: port the existing CSS and reuse the
  Three.js viewers as components the shell mounts by part/slice ID. The new work
  is the *shell* (login, file/Parts tree, navigation), not a visual redesign.
- **Naming.** Directory `projects/platform`; Python package `meltio_platform`
  (avoid shadowing the stdlib `platform` module). **No commercial/product name
  yet** — deferred; `meltio.cloud` stays the infra domain, not the product name.
- **Separate-repo-later stays cheap** (`git filter-repo` / `subtree split`).
  Keep the platform self-contained — no sideways imports into the legacy apps;
  shared code goes in `libs/`.
- **Printer channel = two planes.** MQTT for control/telemetry/OTA-signal;
  direct-to-object-store (presigned URLs) for bulk video/log uploads.

## Component architecture

A **modular monolith** — one platform backend with internal modules, not
microservices. Right for the scale (few users, fast iteration) and for on-prem
(fewer containers). Built as a new project beside the still-running legacy apps.

```
                         Browser (one static SPA)
                    shell + unified 3D workspace
                                  │ HTTP / WS
                                  ▼
        ┌──────────── platform backend (one service) ───────────┐
        │ auth/identity seam · users/orgs · file management      │
        │ part pipeline:  geometry → slice → simulation          │
        │ sensor module:  point-cloud / measured results · URDF  │
        │ fleet module:   printer telemetry · control · OTA      │
        │   → Postgres (metadata)       → object store (blobs)    │
        └───────────────┬───────────────────────┬───────────────┘
            libs/slicer-core (C++ later)         │ MQTT (control)
                                                 ▼
                                      Mosquitto ── printer agents
                                                   │ presigned PUT
                                                   ▼  object store
                                                (video, logs, OTA artifacts)
```

- **One cohesive part pipeline** (geometry → slice → simulation → measured
  result) as internal modules, mirroring how `aslicer` already unifies slicing +
  thermal sim. The current global single-user state (`_ViewerState`,
  single-`_SliceProgress`/`_ProcessingProgress`) is dropped — modules operate
  statelessly on a Part/Slice ID.
- **The one genuine internal boundary** is the future **C++ slicer core**,
  behind a stable Python API in `libs/slicer-core`.
- Hard deps: **Postgres** (metadata) + **object store** (S3 cloud / MinIO
  on-prem). **Mosquitto** is the one extra container (a broker); its handlers
  live in the fleet module. EMQX later only if clustering/dashboards are needed.
- **Legacy `aslicer` / `avisualizer` keep running** unchanged until the platform
  reaches parity and hostnames cut over.

## Unified 3D workspace

One Three.js scene with toggleable/overlayable layers for the same Part:
**STL mesh · toolpath · thermal simulation · printed result (sensor cloud)**.
Reuses today's rendering primitives; the new work is a unified scene
graph/camera/controls and a layer system.

> **Hard part:** overlaying these requires a **shared coordinate frame**.
> STL space, toolpath space, and sensor/print space must be registered (origin,
> orientation, scale) so they align in one scene. This was never required while
> they were separate apps. Treat **print↔part registration** as its own task,
> not a side effect of the merge.

## Identity & auth seam

"Who is the current user" sits behind one interface with two implementations:

- **Cloud:** trust Cloudflare Access — read the authenticated email from the
  `Cf-Access-Authenticated-User-Email` header (verify the `Cf-Access-Jwt-
  Assertion`). Provision a platform user on first sight.
- **On-prem:** local accounts or the customer's own OIDC (no Cloudflare on a
  private network).

Build this seam early; retrofitting identity is painful. Apps/engines never
hand-roll auth — they receive an authenticated principal from the platform.

## Tenancy

`org_id` on every row (users, parts, slices, prints, printers); every query
scoped by it. One org for internal/on-prem now. Billing, infra isolation, and
signup deferred until SaaS.

## Domain model (the spine)

```
Org ─┬─ User
     └─ Part ── STLFile ── SliceVersion (versioned → blob)
                              └── PrintRun ─┬─ sensor data  (→ blob; grows richer)
                                            ├─ log file     (→ blob)
                                            ├─ video[]      (→ blobs, typed by role:
                                            │                meltpool / wide-angle /
                                            │                interlayer-temp …)
                                            ├─ printer-state snapshot
                                            └─ metadata (materials, machine,
                                               maintenance state, outcome/labels)
     └─ Printer ── (telemetry, current job, firmware version)
```

A **Part is the shared folder/workspace.** All of a part's artifacts live under
one object-store prefix — `orgs/{org}/parts/{part_id}/stl|slices|prints/…` — so
the STL is just the simple entry point and g-code, sim results, and print results
accrue beside it in the same folder. STL bytes stream **through the app** (works
behind Cloudflare and on-prem with no public object-store endpoint); presigned
direct-to-store is reserved for the large print media (GB video/sensor files).

A **PrintRun is a container of typed artifacts, not a single CSV.** Each run
carries a (growing) sensor file, a log file, **one or more videos** keyed by
camera role, a printer-state snapshot, and structured metadata. Once this exists,
the folder/history view, "multiple slices per part," and "multiple prints per
slice" all fall out of it. Metadata in Postgres; large blobs (STL, slice output,
sensor data, logs, video, OTA artifacts) in the object store — uploaded via
presigned URLs and served back with HTTP **range requests** so the viewer can
seek to a specific video frame without downloading the whole file.

### Print data as an ML corpus (design for it now)

The print record is meant to feed machine learning — **tuning the thermal
simulation** and **defect detection surfaced back in the slicer.** The ML itself
is far off, but it shapes the data model from the start:

- **Structured, queryable metadata** (material, machine, maintenance state,
  parameters, outcome) so runs can be filtered/grouped into training sets. Core
  fields as typed columns; the evolving long tail in a **versioned JSON** field
  so the schema grows without a migration every time a sensor/field is added.
- **Labels/annotations are first-class** — pass/fail and defect annotations
  (type + region) attach to a PrintRun, and ideally to a location on the part
  (reusing the viewer's coordinate frame). Labels are what supervised models need.
- **Temporal alignment is a stored property.** Sensor samples carry timestamps;
  each video stores its time base (start offset + fps, or per-frame timestamps)
  so the viewer can map a sensor sample ↔ a video frame ("show the meltpool at
  this point in the load-cell trace"). Capture at ingest — painful to reconstruct.
- **Dataset export** (a filtered set of runs + aligned artifacts pulled out for
  offline training) is a first-class feature, not a later bolt-on.

## Printer channel

Two planes — conflating them is the classic mistake.

| Need | Plane | Mechanism |
|---|---|---|
| Post-print video, log files | **Bulk** | Direct-to-object-store via presigned URL (reuse the existing S3 upload pattern) |
| Live telemetry + control during print | **Control** | Persistent **outbound** MQTT from a device agent |
| OTA software updates | **Both** | Trigger/status over MQTT; signed artifact downloaded from object store |

- **Outbound by design.** The printer/agent dials out to the broker — same
  philosophy as the Cloudflare tunnel. Customer printers sit behind NAT; you
  rarely get an inbound port. On-prem the broker runs on the customer LAN, so
  telemetry never leaves the premises (a selling point).
- **Bulk never goes through MQTT or the app** — multi-GB files would choke the
  broker/edge. Presigned object-store uploads only.
- **OTA is the riskiest feature.** Signed + versioned artifacts, agent verifies
  signature before applying, staged rollout + automatic rollback on failed
  health check. Ships last, gets its own hardening pass.
- **Broker hygiene (cloud + on-prem):** per-device credentials/certs + TLS.

## Deployment — one artifact, three modes (+ beta)

The same Docker Compose stack is local dev, the internal AWS server, and on-prem
self-hosting; differences are env-driven (data roots, S3↔MinIO endpoint, auth
provider). New stack additions over today: **Postgres + object store + Mosquitto**.

- **Cloud:** existing EC2 + Cloudflare Tunnel/Access + GHCR push-to-deploy.
- **On-prem:** bundled Postgres + MinIO + Mosquitto containers; local/OIDC auth;
  no Cloudflare. The SPA adds **zero** runtime cost (static files served by the
  platform service). Offline-friendly.
- **Beta channel:** a second compose stack fed by a `beta` branch/tag, exposed
  at `beta.*.meltio.cloud` via another Cloudflare hostname. (≈ the roadmap's
  Phase 5 dev stack.) Lets you test without a full release.

## Frontend

Static SPA, built at image-build time. On-prem deployment impact ≈ nil (no Node
on the customer box). Cost is on *our* side: a Node/Vite build step in CI and
loss of today's zero-build vendored-Three.js simplicity. Acceptable given the
stateful UI (file tree, fleet dashboard, layered viewer). **Never SSR.**

## Phased roadmap

| Phase | Outcome |
|---|---|
| 0 | Scaffold new `projects/platform` (modular monolith) + `frontend/` + `libs/` **alongside** the still-running `aslicer`/`avisualizer`. Remove only the dead *desktop* Orbit. |
| 1 | Foundation: Postgres + object store in the stack; platform shell with auth-identity seam + user/org model. "You log in and the app knows who you are." |
| 2 | File management + Parts: STL upload → Part entity → folder/history UI. |
| 3 | Part pipeline: port slicing + thermal sim into the platform as stateless modules; persist **versioned** Slices to the object store. |
| 4 | Sensors + unified viewer: port the point-cloud/URDF modules; attach Prints/sensor logs to a Slice; one 3D workspace with layer toggles; solve part↔print registration. |
| 5 | Cutover: point hostnames at the platform; retire the legacy web apps once at parity. |
| 6 | Beta channel (cheap; can pull earlier for safer iteration). |
| 7 | Printer fleet: agent + Mosquitto, telemetry, live control, presigned bulk uploads. |
| 8 | OTA updates (signing, staged rollout, rollback). |
| 9 | Harden on-prem (bundled Postgres/MinIO/Mosquitto + local auth profile; licensing/offline). |

## Open risks / watch-items

- **Two alignments to capture at ingest, not reconstruct later:** *spatial*
  (part↔print coordinate registration — the unified viewer's hard part) and
  *temporal* (sensor sample ↔ video frame sync). Both are cheap at capture time.
- **OTA safety** — a bad update can brick a customer machine.
- **Stateless refactor of both engines** — they currently hold single-user
  module-global state; this is load-bearing for multi-user.
- **On-prem auth** — the one place the cloud SSO model doesn't transfer.
