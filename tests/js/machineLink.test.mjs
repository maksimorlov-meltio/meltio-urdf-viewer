// Unit tests for the machine TRANSPORT (framework-free module, no Three, no DOM
// beyond a window stub). Run with: node --test "tests/js/**/*.test.mjs"
//
// This module is the only path between the console and a real M600, and it had
// no tests at all (finding COD-4). The first thing covered here is the failure
// that motivated them (REN-2): telemetry used a bare fetch while sendCommand
// fifteen lines below already had an AbortController, so a server that accepted
// the connection and never answered left the promise pending forever. loop()
// re-arms in .finally(), so that one socket killed telemetry permanently — and
// silently, since the catch never ran either and onStateChange, the only writer
// of the topbar label, never fired: "connected" over a dead link.
import test from "node:test";
import assert from "node:assert/strict";

import { installDomStub } from "./support/domStub.mjs";

installDomStub();

const { createMachineLink } = await import("../../hmi/ports/machineLink.js");
const { MachineState } = await import("../../hmi/state/machineState.js");

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

function abortError() {
  const err = new Error("The operation was aborted.");
  err.name = "AbortError";
  return err;
}

// A socket that completes the handshake and then says nothing — the REN-2
// scenario. It honours `signal` exactly as the platform does, which is what
// makes this test meaningful: drop the signal from pollOnce and the promise
// never settles, the loop never re-arms, and the call count stays at 1.
function hangingFetch(calls) {
  return (url, init = {}) => {
    calls.push(String(url));
    return new Promise((_resolve, reject) => {
      const { signal } = init;
      if (!signal) return; // no signal → hangs forever, i.e. the old behaviour
      if (signal.aborted) { reject(abortError()); return; }
      signal.addEventListener("abort", () => reject(abortError()));
    });
  };
}

function snapshotFetch(snapshot, calls) {
  return (url) => {
    calls.push(String(url));
    return Promise.resolve({ ok: true, json: () => Promise.resolve(snapshot) });
  };
}

async function withFetch(impl, run) {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

test("a hung telemetry socket does not kill the polling loop", async () => {
  const calls = [];
  await withFetch(hangingFetch(calls), async () => {
    // 20 ms cadence → 40 ms abort budget, so ~250 ms is several full cycles.
    const link = createMachineLink({ base: "http://127.0.0.1:9", pollMs: 20 });
    try {
      link.start();
      await sleep(250);
      // Before the fix this was exactly 1, for ever.
      assert.ok(calls.length >= 3, `expected the loop to keep polling, got ${calls.length} request(s)`);
    } finally {
      link.disconnect();
    }
  });
});

test("a hung socket reports the link as down instead of staying 'connected'", async () => {
  await withFetch(hangingFetch([]), async () => {
    const link = createMachineLink({ base: "http://127.0.0.1:9", pollMs: 20 });
    try {
      link.start();
      await sleep(150);
      // The silent half of REN-2: the catch has to actually run for the state
      // machine to leave CONNECTING, which is what drives the topbar label.
      assert.equal(link.getState(), MachineState.DISCONNECTED);
      assert.equal(link.isConnected(), false);
    } finally {
      link.disconnect();
    }
  });
});

test("a responsive server still ingests telemetry", async () => {
  // Guards the fix from the opposite direction: a timeout that fired too eagerly
  // would satisfy both tests above while breaking every real poll.
  const calls = [];
  const snapshot = { connected: true, state: "printing", progress: 0.42, layer: 7, layerCount: 100 };
  await withFetch(snapshotFetch(snapshot, calls), async () => {
    const link = createMachineLink({ base: "http://127.0.0.1:9", pollMs: 20 });
    try {
      link.start();
      await sleep(120);
      assert.ok(calls.length >= 2, `expected repeated polls, got ${calls.length}`);
      assert.equal(link.getState(), MachineState.PRINTING);
      assert.equal(link.isConnected(), true);
      assert.equal(link.getTelemetry().progress, 0.42);
    } finally {
      link.disconnect();
    }
  });
});

test("the abort budget tracks the poll cadence", async () => {
  // Pinned to the literal, NOT recomputed from the module's constant: the whole
  // point is that a hung fetch is abandoned within a couple of cadences and well
  // inside STALE_TELEMETRY_MS (3 s). Widening it is a deliberate change to how
  // long the console can sit on a dead socket, so it should require editing this.
  const calls = [];
  await withFetch(hangingFetch(calls), async () => {
    const link = createMachineLink({ base: "http://127.0.0.1:9", pollMs: 100 });
    try {
      link.start();
      // 100 ms cadence → 200 ms budget → a second request cannot land before
      // ~300 ms. At 250 ms exactly one request has been made and abandoned.
      await sleep(250);
      assert.equal(calls.length, 1);
      await sleep(200);
      assert.ok(calls.length >= 2, `expected the loop to re-arm, got ${calls.length}`);
    } finally {
      link.disconnect();
    }
  });
});
