import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import {
  buildSpriteObject,
  buildVoxelCubeObject,
  buildVoxelCubePrefix,
  createBuildPlateGrid,
  createReferenceMarkers,
} from "./modules/render.js?v=4";
import { bindDualRange } from "./modules/controls.js";
import {
  fetchAttributeSeries,
  fetchAttributeSeriesMulti,
  fetchSensorData,
  fetchSensorPointcloudMulti,
  presignAndUploadCsv,
} from "./modules/api.js?v=6";
import * as dataRefinementModule from "./modules/data_refinement.js?v=5";
import { drawTrendChart as drawTrendChartModule } from "./modules/trend_chart.js?v=2";
import { drawDistributionChart as drawDistributionChartModule } from "./modules/distribution_chart.js?v=5";

const buildCutThresholdsFromModule = dataRefinementModule.buildCutThresholds;
const computePercentileRangeFromModule = dataRefinementModule.computePercentileRange;
const getCutFractionsFromModule = dataRefinementModule.getCutFractions;
const getFilteredPointsByThresholdsFromModule = dataRefinementModule.getFilteredPointsByThresholds;
const fillVoxelizedGapsFromModule = dataRefinementModule.fillVoxelizedGaps;
const applyLastLayerCutFromModule = dataRefinementModule.applyLastLayerCut;

const systemStatusEl = document.getElementById("systemStatus");
const partStatusEl = document.getElementById("partStatus");
const attributeStatusEl = document.getElementById("attributeStatus");

const viewModeEl = document.getElementById("viewMode");
const criteriaEl = document.getElementById("criteria");
const splitViewToggleEl = document.getElementById("splitViewToggle");
const secondaryCriteriaRowEl = document.getElementById("secondaryCriteriaRow");
const secondaryCriteriaEl = document.getElementById("secondaryCriteria");
const selectFolderEl = document.getElementById("selectFolder");
const folderPickerEl = document.getElementById("folderPicker");
const fileStatusEl = document.getElementById("fileStatus");
const cutXMinEl = document.getElementById("cutXMin");
const cutXMaxEl = document.getElementById("cutXMax");
const cutYMinEl = document.getElementById("cutYMin");
const cutYMaxEl = document.getElementById("cutYMax");
const cutZMinEl = document.getElementById("cutZMin");
const cutZMaxEl = document.getElementById("cutZMax");
const cutZRangeEl = document.getElementById("cutZRange");
const cutValueMinEl = document.getElementById("cutValueMin");
const cutValueMaxEl = document.getElementById("cutValueMax");
const cutLineMinEl = document.getElementById("cutLineMin");
const cutLineMaxEl = document.getElementById("cutLineMax");
const lastLayerOnlyEl = document.getElementById("lastLayerOnly");
const cutDisplayModeEl = document.getElementById("cutDisplayMode");
const timelinePlayEl = document.getElementById("timelinePlay");
const timelineSpeedEl = document.getElementById("timelineSpeed");

const voxelSizeEl = document.getElementById("voxelSize");
const voxelSizeZEl = document.getElementById("voxelSizeZ");
const spriteSizeEl = document.getElementById("spriteSize");
const buildPlateSizeXEl = document.getElementById("buildPlateSizeX");
const buildPlateSizeYEl = document.getElementById("buildPlateSizeY");
const showBaseGridEl = document.getElementById("showBaseGrid");
const percentileMinEl = document.getElementById("percentileRangeMin");
const percentileMaxEl = document.getElementById("percentileRangeMax");
const percentileSecondaryMinEl = document.getElementById("percentileRangeSecondaryMin");
const percentileSecondaryMaxEl = document.getElementById("percentileRangeSecondaryMax");
const percentileReadoutEl = document.getElementById("percentileReadout");
const percentileReadoutSecondaryEl = document.getElementById("percentileReadoutSecondary");
const distributionCanvasEl = document.getElementById("distributionCanvas");
const distributionCanvasSecondaryEl = document.getElementById("distributionCanvasSecondary");
const distributionSubpanelSecondaryEl = document.getElementById("distributionSubpanelSecondary");
const fillVoxelizedGapsEl = document.getElementById("fillVoxelizedGaps");
const minVoxelHoleAreaEl = document.getElementById("minVoxelHoleArea");


const openSettingsEl = document.getElementById("openSettings");
const closeSettingsEl = document.getElementById("closeSettings");
const settingsPanelEl = document.getElementById("settingsPanel");
const applySettingsEl = document.getElementById("applySettings");
const trendPanelEl = document.querySelector(".trend-panel");
const controlsPanelEl = document.querySelector(".controls-panel");
const trendCanvasEl = document.getElementById("trendCanvas");
const trendCanvasSecondaryEl = document.getElementById("trendCanvasSecondary");
const trendSubpanelSecondaryEl = document.getElementById("trendSubpanelSecondary");
const colorScalePanelSecondaryEl = document.getElementById("colorScalePanelSecondary");
const colorScaleMinEl = document.getElementById("colorScaleMin");
const colorScaleAvgEl = document.getElementById("colorScaleAvg");
const colorScaleMaxEl = document.getElementById("colorScaleMax");
const colorScaleMinSecondaryEl = document.getElementById("colorScaleMinSecondary");
const colorScaleAvgSecondaryEl = document.getElementById("colorScaleAvgSecondary");
const colorScaleMaxSecondaryEl = document.getElementById("colorScaleMaxSecondary");

const canvas = document.getElementById("scene");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x060a12);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.autoClear = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x060a12);
scene.fog = new THREE.Fog(0x060a12, 350, 1200);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 5000);
camera.up.set(0, 0, 1);
camera.position.set(0, 140, 300);

const secondaryCamera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 5000);
secondaryCamera.up.set(0, 0, 1);
secondaryCamera.position.copy(camera.position);
secondaryCamera.quaternion.copy(camera.quaternion);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0, 0);

scene.add(new THREE.AmbientLight(0xffffff, 0.6));
scene.add(new THREE.HemisphereLight(0xd6ebff, 0x1f2b3d, 0.85));

const directional = new THREE.DirectionalLight(0xffffff, 0.7);
directional.position.set(200, 260, 160);
scene.add(directional);

scene.traverse((node) => {
  if (node.isLight) {
    node.layers.enable(1);
  }
});

const OUTLINE_COLOR = new THREE.Color(0x4a515b);
const OUTLINE_START = 0.77;
const GRID_MAJOR_COLOR = 0x2c4058;
const GRID_MINOR_COLOR = 0x192634;
const LAYER_PRIMARY = 0;
const LAYER_SECONDARY = 1;
const DEFAULT_DATASET_NAME = "small-torture-test_1-0-0";
const CRITERIA_CANDIDATES = [
  "loadCell",
  "ProcessControlPerSeconds",
  "ProcessControlPulsesPerSeconds",
];

let activeLoadId = 0;
let currentPayload = null;
let secondaryPayload = null;
let renderObject = null;
let secondaryRenderObject = null;
let ghostRenderObject = null;
let secondaryGhostRenderObject = null;
let groundGrid = null;
let secondaryGroundGrid = null;
let referenceMarkers = null;
let secondaryReferenceMarkers = null;
let pointSpriteMaterial = null;
let secondaryPointSpriteMaterial = null;
let shouldInitializeViewTarget = true;
let selectedDatasetName = DEFAULT_DATASET_NAME;
let currentSeriesPayload = null;
let secondarySeriesPayload = null;
let currentPercentileRange = { min: 0, max: 1, avg: 0.5 };
let secondaryPercentileRange = { min: 0, max: 1, avg: 0.5 };
let currentVisiblePointIndices = null;
let secondaryVisiblePointIndices = null;
let lastLoadedDatasetName = "";
let lastPointMarker = null;
let secondaryLastPointMarker = null;
let selectedLocalSensorsFile = null;
let selectedS3Key = null; // object key when the CSV was uploaded direct-to-S3
let selectedLocalSystemHint = "m600";
let selectedAttribute = "loadCell";
let selectedSecondaryAttribute = "ProcessControlPerSeconds";
let splitViewAvailable = false;
let loadingState = false;

// Client-side cache of the unified multi-attribute point model + series. Fetched
// once per dataset/sample-size so switching attribute or toggling split view
// recolours instantly without another backend round-trip (point view only).
let multiModel = null;
let multiSeries = null;

const SPLIT_DIVIDER_RATIO = 0.6;

function toNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
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

// Seed for the multi-attribute fast path. Depends only on the dataset so the
// cached point set stays stable across attribute switches and buildplate tweaks
// (those only affect grid placement, not which points were sampled).
function buildMultiSeed() {
  const basis = String(selectedDatasetName || "");
  let hash = 2166136261;
  for (let i = 0; i < basis.length; i += 1) {
    hash ^= basis.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) & 0x7fffffff;
}

// Cache key for the multi-attribute model/series. Intentionally excludes the
// view mode so returning to point view reuses an existing cache.
function buildMultiCacheKey(maxPoints) {
  const localSignature = selectedLocalSensorsFile
    ? `local:${selectedLocalSensorsFile.name}:${selectedLocalSensorsFile.size}`
    : "remote";
  return `${selectedDatasetName}|${maxPoints}|${localSignature}`;
}

