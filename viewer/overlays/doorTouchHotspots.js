// Touch hotspots on the 3D machine: a DOUBLE TAP on the front door or on the
// top lid opens it (open only -- closing stays on the bottom-nav buttons); a
// panel may also carry a LONG PRESS action (the Materials card).
// Lives under viewer/overlays/ because it listens on the canvas and floats a
// DOM hint over the view.
// There is no marker painted on the panel: the panel itself is the button.
//
// Decisions (Maksim): 2026-09-16 gesture = double tap, action = open only.
// 2026-09-17 the handle / latch outlines were removed and the hit zone widened
// from the handle to the WHOLE panel -- "remove the highlighting of the handles
// and make it possible to double tap on the top lid and front door to open it".
// A single tap still shows a short hint at the finger, which is now the only
// thing advertising that the gesture exists.
//
// Hit testing costs one raycast per TAP and none per pointer move: casting
// ~900k triangles on every mouse motion is exactly what this avoids. Hits are
// walked nearest-first, so occlusion comes out exact for free -- the chassis in
// front of a door, or the back panel behind it, swallows the tap. A panel only
// answers while its door is closed and controllable (isEnabled), so a tap can
// never ask for something that has already happened.
//
// Rendering discipline: the viewer draws on demand (see animate()). This module
// owns no scene objects, so it never dirties a frame at rest; it asks for one
// only when a door actually opens.

const DOUBLE_TAP_MAX_GAP_MS = 400;
const DOUBLE_TAP_MAX_DISTANCE_PX = 30;
const TAP_MAX_MOVE_PX = 8;
const HINT_VISIBLE_MS = 1400;

/** Small floating hint ("Double-tap to open ..."), shown at the finger. */
function buildHintElement() {
  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  el.style.cssText = [
    "position:fixed", "z-index:250", "pointer-events:none", "display:none",
    "transform:translate(-50%,-100%)", "padding:5px 9px", "border-radius:7px",
    "background:#12161a", "color:#e8eaed", "border:1px solid rgba(255,255,255,0.30)",
    "font:600 11.5px/1.2 'IBM Plex Sans','Segoe UI',system-ui,sans-serif", "letter-spacing:0.01em",
    "white-space:nowrap", "box-shadow:none", "opacity:0", "transition:opacity 140ms ease",
  ].join(";");
  document.body.appendChild(el);
  return el;
}

/**
 * @param {object} deps
 * @param {typeof import("three")} deps.THREE
 * @param {THREE.Camera} deps.camera
 * @param {HTMLCanvasElement} deps.canvas
 * @param {() => THREE.Object3D | null} deps.getRobotRoot
 * @param {(event: PointerEvent, target: THREE.Vector2) => THREE.Vector2 | null} deps.getPointerNdc
 * @param {() => void} deps.requestRender
 * @param {Array<{id: string, linkName: string, hint?: string,
 *          isEnabled: () => boolean, activate: () => void}>} deps.hotspots
 *   linkName = the URDF link whose own mesh is the button. A tap counts only
 *   when that link is the NEAREST `link:` ancestor of the mesh under the
 *   finger, so a child link is not part of the panel -- which is what keeps the
 *   lid's two gas springs from acting as a lid-sized button.
 */
