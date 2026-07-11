import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";

const modelStatusEl = document.getElementById("modelStatus");
const meshStatusEl = document.getElementById("meshStatus");
const modelSelectEl = document.getElementById("modelSelect");
const reloadModelEl = document.getElementById("reloadModel");
const resetViewEl = document.getElementById("resetView");
const lightModeToggleEl = document.getElementById("lightModeToggle");
const jointControlsEl = document.getElementById("jointControls");
const userStepTransparencyEnabledEl = document.getElementById("userStepTransparencyEnabled");
const userStepTransparencyEl = document.getElementById("userStepTransparency");
const userStepTransparencyValueEl = document.getElementById("userStepTransparencyValue");
const displayTransparencyEnabledEl = document.getElementById("displayTransparencyEnabled");
const displayTransparencyEl = document.getElementById("displayTransparency");
const displayTransparencyValueEl = document.getElementById("displayTransparencyValue");
const headTransparencyEnabledEl = document.getElementById("headTransparencyEnabled");
const headTransparencyEl = document.getElementById("headTransparency");
const headTransparencyValueEl = document.getElementById("headTransparencyValue");
const feederDriveLeftEl = document.getElementById("feederDriveLeft");
const feederDriveStopEl = document.getElementById("feederDriveStop");
const feederDriveRightEl = document.getElementById("feederDriveRight");
const feederDriveUpEl = document.getElementById("feederDriveUp");
const feederDriveDownEl = document.getElementById("feederDriveDown");
const feederCameraAnchorLeftEl = document.getElementById("feederCameraAnchorLeft");
const feederCameraAnchorRightEl = document.getElementById("feederCameraAnchorRight");
const viewCubeOverlayEl = document.getElementById("viewCubeOverlay");
const viewCubeCanvasEl = document.getElementById("viewCubeCanvas");
const viewCubeHomeButtonEl = document.getElementById("viewCubeHomeButton");
const wireDrumAppearButtonEl = document.getElementById("wireDrumAppearButton");
const annotationNavFrontDoorEl = document.getElementById("annotationNavFrontDoor");
const annotationNavSpoolsDoorEl = document.getElementById("annotationNavSpoolsDoor");
const annotationNavTopCoverEl = document.getElementById("annotationNavTopCover");
const annotationLayerEl = document.getElementById("annotationLayer");
const canvas = document.getElementById("scene");

const annotationNavButtonsById = {
  "front-door": annotationNavFrontDoorEl,
  "spools-door": annotationNavSpoolsDoorEl,
  "top-cover": annotationNavTopCoverEl,
};

const REST_RENDER_PIXEL_RATIO = 1.8;
const INTERACTION_RENDER_PIXEL_RATIO = 1.25;
const INTERACTION_QUALITY_HOLD_MS = 110;
const ENABLE_REALTIME_SHADOWS = true;
const ANNOTATION_OCCLUSION_MAX_STALE_MS = 220;
const ANNOTATION_OCCLUSION_RAYCASTS_PER_FRAME = 0;
const ANNOTATION_OCCLUSION_TOLERANCE = 0.025;
const MIN_DYNAMIC_RENDER_PIXEL_RATIO = 1.25;
const DYNAMIC_QUALITY_SAMPLE_ALPHA = 0.08;
const DYNAMIC_QUALITY_DOWN_FRAME_MS = 24;
const DYNAMIC_QUALITY_UP_FRAME_MS = 16.8;
const DYNAMIC_QUALITY_DOWN_STEP = 0.1;
const DYNAMIC_QUALITY_UP_STEP = 0.05;
const DYNAMIC_QUALITY_DOWN_COOLDOWN_MS = 260;
const DYNAMIC_QUALITY_UP_COOLDOWN_MS = 900;

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, REST_RENDER_PIXEL_RATIO));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x060a12);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = ENABLE_REALTIME_SHADOWS;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x060a12);
scene.fog = new THREE.Fog(0x060a12, 400, 2200);

const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.05, 6000);
camera.up.set(0, 0, 1);
camera.position.set(1.5, 1.3, 1.1);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0, 0.45);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.588);
scene.add(ambientLight);

const topLight = new THREE.DirectionalLight(0xffffff, 1.0);
topLight.position.set(0, 0, 5.0);
topLight.castShadow = ENABLE_REALTIME_SHADOWS;
topLight.shadow.mapSize.set(1536, 1536);
topLight.shadow.camera.near = 0.1;
topLight.shadow.camera.far = 25;
topLight.shadow.camera.left = -4;
topLight.shadow.camera.right = 4;
topLight.shadow.camera.top = 4;
topLight.shadow.camera.bottom = -4;
topLight.shadow.bias = -0.00015;
scene.add(topLight);
scene.add(topLight.target);

// Soft rim/fill light to keep dark materials readable from off-angle views.
const rimFillLight = new THREE.DirectionalLight(0xbfd6ff, 0.28);
rimFillLight.position.set(-2.2, -1.5, 1.6);
scene.add(rimFillLight);

// Attach a light to the camera so surfaces facing the viewer stay readable.
scene.add(camera);
const viewerLight = new THREE.DirectionalLight(0xdfefff, 2.4);
viewerLight.position.set(0.15, 0.2, 0.35);
const viewerLightTarget = new THREE.Object3D();
viewerLightTarget.position.set(0, 0, -1);
camera.add(viewerLightTarget);
viewerLight.target = viewerLightTarget;
camera.add(viewerLight);

const grid = new THREE.GridHelper(2.5, 18, 0x2c4058, 0x192634);
grid.rotation.x = Math.PI * 0.5;
scene.add(grid);

const groundShadowPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.22 }),
);
groundShadowPlane.receiveShadow = true;
groundShadowPlane.visible = ENABLE_REALTIME_SHADOWS;
scene.add(groundShadowPlane);

const axes = new THREE.AxesHelper(0.4);
axes.position.set(-0.65, -0.65, 0.02);
scene.add(axes);
addAxesLabels(axes, 0.4);

const gltfLoader = new GLTFLoader();
const objLoader = new OBJLoader();
const CAD_TO_VIEWER_X_ROTATION = Math.PI * 0.5;
const DARK_BG_HEX = 0x060a12;
const LIGHT_BG_HEX = 0xffffff;
const LEFT_FEEDER_WHEEL_JOINT = "left_feeder_wheel_joint";
const RIGHT_FEEDER_WHEEL_JOINT = "right_feeder_wheel_joint";
const CENTRAL_FEEDER_WHEEL_JOINT = "central_feeder_wheel_joint";
const LEFT_SPOOL_JOINT = "spool_1_joint";
const SPOOL_1_LINK = "spool_1_link";
const RIGHT_SPOOL_JOINT = "spool_2_joint";
const SPOOL_2_LINK = "spool_2_link";
const FRONT_DOOR_JOINT = "front_door_joint";
const SPOOLS_DOOR_JOINT = "spools_door_joint";
const FRONT_DOOR_LINK = "front_door_link";
const HEAD_LINK = "head_link";
const PRINTING_AREA_LINK = "palpador_pro_link";
const FEEDER_LINK = "feeder_link";
const CENTRAL_FEEDER_WHEEL_LINK = "central_feeder_wheel_link";
const LEFT_FEEDER_WHEEL_LINK = "left_feeder_wheel_link";
const RIGHT_FEEDER_WHEEL_LINK = "right_feeder_wheel_link";
const SPOOLS_DOOR_LINK = "spools_door_link";
const TOP_COVER_LINK = "top_cover_link";
const WIRE_SPOOL_DOOR_JOINT = "wire_spool_door_joint";
const WIRE_DRUM_LINK = "wire_drum_link";
const HANDLE_PRIMARY_JOINT = "handle_joint";
const HANDLE_SECONDARY_JOINT = "handle_z_joint";
const HANDLE_TRANSITION_SMOOTH_FRACTION = 0.12;
const HANDLE_TRANSITION_MAX_RAD = THREE.MathUtils.degToRad(12);
const TOP_COVER_JOINT = "top_cover_joint";
const LEFT_GAS_SPRING_MAIN_JOINT = "gas_spring_main_part_left_joint";
const RIGHT_GAS_SPRING_MAIN_JOINT = "gas_spring_main_part_right_joint";
const LEFT_GAS_SPRING_SECONDARY_JOINT = "gas_spring_secondary_part_left_joint";
const RIGHT_GAS_SPRING_SECONDARY_JOINT = "gas_spring_secondary_part_right_joint";
const WIRE_DRUM_APPEAR_SPEED_PER_SEC = 0.55;
const WIRE_DRUM_APPEAR_END_BOOST_START = 0.72;
const WIRE_DRUM_APPEAR_END_BOOST_MULTIPLIER = 2.2;
const WIRE_SPOOL_DOOR_OPEN_SPEED_RAD_PER_SEC = THREE.MathUtils.degToRad(45);
const WIRE_SPOOL_DOOR_OPEN_TARGET_RAD = THREE.MathUtils.degToRad(35);
const WIRE_SPOOL_DOOR_CLOSED_TARGET_RAD = 0;
const RESET_VIEW_TRANSITION_MS = 1700;
const IDLE_RESET_TIMEOUT_MS = 50000;
const IDLE_RESET_TRANSITION_MS = 1900;
const FRONT_DOOR_OPEN_DURATION_SEC = 1.3;
const TOP_COVER_OPEN_DURATION_SEC = 1.3;
const SPOOL_DOOR_OPEN_DURATION_SEC = 1.5;
const MIN_CONTROL_DURATION_SEC = 0.05;
const FEEDER_WHEEL_SPEED_RAD_PER_SEC = 3.5;
const LEFT_SPOOL_ROTATION_PER_LEFT_FEEDER_ROTATION = 0.35;
const RIGHT_SPOOL_ROTATION_PER_RIGHT_FEEDER_ROTATION = 0.35;
const URDF_MODELS_API_URL = "/api/urdf/models";
const ANNOTATION_FOCUS_DURATION_MS = 850;
const FRONT_DOOR_BUTTON_CAMERA_DURATION_MS = 920;
const FRONT_DOOR_BUTTON_CLOSE_RESET_DURATION_MS = 980;
const FRONT_DOOR_BUTTON_PERP_Y_SIDE = 1;
const FRONT_DOOR_BUTTON_PRINTING_ZOOM_FACTOR = -2;
const FRONT_DOOR_BUTTON_X_ROTATION_RAD = THREE.MathUtils.degToRad(10);
const FRONT_DOOR_BUTTON_Z_ROTATION_RAD = THREE.MathUtils.degToRad(-40);
const VIEW_CUBE_TRANSITION_DURATION_MS = 860;
const VIEW_CUBE_RENDER_PIXEL_RATIO = 1.25;
const FEEDER_ANCHOR_CAMERA_DURATION_MS = 900;
const FEEDER_ANCHOR_DISTANCE_FACTOR = 0.66;
const FEEDER_ANCHOR_TARGET_Z_OFFSET = 0.035;
const SPOOLS_DOOR_BUTTON_CAMERA_DURATION_MS = 940;
const SPOOLS_DOOR_BUTTON_CLOSE_RESET_DURATION_MS = 980;
const SPOOLS_DOOR_BUTTON_PERP_X_SIDE = -1;
const TOP_COVER_BUTTON_CAMERA_DURATION_MS = 980;
const TOP_COVER_BUTTON_CLOSE_RESET_DURATION_MS = 980;
const TOP_COVER_BUTTON_PERP_Y_SIDE = -1;
const TOP_COVER_BUTTON_Y_ROTATION_RAD = THREE.MathUtils.degToRad(30);
const ANNOTATION_UPDATE_INTERVAL_MS = 0;
const ANNOTATION_CLICK_ACTIVE_HOLD_MS = 2200;
const ENABLE_ANNOTATION_OCCLUSION = false;
const ANNOTATION_DEFINITIONS = [
  {
    id: "front-door",
    label: "Front Door",
    jointName: FRONT_DOOR_JOINT,
    targetObjectName: "link:front_door_link",
    localOffset: [-0.5, -0.05, -0.03],
    iconClosed: getDoorIconSvg(false),
    iconOpen: getDoorIconSvg(true),
    cameraDirection: [1.15, -1.4, 0.2],
    cameraDistanceFactor: 1.2,
    cameraTargetOffset: [0, 0, 0.04],
    screenOffset: [110, -26],
  },
  {
    id: "spools-door",
    label: "Materials",
    jointName: SPOOLS_DOOR_JOINT,
    targetObjectName: "link:handle_link",
    fallbackTargetObjectName: "link:spools_door_link",
    localOffset: [0, 0, 0],
    iconClosed: getDoorIconSvg(false),
    iconOpen: getDoorIconSvg(true),
    cameraDirection: [-1.25, 0.82, 0.24],
    cameraDistanceFactor: 1.18,
    cameraTargetOffset: [0, 0, 0.03],
    screenOffset: [118, 10],
  },
  {
    id: "top-cover",
    label: "Top Cover",
    jointName: TOP_COVER_JOINT,
    targetObjectName: "link:top_cover_link",
    localOffset: [-0.445, -0.03, 0],
    iconClosed: getLidIconSvg(false),
    iconOpen: getLidIconSvg(true),
    cameraDirection: [-0.52, 1.15, 0.68],
    cameraDistanceFactor: 1.3,
    cameraTargetOffset: [0, 0, 0.09],
    screenOffset: [88, -78],
  },
];

let robotRoot = null;
let jointStates = [];
let activeLoadToken = 0;
let activeAssetCacheBustToken = String(Date.now());
let isLightMode = false;
let userStepMaterials = [];
let userStepOpacity = 0;
let userStepTransparencyEnabled = false;
let displayMaterials = [];
let displayOpacity = 0;
let displayTransparencyEnabled = false;
let headMaterials = [];
let headTransparency = 0;
let headTransparencyEnabled = false;
let headVisuals = [];
let feederDriveSide = null;
let feederDriveVertical = null;
let leftFeederWheelState = null;
let rightFeederWheelState = null;
let centralFeederWheelState = null;
let leftSpoolState = null;
let rightSpoolState = null;
let wireSpoolDoorState = null;
let wireDrumMaterials = [];
let wireDrumMeshes = [];
let spool1Meshes = [];
let wireDrumRevealProgress = 0;
let wireDrumRevealTarget = 0;
let cameraTransitionState = null;
let gasSpringAlignmentOffsets = null;
let activeFeederCameraAnchorSide = null;
const feederWheelEnabled = {
  central: true,
  right: true,
  left: true,
};
const jointControlTransitions = new Map();
let previousAnimationMs = performance.now();
let lastUserActivityMs = previousAnimationMs;
let interactionQualityUntilMs = previousAnimationMs;
let isInteractionQualityActive = false;
let interactionShadowsPaused = false;
let dynamicRestRenderPixelRatio = Math.min(window.devicePixelRatio, REST_RENDER_PIXEL_RATIO);
let currentRenderPixelRatio = Math.min(window.devicePixelRatio, REST_RENDER_PIXEL_RATIO);
let smoothedFrameMs = 16.7;
let lastDynamicQualityChangeMs = previousAnimationMs;
const GAS_SPRING_GEOMETRY = {
  topCoverPivotXY: new THREE.Vector2(0.34265, 1.8124),
  leftMainPivotXY: new THREE.Vector2(0.1446, 1.7328),
  rightMainPivotXY: new THREE.Vector2(0.1446, 1.7328),
  leftSecondaryLocalXY: new THREE.Vector2(-0.489, -0.03),
  rightSecondaryLocalXY: new THREE.Vector2(-0.49, -0.03),
};
const gasSpringRotatedLocalXY = new THREE.Vector2();
const gasSpringSecondaryWorldXY = new THREE.Vector2();
const assemblyAnnotationManager = createAssemblyAnnotationManager(annotationLayerEl);
const viewCubeController = createViewCubeController();

function createAxisLabelSprite(text, color) {
  const canvasEl = document.createElement("canvas");
  canvasEl.width = 128;
  canvasEl.height = 128;
  const ctx = canvasEl.getContext("2d");
  if (!ctx) {
    return null;
  }

  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
  ctx.font = "bold 68px Segoe UI";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(4, 9, 16, 0.72)";
  ctx.fillText(text, (canvasEl.width / 2) + 2, (canvasEl.height / 2) + 2);
  ctx.fillStyle = color;
  ctx.fillText(text, canvasEl.width / 2, canvasEl.height / 2);

  const texture = new THREE.CanvasTexture(canvasEl);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  const spriteMaterial = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: true,
    depthWrite: false,
  });

  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.scale.set(0.1, 0.1, 1);
  sprite.renderOrder = 0;
  return sprite;
}

function addAxesLabels(axesHelper, axisLength) {
  const xLabel = createAxisLabelSprite("X", "#ff8456");
  const yLabel = createAxisLabelSprite("Y", "#7fe392");
  const zLabel = createAxisLabelSprite("Z", "#78aaff");

  if (!xLabel || !yLabel || !zLabel) {
    return;
  }

  const labelOffset = axisLength + 0.06;
  xLabel.position.set(labelOffset, 0, 0);
  yLabel.position.set(0, labelOffset, 0);
  zLabel.position.set(0, 0, labelOffset);

  axesHelper.add(xLabel);
  axesHelper.add(yLabel);
  axesHelper.add(zLabel);
}

function parseVec3(text, fallback = [0, 0, 0]) {
  if (!text) {
    return [...fallback];
  }
  const values = text.trim().split(/\s+/).map((v) => Number(v));
  if (values.length !== 3 || values.some((v) => !Number.isFinite(v))) {
    return [...fallback];
  }
  return values;
}

