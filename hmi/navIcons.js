// Bottom bar icons (2026-11-11/12, Maksim): the four buttons carry his web
// components -- <m600-front-door>, <m600-top-door>, <m600-materials-icon>,
// <m600-files-icon> -- plus the cat Easter egg behind the front door. The
// component files are his hand-off (static/ui/m600-*.js, registered by the app
// entry); this module is only the wiring:
//
//   - the two door icons get the REAL door position every time it changes
//     (injected as a 0..1 fraction, so nothing here touches the scene);
//   - the underline under each label (.nav-door-track) exists on all four
//     buttons; the doors light theirs from the moment the door starts to open
//     and release it the moment it starts to close;
//   - the cat plays on one random open in every block of 50 ("Door cat" in
//     Settings cycles 1 in 50 / every open / off);
//   - two host-side adjustments to the Materials icon he asked for, made
//     without editing his file: no wire, no spring at the end of the turn.
//
// DOM + pure logic, no THREE. Everything reached from update() memoizes what it
// last wrote: it runs every frame and must not touch the DOM unless a door
// actually moved (AGENTS.md rule 5).

export const DOOR_CAT_MODES = Object.freeze(["random50", "always", "off"]);
export const DOOR_CAT_BLOCK_SIZE = 50;
const DOOR_CAT_DEFAULT_MODE = "random50";
const DOOR_CAT_MODE_KEY = "m600.frontDoor.catMode";
const DOOR_CAT_BLOCK_KEY = "m600.frontDoor.catBlock";
const DOOR_CAT_LABELS = Object.freeze({
  random50: "Door cat: 1 in 50 opens",
  always: "Door cat: every open",
  off: "Door cat: off",
});
// Length of the Materials icon's activation turn once its spring is removed.
const NAV_MATERIALS_TURN_MS = 640;

