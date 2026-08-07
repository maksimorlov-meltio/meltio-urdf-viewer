#!/usr/bin/env node
// Package-boundary gate for the hmi/ vs viewer/ partition (plan step 5/7):
//
//   1. hmi/**    must NOT import `three` (UI is scene-free).
//   2. viewer/** must NOT touch the DOM (`document`/`window`) —
//      except files under viewer/overlays/, the sanctioned home of the
//      few 3D→screen projection features (floating controls, annotations).
//   3. The `export let` census below is exact — see MUTABLE_EXPORT_CEILING.
//
//   node tools/check_boundaries.mjs
//
// Exits 0 when clean, 1 with a report otherwise.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function collectJsFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) collectJsFiles(path, out);
    else if (entry.name.endsWith(".js") || entry.name.endsWith(".mjs")) out.push(path);
  }
  return out;
}

// Same comment-stripping as check_imports.mjs: don't flag examples in docs.
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

// Rule 3 — a ratchet on mutable module-level exports.
//
// `export let` is an ES-module live binding: the importer sees every later
// reassignment. The four state modules use it deliberately — it is what let
// the god-file's globals move out of urdf_viewer.js without rewriting ~150
// read sites, and printFlowState.js:6-9 argues its case with a measurement.
// It is a migration scaffold, not a target shape: each one is a write the
// module cannot see, so nothing can react to it and nothing can validate it.
//
// This table is a CENSUS, not a budget. It is compared exactly, both ways:
//   - a count ABOVE its entry means a new live binding was added — the scaffold
//     is supposed to be shrinking, so open the ratchet deliberately or don't;
//   - a count BELOW it means one was closed and the ceiling was not lowered in
//     the same commit, which is how a ratchet quietly stops ratcheting;
//   - a file absent from the table with any `export let` is an unregistered
//     one, which is the case the ceiling exists to catch.
//
// Lowering a number here needs no justification. Raising one does, in the PR.
const MUTABLE_EXPORT_CEILING = {
  "hmi/fileLibrary.js": 4,
  "hmi/materials.js": 3,
  // hmi/state/materialsState.js is closed — deliberately absent, so a new one
  // there comes back as "unregistered" rather than as room under a ceiling.
  "hmi/state/printFlowState.js": 10,
};

const failures = [];

const mutableExportCounts = new Map();
for (const root of ["hmi", "viewer"]) {
  for (const file of collectJsFiles(join(REPO_ROOT, root))) {
    const source = stripComments(readFileSync(file, "utf8"));
    const found = source.match(/^\s*export\s+let\s/gm);
    if (found) {
      mutableExportCounts.set(relative(REPO_ROOT, file).split(sep).join("/"), found.length);
    }
  }
}
for (const [path, count] of mutableExportCounts) {
  const ceiling = MUTABLE_EXPORT_CEILING[path];
  if (ceiling === undefined) {
    failures.push({ file: path, rule: `${count} unregistered export let — add it to MUTABLE_EXPORT_CEILING and say why in the PR` });
  } else if (count > ceiling) {
    failures.push({ file: path, rule: `${count} export let, ceiling is ${ceiling} — the live-binding scaffold only shrinks` });
  }
}
for (const [path, ceiling] of Object.entries(MUTABLE_EXPORT_CEILING)) {
  const count = mutableExportCounts.get(path) ?? 0;
  if (count < ceiling) {
    failures.push({ file: path, rule: `${count} export let but the ceiling still says ${ceiling} — lower it here, in this commit` });
  }
}

for (const file of collectJsFiles(join(REPO_ROOT, "hmi"))) {
  const source = stripComments(readFileSync(file, "utf8"));
  if (/from\s+["']three["'\/]|import\s+["']three["'\/]/.test(source)) {
    failures.push({ file, rule: "hmi must not import three" });
  }
}

for (const file of collectJsFiles(join(REPO_ROOT, "viewer"))) {
  if (file.includes(`${sep}overlays${sep}`)) continue; // sanctioned DOM island
  const source = stripComments(readFileSync(file, "utf8"));
  if (/\b(document|window)\s*[.\[]/.test(source)) {
    failures.push({ file, rule: "viewer must not touch the DOM outside overlays/" });
  }
}

if (failures.length > 0) {
  console.error(`check_boundaries: ${failures.length} violation(s):`);
  for (const f of failures) console.error(`  ${f.file}\n    -> ${f.rule}`);
  process.exit(1);
}
const mutableTotal = [...mutableExportCounts.values()].reduce((a, b) => a + b, 0);
console.log(`check_boundaries: hmi/ and viewer/ boundaries are clean (${mutableTotal} export let, all registered).`);
