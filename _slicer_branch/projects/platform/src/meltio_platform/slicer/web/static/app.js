import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";

// --- Per-session slicer state ---------------------------------------------
// Tag this tab's calls to the slicer's own (relative "api/…") endpoints with a
// unique session id so each user/tab gets isolated mesh/toolpath state on the
// server. Platform calls (absolute "/api/…") are left untouched.
const SLICER_SESSION =
  (window.crypto && crypto.randomUUID && crypto.randomUUID()) ||
  `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const _origFetch = window.fetch.bind(window);
window.fetch = (input, init = {}) => {
  const url = typeof input === "string" ? input : input?.url ?? "";
  if (url.startsWith("api/") || url.startsWith("./api/")) {
    init = { ...init, headers: { ...(init.headers || {}), "X-Slicer-Session": SLICER_SESSION } };
  } else if (url.startsWith("/api/") && window.__platformOrgId) {
    // Platform calls (absolute "/api/…") are scoped to the active org the shell
    // is browsing, so a part in a non-home org resolves correctly.
    init = { ...init, headers: { ...(init.headers || {}), "X-Org-Id": window.__platformOrgId } };
  }
  return _origFetch(input, init);
};

// --- Scene setup -----------------------------------------------------------

const canvas = document.getElementById("scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
// Cap the device pixel ratio: on hi-DPI screens an uncapped ratio shades the
// (potentially huge) tube mesh at 2–3× the pixels for no visible gain, which is
// the main driver of sluggish interaction on large slices. 1.5× keeps edges
// readable (MSAA is still on) while cutting the fragment cost substantially
// versus the native 2–3× of typical hi-DPI displays.
const MAX_PIXEL_RATIO = 1.5;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
renderer.setSize(window.innerWidth, window.innerHeight);
// Filmic tonemapping gives smoother highlight roll-off and richer contrast than
// the default linear clamp, so metals/beads read with more depth.
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f1620);

// Z is "up" for printed parts.
const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  10000,
);
camera.up.set(0, 0, 1);
camera.position.set(120, -160, 120);

const controls = new OrbitControls(camera, renderer.domElement);
// Damping gives the rotation its inertial "weight". Enabled everywhere now,
// including server-render mode (the GPU renders the glide smoothly; it only read as
// lag on the old CPU-only render box).
controls.enableDamping = true;

// On-demand rendering: the scene only re-renders when something actually changes
// (camera move, playback tick, geometry/selection update) instead of on every
// animation frame. This stops a large static sliced toolpath from continuously
// pegging the GPU, so input stays responsive while idle. Anything that mutates
// the scene calls requestRender(); OrbitControls fires "change" throughout drags
// and damping inertia, which keeps frames flowing until the motion settles.
let renderDirty = true;
function requestRender() {
  renderDirty = true;
}
controls.addEventListener("change", requestRender);

// Keep the canvas redrawing for a short window so the WebRTC encoder (idle on a static
// view) ramps the new frame to full quality quickly — used after a view/visibility change
// in server-render mode, where one redraw alone delivers a soft, slow-to-sharpen frame.
let _burstTimer = null;
function renderBurst(frames = 14, intervalMs = 110) {
  if (_burstTimer) clearInterval(_burstTimer);
  let n = 0;
  _burstTimer = setInterval(() => {
    requestRender();
    if (++n >= frames) {
      clearInterval(_burstTimer);
      _burstTimer = null;
    }
  }, intervalMs);
}

scene.add(new THREE.AmbientLight(0xffffff, 0.45));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
keyLight.position.set(1, -1, 2);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
fillLight.position.set(-1.5, 1, 0.5);
scene.add(fillLight);
// Cool rim light from behind/above to pop the silhouette off the dark
// background and add a little sheen along top edges.
const rimLight = new THREE.DirectionalLight(0xcfe2ff, 0.35);
rimLight.position.set(-0.5, 2, -1.5);
scene.add(rimLight);
// Sky/ground gradient so rounded surfaces read with more form (less flat).
scene.add(new THREE.HemisphereLight(0xbcd4ff, 0x202833, 0.55));

// Dynamic build plate: a grid + border sized to the active profile's build
// volume, with an origin marker at the configured corner and a centre cross at
// the default centring point. Rebuilt whenever the workspace settings change.
const plateGroup = new THREE.Group();
scene.add(plateGroup);

function buildPlate() {
  disposeGroup(plateGroup);
  const p = workingProfile;
  const bx = p ? p.build_volume_x_mm : 300;
  const by = p ? p.build_volume_y_mm : 400;
  const minor = 10; // fine grid spacing, mm
  const major = 50; // bold grid spacing, mm

  // Solid plate surface, sitting a hair below z=0 so it reads as the bed
  // without z-fighting the model's base or the grid lines.
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(bx, by),
    new THREE.MeshBasicMaterial({
      color: 0x0e1620,
      transparent: true,
      opacity: 0.55,
    }),
  );
  plate.position.set(bx / 2, by / 2, -0.05);
  plateGroup.add(plate);

  // Grid lines: a fine minor grid plus a brighter major grid every `major` mm.
  const near = (v, s) => Math.abs(v / s - Math.round(v / s)) < 1e-6;
  const minorPts = [];
  const majorPts = [];
  for (let x = 0; x <= bx + 1e-6; x += minor) {
    (near(x, major) ? majorPts : minorPts).push(x, 0, 0, x, by, 0);
  }
  for (let y = 0; y <= by + 1e-6; y += minor) {
    (near(y, major) ? majorPts : minorPts).push(0, y, 0, bx, y, 0);
  }
  const addLines = (pts, color) => {
    if (!pts.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    plateGroup.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color })));
  };
  addLines(minorPts, 0x223141);
  addLines(majorPts, 0x35506b);

  // Outer border.
  const border = [0, 0, 0, bx, 0, 0, bx, by, 0, 0, by, 0, 0, 0, 0];
  const bg = new THREE.BufferGeometry();
  bg.setAttribute("position", new THREE.Float32BufferAttribute(border, 3));
  plateGroup.add(
    new THREE.Line(bg, new THREE.LineBasicMaterial({ color: 0x4a6a8d })),
  );

  // Origin axes marker (X red, Y green) at the configured corner (or the plate
  // centre), pointing into the plate.
  const corner = p ? p.origin_corner : "top_right";
  const center = corner === "center";
  const ox = center ? bx / 2 : corner.includes("right") ? bx : 0;
  const oy = center ? by / 2 : corner.includes("top") ? by : 0;
  const axis = Math.min(bx, by) * 0.12;
  const sx = ox >= bx - 1e-6 ? -1 : 1;
  const sy = oy >= by - 1e-6 ? -1 : 1;
  const xg = new THREE.BufferGeometry();
  xg.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([ox, oy, 0, ox + sx * axis, oy, 0], 3),
  );
  plateGroup.add(new THREE.Line(xg, new THREE.LineBasicMaterial({ color: 0xff5555 })));
  const yg = new THREE.BufferGeometry();
  yg.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([ox, oy, 0, ox, oy + sy * axis, 0], 3),
  );
  plateGroup.add(new THREE.Line(yg, new THREE.LineBasicMaterial({ color: 0x55ff55 })));

  // Default centring point cross.
  const cx = p ? p.center_x_mm ?? bx / 2 : bx / 2;
  const cy = p ? p.center_y_mm ?? by / 2 : by / 2;
  const r = Math.min(bx, by) * 0.04;
  const cross = [cx - r, cy, 0, cx + r, cy, 0, cx, cy - r, 0, cx, cy + r, 0];
  const cg = new THREE.BufferGeometry();
  cg.setAttribute("position", new THREE.Float32BufferAttribute(cross, 3));
  plateGroup.add(
    new THREE.LineSegments(cg, new THREE.LineBasicMaterial({ color: 0x6f9bd8 })),
  );

  // Build-volume envelope: a wireframe box (0..bx, 0..by, 0..bz) so the printable
  // volume — including the Z ceiling — is visible. It (and the model) turn red
  // when the part exceeds it. See updateBoundsState().
  const bz = p ? (p.build_volume_z_mm ?? 600) : 600;
  const boxPts = [
    0, 0, 0, bx, 0, 0,  bx, 0, 0, bx, by, 0,  bx, by, 0, 0, by, 0,  0, by, 0, 0, 0, 0,
    0, 0, bz, bx, 0, bz,  bx, 0, bz, bx, by, bz,  bx, by, bz, 0, by, bz,  0, by, bz, 0, 0, bz,
    0, 0, 0, 0, 0, bz,  bx, 0, 0, bx, 0, bz,  bx, by, 0, bx, by, bz,  0, by, 0, 0, by, bz,
  ];
  const boxG = new THREE.BufferGeometry();
  boxG.setAttribute("position", new THREE.Float32BufferAttribute(boxPts, 3));
  boundsBoxMaterial = new THREE.LineBasicMaterial({ color: BOUNDS_BOX_COLOR });
  boundsBox = new THREE.LineSegments(boxG, boundsBoxMaterial);
  plateGroup.add(boundsBox);

  // A changed build volume can newly put the model in/out of bounds.
  updateBoundsState();
  requestRender();
}

// --- Build-volume bounds check + out-of-bounds highlighting -----------------
const MODEL_COLOR = 0x6f9bd8;       // normal model tint
const MODEL_COLOR_OOB = 0xd9534f;   // model tint when it exceeds the volume
const BOUNDS_BOX_COLOR = 0x35506b;  // envelope wireframe (in bounds)
const BOUNDS_BOX_COLOR_OOB = 0xd9534f;
let boundsBox = null;
let boundsBoxMaterial = null;
let currentSlicerBannerType = null; // "error" | "warn" | null

// The model exceeds the printable envelope? Uses the LIVE effective bounds
// (the baked bounds plus any un-committed drag offset on meshGroup).
function computeModelOutOfBounds() {
  if (!currentBounds || !workingProfile || !meshGroup.children.length) return false;
  const bx = workingProfile.build_volume_x_mm;
  const by = workingProfile.build_volume_y_mm;
  const bz = workingProfile.build_volume_z_mm ?? Infinity;
  if (!(bx > 0) || !(by > 0)) return false;
  const ox = meshGroup.position.x || 0;
  const oy = meshGroup.position.y || 0;
  const oz = meshGroup.position.z || 0;
  const { min, max } = currentBounds;
  const eps = 1e-3;
  return (
    min[0] + ox < -eps || max[0] + ox > bx + eps ||
    min[1] + oy < -eps || max[1] + oy > by + eps ||
    min[2] + oz < -eps || max[2] + oz > bz + eps
  );
}

function showSlicerBanner(type, msg) {
  const el = document.getElementById("slicerBanner");
  currentSlicerBannerType = type;
  if (!el) return;
  el.textContent = msg;
  el.dataset.type = type;
  el.hidden = false;
}
function hideSlicerBanner() {
  currentSlicerBannerType = null;
  const el = document.getElementById("slicerBanner");
  if (el) el.hidden = true;
}

// Flag a dock-bar tab (and, for slice, the inner Slice+Simulate button) as
// needing the user's attention (pulsing highlight).
function setDockAttention(section, on) {
  const btn = document.getElementById("dockRail")
    ?.querySelector(`button[data-section="${section}"]`);
  if (btn) btn.classList.toggle("attn", Boolean(on));
}
function setSliceAttention(on) {
  setDockAttention("slice", on);
  const sb = document.getElementById("sliceButton");
  if (sb) sb.classList.toggle("attn", Boolean(on));
}

// Reflect the current bounds state everywhere: tint the model + envelope box,
// flag the Model tab, and surface/clear the reorient error banner. Called on
// load, transform, live drag, and profile/volume change.
function updateBoundsState() {
  const oob = computeModelOutOfBounds();
  const surface = meshGroup.children[0];
  if (surface && surface.material && surface.material.color) {
    surface.material.color.setHex(oob ? MODEL_COLOR_OOB : MODEL_COLOR);
  }
  if (boundsBoxMaterial) {
    boundsBoxMaterial.color.setHex(oob ? BOUNDS_BOX_COLOR_OOB : BOUNDS_BOX_COLOR);
  }
  setDockAttention("model", oob);
  if (oob) {
    showSlicerBanner("error", "Model is out of bounds — reorient the part to fit the build volume.");
  } else if (currentSlicerBannerType === "error") {
    hideSlicerBanner();
  }
  requestRender();
}

// Holders so we can swap content without touching the rest of the scene.
const meshGroup = new THREE.Group();
const supportGroup = new THREE.Group();
// Single geometry holder for the deposition preview. It renders either the
// kind-coloured toolpath or the thermal heat-map (same geometry, recoloured),
// so the print-progress playback works identically in both views.
const toolpathGroup = new THREE.Group();
toolpathGroup.visible = false;
// Rapid travel hops drawn as a thin line overlay (never tubes). Kept in its own
// group so rebuilding the deposition geometry doesn't wipe it, and so it can be
// toggled independently from the legend.
const travelGroup = new THREE.Group();
travelGroup.visible = false;
scene.add(meshGroup, supportGroup, toolpathGroup, travelGroup);

// Wire-deposition nozzle, shown above the currently-printing point while the
// simulation reveals the toolpath point by point. Loaded once, then just
// repositioned/toggled. The STL's local X axis is the model's Z (up) axis: the
// model origin sits at X=0 (the mounting/top end) and the tip 28 mm away at
// X=28. We keep that native origin and hover it 35 mm above the active point,
// so the nozzle tip ends up 7 mm above it (35 − 28 mm nozzle length).
const NOZZLE_OFFSET_Z = 35; // mm between the nozzle's model origin and the point
const nozzleGroup = new THREE.Group();
nozzleGroup.visible = false;
scene.add(nozzleGroup);
let nozzleReady = false; // becomes true once the STL has loaded
let nozzleActive = false; // true while there is an active deposition point
// Reusable vectors for tilting the nozzle along the active point's tool axis.
const NOZZLE_UP_AXIS = new THREE.Vector3(0, 0, 1); // group's local "up" (mount)
const _toolAxis = new THREE.Vector3();

new STLLoader().load(
  encodeURI("assets/Wire Nozzle/Wire Nozzle.stl"),
  (geometry) => {
    // STL +X axis → world −Z, so the model origin (X=0) stays at the group's
    // local origin (top) and the tip (X=28) hangs 28 mm below it, pointing down.
    geometry.rotateY(Math.PI / 2);
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
      color: 0xcd7f32, // bronze
      metalness: 0.85,
      roughness: 0.35,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    nozzleGroup.add(mesh);
    nozzleReady = true;
    nozzleGroup.visible = nozzleActive && toolpathGroup.visible;
    requestRender();
  },
  undefined,
  () => {
    /* nozzle is optional eye-candy; ignore load failures */
  },
);

// --- Helpers ---------------------------------------------------------------

function disposeGroup(group) {
  for (const child of [...group.children]) {
    child.traverse?.((node) => {
      node.geometry?.dispose();
      node.material?.dispose();
    });
    group.remove(child);
  }
  // Clearing a group always changes what's on screen, so the subsequent rebuild
  // (and this clear, if nothing replaces it) needs a fresh frame.
  requestRender();
}

function centerOf(bounds) {
  return [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
}

let entryFramePending = false; // one-shot extra zoom-out for a freshly loaded model

function frameBounds(bounds) {
  const center = centerOf(bounds);
  const span = Math.max(
    bounds.max[0] - bounds.min[0],
    bounds.max[1] - bounds.min[1],
    bounds.max[2] - bounds.min[2],
    1,
  );
  // Zoom-out factor: a bit more margin around the model when framing; the first
  // frame after a load sits 1.5x further out so the whole part is comfortably in view.
  let z = 1.35;
  if (entryFramePending) {
    z *= 1.5;
    entryFramePending = false;
  }
  controls.target.set(center[0], center[1], center[2]);
  camera.position.set(
    center[0] + span * z,
    center[1] - span * 1.4 * z,
    center[2] + span * z,
  );
  camera.near = span / 100;
  camera.far = span * 100;
  camera.updateProjectionMatrix();
  controls.update();
  requestRender();
}

// Frame the (empty) build plate centred — used when the slicer opens without a
// part so the view sits on the middle of the bed, not a corner.
function frameBed() {
  const p = workingProfile;
  const bx = p ? p.build_volume_x_mm : 300;
  const by = p ? p.build_volume_y_mm : 400;
  frameBounds({ min: [0, 0, 0], max: [bx, by, 0] });
}

// When idle (empty text) the status line shows the active profile name — but only
// where the exposed profile dropdown is hidden (mobile); on desktop the dropdown
// already shows it, so the idle line stays empty.
function activeMachineName() {
  // The machine is part of the profile now (its embedded label).
  return (workingProfile && workingProfile.machine_key) || "";
}
// "<machine> · <profile>" for the status line (machine prefixed in front).
function statusLabel() {
  const mn = activeMachineName();
  if (!activeProfileName) return mn;
  return mn ? `${mn} · ${activeProfileName}` : activeProfileName;
}

function setStatus(text) {
  const sel = document.getElementById("profileSelect");
  const exposed = sel && sel.offsetParent !== null;
  const idle = exposed ? "" : statusLabel();
  _setStatusText(document.getElementById("status"), text || idle);
  // Mobile status line (bottom-left): the transient status, else machine · profile.
  _setStatusText(document.getElementById("statusM"), text || statusLabel());
}

// Set status text without clobbering a leading icon (the remote-scene live indicator
// wraps the text in .status-text); falls back to textContent when there's no icon.
function _setStatusText(el, text) {
  if (!el) return;
  const t = el.querySelector(".status-text");
  if (t) t.textContent = text;
  else el.textContent = text;
}

// --- Mesh rendering --------------------------------------------------------

let currentBounds = null;

function buildMesh(payload) {
  disposeGroup(meshGroup);
  disposeGroup(supportGroup);
  // The rebuilt mesh carries any new position, so clear the live drag offset.
  meshGroup.position.set(0, 0, 0);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(payload.positions, 3),
  );
  geometry.setIndex(payload.indices);

  const surface = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: 0x6f9bd8,
      metalness: 0.15,
      roughness: 0.62,
      // STL meshes are faceted: shade each triangle flat so hard edges stay
      // crisp instead of being smeared by averaged vertex normals. flatShading
      // derives per-face normals in the shader, so no normal attribute is
      // needed (computeVertexNormals would only re-introduce the smoothing).
      flatShading: true,
    }),
  );
  meshGroup.add(surface);

  // Edge overlay used to highlight the model's outline in face-selection mode.
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry, 25),
    new THREE.LineBasicMaterial({ color: 0xffd166 }),
  );
  edges.visible = selectMode;
  surface.add(edges);

  currentBounds = payload.bounds;
  document.getElementById("fileName").textContent = payload.name;
  updateBoundsState();
}

// Support material is rendered as a separate, distinctly coloured solid so it
// reads clearly against the part. It lives in its own group and is shown
// alongside the part in STL view.
function buildSupportMesh(payload) {
  disposeGroup(supportGroup);
  supportGroup.position.set(0, 0, 0);
  if (!payload) return;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(payload.positions, 3),
  );
  geometry.setIndex(payload.indices);

  const surface = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: 0x2ec4b6,
      metalness: 0.1,
      roughness: 0.7,
      flatShading: true,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
    }),
  );
  supportGroup.add(surface);
}

// --- Face selection & transforms -------------------------------------------

const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();

// Selection mode is toggled by the "Rotate to base" button. While active,
// hovering highlights the triangle under the cursor and clicking seats it.
let selectMode = false;

// Translucent overlay triangle that follows the hovered face.
const faceHighlight = new THREE.Mesh(
  new THREE.BufferGeometry(),
  new THREE.MeshBasicMaterial({
    color: 0x7cfc9a,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
    depthTest: false,
  }),
);
faceHighlight.renderOrder = 2;
faceHighlight.visible = false;
faceHighlight.geometry.setAttribute(
  "position",
  new THREE.BufferAttribute(new Float32Array(9), 3),
);
scene.add(faceHighlight);

function meshSurface() {
  return meshGroup.visible ? meshGroup.children[0] : null;
}

/** Show or hide the model's edge overlay (highlighted in selection mode). */
function setEdgesVisible(visible) {
  const surface = meshGroup.children[0];
  const edges = surface?.children.find((c) => c.isLineSegments);
  if (edges) {
    edges.visible = visible;
    requestRender();
  }
}

/** Raycast the loaded mesh and return the first hit, or null. */
function raycastMesh(clientX, clientY) {
  const surface = meshSurface();
  if (!surface) return null;

  const rect = renderer.domElement.getBoundingClientRect();
  pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointerNdc, camera);

  const hits = raycaster.intersectObject(surface, false);
  return hits.length ? hits[0] : null;
}

/** Move the highlight overlay onto the hovered triangle. */
function showFaceHighlight(hit) {
  const surface = hit.object;
  const position = surface.geometry.attributes.position;
  const coords = faceHighlight.geometry.attributes.position;
  const v = new THREE.Vector3();
  [hit.face.a, hit.face.b, hit.face.c].forEach((index, i) => {
    v.fromBufferAttribute(position, index).applyMatrix4(surface.matrixWorld);
    coords.setXYZ(i, v.x, v.y, v.z);
  });
  coords.needsUpdate = true;
  faceHighlight.geometry.computeBoundingSphere();
  faceHighlight.visible = true;
  requestRender();
}

function clearFaceHighlight() {
  if (faceHighlight.visible) requestRender();
  faceHighlight.visible = false;
}

function onHover(event) {
  if (!selectMode) return;
  const hit = raycastMesh(event.clientX, event.clientY);
  if (hit) showFaceHighlight(hit);
  else clearFaceHighlight();
}

function onSelectClick(event) {
  if (!selectMode) return;
  const hit = raycastMesh(event.clientX, event.clientY);
  if (!hit) return;
  setSelectMode(false);
  applyTransform(
    "place_face_on_base",
    { face_index: hit.faceIndex, ...profileCenter() },
    { reframe: false },
  );
}

function setSelectMode(active) {
  if (active) {
    setTranslateMode(false); // the two placement modes are exclusive
    // Editing placement only makes sense on the STL, so leave the toolpath view.
    if (toolpathGroup.visible) selectView("stl");
  }
  selectMode = active && meshSurface() != null;
  const button = document.getElementById("rotateBaseButton");
  // Icon button: reflect active state via a class (don't overwrite icon+label).
  button.classList.toggle("active", selectMode);
  controls.enabled = !selectMode; // free the mouse for picking while active
  renderer.domElement.style.cursor = selectMode ? "crosshair" : "";
  if (!selectMode) clearFaceHighlight();
  setEdgesVisible(selectMode);
  setStatus(selectMode ? "Click a face to seat it on the plate." : "");
  syncModelToolsActive();
}

/** Keep the mobile model-tool icons highlighted while their mode is active (until
 *  the drop completes / a face is selected). */
function syncModelToolsActive() {
  const tools = document.getElementById("modelTools");
  if (!tools) return;
  tools.querySelector('[data-action="move"]')?.classList.toggle("active", translateMode);
  tools.querySelector('[data-action="rotate"]')?.classList.toggle("active", selectMode);
}

// --- Translate (drag on the plate) -----------------------------------------

let translateMode = false;
let dragging = false;
const dragPlane = new THREE.Plane();
const dragStart = new THREE.Vector3();
const dragPoint = new THREE.Vector3();

/** Intersect the pointer ray with the active drag plane. */
function rayToDragPlane(clientX, clientY, out) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointerNdc, camera);
  return raycaster.ray.intersectPlane(dragPlane, out);
}

function onTranslateDown(event) {
  if (!translateMode) return;
  const hit = raycastMesh(event.clientX, event.clientY);
  if (!hit) return;
  dragging = true;
  // Slide along a horizontal plane through the grabbed point.
  dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 0, 1), hit.point);
  dragStart.copy(hit.point);
  meshGroup.position.set(0, 0, 0);
  renderer.domElement.style.cursor = "grabbing";
}

function onTranslateMove(event) {
  if (!translateMode || !dragging) return;
  if (rayToDragPlane(event.clientX, event.clientY, dragPoint)) {
    meshGroup.position.x = dragPoint.x - dragStart.x;
    meshGroup.position.y = dragPoint.y - dragStart.y;
    updateBoundsState(); // live red/attention feedback as the part is dragged
    requestRender();
  }
}

function onTranslateUp() {
  if (!translateMode || !dragging) return;
  dragging = false;
  const dx = meshGroup.position.x;
  const dy = meshGroup.position.y;
  // Dropping ends the gesture: leave move mode but keep the dragged offset on
  // screen (buildMesh clears it once the rebuilt mesh lands in place).
  setTranslateMode(false, { keepOffset: true });
  if (dx !== 0 || dy !== 0) {
    applyTransform("translate_on_base", { dx, dy }, { reframe: false });
  }
}

function setTranslateMode(active, { keepOffset = false } = {}) {
  if (active) {
    setSelectMode(false); // the two placement modes are exclusive
    // Editing placement only makes sense on the STL, so leave the toolpath view.
    if (toolpathGroup.visible) selectView("stl");
  }
  translateMode = active && meshSurface() != null;
  if (!translateMode) {
    dragging = false;
    // Snap the live offset back only when cancelling without a committed drop.
    if (!keepOffset) meshGroup.position.set(0, 0, 0);
  }
  const button = document.getElementById("translateButton");
  // Icon button: reflect active state via a class (don't overwrite icon+label).
  button.classList.toggle("active", translateMode);
  controls.enabled = !translateMode; // free the mouse for dragging while active
  renderer.domElement.style.cursor = translateMode ? "move" : "";
  setStatus(translateMode ? "Drag the model to move it on the plate." : "");
  syncModelToolsActive();
}

async function applyTransform(type, params, { reframe = true } = {}) {
  setStatus("Applying…");
  const response = await fetch("api/transform", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, ...params }),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    setStatus(detail.detail || "Transform failed.");
    return;
  }
  const payload = await response.json();
  buildMesh(payload);
  if (reframe) frameBounds(payload.bounds);

  // The mesh moved, so any existing toolpath is stale.
  disposeGroup(toolpathGroup);
  disposeGroup(travelGroup);
  toolpathObject = null;
  toolpathTubeParts = [];
  toolpathSegments = [];
  toolpathMoves = [];
  allSegments = [];
  allMoves = [];
  hasShortTravel = false;
  hasLongTravel = false;
  toolpathStats = null;
  totalSegments = 0;
  setPlaying(false);
  setLayerCount(0);
  document.getElementById("simRow").hidden = true;
  document.getElementById("viewToolpath").disabled = true;
  document.getElementById("exportGcodeButton").disabled = true;
  document.getElementById("simulateButton").disabled = true;
  invalidateThermal();
  selectView("stl");
  setStatus(translateMode ? "Drag the model to move it on the plate." : "");
  setSliceDirty(true); // the model moved → the slice is stale
}

// --- Toolpath rendering ----------------------------------------------------

const PERIMETER_COLOR = new THREE.Color(0x4aa3ff);
const INNER_PERIMETER_COLOR = new THREE.Color(0x2f74c9);
const INFILL_COLOR = new THREE.Color(0xff8c26);
const SUPPORT_COLOR = new THREE.Color(0x2ec4b6);
const SUPPORT_OUTER_PERIMETER_COLOR = new THREE.Color(0x1f8f82);
const SUPPORT_INNER_PERIMETER_COLOR = new THREE.Color(0x14635a);
// Per-feature colours so each path type reads as a distinct (but related) hue.
const KIND_COLORS = {
  outer_perimeter: PERIMETER_COLOR,
  inner_perimeter: INNER_PERIMETER_COLOR,
  infill: INFILL_COLOR,
  support_outer_perimeter: SUPPORT_OUTER_PERIMETER_COLOR,
  support_inner_perimeter: SUPPORT_INNER_PERIMETER_COLOR,
  support: SUPPORT_COLOR,
};
// Legend rows in display order: each path kind, its label and swatch class. The
// legend only lists the kinds actually present in the current toolpath.
const KIND_LEGEND = [
  { kind: "outer_perimeter", label: "Outer perimeter", cls: "outer-perimeter" },
  { kind: "inner_perimeter", label: "Inner perimeter", cls: "inner-perimeter" },
  { kind: "infill", label: "Infill", cls: "infill" },
  {
    kind: "support_outer_perimeter",
    label: "Support outer perimeter",
    cls: "support-outer-perimeter",
  },
  {
    kind: "support_inner_perimeter",
    label: "Support inner perimeter",
    cls: "support-inner-perimeter",
  },
  { kind: "support", label: "Support infill", cls: "support" },
];
// How long a full print simulation takes to play back at 1× speed, in seconds.
const PLAYBACK_SECONDS = 30;
// Playback speed multiplier driven by the speed slider (1 = base rate).
let playbackSpeed = 1;

// Whether the setup changed since the last slice (model moved, new STL, profile/
// params changed). Gates the mobile "Slice + Simulate" action — no point re-slicing
// an unchanged setup. Cleared on a successful slice.
let sliceDirty = true;
function updateSliceAvail() {
  const btn = document.getElementById("mSlice");
  if (btn) btn.disabled = !(sliceDirty && meshGroup.children.length > 0);
}
function setSliceDirty(value) {
  sliceDirty = value;
  updateSliceAvail();
  // A completed slice clears the "not sliced" prompt (highlight + warn banner).
  if (!value) {
    setSliceAttention(false);
    if (currentSlicerBannerType === "warn") hideSlicerBanner();
  }
}

let toolpathObject = null;
let totalSegments = 0;
let simValue = 0; // float segment cursor for smooth playback
let playing = false;

// Cached ordered deposition segments so the render style can switch without
// re-fetching: each is { a:[x,y,z], b:[x,y,z], color }.
let toolpathSegments = [];
// Continuous deposition strokes, in print order, for the tube render so each
// stroke draws as a single jointed polyline: { pts:flat[], color, segCount }.
let toolpathMoves = [];
// Unfiltered source data (every kind). toolpathSegments/toolpathMoves above are
// derived from these by removing any kinds the user toggled off in the legend.
let allSegments = [];
let allMoves = [];
// Path kinds present in the current toolpath (display order) + the set the user
// has hidden via the legend toggles.
let presentKinds = [];
const hiddenKinds = new Set();
// Tube-mode reveal metadata, one entry per stroke in print order. Every stroke
// is baked into a SINGLE merged mesh (toolpathTubeMesh) so the whole toolpath
// draws in one call; each entry only records where that stroke's slice lives in
// the merged index buffer plus the ring data needed to cap its printing tip:
// { start, count, wallSegments, indicesPerRing, ringVerts, ringCenters,
//   ringCount, sides, closed, color, startCapIndexCount, wallIndexCount,
//   endCapIndexCount }.
let toolpathTubeParts = [];
// Single merged tube mesh + two reusable cap fans (one for the moving leading
// tip, one for a closed loop's start ring) shared across all strokes.
let toolpathTubeMesh = null;
let toolpathLeadCap = null;
let toolpathStartCap = null;
let toolpathStats = null;
let lastSimPayload = null; // last thermal-sim result, saved alongside the slice
let lastSlicePayload = null; // last slice result (buildToolpath input), saved for reload
let toolpathStyle = "tube"; // "line" | "tube"

// Bridge to an embedding viewer (e.g. the avisualizer URDF viewer). Whenever the
// model / slice / thermal changes we push the latest data up to the parent frame
// so it can render the model, toolpath and thermal itself and drive its own print
// simulation with the EXACT placement used here (mesh + toolpath are already in
// build-plate coordinates, mm, z=0 = plate). Best-effort, cross-origin ("*").
function postSliceDataToParent() {
  if (typeof window === "undefined" || window.parent === window) {
    return;
  }
  try {
    let mesh = null;
    const surface = meshGroup.children[0];
    if (surface && surface.geometry) {
      const pos = surface.geometry.getAttribute("position");
      const idx = surface.geometry.getIndex();
      if (pos) {
        mesh = {
          positions: pos.array, // Float32Array (structured-clone copied)
          indices: idx ? idx.array : null,
          bounds: currentBounds,
        };
      }
    }
    // Plate centring point (mm). Toolpath moves and the mesh are in absolute
    // build-plate coordinates, so the embedding viewer needs the plate centre to
    // map our plate origin onto its nozzle while preserving any model offset.
    const plateCenter = profileCenter();
    window.parent.postMessage(
      {
        source: "meltio-slicer",
        type: "slice-data",
        toolpath: lastSlicePayload || null,
        thermal: lastSimPayload || null,
        mesh,
        plate: { centerXmm: plateCenter.cx, centerYmm: plateCenter.cy },
        // Real deposition movement speed (mm/s) so the viewer can play the print
        // simulation at true 1x speed (scaled by a user multiplier).
        speedMmPerSec: representativeMoveSpeedMmPerSec(),
      },
      "*",
    );
  } catch (err) {
    console.warn("[slicer] postSliceDataToParent failed:", err && err.message ? err.message : err);
  }
}

// Travel overlay: the rapid jumps between deposition strokes, drawn as plain
// lines (never tubes — see travelGroup). Derived on the client from the visible
// moves (so they respect kind-hiding and layer isolation) and split into short
// hops (no retract) and long hops (retract) — matching the machine program's
// split — so each can be coloured, toggled, AND revealed in step with the
// progress slider via a draw range. Shown by default so seams/jumps are
// immediately inspectable; toggled via the legend.
const TRAVEL_SHORT_COLOR = new THREE.Color(0x6fcf97); // green: short, no retract
const TRAVEL_LONG_COLOR = new THREE.Color(0xff5d9e); // pink: long, retract
let travelThreshold = 2.0; // mm; short/long split (from stats.maxTravelNoRetractMm)
let hasShortTravel = false; // whether the current slice has any of each kind
let hasLongTravel = false;
// One merged LineSegments per kind. Each carries a `reveal` array (ascending
// segment-cursor positions, one per hop in geometry order) so setProgress can
// clip it to the playback cursor with a draw range — exactly like the tubes.
let travelShortObject = null;
let travelLongObject = null;
let showShortTravels = false;
let showLongTravels = false;

// Thermal heat-map data, built from /api/simulate. Each move/segment carries a
// raw, globally-normalised heat `score`/`pointScores` (0..1 across the whole
// print) plus the `layer` it belongs to. In the thermal view the SAME toolpath
// geometry is recoloured from these per-chunk strokes/segments (so the
// playback reveal still works); `thermalSeries` feeds the bottom chart.
let thermalMoves = []; // per ~5mm chunk, shaped like allMoves (raw scores)
let thermalSegments = []; // per render segment, shaped like allSegments
let thermalSeries = null; // { x:[time 0..1], peak:[0..1], indexToTime:[] } chart
// Layer-isolated, colour-baked subset of the above actually fed to the
// geometry builder (see bakeThermalColors / refreshVisibleData).
let thermalMovesVisible = [];
let thermalSegmentsVisible = [];
// Per-layer span within the full (deposition-ordered) thermalSegments list:
// thermalLayerRanges[layer] = { start, count }. Lets the thermal chart shade a
// single isolated layer's time band and map its local reveal cursor back onto
// the whole-print time axis. Indexed by layer number (may be sparse).
let thermalLayerRanges = [];
// Which colour source the toolpath geometry is currently built from.
let renderColorMode = "kind"; // "kind" | "thermal"

// Layer isolation: when active, only the selected layer's moves/segments feed
// the geometry (and, in thermal mode, the heat colours are rescaled to that
// layer's own coolest..hottest range instead of the whole print's).
let layerCount = 0;
let isolateLayer = false;
let activeLayer = 0;

/** Moves feeding the geometry: thermal chunks in the thermal view, else kinds. */
function activeMoves() {
  return renderColorMode === "thermal" ? thermalMovesVisible : toolpathMoves;
}

/** Segments feeding the geometry (line mode / nozzle tip lookups). */
function activeSegments() {
  return renderColorMode === "thermal" ? thermalSegmentsVisible : toolpathSegments;
}

/** Map a normalised heat score (0..1) to a colour: blue cold -> red hot. */
function heatColor(score, out) {
  const c = out || new THREE.Color();
  return c.setHSL((1 - Math.max(0, Math.min(1, score))) * 0.66, 0.9, 0.5);
}

/** Forget any thermal result, drop back to the toolpath view, hide its UI. */
function invalidateThermal() {
  thermalMoves = [];
  thermalSegments = [];
  thermalMovesVisible = [];
  thermalSegmentsVisible = [];
  thermalLayerRanges = [];
  thermalSeries = null;
  const viewThermal = document.getElementById("viewThermal");
  if (viewThermal) {
    viewThermal.disabled = true;
    if (viewThermal.checked) selectView("toolpath");
  }
  if (renderColorMode === "thermal") setColorMode("kind");
  updateThermalUi(false);
}

/**
 * Ingest a /api/simulate payload. Consecutive heat chunks of the SAME source
 * move are merged back into one continuous stroke, so the tube/line builders
 * round corners and blend exactly like the toolpath perimeters. Each merged
 * stroke keeps its raw, globally-normalised per-point heat score (averaged at
 * chunk seams); colours are baked separately (see bakeThermalColors) so layer
 * isolation can rescale them to a single layer's own coolest..hottest range.
 */
function buildThermal(payload) {
  thermalMoves = [];
  thermalSegments = [];
  thermalLayerRanges = [];
  thermalSeries = payload.series || null;
  const segs = payload.segments || [];
  let gi = 0;
  while (gi < segs.length) {
    const moveId = segs[gi].move;
    const layer = segs[gi].layer ?? 0;
    const pts = []; // flat xyz of the merged stroke
    const sums = []; // per-point score accumulator
    const counts = []; // per-point sample count
    let first = true;
    while (gi < segs.length && segs[gi].move === moveId) {
      const flat = segs[gi].points;
      const score = segs[gi].score;
      const np = Math.floor(flat.length / 3);
      // The first point of a follow-on chunk coincides with the previous
      // chunk's last point: blend their scores there instead of duplicating it.
      let startK = 0;
      if (!first && np > 0 && sums.length > 0) {
        sums[sums.length - 1] += score;
        counts[counts.length - 1] += 1;
        startK = 1;
      }
      for (let k = startK; k < np; k += 1) {
        pts.push(flat[k * 3], flat[k * 3 + 1], flat[k * 3 + 2]);
        sums.push(score);
        counts.push(1);
      }
      first = false;
      gi += 1;
    }
    const pointCount = sums.length;
    if (pointCount < 2) continue;
    const pointScores = new Array(pointCount);
    for (let k = 0; k < pointCount; k += 1) {
      pointScores[k] = sums[k] / counts[k];
    }
    thermalMoves.push({
      pts,
      pointScores,
      segCount: pointCount - 1,
      orient: null,
      bead: null,
      kind: "thermal",
      layer,
    });
    for (let k = 0; k + 1 < pointCount; k += 1) {
      thermalSegments.push({
        a: [pts[k * 3], pts[k * 3 + 1], pts[k * 3 + 2]],
        b: [pts[(k + 1) * 3], pts[(k + 1) * 3 + 1], pts[(k + 1) * 3 + 2]],
        scoreA: pointScores[k],
        scoreB: pointScores[k + 1],
        kind: "thermal",
        orient: null,
        layer,
      });
    }
  }

  // Index each layer's contiguous span in the deposition-ordered segment list,
  // so single-layer isolation can locate the layer on the whole-print timeline.
  thermalLayerRanges = [];
  for (let i = 0; i < thermalSegments.length; i += 1) {
    const L = thermalSegments[i].layer;
    const range =
      thermalLayerRanges[L] || (thermalLayerRanges[L] = { start: i, count: 0 });
    range.count += 1;
  }
}

/**
 * Bake display colours onto a (possibly layer-filtered) set of thermal moves
 * and segments, in place. Scores are already 0..1 normalised across the WHOLE
 * print; when isolating a single layer we rescale that layer's own min..max
 * score to 0..1 first, so the heat-map always spans the full colour range for
 * whatever is currently visible. Stores the rescaled values in `displayScores`
 * (never overwriting the original `pointScores`) so toggling isolation back
 * off still has the untouched global scores to rebake from.
 */
function bakeThermalColors(moves, segments) {
  const tmp = new THREE.Color();
  let lo = 0;
  let hi = 1;
  if (isolateLayer) {
    let mn = Infinity;
    let mx = -Infinity;
    for (const m of moves) {
      for (const s of m.pointScores) {
        if (s < mn) mn = s;
        if (s > mx) mx = s;
      }
    }
    if (mn <= mx) {
      lo = mn;
      hi = mx;
    }
  }
  const span = hi - lo;
  const remap = (v) => (span > 1e-9 ? (v - lo) / span : 0.5);
  for (const m of moves) {
    const display = m.pointScores.map(remap);
    m.displayScores = display;
    let mean = 0;
    for (const v of display) mean += v;
    m.color = heatColor(mean / (display.length || 1), tmp).clone();
  }
  for (const s of segments) {
    const colorA = heatColor(remap(s.scoreA), tmp).clone();
    const colorB = heatColor(remap(s.scoreB), tmp).clone();
    s.color = colorA;
    s.colorA = colorA;
    s.colorB = colorB;
  }
}

/** Format a duration as whole hours and minutes, e.g. "1h 05m". */
function formatHoursMinutes(seconds) {
  const totalMin = Math.max(0, Math.round(seconds / 60));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function buildToolpath(payload) {
  // A fresh slice always starts kind-coloured; clear any stale thermal mode so
  // the geometry builder below reads the toolpath data, not old heat data.
  renderColorMode = "kind";
  // Flatten every move into ordered segments, coloured per kind, in deposition
  // order so the slider reveals them as printed. Keep the FULL set here; the
  // legend toggles and layer isolation derive the visible subset (see
  // refreshVisibleData).
  allSegments = [];
  allMoves = [];
  toolpathStats = payload.stats;
  const present = new Set();
  for (const move of payload.moves || []) {
    const flat = move.points;
    const orient = move.orient || null;
    const bead = move.bead || null;
    const kind = move.kind || "outer_perimeter";
    const layer = move.layer ?? 0;
    const col = KIND_COLORS[kind] || PERIMETER_COLOR;
    const segCount = Math.max(0, Math.floor(flat.length / 3) - 1);
    if (segCount > 0) {
      present.add(kind);
      allMoves.push({ pts: flat, color: col, segCount, orient, bead, kind, layer });
    }
    for (let i = 0; i + 5 < flat.length; i += 3) {
      const bIdx = i / 3 + 1; // orientation index of the segment's end point
      allSegments.push({
        a: [flat[i], flat[i + 1], flat[i + 2]],
        b: [flat[i + 3], flat[i + 4], flat[i + 5]],
        color: col,
        kind,
        layer,
        orient: orient
          ? [orient[bIdx * 3], orient[bIdx * 3 + 1], orient[bIdx * 3 + 2]]
          : null,
      });
    }
  }

  // Travel overlay setup: the hops themselves are derived per-refresh from the
  // visible moves (see rebuildTravelGeometry); here we only record the short/long
  // threshold and whether the full toolpath has any of each kind, so the legend
  // can offer the matching toggles.
  travelThreshold = toolpathStats?.maxTravelNoRetractMm ?? 2.0;
  hasShortTravel = false;
  hasLongTravel = false;
  for (let i = 1; i < allMoves.length; i += 1) {
    const prev = allMoves[i - 1].pts;
    const cur = allMoves[i].pts;
    const dx = cur[0] - prev[prev.length - 3];
    const dy = cur[1] - prev[prev.length - 2];
    const dz = cur[2] - prev[prev.length - 1];
    const gap = Math.hypot(dx, dy, dz);
    if (gap <= 1e-6) continue;
    if (gap > travelThreshold) hasLongTravel = true;
    else hasShortTravel = true;
    if (hasShortTravel && hasLongTravel) break;
  }

  // Reset toggles for the new toolpath and rebuild the legend from the kinds
  // that are actually present (in canonical display order).
  hiddenKinds.clear();
  presentKinds = KIND_LEGEND.filter((k) => present.has(k.kind)).map(
    (k) => k.kind,
  );
  buildLegend();
  updateLegendStats();

  document.getElementById("simRow").hidden = allSegments.length === 0;
  setLayerCount(toolpathStats?.layers || 0);
  // Reveal the whole path by default; the slider can scrub back through it.
  refreshVisibleData({ reveal: true });
  updateLegendVisibility();
  setStatus("");
}

/**
 * Rebuild toolpathSegments/toolpathMoves (kind legend + layer isolation) and
 * thermalMovesVisible/thermalSegmentsVisible (layer isolation, recoloured),
 * then rebuild the geometry for whichever is active. When `reveal` is set (a
 * fresh slice, a kind toggle, or a layer-isolation change) the slider snaps to
 * fully revealed.
 */
function refreshVisibleData({ reveal = false } = {}) {
  let km = allMoves.filter((m) => !hiddenKinds.has(m.kind));
  let ks = allSegments.filter((s) => !hiddenKinds.has(s.kind));
  let tm = thermalMoves;
  let ts = thermalSegments;
  if (isolateLayer) {
    km = km.filter((m) => m.layer === activeLayer);
    ks = ks.filter((s) => s.layer === activeLayer);
    tm = tm.filter((m) => m.layer === activeLayer);
    ts = ts.filter((s) => s.layer === activeLayer);
  }
  toolpathMoves = km;
  toolpathSegments = ks;
  bakeThermalColors(tm, ts);
  thermalMovesVisible = tm;
  thermalSegmentsVisible = ts;

  rebuildToolpathGeometry(); // sets totalSegments from activeSegments()
  rebuildTravelGeometry();

  const slider = document.getElementById("progress");
  slider.max = String(totalSegments);
  if (reveal) {
    setPlaying(false);
    setProgress(totalSegments);
  } else {
    setProgress(Math.min(simValue, totalSegments));
  }
  // The visible set (and, in thermal, its rescaled colours) just changed, so
  // refresh the shared legend's stats + average-heat marker.
  updateLegendVisibility();
}

/** Build one travel LineSegments (positions + ascending reveal cursors). */
function makeTravelObject(positions, reveal, color) {
  if (!positions.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  const object = new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.6 }),
  );
  object.frustumCulled = false;
  // `reveal[k]` is the segment-cursor value at which hop k appears (the count of
  // deposition segments printed before its source stroke's travel happens).
  object.userData.reveal = reveal;
  travelGroup.add(object);
  return object;
}

/**
 * Rebuild both travel overlays from the currently visible moves. Each gap
 * between consecutive visible strokes is a travel hop; walking the moves in
 * deposition order yields hops already sorted by their reveal cursor (the
 * running deposition-segment count), so setProgress can clip each overlay to the
 * playback position with a draw range — exactly like the tube reveal.
 */
function rebuildTravelGeometry() {
  disposeGroup(travelGroup);
  travelShortObject = null;
  travelLongObject = null;
  const moves = activeMoves();
  const shortPos = [];
  const shortReveal = [];
  const longPos = [];
  const longReveal = [];
  let cum = 0; // deposition segments before the current move
  for (let i = 0; i < moves.length; i += 1) {
    const move = moves[i];
    if (i > 0) {
      const prev = moves[i - 1].pts;
      const cur = move.pts;
      const ax = prev[prev.length - 3];
      const ay = prev[prev.length - 2];
      const az = prev[prev.length - 1];
      const bx = cur[0];
      const by = cur[1];
      const bz = cur[2];
      const gap = Math.hypot(bx - ax, by - ay, bz - az);
      if (gap > 1e-6) {
        if (gap > travelThreshold) {
          longPos.push(ax, ay, az, bx, by, bz);
          longReveal.push(cum);
        } else {
          shortPos.push(ax, ay, az, bx, by, bz);
          shortReveal.push(cum);
        }
      }
    }
    cum += move.segCount;
  }
  travelShortObject = makeTravelObject(shortPos, shortReveal, TRAVEL_SHORT_COLOR);
  travelLongObject = makeTravelObject(longPos, longReveal, TRAVEL_LONG_COLOR);
  applyTravelReveal();
  updateTravelVisibility();
}

/** Clip each travel overlay to the playback cursor (count hops with reveal ≤ cursor). */
function applyTravelReveal() {
  for (const object of [travelShortObject, travelLongObject]) {
    if (!object) continue;
    const reveal = object.userData.reveal;
    // reveal is ascending, so the number of revealed hops is an upper-bound scan.
    let count = reveal.length;
    for (let k = 0; k < reveal.length; k += 1) {
      if (reveal[k] > simValue) {
        count = k;
        break;
      }
    }
    object.geometry.setDrawRange(0, count * 2);
  }
}

/** Travels ride along with the toolpath/thermal view and their legend toggles. */
function updateTravelVisibility() {
  const onView = toolpathGroup.visible;
  travelGroup.visible = onView && (showShortTravels || showLongTravels);
  if (travelShortObject) travelShortObject.visible = onView && showShortTravels;
  if (travelLongObject) travelLongObject.visible = onView && showLongTravels;
  requestRender();
}

/** Show/hide a travel overlay from its legend row ("short" or "long"). */
function toggleTravels(which) {
  if (which === "long") showLongTravels = !showLongTravels;
  else showShortTravels = !showShortTravels;
  updateLegendItemStates();
  updateTravelVisibility();
}

/** Rebuild the clickable legend rows from the present kinds. */
function buildLegend() {
  const container = document.getElementById("legendItems");
  container.innerHTML = "";
  for (const kind of presentKinds) {
    const meta = KIND_LEGEND.find((k) => k.kind === kind);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "legend-item";
    btn.dataset.kind = kind;
    btn.innerHTML = `<i class="swatch ${meta.cls}"></i><span>${meta.label}</span>`;
    btn.addEventListener("click", () => toggleKind(kind));
    container.appendChild(btn);
  }
  // Travel hops aren't a deposition kind — append their own toggle rows (short
  // and long) when the slice produced each, so they hide independently of the
  // path kinds and of each other.
  const hasShort = hasShortTravel;
  const hasLong = hasLongTravel;
  const addTravelRow = (which, label, cls, present) => {
    if (!present) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "legend-item";
    btn.dataset.travel = which;
    btn.innerHTML = `<i class="swatch ${cls}"></i><span>${label}</span>`;
    btn.addEventListener("click", () => toggleTravels(which));
    container.appendChild(btn);
  };
  addTravelRow("short", "Travel (short)", "travel-short", hasShort);
  addTravelRow("long", "Travel (long)", "travel-long", hasLong);
  updateLegendItemStates();
}

/** Show/hide a path kind in the viewer when its legend row is clicked. */
function toggleKind(kind) {
  if (hiddenKinds.has(kind)) hiddenKinds.delete(kind);
  else hiddenKinds.add(kind);
  updateLegendItemStates();
  refreshVisibleData({ reveal: true });
}

/** Grey out the legend rows for currently hidden kinds / travel overlays. */
function updateLegendItemStates() {
  for (const btn of document.querySelectorAll(".legend-item")) {
    let off;
    if (btn.dataset.travel === "short") off = !showShortTravels;
    else if (btn.dataset.travel === "long") off = !showLongTravels;
    else off = hiddenKinds.has(btn.dataset.kind);
    btn.classList.toggle("disabled", off);
  }
}

/** Render the print stats (layers, time, weight) below the legend swatches. */
function updateLegendStats() {
  const el = document.getElementById("legendStats");
  const stats = toolpathStats;
  if (!stats) {
    el.innerHTML = "";
    return;
  }
  // In single-layer (isolate) mode the layer count row becomes the active layer
  // selector readout ("Layer n of m"); otherwise it shows the total count.
  const layerRow =
    isolateLayer && layerCount > 0
      ? ["Layer", `${activeLayer + 1} of ${layerCount}`]
      : ["Layers", String(stats.layers)];
  const rows = [
    layerRow,
    ["Print time", formatHoursMinutes(stats.estimatedTimeS)],
  ];
  if (stats.estimatedWeightG != null)
    rows.push(["Weight", `${(stats.estimatedWeightG / 1000).toFixed(1)} kg`]);
  el.innerHTML = rows
    .map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`)
    .join("");
}

