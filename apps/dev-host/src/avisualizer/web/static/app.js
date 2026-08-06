import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  buildSpriteObject,
  buildVoxelCubeObject,
  createBuildPlateGrid,
  createReferenceMarkers,
} from "./modules/render.js";
import { bindDualRange, toNumber } from "./modules/controls.js";
import { fetchAttributeSeries, fetchSensorData } from "./modules/api.js?v=3";
import * as dataRefinementModule from "./modules/data_refinement.js?v=4";
import { drawTrendChart as drawTrendChartModule } from "./modules/trend_chart.js?v=2";

const buildCutThresholdsFromModule = dataRefinementModule.buildCutThresholds;
const computePercentileRangeFromModule = dataRefinementModule.computePercentileRange;
const getCutFractionsFromModule = dataRefinementModule.getCutFractions;
const getFilteredPointsByThresholdsFromModule = dataRefinementModule.getFilteredPointsByThresholds;
const fillVoxelizedGapsFromModule = dataRefinementModule.fillVoxelizedGaps;
const { inferLatticeOrigin, buildVoxelKey } = dataRefinementModule;

const partStatusEl = document.getElementById("partStatus");
const attributeStatusEl = document.getElementById("attributeStatus");

const viewModeEl = document.getElementById("viewMode");
const selectFolderEl = document.getElementById("selectFolder");
const folderPickerEl = document.getElementById("folderPicker");
const fileStatusEl = document.getElementById("fileStatus");
const cutXMinEl = document.getElementById("cutXMin");
const cutXMaxEl = document.getElementById("cutXMax");
const cutYMinEl = document.getElementById("cutYMin");
const cutYMaxEl = document.getElementById("cutYMax");
const cutZMinEl = document.getElementById("cutZMin");
const cutZMaxEl = document.getElementById("cutZMax");
const cutValueMinEl = document.getElementById("cutValueMin");
const cutValueMaxEl = document.getElementById("cutValueMax");

const voxelSizeEl = document.getElementById("voxelSize");
const voxelSizeZEl = document.getElementById("voxelSizeZ");
const spriteSizeEl = document.getElementById("spriteSize");
const buildPlateSizeXEl = document.getElementById("buildPlateSizeX");
const buildPlateSizeYEl = document.getElementById("buildPlateSizeY");
const showBaseGridEl = document.getElementById("showBaseGrid");
const percentileMinEl = document.getElementById("percentileMin");
const percentileMaxEl = document.getElementById("percentileMax");
const fillVoxelizedGapsEl = document.getElementById("fillVoxelizedGaps");
const minVoxelHoleAreaEl = document.getElementById("minVoxelHoleArea");
const stlVoxelFillEl = document.getElementById("stlVoxelFill");
const stlFillThresholdEl = document.getElementById("stlFillThreshold");

const openSettingsEl = document.getElementById("openSettings");
const closeSettingsEl = document.getElementById("closeSettings");
const settingsPanelEl = document.getElementById("settingsPanel");
const applySettingsEl = document.getElementById("applySettings");
const trendCanvasEl = document.getElementById("trendCanvas");
const colorScaleMinEl = document.getElementById("colorScaleMin");
const colorScaleAvgEl = document.getElementById("colorScaleAvg");
const colorScaleMaxEl = document.getElementById("colorScaleMax");

const canvas = document.getElementById("scene");

const BACKGROUND_COLOR = 0x060a12;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(BACKGROUND_COLOR);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(BACKGROUND_COLOR);
scene.fog = new THREE.Fog(BACKGROUND_COLOR, 350, 1200);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 5000);
camera.up.set(0, 0, 1);
camera.position.set(0, 140, 300);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0, 0);

scene.add(new THREE.AmbientLight(0xffffff, 0.6));
scene.add(new THREE.HemisphereLight(0xd6ebff, 0x1f2b3d, 0.85));

const directional = new THREE.DirectionalLight(0xffffff, 0.7);
directional.position.set(200, 260, 160);
scene.add(directional);

const OUTLINE_COLOR = new THREE.Color(0x4a515b);
const OUTLINE_START = 0.77;
const GRID_MAJOR_COLOR = 0x2c4058;
const GRID_MINOR_COLOR = 0x192634;
const DEFAULT_DATASET_NAME = "small-torture-test_1-0-0";

let activeLoadId = 0;
let currentPayload = null;
let renderObject = null;
let groundGrid = null;
let referenceMarkers = null;
let pointSpriteMaterial = null;
let stlObject = null;
let shouldInitializeViewTarget = true;
let selectedDatasetName = DEFAULT_DATASET_NAME;
let currentSeriesPayload = null;
let currentPercentileRange = { min: 0, max: 1, avg: 0.5 };
let currentVisiblePointIndices = null;
let currentStlFitPayload = null;
let activeStlLoadId = 0;
let currentStlDatasetName = "";
let stlLoader = null;
let stlLoaderUnavailable = false;
let stlFitParams = null;

function applyStlFitCandidate(fit) {
  if (!stlObject || !fit) {
    return;
  }
  stlObject.scale.setScalar(fit.scale);
  stlObject.rotation.set(fit.rotation.x, fit.rotation.y, fit.rotation.z);
  stlObject.position.set(fit.position.x, fit.position.y, fit.position.z);
}

