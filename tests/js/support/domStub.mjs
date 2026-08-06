// Minimal DOM stub for importing hmi/ modules in node, WITHOUT jsdom.
//
// Several hmi/ modules resolve their elements at module scope
// (`const fooEl = document.getElementById("foo")`), so importing them in node
// throws before a single function runs. Every one of those lookups is guarded
// with `if (el)`, so a `document` that answers `null` to everything is enough
// to import the module and exercise its PURE logic — normalisation, filters,
// thresholds, signal mapping.
//
// This is deliberately not a DOM implementation. Anything that needs elements
// to actually exist (rendering, listener wiring) uses tests/js/support/
// domFixture.mjs, which mounts the real urdf.html under jsdom.
//
// Usage — install BEFORE the dynamic import, because the module body runs at
// import time:
//
//     import { installDomStub } from "./support/domStub.mjs";
//     installDomStub();
//     const { normalizeCloudLibraryEntry } = await import("../../hmi/fileLibrary.js");

function inertElement() {
  const el = {
    style: { setProperty() {}, removeProperty() {} },
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    children: [],
    hidden: false,
    textContent: "",
    innerHTML: "",
    value: "",
    appendChild(child) { el.children.push(child); return child; },
    removeChild() {},
    insertBefore(child) { el.children.push(child); return child; },
    append() {},
    remove() {},
    setAttribute() {},
    removeAttribute() {},
    getAttribute: () => null,
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    closest: () => null,
    contains: () => false,
    focus() {},
    getBoundingClientRect: () => ({ x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 }),
  };
  return el;
}

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(String(k)) ? map.get(String(k)) : null),
    setItem: (k, v) => { map.set(String(k), String(v)); },
    removeItem: (k) => { map.delete(String(k)); },
    clear: () => map.clear(),
  };
}

let installed = null;

export function installDomStub() {
  if (installed) return installed;

  const body = inertElement();
  const documentStub = {
    body,
    documentElement: inertElement(),
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => inertElement(),
    createTextNode: () => inertElement(),
    addEventListener() {},
    removeEventListener() {},
  };

  const windowStub = {
    document: documentStub,
    localStorage: memoryStorage(),
    sessionStorage: memoryStorage(),
    innerWidth: 1080,
    innerHeight: 1920,
    devicePixelRatio: 1,
    location: { origin: "http://127.0.0.1", search: "", href: "http://127.0.0.1/urdf" },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    addEventListener() {},
    removeEventListener() {},
    setTimeout: (...args) => setTimeout(...args),
    clearTimeout: (...args) => clearTimeout(...args),
    setInterval: (...args) => setInterval(...args),
    clearInterval: (...args) => clearInterval(...args),
    requestAnimationFrame: (fn) => setTimeout(() => fn(Date.now()), 0),
    cancelAnimationFrame: (id) => clearTimeout(id),
    alert() {},
  };
  windowStub.window = windowStub;

  globalThis.window = windowStub;
  globalThis.document = documentStub;
  globalThis.localStorage = windowStub.localStorage;
  globalThis.sessionStorage = windowStub.sessionStorage;

  installed = { window: windowStub, document: documentStub };
  return installed;
}
