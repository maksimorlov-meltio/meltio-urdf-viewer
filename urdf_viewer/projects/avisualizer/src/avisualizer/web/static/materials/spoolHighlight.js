// Spool-assembly highlight + pick (extracted from urdf_viewer.js, first leaf of the
// feeder+materials domain). Owns the pulsing highlight ring over a spool link and the
// click-to-pick raycast that opens the Materials panel for the clicked spool. Highlight
// state + scratch vectors are module-local; the shared highlight-info cache stays
// god-file-owned (reset on URDF load) and arrives via ctx. createSpoolHighlight(ctx) ->
// { set/clear/update highlight, handle canvas click, getActiveSpoolHighlightKey }.
import * as THREE from "three";

export function createSpoolHighlight(ctx) {
  const {
    scene,
    camera,
    getRobotRoot,
    spoolHighlightInfoByKey,
    normalizeSpoolKey,
    computeObjectLocalBounds,
    getCloudStlDragState,
    getCanvasPointerNdc,
    markUserActivity,
    beginInteractionQuality,
    clamp,
    openMaterialsPanelForSpool,
    getActiveHotspotPanelId,
    SPOOL_1_LINK,
    SPOOL_2_LINK,
    SPOOL_ASSEMBLY_PICK_AREAS,
    SPOOL_HIGHLIGHT_DURATION_MS,
    SPOOL_HIGHLIGHT_RING_COLOR,
    SPOOL_HIGHLIGHT_RING_BASE_OPACITY,
    SPOOL_HIGHLIGHT_RING_PULSE_OPACITY,
    SPOOL_HIGHLIGHT_RING_TUBE_RADIUS,
    SPOOL_HIGHLIGHT_RING_RADIUS_SCALE,
    SPOOL_HIGHLIGHT_RING_FACE_OFFSET_SCALE,
    HOTSPOT_PANEL_MATERIALS_ID,
  } = ctx;

  const spoolAssemblyPickRaycaster = new THREE.Raycaster();
  const spoolAssemblyPickPointerNdc = new THREE.Vector2();
  const spoolAssemblyPickClosestPoint = new THREE.Vector3();
  const spoolAssemblyPickToCenter = new THREE.Vector3();
  let activeSpoolHighlightKey = null;
  let spoolHighlightUntilMs = 0;
  let spoolHighlightRingMesh = null;
  const spoolHighlightRingLocalNormal = new THREE.Vector3(0, 0, 1);
  const spoolHighlightLocalAxis = new THREE.Vector3();
  const spoolHighlightWorldAxis = new THREE.Vector3();
  const spoolHighlightWorldCenter = new THREE.Vector3();
  const spoolHighlightToCamera = new THREE.Vector3();
  const spoolHighlightRingQuaternion = new THREE.Quaternion();

  function getSpoolLinkNameByKey(spoolKey) {
    if (spoolKey === "spool1") {
      return SPOOL_1_LINK;
    }
    if (spoolKey === "spool2") {
      return SPOOL_2_LINK;
    }
    return null;
  }

  function getSpoolHighlightInfo(spoolKey) {
    const normalizedSpoolKey = normalizeSpoolKey(spoolKey);
    if (!normalizedSpoolKey || !getRobotRoot()) {
      return null;
    }

    const cachedInfo = spoolHighlightInfoByKey[normalizedSpoolKey];
    if (cachedInfo?.linkObject && isObjectDescendantOf(cachedInfo.linkObject, getRobotRoot())) {
      return cachedInfo;
    }

    const spoolLinkName = getSpoolLinkNameByKey(normalizedSpoolKey);
    if (!spoolLinkName) {
      return null;
    }

    const linkObject = getRobotRoot().getObjectByName(`link:${spoolLinkName}`);
    if (!linkObject) {
      return null;
    }

    const localBounds = computeObjectLocalBounds(linkObject);
    if (!localBounds || localBounds.isEmpty()) {
      return null;
    }

    const localCenter = new THREE.Vector3();
    const localSize = new THREE.Vector3();
    localBounds.getCenter(localCenter);
    localBounds.getSize(localSize);

    const localSizeValues = [localSize.x, localSize.y, localSize.z];
    let axisIndex = 0;
    if (localSizeValues[1] < localSizeValues[axisIndex]) {
      axisIndex = 1;
    }
    if (localSizeValues[2] < localSizeValues[axisIndex]) {
      axisIndex = 2;
    }

    const radialAxisIndices = [0, 1, 2].filter((index) => index !== axisIndex);
    const faceRadius = Math.max(
      (Math.max(localSizeValues[radialAxisIndices[0]], localSizeValues[radialAxisIndices[1]]) * 0.5)
        * SPOOL_HIGHLIGHT_RING_RADIUS_SCALE,
      0.02,
    );
    const halfThickness = Math.max(localSizeValues[axisIndex] * 0.5, 0.003);

    const highlightInfo = {
      linkObject,
      localCenter,
      axisIndex,
      faceRadius,
      halfThickness,
    };

    spoolHighlightInfoByKey[normalizedSpoolKey] = highlightInfo;
    return highlightInfo;
  }

  function ensureSpoolHighlightRingMesh() {
    if (spoolHighlightRingMesh) {
      return spoolHighlightRingMesh;
    }

    const ringGeometry = new THREE.TorusGeometry(1, SPOOL_HIGHLIGHT_RING_TUBE_RADIUS, 20, 84);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: SPOOL_HIGHLIGHT_RING_COLOR,
      transparent: true,
      opacity: SPOOL_HIGHLIGHT_RING_BASE_OPACITY,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    spoolHighlightRingMesh = new THREE.Mesh(ringGeometry, ringMaterial);
    spoolHighlightRingMesh.visible = false;
    spoolHighlightRingMesh.renderOrder = 16;
    scene.add(spoolHighlightRingMesh);
    return spoolHighlightRingMesh;
  }

  function clearSpoolAssemblyHighlight() {
    if (spoolHighlightRingMesh) {
      spoolHighlightRingMesh.visible = false;
    }
    activeSpoolHighlightKey = null;
    spoolHighlightUntilMs = 0;
  }

  function setSpoolAssemblyHighlight(spoolKey, options = {}) {
    const normalizedSpoolKey = normalizeSpoolKey(spoolKey);
    if (!normalizedSpoolKey) {
      return;
    }

    const requestedDurationMs = Number(options.durationMs);
    const durationMs = Number.isFinite(requestedDurationMs) && requestedDurationMs > 0
      ? requestedDurationMs
      : SPOOL_HIGHLIGHT_DURATION_MS;

    activeSpoolHighlightKey = normalizedSpoolKey;
    spoolHighlightUntilMs = performance.now() + durationMs;
  }

  function updateSpoolAssemblyHighlight(nowMs = performance.now()) {
    const shouldKeepHighlight = Boolean(activeSpoolHighlightKey)
      && (nowMs <= spoolHighlightUntilMs || getActiveHotspotPanelId() === HOTSPOT_PANEL_MATERIALS_ID);

    if (!shouldKeepHighlight) {
      if (activeSpoolHighlightKey) {
        clearSpoolAssemblyHighlight();
      }
      return;
    }

    if (!activeSpoolHighlightKey) {
      return;
    }

    const highlightInfo = getSpoolHighlightInfo(activeSpoolHighlightKey);
    const ringMesh = ensureSpoolHighlightRingMesh();
    if (!highlightInfo || !ringMesh) {
      if (ringMesh) {
        ringMesh.visible = false;
      }
      return;
    }

    highlightInfo.linkObject.updateWorldMatrix(true, false);
    spoolHighlightWorldCenter.copy(highlightInfo.localCenter);
    highlightInfo.linkObject.localToWorld(spoolHighlightWorldCenter);

    spoolHighlightLocalAxis.set(0, 0, 0);
    if (highlightInfo.axisIndex === 0) {
      spoolHighlightLocalAxis.x = 1;
    } else if (highlightInfo.axisIndex === 1) {
      spoolHighlightLocalAxis.y = 1;
    } else {
      spoolHighlightLocalAxis.z = 1;
    }

    spoolHighlightWorldAxis.copy(spoolHighlightLocalAxis);
    spoolHighlightWorldAxis.transformDirection(highlightInfo.linkObject.matrixWorld);
    if (spoolHighlightWorldAxis.lengthSq() <= 1e-8) {
      spoolHighlightWorldAxis.set(0, 0, 1);
    }
    spoolHighlightWorldAxis.normalize();

    spoolHighlightToCamera.copy(camera.position).sub(spoolHighlightWorldCenter);
    const faceDirection = spoolHighlightWorldAxis.dot(spoolHighlightToCamera) >= 0 ? 1 : -1;

    ringMesh.position.copy(spoolHighlightWorldCenter);
    ringMesh.position.addScaledVector(
      spoolHighlightWorldAxis,
      highlightInfo.halfThickness * faceDirection * SPOOL_HIGHLIGHT_RING_FACE_OFFSET_SCALE,
    );

    spoolHighlightRingQuaternion.setFromUnitVectors(spoolHighlightRingLocalNormal, spoolHighlightWorldAxis);
    ringMesh.quaternion.copy(spoolHighlightRingQuaternion);
    ringMesh.scale.setScalar(highlightInfo.faceRadius);

    const ringMaterial = ringMesh.material;
    if (ringMaterial && typeof ringMaterial.opacity === "number") {
      const pulseOpacity = SPOOL_HIGHLIGHT_RING_BASE_OPACITY
        + (((Math.sin(nowMs * 0.012) + 1) * 0.5) * SPOOL_HIGHLIGHT_RING_PULSE_OPACITY);
      ringMaterial.opacity = clamp(pulseOpacity, 0.18, 1);
    }

    ringMesh.visible = true;
  }

  function isObjectDescendantOf(candidate, ancestor) {
    let cursor = candidate;
    while (cursor) {
      if (cursor === ancestor) {
        return true;
      }
      cursor = cursor.parent;
    }
    return false;
  }

  function buildSpoolAssemblyPickAreas() {
    if (!getRobotRoot()) {
      return [];
    }

    const areas = [];
    for (const areaDefinition of SPOOL_ASSEMBLY_PICK_AREAS) {
      const linkObject = getRobotRoot().getObjectByName(`link:${areaDefinition.linkName}`);
      if (!linkObject) {
        continue;
      }

      const localBounds = computeObjectLocalBounds(linkObject);
      const localCenter = new THREE.Vector3();
      const localSize = new THREE.Vector3(0.12, 0.12, 0.12);

      if (localBounds && !localBounds.isEmpty()) {
        localBounds.getCenter(localCenter);
        localBounds.getSize(localSize);
      }

      const localOffset = Array.isArray(areaDefinition.localOffset) ? areaDefinition.localOffset : [0, 0, 0];
      localCenter.x += Number(localOffset[0]) || 0;
      localCenter.y += Number(localOffset[1]) || 0;
      localCenter.z += Number(localOffset[2]) || 0;

      const worldCenter = localCenter.clone();
      linkObject.localToWorld(worldCenter);

      const rawRadius = localSize.length() * (Number(areaDefinition.radiusScale) || 0.5);
      const radius = clamp(
        rawRadius,
        Number(areaDefinition.minRadius) || 0.03,
        Number(areaDefinition.maxRadius) || 0.32,
      );

      areas.push({
        spoolKey: areaDefinition.spoolKey,
        linkObject,
        worldCenter,
        radius,
      });
    }

    return areas;
  }

  function resolveClickedSpoolAssembly(event) {
    if (!event || !getRobotRoot() || getCloudStlDragState()) {
      return null;
    }

    const pointerNdc = getCanvasPointerNdc(event, spoolAssemblyPickPointerNdc);
    if (!pointerNdc) {
      return null;
    }

    const pickAreas = buildSpoolAssemblyPickAreas();
    if (!pickAreas.length) {
      return null;
    }

    spoolAssemblyPickRaycaster.setFromCamera(pointerNdc, camera);

    const linkObjects = pickAreas.map((area) => area.linkObject);
    const meshHits = spoolAssemblyPickRaycaster.intersectObjects(linkObjects, true);
    for (const hit of meshHits) {
      for (const area of pickAreas) {
        if (isObjectDescendantOf(hit.object, area.linkObject)) {
          return area.spoolKey;
        }
      }
    }

    // Fallback: use explicit spherical hit areas centered on each spool.
    let bestSpoolKey = null;
    let bestProjectedDistance = Number.POSITIVE_INFINITY;
    for (const area of pickAreas) {
      spoolAssemblyPickToCenter.copy(area.worldCenter).sub(spoolAssemblyPickRaycaster.ray.origin);
      const projectedDistance = spoolAssemblyPickToCenter.dot(spoolAssemblyPickRaycaster.ray.direction);
      if (projectedDistance <= 0) {
        continue;
      }

      spoolAssemblyPickRaycaster.ray.closestPointToPoint(area.worldCenter, spoolAssemblyPickClosestPoint);
      const radialDistanceSq = spoolAssemblyPickClosestPoint.distanceToSquared(area.worldCenter);
      if (radialDistanceSq > area.radius * area.radius) {
        continue;
      }

      if (projectedDistance < bestProjectedDistance) {
        bestProjectedDistance = projectedDistance;
        bestSpoolKey = area.spoolKey;
      }
    }

    return bestSpoolKey;
  }

  function handleSpoolAssemblyCanvasClick(event) {
    if (!event || event.button !== 0) {
      return false;
    }

    const clickedSpoolKey = resolveClickedSpoolAssembly(event);
    if (!clickedSpoolKey) {
      return false;
    }

    markUserActivity();
    beginInteractionQuality();
    openMaterialsPanelForSpool(clickedSpoolKey);
    return true;
  }

  return {
    setSpoolAssemblyHighlight,
    clearSpoolAssemblyHighlight,
    updateSpoolAssemblyHighlight,
    handleSpoolAssemblyCanvasClick,
    resolveClickedSpoolAssembly,
    getActiveSpoolHighlightKey: () => activeSpoolHighlightKey,
  };
}
