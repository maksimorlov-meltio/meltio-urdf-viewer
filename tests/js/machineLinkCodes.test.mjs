// Regression net for ARQ-3: the shape of `activeCodes` on the telemetry wire.
//
// contract.json declared it `string[]`; hmi/ports/machineLink.js reads
// `item.class` / `item.code`. A host that believed the contract sent strings,
// every entry fell through a mute `continue`, and the console showed zero
// faults for a machine reporting them — nothing raised, nothing logged.
//
// That matters more than a normal shape mismatch: MeltioErrors.raise has one
// caller in the whole tree, this reconcile loop, and it is what drives
// haltPrintForError. Emergency stop is hardware (see ARCHITECTURE.md §1.1), so
// this path is the ONLY automatic software reaction to a machine fault.
//
// The contract now says objects. These tests pin both halves of that decision:
// the object form raises, and the string form is refused OUT LOUD rather than
// quietly accepted — no "defensive" second shape.
import test from "node:test";
import assert from "node:assert/strict";

import { installDomStub } from "./support/domStub.mjs";

installDomStub();

const { createMachineLink } = await import("../../hmi/ports/machineLink.js");

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

// Collects what the reconcile loop asked the catalog layer to do.
function installErrorSpy() {
  const raised = [];
  const cleared = [];
  window.MeltioErrors = {
    raise: (cls, code) => { raised.push(`${cls}:${code}`); },
    clear: (cls, code) => { cleared.push(`${cls}:${code}`); },
  };
  return { raised, cleared };
}

function captureWarnings() {
  const original = console.warn;
  const lines = [];
  console.warn = (...args) => { lines.push(args.join(" ")); };
  return { lines, restore: () => { console.warn = original; } };
}

// Feed one fixed snapshot on every poll and let the link ingest it.
async function ingestSnapshot(snapshot, run) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(snapshot) });
  const link = createMachineLink({ base: "http://127.0.0.1:9", pollMs: 20 });
  try {
    link.start();
    await sleep(80);
    return await run(link);
  } finally {
    link.disconnect();
    globalThis.fetch = originalFetch;
    delete window.MeltioErrors;
  }
}

test("the contract's activeCodes shape raises the fault", async () => {
  const spy = installErrorSpy();
  await ingestSnapshot(
    { connected: true, state: "fault", activeCodes: [{ class: "error", code: "200.1" }] },
    () => {},
  );
  assert.deepEqual(spy.raised, ["error:200.1"]);
});

test("a code with no class is a warning, and is raised exactly once", async () => {
  const spy = installErrorSpy();
  await ingestSnapshot(
    { connected: true, state: "printing", activeCodes: [{ code: "106.1.3" }] },
    () => {},
  );
  // Several polls elapsed; the raisedCodes diff must keep it to one call.
  assert.deepEqual(spy.raised, ["warning:106.1.3"]);
});

test("the old string form raises nothing and says so", async () => {
  const spy = installErrorSpy();
  const warn = captureWarnings();
  try {
    await ingestSnapshot(
      { connected: true, state: "fault", activeCodes: ["200.1"] },
      () => {},
    );
  } finally {
    warn.restore();
  }
  // Half one: no silent acceptance. A bare string is not the contract, and
  // teaching this loop to take it would make two shapes permanent.
  assert.deepEqual(spy.raised, []);
  // Half two, the actual fix: the discrepancy is audible. Without this a host
  // integrating against the wrong contract gets no signal at all, which is
  // precisely how ARQ-3 survived.
  assert.ok(
    warn.lines.some((l) => l.includes("[machineLink]") && l.includes("activeCodes")),
    `expected a warning about the malformed entry, got: ${JSON.stringify(warn.lines)}`,
  );
});

test("a code that goes away is cleared", async () => {
  // Not a shape test — it pins that the diff still works after the guard grew a
  // branch, which is the thing a careless edit to the loop would break.
  const spy = installErrorSpy();
  const snapshot = { connected: true, state: "fault", activeCodes: [{ class: "error", code: "200.1" }] };
  await ingestSnapshot(snapshot, async () => {
    snapshot.activeCodes = [];
    await sleep(60);
  });
  assert.deepEqual(spy.raised, ["error:200.1"]);
  assert.deepEqual(spy.cleared, ["error:200.1"]);
});