async function getStlLoader() {
  if (stlLoaderUnavailable) {
    return null;
  }
  if (stlLoader) {
    return stlLoader;
  }

  try {
    const mod = await import("three/addons/loaders/STLLoader.js");
    stlLoader = new mod.STLLoader();
    return stlLoader;
  } catch {
    try {
      // Fallback for three.js versions that expose loaders under examples/jsm.
      const mod = await import("three/examples/jsm/loaders/STLLoader.js");
      stlLoader = new mod.STLLoader();
      return stlLoader;
    } catch {
      stlLoaderUnavailable = true;
      return null;
    }
  }
}

function buildDeterministicSampleSeed(requested) {
  const basis = [
    selectedDatasetName,
    requested.voxelSizeMm,
    requested.voxelSizeZMm,
    requested.buildPlateSizeX,
    requested.buildPlateSizeY,
  ].join("|");

  let hash = 2166136261;
  for (let i = 0; i < basis.length; i += 1) {
    hash ^= basis.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) & 0x7fffffff;
}

function setDisabled(el, disabled) {
  if (el) {
    el.disabled = disabled;
  }
}

function getRequestedState() {
  const mode = viewModeEl ? viewModeEl.value : "point_sprite";
  const voxelSizeMm = toNumber(voxelSizeEl ? voxelSizeEl.value : 2.0, 2.0);
  const voxelSizeZMm = toNumber(voxelSizeZEl ? voxelSizeZEl.value : 1.2, 1.2);
  const voxelEdgeSize = 1.0;
  const spriteSize = toNumber(spriteSizeEl ? spriteSizeEl.value : 4.25, 4.25);
  const buildPlateSizeX = toNumber(buildPlateSizeXEl ? buildPlateSizeXEl.value : 300, 300);
  const buildPlateSizeY = toNumber(buildPlateSizeYEl ? buildPlateSizeYEl.value : 400, 400);
  const showBaseGrid = showBaseGridEl ? showBaseGridEl.checked : true;
  const fillVoxelizedGaps = fillVoxelizedGapsEl ? fillVoxelizedGapsEl.checked : false;
  const minVoxelHoleAreaMm2 = toNumber(minVoxelHoleAreaEl ? minVoxelHoleAreaEl.value : 5, 5);
  const stlVoxelFill = stlVoxelFillEl ? stlVoxelFillEl.checked : false;
  const rawStlFillThreshold = toNumber(stlFillThresholdEl ? stlFillThresholdEl.value : 0.8, 0.8);
  const stlFillThreshold = Math.max(0.5, Math.min(1.0, rawStlFillThreshold));

  return {
    mode,
    apiView: mode === "point_sprite" ? "point" : "voxel",
    renderStyle: mode === "voxel_cube" ? "cube" : "sprite",
    voxelSizeMm,
    voxelSizeZMm,
    voxelEdgeSize,
    spriteSize,
    buildPlateSizeX,
    buildPlateSizeY,
    showBaseGrid,
    fillVoxelizedGaps,
    minVoxelHoleAreaMm2,
    stlVoxelFill,
    stlFillThreshold,
  };
}

function setLoadingState(isLoading) {
  setDisabled(selectFolderEl, isLoading);
  setDisabled(viewModeEl, isLoading);
  setDisabled(applySettingsEl, isLoading);
  setDisabled(voxelSizeEl, isLoading);
  setDisabled(voxelSizeZEl, isLoading);
  setDisabled(spriteSizeEl, isLoading);
  setDisabled(buildPlateSizeXEl, isLoading);
  setDisabled(buildPlateSizeYEl, isLoading);
  setDisabled(showBaseGridEl, isLoading);
  setDisabled(percentileMinEl, isLoading);
  setDisabled(percentileMaxEl, isLoading);
  setDisabled(fillVoxelizedGapsEl, isLoading);
  setDisabled(minVoxelHoleAreaEl, isLoading);
  setDisabled(stlVoxelFillEl, isLoading);
  setDisabled(stlFillThresholdEl, isLoading);
}

function getPercentileSettings() {
  const rawMin = toNumber(percentileMinEl ? percentileMinEl.value : 1, 1);
  const rawMax = toNumber(percentileMaxEl ? percentileMaxEl.value : 99, 99);
  const minPct = Math.max(0, Math.min(49.9, rawMin));
  const maxPct = Math.max(minPct + 0.1, Math.min(100, rawMax));
  return {
    low: minPct / 100,
    high: maxPct / 100,
  };
}

function computePercentileRange(values, low = 0.01, high = 0.99) {
  return computePercentileRangeFromModule(values, low, high);
}

function updateColorScaleLabels(range) {
  if (colorScaleMaxEl) {
    colorScaleMaxEl.textContent = `${Math.round(range.max)}`;
  }
  if (colorScaleAvgEl) {
    colorScaleAvgEl.textContent = `${Math.round(range.avg)}`;
  }
  if (colorScaleMinEl) {
    colorScaleMinEl.textContent = `${Math.round(range.min)}`;
  }
}

function drawTrendChart(seriesPayload) {
  drawTrendChartModule({
    trendCanvasEl,
    seriesPayload,
    visiblePointIndices: currentVisiblePointIndices,
    getPercentileSettings,
    currentAttribute: currentPayload?.attribute,
  });
}

