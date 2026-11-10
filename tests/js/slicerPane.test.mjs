// The embedded-slicer pane (hmi/slicerPane.js), against the real urdf.html.
//
// The rules worth pinning here are the ones that produced reported bugs or that
// guard something: the flyout may only open where it makes sense, the docked
// variant must not take the whole screen, leaving full view must stop the
// iframe polling (except on the deliberate preserveIframe detour that exists
// because a reload lost the slice), and the postMessage sender check must fail
// closed when there is no iframe.
import test from "node:test";
import assert from "node:assert/strict";

import { mountUrdfDom, el } from "./support/domFixture.mjs";

mountUrdfDom();
const { createSlicerPaneUi } = await import("../../hmi/slicerPane.js");
const flow = await import("../../hmi/state/printFlowState.js");

let cloudMenuOpen = true;
let selectedFile = "";
const calls = [];

globalThis.fetch = async () => ({
  ok: true,
  json: async () => ({ configured: true, url: "/slicer" }),
});

const pane = createSlicerPaneUi({
  markUserActivity: () => calls.push("activity"),
  updateBottomNavState: () => calls.push("bottomNav"),
  isCloudModelMenuOpen: () => cloudMenuOpen,
  getCloudModelPopupEl: () => globalThis.document.getElementById("cloudModelPopup"),
  getSelectedFileName: () => selectedFile,
  setSelectedCloudLibraryFile: (file) => calls.push(`select:${file}`),
  setCloudFileRowSliceStatus: (file, status) => calls.push(`status:${file}:${status}`),
  loadCloudOverlayFromSelectedFile: async () => calls.push("warmSlice"),
});

function reset({ cloudOpen = true, docked = false, file = "" } = {}) {
  cloudMenuOpen = cloudOpen;
  selectedFile = file;
  calls.length = 0;
  flow.setFilesListCollapsedForPrint(docked);
  pane.setMenuOpen(false);
  calls.length = 0;
}

test("the flyout will not open when neither the Files menu nor a docked print is up", () => {
  // Opening it anywhere else would strand a panel anchored to a hidden popup.
  reset({ cloudOpen: false, docked: false });
  pane.setMenuOpen(true);
  assert.equal(pane.isMenuOpen(), false);
  assert.equal(el("slicerPane").hidden, true);
  assert.equal(el("slicerPane").getAttribute("aria-hidden"), "true");
});

test("opening from the Files menu takes the whole view for slicing", () => {
  reset({ cloudOpen: true, docked: false });
  pane.setMenuOpen(true);

  assert.equal(pane.isMenuOpen(), true);
  assert.equal(pane.isFullscreen(), true);
  assert.ok(globalThis.document.body.classList.contains("slicer-fullscreen"));
  assert.equal(el("slicerPane").hidden, false);
});

test("opening while a print is docked stays compact — it is the print flyout", () => {
  // Taking the whole screen mid-print would hide the machine and the Stop
  // control. The docked variant is the upward flyout above the bottom nav.
  reset({ cloudOpen: false, docked: true });
  pane.setMenuOpen(true);

  assert.equal(pane.isMenuOpen(), true);
  assert.equal(pane.isFullscreen(), false, "must NOT go fullscreen while docked");
  assert.equal(globalThis.document.body.classList.contains("slicer-fullscreen"), false);
});

test("closing always leaves full view", () => {
  reset();
  pane.setMenuOpen(true);
  assert.equal(pane.isFullscreen(), true);

  pane.setMenuOpen(false);
  assert.equal(pane.isMenuOpen(), false);
  assert.equal(pane.isFullscreen(), false);
  assert.equal(globalThis.document.body.classList.contains("slicer-fullscreen"), false);
});

test("every open and close tells the bottom nav to re-evaluate", () => {
  reset();
  pane.setMenuOpen(true);
  pane.setMenuOpen(false);
  assert.equal(calls.filter((c) => c === "bottomNav").length, 2);
});

test("leaving full view stops the iframe so it is not polling in the background", () => {
  reset();
  pane.loadIframeForFile("part.stl");
  assert.match(el("slicerFrame").getAttribute("src"), /^\/slicer\?dock=1&stl=/);

  pane.setFullscreen(false);
  assert.equal(el("slicerFrame").getAttribute("src"), "about:blank");
  assert.equal(el("slicerFrame").hidden, true);
  assert.equal(el("slicerEmbedWrap").hidden, true);
});

