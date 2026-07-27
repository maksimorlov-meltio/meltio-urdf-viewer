// Cloud STL 3D domain (extracted from urdf_viewer.js). Owns the cloud STL/point mesh
// lifecycle: load (STL/point-cloud) -> unit-scale -> attach to the eje_y parent -> place
// -> align to the gantry joints -> display/drag/relocate -> dispose. Owns the mesh state
// (cloudStlObject/cloudPointObject + scratch); reaches core-3D, kinematics, print-sim and
// the cloudLibrary module through ctx. createCloudStl3D(ctx) -> placement/loader API.
import * as THREE from "three";

export function createCloudStl3D(ctx) {
  const {
    scene,
    camera,
    controls,
    stlLoader,
    setCloudStlStatus,
    printSim,
    setCloudPrintSimulationPlaying,
    setCloudPrintSimulationProgress,
    beginInteractionQuality,
    resolveCloudViewMode,
    updateCloudControlVisibility,
    updateBottomNavState,
    computeObjectLocalBounds,
    clearPendingFrontDoorSequence,
    getCloudPointLayerSimulationMeta,
    refreshSelectedPrintJobUsage,
    updateCloudPrintSimulationControls,
    teardownPrintBedSimulation,
    getSlicerPlacementWorldOffset,
    resolveCloudPrintSimAxis,
    resolveCloudPrintSimDirection,
    getCloudPrintSimAxisIndex,
    getCloudPrintSimLayerStepMm,
    buildVoxelCubeObject,
    buildSpriteObject,
    fetchSensorData,
    initializeCloudPrintSimulationForLoadedCloud,
    hasLoadedCloudFileForPrint,
    updateSlicerModelPreview,
    markUserActivity,
    getJointStateByName,
    setJointValue,
    moveJointToValue,
    getLinearJointWorldAxis,
    getHeadLowestWorldPoint,
    clamp,
    getCanvasPointerNdc,
    disposeMaterialWithMaps,
    cloudStlFileSelectEl,
    cloudViewModeEl,
    cloudFileLibraryEl,
    EJE_X_JOINT,
    EJE_Y_JOINT,
    CLOUD_STL_PLACEMENT_SIDES,
    CLOUD_STL_PARENT_LINK,
    CLOUD_POINT_PARENT_LINK,
    CLOUD_STL_TOP_CLEARANCE_M,
    CLOUD_STL_DROP_ALIGN_DURATION_SEC,
    CLOUD_STL_ASSUME_REAL_SCALE_MAX_DIM_M,
    CLOUD_STL_UNIT_SCALE_CANDIDATES,
    CLOUD_STL_UNIT_SCALE_TARGET_DIM_M,
    CLOUD_STL_DATASET_API_URL,
    CLOUD_STL_FILE_API_URL,
    CLOUD_POINT_OUTLINE_COLOR,
    CLOUD_POINT_OUTLINE_START,
    CLOUD_POINT_WORLD_SCALE,
    getCloudDatasetName,
    syncCloudDatasetFromSelectedStl,
    renderCloudFileLibrary,
    resolveCloudFileSourceFilter,
    updateCloudSourceFilterButtons,
    setCloudLibraryMessage,
    fetchCloudLibraryEntriesForSource,
    setSelectedCloudLibraryFile,
    setCloudFileRowSliceStatus,
    getRobotRoot,
    getCloudStlVisible,
    getCloudStlOpacity,
    getCloudStlPlacementSide,
    getCloudPointSize,
    getCloudPointMaxPoints,
    getCloudPointVoxelSizeMm,
    getCloudPointVoxelSizeZMm,
    getCloudPrintSimAxis,
    getCloudPrintSimDirection,
    getIsDockedPrintActive,
    getCloudPrintSimPlaying,
    getCloudPrintSimProgress,
    getCloudViewMode,
    setCloudViewMode,
    getLoadedCloudLibraryFileName,
    setLoadedCloudLibraryFileName,
    getSelectedCloudLibraryFileName,
    setSelectedCloudLibraryFileName,
    getCloudFileSourceFilter,
    setCloudFileSourceFilter,
    getCloudFileLibraryEntries,
    setCloudFileLibraryEntries,
    getPrintHideStl,
    setPrintHideStl,
    getPrintSimAutoRunInProgress,
    setPrintSimAutoRunInProgress,
    getAutoSliceFlowActive,
    setAutoSliceFlowActive,
  } = ctx;

  let cloudStlObject = null;
  let cloudStlLoadToken = 0;
  const cloudStlBaseQuaternion = new THREE.Quaternion();
  let cloudStlDragState = null;
  let cloudPointObject = null;
  let cloudPointSpriteMaterial = null;
  const cloudStlDragRaycaster = new THREE.Raycaster();
  const cloudStlDragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const cloudStlDragStartWorld = new THREE.Vector3();
  const cloudStlDragCurrentWorld = new THREE.Vector3();
  const cloudStlRelocateHitWorld = new THREE.Vector3();

  const getCloudStlObject = () => cloudStlObject;
  const getCloudPointObject = () => cloudPointObject;
  const getCloudStlDragState = () => cloudStlDragState;
  function resolveCloudStlPlacementSide(sideValue) {
    const normalized = typeof sideValue === "string"
      ? sideValue.trim().toLowerCase()
      : "";

    return Object.prototype.hasOwnProperty.call(CLOUD_STL_PLACEMENT_SIDES, normalized)
      ? normalized
      : "top";
  }

  function getCloudStlPlacementConfig(sideValue = getCloudStlPlacementSide()) {
    const sideKey = resolveCloudStlPlacementSide(sideValue);
    return CLOUD_STL_PLACEMENT_SIDES[sideKey] || CLOUD_STL_PLACEMENT_SIDES.top;
  }

  function applyCloudStlSideRotation() {
    if (!cloudStlObject) {
      return;
    }

    const sideConfig = getCloudStlPlacementConfig(getCloudStlPlacementSide());
    const zRotation = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 0, 1),
      THREE.MathUtils.degToRad(sideConfig.zDeg),
    );

    cloudStlObject.quaternion.copy(cloudStlBaseQuaternion).multiply(zRotation);
    cloudStlObject.updateMatrixWorld(true);
  }

  function applyCloudPointStandaloneSideRotation() {
    if (!cloudPointObject || cloudStlObject) {
      return;
    }

    const sideConfig = getCloudStlPlacementConfig(getCloudStlPlacementSide());
    const zRotation = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 0, 1),
      THREE.MathUtils.degToRad(sideConfig.zDeg),
    );

    cloudPointObject.quaternion.copy(zRotation);
    cloudPointObject.updateMatrixWorld(true);
  }

  function tryStartCloudStlDrag(event) {
    if (!event || event.button !== 0 || !cloudStlObject) {
      return false;
    }

    if (typeof event.isPrimary === "boolean" && !event.isPrimary) {
      return false;
    }

    if (cloudStlDragState) {
      return false;
    }

    const pointerNdc = getCanvasPointerNdc(event);
    if (!pointerNdc) {
      return false;
    }

    cloudStlDragRaycaster.setFromCamera(pointerNdc, camera);
    const hits = cloudStlDragRaycaster.intersectObject(cloudStlObject, true);
    let hitPoint = hits.length ? hits[0].point : null;
    if (!hitPoint) {
      cloudStlObject.updateWorldMatrix(true, true);
      const stlBounds = new THREE.Box3().setFromObject(cloudStlObject);
      if (!stlBounds.isEmpty()) {
        const boxHit = cloudStlDragRaycaster.ray.intersectBox(stlBounds, cloudStlRelocateHitWorld);
        if (boxHit) {
          hitPoint = cloudStlRelocateHitWorld;
        }
      }
    }

    if (!hitPoint) {
      cloudStlObject.updateWorldMatrix(true, true);
      const stlBounds = new THREE.Box3().setFromObject(cloudStlObject);
      if (!stlBounds.isEmpty()) {
        hitPoint = stlBounds.getCenter(cloudStlDragStartWorld);
      }
    }

    if (!hitPoint) {
      return false;
    }

    cloudStlDragStartWorld.copy(hitPoint);
    cloudStlDragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 0, 1), cloudStlDragStartWorld);

    const ejeXState = getJointStateByName(EJE_X_JOINT);
    const ejeYState = getJointStateByName(EJE_Y_JOINT);
    cloudStlObject.updateWorldMatrix(true, true);
    const stlBounds = new THREE.Box3().setFromObject(cloudStlObject);
    const startCenterWorld = !stlBounds.isEmpty()
      ? stlBounds.getCenter(new THREE.Vector3())
      : cloudStlDragStartWorld.clone();
    const hitOffsetWorld = startCenterWorld.clone().sub(cloudStlDragStartWorld);

    cloudStlDragState = {
      attached: true,
      startCenterWorld,
      startLocalPosition: cloudStlObject.position.clone(),
      hitOffsetWorld,
      startXValue: (ejeXState && ejeXState.kind === "linear") ? ejeXState.value : null,
      startYValue: (ejeYState && ejeYState.kind === "linear") ? ejeYState.value : null,
    };

    controls.enabled = false;
    setCloudStlStatus("attached to cursor; move mouse and click to place");
    markUserActivity();
    beginInteractionQuality();
    event.preventDefault();
    event.stopPropagation();
    return true;
  }

  function updateCloudStlDrag(event) {
    if (!cloudStlDragState || !event) {
      return false;
    }

    const pointerNdc = getCanvasPointerNdc(event);
    if (!pointerNdc) {
      return false;
    }

    cloudStlDragRaycaster.setFromCamera(pointerNdc, camera);
    const hit = cloudStlDragRaycaster.ray.intersectPlane(cloudStlDragPlane, cloudStlDragCurrentWorld);
    if (!hit) {
      return false;
    }

    const desiredCenter = cloudStlDragCurrentWorld.clone().add(
      cloudStlDragState.hitOffsetWorld || new THREE.Vector3(),
    );

    relocateCloudStlToWorldXY(desiredCenter.x, desiredCenter.y, {
      updateStatus: false,
      syncAxes: false,
    });
    setCloudStlStatus("attached to cursor; click to place");
    markUserActivity();
    beginInteractionQuality();
    event.preventDefault();
    return true;
  }

  function tryPlaceCloudStlDrag(event) {
    if (!cloudStlDragState || !event || event.button !== 0) {
      return false;
    }

    let targetWorldPoint = null;
    const pointerNdc = getCanvasPointerNdc(event);
    if (pointerNdc) {
      cloudStlDragRaycaster.setFromCamera(pointerNdc, camera);
      const hit = cloudStlDragRaycaster.ray.intersectPlane(cloudStlDragPlane, cloudStlDragCurrentWorld);
      if (hit) {
        targetWorldPoint = cloudStlDragCurrentWorld;
      }
    }

    if (!targetWorldPoint && cloudStlObject) {
      cloudStlObject.updateWorldMatrix(true, true);
      const stlBounds = new THREE.Box3().setFromObject(cloudStlObject);
      if (!stlBounds.isEmpty()) {
        targetWorldPoint = stlBounds.getCenter(cloudStlDragCurrentWorld);
      }
    }

    if (!targetWorldPoint) {
      return false;
    }

    const desiredCenter = targetWorldPoint.clone().add(
      cloudStlDragState.hitOffsetWorld || new THREE.Vector3(),
    );

    const previewPlaced = relocateCloudStlToWorldXY(desiredCenter.x, desiredCenter.y, {
      updateStatus: false,
      syncAxes: false,
    });
    if (!previewPlaced) {
      return false;
    }

    cloudStlObject.updateWorldMatrix(true, true);
    const placedBounds = new THREE.Box3().setFromObject(cloudStlObject);
    const placedCenter = !placedBounds.isEmpty()
      ? placedBounds.getCenter(new THREE.Vector3())
      : targetWorldPoint.clone();

    const placedXmm = placedCenter.x * 1000;
    const placedYmm = placedCenter.y * 1000;
    setCloudStlStatus(`placed on print area (x ${placedXmm.toFixed(1)} mm, y ${placedYmm.toFixed(1)} mm)`);

    stopCloudStlDrag(null, { silent: true });
    alignCloudStlUnderHeadViaXY(CLOUD_STL_DROP_ALIGN_DURATION_SEC);
    markUserActivity();
    beginInteractionQuality();
    event.preventDefault();
    event.stopPropagation();
    return true;
  }

  function stopCloudStlDrag(pointerId = null, options = {}) {
    if (!cloudStlDragState) {
      return false;
    }

    const { silent = false } = options;
    cloudStlDragState = null;

    controls.enabled = true;

    if (!silent) {
      setCloudStlStatus("placement canceled");
    }

    return true;
  }

  function clearCloudStlObject() {
    stopCloudStlDrag(null, { silent: true });
    // Return the bed to where it was before any print simulation.
    teardownPrintBedSimulation();
    // Drop any slicer-solid preview so the next loaded part starts from the cloud
    // STL (not a stale hidden STL / leftover preview).
    if (printSim && typeof printSim.setSolidPreview === "function") {
      printSim.setSolidPreview(false);
    }
    setPrintHideStl(false);
  if (!cloudStlObject) {
      if (getLoadedCloudLibraryFileName()) {
        setLoadedCloudLibraryFileName("");
      if (cloudFileLibraryEl) {
          renderCloudFileLibrary();
        }
        updateBottomNavState();
      }
      return;
    }

    if (cloudStlObject.parent) {
      cloudStlObject.parent.remove(cloudStlObject);
    }

    if (cloudStlObject.geometry) {
      cloudStlObject.geometry.dispose();
    }

    if (Array.isArray(cloudStlObject.material)) {
      for (const material of cloudStlObject.material) {
        disposeMaterialWithMaps(material);
      }
    } else {
      disposeMaterialWithMaps(cloudStlObject.material);
    }

    cloudStlObject = null;
    cloudStlBaseQuaternion.identity();

    if (getLoadedCloudLibraryFileName()) {
      setLoadedCloudLibraryFileName("");
    if (cloudFileLibraryEl) {
        renderCloudFileLibrary();
      }
      updateBottomNavState();
    }
  }

  function clearCloudPointObject() {
    if (!cloudPointObject) {
      cloudPointSpriteMaterial = null;
      setCloudPrintSimulationPlaying(false);
      setCloudPrintSimulationProgress(0);
      return;
    }

    if (cloudPointObject.parent) {
      cloudPointObject.parent.remove(cloudPointObject);
    }

    cloudPointObject.traverse((node) => {
      if (node.geometry && typeof node.geometry.dispose === "function") {
        node.geometry.dispose();
      }

      if (!node.material) {
        return;
      }

      if (Array.isArray(node.material)) {
        for (const material of node.material) {
          disposeMaterialWithMaps(material);
        }
        return;
      }

      disposeMaterialWithMaps(node.material);
    });

    cloudPointObject = null;
    cloudPointSpriteMaterial = null;
    setCloudPrintSimulationPlaying(false);
    setCloudPrintSimulationProgress(0);
  }

  function getCloudStlParentObject() {
    if (!getRobotRoot()) {
      return null;
    }

    return getRobotRoot().getObjectByName(`link:${CLOUD_STL_PARENT_LINK}`) || getRobotRoot();
  }

  function attachCloudStlToParent() {
    if (!cloudStlObject) {
      return;
    }

    const parentObject = getCloudStlParentObject();
    if (!parentObject) {
      if (!cloudStlObject.parent) {
        scene.add(cloudStlObject);
      }
      return;
    }

    parentObject.add(cloudStlObject);
  }

  function getCloudPointParentObject() {
    if (!getRobotRoot()) {
      return null;
    }

    return getRobotRoot().getObjectByName(`link:${CLOUD_POINT_PARENT_LINK}`) || getRobotRoot();
  }

  function attachCloudPointToParent() {
    if (!cloudPointObject) {
      return;
    }

    const parentObject = getCloudPointParentObject();
    if (!parentObject) {
      if (!cloudPointObject.parent) {
        scene.add(cloudPointObject);
      }
      return;
    }

    parentObject.add(cloudPointObject);
  }

  function alignCloudPointToCloudStlTransform() {
    if (!cloudPointObject || !cloudStlObject) {
      return;
    }

    const preservedPointScale = cloudPointObject.scale.clone();
    cloudStlObject.updateMatrixWorld(true);
    const pointParent = cloudPointObject.parent || scene;
    pointParent.updateMatrixWorld(true);

    const stlWorldMatrix = cloudStlObject.matrixWorld.clone();
    const parentInverse = new THREE.Matrix4().copy(pointParent.matrixWorld).invert();
    const localMatrix = new THREE.Matrix4().multiplyMatrices(parentInverse, stlWorldMatrix);

    const nextPosition = new THREE.Vector3();
    const nextQuaternion = new THREE.Quaternion();
    const nextScale = new THREE.Vector3();
    localMatrix.decompose(nextPosition, nextQuaternion, nextScale);

    cloudPointObject.position.copy(nextPosition);
    cloudPointObject.quaternion.copy(nextQuaternion);
    cloudPointObject.scale.copy(preservedPointScale);
    cloudPointObject.updateMatrixWorld(true);
  }

  function hasAncestorNamePrefix(node, rootObject, prefixes) {
    let cursor = node?.parent || null;
    while (cursor && cursor !== rootObject) {
      const name = String(cursor.name || "");
      if (prefixes.some((prefix) => name.startsWith(prefix))) {
        return true;
      }
      cursor = cursor.parent;
    }
    return false;
  }

  function computeCloudStlParentLocalBounds(parentObject) {
    if (!parentObject) {
      return null;
    }

    const parentName = String(parentObject.name || "");
    const parentIsLink = parentName.startsWith("link:");

    const filteredBounds = computeObjectLocalBounds(parentObject, {
      includeMeshPredicate: (meshNode, rootObject) => {
        const meshName = String(meshNode.name || "");
        if (meshName.startsWith("cloud-")) {
          return false;
        }

        if (!parentIsLink) {
          return true;
        }

        return !hasAncestorNamePrefix(meshNode, rootObject, ["joint_frame:", "motion_group:", "link:"]);
      },
    });

    if (filteredBounds && !filteredBounds.isEmpty()) {
      return filteredBounds;
    }

    return computeObjectLocalBounds(parentObject, {
      includeMeshPredicate: (meshNode) => {
        const meshName = String(meshNode.name || "");
        return !meshName.startsWith("cloud-");
      },
    });
  }

  function computeWorldBoundsFromLocalBounds(object3d, localBounds) {
    if (!object3d || !localBounds || localBounds.isEmpty()) {
      return null;
    }

    object3d.updateWorldMatrix(true, true);
    const localCorner = new THREE.Vector3();
    const worldCorner = new THREE.Vector3();
    const worldBounds = new THREE.Box3();
    worldBounds.makeEmpty();

    for (let cornerIndex = 0; cornerIndex < 8; cornerIndex += 1) {
      localCorner.set(
        (cornerIndex & 1) ? localBounds.max.x : localBounds.min.x,
        (cornerIndex & 2) ? localBounds.max.y : localBounds.min.y,
        (cornerIndex & 4) ? localBounds.max.z : localBounds.min.z,
      );
      worldCorner.copy(localCorner).applyMatrix4(object3d.matrixWorld);
      worldBounds.expandByPoint(worldCorner);
    }

    return worldBounds.isEmpty() ? null : worldBounds;
  }

  function placeCloudStlAboveParentMesh(parentObject, parentLocalBounds = null, options = {}) {
    if (!cloudStlObject || !parentObject || !cloudStlObject.geometry) {
      return;
    }

    const preservePlanarPosition = Boolean(options.preservePlanarPosition);

    if (!cloudStlObject.geometry.boundingBox) {
      cloudStlObject.geometry.computeBoundingBox();
    }

    const geometryBounds = cloudStlObject.geometry.boundingBox;
    if (!geometryBounds || geometryBounds.isEmpty()) {
      return;
    }

    const resolvedParentBounds = (parentLocalBounds && !parentLocalBounds.isEmpty())
      ? parentLocalBounds
      : computeCloudStlParentLocalBounds(parentObject);

    let parentWorldBounds = computeWorldBoundsFromLocalBounds(parentObject, resolvedParentBounds);
    if (!parentWorldBounds || parentWorldBounds.isEmpty()) {
      parentWorldBounds = new THREE.Box3().setFromObject(parentObject);
    }
    if (!parentWorldBounds || parentWorldBounds.isEmpty()) {
      return;
    }

    cloudStlObject.updateWorldMatrix(true, true);
    const stlWorldBounds = new THREE.Box3().setFromObject(cloudStlObject);
    if (stlWorldBounds.isEmpty()) {
      return;
    }

    const deltaWorld = new THREE.Vector3(0, 0, 0);
    if (!preservePlanarPosition) {
      const parentCenter = parentWorldBounds.getCenter(new THREE.Vector3());
      const stlCenter = stlWorldBounds.getCenter(new THREE.Vector3());
      deltaWorld.copy(parentCenter).sub(stlCenter);
    }
    const targetBottomWorldZ = parentWorldBounds.max.z + CLOUD_STL_TOP_CLEARANCE_M;
    const stlBottomWorldZ = stlWorldBounds.min.z;
    deltaWorld.z = targetBottomWorldZ - stlBottomWorldZ;

    if (cloudStlObject.parent) {
      const targetWorldPosition = cloudStlObject.getWorldPosition(new THREE.Vector3());
      targetWorldPosition.add(deltaWorld);
      cloudStlObject.parent.worldToLocal(targetWorldPosition);
      cloudStlObject.position.copy(targetWorldPosition);
    } else {
      cloudStlObject.position.add(deltaWorld);
    }

    cloudStlObject.updateMatrixWorld(true);
  }

  function syncCloudStlPlacementToXYJoints(deltaWorld, options = {}) {
    if (!deltaWorld || deltaWorld.lengthSq() <= 1e-12) {
      return null;
    }

    const ejeXState = getJointStateByName(EJE_X_JOINT);
    const ejeYState = getJointStateByName(EJE_Y_JOINT);
    if (!ejeXState || ejeXState.kind !== "linear" || !ejeYState || ejeYState.kind !== "linear") {
      return null;
    }

    const ejeXAxisWorld = getLinearJointWorldAxis(ejeXState);
    const ejeYAxisWorld = getLinearJointWorldAxis(ejeYState);
    if (!ejeXAxisWorld || !ejeYAxisWorld) {
      return null;
    }

    const xAxisDelta = deltaWorld.dot(ejeXAxisWorld);
    const yAxisDelta = deltaWorld.dot(ejeYAxisWorld);

    const baseXValue = Number.isFinite(options.baseXValue)
      ? Number(options.baseXValue)
      : ejeXState.value;
    const baseYValue = Number.isFinite(options.baseYValue)
      ? Number(options.baseYValue)
      : ejeYState.value;
    const currentXValue = ejeXState.value;
    const currentYValue = ejeYState.value;

    const targetXValue = clamp(baseXValue + xAxisDelta, ejeXState.lower, ejeXState.upper);
    const targetYValue = clamp(baseYValue + yAxisDelta, ejeYState.lower, ejeYState.upper);

    const appliedXDelta = targetXValue - currentXValue;
    const appliedYDelta = targetYValue - currentYValue;
    const moved = Math.abs(appliedXDelta) > 1e-9 || Math.abs(appliedYDelta) > 1e-9;
    if (!moved) {
      return {
        ejeXValue: targetXValue,
        ejeYValue: targetYValue,
      };
    }

    setJointValue(ejeXState, targetXValue);
    setJointValue(ejeYState, targetYValue);

    return {
      ejeXValue: targetXValue,
      ejeYValue: targetYValue,
    };
  }

  function relocateCloudStlToWorldXY(targetWorldX, targetWorldY, options = {}) {
    if (!cloudStlObject) {
      return false;
    }

    const updateStatus = options.updateStatus !== false;
    const syncAxes = options.syncAxes !== false;
    const externalAxisSyncResult = options.axisSyncResult || null;

    const parentObject = getCloudStlParentObject();
    if (!parentObject) {
      return false;
    }

    const parentLocalBounds = computeCloudStlParentLocalBounds(parentObject);
    let parentWorldBounds = computeWorldBoundsFromLocalBounds(parentObject, parentLocalBounds);
    if (!parentWorldBounds || parentWorldBounds.isEmpty()) {
      parentWorldBounds = new THREE.Box3().setFromObject(parentObject);
    }
    if (!parentWorldBounds || parentWorldBounds.isEmpty()) {
      return false;
    }

    cloudStlObject.updateWorldMatrix(true, true);
    const stlWorldBounds = new THREE.Box3().setFromObject(cloudStlObject);
    if (stlWorldBounds.isEmpty()) {
      return false;
    }

    const halfSizeX = Math.max((stlWorldBounds.max.x - stlWorldBounds.min.x) * 0.5, 0);
    const halfSizeY = Math.max((stlWorldBounds.max.y - stlWorldBounds.min.y) * 0.5, 0);

    const minX = parentWorldBounds.min.x + halfSizeX;
    const maxX = parentWorldBounds.max.x - halfSizeX;
    const minY = parentWorldBounds.min.y + halfSizeY;
    const maxY = parentWorldBounds.max.y - halfSizeY;

    const targetCenterX = clamp(targetWorldX, minX, maxX);
    const targetCenterY = clamp(targetWorldY, minY, maxY);

    const stlCenter = stlWorldBounds.getCenter(new THREE.Vector3());
    const deltaWorld = new THREE.Vector3(
      targetCenterX - stlCenter.x,
      targetCenterY - stlCenter.y,
      0,
    );

    const targetWorldPosition = cloudStlObject.getWorldPosition(new THREE.Vector3()).add(deltaWorld);
    if (cloudStlObject.parent) {
      cloudStlObject.parent.worldToLocal(targetWorldPosition);
    }
    cloudStlObject.position.copy(targetWorldPosition);

    const jointSyncResult = syncAxes ? syncCloudStlPlacementToXYJoints(deltaWorld) : null;
    const resolvedAxisSyncResult = externalAxisSyncResult || jointSyncResult;
    placeCloudStlAboveParentMesh(parentObject, parentLocalBounds, { preservePlanarPosition: true });
    alignCloudPointToCloudStlTransform();

    if (updateStatus) {
      const xMm = targetCenterX * 1000;
      const yMm = targetCenterY * 1000;
      if (resolvedAxisSyncResult) {
        const ejeXMm = resolvedAxisSyncResult.ejeXValue * 1000;
        const ejeYMm = resolvedAxisSyncResult.ejeYValue * 1000;
        setCloudStlStatus(
          `placed on print area (x ${xMm.toFixed(1)} mm, y ${yMm.toFixed(1)} mm), axis synced (eje_x ${ejeXMm.toFixed(1)} mm, eje_y ${ejeYMm.toFixed(1)} mm)`,
        );
      } else {
        setCloudStlStatus(`placed on print area (x ${xMm.toFixed(1)} mm, y ${yMm.toFixed(1)} mm)`);
      }
    }
    return true;
  }

  function tryRelocateCloudStlByDoubleClick(event) {
    if (cloudStlDragState) {
      return false;
    }

    return tryStartCloudStlDrag(event);
  }

  function getCloudStlWorldTopPoint() {
    if (!cloudStlObject) {
      return null;
    }

    cloudStlObject.updateWorldMatrix(true, true);
    const stlWorldBounds = new THREE.Box3().setFromObject(cloudStlObject);
    if (stlWorldBounds.isEmpty()) {
      return null;
    }

    return new THREE.Vector3(
      (stlWorldBounds.min.x + stlWorldBounds.max.x) * 0.5,
      (stlWorldBounds.min.y + stlWorldBounds.max.y) * 0.5,
      stlWorldBounds.max.z,
    );
  }

  function alignCloudStlUnderHeadViaXY(durationSeconds = CLOUD_STL_DROP_ALIGN_DURATION_SEC, extraWorldOffset = null) {
    if (!cloudStlObject || !getRobotRoot()) {
      return false;
    }

    const ejeXState = getJointStateByName(EJE_X_JOINT);
    const ejeYState = getJointStateByName(EJE_Y_JOINT);
    if (!ejeXState || ejeXState.kind !== "linear" || !ejeYState || ejeYState.kind !== "linear") {
      setCloudStlStatus("xy align unavailable (eje_x/eje_y joint missing)");
      return false;
    }

    const headLowestPoint = getHeadLowestWorldPoint();
    const stlTopPoint = getCloudStlWorldTopPoint();
    if (!headLowestPoint || !stlTopPoint) {
      setCloudStlStatus("xy align unavailable (head/STL bounds)");
      return false;
    }

    const ejeXAxisWorld = getLinearJointWorldAxis(ejeXState);
    const ejeYAxisWorld = getLinearJointWorldAxis(ejeYState);
    if (!ejeXAxisWorld || !ejeYAxisWorld) {
      setCloudStlStatus("xy align unavailable (eje_x/eje_y axis)");
      return false;
    }

    const deltaToHead = headLowestPoint.clone().sub(stlTopPoint);
    if (extraWorldOffset) {
      deltaToHead.add(extraWorldOffset);
    }
    const requiredXDelta = deltaToHead.dot(ejeXAxisWorld);
    const requiredYDelta = deltaToHead.dot(ejeYAxisWorld);

    const currentXValue = ejeXState.value;
    const currentYValue = ejeYState.value;
    const targetXValue = clamp(currentXValue + requiredXDelta, ejeXState.lower, ejeXState.upper);
    const targetYValue = clamp(currentYValue + requiredYDelta, ejeYState.lower, ejeYState.upper);

    const appliedXDeltaMm = (targetXValue - currentXValue) * 1000;
    const appliedYDeltaMm = (targetYValue - currentYValue) * 1000;

    moveJointToValue(ejeXState, targetXValue, durationSeconds);
    moveJointToValue(ejeYState, targetYValue, durationSeconds);

    setCloudStlStatus(
      `placed; aligning xy under head (eje_x ${appliedXDeltaMm.toFixed(1)} mm, eje_y ${appliedYDeltaMm.toFixed(1)} mm)`,
    );
    return true;
  }

  function applyCloudStlDisplayState() {
    if (!cloudStlObject) {
      return;
    }

    cloudStlObject.visible = getCloudStlVisible() && !getPrintHideStl();
    const materials = Array.isArray(cloudStlObject.material)
      ? cloudStlObject.material
      : [cloudStlObject.material];
    for (const material of materials) {
      if (!material) {
        continue;
      }

      material.transparent = getCloudStlOpacity() < 0.999;
      material.opacity = getCloudStlOpacity();
      material.needsUpdate = true;
    }
  }

  function applyCloudPointDisplayState() {
    if (!cloudPointObject) {
      return;
    }

    cloudPointObject.visible = getCloudStlVisible();

    const applyOpacity = (material) => {
      if (!material) {
        return;
      }

      if ("transparent" in material) {
        material.transparent = getCloudStlOpacity() < 0.999;
      }
      if ("opacity" in material) {
        material.opacity = getCloudStlOpacity();
      }
      material.needsUpdate = true;
    };

    if (cloudPointObject.material) {
      if (Array.isArray(cloudPointObject.material)) {
        for (const material of cloudPointObject.material) {
          applyOpacity(material);
        }
      } else {
        applyOpacity(cloudPointObject.material);
      }
    }

    cloudPointObject.traverse((node) => {
      if (!node.material) {
        return;
      }

      if (Array.isArray(node.material)) {
        for (const material of node.material) {
          applyOpacity(material);
        }
        return;
      }

      applyOpacity(node.material);
    });
  }

  function applyCloudOverlayDisplayState() {
    applyCloudStlDisplayState();
    applyCloudPointDisplayState();
  }

  function applyCloudPointSizeToActiveObject() {
    if (
      !cloudPointSpriteMaterial
      || !cloudPointSpriteMaterial.uniforms
      || !cloudPointSpriteMaterial.uniforms.uPointSize
    ) {
      return;
    }

    cloudPointSpriteMaterial.uniforms.uPointSize.value = getCloudPointSize();
    cloudPointSpriteMaterial.needsUpdate = true;
  }

  function buildCloudStlMaterial() {
    return new THREE.MeshStandardMaterial({
      color: 0x4ed0ff,
      roughness: 0.36,
      metalness: 0.08,
      emissive: 0x1a6788,
      emissiveIntensity: 0.22,
      transparent: getCloudStlOpacity() < 0.999,
      opacity: getCloudStlOpacity(),
      side: THREE.DoubleSide,
    });
  }

  function getCloudStlRawMaxDimensionMeters(geometry) {
    if (!geometry) {
      return null;
    }

    if (!geometry.boundingBox) {
      geometry.computeBoundingBox();
    }

    if (!geometry.boundingBox || geometry.boundingBox.isEmpty()) {
      return null;
    }

    const size = geometry.boundingBox.getSize(new THREE.Vector3());
    return Math.max(size.x, size.y, size.z);
  }

  function resolveCloudStlUnitScale(geometry) {
    const rawMaxDimension = getCloudStlRawMaxDimensionMeters(geometry);
    if (!Number.isFinite(rawMaxDimension) || rawMaxDimension <= 1e-8) {
      return {
        scale: 1,
        rawMaxDimension: null,
        scaledMaxDimension: null,
        assumedUnits: "unknown",
      };
    }

    if (rawMaxDimension <= CLOUD_STL_ASSUME_REAL_SCALE_MAX_DIM_M) {
      return {
        scale: 1,
        rawMaxDimension,
        scaledMaxDimension: rawMaxDimension,
        assumedUnits: "meters",
      };
    }

    let bestScale = CLOUD_STL_UNIT_SCALE_CANDIDATES[0];
    let bestScore = Number.POSITIVE_INFINITY;

    for (const candidateScale of CLOUD_STL_UNIT_SCALE_CANDIDATES) {
      const scaledMax = rawMaxDimension * candidateScale;
      const score = Math.abs(scaledMax - CLOUD_STL_UNIT_SCALE_TARGET_DIM_M);
      if (score < bestScore) {
        bestScore = score;
        bestScale = candidateScale;
      }
    }

    const assumedUnits = bestScale === 0.001
      ? "millimeters"
      : (bestScale === 0.01 ? "centimeters" : (bestScale === 0.0254 ? "inches" : "custom"));

    return {
      scale: bestScale,
      rawMaxDimension,
      scaledMaxDimension: rawMaxDimension * bestScale,
      assumedUnits,
    };
  }

  function resolveCloudAttributeRange(points, payloadRange) {
    if (payloadRange && Number.isFinite(payloadRange.min) && Number.isFinite(payloadRange.max)) {
      return {
        min: Number(payloadRange.min),
        max: Number(payloadRange.max),
      };
    }

    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const point of points) {
      const value = Number(point?.[3]);
      if (!Number.isFinite(value)) {
        continue;
      }
      min = Math.min(min, value);
      max = Math.max(max, value);
    }

    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return { min: 0, max: 1 };
    }

    if (Math.abs(max - min) <= 1e-9) {
      return { min, max: min + 1 };
    }

    return { min, max };
  }

  function clearCloudOverlays() {
    cloudStlLoadToken += 1;
    clearCloudStlObject();
    clearCloudPointObject();
  }

  async function loadCloudStlFromUrl(url, sourceLabel) {
    const currentLoadToken = ++cloudStlLoadToken;
    setCloudStlStatus(`loading ${sourceLabel}...`);

    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const buffer = await response.arrayBuffer();
      if (currentLoadToken !== cloudStlLoadToken) {
        return false;
      }

      const geometry = stlLoader.parse(buffer);
      geometry.computeBoundingBox();
      geometry.computeVertexNormals();
      const unitScaleInfo = resolveCloudStlUnitScale(geometry);

      clearCloudStlObject();
      cloudStlObject = new THREE.Mesh(geometry, buildCloudStlMaterial());
      cloudStlObject.name = "cloud-stl-overlay";
      cloudStlObject.castShadow = false;
      cloudStlObject.receiveShadow = false;
      cloudStlObject.frustumCulled = false;
      cloudStlObject.scale.setScalar(unitScaleInfo.scale);
      cloudStlBaseQuaternion.copy(cloudStlObject.quaternion);
      applyCloudStlSideRotation();
      cloudStlObject.updateMatrixWorld(true);

      const parentObject = getCloudStlParentObject();
      const parentLocalBounds = computeCloudStlParentLocalBounds(parentObject);
      attachCloudStlToParent();
      placeCloudStlAboveParentMesh(parentObject, parentLocalBounds);
      // Rest the part on the build plate and place it under the nozzle in BOTH
      // horizontal axes (eje_x + eje_y), WITHOUT dropping z to pin the part's top
      // to the head. When a bridged slice exists, honour the operator's placement
      // on the slicer plate so the preview matches the slicer; otherwise centre it.
      alignCloudStlUnderHeadViaXY(CLOUD_STL_DROP_ALIGN_DURATION_SEC, getSlicerPlacementWorldOffset());
      applyCloudStlDisplayState();
      alignCloudPointToCloudStlTransform();

      const scaleLabel = unitScaleInfo.scale === 1
        ? "1"
        : unitScaleInfo.scale.toFixed(4);
      console.info(`[Cloud STL] loaded from ${sourceLabel} (scale ${scaleLabel})`);
      if (Number.isFinite(unitScaleInfo.rawMaxDimension) && Number.isFinite(unitScaleInfo.scaledMaxDimension)) {
        console.info(
          "[Cloud STL] unit normalization",
          {
            source: sourceLabel,
            assumedUnits: unitScaleInfo.assumedUnits,
            scale: unitScaleInfo.scale,
            rawMaxDimensionMeters: unitScaleInfo.rawMaxDimension,
            scaledMaxDimensionMeters: unitScaleInfo.scaledMaxDimension,
          },
        );
      }

      return true;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown error";
      setCloudStlStatus(`error (${reason})`);
      return false;
    }
  }

  function buildCloudPointObject(payload, viewMode) {
    const sourcePoints = Array.isArray(payload?.points) ? payload.points : [];
    const rawPoints = sourcePoints
      .filter((point) => {
        if (!Array.isArray(point)) {
          return false;
        }

        return Number.isFinite(Number(point[0]))
          && Number.isFinite(Number(point[1]))
          && Number.isFinite(Number(point[2]));
      })
      .slice();

    if (!rawPoints.length) {
      throw new Error("no points returned for selected dataset");
    }

    const simAxis = resolveCloudPrintSimAxis(getCloudPrintSimAxis());
    const simDirection = resolveCloudPrintSimDirection(getCloudPrintSimDirection());
    const simAxisIndex = getCloudPrintSimAxisIndex(simAxis);
    const simLayerStepMm = getCloudPrintSimLayerStepMm(simAxis);

    let axisMin = Number.POSITIVE_INFINITY;
    let axisMax = Number.NEGATIVE_INFINITY;
    for (const point of rawPoints) {
      const axisValue = Number(point[simAxisIndex]);
      axisMin = Math.min(axisMin, axisValue);
      axisMax = Math.max(axisMax, axisValue);
    }

    const safeAxisMin = Number.isFinite(axisMin) ? axisMin : 0;
    const safeAxisMax = Number.isFinite(axisMax) ? axisMax : safeAxisMin;
    const axisSpan = Math.max(safeAxisMax - safeAxisMin, 0);
    const totalLayers = Math.max(1, Math.ceil(axisSpan / simLayerStepMm) + 1);

    const simulationEntries = rawPoints.map((point) => {
      const axisValue = Number(point[simAxisIndex]);
      const normalizedAxisDistance = simDirection === "negative"
        ? (safeAxisMax - axisValue)
        : (axisValue - safeAxisMin);
      const layerIndex = Math.max(0, Math.floor(normalizedAxisDistance / simLayerStepMm));
      return {
        point,
        axisValue,
        layerIndex,
      };
    });

    simulationEntries.sort((a, b) => {
      const layerDelta = a.layerIndex - b.layerIndex;
      if (layerDelta !== 0) {
        return layerDelta;
      }

      return simDirection === "negative"
        ? (b.axisValue - a.axisValue)
        : (a.axisValue - b.axisValue);
    });

    const points = simulationEntries.map((entry) => entry.point);

    if (!points.length) {
      throw new Error("no points returned for selected dataset");
    }

    const pointOffset = Array.isArray(payload?.center) && payload.center.length >= 2
      ? [Number(payload.center[0]) || 0, Number(payload.center[1]) || 0]
      : [0, 0];

    const attributeRange = resolveCloudAttributeRange(points, payload?.attributeRange);
    const layerIndices = new Float32Array(points.length);
    for (let i = 0; i < points.length; i += 1) {
      layerIndices[i] = simulationEntries[i].layerIndex;
    }

    const layerSimMeta = {
      pointCount: points.length,
      axisKey: simAxis,
      axisDirection: simDirection,
      axisMin: safeAxisMin,
      axisMax: safeAxisMax,
      layerStepMm: simLayerStepMm,
      layerIndices,
      totalLayers,
    };

    if (viewMode === "voxel") {
      const voxelObject = buildVoxelCubeObject(
        points,
        attributeRange,
        Number(payload?.voxelSizeMm) || getCloudPointVoxelSizeMm(),
        Number(payload?.voxelSizeZMm) || getCloudPointVoxelSizeZMm(),
        0,
        pointOffset,
        0x36322e,
      );

      return {
        object: voxelObject,
        spriteMaterial: null,
        renderedCount: points.length,
        layerSimMeta,
      };
    }

    const spriteResult = buildSpriteObject(
      points,
      attributeRange,
      pointOffset,
      getCloudPointSize(),
      CLOUD_POINT_OUTLINE_COLOR,
      CLOUD_POINT_OUTLINE_START,
    );

    return {
      object: spriteResult.object,
      spriteMaterial: spriteResult.material,
      renderedCount: points.length,
      layerSimMeta,
    };
  }

  async function loadCloudPointFromDataset(viewMode = "point") {
    const resolvedMode = resolveCloudViewMode(viewMode) === "voxel" ? "voxel" : "point";
    const datasetName = getCloudDatasetName();

    setCloudStlStatus(`loading ${resolvedMode} cloud from ${datasetName}...`);

    try {
      const requested = {
        apiView: resolvedMode,
        voxelSizeMm: getCloudPointVoxelSizeMm(),
        voxelSizeZMm: getCloudPointVoxelSizeZMm(),
        maxPoints: getCloudPointMaxPoints(),
      };

      const payload = await fetchSensorData(requested, {
        dataset: datasetName,
        attribute: "loadCell",
      });

      const built = buildCloudPointObject(payload, resolvedMode);
      clearCloudPointObject();
      cloudPointObject = built.object;
      cloudPointSpriteMaterial = built.spriteMaterial;
      cloudPointObject.userData = {
        ...(cloudPointObject.userData || {}),
        datasetName,
        pointViewMode: resolvedMode,
        layerSimMeta: built.layerSimMeta || null,
      };

      cloudPointObject.name = resolvedMode === "voxel" ? "cloud-voxel-overlay" : "cloud-point-overlay";
      cloudPointObject.scale.setScalar(CLOUD_POINT_WORLD_SCALE);
      cloudPointObject.traverse((node) => {
        if ("castShadow" in node) {
          node.castShadow = false;
        }
        if ("receiveShadow" in node) {
          node.receiveShadow = false;
        }
        if ("frustumCulled" in node) {
          node.frustumCulled = false;
        }
      });

      attachCloudPointToParent();
      if (cloudStlObject) {
        alignCloudPointToCloudStlTransform();
      } else {
        applyCloudPointStandaloneSideRotation();
      }
      applyCloudPointDisplayState();
      initializeCloudPrintSimulationForLoadedCloud();

      const label = resolvedMode === "voxel" ? "voxel cloud" : "point cloud";
      setCloudStlStatus(`loaded ${label} (${built.renderedCount.toLocaleString()} points)`);
      return true;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown error";
      setCloudStlStatus(`error loading cloud (${reason})`);
      return false;
    }
  }

  async function loadCloudOverlayFromDataset() {
    // Loading cloud data should not trigger or continue palpador automation.
    clearPendingFrontDoorSequence();

    const mode = resolveCloudViewMode(getCloudViewMode());
    const shouldLoadStl = mode === "stl" || mode === "both";
    const shouldLoadPoint = mode === "point" || mode === "voxel" || mode === "both";

    if (!shouldLoadStl) {
      clearCloudStlObject();
    }
    if (!shouldLoadPoint) {
      clearCloudPointObject();
    }

    let stlSuccess = true;
    let pointSuccess = true;

    if (shouldLoadStl) {
      stlSuccess = await loadCloudStlFromDataset();
      if (stlSuccess && getLoadedCloudLibraryFileName()) {
        setLoadedCloudLibraryFileName("");
      if (cloudFileLibraryEl) {
          renderCloudFileLibrary();
        }
        updateBottomNavState();
      }
    }

    if (shouldLoadPoint) {
      const pointMode = mode === "voxel" ? "voxel" : "point";
      pointSuccess = await loadCloudPointFromDataset(pointMode);

      if (!pointSuccess && pointMode === "voxel") {
        const fallbackPointSuccess = await loadCloudPointFromDataset("point");
        if (fallbackPointSuccess) {
          pointSuccess = true;
          setCloudViewMode("point");
        if (cloudViewModeEl) {
            cloudViewModeEl.value = getCloudViewMode();
          }
          updateCloudControlVisibility();
          setCloudStlStatus("voxel unavailable; loaded point cloud");
        }
      }
    }

    if (mode === "both") {
      if (stlSuccess && pointSuccess) {
        setCloudStlStatus("loaded stl + point cloud");
      } else if (!stlSuccess && !pointSuccess) {
        setCloudStlStatus("failed to load stl and point cloud");
      } else if (!stlSuccess) {
        setCloudStlStatus("point cloud loaded; stl failed");
      } else {
        setCloudStlStatus("stl loaded; point cloud failed");
      }
    }

    return stlSuccess && pointSuccess;
  }

  async function autoPreparePrintSimulationForSelection() {
    // Never run a background slice while a docked print is starting/active — its
    // prepare() would race and could stomp the live print's toolpath source.
    if (!printSim || getPrintSimAutoRunInProgress() || getIsDockedPrintActive()) {
      return;
    }
    if (!cloudStlObject || !hasLoadedCloudFileForPrint()) {
      return;
    }

    // Capture the flag now (before any await) so only the choose-flow drives the
    // menu adaptation, and clear it once consumed.
    const isAutoFlow = getAutoSliceFlowActive();
    setAutoSliceFlowActive(false);
  const fileName = getSelectedCloudLibraryFileName();

    setPrintSimAutoRunInProgress(true);
  try {
      const ready = await printSim.prepare();
      // "ready" (→ the row's "Start print" button) must mean a REAL sliced toolpath,
      // not prepare()'s clip-reveal fallback (which also returns true but has no
      // toolpath — the part isn't actually sliced). Require a toolpath source.
      const hasRealToolpath =
        typeof printSim.getSource === "function" && printSim.getSource() === "toolpath";
      if (isAutoFlow) {
        // Only badge the row. Revealing the part is deferred to "Load to viewer",
        // so the warmed slice does not collapse the Files list behind the slicer.
        setCloudFileRowSliceStatus(fileName, (ready && hasRealToolpath) ? "ready" : "");
      }
      // Reflect the slicer's orientation/placement in the main model when a real
      // toolpath is prepared (shows the placed slicer solid; else keeps cloud STL).
      updateSlicerModelPreview();
    } catch (error) {
      console.warn("[printSim] auto slice failed:", error?.message || error);
      if (isAutoFlow) {
        setCloudFileRowSliceStatus(fileName, "");
      }
    } finally {
      setPrintSimAutoRunInProgress(false);
    updateBottomNavState();
    }
  }

  async function loadCloudOverlayFromSelectedFile() {
    // Keep palpador static during file loading workflows.
    clearPendingFrontDoorSequence();

    let mode = resolveCloudViewMode(getCloudViewMode());
    if (mode === "point" || mode === "voxel") {
      setCloudViewMode("stl");
    if (cloudViewModeEl) {
        cloudViewModeEl.value = getCloudViewMode();
      }
      updateCloudControlVisibility();
      mode = "stl";
    }

    const stlSuccess = await loadCloudStlFromSelectedFile();

    if (stlSuccess) {
      // Choosing an STL auto-preloads it into the slicer (real-slicer toolpath at
      // the model's scene position). Play stays manual — the bottom Play button
      // appears once slicing completes (see updateBottomNavState).
      autoPreparePrintSimulationForSelection();
    }

    if (mode !== "both") {
      return stlSuccess;
    }

    const pointSuccess = await loadCloudPointFromDataset("point");
    if (stlSuccess && pointSuccess) {
      setCloudStlStatus("loaded stl + point cloud");
    } else if (!pointSuccess) {
      setCloudStlStatus("stl loaded; point cloud failed");
    }

    return stlSuccess && pointSuccess;
  }

  async function ensureCloudPointPrintMode() {
    syncCloudDatasetFromSelectedStl();

    setCloudViewMode("point");
  if (cloudViewModeEl) {
      cloudViewModeEl.value = getCloudViewMode();
    }
    updateCloudControlVisibility();

    const datasetName = getCloudDatasetName();
    const layerMeta = getCloudPointLayerSimulationMeta();
    const loadedDatasetName = String(cloudPointObject?.userData?.datasetName || "").trim();
    const loadedPointMode = String(cloudPointObject?.userData?.pointViewMode || "").trim().toLowerCase();
    const shouldReloadPointCloud = !layerMeta
      || loadedDatasetName !== datasetName
      || loadedPointMode !== "point";

    if (shouldReloadPointCloud) {
      const pointLoaded = await loadCloudPointFromDataset("point");
      if (!pointLoaded) {
        return false;
      }
    }

    // Printing simulation is point-only; STL is removed once point cloud is aligned.
    clearCloudStlObject();
    applyCloudPointDisplayState();
    setCloudStlStatus(`point print mode (${datasetName})`);
    return Boolean(getCloudPointLayerSimulationMeta());
  }

  async function refreshGlobalStlFiles(options = {}) {
    if (!cloudStlFileSelectEl) {
      return;
    }

    const source = resolveCloudFileSourceFilter(options.source ?? getCloudFileSourceFilter());
    setCloudFileSourceFilter(source);
  updateCloudSourceFilterButtons();
    const previousSelection = getSelectedCloudLibraryFileName() || String(cloudStlFileSelectEl.value || "").trim();

    if (cloudFileLibraryEl) {
      setCloudLibraryMessage("Loading files...");
    }

    cloudStlFileSelectEl.textContent = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Loading...";
    cloudStlFileSelectEl.appendChild(placeholder);

    try {
      const entries = await fetchCloudLibraryEntriesForSource(source);
      setCloudFileLibraryEntries(entries);
    cloudStlFileSelectEl.textContent = "";
      if (!entries.length) {
        const emptyOption = document.createElement("option");
        emptyOption.value = "";
        emptyOption.textContent = "No STL files";
        cloudStlFileSelectEl.appendChild(emptyOption);
        setSelectedCloudLibraryFileName("");
      refreshSelectedPrintJobUsage();
        renderCloudFileLibrary();
        updateCloudPrintSimulationControls();
        return;
      }

      const uniqueNames = Array.from(new Set(entries.map((entry) => entry.name)));
      for (const fileName of uniqueNames) {
        const option = document.createElement("option");
        option.value = fileName;
        option.textContent = fileName;
        cloudStlFileSelectEl.appendChild(option);
      }

      const selectedFile = (previousSelection && uniqueNames.includes(previousSelection))
        ? previousSelection
        : uniqueNames[0];

      setSelectedCloudLibraryFile(selectedFile, {
        updateSelect: true,
        syncDataset: true,
      });
    } catch (error) {
      setCloudFileLibraryEntries([]);
    cloudStlFileSelectEl.textContent = "";

      const failedOption = document.createElement("option");
      failedOption.value = "";
      failedOption.textContent = "Unavailable";
      cloudStlFileSelectEl.appendChild(failedOption);

      setSelectedCloudLibraryFileName("");
    refreshSelectedPrintJobUsage();
      setCloudLibraryMessage("Source unavailable");

      const reason = error instanceof Error ? error.message : "unknown error";
      setCloudStlStatus(`file list error (${reason})`);
      updateCloudPrintSimulationControls();
    }
  }

  async function loadCloudStlFromDataset() {
    const datasetName = getCloudDatasetName();
    const params = new URLSearchParams();
    if (datasetName) {
      params.set("dataset", datasetName);
    }

    const suffix = params.toString();
    const url = suffix
      ? `${CLOUD_STL_DATASET_API_URL}?${suffix}`
      : CLOUD_STL_DATASET_API_URL;
    const sourceLabel = datasetName ? `dataset ${datasetName}` : "default dataset";
    return loadCloudStlFromUrl(url, sourceLabel);
  }

  async function loadCloudStlFromSelectedFile() {
    if (!cloudStlFileSelectEl) {
      return;
    }

    const selectedFile = (cloudStlFileSelectEl.value || "").trim();
    if (!selectedFile) {
      setCloudStlStatus("select a global STL file first");
      return false;
    }

    syncCloudDatasetFromSelectedStl();

    const params = new URLSearchParams({ name: selectedFile });
    const url = `${CLOUD_STL_FILE_API_URL}?${params.toString()}`;
    const loaded = await loadCloudStlFromUrl(url, selectedFile);
    if (loaded) {
      setLoadedCloudLibraryFileName(selectedFile);
    if (cloudFileLibraryEl) {
        renderCloudFileLibrary();
      }
      updateBottomNavState();
    }
    return loaded;
  }

  async function reloadCloudPointForSimulationAxisUpdate() {
    if (!cloudPointObject) {
      return;
    }

    const pointViewMode = String(cloudPointObject?.userData?.pointViewMode || "").toLowerCase() === "voxel"
      ? "voxel"
      : "point";

    const wasPlaying = getCloudPrintSimPlaying();
    const previousProgress = getCloudPrintSimProgress();
    setCloudPrintSimulationPlaying(false);

    const loaded = await loadCloudPointFromDataset(pointViewMode);
    if (!loaded) {
      return;
    }

    setCloudPrintSimulationProgress(previousProgress, { syncUi: true });
    if (wasPlaying) {
      setCloudPrintSimulationPlaying(true);
    }
  }

  return {
    resolveCloudStlPlacementSide,
    getCloudStlPlacementConfig,
    applyCloudStlSideRotation,
    applyCloudPointStandaloneSideRotation,
    updateCloudStlDrag,
    tryPlaceCloudStlDrag,
    stopCloudStlDrag,
    clearCloudStlObject,
    clearCloudPointObject,
    getCloudStlParentObject,
    attachCloudStlToParent,
    attachCloudPointToParent,
    alignCloudPointToCloudStlTransform,
    computeCloudStlParentLocalBounds,
    placeCloudStlAboveParentMesh,
    tryRelocateCloudStlByDoubleClick,
    alignCloudStlUnderHeadViaXY,
    applyCloudStlDisplayState,
    applyCloudPointDisplayState,
    applyCloudOverlayDisplayState,
    applyCloudPointSizeToActiveObject,
    resolveCloudStlUnitScale,
    clearCloudOverlays,
    loadCloudOverlayFromDataset,
    autoPreparePrintSimulationForSelection,
    loadCloudOverlayFromSelectedFile,
    ensureCloudPointPrintMode,
    refreshGlobalStlFiles,
    reloadCloudPointForSimulationAxisUpdate,
    getCloudStlObject,
    getCloudPointObject,
    getCloudStlDragState,
  };
}
