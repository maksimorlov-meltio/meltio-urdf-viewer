// Regression test for ARQ-2: cloudStl3D must resolve `printSim` LAZILY through
// ctx.getPrintSim(), never capture it by value at construction time.
//
// urdf_viewer.js creates the cloudStl3D factory BEFORE it assigns `printSim`
// (printSim starts as null and is set much later in the boot sequence). The
// original code destructured `printSim` as a const, freezing it at null, so the
// `!printSim` guard in autoPreparePrintSimulationForSelection was permanently
// true and the background pre-slice / solid-preview silently never ran. The fix
// passes `getPrintSim: () => printSim` (the same pattern slicerBridge uses) and
// resolves it on each call. These tests lock that contract in.
//
// Runs under `node --test` with the `three` resolution hook registered via
// support/register.mjs (see the js-test job in ci.yml and package.json usage).
import test from "node:test";
import assert from "node:assert/strict";

import { createCloudStl3D } from "../../src/avisualizer/web/static/cloud/cloudStl3D.js";

// Build a ctx that only wires the entries autoPreparePrintSimulationForSelection
// actually touches; everything else is left undefined (unused on this path).
function makeCtx(overrides = {}) {
  const calls = { getPrintSim: 0, getPrintSimAutoRunInProgress: 0 };
  const ctx = {
    // Lazy printSim getter — the crux of ARQ-2.
    getPrintSim: () => {
      calls.getPrintSim += 1;
      return ctx._printSim;
    },
    getPrintSimAutoRunInProgress: () => {
      calls.getPrintSimAutoRunInProgress += 1;
      return false;
    },
    getIsDockedPrintActive: () => false,
    hasLoadedCloudFileForPrint: () => false,
    _printSim: null,
    ...overrides,
  };
  return { ctx, calls };
}

test("autoPrepare resolves printSim through the lazy getter, not a captured value", async () => {
  const { ctx, calls } = makeCtx();
  const api = createCloudStl3D(ctx);

  await api.autoPreparePrintSimulationForSelection();

  // The factory must have asked ctx for printSim. Under the ARQ-2 bug there was
  // no getPrintSim in ctx at all — the module read a frozen const — so this
  // call count would be 0.
  assert.ok(calls.getPrintSim >= 1, "expected autoPrepare to call ctx.getPrintSim()");
});

test("printSim assigned AFTER factory creation is picked up (ARQ-2 core scenario)", async () => {
  const { ctx, calls } = makeCtx();
  const api = createCloudStl3D(ctx);

  // Mirror the real boot order: printSim is still null when the factory is
  // created, then becomes available later.
  ctx._printSim = { prepare: async () => true, getSource: () => "toolpath" };

  await api.autoPreparePrintSimulationForSelection();

  // With printSim now truthy, the `!printSim` guard must fall through to the
  // next condition — proving the value was read at call time, not at
  // construction. A frozen-null capture would short-circuit before this call.
  assert.equal(
    calls.getPrintSimAutoRunInProgress,
    1,
    "expected the printSim guard to pass and evaluate getPrintSimAutoRunInProgress()",
  );
});

test("null printSim short-circuits the guard (no false-positive from the test)", async () => {
  const { ctx, calls } = makeCtx();
  const api = createCloudStl3D(ctx);

  // printSim stays null.
  await api.autoPreparePrintSimulationForSelection();

  // `!printSim` is true, so the guard short-circuits and never evaluates the
  // next condition. This anchors the previous test: the difference between the
  // two is exactly the lazy resolution of printSim.
  assert.equal(
    calls.getPrintSimAutoRunInProgress,
    0,
    "expected null printSim to short-circuit before getPrintSimAutoRunInProgress()",
  );
});