// Build a single-attribute point payload (matching fetchSensorData's shape)
// from the cached multi-attribute model. Packed layout per point is
// [cx, cy, cz, index, a0, a1, ...]; we emit [x, y, z, value, index].
function buildPointPayloadFromMulti(model, attribute, requested) {
  const attrIndex = model.attributes.indexOf(attribute);
  const valueColumn = attrIndex >= 0 ? 4 + attrIndex : 4;
  const stride = model.stride;
  const count = model.count;
  const floats = model.floats;
  const points = new Array(count);
  for (let i = 0; i < count; i += 1) {
    const offset = i * stride;
    points[i] = [
      floats[offset],
      floats[offset + 1],
      floats[offset + 2],
      floats[offset + valueColumn],
      floats[offset + 3],
    ];
  }

  const range = (attrIndex >= 0 && model.ranges[attribute])
    ? model.ranges[attribute]
    : { min: 0, max: 0 };

  return {
    dataset: model.dataset,
    system: model.system,
    gridOrigin: model.gridOrigin,
    attribute,
    viewMode: "point",
    voxelSizeMm: requested.voxelSizeMm,
    voxelSizeZMm: requested.voxelSizeZMm,
    backendEngine: model.backendEngine,
    totalPoints: model.totalPoints,
    renderedPoints: count,
    center: model.center.slice(),
    bounds: {
      min: model.bounds.min.slice(),
      max: model.bounds.max.slice(),
    },
    attributeRange: { min: range.min, max: range.max },
    points,
  };
}

// Build a single-attribute series payload (matching fetchAttributeSeries) from
// the cached multi-attribute series. Reconstructs sampledPoints [x,y,z,v,index]
// from the shared sampled coordinates plus this attribute's sampled values.
function buildSeriesPayloadFromMulti(series, attribute) {
  if (!series) {
    return null;
  }
  const entry = series.series ? series.series[attribute] : null;
  const sampledValues = entry ? entry.sampledValues : [];
  const range = entry ? entry.range : { min: 0, max: 0 };
  const sampledIndices = Array.isArray(series.sampledIndices) ? series.sampledIndices : [];
  const sampledCoords = Array.isArray(series.sampledCoords) ? series.sampledCoords : [];

  const sampledPoints = new Array(sampledValues.length);
  for (let i = 0; i < sampledValues.length; i += 1) {
    const coord = sampledCoords[i] || [0, 0, 0];
    sampledPoints[i] = [
      coord[0],
      coord[1],
      coord[2],
      sampledValues[i],
      sampledIndices[i] ?? i,
    ];
  }

  return {
    dataset: series.dataset,
    attribute,
    totalSamples: series.totalSamples,
    sampledValues,
    sampledIndices,
    sampledPoints,
    range: { min: range.min, max: range.max },
  };
}

function setDisabled(el, disabled) {
  if (el) {
    el.disabled = disabled;
  }
}

function setObjectLayerRecursive(object, layer) {
  if (!object) {
    return;
  }
  object.traverse((node) => {
    node.layers.set(layer);
  });
}

function syncSecondaryCameraTransform() {
  secondaryCamera.position.copy(camera.position);
  secondaryCamera.quaternion.copy(camera.quaternion);
  secondaryCamera.up.copy(camera.up);
}

function getSplitViewportLayout(width, height) {
  const minPaneWidth = 220;
  const rawDividerX = Math.floor(width * SPLIT_DIVIDER_RATIO);
  const dividerX = Math.max(minPaneWidth, Math.min(width - minPaneWidth, rawDividerX));
  return {
    dividerX,
    leftX: 0,
    leftWidth: dividerX,
    rightX: dividerX,
    rightWidth: Math.max(1, width - dividerX),
    height,
  };
}

function updateSplitCssLayoutVariables() {
  const width = Math.max(1, window.innerWidth);
  const layout = getSplitViewportLayout(width, Math.max(1, window.innerHeight));
  document.documentElement.style.setProperty("--split-divider-x", `${layout.dividerX}px`);
}

function updateCameraProjectionForLayout() {
  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);
  if (!isSplitLayoutActive()) {
    const aspect = width / height;
    camera.clearViewOffset();
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    secondaryCamera.clearViewOffset();
    secondaryCamera.aspect = aspect;
    secondaryCamera.updateProjectionMatrix();
    return;
  }

  const layout = getSplitViewportLayout(width, height);

  // Right pane: model stays centred. Its origin sits rightWidth/2 to the right
  // of the divider.
  secondaryCamera.clearViewOffset();
  secondaryCamera.aspect = layout.rightWidth / height;
  secondaryCamera.updateProjectionMatrix();

  // Left pane: offset the model so its origin lands the same distance to the
  // LEFT of the divider as the right model is to the right of it. The left pane
  // centre is leftWidth/2 from the divider; the target is rightWidth/2 from the
  // divider, so shift the model rightward (toward the divider) by
  // (leftWidth - rightWidth) / 2 pixels. setViewOffset shifts the frustum left
  // by the same amount, which moves the rendered model right.
  const leftShiftPx = (layout.leftWidth - layout.rightWidth) / 2;
  camera.aspect = layout.leftWidth / height;
  camera.setViewOffset(
    layout.leftWidth,
    height,
    -leftShiftPx,
    0,
    layout.leftWidth,
    height,
  );
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
  };
}

function isSplitViewEnabled() {
  return Boolean(splitViewToggleEl && splitViewToggleEl.getAttribute("aria-pressed") === "true");
}

function setSplitViewEnabled(enabled) {
  if (!splitViewToggleEl) {
    return;
  }
  splitViewToggleEl.setAttribute("aria-pressed", enabled ? "true" : "false");
  // Show the action the button performs, not the current state: in single mode
  // it offers "Splitscreen", and in split mode it offers "Single Screen".
  splitViewToggleEl.textContent = enabled ? "Single Screen" : "Splitscreen";
  splitViewToggleEl.classList.toggle("is-active", enabled);
}

function isSplitLayoutActive() {
  return isSplitViewEnabled() && Boolean(secondaryPayload);
}

function getSecondaryAttributeFallback(primaryAttribute, options) {
  const available = Array.isArray(options) ? options : [];
  for (const candidate of CRITERIA_CANDIDATES) {
    if (candidate !== primaryAttribute && available.includes(candidate)) {
      return candidate;
    }
  }
  return primaryAttribute;
}

function updateSplitControlsVisibility() {
  let forcedOff = false;
  if (!splitViewAvailable && isSplitViewEnabled()) {
    setSplitViewEnabled(false);
    forcedOff = true;
  }

  if (forcedOff) {
    secondaryPayload = null;
    secondarySeriesPayload = null;
    secondaryVisiblePointIndices = null;
    updateCameraProjectionForLayout();
  }

  if (secondaryCriteriaRowEl) {
    secondaryCriteriaRowEl.hidden = !isSplitViewEnabled() || !splitViewAvailable;
  }
  if (trendSubpanelSecondaryEl) {
    trendSubpanelSecondaryEl.classList.toggle("hidden", !isSplitViewEnabled() || !splitViewAvailable);
  }
  if (splitViewToggleEl) {
    setDisabled(splitViewToggleEl, loadingState || !splitViewAvailable);
  }
  setDisabled(secondaryCriteriaEl, loadingState || !isSplitViewEnabled() || !splitViewAvailable);
  updateTrendPanelLayout();
}

function updateTrendPanelLayout() {
  const showSecondary = isSplitLayoutActive();
  document.body.classList.toggle("split-layout-active", showSecondary);
  updateSplitCssLayoutVariables();
  if (trendSubpanelSecondaryEl) {
    trendSubpanelSecondaryEl.classList.toggle("hidden", !showSecondary);
  }
  if (trendPanelEl) {
    trendPanelEl.classList.toggle("split-active", showSecondary);
  }
  if (distributionSubpanelSecondaryEl) {
    distributionSubpanelSecondaryEl.classList.toggle("hidden", !showSecondary);
  }
  if (colorScalePanelSecondaryEl) {
    colorScalePanelSecondaryEl.classList.toggle("hidden", !showSecondary);
  }
}

function setLoadingState(isLoading) {
  loadingState = isLoading;
  if (isLoading) {
    // A reload will produce its own render; don't restore the old payload here.
    stopTimeline({ restore: false });
  }
  setDisabled(selectFolderEl, isLoading);
  setDisabled(viewModeEl, isLoading);
  setDisabled(criteriaEl, isLoading);
  setDisabled(applySettingsEl, isLoading);
  setDisabled(voxelSizeEl, isLoading);
  setDisabled(voxelSizeZEl, isLoading);
  setDisabled(spriteSizeEl, isLoading);
  setDisabled(buildPlateSizeXEl, isLoading);
  setDisabled(buildPlateSizeYEl, isLoading);
  setDisabled(showBaseGridEl, isLoading);
  setDisabled(percentileMinEl, isLoading);
  setDisabled(percentileMaxEl, isLoading);
  setDisabled(percentileSecondaryMinEl, isLoading || !isSplitLayoutActive());
  setDisabled(percentileSecondaryMaxEl, isLoading || !isSplitLayoutActive());
  setDisabled(fillVoxelizedGapsEl, isLoading);
  setDisabled(minVoxelHoleAreaEl, isLoading);
  setDisabled(timelinePlayEl, isLoading);
  setDisabled(timelineSpeedEl, isLoading);
  updateSplitControlsVisibility();
}

function getPercentileControls(which = "primary") {
  if (which === "secondary") {
    return {
      minEl: percentileSecondaryMinEl,
      maxEl: percentileSecondaryMaxEl,
      readoutEl: percentileReadoutSecondaryEl,
    };
  }
  return {
    minEl: percentileMinEl,
    maxEl: percentileMaxEl,
    readoutEl: percentileReadoutEl,
  };
}

function getPercentileSettings(which = "primary") {
  const { minEl, maxEl } = getPercentileControls(which);
  const rawMin = toNumber(minEl ? minEl.value : 1, 1);
  const rawMax = toNumber(maxEl ? maxEl.value : 99, 99);
  const lo = Math.max(0, Math.min(100, Math.min(rawMin, rawMax)));
  const hi = Math.max(lo + 0.1, Math.min(100, Math.max(rawMin, rawMax)));
  return {
    low: lo / 100,
    high: hi / 100,
  };
}

