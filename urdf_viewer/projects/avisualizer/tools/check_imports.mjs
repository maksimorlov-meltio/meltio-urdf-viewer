#!/usr/bin/env node
// Verifies that every relative ES-module import in the viewer's static JS
// resolves to an existing file.
//
// `node --check` validates syntax only: an import that points at a missing
// file is a runtime-fatal 404 the browser only discovers at load time, and it
// kills the whole module graph (see the gotchas in ARCHITECTURE.md). Run this
// after any change that adds/renames/removes a static JS module:
//
//   node urdf_viewer/projects/avisualizer/tools/check_imports.mjs
//
// Exits 0 when every import resolves, 1 with a report otherwise.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const STATIC_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "avisualizer",
  "web",
  "static",
);

// import defaultExport from "./x.js" | import { a, b } from "./x.js" |
// import "./x.js" | export { a } from "./x.js"
const IMPORT_RE = /(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?["'](\.\.?\/[^"']+)["']/g;

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
for (const file of collectJsFiles(STATIC_DIR)) {
  const source = stripComments(readFileSync(file, "utf8"));
  for (const match of source.matchAll(IMPORT_RE)) {
    const specifier = match[1].split("?")[0]; // strip the ?v= cache-buster
    const target = resolve(dirname(file), specifier);
    if (!existsSync(target)) {
      failures.push({ file, specifier: match[1], target });
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