test("preserveIframe keeps the loaded slice alive on the Materials detour", () => {
  // The reported "lost slice" bug: blanking the iframe here means a reload, the
  // fresh slicer emits a mesh-only update, and the row's "ready" status is
  // cleared. Returning from Materials must find the same sliced view.
  reset();
  pane.loadIframeForFile("part.stl");
  const src = el("slicerFrame").getAttribute("src");

  pane.setFullscreen(false, { preserveIframe: true });
  assert.equal(el("slicerFrame").getAttribute("src"), src, "the iframe must not be blanked");
  assert.equal(el("slicerEmbedWrap").hidden, false);
});

test("the iframe URL carries the dock layout and the STL, both encoded", () => {
  reset();
  pane.loadIframeForFile("a file & more.stl");
  const src = el("slicerFrame").getAttribute("src");
  assert.ok(src.startsWith("/slicer?dock=1&stl="), src);
  const stl = decodeURIComponent(src.split("&stl=")[1]);
  assert.ok(stl.endsWith("/api/stl/file?name=a%20file%20%26%20more.stl"),
    `the file name must survive encoding: ${stl}`);
});

test("load-to-slicer marks the flow, the row and the label, and warms the slice", async () => {
  reset({ cloudOpen: true, file: "widget.stl" });
  flow.setAutoSliceFlowActive(false);

  pane.loadFileToSlicer("widget.stl");
  assert.equal(flow.autoSliceFlowActive, true,
    "only this flow may auto-open/collapse menus");
  assert.ok(calls.includes("select:widget.stl"));
  assert.ok(calls.includes("status:widget.stl:slicing"));
  assert.equal(pane.isMenuOpen(), true, "the full slicer opens for the chosen file");
  assert.equal(el("slicerChosenFile").textContent, "File: widget.stl");

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(calls.includes("warmSlice"), "the viewer-side slice is warmed behind it");
});

test("load-to-slicer does not force the menu open when Files is closed", () => {
  reset({ cloudOpen: false, file: "widget.stl" });
  pane.loadFileToSlicer("widget.stl");
  assert.equal(pane.isMenuOpen(), false);
});

test("the chosen-file label falls back to a plain message", () => {
  reset({ file: "" });
  pane.updateChosenFileLabel();
  assert.equal(el("slicerChosenFile").textContent, "No file selected");

  selectedFile = "thing.stl";
  pane.updateChosenFileLabel();
  assert.equal(el("slicerChosenFile").textContent, "File: thing.stl");
});

test("the embed toggle flips the wrap, the label and the pane class", () => {
  reset();
  pane.setEmbedOpen(true);
  assert.equal(el("slicerEmbedWrap").hidden, false);
  assert.equal(el("slicerEmbedToggle").textContent, "Hide full slicer");
  assert.equal(el("slicerEmbedToggle").getAttribute("aria-expanded"), "true");
  assert.ok(el("slicerPane").classList.contains("slicer-embed-open"));

  pane.setEmbedOpen(false);
  assert.equal(el("slicerEmbedWrap").hidden, true);
  assert.equal(el("slicerEmbedToggle").textContent, "Open full slicer");
  assert.equal(el("slicerPane").classList.contains("slicer-embed-open"), false);
});

test("an unconfigured slicer degrades to a placeholder, not a broken frame", async () => {
  reset();
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ configured: false }) });
  await pane.refreshEmbed({ force: true });

  assert.equal(pane.getEmbedState(), "unavailable");
  assert.equal(el("slicerFallback").hidden, false);
  assert.match(el("slicerFallback").textContent, /AVIS_SLICER_URL/);
  assert.equal(el("slicerFrame").hidden, true);
});

test("an unreachable slicer says so instead of throwing", async () => {
  reset();
  globalThis.fetch = async () => { throw new Error("boom"); };
  await pane.refreshEmbed({ force: true });

  assert.equal(pane.getEmbedState(), "unavailable");
  assert.match(el("slicerFallback").textContent, /Could not reach slicer status \(boom\)/);
});

