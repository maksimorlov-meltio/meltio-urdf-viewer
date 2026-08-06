#!/usr/bin/env node
// Dead-lookup ratchet: every element id the hmi/ + viewer/ modules look up must
// exist in urdf.html, except the ones grandfathered below.
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
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const HTML = join(REPO_ROOT, "apps", "dev-host", "src", "avisualizer", "web", "static", "urdf.html");
const CONTRACT = join(REPO_ROOT, "contract-dom.json");

// Lookups with no element in urdf.html, as of 2026-08-06. Each is a code path
// that cannot run in the shipped app. Do not add to this list — fix the wiring
// (add the element) or remove the lookup, then delete the entry.
const KNOWN_DEAD = new Set([
  // Materials popup: the whole wire-drum card, and the initial/used breakdown
  // that only the hotspot panel actually has.
  "materialsSpoolCardWireDrum", "materialsWireDrumMaterial", "materialsWireDrumAmount",
  "materialsWireDrumInitialAmount", "materialsWireDrumUsedAmount", "materialsWireDrumStatus",
  "materialsSpool1InitialAmount", "materialsSpool1UsedAmount",
  "materialsSpool2InitialAmount", "materialsSpool2UsedAmount",
  "materialsConfirmAction", "materialsMenuRequiredStatus",
  "materialInfoName", "materialInfoRows",
  // Material assign/unload controls on the hotspot panel and the Files pane.
  "hotspotContextTitle", "hotspotMaterialSelect", "hotspotMaterialLoadAction",
  "hotspotMaterialUnloadAction", "hotspotSpoolAmountInput", "hotspotSpoolAmountValidation",
  "filesMaterialSelect", "filesMaterialLoadAction", "filesMaterialUnloadAction",
  // Feeder-wheel floating jog panel (viewer/overlays/feederWheelFloat.js).
  "feederWheelFloatingLeft", "feederWheelFloatLeftUp", "feederWheelFloatLeftStop",
  "feederWheelFloatLeftDown", "feederWheelFloatingRight", "feederWheelFloatRightUp",
  "feederWheelFloatRightStop", "feederWheelFloatRightDown",
  // Utilities readouts and misc.
  "chillerSettingsFlow", "chillerSettingsFlowValue", "fanSettingsRpm",
  "notificationDetailsGoToIssue", "topbarConnection",
]);

const html = readFileSync(HTML, "utf8");
const present = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
const required = JSON.parse(readFileSync(CONTRACT, "utf8")).domIds;

const dead = required.filter((id) => !present.has(id));
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
if (failed) process.exit(1);

console.log(`dead-lookups: ${required.length} ids required, ${dead.length} known-dead, 0 new.`);