function parseOrigin(node) {
  if (!node) {
    return {
      xyz: [0, 0, 0],
      rpy: [0, 0, 0],
    };
  }
  return {
    xyz: parseVec3(node.getAttribute("xyz"), [0, 0, 0]),
    rpy: parseVec3(node.getAttribute("rpy"), [0, 0, 0]),
  };
}

function applyOriginTransform(target, origin) {
  target.position.set(origin.xyz[0], origin.xyz[1], origin.xyz[2]);
  target.rotation.set(origin.rpy[0], origin.rpy[1], origin.rpy[2], "XYZ");
}

function clamp(value, min, max) {
  const lower = Math.min(min, max);
  const upper = Math.max(min, max);
  return Math.max(lower, Math.min(upper, value));
}

function approachValue(current, target, maxDelta) {
  if (current < target) {
    return Math.min(current + maxDelta, target);
  }
  return Math.max(current - maxDelta, target);
}

function easeInOutCubic(value) {
  const clamped = clamp(value, 0, 1);
  return clamped < 0.5
    ? 4 * clamped * clamped * clamped
    : 1 - (Math.pow((-2 * clamped) + 2, 3) / 2);
}

function markUserActivity(nowMs = performance.now()) {
  lastUserActivityMs = nowMs;
}

function getClampedRenderPixelRatio(maxRatio) {
  return Math.min(window.devicePixelRatio, maxRatio);
}

function getInteractionRenderPixelRatio() {
  return Math.min(dynamicRestRenderPixelRatio, INTERACTION_RENDER_PIXEL_RATIO);
}

function getPreferredRenderPixelRatio() {
  return isInteractionQualityActive
    ? getInteractionRenderPixelRatio()
    : dynamicRestRenderPixelRatio;
}

function applyRenderPixelRatio(maxRatio) {
  const nextPixelRatio = getClampedRenderPixelRatio(maxRatio);
  if (Math.abs(nextPixelRatio - currentRenderPixelRatio) < 1e-3) {
    return;
  }

  currentRenderPixelRatio = nextPixelRatio;
  renderer.setPixelRatio(nextPixelRatio);
}

function setInteractionShadowPause(paused) {
  if (!ENABLE_REALTIME_SHADOWS || interactionShadowsPaused === paused) {
    return;
  }

  interactionShadowsPaused = paused;
  renderer.shadowMap.autoUpdate = !paused;
  if (!paused) {
    renderer.shadowMap.needsUpdate = true;
  }
}

function beginInteractionQuality(nowMs = performance.now()) {
  interactionQualityUntilMs = nowMs + INTERACTION_QUALITY_HOLD_MS;
  if (!isInteractionQualityActive) {
    isInteractionQualityActive = true;
    setInteractionShadowPause(true);
    applyRenderPixelRatio(getInteractionRenderPixelRatio());
  }
}

function updateInteractionQuality(nowMs = performance.now()) {
  if (!isInteractionQualityActive || nowMs < interactionQualityUntilMs) {
    return;
  }

  isInteractionQualityActive = false;
  setInteractionShadowPause(false);
  applyRenderPixelRatio(dynamicRestRenderPixelRatio);
}

function updateAdaptiveRenderQuality(deltaSeconds, nowMs = performance.now()) {
  const frameMs = clamp(deltaSeconds * 1000, 5, 80);
  smoothedFrameMs = (smoothedFrameMs * (1 - DYNAMIC_QUALITY_SAMPLE_ALPHA)) + (frameMs * DYNAMIC_QUALITY_SAMPLE_ALPHA);

  const maxRestRatio = Math.min(window.devicePixelRatio, REST_RENDER_PIXEL_RATIO);

  if (
    smoothedFrameMs > DYNAMIC_QUALITY_DOWN_FRAME_MS
    && (nowMs - lastDynamicQualityChangeMs) >= DYNAMIC_QUALITY_DOWN_COOLDOWN_MS
  ) {
    const nextRatio = Math.max(dynamicRestRenderPixelRatio - DYNAMIC_QUALITY_DOWN_STEP, MIN_DYNAMIC_RENDER_PIXEL_RATIO);
    if (Math.abs(nextRatio - dynamicRestRenderPixelRatio) >= 1e-3) {
      dynamicRestRenderPixelRatio = nextRatio;
      lastDynamicQualityChangeMs = nowMs;
      applyRenderPixelRatio(getPreferredRenderPixelRatio());
    }
    return;
  }

  if (
    smoothedFrameMs < DYNAMIC_QUALITY_UP_FRAME_MS
    && (nowMs - lastDynamicQualityChangeMs) >= DYNAMIC_QUALITY_UP_COOLDOWN_MS
  ) {
    const nextRatio = Math.min(dynamicRestRenderPixelRatio + DYNAMIC_QUALITY_UP_STEP, maxRestRatio);
    if (Math.abs(nextRatio - dynamicRestRenderPixelRatio) >= 1e-3) {
      dynamicRestRenderPixelRatio = nextRatio;
      lastDynamicQualityChangeMs = nowMs;
      applyRenderPixelRatio(getPreferredRenderPixelRatio());
    }
  }
}

function startJointControlTransition(key, stepFn) {
  jointControlTransitions.set(key, stepFn);
}

function clearJointControlTransitions() {
  jointControlTransitions.clear();
}

function updateJointControlTransitions(deltaSeconds) {
  for (const [key, stepFn] of Array.from(jointControlTransitions.entries())) {
    const done = stepFn(deltaSeconds);
    if (done) {
      jointControlTransitions.delete(key);
    }
  }
}

function computeMotionSpeedForDuration(distanceRadians, durationSeconds) {
  const safeDuration = Math.max(durationSeconds, MIN_CONTROL_DURATION_SEC);
  return Math.max(distanceRadians, 0) / safeDuration;
}

function captureCameraState() {
  return {
    position: camera.position.clone(),
    target: controls.target.clone(),
    up: camera.up.clone(),
    near: camera.near,
    far: camera.far,
  };
}

function isCameraCloseToState(state, positionTolerance = 0.03, targetTolerance = 0.03) {
  return camera.position.distanceTo(state.position) <= positionTolerance
    && controls.target.distanceTo(state.target) <= targetTolerance;
}

function applyCameraState(state) {
  camera.position.copy(state.position);
  camera.up.copy(state.up);
  controls.target.copy(state.target);
  camera.near = state.near;
  camera.far = state.far;
  camera.updateProjectionMatrix();
}

function updateFeederCameraAnchorButtons() {
  const hasModel = Boolean(robotRoot);
  const buttonConfigs = [
    [feederCameraAnchorLeftEl, "left"],
    [feederCameraAnchorRightEl, "right"],
  ];

  for (const [buttonEl, side] of buttonConfigs) {
    if (!buttonEl) {
      continue;
    }

    const isActive = hasModel && activeFeederCameraAnchorSide === side;
    buttonEl.disabled = !hasModel;
    buttonEl.classList.toggle("active", isActive);
    buttonEl.setAttribute("aria-pressed", isActive ? "true" : "false");
  }
}

function getRobotBoundsSphere() {
  if (!robotRoot) {
    return null;
  }

  const bounds = new THREE.Box3().setFromObject(robotRoot);
  if (bounds.isEmpty()) {
    return null;
  }

  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  if (!Number.isFinite(sphere.radius) || sphere.radius <= 1e-8) {
    return null;
  }

  return {
    center: sphere.center.clone(),
    radius: sphere.radius,
  };
}

function buildViewCubeCameraState(directionVector) {
  const direction = directionVector.clone();
  if (!Number.isFinite(direction.x) || !Number.isFinite(direction.y) || !Number.isFinite(direction.z) || direction.lengthSq() <= 1e-8) {
    direction.set(1, 1, 1);
  }
  direction.normalize();

  const boundsSphere = getRobotBoundsSphere();
  const baseState = fitCameraToRobot();
  const target = boundsSphere?.center?.clone()
    || baseState?.target?.clone()
    || controls.target.clone();

  const baseDistance = baseState
    ? baseState.position.distanceTo(baseState.target)
    : (boundsSphere ? Math.max(boundsSphere.radius * 2.4, 0.8) : camera.position.distanceTo(controls.target));
  const currentDistance = camera.position.distanceTo(controls.target);
  const minDistance = boundsSphere ? Math.max(boundsSphere.radius * 1.05, 0.6) : 0.6;
  const maxDistance = boundsSphere ? Math.max(boundsSphere.radius * 7.5, baseDistance * 2.2) : Math.max(baseDistance * 2.2, 9);
  const desiredDistance = clamp(
    Number.isFinite(currentDistance) && currentDistance > 1e-5 ? currentDistance : baseDistance,
    minDistance,
    maxDistance,
  );

  const up = new THREE.Vector3(0, 0, 1);
  if (Math.abs(direction.dot(up)) > 0.985) {
    up.set(0, direction.z >= 0 ? 1 : -1, 0);
  }

  return {
    position: target.clone().addScaledVector(direction, desiredDistance),
    target,
    up,
    near: baseState?.near ?? camera.near,
    far: baseState?.far ?? camera.far,
  };
}

