// Viewer 3D-scene bootstrap (extracted byte-exact from urdf_viewer.js). Builds the
// WebGL renderer, scene/fog, camera, OrbitControls, the ambient/top/viewer lights,
// the procedural IBL studio environment, the floor grid and the ground shadow plane.
// createViewerScene({ canvas, restRenderPixelRatio, enableRealtimeShadows }) returns
// the core objects the god-file destructures back (scene/camera/renderer/controls +
// studioEnvironmentTexture/grid/groundShadowPlane/topLight) plus a frozen `context`
// bundle of getScene/getCamera/getControls/getRenderer accessors that the 3D-core
// factories consume. robotRoot is NOT owned here (the URDF loader creates it).
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export function createViewerScene({ canvas, restRenderPixelRatio, enableRealtimeShadows }) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, restRenderPixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x0b0a09);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = enableRealtimeShadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0a09);
  scene.fog = new THREE.Fog(0x0b0a09, 400, 2200);

  const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.05, 6000);
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
  topLight.castShadow = enableRealtimeShadows;
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
  groundShadowPlane.visible = enableRealtimeShadows;
  scene.add(groundShadowPlane);

  const context = Object.freeze({
    getScene: () => scene,
    getCamera: () => camera,
    getControls: () => controls,
    getRenderer: () => renderer,
  });
  return {
    scene,
    camera,
    renderer,
    controls,
    studioEnvironmentTexture,
    grid,
    groundShadowPlane,
    topLight,
    context,
  };
}
