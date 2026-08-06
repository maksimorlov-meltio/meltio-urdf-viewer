// The publishable shell (tools/gen_shell.mjs).
//
// The shell is the release artefact's answer to a problem contract-dom.json
// only half solves: it lists the 215 element ids the modules look up, but every
// lookup is guarded, so an embedder that gets one wrong is told nothing. A
// shell that silently loses an id, or that ships a dev-host URL the consumer
// cannot serve, would push that silence downstream — which is the whole thing
// this artefact exists to prevent.
//
// Generated into a temp dir, so there is no second copy in the repository to
// drift from the page the app actually runs.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const SRC_HTML = join(REPO_ROOT, "apps", "dev-host", "src", "avisualizer",
  "web", "static", "urdf.html");

const OUT = mkdtempSync(join(tmpdir(), "meltio-shell-"));
execFileSync(process.execPath, [join(REPO_ROOT, "tools", "gen_shell.mjs"), "--out", OUT],
  { stdio: "pipe" });

const html = readFileSync(join(OUT, "index.html"), "utf8");
const contract = JSON.parse(readFileSync(join(REPO_ROOT, "contract-dom.json"), "utf8"));

test.after(() => rmSync(OUT, { recursive: true, force: true }));

test("the shell carries every element id the published modules look up", () => {
  const present = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
  const missing = contract.domIds.filter((id) => !present.has(id));
  assert.deepEqual(missing, [],
    "an embedder given this shell must not have to add elements by hand");
  assert.ok(contract.domIds.length >= 200,
    `sanity: the contract should list the whole surface, got ${contract.domIds.length}`);
});

test("no dev-host absolute URL survives", () => {
  // /static/... and /hmi/... only resolve behind this repo's FastAPI mounts. A
  // consumer serving the shell from a folder or a WebView2 virtual host would
  // get 404s, and a 404 stylesheet is a page that renders as unstyled soup.
  const absolute = [...html.matchAll(/(?:src|href)="(\/[^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(absolute, [], `absolute URLs left in the shell: ${absolute}`);
  assert.equal(/url\(['"]?\//.test(html), false, "an inline style still points at /");
});

test("the import map resolves to files the artefact actually ships", () => {
  const map = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]);
  assert.equal(map.imports.three, "./vendor/three.module.js");
  assert.ok(existsSync(join(OUT, "vendor", "three.module.js")), "three is not in the artefact");
  // `three/addons/` is a prefix mapping; the one addon the published modules
  // import must be under it.
  assert.ok(map.imports["three/addons/"].startsWith("./vendor/"));
  assert.ok(existsSync(join(OUT, "vendor", "controls", "OrbitControls.js")),
    "OrbitControls is imported by viewer/core/sceneCore.js and must ship");
});

test("the stylesheet and the icons it references are in the artefact", () => {
  assert.ok(html.includes('href="./urdf_viewer.css"'));
  assert.ok(existsSync(join(OUT, "urdf_viewer.css")));
  for (const icon of [...html.matchAll(/url\('\.\/icons\/([^']+)'\)/g)].map((m) => m[1])) {
    assert.ok(existsSync(join(OUT, "icons", icon)), `${icon} is referenced but not shipped`);
  }
});

test("the dev host's own entry script is gone, and the hole is documented", () => {
  // Shipping it would 404 for every consumer: /static/urdf_viewer.js is not in
  // the release artefact and never will be — it owns the Three.js scene.
  assert.equal(html.includes("/static/urdf_viewer.js"), false);
  assert.equal(html.includes("static/dist/"), false, "a built bundle leaked into the shell");
  assert.match(html, /data-app-entry/,
    "the entry point must still be marked, so an embedder can find where to plug in");
  assert.match(html, /APP ENTRY — intentionally empty/);
});

test("the classic scripts point at the published partitions", () => {
  // permissions.js and error_codes.js are classic scripts, not modules, so they
  // are <script src> and their paths have to be rewritten like any other asset.
  assert.ok(html.includes('src="./hmi/permissions.js"'), "permissions.js path not rewritten");
  assert.ok(html.includes('src="./hmi/error_codes.js"'));
  assert.equal(/\?v=\d+/.test(html), false,
    "dev-host cache-busters must not ship; the consumer versions by submodule commit");
});

test("the generator refuses rather than guesses if the entry markup changes", () => {
  // A silent fallthrough would ship the dev host's entry script — a guaranteed
  // 404 — to every consumer. Feed it a page whose entry marker was renamed and
  // it must exit non-zero, not produce a shell.
  const bad = mkdtempSync(join(tmpdir(), "meltio-shell-bad-"));
  const badHtml = join(bad, "urdf.html");
  const badOut = join(bad, "out");
  try {
    writeFileSync(badHtml, readFileSync(SRC_HTML, "utf8").replace(/data-app-entry/g, "data-x"));
    let failed = false;
    let stderr = "";
    try {
      execFileSync(process.execPath,
        [join(REPO_ROOT, "tools", "gen_shell.mjs"), "--in", badHtml, "--out", badOut],
        { stdio: "pipe" });
    } catch (error) {
      failed = true;
      stderr = String(error.stderr || "");
    }
    assert.ok(failed, "the generator produced a shell from a page it did not understand");
    assert.match(stderr, /could not find the app-entry script/);
    assert.equal(existsSync(join(badOut, "index.html")), false,
      "nothing may be written when the input is not understood");
  } finally {
    rmSync(bad, { recursive: true, force: true });
  }
});