function updatePercentileReadout(which = "primary") {
  const { minEl, maxEl, readoutEl } = getPercentileControls(which);
  if (!readoutEl) {
    return;
  }
  const rawMin = toNumber(minEl ? minEl.value : 1, 1);
  const rawMax = toNumber(maxEl ? maxEl.value : 99, 99);
  const lo = Math.min(rawMin, rawMax);
  const hi = Math.max(rawMin, rawMax);
  const fmt = (v) => (Number.isInteger(v) ? `${v}` : v.toFixed(1));
  readoutEl.textContent = `${fmt(lo)}% \u2013 ${fmt(hi)}%`;
}

function computePercentileRange(values, low = 0.01, high = 0.99) {
  return computePercentileRangeFromModule(values, low, high);
}

function updateColorScaleLabels(range, which = "primary") {
  const isSecondary = which === "secondary";
  const maxEl = isSecondary ? colorScaleMaxSecondaryEl : colorScaleMaxEl;
  const avgEl = isSecondary ? colorScaleAvgSecondaryEl : colorScaleAvgEl;
  const minEl = isSecondary ? colorScaleMinSecondaryEl : colorScaleMinEl;

  if (maxEl) {
    maxEl.textContent = `${Math.round(range.max)}`;
  }
  if (avgEl) {
    avgEl.textContent = `${Math.round(range.avg)}`;
  }
  if (minEl) {
    minEl.textContent = `${Math.round(range.min)}`;
  }
}

function drawTrendChart(seriesPayload) {
  drawTrendChartModule({
    trendCanvasEl,
    seriesPayload,
    visiblePointIndices: currentVisiblePointIndices,
    getPercentileSettings: () => getPercentileSettings("primary"),
    currentAttribute: currentPayload?.attribute,
    lineCutFractions: getCutFractions(),
  });
}

function drawSecondaryTrendChart(seriesPayload) {
  if (!trendCanvasSecondaryEl) {
    return;
  }
  drawTrendChartModule({
    trendCanvasEl: trendCanvasSecondaryEl,
    seriesPayload,
    visiblePointIndices: secondaryVisiblePointIndices,
    getPercentileSettings: () => getPercentileSettings("secondary"),
    currentAttribute: secondaryPayload?.attribute || selectedSecondaryAttribute,
    lineCutFractions: getCutFractions(),
  });
}

function getAttributeDisplayName() {
  const rawAttribute = currentPayload?.attribute || selectedAttribute || "loadCell";
  return rawAttribute
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

function normalizeColumnName(name) {
  if (!name) {
    return "";
  }
  return String(name).replace(/^\ufeff/, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function refreshCriteriaOptions(availableCriteria) {
  if (!criteriaEl) {
    return;
  }

  const availableSet = new Set((availableCriteria || []).map((name) => normalizeColumnName(name)));
  const filtered = CRITERIA_CANDIDATES.filter((name) => availableSet.has(normalizeColumnName(name)));
  const options = filtered.length ? filtered : ["loadCell"];
  splitViewAvailable = options.length > 1;

  if (!options.includes(selectedAttribute)) {
    selectedAttribute = options[0];
  }

  if (!options.includes(selectedSecondaryAttribute)) {
    selectedSecondaryAttribute = getSecondaryAttributeFallback(selectedAttribute, options);
  }

  if (!splitViewAvailable) {
    selectedSecondaryAttribute = selectedAttribute;
  }

  criteriaEl.innerHTML = "";
  options.forEach((name) => {
    const optionEl = document.createElement("option");
    optionEl.value = name;
    optionEl.textContent = name;
    criteriaEl.appendChild(optionEl);
  });
  criteriaEl.value = selectedAttribute;

  if (secondaryCriteriaEl) {
    secondaryCriteriaEl.innerHTML = "";
    options.forEach((name) => {
      if (name === selectedAttribute && options.length > 1) {
        return;
      }
      const optionEl = document.createElement("option");
      optionEl.value = name;
      optionEl.textContent = name;
      secondaryCriteriaEl.appendChild(optionEl);
    });

    if (!Array.from(secondaryCriteriaEl.options).some((opt) => opt.value === selectedSecondaryAttribute)) {
      selectedSecondaryAttribute = getSecondaryAttributeFallback(selectedAttribute, options);
    }
    secondaryCriteriaEl.value = selectedSecondaryAttribute;
  }

  updateSplitControlsVisibility();
}

function getCurrentCriteriaOptions() {
  if (!criteriaEl) {
    return ["loadCell"];
  }
  const values = Array.from(criteriaEl.options).map((opt) => opt.value).filter(Boolean);
  return values.length ? values : ["loadCell"];
}

async function getAvailableCriteriaFromLocalCsv(csvFile) {
  if (!csvFile) {
    return ["loadCell"];
  }

  try {
    const headerChunk = await csvFile.slice(0, 262144).text();
    const firstLine = headerChunk.split(/\r?\n/, 1)[0] || "";
    if (!firstLine) {
      return ["loadCell"];
    }

    const csvColumns = firstLine
      .split(",")
      .map((entry) => entry.trim().replace(/^"|"$/g, ""));
    const normalizedColumns = new Set(csvColumns.map((col) => normalizeColumnName(col)));

    const available = CRITERIA_CANDIDATES.filter(
      (name) => normalizedColumns.has(normalizeColumnName(name)),
    );
    return available.length ? available : ["loadCell"];
  } catch {
    return ["loadCell"];
  }
}

async function getAvailableCriteriaFromBackendDataset(datasetName) {
  if (!datasetName) {
    return ["loadCell"];
  }

  try {
    const params = new URLSearchParams({ dataset: datasetName });
    const response = await fetch(`/api/datasets/criteria?${params.toString()}`);
    if (!response.ok) {
      return ["loadCell"];
    }

    const payload = await response.json();
    const columns = Array.isArray(payload.criteria) ? payload.criteria : [];
    const normalizedColumns = new Set(columns.map((name) => normalizeColumnName(name)));
    const available = CRITERIA_CANDIDATES.filter(
      (name) => normalizedColumns.has(normalizeColumnName(name)),
    );

    return available.length ? available : ["loadCell"];
  } catch {
    return ["loadCell"];
  }
}

function formatSystemLabel(system) {
  const raw = (system || "unknown").toLowerCase();
  if (raw === "engine") {
    return "Engine";
  }
  if (raw === "m600") {
    return "M600";
  }
  return raw.toUpperCase();
}

function isWithinPlate(bounds2d, plateBounds, eps = 1e-3) {
  return bounds2d.minX >= plateBounds.minX - eps
    && bounds2d.maxX <= plateBounds.maxX + eps
    && bounds2d.minY >= plateBounds.minY - eps
    && bounds2d.maxY <= plateBounds.maxY + eps;
}

function computeAutoCenterCorrection(payload, requested, shouldCenterGrid) {
  if (!payload || !payload.bounds || !payload.bounds.min || !payload.bounds.max) {
    return { applied: false, offset: [0, 0] };
  }

  const minX = Number(payload.bounds.min[0]);
  const minY = Number(payload.bounds.min[1]);
  const maxX = Number(payload.bounds.max[0]);
  const maxY = Number(payload.bounds.max[1]);

  if (![minX, minY, maxX, maxY].every(Number.isFinite)) {
    return { applied: false, offset: [0, 0] };
  }

  const extent = {
    minX,
    minY,
    maxX,
    maxY,
  };

  const plateMinX = shouldCenterGrid ? (-requested.buildPlateSizeX / 2) : 0;
  const plateMinY = shouldCenterGrid ? (-requested.buildPlateSizeY / 2) : 0;
  const plateBounds = {
    minX: plateMinX,
    minY: plateMinY,
    maxX: plateMinX + requested.buildPlateSizeX,
    maxY: plateMinY + requested.buildPlateSizeY,
  };

  if (isWithinPlate(extent, plateBounds)) {
    return { applied: false, offset: [0, 0] };
  }

  const sourceCenterX = (extent.minX + extent.maxX) * 0.5;
  const sourceCenterY = (extent.minY + extent.maxY) * 0.5;
  const targetCenterX = (plateBounds.minX + plateBounds.maxX) * 0.5;
  const targetCenterY = (plateBounds.minY + plateBounds.maxY) * 0.5;

  const dx = targetCenterX - sourceCenterX;
  const dy = targetCenterY - sourceCenterY;
  const shifted = {
    minX: extent.minX + dx,
    minY: extent.minY + dy,
    maxX: extent.maxX + dx,
    maxY: extent.maxY + dy,
  };

  if (!isWithinPlate(shifted, plateBounds)) {
    return { applied: false, offset: [0, 0] };
  }

  if (Math.hypot(dx, dy) < 1e-3) {
    return { applied: false, offset: [0, 0] };
  }

  return {
    applied: true,
    offset: [dx, dy],
  };
}

function isLineCutActive(cutFractions) {
  return cutFractions.lineMin > 0 || cutFractions.lineMax < 1;
}

// Print timeline playback: animates the line-cut MAX from its current value to
// 100%, progressively revealing points in print order. One full 0->100% sweep
// takes TIMELINE_BASE_DURATION_MS at 1x speed.
const TIMELINE_BASE_DURATION_MS = 12000;
// Width (in points) of the sprite reveal fade band at the print head. Small so
// the reveal stays crisp and follows execution order rather than smearing into
// a soft bottom-to-top wash. Narrower = points reach full size faster.
const TIMELINE_SPRITE_FADE_POINTS = 40;

let timelinePlaying = false;
let timelineRafId = null;
let timelineLastTs = 0;
// Fractional max carried across frames so sub-step advances accumulate smoothly.
let timelineMaxValue = 100;
// When true, renderFromCurrentPayload skips static work (grid, charts, status)
// that never changes mid-playback, so each frame only rebuilds the point cloud.
let timelineLightweightRender = false;
// Fast playback path: a single GPU buffer of all static-cut-passing points,
// sorted by print order. Each frame only adjusts the geometry draw range (an
// integer) instead of re-filtering/re-coloring/re-uploading the whole cloud.
let timelineFastActive = false;
let timelinePrefix = null; // { object, geometry, positions, sortedLine, minLine, lineSpan }
let timelineMarker = null; // { group, sphere, stemGeom }

function getTimelineSpeed() {
  const raw = toNumber(timelineSpeedEl ? timelineSpeedEl.value : 0.2, 0.2);
  return Math.max(0.03, Math.min(0.75, raw));
}

function setTimelinePlayingState(playing) {
  timelinePlaying = playing;
  if (timelinePlayEl) {
    timelinePlayEl.textContent = playing ? "\u23f8 Pause" : "\u25b6 Play";
    timelinePlayEl.classList.toggle("is-playing", playing);
  }
}

// First index whose value is >= target (ascending Float64Array).
function lowerBound(arr, target) {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] < target) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

// First index whose value is > target (ascending Float64Array).
function upperBound(arr, target) {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] <= target) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

// Update the line-cut dual-range track fill without dispatching an input event
// (so playback frames don't trigger the expensive full render handler).
function updateLineCutVisual() {
  if (!cutLineMinEl || !cutLineMaxEl || !cutLineMinEl.parentElement) {
    return;
  }
  const minV = toNumber(cutLineMinEl.value, 0);
  const maxV = toNumber(cutLineMaxEl.value, 100);
  const parent = cutLineMinEl.parentElement;
  parent.style.setProperty("--start", `${Math.min(minV, maxV)}%`);
  parent.style.setProperty("--end", `${Math.max(minV, maxV)}%`);
}

// Distance (mm) the Wire Nozzle marker's origin sits ABOVE the highlighted
// point. The vertical stem connects the point up to this origin.
const NOZZLE_MARKER_OFFSET_MM = 35;
let nozzleGeometryPromise = null;

// Load the Wire Nozzle STL once and cache the parsed geometry. The asset is
// served from /assets (mounted in app.py). Returns null on failure so callers
// can fall back gracefully (marker simply has no mesh yet).
function loadNozzleGeometry() {
  if (!nozzleGeometryPromise) {
    const loader = new STLLoader();
    nozzleGeometryPromise = loader
      .loadAsync("/assets/Wire%20Nozzle/Wire%20Nozzle.stl")
      .then((geometry) => {
        geometry.computeVertexNormals();
        return geometry;
      })
      .catch(() => null);
  }
  return nozzleGeometryPromise;
}

// Build a 50%-transparent Wire Nozzle mesh used as the highlighted-point
// marker. The STL is oriented so its local Z axis aligns with the render
// workspace X axis, and the caller positions the mesh origin 35 mm above the
// highlighted point. Geometry loads async; each mesh owns a clone so it can be
// disposed independently of the shared cache.
function createNozzleMarkerMesh() {
  const material = new THREE.MeshStandardMaterial({
    color: 0x39ff14,
    transparent: true,
    opacity: 0.5,
    metalness: 0.2,
    roughness: 0.55,
  });
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  // Align the STL's local Z axis with the workspace X axis.
  mesh.rotation.y = Math.PI / 2;
  loadNozzleGeometry().then((geometry) => {
    if (geometry) {
      mesh.geometry = geometry.clone();
    }
  });
  return mesh;
}

function ensureTimelineMarker() {
  if (timelineMarker) {
    return;
  }
  const group = new THREE.Group();
  const nozzle = createNozzleMarkerMesh();
  group.add(nozzle);
  const stemGeom = new THREE.BufferGeometry();
  stemGeom.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3),
  );
  const stem = new THREE.Line(
    stemGeom,
    new THREE.LineBasicMaterial({ color: 0x39ff14, toneMapped: false }),
  );
  group.add(stem);
  group.visible = false;
  timelineMarker = { group, nozzle, stemGeom };
  scene.add(group);
}

