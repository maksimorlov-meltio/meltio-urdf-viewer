// Print-simulation controller + renderer.
//
// Renders a layer-by-layer build-up of the model selected in the existing Files
// workflow, INSIDE the existing urdf_viewer Three.js scene. It never creates a
// second canvas and never touches the camera.
//
// Two sources, one progress model:
//   A) Clip-plane reveal (default, no backend): a moving Z clipping plane reveals
//      the already-loaded STL mesh bottom-up. Robust, cheap, always available.
//   B) Toolpath reveal (optional): when a slicer backend is configured, real
//      deposition moves are drawn as LineSegments revealed via setDrawRange.
//
// The host injects everything it needs through `context` so this module stays
// decoupled and reuses the host's existing model loading/placement instead of
// duplicating it.

import { createSimStateMachine, SimState } from "./simState.js";
import { buildLineSegmentBuffers, segmentsVisibleForProgress } from "../toolpath/toolpathModel.js";
import { buildTubeBuffers, INDICES_PER_SEGMENT } from "../toolpath/toolpathTubes.js";

const DEFAULT_CLIENT_LAYER_COUNT = 120; // synthetic layers for the clip-plane reveal
const DEFAULT_SPEED_LAYERS_PER_SEC = 8;
// Slicer geometry is in millimetres; the scene is in metres. Used both to build
// the toolpath buffers and to place the slicer's plate centre in the scene.
const TOOLPATH_UNIT_SCALE = 0.001;