function buildSeriesCutPayload(seriesPayload, payload) {
  if (!seriesPayload || !Array.isArray(seriesPayload.sampledPoints) || !payload) {
    return null;
  }
  if (!Array.isArray(payload.center) || payload.center.length !== 3) {
    return null;
  }

  const cx = Number(payload.center[0]);
  const cy = Number(payload.center[1]);
  const cz = Number(payload.center[2]);
  if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(cz)) {
    return null;
  }

  const points = seriesPayload.sampledPoints
    .filter((p) => Array.isArray(p) && p.length >= 5)
    .map((p) => [
      Number(p[0]) - cx,
      Number(p[1]) - cy,
      Number(p[2]) - cz,
      Number(p[3]),
      Number(p[4]),
    ])
    .filter((p) => Number.isFinite(p[0])
      && Number.isFinite(p[1])
      && Number.isFinite(p[2])
      && Number.isFinite(p[3])
      && Number.isFinite(p[4]));

  return { points };
}

function updateVisibleSeriesIndices(cutFractions, cutThresholds) {
  const hasAnyCut = !(cutFractions.xMin === 0 && cutFractions.xMax === 1
    && cutFractions.yMin === 0 && cutFractions.yMax === 1
    && cutFractions.zMin === 0 && cutFractions.zMax === 1
    && cutFractions.valueMin === 0 && cutFractions.valueMax === 1);

  if (!hasAnyCut) {
    currentVisiblePointIndices = null;
    return;
  }

  const seriesCutPayload = buildSeriesCutPayload(currentSeriesPayload, currentPayload);
  const visibilitySourcePayload = seriesCutPayload && seriesCutPayload.points.length
    ? seriesCutPayload
    : currentPayload;
  const visibleSourcePoints = getFilteredPointsByThresholds(visibilitySourcePayload, cutThresholds);

  currentVisiblePointIndices = new Set(
    visibleSourcePoints
      .map((p) => Math.trunc(p[4]))
      .filter((v) => Number.isFinite(v)),
  );
}

async function loadSeriesForDataset(datasetName) {
  const payload = await fetchAttributeSeries({
    dataset: datasetName,
    attribute: "loadCell",
    maxSamples: 1200,
  });
  currentSeriesPayload = payload;
  if (currentPayload) {
    const cutFractions = getCutFractions();
    const cutThresholds = buildCutThresholds(currentPayload, cutFractions);
    updateVisibleSeriesIndices(cutFractions, cutThresholds);
  }
  drawTrendChart(payload);
}

function setSettingsModalOpen(isOpen) {
  if (!settingsPanelEl) {
    return;
  }

  settingsPanelEl.classList.toggle("hidden", !isOpen);
  document.body.classList.toggle("settings-modal-open", isOpen);
  controls.enabled = !isOpen;
}

function disposeObject3D(object) {
  object.traverse((child) => {
    if (child.geometry) {
      child.geometry.dispose();
    }
    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach((m) => m.dispose());
      } else {
        child.material.dispose();
      }
    }
  });
}

function clearRenderObject() {
  if (!renderObject) {
    return;
  }

  scene.remove(renderObject);
  disposeObject3D(renderObject);
  renderObject = null;
  pointSpriteMaterial = null;
}

function clearReferenceMarkers() {
  if (!referenceMarkers) {
    return;
  }

  scene.remove(referenceMarkers);
  disposeObject3D(referenceMarkers);
  referenceMarkers = null;
}

function clearStlObject() {
  if (stlObject) {
    scene.remove(stlObject);
    disposeObject3D(stlObject);
    stlObject = null;
  }
  stlFitParams = null;
}

function getPayloadSceneBounds(payload) {
  if (!payload || !Array.isArray(payload.points) || !Array.isArray(payload.center)) {
    return null;
  }
  if (!payload.points.length) {
    return null;
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  const cx = Number(payload.center[0]);
  const cy = Number(payload.center[1]);
  for (const p of payload.points) {
    const x = Number(p[0]) + cx;
    const y = Number(p[1]) + cy;
    const z = Number(p[2]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      continue;
    }
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) {
    return null;
  }

  return {
    minX,
    minY,
    minZ,
    maxX,
    maxY,
    maxZ,
    spanX: Math.max(1e-9, maxX - minX),
    spanY: Math.max(1e-9, maxY - minY),
    spanZ: Math.max(1e-9, maxZ - minZ),
    centerX: (minX + maxX) * 0.5,
    centerY: (minY + maxY) * 0.5,
    centerZ: (minZ + maxZ) * 0.5,
  };
}

function getSampledScenePoints(payload, maxSamples = 2000) {
  if (!payload || !Array.isArray(payload.points) || !Array.isArray(payload.center)) {
    return [];
  }
  const points = payload.points;
  if (!points.length) {
    return [];
  }

  const cx = Number(payload.center[0]);
  const cy = Number(payload.center[1]);
  const samples = [];
  const step = Math.max(1, Math.floor(points.length / maxSamples));

  for (let i = 0; i < points.length; i += step) {
    const p = points[i];
    const x = Number(p[0]) + cx;
    const y = Number(p[1]) + cy;
    const z = Number(p[2]);
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
      samples.push([x, y, z]);
    }
    if (samples.length >= maxSamples) {
      break;
    }
  }

  return samples;
}