function moveTimelineMarker(x, y, z) {
  ensureTimelineMarker();
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    timelineMarker.group.visible = false;
    return;
  }
  const zTop = z + NOZZLE_MARKER_OFFSET_MM;
  timelineMarker.group.visible = true;
  timelineMarker.nozzle.position.set(x, y, zTop);
  const posAttr = timelineMarker.stemGeom.getAttribute("position");
  const arr = posAttr.array;
  arr[0] = x; arr[1] = y; arr[2] = z;
  arr[3] = x; arr[4] = y; arr[5] = zTop;
  posAttr.needsUpdate = true;
}

function clearTimelineMarker() {
  if (!timelineMarker) {
    return;
  }
  scene.remove(timelineMarker.group);
  disposeObject3D(timelineMarker.group);
  timelineMarker = null;
}

// Build the one-time sorted prefix buffer for fast playback. Filters by the
// static cuts (X/Y/Z/value) but NOT the line cut, sorts the survivors by print
// order (p[4]), and uploads the geometry to the GPU once. Supports both the
// sprite path (draw-range + GPU reveal) and the voxel-cube path (InstancedMesh
// count + edge draw-range).
function buildTimelinePrefix() {
  teardownTimelinePrefix();
  if (!currentPayload) {
    return false;
  }

  const requested = getRequestedState();
  const isCube = requested.apiView === "voxel" && requested.renderStyle === "cube";

  const cut = getCutFractions();
  const staticCut = { ...cut, lineMin: 0, lineMax: 1 };
  const staticThresholds = buildCutThresholds(currentPayload, staticCut);
  let filtered = getFilteredPointsByThresholds(currentPayload, staticThresholds);
  filtered = applyLastLayerCut(filtered);
  if (isCube) {
    filtered = fillVoxelizedGaps(filtered, requested, currentPayload);
  }
  // Fast path reveals real points in print order; skip gap-filled points
  // (NaN p[4]) which have no meaningful timeline position.
  const pts = filtered.filter((p) => Number.isFinite(Number(p[4])));
  pts.sort((a, b) => a[4] - b[4]);

  const xyOffset = [currentPayload.center[0], currentPayload.center[1]];
  const range = {
    min: currentPercentileRange.min,
    max: currentPercentileRange.max,
  };

  const count = pts.length;
  const sortedLine = new Float64Array(count);
  for (let i = 0; i < count; i += 1) {
    sortedLine[i] = Number(pts[i][4]);
  }

  // Remove the normal point cloud (grid, charts and status stay untouched).
  clearRenderObject();
  clearLastPointMarker();

  if (isCube) {
    const prefix = buildVoxelCubePrefix(
      pts,
      range,
      currentPayload.voxelSizeMm,
      currentPayload.voxelSizeZMm,
      requested.voxelEdgeSize,
      xyOffset,
      GRID_MAJOR_COLOR,
    );
    scene.add(prefix.object);
    timelinePrefix = {
      mode: "cube",
      object: prefix.object,
      mesh: prefix.mesh,
      edgeGeometry: prefix.edgeGeometry,
      edgeVertexCount: prefix.edgeVertexCount,
      originalMatrices: prefix.originalMatrices,
      positions: prefix.positions,
      sortedLine,
      minLine: count > 0 ? sortedLine[0] : 0,
      lineSpan: count > 0 ? sortedLine[count - 1] - sortedLine[0] : 0,
      count,
      currentLo: 0,
    };
  } else {
    const size = toNumber(spriteSizeEl ? spriteSizeEl.value : 4.25, 4.25);
    const { object, material } = buildSpriteObject(
      pts,
      range,
      xyOffset,
      size,
      OUTLINE_COLOR,
      OUTLINE_START,
    );
    scene.add(object);
    pointSpriteMaterial = material; // keep sprite-size live editing working
    // Keep the GPU reveal fade a THIN leading edge (a small fixed number of
    // points) so points pop in crisply in execution order. The default 0.04 is
    // a fraction of ALL points (thousands across many layers), which smears the
    // reveal into a soft bottom-to-top wash instead of following the print head.
    if (material.uniforms && material.uniforms.uFade) {
      material.uniforms.uFade.value = Math.min(
        0.04,
        TIMELINE_SPRITE_FADE_POINTS / Math.max(count - 1, 1),
      );
    }
    timelinePrefix = {
      mode: "sprite",
      object,
      geometry: object.geometry,
      material,
      positions: object.geometry.getAttribute("position").array,
      sortedLine,
      minLine: count > 0 ? sortedLine[0] : 0,
      lineSpan: count > 0 ? sortedLine[count - 1] - sortedLine[0] : 0,
      count,
    };
  }

  ensureTimelineMarker();
  return true;
}

function teardownTimelinePrefix() {
  if (timelinePrefix) {
    scene.remove(timelinePrefix.object);
    disposeObject3D(timelinePrefix.object);
    if (timelinePrefix.material && pointSpriteMaterial === timelinePrefix.material) {
      pointSpriteMaterial = null;
    }
    timelinePrefix = null;
  }
  clearTimelineMarker();
}

// Collapse instances below `lo` (InstancedMesh.count only trims the top) and
// restore them when `lo` shrinks. Only runs work when `lo` actually changes,
// so steady-state playback (fixed line-min) stays O(1) per frame.
function reconcileCubeLowerBound(prefix, lo) {
  if (lo === prefix.currentLo) {
    return;
  }
  const arr = prefix.mesh.instanceMatrix.array;
  const orig = prefix.originalMatrices;
  if (lo > prefix.currentLo) {
    for (let i = prefix.currentLo; i < lo; i += 1) {
      const base = i * 16;
      for (let k = 0; k < 16; k += 1) {
        arr[base + k] = 0;
      }
      arr[base + 15] = 1; // valid (degenerate, zero-area) matrix -> not drawn
    }
  } else {
    for (let i = lo; i < prefix.currentLo; i += 1) {
      const base = i * 16;
      for (let k = 0; k < 16; k += 1) {
        arr[base + k] = orig[base + k];
      }
    }
  }
  prefix.mesh.instanceMatrix.needsUpdate = true;
  prefix.currentLo = lo;
}

