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