function createViewCubeLabelTexture(label) {
  const labelCanvas = document.createElement("canvas");
  labelCanvas.width = 256;
  labelCanvas.height = 96;
  const ctx = labelCanvas.getContext("2d");
  if (!ctx) {
    return null;
  }

  const radius = 14;
  const width = labelCanvas.width;
  const height = labelCanvas.height;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "rgba(16, 31, 52, 0.9)";
  ctx.strokeStyle = "rgba(160, 209, 255, 0.92)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(radius, 2);
  ctx.lineTo(width - radius, 2);
  ctx.quadraticCurveTo(width - 2, 2, width - 2, radius);
  ctx.lineTo(width - 2, height - radius);
  ctx.quadraticCurveTo(width - 2, height - 2, width - radius, height - 2);
  ctx.lineTo(radius, height - 2);
  ctx.quadraticCurveTo(2, height - 2, 2, height - radius);
  ctx.lineTo(2, radius);
  ctx.quadraticCurveTo(2, 2, radius, 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.font = "600 36px Segoe UI";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ecf7ff";
  ctx.fillText(label, width * 0.5, height * 0.5);

  const texture = new THREE.CanvasTexture(labelCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createViewCubeController() {
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
      inverseMainCameraQuat.copy(camera.quaternion).invert();
      cubeRoot.quaternion.copy(inverseMainCameraQuat);

      const quaternionChanged = !hasRendered
        || (1 - Math.abs(lastMainCameraQuat.dot(camera.quaternion))) > 1e-7;
      if (!quaternionChanged && !forceRender) {
        return;
      }

      cubeRenderer.render(cubeScene, cubeCamera);
      lastMainCameraQuat.copy(camera.quaternion);
      hasRendered = true;
      forceRender = false;
    },
  };
}

function beginCameraTransition(targetState, durationMs = RESET_VIEW_TRANSITION_MS, options = {}) {
  const distanceLock = Number.isFinite(options.distanceLock)
    ? Math.max(Number(options.distanceLock), 0.05)
    : null;

  cameraTransitionState = {
    start: captureCameraState(),
    target: {
      position: targetState.position.clone(),
      target: targetState.target.clone(),
      up: targetState.up.clone(),
      near: targetState.near,
      far: targetState.far,
    },
    distanceLock,
    startMs: performance.now(),
    durationMs: Math.max(durationMs, 1),
  };
}

function updateCameraTransition(nowMs) {
  if (!cameraTransitionState) {
    return;
  }

  const progress = clamp(
    (nowMs - cameraTransitionState.startMs) / cameraTransitionState.durationMs,
    0,
    1,
  );
  const eased = easeInOutCubic(progress);

  const interpolatedUp = cameraTransitionState.start.up
    .clone()
    .lerp(cameraTransitionState.target.up, eased);

  if (interpolatedUp.lengthSq() <= 1e-8) {
    interpolatedUp.set(0, 0, 1);
  } else {
    interpolatedUp.normalize();
  }

  const interpolatedTarget = cameraTransitionState.start.target
    .clone()
    .lerp(cameraTransitionState.target.target, eased);
  const interpolatedPosition = cameraTransitionState.start.position
    .clone()
    .lerp(cameraTransitionState.target.position, eased);

  if (cameraTransitionState.distanceLock !== null) {
    const toCamera = interpolatedPosition.clone().sub(interpolatedTarget);
    if (toCamera.lengthSq() <= 1e-8) {
      toCamera.copy(cameraTransitionState.start.position).sub(cameraTransitionState.start.target);
    }
    if (toCamera.lengthSq() <= 1e-8) {
      toCamera.set(-1, 1, 0.25);
    }
    toCamera.normalize();
    interpolatedPosition.copy(
      interpolatedTarget.clone().addScaledVector(toCamera, cameraTransitionState.distanceLock),
    );
  }

  applyCameraState({
    position: interpolatedPosition,
    target: interpolatedTarget,
    up: interpolatedUp,
    near: THREE.MathUtils.lerp(cameraTransitionState.start.near, cameraTransitionState.target.near, eased),
    far: THREE.MathUtils.lerp(cameraTransitionState.start.far, cameraTransitionState.target.far, eased),
  });

  if (progress >= 1) {
    applyCameraState(cameraTransitionState.target);
    cameraTransitionState = null;
  }
}

function isAnyAssemblyActionActive() {
  return isFrontDoorOpen() || isSpoolsDoorOpen() || isTopCoverOpen();
}

function updateIdleReset(nowMs) {
  if (!robotRoot) {
    return;
  }

  if (isAnyAssemblyActionActive()) {
    return;
  }

  if ((nowMs - lastUserActivityMs) < IDLE_RESET_TIMEOUT_MS) {
    return;
  }

  const baseCameraState = fitCameraToRobot();
  if (!baseCameraState) {
    return;
  }

  if (cameraTransitionState) {
    return;
  }

  if (isCameraCloseToState(baseCameraState)) {
    lastUserActivityMs = nowMs;
    return;
  }

  resetCameraToRobotView({
    smooth: true,
    durationMs: IDLE_RESET_TRANSITION_MS,
  });

  // Prevent continuous re-triggering while user remains idle.
  lastUserActivityMs = nowMs;
}

function setJointValue(state, value, options = {}) {
  const syncSlider = options.syncSlider !== false;
  state.value = value;

  if (state.kind === "linear") {
    state.motionGroup.position.set(0, 0, 0);
    state.motionGroup.position.addScaledVector(state.axis, value);
  } else {
    state.motionGroup.setRotationFromAxisAngle(state.axis, value);
  }

  if (state.valueEl) {
    if (state.kind === "linear") {
      const millimeters = value * 1000;
      state.valueEl.textContent = `${millimeters.toFixed(1)} mm`;
    } else {
      const degrees = THREE.MathUtils.radToDeg(value);
      state.valueEl.textContent = `${degrees.toFixed(1)} deg`;
    }
  }

  if (syncSlider && state.sliderEl && document.activeElement !== state.sliderEl) {
    state.sliderEl.value = String(value);
  }
}

function getCombinedHandleValue(primaryState, secondaryState) {
  return (primaryState.value - primaryState.lower) + (secondaryState.value - secondaryState.lower);
}

function applyCombinedHandleValue(primaryState, secondaryState, combinedValue) {
  const primarySpan = Math.max(primaryState.upper - primaryState.lower, 0);
  const secondarySpan = Math.max(secondaryState.upper - secondaryState.lower, 0);
  const totalSpan = primarySpan + secondarySpan;
  const clampedCombined = clamp(combinedValue, 0, totalSpan);
  const blendHalfSpan = Math.min(
    Math.min(primarySpan, secondarySpan) * HANDLE_TRANSITION_SMOOTH_FRACTION,
    HANDLE_TRANSITION_MAX_RAD,
  );

  if (blendHalfSpan > 0
      && clampedCombined > (primarySpan - blendHalfSpan)
      && clampedCombined < (primarySpan + blendHalfSpan)) {
    const directPrimaryDelta = clamp(clampedCombined, 0, primarySpan);
    const directSecondaryDelta = clamp(clampedCombined - primarySpan, 0, secondarySpan);
    const blend = THREE.MathUtils.smoothstep(
      clampedCombined,
      primarySpan - blendHalfSpan,
      primarySpan + blendHalfSpan,
    );
    const smoothedPrimary = THREE.MathUtils.lerp(directPrimaryDelta, primarySpan, blend);
    const smoothedSecondary = THREE.MathUtils.lerp(0, directSecondaryDelta, blend);

    setJointValue(primaryState, primaryState.lower + smoothedPrimary, { syncSlider: false });
    setJointValue(secondaryState, secondaryState.lower + smoothedSecondary, { syncSlider: false });
    return clampedCombined;
  }

  if (clampedCombined <= primarySpan) {
    setJointValue(primaryState, primaryState.lower + clampedCombined, { syncSlider: false });
    setJointValue(secondaryState, secondaryState.lower, { syncSlider: false });
  } else {
    setJointValue(primaryState, primaryState.upper, { syncSlider: false });
    setJointValue(secondaryState, secondaryState.lower + (clampedCombined - primarySpan), { syncSlider: false });
  }

  return clampedCombined;
}

function getCombinedHandleDoorValue(primaryState, secondaryState, doorState) {
  return getCombinedHandleValue(primaryState, secondaryState) + (doorState.value - doorState.lower);
}

function applyCombinedHandleDoorValue(primaryState, secondaryState, doorState, combinedValue) {
  const primarySpan = Math.max(primaryState.upper - primaryState.lower, 0);
  const secondarySpan = Math.max(secondaryState.upper - secondaryState.lower, 0);
  const doorSpan = Math.max(doorState.upper - doorState.lower, 0);
  const handleSpan = primarySpan + secondarySpan;
  const totalSpan = handleSpan + doorSpan;
  const clampedCombined = clamp(combinedValue, 0, totalSpan);

  if (clampedCombined <= handleSpan) {
    applyCombinedHandleValue(primaryState, secondaryState, clampedCombined);
    setJointValue(doorState, doorState.lower, { syncSlider: false });
    return clampedCombined;
  }

  applyCombinedHandleValue(primaryState, secondaryState, handleSpan);
  setJointValue(doorState, doorState.lower + (clampedCombined - handleSpan), { syncSlider: false });
  return clampedCombined;
}

function rotateLocalPointByNegativeZ(localPoint, angle) {
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  gasSpringRotatedLocalXY.set(
    (cos * localPoint.x) - (sin * localPoint.y),
    (sin * localPoint.x) + (cos * localPoint.y),
  );
  return gasSpringRotatedLocalXY;
}

function getGasSpringLineAngleFromGeometry(topCoverAngle, sideKey) {
  const mainPivot = sideKey === "left"
    ? GAS_SPRING_GEOMETRY.leftMainPivotXY
    : GAS_SPRING_GEOMETRY.rightMainPivotXY;
  const secondaryLocal = sideKey === "left"
    ? GAS_SPRING_GEOMETRY.leftSecondaryLocalXY
    : GAS_SPRING_GEOMETRY.rightSecondaryLocalXY;

  const rotatedSecondaryLocal = rotateLocalPointByNegativeZ(secondaryLocal, topCoverAngle);
  gasSpringSecondaryWorldXY.copy(GAS_SPRING_GEOMETRY.topCoverPivotXY).add(rotatedSecondaryLocal);

  return Math.atan2(
    gasSpringSecondaryWorldXY.y - mainPivot.y,
    gasSpringSecondaryWorldXY.x - mainPivot.x,
  );
}

function computeGasSpringAlignmentOffsets(
  topCoverState,
  leftGasSpringState,
  rightGasSpringState,
) {
  const referenceTopCover = topCoverState.lower;
  const leftLineAngle = getGasSpringLineAngleFromGeometry(referenceTopCover, "left");
  const rightLineAngle = getGasSpringLineAngleFromGeometry(referenceTopCover, "right");

  return {
    left: leftGasSpringState.lower - leftLineAngle,
    right: rightGasSpringState.lower - rightLineAngle,
  };
}

function applySynchronizedTopCoverGasSpringValue(
  topCoverState,
  leftGasSpringState,
  rightGasSpringState,
  leftSecondaryGasSpringState,
  rightSecondaryGasSpringState,
  topCoverValue,
) {
  const clampedTopCover = clamp(topCoverValue, topCoverState.lower, topCoverState.upper);
  setJointValue(topCoverState, clampedTopCover, { syncSlider: false });

  if (!gasSpringAlignmentOffsets) {
    gasSpringAlignmentOffsets = computeGasSpringAlignmentOffsets(
      topCoverState,
      leftGasSpringState,
      rightGasSpringState,
    );
  }

  const applyAlignedGasSpringState = (mainState, secondaryState, sideKey) => {
    if (!mainState) {
      return;
    }

    const lineAngle = getGasSpringLineAngleFromGeometry(clampedTopCover, sideKey);

    const mainTarget = clamp(
      lineAngle + gasSpringAlignmentOffsets[sideKey],
      mainState.lower,
      mainState.upper,
    );
    setJointValue(mainState, mainTarget, { syncSlider: false });

    if (!secondaryState) {
      return;
    }

    // Secondary state uses the same world orientation as main, translated back
    // to its local frame (which inherits top cover rotation).
    const secondaryTarget = clamp(
      mainTarget + clampedTopCover,
      secondaryState.lower,
      secondaryState.upper,
    );
    setJointValue(secondaryState, secondaryTarget, { syncSlider: false });
  };

  applyAlignedGasSpringState(leftGasSpringState, leftSecondaryGasSpringState, "left");
  applyAlignedGasSpringState(rightGasSpringState, rightSecondaryGasSpringState, "right");

  return clampedTopCover;
}

function wrapJointValue(state, value) {
  if (!Number.isFinite(state.lower) || !Number.isFinite(state.upper) || state.upper <= state.lower) {
    return value;
  }

  const span = state.upper - state.lower;
  let wrapped = value;
  while (wrapped > state.upper) {
    wrapped -= span;
  }
  while (wrapped < state.lower) {
    wrapped += span;
  }
  return clamp(wrapped, state.lower, state.upper);
}

function getFeederWheelKeyForJointName(jointName) {
  if (jointName === CENTRAL_FEEDER_WHEEL_JOINT) {
    return "central";
  }
  if (jointName === RIGHT_FEEDER_WHEEL_JOINT) {
    return "right";
  }
  if (jointName === LEFT_FEEDER_WHEEL_JOINT) {
    return "left";
  }
  return null;
}

function updateFeederDriveButtons() {
  const stopActive = !feederDriveSide || !feederDriveVertical;

  if (feederDriveLeftEl) {
    const isActive = feederDriveSide === "left";
    feederDriveLeftEl.classList.toggle("active", isActive);
    feederDriveLeftEl.setAttribute("aria-pressed", isActive ? "true" : "false");
    feederDriveLeftEl.disabled = false;
  }

  if (feederDriveStopEl) {
    feederDriveStopEl.classList.toggle("active", stopActive);
    feederDriveStopEl.setAttribute("aria-pressed", stopActive ? "true" : "false");
    feederDriveStopEl.disabled = false;
  }

  if (feederDriveRightEl) {
    const isActive = feederDriveSide === "right";
    feederDriveRightEl.classList.toggle("active", isActive);
    feederDriveRightEl.setAttribute("aria-pressed", isActive ? "true" : "false");
    feederDriveRightEl.disabled = false;
  }

  if (feederDriveUpEl) {
    const isActive = feederDriveVertical === "up";
    feederDriveUpEl.classList.toggle("active", isActive);
    feederDriveUpEl.setAttribute("aria-pressed", isActive ? "true" : "false");
    feederDriveUpEl.disabled = false;
  }

  if (feederDriveDownEl) {
    const isActive = feederDriveVertical === "down";
    feederDriveDownEl.classList.toggle("active", isActive);
    feederDriveDownEl.setAttribute("aria-pressed", isActive ? "true" : "false");
    feederDriveDownEl.disabled = false;
  }
}

function updateFeederWheelToggles() {
  const wheelStates = [
    ["central", centralFeederWheelState],
    ["right", rightFeederWheelState],
    ["left", leftFeederWheelState],
  ];

  for (const [wheelKey, state] of wheelStates) {
    if (!state?.toggleEl) {
      continue;
    }

    state.toggleEl.checked = feederWheelEnabled[wheelKey];
    if (state.toggleWrapEl) {
      state.toggleWrapEl.classList.toggle("active", feederWheelEnabled[wheelKey]);
    }
    state.toggleEl.disabled = false;
  }
}

function setFeederDriveSide(side) {
  feederDriveSide = side;
  if (!feederDriveVertical) {
    feederDriveVertical = "up";
  }
  updateFeederDriveButtons();
}

function setFeederDriveVertical(vertical) {
  feederDriveVertical = vertical;
  if (!feederDriveSide) {
    if (leftFeederWheelState) {
      feederDriveSide = "left";
    } else if (rightFeederWheelState) {
      feederDriveSide = "right";
    }
  }
  updateFeederDriveButtons();
}

function setFeederDriveStop() {
  feederDriveSide = null;
  feederDriveVertical = null;
  updateFeederDriveButtons();
}

function syncFeederWheelStates() {
  leftFeederWheelState = jointStates.find((state) => state.name === LEFT_FEEDER_WHEEL_JOINT) || null;
  rightFeederWheelState = jointStates.find((state) => state.name === RIGHT_FEEDER_WHEEL_JOINT) || null;
  centralFeederWheelState = jointStates.find((state) => state.name === CENTRAL_FEEDER_WHEEL_JOINT) || null;
  leftSpoolState = jointStates.find((state) => state.name === LEFT_SPOOL_JOINT) || null;
  rightSpoolState = jointStates.find((state) => state.name === RIGHT_SPOOL_JOINT) || null;
  wireSpoolDoorState = jointStates.find((state) => state.name === WIRE_SPOOL_DOOR_JOINT) || null;

  if (centralFeederWheelState?.sliderEl) {
    centralFeederWheelState.sliderEl.disabled = true;
  }

  if (!leftFeederWheelState && feederDriveSide === "left") {
    feederDriveSide = null;
  }
  if (!rightFeederWheelState && feederDriveSide === "right") {
    feederDriveSide = null;
  }

  updateFeederWheelToggles();
  updateFeederDriveButtons();
}

function applyWireDrumAppearance() {
  const clampedProgress = clamp(wireDrumRevealProgress, 0, 1);
  const easedProgress = (clampedProgress * clampedProgress) * (3 - (2 * clampedProgress));
  const isHidden = easedProgress <= 0.001;
  const isWireDrumVisible = !isHidden;

  for (const meshNode of wireDrumMeshes) {
    meshNode.visible = !isHidden;
    // In light mode, disable near-invisible shadow casting to avoid ghost shadows.
    if (isLightMode) {
      meshNode.castShadow = ENABLE_REALTIME_SHADOWS && easedProgress > 0.08;
    } else {
      meshNode.castShadow = ENABLE_REALTIME_SHADOWS && !isHidden;
    }
  }

  for (const meshNode of spool1Meshes) {
    meshNode.visible = !isWireDrumVisible;
    meshNode.castShadow = ENABLE_REALTIME_SHADOWS && !isWireDrumVisible;
  }

  for (const material of wireDrumMaterials) {
    setMaterialOpacity(material, easedProgress);
  }

  if (!wireDrumAppearButtonEl) {
    return;
  }

  const hasWireDrum = wireDrumMaterials.length > 0;
  wireDrumAppearButtonEl.disabled = !hasWireDrum;

  if (!hasWireDrum) {
    wireDrumAppearButtonEl.textContent = "Wire Drum";
    wireDrumAppearButtonEl.setAttribute("aria-pressed", "false");
    return;
  }

  if (wireDrumRevealTarget > clampedProgress + 1e-6) {
    wireDrumAppearButtonEl.textContent = "Appearing...";
    wireDrumAppearButtonEl.setAttribute("aria-pressed", "true");
    return;
  }

  if (wireDrumRevealTarget < clampedProgress - 1e-6) {
    wireDrumAppearButtonEl.textContent = "Hiding...";
    wireDrumAppearButtonEl.setAttribute("aria-pressed", "false");
    return;
  }

  if (clampedProgress >= 0.999) {
    wireDrumAppearButtonEl.textContent = "Hide Wire Drum + Close Door";
    wireDrumAppearButtonEl.setAttribute("aria-pressed", "true");
    return;
  }

  wireDrumAppearButtonEl.textContent = "Wire Drum";
  wireDrumAppearButtonEl.setAttribute("aria-pressed", "false");
}

function registerWireDrumMaterials(object3d) {
  const known = new Set(wireDrumMaterials);
  const knownMeshes = new Set(wireDrumMeshes);

  object3d.traverse((node) => {
    if (!node.isMesh) {
      return;
    }

    if (!knownMeshes.has(node)) {
      knownMeshes.add(node);
      wireDrumMeshes.push(node);
    }

    if (!node.material) {
      return;
    }

    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (!known.has(material)) {
        known.add(material);
        wireDrumMaterials.push(material);
      }
    }
  });
}

function registerSpool1Meshes(object3d) {
  const knownMeshes = new Set(spool1Meshes);

  object3d.traverse((node) => {
    if (!node.isMesh) {
      return;
    }

    if (!knownMeshes.has(node)) {
      knownMeshes.add(node);
      spool1Meshes.push(node);
    }
  });
}

function triggerWireDrumAppearance() {
  const isCurrentlyShown = wireDrumRevealProgress > 0.5 || wireDrumRevealTarget > 0.5;
  wireDrumRevealTarget = isCurrentlyShown ? 0 : 1;
  markUserActivity();
  applyWireDrumAppearance();
}

function animateWireDrumAppearance(deltaSeconds) {
  if (Math.abs(wireDrumRevealProgress - wireDrumRevealTarget) > 1e-6) {
    const isShowing = wireDrumRevealTarget > wireDrumRevealProgress;
    let revealSpeed = WIRE_DRUM_APPEAR_SPEED_PER_SEC;

    if (isShowing) {
      const endPhase = clamp(
        (wireDrumRevealProgress - WIRE_DRUM_APPEAR_END_BOOST_START)
          / (1 - WIRE_DRUM_APPEAR_END_BOOST_START),
        0,
        1,
      );
      revealSpeed *= 1 + (endPhase * (WIRE_DRUM_APPEAR_END_BOOST_MULTIPLIER - 1));
    }

    wireDrumRevealProgress = approachValue(
      wireDrumRevealProgress,
      wireDrumRevealTarget,
      revealSpeed * deltaSeconds,
    );
    applyWireDrumAppearance();
  }

  if (!wireSpoolDoorState) {
    return;
  }

  const rawDoorTarget = wireDrumRevealTarget > 0.5
    ? WIRE_SPOOL_DOOR_OPEN_TARGET_RAD
    : WIRE_SPOOL_DOOR_CLOSED_TARGET_RAD;
  const targetDoorValue = clamp(rawDoorTarget, wireSpoolDoorState.lower, wireSpoolDoorState.upper);
  const nextDoorValue = approachValue(
    wireSpoolDoorState.value,
    targetDoorValue,
    WIRE_SPOOL_DOOR_OPEN_SPEED_RAD_PER_SEC * deltaSeconds,
  );

  if (Math.abs(nextDoorValue - wireSpoolDoorState.value) > 1e-6) {
    setJointValue(wireSpoolDoorState, nextDoorValue);
  }
}

function animateFeederWheels(deltaSeconds) {
  if (!feederDriveSide || !feederDriveVertical) {
    return;
  }

  const activeState = feederDriveSide === "left" ? leftFeederWheelState : rightFeederWheelState;
  if (!activeState) {
    return;
  }

  const deltaAngle = FEEDER_WHEEL_SPEED_RAD_PER_SEC * deltaSeconds;
  const sideKey = feederDriveSide;
  const verticalSign = feederDriveVertical === "up" ? -1 : 1;
  const sideDirectionMultiplier = sideKey === "right" ? -1 : 1;
  const sideDelta = deltaAngle * verticalSign * sideDirectionMultiplier;
  const sideEnabled = feederWheelEnabled[sideKey];

  if (sideEnabled) {
    setJointValue(activeState, wrapJointValue(activeState, activeState.value + sideDelta));
  }

  const centralDelta = sideEnabled && feederWheelEnabled.central ? -sideDelta : 0;

  if (centralFeederWheelState && centralDelta !== 0) {
    setJointValue(
      centralFeederWheelState,
      wrapJointValue(centralFeederWheelState, centralFeederWheelState.value + centralDelta),
    );
  }

  if (sideKey === "left" && leftSpoolState && feederWheelEnabled.left) {
    // Spool 1 direction is synchronized with the left feeder wheel.
    setJointValue(
      leftSpoolState,
      wrapJointValue(
        leftSpoolState,
        leftSpoolState.value + sideDelta * LEFT_SPOOL_ROTATION_PER_LEFT_FEEDER_ROTATION,
      ),
    );
  }

  if (sideKey === "right" && rightSpoolState && feederWheelEnabled.right) {
    // Spool 2 direction is intentionally inverted relative to the right feeder wheel.
    setJointValue(
      rightSpoolState,
      wrapJointValue(
        rightSpoolState,
        rightSpoolState.value - sideDelta * RIGHT_SPOOL_ROTATION_PER_RIGHT_FEEDER_ROTATION,
      ),
    );
  }
}

function setMaterialOpacity(material, opacity) {
  const clampedOpacity = clamp(opacity, 0, 1);
  const nextTransparent = clampedOpacity < 0.999;
  const nextDepthWrite = clampedOpacity >= 0.999;
  const transparencyModeChanged =
    material.transparent !== nextTransparent || material.depthWrite !== nextDepthWrite;

  material.opacity = clampedOpacity;
  material.transparent = nextTransparent;
  material.depthWrite = nextDepthWrite;

  if (transparencyModeChanged) {
    material.needsUpdate = true;
  }
}

function applyUserStepTransparency() {
  const effectiveOpacity = userStepTransparencyEnabled ? userStepOpacity : 1;

  for (const material of userStepMaterials) {
    setMaterialOpacity(material, effectiveOpacity);
  }

  const percent = Math.round(userStepOpacity * 100);

  if (userStepTransparencyValueEl) {
    userStepTransparencyValueEl.textContent = `${percent}%`;
  }

  const hasUserStep = userStepMaterials.length > 0;

  if (userStepTransparencyEnabledEl) {
    userStepTransparencyEnabledEl.checked = userStepTransparencyEnabled;
    userStepTransparencyEnabledEl.disabled = !hasUserStep;
  }

  if (userStepTransparencyEl) {
    userStepTransparencyEl.value = String(percent);
    userStepTransparencyEl.disabled = !hasUserStep || !userStepTransparencyEnabled;
  }
}

function applyDisplayTransparency() {
  const effectiveOpacity = displayTransparencyEnabled ? displayOpacity : 1;

  for (const material of displayMaterials) {
    setMaterialOpacity(material, effectiveOpacity);
  }

  const percent = Math.round(displayOpacity * 100);

  if (displayTransparencyValueEl) {
    displayTransparencyValueEl.textContent = `${percent}%`;
  }

  const hasDisplay = displayMaterials.length > 0;

  if (displayTransparencyEnabledEl) {
    displayTransparencyEnabledEl.checked = displayTransparencyEnabled;
    displayTransparencyEnabledEl.disabled = !hasDisplay;
  }

  if (displayTransparencyEl) {
    displayTransparencyEl.value = String(percent);
    displayTransparencyEl.disabled = !hasDisplay || !displayTransparencyEnabled;
  }
}