// Cheap per-frame update for the fast path: O(log N) window computation plus an
// integer draw-range / instance-count adjustment.
function timelineFastFrame() {
  if (!timelinePrefix) {
    return;
  }
  const prefix = timelinePrefix;
  const { sortedLine, minLine, lineSpan, positions } = prefix;
  const count = sortedLine.length;
  if (count === 0) {
    if (prefix.mode === "cube") {
      prefix.mesh.count = 0;
      if (prefix.edgeGeometry) {
        prefix.edgeGeometry.setDrawRange(0, 0);
      }
    } else {
      prefix.geometry.setDrawRange(0, 0);
    }
    if (timelineMarker) {
      timelineMarker.group.visible = false;
    }
    return;
  }
  const cut = getCutFractions();
  const eps = 1e-6;
  const minT = minLine + lineSpan * cut.lineMin;
  const maxT = minLine + lineSpan * cut.lineMax;
  const lo = lowerBound(sortedLine, minT - eps);
  const hi = upperBound(sortedLine, maxT + eps);
  const drawCount = Math.max(0, hi - lo);

  if (prefix.mode === "cube") {
    prefix.mesh.count = hi;
    reconcileCubeLowerBound(prefix, lo);
    if (prefix.edgeGeometry) {
      const evc = prefix.edgeVertexCount;
      prefix.edgeGeometry.setDrawRange(lo * evc, drawCount * evc);
    }
  } else {
    prefix.geometry.setDrawRange(lo, drawCount);
    // Drive the GPU reveal: aOrder is i/(count-1), so set the reveal boundary at
    // the newest drawn vertex so the trailing uFade band grows in (feature B).
    if (prefix.material && prefix.material.uniforms && prefix.material.uniforms.uReveal) {
      prefix.material.uniforms.uReveal.value = hi / Math.max(count - 1, 1);
    }
  }

  if (drawCount > 0) {
    const idx = hi - 1;
    moveTimelineMarker(positions[idx * 3], positions[idx * 3 + 1], positions[idx * 3 + 2]);
  } else if (timelineMarker) {
    timelineMarker.group.visible = false;
  }
}

// Tear down playback state. Returns whether the fast path was active.
function stopTimelineCore() {
  if (timelineRafId !== null) {
    cancelAnimationFrame(timelineRafId);
    timelineRafId = null;
  }
  timelineLastTs = 0;
  setTimelinePlayingState(false);
  const wasFast = timelineFastActive;
  timelineFastActive = false;
  if (wasFast) {
    teardownTimelinePrefix();
  }
  return wasFast;
}

function stopTimeline(options) {
  const restore = !options || options.restore !== false;
  const wasFast = stopTimelineCore();
  // Restore the normal full render at the stopped line-cut position.
  if (restore && wasFast && currentPayload) {
    renderFromCurrentPayload();
  }
}

function setLineCutMax(value, lightweight = false) {
  if (!cutLineMaxEl) {
    return;
  }
  const lineMin = toNumber(cutLineMinEl ? cutLineMinEl.value : 0, 0);
  // Keep a fine (sub-percent) fraction so points are revealed smoothly rather
  // than in visible 1% chunks. Round to 3 decimals to avoid float churn.
  const clamped = Math.max(lineMin, Math.min(100, value));
  const next = clamped.toFixed(3);
  if (next === cutLineMaxEl.value) {
    return;
  }
  cutLineMaxEl.value = next;
  // Reuse the dual-range input handler so the track visual and render update.
  timelineLightweightRender = lightweight;
  cutLineMaxEl.dispatchEvent(new Event("input", { bubbles: true }));
  timelineLightweightRender = false;
}

// Advance the line-cut max during the fast path without a full render.
function advanceLineCutMaxFast(value) {
  if (!cutLineMaxEl) {
    return;
  }
  const lineMin = toNumber(cutLineMinEl ? cutLineMinEl.value : 0, 0);
  const clamped = Math.max(lineMin, Math.min(100, value));
  cutLineMaxEl.value = clamped.toFixed(3);
  updateLineCutVisual();
  timelineFastFrame();
}

function timelineStep(ts) {
  if (!timelinePlaying) {
    return;
  }
  if (!timelineLastTs) {
    timelineLastTs = ts;
  }
  const dt = ts - timelineLastTs;
  timelineLastTs = ts;

  const advance = (dt / TIMELINE_BASE_DURATION_MS) * 100 * getTimelineSpeed();
  timelineMaxValue = Math.min(100, timelineMaxValue + advance);
  if (timelineFastActive) {
    advanceLineCutMaxFast(timelineMaxValue);
  } else {
    setLineCutMax(timelineMaxValue, true);
  }

  if (timelineMaxValue >= 100) {
    stopTimeline();
    return;
  }
  timelineRafId = requestAnimationFrame(timelineStep);
}

function toggleTimeline() {
  if (!currentPayload) {
    return;
  }
  if (timelinePlaying) {
    stopTimeline();
    return;
  }

  // Both the sprite path and the voxel-cube path now build a one-time GPU
  // buffer and reveal points by adjusting an integer window per frame, so every
  // render mode is eligible for the fast playback path.
  const lineMin = toNumber(cutLineMinEl ? cutLineMinEl.value : 0, 0);
  let lineMax = toNumber(cutLineMaxEl ? cutLineMaxEl.value : 100, 100);
  // If already at the end, restart the sweep from the range start.
  if (lineMax >= 100) {
    lineMax = lineMin;
  }
  timelineMaxValue = lineMax;
  timelineLastTs = 0;

  if (!isSplitViewEnabled() && buildTimelinePrefix()) {
    timelineFastActive = true;
    advanceLineCutMaxFast(lineMax);
  } else {
    timelineFastActive = false;
    setLineCutMax(lineMax);
  }

  setTimelinePlayingState(true);
  timelineRafId = requestAnimationFrame(timelineStep);
}

function drawDistributionChart(which = "primary") {
  updatePercentileReadout(which);
  const isSecondary = which === "secondary";
  const payload = isSecondary ? secondaryPayload : currentPayload;
  const canvasEl = isSecondary ? distributionCanvasSecondaryEl : distributionCanvasEl;
  const points = payload && Array.isArray(payload.points)
    ? payload.points
    : null;

  let attributeName = getAttributeDisplayName();
  if (isSecondary) {
    const raw = payload?.attribute || selectedSecondaryAttribute || "loadCell";
    attributeName = raw
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/^./, (c) => c.toUpperCase());
  }

  drawDistributionChartModule({
    canvasEl,
    points,
    valueIndex: 3,
    percentile: getPercentileSettings(which),
    attributeName,
  });
}

function onPercentileChanged(which = "primary") {
  const isSecondary = which === "secondary";
  const payload = isSecondary ? secondaryPayload : currentPayload;

  if (!payload || !Array.isArray(payload.points)) {
    updatePercentileReadout(which);
    return;
  }

  const pointValues = payload.points.map((p) => p[3]);
  const percentile = getPercentileSettings(which);
  const nextRange = computePercentileRange(pointValues, percentile.low, percentile.high);

  if (isSecondary) {
    secondaryPercentileRange = nextRange;
    updateColorScaleLabels(secondaryPercentileRange, "secondary");
  } else {
    currentPercentileRange = nextRange;
    updateColorScaleLabels(currentPercentileRange, "primary");
  }

  renderFromCurrentPayload();
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

function updateVisibleSeriesIndicesFor(cutFractions, cutThresholds, payload, seriesPayload) {
  const hasAnyCut = !(cutFractions.xMin === 0 && cutFractions.xMax === 1
    && cutFractions.yMin === 0 && cutFractions.yMax === 1
    && cutFractions.zMin === 0 && cutFractions.zMax === 1
    && cutFractions.valueMin === 0 && cutFractions.valueMax === 1
    && cutFractions.lineMin === 0 && cutFractions.lineMax === 1);

  if (!hasAnyCut) {
    return null;
  }

  const seriesCutPayload = buildSeriesCutPayload(seriesPayload, payload);
  const visibilitySourcePayload = seriesCutPayload && seriesCutPayload.points.length
    ? seriesCutPayload
    : payload;
  const visibleSourcePoints = getFilteredPointsByThresholds(visibilitySourcePayload, cutThresholds);

  return new Set(
    visibleSourcePoints
      .map((p) => Math.trunc(p[4]))
      .filter((v) => Number.isFinite(v)),
  );
}

function updateVisibleSeriesIndices(cutFractions, cutThresholds) {
  currentVisiblePointIndices = updateVisibleSeriesIndicesFor(
    cutFractions,
    cutThresholds,
    currentPayload,
    currentSeriesPayload,
  );

  if (isSplitViewEnabled() && secondaryPayload) {
    secondaryVisiblePointIndices = updateVisibleSeriesIndicesFor(
      cutFractions,
      cutThresholds,
      secondaryPayload,
      secondarySeriesPayload,
    );
  } else {
    secondaryVisiblePointIndices = null;
  }
}

async function loadSeriesForDataset(datasetName, attribute = selectedAttribute, target = "primary") {
  const payload = await fetchAttributeSeries({
    dataset: datasetName,
    attribute,
    maxSamples: 1200,
    s3Key: selectedS3Key, localSensorsFile: selectedLocalSensorsFile,
  });
  // Route the series explicitly. Do NOT decide by comparing `attribute` to
  // `selectedSecondaryAttribute`: for single-attribute datasets the secondary
  // attribute equals the primary, which would misroute the primary series into
  // the secondary slot and leave the primary chart showing "No series data".
  const isSecondary = target === "secondary";
  if (isSecondary) {
    secondarySeriesPayload = payload;
  } else {
    currentSeriesPayload = payload;
  }

  if (currentPayload || secondaryPayload) {
    const cutFractions = getCutFractions();
    const cutThresholds = buildCutThresholds(currentPayload || secondaryPayload, cutFractions);
    updateVisibleSeriesIndices(cutFractions, cutThresholds);
  }
  if (isSecondary) {
    drawSecondaryTrendChart(payload);
  } else {
    drawTrendChart(payload);
  }
}

function updateControlState() {
  getRequestedState();
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
  if (!object) {
    return;
  }
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

function clearRenderObjectFor(sceneRef, objectRef) {
  if (!objectRef) {
    return;
  }

  sceneRef.remove(objectRef);
  disposeObject3D(objectRef);
}

function clearReferenceMarkersFor(sceneRef, markersRef) {
  if (!markersRef) {
    return;
  }

  sceneRef.remove(markersRef);
  disposeObject3D(markersRef);
}

function clearLastPointMarkerFor(sceneRef, markerRef) {
  if (!markerRef) {
    return;
  }

  sceneRef.remove(markerRef);
  disposeObject3D(markerRef);
}

function updateLastPointMarker(sceneRef, points, xyOffset, lineCutActive) {
  if (!lineCutActive || !Array.isArray(points) || points.length === 0) {
    return null;
  }

  // Highlight the newest rendered point: the one with the largest source index
  // (p[4]). For point clouds this is the latest CSV line; for voxels p[4] is the
  // voxel's average timestamp, so this is the voxel with the highest average
  // timestamp. Gap-filled points carry NaN and are ignored.
  let newest = null;
  let newestLine = Number.NEGATIVE_INFINITY;
  for (const p of points) {
    const line = Number(p[4]);
    if (!Number.isFinite(line)) {
      continue;
    }
    if (line > newestLine) {
      newestLine = line;
      newest = p;
    }
  }
  if (!newest) {
    return null;
  }

  const x = Number(newest[0]) + xyOffset[0];
  const y = Number(newest[1]) + xyOffset[1];
  const z = Number(newest[2]);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    return null;
  }

  const zTop = z + NOZZLE_MARKER_OFFSET_MM;
  const markerGroup = new THREE.Group();

  const nozzle = createNozzleMarkerMesh();
  nozzle.position.set(x, y, zTop);
  markerGroup.add(nozzle);

  const stemGeometry = new THREE.BufferGeometry();
  stemGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([x, y, z, x, y, zTop], 3),
  );
  const stem = new THREE.Line(
    stemGeometry,
    new THREE.LineBasicMaterial({ color: 0x39ff14, toneMapped: false }),
  );
  markerGroup.add(stem);

  sceneRef.add(markerGroup);
  return markerGroup;
}

