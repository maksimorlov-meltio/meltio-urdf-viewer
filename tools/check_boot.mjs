#!/usr/bin/env node
// Boot check: load /urdf in a real browser and fail on ANY console error.
//
//   node tools/check_boot.mjs                      # needs the viewer on :8090
//   node tools/check_boot.mjs --url http://.../urdf --screenshot boot.png
//
// For a refactor that must change nothing, capture the DOM footprint first and
// assert against it after (see "Boot footprint" below):
//
//   node tools/check_boot.mjs --footprint before.txt
//   ...move the code...
//   node tools/check_boot.mjs --expect-footprint before.txt
//
// Why this exists, and why it is not part of gate.sh:
//
// On 2026-08-04 commit 515877b left `notificationsUi.setCenterOpen(false)` in a
// dep thunk that createSettingsUi() invokes from its own boot tail, 40 lines
// before notificationsUi is assigned. The resulting TypeError killed the whole
// module before the URDF loader ran: no models, blank scene. It survived two
// days and nine merges with all nine gates green, because NOT ONE OF THEM
// STARTS THE APPLICATION. `node --check` parses, eslint lints, jsdom mounts
// individual modules — none of that executes the boot sequence end to end.
//
// This does. It is deliberately absolute: one uncaught exception, one
// console.error, one failed request outside the documented allowlist, and the
// check fails. There is no "known bad" list, on purpose (see
// tools/check_dead_lookups.mjs for what a ratchet turns into).
//
// It lives outside gate.sh because it needs a running server and ~40 s of
// software-rendered GLB loading; gate.sh must stay fast and offline. CI runs it
// as its own job.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// --- Options -----------------------------------------------------------------
function optionValue(flag, fallback) {
  const at = process.argv.indexOf(flag);
  return at !== -1 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
}

const URL_UNDER_TEST = optionValue("--url", "http://127.0.0.1:8090/urdf");
const SCREENSHOT = optionValue("--screenshot", null);
// Capture the post-settle DOM footprint, or assert against a captured one.
const FOOTPRINT_OUT = optionValue("--footprint", null);
const FOOTPRINT_EXPECT = optionValue("--expect-footprint", null);
const HARD_TIMEOUT_MS = Number(optionValue("--timeout", "180000"));
const DEBUG_PORT = Number(optionValue("--port", "9422"));
// The page is considered settled once no request has been in flight for this
// long. The GLB set is ~140 MB and parses slowly under software rendering, so
// a fixed sleep is either flaky or wasteful; quiet-network is neither.
const QUIET_MS = 3000;

// The slicer is optional (AVIS_SLICER_URL / AVIS_SLICER_UI_URL, see CLAUDE.md).
// With no slicer configured the viewer's own proxy answers 503, by design, and
// the frontend falls back to the clip-plane preview. Nothing else is excused.
const EXPECTED_FAILURES = [/\/api\/slicer\//];

// --- Browser discovery -------------------------------------------------------
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);

const chromePath = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
if (!chromePath) {
  console.error("boot: no Chromium found. Set CHROME_PATH to a chrome/edge binary.");
  process.exit(2);
}

// --- Server must already be up -----------------------------------------------
try {
  const probe = await fetch(URL_UNDER_TEST, { redirect: "manual" });
  if (probe.status >= 400) throw new Error(`HTTP ${probe.status}`);
} catch (error) {
  console.error(`boot: ${URL_UNDER_TEST} does not answer (${error.message}).`);
  console.error("Start the viewer first — Start-Viewer.bat, or:");
  console.error("  .\\.venv\\Scripts\\python.exe -m uvicorn avisualizer.web.app:create_app \\");
  console.error("      --factory --host 127.0.0.1 --port 8090");
  process.exit(2);
}

// --- How many meshes is a complete load? -------------------------------------
// Learn it from the server instead of guessing, because "the network went quiet"
// is NOT the same as "the model finished". The first CI run proved it: the 73 MB
// Chassis.glb lands, swiftshader spends seconds parsing it with zero requests in
// flight, quiet-network fires, and the check reports a clean boot after ONE
// mesh. A floor of "at least one" is a gate that passes on a broken load.
async function expectedMeshNames(pageUrl) {
  const origin = new URL(pageUrl).origin;
  const listing = await (await fetch(`${origin}/api/urdf/models`)).json();
  const modelUrl = listing.defaultModelUrl || listing.models?.[0]?.url;
  if (!modelUrl) return null;
  const urdf = await (await fetch(`${origin}${modelUrl}`)).text();
  const names = [...urdf.matchAll(/filename="([^"]+\.glb)"/gi)].map((match) => match[1]);
  return names.length ? new Set(names) : null;
}

