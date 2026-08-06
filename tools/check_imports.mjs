#!/usr/bin/env node
// Verifies that every relative ES-module import in the frontend JS resolves
// to an existing file — across the root hmi/ and viewer/ partitions and the
// dev-host static tree (phase C layout). Root-absolute specifiers ("/hmi/…",
// "/viewer/…", served by the FastAPI mounts in app.py) resolve from the repo
// root, mirroring how the browser and build.mjs resolve them.
//
// `node --check` validates syntax only: an import that points at a missing
// file is a runtime-fatal 404 the browser only discovers at load time, and it
// kills the whole module graph (see the gotchas in ARCHITECTURE.md). Run this
// after any change that adds/renames/removes a static JS module:
//
//   node tools/check_imports.mjs
//
// Exits 0 when every import resolves, 1 with a report otherwise.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_DIRS = [
  join(REPO_ROOT, "hmi"),
  join(REPO_ROOT, "viewer"),
  join(REPO_ROOT, "apps", "dev-host", "src", "avisualizer", "web", "static"),
];

// import defaultExport from "./x.js" | import { a, b } from "./x.js" |
// import "./x.js" | export { a } from "./x.js" — relative or root-absolute.
const IMPORT_RE = /(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?["']((?:\.\.?|\/(?:hmi|viewer))\/[^"']+)["']/g;

function collectJsFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectJsFiles(path, out);
    } else if (entry.name.endsWith(".js") || entry.name.endsWith(".mjs")) {
      out.push(path);
    }
  }
  return out;
}

// Strip // and /* */ comments so import examples in docs don't false-positive.
// Naive (doesn't parse strings), fine for this codebase's plain module headers.
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const failures = [];
for (const scanDir of SCAN_DIRS) {
  for (const file of collectJsFiles(scanDir)) {
    const source = stripComments(readFileSync(file, "utf8"));
    for (const match of source.matchAll(IMPORT_RE)) {
      const specifier = match[1].split("?")[0]; // strip the ?v= cache-buster
      const target = specifier.startsWith("/")
        ? join(REPO_ROOT, specifier)
        : resolve(dirname(file), specifier);
      if (!existsSync(target)) {
        failures.push({ file, specifier: match[1], target });
      }
    }
  }
}

if (failures.length > 0) {
  console.error(`check_imports: ${failures.length} unresolved import(s):`);
  for (const failure of failures) {
    console.error(`  ${failure.file}\n    -> "${failure.specifier}" (missing: ${failure.target})`);
  }
  process.exit(1);
}
console.log("check_imports: all relative imports resolve.");