test("a configured slicer is embedded and cached until forced", async () => {
  reset();
  let statusCalls = 0;
  globalThis.fetch = async () => {
    statusCalls += 1;
    return { ok: true, json: async () => ({ configured: true, url: "/slicer" }) };
  };

  await pane.refreshEmbed({ force: true });
  assert.equal(pane.getEmbedState(), "ready");
  assert.equal(el("slicerFrame").hidden, false);

  await pane.refreshEmbed();
  assert.equal(statusCalls, 1, "a ready embed is not re-fetched without force");

  await pane.refreshEmbed({ force: true });
  assert.equal(statusCalls, 2);
});

test("a non-200 status is a failure, not a configured slicer", async () => {
  reset();
  globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
  await pane.refreshEmbed({ force: true });
  assert.equal(pane.getEmbedState(), "unavailable");
  assert.match(el("slicerFallback").textContent, /HTTP 503/);
});

test("the sender check exposes the iframe's window and never the host's", () => {
  // The host authenticates slicer messages with `event.source ===
  // getFrameWindow()`, not with the spoofable event.data.source string, because
  // a slicer message can start a print. Returning the host window here would
  // make every same-page message authenticate as the slicer.
  const frameWindow = pane.getFrameWindow();
  assert.notEqual(frameWindow, globalThis.window,
    "the host window must never pass as the slicer");
  assert.equal(frameWindow, el("slicerFrame").contentWindow,
    "it must be the iframe's own window, whatever that is");
});

test("clearAnchoredGeometry drops the inline anchor so CSS can take over", () => {
  reset();
  pane.setMenuOpen(true);
  el("slicerPane").style.left = "500px";
  el("slicerPane").style.top = "100px";
  el("slicerPane").style.maxHeight = "300px";

  pane.clearAnchoredGeometry();
  assert.equal(el("slicerPane").style.left, "");
  assert.equal(el("slicerPane").style.top, "");
  assert.equal(el("slicerPane").style.maxHeight, "");
});

test("the docked position opens upward off the bottom nav, not from the top", () => {
  reset({ cloudOpen: false, docked: true });
  pane.setMenuOpen(true);
  // Leave a stale Files-anchored top behind: the docked layout must clear it,
  // not merely happen to find it empty.
  el("slicerPane").style.top = "180px";
  pane.positionMenuDocked();

  const style = el("slicerPane").style;
  assert.equal(style.top, "", "top must be cleared or it fights the bottom anchor");
  assert.equal(style.left, "50%");
  assert.equal(style.transform, "translateX(-50%)");
  assert.ok(style.bottom.endsWith("px"), `bottom should be measured, got '${style.bottom}'`);
  assert.ok(style.maxHeight.endsWith("px"));
});

test("positioning is skipped while fullscreen and while docked", () => {
  reset();
  pane.setMenuOpen(true);           // fullscreen
  el("slicerPane").style.left = "42px";
  pane.positionMenu();
  assert.equal(el("slicerPane").style.left, "42px",
    "fullscreen geometry belongs to CSS; positionMenu must not touch it");

  reset({ cloudOpen: true, docked: true });
  pane.setMenuOpen(true);
  el("slicerPane").style.left = "43px";
  pane.positionMenu();
  assert.equal(el("slicerPane").style.left, "43px",
    "the detached corner belongs to CSS while the list is collapsed");
  flow.setFilesListCollapsedForPrint(false);
});

test("a hidden pane is never positioned", () => {
  reset();
  el("slicerPane").hidden = true;
  el("slicerPane").style.left = "7px";
  pane.positionMenu();
  pane.positionMenuDocked();
  assert.equal(el("slicerPane").style.left, "7px");
});

// --- Platform mode: the Meltio platform's slicer, proxied same-origin --------
// The backend answers `mode: "platform"` when AVIS_PLATFORM_URL is set. The
// current slicer opens platform PARTS, not STL URLs, so "Load to slicer" first
// hands the file over (POST /api/slicer/part-from-file) and only then frames
// `/slicer/?embed=1&part=<id>`. These pin the URL shapes the platform depends
// on, the hand-off order, and the sender check on its `slice-saved` message.