/**
 * Single legend panel shared by both preview views: the kind toggles (kind
 * view) or the heat colour bar (thermal view) on top, with the Layer/Print
 * time/Weight stats below in both. Refreshes the stats and (in thermal) the
 * average-heat marker so one call keeps the whole panel current.
 */
function updateLegendVisibility() {
  const thermal = renderColorMode === "thermal";
  const hasData = thermal ? thermalMoves.length > 0 : allSegments.length > 0;
  const show = toolpathGroup.visible && hasData;
  document.getElementById("legendPanel").hidden = !show;
  document.getElementById("legendItems").hidden = thermal;
  document.getElementById("legendScale").hidden = !thermal;
  if (show) {
    updateLegendStats();
    if (thermal) updateThermalScale();
  }
}

/** Position the "avg" marker + readout at the mean relative heat of the moves. */
function updateThermalScale() {
  let sum = 0;
  let n = 0;
  for (const move of thermalMovesVisible) {
    const scores = move.displayScores || move.pointScores;
    for (const s of scores) {
      sum += s;
      n += 1;
    }
  }
  const avg = n > 0 ? sum / n : 0.5;
  const pct = avg * 100; // bar left is cool (score 0), right is hot (score 1)
  document.getElementById("thermalAvg").style.left = `${pct}%`;
  const label = document.getElementById("thermalAvgLabel");
  // In isolated-layer view, clarify the marker is the layer's average.
  label.textContent = `${isolateLayer ? "layer avg" : "avg"} ${Math.round(pct)}%`;
  // Keep the readout inside the panel even when the average is near an extreme.
  label.style.left = `${Math.min(80, Math.max(20, pct))}%`;
}