let expectedMeshes = null;
try {
  expectedMeshes = await expectedMeshNames(URL_UNDER_TEST);
} catch (error) {
  console.error(`boot: could not read the model manifest (${error.message}).`);
  process.exit(2);
}
if (!expectedMeshes) {
  console.error("boot: the server lists no URDF model — nothing to verify.");
  console.error("On a fresh clone this usually means `git lfs pull` was never run.");
  process.exit(2);
}

// --- Launch ------------------------------------------------------------------
const profileDir = mkdtempSync(join(tmpdir(), "meltio-boot-"));
const browser = spawn(chromePath, [
  "--headless=new",
  `--remote-debugging-port=${DEBUG_PORT}`,
  `--user-data-dir=${profileDir}`,
  "--no-first-run", "--no-default-browser-check",
  // CI runners routinely fail to bring up Chrome's setuid sandbox, and /dev/shm
  // is tiny in containers. This browser is a throwaway profile that loads one
  // localhost page we built ourselves, so neither flag costs us anything real.
  "--no-sandbox", "--disable-dev-shm-usage",
  // Software GL: CI runners have no GPU, and the scene must still render.
  "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
  // The HMI targets a 1080x1920 portrait panel (CLAUDE.md, "Layout targets").
  "--window-size=1080,1920", "--force-device-scale-factor=1",
  "about:blank",
], { stdio: "ignore" });

function bail(code, message) {
  if (message) console.error(message);
  browser.kill();
  process.exit(code);
}

async function findPageTarget() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
      const page = (await response.json()).find((target) => target.type === "page");
      if (page) return page;
    } catch { /* devtools endpoint not listening yet */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return null;
}

const target = await findPageTarget();
if (!target) bail(2, "boot: the browser never exposed a devtools page target.");

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let nextId = 0;
function call(method, params = {}) {
  nextId += 1;
  const id = nextId;
  return new Promise((resolve) => {
    const onMessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== id) return;
      socket.removeEventListener("message", onMessage);
      resolve(message.result);
    };
    socket.addEventListener("message", onMessage);
    socket.send(JSON.stringify({ id, method, params }));
  });
}

// --- Collect -----------------------------------------------------------------
const errors = [];
const badResponses = [];
const glbLoaded = new Set();
let urdfFetched = false;
let inFlight = 0;
let lastActivityMs = Date.now();

function describeFrame(frame) {
  if (!frame) return "";
  const where = `${frame.url}:${frame.lineNumber + 1}:${frame.columnNumber + 1}`;
  return `\n      at ${frame.functionName || "<anonymous>"} (${where})`;
}

socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  const { method, params } = message;

  if (method === "Runtime.exceptionThrown") {
    const details = params.exceptionDetails;
    const description = details.exception?.description || details.text;
    // V8's `description` already carries the formatted stack for a real Error;
    // only synthesise one from the call frames when it does not.
    const stack = /\n\s+at /.test(description)
      ? ""
      : (details.stackTrace?.callFrames || []).slice(0, 5).map(describeFrame).join("");
    errors.push(`uncaught ${description}${stack}`);
  }

  if (method === "Runtime.consoleAPICalled" && params.type === "error") {
    const text = params.args
      .map((arg) => arg.value ?? arg.description ?? JSON.stringify(arg.preview ?? {}))
      .join(" ");
    errors.push(`console.error ${text}${describeFrame(params.stackTrace?.callFrames?.[0])}`);
  }

  if (method === "Network.requestWillBeSent") {
    inFlight += 1;
    lastActivityMs = Date.now();
  }

  if (method === "Network.loadingFinished" || method === "Network.loadingFailed") {
    inFlight = Math.max(0, inFlight - 1);
    lastActivityMs = Date.now();
  }

  if (method === "Network.loadingFailed" && !params.canceled) {
    badResponses.push(`${params.errorText} (${params.type})`);
  }

  if (method === "Network.responseReceived") {
    const { url, status } = params.response;
    if (status >= 400 && !EXPECTED_FAILURES.some((pattern) => pattern.test(url))) {
      badResponses.push(`${status} ${url}`);
    }
    if (status === 200 && /\.glb(\?|$)/i.test(url)) {
      glbLoaded.add(decodeURIComponent(url.split("?")[0].split("/").pop()));
    }
    if (status === 200 && /\.urdf(\?|$)/i.test(url)) urdfFetched = true;
  }
});

