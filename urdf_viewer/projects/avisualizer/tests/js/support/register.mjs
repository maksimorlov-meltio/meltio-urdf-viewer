// Registers the `three` resolution hook for the test run. Loaded via
// `node --import ./tests/js/support/register.mjs` before the test files so the
// hook is active when a test imports a factory that pulls in `three`.
//
// In the browser the bare `three` specifier is resolved by an importmap in
// urdf.html; Node has no importmap, so we remap it to the local stub. Prefer
// the synchronous in-thread `registerHooks` (Node >= 22.15 / 23.5, no
// deprecation) and fall back to the async `register` loader on older Node.
import module from "node:module";

const STUB_URL = new URL("./threeStub.mjs", import.meta.url).href;

if (typeof module.registerHooks === "function") {
  module.registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === "three") {
        return { url: STUB_URL, shortCircuit: true };
      }
      return nextResolve(specifier, context);
    },
  });
} else {
  module.register("./threeResolver.mjs", import.meta.url);
}