function computeBoundsAfterTransform(box, matrix) {
  const corners = [
    new THREE.Vector3(box.min.x, box.min.y, box.min.z),
    new THREE.Vector3(box.min.x, box.min.y, box.max.z),
    new THREE.Vector3(box.min.x, box.max.y, box.min.z),
    new THREE.Vector3(box.min.x, box.max.y, box.max.z),
    new THREE.Vector3(box.max.x, box.min.y, box.min.z),
    new THREE.Vector3(box.max.x, box.min.y, box.max.z),
    new THREE.Vector3(box.max.x, box.max.y, box.min.z),
    new THREE.Vector3(box.max.x, box.max.y, box.max.z),
  ];

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (const c of corners) {
    c.applyMatrix4(matrix);
    minX = Math.min(minX, c.x);
    minY = Math.min(minY, c.y);
    minZ = Math.min(minZ, c.z);
    maxX = Math.max(maxX, c.x);
    maxY = Math.max(maxY, c.y);
    maxZ = Math.max(maxZ, c.z);
  }

  return {
    minX,
    minY,
    minZ,
    maxX,
    maxY,
    maxZ,
    spanX: Math.max(1e-9, maxX - minX),
    spanY: Math.max(1e-9, maxY - minY),
    spanZ: Math.max(1e-9, maxZ - minZ),
    centerX: (minX + maxX) * 0.5,
    centerY: (minY + maxY) * 0.5,
    centerZ: (minZ + maxZ) * 0.5,
  };
}

function countPointsInBounds(points, bounds) {
  let inside = 0;
  for (const p of points) {
    if (
      p[0] >= bounds.minX && p[0] <= bounds.maxX
      && p[1] >= bounds.minY && p[1] <= bounds.maxY
      && p[2] >= bounds.minZ && p[2] <= bounds.maxZ
    ) {
      inside += 1;
    }
  }
  return inside;
}

const FIT_RAY_DIRECTIONS = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, 0, 1),
];

function pointInsideMeshMajority(mesh, raycaster, x, y, z, idx) {
  const jitter = ((idx % 17) - 8) * 1e-4;
  let insideVotes = 0;

  for (const dir of FIT_RAY_DIRECTIONS) {
    const origin = new THREE.Vector3(x, y, z);
    if (dir.x !== 0) {
      origin.x -= 1e-3;
      origin.y += jitter;
      origin.z -= jitter;
    } else if (dir.y !== 0) {
      origin.y -= 1e-3;
      origin.x += jitter;
      origin.z -= jitter;
    } else {
      origin.z -= 1e-3;
      origin.x -= jitter;
      origin.y += jitter;
    }
    raycaster.set(origin, dir);
    const hits = raycaster.intersectObject(mesh, false);
    if ((hits.length % 2) === 1) {
      insideVotes += 1;
    }
  }

  return insideVotes >= 2;
}

function meshInsideRatio(mesh, points, raycaster) {
  if (!points.length) {
    return 0;
  }
  let inside = 0;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    if (pointInsideMeshMajority(mesh, raycaster, p[0], p[1], p[2], i)) {
      inside += 1;
    }
  }
  return inside / points.length;
}

function getUniqueRightAngleRotationCandidates() {
  const deg = [0, 90, 180, 270];
  const seen = new Set();
  const result = [];

  for (const rx of deg) {
    for (const ry of deg) {
      for (const rz of deg) {
        const e = new THREE.Euler(
          (rx * Math.PI) / 180,
          (ry * Math.PI) / 180,
          (rz * Math.PI) / 180,
        );
        const m = new THREE.Matrix4().makeRotationFromEuler(e);
        const key = m.elements.map((v) => Math.round(v)).join(",");
        if (!seen.has(key)) {
          seen.add(key);
          result.push(e);
        }
      }
    }
  }

  return result;
}

function estimateStlFitParams(stlGeometry, payload) {
  if (!stlGeometry || !stlGeometry.attributes || !stlGeometry.attributes.position) {
    return null;
  }

  const payloadBounds = getPayloadSceneBounds(payload);
  if (!payloadBounds) {
    return null;
  }

  const box = stlGeometry.boundingBox;
  if (!box) {
    return null;
  }

  const sampledPoints = getSampledScenePoints(payload, 1800);
  if (!sampledPoints.length) {
    return null;
  }

  const orientationCandidates = getUniqueRightAngleRotationCandidates();

  const epsilonTop = 0.002;
  const xyOffsetFactors = [-0.2, -0.1, 0, 0.1, 0.2];
  const candidates = [];

  for (const euler of orientationCandidates) {
    const rotationMatrix = new THREE.Matrix4().makeRotationFromEuler(euler);
    const orientedBounds = computeBoundsAfterTransform(box, rotationMatrix);
    const scale = payloadBounds.spanZ / orientedBounds.spanZ;
    if (!Number.isFinite(scale) || scale <= 0) {
      continue;
    }

    const topTarget = payloadBounds.maxZ - (payloadBounds.spanZ * epsilonTop);
    const baseTx = payloadBounds.centerX - (orientedBounds.centerX * scale);
    const baseTy = payloadBounds.centerY - (orientedBounds.centerY * scale);
    const tz = topTarget - (orientedBounds.maxZ * scale);

    const xStep = payloadBounds.spanX * 0.08;
    const yStep = payloadBounds.spanY * 0.08;

    let bestForRotation = null;

    for (const fx of xyOffsetFactors) {
      for (const fy of xyOffsetFactors) {
        const tx = baseTx + (xStep * fx);
        const ty = baseTy + (yStep * fy);

        const candidateBounds = {
          minX: (orientedBounds.minX * scale) + tx,
          maxX: (orientedBounds.maxX * scale) + tx,
          minY: (orientedBounds.minY * scale) + ty,
          maxY: (orientedBounds.maxY * scale) + ty,
          minZ: (orientedBounds.minZ * scale) + tz,
          maxZ: (orientedBounds.maxZ * scale) + tz,
          spanX: orientedBounds.spanX * scale,
          spanY: orientedBounds.spanY * scale,
        };

        const insideCount = countPointsInBounds(sampledPoints, candidateBounds);
        const insideRatio = insideCount / sampledPoints.length;
        const spanPenalty = (
          Math.abs(candidateBounds.spanX - payloadBounds.spanX) / payloadBounds.spanX
          + Math.abs(candidateBounds.spanY - payloadBounds.spanY) / payloadBounds.spanY
        );
        const xyCenterPenalty = (
          Math.abs(((candidateBounds.minX + candidateBounds.maxX) * 0.5) - payloadBounds.centerX)
            / payloadBounds.spanX
          + Math.abs(((candidateBounds.minY + candidateBounds.maxY) * 0.5) - payloadBounds.centerY)
            / payloadBounds.spanY
        );
        const score = insideRatio - (0.2 * spanPenalty) - (0.1 * xyCenterPenalty);

        const candidate = {
          score,
          scale,
          rotation: { x: euler.x, y: euler.y, z: euler.z },
          position: { x: tx, y: ty, z: tz },
          insideRatio,
        };

        if (!bestForRotation || candidate.score > bestForRotation.score + 1e-9) {
          bestForRotation = candidate;
        }
      }
    }

    if (bestForRotation) {
      candidates.push(bestForRotation);
    }
  }

  if (!candidates.length) {
    return null;
  }

  const probeMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const probeMesh = new THREE.Mesh(stlGeometry, probeMaterial);
  probeMesh.visible = false;
  const raycaster = new THREE.Raycaster();
  const meshPoints = sampledPoints.filter((_, idx) => idx % 2 === 0);

  for (const c of candidates) {
    probeMesh.scale.setScalar(c.scale);
    probeMesh.rotation.set(c.rotation.x, c.rotation.y, c.rotation.z);
    probeMesh.position.set(c.position.x, c.position.y, c.position.z);
    probeMesh.updateMatrixWorld(true);

    const meshRatio = meshInsideRatio(probeMesh, meshPoints, raycaster);
    c.meshInsideRatio = meshRatio;
    c.score = (0.35 * c.score) + (0.65 * meshRatio);
    c.insideRatio = meshRatio;
  }

  probeMaterial.dispose();

  candidates.sort((a, b) => b.score - a.score);

  return {
    best: candidates[0],
    candidates,
  };
}