/**
 * Switch the toolpath geometry's colour source (kind vs thermal) and rebuild,
 * preserving the playback position as a fraction so the reveal cursor lands in
 * the same place across the two views (their segment counts differ).
 */
function setColorMode(mode) {
  if (mode === renderColorMode) return;
  const oldTotal = totalSegments;
  const frac = oldTotal > 0 ? simValue / oldTotal : 1;
  renderColorMode = mode;
  rebuildToolpathGeometry();
  // The active move set differs between kind and thermal, so the travel hops
  // (and their reveal cursors) must be rebuilt from the new moves.
  rebuildTravelGeometry();
  const slider = document.getElementById("progress");
  slider.max = String(totalSegments);
  setProgress(frac * totalSegments);
}

/** Rebuild the toolpath mesh from cached segments in the current style. */
function rebuildToolpathGeometry() {
  disposeGroup(toolpathGroup);
  toolpathObject = null;
  toolpathTubeParts = [];
  toolpathTubeMesh = null;
  toolpathLeadCap = null;
  toolpathStartCap = null;
  totalSegments = activeSegments().length;
  if (totalSegments === 0) return;
  if (toolpathStyle === "tube") buildToolpathTubes();
  else buildToolpathLines();
  setProgress(simValue);
}

function buildToolpathLines() {
  const positions = [];
  const colors = [];
  for (const s of activeSegments()) {
    positions.push(s.a[0], s.a[1], s.a[2], s.b[0], s.b[1], s.b[2]);
    // Heat segments carry distinct endpoint colours so the line fades along the
    // stroke; kind segments use one solid colour for both ends.
    const ca = s.colorA || s.color;
    const cb = s.colorB || s.color;
    colors.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  toolpathObject = new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({ vertexColors: true }),
  );
  toolpathGroup.add(toolpathObject);
}

// Cross-section resolution of the extruded bead (octagonal tube).
const TUBE_SIDES = 8;

/**
 * Round only the *corners* of a polyline, leaving straight runs exactly
 * straight. Each interior vertex whose turn exceeds a small threshold is
 * replaced by a short tangent circular arc of radius `fillet` (clamped so it
 * never eats more than half of either adjacent segment). This gives the smooth
 * corner transitions we want without bending the long wall edges (a Catmull-Rom
 * through every vertex bowed the straight walls, which was unacceptable).
 * `pts` are distinct Vector3 (for closed loops the duplicate end point is
 * dropped before calling). Returns a new distinct-point array.
 */
function buildRoundedPath(pts, closed, fillet, vals = null, outVals = null) {
  const n = pts.length;
  if (n < 3) {
    if (outVals && vals) for (const v of vals) outVals.push(v);
    return pts.map((p) => p.clone());
  }
  const straightDot = Math.cos(THREE.MathUtils.degToRad(6)); // < 6° turn ⇒ straight
  const out = [];
  const vout = [];
  // Push an output point and, when scalars are tracked, its parallel value.
  const pushOut = (p, v) => {
    out.push(p);
    if (vals) vout.push(v);
  };
  for (let i = 0; i < n; i++) {
    const vi = vals ? vals[i] : 0;
    if (!closed && (i === 0 || i === n - 1)) {
      pushOut(pts[i].clone(), vi);
      continue;
    }
    const prev = pts[(i - 1 + n) % n];
    const cur = pts[i];
    const next = pts[(i + 1) % n];
    const dIn = new THREE.Vector3().subVectors(cur, prev);
    const dOut = new THREE.Vector3().subVectors(next, cur);
    const lenIn = dIn.length();
    const lenOut = dOut.length();
    if (lenIn < 1e-6 || lenOut < 1e-6) {
      pushOut(cur.clone(), vi);
      continue;
    }
    dIn.multiplyScalar(1 / lenIn);
    dOut.multiplyScalar(1 / lenOut);
    const turnDot = dIn.dot(dOut); // 1 ⇒ collinear (straight)
    if (turnDot > straightDot) {
      pushOut(cur.clone(), vi);
      continue;
    }
    // Interior angle between (prev→cur reversed) and (cur→next): cos = -turnDot.
    const alpha = Math.acos(THREE.MathUtils.clamp(-turnDot, -1, 1));
    const half = alpha / 2;
    const tanHalf = Math.tan(half);
    // Radius clamped so the setback fits inside both adjacent segments.
    const radiusCorner = Math.min(
      fillet,
      0.5 * lenIn * tanHalf,
      0.5 * lenOut * tanHalf,
    );
    const setback = radiusCorner / tanHalf;
    const tin = new THREE.Vector3().copy(cur).addScaledVector(dIn, -setback);
    const tout = new THREE.Vector3().copy(cur).addScaledVector(dOut, setback);
    const bis = new THREE.Vector3().copy(dOut).sub(dIn); // = (−dIn) + dOut, into interior
    if (bis.lengthSq() < 1e-12) {
      pushOut(cur.clone(), vi);
      continue;
    }
    bis.normalize();
    const center = new THREE.Vector3()
      .copy(cur)
      .addScaledVector(bis, radiusCorner / Math.sin(half));
    const vIn = new THREE.Vector3().subVectors(tin, center);
    const vOut = new THREE.Vector3().subVectors(tout, center);
    const arcAngle = vIn.angleTo(vOut);
    const steps = Math.max(1, Math.ceil(arcAngle / THREE.MathUtils.degToRad(15)));
    const axis = new THREE.Vector3().crossVectors(vIn, vOut);
    pushOut(tin.clone(), vi);
    if (axis.lengthSq() > 1e-12) {
      axis.normalize();
      const q = new THREE.Quaternion();
      for (let s = 1; s < steps; s++) {
        q.setFromAxisAngle(axis, (arcAngle * s) / steps);
        pushOut(vIn.clone().applyQuaternion(q).add(center), vi);
      }
    }
    pushOut(tout.clone(), vi);
  }
  // Drop consecutive duplicates the arcs may have produced.
  const cleaned = [out[0]];
  const cleanedV = vals ? [vout[0]] : null;
  for (let i = 1; i < out.length; i++) {
    if (out[i].distanceToSquared(cleaned[cleaned.length - 1]) > 1e-10) {
      cleaned.push(out[i]);
      if (vals) cleanedV.push(vout[i]);
    }
  }
  if (outVals && vals) for (const v of cleanedV) outVals.push(v);
  return cleaned;
}

/**
 * Sweep a regular `sides`-gon of the given radius along `path` (an array of
 * distinct Vector3), using parallel-transport frames so the tube does not
 * twist. For open paths both ends get a flat fan cap; for closed loops the
 * walls wrap and a twist correction is distributed so the seam ring lines up.
 * The wall faces are emitted ring-by-ring so the print simulation can reveal
 * them with a draw range. Returns the geometry plus the metadata setProgress
 * needs to clip the reveal and place the moving leading-end cap.
 */
function buildSweptTube(path, closed, halfWidth, halfHeight, sides) {
  const R = path.length;
  // Tangents.
  const tangents = [];
  for (let i = 0; i < R; i++) {
    const t = new THREE.Vector3();
    if (closed) t.subVectors(path[(i + 1) % R], path[(i - 1 + R) % R]);
    else if (i === 0) t.subVectors(path[1], path[0]);
    else if (i === R - 1) t.subVectors(path[R - 1], path[R - 2]);
    else t.subVectors(path[i + 1], path[i - 1]);
    if (t.lengthSq() < 1e-12) t.set(0, 0, 1);
    tangents.push(t.normalize());
  }
  // Initial frame normal, then parallel-transport it along the path.
  const up =
    Math.abs(tangents[0].z) < 0.99
      ? new THREE.Vector3(0, 0, 1)
      : new THREE.Vector3(1, 0, 0);
  const normals = [new THREE.Vector3().crossVectors(up, tangents[0]).normalize()];
  const transport = (n, t0, t1) => {
    const axis = new THREE.Vector3().crossVectors(t0, t1);
    const sin = axis.length();
    if (sin > 1e-9) {
      axis.multiplyScalar(1 / sin);
      n.applyAxisAngle(axis, Math.atan2(sin, t0.dot(t1)));
    }
    n.addScaledVector(t1, -n.dot(t1)).normalize();
    return n;
  };
  for (let i = 1; i < R; i++) {
    normals.push(transport(normals[i - 1].clone(), tangents[i - 1], tangents[i]));
  }
  if (closed && R > 2) {
    // Transport once more around the seam and cancel the holonomy twist.
    const wrapped = transport(
      normals[R - 1].clone(),
      tangents[R - 1],
      tangents[0],
    );
    const theta = Math.atan2(
      new THREE.Vector3().crossVectors(wrapped, normals[0]).dot(tangents[0]),
      wrapped.dot(normals[0]),
    );
    for (let i = 0; i < R; i++) {
      normals[i].applyAxisAngle(tangents[i], (theta * i) / R);
    }
  }
  // Ring vertices (with outward normals so lighting is correct regardless of
  // winding). Also keep a flat copy of ring vertices + centres for the cap.
  const positions = [];
  const norms = [];
  const ringVerts = new Float32Array(R * sides * 3);
  const ringCenters = new Float32Array(R * 3);
  for (let i = 0; i < R; i++) {
    const t = tangents[i];
    const nrm = normals[i];
    const bn = new THREE.Vector3().crossVectors(t, nrm).normalize();
    ringCenters[i * 3] = path[i].x;
    ringCenters[i * 3 + 1] = path[i].y;
    ringCenters[i * 3 + 2] = path[i].z;
    for (let k = 0; k < sides; k++) {
      // Offset by half a step so a flat FACE (not a vertex) sits at the top and
      // bottom of the section — i.e. a flat side runs parallel to the ground
      // for the typical horizontal toolpath segment. `nrm` is the in-plane
      // sideways axis (bead WIDTH), `bn` the vertical axis (layer HEIGHT), so
      // the section is an ellipse of half-extents (halfWidth, halfHeight).
      const a = ((k + 0.5) / sides) * Math.PI * 2;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      const px = path[i].x + halfWidth * cos * nrm.x + halfHeight * sin * bn.x;
      const py = path[i].y + halfWidth * cos * nrm.y + halfHeight * sin * bn.y;
      const pz = path[i].z + halfWidth * cos * nrm.z + halfHeight * sin * bn.z;
      // Outward normal of the ellipse: gradient ∝ (cos/halfWidth, sin/halfHeight)
      // in the (nrm, bn) basis, then expressed in world space and normalised.
      const lnx = cos / halfWidth;
      const lny = sin / halfHeight;
      let nx = lnx * nrm.x + lny * bn.x;
      let ny = lnx * nrm.y + lny * bn.y;
      let nz = lnx * nrm.z + lny * bn.z;
      const nlen = Math.hypot(nx, ny, nz) || 1;
      nx /= nlen;
      ny /= nlen;
      nz /= nlen;
      positions.push(px, py, pz);
      norms.push(nx, ny, nz);
      const ri = (i * sides + k) * 3;
      ringVerts[ri] = px;
      ringVerts[ri + 1] = py;
      ringVerts[ri + 2] = pz;
    }
  }
  // Wall faces, ring segment by ring segment.
  const indices = [];
  const segCount = closed ? R : R - 1;
  for (let i = 0; i < segCount; i++) {
    const i0 = i % R;
    const i1 = (i + 1) % R;
    for (let k = 0; k < sides; k++) {
      const k1 = (k + 1) % sides;
      const a = i0 * sides + k;
      const b = i1 * sides + k;
      const c = i1 * sides + k1;
      const d = i0 * sides + k1;
      indices.push(a, b, d, b, c, d);
    }
  }
  const indicesPerRing = sides * 6;
  const wallIndexCount = indices.length;
  const wallSegments = segCount;
  // Flat end caps for open strokes (fan from the ring centre). The start cap
  // goes BEFORE the walls and the end cap AFTER, so a partial reveal draw range
  // shows the start cap + the revealed walls but hides the far end cap.
  let startCapIndexCount = 0;
  let endCapIndexCount = 0;
  const addCap = (ringIndex, faceDir) => {
    const centerIdx = positions.length / 3;
    positions.push(
      ringCenters[ringIndex * 3],
      ringCenters[ringIndex * 3 + 1],
      ringCenters[ringIndex * 3 + 2],
    );
    norms.push(faceDir.x, faceDir.y, faceDir.z);
    const rimBase = positions.length / 3;
    for (let k = 0; k < sides; k++) {
      const ri = (ringIndex * sides + k) * 3;
      positions.push(ringVerts[ri], ringVerts[ri + 1], ringVerts[ri + 2]);
      norms.push(faceDir.x, faceDir.y, faceDir.z);
    }
    const local = [];
    for (let k = 0; k < sides; k++) {
      local.push(centerIdx, rimBase + k, rimBase + ((k + 1) % sides));
    }
    return local;
  };
  let preWall = [];
  let postWall = [];
  if (!closed) {
    preWall = addCap(0, tangents[0].clone().negate());
    postWall = addCap(R - 1, tangents[R - 1].clone());
    startCapIndexCount = preWall.length;
    endCapIndexCount = postWall.length;
  }
  const ordered = preWall.concat(indices, postWall);
  return {
    positions,
    norms,
    ordered,
    ringVerts,
    ringCenters,
    ringCount: R,
    sides,
    indicesPerRing,
    wallIndexCount,
    wallSegments,
    startCapIndexCount,
    endCapIndexCount,
  };
}

/**
 * Build the toolpath as a SINGLE merged extruded octagonal-bead mesh. Each
 * deposition stroke keeps its exact straight segments (only corners are
 * filleted, see buildRoundedPath) and is swept into an octagonal tube; all the
 * strokes are concatenated — in print order — into one BufferGeometry with
 * per-vertex colours, so the entire toolpath renders in a single draw call
 * (hundreds/thousands of per-stroke meshes used to tank the frame rate). The
 * print simulation reveals strokes by walking a single draw range over that
 * shared index buffer; the currently-printing tip (and a closed loop's start
 * ring) is closed by two reusable cap fans (see setProgress).
 */
function buildToolpathTubes() {
  const beadWidth = toolpathStats?.beadWidthMm ?? 1.0;
  const layerHeight = toolpathStats?.layerHeightMm ?? beadWidth;
  const halfHeight = layerHeight / 2;

  // Merged buffers for every stroke, concatenated in print order.
  const mergedPos = [];
  const mergedNorm = [];
  const mergedCol = [];
  const mergedIdx = [];
  let vertOffset = 0;

  let start = 0;
  for (const move of activeMoves()) {
    // Each stroke renders at its own feature bead width when provided, so e.g.
    // a wider inner perimeter shows as a thicker tube than the outer wall.
    const moveBead = move.bead && move.bead > 0 ? move.bead : beadWidth;
    const halfWidth = moveBead / 2;
    // Corner fillet is a horizontal (in-plane) rounding, so size it to the bead.
    const fillet = moveBead * 0.9;
    const pointCount = move.segCount + 1;
    const closed =
      pointCount >= 3 &&
      Math.abs(move.pts[0] - move.pts[(pointCount - 1) * 3]) < 1e-4 &&
      Math.abs(move.pts[1] - move.pts[(pointCount - 1) * 3 + 1]) < 1e-4 &&
      Math.abs(move.pts[2] - move.pts[(pointCount - 1) * 3 + 2]) < 1e-4;

    // Distinct vertices; closed loops drop the duplicated final point.
    const distinctCount = closed ? pointCount - 1 : pointCount;
    const raw = [];
    for (let i = 0; i < distinctCount; i++) {
      raw.push(
        new THREE.Vector3(
          move.pts[i * 3],
          move.pts[i * 3 + 1],
          move.pts[i * 3 + 2],
        ),
      );
    }
    if (raw.length < 2) {
      start += move.segCount;
      continue;
    }

    let pathVals = null;
    let path;
    if (move.pointScores) {
      // Carry each point's heat score through the corner rounding so every tube
      // ring can be tinted, fading smoothly across the original chunk seams.
      // `displayScores` (when present) is the layer-rescaled view of the same
      // points — see bakeThermalColors.
      const rawVals = (move.displayScores || move.pointScores).slice(
        0,
        distinctCount,
      );
      const outVals = [];
      path = buildRoundedPath(raw, closed, fillet, rawVals, outVals);
      pathVals = outVals;
    } else {
      path = buildRoundedPath(raw, closed, fillet);
    }
    if (path.length < 2) {
      start += move.segCount;
      continue;
    }
    const tube = buildSweptTube(path, closed, halfWidth, halfHeight, TUBE_SIDES);

    // Append this stroke's vertices (position + normal + per-vertex colour) and
    // its index block, rebased onto the running vertex offset.
    const col = move.color;
    const vcount = tube.positions.length / 3;
    for (let i = 0; i < tube.positions.length; i++) {
      mergedPos.push(tube.positions[i]);
      mergedNorm.push(tube.norms[i]);
    }
    if (pathVals) {
      // Heat mode: tint per ring. Walls are emitted ring-by-ring, then (for
      // open strokes) the start cap and end cap — match that vertex order.
      const heat = new THREE.Color();
      const ringN = tube.ringCount;
      const sidesN = tube.sides;
      for (let i = 0; i < ringN; i++) {
        const c = heatColor(pathVals[i] ?? 0, heat);
        for (let k = 0; k < sidesN; k++) mergedCol.push(c.r, c.g, c.b);
      }
      if (!closed) {
        const c0 = heatColor(pathVals[0] ?? 0, heat);
        for (let j = 0; j <= sidesN; j++) mergedCol.push(c0.r, c0.g, c0.b);
        const cN = heatColor(pathVals[ringN - 1] ?? 0, heat);
        for (let j = 0; j <= sidesN; j++) mergedCol.push(cN.r, cN.g, cN.b);
      }
    } else {
      for (let i = 0; i < vcount; i++) {
        mergedCol.push(col.r, col.g, col.b);
      }
    }
    for (let i = 0; i < tube.ordered.length; i++) {
      mergedIdx.push(tube.ordered[i] + vertOffset);
    }
    vertOffset += vcount;

    toolpathTubeParts.push({
      ringVerts: tube.ringVerts,
      ringCenters: tube.ringCenters,
      ringCount: tube.ringCount,
      sides: tube.sides,
      indicesPerRing: tube.indicesPerRing,
      wallIndexCount: tube.wallIndexCount,
      wallSegments: tube.wallSegments,
      startCapIndexCount: tube.startCapIndexCount,
      endCapIndexCount: tube.endCapIndexCount,
      closed,
      color: col,
      start,
      count: move.segCount,
      orient: move.orient || null,
      pointCount: move.segCount + 1,
    });
    start += move.segCount;
  }

  if (!mergedIdx.length) return;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(mergedPos, 3),
  );
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(mergedNorm, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(mergedCol, 3));
  geometry.setIndex(mergedIdx);

  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  toolpathGroup.add(mesh);
  toolpathTubeMesh = mesh;

  // Two reusable cap fans shared by every stroke: one rides the printing tip,
  // the other closes a partially-revealed closed loop's start ring. Their plain
  // colour is set to the active stroke's colour each frame (see setProgress).
  toolpathLeadCap = makeCapMesh();
  toolpathStartCap = makeCapMesh();
  toolpathGroup.add(toolpathLeadCap, toolpathStartCap);
}

/** Build a reusable octagon-fan cap mesh with its own plain-colour material. */
function makeCapMesh() {
  const capGeometry = new THREE.BufferGeometry();
  capGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array((TUBE_SIDES + 1) * 3), 3),
  );
  const capIndices = [];
  for (let k = 0; k < TUBE_SIDES; k++) {
    capIndices.push(TUBE_SIDES, k, (k + 1) % TUBE_SIDES);
  }
  capGeometry.setIndex(capIndices);
  const material = new THREE.MeshLambertMaterial({
    side: THREE.DoubleSide,
  });
  const capMesh = new THREE.Mesh(capGeometry, material);
  capMesh.frustumCulled = false;
  capMesh.visible = false;
  return capMesh;
}

