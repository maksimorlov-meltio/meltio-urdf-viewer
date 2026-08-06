// Feeder-wheel floating jog controls (viewer/overlays/): a small Up/Stop/Down
// panel that follows each feeder wheel on screen while a feeder deps.camera anchor
// is active — world anchor lerped between wheel centers, projected through the
// (view-offset-aware) deps.camera and clamped to the overlay-safe screen band.
// Host state (wheel joint states, drive state, deps.camera) enters via initFeederWheelFloatOverlay(deps).
import * as THREE from "three";

const feederWheelFloatingLeftEl = document.getElementById("feederWheelFloatingLeft");
const feederWheelFloatLeftUpEl = document.getElementById("feederWheelFloatLeftUp");
const feederWheelFloatLeftStopEl = document.getElementById("feederWheelFloatLeftStop");
const feederWheelFloatLeftDownEl = document.getElementById("feederWheelFloatLeftDown");
const feederWheelFloatingRightEl = document.getElementById("feederWheelFloatingRight");
const feederWheelFloatRightUpEl = document.getElementById("feederWheelFloatRightUp");
const feederWheelFloatRightStopEl = document.getElementById("feederWheelFloatRightStop");
const feederWheelFloatRightDownEl = document.getElementById("feederWheelFloatRightDown");

let deps = {};

export function initFeederWheelFloatOverlay(nextDeps) {
  deps = nextDeps;
}

const feederWheelFloatAnchorsBySide = {
  left: {
    world: new THREE.Vector3(),
    ndc: new THREE.Vector3(),
  },
  right: {
    world: new THREE.Vector3(),
    ndc: new THREE.Vector3(),
  },
};

export function getFeederWheelFloatingPanelElements(side) {
  if (side === "right") {
    return {
      panelEl: feederWheelFloatingRightEl,
      upEl: feederWheelFloatRightUpEl,
      stopEl: feederWheelFloatRightStopEl,
      downEl: feederWheelFloatRightDownEl,
    };
  }

  return {
    panelEl: feederWheelFloatingLeftEl,
    upEl: feederWheelFloatLeftUpEl,
    stopEl: feederWheelFloatLeftStopEl,
    downEl: feederWheelFloatLeftDownEl,
  };
}

export function getFeederFloatingAnchorWorldPoint(side) {
  const resolvedSide = side === "right" ? "right" : "left";
  const sideLink = resolvedSide === "right"
    ? deps.RIGHT_FEEDER_WHEEL_LINK
    : deps.LEFT_FEEDER_WHEEL_LINK;

  const sideWheelCenter = deps.getLinkWorldCenter(sideLink);
  const centralWheelCenter = deps.getLinkWorldCenter(deps.CENTRAL_FEEDER_WHEEL_LINK);
  const feederCenter = deps.getLinkWorldCenter(deps.FEEDER_LINK);

  if (sideWheelCenter && centralWheelCenter) {
    return sideWheelCenter.lerp(centralWheelCenter, 0.34);
  }

  return sideWheelCenter || centralWheelCenter || feederCenter || null;
}

export function setFeederWheelFloatingControlsVisible(side, isVisible) {
  const { panelEl } = getFeederWheelFloatingPanelElements(side);
  if (!panelEl) {
    return;
  }

  panelEl.hidden = !isVisible;
  panelEl.setAttribute("aria-hidden", isVisible ? "false" : "true");
}

export function updateSingleFeederWheelFloatingControls(side, shouldShowForCamera) {
  const { panelEl, upEl, stopEl, downEl } = getFeederWheelFloatingPanelElements(side);
  if (!panelEl) {
    return;
  }

  const hasSideWheel = side === "right"
    ? Boolean(deps.getRightFeederWheelState())
    : Boolean(deps.getLeftFeederWheelState());

  const shouldShow = Boolean(shouldShowForCamera && hasSideWheel);
  if (!shouldShow) {
    setFeederWheelFloatingControlsVisible(side, false);
    return;
  }

  const worldAnchor = getFeederFloatingAnchorWorldPoint(side);
  if (!worldAnchor) {
    setFeederWheelFloatingControlsVisible(side, false);
    return;
  }

  const sideAnchors = feederWheelFloatAnchorsBySide[side];
  sideAnchors.world.copy(worldAnchor);
  sideAnchors.ndc.copy(sideAnchors.world).project(deps.camera);

  if (
    !Number.isFinite(sideAnchors.ndc.x)
    || !Number.isFinite(sideAnchors.ndc.y)
    || !Number.isFinite(sideAnchors.ndc.z)
    || sideAnchors.ndc.z <= -1
    || sideAnchors.ndc.z >= 1
  ) {
    setFeederWheelFloatingControlsVisible(side, false);
    return;
  }

  setFeederWheelFloatingControlsVisible(side, true);

  const panelRect = panelEl.getBoundingClientRect();
  const panelWidth = Math.max(panelRect.width, 48);
  const panelHeight = Math.max(panelRect.height, 122);
  const sideOffset = side === "right"
    ? deps.FEEDER_FLOAT_SIDE_OFFSET_PX
    : -deps.FEEDER_FLOAT_SIDE_OFFSET_PX;
  // The deps.camera view offset already pans the projection, so the anchor NDC
  // reflects the shifted scene — no manual shift compensation needed here.
  const screenX = ((sideAnchors.ndc.x * 0.5) + 0.5) * window.innerWidth;
  const screenY = ((-sideAnchors.ndc.y * 0.5) + 0.5) * window.innerHeight;

  const x = deps.clamp(
    screenX + sideOffset - (panelWidth * 0.5),
    8,
    Math.max(window.innerWidth - panelWidth - 8, 8),
  );
  const overlayYBounds = deps.getOverlayVerticalSafeBounds(panelHeight);
  const y = deps.clamp(
    screenY - (panelHeight * 0.5),
    overlayYBounds.minY,
    overlayYBounds.maxY,
  );

  panelEl.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;

  const isSideDriving = deps.getFeederDriveSide() === side && Boolean(deps.getFeederDriveVertical());
  const upActive = isSideDriving && deps.getFeederDriveVertical() === "up";
  const downActive = isSideDriving && deps.getFeederDriveVertical() === "down";
  const stopActive = !isSideDriving;
  deps.setToggleButtonState(upEl, upActive, false);
  deps.setToggleButtonState(stopEl, stopActive, false);
  deps.setToggleButtonState(downEl, downActive, false);
}

export function updateFeederWheelFloatingControls() {
  const shouldShowForCamera = Boolean(deps.getRobotRoot() && deps.getActiveFeederCameraAnchorSide());
  updateSingleFeederWheelFloatingControls("left", shouldShowForCamera);
  updateSingleFeederWheelFloatingControls("right", shouldShowForCamera);
}