function syncStlTransform() {
  if (!stlObject || !currentPayload || !Array.isArray(currentPayload.center)) {
    return;
  }

  if (!stlFitParams) {
    const fitSourcePayload = currentStlFitPayload || currentPayload;
    const fitResult = estimateStlFitParams(stlObject.geometry, fitSourcePayload);
    if (fitResult) {
      stlFitParams = fitResult.best;
    }
  }
  if (!stlFitParams) {
    return;
  }

  applyStlFitCandidate(stlFitParams);
}

async function loadStlForDataset(datasetName) {
  const loader = await getStlLoader();
  if (!loader) {
    clearStlObject();
    currentStlDatasetName = "";
    return;
  }

  if (currentStlDatasetName === datasetName && stlObject) {
    return;
  }

  activeStlLoadId += 1;
  const stlLoadId = activeStlLoadId;
  const url = `/api/datasets/stl?dataset=${encodeURIComponent(datasetName)}`;

  try {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 5000);
    const response = await fetch(url, { signal: controller.signal });
    window.clearTimeout(timeoutId);

    if (stlLoadId !== activeStlLoadId) {
      return;
    }

    if (!response.ok) {
      clearStlObject();
      currentStlDatasetName = "";
      return;
    }

    const contentLength = Number(response.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > 50_000_000) {
      clearStlObject();
      currentStlDatasetName = "";
      return;
    }

    const buffer = await response.arrayBuffer();
    if (stlLoadId !== activeStlLoadId) {
      return;
    }

    const geometry = loader.parse(buffer);
    clearStlObject();
    geometry.computeBoundingBox();
    geometry.center();
    geometry.computeBoundingBox();
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
      color: 0x9aa5b1,
      metalness: 0.05,
      roughness: 0.85,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
    });

    stlObject = new THREE.Mesh(geometry, material);
    stlObject.renderOrder = 1;
    stlObject.frustumCulled = true;
    stlFitParams = null;

    syncStlTransform();
    scene.add(stlObject);
    currentStlDatasetName = datasetName;
  } catch {
    if (stlLoadId === activeStlLoadId) {
      clearStlObject();
      currentStlDatasetName = "";
    }
  }
}

function getCutFractions() {
  return getCutFractionsFromModule({
    cutXMinEl,
    cutXMaxEl,
    cutYMinEl,
    cutYMaxEl,
    cutZMinEl,
    cutZMaxEl,
    cutValueMinEl,
    cutValueMaxEl,
  }, toNumber);
}

function buildCutThresholds(payload, cutFractions) {
  return buildCutThresholdsFromModule(payload, cutFractions);
}

function getFilteredPointsByThresholds(payload, thresholds) {
  return getFilteredPointsByThresholdsFromModule(payload, thresholds);
}

function fillVoxelizedGaps(points, requested, payload) {
  if (!requested.fillVoxelizedGaps || requested.apiView !== "voxel") {
    return points;
  }

  if (typeof fillVoxelizedGapsFromModule !== "function") {
    return points;
  }

  try {
    return fillVoxelizedGapsFromModule(points, {
      enabled: true,
      voxelSizeMm: payload?.voxelSizeMm ?? requested.voxelSizeMm,
      voxelSizeZMm: payload?.voxelSizeZMm ?? requested.voxelSizeZMm,
      minHoleAreaMm2: requested.minVoxelHoleAreaMm2,
    });
  } catch (error) {
    // Keep rendering responsive if refinement fails on unexpected payload shapes.
    console.warn("fillVoxelizedGaps failed; rendering original points", error);
    return points;
  }
}