export function createNavIconsUi({ getFrontDoorFraction, getTopCoverFraction, markUserActivity, createCatEgg, prefersReducedMotion }) {
  const navDoorToggleEl = document.getElementById("navDoorToggle");
  const navTopCoverEl = document.getElementById("annotationNavTopCover");
  const navMaterialsToggleEl = document.getElementById("navMaterialsToggle");
  const navFilesToggleEl = document.getElementById("navFilesToggle");
  const navFrontDoorIconEl = document.getElementById("navFrontDoorIcon");
  const navTopDoorIconEl = document.getElementById("navTopDoorIcon");
  const navMaterialsIconEl = document.getElementById("navMaterialsIcon");
  const settingsDoorCatButtonEl = document.getElementById("settingsDoorCatButton");

  // Last position sent to each door icon (-1 = nothing sent yet).
  const doorState = { front: { p: -1, motion: "idle" }, top: { p: -1, motion: "idle" } };
  // QA: { front: 0..1, top: 0..1 } pins the icon positions; null follows the doors.
  let preview = null;
  let catEgg = null;
  let catBlockFallback = null;

  // ---- sizing + underline ---------------------------------------------------

  function syncIconSize() {
    const nav = navDoorToggleEl ? navDoorToggleEl.closest(".bottom-nav") : null;
    // Any plain light-DOM glyph still in the bar gives the base icon height; the
    // CSS falls back to 46px (the pinned nav icon size) when there is none.
    const reference = nav
      ? Array.from(nav.querySelectorAll(".bottom-nav-item > svg")).find(
        (svg) => svg.getBoundingClientRect().height > 0,
      )
      : null;
    const height = reference ? reference.getBoundingClientRect().height : 0;
    if (nav && height > 0) {
      nav.style.setProperty("--nav-icon-h", `${height.toFixed(1)}px`);
    }
  }
  window.addEventListener("resize", syncIconSize);

  // The underline under the label of a bar button. Created once per button.
  function ensureTrack(buttonEl) {
    if (!buttonEl || buttonEl.querySelector(".nav-door-track")) {
      return;
    }
    const track = document.createElement("i");
    track.className = "nav-door-track";
    track.setAttribute("aria-hidden", "true");
    track.appendChild(document.createElement("b"));
    buttonEl.appendChild(track);
    syncIconSize();
  }

  // ---- cat Easter egg -------------------------------------------------------

  // What the egg module itself is told: it has no random mode, and any name it
  // does not know silently means "every 3rd". The 1-in-50 draw therefore lives
  // here: the module is held at "off" and play() is called on the picked open.
  function eggModeFor(mode) {
    return mode === "always" ? "always" : "off";
  }

  function newCatBlock() {
    return { n: 0, pick: Math.floor(Math.random() * DOOR_CAT_BLOCK_SIZE) };
  }

  function readCatBlock() {
    let block = catBlockFallback;
    try {
      const stored = JSON.parse(window.localStorage.getItem(DOOR_CAT_BLOCK_KEY) || "null");
      if (stored) {
        block = stored;
      }
    } catch (_error) {
      // storage blocked or unreadable: keep the in-memory block
    }
    const valid = block
      && Number.isInteger(block.n) && block.n >= 0 && block.n < DOOR_CAT_BLOCK_SIZE
      && Number.isInteger(block.pick) && block.pick >= 0 && block.pick < DOOR_CAT_BLOCK_SIZE;
    return valid ? { n: block.n, pick: block.pick } : newCatBlock();
  }

  // One call per completed opening. True exactly once in every block of 50
  // openings, at a position drawn at random when the block starts. The block is
  // persisted so a restart neither re-rolls it nor loses the count.
  function rollCat() {
    let block = readCatBlock();
    const plays = block.n === block.pick;
    block.n += 1;
    if (block.n >= DOOR_CAT_BLOCK_SIZE) {
      block = newCatBlock();
    }
    catBlockFallback = block;
    try {
      window.localStorage.setItem(DOOR_CAT_BLOCK_KEY, JSON.stringify(block));
    } catch (_error) {
      // storage blocked: the block lasts for this session only
    }
    return plays;
  }

  function readCatMode() {
    try {
      const stored = window.localStorage.getItem(DOOR_CAT_MODE_KEY);
      if (DOOR_CAT_MODES.includes(stored)) {
        return stored;
      }
    } catch (_error) {
      // storage blocked: fall through to the default
    }
    return DOOR_CAT_DEFAULT_MODE;
  }

  function applyCatMode(mode, { persist = false } = {}) {
    const next = DOOR_CAT_MODES.includes(mode) ? mode : DOOR_CAT_DEFAULT_MODE;
    if (persist) {
      try {
        window.localStorage.setItem(DOOR_CAT_MODE_KEY, next);
      } catch (_error) {
        // storage blocked: the choice lasts for this session only
      }
    }
    if (catEgg) {
      catEgg.mode = eggModeFor(next);
      if (next === "off") {
        catEgg.reset();
      }
    }
    if (settingsDoorCatButtonEl) {
      settingsDoorCatButtonEl.textContent = DOOR_CAT_LABELS[next];
    }
    return next;
  }

  function onFrontDoorOpened() {
    if (!catEgg || readCatMode() !== "random50") {
      return;
    }
    if (!rollCat()) {
      return;
    }
    // play() skips the egg module's own reduced-motion check, so it is repeated
    // here (the host answers: it owns the media query).
    if (prefersReducedMotion()) {
      return;
    }
    catEgg.play();
  }

  applyCatMode(readCatMode());
  if (settingsDoorCatButtonEl) {
    settingsDoorCatButtonEl.addEventListener("click", () => {
      markUserActivity();
      const current = readCatMode();
      applyCatMode(DOOR_CAT_MODES[(DOOR_CAT_MODES.indexOf(current) + 1) % DOOR_CAT_MODES.length], { persist: true });
    });
  }

  // ---- Materials icon -------------------------------------------------------

  // Without the wire that used to run up from the spool when the tab is
  // selected (Maksim, 2026-11-11). His file stays byte-identical and no
  // documented custom property reaches the wire, so it is hidden with one rule
  // in the icon's shadow root (the cat module adds its styles to the door icon
  // the same way). The spool turn stays.
  function hideMaterialsWire() {
    const root = navMaterialsIconEl ? navMaterialsIconEl.shadowRoot : null;
    if (!root || root.querySelector("#m600-nav-no-wire")) {
      return;
    }
    const style = document.createElement("style");
    style.id = "m600-nav-no-wire";
    style.textContent = ".wwrap{display:none}";
    root.appendChild(style);
  }
  if (typeof customElements !== "undefined") {
    customElements.whenDefined("m600-materials-icon").then(hideMaterialsWire);
  }

  // Without the spring at the end of its activation (Maksim, 2026-11-11:
  // "remove the last spring movement, activation and deactivation should
  // remain"). The component turns the spool back past its end position and lets
  // it bounce twice (-140 -> -106 -> -128 -> -117 -> -120 deg, 1.37 s). Its own
  // running animation is re-keyed right after it starts: one turn straight to
  // the end position, with the easing and length of its first segment, and then
  // it stops. The animation object is still the component's, so its interrupt /
  // reverse handling keeps working. Deactivation (two keyframes) is untouched.
  function removeMaterialsSpring(icon) {
    const spool = icon && icon.shadowRoot ? icon.shadowRoot.querySelector(".spool") : null;
    if (!spool || typeof spool.getAnimations !== "function") {
      return;
    }
    spool.getAnimations().forEach((animation) => {
      const effect = animation.effect;
      const frames = effect && typeof effect.getKeyframes === "function" ? effect.getKeyframes() : [];
      // Only the bouncing activation has more than two keyframes; the instant /
      // reduced-motion state has one and deactivation has two.
      if (frames.length <= 2) {
        return;
      }
      effect.setKeyframes([
        { transform: frames[0].transform, easing: "cubic-bezier(.3,.7,.3,1)" },
        { transform: "rotate(-120deg)" },
      ]);
      effect.updateTiming({ duration: NAV_MATERIALS_TURN_MS });
    });
  }

  // ---- door icons -----------------------------------------------------------

  // Send the door's position to its icon, only when it changed. `fraction` is
  // 0 (closed) .. 1 (open).
  function updateDoorIcon(buttonEl, iconEl, state, fraction) {
    let p = Math.min(1, Math.max(0, Number(fraction) || 0));
    // The components report "opened" only at exactly 1 and "closed" only at
    // exactly 0, while the joint transition ends within 1e-4 of its target.
    if (p < 0.001) {
      p = 0;
    } else if (p > 0.999) {
      p = 1;
    }
    if (Math.abs(p - state.p) > 0.0005) {
      const motion = state.p < 0 ? "idle" : (p > state.p ? "opening" : "closing");
      state.p = p;
      state.motion = motion;
      iconEl.setState({ position: p, motion });
      // Underline: lit from the moment the door starts to open, released the
      // moment it starts to close (aria-pressed only flips at half travel).
      buttonEl.classList.toggle("is-line-on", motion === "idle" ? p > 0.5 : motion === "opening");
    } else if (state.motion !== "idle") {
      state.motion = "idle";
      iconEl.setState({ motion: "idle" });
    }
  }

  // Until the custom element is registered the icon has no setState; skip the
  // door until it does (nothing is recorded as sent, so the first real call
  // delivers the current position).
  const isReady = (buttonEl, iconEl) => Boolean(buttonEl && iconEl && typeof iconEl.setState === "function");

  // Per frame.
  function update() {
    if (isReady(navDoorToggleEl, navFrontDoorIconEl)) {
      ensureTrack(navDoorToggleEl);
      if (!catEgg) {
        catEgg = createCatEgg(navFrontDoorIconEl, { mode: eggModeFor(readCatMode()) });
        navFrontDoorIconEl.addEventListener("door-opened", onFrontDoorOpened);
      }
      const pinned = preview && typeof preview.front === "number";
      updateDoorIcon(navDoorToggleEl, navFrontDoorIconEl, doorState.front, pinned ? preview.front : getFrontDoorFraction());
    }
    // Materials and Files carry the same underline; CSS lights it off the
    // selected state, so the element only has to exist.
    ensureTrack(navMaterialsToggleEl);
    ensureTrack(navFilesToggleEl);
    if (isReady(navTopCoverEl, navTopDoorIconEl)) {
      ensureTrack(navTopCoverEl);
      const pinned = preview && typeof preview.top === "number";
      updateDoorIcon(navTopCoverEl, navTopDoorIconEl, doorState.top, pinned ? preview.top : getTopCoverFraction());
    }
  }

  return {
    update,
    removeMaterialsSpring,
    // QA hooks (the app entry exposes them on window for reference renders).
    setPreview(override) { preview = override || null; },
    setCatMode: (mode) => applyCatMode(mode, { persist: true }),
    rollCat,
  };
}
