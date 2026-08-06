#!/usr/bin/env node
// Boot check: load /urdf in a real browser and fail on ANY console error.
//
//   node tools/check_boot.mjs                      # needs the viewer on :8090
//   node tools/check_boot.mjs --url http://.../urdf --screenshot boot.png
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
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// --- Options -----------------------------------------------------------------
function optionValue(flag, fallback) {
  const at = process.argv.indexOf(flag);
  return at !== -1 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
}

const URL_UNDER_TEST = optionValue("--url", "http://127.0.0.1:8090/urdf");
const SCREENSHOT = optionValue("--screenshot", null);
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
    if (status === 200 && /\.glb(\?|$)/i.test(url)) glbLoaded.add(url.split("?")[0]);
    if (status === 200 && /\.urdf(\?|$)/i.test(url)) urdfFetched = true;
  }
});

await call("Runtime.enable");
await call("Network.enable");
await call("Page.enable");
await call("Emulation.setDeviceMetricsOverride", {
  width: 1080, height: 1920, deviceScaleFactor: 1, mobile: false,
});

console.log(`boot: loading ${URL_UNDER_TEST}`);
const startedMs = Date.now();
await call("Page.navigate", { url: URL_UNDER_TEST });

// Settle on a quiet network rather than a fixed sleep.
let timedOut = false;
for (;;) {
  await new Promise((resolve) => setTimeout(resolve, 500));
  const elapsed = Date.now() - startedMs;
  if (inFlight === 0 && Date.now() - lastActivityMs > QUIET_MS && elapsed > QUIET_MS) break;
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
// A boot that dies early requests no assets at all, so "every GLB we asked for
// came back 200" would be vacuously true. Require that loading actually began.
if (!urdfFetched) missing.push("the .urdf was never fetched — boot died before the loader");
if (glbLoaded.size === 0) missing.push("no .glb loaded — the model never started loading");

const seconds = ((Date.now() - startedMs) / 1000).toFixed(1);
console.log(`boot: settled in ${seconds}s — ${glbLoaded.size} meshes, `
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

socket.close();
browser.kill();
if (failed) {
  console.error("\nA module that throws at import time takes the whole HMI with it.");
  process.exit(1);
}
console.log("boot: clean.");
process.exit(0);
