// Mounts the REAL urdf.html under jsdom, so hmi/ modules can be tested against
// the DOM they actually ship against.
//
// Why the real page and not a synthesised fixture: several modules reach inside
// an element (`card.querySelector(".spool-select-icon")`,
// `popup.querySelector(".materials-menu-popup-header")`), which a flat
// div-per-id fixture would not have. Using the page itself also means the
// fixture cannot drift — and a test breaks if someone deletes an element a
// module needs, which is exactly the failure AGENTS.md rule 6 is about.
//
// Scripts are NOT executed: jsdom's default runScripts leaves them inert, so
// mounting the page costs a parse and nothing else. Modules are then imported
// deliberately, one at a time, by the test.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..", "..");
const URDF_HTML = join(REPO_ROOT, "apps", "dev-host", "src", "avisualizer",
  "web", "static", "urdf.html");

let mounted = null;

/** Install the real page as the global document/window. Idempotent per process:
 *  hmi/ modules capture their elements at import time, so every test file that
 *  imports one must mount BEFORE that import and keep the same document. */
export function mountUrdfDom() {
  if (mounted) return mounted;

  const dom = new JSDOM(readFileSync(URDF_HTML, "utf8"), {
    url: "http://127.0.0.1:8090/urdf",
    pretendToBeVisual: true,
  });

  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  // node >= 21 exposes a read-only global `navigator`, so plain assignment
  // throws. Modules that need it read window.navigator anyway; redefine for the
  // few that reach for the bare global (locale sniffing).
  Object.defineProperty(globalThis, "navigator", {
    value: dom.window.navigator, configurable: true, writable: true,
  });
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Element = dom.window.Element;
  globalThis.Event = dom.window.Event;
  globalThis.CustomEvent = dom.window.CustomEvent;
  globalThis.localStorage = dom.window.localStorage;
  globalThis.sessionStorage = dom.window.sessionStorage;
  globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

  mounted = { dom, window: dom.window, document: dom.window.document };
  return mounted;
}

/** `#id` shorthand that fails loudly. A module silently no-ops on a missing
 *  element, so a test asserting "nothing happened" against a typo would pass. */
export function el(id) {
  const found = globalThis.document.getElementById(id);
  if (!found) throw new Error(`urdf.html has no #${id} — did the markup change?`);
  return found;
}

/** Dispatch a real click, the way the operator's finger would. */
export function click(id) {
  el(id).dispatchEvent(new globalThis.window.MouseEvent("click", {
    bubbles: true, cancelable: true,
  }));
}
