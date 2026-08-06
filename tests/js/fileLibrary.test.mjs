// Unit tests for the Files-menu library logic (hmi/fileLibrary.js).
// Run with: node --test "tests/js/**/*.test.mjs"
//
// 799 lines, 33 exports and no coverage until now — it decides which files the
// operator sees, and how many grams a job is assumed to need (which then feeds
// the pre-print material gate). The module resolves its elements at import
// time, so the DOM stub goes in first; everything tested here is logic, not
// rendering.
import test from "node:test";
import assert from "node:assert/strict";

import { installDomStub } from "./support/domStub.mjs";

installDomStub();
const lib = await import("../../hmi/fileLibrary.js");
const { DEFAULT_PRINT_JOB_USAGE_GRAMS } = await import("../../hmi/state/materialsState.js");

// --- Source filter -----------------------------------------------------------

test("the source filter accepts only the three known sources", () => {
  for (const source of ["usb", "cloud", "local"]) {
    assert.equal(lib.resolveCloudFileSourceFilter(source), source);
  }
  assert.equal(lib.resolveCloudFileSourceFilter("  USB  "), "usb", "trimmed and lowercased");
  // Anything else falls back to cloud rather than filtering everything out.
  for (const bogus of ["network", "", null, undefined, 7, {}]) {
    assert.equal(lib.resolveCloudFileSourceFilter(bogus), "cloud");
  }
});

// --- Backend field parsing ---------------------------------------------------

test("boolean fields accept the shapes a backend actually sends", () => {
  for (const truthy of [true, 1, "true", "TRUE", " yes ", "y", "on", "1"]) {
    assert.equal(lib.parseCloudBooleanField(truthy), true, `${JSON.stringify(truthy)}`);
  }
  for (const falsy of [false, 0, "false", "no", "n", "off", "0"]) {
    assert.equal(lib.parseCloudBooleanField(falsy), false, `${JSON.stringify(falsy)}`);
  }
  // Unknown => null, NOT false: "the backend did not say" is distinct from "no".
  for (const unknown of ["maybe", "", null, undefined, {}, []]) {
    assert.equal(lib.parseCloudBooleanField(unknown), null);
  }
});

test("grams parsing takes the first positive finite value", () => {
  assert.equal(lib.parseCloudGramsField(null, undefined, "", 0, -5, 42, 99), 42);
  assert.equal(lib.parseCloudGramsField("120"), 120);
  assert.equal(lib.parseCloudGramsField(0, -1, "abc", NaN, Infinity), null);
  assert.equal(lib.parseCloudGramsField(), null);
});

// --- Entry normalisation -----------------------------------------------------

test("a bare filename string normalises with the fallback source", () => {
  assert.deepEqual(lib.normalizeCloudLibraryEntry("  part.stl ", "usb"),
    { name: "part.stl", source: "usb", cloudUploaded: null });
  assert.equal(lib.normalizeCloudLibraryEntry("   ", "usb"), null, "blank name is dropped");
});

test("entries without a usable name are dropped", () => {
  for (const bogus of [null, undefined, 42, {}, { name: "" }, { name: "   " }]) {
    assert.equal(lib.normalizeCloudLibraryEntry(bogus, "cloud"), null);
  }
});

test("the name is read from any of the aliases a backend may use", () => {
  for (const key of ["name", "file", "filename", "path"]) {
    const entry = lib.normalizeCloudLibraryEntry({ [key]: "bracket.stl" }, "local");
    assert.equal(entry.name, "bracket.stl", `via '${key}'`);
  }
});

test("the entry's own source wins over the fallback", () => {
  assert.equal(lib.normalizeCloudLibraryEntry({ name: "a.stl", source: "usb" }, "cloud").source, "usb");
  assert.equal(lib.normalizeCloudLibraryEntry({ name: "a.stl", origin: "local" }, "cloud").source, "local");
  assert.equal(lib.normalizeCloudLibraryEntry({ name: "a.stl" }, "usb").source, "usb");
});

test("material grams are read from any of the estimated/actual aliases", () => {
  const entry = lib.normalizeCloudLibraryEntry({
    name: "a.stl", requiredMaterialGrams: 350, usedGrams: 12,
  }, "cloud");
  assert.equal(entry.estimatedMaterialUsedGrams, 350);
  assert.equal(entry.actualMaterialUsedGrams, 12);

  const none = lib.normalizeCloudLibraryEntry({ name: "b.stl" }, "cloud");
  assert.equal(none.estimatedMaterialUsedGrams, null);
  assert.equal(none.actualMaterialUsedGrams, null);
});

// --- Print-job usage: this feeds the pre-print material gate -----------------