function estimateVoxelInsideRatio(mesh, raycaster, cx, cy, cz, voxelXY, voxelZ, seedBase) {
  const dx = voxelXY * 0.35;
  const dy = voxelXY * 0.35;
  const dz = voxelZ * 0.35;
  const samples = [
    [cx, cy, cz],
    [cx + dx, cy, cz],
    [cx - dx, cy, cz],
    [cx, cy + dy, cz],
    [cx, cy - dy, cz],
    [cx, cy, cz + dz],
    [cx, cy, cz - dz],
    [cx + dx, cy + dy, cz],
    [cx - dx, cy - dy, cz],
    [cx + dx, cy - dy, cz],
    [cx - dx, cy + dy, cz],
    [cx + dx, cy, cz + dz],
    [cx - dx, cy, cz - dz],
    [cx, cy + dy, cz + dz],
    [cx, cy - dy, cz - dz],
  ];

  let inside = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i];
    if (pointInsideMeshMajority(mesh, raycaster, s[0], s[1], s[2], seedBase + i)) {
      inside += 1;
    }
  }

  return inside / samples.length;
}

function interpolateVoxelValue(ix, iy, iz, occupancy, fallback) {
  const neighbors = [
    [ix - 1, iy, iz],
    [ix + 1, iy, iz],
    [ix, iy - 1, iz],
    [ix, iy + 1, iz],
    [ix, iy, iz - 1],
    [ix, iy, iz + 1],
  ];

  let sum = 0;
  let count = 0;
  for (const n of neighbors) {
    const key = buildVoxelKey(n[0], n[1], n[2]);
    const v = occupancy.get(key);
    if (!Number.isFinite(v)) {
      continue;
    }
    sum += v;
    count += 1;
  }

  if (count > 0) {
    return sum / count;
  }
  return fallback;
}

function countOccupiedNeighbors(ix, iy, iz, occupancy) {
  const neighbors = [
    [ix - 1, iy, iz],
    [ix + 1, iy, iz],
    [ix, iy - 1, iz],
    [ix, iy + 1, iz],
    [ix, iy, iz - 1],
    [ix, iy, iz + 1],
  ];

  let count = 0;
  for (const n of neighbors) {
    if (occupancy.has(buildVoxelKey(n[0], n[1], n[2]))) {
      count += 1;
    }
  }
  return count;
}

function fillByStl(points, requested, payload) {
  if (!requested.stlVoxelFill || requested.apiView !== "voxel") {
    return points;
  }
  if (!stlObject || !payload) {
    return points;
  }

  const voxelXY = Math.max(1e-9, Number(payload.voxelSizeMm) || Number(requested.voxelSizeMm) || 1);
  const voxelZ = Math.max(1e-9, Number(payload.voxelSizeZMm) || Number(requested.voxelSizeZMm) || 1);
  const insideThreshold = Math.max(0.5, Math.min(1, Number(requested.stlFillThreshold) || 0.8));
  const latticeOrigin = inferLatticeOrigin(points, voxelXY, voxelZ);
  const fallbackValue = currentPercentileRange?.avg ?? 0;

  const out = points.map((p) => [...p]);
  const occupancy = new Map();
  for (const p of out) {
    const ix = Math.round((p[0] - latticeOrigin.x) / voxelXY);
    const iy = Math.round((p[1] - latticeOrigin.y) / voxelXY);
    const iz = Math.round((p[2] - latticeOrigin.z) / voxelZ);
    occupancy.set(buildVoxelKey(ix, iy, iz), Number(p[3]));
  }

  stlObject.updateMatrixWorld(true);
  const stlBounds = new THREE.Box3().setFromObject(stlObject);
  if (stlBounds.isEmpty()) {
    return out;
  }

  const minIx = Math.floor((stlBounds.min.x - latticeOrigin.x) / voxelXY);
  const maxIx = Math.ceil((stlBounds.max.x - latticeOrigin.x) / voxelXY);
  const minIy = Math.floor((stlBounds.min.y - latticeOrigin.y) / voxelXY);
  const maxIy = Math.ceil((stlBounds.max.y - latticeOrigin.y) / voxelXY);
  const minIz = Math.floor((stlBounds.min.z - latticeOrigin.z) / voxelZ);
  const maxIz = Math.ceil((stlBounds.max.z - latticeOrigin.z) / voxelZ);

  const candidateCount = Math.max(0, (maxIx - minIx + 1) * (maxIy - minIy + 1) * (maxIz - minIz + 1));
  if (candidateCount > 300000) {
    console.warn("STL voxel fill skipped due to large candidate volume", candidateCount);
    return out;
  }

  const raycaster = new THREE.Raycaster();
  let seed = 0;
  const unresolved = [];

  for (let ix = minIx; ix <= maxIx; ix += 1) {
    const x = latticeOrigin.x + (ix * voxelXY);
    for (let iy = minIy; iy <= maxIy; iy += 1) {
      const y = latticeOrigin.y + (iy * voxelXY);
      for (let iz = minIz; iz <= maxIz; iz += 1) {
        const key = buildVoxelKey(ix, iy, iz);
        if (occupancy.has(key)) {
          continue;
        }

        const z = latticeOrigin.z + (iz * voxelZ);
        const insideRatio = estimateVoxelInsideRatio(stlObject, raycaster, x, y, z, voxelXY, voxelZ, seed);
        seed += 17;
        if (insideRatio < insideThreshold) {
          unresolved.push([ix, iy, iz, x, y, z]);
          continue;
        }

        const value = interpolateVoxelValue(ix, iy, iz, occupancy, fallbackValue);
        out.push([x, y, z, value, Number.NaN]);
        occupancy.set(key, value);
      }
    }
  }

  // Secondary recovery pass: fill likely interior pockets supported by occupied neighbors.
  for (const c of unresolved) {
    const ix = c[0];
    const iy = c[1];
    const iz = c[2];
    const x = c[3];
    const y = c[4];
    const z = c[5];
    const key = buildVoxelKey(ix, iy, iz);
    if (occupancy.has(key)) {
      continue;
    }

    if (countOccupiedNeighbors(ix, iy, iz, occupancy) < 4) {
      continue;
    }

    // Center-point check keeps this conservative even with neighbor support.
    if (!pointInsideMeshMajority(stlObject, raycaster, x, y, z, seed)) {
      seed += 1;
      continue;
    }
    seed += 1;

    const value = interpolateVoxelValue(ix, iy, iz, occupancy, fallbackValue);
    out.push([x, y, z, value, Number.NaN]);
    occupancy.set(key, value);
  }

  return out;
}