function platformStatus() {
  return {
    ok: true,
    json: async () => ({
      configured: true, mode: "platform", url: "/slicer/", embedQuery: "embed=1",
    }),
  };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test("platform mode embeds /slicer/?embed=1 and opens files as platform parts", async () => {
  reset({ cloudOpen: true, file: "bracket.stl" });
  const requests = [];
  globalThis.fetch = async (url, init = {}) => {
    requests.push({ url, method: init.method || "GET", body: init.body });
    if (url === "/api/slicer/status") return platformStatus();
    if (url === "/api/slicer/part-from-file") {
      return { ok: true, json: async () => ({ partId: "part-9", name: "bracket.stl", reused: false }) };
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  await pane.loadStatus({ force: true });
  assert.equal(pane.getMode(), "platform");

  await pane.refreshEmbed({ force: true });
  assert.match(el("slicerFrame").getAttribute("src"), /^\/slicer\/\?embed=1/,
    "trailing slash (its frontend fetches relative api/...) and embed=1, never dock=1");

  const partId = await pane.loadPlatformPartForFile("bracket.stl");
  assert.equal(partId, "part-9");
  const upload = requests.find((r) => r.url === "/api/slicer/part-from-file");
  assert.equal(upload.method, "POST");
  assert.deepEqual(JSON.parse(upload.body), { name: "bracket.stl" });
  assert.equal(el("slicerFrame").getAttribute("src"), "/slicer/?embed=1&part=part-9");
  assert.equal(el("slicerFrame").hidden, false);
  assert.equal(el("slicerEmbedWrap").hidden, false);
});

test("in platform mode loadIframeForFile never builds the legacy stl URL", async () => {
  reset({ file: "bracket.stl" });
  let resolveUpload = null;
  globalThis.fetch = async (url) => {
    if (url === "/api/slicer/status") return platformStatus();
    return new Promise((resolve) => { resolveUpload = resolve; });
  };
  await pane.loadStatus({ force: true });
  el("slicerFrame").setAttribute("src", "about:blank");

  pane.loadIframeForFile("bracket.stl");
  assert.equal(el("slicerFrame").getAttribute("src"), "about:blank",
    "no ?dock=1&stl= URL may be framed while the hand-off is pending");
  assert.match(el("slicerFallback").textContent, /Sending bracket\.stl to the platform/);

  resolveUpload({ ok: true, json: async () => ({ partId: "p1" }) });
  await tick(); await tick(); await tick();
  assert.equal(el("slicerFrame").getAttribute("src"), "/slicer/?embed=1&part=p1");
});

test("a refused hand-off is reported in the pane, not thrown", async () => {
  reset({ file: "bracket.stl" });
  globalThis.fetch = async (url) => {
    if (url === "/api/slicer/status") return platformStatus();
    return {
      ok: false, status: 502,
      json: async () => ({ detail: "Platform refused the part upload: HTTP 403" }),
    };
  };
  await pane.loadStatus({ force: true });

  pane.loadIframeForFile("bracket.stl");
  await tick(); await tick(); await tick();
  assert.equal(el("slicerFallback").hidden, false);
  assert.match(el("slicerFallback").textContent,
    /Could not hand bracket\.stl to the platform \(Platform refused the part upload: HTTP 403\)/);
});

test("slice-saved from OUR iframe badges the row; anything else is ignored", async () => {
  reset({ file: "bracket.stl" });
  globalThis.fetch = async (url) => {
    if (url === "/api/slicer/status") return platformStatus();
    return { ok: true, json: async () => ({ partId: "part-9" }) };
  };
  await pane.loadStatus({ force: true });
  await pane.loadPlatformPartForFile("bracket.stl");
  calls.length = 0;
  const origin = globalThis.window.location.origin;
  const frameWindow = pane.getFrameWindow();
  const saved = { type: "slice-saved", partId: "part-9", version: 3 };

  // Right shape, wrong sender: a spoofed message from another frame or tab.
  assert.equal(pane.handleFrameMessage({ source: globalThis.window, origin, data: saved }), false);
  // Right sender, wrong origin: would mean the platform's own origin got framed.
  assert.equal(pane.handleFrameMessage({ source: frameWindow, origin: "http://platform.test", data: saved }), false);
  assert.deepEqual(calls, []);

  assert.equal(pane.handleFrameMessage({ source: frameWindow, origin, data: saved }), true);
  assert.ok(calls.includes("status:bracket.stl:saved"));
  assert.deepEqual(pane.getLastPlatformSlice(), { partId: "part-9", version: 3, fileName: "bracket.stl" });

  // Legacy bridge messages are the host's business, not this handler's.
  assert.equal(pane.handleFrameMessage({
    source: frameWindow, origin, data: { source: "meltio-slicer", type: "slice-data" },
  }), false);
});

test("legacy status without a mode keeps the dock=1 embed", async () => {
  reset();
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ configured: true, url: "/slicer" }) });
  await pane.loadStatus({ force: true });
  assert.equal(pane.getMode(), "legacy");
  await pane.refreshEmbed({ force: true });
  assert.match(el("slicerFrame").getAttribute("src"), /^\/slicer\?dock=1/);
});

