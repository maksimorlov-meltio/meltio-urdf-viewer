#!/usr/bin/env node
// Build the publishable artefact: everything a consumer needs to serve the
// HMI from a folder — the page, the styling, the pinned three, the published
// partitions, the assembly and the three contracts.
//
//   node tools/gen_artifact.mjs --out <dir> [--in <urdf.html>]
//
// Its output IS what lands on the `release` branch. Building the whole thing in
// one place is deliberate: while the workflow assembled half of it, no test
// could walk the artefact's import graph, and the first one written found a
// module that would have 404'd.
//
// Why this exists
// ---------------
// contract-dom.json tells an embedder WHICH element ids the modules look up.
// It cannot tell them the structure: several modules reach inside an element
// (`card.querySelector(".spool-select-icon")`), and the class names the modules
// toggle (`slicer-fullscreen`, `status-not-enough`, `files-collapsed-for-print`)
// mean nothing without the stylesheet. And every getElementById in this code
// base is guarded, so an embedder that gets one id wrong is not told: the
// feature simply does nothing, forever. That is the exact failure mode that hid
// 36 dead lookups in this repository for months, and shipping the ids as a list
// exports it to the consumer.
//
// So the release artefact carries a page that is correct by construction,
// derived from the one the app actually runs, plus the stylesheet, the vendored
// three and the icons it references.
//
// What it deliberately does NOT carry: the assembly. Wiring the 25 modules
// together lives in urdf_viewer.js, which owns the Three.js scene and is not
// published. The shell leaves a marked, empty entry point for the embedder's
// own module — an honest hole rather than a page that looks complete and is
// inert.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const STATIC = join(REPO_ROOT, "apps", "dev-host", "src", "avisualizer", "web", "static");

function option(flag, fallback) {
  const at = process.argv.indexOf(flag);
  return at !== -1 && process.argv[at + 1] ? process.argv[at + 1] : fallback;
}

// `--in` exists so the refuse-on-unknown-markup path can be exercised for real
// rather than asserted against this file's own source text.
const SRC_HTML = resolve(option("--in", join(STATIC, "urdf.html")));
const OUT = resolve(option("--out", join(REPO_ROOT, "artifact")));