/** Place a reusable cap fan over a part's ring `ringIndex`. */
function fillCap(part, capMesh, ringIndex) {
  const pos = capMesh.geometry.attributes.position.array;
  const sides = part.sides;
  for (let k = 0; k < sides; k++) {
    const ri = (ringIndex * sides + k) * 3;
    pos[k * 3] = part.ringVerts[ri];
    pos[k * 3 + 1] = part.ringVerts[ri + 1];
    pos[k * 3 + 2] = part.ringVerts[ri + 2];
  }
  pos[sides * 3] = part.ringCenters[ringIndex * 3];
  pos[sides * 3 + 1] = part.ringCenters[ringIndex * 3 + 1];
  pos[sides * 3 + 2] = part.ringCenters[ringIndex * 3 + 2];
  capMesh.geometry.attributes.position.needsUpdate = true;
  capMesh.geometry.computeVertexNormals();
}

/**
 * Sample the tool-axis orientation of a stroke at a normalised progress
 * fraction. `orient` is a flat [x,y,z,…] array parallel to the stroke's source
 * points (one unit vector per point); `null`/missing means the head is vertical.
 * Writes the unit axis into `out` and returns it. Defaults to +Z so an absent
 * or degenerate orientation keeps the nozzle pointing straight down.
 */
function sampleToolAxis(orient, pointCount, frac, out) {
  out.set(0, 0, 1);
  if (!orient || pointCount < 1) return out;
  let idx = Math.round(frac * (pointCount - 1));
  if (idx < 0) idx = 0;
  if (idx > pointCount - 1) idx = pointCount - 1;
  out.set(orient[idx * 3], orient[idx * 3 + 1], orient[idx * 3 + 2]);
  if (out.lengthSq() < 1e-9) out.set(0, 0, 1);
  return out.normalize();
}

function setProgress(count) {
  simValue = Math.max(0, Math.min(count, totalSegments));
  const whole = Math.round(simValue);
  // Track the active deposition point (the last point we are rendering) so the
  // nozzle can hover above it; stays unset at rest / full reveal.
  let hasTip = false;
  let tipX = 0;
  let tipY = 0;
  let tipZ = 0;
  // Tool-axis (head tilt) at the active / fallback point. Defaults to +Z so the
  // nozzle hangs straight down unless a perimeter carries a tilt orientation.
  let tipAx = 0;
  let tipAy = 0;
  let tipAz = 1;
  // Fallback tip: the end of the most recently completed stroke. Used when the
  // cursor sits exactly between strokes (a travel move) so the nozzle stays put
  // instead of flickering out — it only vanishes at rest / full reveal.
  let hasFallback = false;
  let fbX = 0;
  let fbY = 0;
  let fbZ = 0;
  let fbAx = 0;
  let fbAy = 0;
  let fbAz = 1;
  if (toolpathTubeMesh && toolpathTubeParts.length) {
    // Tube mode: every stroke lives in one merged index buffer, concatenated in
    // print order. Reveal is a single growing draw range: parts that finished
    // before the cursor contribute their whole block, exactly one part straddles
    // the cursor (its start cap + the revealed ring segments), and parts after
    // it contribute nothing. The straddling part's printing tip — and, for a
    // closed loop, its start ring — is closed by the two shared cap fans.
    let drawCount = 0;
    let capping = false;
    for (const part of toolpathTubeParts) {
      const shown = Math.max(0, Math.min(whole - part.start, part.count));
      const frac = part.count > 0 ? shown / part.count : 0;
      if (frac <= 0) continue; // not started yet (and neither is anything after)
      const wallSegs = part.wallSegments;
      const revealed = Math.round(frac * wallSegs);
      const atFull = revealed >= wallSegs;
      if (atFull) {
        // Whole stroke shown: start cap + all walls + baked far end cap.
        drawCount +=
          part.startCapIndexCount + part.wallIndexCount + part.endCapIndexCount;
        // Remember this stroke's end as the fallback nozzle point (the last
        // deposited ring), so a cursor parked between strokes keeps the nozzle.
        const endRing = part.ringCount - 1;
        hasFallback = true;
        fbX = part.ringCenters[endRing * 3];
        fbY = part.ringCenters[endRing * 3 + 1];
        fbZ = part.ringCenters[endRing * 3 + 2];
        // Head orientation at the stroke's end (sampled at full progress).
        sampleToolAxis(part.orient, part.pointCount, 1, _toolAxis);
        fbAx = _toolAxis.x;
        fbAy = _toolAxis.y;
        fbAz = _toolAxis.z;
      } else {
        // The one straddling stroke: start cap + the revealed ring segments.
        drawCount += part.startCapIndexCount + revealed * part.indicesPerRing;
        capping = true;
        toolpathLeadCap.material.color.copy(part.color);
        toolpathLeadCap.visible = true;
        const tipRing = revealed % part.ringCount;
        fillCap(part, toolpathLeadCap, tipRing);
        // The leading ring centre is the live deposition point for the nozzle.
        hasTip = true;
        tipX = part.ringCenters[tipRing * 3];
        tipY = part.ringCenters[tipRing * 3 + 1];
        tipZ = part.ringCenters[tipRing * 3 + 2];
        // Head orientation at the live tip (sampled by print fraction).
        sampleToolAxis(part.orient, part.pointCount, frac, _toolAxis);
        tipAx = _toolAxis.x;
        tipAy = _toolAxis.y;
        tipAz = _toolAxis.z;
        if (part.closed) {
          toolpathStartCap.material.color.copy(part.color);
          toolpathStartCap.visible = true;
          fillCap(part, toolpathStartCap, 0);
        } else {
          toolpathStartCap.visible = false;
        }
      }
    }
    if (!capping) {
      toolpathLeadCap.visible = false;
      toolpathStartCap.visible = false;
    }
    toolpathTubeMesh.geometry.setDrawRange(0, drawCount);
  } else if (toolpathObject) {
    // Plain LineSegments: 2 vertices per segment.
    toolpathObject.geometry.setDrawRange(0, whole * 2);
    // Active point = end of the last revealed segment (mid-reveal only).
    if (whole > 0 && whole < totalSegments) {
      const seg = activeSegments()[whole - 1];
      const tip = seg.b;
      hasTip = true;
      tipX = tip[0];
      tipY = tip[1];
      tipZ = tip[2];
      if (seg.orient) {
        tipAx = seg.orient[0];
        tipAy = seg.orient[1];
        tipAz = seg.orient[2];
      } else {
        tipAx = 0;
        tipAy = 0;
        tipAz = 1;
      }
    }
  }
  // Hover the nozzle 30 mm above the active deposition point. While printing
  // (between the first segment and full reveal) keep it persistent: prefer the
  // live straddling tip, otherwise fall back to the last completed stroke's end
  // so it never flickers out over travel moves. Hide only at rest / 100%.
  if (!hasTip && hasFallback && whole > 0 && whole < totalSegments) {
    hasTip = true;
    tipX = fbX;
    tipY = fbY;
    tipZ = fbZ;
    tipAx = fbAx;
    tipAy = fbAy;
    tipAz = fbAz;
  }
  nozzleActive = hasTip;
  if (nozzleReady) {
    if (hasTip) {
      // Tilt the head to the active tool axis (default +Z) and hover it
      // NOZZLE_OFFSET_Z up that axis so the tip sits just above the point.
      _toolAxis.set(tipAx, tipAy, tipAz);
      if (_toolAxis.lengthSq() < 1e-9) _toolAxis.set(0, 0, 1);
      _toolAxis.normalize();
      nozzleGroup.quaternion.setFromUnitVectors(NOZZLE_UP_AXIS, _toolAxis);
      nozzleGroup.position.set(
        tipX + _toolAxis.x * NOZZLE_OFFSET_Z,
        tipY + _toolAxis.y * NOZZLE_OFFSET_Z,
        tipZ + _toolAxis.z * NOZZLE_OFFSET_Z,
      );
    }
    nozzleGroup.visible = hasTip && toolpathGroup.visible;
  }
  document.getElementById("progress").value = String(whole);
  const progM = document.getElementById("progressM"); // mobile playback bar mirror
  if (progM) {
    progM.max = String(totalSegments);
    progM.value = String(whole);
  }
  // Reveal the travel overlay up to the same cursor as the deposition strokes.
  applyTravelReveal();
  // Keep the thermal chart's playback marker in step with the reveal cursor.
  if (renderColorMode === "thermal") drawThermalChart();
  requestRender();
}

function setPlaying(value) {
  playing = value && totalSegments > 0;
  const icon = playing ? "❚❚" : "▶";
  document.getElementById("playButton").textContent = icon;
  const playM = document.getElementById("playButtonM"); // mobile playback bar
  if (playM) playM.textContent = icon;
}

function togglePlay() {
  if (playing) {
    setPlaying(false);
    return;
  }
  // Playing only makes sense on the toolpath — leave the raw STL view.
  if (document.querySelector('input[name="view"]:checked')?.value === "stl") {
    selectView("toolpath");
  }
  // Restart from the beginning if we're already at the end.
  if (simValue >= totalSegments) setProgress(0);
  setPlaying(true);
}

// --- Preview mode (render style + layer isolation) ---------------------------
// The toolpath-preview selector merges the render style with single-layer
// isolation into one 3-way choice: "line"/"tube" draw the whole toolpath, while
// "layer" isolates the selected layer (always drawn as tubes) and reveals the
// layer slider. `toolpathStyle` + `isolateLayer` stay the underlying state the
// geometry and colour builders read.

/** Sync the preview radios + layer slider visibility to the current mode. */
function applyPreviewModeUi() {
  const mode = isolateLayer ? "layer" : toolpathStyle;
  for (const radio of document.querySelectorAll('input[name="tpStyle"]')) {
    radio.checked = radio.value === mode;
  }
  // Isolating a layer only means something with at least two layers to choose.
  const layerRadio = document.getElementById("tpStyleLayer");
  if (layerRadio) layerRadio.disabled = layerCount <= 1;
  document.getElementById("layerLine").hidden = !isolateLayer;
  // The active layer / total now lives in the legend's layer-count row.
  updateLegendStats();
  syncViewRail();
}

/** Switch the preview between whole-toolpath lines/tubes and single-layer mode. */
function setPreviewMode(mode) {
  const layer = mode === "layer";
  const nextIsolate = layer && layerCount > 1;
  const isolationChanged = nextIsolate !== isolateLayer;
  isolateLayer = nextIsolate;
  toolpathStyle = layer ? "tube" : mode;
  applyPreviewModeUi();
  if (isolationChanged) {
    // The visible segment set changed (whole part <-> one layer): re-reveal.
    refreshVisibleData({ reveal: true });
  } else if (activeSegments().length) {
    // Same segments, only the render style flipped — keep the playback cursor.
    rebuildToolpathGeometry();
  }
  updateMeshGhost(); // show/hide the faint STL guide with layer isolation
}

/** Set the number of layers in the current toolpath and reset the layer UI. */
function setLayerCount(count) {
  layerCount = Math.max(0, count);
  activeLayer = 0;
  isolateLayer = false;
  const slider = document.getElementById("layerSlider");
  slider.max = String(Math.max(0, layerCount - 1));
  slider.value = "0";
  slider.disabled = layerCount <= 1;
  const rail = document.getElementById("layerSliderRail");
  if (rail) {
    rail.max = String(Math.max(0, layerCount - 1));
    rail.value = "0";
  }
  applyPreviewModeUi(); // refreshes the legend's layer-count row too
}

/** The layer of the last segment currently revealed by playback (top layer when
 *  the whole part is shown, or wherever playback was paused). */
function lastRevealedLayer() {
  const segs = activeSegments();
  if (!segs.length) return 0;
  const idx = Math.max(0, Math.min(segs.length - 1, Math.ceil(simValue) - 1));
  return segs[idx].layer ?? 0;
}

/** Change which layer is selected (and, if isolating, rebuild the geometry). */
function setActiveLayer(index) {
  activeLayer = Math.max(0, Math.min(layerCount - 1, index));
  // Keep both layer sliders (Preview tab + view rail) in sync.
  document.getElementById("layerSlider").value = String(activeLayer);
  const rail = document.getElementById("layerSliderRail");
  if (rail) rail.value = String(activeLayer);
  updateLegendStats(); // reflect "Layer n of m" in the legend
  if (isolateLayer) refreshVisibleData({ reveal: true });
}

// --- View switching --------------------------------------------------------

function setView(view) {
  const showToolpath = view === "toolpath";
  const showThermal = view === "thermal";
  const wantMode = showThermal ? "thermal" : "kind";
  // The toolpath geometry is shared by both preview and thermal views; recolour
  // it (and rebuild) when the mode changes and there is something to show.
  if (wantMode !== renderColorMode && (toolpathMoves.length || thermalMoves.length)) {
    setColorMode(wantMode);
  } else {
    renderColorMode = wantMode;
  }
  // Same geometry holder drives both the toolpath and thermal views.
  toolpathGroup.visible = showToolpath || showThermal;
  updateMeshGhost(view); // mesh: solid in STL, faint guide while isolating a layer
  supportGroup.visible = !showToolpath && !showThermal;
  nozzleGroup.visible =
    (showToolpath || showThermal) && nozzleActive && nozzleReady;
  updateLegendVisibility();
  updateTravelVisibility();
  updateThermalUi(showThermal);
  // The thermal graph owns the bottom in the thermal view, so close any open sheet.
  if (showThermal) setActiveSection(null);
  syncViewRail();
  requestRender();
}

/** The STL mesh: solid in the STL view; a faint 95%-transparent guide while
 *  isolating a layer in toolpath/thermal (to locate the layer in the part);
 *  hidden in the full toolpath/thermal view. */
function updateMeshGhost(view) {
  view = view || document.querySelector('input[name="view"]:checked')?.value;
  const toolpathish = view === "toolpath" || view === "thermal";
  const ghost = toolpathish && isolateLayer;
  meshGroup.visible = !toolpathish || ghost;
  const surface = meshGroup.children[0];
  if (surface && surface.material) {
    const m = surface.material;
    m.transparent = ghost;
    m.opacity = ghost ? 0.15 : 1; // faint guide (85% transparent); layer shows through (depthWrite off)
    m.depthWrite = !ghost;
    m.needsUpdate = true;
  }
}

/** Show/hide the thermal evolution chart (thermal view only). The heat scale +
 *  stats live in the shared legend panel (see updateLegendVisibility). */
function updateThermalUi(show) {
  const chart = document.getElementById("thermalChart");
  if (!chart) return;
  // Mobile: the graph never opens by default — the view-rail graph icon controls it.
  // Keep it closed (incl. when leaving the thermal view); desktop auto-opens as before.
  if (window.matchMedia("(max-width: 640px)").matches) {
    chart.hidden = true;
    return;
  }
  const visible = show && thermalMoves.length > 0;
  chart.hidden = !visible;
  if (visible) drawThermalChart();
}

/**
 * Map a segment-index fraction (the playback cursor) onto the chart's time
 * axis via the backend's `indexToTime` lookup, so the marker lines up with the
 * time-bucketed curve. Falls back to identity when no map is present.
 */
function indexFracToTimeFrac(idxFrac) {
  const map = thermalSeries && thermalSeries.indexToTime;
  if (!map || map.length < 2) return idxFrac;
  const pos = Math.max(0, Math.min(1, idxFrac)) * (map.length - 1);
  const i = Math.floor(pos);
  if (i >= map.length - 1) return map[map.length - 1];
  const t = pos - i;
  return map[i] * (1 - t) + map[i + 1] * t;
}

/**
 * Draw the peak-heat-over-progress envelope as a plain plot line (no area
 * fill), plus a marker at the current playback position.
 */
function drawThermalChart() {
  const canvas = document.getElementById("thermalChartCanvas");
  if (!canvas || !thermalSeries) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const xs = thermalSeries.x || [];
  const ys = thermalSeries.peak || [];
  const n = Math.min(xs.length, ys.length);
  const padL = 6;
  const padR = 6;
  const padT = 8;
  const padB = 8;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const xPix = (x) => padL + x * plotW;
  const yPix = (v) => padT + (1 - v) * plotH;

  // Playback marker on the TIME axis (the chart is bucketed by deposition time,
  // the cursor counts segments). The reveal cursor's fraction within whatever is
  // shown is mapped back onto the global time axis. When a single layer is
  // isolated the chart still shows the WHOLE print: shade that layer's time band
  // and treat the cursor as the nozzle's position inside the layer, so the
  // marker tracks the nozzle along the full timeline.
  const range = isolateLayer ? thermalLayerRanges[activeLayer] : null;
  const total = thermalSegments.length || 1;
  const localFrac = totalSegments > 0 ? Math.min(1, simValue / totalSegments) : 0;
  let markerFrac;
  if (range) {
    const bandStart = xPix(indexFracToTimeFrac(range.start / total));
    const bandEnd = xPix(indexFracToTimeFrac((range.start + range.count) / total));
    ctx.fillStyle = "rgba(118,179,255,0.16)";
    ctx.fillRect(bandStart, padT, Math.max(1, bandEnd - bandStart), plotH);
    markerFrac = indexFracToTimeFrac(
      (range.start + localFrac * range.count) / total,
    );
  } else {
    markerFrac = indexFracToTimeFrac(localFrac);
  }

  // Baseline.
  ctx.strokeStyle = "rgba(118,179,255,0.18)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, yPix(0));
  ctx.lineTo(W - padR, yPix(0));
  ctx.stroke();

  if (n > 1) {
    // Heat gradient (cold blue low → hot red high), matching the 3D heat-map.
    const line = ctx.createLinearGradient(0, padT, 0, padT + plotH);
    line.addColorStop(0, "hsl(0, 90%, 55%)");
    line.addColorStop(0.5, "hsl(119, 85%, 50%)");
    line.addColorStop(1, "hsl(238, 90%, 60%)");
    // Soft area fill under the curve.
    ctx.beginPath();
    ctx.moveTo(xPix(xs[0]), yPix(0));
    for (let i = 0; i < n; i += 1) ctx.lineTo(xPix(xs[i]), yPix(ys[i]));
    ctx.lineTo(xPix(xs[n - 1]), yPix(0));
    ctx.closePath();
    const fill = ctx.createLinearGradient(0, padT, 0, padT + plotH);
    fill.addColorStop(0, "rgba(255,90,90,0.28)");
    fill.addColorStop(1, "rgba(118,179,255,0.04)");
    ctx.fillStyle = fill;
    ctx.fill();
    // The peak-heat curve.
    ctx.beginPath();
    ctx.moveTo(xPix(xs[0]), yPix(ys[0]));
    for (let i = 1; i < n; i += 1) ctx.lineTo(xPix(xs[i]), yPix(ys[i]));
    ctx.strokeStyle = line;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.stroke();
  }

  const mx = xPix(markerFrac);
  ctx.strokeStyle = "rgba(207,232,255,0.9)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(mx, padT);
  ctx.lineTo(mx, padT + plotH);
  ctx.stroke();
}

function selectView(view) {
  for (const radio of document.querySelectorAll('input[name="view"]')) {
    radio.checked = radio.value === view;
  }
  setView(view);
}

// --- API calls -------------------------------------------------------------

async function loadMesh() {
  const response = await fetch("api/mesh");
  if (!response.ok) {
    setStatus("No mesh loaded.");
    return;
  }
  const payload = await response.json();
  buildMesh(payload);
  frameBounds(payload.bounds);
  selectView("stl");
}

async function uploadFile(file) {
  setStatus(`Loading ${file.name}…`);
  const form = new FormData();
  form.append("file", file);
  const response = await fetch("api/load", { method: "POST", body: form });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    setStatus(detail.detail || "Load failed.");
    return;
  }
  const payload = await response.json();
  buildMesh(payload);
  entryFramePending = true; // a freshly loaded model frames a bit further out
  frameBounds(payload.bounds);
  disposeGroup(toolpathGroup);
  disposeGroup(travelGroup);
  toolpathObject = null;
  toolpathSegments = [];
  toolpathMoves = [];
  allSegments = [];
  allMoves = [];
  hasShortTravel = false;
  hasLongTravel = false;
  toolpathStats = null;
  totalSegments = 0;
  setPlaying(false);
  setLayerCount(0);
  setSelectMode(false);
  setTranslateMode(false);
  document.getElementById("simRow").hidden = true;
  document.getElementById("viewToolpath").disabled = true;
  document.getElementById("exportGcodeButton").disabled = true;
  document.getElementById("simulateButton").disabled = true;
  invalidateThermal();
  selectView("stl");
  // Centre the freshly-loaded model on the active profile's centring point.
  if (workingProfile) {
    await applyTransform("center_on_base", profileCenter(), { reframe: true });
  }
  setStatus("");
  setSliceDirty(true); // a new STL → slice available
  // A freshly loaded model has no toolpath/thermal yet; push the placed mesh up
  // so the embedding viewer can show the STL immediately.
  lastSlicePayload = null;
  lastSimPayload = null;
  postSliceDataToParent();
}

/** The slice/export request body: just the active profile name. */
function sliceParamsBody() {
  // Send the full working profile so slicing uses exactly what's loaded/edited
  // (no store round-trip, no save race). `profile` (name) stays for back-compat.
  // machine_key tells the engine which machine's macros + capabilities to merge in.
  return {
    profile: activeProfileName,
    profile_data: workingProfile || undefined,
    machine_key: (workingProfile && workingProfile.machine_key) || undefined,
  };
}