export function createDoorTouchHotspots(deps) {
  const {
    THREE,
    camera,
    canvas,
    getRobotRoot,
    getPointerNdc,
    requestRender,
  } = deps;

  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();

  /** Panels keyed by link name, so a raycast hit maps straight onto one. */
  const entries = new Map();
  for (const def of deps.hotspots) {
    entries.set(def.linkName, { hint: "Double-tap to open", ...def });
  }

  const hintEl = buildHintElement();

  let hintUntilMs = -Infinity;
  let hintId = null;
  let lastTap = null; // { t, x, y }
  let pointerDownAt = null; // { x, y }
  let consumedDoubleTapAtMs = -Infinity;

  function isEnabled(entry) {
    try {
      return Boolean(entry.isEnabled());
    } catch {
      return false;
    }
  }

  /** A mesh is only tappable when nothing above it is hidden: THREE's raycaster
   *  ignores `visible`, so the chiller or the wire drum would otherwise swallow
   *  taps aimed at the machine while switched off. */
  function isShown(object, root) {
    for (let o = object; o && o !== root.parent; o = o.parent) {
      if (o.visible === false) return false;
    }
    return true;
  }

  function nearestLink(object) {
    let o = object;
    while (o && !(o.name || "").startsWith("link:")) o = o.parent;
    return o || null;
  }

  /** The panel under the pointer, or null. Nearest-first, so the first solid
   *  machine part under the finger decides; if that part is not an openable
   *  panel the tap is swallowed rather than passed through to a door behind it.
   *  Objects with no `link:` ancestor are scene decoration (toolpath tubes, the
   *  dust plume) and are stepped over instead of blocking. */
  function hitTest(event) {
    const root = getRobotRoot();
    if (!root) return null;
    const ndc = getPointerNdc(event, pointerNdc);
    if (!ndc) return null;
    raycaster.setFromCamera(ndc, camera);
    for (const hit of raycaster.intersectObject(root, true)) {
      const object = hit.object;
      if (!object.isMesh || !isShown(object, root)) continue;
      const link = nearestLink(object);
      if (!link) continue;
      const entry = entries.get(link.name.slice("link:".length));
      return entry && isEnabled(entry) ? entry : null;
    }
    return null;
  }

  /** The hint follows the finger: there is no longer anything painted on the
   *  panel to anchor it to. */
  function showHint(entry, clientX, clientY) {
    hintId = entry.id;
    hintUntilMs = performance.now() + HINT_VISIBLE_MS;
    hintEl.textContent = entry.hint;
    hintEl.style.display = "block";
    hintEl.style.left = `${Math.round(clientX)}px`;
    hintEl.style.top = `${Math.round(clientY - 14)}px`;
    // Next tick so the display change lands before the fade-in. A timer, not
    // requestAnimationFrame: rAF is throttled while the tab is hidden and the
    // hint would then never fade in.
    setTimeout(() => { if (hintId === entry.id) hintEl.style.opacity = "1"; }, 0);
  }

  function hideHint() {
    hintId = null;
    hintEl.style.opacity = "0";
    hintEl.style.display = "none";
  }

  // Long press (2026-11-10): holding still on a panel whose definition has a
  // `longPress(clientX, clientY)` runs it after LONG_PRESS_MS. The press is then
  // spent: its release is neither a tap nor half of a double tap.
  const LONG_PRESS_MS = 550;
  let longPressTimer = null;
  function cancelLongPress() {
    if (longPressTimer !== null) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  function onPointerDown(event) {
    cancelLongPress();
    if (event.pointerType === "mouse" && event.button !== 0) {
      pointerDownAt = null;
      return;
    }
    pointerDownAt = { x: event.clientX, y: event.clientY };
    const entry = hitTest(event);
    if (entry && typeof entry.longPress === "function") {
      const x = event.clientX;
      const y = event.clientY;
      longPressTimer = setTimeout(() => {
        longPressTimer = null;
        if (!pointerDownAt || !isEnabled(entry)) {
          return;
        }
        pointerDownAt = null; // spent: the release is not a tap
        lastTap = null;
        hideHint();
        try {
          entry.longPress(x, y);
        } finally {
          requestRender();
        }
      }, LONG_PRESS_MS);
    }
  }

  function onPointerMove(event) {
    if (longPressTimer !== null && pointerDownAt
      && Math.hypot(event.clientX - pointerDownAt.x, event.clientY - pointerDownAt.y) > TAP_MAX_MOVE_PX) {
      cancelLongPress(); // it became a drag (orbit)
    }
  }

  function onPointerUp(event) {
    cancelLongPress();
    if (!pointerDownAt) {
      return;
    }
    const moved = Math.hypot(event.clientX - pointerDownAt.x, event.clientY - pointerDownAt.y);
    pointerDownAt = null;
    if (moved > TAP_MAX_MOVE_PX) {
      lastTap = null; // a drag (orbit) is never half of a double tap
      return;
    }
    const now = performance.now();
    const tap = { t: now, x: event.clientX, y: event.clientY };
    const isDouble =
      lastTap &&
      now - lastTap.t <= DOUBLE_TAP_MAX_GAP_MS &&
      Math.hypot(tap.x - lastTap.x, tap.y - lastTap.y) <= DOUBLE_TAP_MAX_DISTANCE_PX;
    lastTap = isDouble ? null : tap;
    const entry = hitTest(event);
    if (!entry) {
      return;
    }
    if (!isDouble) {
      // First tap on the panel: say what it does, since nothing marks it.
      showHint(entry, event.clientX, event.clientY);
      return;
    }
    hideHint();
    consumedDoubleTapAtMs = now;
    try {
      entry.activate();
    } finally {
      requestRender();
    }
  }

  function onPointerCancel() {
    cancelLongPress();
    pointerDownAt = null;
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointercancel", onPointerCancel);
  canvas.addEventListener("pointerleave", onPointerCancel);

  /** Per-frame: only the hint has a lifetime now, and hiding it touches the DOM
   *  rather than the scene, so this never requests a redraw. */
  function update(nowMs) {
    if (hintId && nowMs >= hintUntilMs) {
      hideHint();
    }
  }

  /** True shortly after a double tap opened a panel (lets other dblclick
   *  handlers — e.g. cloud-STL relocation — stand down). */
  function consumedDoubleTapRecently(windowMs = 350) {
    return performance.now() - consumedDoubleTapAtMs <= windowMs;
  }

  /** Debug: camera world position (to tell which side of the machine is front). */

  return { update, consumedDoubleTapRecently, hitTest };
}
