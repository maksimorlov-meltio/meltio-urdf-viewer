# Meltio platform — style guide

The single source of truth for how the platform looks. The **slicer**
(`meltio_platform/slicer/web/static/styles.css`) defined this language first; the
React shell (`frontend/src/styles.css`) and every new surface follow it.

> **When you add a UI element, reuse a token and a component class below.**
> Don't introduce new hex colors, ad-hoc border styles, or one-off button looks.
> If something genuinely new is needed, add a token here first, then use it.

## Design tokens (CSS variables on `:root`)

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0f1620` | App background |
| `--panel` | `#131c27` | Cards, menus, panels |
| `--panel2` | `#0f1822` | Recessed areas, inputs-on-panel |
| `--fg` | `#cfe8ff` | Primary text |
| `--muted` | `#7e94aa` | Secondary text, captions, meta |
| `--accent` | `#76b3ff` | Focus, active, links, primary affordance |
| `--accent-soft` | `rgba(74,163,255,0.18)` | Selected/primary fill, drag target, active tab |
| `--line` | `rgba(118,179,255,0.16)` | Dividers, card/panel borders |
| `--control-bg` | `#16202c` | Buttons, selects, inputs |
| `--control-border` | `rgba(118,179,255,0.40)` | Buttons, selects, inputs |
| `--danger` | `#c2606a` | Destructive text/border |
| `--ok` | `#8fe0b4` | Success / "yes" marks |
| `--radius` | `6px` | Buttons, inputs, small chips |
| `--radius-lg` | `10px` | Cards, menus, panels |

Type: `"Segoe UI", system-ui, sans-serif`. Base 14px; **controls 13px**;
captions 12px. Section captions: 11px, `font-weight:600`, `uppercase`,
`letter-spacing:0.08em`, color `--muted` (the `.section-title` class).

## Components

- **Button** — `.tool-btn` (or bare `button` in the slicer): `--control-bg`,
  `1px solid --control-border`, `--radius`, 13px. Hover ⇒ `border-color:--accent`.
- **Primary button** — add `.primary`: fill `--accent-soft`, border `--accent`,
  `font-weight:600`. **Tinted, never a solid blue block.**
- **Destructive** — add `.danger`: red text/border, same shape.
- **Select / input** — same box as a button (`--control-bg` + `--control-border`
  + `--radius`). The slicer's `.control` class is the canonical form.
- **Card** — `.card`: `--panel`, `1px solid --line`, `--radius-lg`, ~1.1rem pad.
- **Segmented toggle** — `.segmented` (slicer): one bordered box, equal columns,
  checked segment uses `--accent-soft` + bold.
- **Table** — header row in `--muted`; cells separated by `1px solid --line`.
- **Hover row actions** — overlay the right edge with a fade
  (`linear-gradient(90deg, transparent, <hover-bg>)`); never let them consume
  layout width (keeps labels/meta from clipping).

## Principles (Dieter Rams, applied)

1. One quiet button style; reserve the tinted primary for the main action only.
2. Borders are thin and blue-tinted, not heavy gray frames.
3. Captions and meta are `--muted`; never compete with content.
4. Spacing and radius are consistent (`--radius` / `--radius-lg`); don't invent.
5. Color carries meaning sparingly: accent = interactive, ok = yes, danger = remove.
