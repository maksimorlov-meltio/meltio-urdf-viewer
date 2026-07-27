// ViewCube navigation gizmo (extracted byte-exact from urdf_viewer.js). Builds
// its OWN mini Three.js scene/camera/renderer for the little orientation cube;
// reads the MAIN camera each frame via ctx.getCamera() and drives the main
// camera on click through the ctx nav callbacks. createViewCubeController(ctx)
// returns { onResize, update }; the god-file calls update() from the RAF loop.
import * as THREE from "three";

const VIEW_CUBE_TRANSITION_DURATION_MS = 860;
const VIEW_CUBE_RENDER_PIXEL_RATIO = 1.25;
export function createViewCubeController(ctx) {
  const {
    viewCubeOverlayEl,
    viewCubeCanvasEl,
    viewCubeHomeButtonEl,
    getCamera,
    buildViewCubeCameraState,
    beginCameraTransition,
    resetCameraToRobotView,
    createViewCubeLabelTexture,
    markUserActivity,
  } = ctx;
  if (!viewCubeOverlayEl || !viewCubeCanvasEl) {
    return null;
  }

  const cubeRenderer = new THREE.WebGLRenderer({
    canvas: viewCubeCanvasEl,
    antialias: true,
    alpha: true,
    powerPreference: "low-power",
  });
  cubeRenderer.setClearColor(0x000000, 0);
  cubeRenderer.outputColorSpace = THREE.SRGBColorSpace;
  cubeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, VIEW_CUBE_RENDER_PIXEL_RATIO));

  const cubeScene = new THREE.Scene();
  const cubeCamera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 20);
  cubeCamera.position.set(0, 0, 6);
  cubeCamera.lookAt(0, 0, 0);

  const ambient = new THREE.AmbientLight(0xffffff, 0.85);
  cubeScene.add(ambient);

  const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
  keyLight.position.set(2.1, 1.5, 3.1);
  cubeScene.add(keyLight);

  const cubeRoot = new THREE.Group();
  cubeScene.add(cubeRoot);

  const cubeMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 1.3, 1.3),
    new THREE.MeshStandardMaterial({
      color: 0x5878a0,
      roughness: 0.36,
      metalness: 0.12,
      transparent: true,
      opacity: 0.92,
    }),
  );
  cubeRoot.add(cubeMesh);

  const cubeEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(cubeMesh.geometry),
    new THREE.LineBasicMaterial({ color: 0xe4f4ff, transparent: true, opacity: 0.94 }),
  );
  cubeRoot.add(cubeEdges);

  const faceDefinitions = [
    { label: "Front", direction: new THREE.Vector3(0, 1, 0) },
    { label: "Back", direction: new THREE.Vector3(0, -1, 0) },
    { label: "Left", direction: new THREE.Vector3(-1, 0, 0) },
    { label: "Right", direction: new THREE.Vector3(1, 0, 0) },
    { label: "Top", direction: new THREE.Vector3(0, 0, 1) },
    { label: "Bottom", direction: new THREE.Vector3(0, 0, -1) },
  ];

  const pickableObjects = [];

  const facePickMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.01,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const edgePickMaterial = new THREE.MeshBasicMaterial({
    color: 0x9ec4eb,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
  });

  const cornerPickMaterial = new THREE.MeshBasicMaterial({
    color: 0xc7e2ff,
    transparent: true,
    opacity: 0.23,
    depthWrite: false,
  });

  const zAxis = new THREE.Vector3(0, 0, 1);
  for (const face of faceDefinitions) {
    const labelTexture = createViewCubeLabelTexture(face.label);
    if (labelTexture) {
      const labelMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.76, 0.28),
        new THREE.MeshBasicMaterial({
          map: labelTexture,
          transparent: true,
          depthWrite: false,
        }),
      );
      labelMesh.position.copy(face.direction).multiplyScalar(0.78);
      labelMesh.quaternion.setFromUnitVectors(zAxis, face.direction);
      cubeRoot.add(labelMesh);
    }

    const facePick = new THREE.Mesh(new THREE.PlaneGeometry(1.16, 1.16), facePickMaterial.clone());
    facePick.position.copy(face.direction).multiplyScalar(0.68);
    facePick.quaternion.setFromUnitVectors(zAxis, face.direction);
    facePick.userData.direction = face.direction.clone();
    facePick.userData.type = "face";
    cubeRoot.add(facePick);
    pickableObjects.push(facePick);
  }

  const edgeCenters = [
    new THREE.Vector3(1, 1, 0),
    new THREE.Vector3(1, -1, 0),
    new THREE.Vector3(-1, 1, 0),
    new THREE.Vector3(-1, -1, 0),
    new THREE.Vector3(1, 0, 1),
    new THREE.Vector3(1, 0, -1),
    new THREE.Vector3(-1, 0, 1),
    new THREE.Vector3(-1, 0, -1),
    new THREE.Vector3(0, 1, 1),
    new THREE.Vector3(0, 1, -1),
    new THREE.Vector3(0, -1, 1),
    new THREE.Vector3(0, -1, -1),
  ];

  for (const edgeCenter of edgeCenters) {
    const edgePick = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), edgePickMaterial.clone());
    edgePick.position.copy(edgeCenter).multiplyScalar(0.7);
    edgePick.userData.direction = edgeCenter.clone().normalize();
    edgePick.userData.type = "edge";
    cubeRoot.add(edgePick);
    pickableObjects.push(edgePick);
  }

  for (const xSign of [-1, 1]) {
    for (const ySign of [-1, 1]) {
      for (const zSign of [-1, 1]) {
        const corner = new THREE.Vector3(xSign, ySign, zSign);
        const cornerPick = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 12), cornerPickMaterial.clone());
        cornerPick.position.copy(corner).multiplyScalar(0.71);
        cornerPick.userData.direction = corner.clone().normalize();
        cornerPick.userData.type = "corner";
        cubeRoot.add(cornerPick);
        pickableObjects.push(cornerPick);
      }
    }
  }

  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  const inverseMainCameraQuat = new THREE.Quaternion();
  const lastMainCameraQuat = new THREE.Quaternion();
  let hasRendered = false;
  let forceRender = true;

  const resize = () => {
    const rect = viewCubeCanvasEl.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));

    cubeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, VIEW_CUBE_RENDER_PIXEL_RATIO));
    cubeRenderer.setSize(width, height, false);

    const aspect = width / Math.max(height, 1);
    const halfSpan = 1.85;
    cubeCamera.left = -halfSpan * aspect;
    cubeCamera.right = halfSpan * aspect;
    cubeCamera.top = halfSpan;
    cubeCamera.bottom = -halfSpan;
    cubeCamera.updateProjectionMatrix();
    forceRender = true;
  };

  const getPointerDirection = (event) => {
    const rect = viewCubeCanvasEl.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointerNdc.y = -((((event.clientY - rect.top) / rect.height) * 2) - 1);
    raycaster.setFromCamera(pointerNdc, cubeCamera);
    const hits = raycaster.intersectObjects(pickableObjects, false);
    const direction = hits[0]?.object?.userData?.direction;
    return direction ? direction.clone() : null;
  };

  const navigateDirection = (direction) => {
    const targetState = buildViewCubeCameraState(direction);
    beginCameraTransition(targetState, VIEW_CUBE_TRANSITION_DURATION_MS, {
      distanceLock: null,
    });
  };

  viewCubeCanvasEl.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });

  viewCubeCanvasEl.addEventListener("click", (event) => {
    const direction = getPointerDirection(event);
    if (!direction) {
      return;
    }

    markUserActivity();
    navigateDirection(direction);
    forceRender = true;
  });

  viewCubeCanvasEl.addEventListener("mousemove", (event) => {
    const direction = getPointerDirection(event);
    viewCubeCanvasEl.style.cursor = direction ? "pointer" : "default";
  });

  viewCubeCanvasEl.addEventListener("mouseleave", () => {
    viewCubeCanvasEl.style.cursor = "default";
  });

  if (viewCubeHomeButtonEl) {
    viewCubeHomeButtonEl.addEventListener("click", () => {
      markUserActivity();
      resetCameraToRobotView({ smooth: true });
      forceRender = true;
    });
  }

  resize();

  return {
    onResize: resize,
    update: () => {
      inverseMainCameraQuat.copy(getCamera().quaternion).invert();
      cubeRoot.quaternion.copy(inverseMainCameraQuat);

      const quaternionChanged = !hasRendered
        || (1 - Math.abs(lastMainCameraQuat.dot(getCamera().quaternion))) > 1e-7;
      if (!quaternionChanged && !forceRender) {
        return;
      }

      cubeRenderer.render(cubeScene, cubeCamera);
      lastMainCameraQuat.copy(getCamera().quaternion);
      hasRendered = true;
      forceRender = false;
    },
  };
}