await call("Runtime.enable");
await call("Network.enable");
await call("Page.enable");
await call("Emulation.setDeviceMetricsOverride", {
  width: 1080, height: 1920, deviceScaleFactor: 1, mobile: false,
});

console.log(`boot: loading ${URL_UNDER_TEST} (${expectedMeshes.size} meshes expected)`);
const startedMs = Date.now();
await call("Page.navigate", { url: URL_UNDER_TEST });

// Settle on the model being complete. Quiet-network alone is not a readiness
// signal here (see expectedMeshNames above); it is only the fallback that lets
// an incomplete load reach the verdict instead of hanging until the timeout.
let timedOut = false;
for (;;) {
  await new Promise((resolve) => setTimeout(resolve, 500));
  const elapsed = Date.now() - startedMs;
  const quiet = inFlight === 0 && Date.now() - lastActivityMs > QUIET_MS && elapsed > QUIET_MS;
  if (glbLoaded.size >= expectedMeshes.size && quiet) break;
  if (elapsed > HARD_TIMEOUT_MS) { timedOut = true; break; }
}

// --- Probe the boot contract -------------------------------------------------
const probe = await call("Runtime.evaluate", {
  returnByValue: true,
  expression: `({
    canvas: !!document.querySelector("canvas"),
    advancedBridge: typeof window.MeltioAdvanced,
    notificationsBridge: typeof window.MeltioNotifications,
    permissionsBridge: typeof window.MeltioPermissions,
    topbar: !!document.getElementById("topbarSettingsToggle"),
  })`,
});
const state = probe?.result?.value || {};

if (SCREENSHOT) {
  const shot = await call("Page.captureScreenshot", { format: "png" });
  writeFileSync(SCREENSHOT, Buffer.from(shot.data, "base64"));
  console.log(`boot: screenshot -> ${SCREENSHOT}`);
}

// --- Boot footprint ----------------------------------------------------------
// A digest of what the operator can SEE and PRESS once the page has settled,
// over every id the two contracts enumerate. Its purpose is refactors that must
// change nothing: capture before, move code, assert after.
//
//   node tools/check_boot.mjs --footprint before.txt      # capture
//   node tools/check_boot.mjs --expect-footprint before.txt   # assert
//
// Why not the screenshot this replaces: two captures of the SAME code do not
// match. The topbar clock ticks and swiftshader is not bit-stable, so a pixel
// hash is a coin flip and cannot gate anything.
//
// Digits are normalised to `#`. That is what makes it deterministic — the
// clock, the calendar dates, the notification timestamps — and it is also the
// hole: this can see a label appear, vanish or change WORDING, and cannot see
// a number change value. It answers "did moving this code change anything",
// never "is this value right".
let footprintRows = null;
if (FOOTPRINT_OUT || FOOTPRINT_EXPECT) {
  const contract = JSON.parse(readFileSync(join(REPO_ROOT, "contract-dom.json"), "utf8"));
  const ids = [...new Set([...contract.domIds, ...(contract.assemblyDomIds || [])])].sort();
  const captured = await call("Runtime.evaluate", {
    returnByValue: true,
    expression: `(${((idList) => {
      const norm = (value) => String(value == null ? "" : value)
        .replace(/\s+/g, " ").trim().slice(0, 40).replace(/\d/g, "#");
      return idList.map((id) => {
        const el = document.getElementById(id);
        if (!el) return `${id}\tABSENT`;
        const style = window.getComputedStyle(el);
        return [
          id,
          el.hidden ? "hidden" : "shown",
          style.display === "none" ? "display:none" : "displayed",
          el.disabled ? "disabled" : "enabled",
          el.getAttribute("aria-pressed") || "-",
          norm(el.textContent),
        ].join("\t");
      });
    }).toString()})(${JSON.stringify(ids)})`,
  });
  footprintRows = captured?.result?.value;
  if (!Array.isArray(footprintRows)) {
    bail(2, "boot: the footprint probe returned nothing.");
  }
}