function renderFromCurrentPayload() {
  if (!currentPayload) {
    return;
  }

  const requested = getRequestedState();
  syncStlTransform();
  const cutFractions = getCutFractions();
  const cutThresholds = buildCutThresholds(currentPayload, cutFractions);
  const filteredPoints = getFilteredPointsByThresholds(currentPayload, cutThresholds);
  const refinedPoints = fillVoxelizedGaps(filteredPoints, requested, currentPayload);
  const stlRefinedPoints = fillByStl(refinedPoints, requested, currentPayload);
  updateVisibleSeriesIndices(cutFractions, cutThresholds);
  const filteredRange = {
    min: currentPercentileRange.min,
    max: currentPercentileRange.max,
  };
  const plateCenter = [requested.buildPlateSizeX / 2, requested.buildPlateSizeY / 2];
  const partToGridOffset = [currentPayload.center[0], currentPayload.center[1]];

  clearRenderObject();

  if (requested.apiView === "voxel" && requested.renderStyle === "cube") {
    renderObject = buildVoxelCubeObject(
      stlRefinedPoints,
      filteredRange,
      currentPayload.voxelSizeMm,
      currentPayload.voxelSizeZMm,
      requested.voxelEdgeSize,
      partToGridOffset,
      GRID_MAJOR_COLOR,
    );
  } else {
    const spritePointSize = toNumber(spriteSizeEl ? spriteSizeEl.value : 4.25, 4.25);
    const spriteResult = buildSpriteObject(
      stlRefinedPoints,
      filteredRange,
      partToGridOffset,
      spritePointSize,
      OUTLINE_COLOR,
      OUTLINE_START,
    );
    renderObject = spriteResult.object;
    pointSpriteMaterial = spriteResult.material;
  }

  scene.add(renderObject);

  if (groundGrid) {
    scene.remove(groundGrid);
  }

  clearReferenceMarkers();

  const bottomOffset = requested.apiView === "voxel"
    ? 0
    : currentPayload.voxelSizeZMm * 0.25;

  const zMinCentered = currentPayload.bounds.min[2] - currentPayload.center[2];
  const zGrid = zMinCentered - bottomOffset;

  if (requested.showBaseGrid) {
    groundGrid = createBuildPlateGrid(
      requested.buildPlateSizeX,
      requested.buildPlateSizeY,
      zGrid,
      GRID_MAJOR_COLOR,
      GRID_MINOR_COLOR,
    );
    scene.add(groundGrid);

    const modelOrigin = [
      partToGridOffset[0] - currentPayload.center[0],
      partToGridOffset[1] - currentPayload.center[1],
    ];

    referenceMarkers = createReferenceMarkers(modelOrigin, [0, 0], zGrid);
    scene.add(referenceMarkers);
  }

  if (shouldInitializeViewTarget) {
    controls.target.set(plateCenter[0], plateCenter[1], zGrid);
    shouldInitializeViewTarget = false;
    controls.update();
  }

  partStatusEl.textContent = `${currentPayload.dataset}`;
  attributeStatusEl.textContent = `${currentPayload.attribute}`;

  drawTrendChart(currentSeriesPayload);
}

async function loadDataFromBackend() {
  activeLoadId += 1;
  const loadId = activeLoadId;

  const requested = getRequestedState();
  const sampleSeed = buildDeterministicSampleSeed(requested);
  setLoadingState(true);
  partStatusEl.textContent = "loading...";
  attributeStatusEl.textContent = "loading...";

  try {
    const payload = await fetchSensorData(requested, {
      dataset: selectedDatasetName,
      sampleSeed,
    });
    if (loadId !== activeLoadId) {
      return;
    }

    currentPayload = payload;
    currentStlFitPayload = currentPayload;
    stlFitParams = null;

    if (requested.apiView === "voxel") {
      const fitRequested = {
        ...requested,
        apiView: "point",
        renderStyle: "sprite",
      };
      try {
        const fitPayload = await fetchSensorData(fitRequested, {
          dataset: selectedDatasetName,
          sampleSeed,
        });
        if (loadId !== activeLoadId) {
          return;
        }
        currentStlFitPayload = fitPayload;
      } catch {
        currentStlFitPayload = currentPayload;
      }
    }

    // STL is optional and must never block point/voxel rendering flow.
    loadStlForDataset(selectedDatasetName).catch(() => {});

    const pointValues = currentPayload.points.map((p) => p[3]);
    const percentile = getPercentileSettings();
    currentPercentileRange = computePercentileRange(pointValues, percentile.low, percentile.high);
    updateColorScaleLabels(currentPercentileRange);

    // Drop any stale series/index mapping before drawing updated 3D visibility.
    currentSeriesPayload = null;
    renderFromCurrentPayload();

    try {
      await loadSeriesForDataset(selectedDatasetName);
    } catch {
      currentSeriesPayload = null;
      drawTrendChart(null);
    }
  } finally {
    if (loadId === activeLoadId) {
      setLoadingState(false);
    }
  }
}

