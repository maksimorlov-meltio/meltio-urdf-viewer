// The publishable shell (tools/gen_artifact.mjs).
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
execFileSync(process.execPath, [join(REPO_ROOT, "tools", "gen_artifact.mjs"), "--out", OUT],
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

test("the stylesheet's own dependencies are rewritten and shipped", () => {
  // urdf_viewer.css opens with `@import "/static/meltio-design-system.css"`.
  // Checking the HTML for absolute URLs cannot see that, and it took a real
  // browser load to find it: CSS pulls its own graph and it has to be walked.
  const css = readFileSync(join(OUT, "urdf_viewer.css"), "utf8");
  const absolute = [...css.matchAll(/(?:@import\s+"|url\(['"]?)(\/[^"')]*)/g)].map((m) => m[1]);
  assert.deepEqual(absolute, [], `the stylesheet still points outside the artefact: ${absolute}`);

  const imported = [...css.matchAll(/@import\s+"\.\/([^"]+)"/g)].map((m) => m[1]);
  assert.ok(imported.length > 0, "the design-system import should have been rewritten, not dropped");
  for (const name of imported) {
    assert.ok(existsSync(join(OUT, name)), `${name} is @imported but not shipped`);
  }
});

test("the entry points at the shipped assembly, not at a dev-host path", () => {
  assert.equal(html.includes("/static/urdf_viewer.js"), false);
  assert.equal(html.includes("static/dist/"), false, "a built bundle leaked into the shell");
  assert.match(html, /<script type="module" data-app-entry src="\.\/app\.js">/);
  assert.ok(existsSync(join(OUT, "app.js")), "the entry is declared but not shipped");
});

test("every import in the artefact resolves inside the artefact", () => {
  // A static import of a missing file is a load-time-fatal 404 that kills the
  // whole module — the failure tools/check_imports.mjs exists for, applied to
  // the thing the consumer actually receives. Walk from app.js outwards.
  const importMap = JSON.parse(
    html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1],
  ).imports;

  function resolve(specifier, fromFile) {
    if (specifier.startsWith(".")) {
      return join(dirname(fromFile), specifier);
    }
    if (importMap[specifier]) {
      return join(OUT, importMap[specifier]);
    }
    const prefix = Object.keys(importMap).find(
      (key) => key.endsWith("/") && specifier.startsWith(key),
    );
    if (prefix) {
      return join(OUT, importMap[prefix], specifier.slice(prefix.length));
    }
    return null; // bare and unmapped
  }

  const seen = new Set();
  const queue = [join(OUT, "app.js")];
  const unresolved = [];
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    assert.ok(existsSync(file), `${file.slice(OUT.length + 1)} is imported but not shipped`);
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/^\s*(?:import|export)[\s\S]{0,400}?from\s+"([^"]+)"/gm)) {
      const target = resolve(match[1], file);
      if (target === null) {
        unresolved.push(`${file.slice(OUT.length + 1)} -> ${match[1]}`);
        continue;
      }
      queue.push(target);
    }
  }

  assert.deepEqual(unresolved, [],
    "bare specifiers with no import-map entry cannot load in a browser");
  assert.ok(seen.size > 25,
    `the walk should reach the whole graph, only reached ${seen.size} files`);
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
        [join(REPO_ROOT, "tools", "gen_artifact.mjs"), "--in", badHtml, "--out", badOut],
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
