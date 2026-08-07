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
const aliasOwner = new Map(); // alias -> canonical command that claims it
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
    aliasOwner.set(alias, name);
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
const emittedNames = new Set();
let emitted = 0;
for (const scanDir of SCAN_DIRS) {
  for (const file of collectJsFiles(scanDir)) {
    const source = readFileSync(file, "utf8");
    for (const re of EMIT_RES) {
      for (const match of source.matchAll(re)) {
        emitted += 1;
        emittedNames.add(match[1]);
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

// ── The other direction ────────────────────────────────────────────────────
// The check above only proves the frontend stays inside the contract. It says
// nothing about the contract drifting away from the frontend, and one half of
// it can: ALIASES.
//
// Canonical names deliberately outrun the code — the $comment authorises a wide
// contract, and 34 of them have no dispatcher on purpose. Aliases are the
// opposite kind of entry. They are the pre-ports SCREAMING vocabulary, and the
// only reason any of them exists is that THIS frontend emits it. An alias
// nothing emits is a mapping the C# host is obliged to implement for traffic
// that will never arrive.
//
// It is also the one rule that would have caught what this gate missed for a
// year: `FEEDER` was declared as an alias of `loadFeeder`, whose params it does
// not share, while the emitted FEEDER was a different command entirely. Delete
// the wrapper that emits an alias and this now says so.
//
// NOTE ON THE RULE NOT TAKEN: the obvious formulation — "every command at
// permission:'none' must be emitted or be listed host-only" — cannot be merged.
// Eleven of the twelve are shell/UI messages (openFiles, login, setLight) that
// never travel through sendCommand at all, so it lands red and needs an
// eleven-entry allowlist seeded on day one. Seeding an exception list is how a
// gate becomes decoration. This rule is green today with nothing seeded.
const orphanAliases = [...aliasOwner.keys()].filter((a) => !emittedNames.has(a));
if (orphanAliases.length > 0) {
  console.error(`check_contract: ${orphanAliases.length} declared alias(es) that nothing emits:`);
  for (const alias of orphanAliases) {
    console.error(`  "${alias}" (alias of ${aliasOwner.get(alias)}) — no sendCommand("${alias}") in the scanned tree.`);
  }
  console.error("  Either the emitter was removed (drop the alias) or it was renamed (fix the alias).");
  process.exit(1);
}

console.log(
  `check_contract: ${emitted} emission(s) checked, all declared in contract.json; `
  + `${aliasOwner.size} alias(es) checked, all emitted.`,
);
