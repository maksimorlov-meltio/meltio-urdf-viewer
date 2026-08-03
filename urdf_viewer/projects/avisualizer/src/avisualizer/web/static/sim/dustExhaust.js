// Fume/dust extraction plume for the top exhaust port.
//
// Emits a fine, matte, light-grey particle plume from the machine's top
// extraction port while the enclosure fan is running. Density AND rise speed
// scale with the fan speed (a stronger fan pulls a stronger plume), and nothing
// is emitted while the fan is off. Purely cosmetic — it reads no telemetry and
// drives nothing.
//
// Design (chosen with the operator): "fine dust plume, light grey" — many small
// soft particles rather than a few big smoke puffs. Rendered as a single
// THREE.Points with a tiny custom shader (soft round alpha falloff, per-particle
// size + alpha), NormalBlending so it reads as matte dust on the dark scene
// rather than a glow. One draw call, hard particle cap, so it never costs frame
// budget.
//
// THREE is injected (not imported) so this module stays decoupled from the
// viewer's vendored three build / importmap.

const VERTEX_SHADER = `
attribute float aSize;
attribute float aAlpha;
varying float vAlpha;
uniform float uHeight;
void main() {
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (uHeight / max(-mv.z, 0.001));
  gl_Position = projectionMatrix * mv;
}`;

const FRAGMENT_SHADER = `
precision mediump float;
uniform vec3 uColor;
varying float vAlpha;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = length(d);
  if (r > 0.5) discard;
  float soft = smoothstep(0.5, 0.04, r);
  gl_FragColor = vec4(uColor, vAlpha * soft);
}`;