async function slice() {
  const sliceButton = document.getElementById("sliceButton");
  sliceButton.disabled = true;
  sliceButton.textContent = "Slicing…";
  setStatus("Slicing…");
  // Poll the backend for phase/percent while the (concurrent) slice runs.
  let polling = true;
  const pollLoop = (async () => {
    while (polling) {
      try {
        const res = await fetch("api/slice/progress");
        if (res.ok) {
          const p = await res.json();
          if (polling && p.running) {
            const pct = Math.round(p.percent);
            setStatus(p.phase ? `${p.phase} ${pct}%` : `Slicing… ${pct}%`);
          }
        }
      } catch {
        /* ignore transient polling errors */
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  })();
  try {
    const body = sliceParamsBody();
    const response = await fetch("api/slice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      setStatus(detail.detail || "Slicing failed.");
      return false;
    }
    const payload = await response.json();
    lastSlicePayload = payload;
    buildToolpath(payload);
    buildSupportMesh(payload.supportMesh);
    document.getElementById("viewToolpath").disabled = false;
    document.getElementById("exportGcodeButton").disabled = false;
    if (currentPartId)
      document.getElementById("saveToPartButton").disabled = false;
    // A fresh toolpath enables a new thermal run and invalidates the old one.
    document.getElementById("simulateButton").disabled = false;
    invalidateThermal();
    lastSimPayload = null;
    selectView("toolpath");
    setStatus("");
    setSliceDirty(false); // sliced — no re-slice needed until the setup changes
    postSliceDataToParent();
    return true;
  } finally {
    polling = false;
    await pollLoop;
    sliceButton.disabled = false;
    sliceButton.textContent = "Slice + Simulate";
  }
}

/** Combined action: slice (→ show toolpath), then simulate (→ show thermal). */
async function sliceAndSimulate() {
  const ok = await slice();
  if (!ok) return;
  const btn = document.getElementById("sliceButton");
  btn.disabled = true;
  btn.textContent = "Simulating…";
  try {
    await simulate();
  } finally {
    btn.disabled = false;
    btn.textContent = "Slice + Simulate";
  }
}

/**
 * Run the qualitative thermal simulation on the server for the last slice and
 * colour the toolpath geometry by relative heat (with the evolution chart).
 */
async function simulate() {
  const button = document.getElementById("simulateButton");
  button.disabled = true;
  button.textContent = "Simulating…";
  setStatus("Running thermal simulation…");
  // Poll the backend for phase/percent while the (concurrent) simulation runs.
  let polling = true;
  const pollLoop = (async () => {
    while (polling) {
      try {
        const res = await fetch("api/simulate/progress");
        if (res.ok) {
          const p = await res.json();
          if (polling && p.running) {
            const pct = Math.round(p.percent);
            setStatus(p.phase ? `${p.phase} ${pct}%` : `Simulating… ${pct}%`);
          }
        }
      } catch {
        /* ignore transient polling errors */
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  })();
  try {
    const response = await fetch("api/simulate", { method: "POST" });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      setStatus(detail.detail || "Thermal simulation failed.");
      return;
    }
    const payload = await response.json();
    buildThermal(payload);
    lastSimPayload = payload;
    refreshVisibleData();
    document.getElementById("viewThermal").disabled = false;
    selectView("thermal");
    setStatus("");
    postSliceDataToParent();
  } finally {
    polling = false;
    await pollLoop;
    button.disabled = false;
    button.textContent = "Simulate";
  }
}

/** Build the G-code on the server and download it as a .gcode file. */
async function exportGcode() {
  const button = document.getElementById("exportGcodeButton");
  button.disabled = true;
  button.textContent = "Exporting…";
  setStatus("Generating G-code…");
  try {
    const response = await fetch("api/gcode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sliceParamsBody()),
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      setStatus(detail.detail || "G-code export failed.");
      return;
    }
    const blob = await response.blob();
    // Derive the download name from the Content-Disposition header when present.
    const disposition = response.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match ? match[1] : "model.gcode";
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setStatus(`Saved ${filename}.`);
  } finally {
    button.disabled = false;
    button.textContent = "Export G-code";
  }
}

// --- Wiring ----------------------------------------------------------------

// --- Machine profiles ------------------------------------------------------
// The whole build configuration lives in a server-side machine profile. The
// panel only picks the active profile; everything else is edited in the
// Profile Manager modal and auto-saved back to the server.

const FEATURE_TYPES = [
  "outer_perimeter",
  "inner_perimeter",
  "infill",
  "support_outer_perimeter",
  "support_inner_perimeter",
  "support",
];
const FEATURE_LABELS = {
  outer_perimeter: "Outermost perimeter",
  inner_perimeter: "Inner perimeters",
  infill: "Infill",
  support_outer_perimeter: "Support outermost perimeter",
  support_inner_perimeter: "Support inner perimeters",
  support: "Support infill",
};
const DENSITY_FEATURES = ["infill", "support"];

let activeProfileName = null; // name used for slice/export requests
let workingProfile = null; // editable dict mirroring MachineProfile.to_dict()
let loadedName = null; // name the working profile was loaded/saved under
let profileNames = [];
let factoryNames = new Set(); // names of read-only master profiles
let machineEntries = []; // /api/machines list entries [{name, factory, ...}]
let machineNames = [];
let machineFactoryNames = new Set(); // names of read-only factory machine presets
let saveTimer = null;
const featureRowEls = {}; // key -> { feeder, feed, bead, laser, density, row }

// Every non-feature-row input in the Profile Manager (wired for edits and
// toggled together when a read-only master profile is shown).
const MANAGER_INPUT_IDS = [
  // pmProfileName is handled separately: a master profile's name is read-only,
  // but the combo must stay interactive so you can still switch profiles.
  "pmAxes",
  "pmMaterial",
  "pmBuildX",
  "pmBuildY",
  "pmBuildZ",
  "pmOriginCorner",
  "pmLayerHeight",
  "pmMaterialDiameter",
  "pmMaterialDensity",
  "pmThermalConductivity",
  "pmSpecificHeat",
  "pmPerimeterCount",
  "pmPerimeterOrder",
  "pmRegionOrder",
  "pmTravelSpeed",
  "pmMaxSegment",
  "pmMinInfillSegment",
  "pmMaxTravelNoRetract",
  "pmInfillAngle",
  "pmInfillPattern",
  "pmInfillOrder",
  "pmSeamAlignment",
  "pmOrient",
  "pmSupportAngle",
  "pmSupportMinArea",
  "pmSupportPerimeterCount",
  "pmShieldGasFlow",
  "pmDepLaserOnTime",
  "pmDepStartExtrusion",
  "pmDepEndRetraction",
  "pmDepRetractionPower",
  "pmZStart",
  "pmStartPrint",
  "pmEndPrint",
  "pmStartDeposition",
  "pmStopDeposition",
  "pmPreShortTravel",
  "pmShortTravelEnd",
];

const el = (id) => document.getElementById(id);
// Accept both "." and "," as the decimal separator for fractional inputs, then
// parse the dot form. (Native number inputs already hand back a dot-decimal
// `.value`; this also covers a stray comma so the two are consistent.)
const numVal = (input) => Number(String(input.value).replace(",", "."));

/** The active profile's default centring point (geometric centre when unset). */
function profileCenter() {
  const p = workingProfile;
  if (!p) return { cx: 0, cy: 0 };
  return {
    cx: p.center_x_mm ?? p.build_volume_x_mm / 2,
    cy: p.center_y_mm ?? p.build_volume_y_mm / 2,
  };
}

/** A representative deposition movement speed (mm/s) for the active profile —
 *  the perimeter/infill feed rate, falling back to travel speed. Used by the
 *  embedding viewer to play the print simulation at true 1x speed. */
function representativeMoveSpeedMmPerSec() {
  const p = workingProfile;
  if (!p) return null;
  const feats = p.features || {};
  const preferred = ["outer_perimeter", "inner_perimeter", "infill"];
  for (const key of preferred) {
    const v = feats[key] && feats[key].feed_rate_mm_s;
    if (Number.isFinite(v) && v > 0) return v;
  }
  for (const key of Object.keys(feats)) {
    const v = feats[key] && feats[key].feed_rate_mm_s;
    if (Number.isFinite(v) && v > 0) return v;
  }
  return Number.isFinite(p.travel_speed_mm_s) && p.travel_speed_mm_s > 0
    ? p.travel_speed_mm_s
    : null;
}

/** Display label for a profile name: master profiles get a ★ marker. */
function profileLabel(name) {
  return factoryNames.has(name) ? `★ ${name}` : name;
}

/** Fill a <select> with options for the given profile names. */
function fillProfileSelect(select, names, current) {
  select.innerHTML = "";
  for (const name of names) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = profileLabel(name);
    if (name === current) opt.selected = true;
    select.appendChild(opt);
  }
}

// Sentinel value used by the in-modal name dropdown to create a new profile.
const NEW_PROFILE_OPTION = "__new_profile__";

/** Fill the modal name-field dropdown: every profile plus a "New profile…". */
function fillProfileSwitch(names, current) {
  const select = el("pmProfileSwitch");
  select.innerHTML = "";
  for (const name of names) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = profileLabel(name);
    if (name === current) opt.selected = true;
    select.appendChild(opt);
  }
  const sep = document.createElement("option");
  sep.value = NEW_PROFILE_OPTION;
  sep.textContent = "+ New profile…";
  select.appendChild(sep);
}

/** Reflect an on/off state on an aria-pressed toggle button. */
function setToggleButton(btn, on) {
  btn.setAttribute("aria-pressed", on ? "true" : "false");
  btn.textContent = on ? "On" : "Off";
}

/** Read the on/off state from an aria-pressed toggle button. */
function toggleButtonValue(btn) {
  return btn.getAttribute("aria-pressed") === "true";
}

/** A factory-first, then alphabetical, name sort using the given factory set. */
function sortNames(names, factorySet) {
  return names.slice().sort((a, b) => {
    const fa = factorySet.has(a);
    const fb = factorySet.has(b);
    if (fa !== fb) return fa ? -1 : 1;
    return a.localeCompare(b, undefined, { sensitivity: "base" });
  });
}

/** Refresh the profile name list + dropdowns (all profiles; the machine is in-profile). */
async function refreshProfileNames(current) {
  const res = await fetch("/api/profiles");
  if (!res.ok) return;
  const data = await res.json();
  const entries = data.profiles || [];
  factoryNames = new Set(entries.filter((e) => e.factory).map((e) => e.name));
  profileNames = sortNames(entries.map((e) => e.name), factoryNames);
  fillProfileSelect(el("profileSelect"), profileNames, current);
  fillProfileSwitch(profileNames, current);
}

// The fields a machine preset contributes to a profile (capabilities + macros).
const MACHINE_FIELDS = [
  "axes", "build_volume_x_mm", "build_volume_y_mm", "build_volume_z_mm",
  "origin_corner", "start_print_macro", "end_print_macro", "start_deposition_macro",
  "stop_deposition_macro", "pre_short_travel_macro", "short_travel_end_macro",
];
const NEW_MACHINE_OPTION = "__new_machine__";

/** Refresh the machine-preset list + the in-manager machine combo. */
async function refreshMachineNames(current) {
  try {
    const res = await fetch("/api/machines");
    if (res.ok) machineEntries = (await res.json()).machines || [];
  } catch {
    machineEntries = [];
  }
  machineFactoryNames = new Set(
    machineEntries.filter((e) => e.factory).map((e) => e.name)
  );
  machineNames = sortNames(machineEntries.map((e) => e.name), machineFactoryNames);
  fillMachineSwitch(machineNames, current);
}

function fillMachineSwitch(names, current) {
  const select = el("pmMachineSwitch");
  if (!select) return;
  select.innerHTML = "";
  for (const name of names) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = machineFactoryNames.has(name) ? `★ ${name}` : name;
    if (name === current) opt.selected = true;
    select.appendChild(opt);
  }
  const sep = document.createElement("option");
  sep.value = NEW_MACHINE_OPTION;
  sep.textContent = "+ New machine…";
  select.appendChild(sep);
}

/** Apply a machine preset to the working profile: copy its capabilities + macros in,
 *  set the machine label, re-render + persist. */
async function selectMachine(name) {
  if (!workingProfile) return;
  const res = await fetch(`/api/machines/${encodeURIComponent(name)}`);
  if (!res.ok) {
    setStatus("Could not load machine.");
    return;
  }
  const machine = await res.json();
  for (const f of MACHINE_FIELDS) {
    if (machine[f] !== undefined) workingProfile[f] = machine[f];
  }
  workingProfile.machine_key = machine.name;
  renderManager();
  buildPlate();
  invalidateToolpath();
  if (!workingProfile.factory) schedulePersist();
  setStatus("");
}

/** Save the profile's current machine settings as a new machine preset. */
async function newMachine() {
  if (!workingProfile) return;
  let name = "New machine";
  let n = 2;
  while (machineNames.includes(name)) name = `New machine ${n++}`;
  const body = { name };
  for (const f of MACHINE_FIELDS) body[f] = workingProfile[f];
  const res = await fetch("/api/machines", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    setStatus("Could not create machine.");
    return;
  }
  const saved = await res.json();
  workingProfile.machine_key = saved.name;
  el("pmMachineName").value = saved.name;
  if (!workingProfile.factory) schedulePersist();
  await refreshMachineNames(saved.name);
}

/** Delete the current machine preset from the library (masters are protected). */
async function deleteActiveMachine() {
  const name = workingProfile && workingProfile.machine_key;
  if (!name) return;
  if (machineFactoryNames.has(name)) {
    setStatus("Master machines can't be deleted.");
    return;
  }
  const res = await fetch(`/api/machines/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    setStatus("Could not delete machine.");
    return;
  }
  await refreshMachineNames(workingProfile.machine_key);
}

/** Rename the current (editable) machine preset and the profile's label. */
async function renameActiveMachine(newName) {
  const old = workingProfile && workingProfile.machine_key;
  newName = (newName || "").trim();
  if (!old || !newName || newName === old) return;
  if (machineFactoryNames.has(old)) {
    el("pmMachineName").value = old; // master machines are read-only
    return;
  }
  const res = await fetch(`/api/machines/${encodeURIComponent(old)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: newName }),
  });
  if (!res.ok) {
    el("pmMachineName").value = old;
    return;
  }
  const saved = await res.json();
  workingProfile.machine_key = saved.name;
  if (!workingProfile.factory) schedulePersist();
  await refreshMachineNames(saved.name);
}

// Adopt an already-loaded profile object as the active/working profile (no fetch).
// Shared by selectProfile (after a GET) and create/duplicate (which reuse the POST
// response), so a brand-new profile shows instantly without extra round-trips.
function applyLoadedProfile(p, { clear = true } = {}) {
  workingProfile = p;
  loadedName = p.name;
  activeProfileName = p.name;
  el("profileSelect").value = p.name;
  fillProfileSwitch(profileNames, p.name);
  renderManager(); // also fills the in-manager machine combo from p.machine_key
  buildPlate();
  if (clear) invalidateToolpath();
  setStatus(""); // reflect the (new) active machine · profile in the status line
}

/** Load a profile by name from the server and make it the working/active one. */
async function selectProfile(name, opts = {}) {
  const res = await fetch(`/api/profiles/${encodeURIComponent(name)}`);
  if (!res.ok) {
    setStatus("Could not load profile.");
    return;
  }
  applyLoadedProfile(await res.json(), opts);
}

/** Build the per-feature settings rows once (inputs are reused on re-render). */
function buildFeatureRows() {
  const body = el("pmFeatureRows");
  body.innerHTML = "";
  for (const key of FEATURE_TYPES) {
    const row = document.createElement("tr");
    row.dataset.feature = key;

    const label = document.createElement("td");
    label.textContent = FEATURE_LABELS[key];
    label.className = "pm-feat-name";
    row.appendChild(label);

    const feeder = document.createElement("select");
    feeder.className = "pm-feeder";
    for (const v of ["T0", "T1"]) {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = v;
      feeder.appendChild(o);
    }
    const feederTd = document.createElement("td");
    feederTd.dataset.label = "Feeder";
    feederTd.appendChild(feeder);
    row.appendChild(feederTd);

    const mkNum = (cls, step, min, dataLabel) => {
      const inp = document.createElement("input");
      inp.type = "number";
      inp.className = cls;
      inp.step = String(step);
      if (min !== undefined) inp.min = String(min);
      const td = document.createElement("td");
      td.dataset.label = dataLabel;
      td.appendChild(inp);
      row.appendChild(td);
      return inp;
    };
    const feed = mkNum("pm-feed", 0.5, 0.1, "Feed rate (mm/s)");
    const bead = mkNum("pm-bead", 0.05, 0.05, "Bead width (mm)");
    const laser = mkNum("pm-laser", 10, 0, "Laser power");

    const densityTd = document.createElement("td");
    densityTd.dataset.label = "Infill density (%)";
    let density = null;
    if (DENSITY_FEATURES.includes(key)) {
      density = document.createElement("input");
      density.type = "number";
      density.className = "pm-density";
      density.step = "5";
      density.min = "0";
      density.max = "100";
      densityTd.appendChild(density);
    } else {
      densityTd.textContent = "—";
      densityTd.className = "muted";
    }
    row.appendChild(densityTd);

    body.appendChild(row);
    featureRowEls[key] = { feeder, feed, bead, laser, density, row };

    for (const inp of [feeder, feed, bead, laser, density]) {
      if (inp) inp.addEventListener("change", onManagerChange);
    }
  }
}

/** Push the working profile's values into the manager DOM. */
function renderManager() {
  const p = workingProfile;
  if (!p) return;
  el("pmProfileName").value = p.name;
  el("pmAxes").value = p.axes;
  el("pmMaterial").value = p.material;
  el("pmBuildX").value = p.build_volume_x_mm;
  el("pmBuildY").value = p.build_volume_y_mm;
  el("pmBuildZ").value = p.build_volume_z_mm;
  el("pmOriginCorner").value = p.origin_corner;
  el("pmLayerHeight").value = p.layer_height_mm;
  el("pmMaterialDiameter").value = p.material_diameter_mm;
  el("pmMaterialDensity").value = p.material_density_g_cm3;
  el("pmThermalConductivity").value = p.material_thermal_conductivity_w_mk;
  el("pmSpecificHeat").value = p.material_specific_heat_j_kgk;
  el("pmPerimeterCount").value = p.perimeter_count;
  el("pmPerimeterOrder").value = p.perimeter_order;
  el("pmRegionOrder").value = p.infill_before_perimeters
    ? "infill_first"
    : "perimeters_first";
  el("pmTravelSpeed").value = p.travel_speed_mm_s;
  el("pmMaxSegment").value = p.max_segment_length_mm ?? "";
  el("pmMinInfillSegment").value = p.min_infill_segment_length_mm;
  el("pmInfillAngle").value = p.infill_angle_deg;
  el("pmInfillPattern").value = p.infill_pattern;
  el("pmInfillOrder").value = p.infill_order;
  el("pmSeamAlignment").value = p.seam_alignment;
  el("pmMaxTravelNoRetract").value = p.max_travel_no_retract_mm;
  el("pmOrient").value = p.orient_perimeters;
  setToggleButton(el("pmSupportEnabled"), p.support_enabled);
  el("pmSupportAngle").value = p.support_overhang_angle_deg;
  el("pmSupportMinArea").value = p.support_min_area_mm2;
  el("pmSupportPerimeterCount").value = p.support_perimeter_count;
  el("pmShieldGasFlow").value = p.shieldgas_flow_l_min;
  el("pmDepLaserOnTime").value = p.deposition_start_laser_on_time_ms;
  el("pmDepStartExtrusion").value = p.deposition_start_extrusion_mm;
  el("pmDepEndRetraction").value = p.deposition_end_retraction_mm;
  el("pmDepRetractionPower").value = p.deposition_retraction_power_w;
  el("pmZStart").value = p.start_z_at_zero ? "zero" : "layer";
  // Machine combo: the profile's machine label + the preset list (locking below).
  el("pmMachineName").value = p.machine_key || "";
  fillMachineSwitch(machineNames, p.machine_key || "");
  // Macros are the profile's machine settings (editable; filled from the machine).
  el("pmStartPrint").value = p.start_print_macro ?? "";
  el("pmEndPrint").value = p.end_print_macro ?? "";
  el("pmStartDeposition").value = p.start_deposition_macro ?? "";
  el("pmStopDeposition").value = p.stop_deposition_macro ?? "";
  el("pmPreShortTravel").value = p.pre_short_travel_macro ?? "";
  el("pmShortTravelEnd").value = p.short_travel_end_macro ?? "";
  for (const key of FEATURE_TYPES) {
    const f = p.features[key];
    const r = featureRowEls[key];
    r.feeder.value = f.feeder;
    r.feed.value = f.feed_rate_mm_s;
    r.bead.value = f.bead_width_mm;
    r.laser.value = f.laser_power;
    if (r.density) r.density.value = Math.round((f.infill_density ?? 0) * 100);
  }
  // Master (factory) profiles are read-only: disable every control and the
  // Delete button, show the notice, and skip the capability gating. Editable
  // profiles re-enable everything, then constraints grey out what doesn't apply.
  const isFactory = !!p.factory;
  setManagerEnabled(!isFactory);
  renderVarTable();
  if (!isFactory) applyManagerConstraints();
  // The profile combo stays interactive (so you can switch profiles) even for a
  // master; only the name itself is read-only.
  el("pmProfileName").disabled = false;
  el("pmProfileName").readOnly = isFactory;
  el("pmFactoryNotice").hidden = !isFactory;
  el("pmDeleteProfile").disabled = isFactory;
  // Machine combo: locked for a read-only (factory) profile, or a master machine.
  const machineLocked = isFactory || machineFactoryNames.has(p.machine_key);
  el("pmMachineName").disabled = false;
  el("pmMachineName").readOnly = machineLocked;
  el("pmMachineSwitch").disabled = isFactory;
  el("pmNewMachine").disabled = isFactory;
  el("pmDeleteMachine").disabled = machineLocked;
}

/** Enable or disable every editable control in the Profile Manager at once. */
function setManagerEnabled(enabled) {
  const disabled = !enabled;
  for (const id of MANAGER_INPUT_IDS) el(id).disabled = disabled;
  el("pmSupportEnabled").disabled = disabled;
  for (const key of FEATURE_TYPES) {
    const r = featureRowEls[key];
    for (const inp of [r.feeder, r.feed, r.bead, r.laser, r.density]) {
      if (inp) inp.disabled = disabled;
    }
  }
}

// Built-in macro variables, shown first in the reference table. Custom variables
// are defined by the program (the profile's macro_variables), never by the user.
const BUILTIN_VARS = [
  { name: "shieldgas_flow", value: "Shield gas flow" },
  { name: "laser_power", value: "Active section's laser power" },
  { name: "feature_type", value: "Feature being deposited" },
  { name: "laser_on_time", value: "Deposition start laser-on time" },
  { name: "start_extrusion", value: "Deposition start extrusion" },
  { name: "retraction", value: "Deposition end retraction" },
  { name: "retraction_power", value: "Deposition retraction power" },
];

/** Render the read-only macro-variable reference table (built-ins + program vars). */
function renderVarTable() {
  const tb = el("pmVarRows");
  tb.textContent = "";
  const rows = [
    ...BUILTIN_VARS,
    ...Object.entries((workingProfile && workingProfile.macro_variables) || {}).map(
      ([name, value]) => ({ name, value: String(value) }),
    ),
  ];
  for (const r of rows) {
    const tr = document.createElement("tr");
    const c1 = document.createElement("td");
    const code = document.createElement("code");
    code.textContent = "#" + r.name;
    c1.appendChild(code);
    const c2 = document.createElement("td");
    c2.className = "pm-var-note";
    c2.textContent = r.value;
    tr.append(c1, c2);
    tb.appendChild(tr);
  }
}

/** Read the manager DOM back into the working profile. */
function collectManager() {
  const p = workingProfile;
  p.name = el("pmProfileName").value.trim() || "Untitled";
  p.axes = el("pmAxes").value;
  p.material = el("pmMaterial").value;
  p.build_volume_x_mm = numVal(el("pmBuildX"));
  p.build_volume_y_mm = numVal(el("pmBuildY"));
  p.build_volume_z_mm = numVal(el("pmBuildZ"));
  p.origin_corner = el("pmOriginCorner").value;
  p.layer_height_mm = numVal(el("pmLayerHeight"));
  p.material_diameter_mm = numVal(el("pmMaterialDiameter"));
  p.material_density_g_cm3 = numVal(el("pmMaterialDensity"));
  p.material_thermal_conductivity_w_mk = numVal(el("pmThermalConductivity"));
  p.material_specific_heat_j_kgk = numVal(el("pmSpecificHeat"));
  p.perimeter_count = Math.max(1, Math.round(numVal(el("pmPerimeterCount"))));
  p.perimeter_order = el("pmPerimeterOrder").value;
  p.infill_before_perimeters = el("pmRegionOrder").value === "infill_first";
  p.travel_speed_mm_s = numVal(el("pmTravelSpeed"));
  const maxSeg = numVal(el("pmMaxSegment"));
  p.max_segment_length_mm = maxSeg > 0 ? maxSeg : null;
  p.min_infill_segment_length_mm = numVal(el("pmMinInfillSegment"));
  p.infill_angle_deg = numVal(el("pmInfillAngle"));
  p.infill_pattern = el("pmInfillPattern").value;
  p.infill_order = el("pmInfillOrder").value;
  p.seam_alignment = el("pmSeamAlignment").value;
  p.max_travel_no_retract_mm = numVal(el("pmMaxTravelNoRetract"));
  p.orient_perimeters = el("pmOrient").value;
  p.support_enabled = toggleButtonValue(el("pmSupportEnabled"));
  p.support_overhang_angle_deg = numVal(el("pmSupportAngle"));
  p.support_min_area_mm2 = numVal(el("pmSupportMinArea"));
  p.support_perimeter_count = Math.max(
    0,
    Math.round(numVal(el("pmSupportPerimeterCount"))),
  );
  p.shieldgas_flow_l_min = Math.max(0, numVal(el("pmShieldGasFlow")));
  p.deposition_start_laser_on_time_ms = Math.max(0, numVal(el("pmDepLaserOnTime")));
  p.deposition_start_extrusion_mm = Math.max(0, numVal(el("pmDepStartExtrusion")));
  p.deposition_end_retraction_mm = Math.max(0, numVal(el("pmDepEndRetraction")));
  p.deposition_retraction_power_w = Math.max(0, numVal(el("pmDepRetractionPower")));
  p.start_z_at_zero = el("pmZStart").value === "zero";
  // Macros are the profile's (machine) settings — editable + saved with the profile.
  p.start_print_macro = el("pmStartPrint").value;
  p.end_print_macro = el("pmEndPrint").value;
  p.start_deposition_macro = el("pmStartDeposition").value;
  p.stop_deposition_macro = el("pmStopDeposition").value;
  p.pre_short_travel_macro = el("pmPreShortTravel").value;
  p.short_travel_end_macro = el("pmShortTravelEnd").value;
  // macro_variables are program-defined, never edited here, so they are preserved.
  for (const key of FEATURE_TYPES) {
    const r = featureRowEls[key];
    const f = p.features[key];
    f.feeder = r.feeder.value;
    f.feed_rate_mm_s = numVal(r.feed);
    f.bead_width_mm = numVal(r.bead);
    f.laser_power = numVal(r.laser);
    if (r.density) f.infill_density = numVal(r.density) / 100;
  }
}

