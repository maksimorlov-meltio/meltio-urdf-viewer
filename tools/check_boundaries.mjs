#!/usr/bin/env node
// Package-boundary gate for the hmi/ vs viewer/ partition (plan step 5/7):
//
//   1. hmi/**    must NOT import `three` (UI is scene-free).
//   2. viewer/** must NOT touch the DOM (`document`/`window`) —
//      except files under viewer/overlays/, the sanctioned home of the
//      few 3D→screen projection features (floating controls, annotations).
//
//   node tools/check_boundaries.mjs
//
// Exits 0 when clean, 1 with a report otherwise.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
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

const failures = [];

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
console.log("check_boundaries: hmi/ and viewer/ boundaries are clean.");
