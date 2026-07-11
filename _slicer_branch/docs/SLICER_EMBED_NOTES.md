# Slicer embed + mobile viewport notes

The slicer (`meltio_platform/slicer/web/static/`, vanilla JS + Three.js) is loaded
**inside the React shell as an `<iframe>`** (`src="/slicer/?embed=1"`). The shell
hides the slicer's own `.plat-header` via the `embed` class and shows its own.
This split is the source of most mobile layout gotchas — read this before touching
slicer sizing.

## Gotcha: mobile WebKit sizes an iframe to its content height

On iOS Safari / Chrome (all WebKit), an `<iframe>` is sized to its **content
height**, ignoring the CSS height (`flex: 1`, `height: 100%`, etc.) the shell
gives it. The slicer's bottom-anchored UI (the mobile sheet at `bottom: 8px`) then
sits at the bottom of an over-tall iframe — **below the visible screen**.

Symptom: "the menu opens past the bottom of the screen" on a real phone, while it
looks fine in desktop Chrome / headless tests (Chromium sizes iframes by CSS, so
it does **not** reproduce this).

### Fix (two coordinated pieces — keep both)

1. **Shell pins the iframe height** to the visible area below the header. See the
   `view === "slicer"` effect in `frontend/src/App.tsx`:
   `f.style.height = window.innerHeight - f.getBoundingClientRect().top`, updated on
   resize. This overrides WebKit's content-sizing.
2. **Slicer sizes against `--app-h`, not `vh`/`dvh`.** `vh`/`dvh` inside an iframe
   can resolve against the **top-level** page on iOS (taller than the iframe).
   `app.js` sets `--app-h = window.innerHeight + "px"` on load/resize
   (`syncViewportHeight()`); CSS uses `calc(var(--app-h, 100dvh) - …)` for the
   mobile bottom sheet and the Profile Manager dialog.

**Rule of thumb:** inside the slicer, never size a full-height element with
`vh`/`dvh`. Use `--app-h` (the real iframe height via `window.innerHeight`), or
`%` of `html/body { height: 100% }` (e.g. `#scene`).

## Mobile menu structure

Desktop uses the full side `.panel`. Mobile (≤640px) hides it and uses a top-right
rail (`#sectionRail`) of expandable options — Model / Slice / Preview / Graph,
gated by `body[data-section="…"]`. Only one opens at a time (it becomes a
near-full-width sheet at the bottom); tabs toggle via the rail only (no
close-on-outside-click — it fought 3D touch interaction). Section→tab mapping is by
`data-group` on each `.panel-section` (`model` / `slice` / `preview`); the Graph
tab shows `#thermalChart` and is enabled only when it has data.

## If mobile layout keeps fighting the iframe

A full rewrite of the slicer into React is **not** recommended (weeks of work). The
smaller escalation is to render the **control panels in the shell DOM** and keep
only the WebGL canvas in the iframe — that removes the panels from the iframe
viewport entirely. Left as a documented option, not done.
