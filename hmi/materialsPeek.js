// Materials card (Maksim, 2026-11-10): with the Materials menu closed, a long
// press on the materials door / a spool / a drum in the 3D view pops up a small
// read-only card -- what is loaded on the feeder(s) and how much is left. The
// door shows both feeders, a drum shows its own feeder. Any next touch
// dismisses it, and it leaves by itself after a few seconds.
//
// DOM only. The scene side (which part was pressed) is the host's: it calls
// show() with the feeder keys and the finger position.
import {
  hotspotMaterialAssignments,
  spoolManualAmountGramsByKey,
  spoolRemainingAmountGramsByKey,
  getMaterialLabelById,
  getSpoolInitialAmountText,
  getSpoolRemainingAmountText,
  getSpoolStatusState,
} from "./state/materialsState.js";

const MATERIALS_PEEK_VISIBLE_MS = 6000;
const VIEWPORT_MARGIN_PX = 12;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function createMaterialsPeekUi({ isMaterialsMenuOpen, feederFeedType }) {
  let cardEl = null;
  let hideTimer = null;

  function hide() {
    if (hideTimer !== null) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    if (cardEl) {
      cardEl.hidden = true;
    }
  }

  function div(className, text) {
    const el = document.createElement("div");
    el.className = className;
    if (text !== undefined) {
      el.textContent = text;
    }
    return el;
  }

  function buildRow(spoolKey) {
    const isDrum = feederFeedType[spoolKey] === "drum";
    const assigned = hotspotMaterialAssignments[spoolKey];
    const leftGrams = Math.max(0, Number(spoolRemainingAmountGramsByKey[spoolKey]) || 0);
    const loadedGrams = Math.max(0, Number(spoolManualAmountGramsByKey[spoolKey]) || 0);
    const fraction = loadedGrams > 0 ? clamp(leftGrams / loadedGrams, 0, 1) : (leftGrams > 0 ? 1 : 0);
    const status = getSpoolStatusState(spoolKey);

    const row = div("materials-peek-row");
    const head = div("materials-peek-head");
    const name = document.createElement("span");
    name.className = "materials-peek-feeder";
    name.textContent = `${spoolKey === "spool2" ? "Feeder 2" : "Feeder 1"} \u00b7 ${isDrum ? "Drum" : "Spool"}`;
    const chip = document.createElement("span");
    chip.className = `materials-peek-status ${status.className || ""}`.trim();
    chip.textContent = status.label || "";
    head.append(name, chip);

    const bar = div("materials-peek-bar");
    const fill = document.createElement("span");
    fill.style.width = `${Math.round(fraction * 100)}%`;
    bar.append(fill);

    row.append(
      head,
      div("materials-peek-material", assigned ? getMaterialLabelById(assigned) : "No material assigned"),
      bar,
      div("materials-peek-amount", loadedGrams > 0
        ? `${getSpoolRemainingAmountText(spoolKey)} left of ${getSpoolInitialAmountText(spoolKey)}`
        : `${getSpoolRemainingAmountText(spoolKey)} left`),
    );
    return row;
  }

  function ensureCard() {
    if (cardEl) {
      return cardEl;
    }
    cardEl = div("materials-peek");
    cardEl.setAttribute("role", "status");
    cardEl.hidden = true;
    document.body.appendChild(cardEl);
    // Any next touch anywhere dismisses the card (capture: before the canvas).
    document.addEventListener("pointerdown", (event) => {
      if (cardEl && !cardEl.hidden && !cardEl.contains(event.target)) {
        hide();
      }
    }, true);
    return cardEl;
  }

  // Show the card for these feeders ("spool1" / "spool2") above the finger.
  function show(spoolKeys, clientX, clientY) {
    if (isMaterialsMenuOpen()) {
      return false;
    }
    const card = ensureCard();
    card.replaceChildren(
      div("materials-peek-title", "Materials"),
      ...spoolKeys.map(buildRow),
      div("materials-peek-hint", "Double-tap to open Materials"),
    );
    card.hidden = false;
    // Above the finger, kept inside the viewport; below it when the top bar is in the way.
    const rect = card.getBoundingClientRect();
    const left = clamp(clientX - rect.width / 2, VIEWPORT_MARGIN_PX,
      Math.max(VIEWPORT_MARGIN_PX, window.innerWidth - rect.width - VIEWPORT_MARGIN_PX));
    let top = clientY - rect.height - 28;
    if (top < VIEWPORT_MARGIN_PX + 70) {
      top = clientY + 36;
    }
    top = clamp(top, VIEWPORT_MARGIN_PX, Math.max(VIEWPORT_MARGIN_PX, window.innerHeight - rect.height - VIEWPORT_MARGIN_PX));
    card.style.left = `${Math.round(left)}px`;
    card.style.top = `${Math.round(top)}px`;
    if (hideTimer !== null) {
      clearTimeout(hideTimer);
    }
    hideTimer = setTimeout(hide, MATERIALS_PEEK_VISIBLE_MS);
    return true;
  }

  return { show, hide, isVisible: () => Boolean(cardEl && !cardEl.hidden) };
}