// Absolute dev-host URLs -> paths relative to the shell. The published modules
// keep their own relative imports, so only the page's own references move.
const REWRITES = [
  [/\/static\/vendor\//g, "./vendor/"],
  [/\/static\/icons\//g, "./icons/"],
  [/\/static\/urdf_viewer\.css(\?v=\d+)?/g, "./urdf_viewer.css"],
  [/\/hmi\//g, "./hmi/"],
  [/\/viewer\//g, "./viewer/"],
];

const ENTRY_PLACEHOLDER = `  <!-- ===================================================================
       APP ENTRY.

       ./app.js is the assembly: it creates the Three.js scene and instantiates
       every published hmi/ + viewer/ domain with its deps. It is this repo's
       own wiring, shipped as-is rather than hidden — an artefact you cannot
       run is not an artefact.

       It is also the largest thing here by far and the least settled: domains
       are being lifted out of it into hmi/ one at a time. Treat it as the
       reference implementation, not as API. To replace it, swap this script
       for your own module and drive the domains directly — contract-dom.json
       lists each one's entry point and the deps it reads.

       Whatever you put here, the page needs a backend: see contract-http.json
       for the routes, and note which of them enforce authorisation.
       =================================================================== -->
  <script type="module" data-app-entry src="./app.js"></script>`;

let html = readFileSync(SRC_HTML, "utf8");

// Drop the dev host's own entry script; the embedder supplies the assembly.
const entryPattern = /\s*<!-- App entry\.[\s\S]*?-->\s*<script type="module" data-app-entry[^>]*><\/script>/;
if (!entryPattern.test(html)) {
  console.error("artifact: could not find the app-entry script in urdf.html.");
  console.error("If the entry markup changed, update tools/gen_shell.mjs to match —");
  console.error("silently shipping the dev host's entry would 404 for every consumer.");
  process.exit(1);
}
html = html.replace(entryPattern, `\n${ENTRY_PLACEHOLDER}`);

for (const [pattern, replacement] of REWRITES) {
  html = html.replace(pattern, replacement);
}

// Cache-busting query strings are the dev host's problem; the consumer versions
// the whole artefact by submodule commit.
html = html.replace(/(\.(?:js|css|png|woff2))\?v=\d+/g, "$1");

html = html.replace(
  "<title>URDF Viewer</title>",
  "<title>Meltio HMI</title>\n  <!-- Generated by tools/gen_shell.mjs from urdf.html — do not edit. -->",
);

// The assembly. Its imports of the published partitions are root-absolute
// because the dev host mounts them at /hmi and /viewer; in the artefact they
// are siblings of app.js, so they become relative. Everything else it imports
// (three, three/addons/*) goes through the import map, and ./modules/* travels
// with it.
let app = readFileSync(join(STATIC, "urdf_viewer.js"), "utf8");
app = app.replace(/from "\/hmi\//g, 'from "./hmi/').replace(/from "\/viewer\//g, 'from "./viewer/');

const stillAbsolute = [...app.matchAll(/from "(\/[^"]*)"/g)].map((m) => m[1]);
if (stillAbsolute.length) {
  console.error("artifact: the assembly still imports paths the artefact does not serve:");
  for (const specifier of stillAbsolute) console.error(`  - ${specifier}`);
  console.error("Add a rewrite in tools/gen_shell.mjs, or the consumer gets a 404 at load.");
  process.exit(1);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "index.html"), html);
writeFileSync(join(OUT, "app.js"), app);
// CSS pulls its own graph and it has to be WALKED, not assumed. urdf_viewer.css
// opens with `@import "/static/meltio-design-system.css"`, and that file in turn
// declares @font-face rules pointing at /static/vendor/fonts/*. Handling only
// the first level shipped a page whose text fell back to a system font — which
// no HTML check could see, and which took a real browser load to find twice.
function emitStylesheet(name) {
  let text = readFileSync(join(STATIC, name), "utf8");

  for (const [, target] of text.matchAll(/@import\s+"\/static\/([^"]+)"/g)) {
    emitStylesheet(target);                       // depth-first; the set is tiny
  }
  for (const [, asset] of text.matchAll(/url\(['"]?\/static\/([^"')]+)['"]?\)/g)) {
    mkdirSync(dirname(join(OUT, asset)), { recursive: true });
    cpSync(join(STATIC, asset), join(OUT, asset));
  }

  text = text.replace(/(@import\s+"|url\(['"]?)\/static\//g, "$1./");
  const leftover = [...text.matchAll(/(?:@import\s+"|url\(['"]?)(\/[^"')]*)/g)].map((m) => m[1]);
  if (leftover.length) {
    console.error(`artifact: ${name} still references paths the artefact does not serve:`);
    for (const ref of leftover) console.error(`  - ${ref}`);
    process.exit(1);
  }

  mkdirSync(dirname(join(OUT, name)), { recursive: true });
  writeFileSync(join(OUT, name), text);
}
emitStylesheet("urdf_viewer.css");
cpSync(join(STATIC, "vendor"), join(OUT, "vendor"), { recursive: true });
cpSync(join(STATIC, "icons"), join(OUT, "icons"), { recursive: true });
// The point-cloud helpers the assembly imports relatively. Unrelated to
// printing (ARCHITECTURE 3.4) but the import is unconditional, so a missing
// file is a load-time-fatal 404 that takes the whole module with it.
mkdirSync(join(OUT, "modules"), { recursive: true });
for (const name of ["api.js", "render.js"]) {
  cpSync(join(STATIC, "modules", name), join(OUT, "modules", name));
}

// The published partitions and the contracts. Copied here rather than by the
// release workflow so that `--out` alone produces something you can serve.
for (const dir of ["hmi", "viewer"]) {
  cpSync(join(REPO_ROOT, dir), join(OUT, dir), { recursive: true });
}
for (const file of ["contract.json", "contract-dom.json", "contract-http.json"]) {
  cpSync(join(REPO_ROOT, file), join(OUT, file));
}

const ids = (html.match(/id="([^"]+)"/g) || []).length;
console.log(`artifact: ${ids} element ids, app.js + hmi + viewer + 3 contracts`
  + ` + css + vendor + icons -> ${OUT}`);