function applyHeadTransparency() {
  const effectiveOpacity = headTransparencyEnabled ? headTransparency : 1;

  for (const material of headMaterials) {
    setMaterialOpacity(material, effectiveOpacity);
  }

  const effectiveHeadVisible = !headTransparencyEnabled || effectiveOpacity > 0.001;
  for (const object3d of headVisuals) {
    object3d.visible = effectiveHeadVisible;
  }

  const percent = Math.round(headTransparency * 100);

  if (headTransparencyValueEl) {
    headTransparencyValueEl.textContent = `${percent}%`;
  }

  const hasHead = headMaterials.length > 0;

  if (headTransparencyEnabledEl) {
    headTransparencyEnabledEl.checked = headTransparencyEnabled;
    headTransparencyEnabledEl.disabled = !hasHead;
  }

  if (headTransparencyEl) {
    headTransparencyEl.value = String(percent);
    headTransparencyEl.disabled = !hasHead || !headTransparencyEnabled;
  }
}

function resetInitialTransparencyState() {
  userStepOpacity = 0;
  displayOpacity = 0;
  headTransparency = 0;

  userStepTransparencyEnabled = false;
  displayTransparencyEnabled = false;
  headTransparencyEnabled = false;

  if (userStepTransparencyEnabledEl) {
    userStepTransparencyEnabledEl.checked = false;
  }
  if (displayTransparencyEnabledEl) {
    displayTransparencyEnabledEl.checked = false;
  }
  if (headTransparencyEnabledEl) {
    headTransparencyEnabledEl.checked = false;
  }

  if (userStepTransparencyEl) {
    userStepTransparencyEl.value = "0";
  }
  if (displayTransparencyEl) {
    displayTransparencyEl.value = "0";
  }
  if (headTransparencyEl) {
    headTransparencyEl.value = "0";
  }

  if (userStepTransparencyValueEl) {
    userStepTransparencyValueEl.textContent = "0%";
  }
  if (displayTransparencyValueEl) {
    displayTransparencyValueEl.textContent = "0%";
  }
  if (headTransparencyValueEl) {
    headTransparencyValueEl.textContent = "0%";
  }
}

function registerUserStepMaterials(object3d) {
  const known = new Set(userStepMaterials);

  object3d.traverse((node) => {
    if (!node.isMesh || !node.material) {
      return;
    }

    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (!known.has(material)) {
        known.add(material);
        userStepMaterials.push(material);
      }
    }
  });
}

function registerDisplayMaterials(object3d) {
  const known = new Set(displayMaterials);

  object3d.traverse((node) => {
    if (!node.isMesh || !node.material) {
      return;
    }

    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (!known.has(material)) {
        known.add(material);
        displayMaterials.push(material);
      }
    }
  });
}

function registerHeadMaterials(object3d) {
  const known = new Set(headMaterials);

  object3d.traverse((node) => {
    if (!node.isMesh || !node.material) {
      return;
    }

    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (!known.has(material)) {
        known.add(material);
        headMaterials.push(material);
      }
    }
  });
}

function registerHeadVisual(object3d) {
  headVisuals.push(object3d);
}

function styleMeshTree(object3d) {
  function tuneMaterial(mat) {
    if (!mat) {
      return;
    }

    if ("metalness" in mat) {
      mat.metalness = 0.24;
    }
    if ("roughness" in mat) {
      mat.roughness = 0.66;
    }
    if ("envMapIntensity" in mat) {
      mat.envMapIntensity = 1.35;
    }
    if ("specularIntensity" in mat) {
      mat.specularIntensity = 0.72;
    }
    if ("clearcoat" in mat) {
      mat.clearcoat = 0.1;
      mat.clearcoatRoughness = 0.5;
    }

    if (mat.color && typeof mat.color.r === "number") {
      const luminance = (0.2126 * mat.color.r) + (0.7152 * mat.color.g) + (0.0722 * mat.color.b);
      // Lift extremely dark base colors slightly so they still catch shape cues.
      if (luminance < 0.08) {
        mat.color.lerp(new THREE.Color(0x2d2d2d), 0.28);
      }
    }

    if (mat.emissive && typeof mat.emissive.setRGB === "function") {
      const luminance = mat.color && typeof mat.color.r === "number"
        ? (0.2126 * mat.color.r) + (0.7152 * mat.color.g) + (0.0722 * mat.color.b)
        : 1;
      if (luminance < 0.14) {
        mat.emissive.setRGB(0.018, 0.018, 0.02);
        mat.emissiveIntensity = 0.5;
      }
    }

    mat.needsUpdate = true;
  }

  object3d.traverse((node) => {
    if (!node.isMesh) {
      return;
    }

    if (Array.isArray(node.material)) {
      node.material = node.material.map((mat) => {
        tuneMaterial(mat);
        return mat;
      });
    } else if (node.material) {
      tuneMaterial(node.material);
    }

    node.castShadow = ENABLE_REALTIME_SHADOWS;
    node.receiveShadow = ENABLE_REALTIME_SHADOWS;
  });
}

async function loadMeshObject(meshPath, urdfUrl) {
  const urdfBaseUrl = new URL(urdfUrl, window.location.href);
  const resolvedUrl = new URL(meshPath, urdfBaseUrl);
  resolvedUrl.searchParams.set("v", activeAssetCacheBustToken);
  const resolvedUrlText = resolvedUrl.toString();
  const lower = meshPath.toLowerCase();

  if (lower.endsWith(".glb") || lower.endsWith(".gltf")) {
    const gltf = await gltfLoader.loadAsync(resolvedUrlText);
    return gltf.scene;
  }

  if (lower.endsWith(".obj")) {
    return objLoader.loadAsync(resolvedUrlText);
  }

  throw new Error(`Unsupported mesh format: ${meshPath}`);
}

function getImmediateChildrenByTag(parent, tagName) {
  const target = tagName.toLowerCase();
  return Array.from(parent.children).filter((child) => child.tagName.toLowerCase() === target);
}

function getFirstImmediateChildByTag(parent, tagName) {
  return getImmediateChildrenByTag(parent, tagName)[0] || null;
}

function clearRobot() {
  if (robotRoot) {
    scene.remove(robotRoot);
    robotRoot.traverse((node) => {
      if (!node.geometry) {
        return;
      }
      node.geometry.dispose();
    });
  }
  robotRoot = null;
  jointStates = [];
  userStepMaterials = [];
  displayMaterials = [];
  headMaterials = [];
  headVisuals = [];
  wireDrumMaterials = [];
  wireDrumRevealProgress = 0;
  wireDrumRevealTarget = 0;
  clearJointControlTransitions();
  cameraTransitionState = null;
  markUserActivity();
  gasSpringAlignmentOffsets = null;
  spool1Meshes = [];
  leftFeederWheelState = null;
  rightFeederWheelState = null;
  centralFeederWheelState = null;
  wireSpoolDoorState = null;
  activeFeederCameraAnchorSide = null;
  applyUserStepTransparency();
  applyDisplayTransparency();
  applyHeadTransparency();
  wireDrumMeshes = [];
  applyWireDrumAppearance();
  updateFeederWheelToggles();
  updateFeederDriveButtons();
  updateFeederCameraAnchorButtons();
  assemblyAnnotationManager.clear();
}

function fitCameraToRobot() {
  if (!robotRoot) {
    return null;
  }

  const bounds = new THREE.Box3().setFromObject(robotRoot);
  if (bounds.isEmpty()) {
    return null;
  }

  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const radius = Math.max(size.length() * 0.5, 0.5);

  const direction = new THREE.Vector3(-0.82, 1.62, 0.34).normalize();
  const position = center.clone().add(direction.multiplyScalar(radius * 1.4));

  const forward = center.clone().sub(position).normalize();
  const cameraRight = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
  const framingOffset = radius * 0.24;
  const target = center.clone().addScaledVector(cameraRight, -framingOffset);

  return {
    position,
    target,
    up: new THREE.Vector3(0, 0, 1),
    near: Math.max(radius / 400, 0.02),
    far: radius * 25,
  };
}

function resetCameraToRobotView(options = {}) {
  const smooth = Boolean(options.smooth);
  const durationMs = Number.isFinite(options.durationMs)
    ? options.durationMs
    : RESET_VIEW_TRANSITION_MS;
  const targetState = fitCameraToRobot();
  if (!targetState) {
    return;
  }

  if (!smooth) {
    cameraTransitionState = null;
    applyCameraState(targetState);
    controls.update();
    return;
  }

  const currentDistance = camera.position.distanceTo(controls.target);
  const baseDistance = targetState.position.distanceTo(targetState.target);
  // If currently farther than base view, keep distance to avoid extra zoom-in during reset.
  // If currently closer (zoomed in), allow interpolation to base distance for a zoom-out reset.
  const distanceLock = currentDistance > (baseDistance + 1e-3) ? currentDistance : null;

  beginCameraTransition(targetState, durationMs, {
    distanceLock,
  });
}

function initializeSceneAnchorsFromRobot() {
  if (!robotRoot) {
    return;
  }

  const bounds = new THREE.Box3().setFromObject(robotRoot);
  if (bounds.isEmpty()) {
    return;
  }

  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const planeGap = Math.max(size.length() * 0.002, 0.001);
  const planeZ = bounds.min.z - planeGap;
  const planeSize = Math.max(size.x, size.y, size.z, 1) * 2.2;

  grid.position.z = planeZ;
  grid.scale.setScalar(planeSize / 2.5);

  groundShadowPlane.position.set(center.x, center.y, planeZ - 0.0002);
  groundShadowPlane.scale.set(planeSize, planeSize, 1);

  // Keep static lights anchored to initial load conditions.
  topLight.target.position.set(center.x, center.y, center.z);
  topLight.target.updateMatrixWorld();
}

function applySceneTheme() {
  const bgHex = isLightMode ? LIGHT_BG_HEX : DARK_BG_HEX;
  renderer.setClearColor(bgHex);
  scene.background = new THREE.Color(bgHex);
  scene.fog = new THREE.Fog(bgHex, 400, 2200);

  document.body.classList.toggle("light-mode", isLightMode);
  if (lightModeToggleEl) {
    lightModeToggleEl.textContent = isLightMode ? "Light Mode: On" : "Light Mode: Off";
  }
  applyWireDrumAppearance();
}

function getJointStateByName(name) {
  return jointStates.find((state) => state.name === name) || null;
}

function isCloserToOpenValue(value, closedValue, openValue) {
  return Math.abs(value - openValue) <= Math.abs(value - closedValue);
}

function getFrontDoorControlData() {
  const state = getJointStateByName(FRONT_DOOR_JOINT);
  if (!state) {
    return null;
  }

  const closedValue = Math.min(state.lower, state.upper);
  const openValue = Math.max(state.lower, state.upper);
  const span = Math.abs(openValue - closedValue);

  return {
    state,
    closedValue,
    openValue,
    motionSpeed: computeMotionSpeedForDuration(span, FRONT_DOOR_OPEN_DURATION_SEC),
    transitionKey: `joint-control:${state.name}`,
  };
}

function isFrontDoorOpen() {
  const data = getFrontDoorControlData();
  if (!data) {
    return false;
  }
  return isCloserToOpenValue(data.state.value, data.closedValue, data.openValue);
}

function toggleFrontDoor() {
  const data = getFrontDoorControlData();
  if (!data) {
    return false;
  }

  const targetIsOpen = !isFrontDoorOpen();
  const targetValue = targetIsOpen ? data.openValue : data.closedValue;

  startJointControlTransition(data.transitionKey, (deltaSeconds) => {
    const next = approachValue(data.state.value, targetValue, data.motionSpeed * deltaSeconds);
    setJointValue(data.state, next);
    return Math.abs(next - targetValue) <= 1e-4;
  });

  return targetIsOpen;
}

function getSpoolsDoorControlData() {
  const primaryState = getJointStateByName(HANDLE_PRIMARY_JOINT);
  const secondaryState = getJointStateByName(HANDLE_SECONDARY_JOINT);
  const doorState = getJointStateByName(SPOOLS_DOOR_JOINT);

  if (!primaryState || !secondaryState || !doorState) {
    return null;
  }

  const primarySpan = Math.max(primaryState.upper - primaryState.lower, 0);
  const secondarySpan = Math.max(secondaryState.upper - secondaryState.lower, 0);
  const doorSpan = Math.max(doorState.upper - doorState.lower, 0);
  const totalSpan = primarySpan + secondarySpan + doorSpan;

  return {
    primaryState,
    secondaryState,
    doorState,
    totalSpan,
    motionSpeed: computeMotionSpeedForDuration(totalSpan, SPOOL_DOOR_OPEN_DURATION_SEC),
    transitionKey: `joint-control:${HANDLE_PRIMARY_JOINT}-door`,
  };
}

function isSpoolsDoorOpen() {
  const data = getSpoolsDoorControlData();
  if (!data) {
    return false;
  }
  const combined = getCombinedHandleDoorValue(data.primaryState, data.secondaryState, data.doorState);
  return combined >= (data.totalSpan * 0.5);
}

function toggleSpoolsDoor() {
  const data = getSpoolsDoorControlData();
  if (!data) {
    return false;
  }

  const targetIsOpen = !isSpoolsDoorOpen();
  const targetValue = targetIsOpen ? data.totalSpan : 0;

  startJointControlTransition(data.transitionKey, (deltaSeconds) => {
    const current = getCombinedHandleDoorValue(data.primaryState, data.secondaryState, data.doorState);
    const next = approachValue(current, targetValue, data.motionSpeed * deltaSeconds);
    applyCombinedHandleDoorValue(data.primaryState, data.secondaryState, data.doorState, next);
    return Math.abs(next - targetValue) <= 1e-4;
  });

  return targetIsOpen;
}

function getTopCoverControlData() {
  const topCoverState = getJointStateByName(TOP_COVER_JOINT);
  if (!topCoverState) {
    return null;
  }

  const leftGasSpringState = getJointStateByName(LEFT_GAS_SPRING_MAIN_JOINT);
  const rightGasSpringState = getJointStateByName(RIGHT_GAS_SPRING_MAIN_JOINT);
  const leftSecondaryGasSpringState = getJointStateByName(LEFT_GAS_SPRING_SECONDARY_JOINT);
  const rightSecondaryGasSpringState = getJointStateByName(RIGHT_GAS_SPRING_SECONDARY_JOINT);
  // Preserve authored semantics: lower is closed, upper is open.
  const closedValue = topCoverState.lower;
  const openValue = topCoverState.upper;
  const span = Math.abs(openValue - closedValue);

  return {
    topCoverState,
    leftGasSpringState,
    rightGasSpringState,
    leftSecondaryGasSpringState,
    rightSecondaryGasSpringState,
    hasSynchronizedSprings: Boolean(leftGasSpringState && rightGasSpringState),
    closedValue,
    openValue,
    motionSpeed: computeMotionSpeedForDuration(span, TOP_COVER_OPEN_DURATION_SEC),
    transitionKey: `joint-control:${TOP_COVER_JOINT}`,
  };
}

function isTopCoverOpen() {
  const data = getTopCoverControlData();
  if (!data) {
    return false;
  }
  return isCloserToOpenValue(data.topCoverState.value, data.closedValue, data.openValue);
}

function applyTopCoverControlValue(data, value) {
  if (data.hasSynchronizedSprings) {
    applySynchronizedTopCoverGasSpringValue(
      data.topCoverState,
      data.leftGasSpringState,
      data.rightGasSpringState,
      data.leftSecondaryGasSpringState,
      data.rightSecondaryGasSpringState,
      value,
    );
    return;
  }

  setJointValue(data.topCoverState, value, { syncSlider: false });
}

function synchronizeTopCoverControlState() {
  const data = getTopCoverControlData();
  if (!data) {
    return;
  }

  applyTopCoverControlValue(data, data.topCoverState.value);
}

function toggleTopCover() {
  const data = getTopCoverControlData();
  if (!data) {
    return false;
  }

  const targetIsOpen = !isTopCoverOpen();
  const targetValue = targetIsOpen ? data.openValue : data.closedValue;

  startJointControlTransition(data.transitionKey, (deltaSeconds) => {
    const next = approachValue(data.topCoverState.value, targetValue, data.motionSpeed * deltaSeconds);
    applyTopCoverControlValue(data, next);
    return Math.abs(next - targetValue) <= 1e-4;
  });

  return targetIsOpen;
}

function getDoorIconSvg(isOpen) {
  if (isOpen) {
    return [
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">',
      '<path d="M4 4.5h7.3v15H4z"/>',
      '<path d="M11.3 4.5l8.7 3.2v13.8l-8.7-2.7z"/>',
      '<circle cx="8.2" cy="12" r="0.9"/>',
      '</svg>',
    ].join("");
  }

  return [
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">',
    '<rect x="5" y="4.5" width="13.8" height="15" rx="1.2" ry="1.2"/>',
    '<circle cx="9.4" cy="12" r="0.9"/>',
    '</svg>',
  ].join("");
}

function getLidIconSvg(isOpen) {
  if (isOpen) {
    return [
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">',
      '<path d="M4 16h16v3H4z"/>',
      '<path d="M5.6 15.2L12 8.1l6.4 7.1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
      '<circle cx="12" cy="8" r="1.1"/>',
      '</svg>',
    ].join("");
  }

  return [
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">',
    '<rect x="4" y="14" width="16" height="3"/>',
    '<path d="M5.2 12.2h13.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    '<circle cx="12" cy="12.2" r="1.1"/>',
    '</svg>',
  ].join("");
}

