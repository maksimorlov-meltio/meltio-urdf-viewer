// Design System listbox for <select> elements (2026-10-13, Maksim: "I don't
// like the material drop-down style"). The native popup cannot be styled, so
// the <select> stays in the DOM as the OWNER of the value + change event (all
// existing code keeps reading/writing `select.value`), hidden behind a DS
// trigger button and a DS panel:
//
//   trigger  44 px, hairline border (.14 rest / .30 hover), 7 px radius, mono
//            label of the selected option, chevron at the right
//   panel    control ground #12161a, .30 hairline, 7 px radius, 44 px rows,
//            selected row = ink text + check; max 7 rows then scrolls
//
// Programmatic `select.value = x` updates the trigger label too (the instance
// gets a value accessor that forwards to the prototype and refreshes).
// Options are read from the <select> every time the panel opens, so lists
// rebuilt later (material library) need no extra wiring.

const CHEVRON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m6 9 6 6 6-6"/></svg>';
const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 6 9 17l-5-5"/></svg>';

let openInstance = null;
let globalListenersInstalled = false;

function closeOpen() {
  if (openInstance) openInstance.close();
}

// Installed on first use, not at import: the hmi modules are also imported by
// the Node unit tests, where there is no document.
function installGlobalListeners() {
  if (globalListenersInstalled || typeof document === "undefined") return;
  globalListenersInstalled = true;
  document.addEventListener("pointerdown", (event) => {
    if (!openInstance) return;
    const t = event.target;
    if (openInstance.trigger.contains(t) || openInstance.panel.contains(t)) return;
    openInstance.close();
  }, true);
  document.addEventListener("keydown", (event) => {
    if (openInstance && event.key === "Escape") openInstance.close();
  });
  window.addEventListener("resize", closeOpen);
  window.addEventListener("scroll", closeOpen, true);
}

/**
 * @param {HTMLSelectElement} select
 * @param {{placeholder?: string}} [options]
 */
export function enhanceSelect(select, options = {}) {
  if (!select || typeof document === "undefined" || select.dataset.dsSelect === "on") return null;
  installGlobalListeners();
  select.dataset.dsSelect = "on";
  const placeholder = options.placeholder || "";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "ds-select-trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  if (select.id) trigger.setAttribute("aria-labelledby", select.id + "Label");
  const ariaLabel = select.getAttribute("aria-label");
  if (ariaLabel) trigger.setAttribute("aria-label", ariaLabel);
  const labelEl = document.createElement("span");
  labelEl.className = "ds-select-label";
  trigger.appendChild(labelEl);
  trigger.insertAdjacentHTML("beforeend", CHEVRON);

  const panel = document.createElement("div");
  panel.className = "ds-select-panel";
  panel.setAttribute("role", "listbox");
  panel.hidden = true;

  select.hidden = true;
  select.setAttribute("aria-hidden", "true");
  select.tabIndex = -1;
  select.insertAdjacentElement("afterend", trigger);
  document.body.appendChild(panel);

  function refreshLabel() {
    const selected = select.selectedOptions && select.selectedOptions[0];
    const text = selected ? selected.textContent.trim() : "";
    labelEl.textContent = text || placeholder;
    labelEl.classList.toggle("is-placeholder", !text || !select.value);
    trigger.disabled = Boolean(select.disabled);
  }

  // Programmatic value writes refresh the trigger label.
  const proto = Object.getPrototypeOf(select);
  const desc = Object.getOwnPropertyDescriptor(proto, "value") || Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
  if (desc && desc.set && desc.get) {
    Object.defineProperty(select, "value", {
      configurable: true,
      get() { return desc.get.call(this); },
      set(v) { desc.set.call(this, v); refreshLabel(); },
    });
  }
  select.addEventListener("change", refreshLabel);
  new MutationObserver(refreshLabel).observe(select, { childList: true, subtree: true, attributes: true });

  function position() {
    const r = trigger.getBoundingClientRect();
    panel.style.left = `${Math.round(r.left)}px`;
    panel.style.width = `${Math.round(r.width)}px`;
    const spaceBelow = window.innerHeight - r.bottom - 12;
    const spaceAbove = r.top - 12;
    const wanted = Math.min(panel.scrollHeight, 7 * 44 + 8);
    if (spaceBelow >= Math.min(wanted, 180) || spaceBelow >= spaceAbove) {
      panel.style.top = `${Math.round(r.bottom + 6)}px`;
      panel.style.bottom = "";
      panel.style.maxHeight = `${Math.max(120, Math.min(wanted, spaceBelow))}px`;
    } else {
      panel.style.top = "";
      panel.style.bottom = `${Math.round(window.innerHeight - r.top + 6)}px`;
      panel.style.maxHeight = `${Math.max(120, Math.min(wanted, spaceAbove))}px`;
    }
  }

  function build() {
    panel.innerHTML = "";
    for (const opt of select.options) {
      if (opt.hidden) continue;
      const row = document.createElement("button");
      row.type = "button";
      row.className = "ds-select-option";
      row.setAttribute("role", "option");
      const isSelected = opt.selected;
      row.setAttribute("aria-selected", isSelected ? "true" : "false");
      row.disabled = Boolean(opt.disabled);
      row.dataset.value = opt.value;
      const text = document.createElement("span");
      text.textContent = opt.textContent.trim() || placeholder;
      row.appendChild(text);
      if (isSelected) row.insertAdjacentHTML("beforeend", CHECK);
      row.addEventListener("click", () => {
        if (select.value !== opt.value) {
          select.value = opt.value;
          select.dispatchEvent(new Event("change", { bubbles: true }));
        }
        instance.close();
        trigger.focus();
      });
      panel.appendChild(row);
    }
  }

  const instance = {
    trigger,
    panel,
    select,
    open() {
      if (openInstance && openInstance !== instance) openInstance.close();
      build();
      panel.hidden = false;
      position();
      trigger.setAttribute("aria-expanded", "true");
      openInstance = instance;
      const selectedRow = panel.querySelector('[aria-selected="true"]');
      if (selectedRow) selectedRow.scrollIntoView({ block: "nearest" });
    },
    close() {
      panel.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      if (openInstance === instance) openInstance = null;
    },
    refresh: refreshLabel,
  };

  trigger.addEventListener("click", () => {
    if (trigger.disabled) return;
    if (panel.hidden) instance.open(); else instance.close();
  });
  trigger.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const opts = [...select.options].filter((o) => !o.hidden && !o.disabled);
      const i = opts.findIndex((o) => o.selected);
      const next = opts[Math.max(0, Math.min(opts.length - 1, i + (event.key === "ArrowDown" ? 1 : -1)))];
      if (next && !next.selected) {
        select.value = next.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
  });

  refreshLabel();
  return instance;
}
