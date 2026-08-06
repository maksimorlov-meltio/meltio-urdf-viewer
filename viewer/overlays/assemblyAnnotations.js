// Assembly annotation callouts (viewer/overlays/ — the sanctioned DOM island):
// floating door/feeder buttons anchored to 3D parts, projected every frame,
// pushed outside the model silhouette, occlusion-tested against the robot
// meshes and connected to their anchors with SVG leader lines. Host state and
// actions (door toggles, hotspot panel plumbing) are injected via `deps`.
import * as THREE from "three";

export function createAssemblyAnnotationManager(layerEl, deps = {}) {
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
    item.button.hidden = true;
    item.button.classList.remove("is-visible", "is-open", "is-occluded", "is-active");
    item.line.style.display = "none";
    item.lineEnd.style.display = "none";
    item.currentButtonX = null;
    item.currentButtonY = null;
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
    if (!deps.getRobotRoot() || !deps.ENABLE_ANNOTATION_OCCLUSION) {
      return;
    }

    deps.getRobotRoot().traverse((node) => {
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
    if (!deps.getRobotRoot()) {
      return;
    }

    const localBounds = deps.computeObjectLocalBounds(deps.getRobotRoot());
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

    if (!deps.getRobotRoot() || !robotLocalCorners.length) {
      return;
    }

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let visibleCornerCount = 0;

    for (const localCorner of robotLocalCorners) {
      silhouetteCornerWorld.copy(localCorner);
      deps.getRobotRoot().localToWorld(silhouetteCornerWorld);
      silhouetteCornerProjected.copy(silhouetteCornerWorld).project(deps.camera);

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

      nextX = deps.clamp(nextX + (outsideDirection.x * 18), 8, maxX);
      nextY = deps.clamp(nextY + (outsideDirection.y * 18), 8, maxY);
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
    const leftCandidate = deps.clamp(anchorX - gap - width, 8, maxX);
    const rightCandidate = deps.clamp(anchorX + gap, 8, maxX);
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

    rayDirection.copy(worldPoint).sub(deps.camera.position);
    const targetDistance = rayDirection.length();
    if (!Number.isFinite(targetDistance) || targetDistance <= 1e-6) {
      return false;
    }

    rayDirection.divideScalar(targetDistance);
    raycaster.set(deps.camera.position, rayDirection);
    raycaster.near = 0.01;
    raycaster.far = Math.max(targetDistance - deps.ANNOTATION_OCCLUSION_TOLERANCE, 0.01);

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
      return deps.isFrontDoorOpen();
    }
    if (itemId === "spools-door") {
      if (deps.isFrontDoorOpen()) {
        return deps.getActiveHotspotPanelId() === deps.HOTSPOT_PANEL_MATERIALS_ID;
      }
      return deps.isSpoolsDoorOpen();
    }
    if (itemId === "feeder-drive") {
      return deps.getActiveHotspotPanelId() === deps.HOTSPOT_PANEL_MATERIALS_ID;
    }
    if (itemId === "top-cover") {
      return deps.isTopCoverOpen();
    }
    return false;
  };

  const runItemToggleAction = (item) => {
    if (item.id === "front-door") {
      return deps.setFrontDoorOpenState(!deps.isFrontDoorOpen());
    }
    if (item.id === "spools-door") {
      return deps.setSpoolsDoorOpenState(!deps.isSpoolsDoorOpen());
    }
    if (item.id === "top-cover") {
      return deps.setTopCoverOpenState(!deps.isTopCoverOpen());
    }
    return false;
  };

  const runItemCameraAction = (item, worldPoint) => {
    if (item.id === "front-door") {
      deps.closeHotspotContextPanel();
      return deps.runFrontDoorButtonAction(worldPoint);
    }
    if (item.id === "spools-door") {
      if (deps.isFrontDoorOpen()) {
        deps.setHotspotMaterialsFocusSpool(null);
        return deps.toggleHotspotContextPanel(deps.HOTSPOT_PANEL_MATERIALS_ID);
      }
      deps.closeHotspotContextPanel();
      return deps.runSpoolsDoorButtonAction(worldPoint);
    }
    if (item.id === "feeder-drive") {
      deps.setHotspotMaterialsFocusSpool(null);
      return deps.toggleHotspotContextPanel(deps.HOTSPOT_PANEL_MATERIALS_ID);
    }
    if (item.id === "top-cover") {
      deps.closeHotspotContextPanel();
      return deps.runTopCoverButtonAction(worldPoint);
    }
    return false;
  };

  const setNavButtonState = (itemId, options = {}) => {
    const buttonEl = deps.annotationNavButtonsById[itemId];
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
      return deps.setFrontDoorOpenState(false);
    }
    if (itemId === "spools-door") {
      return deps.setSpoolsDoorOpenState(false);
    }
    if (itemId === "feeder-drive") {
      return deps.closeHotspotContextPanel();
    }
    if (itemId === "top-cover") {
      return deps.setTopCoverOpenState(false);
    }
    return false;
  };

  const runMenuActionWithSwitchHandling = (item, worldPoint) => {
    const supportsSwitchHandling = item.id !== "feeder-drive" && !(deps.isFrontDoorOpen() && item.id === "spools-door");
    const switchedItem = supportsSwitchHandling && Boolean(lastInvokedItemId && lastInvokedItemId !== item.id);
    const actionWorldPoint = worldPoint.clone();

    if (switchedItem) {
      closeAssemblyForItem(lastInvokedItemId);
    }

    runItemCameraAction(item, actionWorldPoint);
    if (supportsSwitchHandling) {
      lastInvokedItemId = item.id;
    }
  };

  const resolveTargetObject = (definition) => {
    if (!deps.getRobotRoot()) {
      return null;
    }

    const primaryTarget = definition.targetObjectName
      ? deps.getRobotRoot().getObjectByName(definition.targetObjectName)
      : null;
    if (primaryTarget) {
      return primaryTarget;
    }

    if (!definition.fallbackTargetObjectName) {
      return null;
    }

    return deps.getRobotRoot().getObjectByName(definition.fallbackTargetObjectName);
  };

  const computeLocalAnchorData = (targetObject, definition) => {
    const localBounds = deps.computeObjectLocalBounds(targetObject);
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
      return Boolean(deps.getFrontDoorControlData());
    }
    if (itemId === "spools-door") {
      return Boolean(deps.getSpoolsDoorControlData());
    }
    if (itemId === "feeder-drive") {
      return Boolean(deps.getLeftFeederWheelState() || deps.getRightFeederWheelState());
    }
    if (itemId === "top-cover") {
      return Boolean(deps.getTopCoverControlData());
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

    for (const itemId of Object.keys(deps.annotationNavButtonsById)) {
      setNavButtonState(itemId, { enabled: false, active: false, open: false });
    }

    layerEl.setAttribute("aria-hidden", "true");
  };

  const rebuildFromRobot = () => {
    clear();

    if (!deps.getRobotRoot()) {
      return;
    }

    deps.getRobotRoot().updateWorldMatrix(true, true);
    rebuildRobotLocalCorners();
    setCalloutSvgSize();
    collectOcclusionMeshes();

    for (const itemId of Object.keys(deps.annotationNavButtonsById)) {
      setNavButtonState(itemId, { enabled: false, active: false, open: false });
    }

    for (const definition of deps.ANNOTATION_DEFINITIONS) {
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
      button.dataset.annotationId = definition.id;

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
        navButton: deps.annotationNavButtonsById[definition.id] || null,
        buttonWidth: 130,
        buttonHeight: 34,
        occluded: false,
        lastOcclusionUpdateMs: -Infinity,
        previousAnchorWorld: new THREE.Vector3(),
        hasPreviousAnchorWorld: false,
        currentButtonX: null,
        currentButtonY: null,
      };

      const buttonRect = button.getBoundingClientRect();
      item.buttonWidth = buttonRect.width || item.buttonWidth;
      item.buttonHeight = buttonRect.height || item.buttonHeight;

      const triggerItemAction = () => {
        deps.markUserActivity();
        activeItemId = item.id;
        activeItemUntilMs = performance.now() + deps.ANNOTATION_CLICK_ACTIVE_HOLD_MS;

        focusPoint.copy(item.localAnchor);
        item.targetObject.localToWorld(focusPoint);
        runMenuActionWithSwitchHandling(item, focusPoint);
      };

      button.addEventListener("click", triggerItemAction);

      if (item.navButton) {
        const triggerNavAction = () => {
          deps.markUserActivity();
          activeItemId = item.id;
          activeItemUntilMs = performance.now() + deps.ANNOTATION_CLICK_ACTIVE_HOLD_MS;

          focusPoint.copy(item.localAnchor);
          item.targetObject.localToWorld(focusPoint);
          runMenuActionWithSwitchHandling(item, focusPoint);
        };

        const navLabel = item.id === "front-door" ? "Front Door" : definition.label;
        item.navButton.textContent = navLabel;
        item.navButton.onclick = triggerNavAction;
        setNavButtonState(item.id, { enabled: true, active: false, open: false });
      }

      items.push(item);
    }

    layerEl.setAttribute("aria-hidden", items.length ? "false" : "true");
  };

  const update = (nowMs = performance.now()) => {
    if (!items.length || !deps.getRobotRoot()) {
      return;
    }

    if (deps.ANNOTATION_UPDATE_INTERVAL_MS > 0 && (nowMs - lastUpdateMs) < deps.ANNOTATION_UPDATE_INTERVAL_MS) {
      return;
    }
    lastUpdateMs = nowMs;

    cameraForward.copy(deps.controls.target).sub(deps.camera.position).normalize();
    updateModelScreenBounds();

    let cameraMoved = false;
    if (deps.ENABLE_ANNOTATION_OCCLUSION) {
      cameraMoved = (
        !hasCameraSnapshot ||
        previousCameraPosition.distanceToSquared(deps.camera.position) > 1e-8 ||
        previousControlsTarget.distanceToSquared(deps.controls.target) > 1e-8 ||
        (1 - Math.abs(previousCameraQuaternion.dot(deps.camera.quaternion))) > 1e-7
      );

      previousCameraPosition.copy(deps.camera.position);
      previousControlsTarget.copy(deps.controls.target);
      previousCameraQuaternion.copy(deps.camera.quaternion);
      hasCameraSnapshot = true;
    }

    const occlusionBudget = Math.max(0, Math.min(deps.ANNOTATION_OCCLUSION_RAYCASTS_PER_FRAME, items.length));
    const occlusionStartIndex = occlusionRoundRobinIndex;
    const isFrontDoorViewActive = deps.isFrontDoorOpen();
    const shouldUseFilesPopupRail = deps.isCloudModelMenuOpen();
    deps.setHotspotTriggerRailVisible(shouldUseFilesPopupRail);

    if (!shouldUseFilesPopupRail && deps.getActiveHotspotPanelId() && !deps.getKeepHotspotContextPanelVisible()) {
      deps.closeHotspotContextPanel();
    }

    for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
      const item = items[itemIndex];
      const open = getItemIsOpen(item.id);
      item.isOpen = open;

      if (
        item.id === "front-door"
        || item.id === "spools-door"
        || isFrontDoorViewActive
        || (!isFrontDoorViewActive && item.id === "feeder-drive")
        || (shouldUseFilesPopupRail && (item.id === "spools-door" || item.id === "feeder-drive"))
      ) {
        item.isVisible = false;
        item.autoActiveScore = Number.POSITIVE_INFINITY;
        hideItem(item);
        continue;
      }

      anchorWorld.copy(item.localAnchor);
      item.targetObject.localToWorld(anchorWorld);

      let anchorMoved = !item.hasPreviousAnchorWorld;
      if (!anchorMoved) {
        anchorMoved = item.previousAnchorWorld.distanceToSquared(anchorWorld) > 1e-8;
      }
      item.previousAnchorWorld.copy(anchorWorld);
      item.hasPreviousAnchorWorld = true;

      projected.copy(anchorWorld).project(deps.camera);

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

      const clampedProjectedX = deps.clamp(projected.x, -0.92, 0.92);
      const clampedProjectedY = deps.clamp(projected.y, -0.92, 0.92);

      item.isVisible = true;

      const anchorX = (clampedProjectedX * 0.5 + 0.5) * window.innerWidth;
      const anchorY = (-clampedProjectedY * 0.5 + 0.5) * window.innerHeight;
      const buttonWidth = item.buttonWidth;
      const buttonHeight = item.buttonHeight;
      const overlayYBounds = deps.getOverlayVerticalSafeBounds(buttonHeight);

      let buttonX = deps.clamp(
        anchorX + item.screenOffset[0],
        8,
        Math.max(window.innerWidth - buttonWidth - 8, 8),
      );
      let buttonY = deps.clamp(
        anchorY + item.screenOffset[1],
        overlayYBounds.minY,
        overlayYBounds.maxY,
      );

      const isActiveMaterialsPinnedLeft = item.id === "spools-door"
        && (open || activeItemId === item.id);
      if (isActiveMaterialsPinnedLeft) {
        const maxScreenX = Math.max(window.innerWidth - buttonWidth - 8, 8);
        const modelRelativeLeftTargetX = modelScreenBounds.valid
          ? modelScreenBounds.minX - buttonWidth - 20
          : 136;
        buttonX = deps.clamp(modelRelativeLeftTargetX, 128, Math.min(220, maxScreenX));
      }

      if (modelScreenBounds.valid && !isActiveMaterialsPinnedLeft) {
        const moved = moveButtonOutsideModelBounds(buttonX, buttonY, buttonWidth, buttonHeight, item.screenOffset);
        buttonX = moved.x;
        buttonY = moved.y;
      }

      if (!isActiveMaterialsPinnedLeft && isAnchorCrossingButtonBody(anchorX, buttonX, buttonWidth)) {
        buttonX = computeFlippedButtonX(anchorX, buttonX, buttonWidth, item.screenOffset?.[0]);

        if (modelScreenBounds.valid) {
          const moved = moveButtonOutsideModelBounds(buttonX, buttonY, buttonWidth, buttonHeight, item.screenOffset);
          buttonX = moved.x;
          buttonY = moved.y;
        }
      }

      // Keep callouts clear of fixed top and bottom menus while deps.camera moves.
      buttonY = deps.clamp(buttonY, overlayYBounds.minY, overlayYBounds.maxY);

      if (item.id === "spools-door" && Number.isFinite(item.currentButtonX) && Number.isFinite(item.currentButtonY)) {
        const xSmoothing = isActiveMaterialsPinnedLeft ? 0.2 : 0.14;
        const ySmoothing = isActiveMaterialsPinnedLeft ? 0.18 : 0.14;
        buttonX = THREE.MathUtils.lerp(item.currentButtonX, buttonX, xSmoothing);
        buttonY = THREE.MathUtils.lerp(item.currentButtonY, buttonY, ySmoothing);
      }

      item.currentButtonX = buttonX;
      item.currentButtonY = buttonY;

      item.button.style.transform = `translate(${buttonX.toFixed(2)}px, ${buttonY.toFixed(2)}px)`;
      item.button.hidden = false;
      item.button.classList.add("is-visible");

      const buttonCenterX = buttonX + (buttonWidth * 0.5);
      const lineEndX = anchorX <= buttonCenterX ? buttonX : (buttonX + buttonWidth);
      const lineEndY = buttonY + (buttonHeight * 0.5);
      const lineStartX = anchorX;
      const lineStartY = anchorY;

      item.line.setAttribute("x1", String(lineStartX));
      item.line.setAttribute("y1", String(lineStartY));
      item.line.setAttribute("x2", String(lineEndX));
      item.line.setAttribute("y2", String(lineEndY));
      item.lineEnd.setAttribute("cx", String(lineStartX));
      item.lineEnd.setAttribute("cy", String(lineStartY));

      if (isProjectedOutside) {
        item.occluded = true;
        item.lastOcclusionUpdateMs = nowMs;
      } else if (!deps.ENABLE_ANNOTATION_OCCLUSION || occlusionBudget === 0) {
        item.occluded = false;
        item.lastOcclusionUpdateMs = nowMs;
      } else {
        const staleOcclusion = (nowMs - item.lastOcclusionUpdateMs) >= deps.ANNOTATION_OCCLUSION_MAX_STALE_MS;
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
      centerToAnchor.copy(anchorWorld).sub(deps.controls.target);
      let sideScore = 1;
      let facingDot = -1;
      if (centerToAnchor.lengthSq() > 1e-8) {
        centerToAnchor.normalize();
        facingDot = deps.clamp(centerToAnchor.dot(cameraForward), -1, 1);
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

    if (!deps.ENABLE_ANNOTATION_OCCLUSION) {
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
