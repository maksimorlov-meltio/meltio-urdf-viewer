#!/usr/bin/env node
// Dead-lookup ratchet. Two lookups, one rule: a name the code binds to must
// exist in the thing it binds to, or the binding silently does nothing.
//
//   1. every element id the modules look up must exist in urdf.html
//   2. every URDF link/joint name the code names must exist in the URDF
//
//   node tools/check_dead_lookups.mjs
//
// Why: `getElementById` results are guarded with `if (el)` everywhere, by
// design — a missing element is a silent no-op, never an error. That makes the
// guard load-bearing AND makes dead wiring invisible: a module can look up an
// element nobody ever put in the page and simply do nothing, forever. The
// jsdom render tests turned up 36 such ids, none of which has ever existed in
// this repository's history.
//
// This is a ratchet, not a cleanup: the known ones are listed so the count can
// only go DOWN. A new dead lookup fails immediately. Removing an id from the
// page without removing its lookup fails immediately. Fix one, delete its line.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const HTML = join(REPO_ROOT, "apps", "dev-host", "src", "avisualizer", "web", "static", "urdf.html");
const CONTRACT = join(REPO_ROOT, "contract-dom.json");
const URDF = join(REPO_ROOT, "apps", "dev-host", "assets", "M600_PRO", "M600_PRO.urdf");
const ASSEMBLY = join(REPO_ROOT, "apps", "dev-host", "src", "avisualizer", "web", "static", "urdf_viewer.js");

// EMPTY, and it should stay that way.
//
// It held 36 entries when this gate was introduced: every lookup in hmi/ and
// viewer/ that had no element in urdf.html. They were cleared in one pass —
// ~22 were leftovers of a UI redesign and were deleted along with the code that
// served them, 14 were features built in JS but never given markup (the
// wire-drum card, the feeder-wheel floating jog panel) and were wired up.
//
// If you are about to add an entry here: don't. Add the element, or remove the
// lookup. A guarded getElementById that never resolves is a feature that does
// nothing and says nothing.
const KNOWN_DEAD = new Set([]);

// Some ids are created in JS and never live in the markup. They are not dead —
// they are the opposite, elements the code brings into existence — so they get
// a set with an honest name rather than being smuggled into KNOWN_DEAD, which
// would turn a "this must reach zero" list into a "this is fine" list.
const CREATED_AT_RUNTIME = new Set([
  "printNotice", // urdf_viewer.js builds it on first use
]);

// The parser's own defaults for a nameless node (viewer/robot/urdfRobot.js).
// They are literals it WRITES, not names it looks up, so they have no business
// resolving against the file.
const PARSER_FALLBACKS = new Set(["unnamed_link", "unnamed_joint"]);

const html = readFileSync(HTML, "utf8");
const present = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
const contract = JSON.parse(readFileSync(CONTRACT, "utf8"));
// Both halves. `domIds` is what the published modules require of an embedder;
// `assemblyDomIds` is what the dev-host assembly looks up. The assembly's
// lookups were invisible to every gate until now — 52.5% of this repo's own JS
// — and that is how the ViewCube and eleven hotspot ids sat there resolving to
// null for months. The contract distinguishes them because they mean different
// things to a consumer; this gate does not, because urdf.html has to satisfy
// both.
const required = [...new Set([...contract.domIds, ...(contract.assemblyDomIds || [])])];

const dead = required
  .filter((id) => !present.has(id))
  .filter((id) => !CREATED_AT_RUNTIME.has(id));
const newlyDead = dead.filter((id) => !KNOWN_DEAD.has(id));
const revived = [...KNOWN_DEAD].filter((id) => present.has(id));

let failed = false;
if (newlyDead.length) {
  failed = true;
  console.error("dead-lookups: these ids are looked up but are not in urdf.html:");
  for (const id of newlyDead) console.error(`  - ${id}`);
  console.error("\nEvery getElementById is guarded, so this fails SILENTLY at runtime.");
  console.error("Add the element, or remove the lookup. Do not extend KNOWN_DEAD.");
}
if (revived.length) {
  failed = true;
  console.error("dead-lookups: these are wired up now — remove them from KNOWN_DEAD:");
  for (const id of revived) console.error(`  - ${id}`);
}
// --- 2. URDF link/joint names --------------------------------------------
//
// The same failure, one layer down and with a nastier deployment story. The
// assembly binds to ~36 link and joint names by string constant
// (`front_door_joint`, `wire_drum_link`, `eje_y_link`, …). Nothing resolves
// them at build time: a renamed joint does not throw, the door just stops
// opening and the drum stops appearing. An operator sees a machine behaving
// oddly, not an error.
//
// It matters more than it looks because the URDF is deployed as MACHINE
// CONFIGURATION while the names that depend on it ship with the SOFTWARE, so
// the two can move on different cadences. check_boot already asserts every
// mesh the URDF declares actually loads (24/24) — it derives the list from the
// URDF, so it self-adapts — but it cannot see a joint nobody animates.
function jsFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) jsFiles(path, out);
    else if (entry.name.endsWith(".js")) out.push(path);
  }
  return out;
}

const urdf = readFileSync(URDF, "utf8");
const declared = new Set([
  ...[...urdf.matchAll(/<link\s+name="([^"]+)"/g)].map((m) => m[1]),
  ...[...urdf.matchAll(/<joint\s+name="([^"]+)"/g)].map((m) => m[1]),
]);

const bindings = new Map();
for (const file of [ASSEMBLY, ...jsFiles(join(REPO_ROOT, "hmi")), ...jsFiles(join(REPO_ROOT, "viewer"))]) {
  for (const m of readFileSync(file, "utf8").matchAll(/["'`]([a-z0-9]+(?:_[a-z0-9]+)*_(?:link|joint))["'`]/g)) {
    if (PARSER_FALLBACKS.has(m[1])) continue;
    if (!bindings.has(m[1])) bindings.set(m[1], []);
    bindings.get(m[1]).push(file.slice(REPO_ROOT.length + 1).split(/[\/]/).join("/"));
  }
}

const dangling = [...bindings.keys()].filter((name) => !declared.has(name));
if (dangling.length) {
  failed = true;
  console.error("dead-lookups: these URDF names are bound in code but not declared in the URDF:");
  for (const name of dangling) console.error(`  - ${name}  (${[...new Set(bindings.get(name))].join(", ")})`);
  console.error(`
${URDF.slice(REPO_ROOT.length + 1)} declares ${declared.size} links+joints.`);
  console.error("A renamed joint throws NOTHING — the part just stops moving. Fix the name");
  console.error("on whichever side is wrong; the URDF and the code version together.");
}

if (failed) process.exit(1);

console.log(`dead-lookups: ${required.length} ids required, ${dead.length} known-dead, 0 new; `
  + `${bindings.size}/${declared.size} URDF names bound, all declared.`);