export function createPrintSimulation(context) {
  const {
    THREE,
    renderer,
    getStlObject,        // () => THREE.Mesh | null (host's loaded selected model)
    ensureModelLoaded,   // async () => boolean (loads the selected file via Files workflow)
    getSelectedModelName, // () => string
    getParentObject,     // () => THREE.Object3D | null (eje_y_link group)
    slicerClient,        // { isEnabled(), sliceByName() }
    onStatus,            // (text) => void
    onStateChange,       // (state, prev) => void
    getNozzleTipWorldZ,  // () => number | null (fixed head lowest world Z; pins the reveal)
    getNozzleTipWorld,   // () => THREE.Vector3 | null (full nozzle-tip world point for XY placement)
    onProgress,          // (progress) => void (host moves the bed so the print top meets the tip)
    getSlicerToolpath,   // () => payload | null (toolpath pushed up from the embedded slicer)
    getSlicerPlate,      // () => {centerXmm, centerYmm} | null (slicer build-plate centring point, mm)
    cadToViewerRotationX, // number (radians) the host rotates CAD +X to go Y-up -> Z-up
    getSlicerSpeedMmPerSec, // () => number | null (real deposition speed for true-1x playback)
    getSlicerMesh,        // () => {positions, indices} | null (solid model for STL view)
    getSlicerThermal,     // () => {segments:[{points,score,layer}]} | null (Thermal view)
  } = context;

  const state = createSimStateMachine((next, prev, detail) => {
    if (typeof onStateChange === "function") {
      onStateChange(next, prev, detail);
    }
  });

  // Shared progress model.
  let progress = 0; // 0..1
  let playing = false;
  let speedLayersPerSec = DEFAULT_SPEED_LAYERS_PER_SEC;
  // Real-speed playback: seconds the whole print takes at 1x (path length / real
  // deposition speed), scaled by a user multiplier. Null → fall back to the
  // layers/sec pacing (clip source, or no speed from the slicer).
  let printSecondsAt1x = null;
  let speedMultiplier = 0.5;
  let totalLayers = DEFAULT_CLIENT_LAYER_COUNT;
  let source = null; // "clip" | "toolpath"

  // Source A (clip plane) state.
  let clipPlane = null;
  let clipMaterials = [];
  let clipMinZ = 0;
  let clipMaxZ = 1;
  let previousLocalClipping = renderer ? renderer.localClippingEnabled : false;
  // When the host reports a fixed nozzle-tip world Z, the reveal plane is PINNED
  // there (world space) and stays put: the host lowers the bed so the part
  // descends through it, giving a bottom-up reveal at the real nozzle. Null keeps
  // the legacy behaviour where the plane itself sweeps up through a static part.
  let clipPinnedZ = null;

  // Source B (toolpath) state.
  let toolpathObject = null;
  let toolpathBuffers = null;
  let currentDrawVertexCount = 0; // vertices revealed so far (last = deposition point)
  // Tube (bead) render of the same toolpath, revealed in lock-step with the line
  // render. Render style picks which is shown: "line" | "tube" | "layer".
  let toolpathTubeObject = null;
  let toolpathTubeBuffers = null;
  let toolpathStyle = "tube"; // default matches the slicer's Tubes preview
  let isolatedLayer = null;   // layer index to isolate ("layer" style), or null
  // View modes: the sliced part can be shown as the kind-coloured toolpath, a
  // heat-coloured thermal toolpath, or the solid STL mesh. All share the
  // toolpath's placement; only one is visible at a time. "toolpath" | "thermal" | "stl".
  let viewMode = "toolpath";
  let thermalObject = null;
  let thermalBuffers = null;
  let stlMeshObject = null;

  // Heat score (0..1) -> colour (blue cold -> red hot), matching the slicer.
  function heatColor(score, out) {
    const c = out || new THREE.Color();
    const s = Math.max(0, Math.min(1, Number(score) || 0));
    return c.setHSL((1 - s) * 0.66, 0.9, 0.5);
  }

  // Line-segment buffers from thermal segments (each carries its own points +
  // one heat score), mirroring buildLineSegmentBuffers but colouring by heat.
  function buildThermalBuffers(thermalPayload) {
    const segments = Array.isArray(thermalPayload?.segments) ? thermalPayload.segments : [];
    let total = 0;
    let maxLayer = 0;
    for (const s of segments) {
      const n = Math.floor((s?.points?.length || 0) / 3);
      total += Math.max(0, n - 1);
      const layer = Number.isFinite(s?.layer) ? s.layer : 0;
      if (layer > maxLayer) maxLayer = layer;
    }
    if (total <= 0) return null;
    const positions = new Float32Array(total * 6);
    const colors = new Float32Array(total * 6);
    const segmentLayer = new Int32Array(total);
    const col = new THREE.Color();
    let seg = 0;
    for (const s of segments) {
      const pts = s?.points;
      if (!Array.isArray(pts) || pts.length < 6) continue;
      heatColor(s.score, col);
      const layer = Number.isFinite(s?.layer) ? s.layer : 0;
      const n = Math.floor(pts.length / 3);
      for (let i = 0; i < n - 1; i += 1) {
        const a = i * 3;
        const c = (i + 1) * 3;
        const o = seg * 6;
        positions[o] = pts[a] * TOOLPATH_UNIT_SCALE;
        positions[o + 1] = pts[a + 1] * TOOLPATH_UNIT_SCALE;
        positions[o + 2] = pts[a + 2] * TOOLPATH_UNIT_SCALE;
        positions[o + 3] = pts[c] * TOOLPATH_UNIT_SCALE;
        positions[o + 4] = pts[c + 1] * TOOLPATH_UNIT_SCALE;
        positions[o + 5] = pts[c + 2] * TOOLPATH_UNIT_SCALE;
        colors[o] = col.r; colors[o + 1] = col.g; colors[o + 2] = col.b;
        colors[o + 3] = col.r; colors[o + 4] = col.g; colors[o + 5] = col.b;
        segmentLayer[seg] = layer;
        seg += 1;
      }
    }
    const layerCount = Math.max(1, maxLayer + 1);
    const layerStartSegment = new Int32Array(layerCount);
    let cursor = 0;
    for (let layer = 0; layer < layerCount; layer += 1) {
      layerStartSegment[layer] = cursor;
      while (cursor < total && segmentLayer[cursor] === layer) cursor += 1;
    }
    return { positions, colors, segmentLayer, layerStartSegment, totalSegments: total, layerCount };
  }

  function setStatus(text) {
    if (typeof onStatus === "function") {
      onStatus(text);
    }
  }

  function materialsOf(object3d) {
    if (!object3d || !object3d.material) {
      return [];
    }
    return Array.isArray(object3d.material) ? object3d.material : [object3d.material];
  }

  // ---- Source A: clip-plane reveal of the host STL mesh -------------------

  function setupClipSource(stlObject) {
    teardownToolpathSource();

    const box = new THREE.Box3().setFromObject(stlObject);
    if (box.isEmpty()) {
      return false;
    }
    clipMinZ = box.min.z;
    clipMaxZ = box.max.z;

    // Clip fragments above the reveal height: normal (0,0,-1), constant = revealZ
    // keeps z <= revealZ. World-space plane (default for material.clippingPlanes).
    clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), clipMaxZ);

    // Nozzle-pinned mode: keep the plane fixed at the head's lowest world Z. The
    // host then lowers the bed as progress advances so the part sinks through the
    // plane — the visible top always sits exactly at the (stationary) nozzle.
    const tipZ = typeof getNozzleTipWorldZ === "function" ? Number(getNozzleTipWorldZ()) : NaN;
    if (Number.isFinite(tipZ)) {
      clipPlane.constant = tipZ;
      clipPinnedZ = tipZ;
    } else {
      clipPinnedZ = null;
    }

    clipMaterials = materialsOf(stlObject);
    for (const material of clipMaterials) {
      material.clippingPlanes = [clipPlane];
      material.clipShadows = true;
      material.needsUpdate = true;
    }

    if (renderer) {
      previousLocalClipping = renderer.localClippingEnabled;
      renderer.localClippingEnabled = true;
    }

    // A height-derived synthetic layer count keeps the "layers/sec" speed
    // meaningful even without real slice data.
    const heightM = Math.max(clipMaxZ - clipMinZ, 1e-4);
    totalLayers = Math.max(8, Math.round(heightM / 0.0015)); // ~1.5mm visual layers
    source = "clip";
    return true;
  }

  function teardownClipSource() {
    for (const material of clipMaterials) {
      if (material) {
        material.clippingPlanes = [];
        material.needsUpdate = true;
      }
    }
    clipMaterials = [];
    clipPlane = null;
    clipPinnedZ = null;
    if (renderer) {
      renderer.localClippingEnabled = previousLocalClipping;
    }
  }

  // ---- Source B: toolpath LineSegments reveal -----------------------------

  function setupToolpathSource(payload, stlObject) {
    teardownClipSource();
    teardownToolpathSource();

    toolpathBuffers = buildLineSegmentBuffers(payload, { unitScale: TOOLPATH_UNIT_SCALE });
    if (toolpathBuffers.totalSegments <= 0) {
      return false;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(toolpathBuffers.positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(toolpathBuffers.colors, 3));
    geometry.setDrawRange(0, 0);

    const material = new THREE.LineBasicMaterial({ vertexColors: true });
    toolpathObject = new THREE.LineSegments(geometry, material);
    toolpathObject.name = "print-sim-toolpath";
    toolpathObject.frustumCulled = false;

    const parent = (typeof getParentObject === "function" && getParentObject()) || null;
    if (parent) {
      parent.add(toolpathObject);
    }

    // Orientation: the slicer toolpath is Z-up (build axis = +Z), but it is
    // parented into the host's Y-up-authored frame (the robot is rotated +X by
    // cadToViewerRotationX to present Z-up in world). Apply the inverse so the
    // build axis stands vertical instead of lying along world -Y. Set before the
    // placement below so the bounding boxes and plate-centre mapping see it.
    if (Number.isFinite(cadToViewerRotationX)) {
      toolpathObject.rotation.x = -cadToViewerRotationX;
      toolpathObject.updateMatrixWorld(true);
    }

    // Placement. Z: sit the toolpath bottom at the STL bottom (which already
    // carries the plate clearance) — unchanged. XY: map the slicer's build-plate
    // centre onto the fixed nozzle tip, so a model centred on the plate prints
    // under the nozzle and any offset the user gave it on the plate is preserved.
    // Falls back to STL-centre matching when the plate centre / nozzle is absent.
    if (stlObject) {
      stlObject.updateWorldMatrix(true, true);
      const stlBox = new THREE.Box3().setFromObject(stlObject);
      toolpathObject.updateWorldMatrix(true, true);
      const tpBox = new THREE.Box3().setFromObject(toolpathObject);
      if (!stlBox.isEmpty() && !tpBox.isEmpty()) {
        const parent = toolpathObject.parent;
        const targetWorld = toolpathObject.getWorldPosition(new THREE.Vector3());

        // Z: keep the existing STL-bottom match (8mm plate clearance included).
        targetWorld.z += stlBox.min.z - tpBox.min.z;

        const nozzle = typeof getNozzleTipWorld === "function" ? getNozzleTipWorld() : null;
        const plate = typeof getSlicerPlate === "function" ? getSlicerPlate() : null;
        const havePlateMapping =
          nozzle &&
          plate &&
          Number.isFinite(plate.centerXmm) &&
          Number.isFinite(plate.centerYmm);

        if (havePlateMapping) {
          // World position of the plate-centre point in the toolpath geometry
          // (mm → m, in the object's own frame), then shift XY so it lands under
          // the nozzle. Orientation-robust: the shift is a pure world translation.
          const plateCenterWorld = new THREE.Vector3(
            plate.centerXmm * TOOLPATH_UNIT_SCALE,
            plate.centerYmm * TOOLPATH_UNIT_SCALE,
            0,
          ).applyMatrix4(toolpathObject.matrixWorld);
          targetWorld.x += nozzle.x - plateCenterWorld.x;
          targetWorld.y += nozzle.y - plateCenterWorld.y;
        } else {
          // Fallback: original STL-centre matching in XY.
          const stlCenter = stlBox.getCenter(new THREE.Vector3());
          const tpCenter = tpBox.getCenter(new THREE.Vector3());
          targetWorld.x += stlCenter.x - tpCenter.x;
          targetWorld.y += stlCenter.y - tpCenter.y;
        }

        if (parent) {
          parent.worldToLocal(targetWorld);
        }
        toolpathObject.position.copy(targetWorld);
        toolpathObject.updateMatrixWorld(true);
      }
    }

    totalLayers = Math.max(1, toolpathBuffers.layerCount);
    // True-1x playback duration: total path length / real deposition speed. The
    // update loop advances progress over this many seconds at 1x.
    const speedMmPerSec =
      typeof getSlicerSpeedMmPerSec === "function" ? Number(getSlicerSpeedMmPerSec()) : NaN;
    const pathLengthMm = Number(toolpathBuffers.pathLengthMm);
    printSecondsAt1x =
      Number.isFinite(speedMmPerSec) && speedMmPerSec > 0 && Number.isFinite(pathLengthMm) && pathLengthMm > 0
        ? pathLengthMm / speedMmPerSec
        : null;

    // Build the bead (tube) render of the SAME toolpath, sharing the line render's
    // placement + segment order so the Lines/Tubes toggle switches without any
    // re-registration and both reveal in lock-step.
    buildTubeObject(payload);

    // Build the alternate views (thermal lines, solid STL) sharing the toolpath's
    // placement so the view toggle can switch between them mid-print.
    buildAuxViewObjects();
    applyViewVisibility();

    source = "toolpath";
    return true;
  }

  function buildTubeObject(payload) {
    toolpathTubeBuffers = buildTubeBuffers(toolpathBuffers, {
      beadWidthMm: payload && payload.stats ? payload.stats.beadWidthMm : undefined,
      layerHeightMm: payload && payload.stats ? payload.stats.layerHeightMm : undefined,
      unitScale: TOOLPATH_UNIT_SCALE,
    });
    if (!toolpathTubeBuffers || !toolpathObject) {
      return;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(toolpathTubeBuffers.positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(toolpathTubeBuffers.normals, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(toolpathTubeBuffers.colors, 3));
    geometry.setIndex(new THREE.BufferAttribute(toolpathTubeBuffers.indices, 1));
    geometry.setDrawRange(0, 0);
    toolpathTubeObject = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.14 }),
    );
    toolpathTubeObject.name = "print-sim-toolpath-tube";
    toolpathTubeObject.frustumCulled = false;
    toolpathTubeObject.visible = false;
    const parent = toolpathObject.parent;
    if (parent) parent.add(toolpathTubeObject);
    toolpathTubeObject.position.copy(toolpathObject.position);
    toolpathTubeObject.quaternion.copy(toolpathObject.quaternion);
    toolpathTubeObject.scale.copy(toolpathObject.scale);
    toolpathTubeObject.updateMatrixWorld(true);
  }

  // Build the thermal-coloured toolpath and the solid STL mesh, both parented and
  // transformed identically to the toolpath so a view switch keeps registration.
  function buildAuxViewObjects() {
    teardownAuxViews();
    const parent = toolpathObject ? toolpathObject.parent : null;
    const copyTransform = (obj) => {
      if (obj && toolpathObject) {
        obj.position.copy(toolpathObject.position);
        obj.quaternion.copy(toolpathObject.quaternion);
        obj.scale.copy(toolpathObject.scale);
      }
    };

    const thermal = typeof getSlicerThermal === "function" ? getSlicerThermal() : null;
    thermalBuffers = thermal ? buildThermalBuffers(thermal) : null;
    if (thermalBuffers && thermalBuffers.totalSegments > 0) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(thermalBuffers.positions, 3));
      geometry.setAttribute("color", new THREE.BufferAttribute(thermalBuffers.colors, 3));
      geometry.setDrawRange(0, 0);
      thermalObject = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ vertexColors: true }));
      thermalObject.name = "print-sim-thermal";
      thermalObject.frustumCulled = false;
      thermalObject.visible = false;
      if (parent) parent.add(thermalObject);
      copyTransform(thermalObject);
    }

    const mesh = typeof getSlicerMesh === "function" ? getSlicerMesh() : null;
    if (mesh && mesh.positions && mesh.positions.length >= 9) {
      const geometry = new THREE.BufferGeometry();
      const scaled = new Float32Array(mesh.positions.length);
      for (let i = 0; i < scaled.length; i += 1) {
        scaled[i] = mesh.positions[i] * TOOLPATH_UNIT_SCALE;
      }
      geometry.setAttribute("position", new THREE.BufferAttribute(scaled, 3));
      if (mesh.indices && mesh.indices.length) {
        const IndexArray = scaled.length / 3 > 65535 ? Uint32Array : Uint16Array;
        geometry.setIndex(new THREE.BufferAttribute(IndexArray.from(mesh.indices), 1));
      }
      geometry.computeVertexNormals();
      stlMeshObject = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({ color: 0x9fb4c9, roughness: 0.72, metalness: 0.1 }),
      );
      stlMeshObject.name = "print-sim-stl";
      stlMeshObject.frustumCulled = false;
      stlMeshObject.visible = false;
      if (parent) parent.add(stlMeshObject);
      copyTransform(stlMeshObject);
    }
  }

  function teardownAuxViews() {
    for (const obj of [thermalObject, stlMeshObject]) {
      if (obj) {
        if (obj.parent) obj.parent.remove(obj);
        obj.geometry?.dispose?.();
        const mats = materialsOf(obj);
        for (const m of mats) m?.dispose?.();
      }
    }
    thermalObject = null;
    stlMeshObject = null;
    thermalBuffers = null;
  }

  // Static solid preview (pre-print): show ONLY the placed slicer solid so the
  // viewer scene reflects the sliced part's exact orientation + placement (it is
  // parented into the same correctly-oriented frame as the toolpath). Set by the
  // host when a real toolpath is prepared and no print is running.
  let solidPreview = false;

  function setSolidPreview(on) {
    solidPreview = Boolean(on);
    applyViewVisibility();
  }

  // Show only the active view's object. Falls back to the toolpath when the
  // requested view has no data (e.g. thermal before a Slice+Simulate).
  function applyViewVisibility() {
    if (solidPreview && !playing && stlMeshObject) {
      if (toolpathObject) toolpathObject.visible = false;
      if (toolpathTubeObject) toolpathTubeObject.visible = false;
      if (thermalObject) thermalObject.visible = false;
      stlMeshObject.visible = true;
      return;
    }
    let effective = viewMode;
    if (effective === "thermal" && !thermalObject) effective = "toolpath";
    if (effective === "stl" && !stlMeshObject) effective = "toolpath";
    const showToolpath = effective === "toolpath";
    // In the toolpath view the render style picks line vs bead (tube); fall back
    // to lines if the tube mesh wasn't built.
    const showTube = showToolpath && toolpathStyle === "tube" && Boolean(toolpathTubeObject);
    if (toolpathObject) toolpathObject.visible = showToolpath && !showTube;
    if (toolpathTubeObject) toolpathTubeObject.visible = showTube;
    if (thermalObject) thermalObject.visible = effective === "thermal";
    if (stlMeshObject) stlMeshObject.visible = effective === "stl";
  }

  function setViewMode(mode) {
    if (mode !== "toolpath" && mode !== "thermal" && mode !== "stl") return;
    viewMode = mode;
    applyViewVisibility();
    applyVisibility();
  }

  function getViewMode() {
    return viewMode;
  }

  // Toolpath render style: "line" (thin) | "tube" (solid bead, matches slicer).
  function setStyle(style) {
    if (style !== "line" && style !== "tube") return;
    toolpathStyle = style;
    applyViewVisibility();
    applyVisibility();
  }

  function getStyle() {
    return toolpathStyle;
  }

  function hasTubeView() {
    return Boolean(toolpathTubeObject);
  }

  function hasThermalView() {
    return Boolean(thermalObject);
  }

  function hasStlView() {
    return Boolean(stlMeshObject);
  }

  function teardownToolpathSource() {
    teardownAuxViews();
    for (const obj of [toolpathObject, toolpathTubeObject]) {
      if (obj) {
        if (obj.parent) obj.parent.remove(obj);
        obj.geometry?.dispose?.();
        const mats = materialsOf(obj);
        for (const m of mats) m?.dispose?.();
      }
    }
    toolpathObject = null;
    toolpathTubeObject = null;
    toolpathBuffers = null;
    toolpathTubeBuffers = null;
  }

  // ---- Progress application -----------------------------------------------

  function applyVisibility() {
    if (source === "clip" && clipPlane) {
      if (clipPinnedZ === null) {
        // Legacy: sweep the plane up through a stationary part. Quantize to
        // synthetic layers for a stepped build-up look.
        const layer = Math.min(totalLayers, Math.max(0, Math.round(progress * totalLayers)));
        const t = layer / totalLayers;
        clipPlane.constant = clipMinZ + (clipMaxZ - clipMinZ) * t;
      }
      // Nozzle-pinned: plane stays at clipPinnedZ; the bed (moved by the host via
      // onProgress below) carries the part down through it.
    } else if (source === "toolpath" && toolpathObject && toolpathBuffers) {
      // Segment-level (not layer-quantized) reveal: the deposition point then
      // advances smoothly along the path so the host can trace it with the bed,
      // making the nozzle appear to lay each bead. Segments are in print order,
      // so the build still grows layer-by-layer overall.
      const segments = segmentsVisibleForProgress(toolpathBuffers, progress, false);
      toolpathObject.geometry.setDrawRange(0, segments * 2);
      currentDrawVertexCount = segments * 2;
      // The bead (tube) render reveals in lock-step: fixed index count per segment.
      if (toolpathTubeObject) {
        toolpathTubeObject.geometry.setDrawRange(0, segments * INDICES_PER_SEGMENT);
      }
      // The thermal view reveals in lock-step (its own segment count differs).
      if (thermalObject && thermalBuffers) {
        const tSegs = segmentsVisibleForProgress(thermalBuffers, progress, false);
        thermalObject.geometry.setDrawRange(0, tSegs * 2);
      }
    }
    // Let the host drive the build platform so the freshly-revealed top always
    // meets the fixed nozzle. Runs for every source and on scrub/reset too.
    if (source && typeof onProgress === "function") {
      onProgress(progress);
    }
  }

  // ---- Public controller API ----------------------------------------------

  async function prepare(options = {}) {
    if (state.get() === SimState.PLAYING) {
      pause();
    }
    state.set(SimState.LOADING_MODEL);
    setStatus("loading model...");

    let loaded = false;
    try {
      loaded = await ensureModelLoaded();
    } catch (error) {
      state.set(SimState.ERROR, error?.message);
      setStatus(`error (${error?.message || "load failed"})`);
      return false;
    }

    const stlObject = getStlObject();
    if (!loaded || !stlObject) {
      state.set(SimState.ERROR, "no model");
      setStatus("select a model first");
      return false;
    }

    // Preferred: a toolpath pushed up from the embedded slicer, which carries the
    // exact placement/orientation and layers the user set there. Same payload
    // shape as the backend slice, so it drops straight into the toolpath source.
    const bridged = typeof getSlicerToolpath === "function" ? getSlicerToolpath() : null;
    if (bridged && Array.isArray(bridged.moves) && bridged.moves.length > 0) {
      state.set(SimState.SLICING);
      setStatus("loading slice...");
      if (setupToolpathSource(bridged, stlObject)) {
        progress = 0;
        applyVisibility();
        state.set(SimState.READY);
        setStatus(`sliced: ${toolpathBuffers.layerCount} layers`);
        return true;
      }
      setStatus("slice empty; using layer reveal");
    }

    // Optional real-slicer path (slice the selected model by name via backend).
    if (slicerClient && slicerClient.isEnabled()) {
      state.set(SimState.SLICING);
      setStatus("slicing...");
      try {
        const payload = await slicerClient.sliceByName(getSelectedModelName(), {
          signal: options.signal,
        });
        if (setupToolpathSource(payload, stlObject)) {
          progress = 0;
          applyVisibility();
          state.set(SimState.READY);
          setStatus(`sliced: ${toolpathBuffers.layerCount} layers`);
          return true;
        }
        setStatus("slice empty; using layer reveal");
      } catch (error) {
        // Graceful degradation: fall back to the client-side clip reveal.
        console.warn("[printSim] slicer unavailable, falling back to clip reveal:", error?.message);
        setStatus(`slicer off (${error?.code || "error"}); layer reveal`);
      }
    }

    // Source A fallback (default).
    if (!setupClipSource(stlObject)) {
      state.set(SimState.ERROR, "empty geometry");
      setStatus("error (empty geometry)");
      return false;
    }
    progress = 0;
    applyVisibility();
    state.set(SimState.READY);
    setStatus("ready");
    return true;
  }

  function play() {
    if (!source) {
      return false;
    }
    if (progress >= 1) {
      progress = 0;
    }
    // Leave the static solid-preview mode; a running print uses the normal view
    // (toolpath/tube revealing over time).
    solidPreview = false;
    playing = true;
    state.set(SimState.PLAYING);
    setStatus("printing...");
    applyViewVisibility();
    return true;
  }

  function pause() {
    if (!playing) {
      return false;
    }
    playing = false;
    if (state.get() === SimState.PLAYING) {
      state.set(SimState.PAUSED);
    }
    setStatus("paused");
    return true;
  }

  function togglePlay() {
    return playing ? pause() : play();
  }

  function reset() {
    playing = false;
    progress = 0;
    applyVisibility();
    if (source) {
      state.set(SimState.READY);
      setStatus("ready");
    }
    return true;
  }

  // Fully tear down rendering artefacts and return to idle. Safe to call when
  // leaving the feature entirely.
  function stop() {
    playing = false;
    progress = 0;
    teardownClipSource();
    teardownToolpathSource();
    source = null;
    state.set(SimState.IDLE);
  }

  function setProgress(value) {
    progress = Math.min(Math.max(Number(value) || 0, 0), 1);
    applyVisibility();
    if (source && state.get() === SimState.IDLE) {
      state.set(SimState.READY);
    }
  }

  function setSpeedLayersPerSec(value) {
    const v = Number(value);
    if (Number.isFinite(v) && v > 0) {
      speedLayersPerSec = v;
    }
  }

  // Playback speed as a multiple of the real deposition speed (1 = true speed).
  function setSpeedMultiplier(value) {
    const v = Number(value);
    if (Number.isFinite(v) && v > 0) {
      speedMultiplier = v;
    }
  }

  // Per-frame advance. Driven by the host render loop with a clamped dt.
  function update(deltaSeconds) {
    if (!playing || !source) {
      return;
    }
    const dt = Number(deltaSeconds) || 0;
    if (printSecondsAt1x && printSecondsAt1x > 0) {
      // Real-speed playback: cross the whole path in printSecondsAt1x at 1x.
      progress += (speedMultiplier * dt) / printSecondsAt1x;
    } else {
      progress += (speedLayersPerSec * dt) / Math.max(totalLayers, 1);
    }
    if (progress >= 1) {
      progress = 1;
      playing = false;
      applyVisibility();
      state.set(SimState.COMPLETED);
      setStatus("print complete");
      return;
    }
    applyVisibility();
  }

  function isActive() {
    return state.isActive();
  }

  function getProgress() {
    return progress;
  }

  function getState() {
    return state.get();
  }

  // The 3D object currently being "printed": the revealed toolpath lines, or the
  // clipped STL in the fallback. The host measures this for the bed descent.
  function getPrintObject() {
    if (source === "toolpath") {
      return toolpathObject;
    }
    if (source === "clip") {
      return getStlObject();
    }
    return null;
  }

  function getSource() {
    return source;
  }

  // World position of the current deposition point. Rather than snap to the last
  // whole revealed vertex (which makes the bed jump segment-to-segment), it
  // INTERPOLATES along the segment currently being drawn, using the fractional
  // progress within that segment — so the point (and the bed tracking it) moves
  // smoothly. Recomputed every frame, so it's frame-rate independent. Null unless
  // a toolpath is loaded.
  function getCurrentDepositionPointWorld(out) {
    if (source !== "toolpath" || !toolpathObject || !toolpathBuffers) {
      return null;
    }
    const positions = toolpathBuffers.positions;
    const totalSegments = toolpathBuffers.totalSegments || 0;
    if (!positions || positions.length < 6 || totalSegments <= 0) {
      return null;
    }
    // exact = how far along the whole path (in segments) the reveal has reached.
    const exact = Math.min(Math.max(progress, 0), 1) * totalSegments;
    const seg = Math.min(Math.floor(exact), totalSegments - 1);
    const frac = Math.min(Math.max(exact - seg, 0), 1);
    // Segment `seg` occupies two vertices: start at seg*6, end at seg*6+3.
    const o = seg * 6;
    const target = out || new THREE.Vector3();
    target.set(
      positions[o] + (positions[o + 3] - positions[o]) * frac,
      positions[o + 1] + (positions[o + 4] - positions[o + 1]) * frac,
      positions[o + 2] + (positions[o + 5] - positions[o + 2]) * frac,
    );
    toolpathObject.updateWorldMatrix(true, true);
    return target.applyMatrix4(toolpathObject.matrixWorld);
  }

  // Post-print stats for the completion summary: layer count, real 1x print
  // time, path length, deposited height, and a simulated thermal summary
  // (peak / average relative heat 0..1 + the hottest layer). Best-effort; any
  // field is null when the underlying data is absent.
  function getStats() {
    const tp = toolpathBuffers || null;
    const layerCount = tp && Number.isFinite(tp.layerCount) ? tp.layerCount : null;
    const pathLengthMm = tp && Number.isFinite(tp.pathLengthMm) ? tp.pathLengthMm : null;

    let heightMm = null;
    if (tp && tp.positions && tp.positions.length >= 3) {
      let minZ = Infinity, maxZ = -Infinity;
      for (let i = 2; i < tp.positions.length; i += 3) {
        const z = tp.positions[i];
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }
      if (Number.isFinite(minZ) && Number.isFinite(maxZ)) {
        heightMm = (maxZ - minZ) / TOOLPATH_UNIT_SCALE; // metres → mm
      }
    }

    let thermal = null;
    const thermalPayload = typeof getSlicerThermal === "function" ? getSlicerThermal() : null;
    const segs = Array.isArray(thermalPayload?.segments) ? thermalPayload.segments : [];
    if (segs.length) {
      let peak = 0, sum = 0, n = 0;
      const layerSum = new Map(), layerN = new Map();
      for (const s of segs) {
        const score = Number(s?.score);
        if (!Number.isFinite(score)) continue;
        peak = Math.max(peak, score);
        sum += score; n += 1;
        const L = Number.isFinite(s?.layer) ? s.layer : 0;
        layerSum.set(L, (layerSum.get(L) || 0) + score);
        layerN.set(L, (layerN.get(L) || 0) + 1);
      }
      if (n > 0) {
        let hottestLayer = null, hottestAvg = -1;
        for (const [L, tot] of layerSum) {
          const a = tot / (layerN.get(L) || 1);
          if (a > hottestAvg) { hottestAvg = a; hottestLayer = L; }
        }
        thermal = { peak, avg: sum / n, hottestLayer, hottestLayerAvg: hottestAvg, samples: n };
      }
    }

    return { source, layerCount, printSeconds: printSecondsAt1x, pathLengthMm, heightMm, thermal };
  }

  return {
    SimState,
    prepare,
    play,
    pause,
    togglePlay,
    reset,
    getStats,
    getPrintObject,
    getSource,
    getCurrentDepositionPointWorld,
    setViewMode,
    getViewMode,
    setSolidPreview,
    setStyle,
    getStyle,
    hasTubeView,
    hasThermalView,
    hasStlView,
    stop,
    setProgress,
    setSpeedLayersPerSec,
    setSpeedMultiplier,
    update,
    isActive,
    getProgress,
    getState,
  };
}
