// Materials-menu highlight of the focused feedstock (Maksim, 2026-11-10).
//
// The part the operator is configuring is marked WITHOUT touching its
// materials (recolouring the part -- a dark-blue pulse, a white swap, an orange
// rim -- was tried and rejected one after another):
//
//   drum   a few horizontal rings sweep top -> bottom -> top around it, each
//          taking the drum's outline at its current height, like a scanner;
//   spool  a slim arc with a tapering, fading tail glides round the flange rim
//          over a faint track ring, like a precision progress indicator.
//
// Both are ordinary meshes parented to the SCENE (world space, moved with
// their part every frame), so they never enter a bounds measurement of the
// machine and are never picked. Green is a scene highlight here, not UI chrome.
//
// THREE is injected (not imported), like the other viewer/effects modules.
// The host says which meshes are highlighted (set) and calls update() once per
// frame; update() returns true while something is highlighted, which is also
// when it has asked for a redraw.

export function createFeedstockHighlight({ THREE, scene, requestRender }) {
  // Drums (Maksim, 2026-11-10): SCANNER RINGS. A few horizontal rings
  // surround the selected spool / drum and sweep top -> bottom -> top, like a
  // ship's scanner. Each ring takes the part's outline at its current height, so
  // it grows and shrinks with the design (drum cone, spool flanges). The lead
  // ring is the brightest; the ones trailing it fade to barely visible.
  // The rings live in the SCENE (world space, translated with their part), so
  // they never enter any bounds measurement of the machine.
  const FEEDSTOCK_SCAN_RING_COLOR = new THREE.Color(0x14c765);
  const FEEDSTOCK_SCAN_RING_OPACITIES = [1.0, 0.74, 0.54, 0.39, 0.28, 0.2, 0.14, 0.095, 0.06, 0.035]; // lead -> last
  const FEEDSTOCK_SCAN_RING_DELAY_S = 0.05;    // each ring follows the one before by this much
  const FEEDSTOCK_SCAN_SWEEP_S = 2.4;          // one way (top to bottom)
  const FEEDSTOCK_SCAN_RING_BAND_M = 0.008;    // ring band height
  const FEEDSTOCK_SCAN_RING_MARGIN_M = 0.014;  // gap between the part and the ring
  const FEEDSTOCK_SCAN_SLICES = 96;
  const FEEDSTOCK_SCAN_SMOOTH_PASSES = 6;
  const feedstockScanRingSets = new Map();     // anchor Object3D -> ring set
  const feedstockHighlightedMeshes = new Set();
  // Reference renders: freeze the animation at this wave (0..1); null = run.
  let feedstockHighlightWaveOverride = null;
  let feedstockScanRingGeometry = null;

  function getFeedstockScanRingGeometry() {
    if (!feedstockScanRingGeometry) {
      // Unit band: radius 1, height 1, open ended, axis along world Z (up).
      feedstockScanRingGeometry = new THREE.CylinderGeometry(1, 1, 1, 96, 1, true);
      feedstockScanRingGeometry.rotateX(Math.PI / 2);
    }
    return feedstockScanRingGeometry;
  }

  // The part a highlighted mesh belongs to: its nearest "link:" ancestor.
  function getFeedstockScanAnchor(meshNode) {
    let node = meshNode;
    while (node && !(typeof node.name === "string" && node.name.startsWith("link:"))) {
      node = node.parent;
    }
    return node || meshNode.parent || meshNode;
  }

  // Outline of the part per height slice, in world axes relative to the anchor's
  // world position: centre + half extents in X and Y. Slices without vertices
  // (long straight walls) are filled in from their neighbours.
  // Sweep axis per part (Maksim, 2026-11-10): spools are scanned LEFT to RIGHT
  // (world Y, across the flange as the Materials view shows it), drums top to
  // bottom (world Z). For a Y sweep the profile is built with Y and Z swapped,
  // so "height" below means "position along the sweep axis".
  function getFeedstockScanAxis(anchor) {
    return /spool_\d+_link$/i.test(anchor.name || "") ? "y" : "z";
  }

  function buildFeedstockScanProfile(anchor, meshes, axis = "z") {
    anchor.updateMatrixWorld(true);
    const origin = new THREE.Vector3().setFromMatrixPosition(anchor.matrixWorld);
    // World-space vertices (relative to the anchor) per mesh, then the height range.
    const parts = [];
    const point = new THREE.Vector3();
    let zMin = Infinity;
    let zMax = -Infinity;
    for (const meshNode of meshes) {
      const attribute = meshNode.geometry && meshNode.geometry.attributes && meshNode.geometry.attributes.position;
      if (!attribute) {
        continue;
      }
      meshNode.updateMatrixWorld(true);
      const coords = new Float32Array(attribute.count * 3);
      for (let i = 0; i < attribute.count; i += 1) {
        point.fromBufferAttribute(attribute, i).applyMatrix4(meshNode.matrixWorld).sub(origin);
        const along = axis === "y" ? point.y : point.z;
        coords[i * 3] = point.x; coords[i * 3 + 1] = axis === "y" ? point.z : point.y; coords[i * 3 + 2] = along;
        if (along < zMin) zMin = along;
        if (along > zMax) zMax = along;
      }
      parts.push({ coords, index: meshNode.geometry.index ? meshNode.geometry.index.array : null, count: attribute.count });
    }
    if (!parts.length || !(zMax - zMin > 1e-4)) {
      return null;
    }
    const count = FEEDSTOCK_SCAN_SLICES;
    const span = zMax - zMin;
    const minX = new Float32Array(count).fill(Infinity);
    const maxX = new Float32Array(count).fill(-Infinity);
    const minY = new Float32Array(count).fill(Infinity);
    const maxY = new Float32Array(count).fill(-Infinity);
    const put = (slice, x, y) => {
      if (x < minX[slice]) minX[slice] = x;
      if (x > maxX[slice]) maxX[slice] = x;
      if (y < minY[slice]) minY[slice] = y;
      if (y > maxY[slice]) maxY[slice] = y;
    };
    // Slice i sits at height zMin + i * step. Every triangle EDGE is cut at each
    // slice height it crosses, so a long straight wall (two vertices only)
    // contributes its true outline to every slice in between.
    const step = span / (count - 1);
    const addEdge = (coords, a, b) => {
      const ax = coords[a * 3]; const ay = coords[a * 3 + 1]; const az = coords[a * 3 + 2];
      const bx = coords[b * 3]; const by = coords[b * 3 + 1]; const bz = coords[b * 3 + 2];
      const lo = Math.max(0, Math.ceil((Math.min(az, bz) - zMin) / step - 1e-6));
      const hi = Math.min(count - 1, Math.floor((Math.max(az, bz) - zMin) / step + 1e-6));
      const dz = bz - az;
      for (let slice = lo; slice <= hi; slice += 1) {
        const t = Math.abs(dz) < 1e-9 ? 0 : THREE.MathUtils.clamp((zMin + slice * step - az) / dz, 0, 1);
        put(slice, ax + (bx - ax) * t, ay + (by - ay) * t);
      }
      // Also drop each end point into its nearest slice (flat caps, tiny edges).
      put(Math.min(count - 1, Math.max(0, Math.round((az - zMin) / step))), ax, ay);
      put(Math.min(count - 1, Math.max(0, Math.round((bz - zMin) / step))), bx, by);
    };
    for (const part of parts) {
      const triangles = part.index ? part.index.length / 3 : part.count / 3;
      for (let tri = 0; tri < triangles; tri += 1) {
        const a = part.index ? part.index[tri * 3] : tri * 3;
        const b = part.index ? part.index[tri * 3 + 1] : tri * 3 + 1;
        const c = part.index ? part.index[tri * 3 + 2] : tri * 3 + 2;
        addEdge(part.coords, a, b);
        addEdge(part.coords, b, c);
        addEdge(part.coords, c, a);
      }
    }
    // Ring radii per slice (corner scale folded in), gaps filled from neighbours.
    const rx = new Float32Array(count); const ry = new Float32Array(count);
    const cx = new Float32Array(count); const cy = new Float32Array(count);
    let lastFilled = -1;
    for (let i = 0; i < count; i += 1) {
      if (!(maxX[i] >= minX[i])) {
        continue;
      }
      const hx = Math.max((maxX[i] - minX[i]) * 0.5, 0.004);
      const hy = Math.max((maxY[i] - minY[i]) * 0.5, 0.004);
      // Round outlines get a true circle at their radius; a flat outline (a
      // spool seen in section) gets the ellipse through its corners.
      const roundness = Math.min(hx, hy) / Math.max(hx, hy);
      const cornerScale = THREE.MathUtils.lerp(Math.SQRT2, 1, THREE.MathUtils.smoothstep(roundness, 0.55, 0.95));
      rx[i] = hx * cornerScale; ry[i] = hy * cornerScale;
      cx[i] = (minX[i] + maxX[i]) * 0.5; cy[i] = (minY[i] + maxY[i]) * 0.5;
      if (lastFilled >= 0 && i - lastFilled > 1) {
        for (let k = lastFilled + 1; k < i; k += 1) {
          const t = (k - lastFilled) / (i - lastFilled);
          rx[k] = rx[lastFilled] + (rx[i] - rx[lastFilled]) * t; ry[k] = ry[lastFilled] + (ry[i] - ry[lastFilled]) * t;
          cx[k] = cx[lastFilled] + (cx[i] - cx[lastFilled]) * t; cy[k] = cy[lastFilled] + (cy[i] - cy[lastFilled]) * t;
        }
      } else if (lastFilled < 0) {
        for (let k = 0; k < i; k += 1) { rx[k] = rx[i]; ry[k] = ry[i]; cx[k] = cx[i]; cy[k] = cy[i]; }
      }
      lastFilled = i;
    }
    if (lastFilled < 0) {
      return null;
    }
    for (let k = lastFilled + 1; k < count; k += 1) { rx[k] = rx[lastFilled]; ry[k] = ry[lastFilled]; cx[k] = cx[lastFilled]; cy[k] = cy[lastFilled]; }
    // Smooth: the ring must change size fluidly, never jump (Maksim, 2026-11-10).
    const smooth = (values) => {
      for (let pass = 0; pass < FEEDSTOCK_SCAN_SMOOTH_PASSES; pass += 1) {
        const copy = Float32Array.from(values);
        for (let i = 0; i < count; i += 1) {
          const before = copy[Math.max(0, i - 1)];
          const after = copy[Math.min(count - 1, i + 1)];
          values[i] = (before + 2 * copy[i] + after) * 0.25;
        }
      }
    };
    // Widen first (max over +-3 slices) so the smoothed ring never cuts into a lip.
    const dilate = (values) => {
      const copy = Float32Array.from(values);
      for (let i = 0; i < count; i += 1) {
        let best = copy[i];
        for (let k = Math.max(0, i - 3); k <= Math.min(count - 1, i + 3); k += 1) {
          if (copy[k] > best) best = copy[k];
        }
        values[i] = best;
      }
    };
    dilate(rx); dilate(ry);
    smooth(rx); smooth(ry); smooth(cx); smooth(cy);
    const profile = [];
    for (let i = 0; i < count; i += 1) {
      profile.push({ cx: cx[i], cy: cy[i], hx: rx[i], hy: ry[i] });
    }
    return { profile, zMin, zMax, origin };
  }

  // Spool highlight (Maksim's sketch, refined 2026-11-10 "more professional"):
  // a slim arc with a smooth, tapering, fading tail glides around the rim over a
  // faint full track ring -- the look of a precision progress indicator. Styles:
  // A one arc + track (default), B two opposed arcs + track, C one long arc.
  const FEEDSTOCK_SPIN_TURN_S = 3.2;                 // one full turn, constant speed
  const FEEDSTOCK_SPIN_MARGIN_M = 0.018;             // gap between the flange rim and the arc
  const FEEDSTOCK_SPIN_STYLES = {
    A: { arcs: 1, arcDeg: 150, tube: 0.0065, track: 0.2 },
    B: { arcs: 2, arcDeg: 95, tube: 0.006, track: 0.2 },
    C: { arcs: 1, arcDeg: 240, tube: 0.005, track: 0 },
  };
  let FEEDSTOCK_SPIN_STYLE = "A";
  // Torus arc whose tube thins and fades toward its tail (vertex alpha).
  function makeFeedstockSpinArcGeometry(radius, tube, arcRad) {
    const geometry = new THREE.TorusGeometry(radius, tube, 10, 96, arcRad);
    const position = geometry.attributes.position;
    const colors = new Float32Array(position.count * 4);
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const y = position.getY(i);
      let angle = Math.atan2(y, x);
      if (angle < -1e-4) {
        angle += Math.PI * 2;
      }
      const u = THREE.MathUtils.clamp(angle / arcRad, 0, 1); // 0 tail .. 1 head
      const thickness = 0.22 + 0.78 * u;
      const cx = Math.cos(angle) * radius;
      const cy = Math.sin(angle) * radius;
      position.setXYZ(i, cx + (x - cx) * thickness, cy + (y - cy) * thickness, position.getZ(i) * thickness);
      colors[i * 4] = 1; colors[i * 4 + 1] = 1; colors[i * 4 + 2] = 1;
      colors[i * 4 + 3] = Math.pow(u, 1.8);
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 4));
    geometry.rotateY(Math.PI / 2); // into the spool's plane, axis = world X
    return geometry;
  }
  function createFeedstockSpinSet(anchor, meshes) {
    anchor.updateMatrixWorld(true);
    const origin = new THREE.Vector3().setFromMatrixPosition(anchor.matrixWorld);
    const bounds = new THREE.Box3();
    for (const meshNode of meshes) {
      if (!meshNode.geometry) {
        continue;
      }
      if (!meshNode.geometry.boundingBox) {
        meshNode.geometry.computeBoundingBox();
      }
      meshNode.updateMatrixWorld(true);
      bounds.union(meshNode.geometry.boundingBox.clone().applyMatrix4(meshNode.matrixWorld));
    }
    if (bounds.isEmpty()) {
      return null;
    }
    const style = FEEDSTOCK_SPIN_STYLES[FEEDSTOCK_SPIN_STYLE] || FEEDSTOCK_SPIN_STYLES.A;
    const size = bounds.getSize(new THREE.Vector3());
    const centre = bounds.getCenter(new THREE.Vector3()).sub(origin);
    const radius = Math.max(size.y, size.z) * 0.5 + FEEDSTOCK_SPIN_MARGIN_M;
    // Sit on the OUTER face (compartment side, -X) so the flange never hides the arc.
    centre.x = bounds.min.x - origin.x - style.tube;
    const group = new THREE.Group();
    group.name = "feedstock-scan-rings";
    const spinner = new THREE.Group();
    group.add(spinner);
    const rings = [];
    const addMesh = (geometry, opacityScale, vertexAlpha, parent) => {
      const material = new THREE.MeshBasicMaterial({
        name: "Feedstock Spin Arc",
        color: FEEDSTOCK_SCAN_RING_COLOR.clone(),
        transparent: true,
        opacity: opacityScale,
        vertexColors: vertexAlpha,
        depthWrite: false,
        toneMapped: false,
        fog: false,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.renderOrder = 21;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.raycast = () => {};
      mesh.userData.isFeedstockHalo = true;
      mesh.userData.opacityScale = opacityScale;
      mesh.userData.ownGeometry = true;
      parent.add(mesh);
      rings.push(mesh);
      return mesh;
    };
    const arcRad = THREE.MathUtils.degToRad(style.arcDeg);
    for (let i = 0; i < style.arcs; i += 1) {
      const arc = addMesh(makeFeedstockSpinArcGeometry(radius, style.tube, arcRad), 1, true, spinner);
      // Head at angle 0 of the spinner; further arcs evenly spaced round the rim.
      arc.rotation.x = -arcRad + (i * Math.PI * 2) / style.arcs;
    }
    if (style.track > 0) {
      const track = new THREE.TorusGeometry(radius, style.tube * 0.3, 8, 120);
      track.rotateY(Math.PI / 2);
      addMesh(track, style.track, false, group);
    }
    scene.add(group);
    return { kind: "spin", anchor, meshes, group, spinner, rings, centre, signature: meshes.length };
  }

  function createFeedstockScanRingSet(anchor, meshes) {
    const axis = getFeedstockScanAxis(anchor);
    if (axis === "y") {
      return createFeedstockSpinSet(anchor, meshes);
    }
    const data = buildFeedstockScanProfile(anchor, meshes, axis);
    if (!data) {
      return null;
    }
    const group = new THREE.Group();
    group.name = "feedstock-scan-rings";
    const rings = FEEDSTOCK_SCAN_RING_OPACITIES.map((opacityScale, index) => {
      const material = new THREE.MeshBasicMaterial({
        name: "Feedstock Scan Ring",
        color: FEEDSTOCK_SCAN_RING_COLOR.clone(),
        transparent: true,
        opacity: opacityScale,
        side: THREE.DoubleSide,
        depthWrite: false,
        toneMapped: false,
        fog: false,
        blending: THREE.NormalBlending, // additive washed out to white on the pale drum body
      });
      const ring = new THREE.Mesh(getFeedstockScanRingGeometry(), material);
      ring.renderOrder = 21;
      ring.castShadow = false;
      ring.receiveShadow = false;
      ring.raycast = () => {};
      ring.userData.isFeedstockHalo = true;
      ring.userData.opacityScale = opacityScale;
      ring.userData.index = index;
      if (axis === "y") {
        ring.rotation.x = Math.PI / 2; // band axis along world Y; local Y -> world Z
      }
      group.add(ring);
      return ring;
    });
    scene.add(group);
    return { anchor, meshes, group, rings, axis, ...data, signature: meshes.length };
  }

  function disposeFeedstockScanRingSet(set) {
    scene.remove(set.group);
    for (const ring of set.rings) {
      ring.material.dispose();
      if (ring.userData.ownGeometry) {
        ring.geometry.dispose();
      }
    }
  }

  function clearFeedstockScanRings() {
    for (const set of feedstockScanRingSets.values()) {
      disposeFeedstockScanRingSet(set);
    }
    feedstockScanRingSets.clear();
  }

  function isObjectShownInScene(object) {
    for (let node = object; node; node = node.parent) {
      if (node.visible === false) {
        return false;
      }
      if (node === scene) {
        return true;
      }
    }
    return false; // detached from the scene
  }

  const feedstockScanAnchorPosition = new THREE.Vector3();
  function updateFeedstockScanRings(nowMs) {
    // Group the highlighted meshes by part.
    const meshesByAnchor = new Map();
    for (const meshNode of feedstockHighlightedMeshes) {
      const anchor = getFeedstockScanAnchor(meshNode);
      if (!meshesByAnchor.has(anchor)) {
        meshesByAnchor.set(anchor, []);
      }
      meshesByAnchor.get(anchor).push(meshNode);
    }
    for (const [anchor, set] of feedstockScanRingSets) {
      const meshes = meshesByAnchor.get(anchor);
      if (!meshes || meshes.length !== set.signature) {
        disposeFeedstockScanRingSet(set);
        feedstockScanRingSets.delete(anchor);
      }
    }
    for (const [anchor, meshes] of meshesByAnchor) {
      if (!feedstockScanRingSets.has(anchor)) {
        const set = createFeedstockScanRingSet(anchor, meshes);
        if (set) {
          feedstockScanRingSets.set(anchor, set);
        }
      }
    }
    // Sweep: 0 = top, 1 = bottom, cosine eased so the turn-arounds are soft.
    // A frozen wave (reference renders) pins the lead ring at that fraction.
    const cycle = FEEDSTOCK_SCAN_SWEEP_S * 2;
    const frozen = feedstockHighlightWaveOverride;
    const baseTime = (frozen === null || frozen === undefined)
      ? nowMs / 1000
      : frozen * FEEDSTOCK_SCAN_SWEEP_S;
    for (const set of feedstockScanRingSets.values()) {
      const shown = isObjectShownInScene(set.anchor) && set.meshes.some((meshNode) => meshNode.visible);
      set.group.visible = shown;
      if (!shown) {
        continue;
      }
      set.anchor.getWorldPosition(feedstockScanAnchorPosition);
      const base = Array.isArray(set.meshes[0].material) ? set.meshes[0].material[0] : set.meshes[0].material;
      const partOpacity = base && base.transparent ? base.opacity : 1;
      if (set.kind === "spin") {
        set.group.position.copy(feedstockScanAnchorPosition).add(set.centre);
        // Positive rotation about +X reads clockwise from the compartment side.
        const turn = (frozen === null || frozen === undefined)
          ? ((nowMs / 1000) % FEEDSTOCK_SPIN_TURN_S) / FEEDSTOCK_SPIN_TURN_S
          : frozen;
        set.spinner.rotation.x = turn * Math.PI * 2;
        for (const arc of set.rings) {
          arc.material.opacity = arc.userData.opacityScale * partOpacity;
        }
        continue;
      }
      const span = set.zMax - set.zMin;
      for (const ring of set.rings) {
        const time = baseTime - ring.userData.index * FEEDSTOCK_SCAN_RING_DELAY_S;
        const phase = ((time % cycle) + cycle) % cycle / cycle;      // 0..1 over a full there-and-back
        const down = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);        // 0 top .. 1 bottom .. 0 top
        const z = set.zMax - down * span;
        const slicePos = THREE.MathUtils.clamp(((z - set.zMin) / span) * (set.profile.length - 1), 0, set.profile.length - 1);
        const lower = Math.floor(slicePos);
        const upper = Math.min(set.profile.length - 1, lower + 1);
        const t = slicePos - lower;
        const a = set.profile[lower];
        const b = set.profile[upper];
        const hx = a.hx + (b.hx - a.hx) * t;
        const hy = a.hy + (b.hy - a.hy) * t;
        const centreU = a.cx + (b.cx - a.cx) * t;
        const centreV = a.cy + (b.cy - a.cy) * t;
        if (set.axis === "y") {
          ring.position.set(
            feedstockScanAnchorPosition.x + centreU,
            feedstockScanAnchorPosition.y + z,
            feedstockScanAnchorPosition.z + centreV,
          );
        } else {
          ring.position.set(
            feedstockScanAnchorPosition.x + centreU,
            feedstockScanAnchorPosition.y + centreV,
            feedstockScanAnchorPosition.z + z,
          );
        }
        ring.scale.set(
          hx + FEEDSTOCK_SCAN_RING_MARGIN_M,
          hy + FEEDSTOCK_SCAN_RING_MARGIN_M,
          FEEDSTOCK_SCAN_RING_BAND_M,
        );
        ring.material.opacity = ring.userData.opacityScale * partOpacity;
      }
    }
  }

  // ---- public API -------------------------------------------------------------

  // Mark one mesh of a part as highlighted (or not). All highlighted meshes
  // under the same "link:" ancestor share one ring set / one arc.
  function set(meshNode, on) {
    if (on) {
      feedstockHighlightedMeshes.add(meshNode);
    } else {
      feedstockHighlightedMeshes.delete(meshNode);
    }
  }

  // Per frame. Builds / disposes the ring sets to match what is highlighted and
  // advances the animation.
  function update(nowMs) {
    if (feedstockHighlightedMeshes.size === 0) {
      if (feedstockScanRingSets.size) {
        clearFeedstockScanRings();
        requestRender();
      }
      return false;
    }
    updateFeedstockScanRings(nowMs);
    requestRender();
    return true;
  }

  // Forget everything (the robot was unloaded).
  function clear() {
    feedstockHighlightedMeshes.clear();
    clearFeedstockScanRings();
  }

  // Reference sheets / QA: colour, spool arc style ("A" | "B" | "C"), and a
  // frozen wave (0..1; null runs the animation again).
  function tune({ color, spinStyle, wave } = {}) {
    if (color !== undefined) {
      FEEDSTOCK_SCAN_RING_COLOR.set(color);
    }
    if (spinStyle !== undefined && FEEDSTOCK_SPIN_STYLES[spinStyle]) {
      FEEDSTOCK_SPIN_STYLE = spinStyle;
    }
    if (color !== undefined || spinStyle !== undefined) {
      clearFeedstockScanRings(); // rebuilt on the next update with the new look
    }
    feedstockHighlightWaveOverride = (wave === undefined || wave === null) ? null : wave;
    requestRender();
  }

  return {
    set,
    update,
    clear,
    tune,
    isActive: () => feedstockHighlightedMeshes.size > 0,
    // For tests and reference renders: the live ring sets, keyed by part.
    getSets: () => feedstockScanRingSets,
  };
}