/** Grey out options that don't apply to the current capabilities. */
function applyManagerConstraints() {
  const p = workingProfile;
  const single = p.material === "single";
  const threeAxis = p.axes === "3-axis";
  const multiPerimeter = p.perimeter_count > 1;
  const support = p.support_enabled;
  const hasSupportPerimeter = p.support_perimeter_count >= 1;
  const multiSupportPerimeter = p.support_perimeter_count > 1;

  // 3-axis machines can't tilt the head.
  el("pmOrient").disabled = threeAxis;

  // Support-only controls follow the support toggle.
  el("pmSupportAngle").disabled = !support;
  el("pmSupportMinArea").disabled = !support;
  el("pmSupportPerimeterCount").disabled = !support;

  for (const key of FEATURE_TYPES) {
    const r = featureRowEls[key];
    const isSupportFeature =
      key === "support" ||
      key === "support_outer_perimeter" ||
      key === "support_inner_perimeter";
    const isInner = key === "inner_perimeter";
    const isSupportOuter = key === "support_outer_perimeter";
    const isSupportInner = key === "support_inner_perimeter";
    const isInfill = key === "infill";
    // Single material locks every feeder to T0.
    if (single) r.feeder.value = "T0";
    r.feeder.disabled = single;

    // Rows that don't apply are greyed wholesale.
    let rowDisabled = false;
    if (isSupportFeature && !support) rowDisabled = true;
    if (isInner && !multiPerimeter) rowDisabled = true;
    if (isSupportOuter && !hasSupportPerimeter) rowDisabled = true;
    if (isSupportInner && !multiSupportPerimeter) rowDisabled = true;
    // Infill with zero density deposits nothing, so its process fields are moot
    // (the density field itself stays editable so it can be raised again).
    const infillOff = isInfill && (p.features.infill.infill_density ?? 0) <= 0;

    r.feeder.disabled = r.feeder.disabled || rowDisabled || infillOff;
    r.feed.disabled = rowDisabled || infillOff;
    r.bead.disabled = rowDisabled || infillOff;
    r.laser.disabled = rowDisabled || infillOff;
    if (r.density) r.density.disabled = rowDisabled;
    r.row.classList.toggle("disabled", rowDisabled);
  }
}

/** Handle any manager edit: read it, apply constraints, save, drop toolpath. */
function onManagerChange() {
  if (!workingProfile || workingProfile.factory) return; // master = read-only
  collectManager();
  applyManagerConstraints();
  buildPlate();
  invalidateToolpath();
  schedulePersist();
}

/** Debounced save of the working profile to the server. */
function schedulePersist() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(persistProfile, 400);
}

async function persistProfile() {
  saveTimer = null;
  // Update the loaded profile in place: PUT by its current key edits + renames in
  // one call (the scoped library lives in the platform DB, keyed by name/id).
  const res = await fetch(`/api/profiles/${encodeURIComponent(loadedName)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(workingProfile),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    setStatus(detail.detail || "Could not save profile.");
    return;
  }
  workingProfile = await res.json();
  loadedName = workingProfile.name;
  activeProfileName = workingProfile.name;
  await refreshProfileNames(workingProfile.name);
}

/** Clear any rendered toolpath and return to the STL view (settings changed). */
function invalidateToolpath() {
  disposeGroup(toolpathGroup);
  disposeGroup(supportGroup);
  disposeGroup(travelGroup);
  toolpathObject = null;
  toolpathTubeParts = [];
  toolpathSegments = [];
  toolpathMoves = [];
  allSegments = [];
  allMoves = [];
  hasShortTravel = false;
  hasLongTravel = false;
  toolpathStats = null;
  totalSegments = 0;
  setPlaying(false);
  setLayerCount(0);
  el("simRow").hidden = true;
  el("viewToolpath").disabled = true;
  el("exportGcodeButton").disabled = true;
  selectView("stl");
  updateLegendVisibility();
  setSliceDirty(true); // profile/param change or model edit → needs a re-slice
}

async function createProfile() {
  // Seed a new profile from the current working copy under a fresh name.
  const base = JSON.parse(JSON.stringify(workingProfile));
  base.factory = false; // a brand-new profile is always editable
  let name = "New profile";
  let n = 2;
  while (profileNames.includes(name)) name = `New profile ${n++}`;
  base.name = name;
  const res = await fetch("/api/profiles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(base),
  });
  if (!res.ok) {
    setStatus("Could not create profile.");
    return;
  }
  const saved = await res.json();
  // Show the new profile instantly (optimistic), then reconcile from the server.
  profileNames = sortNames([
    ...profileNames.filter((n) => n !== saved.name),
    saved.name,
  ], factoryNames);
  fillProfileSelect(el("profileSelect"), profileNames, saved.name);
  applyLoadedProfile(saved);
  refreshProfileNames(saved.name).catch(() => {});
}

async function duplicateProfile() {
  // Clone the current profile into an editable copy named "<name> copy".
  if (!workingProfile) return;
  const base = JSON.parse(JSON.stringify(workingProfile));
  base.factory = false; // a copy is always an editable user profile
  let name = `${base.name} copy`;
  let n = 2;
  while (profileNames.includes(name)) name = `${base.name} copy ${n++}`;
  base.name = name;
  const res = await fetch("/api/profiles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(base),
  });
  if (!res.ok) {
    setStatus("Could not duplicate profile.");
    return;
  }
  const saved = await res.json();
  // Show the new profile instantly (optimistic), then reconcile from the server.
  profileNames = sortNames([
    ...profileNames.filter((n) => n !== saved.name),
    saved.name,
  ], factoryNames);
  fillProfileSelect(el("profileSelect"), profileNames, saved.name);
  applyLoadedProfile(saved);
  refreshProfileNames(saved.name).catch(() => {});
}

async function deleteActiveProfile() {
  if (!loadedName) return;
  const confirmed = await confirmDialog({
    title: "Delete profile",
    message: `Delete the profile “${loadedName}”? This cannot be undone.`,
    acceptLabel: "Delete",
  });
  if (!confirmed) return;
  const res = await fetch(`/api/profiles/${encodeURIComponent(loadedName)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    setStatus(detail.detail || "Could not delete profile.");
    return;
  }
  const data = await res.json();
  profileNames = data.profiles || [];
  await refreshProfileNames(profileNames[0]);
  await selectProfile(profileNames[0]);
}

// Styled confirm dialog: resolves true on accept, false on cancel/close.
const confirmOverlay = el("confirmOverlay");
let confirmResolve = null;
function closeConfirm(result) {
  confirmOverlay.hidden = true;
  const resolve = confirmResolve;
  confirmResolve = null;
  if (resolve) resolve(result);
}
function confirmDialog({ title, message, acceptLabel = "Confirm" }) {
  el("confirmTitle").textContent = title;
  el("confirmMessage").textContent = message;
  el("confirmAccept").textContent = acceptLabel;
  confirmOverlay.hidden = false;
  el("confirmAccept").focus();
  return new Promise((resolve) => {
    confirmResolve = resolve;
  });
}
el("confirmAccept").addEventListener("click", () => closeConfirm(true));
el("confirmCancel").addEventListener("click", () => closeConfirm(false));
el("confirmClose").addEventListener("click", () => closeConfirm(false));
el("confirmBackdrop").addEventListener("click", () => closeConfirm(false));
document.addEventListener("keydown", (e) => {
  if (!confirmOverlay.hidden && e.key === "Escape") closeConfirm(false);
});

// Profile Manager modal.
const profileOverlay = el("profileOverlay");
/** Open one settings group (Print / Machine) and collapse the other; only one
 *  group's sub-sections are shown at a time. */
function setProfileGroup(group) {
  for (const head of document.querySelectorAll("#pmAccordion .pm-group-head")) {
    const on = head.dataset.group === group;
    head.classList.toggle("active", on);
    head.setAttribute("aria-expanded", on ? "true" : "false");
  }
  for (const sub of document.querySelectorAll("#pmAccordion .pm-sub")) {
    sub.hidden = sub.dataset.group !== group;
  }
}

function openProfileManager() {
  profileOverlay.hidden = false;
  setProfileGroup("print"); // always open on the day-to-day Print group
  const body = profileOverlay.querySelector(".pm-body");
  if (body) body.scrollTop = 0;
}
function closeProfileManager() {
  profileOverlay.hidden = true;
}
buildFeatureRows();
el("profileManagerButton").addEventListener("click", openProfileManager);
el("profileClose").addEventListener("click", closeProfileManager);
el("profileDone").addEventListener("click", closeProfileManager);
el("profileBackdrop").addEventListener("click", closeProfileManager);

// Panel dropdown switches the active profile (and clears any toolpath).
el("profileSelect").addEventListener("change", (event) => {
  selectProfile(event.target.value);
});
el("pmNewProfile").addEventListener("click", createProfile);
el("pmDeleteProfile").addEventListener("click", deleteActiveProfile);

// Machine combo (in Machine settings): pick a preset to fill the profile's machine
// settings, or create a new one. Mirrors the profile combo.
el("pmMachineSwitch").addEventListener("change", (event) => {
  const value = event.target.value;
  if (value === NEW_MACHINE_OPTION) {
    event.target.value = (workingProfile && workingProfile.machine_key) || "";
    newMachine();
  } else {
    selectMachine(value);
  }
});
el("pmMachineSwitchTrigger").addEventListener("click", () => {
  const select = el("pmMachineSwitch");
  if (typeof select.showPicker === "function") {
    try {
      select.showPicker();
      return;
    } catch {
      // fall through to focus
    }
  }
  select.focus();
});
el("pmMachineName").addEventListener("change", (event) => {
  renameActiveMachine(event.target.value);
});
el("pmNewMachine").addEventListener("click", newMachine);
el("pmDeleteMachine").addEventListener("click", deleteActiveMachine);
el("pmAccordion").addEventListener("click", (event) => {
  const head = event.target.closest(".pm-group-head");
  if (!head) return;
  // Toggle: clicking the open group closes it (both can be closed); clicking the
  // other group opens it and closes the first (never both open).
  const alreadyOpen = head.classList.contains("active");
  setProfileGroup(alreadyOpen ? "" : head.dataset.group);
});

// In-modal name dropdown: pick a profile to switch to, or create a new one.
el("pmProfileSwitch").addEventListener("change", (event) => {
  const value = event.target.value;
  if (value === NEW_PROFILE_OPTION) {
    event.target.value = activeProfileName;
    createProfile();
  } else {
    selectProfile(value);
  }
});

// The arrow corner opens the full-width dropdown; the input stays editable.
el("pmProfileSwitchTrigger").addEventListener("click", () => {
  const select = el("pmProfileSwitch");
  if (typeof select.showPicker === "function") {
    try {
      select.showPicker();
      return;
    } catch {
      // Fall through to focus if showPicker is unavailable/blocked.
    }
  }
  select.focus();
});

// Support is a toggle button (not a select), so wire its click separately.
el("pmSupportEnabled").addEventListener("click", () => {
  const btn = el("pmSupportEnabled");
  setToggleButton(btn, !toggleButtonValue(btn));
  onManagerChange();
});

// Wire every manager input that isn't a feature row (those are wired on build).
for (const id of MANAGER_INPUT_IDS) {
  el(id).addEventListener("change", onManagerChange);
}

// Renaming the profile must persist on its own (it isn't in MANAGER_INPUT_IDS),
// otherwise the new name only saves when some other field changes — leaving the
// dropdown showing the old name. A name change doesn't affect geometry, so this
// persists + refreshes the name lists without dropping the toolpath.
el("pmProfileName").addEventListener("change", () => {
  if (!workingProfile || workingProfile.factory) return;
  collectManager();
  schedulePersist();
});

document.getElementById("sliceButton").addEventListener("click", sliceAndSimulate);

document.getElementById("simulateButton").addEventListener("click", simulate);

document.getElementById("exportGcodeButton").addEventListener("click", exportGcode);

document.getElementById("rotateBaseButton").addEventListener("click", () => {
  setSelectMode(!selectMode);
});

document.getElementById("translateButton").addEventListener("click", () => {
  setTranslateMode(!translateMode);
});

document.getElementById("centerButton").addEventListener("click", () => {
  if (meshGroup.children.length === 0) return;
  applyTransform("center_on_base", profileCenter(), { reframe: false });
});

// Rotate the model 90° about the vertical (Z) axis, spinning it in place.
document.getElementById("rotateZButton").addEventListener("click", () => {
  if (meshGroup.children.length === 0) return;
  applyTransform("rotate_z", { degrees: 90 }, { reframe: false });
});

document.getElementById("progress").addEventListener("input", (event) => {
  setPlaying(false);
  setProgress(Number(event.target.value));
});

document.getElementById("playButton").addEventListener("click", togglePlay);

document.getElementById("speed").addEventListener("input", (event) => {
  playbackSpeed = Number(event.target.value);
  const rail = document.getElementById("speedRail");
  if (rail) rail.value = event.target.value;
});

// --- Mobile playback bar: mirrors the canonical play/progress/speed controls ---
document.getElementById("playButtonM")?.addEventListener("click", togglePlay);
document.getElementById("progressM")?.addEventListener("input", (event) => {
  setPlaying(false);
  setProgress(Number(event.target.value));
});
document.getElementById("speedRail")?.addEventListener("input", (event) => {
  playbackSpeed = Number(event.target.value);
  const s = document.getElementById("speed");
  if (s) s.value = event.target.value;
});
// Speed symbol expands into the vertical slider; a tap elsewhere collapses it.
const speedToggleBtn = document.getElementById("speedToggle");
const speedSliderWrap = document.getElementById("speedSliderWrap");
speedToggleBtn?.addEventListener("click", (event) => {
  event.stopPropagation();
  const show = speedSliderWrap.hidden;
  speedSliderWrap.hidden = !show;
  speedToggleBtn.classList.toggle("active", show);
});
document.addEventListener("click", (event) => {
  if (!speedSliderWrap || speedSliderWrap.hidden) return;
  if (event.target.closest("#speedWrap")) return; // taps on the slider/symbol stay
  speedSliderWrap.hidden = true;
  speedToggleBtn?.classList.remove("active");
});

document.getElementById("layerSlider").addEventListener("input", (event) => {
  setActiveLayer(Number(event.target.value));
});
document.getElementById("layerSliderRail")?.addEventListener("input", (event) => {
  setActiveLayer(Number(event.target.value));
});

// Mobile: the view-rail graph icon shows/hides the whole thermal graph.
document.getElementById("thermalGraphToggle")?.addEventListener("click", () => {
  const chart = document.getElementById("thermalChart");
  if (!chart) return;
  chart.hidden = !chart.hidden;
  if (!chart.hidden) drawThermalChart();
  syncViewRail();
});

document.getElementById("thermalChartToggle").addEventListener("click", () => {
  const chart = document.getElementById("thermalChart");
  const collapsed = !chart.classList.contains("collapsed");
  chart.classList.toggle("collapsed", collapsed);
  const toggle = document.getElementById("thermalChartToggle");
  toggle.setAttribute("aria-expanded", String(!collapsed));
  toggle.querySelector(".thermal-chart-arrow").textContent = collapsed ? "▴" : "▾";
});

for (const radio of document.querySelectorAll('input[name="view"]')) {
  radio.addEventListener("change", (event) => setView(event.target.value));
}

for (const radio of document.querySelectorAll('input[name="tpStyle"]')) {
  radio.addEventListener("change", (event) => setPreviewMode(event.target.value));
}

// Face-selection mode: hover highlights a triangle, click seats it on the plate.
renderer.domElement.addEventListener("pointermove", onHover);
renderer.domElement.addEventListener("click", onSelectClick);
// Translate mode: press and drag the model across the plate.
renderer.domElement.addEventListener("pointerdown", onTranslateDown);
renderer.domElement.addEventListener("pointermove", onTranslateMove);
window.addEventListener("pointerup", onTranslateUp);
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (!profileOverlay.hidden) {
      closeProfileManager();
      return;
    }
    setSelectMode(false);
    setTranslateMode(false);
  }
});

// Expose the real (iframe) viewport height as a CSS var so mobile sheets size
// against it rather than vh/dvh (which can resolve against the top-level page
// inside an iframe).
function syncViewportHeight() {
  document.documentElement.style.setProperty("--app-h", `${window.innerHeight}px`);
}
syncViewportHeight();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  // DPR can change when the window moves between monitors of different density.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.setSize(window.innerWidth, window.innerHeight);
  syncViewportHeight();
  requestRender();
});

// In server-render (pixel-streaming) mode the renderer runs on a CPU-only box
// (software WebGL), so cap the render rate — 60 fps of continuous software
// rasterisation pegs the CPU and over-produces frames (buffering = lag). Normal
// in-browser use is uncapped.
const RENDER_FPS_CAP = document.documentElement.classList.contains("render") ? 30 : 0;
const RENDER_MIN_MS = RENDER_FPS_CAP ? 1000 / RENDER_FPS_CAP : 0;
let lastRenderMs = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  if (playing && totalSegments > 0) {
    const rate = (totalSegments / PLAYBACK_SECONDS) * playbackSpeed;
    let next = simValue + rate * dt;
    if (next >= totalSegments) {
      next = totalSegments;
      setPlaying(false);
    }
    setProgress(next);
  }
  // controls.update() applies damping inertia and fires "change" (→ requestRender)
  // while the camera is still settling, so frames keep flowing until it stops.
  controls.update();
  if (renderDirty) {
    if (RENDER_MIN_MS) {
      const now = performance.now();
      if (now - lastRenderMs < RENDER_MIN_MS) return; // stay dirty, render next slot
      lastRenderMs = now;
    }
    renderDirty = false;
    renderer.render(scene, camera);
  }
}

const clock = new THREE.Clock();
animate();
loadMesh();

// Load the machine presets + profiles and select the first profile as active.
(async () => {
  await refreshMachineNames();
  await refreshProfileNames();
  if (profileNames.length > 0) await selectProfile(profileNames[0], { clear: false });
  buildPlate();
  // Centre the initially-loaded model on the active profile's centring point;
  // with no model, frame the empty plate centred (not a corner).
  if (workingProfile && meshGroup.children.length > 0) {
    await applyTransform("center_on_base", profileCenter(), { reframe: true });
  } else {
    frameBed();
  }
})();

// --- Platform integration -------------------------------------------------
// The platform serves this UI at /slicer/?part=<id>. This slicer's own endpoints
// are RELATIVE (api/...); the platform's own API is ABSOLUTE (/api/...).
// The part currently loaded from the platform. Starts from the deep-link
// (?part=<id>) and is updated when the shell sends a load-part message.
let currentPartId = new URLSearchParams(location.search).get("part");
const embedded = new URLSearchParams(location.search).get("embed") === "1";
// Active org for platform calls (the fetch wrapper reads window.__platformOrgId).
window.__platformOrgId = new URLSearchParams(location.search).get("org") || null;

// Server-side rendering is a simple per-user on/off (set in the shell's account menu): the
// shell opens parts either locally or in the streamed viewer. The slicer itself has no
// auto-switchover — it just slices; the shell decides local vs streamed.

// Mobile: a rail of expandable sub-menus (Model / Slice / Preview). Only one is
// open at a time; tapping the active tab or anywhere outside closes it. With all
// closed the 3D view is full and the thermal graph shows at the bottom.
const sectionRail = document.getElementById("sectionRail");
// The embedded-viewer dock bar (?dock=1) drives the same sections/sheets.
const dockRail = document.getElementById("dockRail");
function setActiveSection(name) {
  if (name) document.body.dataset.section = name;
  else delete document.body.dataset.section;
  for (const b of document.querySelectorAll("#sectionRail button, #dockRail button"))
    b.classList.toggle("active", b.dataset.section === name);
}
// Tapping a tab toggles its sheet; tapping the active tab closes it. The menu is
// NOT closed by interacting with the 3D view (so rotate/move etc. keep working).
sectionRail?.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-section]");
  if (!btn || btn.disabled) return;
  const cur = document.body.dataset.section || null;
  setActiveSection(cur === btn.dataset.section ? null : btn.dataset.section);
});

// Dock bar (embedded viewer): a tab toggles its section sheet above the bar.
dockRail?.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-section]");
  if (!btn || btn.disabled) return;
  const cur = document.body.dataset.section || null;
  setActiveSection(cur === btn.dataset.section ? null : btn.dataset.section);
});

// Dock bar "Start print" is a HOST action — the embedding viewer owns the in-scene
// print simulation. But we gate it here first, where the slice/bounds state lives:
//   1) out of bounds → can't print; highlight Model + error banner, reorient.
//   2) not sliced yet → require Slice + Simulate; highlight Slice + warn banner.
// Only when both pass do we hand off to the parent (with a fresh bridged slice).
dockRail?.addEventListener("click", (e) => {
  const btn = e.target.closest('button[data-act="startprint"]');
  if (!btn || btn.disabled) return;
  if (computeModelOutOfBounds()) {
    updateBoundsState(); // red model/box + Model tab + reorient error banner
    return;
  }
  if (sliceDirty || !lastSlicePayload) {
    showSlicerBanner("warn", "Model not sliced yet — press Slice + Simulate first.");
    setSliceAttention(true);
    return;
  }
  hideSlicerBanner();
  if (typeof window !== "undefined" && window.parent !== window) {
    window.parent.postMessage({ source: "meltio-slicer", type: "start-print" }, "*");
  }
});

// Tell the embedding viewer the dock bar is present, so it can hand off its own
// "Start print" button to the one in this bar (and not show both).
if (document.documentElement.classList.contains("dock")
    && typeof window !== "undefined" && window.parent !== window) {
  window.parent.postMessage({ source: "meltio-slicer", type: "dock-ready" }, "*");
}

// Mobile bottom bar = direct actions (no sheet): proxy to the canonical buttons.
sectionRail?.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-act]");
  if (!btn || btn.disabled) return;
  const map = {
    slice: "sliceButton",
    profile: "profileManagerButton",
    save: "saveToPartButton",
  };
  document.getElementById(map[btn.dataset.act])?.click();
});
// Mirror the desktop Save's enabled state onto the mobile Save icon.
(() => {
  const saveBtn = document.getElementById("saveToPartButton");
  const mSave = document.getElementById("mSave");
  if (!saveBtn || !mSave) return;
  const sync = () => { mSave.disabled = saveBtn.disabled; };
  new MutationObserver(sync).observe(saveBtn, { attributes: true, attributeFilter: ["disabled"] });
  sync();
})();

// The thermal graph now opens automatically with the thermal view (no Graph tab).

// Mobile Preview tab (playback controls) is only usable once there's a toolpath.
const simRowEl = document.getElementById("simRow");
function updatePreviewTab() {
  const pv = sectionRail?.querySelector('button[data-section="preview"]');
  if (!pv || !simRowEl) return;
  pv.disabled = simRowEl.hidden;
  if (simRowEl.hidden && document.body.dataset.section === "preview") setActiveSection(null);
}
if (simRowEl) {
  new MutationObserver(updatePreviewTab).observe(simRowEl, {
    attributes: true,
    attributeFilter: ["hidden"],
  });
  updatePreviewTab();
}

// Mobile top-left view rail: STL / Toolpath / Thermal view modes + a Layer/Full
// toggle. They drive the same logic as the (desktop) view + preview-style radios.
const viewRail = document.getElementById("viewRail");
function syncViewRail() {
  const rail = document.getElementById("viewRail");
  if (!rail) return;
  const current = document.querySelector('input[name="view"]:checked')?.value;
  const tpDisabled = document.getElementById("viewToolpath").disabled;
  const thDisabled = document.getElementById("viewThermal").disabled;
  for (const btn of rail.querySelectorAll("button[data-view]")) {
    const v = btn.dataset.view;
    btn.classList.toggle("active", v === current);
    if (v === "toolpath") btn.disabled = tpDisabled;
    if (v === "thermal") btn.disabled = thDisabled;
  }
  const layerBtn = document.getElementById("layerToggle");
  if (layerBtn) {
    layerBtn.classList.toggle("active", isolateLayer);
    layerBtn.disabled = layerCount <= 1;
  }
  // Thermal-graph toggle: same logic as the model tools — always visible, enabled
  // only in the thermal view, and lit while the graph is shown.
  const graphBtn = document.getElementById("thermalGraphToggle");
  if (graphBtn) {
    const inThermal = current === "thermal";
    graphBtn.disabled = !(inThermal && thermalMoves.length > 0);
    const chart = document.getElementById("thermalChart");
    graphBtn.classList.toggle("active", inThermal && !!chart && !chart.hidden);
  }
  // The compact layer slider sits under the toggle — shown AND enabled only while
  // isolating a layer in the toolpath/thermal view; otherwise hidden and disabled.
  const inToolpathView = current === "toolpath" || current === "thermal";
  // The mobile playback bar is always available (no sheet) in the toolpath/thermal
  // view once there's a toolpath to scrub.
  const playbackBar = document.getElementById("playbackBar");
  if (playbackBar) playbackBar.hidden = !(inToolpathView && totalSegments > 0);
  const showLayerSlider = isolateLayer && inToolpathView;
  const railWrap = document.getElementById("layerSliderWrap");
  if (railWrap) railWrap.hidden = !showLayerSlider;
  const railSlider = document.getElementById("layerSliderRail");
  if (railSlider) railSlider.disabled = !showLayerSlider;
  // Model-prep tools (move/rotate/center) only make sense on the raw STL — kept
  // visible elsewhere but greyed out (and non-interactive).
  const modelTools = document.getElementById("modelTools");
  if (modelTools) {
    const stl = current === "stl";
    for (const btn of modelTools.querySelectorAll("button")) btn.disabled = !stl;
  }
}
viewRail?.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-view]");
  if (!btn || btn.disabled) return;
  selectView(btn.dataset.view);
});
// Model-tool icons proxy to the (desktop) Model section buttons so the existing
// move/rotate/center logic is reused.
document.getElementById("modelTools")?.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const map = { move: "translateButton", rotate: "rotateBaseButton", center: "centerButton" };
  document.getElementById(map[btn.dataset.action])?.click();
});