function clearRenderObject() {
  clearRenderObjectFor(scene, renderObject);
  renderObject = null;
  pointSpriteMaterial = null;
  clearRenderObjectFor(scene, ghostRenderObject);
  ghostRenderObject = null;

  clearRenderObjectFor(scene, secondaryRenderObject);
  secondaryRenderObject = null;
  secondaryPointSpriteMaterial = null;
  clearRenderObjectFor(scene, secondaryGhostRenderObject);
  secondaryGhostRenderObject = null;
}

function clearReferenceMarkers() {
  clearReferenceMarkersFor(scene, referenceMarkers);
  referenceMarkers = null;

  clearReferenceMarkersFor(scene, secondaryReferenceMarkers);
  secondaryReferenceMarkers = null;
}

function clearLastPointMarker() {
  clearLastPointMarkerFor(scene, lastPointMarker);
  lastPointMarker = null;

  clearLastPointMarkerFor(scene, secondaryLastPointMarker);
  secondaryLastPointMarker = null;
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
    cutLineMinEl,
    cutLineMaxEl,
  }, toNumber);
}

function buildCutThresholds(payload, cutFractions) {
  return buildCutThresholdsFromModule(payload, cutFractions);
}

function getFilteredPointsByThresholds(payload, thresholds) {
  return getFilteredPointsByThresholdsFromModule(payload, thresholds);
}

function isLastLayerOnly() {
  return Boolean(lastLayerOnlyEl && lastLayerOnlyEl.getAttribute("aria-pressed") === "true");
}

function setLayerViewState(enabled) {
  if (!lastLayerOnlyEl) {
    return;
  }
  lastLayerOnlyEl.setAttribute("aria-pressed", enabled ? "true" : "false");
  lastLayerOnlyEl.textContent = enabled ? "Show Full Part" : "Show Single Layer";
  // In layer mode the Z Cut only picks a single plane, so collapse the lower
  // handle and show just the upper (ceiling) slider. Reset the floor to 0 so
  // the full height below the ceiling is scanned for the topmost layer.
  if (cutZRangeEl) {
    cutZRangeEl.classList.toggle("single-handle", enabled);
  }
  if (enabled && cutZMinEl) {
    cutZMinEl.value = "0";
    const maxV = toNumber(cutZMaxEl ? cutZMaxEl.value : 100, 100);
    if (cutZRangeEl) {
      cutZRangeEl.style.setProperty("--start", "0%");
      cutZRangeEl.style.setProperty("--end", `${maxV}%`);
    }
  }
}

function applyLastLayerCut(points) {
  return applyLastLayerCutFromModule(points, {
    enabled: isLastLayerOnly(),
    bandMm: 0.2,
  });
}

function isTransparentCutMode() {
  return Boolean(cutDisplayModeEl && cutDisplayModeEl.getAttribute("aria-pressed") === "true");
}

function setCutDisplayMode(transparent) {
  if (!cutDisplayModeEl) {
    return;
  }
  cutDisplayModeEl.setAttribute("aria-pressed", transparent ? "true" : "false");
  cutDisplayModeEl.textContent = transparent ? "Transparent" : "Hide";
}