test("the Files button is a pure toggle of the pane: open takes the view, press again closes", async () => {
  // No Files list is involved: the pane must open with the cloud menu CLOSED.
  reset({ cloudOpen: false });
  globalThis.fetch = async (url) => {
    if (url === "/api/slicer/status") return platformStatus();
    throw new Error(`unexpected fetch ${url}`);
  };
  await pane.loadStatus({ force: true });

  assert.equal(pane.toggleFromNav(), true);
  assert.equal(pane.isOpenedFromNav(), true);
  assert.equal(pane.isMenuOpen(), true);
  assert.equal(pane.isFullscreen(), true, "pressed: the platform slicer takes the view");
  assert.equal(el("slicerPane").style.left, "", "never anchored to the (closed) Files popup");
  await tick(); await tick();
  assert.match(el("slicerFrame").getAttribute("src"), /^\/slicer\/\?embed=1/);

  assert.equal(pane.toggleFromNav(), false, "pressed again: it goes away");
  assert.equal(pane.isOpenedFromNav(), false);
  assert.equal(pane.isMenuOpen(), false);
  assert.equal(pane.isFullscreen(), false);
  assert.equal(el("slicerFrame").getAttribute("src"), "about:blank");
});

test("the pane's own close button also releases the Files button", async () => {
  reset({ cloudOpen: false });
  globalThis.fetch = async () => platformStatus();
  await pane.loadStatus({ force: true });
  pane.toggleFromNav();
  assert.equal(pane.isOpenedFromNav(), true);

  el("slicerMenuClose").click();
  assert.equal(pane.isMenuOpen(), false);
  assert.equal(pane.isOpenedFromNav(), false, "the nav button must read unpressed again");
  assert.ok(calls.includes("bottomNav"), "the bottom nav is told to re-evaluate");
});

test("without a configured slicer the toggle still opens and shows the fallback text", async () => {
  reset({ cloudOpen: false });
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ configured: false }) });
  await pane.loadStatus({ force: true });
  assert.equal(pane.toggleFromNav(), true);
  await tick(); await tick();
  assert.equal(el("slicerFallback").hidden, false);
  assert.match(el("slicerFallback").textContent, /AVIS_PLATFORM_URL/);
  pane.toggleFromNav();
});

test("in platform mode, Load to slicer does not warm the legacy slice or badge 'slicing'", async () => {
  // The warm slice is a 503 in platform mode, and its failure path would race
  // the "Saved to platform" badge that slice-saved sets. The flow still opens
  // the full view and hands the file over.
  reset({ cloudOpen: true, file: "bracket.stl" });
  globalThis.fetch = async (url) => {
    if (url === "/api/slicer/status") return platformStatus();
    return { ok: true, json: async () => ({ partId: "p1" }) };
  };
  await pane.loadStatus({ force: true });
  calls.length = 0;

  pane.loadFileToSlicer("bracket.stl");
  await tick(); await tick(); await tick();
  assert.ok(calls.includes("select:bracket.stl"));
  assert.equal(calls.includes("warmSlice"), false, "no viewer-side slice in platform mode");
  assert.equal(calls.includes("status:bracket.stl:slicing"), false);
  assert.equal(pane.isMenuOpen(), true);
  assert.equal(el("slicerFrame").getAttribute("src"), "/slicer/?embed=1&part=p1");
});