function buildAnnotationCameraState(annotationDefinition, worldPoint) {
  if (!worldPoint || !Number.isFinite(worldPoint.x) || !Number.isFinite(worldPoint.y) || !Number.isFinite(worldPoint.z)) {
    return null;
  }

  let robotRadius = 1.2;
  if (robotRoot) {
    const bounds = new THREE.Box3().setFromObject(robotRoot);
    if (!bounds.isEmpty()) {
      const size = bounds.getSize(new THREE.Vector3());
      robotRadius = Math.max(size.length() * 0.5, 0.7);
    }
  }

  const directionArray = Array.isArray(annotationDefinition?.cameraDirection)
    ? annotationDefinition.cameraDirection
    : [1, -1, 0.25];
  const direction = new THREE.Vector3(
    Number(directionArray[0]) || 0,
    Number(directionArray[1]) || 0,
    Number(directionArray[2]) || 0,
  );

  if (direction.lengthSq() <= 1e-8) {
    direction.set(1, -1, 0.25);
  }
  direction.normalize();

  const offsetArray = Array.isArray(annotationDefinition?.cameraTargetOffset)
    ? annotationDefinition.cameraTargetOffset
    : [0, 0, 0];
  const target = worldPoint.clone().add(new THREE.Vector3(
    Number(offsetArray[0]) || 0,
    Number(offsetArray[1]) || 0,
    Number(offsetArray[2]) || 0,
  ));

  const distanceFactor = Number.isFinite(annotationDefinition?.cameraDistanceFactor)
    ? annotationDefinition.cameraDistanceFactor
    : 1.25;
  const desiredDistance = clamp(robotRadius * distanceFactor, 0.9, 6.5);

  return {
    position: target.clone().addScaledVector(direction, desiredDistance),
    target,
    up: new THREE.Vector3(0, 0, 1),
    near: camera.near,
    far: camera.far,
  };
}

function focusCameraOnAnnotation(annotationDefinition, worldPoint, options = {}) {
  const durationMs = Number.isFinite(options.durationMs)
    ? options.durationMs
    : ANNOTATION_FOCUS_DURATION_MS;

  const targetState = buildAnnotationCameraState(annotationDefinition, worldPoint);
  if (!targetState) {
    return;
  }

  beginCameraTransition(targetState, durationMs, {
    distanceLock: null,
  });
}

function setFrontDoorOpenState(targetIsOpen) {
  const data = getFrontDoorControlData();
  if (!data) {
    return false;
  }

  const targetValue = targetIsOpen ? data.openValue : data.closedValue;

  startJointControlTransition(data.transitionKey, (deltaSeconds) => {
    const next = approachValue(data.state.value, targetValue, data.motionSpeed * deltaSeconds);
    setJointValue(data.state, next);
    return Math.abs(next - targetValue) <= 1e-4;
  });

  return true;
}

function getPrintingAreaWorldPoint(fallbackWorldPoint) {
  if (!robotRoot) {
    return fallbackWorldPoint?.clone() || null;
  }

  const headObject = robotRoot.getObjectByName(`link:${HEAD_LINK}`);
  const printingProbeObject = robotRoot.getObjectByName(`link:${PRINTING_AREA_LINK}`);

  if (!headObject && !printingProbeObject) {
    return fallbackWorldPoint?.clone() || null;
  }

  const resolveCenter = (object3d) => {
    const bounds = computeObjectLocalBounds(object3d);
    const center = bounds && !bounds.isEmpty()
      ? bounds.getCenter(new THREE.Vector3())
      : new THREE.Vector3();
    object3d.localToWorld(center);
    return center;
  };

  const headCenter = headObject ? resolveCenter(headObject) : null;
  const probeCenter = printingProbeObject ? resolveCenter(printingProbeObject) : null;

  if (headCenter && probeCenter) {
    return headCenter.lerp(probeCenter, 0.3);
  }

  return headCenter || probeCenter || fallbackWorldPoint?.clone() || null;
}

function getLinkWorldCenter(linkName) {
  if (!robotRoot || !linkName) {
    return null;
  }

  const linkObject = robotRoot.getObjectByName(`link:${linkName}`);
  if (!linkObject) {
    return null;
  }

  const bounds = computeObjectLocalBounds(linkObject);
  const center = bounds && !bounds.isEmpty()
    ? bounds.getCenter(new THREE.Vector3())
    : new THREE.Vector3();
  linkObject.localToWorld(center);
  return center;
}

function getFeederAnchorWorldPoint(side) {
  const feederCenter = getLinkWorldCenter(FEEDER_LINK);
  const centralWheelCenter = getLinkWorldCenter(CENTRAL_FEEDER_WHEEL_LINK);
  const leftWheelCenter = getLinkWorldCenter(LEFT_FEEDER_WHEEL_LINK);
  const rightWheelCenter = getLinkWorldCenter(RIGHT_FEEDER_WHEEL_LINK);
  const points = [feederCenter, centralWheelCenter, leftWheelCenter, rightWheelCenter].filter((point) => Boolean(point));

  if (!points.length) {
    const baseTarget = fitCameraToRobot()?.target || controls.target;
    return baseTarget.clone();
  }

  const target = new THREE.Vector3();
  for (const point of points) {
    target.add(point);
  }
  target.multiplyScalar(1 / points.length);

  const sideWheelCenter = side === "right" ? rightWheelCenter : leftWheelCenter;
  if (sideWheelCenter) {
    target.lerp(sideWheelCenter, 0.28);
  }
  if (feederCenter) {
    target.lerp(feederCenter, 0.22);
  }

  target.z += FEEDER_ANCHOR_TARGET_Z_OFFSET;
  return target;
}

function buildFeederCameraAnchorState(side) {
  const normalizedSide = side === "right" ? "right" : "left";
  const sideSign = normalizedSide === "right" ? 1 : -1;
  const baseState = fitCameraToRobot();
  const target = getFeederAnchorWorldPoint(normalizedSide);

  const baseDistance = baseState
    ? baseState.position.distanceTo(baseState.target)
    : camera.position.distanceTo(controls.target);
  const desiredDistance = clamp(baseDistance * FEEDER_ANCHOR_DISTANCE_FACTOR, 0.82, 3.6);
  const verticalOffset = desiredDistance * 0.2;
  const planarDistance = Math.sqrt(Math.max((desiredDistance * desiredDistance) - (verticalOffset * verticalOffset), 0.1));

  const position = new THREE.Vector3(
    target.x + (planarDistance * sideSign),
    target.y,
    target.z + verticalOffset,
  );

  return {
    position,
    target,
    up: new THREE.Vector3(0, 0, 1),
    near: baseState?.near ?? camera.near,
    far: baseState?.far ?? camera.far,
  };
}

function focusFeederCameraAnchor(side) {
  if (!robotRoot) {
    return;
  }

  const normalizedSide = side === "right" ? "right" : "left";
  const cameraState = buildFeederCameraAnchorState(normalizedSide);
  beginCameraTransition(cameraState, FEEDER_ANCHOR_CAMERA_DURATION_MS, {
    distanceLock: null,
  });

  activeFeederCameraAnchorSide = normalizedSide;
  updateFeederCameraAnchorButtons();
}

function buildFrontDoorButtonCameraState(frontDoorWorldPoint) {
  const baseState = fitCameraToRobot();
  const target = frontDoorWorldPoint?.clone()
    || baseState?.target?.clone()
    || controls.target.clone();

  target.z -= 0.26;

  const baseDistance = baseState
    ? baseState.position.distanceTo(baseState.target)
    : camera.position.distanceTo(controls.target);
  const desiredDistance = clamp(baseDistance * FRONT_DOOR_BUTTON_PRINTING_ZOOM_FACTOR, 0.56, 2.6);

  const direction = new THREE.Vector3(0, FRONT_DOOR_BUTTON_PERP_Y_SIDE, 0);
  direction.applyAxisAngle(new THREE.Vector3(1, 0, 0), FRONT_DOOR_BUTTON_X_ROTATION_RAD);
  direction.applyAxisAngle(new THREE.Vector3(0, 0, 1), FRONT_DOOR_BUTTON_Z_ROTATION_RAD);
  direction.normalize();

  const position = new THREE.Vector3(
    target.x + (direction.x * desiredDistance),
    target.y + (direction.y * desiredDistance),
    target.z + (direction.z * desiredDistance),
  );

  return {
    position,
    target,
    up: new THREE.Vector3(0, 0, 1),
    near: baseState?.near ?? camera.near,
    far: baseState?.far ?? camera.far,
  };
}

function runFrontDoorButtonAction(frontDoorWorldPoint) {
  const currentlyOpen = isFrontDoorOpen();

  if (currentlyOpen) {
    resetCameraToRobotView({
      smooth: true,
      durationMs: FRONT_DOOR_BUTTON_CLOSE_RESET_DURATION_MS,
    });
    return setFrontDoorOpenState(false);
  }

  const printingAreaPoint = getPrintingAreaWorldPoint(frontDoorWorldPoint);
  const cameraState = buildFrontDoorButtonCameraState(printingAreaPoint);
  beginCameraTransition(cameraState, FRONT_DOOR_BUTTON_CAMERA_DURATION_MS, {
    distanceLock: null,
  });

  return setFrontDoorOpenState(true);
}

function setSpoolsDoorOpenState(targetIsOpen) {
  const data = getSpoolsDoorControlData();
  if (!data) {
    return false;
  }

  const targetValue = targetIsOpen ? data.totalSpan : 0;

  startJointControlTransition(data.transitionKey, (deltaSeconds) => {
    const current = getCombinedHandleDoorValue(data.primaryState, data.secondaryState, data.doorState);
    const next = approachValue(current, targetValue, data.motionSpeed * deltaSeconds);
    applyCombinedHandleDoorValue(data.primaryState, data.secondaryState, data.doorState, next);
    return Math.abs(next - targetValue) <= 1e-4;
  });

  return true;
}

function getSpoolsPairWorldPoint(fallbackWorldPoint) {
  if (!robotRoot) {
    return fallbackWorldPoint?.clone() || null;
  }

  const leftSpool = robotRoot.getObjectByName(`link:${SPOOL_1_LINK}`);
  const rightSpool = robotRoot.getObjectByName(`link:${SPOOL_2_LINK}`);

  if (!leftSpool || !rightSpool) {
    return fallbackWorldPoint?.clone() || null;
  }

  const leftBounds = computeObjectLocalBounds(leftSpool);
  const rightBounds = computeObjectLocalBounds(rightSpool);

  const leftCenter = leftBounds && !leftBounds.isEmpty()
    ? leftBounds.getCenter(new THREE.Vector3())
    : new THREE.Vector3();
  const rightCenter = rightBounds && !rightBounds.isEmpty()
    ? rightBounds.getCenter(new THREE.Vector3())
    : new THREE.Vector3();

  leftSpool.localToWorld(leftCenter);
  rightSpool.localToWorld(rightCenter);

  return leftCenter.add(rightCenter).multiplyScalar(0.5);
}

function buildSpoolsDoorButtonCameraState(spoolsWorldPoint) {
  const baseState = fitCameraToRobot();
  const target = spoolsWorldPoint?.clone()
    || baseState?.target?.clone()
    || controls.target.clone();

  target.z += 0.02;

  const baseDistance = baseState
    ? baseState.position.distanceTo(baseState.target)
    : camera.position.distanceTo(controls.target);
  const desiredDistance = clamp(baseDistance * 0.72, 0.75, 3.6);
  const verticalOffset = desiredDistance * 0.12;
  const planarDistance = Math.sqrt(Math.max((desiredDistance * desiredDistance) - (verticalOffset * verticalOffset), 0.1));

  const position = new THREE.Vector3(
    target.x + (planarDistance * SPOOLS_DOOR_BUTTON_PERP_X_SIDE),
    target.y,
    target.z + verticalOffset,
  );

  return {
    position,
    target,
    up: new THREE.Vector3(0, 0, 1),
    near: baseState?.near ?? camera.near,
    far: baseState?.far ?? camera.far,
  };
}

function runSpoolsDoorButtonAction(spoolsDoorWorldPoint) {
  const currentlyOpen = isSpoolsDoorOpen();

  if (currentlyOpen) {
    resetCameraToRobotView({
      smooth: true,
      durationMs: SPOOLS_DOOR_BUTTON_CLOSE_RESET_DURATION_MS,
    });
    return setSpoolsDoorOpenState(false);
  }

  const pairPoint = getSpoolsPairWorldPoint(spoolsDoorWorldPoint);
  const cameraState = buildSpoolsDoorButtonCameraState(pairPoint);
  beginCameraTransition(cameraState, SPOOLS_DOOR_BUTTON_CAMERA_DURATION_MS, {
    distanceLock: null,
  });

  return setSpoolsDoorOpenState(true);
}

function setTopCoverOpenState(targetIsOpen) {
  const data = getTopCoverControlData();
  if (!data) {
    return false;
  }

  const targetValue = targetIsOpen ? data.openValue : data.closedValue;

  startJointControlTransition(data.transitionKey, (deltaSeconds) => {
    const next = approachValue(data.topCoverState.value, targetValue, data.motionSpeed * deltaSeconds);
    applyTopCoverControlValue(data, next);
    return Math.abs(next - targetValue) <= 1e-4;
  });

  return true;
}

function buildTopCoverButtonCameraState(topCoverWorldPoint) {
  const baseState = fitCameraToRobot();
  const target = topCoverWorldPoint?.clone()
    || baseState?.target?.clone()
    || controls.target.clone();

  target.z -= 0.02;

  const baseDistance = baseState
    ? baseState.position.distanceTo(baseState.target)
    : camera.position.distanceTo(controls.target);
  const desiredDistance = clamp(baseDistance * 0.68, 0.72, 3.8);

  const direction = new THREE.Vector3(TOP_COVER_BUTTON_PERP_Y_SIDE, 0, 0);
  direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), TOP_COVER_BUTTON_Y_ROTATION_RAD);
  direction.z += 0.16;
  direction.normalize();

  return {
    position: target.clone().addScaledVector(direction, desiredDistance),
    target,
    up: new THREE.Vector3(0, 0, 1),
    near: baseState?.near ?? camera.near,
    far: baseState?.far ?? camera.far,
  };
}

function runTopCoverButtonAction(topCoverWorldPoint) {
  const currentlyOpen = isTopCoverOpen();

  if (currentlyOpen) {
    resetCameraToRobotView({
      smooth: true,
      durationMs: TOP_COVER_BUTTON_CLOSE_RESET_DURATION_MS,
    });
    return setTopCoverOpenState(false);
  }

  const cameraState = buildTopCoverButtonCameraState(topCoverWorldPoint);
  beginCameraTransition(cameraState, TOP_COVER_BUTTON_CAMERA_DURATION_MS, {
    distanceLock: null,
  });

  return setTopCoverOpenState(true);
}

function focusCameraOnPoint(worldPoint, focusRadius) {
  if (!worldPoint || !Number.isFinite(worldPoint.x) || !Number.isFinite(worldPoint.y) || !Number.isFinite(worldPoint.z)) {
    return;
  }

  const viewDirection = camera.position.clone().sub(controls.target);
  if (viewDirection.lengthSq() <= 1e-8) {
    viewDirection.set(-1, 1, 0.25);
  }
  viewDirection.normalize();

  const desiredDistance = clamp(focusRadius * 3.2, 0.6, 3.8);
  const targetState = {
    position: worldPoint.clone().addScaledVector(viewDirection, desiredDistance),
    target: worldPoint.clone(),
    up: new THREE.Vector3(0, 0, 1),
    near: camera.near,
    far: camera.far,
  };

  beginCameraTransition(targetState, ANNOTATION_FOCUS_DURATION_MS);
}

function computeObjectLocalBounds(rootObject) {
  if (!rootObject) {
    return null;
  }

  rootObject.updateWorldMatrix(true, true);
  const inverseRootWorld = rootObject.matrixWorld.clone().invert();
  const localBounds = new THREE.Box3();
  const corner = new THREE.Vector3();
  const worldCorner = new THREE.Vector3();
  const localCorner = new THREE.Vector3();
  let hasPoint = false;

  rootObject.traverse((node) => {
    if (!node.isMesh || !node.geometry) {
      return;
    }

    if (!node.geometry.boundingBox) {
      node.geometry.computeBoundingBox();
    }

    const geometryBounds = node.geometry.boundingBox;
    if (!geometryBounds) {
      return;
    }

    for (let cornerIndex = 0; cornerIndex < 8; cornerIndex += 1) {
      corner.set(
        (cornerIndex & 1) ? geometryBounds.max.x : geometryBounds.min.x,
        (cornerIndex & 2) ? geometryBounds.max.y : geometryBounds.min.y,
        (cornerIndex & 4) ? geometryBounds.max.z : geometryBounds.min.z,
      );
      worldCorner.copy(corner).applyMatrix4(node.matrixWorld);
      localCorner.copy(worldCorner).applyMatrix4(inverseRootWorld);
      localBounds.expandByPoint(localCorner);
      hasPoint = true;
    }
  });

  return hasPoint ? localBounds : null;
}

