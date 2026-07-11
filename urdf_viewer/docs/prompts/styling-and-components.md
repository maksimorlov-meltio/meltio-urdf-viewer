# Prompt: Refine `/urdf` Styling & Componentize the UI

> Hand this file to a coding agent. It is a **styling + component-quality** brief for the
> Meltio M600-PRO URDF viewer touchscreen UI. Treat it as *surgical refinement of an
> already-mature dark UI* — **not** a redesign, not a reskin, not a framework migration.

---

## Role & mindset

You are a senior frontend engineer improving a **production industrial-machine touchscreen**
(kiosk-style, dark theme, runs on the M600-PRO printer). The existing design is already good:
a coherent dark aesthetic driven by a real CSS token system. Your job is to raise the polish
and kill component duplication **without** disturbing the system that already works.

Follow the repo's own taste rules (`urdf_viewer/.github/copilot-instructions.md`):
avoid generic AI-looking layouts, improve typography/spacing/hierarchy/rhythm intentionally,
audit before redesigning, and make **specific, code-level** improvements — not vague
suggestions or a from-scratch rewrite.

## Files in scope

- `projects/avisualizer/src/avisualizer/web/static/urdf.html` — page structure
- `projects/avisualizer/src/avisualizer/web/static/urdf_viewer.css` (~5.7k lines) — all styling
- `projects/avisualizer/src/avisualizer/web/static/urdf_viewer.js` (~14.6k lines) — behavior;
  touch **only** to introduce template/factory helpers that remove markup duplication

Bump the `?v=` query params on the `<link>`/`<script>` tags in `urdf.html` when you change
CSS/JS, so the kiosk browser cache invalidates.

---

## Hard constraints (do not violate)

1. **Extend the existing token system — never replace it.** The `:root` block in
   `urdf_viewer.css` defines the whole language: `--ui-surface-*`, `--ui-border-*`,
   `--ui-text-*`, `--ui-accent*`, `--ui-space-1..5`, `--ui-radius-sm/md/lg/xl`, the
   typography scale, `--ui-shadow-*`, and state tokens (`--ui-state-selected-*`,
   `--ui-tap-min`). New styles must **consume** these tokens. If you need a new value, add a
   **new token** to `:root` and reference it — do not hard-code raw `rgba()`/px in rules.
   (The file still has legacy hard-coded rgba in places; prefer converting those to tokens
   over adding more.)
2. **No framework.** This is vanilla Three.js + ES modules. "Better components" here means
   **reusable CSS component classes + JS template/factory functions** — NOT React/Vue/Svelte,
   no build step, no new runtime dependencies.
3. **Preserve all behavior, routes, APIs, IDs, and ARIA.** Every element `id`, event binding,
   `aria-*`, `role`, and `data-*` hook must keep working. `urdf_viewer.js` binds by `id` — do
   not rename or remove them. Keep keyboard focus order and `:focus-visible` rings intact.
4. **Touch target floor:** interactive elements stay `>= var(--ui-tap-min)` (36px). This is a
   finger-driven touchscreen; do not shrink hit areas for the sake of density.
5. **Dark-first.** There is a `Light Mode` toggle — don't regress it. Test both if you touch
   shared surfaces.

---

## What to improve (priority order)

### 1. Componentize the duplicated spool cards *(highest value)*

The spool-card markup is copy-pasted **4+ times** with near-identical structure and diverging
detail levels:

- `hotspotSpoolCard1` / `hotspotSpoolCard2` (files menu, full detail)
- `filesSpoolCard1` / `filesSpoolCard2` (files menu, condensed, currently `hidden`)
- `materialsSpoolCard1` / `materialsSpoolCard2` (materials popup, full detail)

Each is a `<button class="spool-select-card">` with header, material line, and
Initial/Used/Left/Status data rows. This is the clearest "better components" target in the
codebase.

**Do:** define a single canonical `spool-select-card` component — either a JS factory/template
that renders a card from a data object (spool id, material, initial/used/left grams, status),
or an HTML `<template>` cloned and populated. Collapse the 3 variants into one component with a
`data-variant="full|condensed"` modifier for the density difference. Preserve every existing
`id` the JS reads/writes (e.g. `#materialsSpool1Amount`, `#hotspotSpool2Status`) — the factory
should assign them.

Elevate the card visually while you're there: it currently reads as a plain button. Give it
genuine card treatment using tokens — `--ui-surface-2`/`-3` background, `--ui-radius-md`,
`--ui-border-subtle` resting / `--ui-state-selected-border` when `aria-pressed="true"`, a
clear selected state, and tabular-nums for the gram figures (`font-variant-numeric`).

### 2. Reduce "wall of identical buttons" — add component hierarchy