function attachEvents() {
  if (selectFolderEl && folderPickerEl) {
    selectFolderEl.addEventListener("click", () => {
      folderPickerEl.click();
    });
  }

  if (folderPickerEl) {
    folderPickerEl.addEventListener("change", async () => {
      const files = Array.from(folderPickerEl.files ?? []);
      if (!files.length) {
        selectedDatasetName = DEFAULT_DATASET_NAME;
        if (fileStatusEl) {
          fileStatusEl.textContent = `Default: ${DEFAULT_DATASET_NAME}`;
        }
        loadDataFromBackend().catch((error) => {
          partStatusEl.textContent = "failed to load";
          attributeStatusEl.textContent = `${error.message}`;
          setLoadingState(false);
        });
        return;
      }

      const sensorsFile = files.find((f) => f.name.toLowerCase() === "sensors.csv");
      if (!sensorsFile) {
        if (fileStatusEl) {
          fileStatusEl.textContent = "No Sensors.csv found in selected folder";
        }
        return;
      }

      const relPath = sensorsFile.webkitRelativePath || sensorsFile.name;
      const relParts = relPath.split(/[\\/]/).filter(Boolean);
      const rootName = relParts.length > 1
        ? relParts[0]
        : sensorsFile.name.replace(/\.csv$/i, "");
      selectedDatasetName = rootName || "selected-folder";

      if (fileStatusEl) {
        fileStatusEl.textContent = `Loading: ${selectedDatasetName}`;
      }

      loadDataFromBackend().then(() => {
        if (fileStatusEl) {
          fileStatusEl.textContent = `Loaded: ${selectedDatasetName}`;
        }
      }).catch((error) => {
        partStatusEl.textContent = "failed to load";
        attributeStatusEl.textContent = `${error.message}`;
        if (fileStatusEl) {
          fileStatusEl.textContent = `Failed: ${selectedDatasetName}`;
        }
        setLoadingState(false);
      }).finally(() => {
        folderPickerEl.value = "";
      });
    });
  }

  if (openSettingsEl && settingsPanelEl) {
    openSettingsEl.addEventListener("click", () => {
      setSettingsModalOpen(true);
    });
  }

  if (closeSettingsEl && settingsPanelEl) {
    closeSettingsEl.addEventListener("click", () => {
      setSettingsModalOpen(false);
    });
  }

  window.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() === "s") {
      setSettingsModalOpen(true);
    }
  });

  if (viewModeEl) {
    viewModeEl.addEventListener("change", () => {
      loadDataFromBackend().catch((error) => {
        partStatusEl.textContent = "failed to load";
        attributeStatusEl.textContent = `${error.message}`;
        setLoadingState(false);
      });
    });
  }

  if (applySettingsEl) {
    applySettingsEl.addEventListener("click", () => {
      loadDataFromBackend().catch((error) => {
        partStatusEl.textContent = "failed to load";
        attributeStatusEl.textContent = `${error.message}`;
        setLoadingState(false);
      });
    });
  }

  bindDualRange(cutXMinEl, cutXMaxEl, renderFromCurrentPayload);
  bindDualRange(cutYMinEl, cutYMaxEl, renderFromCurrentPayload);
  bindDualRange(cutZMinEl, cutZMaxEl, renderFromCurrentPayload);
  bindDualRange(cutValueMinEl, cutValueMaxEl, renderFromCurrentPayload);

  if (spriteSizeEl) {
    spriteSizeEl.addEventListener("input", () => {
      if (pointSpriteMaterial) {
        pointSpriteMaterial.uniforms.uPointSize.value = Number(spriteSizeEl.value);
      }
    });
  }

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    drawTrendChart(currentSeriesPayload);
  });
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

window.addEventListener("error", (event) => {
  if (partStatusEl) {
    partStatusEl.textContent = "frontend error";
  }
  if (attributeStatusEl) {
    attributeStatusEl.textContent = `${event.message}`;
  }
});

window.addEventListener("unhandledrejection", (event) => {
  if (partStatusEl) {
    partStatusEl.textContent = "frontend error";
  }
  if (attributeStatusEl) {
    const reason = event.reason instanceof Error ? event.reason.message : String(event.reason);
    attributeStatusEl.textContent = `${reason}`;
  }
});

attachEvents();
setSettingsModalOpen(settingsPanelEl ? !settingsPanelEl.classList.contains("hidden") : false);
loadDataFromBackend()
  .then(() => {
    animate();
  })
  .catch((error) => {
    partStatusEl.textContent = "failed to load";
    attributeStatusEl.textContent = `${error.message}`;
    setLoadingState(false);
    animate();
  });