document.getElementById("layerToggle")?.addEventListener("click", () => {
  const enabling = !isolateLayer;
  if (enabling) {
    // From the STL view, jump into the toolpath so the isolated layer is visible
    // (keep toolpath/thermal as-is). Start on the last layer playback reached.
    const view = document.querySelector('input[name="view"]:checked')?.value;
    if (view !== "toolpath" && view !== "thermal") selectView("toolpath");
    setActiveLayer(lastRevealedLayer());
  }
  setPreviewMode(enabling ? "layer" : "tube");
});

// Styled "name this save" dialog. Resolves to the entered name, or null if cancelled.
// Falls back to the default if the dialog markup is absent.
function promptSliceName(defaultName) {
  return new Promise((resolve) => {
    const overlay = document.getElementById("saveOverlay");
    const input = document.getElementById("saveName");
    const ok = document.getElementById("saveAcceptBtn");
    const closeBtn = document.getElementById("saveCloseBtn");
    const backdrop = document.getElementById("saveBackdrop");
    if (!overlay || !input || !ok) {
      resolve(defaultName);
      return;
    }
    input.value = defaultName || "";
    overlay.hidden = false;
    setTimeout(() => {
      input.focus();
      // On touch (iOS), selecting the text pops the copy/paste callout and blocks typing;
      // just put the cursor at the end so the user can edit or clear. Select-all only with
      // a fine pointer (desktop), where it's a convenience for retyping.
      const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
      if (coarse) input.setSelectionRange(input.value.length, input.value.length);
      else input.select();
    }, 0);
    const done = (val) => {
      overlay.hidden = true;
      ok.removeEventListener("click", onOk);
      closeBtn.removeEventListener("click", onCancel);
      backdrop.removeEventListener("click", onCancel);
      input.removeEventListener("keydown", onKey);
      resolve(val);
    };
    const onOk = () => done(input.value.trim() || defaultName);
    const onCancel = () => done(null);
    const onKey = (e) => {
      if (e.key === "Enter") onOk();
      else if (e.key === "Escape") onCancel();
    };
    ok.addEventListener("click", onOk);
    closeBtn.addEventListener("click", onCancel);
    backdrop.addEventListener("click", onCancel);
    input.addEventListener("keydown", onKey);
  });
}

// Persist the current interactive slice back to the part (versioned, per user). A
// string `presetName` saves directly (e.g. the remote scene passes the name from its
// client-side dialog); otherwise the name dialog is shown.
async function saveToPart(presetName) {
  if (!currentPartId) return;
  let sliceName;
  if (typeof presetName === "string") {
    sliceName = presetName;
  } else {
    const def = ((document.getElementById("fileName") || {}).textContent || "Slice").replace(
      /\.stl$/i,
      "",
    );
    sliceName = await promptSliceName(def);
    if (sliceName === null) return; // cancelled
  }
  const button = document.getElementById("saveToPartButton");
  const label = button.textContent;
  button.disabled = true;
  button.textContent = "Saving…";
  try {
    const gres = await fetch("api/gcode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sliceParamsBody()),
    });
    if (!gres.ok) {
      setStatus("Could not generate G-code to save.");
      return;
    }
    const stats = toolpathStats || {};
    const form = new FormData();
    form.append(
      "file",
      new File([await gres.blob()], "slice.gcode", { type: "text/plain" }),
    );
    form.append("profile_name", activeProfileName || "");
    form.append("name", sliceName || "");
    form.append("profile_snapshot", JSON.stringify(workingProfile || {}));
    form.append("machine_key", (workingProfile && workingProfile.machine_key) || "");
    form.append("layer_count", String(stats.layers ?? 0));
    form.append("total_extrusion_mm", String(stats.totalExtrusionMm ?? 0));
    form.append("estimated_weight_g", String(stats.estimatedWeightG ?? 0));
    const pres = await fetch(`/api/parts/${currentPartId}/slices/import`, {
      method: "POST",
      body: form,
    });
    if (!pres.ok) {
      setStatus("Saving to part failed.");
      return;
    }
    const sv = await pres.json();
    // Store the toolpath payload so the slice reloads its 3D without re-slicing.
    if (lastSlicePayload) {
      try {
        const tpForm = new FormData();
        tpForm.append(
          "file",
          new File([JSON.stringify(lastSlicePayload)], "toolpath.json", {
            type: "application/json",
          }),
        );
        await fetch(`/api/slices/${sv.id}/toolpath`, { method: "POST", body: tpForm });
      } catch {
        /* reload-without-re-slice is a bonus; the slice itself is saved */
      }
    }
    // If a thermal sim was run for this slice, store it alongside the G-code.
    if (lastSimPayload) {
      try {
        const simForm = new FormData();
        simForm.append(
          "file",
          new File([JSON.stringify(lastSimPayload)], "simulation.json", {
            type: "application/json",
          }),
        );
        await fetch(`/api/slices/${sv.id}/simulation`, { method: "POST", body: simForm });
      } catch {
        /* sim is a bonus; the slice itself is already saved */
      }
    }
    setStatus(`Saved to part as v${sv.version}${lastSimPayload ? " (with sim)" : ""}.`);
    // Tell the shell to refresh its file tree with the new version.
    if (embedded && window.parent !== window) {
      window.parent.postMessage(
        { type: "slice-saved", partId: currentPartId, version: sv.version },
        location.origin,
      );
    }
  } catch (err) {
    setStatus("Saving to part failed.");
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}

document.getElementById("saveToPartButton").addEventListener("click", () => saveToPart());

// Reload a saved slice's stored toolpath (+ sim) into the viewer WITHOUT re-slicing.
// The toolpath/sim payloads were stored at save time (see saveToPart); building from
// them is far cheaper than recomputing the slice on every open.
async function loadStoredSlice(sliceId, target) {
  const tr = await fetch(`/api/slices/${sliceId}/toolpath`);
  if (!tr.ok) throw new Error("no stored toolpath");
  const payload = await tr.json();
  lastSlicePayload = payload;
  buildToolpath(payload);
  buildSupportMesh(payload.supportMesh);
  document.getElementById("viewToolpath").disabled = false;
  document.getElementById("exportGcodeButton").disabled = false;
  if (currentPartId) document.getElementById("saveToPartButton").disabled = false;
  document.getElementById("simulateButton").disabled = false;
  setSliceDirty(false);
  let view = "toolpath";
  if (target.simAvailable) {
    try {
      const sr = await fetch(`/api/slices/${sliceId}/simulation`);
      if (sr.ok) {
        const sim = await sr.json();
        buildThermal(sim);
        lastSimPayload = sim;
        refreshVisibleData();
        document.getElementById("viewThermal").disabled = false;
        view = "thermal";
      }
    } catch {
      /* sim is a bonus; the toolpath is already loaded */
    }
  }
  selectView(view);
}

// Pull a part's STL from the platform and load it (optionally reproducing a
// saved slice). Reused by the initial ?part=<id> deep-link and by the shell's
// load-part message when embedded, so navigating between parts needs no reload.
async function loadPlatformPart(partId, sliceId) {
  if (!partId) return;
  currentPartId = partId;
  // Signals full completion (incl. retained-toolpath / stored-slice rebuild) so the render
  // service waits for the whole load before deciding whether to (re)slice. See _wait_ready.
  window.__partLoadComplete = false;
  try {
    const res = await fetch(`/api/parts/${partId}/file`);
    if (!res.ok) {
      setStatus("Could not load part STL");
      window.__partLoadComplete = true;
      return;
    }
    const blob = await res.blob();
    const match = (res.headers.get("Content-Disposition") || "").match(
      /filename="?([^"]+)"?/,
    );
    const name = match ? match[1] : "part.stl";
    // Wait for the active machine profile so uploadFile centres the model on
    // the bed (it skips centring when no profile is loaded yet).
    for (let i = 0; i < 50 && !workingProfile; i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    await uploadFile(new File([blob], name, { type: "model/stl" }));

    // Opened from a specific slice: reproduce that result by selecting its
    // profile, re-slicing, and re-simulating if it had a sim. (Slicing is
    // deterministic, so this recreates the saved slice's toolpath.)
    if (sliceId) {
      try {
        const r = await fetch(`/api/parts/${partId}/slices`);
        const list = r.ok ? (await r.json()).slices : [];
        const target = list.find((s) => s.id === sliceId);
        if (target) {
          if (target.profileName && target.profileName !== activeProfileName) {
            await selectProfile(target.profileName, { clear: false });
            await applyTransform("center_on_base", profileCenter(), { reframe: true });
          }
          if (target.toolpathAvailable) {
            await loadStoredSlice(target.id, target); // reload stored result — no re-slice
          } else {
            // Legacy slice without a stored toolpath: recompute (slicing is deterministic).
            await slice();
            if (target.simAvailable) await simulate();
          }
        }
      } catch {
        /* best-effort: leave the model loaded for manual slicing */
      }
    }
    // Default mobile sheet: Preview when opening an already-sliced part, else Slice.
    setActiveSection(sliceId ? "preview" : "slice");
  } catch (err) {
    setStatus("Could not load part STL");
  } finally {
    window.__partLoadComplete = true;
  }
}

// Initial deep-link load (?part=<id>&slice=<id>). Skipped in remote-scene mode —
// there the server renders the part; the client builds no (heavy) local geometry.
if (new URLSearchParams(location.search).get("scene") !== "remote")
  loadPlatformPart(currentPartId, new URLSearchParams(location.search).get("slice"));

