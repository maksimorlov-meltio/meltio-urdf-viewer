// Tiny, framework-free i18n for the viewer.
//
// Usage:
//   import { t, applyDomTranslations } from "./i18n/index.js";
//   el.textContent = t("nav.files");        // in JS-driven copy
//   applyDomTranslations();                  // hydrate static HTML (see below)
//
// Static HTML: mark elements with a data attribute; keep the English text inline
// as a pre-hydration fallback (so the UI always reads correctly). applyDomTranslations()
// then overwrites from the active locale:
//   <span data-i18n="nav.files">Files</span>
//   <button data-i18n-attr="aria-label:nav.play">…</button>   (attrs; "a:key; b:key2")
//
// ---- Adding a second locale later (no framework, no code hunt) ----------------
//   1. Copy en.js -> fr.js and translate the VALUES (keep the keys).
//   2. Register + activate it here:
//        import fr from "./fr.js";
//        LOCALES.fr = fr;
//        // pick from ?lang= / localStorage / navigator.language, e.g.:
//        setLocale(new URLSearchParams(location.search).get("lang") || "en");
//   3. That's it — t() and applyDomTranslations() render the active locale.
import en from "./en.js";

const LOCALES = { en };
let activeCode = "en";
let dict = LOCALES[activeCode];

export function setLocale(code) {
  if (LOCALES[code]) {
    activeCode = code;
    dict = LOCALES[code];
    applyDomTranslations();
  }
  return activeCode;
}

export function getLocale() {
  return activeCode;
}

// Look up a key. Falls back to the explicit `fallback`, else the key itself, so
// a missing string is visible (as its key) rather than blank.
export function t(key, fallback) {
  const value = dict[key];
  if (value !== undefined) return value;
  return fallback !== undefined ? fallback : key;
}

// Hydrate static markup: [data-i18n] sets textContent; [data-i18n-attr] sets one
// or more attributes ("aria-label:key; title:key2").
export function applyDomTranslations(root = document) {
  if (!root || typeof root.querySelectorAll !== "function") return;
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll("[data-i18n-attr]").forEach((el) => {
    el.dataset.i18nAttr.split(";").forEach((pair) => {
      const idx = pair.indexOf(":");
      if (idx < 0) return;
      const attr = pair.slice(0, idx).trim();
      const key = pair.slice(idx + 1).trim();
      if (attr && key) el.setAttribute(attr, t(key));
    });
  });
}
