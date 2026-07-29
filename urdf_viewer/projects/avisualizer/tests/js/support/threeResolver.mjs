// node:module resolution hook: map the bare `three` specifier (resolved via an
// importmap in the browser, absent in Node) to the local stub so factory
// modules can be imported under `node --test`. Every other specifier falls
// through untouched, so this is harmless to the pure-module test files.
const STUB_URL = new URL("./threeStub.mjs", import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "three") {
    return { url: STUB_URL, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