test("usage falls back to the default estimate, and actual stays null when absent", () => {
  assert.deepEqual(lib.getCloudLibraryEntryPrintUsageGrams(null),
    { estimated: DEFAULT_PRINT_JOB_USAGE_GRAMS, actual: null });
  assert.deepEqual(
    lib.getCloudLibraryEntryPrintUsageGrams({ estimatedMaterialUsedGrams: 0, actualMaterialUsedGrams: -3 }),
    { estimated: DEFAULT_PRINT_JOB_USAGE_GRAMS, actual: null },
    "non-positive values must not be taken as a real figure",
  );
  assert.deepEqual(
    lib.getCloudLibraryEntryPrintUsageGrams({ estimatedMaterialUsedGrams: 800, actualMaterialUsedGrams: 640 }),
    { estimated: 800, actual: 640 },
  );
});

// --- Identity and favourites -------------------------------------------------

test("the entry key is scoped by source, so the same name on two sources differs", () => {
  assert.equal(lib.getCloudLibraryEntryKey({ name: "a.stl", source: "usb" }), "usb::a.stl");
  assert.notEqual(
    lib.getCloudLibraryEntryKey({ name: "a.stl", source: "usb" }),
    lib.getCloudLibraryEntryKey({ name: "a.stl", source: "cloud" }),
  );
  assert.equal(lib.getCloudLibraryEntryKey({ name: "a.stl" }), "cloud::a.stl", "source defaults to cloud");
  assert.equal(lib.getCloudLibraryEntryKey(null), "");
  assert.equal(lib.getCloudLibraryEntryKey({ name: "" }), "");
});

test("favourites toggle per (source, name) and never collide across sources", () => {
  const usb = { name: "a.stl", source: "usb" };
  const cloud = { name: "a.stl", source: "cloud" };

  assert.equal(lib.isCloudLibraryEntryFavorite(usb), false);
  lib.toggleCloudLibraryEntryFavorite(usb);
  assert.equal(lib.isCloudLibraryEntryFavorite(usb), true);
  assert.equal(lib.isCloudLibraryEntryFavorite(cloud), false, "same name, other source: untouched");

  lib.toggleCloudLibraryEntryFavorite(usb);
  assert.equal(lib.isCloudLibraryEntryFavorite(usb), false, "toggling again clears it");

  // An entry with no key is ignored rather than poisoning the set.
  lib.toggleCloudLibraryEntryFavorite({ name: "" });
  assert.equal(lib.isCloudLibraryEntryFavorite({ name: "" }), false);
});

// --- The fetch pipeline: normalise, de-duplicate, sort ------------------------

async function withFetch(payload, fn, { ok = true, status = 200 } = {}) {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ ok, status, json: async () => payload });
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

test("the library fetch normalises, de-duplicates and sorts naturally", async () => {
  lib.initFileLibrary({ CLOUD_STL_FILES_API_URL: "/api/stl/files" });
  const entries = await withFetch({
    items: [
      "part10.stl",
      { name: "part2.stl", requiredMaterialGrams: 120 },
      "part10.stl",                       // exact duplicate
      { file: "part1.stl" },
      { name: "" },                       // dropped
      null,                               // dropped
    ],
  }, () => lib.fetchCloudLibraryEntriesForSource("usb"));

  assert.deepEqual(entries.map((e) => e.name), ["part1.stl", "part2.stl", "part10.stl"],
    "numeric-aware sort: part10 comes after part2, not before");
  assert.equal(entries.length, 3, "the duplicate and the two unusable rows are gone");
  assert.ok(entries.every((e) => e.source === "usb"));
  assert.equal(entries.find((e) => e.name === "part2.stl").estimatedMaterialUsedGrams, 120);
});

test("the fetch accepts the legacy `files` payload shape too", async () => {
  lib.initFileLibrary({ CLOUD_STL_FILES_API_URL: "/api/stl/files" });
  const entries = await withFetch({ files: ["a.stl", "b.stl"] },
    () => lib.fetchCloudLibraryEntriesForSource("cloud"));
  assert.deepEqual(entries.map((e) => e.name), ["a.stl", "b.stl"]);
});

test("an unrecognised payload yields no entries instead of throwing", async () => {
  lib.initFileLibrary({ CLOUD_STL_FILES_API_URL: "/api/stl/files" });
  for (const payload of [{}, { items: "nope" }, null]) {
    const entries = await withFetch(payload, () => lib.fetchCloudLibraryEntriesForSource("cloud"));
    assert.deepEqual(entries, []);
  }
});

test("a failing backend surfaces the HTTP status", async () => {
  lib.initFileLibrary({ CLOUD_STL_FILES_API_URL: "/api/stl/files" });
  await assert.rejects(
    () => withFetch({}, () => lib.fetchCloudLibraryEntriesForSource("cloud"), { ok: false, status: 503 }),
    /HTTP 503/,
  );
});
