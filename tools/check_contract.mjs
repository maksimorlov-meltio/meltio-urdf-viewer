#!/usr/bin/env node
// Contract gate: every machine command the frontend emits must be declared in
// contract.json (repo root), either as a canonical camelCase name or as a
// legacy alias (the pre-ports SCREAMING vocabulary, e.g. START_PRINT).
//
//   node tools/check_contract.mjs
//
// Exits 0 when every emitted command is declared, 1 with a report otherwise.
// This is the step-7 gate "todo comando emitido existe en contract.json",
// runnable from day one thanks to aliases.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const CONTRACT_PATH = join(REPO_ROOT, "contract.json");
const SCAN_DIRS = [
  join(REPO_ROOT, "hmi"),
  join(REPO_ROOT, "viewer"),
  join(REPO_ROOT, "apps", "dev-host", "src", "avisualizer", "web", "static"),
];

const contract = JSON.parse(readFileSync(CONTRACT_PATH, "utf8"));
const commands = contract.channels?.shell?.uiToHost?.commands ?? {};

const declared = new Set();
for (const [name, spec] of Object.entries(commands)) {
  if (!/^[a-z][A-Za-z0-9]*$/.test(name)) {
    console.error(`contract: command '${name}' is not camelCase`);
    process.exit(1);
  }
  declared.add(name);
  for (const alias of spec.aliases ?? []) {
    if (declared.has(alias)) {
      console.error(`contract: alias '${alias}' declared twice`);
      process.exit(1);
    }
    declared.add(alias);
  }
}

function collectJsFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "vendor" || entry.name === "dist") continue;
      collectJsFiles(path, out);
    } else if (entry.name.endsWith(".js") || entry.name.endsWith(".mjs")) {
      out.push(path);
    }
  }
  return out;
}

// How the frontend emits machine commands today: sendCommand("NAME", args)
// (sim/machineLink.js). Extend this list when the ports/ layer lands.
const EMIT_RES = [/\bsendCommand\(\s*["']([A-Za-z_][A-Za-z0-9_]*)["']/g];

const violations = [];
let emitted = 0;
for (const scanDir of SCAN_DIRS) {
  for (const file of collectJsFiles(scanDir)) {
    const source = readFileSync(file, "utf8");
    for (const re of EMIT_RES) {
      for (const match of source.matchAll(re)) {
        emitted += 1;
        if (!declared.has(match[1])) {
          violations.push({ file, command: match[1] });
        }
      }
    }
  }
}

if (violations.length > 0) {
  console.error(`check_contract: ${violations.length} undeclared command(s):`);
  for (const v of violations) {
    console.error(`  ${v.file}\n    -> "${v.command}" not in contract.json (names or aliases)`);
  }
  process.exit(1);
}
console.log(`check_contract: ${emitted} emission(s) checked, all declared in contract.json.`);