function createAssemblyAnnotationManager(layerEl) {
  if (!layerEl) {
    return {
      clear: () => {},
      rebuildFromRobot: () => {},
      update: () => {},
      onResize: () => {},
    };
  }

  const svgNs = "http://www.w3.org/2000/svg";
  const calloutSvg = document.createElementNS(svgNs, "svg");
  calloutSvg.classList.add("assembly-annotation-callouts");
  layerEl.appendChild(calloutSvg);

  const anchorWorld = new THREE.Vector3();
  const projected = new THREE.Vector3();
  const centerToAnchor = new THREE.Vector3();
  const rayDirection = new THREE.Vector3();
  const cameraForward = new THREE.Vector3();
  const focusPoint = new THREE.Vector3();
  const anchorOffset = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();
  const previousCameraPosition = new THREE.Vector3();
  const previousControlsTarget = new THREE.Vector3();
  const previousCameraQuaternion = new THREE.Quaternion();
  const silhouetteCornerWorld = new THREE.Vector3();
  const silhouetteCornerProjected = new THREE.Vector3();
  const outsideDirection = new THREE.Vector2();
  const adjustedButtonPosition = { x: 0, y: 0 };
  const items = [];
  const robotLocalCorners = [];
  const occlusionMeshes = [];
  let activeItemId = null;
  let activeItemUntilMs = 0;
  let lastUpdateMs = -Infinity;
  let cachedViewportWidth = 0;
  let cachedViewportHeight = 0;
  let hasCameraSnapshot = false;
  let occlusionRoundRobinIndex = 0;
  let lastInvokedItemId = null;
  const modelScreenBounds = {
    minX: 0,
    maxX: 0,
    minY: 0,
    maxY: 0,
    centerX: 0,
    centerY: 0,
    valid: false,
  };

  const isOccluderMaterial = (material) => {
    if (!material) {
      return true;
    }

    if (Array.isArray(material)) {
      return material.some((entry) => isOccluderMaterial(entry));
    }

    if (material.visible === false) {
      return false;
    }

    if (material.transparent && Number(material.opacity) < 0.8) {
      return false;
    }

    return true;
  };

  const hideItem = (item) => {
    item.button.classList.remove("is-visible", "is-open", "is-occluded", "is-active");
    item.line.style.display = "none";
    item.lineEnd.style.display = "none";
  };

  const isDescendantOf = (node, ancestor) => {
    let cursor = node;
    while (cursor) {
      if (cursor === ancestor) {
        return true;
      }
      cursor = cursor.parent;
    }
    return false;
  };

  const collectOcclusionMeshes = () => {
    occlusionMeshes.length = 0;
    if (!robotRoot || !ENABLE_ANNOTATION_OCCLUSION) {
      return;
    }

    robotRoot.traverse((node) => {
      if (!node.isMesh || !node.visible || !node.geometry) {
        return;
      }
      if (!isOccluderMaterial(node.material)) {
        return;
      }
      occlusionMeshes.push(node);
    });
  };

  const rebuildRobotLocalCorners = () => {
    robotLocalCorners.length = 0;
    if (!robotRoot) {
      return;
    }

    const localBounds = computeObjectLocalBounds(robotRoot);
    if (!localBounds || localBounds.isEmpty()) {
      return;
    }

    for (let cornerIndex = 0; cornerIndex < 8; cornerIndex += 1) {
      robotLocalCorners.push(new THREE.Vector3(
        (cornerIndex & 1) ? localBounds.max.x : localBounds.min.x,
        (cornerIndex & 2) ? localBounds.max.y : localBounds.min.y,
        (cornerIndex & 4) ? localBounds.max.z : localBounds.min.z,
      ));
    }
  };

  const updateModelScreenBounds = () => {
    modelScreenBounds.valid = false;

    if (!robotRoot || !robotLocalCorners.length) {
      return;
    }

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let visibleCornerCount = 0;

    for (const localCorner of robotLocalCorners) {
      silhouetteCornerWorld.copy(localCorner);
      robotRoot.localToWorld(silhouetteCornerWorld);
      silhouetteCornerProjected.copy(silhouetteCornerWorld).project(camera);

      if (
        !Number.isFinite(silhouetteCornerProjected.x)
        || !Number.isFinite(silhouetteCornerProjected.y)
        || !Number.isFinite(silhouetteCornerProjected.z)
      ) {
        continue;
      }

      const screenX = (silhouetteCornerProjected.x * 0.5 + 0.5) * window.innerWidth;
      const screenY = (-silhouetteCornerProjected.y * 0.5 + 0.5) * window.innerHeight;
      minX = Math.min(minX, screenX);
      maxX = Math.max(maxX, screenX);
      minY = Math.min(minY, screenY);
      maxY = Math.max(maxY, screenY);
      visibleCornerCount += 1;
    }

    if (visibleCornerCount < 2 || !Number.isFinite(minX) || !Number.isFinite(minY)) {
      return;
    }

    modelScreenBounds.minX = minX;
    modelScreenBounds.maxX = maxX;
    modelScreenBounds.minY = minY;
    modelScreenBounds.maxY = maxY;
    modelScreenBounds.centerX = (minX + maxX) * 0.5;
    modelScreenBounds.centerY = (minY + maxY) * 0.5;
    modelScreenBounds.valid = true;
  };

  const rectOverlapsModelBounds = (left, top, width, height, padding = 6) => {
    if (!modelScreenBounds.valid) {
      return false;
    }

    const right = left + width;
    const bottom = top + height;
    const paddedMinX = modelScreenBounds.minX - padding;
    const paddedMaxX = modelScreenBounds.maxX + padding;
    const paddedMinY = modelScreenBounds.minY - padding;
    const paddedMaxY = modelScreenBounds.maxY + padding;

    return !(
      right < paddedMinX
      || left > paddedMaxX
      || bottom < paddedMinY
      || top > paddedMaxY
    );
  };

  const moveButtonOutsideModelBounds = (buttonLeft, buttonTop, width, height, screenOffset) => {
    if (!rectOverlapsModelBounds(buttonLeft, buttonTop, width, height, 8)) {
      adjustedButtonPosition.x = buttonLeft;
      adjustedButtonPosition.y = buttonTop;
      return adjustedButtonPosition;
    }

    const maxX = Math.max(window.innerWidth - width - 8, 8);
    const maxY = Math.max(window.innerHeight - height - 8, 8);
    let nextX = buttonLeft;
    let nextY = buttonTop;

    outsideDirection.set(
      (nextX + (width * 0.5)) - modelScreenBounds.centerX,
      (nextY + (height * 0.5)) - modelScreenBounds.centerY,
    );

    if (outsideDirection.lengthSq() <= 1e-6) {
      outsideDirection.set(
        (screenOffset?.[0] || 1),
        (screenOffset?.[1] || -1),
      );
    }
    outsideDirection.normalize();

    for (let step = 0; step < 8; step += 1) {
      if (!rectOverlapsModelBounds(nextX, nextY, width, height, 8)) {
        break;
      }

      nextX = clamp(nextX + (outsideDirection.x * 18), 8, maxX);
      nextY = clamp(nextY + (outsideDirection.y * 18), 8, maxY);
    }

    adjustedButtonPosition.x = nextX;
    adjustedButtonPosition.y = nextY;
    return adjustedButtonPosition;
  };

  const isAnchorCrossingButtonBody = (anchorX, buttonLeft, width) => (
    anchorX > buttonLeft && anchorX < (buttonLeft + width)
  );

  const computeFlippedButtonX = (anchorX, buttonLeft, width, screenOffsetX) => {
    const maxX = Math.max(window.innerWidth - width - 8, 8);
    const gap = Math.max(Math.abs(Number(screenOffsetX) || 0), 22);
    const leftCandidate = clamp(anchorX - gap - width, 8, maxX);
    const rightCandidate = clamp(anchorX + gap, 8, maxX);
    const currentCenterX = buttonLeft + (width * 0.5);
    const currentOnRightSide = currentCenterX >= anchorX;

    let nextX = currentOnRightSide ? leftCandidate : rightCandidate;
    if (!isAnchorCrossingButtonBody(anchorX, nextX, width)) {
      return nextX;
    }

    const alternateX = currentOnRightSide ? rightCandidate : leftCandidate;
    if (!isAnchorCrossingButtonBody(anchorX, alternateX, width)) {
      return alternateX;
    }

    const leftDistance = Math.abs((leftCandidate + (width * 0.5)) - anchorX);
    const rightDistance = Math.abs((rightCandidate + (width * 0.5)) - anchorX);
    nextX = leftDistance >= rightDistance ? leftCandidate : rightCandidate;
    return nextX;
  };

  const computeOccluded = (item, worldPoint, isProjectedOutside) => {
    if (isProjectedOutside) {
      return true;
    }

    rayDirection.copy(worldPoint).sub(camera.position);
    const targetDistance = rayDirection.length();
    if (!Number.isFinite(targetDistance) || targetDistance <= 1e-6) {
      return false;
    }

    rayDirection.divideScalar(targetDistance);
    raycaster.set(camera.position, rayDirection);
    raycaster.near = 0.01;
    raycaster.far = Math.max(targetDistance - ANNOTATION_OCCLUSION_TOLERANCE, 0.01);

    const hits = raycaster.intersectObjects(occlusionMeshes, false);
    for (const hit of hits) {
      if (!hit.object || !hit.object.visible) {
        continue;
      }
      if (isDescendantOf(hit.object, item.targetObject)) {
        continue;
      }
      return true;
    }

    return false;
  };

  const getItemIsOpen = (itemId) => {
    if (itemId === "front-door") {
      return isFrontDoorOpen();
    }
    if (itemId === "spools-door") {
      return isSpoolsDoorOpen();
    }
    if (itemId === "top-cover") {
      return isTopCoverOpen();
    }
    return false;
  };

  const runItemAction = (item, worldPoint) => {
    if (item.id === "front-door") {
      return runFrontDoorButtonAction(worldPoint);
    }
    if (item.id === "spools-door") {
      return runSpoolsDoorButtonAction(worldPoint);
    }
    if (item.id === "top-cover") {
      return runTopCoverButtonAction(worldPoint);
    }
    return false;
  };

  const setNavButtonState = (itemId, options = {}) => {
    const buttonEl = annotationNavButtonsById[itemId];
    if (!buttonEl) {
      return;
    }

    const isEnabled = options.enabled !== false;
    const isActive = isEnabled && Boolean(options.active);
    const isOpen = isEnabled && Boolean(options.open);

    buttonEl.disabled = !isEnabled;
    buttonEl.classList.toggle("active", isActive || isOpen);
    buttonEl.classList.toggle("is-open", isOpen);
    buttonEl.setAttribute("aria-pressed", (isActive || isOpen) ? "true" : "false");
  };

  const closeAssemblyForItem = (itemId) => {
    if (itemId === "front-door") {
      return setFrontDoorOpenState(false);
    }
    if (itemId === "spools-door") {
      return setSpoolsDoorOpenState(false);
    }
    if (itemId === "top-cover") {
      return setTopCoverOpenState(false);
    }
    return false;
  };

  const runItemActionWithSwitchHandling = (item, worldPoint) => {
    const switchedItem = Boolean(lastInvokedItemId && lastInvokedItemId !== item.id);
    const actionWorldPoint = worldPoint.clone();

    if (switchedItem) {
      closeAssemblyForItem(lastInvokedItemId);
    }

    runItemAction(item, actionWorldPoint);
    lastInvokedItemId = item.id;
  };

  const resolveTargetObject = (definition) => {
    if (!robotRoot) {
      return null;
    }

    const primaryTarget = definition.targetObjectName
      ? robotRoot.getObjectByName(definition.targetObjectName)
      : null;
    if (primaryTarget) {
      return primaryTarget;
    }

    if (!definition.fallbackTargetObjectName) {
      return null;
    }

    return robotRoot.getObjectByName(definition.fallbackTargetObjectName);
  };

  const computeLocalAnchorData = (targetObject, definition) => {
    const localBounds = computeObjectLocalBounds(targetObject);
    const localCenter = new THREE.Vector3();
    const localSize = new THREE.Vector3(0.2, 0.2, 0.2);

    if (localBounds && !localBounds.isEmpty()) {
      localBounds.getCenter(localCenter);
      localBounds.getSize(localSize);
    }

    const localAnchor = localCenter.clone();
    const localOffset = Array.isArray(definition.localOffset) ? definition.localOffset : [0, 0, 0];
    anchorOffset.set(
      Number(localOffset[0]) || 0,
      Number(localOffset[1]) || 0,
      Number(localOffset[2]) || 0,
    );
    localAnchor.add(anchorOffset);

    return {
      localCenter,
      localSize,
      localAnchor,
    };
  };

  const hasControlData = (itemId) => {
    if (itemId === "front-door") {
      return Boolean(getFrontDoorControlData());
    }
    if (itemId === "spools-door") {
      return Boolean(getSpoolsDoorControlData());
    }
    if (itemId === "top-cover") {
      return Boolean(getTopCoverControlData());
    }
    return false;
  };

  const setCalloutSvgSize = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;

    if (width === cachedViewportWidth && height === cachedViewportHeight) {
      return;
    }

    cachedViewportWidth = width;
    cachedViewportHeight = height;
    calloutSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    calloutSvg.setAttribute("width", String(width));
    calloutSvg.setAttribute("height", String(height));

    for (const item of items) {
      const rect = item.button.getBoundingClientRect();
      item.buttonWidth = rect.width || item.buttonWidth;
      item.buttonHeight = rect.height || item.buttonHeight;
    }
  };

  const clear = () => {
    for (const item of items) {
      if (item.navButton) {
        item.navButton.onclick = null;
      }
      item.button.remove();
      item.line.remove();
      item.lineEnd.remove();
    }
    items.length = 0;
    robotLocalCorners.length = 0;
    activeItemId = null;
    activeItemUntilMs = 0;
    occlusionRoundRobinIndex = 0;
    hasCameraSnapshot = false;
    lastInvokedItemId = null;

    for (const itemId of Object.keys(annotationNavButtonsById)) {
      setNavButtonState(itemId, { enabled: false, active: false, open: false });
    }

    layerEl.setAttribute("aria-hidden", "true");
  };

  const rebuildFromRobot = () => {
    clear();

    if (!robotRoot) {
      return;
    }

    robotRoot.updateWorldMatrix(true, true);
    rebuildRobotLocalCorners();
    setCalloutSvgSize();
    collectOcclusionMeshes();

    for (const itemId of Object.keys(annotationNavButtonsById)) {
      setNavButtonState(itemId, { enabled: false, active: false, open: false });
    }

    for (const definition of ANNOTATION_DEFINITIONS) {
      if (!hasControlData(definition.id)) {
        continue;
      }

      const targetObject = resolveTargetObject(definition);
      if (!targetObject) {
        continue;
      }

      const {
        localCenter,
        localSize,
        localAnchor,
      } = computeLocalAnchorData(targetObject, definition);

      const button = document.createElement("button");
      button.type = "button";
      button.className = "assembly-annotation";
      button.setAttribute("aria-label", definition.label);

      const labelEl = document.createElement("span");
      labelEl.className = "assembly-annotation-label";
      labelEl.textContent = definition.label;

      button.appendChild(labelEl);

      const line = document.createElementNS(svgNs, "line");
      line.classList.add("assembly-callout-line");
      const lineEnd = document.createElementNS(svgNs, "circle");
      lineEnd.classList.add("assembly-callout-end");
      lineEnd.setAttribute("r", "3.1");
      calloutSvg.appendChild(line);
      calloutSvg.appendChild(lineEnd);
      layerEl.appendChild(button);

      const item = {
        id: definition.id,
        definition,
        targetObject,
        localCenter,
        localSize,
        localAnchor,
        screenOffset: definition.screenOffset,
        button,
        line,
        lineEnd,
        navButton: annotationNavButtonsById[definition.id] || null,
        buttonWidth: 130,
        buttonHeight: 34,
        occluded: false,
        lastOcclusionUpdateMs: -Infinity,
        previousAnchorWorld: new THREE.Vector3(),
        hasPreviousAnchorWorld: false,
      };

      const buttonRect = button.getBoundingClientRect();
      item.buttonWidth = buttonRect.width || item.buttonWidth;
      item.buttonHeight = buttonRect.height || item.buttonHeight;

      const triggerItemAction = () => {
        markUserActivity();
        activeItemId = item.id;
        activeItemUntilMs = performance.now() + ANNOTATION_CLICK_ACTIVE_HOLD_MS;

        focusPoint.copy(item.localAnchor);
        item.targetObject.localToWorld(focusPoint);
        runItemActionWithSwitchHandling(item, focusPoint);
      };

      button.addEventListener("click", triggerItemAction);

      if (item.navButton) {
        item.navButton.textContent = definition.label;
        item.navButton.onclick = triggerItemAction;
        setNavButtonState(item.id, { enabled: true, active: false, open: false });
      }

      items.push(item);
    }

    layerEl.setAttribute("aria-hidden", items.length ? "false" : "true");
  };

  const update = (nowMs = performance.now()) => {
    if (!items.length || !robotRoot) {
      return;
    }

    if (ANNOTATION_UPDATE_INTERVAL_MS > 0 && (nowMs - lastUpdateMs) < ANNOTATION_UPDATE_INTERVAL_MS) {
      return;
    }
    lastUpdateMs = nowMs;

    cameraForward.copy(controls.target).sub(camera.position).normalize();
    updateModelScreenBounds();

    let cameraMoved = false;
    if (ENABLE_ANNOTATION_OCCLUSION) {
      cameraMoved = (
        !hasCameraSnapshot ||
        previousCameraPosition.distanceToSquared(camera.position) > 1e-8 ||
        previousControlsTarget.distanceToSquared(controls.target) > 1e-8 ||
        (1 - Math.abs(previousCameraQuaternion.dot(camera.quaternion))) > 1e-7
      );

      previousCameraPosition.copy(camera.position);
      previousControlsTarget.copy(controls.target);
      previousCameraQuaternion.copy(camera.quaternion);
      hasCameraSnapshot = true;
    }

    const occlusionBudget = Math.max(0, Math.min(ANNOTATION_OCCLUSION_RAYCASTS_PER_FRAME, items.length));
    const occlusionStartIndex = occlusionRoundRobinIndex;

    for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
      const item = items[itemIndex];
      anchorWorld.copy(item.localAnchor);
      item.targetObject.localToWorld(anchorWorld);

      let anchorMoved = !item.hasPreviousAnchorWorld;
      if (!anchorMoved) {
        anchorMoved = item.previousAnchorWorld.distanceToSquared(anchorWorld) > 1e-8;
      }
      item.previousAnchorWorld.copy(anchorWorld);
      item.hasPreviousAnchorWorld = true;

      projected.copy(anchorWorld).project(camera);

      if (!Number.isFinite(projected.x) || !Number.isFinite(projected.y) || !Number.isFinite(projected.z)) {
        item.isVisible = false;
        hideItem(item);
        continue;
      }

      const isProjectedOutside = (
        projected.z <= -1 ||
        projected.z >= 1 ||
        Math.abs(projected.x) > 1 ||
        Math.abs(projected.y) > 1
      );

      const clampedProjectedX = clamp(projected.x, -0.92, 0.92);
      const clampedProjectedY = clamp(projected.y, -0.92, 0.92);

      item.isVisible = true;

      const anchorX = (clampedProjectedX * 0.5 + 0.5) * window.innerWidth;
      const anchorY = (-clampedProjectedY * 0.5 + 0.5) * window.innerHeight;
      const buttonWidth = item.buttonWidth;
      const buttonHeight = item.buttonHeight;

      let buttonX = clamp(
        anchorX + item.screenOffset[0],
        8,
        Math.max(window.innerWidth - buttonWidth - 8, 8),
      );
      let buttonY = clamp(
        anchorY + item.screenOffset[1],
        8,
        Math.max(window.innerHeight - buttonHeight - 8, 8),
      );

      if (modelScreenBounds.valid) {
        const moved = moveButtonOutsideModelBounds(buttonX, buttonY, buttonWidth, buttonHeight, item.screenOffset);
        buttonX = moved.x;
        buttonY = moved.y;
      }

      if (isAnchorCrossingButtonBody(anchorX, buttonX, buttonWidth)) {
        buttonX = computeFlippedButtonX(anchorX, buttonX, buttonWidth, item.screenOffset?.[0]);

        if (modelScreenBounds.valid) {
          const moved = moveButtonOutsideModelBounds(buttonX, buttonY, buttonWidth, buttonHeight, item.screenOffset);
          buttonX = moved.x;
          buttonY = moved.y;
        }
      }

      item.button.style.transform = `translate(${buttonX.toFixed(2)}px, ${buttonY.toFixed(2)}px)`;
      item.button.classList.add("is-visible");

      const buttonCenterX = buttonX + (buttonWidth * 0.5);
      const lineEndX = anchorX <= buttonCenterX ? buttonX : (buttonX + buttonWidth);
      const lineEndY = buttonY + (buttonHeight * 0.5);
      item.line.setAttribute("x1", String(anchorX));
      item.line.setAttribute("y1", String(anchorY));
      item.line.setAttribute("x2", String(lineEndX));
      item.line.setAttribute("y2", String(lineEndY));
      item.lineEnd.setAttribute("cx", String(anchorX));
      item.lineEnd.setAttribute("cy", String(anchorY));

      const open = getItemIsOpen(item.id);
      item.isOpen = open;

      if (isProjectedOutside) {
        item.occluded = true;
        item.lastOcclusionUpdateMs = nowMs;
      } else if (!ENABLE_ANNOTATION_OCCLUSION || occlusionBudget === 0) {
        item.occluded = false;
        item.lastOcclusionUpdateMs = nowMs;
      } else {
        const staleOcclusion = (nowMs - item.lastOcclusionUpdateMs) >= ANNOTATION_OCCLUSION_MAX_STALE_MS;
        const isRoundRobinSelected =
          items.length <= occlusionBudget ||
          ((itemIndex - occlusionStartIndex + items.length) % items.length) < occlusionBudget;
        const shouldRaycastOcclusion = isRoundRobinSelected && (cameraMoved || anchorMoved || staleOcclusion);

        if (shouldRaycastOcclusion) {
          item.occluded = computeOccluded(item, anchorWorld, false);
          item.lastOcclusionUpdateMs = nowMs;
        }
      }

      const centerDx = (anchorX - (window.innerWidth * 0.5)) / Math.max(window.innerWidth, 1);
      const centerDy = (anchorY - (window.innerHeight * 0.5)) / Math.max(window.innerHeight, 1);
      const centerDistanceSq = (centerDx * centerDx) + (centerDy * centerDy);
      centerToAnchor.copy(anchorWorld).sub(controls.target);
      let sideScore = 1;
      let facingDot = -1;
      if (centerToAnchor.lengthSq() > 1e-8) {
        centerToAnchor.normalize();
        facingDot = clamp(centerToAnchor.dot(cameraForward), -1, 1);
        sideScore = 1 - facingDot;
      }

      const backsideOccluded = !isProjectedOutside && facingDot > 0.22;
      const occluded = Boolean(item.occluded || backsideOccluded);

      item.autoActiveScore = isProjectedOutside ? Number.POSITIVE_INFINITY : ((sideScore * 0.8) + (centerDistanceSq * 0.45));

      item.button.classList.toggle("is-open", open);
      item.button.classList.toggle("is-occluded", occluded);

      item.line.classList.toggle("is-open", open);
      item.line.classList.toggle("is-occluded", occluded);
      item.lineEnd.classList.toggle("is-open", open);
      item.lineEnd.classList.toggle("is-occluded", occluded);
      item.line.style.display = occluded ? "none" : "block";
      item.lineEnd.style.display = occluded ? "none" : "block";
    }

    if (items.length) {
      occlusionRoundRobinIndex = (occlusionRoundRobinIndex + occlusionBudget) % items.length;
    }

    if (!ENABLE_ANNOTATION_OCCLUSION) {
      hasCameraSnapshot = false;
    }

    if (activeItemId && nowMs > activeItemUntilMs) {
      activeItemId = null;
    }

    let autoActiveId = null;
    let bestAutoScore = Number.POSITIVE_INFINITY;
    for (const item of items) {
      if (!item.isVisible || !Number.isFinite(item.autoActiveScore)) {
        continue;
      }
      if (item.autoActiveScore < bestAutoScore) {
        bestAutoScore = item.autoActiveScore;
        autoActiveId = item.id;
      }
    }

    const effectiveActiveId = activeItemId || autoActiveId;
    for (const item of items) {
      const active = item.isVisible && (item.id === effectiveActiveId || Boolean(item.isOpen));
      item.button.classList.toggle("is-active", active);
      item.line.classList.toggle("is-active", active);
      item.lineEnd.classList.toggle("is-active", active);
      const navActive = item.id === activeItemId;
      setNavButtonState(item.id, { enabled: true, active: navActive, open: Boolean(item.isOpen) });
    }
  };

  const onResize = () => {
    cachedViewportWidth = 0;
    cachedViewportHeight = 0;
    setCalloutSvgSize();
  };

  return {
    clear,
    rebuildFromRobot,
    update,
    onResize,
  };
}