// Direct STL deep-link (?stl=<absolute url>): fetch an STL from another origin
// (e.g. the avisualizer viewer's /api/stl/file) and load it, so an embedding app
// can pre-select the file without the user picking one. The STL host must allow
// CORS. All the normal slicer tools stay available on the loaded model.
(async function loadStlFromUrlParam() {
  const stlUrl = new URLSearchParams(location.search).get("stl");
  if (!stlUrl) return;
  try {
    setStatus("Loading model…");
    const res = await fetch(stlUrl, { mode: "cors", cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    let name = "model.stl";
    try {
      const n = new URL(stlUrl, location.href).searchParams.get("name");
      if (n) name = decodeURIComponent(n);
    } catch (_e) {
      /* keep default name */
    }
    await uploadFile(new File([blob], name, { type: "model/stl" }));
  } catch (err) {
    setStatus("Could not load the selected model");
    console.warn("[slicer] ?stl= load failed:", err && err.message ? err.message : err);
  }
})();

// Embedded in the shell: load a part on demand without reloading the iframe.
window.addEventListener("message", (e) => {
  if (e.origin !== location.origin) return;
  const d = e.data || {};
  if (d.type === "load-part" && d.partId) {
    if (d.orgId) window.__platformOrgId = d.orgId;
    loadPlatformPart(d.partId, d.sliceId || null);
  }
});

// --- Pixel-streaming render mode -------------------------------------------
// In ?render=1 the headless render service drives the camera (via simulated mouse
// on the canvas) and captures frames. Expose the few hooks it needs. See
// docs/PIXEL_STREAMING.md.
if (new URLSearchParams(location.search).get("render") === "1") {
  window.__render = {
    // The part/toolpath has loaded and there's something to capture.
    ready: () =>
      meshGroup.children.length > 0 || toolpathGroup.children.length > 0,
    setView: (v) => {
      try {
        selectView(v);
      } catch (e) {
        /* view not available yet */
      }
    },
    setLayer: (i) => {
      try {
        if (!isolateLayer) setPreviewMode("layer");
        setActiveLayer(Number(i));
      } catch (e) {}
    },
    render: () => requestRender(),

    // Two-finger pan from the streamed client: translate the view by a screen-pixel delta
    // (replicates OrbitControls' pan so it coexists with pinch-zoom, which rides the wheel).
    panBy: (dx, dy) => {
      try {
        const offset = camera.position.clone().sub(controls.target);
        const td = offset.length() * Math.tan(((camera.fov || 50) / 2) * (Math.PI / 180));
        const h = canvas.clientHeight || canvas.height || 800;
        const left = new THREE.Vector3()
          .setFromMatrixColumn(camera.matrix, 0)
          .multiplyScalar(-(2 * dx * td) / h);
        const up = new THREE.Vector3()
          .setFromMatrixColumn(camera.matrix, 1)
          .multiplyScalar((2 * dy * td) / h);
        const panOffset = left.add(up);
        camera.position.add(panOffset);
        controls.target.add(panOffset);
        controls.update();
        requestRender();
      } catch (e) {}
    },

    // Phase 2: the client GUI is rebuilt in React; it drives the headless slicer
    // through this command dispatcher and reflects the slicer's state from getState.
    cmd: (name, arg) => {
      try {
        switch (name) {
          case "view":
            selectView(String(arg));
            break;
          case "layer":
            if (!isolateLayer) setPreviewMode("layer");
            setActiveLayer(Number(arg));
            break;
          case "layerToggle":
            document.getElementById("layerToggle")?.click();
            break;
          case "play":
            if (!playing) togglePlay();
            break;
          case "pause":
            if (playing) togglePlay();
            break;
          case "togglePlay":
            togglePlay();
            break;
          case "progress":
            setProgress(Number(arg));
            break;
          case "speed": {
            playbackSpeed = Number(arg);
            const s = document.getElementById("speed");
            if (s) s.value = String(arg);
            const r = document.getElementById("speedRail");
            if (r) r.value = String(arg);
            break;
          }
          case "tpStyle":
            setPreviewMode(String(arg));
            break;
          case "model":
            if (arg === "move") document.getElementById("translateButton")?.click();
            else if (arg === "rotate") document.getElementById("rotateBaseButton")?.click();
            else if (arg === "center") document.getElementById("centerButton")?.click();
            break;
          case "thermalGraph":
            document.getElementById("thermalGraphToggle")?.click();
            break;
          case "toggleKind":
            toggleKind(String(arg));
            break;
          case "toggleTravel":
            toggleTravels(String(arg));
            break;
          case "slice":
            slice();
            break;
          case "simulate":
            sliceAndSimulate();
            break;
          case "save":
            saveToPart(arg); // arg = name from the client's dialog (remote scene)
            break;
          case "export":
            exportGcode();
            break;
          case "selectProfile":
            selectProfile(String(arg));
            break;
          default:
            break;
        }
        // A view/visibility change is a one-off scene mutation; keep frames flowing briefly
        // so the streamed encoder delivers and sharpens the new view quickly.
        if (
          ["view", "layer", "layerToggle", "tpStyle", "toggleKind", "toggleTravel", "thermalGraph", "model"].includes(
            name,
          )
        )
          renderBurst();
      } catch (e) {
        /* command not applicable in the current state */
      }
    },
    getState: () => {
      const checked = document.querySelector('input[name="view"]:checked');
      const exportBtn = document.getElementById("exportGcodeButton");
      const chart = document.getElementById("thermalChart");
      const curView = checked ? checked.value : "stl";
      // Legend: read the slicer's own DOM so labels/colours/stats match exactly.
      const legendItems = [...document.querySelectorAll("#legendItems .legend-item")].map((bn) => ({
        label: bn.querySelector("span") ? bn.querySelector("span").textContent : "",
        color: bn.querySelector(".swatch")
          ? getComputedStyle(bn.querySelector(".swatch")).backgroundColor
          : "",
        kind: bn.dataset.kind || "",
        travel: bn.dataset.travel || "",
        off: bn.classList.contains("disabled"),
      }));
      const legendStats = [...document.querySelectorAll("#legendStats div")].map((d) => [
        d.querySelector("span") ? d.querySelector("span").textContent : "",
        d.querySelector("b") ? d.querySelector("b").textContent : "",
      ]);
      // Thermal avg-heat marker (recomputed per isolated layer by updateThermalScale).
      const avgEl = document.getElementById("thermalAvg");
      const avgLabelEl = document.getElementById("thermalAvgLabel");
      // Thermal chart series (downsampled to keep the pushed state small).
      let series;
      if (curView === "thermal" && thermalSeries && thermalSeries.peak) {
        const peak = thermalSeries.peak;
        const step = Math.max(1, Math.ceil(peak.length / 120));
        series = peak.filter((_, i) => i % step === 0);
      }
      return {
        legend: {
          items: legendItems,
          stats: legendStats,
          thermal: curView === "thermal",
          avg: avgEl ? avgEl.style.left : "",
          avgLabel: avgLabelEl ? avgLabelEl.textContent : "",
        },
        thermalSeries: series,
        ready: meshGroup.children.length > 0 || toolpathGroup.children.length > 0,
        view: checked ? checked.value : "stl",
        views: {
          stl: true,
          toolpath: !document.getElementById("viewToolpath").disabled,
          thermal: !document.getElementById("viewThermal").disabled,
        },
        layerCount,
        activeLayer,
        isolate: isolateLayer,
        playing,
        speed: playbackSpeed,
        progress: simValue,
        totalSegments,
        tpStyle: toolpathStyle,
        modelTool: translateMode ? "move" : selectMode ? "rotate" : null,
        profile: activeProfileName,
        profiles: profileNames,
        sliceDirty,
        canExport: exportBtn ? !exportBtn.disabled : false,
        thermalGraphOpen: chart ? !chart.hidden : false,
        status: document.getElementById("status").textContent,
        fileName: (document.getElementById("fileName") || {}).textContent || "",
      };
    },
  };

  // --- WebRTC sender (Phase 1) ---------------------------------------------
  // Stream the 3D canvas as a hardware-encoded (NVENC) video track instead of
  // server-side JPEG. Signaling is relayed by the render service: it exposes
  // window.__signal (page -> client) and calls window.__webrtcStart /
  // window.__webrtcSignal (client -> page). The GUI is rebuilt client-side, so
  // here we only publish the canvas + drive the camera via the existing mouse relay.
  {
    let pc = null;

    // Input arrives over the WebRTC DataChannel (low-latency UDP, same path as the
    // video) and is applied IN-PAGE here — bypassing the WS/Cloudflare + Python +
    // CDP hops that made orbit feel laggy. We replay it as synthetic pointer/wheel
    // events so the slicer's own OrbitControls + pickers handle it. OrbitControls
    // calls setPointerCapture(pointerId), which throws for synthetic pointers, so
    // stub it (no real pointers exist headless).
    canvas.setPointerCapture = () => {};
    canvas.releasePointerCapture = () => {};
    canvas.hasPointerCapture = () => false;
    const dispatchPointer = (type, x, y, buttons) =>
      canvas.dispatchEvent(
        new PointerEvent(type, {
          clientX: x, clientY: y, pointerId: 1, pointerType: "mouse",
          isPrimary: true, button: 0, buttons, bubbles: true, cancelable: true,
        }),
      );
    let _downX = 0;
    let _downY = 0;
    let _moved = false;
    const handleInput = (m) => {
      try {
        const t = m.type;
        if (t === "pd") {
          _downX = m.x;
          _downY = m.y;
          _moved = false;
          dispatchPointer("pointerdown", m.x, m.y, 1);
        } else if (t === "pm") {
          if (Math.hypot(m.x - _downX, m.y - _downY) > 6) _moved = true;
          dispatchPointer("pointermove", m.x, m.y, 1);
        } else if (t === "pu") {
          dispatchPointer("pointerup", m.x, m.y, 0);
          // A tap (no drag) also fires a click, so the slicer's click pickers work —
          // e.g. Rotate-to-base picks the face you tap.
          if (!_moved && Math.hypot(m.x - _downX, m.y - _downY) <= 6)
            canvas.dispatchEvent(
              new MouseEvent("click", { clientX: m.x, clientY: m.y, bubbles: true, cancelable: true }),
            );
        } else if (t === "whl")
          canvas.dispatchEvent(
            new WheelEvent("wheel", { clientX: m.x, clientY: m.y, deltaY: m.dy, bubbles: true, cancelable: true }),
          );
        else if (t === "pan") window.__render.panBy(m.dx, m.dy);
        else if (t === "cmd") window.__render.cmd(m.cmd, m.arg);
      } catch (e) {
        /* input not applicable yet */
      }
    };

    window.__webrtcStart = async (iceServers) => {
      if (pc) {
        try {
          pc.close();
        } catch (e) {}
      }
      pc = new RTCPeerConnection({ iceServers: iceServers || [] });
      pc.onicecandidate = (e) => {
        if (e.candidate && window.__signal)
          window.__signal(JSON.stringify({ type: "ice", candidate: e.candidate }));
      };
      // DataChannel for input + state — created before the offer so it's negotiated
      // in it. Reliable + ordered (the default): pointer down/up/wheel order matters
      // (pinch sends pu before the wheel, and OrbitControls ignores wheels unless
      // state is NONE, so a dropped/reordered pu would kill pinch-zoom).
      const dc = pc.createDataChannel("input");
      dc.onmessage = (e) => handleInput(JSON.parse(e.data));
      // State push over the same DataChannel (low-latency, same fast path as input) —
      // the React GUI reflects it. In-page poll, send only on change; no WS round-trip
      // or server-side poll (snappier than the old ~0.4s WS push).
      let lastStateStr = "";
      const pushState = () => {
        try {
          const s = JSON.stringify({ state: window.__render.getState() });
          if (s !== lastStateStr && dc.readyState === "open") {
            dc.send(s);
            lastStateStr = s;
          }
        } catch (e) {}
      };
      dc.onopen = () => {
        pushState();
        requestRender(); // paint at least one frame so a static view isn't blank on connect
      };
      const stateTimer = setInterval(pushState, 150);
      pc.addEventListener("connectionstatechange", () => {
        if (pc.connectionState === "closed" || pc.connectionState === "failed")
          clearInterval(stateTimer);
      });
      // Change-driven rendering: animate() paints only when dirty (orbit / playback /
      // damping glide), so a still view streams nothing (no idle GPU/encode). Nudge a
      // few frames once the peer connects so the initial view shows.
      pc.addEventListener("iceconnectionstatechange", () => {
        const s = pc.iceConnectionState;
        if (s === "connected" || s === "completed") {
          // Burst of frames so the encoder ramps to full quality even on a static
          // view (otherwise the first frames look soft until the user interacts).
          let n = 0;
          const burst = setInterval(() => {
            requestRender();
            if (++n > 24) clearInterval(burst);
          }, 120);
        }
      });
      const stream = canvas.captureStream(30);
      const vtrack = stream.getVideoTracks()[0];
      if (vtrack) vtrack.contentHint = "detail"; // bias the encoder toward sharpness
      stream.getVideoTracks().forEach((t) => pc.addTrack(t, stream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      // Keep the 3D crisp: WebRTC otherwise downscales detail to ~290p at a low
      // bitrate. Raise the ceiling and prefer resolution over framerate.
      const sender = pc.getSenders().find((s) => s.track && s.track.kind === "video");
      if (sender) {
        try {
          const params = sender.getParameters();
          if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
          params.encodings[0].maxBitrate = 6000000;
          params.degradationPreference = "maintain-resolution";
          await sender.setParameters(params);
        } catch (e) {
          /* setParameters unsupported / too early */
        }
      }
      if (window.__signal) window.__signal(JSON.stringify({ type: "offer", sdp: offer.sdp }));
    };

    window.__webrtcSignal = async (raw) => {
      if (!pc) return;
      const m = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (m.type === "answer") {
        await pc.setRemoteDescription({ type: "answer", sdp: m.sdp });
      } else if (m.type === "ice" && m.candidate) {
        try {
          await pc.addIceCandidate(m.candidate);
        } catch (e) {}
      }
    };
  }
}

// --- Remote-scene mode (spike) ---------------------------------------------
// The REAL slicer GUI, but the 3D is rendered server-side and shown as a WebRTC
// video; the client builds no heavy geometry and relays camera input (orbit / pinch
// / wheel) to the server. Validates that pinch-zoom etc. survive when the actual
// slicer GUI is the interface. ?scene=remote&part=<id>&org=<id>[&slice=<id>][&view=].
if (new URLSearchParams(location.search).get("scene") === "remote") {
  initRemoteScene();
}

async function initRemoteScene() {
  try {
    controls.enabled = false; // the server owns the camera; no local orbit
    canvas.style.visibility = "hidden";
    const params = new URLSearchParams(location.search);
    const me = await fetch("/api/me").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const renderUrl = me && me.renderUrl;
    if (!renderUrl) {
      setStatus("Remote scene unavailable (streaming off?)");
      return;
    }

    const video = document.createElement("video");
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    // Match #scene exactly (the slicer's 3D canvas): fixed + full, no explicit
    // z-index, and FIRST in the DOM so all GUI stacks above it. height:100% fills the
    // shell-pinned iframe in the embedded flow (the real path).
    Object.assign(video.style, {
      position: "fixed",
      inset: "0",
      width: "100%",
      height: "100%",
      objectFit: "contain",
      background: "var(--bg)",
      touchAction: "none",
    });
    document.body.prepend(video);

    // Connection (recreated by scheduleReconnect / on return-from-background). Input
    // rides the DataChannel so the WS would otherwise go idle and the server's 120s
    // idle timeout would kill the session — a heartbeat keeps it alive, and we
    // reconnect on drop or when the tab becomes visible again.
    let pc = null;
    let dc = null;
    let ws = null;
    let hb = null;
    let reconnectTimer = null;
    let needReconnect = false; // a reconnect was requested while backgrounded; do it on return
    let connectStartedAt = 0; // when the latest connect() began (so the watchdog gives it time)
    let resumeId = null; // server session id; sent on reconnect to resume the exact state
    let lastView = params.get("view") || "stl"; // snapshot for the reconnect handshake

    function scheduleReconnect() {
      clearInterval(hb);
      clearTimeout(reconnectTimer);
      try {
        if (pc) pc.close();
      } catch (x) {}
      try {
        if (ws) ws.close();
      } catch (x) {}
      pc = null;
      ws = null;
      dc = null;
      // Don't try to reconnect on a backgrounded page — ICE can't complete while frozen,
      // so the connection is born broken. Defer until we're foreground again (see wake()).
      if (document.hidden) {
        needReconnect = true;
        return;
      }
      needReconnect = false;
      reconnectTimer = setTimeout(connect, 800);
    }

    async function connect() {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
      connectStartedAt = Date.now();
      showNote("Loading…"); // cleared when the first frame paints (peer.ontrack)
      const cfg = await fetch("/api/render/token")
        .then((r) => r.json())
        .catch(() => ({ token: "", iceServers: [] }));
      if (!cfg.token) {
        setStatus("Remote scene unavailable");
        return;
      }
      const peer = new RTCPeerConnection({ iceServers: cfg.iceServers });
      pc = peer;
      dc = null;
      peer.ontrack = (e) => {
        video.srcObject = e.streams[0];
        // iOS won't auto-resume a freshly attached stream after a reconnect — play it.
        const pr = video.play();
        if (pr && pr.catch) pr.catch(() => {});
        // Hide the loading/timeout note once a real frame is presented.
        if (video.requestVideoFrameCallback)
          video.requestVideoFrameCallback(() => hideNote());
        else setTimeout(hideNote, 1500);
      };
      peer.ondatachannel = (e) => {
        if (e.channel.label === "input") {
          dc = e.channel;
          // State is pushed over the same channel; reflect it onto the real GUI.
          e.channel.onmessage = (ev) => {
            try {
              const m = JSON.parse(ev.data);
              if (m.state) {
                lastView = m.state.view || lastView; // snapshot for restore on resume
                applyRemoteState(m.state);
              }
            } catch (x) {}
          };
        }
      };
      peer.oniceconnectionstatechange = () => {
        const s = peer.iceConnectionState;
        if (s === "failed" || s === "closed" || s === "disconnected") scheduleReconnect();
      };
      const sock = new WebSocket(renderUrl.replace(/\/$/, "") + "/ws");
      ws = sock;
      peer.onicecandidate = (e) => {
        if (e.candidate && sock.readyState === 1)
          sock.send(JSON.stringify({ signal: { type: "ice", candidate: e.candidate } }));
      };
      sock.onopen = () => {
        sock.send(
          JSON.stringify({
            mode: "webrtc",
            part: params.get("part") || currentPartId,
            org: params.get("org") || (me.org && me.org.id),
            slice: params.get("slice") || null,
            view: lastView,
            token: cfg.token,
            resume: resumeId,
            w: window.innerWidth,
            h: window.innerHeight,
          }),
        );
        clearInterval(hb);
        hb = setInterval(() => {
          if (sock.readyState === 1) sock.send(JSON.stringify({ type: "ping" }));
        }, 30000);
      };
      sock.onclose = () => {
        clearInterval(hb);
        scheduleReconnect();
      };
      sock.onmessage = async (ev) => {
        const m = JSON.parse(ev.data);
        if (m.session) {
          // Resume token: replay it on reconnect to re-attach to the same server page. A
          // DIFFERENT id than we asked to resume means the grace period elapsed and the
          // server is building a fresh page — surface that we're reloading.
          if (resumeId && m.session !== resumeId)
            showNote("Render timed out — reloading model to resume");
          resumeId = m.session;
          return;
        }
        if (m.error) {
          setStatus("Remote: " + m.error);
          return;
        }
        if (m.signal) {
          const s = typeof m.signal === "string" ? JSON.parse(m.signal) : m.signal;
          if (s.type === "offer") {
            await peer.setRemoteDescription({ type: "offer", sdp: s.sdp });
            const a = await peer.createAnswer();
            await peer.setLocalDescription(a);
            sock.send(JSON.stringify({ signal: { type: "answer", sdp: a.sdp } }));
          } else if (s.type === "ice" && s.candidate) {
            try {
              await peer.addIceCandidate(s.candidate);
            } catch (e) {}
          }
        }
      };
    }

    // True when the WebRTC peer and signaling socket are both live. We reconnect ONLY when
    // this is false: a healthy connection must never be torn down (e.g. a desktop tab
    // switch, where the connection survives backgrounding) — closing it blanks the <video>,
    // and a slow re-handshake leaves the part missing. A surviving connection just needs
    // the <video> resumed.
    function isHealthy() {
      if (!pc || !ws || ws.readyState !== 1) return false;
      if (pc.connectionState) return pc.connectionState === "connected";
      const i = pc.iceConnectionState;
      return i === "connected" || i === "completed";
    }

    // Returning to the foreground: resume the <video>; reconnect only if the connection
    // didn't survive being backgrounded.
    function wake() {
      const pr = video.play();
      if (pr && pr.catch) pr.catch(() => {});
      if (needReconnect || !isHealthy()) scheduleReconnect();
    }
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) wake();
    });
    // iOS/Safari may restore a backgrounded page from the back/forward cache without firing
    // visibilitychange — pageshow(persisted) covers that return path.
    window.addEventListener("pageshow", (e) => {
      if (e.persisted) wake();
    });

    // Backstop for mobile (especially Chrome on iOS) where visibilitychange/pageshow are
    // unreliable: a frozen page freezes its timers, so an oversized gap between ticks means
    // we were backgrounded — resume the <video>. Reconnect whenever the connection is found
    // unhealthy. Won't fire during idle (the peer stays connected) and won't disturb a
    // healthy tab that simply regained focus.
    let lastTick = Date.now();
    setInterval(() => {
      const now = Date.now();
      const gap = now - lastTick;
      lastTick = now;
      if (document.hidden || reconnectTimer) return;
      if (now - connectStartedAt < 8000) return; // give an in-flight connect time to settle
      if (gap > 5000) {
        const pr = video.play();
        if (pr && pr.catch) pr.catch(() => {});
      }
      if (!isHealthy()) scheduleReconnect();
    }, 2000);

    // Live-render indicator: a small icon to the left of the status text (profile name /
    // slicing progress), so it's obvious the 3D is streamed — handy once streaming
    // auto-engages for heavy parts. Wrap the existing text in .status-text so setStatus
    // updates only the text and leaves the icon in place.
    ["status", "statusM"].forEach((id) => {
      const el = document.getElementById(id);
      if (!el || el.querySelector(".rs-live")) return;
      const cur = el.textContent || "";
      el.textContent = "";
      const icon = document.createElement("span");
      icon.className = "rs-live";
      icon.title = "Live remote render";
      icon.setAttribute("aria-label", "Live remote render");
      icon.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
        '<circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/>' +
        '<path d="M8 8a5.5 5.5 0 0 0 0 8"/><path d="M16 8a5.5 5.5 0 0 1 0 8"/>' +
        '<path d="M5.5 5.5a9 9 0 0 0 0 13" opacity="0.5"/><path d="M18.5 5.5a9 9 0 0 1 0 13" opacity="0.5"/>' +
        "</svg>";
      const txt = document.createElement("span");
      txt.className = "status-text";
      txt.textContent = cur;
      el.appendChild(icon);
      el.appendChild(txt);
    });

    // Centered note where the model renders: "Loading…" while we wait for the first
    // frame, and (only when a reconnect can't resume — i.e. the grace period elapsed)
    // "Render timed out — reloading model to resume". Hidden once a real frame paints.
    const note = document.createElement("div");
    note.className = "rs-note";
    note.hidden = true;
    note.innerHTML = '<div class="rs-note-card"></div>';
    document.body.appendChild(note);
    const noteCard = note.querySelector(".rs-note-card");
    function showNote(text) {
      noteCard.textContent = text;
      note.hidden = false;
    }
    function hideNote() {
      note.hidden = true;
    }

    connect();
    window.__rsReconnect = scheduleReconnect; // debug/test hook to force a reconnect

    // Input relay: one finger orbits, two-finger pinch zooms (coalesced → wheel).
    const sendInput = (o) => {
      if (dc && dc.readyState === "open") dc.send(JSON.stringify(o));
      else if (ws && ws.readyState === 1) ws.send(JSON.stringify(o));
    };
    const pts = new Map();
    let orbiting = false;
    let pinch = null;
    let centroid = null; // last two-finger midpoint, for pan
    let pendMove = null;
    let pendZoom = null;
    let pendPan = null;
    const pos = (e) => {
      const r = video.getBoundingClientRect();
      return { x: Math.round(e.clientX - r.left), y: Math.round(e.clientY - r.top) };
    };
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const flush = () => {
      if (pendMove) {
        sendInput({ type: "pm", x: pendMove.x, y: pendMove.y });
        pendMove = null;
      }
      if (pendZoom) {
        sendInput({ type: "whl", x: pendZoom.x, y: pendZoom.y, dy: Math.round(pendZoom.dy) });
        pendZoom = null;
      }
      if (pendPan) {
        sendInput({ type: "pan", dx: Math.round(pendPan.dx), dy: Math.round(pendPan.dy) });
        pendPan = null;
      }
      requestAnimationFrame(flush);
    };
    requestAnimationFrame(flush);
    video.addEventListener("pointerdown", (e) => {
      try {
        video.setPointerCapture(e.pointerId);
      } catch (x) {}
      const p = pos(e);
      pts.set(e.pointerId, p);
      if (pts.size === 1) {
        orbiting = true;
        sendInput({ type: "pd", x: p.x, y: p.y });
      } else if (pts.size === 2) {
        if (orbiting) {
          orbiting = false;
          pendMove = null;
          sendInput({ type: "pu", x: p.x, y: p.y });
        }
        const [a, b] = [...pts.values()];
        pinch = dist(a, b);
        centroid = { x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2) };
      }
    });
    video.addEventListener("pointermove", (e) => {
      if (!pts.has(e.pointerId)) return;
      const p = pos(e);
      pts.set(e.pointerId, p);
      if (pts.size >= 2 && pinch != null) {
        const [a, b] = [...pts.values()];
        const d = dist(a, b);
        const cx = Math.round((a.x + b.x) / 2);
        const cy = Math.round((a.y + b.y) / 2);
        // Pinch -> zoom (distance change).
        const delta = d - pinch;
        if (Math.abs(delta) > 1) {
          pendZoom = { x: cx, y: cy, dy: (pendZoom ? pendZoom.dy : 0) + -delta * 2.5 };
          pinch = d;
        }
        // Two-finger drag -> pan (midpoint movement), coexists with the pinch.
        if (centroid) {
          const pdx = cx - centroid.x;
          const pdy = cy - centroid.y;
          if (pdx || pdy)
            pendPan = { dx: (pendPan ? pendPan.dx : 0) + pdx, dy: (pendPan ? pendPan.dy : 0) + pdy };
        }
        centroid = { x: cx, y: cy };
      } else if (orbiting) {
        pendMove = p;
      }
    });
    video.addEventListener("pointerup", (e) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) { pinch = null; centroid = null; }
      if (pts.size === 0 && orbiting) {
        orbiting = false;
        pendMove = null;
        const p = pos(e);
        sendInput({ type: "pu", x: p.x, y: p.y });
      } else if (pts.size === 1 && !orbiting) {
        const [rem] = [...pts.values()];
        orbiting = true;
        sendInput({ type: "pd", x: Math.round(rem.x), y: Math.round(rem.y) });
      }
    });
    video.addEventListener("pointercancel", (e) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) { pinch = null; centroid = null; }
      if (pts.size === 0) {
        orbiting = false;
        pendMove = null;
      }
    });
    video.addEventListener("wheel", (e) => {
      const p = pos(e);
      sendInput({ type: "whl", x: p.x, y: p.y, dy: e.deltaY });
    });

    // --- Controls -> cmd ---------------------------------------------------
    // Capture-phase: map the slicer's own controls to commands and stop the local
    // (scene-mutating) handlers from running. The Profile Manager + its fields are
    // left alone (they edit profiles via the shared API).
    const sendCmd = (cmd, arg) => sendInput({ type: "cmd", cmd, arg });
    const onCtl = (e) => {
      const t = e.target;
      if (!t || !t.closest) return;
      let did = true;
      const viewBtn = t.closest("[data-view]");
      const actionBtn = t.closest(".model-tools [data-action]");
      if (viewBtn) sendCmd("view", viewBtn.dataset.view);
      else if (t.name === "view") sendCmd("view", t.value);
      else if (t.closest("#layerToggle")) sendCmd("layerToggle");
      else if (t.id === "layerSliderRail" || t.id === "layerSlider") sendCmd("layer", Number(t.value));
      else if (actionBtn) sendCmd("model", actionBtn.dataset.action);
      else if (t.closest("#translateButton")) sendCmd("model", "move");
      else if (t.closest("#rotateBaseButton")) sendCmd("model", "rotate");
      else if (t.closest("#centerButton")) sendCmd("model", "center");
      else if (t.closest("#playButton") || t.closest("#playButtonM")) sendCmd("togglePlay");
      else if (t.id === "progress" || t.id === "progressM") sendCmd("progress", Number(t.value));
      else if (t.id === "speed" || t.id === "speedRail") sendCmd("speed", Number(t.value));
      else if (t.name === "tpStyle") sendCmd("tpStyle", t.value); // desktop preview/layer selector
      else if (t.closest("#sliceButton") || t.closest("#mSlice")) sendCmd("simulate");
      else if (t.closest("#saveToPartButton") || t.closest("#mSave")) {
        // Show the name dialog on the client, then save with the chosen name.
        const def = ((document.getElementById("fileName") || {}).textContent || "Slice").replace(
          /\.stl$/i,
          "",
        );
        promptSliceName(def).then((name) => {
          if (name !== null) sendCmd("save", name);
        });
      }
      else if (t.id === "profileSelect") sendCmd("selectProfile", t.value);
      else if (t.closest("#exportGcodeButton")) sendCmd("export");
      else if (t.closest("#thermalGraphToggle")) sendCmd("thermalGraph");
      else if (t.closest(".legend-item")) {
        const li = t.closest(".legend-item");
        if (li.dataset.travel) sendCmd("toggleTravel", li.dataset.travel);
        else if (li.dataset.kind) sendCmd("toggleKind", li.dataset.kind);
      } else did = false;
      if (did) e.stopPropagation();
    };
    document.addEventListener("click", onCtl, true);
    document.addEventListener("change", onCtl, true);
    document.addEventListener("input", onCtl, true);

    setStatus("Remote scene connected");
  } catch (e) {
    setStatus("Remote scene error");
  }
}

// Reflect the server slicer's state onto the real (client-side) GUI in remote mode.
function applyRemoteState(s) {
  if (!s) return;
  const byId = (id) => document.getElementById(id);
  const isTp = s.view === "toolpath" || s.view === "thermal";
  // View radios + availability + mobile view rail.
  document.querySelectorAll('input[name="view"]').forEach((r) => {
    r.checked = r.value === s.view;
  });
  if (byId("viewToolpath")) byId("viewToolpath").disabled = !s.views.toolpath;
  if (byId("viewThermal")) byId("viewThermal").disabled = !s.views.thermal;
  document.querySelectorAll(".view-rail [data-view]").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === s.view);
    if (b.dataset.view === "toolpath") b.disabled = !s.views.toolpath;
    if (b.dataset.view === "thermal") b.disabled = !s.views.thermal;
  });
  // Layer isolate + slider.
  const lt = byId("layerToggle");
  if (lt) {
    lt.disabled = !(isTp && s.layerCount > 1);
    lt.classList.toggle("active", !!s.isolate);
  }
  if (byId("layerSliderWrap")) byId("layerSliderWrap").hidden = !(s.isolate && s.layerCount > 1);
  ["layerSliderRail", "layerSlider"].forEach((id) => {
    const sl = byId(id);
    if (sl) {
      sl.max = String(Math.max(0, s.layerCount - 1));
      sl.value = String(s.activeLayer);
      sl.disabled = s.layerCount <= 1;
    }
  });
  // Playback bar + glyph + progress + speed.
  if (byId("playbackBar")) byId("playbackBar").hidden = !(isTp && s.totalSegments > 0);
  const glyph = s.playing ? "❚❚" : "▶";
  ["playButton", "playButtonM"].forEach((id) => {
    if (byId(id)) byId(id).textContent = glyph;
  });
  ["progress", "progressM"].forEach((id) => {
    const p = byId(id);
    if (p) {
      p.max = String(s.totalSegments || 1);
      p.value = String(Math.round(s.progress || 0));
    }
  });
  ["speed", "speedRail"].forEach((id) => {
    if (byId(id)) byId(id).value = String(s.speed);
  });
  // Desktop preview controls live in #simRow (play/progress/speed + Lines/Tubes/Layer +
  // layer slider). The streamed client has no local toolpath, so drive them from the
  // reflected state — mirroring the mobile playback bar above.
  if (byId("simRow")) byId("simRow").hidden = !(isTp && s.totalSegments > 0);
  const effMode = s.isolate ? "layer" : s.tpStyle;
  document.querySelectorAll('input[name="tpStyle"]').forEach((r) => {
    r.checked = r.value === effMode;
  });
  // The "Layer" option is disabled in markup until there are layers (set locally by
  // setPreviewMode, which doesn't run in remote) — enable it from the reflected state.
  if (byId("tpStyleLayer")) byId("tpStyleLayer").disabled = !(s.layerCount > 1);
  if (byId("layerLine")) byId("layerLine").hidden = !s.isolate;
  // Status (desktop + mobile) — via _setStatusText so the live-render icon survives.
  _setStatusText(byId("status"), s.status || "");
  _setStatusText(byId("statusM"), s.status || s.profile || "");
  if (byId("fileName") && s.fileName) byId("fileName").textContent = s.fileName;
  // Slice / save / export enablement.
  ["sliceButton", "mSlice"].forEach((id) => {
    if (byId(id)) byId(id).disabled = !s.sliceDirty;
  });
  ["saveToPartButton", "mSave"].forEach((id) => {
    if (byId(id)) byId(id).disabled = !s.canExport;
  });
  if (byId("exportGcodeButton")) byId("exportGcodeButton").disabled = !s.canExport;
  // Profiles dropdown.
  const ps = byId("profileSelect");
  if (ps && Array.isArray(s.profiles)) {
    if (ps.options.length !== s.profiles.length) {
      ps.innerHTML = s.profiles.map((n) => `<option>${n}</option>`).join("");
    }
    if (s.profile) ps.value = s.profile;
  }
  // Model tools active state (STL view).
  document.querySelectorAll(".model-tools [data-action]").forEach((b) => {
    const a = b.dataset.action;
    b.classList.toggle("active", (s.modelTool === "move" && a === "move") || (s.modelTool === "rotate" && a === "rotate"));
  });
  // Thermal-graph toggle.
  const tg = byId("thermalGraphToggle");
  if (tg) {
    tg.disabled = s.view !== "thermal";
    tg.classList.toggle("active", !!s.thermalGraphOpen);
  }
  // 2D thermal chart: client-side (the video is only the 3D), drawn from the server's
  // heat series. Shown only in thermal view when the graph toggle is on.
  const chartEl = byId("thermalChart");
  if (chartEl) {
    // Decide chart visibility on the CLIENT's viewport (like the local app) rather than the
    // server's: the render page's width (which drives s.thermalGraphOpen) is the iframe size
    // at connect and can be narrow/0 before layout, wrongly suppressing the auto-open.
    // Desktop auto-shows in thermal view; mobile follows the user's graph toggle.
    const clientDesktop = !window.matchMedia("(max-width: 640px)").matches;
    const haveSeries = Array.isArray(s.thermalSeries) && s.thermalSeries.length > 1;
    const showChart = s.view === "thermal" && haveSeries && (clientDesktop || s.thermalGraphOpen);
    chartEl.hidden = !showChart;
    if (showChart) drawRemoteThermal(s.thermalSeries);
  }
  applyRemoteLegend(s, isTp);
}

// Draw the heat-over-time curve on the slicer's thermal-chart canvas in remote mode.
function drawRemoteThermal(series) {
  const cv = document.getElementById("thermalChartCanvas");
  if (!cv) return;
  const ctx = cv.getContext("2d");
  const w = cv.width;
  const h = cv.height;
  ctx.clearRect(0, 0, w, h);
  let max = -Infinity;
  let min = Infinity;
  for (const v of series) {
    if (v > max) max = v;
    if (v < min) min = v;
  }
  const span = max - min || 1;
  const accent =
    getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#76b3ff";
  ctx.beginPath();
  series.forEach((v, i) => {
    const x = (i / (series.length - 1)) * w;
    const y = h - 3 - ((v - min) / span) * (h - 6);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

// Populate the legend panel from the server's legend data (items + colours + stats).
function applyRemoteLegend(s, isTp) {
  const panel = document.getElementById("legendPanel");
  const items = document.getElementById("legendItems");
  const stats = document.getElementById("legendStats");
  if (!panel) return;
  const lg = s.legend;
  if (!isTp || !lg) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  // Thermal view shows the heat colour scale instead of the kind swatches.
  const scale = document.getElementById("legendScale");
  if (scale) scale.hidden = !lg.thermal;
  if (lg.thermal) {
    // Average-heat marker, recomputed per layer server-side and mirrored here.
    const avgEl = document.getElementById("thermalAvg");
    const avgLabelEl = document.getElementById("thermalAvgLabel");
    if (avgEl && lg.avg) avgEl.style.left = lg.avg;
    if (avgLabelEl && lg.avgLabel) {
      avgLabelEl.textContent = lg.avgLabel;
      const pct = parseFloat(lg.avg) || 50;
      avgLabelEl.style.left = `${Math.min(80, Math.max(20, pct))}%`;
    }
  }
  if (items) {
    items.hidden = !!lg.thermal;
    items.innerHTML = (lg.items || [])
      .map((it) => {
        const data = it.travel ? `data-travel="${it.travel}"` : it.kind ? `data-kind="${it.kind}"` : "";
        return `<button type="button" class="legend-item${it.off ? " disabled" : ""}" ${data}><i class="swatch" style="background:${it.color}"></i><span>${it.label}</span></button>`;
      })
      .join("");
  }
  if (stats) {
    stats.innerHTML = (lg.stats || [])
      .map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`)
      .join("");
  }
}
