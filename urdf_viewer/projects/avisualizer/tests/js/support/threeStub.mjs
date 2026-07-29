// Minimal stub of the `three` module for `node --test`.
//
// In the browser, the bare `three` specifier is resolved by an importmap in
// urdf.html (-> /static/vendor/three.module.js). Node has no importmap, so a
// factory module that does `import * as THREE from "three"` cannot be imported
// under the test runner without a resolution shim. This stub provides just the
// few THREE constructors the factories touch AT CONSTRUCTION TIME; the real
// geometry work lives inside methods the unit tests do not exercise, so no-op
// classes are sufficient. Keep it tiny — add a symbol only when a constructed
// factory needs it at construction and a test would otherwise crash on import.

class Vec3 {
  set() { return this; }
  copy() { return this; }
  multiply() { return this; }
  setFromAxisAngle() { return this; }
}

export class Vector3 extends Vec3 {}
export class Quaternion extends Vec3 {}
export class Plane {}
export class Raycaster {}
export const MathUtils = { degToRad: (deg) => (deg * Math.PI) / 180 };