function rebuildJointControls() {
  jointControlsEl.textContent = "";
  clearJointControlTransitions();

  if (!jointStates.length) {
    const emptyEl = document.createElement("p");
    emptyEl.className = "empty-state";
    emptyEl.textContent = "No controllable joints detected.";
    jointControlsEl.appendChild(emptyEl);
    return;
  }

  const secondaryHandleState =
    jointStates.find((state) => state.name === HANDLE_SECONDARY_JOINT) || null;
  const spoolsDoorState =
    jointStates.find((state) => state.name === SPOOLS_DOOR_JOINT) || null;
  const topCoverState =
    jointStates.find((state) => state.name === TOP_COVER_JOINT) || null;
  const leftGasSpringState =
    jointStates.find((state) => state.name === LEFT_GAS_SPRING_MAIN_JOINT) || null;
  const rightGasSpringState =
    jointStates.find((state) => state.name === RIGHT_GAS_SPRING_MAIN_JOINT) || null;
  const leftSecondaryGasSpringState =
    jointStates.find((state) => state.name === LEFT_GAS_SPRING_SECONDARY_JOINT) || null;
  const rightSecondaryGasSpringState =
    jointStates.find((state) => state.name === RIGHT_GAS_SPRING_SECONDARY_JOINT) || null;
  const hasCombinedTopCoverGasSprings = Boolean(topCoverState && leftGasSpringState && rightGasSpringState);
  const hasCombinedHandleDoor = Boolean(secondaryHandleState && spoolsDoorState);

  for (const state of jointStates) {
    const isFrontDoorPrimary = state.name === FRONT_DOOR_JOINT;
    const isCombinedHandlePrimary = state.name === HANDLE_PRIMARY_JOINT && secondaryHandleState;
    const isCombinedHandleDoorPrimary = Boolean(isCombinedHandlePrimary && spoolsDoorState);
    const isCombinedTopCoverGasSpringPrimary =
      hasCombinedTopCoverGasSprings && state.name === TOP_COVER_JOINT;

    if (isFrontDoorPrimary || isCombinedHandleDoorPrimary || isCombinedTopCoverGasSpringPrimary) {
      // Managed by floating 3D annotations.
      state.sliderEl = null;
      state.valueEl = null;
      state.toggleEl = null;
      state.toggleWrapEl = null;
      continue;
    }

    if (
      hasCombinedTopCoverGasSprings &&
      (
        state.name === LEFT_GAS_SPRING_MAIN_JOINT ||
        state.name === RIGHT_GAS_SPRING_MAIN_JOINT ||
        (leftSecondaryGasSpringState && state.name === LEFT_GAS_SPRING_SECONDARY_JOINT) ||
        (rightSecondaryGasSpringState && state.name === RIGHT_GAS_SPRING_SECONDARY_JOINT)
      )
    ) {
      // Controlled by the top cover slider to keep cover and springs synchronized.
      state.sliderEl = null;
      state.valueEl = null;
      continue;
    }

    if (state.name === HANDLE_SECONDARY_JOINT && secondaryHandleState) {
      // Controlled by the primary handle slider as phase 2 of combined motion.
      state.sliderEl = null;
      state.valueEl = null;
      continue;
    }

    if (state.name === SPOOLS_DOOR_JOINT && hasCombinedHandleDoor) {
      // Controlled by the primary handle slider as phase 3 of combined motion.
      state.sliderEl = null;
      state.valueEl = null;
      continue;
    }

    if (
      state.name === CENTRAL_FEEDER_WHEEL_JOINT ||
      state.name === LEFT_FEEDER_WHEEL_JOINT ||
      state.name === RIGHT_FEEDER_WHEEL_JOINT ||
      state.name === LEFT_SPOOL_JOINT ||
      state.name === RIGHT_SPOOL_JOINT ||
      state.name === WIRE_SPOOL_DOOR_JOINT
    ) {
      // Hidden in controls, but still available to runtime animation logic.
      state.sliderEl = null;
      state.valueEl = null;
      state.toggleEl = null;
      state.toggleWrapEl = null;
      continue;
    }

    const row = document.createElement("div");
    row.className = "joint-row";

    const label = document.createElement("label");
    label.textContent = isCombinedHandleDoorPrimary
      ? "Spools Door"
      : isCombinedTopCoverGasSpringPrimary || state.name === TOP_COVER_JOINT
      ? "Top cover"
      : isFrontDoorPrimary
      ? "Front Door"
      : state.name;

    const valueEl = document.createElement("div");
    valueEl.className = "joint-value";
    state.valueEl = valueEl;

    let controlEl = null;
    const useOpenCloseButton =
      isFrontDoorPrimary || isCombinedHandleDoorPrimary || isCombinedTopCoverGasSpringPrimary;

    if (useOpenCloseButton) {
      row.classList.add("joint-open-close-row");
      const button = document.createElement("button");
      button.className = "joint-open-close-button";
      button.type = "button";
      state.sliderEl = null;
      const isCloserToOpen = (value, closedValue, openValue) =>
        Math.abs(value - openValue) <= Math.abs(value - closedValue);

      const setButtonState = (isOpen) => {
        button.textContent = isOpen ? "Close" : "Open";
        button.setAttribute("aria-pressed", isOpen ? "true" : "false");
      };

      if (isCombinedHandleDoorPrimary) {
        const primarySpan = Math.max(state.upper - state.lower, 0);
        const secondarySpan = Math.max(secondaryHandleState.upper - secondaryHandleState.lower, 0);
        const doorSpan = Math.max(spoolsDoorState.upper - spoolsDoorState.lower, 0);
        const totalSpan = primarySpan + secondarySpan + doorSpan;
        const combinedMotionSpeed = computeMotionSpeedForDuration(totalSpan, SPOOL_DOOR_OPEN_DURATION_SEC);
        const transitionKey = `joint-control:${HANDLE_PRIMARY_JOINT}-door`;
        let targetIsOpen = getCombinedHandleDoorValue(state, secondaryHandleState, spoolsDoorState)
          >= (totalSpan * 0.5);

        const refreshCombinedHandleDoorState = () => {
          setButtonState(targetIsOpen);
        };

        applyCombinedHandleDoorValue(
          state,
          secondaryHandleState,
          spoolsDoorState,
          getCombinedHandleDoorValue(state, secondaryHandleState, spoolsDoorState),
        );
        refreshCombinedHandleDoorState();

        button.addEventListener("click", () => {
          markUserActivity();
          targetIsOpen = !targetIsOpen;
          setButtonState(targetIsOpen);
          const target = targetIsOpen ? totalSpan : 0;
          startJointControlTransition(transitionKey, (deltaSeconds) => {
            const current = getCombinedHandleDoorValue(state, secondaryHandleState, spoolsDoorState);
            const next = approachValue(
              current,
              target,
              combinedMotionSpeed * deltaSeconds,
            );
            applyCombinedHandleDoorValue(state, secondaryHandleState, spoolsDoorState, next);
            refreshCombinedHandleDoorState();
            return Math.abs(next - target) <= 1e-4;
          });
        });
      } else if (isCombinedTopCoverGasSpringPrimary) {
        const closedValue = Math.min(state.lower, state.upper);
        const openValue = Math.max(state.lower, state.upper);
        const topCoverSpan = Math.abs(openValue - closedValue);
        const topCoverMotionSpeed = computeMotionSpeedForDuration(topCoverSpan, TOP_COVER_OPEN_DURATION_SEC);
        const transitionKey = `joint-control:${TOP_COVER_JOINT}`;
        let targetIsOpen = isCloserToOpen(state.value, closedValue, openValue);

        const refreshTopCoverState = () => {
          setButtonState(targetIsOpen);
        };

        applySynchronizedTopCoverGasSpringValue(
          state,
          leftGasSpringState,
          rightGasSpringState,
          leftSecondaryGasSpringState,
          rightSecondaryGasSpringState,
          state.value,
        );
        refreshTopCoverState();

        button.addEventListener("click", () => {
          markUserActivity();
          targetIsOpen = !targetIsOpen;
          setButtonState(targetIsOpen);
          const target = targetIsOpen ? openValue : closedValue;
          startJointControlTransition(transitionKey, (deltaSeconds) => {
            const next = approachValue(
              state.value,
              target,
              topCoverMotionSpeed * deltaSeconds,
            );
            applySynchronizedTopCoverGasSpringValue(
              state,
              leftGasSpringState,
              rightGasSpringState,
              leftSecondaryGasSpringState,
              rightSecondaryGasSpringState,
              next,
            );
            refreshTopCoverState();
            return Math.abs(next - target) <= 1e-4;
          });
        });
      } else {
        const closedValue = Math.min(state.lower, state.upper);
        const openValue = Math.max(state.lower, state.upper);
        const frontDoorSpan = Math.abs(openValue - closedValue);
        const frontDoorMotionSpeed = computeMotionSpeedForDuration(frontDoorSpan, FRONT_DOOR_OPEN_DURATION_SEC);
        const transitionKey = `joint-control:${state.name}`;
        let targetIsOpen = isCloserToOpen(state.value, closedValue, openValue);

        const refreshFrontDoorState = () => {
          setButtonState(targetIsOpen);
        };

        setJointValue(state, state.value);
        refreshFrontDoorState();

        button.addEventListener("click", () => {
          markUserActivity();
          targetIsOpen = !targetIsOpen;
          setButtonState(targetIsOpen);
          const target = targetIsOpen ? openValue : closedValue;
          startJointControlTransition(transitionKey, (deltaSeconds) => {
            const next = approachValue(
              state.value,
              target,
              frontDoorMotionSpeed * deltaSeconds,
            );
            setJointValue(state, next);
            refreshFrontDoorState();
            return Math.abs(next - target) <= 1e-4;
          });
        });
      }

      controlEl = button;
    } else {
      const slider = document.createElement("input");
      slider.type = "range";

      if (isCombinedHandlePrimary) {
        const primarySpan = Math.max(state.upper - state.lower, 0);
        const secondarySpan = Math.max(secondaryHandleState.upper - secondaryHandleState.lower, 0);
        const totalSpan = primarySpan + secondarySpan;
        slider.min = "0";
        slider.max = String(totalSpan);
        slider.value = String(getCombinedHandleValue(state, secondaryHandleState));
      } else {
        slider.min = String(Math.min(state.lower, state.upper));
        slider.max = String(Math.max(state.lower, state.upper));
        slider.value = String(clamp(state.value, state.lower, state.upper));
      }

      slider.step = "0.001";
      state.sliderEl = slider;

      if (isCombinedHandlePrimary) {
        const combinedValue = applyCombinedHandleValue(
          state,
          secondaryHandleState,
          getCombinedHandleValue(state, secondaryHandleState),
        );
        slider.value = String(combinedValue);
        valueEl.textContent = `${THREE.MathUtils.radToDeg(combinedValue).toFixed(1)} deg`;
      } else {
        setJointValue(state, state.value);
      }

      slider.addEventListener("input", () => {
        markUserActivity();
        const next = Number(slider.value);
        if (!Number.isFinite(next)) {
          return;
        }

        if (isCombinedHandlePrimary) {
          const combinedValue = applyCombinedHandleValue(state, secondaryHandleState, next);
          slider.value = String(combinedValue);
          valueEl.textContent = `${THREE.MathUtils.radToDeg(combinedValue).toFixed(1)} deg`;
        } else {
          setJointValue(state, next);
        }
      });

      controlEl = slider;
    }

    const feederWheelKey = getFeederWheelKeyForJointName(state.name);
    if (feederWheelKey) {
      const toggleWrap = document.createElement("label");
      toggleWrap.className = "joint-wheel-toggle";

      const toggle = document.createElement("input");
      toggle.type = "checkbox";
      toggle.checked = feederWheelEnabled[feederWheelKey];
      state.toggleEl = toggle;
      state.toggleWrapEl = toggleWrap;

      const toggleText = document.createElement("span");
      toggleText.textContent = "Enabled";

      toggle.addEventListener("change", () => {
        markUserActivity();
        feederWheelEnabled[feederWheelKey] = Boolean(toggle.checked);
        toggleWrap.classList.toggle("active", feederWheelEnabled[feederWheelKey]);
        updateFeederWheelToggles();
      });

      toggleWrap.classList.toggle("active", feederWheelEnabled[feederWheelKey]);

      toggleWrap.appendChild(toggle);
      toggleWrap.appendChild(toggleText);
      row.appendChild(toggleWrap);
    } else {
      state.toggleEl = null;
      state.toggleWrapEl = null;
    }

    row.appendChild(label);
    row.appendChild(controlEl);
    row.appendChild(valueEl);
    jointControlsEl.appendChild(row);
  }

  syncFeederWheelStates();
}