// Return the points removed by the active cuts: every payload point that is not
// part of the visible set. `visiblePoints` holds references into payload.points
// (the cut filters return the same array elements), so a Set membership test
// cleanly isolates the complement for the transparent "ghost" layer.
function getCutOutPoints(payload, visiblePoints) {
  if (!payload || !Array.isArray(payload.points)) {
    return [];
  }
  if (!Array.isArray(visiblePoints) || visiblePoints.length === 0) {
    return payload.points;
  }
  if (visiblePoints.length >= payload.points.length) {
    return [];
  }
  const visibleSet = new Set(visiblePoints);
  return payload.points.filter((p) => !visibleSet.has(p));
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

function renderPayloadView(options) {
  const {
    payload,
    requested,
    cutFractions,
    cutThresholds,
    percentileRange,
    lightweight,
    shouldResetCamera,
    targetLayer,
  } = options;

  if (!payload) {
    return {
      renderObject: null,
      pointSpriteMaterial: null,
      groundGrid: null,
      referenceMarkers: null,
      lastPointMarker: null,
      zGrid: 0,
      plateCenter: [0, 0],
    };
  }

  const filteredPoints = getFilteredPointsByThresholds(payload, cutThresholds);
  const lastLayerPoints = applyLastLayerCut(filteredPoints);
  const renderPoints = fillVoxelizedGaps(lastLayerPoints, requested, payload);

  const filteredRange = {
    min: percentileRange?.min ?? currentPercentileRange.min,
    max: percentileRange?.max ?? currentPercentileRange.max,
  };
  const gridOriginMode = (payload.gridOrigin ?? "").toLowerCase();
  const shouldCenterGrid = gridOriginMode === "center"
    || (payload.system ?? "").toLowerCase() === "engine";
  const autoCenter = computeAutoCenterCorrection(payload, requested, shouldCenterGrid);
  const plateCenter = shouldCenterGrid
    ? [0, 0]
    : [requested.buildPlateSizeX / 2, requested.buildPlateSizeY / 2];
  const partToGridOffset = [
    payload.center[0] + autoCenter.offset[0],
    payload.center[1] + autoCenter.offset[1],
  ];

  let nextRenderObject = null;
  let nextPointSpriteMaterial = null;
  let nextGhostObject = null;
  if (requested.apiView === "voxel" && requested.renderStyle === "cube") {
    nextRenderObject = buildVoxelCubeObject(
      renderPoints,
      filteredRange,
      payload.voxelSizeMm,
      payload.voxelSizeZMm,
      requested.voxelEdgeSize,
      partToGridOffset,
      GRID_MAJOR_COLOR,
    );
  } else {
    const spritePointSize = toNumber(spriteSizeEl ? spriteSizeEl.value : 4.25, 4.25);
    const spriteResult = buildSpriteObject(
      renderPoints,
      filteredRange,
      partToGridOffset,
      spritePointSize,
      OUTLINE_COLOR,
      OUTLINE_START,
    );
    nextRenderObject = spriteResult.object;
    nextPointSpriteMaterial = spriteResult.material;

    // Transparent cut mode: draw the points removed by the active cuts as a
    // faint (90% transparent) sprite layer so they stay visible as context.
    if (isTransparentCutMode()) {
      const ghostPoints = getCutOutPoints(payload, lastLayerPoints);
      if (ghostPoints.length > 0) {
        const ghostResult = buildSpriteObject(
          ghostPoints,
          filteredRange,
          partToGridOffset,
          spritePointSize,
          OUTLINE_COLOR,
          OUTLINE_START,
          { opacity: 0.01, transparent: true },
        );
        nextGhostObject = ghostResult.object;
      }
    }
  }
  setObjectLayerRecursive(nextRenderObject, targetLayer);
  scene.add(nextRenderObject);
  if (nextGhostObject) {
    setObjectLayerRecursive(nextGhostObject, targetLayer);
    scene.add(nextGhostObject);
  }

  let nextGroundGrid = null;
  let nextReferenceMarkers = null;
  const bottomOffset = requested.apiView === "voxel"
    ? 0
    : payload.voxelSizeZMm * 0.25;

  const zMinCentered = payload.bounds.min[2] - payload.center[2];
  const zGrid = zMinCentered - bottomOffset;

  if (!lightweight && requested.showBaseGrid) {
    nextGroundGrid = createBuildPlateGrid(
      requested.buildPlateSizeX,
      requested.buildPlateSizeY,
      zGrid,
      GRID_MAJOR_COLOR,
      GRID_MINOR_COLOR,
      shouldCenterGrid,
    );
    setObjectLayerRecursive(nextGroundGrid, targetLayer);
    scene.add(nextGroundGrid);

    const modelOrigin = [
      shouldCenterGrid ? 0 : partToGridOffset[0] - payload.center[0],
      shouldCenterGrid ? 0 : partToGridOffset[1] - payload.center[1],
    ];

    nextReferenceMarkers = createReferenceMarkers(modelOrigin, [0, 0], zGrid);
    setObjectLayerRecursive(nextReferenceMarkers, targetLayer);
    scene.add(nextReferenceMarkers);
  }

  const nextLastPointMarker = updateLastPointMarker(
    scene,
    renderPoints,
    partToGridOffset,
    isLineCutActive(cutFractions),
  );
  setObjectLayerRecursive(nextLastPointMarker, targetLayer);

  if (shouldResetCamera) {
    controls.target.set(plateCenter[0], plateCenter[1], zGrid);
    controls.update();
  }

  return {
    renderObject: nextRenderObject,
    ghostObject: nextGhostObject,
    pointSpriteMaterial: nextPointSpriteMaterial,
    groundGrid: nextGroundGrid,
    referenceMarkers: nextReferenceMarkers,
    lastPointMarker: nextLastPointMarker,
    zGrid,
    plateCenter,
    autoCenterApplied: autoCenter.applied,
  };
}

function renderFromCurrentPayload() {
  if (!currentPayload) {
    return;
  }

  // A normal full render was requested while the fast playback path was active
  // (e.g. the user moved a cut or percentile slider). Exit fast mode first so
  // this render rebuilds the standard point cloud instead of double-drawing.
  if (timelineFastActive) {
    stopTimelineCore();
  }

  // During timeline playback only the revealed point set changes; the grid,
  // reference markers, trend/distribution charts and status text are static.
  // Skip rebuilding those each frame so playback stays smooth.
  const lightweight = timelineLightweightRender;

  const requested = getRequestedState();
  const cutFractions = getCutFractions();
  const cutThresholds = buildCutThresholds(currentPayload, cutFractions);
  if (!lightweight) {
    updateVisibleSeriesIndices(cutFractions, cutThresholds);
  }
  clearRenderObjectFor(scene, renderObject);
  clearRenderObjectFor(scene, ghostRenderObject);
  if (!lightweight) {
    clearReferenceMarkersFor(scene, referenceMarkers);
    clearReferenceMarkersFor(scene, secondaryReferenceMarkers);
    clearReferenceMarkersFor(scene, groundGrid);
    clearReferenceMarkersFor(scene, secondaryGroundGrid);
  }
  clearLastPointMarkerFor(scene, lastPointMarker);
  clearLastPointMarkerFor(scene, secondaryLastPointMarker);

  const primaryView = renderPayloadView({
    payload: currentPayload,
    requested,
    cutFractions,
    cutThresholds,
    percentileRange: currentPercentileRange,
    lightweight,
    shouldResetCamera: shouldInitializeViewTarget,
    targetLayer: LAYER_PRIMARY,
  });
  const primaryAutoCenterApplied = Boolean(primaryView.autoCenterApplied);
  renderObject = primaryView.renderObject;
  ghostRenderObject = primaryView.ghostObject;
  pointSpriteMaterial = primaryView.pointSpriteMaterial;
  // A lightweight (timeline) render does not rebuild the grid/markers and
  // returns null for them. Only overwrite the references on a full render,
  // otherwise the existing grid is orphaned in the scene (its reference lost)
  // and a later render adds a second grid on top of it.
  if (!lightweight) {
    groundGrid = primaryView.groundGrid;
    referenceMarkers = primaryView.referenceMarkers;
  }
  lastPointMarker = primaryView.lastPointMarker;

  if (isSplitViewEnabled() && secondaryPayload) {
    clearRenderObjectFor(scene, secondaryRenderObject);
    clearRenderObjectFor(scene, secondaryGhostRenderObject);
    const secondaryThresholds = buildCutThresholds(secondaryPayload, cutFractions);
    const secondaryView = renderPayloadView({
      payload: secondaryPayload,
      requested,
      cutFractions,
      cutThresholds: secondaryThresholds,
      percentileRange: secondaryPercentileRange,
      lightweight,
      shouldResetCamera: false,
      targetLayer: LAYER_SECONDARY,
    });
    secondaryRenderObject = secondaryView.renderObject;
    secondaryGhostRenderObject = secondaryView.ghostObject;
    secondaryPointSpriteMaterial = secondaryView.pointSpriteMaterial;
    if (!lightweight) {
      secondaryGroundGrid = secondaryView.groundGrid;
      secondaryReferenceMarkers = secondaryView.referenceMarkers;
    }
    secondaryLastPointMarker = secondaryView.lastPointMarker;
  } else {
    clearRenderObjectFor(scene, secondaryRenderObject);
    clearRenderObjectFor(scene, secondaryGhostRenderObject);
    secondaryRenderObject = null;
    secondaryGhostRenderObject = null;
    secondaryPointSpriteMaterial = null;
    clearReferenceMarkersFor(scene, secondaryReferenceMarkers);
    secondaryReferenceMarkers = null;
    clearReferenceMarkersFor(scene, secondaryGroundGrid);
    secondaryGroundGrid = null;
    clearLastPointMarkerFor(scene, secondaryLastPointMarker);
    secondaryLastPointMarker = null;
  }

  if (shouldInitializeViewTarget) {
    shouldInitializeViewTarget = false;
  }

  if (!lightweight) {
    const systemLabel = formatSystemLabel(currentPayload.system);
    systemStatusEl.textContent = primaryAutoCenterApplied
      ? `${systemLabel} - Auto-Centered`
      : systemLabel;
    partStatusEl.textContent = currentPayload.dataset;
    if (isSplitViewEnabled() && secondaryPayload) {
      const secondaryName = (secondaryPayload.attribute || selectedSecondaryAttribute || "")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/^./, (c) => c.toUpperCase());
      attributeStatusEl.textContent = `${getAttributeDisplayName()} | ${secondaryName}`;
    } else {
      attributeStatusEl.textContent = getAttributeDisplayName();
    }

    updateControlState();
    drawTrendChart(currentSeriesPayload);
    if (isSplitViewEnabled()) {
      drawSecondaryTrendChart(secondarySeriesPayload);
      drawDistributionChart("secondary");
    }
    drawDistributionChart("primary");
  }
}

async function loadDataFromBackend() {
  activeLoadId += 1;
  const loadId = activeLoadId;

  const requested = getRequestedState();
  setLoadingState(true);
  systemStatusEl.textContent = "loading...";
  partStatusEl.textContent = "loading...";
  attributeStatusEl.textContent = "loading...";

  try {
    if (requested.apiView === "point") {
      await loadPointMultiFast(loadId, requested);
    } else {
      await loadDataLegacy(loadId, requested);
    }
  } finally {
    if (loadId === activeLoadId) {
      setLoadingState(false);
    }
  }
}

// Fast point-cloud path: fetch every attribute's values once (model + series),
// cache them client-side, then build the selected primary/secondary payloads
// synchronously. Switching attribute or toggling split reuses the cache with no
// further network round-trip.
async function loadPointMultiFast(loadId, requested) {
  const maxPoints = 150000;
  const cacheKey = buildMultiCacheKey(maxPoints);
  const attributes = getCurrentCriteriaOptions();

  if (!multiModel || multiModel.key !== cacheKey) {
    const seed = buildMultiSeed();
    const [model, series] = await Promise.all([
      fetchSensorPointcloudMulti(requested, {
        dataset: selectedDatasetName,
        attributes,
        maxPoints,
        sampleSeed: seed,
        s3Key: selectedS3Key, localSensorsFile: selectedLocalSensorsFile,
        localSystemHint: selectedLocalSystemHint,
      }),
      fetchAttributeSeriesMulti({
        dataset: selectedDatasetName,
        attributes,
        maxSamples: 1200,
        s3Key: selectedS3Key, localSensorsFile: selectedLocalSensorsFile,
      }),
    ]);
    if (loadId !== activeLoadId) {
      return;
    }
    model.key = cacheKey;
    series.key = cacheKey;
    multiModel = model;
    multiSeries = series;
  }

  currentPayload = buildPointPayloadFromMulti(multiModel, selectedAttribute, requested);

  if (
    isSplitViewEnabled()
    && selectedSecondaryAttribute
    && selectedSecondaryAttribute !== selectedAttribute
  ) {
    secondaryPayload = buildPointPayloadFromMulti(multiModel, selectedSecondaryAttribute, requested);
  } else {
    secondaryPayload = null;
  }

  updateTrendPanelLayout();
  updateCameraProjectionForLayout();

  if (currentPayload.dataset !== lastLoadedDatasetName) {
    shouldInitializeViewTarget = true;
    lastLoadedDatasetName = currentPayload.dataset;
  }

  const pointValues = currentPayload.points.map((p) => p[3]);
  const percentile = getPercentileSettings("primary");
  currentPercentileRange = computePercentileRange(pointValues, percentile.low, percentile.high);
  updateColorScaleLabels(currentPercentileRange, "primary");

  if (secondaryPayload && Array.isArray(secondaryPayload.points)) {
    const secondaryPointValues = secondaryPayload.points.map((p) => p[3]);
    const secondaryPercentile = getPercentileSettings("secondary");
    secondaryPercentileRange = computePercentileRange(
      secondaryPointValues,
      secondaryPercentile.low,
      secondaryPercentile.high,
    );
    updateColorScaleLabels(secondaryPercentileRange, "secondary");
  } else {
    secondaryPercentileRange = { ...currentPercentileRange };
  }

  // Series come straight from the cached multi-attribute payload, so the trend
  // charts draw in the same pass as the point cloud.
  currentSeriesPayload = buildSeriesPayloadFromMulti(multiSeries, selectedAttribute);
  secondarySeriesPayload = secondaryPayload
    ? buildSeriesPayloadFromMulti(multiSeries, selectedSecondaryAttribute)
    : null;

  renderFromCurrentPayload();

  if (!(isSplitViewEnabled() && secondaryPayload)) {
    drawSecondaryTrendChart(null);
  }
}

