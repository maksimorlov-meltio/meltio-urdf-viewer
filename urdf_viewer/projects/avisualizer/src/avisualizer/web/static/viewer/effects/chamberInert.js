// Argon inertization fill for the build chamber.
//
// While a print is inerting, the chamber floods with argon. We show it as a
// faint cool-cyan translucent GAS — not a slab: a single box spans the full
// chamber height and a small ShaderMaterial computes, per pixel, how "gassy"
// that point reads from three cheap terms:
//   - a SOFT (feathered) rising front instead of a hard flat top surface,
//   - denser toward the floor (argon is ~1.4x denser than air, so a bottom-up,
//     bottom-heavy fill is physically fair),
//   - a gentle animated internal drift (a couple of summed sines keyed off
//     world position + time) so it reads as gas quietly moving, not frozen.
// Colourless argon is tinted for visibility.
//
// Purely cosmetic: it reads a fill fraction (and, while draining, a fall rate)
// the host computes/drives and renders nothing else — no physics, no telemetry
// coupling here. One mesh, depthWrite AND depthTest off: interior clutter
// (motors, rails, the head) would otherwise slice the gas down to a thin
// sliver wherever something opaque sits closer to the camera, so it read as a
// flat tinted pane instead of a chamber full of haze. With depthTest off the
// box draws as a continuous soft fill across its own footprint regardless of
// what's behind it. Containment is therefore geometric, not depth-based: the
// box is sized tight to the chamber interior (see setBounds) so it never
// paints past the chamber opening. renderOrder (5) is kept LOWER than the
// front door's fade renderOrder (set by the host while the door is glassy) so
// the door still draws after — and visually overlays — the gas. Cheap enough
// to run every frame.
//
// THREE is injected to stay decoupled from the vendored three build.

const VERTEX_SHADER = `
varying vec3 vLocal;
varying vec3 vWorldPos;
void main() {
  vLocal = position; // box-local, each axis in [-0.5, 0.5]
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}`;

const FRAGMENT_SHADER = `
precision mediump float;
uniform vec3 uColor;
uniform float uFillFrac; // 0..1: how high the gas front sits, floor(0)->ceiling(1)
uniform float uTime;
uniform float uOpacity;  // overall density dial
varying vec3 vLocal;
varying vec3 vWorldPos;

// Cheap layered-sine "noise" — no texture / hash needed, just enough wobble
// to read as drifting gas rather than a static block.
float driftNoise(vec3 p, float t) {
  float n = sin(p.x * 6.0 + t * 0.6) * sin(p.y * 5.0 - t * 0.5);
  n += 0.5 * sin(p.x * 11.0 - t * 1.1 + p.y * 3.0);
  return n * 0.5 + 0.5; // ~0..1
}

void main() {
  float frac = vLocal.z + 0.5; // 0 at floor .. 1 at ceiling

  // Soft leading edge: fades over a band straddling the current fill level
  // instead of clipping at a hard flat surface. Fully dense well below the
  // front, fully clear well above it (gas hasn't risen there yet).
  float feather = 0.12;
  float rise = smoothstep(-feather, feather, uFillFrac - frac);

  // Denser toward the floor even within the filled region.
  float floorBias = mix(1.0, 0.55, frac);

  float drift = driftNoise(vWorldPos, uTime);
  float density = rise * floorBias * (0.72 + 0.36 * drift);
  if (density <= 0.002) discard;

  gl_FragColor = vec4(uColor, density * uOpacity);
}`;

export function createChamberInert({ THREE, scene }) {
  const GAS_COLOR = new THREE.Color(0.60, 0.87, 1.0); // faint cool cyan
  const RISE_PER_SEC = 0.09; // ~11 s floor->ceiling purge
  let fallPerSec = 0.12;     // drain rate; host drives this via setFallRate while evacuating

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: GAS_COLOR },
      uFillFrac: { value: 0 },
      uTime: { value: 0 },
      uOpacity: { value: 0.9 },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    depthTest: true, // host flips this off via setUnoccluded() while the door is glassy
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
  });

  // Unit-cube volume spanning the full chamber height; re-scaled/positioned
  // only when the host calls setBounds (not every frame — the fill LEVEL is
  // driven purely by the uFillFrac uniform, read per-pixel by the shader).
  const volume = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  volume.name = "chamberInertVolume";
  volume.renderOrder = 5;
  volume.frustumCulled = false;
  volume.visible = false;
  scene.add(volume);

  // Chamber interior box (world). Sensible default; host overrides via setBounds.
  let bounds = { minX: -0.36, maxX: 0.37, minY: -0.30, maxY: 0.47, floorZ: 0.33, ceilZ: 1.78 };
  let fill = 0;   // current 0..1
  let target = 0; // requested 0..1
  let tTime = 0;

  function applyBoundsToMesh() {
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    const sx = Math.max(0.01, bounds.maxX - bounds.minX);
    const sy = Math.max(0.01, bounds.maxY - bounds.minY);
    const fullH = Math.max(0.01, bounds.ceilZ - bounds.floorZ);
    volume.scale.set(sx, sy, fullH);
    volume.position.set(cx, cy, bounds.floorZ + fullH / 2);
  }
  applyBoundsToMesh();

  function setBounds(next) {
    if (next && typeof next === "object") {
      bounds = { ...bounds, ...next };
      applyBoundsToMesh();
    }
  }

  // 0 = empty, 1 = fully inert. Host computes from atmosphere/inert signals.
  function setTarget(fraction) {
    target = Math.max(0, Math.min(1, Number(fraction) || 0));
  }

  // Drain rate (fraction/sec) used while target < fill (evacuating). The host
  // scales this with fan speed — a stronger fan clears the chamber faster.
  function setFallRate(perSec) {
    const v = Number(perSec);
    if (Number.isFinite(v) && v > 0) {
      fallPerSec = v;
    }
  }

  // Depth-testing is host-controlled rather than fixed: OFF (haze reads as a
  // continuous fill, ignoring interior clutter) while the front door is glassy
  // and the operator is meant to see the gas; ON (normally occluded, exactly
  // like any other scene geometry) once the door is back to solid — otherwise
  // the gas would keep painting over a fully opaque door and hide the print
  // during "inert"/depositing. The host flips this in lockstep with the same
  // glassy condition that drives the door fade.
  function setUnoccluded(unoccluded) {
    material.depthTest = !unoccluded;
  }

  function update(dt) {
    if (!(dt > 0)) return;
    // Rate-limited approach so the purge/drain reads as a deliberate move.
    const rate = (target > fill ? RISE_PER_SEC : fallPerSec) * dt;
    if (Math.abs(target - fill) <= rate) fill = target;
    else fill += Math.sign(target - fill) * rate;

    tTime += dt;
    material.uniforms.uTime.value = tTime;

    if (fill <= 0.001) {
      volume.visible = false;
      return;
    }
    volume.visible = true;
    material.uniforms.uFillFrac.value = fill;
  }

  function getFill() { return fill; }
  function isActive() { return fill > 0.001 || target > 0.001; }

  function dispose() {
    scene.remove(volume);
    volume.geometry.dispose();
    volume.material.dispose();
  }

  return { setBounds, setTarget, setFallRate, setUnoccluded, update, getFill, isActive, dispose };
}