export function createDustExhaust({ THREE, scene, camera, renderer, capacity = 600 }) {
  // Per-particle GPU buffers.
  const positions = new Float32Array(capacity * 3);
  const sizes = new Float32Array(capacity);
  const alphas = new Float32Array(capacity);

  const geometry = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions, 3);
  const sizeAttr = new THREE.BufferAttribute(sizes, 1);
  const alphaAttr = new THREE.BufferAttribute(alphas, 1);
  posAttr.setUsage(THREE.DynamicDrawUsage);
  sizeAttr.setUsage(THREE.DynamicDrawUsage);
  alphaAttr.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", posAttr);
  geometry.setAttribute("aSize", sizeAttr);
  geometry.setAttribute("aAlpha", alphaAttr);
  geometry.setDrawRange(0, 0);
  // The plume is anchored near the port; a fixed generous sphere keeps it from
  // being frustum-culled as particles drift, without recomputing bounds.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 1.8), 3);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0.72, 0.74, 0.77) }, // light grey dust
      uHeight: { value: 900 },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
  });

  const points = new THREE.Points(geometry, material);
  points.name = "dustExhaustPlume";
  points.frustumCulled = false;
  points.renderOrder = 6;
  points.visible = false;
  scene.add(points);

  // CPU-side particle state (parallel arrays, packed [0, count)).
  const vx = new Float32Array(capacity);
  const vy = new Float32Array(capacity);
  const vz = new Float32Array(capacity);
  const age = new Float32Array(capacity);
  const life = new Float32Array(capacity);
  const size0 = new Float32Array(capacity);
  const size1 = new Float32Array(capacity);
  const seed = new Float32Array(capacity);
  let count = 0;

  let fanOn = false;
  let speed01 = 0; // 0..1 fan speed
  let emitAcc = 0;

  // Anchor: a scene object (the top-cover link) plus a local offset, so the
  // emit origin tracks the port if the lid is opened/animated. Falls back to a
  // fixed world point until anchored.
  let anchorObject = null;
  const localOffset = new THREE.Vector3();
  const worldPort = new THREE.Vector3(-0.146, -0.284, 1.806); // measured port centre
  const fallbackWorldPort = worldPort.clone();

  function setAnchor(object3d, worldPoint) {
    if (worldPoint) {
      worldPort.copy(worldPoint);
      fallbackWorldPort.copy(worldPoint);
    }
    if (object3d) {
      anchorObject = object3d;
      anchorObject.updateWorldMatrix(true, false);
      localOffset.copy(worldPort).applyMatrix4(
        new THREE.Matrix4().copy(anchorObject.matrixWorld).invert(),
      );
    } else {
      anchorObject = null;
    }
  }

  function resolveWorldPort() {
    if (anchorObject) {
      worldPort.copy(localOffset).applyMatrix4(anchorObject.matrixWorld);
    } else {
      worldPort.copy(fallbackWorldPort);
    }
    return worldPort;
  }

  function setFan(on, speed) {
    fanOn = Boolean(on);
    speed01 = Math.max(0, Math.min(1, Number(speed) || 0));
  }

  function spawnOne(origin) {
    const i = count;
    // Emit from a small disc at the port mouth (~2 cm), rising in +Z.
    const a = seed[i] !== undefined ? Math.random() * 6.2832 : 0;
    const rad = 0.02 * Math.sqrt(Math.random());
    positions[i * 3] = origin.x + Math.cos(a) * rad;
    positions[i * 3 + 1] = origin.y + Math.sin(a) * rad;
    positions[i * 3 + 2] = origin.z;
    const rise = 0.10 + 0.16 * speed01 + Math.random() * 0.05;
    vx[i] = (Math.random() - 0.5) * (0.04 + 0.05 * speed01);
    vy[i] = (Math.random() - 0.5) * (0.04 + 0.05 * speed01);
    vz[i] = rise;
    age[i] = 0;
    life[i] = 0.9 + Math.random() * 0.8;
    size0[i] = 0.004 + Math.random() * 0.004;
    size1[i] = 0.016 + Math.random() * 0.014;
    seed[i] = Math.random() * 6.2832;
    alphas[i] = 0;
    sizes[i] = size0[i];
    count += 1;
  }

  function removeAt(i) {
    const last = count - 1;
    if (i !== last) {
      positions[i * 3] = positions[last * 3];
      positions[i * 3 + 1] = positions[last * 3 + 1];
      positions[i * 3 + 2] = positions[last * 3 + 2];
      vx[i] = vx[last]; vy[i] = vy[last]; vz[i] = vz[last];
      age[i] = age[last]; life[i] = life[last];
      size0[i] = size0[last]; size1[i] = size1[last];
      seed[i] = seed[last];
      sizes[i] = sizes[last]; alphas[i] = alphas[last];
    }
    count -= 1;
  }

  function update(dt) {
    if (!(dt > 0)) return;
    const origin = resolveWorldPort();

    // Emit (only while the fan is actually moving air).
    if (fanOn && speed01 > 0.001) {
      const rate = 90 + 320 * speed01; // particles/sec, denser at higher speed
      emitAcc += dt * rate;
      while (emitAcc >= 1 && count < capacity) {
        emitAcc -= 1;
        spawnOne(origin);
      }
    } else {
      emitAcc = 0;
    }

    // Integrate + fade.
    const maxAlpha = 0.34 + 0.22 * speed01;
    for (let i = count - 1; i >= 0; i -= 1) {
      age[i] += dt;
      const t = age[i] / life[i];
      if (t >= 1) { removeAt(i); continue; }
      // Gentle upward buoyancy + lateral turbulence swirl that widens the plume.
      vz[i] += 0.05 * dt;
      const turb = (0.02 + 0.03 * speed01);
      positions[i * 3] += (vx[i] + Math.sin(age[i] * 2.4 + seed[i]) * turb) * dt;
      positions[i * 3 + 1] += (vy[i] + Math.cos(age[i] * 2.1 + seed[i]) * turb) * dt;
      positions[i * 3 + 2] += vz[i] * (0.6 + 0.7 * speed01) * dt;
      sizes[i] = size0[i] + (size1[i] - size0[i]) * t;
      // Quick fade-in, long fade-out (bell), scaled by fan speed.
      const shape = Math.sin(Math.PI * Math.min(1, t < 0.15 ? t / 0.15 : (1 - t) / 0.85));
      alphas[i] = maxAlpha * Math.max(0, shape);
    }

    points.visible = count > 0;
    geometry.setDrawRange(0, count);
    posAttr.needsUpdate = true;
    sizeAttr.needsUpdate = true;
    alphaAttr.needsUpdate = true;

    // Perspective point sizing needs the current viewport height / fov.
    if (camera && renderer) {
      const h = renderer.domElement.height || 900;
      material.uniforms.uHeight.value = h / (2 * Math.tan((camera.fov * Math.PI) / 360));
    }
  }

  function isActive() {
    return (fanOn && speed01 > 0.001) || count > 0;
  }

  function dispose() {
    scene.remove(points);
    geometry.dispose();
    material.dispose();
  }

  return { setAnchor, setFan, update, isActive, dispose, get count() { return count; } };
}
