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

// Last values written to the DOM per side, so the per-frame updater can skip
// writes that change nothing. Everything below runs from animate(): without
// these guards the panel rewrote `hidden`, `aria-hidden` and a transform string
// 60 times a second while the operator stared at a motionless panel (the repo
// rule is that nothing reached from animate() may write the DOM unconditionally
// — see updateBottomNavState).
const lastRenderedBySide = {
  left: { visible: null, transform: null, size: null },
  right: { visible: null, transform: null, size: null },
};

export function setFeederWheelFloatingControlsVisible(side, isVisible) {
  const { panelEl } = getFeederWheelFloatingPanelElements(side);
  if (!panelEl) {
    return;
  }
  const memo = lastRenderedBySide[side];
  if (memo && memo.visible === isVisible) {
    return;
  }
  if (memo) {
    memo.visible = isVisible;
    if (!isVisible) {
      // Force a reposition and a re-measure when it comes back.
      memo.transform = null;
      memo.size = null;
    }
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

  // Measure once per visibility transition, not per frame:
  // getBoundingClientRect forces a layout flush, and this panel's size is fixed
  // by its three buttons. Ceiling: a CSS change that resizes it mid-visibility
  // would be picked up only on the next show — invalidate memo.size there too.
  const sizeMemo = lastRenderedBySide[side];
  if (sizeMemo && !sizeMemo.size) {
    const rect = panelEl.getBoundingClientRect();
    sizeMemo.size = { w: Math.max(rect.width, 48), h: Math.max(rect.height, 122) };
  }
  const panelWidth = sizeMemo ? sizeMemo.size.w : 48;
  const panelHeight = sizeMemo ? sizeMemo.size.h : 122;
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

  const transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;
  const memo = lastRenderedBySide[side];
  if (!memo || memo.transform !== transform) {
    panelEl.style.transform = transform;
    if (memo) memo.transform = transform;
  }

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