if (FOOTPRINT_OUT) {
  writeFileSync(FOOTPRINT_OUT, footprintRows.join("\n") + "\n", "utf8");
  console.log(`boot: footprint (${footprintRows.length} ids) -> ${FOOTPRINT_OUT}`);
}

const footprintDrift = [];
if (FOOTPRINT_EXPECT) {
  const expected = readFileSync(FOOTPRINT_EXPECT, "utf8").split("\n").filter(Boolean);
  const byId = (rows) => new Map(rows.map((row) => [row.split("\t")[0], row]));
  const before = byId(expected);
  const after = byId(footprintRows);
  for (const [id, row] of before) {
    const now = after.get(id);
    if (now === undefined) footprintDrift.push(`${id}: no longer probed`);
    else if (now !== row) footprintDrift.push(`${id}\n      was: ${row}\n      now: ${now}`);
  }
  for (const id of after.keys()) {
    if (!before.has(id)) footprintDrift.push(`${id}: newly probed`);
  }
}

// --- Verdict -----------------------------------------------------------------
// The bridges are the load-bearing assertion: each is installed at the tail of
// a different domain module, so a module that dies mid-boot takes its bridge
// with it. That is exactly how 515877b would have been caught here.
const missing = [];
if (!state.canvas) missing.push("no <canvas> — the renderer never mounted");
if (!state.topbar) missing.push("no #topbarSettingsToggle — the page shell is wrong");
if (state.advancedBridge !== "object") missing.push("window.MeltioAdvanced missing (hmi/settings.js)");
if (state.notificationsBridge !== "object") missing.push("window.MeltioNotifications missing (hmi/notifications.js)");
if (state.permissionsBridge !== "object") missing.push("window.MeltioPermissions missing (hmi/permissions.js)");
if (!urdfFetched) missing.push("the .urdf was never fetched — boot died before the loader");
// Every mesh the URDF declares, not "at least one".
const missingMeshes = [...expectedMeshes].filter((name) => !glbLoaded.has(name));
if (missingMeshes.length) {
  missing.push(`${missingMeshes.length}/${expectedMeshes.size} meshes never loaded: `
    + `${missingMeshes.slice(0, 6).join(", ")}${missingMeshes.length > 6 ? ", …" : ""}`);
}

const seconds = ((Date.now() - startedMs) / 1000).toFixed(1);
console.log(`boot: settled in ${seconds}s — ${glbLoaded.size}/${expectedMeshes.size} meshes, `
  + `${errors.length} console errors, ${badResponses.length} failed requests`);

let failed = false;
if (timedOut) {
  failed = true;
  console.error(`\nboot: the page never went quiet within ${HARD_TIMEOUT_MS} ms.`);
}
if (errors.length) {
  failed = true;
  console.error("\nboot: the page logged errors. Every one of these is a bug:");
  for (const error of errors) console.error(`  - ${error}`);
}
if (badResponses.length) {
  failed = true;
  console.error("\nboot: requests failed (the slicer proxy is the only excused one):");
  for (const bad of badResponses) console.error(`  - ${bad}`);
}
if (missing.length) {
  failed = true;
  console.error("\nboot: the boot contract is not satisfied:");
  for (const item of missing) console.error(`  - ${item}`);
}
if (footprintDrift.length) {
  failed = true;
  console.error(`\nboot: ${footprintDrift.length} id(s) drifted from ${FOOTPRINT_EXPECT}:`);
  for (const item of footprintDrift) console.error(`  - ${item}`);
  console.error("\nA refactor that was supposed to change nothing changed something"
    + " the operator can see.");
}

socket.close();
browser.kill();
if (failed) {
  console.error("\nA module that throws at import time takes the whole HMI with it.");
  process.exit(1);
}
console.log("boot: clean.");
process.exit(0);
