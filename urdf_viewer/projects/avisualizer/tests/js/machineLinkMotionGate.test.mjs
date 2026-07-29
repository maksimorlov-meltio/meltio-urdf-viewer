// Regression test for SEG-1 (operational accident-prevention gate): the machine
// link must refuse motion-INITIATING commands (arm, start-print, resume) unless
// the integrator explicitly set allowMotion, and must ALWAYS allow de-escalating
// commands (stop, pause, emergency-stop). This is not a security boundary — the
// controller/firmware still enforces authorization server-side — but it stops the
// HMI itself from ever accidentally starting motion by merely being connected.
import test from "node:test";
import assert from "node:assert/strict";

import { createMachineLink } from "../../src/avisualizer/web/static/sim/machineLink.js";

// Stub global fetch: /health + /telemetry always OK; record every POST to
// /api/machine/<cmd> so tests can assert which commands actually went out.
function withStubbedFetch(run) {
  const original = globalThis.fetch;
  const posted = [];
  globalThis.fetch = async (url, opts) => {
    const u = String(url);
    if (u.endsWith("/api/machine/") === false && u.includes("/api/machine/")) {
      posted.push(u.slice(u.indexOf("/api/machine/") + "/api/machine/".length));
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };
  return Promise.resolve(run(posted)).finally(() => {
    globalThis.fetch = original;
  });
}

async function connect(link) {
  link.start(); // kicks checkHealth() (async, not awaited)
  for (let i = 0; i < 10 && !link.isConnected(); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  assert.ok(link.isConnected(), "precondition: link should reach connected state");
}

test("motion-initiating commands are blocked when allowMotion is not set", async () => {
  await withStubbedFetch(async (posted) => {
    const link = createMachineLink({ base: "http://ctrl.local" });
    try {
      await connect(link);
      await assert.rejects(() => link.arm(), /blocked/i, "arm must be blocked");
      await assert.rejects(() => link.startPrint({}), /blocked/i, "start-print must be blocked");
      await assert.rejects(() => link.resume(), /blocked/i, "resume must be blocked");
      assert.deepEqual(
        posted.filter((c) => ["arm", "start-print", "resume"].includes(c)),
        [],
        "no motion-initiating POST should have left the client",
      );
    } finally {
      link.dispose();
    }
  });
});

test("de-escalating commands are always allowed (fail-safe), even without allowMotion", async () => {
  await withStubbedFetch(async (posted) => {
    const link = createMachineLink({ base: "http://ctrl.local" });
    try {
      await connect(link);
      await link.stop();
      await link.pause();
      await link.emergencyStop();
      assert.deepEqual(posted, ["stop", "pause", "emergency-stop"]);
    } finally {
      link.dispose();
    }
  });
});

test("allowMotion: true arms the motion-initiating commands", async () => {
  await withStubbedFetch(async (posted) => {
    const link = createMachineLink({ base: "http://ctrl.local", allowMotion: true });
    try {
      await connect(link);
      await link.arm();
      await link.startPrint({ job: "x" });
      assert.deepEqual(posted, ["arm", "start-print"]);
    } finally {
      link.dispose();
    }
  });
});