Right now nearly every action is the same flat gradient button
(`.controls-panel button, .cloud-model-popup button`). Introduce a small, **explicit** button
hierarchy as reusable classes (built on existing tokens):

- **Primary / commit action** — use the existing `--ui-button-primary-*` tokens (they exist but
  are barely used). Apply to true commit actions: `Confirm Material`, `Save` (calendar),
  `Unlock` (PIN), primary `Print`/`Prepare`.
- **Secondary / default** — the current gradient button (keep as the baseline).
- **Quiet / tertiary** — lower-emphasis for `Reset View`, `Close`, `Cancel`, `Clear resolved`.
- **Toggle** — pressed state via `aria-pressed="true"` should be visually unmistakable and
  consistent everywhere (reuse `--ui-state-selected-*`). Today toggles like the transparency
  buttons, source filters, and calendar view buttons each style pressed state differently —
  unify them.

Goal: a glance should reveal *which* action commits vs. dismisses vs. toggles. Do this with
shared classes, not per-`id` overrides.

### 3. Section & panel rhythm

- `.control-subpanel` is currently border-less, `transparent`, `padding: 10px`. On a long
  scrolling Controls panel the sections blur together. Give sections gentle visual separation
  — a subtle `--ui-border-subtle` divider or a faint `--ui-surface-*` grouping — using the
  spacing scale (`--ui-space-*`) for consistent vertical rhythm. Keep it restrained; this is a
  dense control surface, not a marketing page.
- `.control-subpanel h3` uppercase labels are fine — ensure consistent `letter-spacing`,
  weight, and the muted-caption treatment across *all* section headers (`Controls`, `Files`,
  `Materials`, `Slicer`, `Calendar`, modal titles).
- Audit spacing for a consistent scale — replace stray `8px`/`10px`/`6px` literals with
  `--ui-space-*` so the rhythm is systematic, not ad hoc.

### 4. Component consistency pass across popups & modals

The topbar notification center, settings menu, files/cloud popup, materials popup, slicer
pane, calendar screen, and the modals (PIN, timeout warning, notification details, calendar
event) are all separately styled surfaces. Bring them to one shared vocabulary:

- One **overlay/popup surface** treatment (background, border, radius, shadow) from tokens.
- One **popup/modal header** pattern (title + close button) — the current close buttons vary
  (some text "Close", some `cloud-header-icon-button` X). Standardize.
- One **modal card** treatment for the dialog-role modals.
- Consistent empty states (`.empty-state`, `.cloud-file-library-empty`,
  `.calendar-empty-state` should look like siblings).

### 5. Status & feedback microstyling

- `.status-line` already has nice `data-state` dots (`ok`/`loading`/`error`) — extend the same
  semantic language to the many `.control-note` status lines (`Cloud: idle`, `Motion: idle`,
  material warnings) so state is communicated by color/icon consistently, using
  `--ui-success`/`--ui-warning`/`--ui-error`.
- The connection dot, notification badge, and advanced-mode indicator should share one "status
  pill/badge" component style.

---

## Explicitly OUT of scope

- **The robot mesh showing "Mesh: loading..."** is a **functional/asset-loading bug**, not a
  styling issue. Do **not** attempt to fix model loading here. (Note: because the mesh may not
  render during review, do your visual QA against whatever the scene shows and don't assume the
  empty viewport is a style problem.)
- **The off-canvas Controls panel** (hidden behind the "Menu" toggle, `body.controls-panel-*`
  classes) is an **intentional kiosk pattern** — keeping the 3D view unobstructed on a machine
  touchscreen. Do **not** "fix" it by pinning it open. At most, improve toggle **discoverability**
  (clearer affordance/label/icon) if it genuinely reads as hidden — and only as a minor touch.
- No new features, no route changes, no backend/API changes, no dependency additions.

---

## Deliverable & self-check

Produce the CSS/HTML/JS edits directly, then verify:

1. `/urdf` renders with **no new console errors** (there is a pre-existing favicon 404 and a
   benign password-field DOM notice — ignore those).
2. Open each surface and confirm nothing broke: Controls (Menu), Files, Materials, Slicer,
   Notifications, Settings (+ Advanced/Calibrate submenus), Calendar, and each modal.
3. Toggle `Light Mode` and confirm shared surfaces still read correctly.
4. Confirm every previously-working button/toggle still fires (IDs preserved).
5. Grep your diff for hard-coded `rgba(`/px added outside `:root` — convert to tokens.
6. Summarize what you changed as: new tokens added, new component classes/factories, and
   duplication removed (esp. the spool-card consolidation) — with before/after line counts.

Keep every change **token-driven, reversible, and consistent with the existing dark
industrial aesthetic.** When in doubt, restraint over novelty.
