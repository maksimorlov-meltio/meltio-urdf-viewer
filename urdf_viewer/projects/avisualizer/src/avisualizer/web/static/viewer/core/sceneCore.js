// Scene core: renderer, scene, camera, controls, lights, IBL, grid — the
// Three.js foundation everything else hangs off. Extracted verbatim from
// urdf_viewer.js (step-5 phase B). Boundary rule: NO DOM/window access here —
// the caller passes the canvas and viewport metrics in, and drives resizes.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export const REST_RENDER_PIXEL_RATIO = 1.5;
export const INTERACTION_RENDER_PIXEL_RATIO = 1.0;
// On-demand rendering: when nothing is moving, the loop issues NO WebGL draws
// (idle GPU cost drops to ~0). After the last user input we keep drawing for a
// short settle window so input-driven transitions finish smoothly.
export const IDLE_RENDER_ACTIVE_WINDOW_MS = 600;
export const INTERACTION_QUALITY_HOLD_MS = 220;
// Realtime shadows double the draw-call count (every mesh is drawn again into
// the shadow map) — the dominant cost on integrated GPUs where the app is
// draw-call-submission bound. Disabled for performance; the scene stays legible
// from the ambient + directional fill lighting.
export const ENABLE_REALTIME_SHADOWS = false;
export const ANNOTATION_OCCLUSION_MAX_STALE_MS = 220;
export const ANNOTATION_OCCLUSION_RAYCASTS_PER_FRAME = 0;
export const ANNOTATION_OCCLUSION_TOLERANCE = 0.025;
export const MIN_DYNAMIC_RENDER_PIXEL_RATIO = 1.0;
export const DYNAMIC_QUALITY_SAMPLE_ALPHA = 0.08;
export const DYNAMIC_QUALITY_DOWN_FRAME_MS = 24;
export const DYNAMIC_QUALITY_UP_FRAME_MS = 16.8;
export const DYNAMIC_QUALITY_DOWN_STEP = 0.1;
export const DYNAMIC_QUALITY_UP_STEP = 0.05;
export const DYNAMIC_QUALITY_DOWN_COOLDOWN_MS = 260;
export const DYNAMIC_QUALITY_UP_COOLDOWN_MS = 900;

// --- Image-based lighting (IBL) --------------------------------------------
// The PBR materials throughout the model set envMapIntensity (see
// styleMeshTree), which does NOTHING without an environment to reflect — that
// missing env map is why metal parts (notably the feeder-wheel gears) rendered
// flat and grey. Generate a soft studio environment procedurally (no external
// HDR file → CSP-safe, works offline) and assign it to the scene so every metal
// surface picks up reflections and reads with real depth. One-time cost.
function buildStudioEnvironmentTexture(targetRenderer) {
  const pmrem = new THREE.PMREMGenerator(targetRenderer);
  const envScene = new THREE.Scene();

  // Neutral "room" shell: soft grey surroundings that metals bounce off.
  const shellMat = new THREE.MeshStandardMaterial({
    side: THREE.BackSide, roughness: 1, metalness: 0,
  });
  shellMat.color.setHex(0x30373f);
  const shell = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), shellMat);
  envScene.add(shell);

  // Emissive planes act as soft area lights — a bright key overhead, a cool
  // front fill, a warm back rim, and gentle side fills. This is what gives the
  // gear teeth crisp highlights instead of a dull matte grey.
  const planeGeo = new THREE.PlaneGeometry(4, 4);
  const disposables = [shell.geometry, shellMat, planeGeo];
  const addAreaLight = (hex, intensity, position, rotation) => {
    const mat = new THREE.MeshStandardMaterial();
    mat.color.setHex(0x000000);
    mat.emissive.setHex(hex);
    mat.emissiveIntensity = intensity;
    const mesh = new THREE.Mesh(planeGeo, mat);
    mesh.position.set(position[0], position[1], position[2]);
    if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
    envScene.add(mesh);
    disposables.push(mat);
  };
  addAreaLight(0xffffff, 3.4, [0, 4.7, 0], [Math.PI / 2, 0, 0]);   // key (top)
  addAreaLight(0xc4d9ff, 1.1, [0, 0.5, 4.7], [0, 0, 0]);           // cool front fill
  addAreaLight(0xffe1bd, 0.9, [0, 1.2, -4.7], [0, Math.PI, 0]);    // warm back rim
  addAreaLight(0xffffff, 0.7, [4.7, 1.0, 0], [0, -Math.PI / 2, 0]);// right fill
  addAreaLight(0xffffff, 0.5, [-4.7, 1.0, 0], [0, Math.PI / 2, 0]);// left fill

  const renderTarget = pmrem.fromScene(envScene, 0.04);
  for (const d of disposables) d.dispose();
  pmrem.dispose();
  return renderTarget.texture;
}

export function createSceneCore({ canvas, width, height, devicePixelRatio }) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, REST_RENDER_PIXEL_RATIO));
  renderer.setSize(width, height);
  renderer.setClearColor(0x0b0a09);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = ENABLE_REALTIME_SHADOWS;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0a09);
  scene.fog = new THREE.Fog(0x0b0a09, 400, 2200);

  const camera = new THREE.PerspectiveCamera(58, width / height, 0.05, 6000);
  camera.up.set(0, 0, 1);
  camera.position.set(1.5, 1.3, 1.1);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.rotateSpeed = 1.05;
  controls.panSpeed = 1.0;
  controls.zoomSpeed = 1.05;
  controls.target.set(0, 0, 0.45);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.66);
  scene.add(ambientLight);

  const topLight = new THREE.DirectionalLight(0xffffff, 1.0);
  topLight.position.set(0, 0, 5.0);
  topLight.castShadow = ENABLE_REALTIME_SHADOWS;
  topLight.shadow.mapSize.set(1024, 1024);
  topLight.shadow.camera.near = 0.1;
  topLight.shadow.camera.far = 25;
  topLight.shadow.camera.left = -4;
  topLight.shadow.camera.right = 4;
  topLight.shadow.camera.top = 4;
  topLight.shadow.camera.bottom = -4;
  topLight.shadow.bias = -0.00015;
  scene.add(topLight);
  scene.add(topLight.target);

  scene.add(camera);
  const viewerLight = new THREE.DirectionalLight(0xdfefff, 2.4);
  viewerLight.position.set(0.15, 0.2, 0.35);
  const viewerLightTarget = new THREE.Object3D();
  viewerLightTarget.position.set(0, 0, -1);
  camera.add(viewerLightTarget);
  viewerLight.target = viewerLightTarget;
  camera.add(viewerLight);

  // Built once. Applied ONLY to the feeder-wheel materials (see
  // enhanceFeederWheelMaterials) — NOT as scene.environment. A global environment
  // map makes IBL run per-pixel across the whole 7.5M-tri model, which showed up
  // as camera-movement lag; scoping it to the three gear meshes keeps the metal
  // look the gears needed at effectively zero frame cost.
  const studioEnvironmentTexture = buildStudioEnvironmentTexture(renderer);

  const grid = new THREE.GridHelper(2.5, 18, 0x36322e, 0x1c1a17);
  grid.rotation.x = Math.PI * 0.5;
  scene.add(grid);

  const groundShadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.22 }),
  );
  groundShadowPlane.receiveShadow = true;
  groundShadowPlane.visible = ENABLE_REALTIME_SHADOWS;
  scene.add(groundShadowPlane);

  return {
    renderer, scene, camera, controls,
    ambientLight, topLight, viewerLight,
    studioEnvironmentTexture, grid, groundShadowPlane,
  };
}