function parseUrdfDocument(doc) {
  const robotNode = doc.querySelector("robot");
  if (!robotNode) {
    throw new Error("URDF has no <robot> root");
  }

  const links = new Map();
  for (const linkNode of robotNode.querySelectorAll("link")) {
    const name = linkNode.getAttribute("name") || "unnamed_link";
    const visuals = [];
    for (const visualNode of getImmediateChildrenByTag(linkNode, "visual")) {
      const originNode = getFirstImmediateChildByTag(visualNode, "origin");
      const geometryNode = getFirstImmediateChildByTag(visualNode, "geometry");
      const meshNode = geometryNode ? getFirstImmediateChildByTag(geometryNode, "mesh") : null;
      if (!meshNode) {
        continue;
      }

      visuals.push({
        filename: meshNode.getAttribute("filename") || "",
        scale: parseVec3(meshNode.getAttribute("scale"), [1, 1, 1]),
        origin: parseOrigin(originNode),
      });
    }

    links.set(name, { name, visuals });
  }

  const joints = [];
  for (const jointNode of robotNode.querySelectorAll("joint")) {
    const name = jointNode.getAttribute("name") || "unnamed_joint";
    const type = (jointNode.getAttribute("type") || "fixed").toLowerCase();
    const parentNode = getFirstImmediateChildByTag(jointNode, "parent");
    const childNode = getFirstImmediateChildByTag(jointNode, "child");
    if (!parentNode || !childNode) {
      continue;
    }

    const axisNode = getFirstImmediateChildByTag(jointNode, "axis");
    const limitNode = getFirstImmediateChildByTag(jointNode, "limit");

    const axis = parseVec3(axisNode ? axisNode.getAttribute("xyz") : "", [0, 0, 1]);
    const lower = limitNode ? Number(limitNode.getAttribute("lower")) : Number.NaN;
    const upper = limitNode ? Number(limitNode.getAttribute("upper")) : Number.NaN;

    joints.push({
      name,
      type,
      parent: parentNode.getAttribute("link") || "",
      child: childNode.getAttribute("link") || "",
      origin: parseOrigin(getFirstImmediateChildByTag(jointNode, "origin")),
      axis,
      lower,
      upper,
    });
  }

  return {
    robotName: robotNode.getAttribute("name") || "robot",
    links,
    joints,
  };
}

async function attachVisualsForLink(linkGroup, linkNode, urdfUrl) {
  const visualLoads = linkNode.visuals.map(async (visual) => {
    if (!visual.filename) {
      return;
    }

    const wrapper = new THREE.Group();
    applyOriginTransform(wrapper, visual.origin);
    wrapper.scale.set(visual.scale[0], visual.scale[1], visual.scale[2]);

    const meshObject = await loadMeshObject(visual.filename, urdfUrl);
    styleMeshTree(meshObject);

    if (linkNode.name === "user_step_link") {
      registerUserStepMaterials(meshObject);
      applyUserStepTransparency();
    }

    if (linkNode.name === "display_link") {
      registerDisplayMaterials(meshObject);
      applyDisplayTransparency();
    }

    if (linkNode.name === "head_link") {
      registerHeadMaterials(meshObject);
      registerHeadVisual(meshObject);
      applyHeadTransparency();
    }

    if (linkNode.name === WIRE_DRUM_LINK) {
      registerWireDrumMaterials(meshObject);
      applyWireDrumAppearance();
    }

    if (linkNode.name === SPOOL_1_LINK) {
      registerSpool1Meshes(meshObject);
      applyWireDrumAppearance();
    }

    wrapper.add(meshObject);
    linkGroup.add(wrapper);
  });

  await Promise.all(visualLoads);
}

async function buildRobotTree(parsed, urdfUrl) {
  const linksByName = parsed.links;
  const childrenByParent = new Map();
  const childLinks = new Set();

  for (const joint of parsed.joints) {
    if (!childrenByParent.has(joint.parent)) {
      childrenByParent.set(joint.parent, []);
    }
    childrenByParent.get(joint.parent).push(joint);
    childLinks.add(joint.child);
  }

  let rootLink = "";
  for (const key of linksByName.keys()) {
    if (!childLinks.has(key)) {
      rootLink = key;
      break;
    }
  }
  if (!rootLink) {
    rootLink = linksByName.keys().next().value;
  }

  const rootGroup = new THREE.Group();
  rootGroup.name = parsed.robotName;
  const visited = new Set();

  async function visitLink(linkName, parentGroup) {
    if (!linksByName.has(linkName) || visited.has(linkName)) {
      return;
    }
    visited.add(linkName);

    const linkGroup = new THREE.Group();
    linkGroup.name = `link:${linkName}`;
    parentGroup.add(linkGroup);

    await attachVisualsForLink(linkGroup, linksByName.get(linkName), urdfUrl);

    const childJoints = childrenByParent.get(linkName) || [];
    for (const joint of childJoints) {
      const jointFrame = new THREE.Group();
      jointFrame.name = `joint_frame:${joint.name}`;
      applyOriginTransform(jointFrame, joint.origin);
      linkGroup.add(jointFrame);

      let childParent = jointFrame;

      if (joint.type === "revolute" || joint.type === "continuous" || joint.type === "prismatic") {
        const axisRaw = new THREE.Vector3(joint.axis[0], joint.axis[1], joint.axis[2]);
        const axis = axisRaw.lengthSq() > 0 ? axisRaw.normalize() : new THREE.Vector3(0, 0, 1);

        const motionGroup = new THREE.Group();
        motionGroup.name = `joint_motion:${joint.name}`;
        jointFrame.add(motionGroup);

        const defaultLower = joint.type === "prismatic" ? -0.2 : -Math.PI;
        const defaultUpper = joint.type === "prismatic" ? 0.2 : Math.PI;
        const lower = Number.isFinite(joint.lower) ? joint.lower : defaultLower;
        const upper = Number.isFinite(joint.upper) ? joint.upper : defaultUpper;
        const initial = clamp(0, lower, upper);

        const state = {
          name: joint.name,
          kind: joint.type === "prismatic" ? "linear" : "angular",
          axis,
          motionGroup,
          lower,
          upper,
          value: initial,
          valueEl: null,
        };
        setJointValue(state, initial);
        jointStates.push(state);

        childParent = motionGroup;
      }

      await visitLink(joint.child, childParent);
    }
  }

  await visitLink(rootLink, rootGroup);
  return rootGroup;
}

async function loadUrdf(urdfUrl) {
  activeLoadToken += 1;
  const loadToken = activeLoadToken;
  activeAssetCacheBustToken = `${Date.now()}-${loadToken}`;

  meshStatusEl.textContent = "Mesh: loading...";
  modelStatusEl.textContent = `Model: ${urdfUrl}`;

  clearRobot();
  rebuildJointControls();

  try {
    const response = await fetch(urdfUrl, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Unable to fetch URDF (${response.status})`);
    }

    const xmlText = await response.text();
    if (loadToken !== activeLoadToken) {
      return;
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, "application/xml");
    const parserError = doc.querySelector("parsererror");
    if (parserError) {
      throw new Error("URDF XML parse error");
    }

    const parsed = parseUrdfDocument(doc);
    const builtRobot = await buildRobotTree(parsed, urdfUrl);
    if (loadToken !== activeLoadToken) {
      return;
    }

    robotRoot = builtRobot;
    // CAD assets are authored as Y-up; rotate once so the viewer is Z-up.
    robotRoot.rotation.x = CAD_TO_VIEWER_X_ROTATION;
    scene.add(robotRoot);
    initializeSceneAnchorsFromRobot();
    rebuildJointControls();
    synchronizeTopCoverControlState();
    assemblyAnnotationManager.rebuildFromRobot();
    activeFeederCameraAnchorSide = null;
    updateFeederCameraAnchorButtons();
    resetCameraToRobotView();

    modelStatusEl.textContent = `Model: ${parsed.robotName}`;
    meshStatusEl.textContent = "Mesh: loaded";
  } catch (error) {
    if (loadToken !== activeLoadToken) {
      return;
    }

    const reason = error instanceof Error ? error.message : "unknown error";
    meshStatusEl.textContent = `Mesh: error (${reason})`;
  }
}

function normalizeModelEntry(model) {
  if (!model || typeof model !== "object") {
    return null;
  }

  const url = typeof model.url === "string" ? model.url.trim() : "";
  if (!url) {
    return null;
  }

  const name = typeof model.name === "string" && model.name.trim()
    ? model.name.trim()
    : url;

  return { name, url };
}

function populateModelSelector(modelsPayload, defaultModelUrl) {
  const models = Array.isArray(modelsPayload)
    ? modelsPayload
      .map((model) => normalizeModelEntry(model))
      .filter((model) => Boolean(model))
    : [];

  modelSelectEl.textContent = "";

  if (!models.length) {
    const fallbackUrl = modelSelectEl.value || "/assets/M600_PRO/M600_PRO.urdf";
    const fallbackOption = document.createElement("option");
    fallbackOption.value = fallbackUrl;
    fallbackOption.textContent = fallbackUrl;
    modelSelectEl.appendChild(fallbackOption);
    modelSelectEl.value = fallbackUrl;
    return fallbackUrl;
  }

  for (const model of models) {
    const option = document.createElement("option");
    option.value = model.url;
    option.textContent = model.name;
    modelSelectEl.appendChild(option);
  }

  const hasDefault = typeof defaultModelUrl === "string"
    && models.some((model) => model.url === defaultModelUrl);
  const selectedModelUrl = hasDefault ? defaultModelUrl : models[0].url;
  modelSelectEl.value = selectedModelUrl;
  return selectedModelUrl;
}

async function initializeModelSelectorAndLoad() {
  const fallbackUrl = modelSelectEl.value || "/assets/M600_PRO/M600_PRO.urdf";

  try {
    const response = await fetch(URDF_MODELS_API_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Unable to fetch model list (${response.status})`);
    }

    const payload = await response.json();
    const selectedModelUrl = populateModelSelector(payload.models, payload.defaultModelUrl);
    await loadUrdf(selectedModelUrl);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown error";
    modelStatusEl.textContent = `Model list: error (${reason})`;
    await loadUrdf(fallbackUrl);
  }
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  applyRenderPixelRatio(getPreferredRenderPixelRatio());
  renderer.setSize(window.innerWidth, window.innerHeight);
  assemblyAnnotationManager.onResize();
  viewCubeController?.onResize();
}

function animate(nowMs = performance.now()) {
  requestAnimationFrame(animate);
  const deltaSeconds = Math.min(Math.max((nowMs - previousAnimationMs) / 1000, 0), 0.1);
  previousAnimationMs = nowMs;
  animateFeederWheels(deltaSeconds);
  animateWireDrumAppearance(deltaSeconds);
  updateJointControlTransitions(deltaSeconds);
  updateCameraTransition(nowMs);
  updateIdleReset(nowMs);
  updateAdaptiveRenderQuality(deltaSeconds, nowMs);
  updateInteractionQuality(nowMs);
  controls.update();
  renderer.render(scene, camera);
  assemblyAnnotationManager.update(nowMs);
  viewCubeController?.update();
}

reloadModelEl.addEventListener("click", () => {
  markUserActivity();
  loadUrdf(modelSelectEl.value);
});

modelSelectEl.addEventListener("change", () => {
  markUserActivity();
  loadUrdf(modelSelectEl.value);
});

resetViewEl.addEventListener("click", () => {
  markUserActivity();
  resetCameraToRobotView({ smooth: true });
});

if (lightModeToggleEl) {
  lightModeToggleEl.addEventListener("click", () => {
    markUserActivity();
    isLightMode = !isLightMode;
    applySceneTheme();
  });
}

if (userStepTransparencyEl) {
  userStepTransparencyEl.addEventListener("input", () => {
    markUserActivity();
    const percent = Number(userStepTransparencyEl.value);
    if (!Number.isFinite(percent)) {
      return;
    }

    userStepOpacity = clamp(percent / 100, 0, 1);
    applyUserStepTransparency();
  });
}

if (userStepTransparencyEnabledEl) {
  userStepTransparencyEnabledEl.addEventListener("change", () => {
    markUserActivity();
    userStepTransparencyEnabled = Boolean(userStepTransparencyEnabledEl.checked);
    applyUserStepTransparency();
  });
}

if (displayTransparencyEl) {
  displayTransparencyEl.addEventListener("input", () => {
    markUserActivity();
    const percent = Number(displayTransparencyEl.value);
    if (!Number.isFinite(percent)) {
      return;
    }

    displayOpacity = clamp(percent / 100, 0, 1);
    applyDisplayTransparency();
  });
}

if (displayTransparencyEnabledEl) {
  displayTransparencyEnabledEl.addEventListener("change", () => {
    markUserActivity();
    displayTransparencyEnabled = Boolean(displayTransparencyEnabledEl.checked);
    applyDisplayTransparency();
  });
}

if (headTransparencyEl) {
  headTransparencyEl.addEventListener("input", () => {
    markUserActivity();
    const percent = Number(headTransparencyEl.value);
    if (!Number.isFinite(percent)) {
      return;
    }

    headTransparency = clamp(percent / 100, 0, 1);
    applyHeadTransparency();
  });
}

if (headTransparencyEnabledEl) {
  headTransparencyEnabledEl.addEventListener("change", () => {
    markUserActivity();
    headTransparencyEnabled = Boolean(headTransparencyEnabledEl.checked);
    applyHeadTransparency();
  });
}

if (feederDriveLeftEl) {
  feederDriveLeftEl.addEventListener("click", () => {
    markUserActivity();
    setFeederDriveSide("left");
  });
}

if (feederDriveStopEl) {
  feederDriveStopEl.addEventListener("click", () => {
    markUserActivity();
    setFeederDriveStop();
  });
}

if (feederDriveRightEl) {
  feederDriveRightEl.addEventListener("click", () => {
    markUserActivity();
    setFeederDriveSide("right");
  });
}

if (feederDriveUpEl) {
  feederDriveUpEl.addEventListener("click", () => {
    markUserActivity();
    setFeederDriveVertical("up");
  });
}

if (feederDriveDownEl) {
  feederDriveDownEl.addEventListener("click", () => {
    markUserActivity();
    setFeederDriveVertical("down");
  });
}

if (feederCameraAnchorLeftEl) {
  feederCameraAnchorLeftEl.addEventListener("click", () => {
    markUserActivity();
    focusFeederCameraAnchor("left");
  });
}

if (feederCameraAnchorRightEl) {
  feederCameraAnchorRightEl.addEventListener("click", () => {
    markUserActivity();
    focusFeederCameraAnchor("right");
  });
}

if (wireDrumAppearButtonEl) {
  wireDrumAppearButtonEl.addEventListener("click", () => {
    triggerWireDrumAppearance();
  });
}

controls.addEventListener("start", () => {
  markUserActivity();
  beginInteractionQuality();
});

controls.addEventListener("end", () => {
  beginInteractionQuality();
});

canvas.addEventListener("pointerdown", () => {
  markUserActivity();
  beginInteractionQuality();
}, { passive: true });

canvas.addEventListener("wheel", () => {
  markUserActivity();
  beginInteractionQuality();
}, { passive: true });

canvas.addEventListener("touchstart", () => {
  markUserActivity();
  beginInteractionQuality();
}, { passive: true });

window.addEventListener("keydown", () => {
  markUserActivity();
});

window.addEventListener("resize", onResize);

resetInitialTransparencyState();
applyUserStepTransparency();
applyDisplayTransparency();
applyHeadTransparency();
applyWireDrumAppearance();
updateFeederWheelToggles();
updateFeederDriveButtons();
updateFeederCameraAnchorButtons();
applySceneTheme();
initializeModelSelectorAndLoad();
animate();