// Legacy per-attribute path retained for voxel views (which still aggregate
// server-side and so refetch on every change).
async function loadDataLegacy(loadId, requested) {
  const sampleSeed = buildDeterministicSampleSeed(requested);

  const payload = await fetchSensorData(requested, {
    dataset: selectedDatasetName,
    attribute: selectedAttribute,
    sampleSeed,
    s3Key: selectedS3Key, localSensorsFile: selectedLocalSensorsFile,
    localSystemHint: selectedLocalSystemHint,
  });
  if (loadId !== activeLoadId) {
    return;
  }

  currentPayload = payload;
  if (isSplitViewEnabled() && selectedSecondaryAttribute && selectedSecondaryAttribute !== selectedAttribute) {
    secondaryPayload = await fetchSensorData(requested, {
      dataset: selectedDatasetName,
      attribute: selectedSecondaryAttribute,
      sampleSeed,
      s3Key: selectedS3Key, localSensorsFile: selectedLocalSensorsFile,
      localSystemHint: selectedLocalSystemHint,
    });
    if (loadId !== activeLoadId) {
      return;
    }
  } else {
    secondaryPayload = null;
  }
  updateTrendPanelLayout();
  updateCameraProjectionForLayout();

  if (payload.dataset !== lastLoadedDatasetName) {
    shouldInitializeViewTarget = true;
    lastLoadedDatasetName = payload.dataset;
  }

  const pointValues = currentPayload.points.map((p) => p[3]);
  const percentile = getPercentileSettings("primary");
  currentPercentileRange = computePercentileRange(pointValues, percentile.low, percentile.high);
  updateColorScaleLabels(currentPercentileRange, "primary");

  if (secondaryPayload && Array.isArray(secondaryPayload.points)) {
    const secondaryPointValues = secondaryPayload.points.map((p) => p[3]);
    const secondaryPercentile = getPercentileSettings("secondary");
    secondaryPercentileRange = computePercentileRange(
      secondaryPointValues,
      secondaryPercentile.low,
      secondaryPercentile.high,
    );
    updateColorScaleLabels(secondaryPercentileRange, "secondary");
  } else {
    secondaryPercentileRange = { ...currentPercentileRange };
  }

  // Drop any stale series/index mapping before drawing updated 3D visibility.
  currentSeriesPayload = null;
  secondarySeriesPayload = null;
  renderFromCurrentPayload();

  try {
    await loadSeriesForDataset(selectedDatasetName);
  } catch {
    currentSeriesPayload = null;
    drawTrendChart(null);
  }

  if (isSplitViewEnabled() && secondaryPayload) {
    try {
      await loadSeriesForDataset(selectedDatasetName, selectedSecondaryAttribute, "secondary");
    } catch {
      secondarySeriesPayload = null;
      drawSecondaryTrendChart(null);
    }
  } else {
    drawSecondaryTrendChart(null);
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
        selectedLocalSensorsFile = null;
        selectedS3Key = null;
        selectedLocalSystemHint = "m600";
        refreshCriteriaOptions(await getAvailableCriteriaFromBackendDataset(selectedDatasetName));
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
        selectedLocalSensorsFile = null;
        selectedS3Key = null;
        refreshCriteriaOptions(["loadCell"]);
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
      selectedLocalSensorsFile = sensorsFile;
      refreshCriteriaOptions(await getAvailableCriteriaFromLocalCsv(sensorsFile));
      const hasPrintInfoDb = files.some((f) => f.name.toLowerCase() === "printinfo.db");
      const hasRegisterTxt = files.some((f) => f.name.toLowerCase() === "register.txt");
      selectedLocalSystemHint = hasPrintInfoDb && hasRegisterTxt ? "engine" : "m600";

      // Upload the CSV once, directly to S3 — bypasses the 100 MB Cloudflare
      // edge limit and lets every view reference the same object instead of
      // re-uploading. Falls back to the legacy per-call upload when direct
      // upload isn't configured (presign returns null).
      selectedS3Key = null;
      try {
        selectedS3Key = await presignAndUploadCsv(sensorsFile, (pct) => {
          if (fileStatusEl) {
            fileStatusEl.textContent = `Uploading ${selectedDatasetName}: ${pct}%`;
          }
        });
      } catch {
        selectedS3Key = null;
      }

      if (fileStatusEl) {
        fileStatusEl.textContent = `Loading: ${selectedDatasetName}`;
      }

      // While the server parses/voxelizes the (possibly large) CSV, poll its
      // progress so the status shows "Parsing CSV 42%" instead of hanging.
      let pollActive = true;
      (async () => {
        while (pollActive) {
          try {
            const r = await fetch("/api/sensors/progress");
            if (r.ok) {
              const p = await r.json();
              if (p.active && p.phase && fileStatusEl) {
                fileStatusEl.textContent =
                  `${selectedDatasetName}: ${p.phase} ${Math.round(p.percent)}%`;
              }
            }
          } catch {
            /* ignore transient poll errors */
          }
          await new Promise((res) => setTimeout(res, 400));
        }
      })();

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
        pollActive = false;
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

  if (criteriaEl) {
    criteriaEl.addEventListener("change", () => {
      selectedAttribute = criteriaEl.value || "loadCell";
      refreshCriteriaOptions(getCurrentCriteriaOptions());
      loadDataFromBackend().catch((error) => {
        partStatusEl.textContent = "failed to load";
        attributeStatusEl.textContent = `${error.message}`;
        setLoadingState(false);
      });
    });
  }

  if (splitViewToggleEl) {
    splitViewToggleEl.addEventListener("click", () => {
      if (splitViewToggleEl.disabled) {
        return;
      }
      setSplitViewEnabled(!isSplitViewEnabled());
      updateSplitControlsVisibility();
      updateCameraProjectionForLayout();
      loadDataFromBackend().catch((error) => {
        partStatusEl.textContent = "failed to load";
        attributeStatusEl.textContent = `${error.message}`;
        setLoadingState(false);
      });
    });
  }

  if (secondaryCriteriaEl) {
    secondaryCriteriaEl.addEventListener("change", () => {
      selectedSecondaryAttribute = secondaryCriteriaEl.value || selectedSecondaryAttribute;
      if (!isSplitViewEnabled()) {
        return;
      }
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
  bindDualRange(cutLineMinEl, cutLineMaxEl, renderFromCurrentPayload);

  if (lastLayerOnlyEl) {
    lastLayerOnlyEl.addEventListener("click", () => {
      setLayerViewState(!isLastLayerOnly());
      renderFromCurrentPayload();
    });
  }

  if (cutDisplayModeEl) {
    cutDisplayModeEl.addEventListener("click", () => {
      setCutDisplayMode(!isTransparentCutMode());
      renderFromCurrentPayload();
    });
  }
  bindDualRange(percentileMinEl, percentileMaxEl, () => onPercentileChanged("primary"));
  bindDualRange(percentileSecondaryMinEl, percentileSecondaryMaxEl, () => onPercentileChanged("secondary"));

  // Stop playback if the user grabs the timeline range directly.
  [cutLineMinEl, cutLineMaxEl].forEach((el) => {
    if (el) {
      el.addEventListener("pointerdown", () => stopTimeline());
    }
  });

  if (timelinePlayEl) {
    timelinePlayEl.addEventListener("click", toggleTimeline);
  }

  if (spriteSizeEl) {
    spriteSizeEl.addEventListener("input", () => {
      if (pointSpriteMaterial) {
        pointSpriteMaterial.uniforms.uPointSize.value = Number(spriteSizeEl.value);
      }
      if (secondaryPointSpriteMaterial) {
        secondaryPointSpriteMaterial.uniforms.uPointSize.value = Number(spriteSizeEl.value);
      }
    });
  }

  window.addEventListener("resize", () => {
    updateSplitCssLayoutVariables();
    updateCameraProjectionForLayout();
    renderer.setSize(window.innerWidth, window.innerHeight);
    drawTrendChart(currentSeriesPayload);
    drawSecondaryTrendChart(secondarySeriesPayload);
    drawDistributionChart("primary");
    drawDistributionChart("secondary");
  });
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  syncSecondaryCameraTransform();

  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);

  if (!isSplitLayoutActive()) {
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, width, height);
    renderer.clear();
    camera.layers.set(LAYER_PRIMARY);
    renderer.render(scene, camera);
    return;
  }

  const layout = getSplitViewportLayout(width, height);

  renderer.setScissorTest(true);
  renderer.clear();

  camera.layers.set(LAYER_PRIMARY);
  renderer.setViewport(layout.leftX, 0, layout.leftWidth, layout.height);
  renderer.setScissor(layout.leftX, 0, layout.leftWidth, layout.height);
  renderer.render(scene, camera);

  secondaryCamera.layers.set(LAYER_SECONDARY);
  renderer.setViewport(layout.rightX, 0, layout.rightWidth, layout.height);
  renderer.setScissor(layout.rightX, 0, layout.rightWidth, layout.height);
  renderer.render(scene, secondaryCamera);

  renderer.setScissorTest(false);
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
refreshCriteriaOptions(["loadCell"]);
updateSplitCssLayoutVariables();
updateTrendPanelLayout();
updateCameraProjectionForLayout();

setSettingsModalOpen(!settingsPanelEl.classList.contains("hidden"));
getAvailableCriteriaFromBackendDataset(selectedDatasetName)
  .then((available) => {
    refreshCriteriaOptions(available);
    return loadDataFromBackend();
  })
  .then(() => {
    updateControlState();
    animate();
  })
  .catch((error) => {
    partStatusEl.textContent = "failed to load";
    attributeStatusEl.textContent = `${error.message}`;
    setLoadingState(false);
    animate();
  });
