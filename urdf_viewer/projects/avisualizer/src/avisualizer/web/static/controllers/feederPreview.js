// Feeder-camera preview (extracted byte-exact from urdf_viewer.js). Renders the
// MAIN scene from a dedicated feeder camera into the Materials panel's little
// viewport, isolated to a wheel render-layer. Reads core mutable state
// (robotRoot / activeHotspotPanelId / feederDrive*) via ctx getters and the
// (const) main scene directly; the god-file calls the returned update() from the
// RAF loop and onPanelStateChange/onResize on panel/resize events.
import * as THREE from "three";

const FEEDER_PREVIEW_RENDER_PIXEL_RATIO = 1.5;
const FEEDER_PREVIEW_MIN_FRAME_MS = 16;
const FEEDER_PREVIEW_WHEEL_LAYER = 7;
export function createFeederPreviewController(ctx) {
  const {
    hotspotFeederCameraViewportEl,
    scene,
    getRobotRoot,
    getActiveHotspotPanelId,
    getFeederDriveSide,
    getFeederDriveVertical,
    setFeederCameraPreviewPlaceholder,
    setFeederCameraPreviewContent,
    buildFeederPanelPreviewCameraState,
    LEFT_FEEDER_WHEEL_LINK,
    RIGHT_FEEDER_WHEEL_LINK,
    CENTRAL_FEEDER_WHEEL_LINK,
    HOTSPOT_PANEL_MATERIALS_ID,
  } = ctx;
  if (!hotspotFeederCameraViewportEl) {
    return null;
  }

  const previewCanvas = document.createElement("canvas");
  previewCanvas.className = "feeder-camera-canvas";

  let previewRenderer = null;
  try {
    const contextOptions = {
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    };
    const previewContext = previewCanvas.getContext("webgl2", contextOptions)
      || previewCanvas.getContext("webgl", contextOptions);
    if (!previewContext) {
      throw new Error("WebGL not available for feeder preview canvas");
    }

    previewRenderer = new THREE.WebGLRenderer({
      canvas: previewCanvas,
      context: previewContext,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
  } catch (error) {
    setFeederCameraPreviewPlaceholder("Feeder Camera");
    return null;
  }

  previewRenderer.setClearColor(0x141312, 1);
  previewRenderer.outputColorSpace = THREE.SRGBColorSpace;
  previewRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  previewRenderer.toneMappingExposure = 1.35;
  previewRenderer.shadowMap.enabled = false;
  previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio, FEEDER_PREVIEW_RENDER_PIXEL_RATIO));

  const previewCamera = new THREE.PerspectiveCamera(20, 1, 0.02, 80);
  previewCamera.layers.disableAll();
  previewCamera.layers.enable(FEEDER_PREVIEW_WHEEL_LAYER);

  const lastPosition = new THREE.Vector3();
  const lastTarget = new THREE.Vector3();
  let previewLayerBoundRoot = null;
  let previewLightLayersBound = false;

  const syncPreviewWheelLayers = () => {
    if (!previewLightLayersBound) {
      // Keep preview isolated to wheel layer while ensuring lights still affect it.
      scene.traverse((object) => {
        if (object?.isLight) {
          object.layers.enable(FEEDER_PREVIEW_WHEEL_LAYER);
        }
      });
      previewLightLayersBound = true;
    }

    if (!getRobotRoot() || previewLayerBoundRoot === getRobotRoot()) {
      return;
    }

    previewLayerBoundRoot = getRobotRoot();
    let configuredAny = false;
    for (const linkName of [LEFT_FEEDER_WHEEL_LINK, RIGHT_FEEDER_WHEEL_LINK, CENTRAL_FEEDER_WHEEL_LINK]) {
      const linkObject = getRobotRoot().getObjectByName(`link:${linkName}`);
      if (!linkObject) {
        continue;
      }

      configuredAny = true;
      linkObject.traverse((object) => {
        object.layers.enable(FEEDER_PREVIEW_WHEEL_LAYER);
      });
    }

    if (!configuredAny) {
      // Fallback for unexpected models without feeder wheel links.
      previewCamera.layers.enable(0);
    } else {
      previewCamera.layers.disable(0);
      previewCamera.layers.enable(FEEDER_PREVIEW_WHEEL_LAYER);
    }
  };

  let hasLastPose = false;
  let forceRender = true;
  let lastRenderMs = -Infinity;

  const resize = () => {
    const rect = hotspotFeederCameraViewportEl.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));

    previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio, FEEDER_PREVIEW_RENDER_PIXEL_RATIO));
    previewRenderer.setSize(width, height, false);

    previewCamera.aspect = width / Math.max(height, 1);
    previewCamera.updateProjectionMatrix();
    forceRender = true;
  };

  const onPanelStateChange = (panelId) => {
    if (panelId === HOTSPOT_PANEL_MATERIALS_ID) {
      resize();
      forceRender = true;
    }
  };

  const update = (nowMs = performance.now()) => {
    if (getActiveHotspotPanelId() !== HOTSPOT_PANEL_MATERIALS_ID || !getRobotRoot()) {
      return;
    }

    syncPreviewWheelLayers();

    const wheelsAnimating = Boolean(getFeederDriveSide() && getFeederDriveVertical());

    if (!forceRender && (nowMs - lastRenderMs) < FEEDER_PREVIEW_MIN_FRAME_MS) {
      return;
    }

    if (previewCanvas.width <= 2 || previewCanvas.height <= 2) {
      resize();
    }

    const previewState = buildFeederPanelPreviewCameraState();
    if (!previewState) {
      return;
    }

    previewCamera.position.copy(previewState.position);
    previewCamera.up.copy(previewState.up || new THREE.Vector3(0, 0, 1));
    previewCamera.near = previewState.near ?? 0.02;
    previewCamera.far = previewState.far ?? 80;
    previewCamera.lookAt(previewState.target);
    previewCamera.updateProjectionMatrix();
    previewCamera.updateMatrixWorld();

    const poseChanged = !hasLastPose
      || lastPosition.distanceToSquared(previewCamera.position) > 1e-8
      || lastTarget.distanceToSquared(previewState.target) > 1e-8;

    if (!wheelsAnimating && !poseChanged && !forceRender && (nowMs - lastRenderMs) < (FEEDER_PREVIEW_MIN_FRAME_MS * 2)) {
      return;
    }

    previewRenderer.render(scene, previewCamera);

    lastPosition.copy(previewCamera.position);
    lastTarget.copy(previewState.target);
    hasLastPose = true;
    forceRender = false;
    lastRenderMs = nowMs;
  };

  setFeederCameraPreviewContent(previewCanvas);
  resize();

  return {
    onResize: resize,
    onPanelStateChange,
    update,
  };
}
