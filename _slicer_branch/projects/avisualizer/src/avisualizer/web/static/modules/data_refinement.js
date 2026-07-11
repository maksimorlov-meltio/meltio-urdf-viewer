// In-place quickselect: returns the k-th smallest element (0-based) of `arr`,
// partially reordering it. Averages O(n) versus O(n log n) for a full sort,
// which matters for the per-load 150k-point percentile/ground-plane maths.
// `arr` must support indexed get/set (Array or TypedArray).
export function quickSelect(arr, k) {
  let lo = 0;
  let hi = arr.length - 1;
  while (lo < hi) {
    const pivot = arr[(lo + hi) >> 1];
    let i = lo;
    let j = hi;
    while (i <= j) {
      while (arr[i] < pivot) {
        i += 1;
      }
      while (arr[j] > pivot) {
        j -= 1;
      }
      if (i <= j) {
        const tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
        i += 1;
        j -= 1;
      }
    }
    if (k <= j) {
      hi = j;
    } else if (k >= i) {
      lo = i;
    } else {
      break;
    }
  }
  return arr[k];
}

export function computePercentileRange(values, low = 0.01, high = 0.99) {
  if (!values.length) {
    return { min: 0, max: 1, avg: 0.5 };
  }

  // Copy finite samples into a typed buffer in one pass. This both drops
  // non-finite values (e.g. NaN sensor readings, which would otherwise poison
  // the percentile bounds) and lets us use the fast O(n) quickselect below
  // instead of a full O(n log n) comparator sort.
  const buf = new Float64Array(values.length);
  let n = 0;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (Number.isFinite(v)) {
      buf[n] = v;
      n += 1;
    }
  }
  if (n === 0) {
    return { min: 0, max: 1, avg: 0.5 };
  }
  const finite = n === buf.length ? buf : buf.subarray(0, n);

  const lowIdx = Math.max(0, Math.min(n - 1, Math.floor((n - 1) * low)));
  const highIdx = Math.max(0, Math.min(n - 1, Math.floor((n - 1) * high)));
  const pMin = quickSelect(finite, lowIdx);
  const pMax = quickSelect(finite, highIdx);

  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    sum += Math.max(pMin, Math.min(pMax, finite[i]));
  }
  const avg = sum / n;

  if (Math.abs(pMax - pMin) < 1e-9) {
    return { min: pMin - 1, max: pMax + 1, avg };
  }
  return { min: pMin, max: pMax, avg };
}

export function getCutFractions(cutEls, toNumber) {
  const xMin = toNumber(cutEls.cutXMinEl ? cutEls.cutXMinEl.value : 0, 0);
  const xMax = toNumber(cutEls.cutXMaxEl ? cutEls.cutXMaxEl.value : 100, 100);
  const yMin = toNumber(cutEls.cutYMinEl ? cutEls.cutYMinEl.value : 0, 0);
  const yMax = toNumber(cutEls.cutYMaxEl ? cutEls.cutYMaxEl.value : 100, 100);
  const zMin = toNumber(cutEls.cutZMinEl ? cutEls.cutZMinEl.value : 0, 0);
  const zMax = toNumber(cutEls.cutZMaxEl ? cutEls.cutZMaxEl.value : 100, 100);
  const valueMin = toNumber(cutEls.cutValueMinEl ? cutEls.cutValueMinEl.value : 0, 0);
  const valueMax = toNumber(cutEls.cutValueMaxEl ? cutEls.cutValueMaxEl.value : 100, 100);
  const lineMin = toNumber(cutEls.cutLineMinEl ? cutEls.cutLineMinEl.value : 0, 0);
  const lineMax = toNumber(cutEls.cutLineMaxEl ? cutEls.cutLineMaxEl.value : 100, 100);

  return {
    xMin: Math.min(xMin, xMax) / 100,
    xMax: Math.max(xMin, xMax) / 100,
    yMin: Math.min(yMin, yMax) / 100,
    yMax: Math.max(yMin, yMax) / 100,
    zMin: Math.min(zMin, zMax) / 100,
    zMax: Math.max(zMin, zMax) / 100,
    valueMin: Math.min(valueMin, valueMax) / 100,
    valueMax: Math.max(valueMin, valueMax) / 100,
    lineMin: Math.min(lineMin, lineMax) / 100,
    lineMax: Math.max(lineMin, lineMax) / 100,
  };
}

export function buildCutThresholds(payload, cut) {
  if (!payload.points || payload.points.length === 0) {
    return null;
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  let minValue = Number.POSITIVE_INFINITY;
  let maxValue = Number.NEGATIVE_INFINITY;
  let minLine = Number.POSITIVE_INFINITY;
  let maxLine = Number.NEGATIVE_INFINITY;
  let fallbackLine = 0;

  for (const p of payload.points) {
    minX = Math.min(minX, p[0]);
    minY = Math.min(minY, p[1]);
    minZ = Math.min(minZ, p[2]);
    maxX = Math.max(maxX, p[0]);
    maxY = Math.max(maxY, p[1]);
    maxZ = Math.max(maxZ, p[2]);
    // Skip non-finite attribute values (e.g. NaN sensor samples) so a single
    // NaN does not poison the value-cut thresholds and filter out every point.
    if (Number.isFinite(p[3])) {
      minValue = Math.min(minValue, p[3]);
      maxValue = Math.max(maxValue, p[3]);
    }
    const lineValue = Number.isFinite(p[4]) ? p[4] : fallbackLine;
    minLine = Math.min(minLine, lineValue);
    maxLine = Math.max(maxLine, lineValue);
    fallbackLine += 1;
  }

  // Guard against datasets where every attribute value is non-finite: fall back
  // to a degenerate [0, 0] value range so threshold maths stay finite.
  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
    minValue = 0;
    maxValue = 0;
  }

  const spans = [
    maxX - minX,
    maxY - minY,
    maxZ - minZ,
  ];

  const minThreshold = [
    minX + spans[0] * cut.xMin,
    minY + spans[1] * cut.yMin,
    minZ + spans[2] * cut.zMin,
  ];

  const maxThreshold = [
    minX + spans[0] * cut.xMax,
    minY + spans[1] * cut.yMax,
    minZ + spans[2] * cut.zMax,
  ];

  const valueSpan = maxValue - minValue;
  const minValueThreshold = minValue + valueSpan * cut.valueMin;
  const maxValueThreshold = minValue + valueSpan * cut.valueMax;

  const lineSpan = maxLine - minLine;
  const minLineThreshold = minLine + lineSpan * cut.lineMin;
  const maxLineThreshold = minLine + lineSpan * cut.lineMax;

  return {
    minThreshold,
    maxThreshold,
    minValueThreshold,
    maxValueThreshold,
    minLineThreshold,
    maxLineThreshold,
  };
}

export function getFilteredPointsByThresholds(payload, thresholds) {
  if (!payload.points || payload.points.length === 0) {
    return [];
  }
  if (!thresholds) {
    return payload.points;
  }

  const eps = 1e-6;
  let fallbackLine = 0;
  return payload.points.filter((p) => {
    const lineValue = Number.isFinite(p[4]) ? p[4] : fallbackLine;
    fallbackLine += 1;
    return (
    p[0] >= (thresholds.minThreshold[0] - eps) && p[0] <= (thresholds.maxThreshold[0] + eps)
    && p[1] >= (thresholds.minThreshold[1] - eps) && p[1] <= (thresholds.maxThreshold[1] + eps)
    && p[2] >= (thresholds.minThreshold[2] - eps) && p[2] <= (thresholds.maxThreshold[2] + eps)
    && p[3] >= (thresholds.minValueThreshold - eps) && p[3] <= (thresholds.maxValueThreshold + eps)
    && lineValue >= (thresholds.minLineThreshold - eps) && lineValue <= (thresholds.maxLineThreshold + eps)
    );
  });
}

/**
 * Restrict a set of already cut-filtered points to only the topmost printed
 * layer. Starting from the highest Z present in the points (i.e. the highest Z
 * still rendered after the Z Cut slider has been applied), keep every point
 * whose Z lies within +/- `bandMm` of that top plane. This isolates the last
 * deposited layer, which sits within a thin Z band.
 *
 * @param {Array<Array<number>>} points - points as [x, y, z, value, line].
 * @param {{enabled?: boolean, bandMm?: number}} [options]
 * @returns {Array<Array<number>>} filtered points (or the input when disabled).
 */
export function applyLastLayerCut(points, options) {
  if (!options || !options.enabled || !Array.isArray(points) || points.length === 0) {
    return points;
  }

  const bandMm = Number.isFinite(options.bandMm) && options.bandMm > 0
    ? options.bandMm
    : 0.2;

  let topZ = Number.NEGATIVE_INFINITY;
  for (const p of points) {
    if (Number.isFinite(p[2]) && p[2] > topZ) {
      topZ = p[2];
    }
  }

  if (!Number.isFinite(topZ)) {
    return points;
  }

  const eps = 1e-6;
  const lowerZ = topZ - bandMm;
  const upperZ = topZ + bandMm;
  return points.filter((p) => p[2] >= (lowerZ - eps) && p[2] <= (upperZ + eps));
}

export function getFilteredPoints(payload, cut) {
  const isNoCut = cut.xMin === 0 && cut.xMax === 1
    && cut.yMin === 0 && cut.yMax === 1
    && cut.zMin === 0 && cut.zMax === 1
    && cut.lineMin === 0 && cut.lineMax === 1;
  const isNoValueCut = cut.valueMin === 0 && cut.valueMax === 1;
  if (isNoCut && isNoValueCut) {
    return payload.points;
  }

  return getFilteredPointsByThresholds(payload, buildCutThresholds(payload, cut));
}

function buildVoxelKey(ix, iy, iz) {
  return `${ix}|${iy}|${iz}`;
}

function buildPlaneKey(ix, iy) {
  return `${ix}|${iy}`;
}

function decodePlaneKey(key) {
  const parts = key.split("|");
  return [Number(parts[0]), Number(parts[1])];
}

function getNeighborPlaneCoords(ix, iy) {
  return [
    [ix - 1, iy],
    [ix + 1, iy],
    [ix, iy - 1],
    [ix, iy + 1],
  ];
}

function normalizeVoxelPitch(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 1e-9) {
    return fallback;
  }
  return n;
}

function positiveModulo(value, modulo) {
  const raw = value % modulo;
  return raw < 0 ? raw + modulo : raw;
}

function inferLatticeOrigin(points, voxelXY, voxelZ) {
  for (const p of points) {
    if (!Array.isArray(p) || p.length < 3) {
      continue;
    }
    const x = Number(p[0]);
    const y = Number(p[1]);
    const z = Number(p[2]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      continue;
    }

    return {
      x: positiveModulo(x, voxelXY),
      y: positiveModulo(y, voxelXY),
      z: positiveModulo(z, voxelZ),
    };
  }

  return { x: 0, y: 0, z: 0 };
}

function buildVoxelOccupancy(points, voxelXY, voxelZ) {
  const occupancy = new Map();
  const planeByZ = new Map();
  const allZLevels = new Set();
  const latticeOrigin = inferLatticeOrigin(points, voxelXY, voxelZ);

  for (const p of points) {
    if (!Array.isArray(p) || p.length < 4) {
      continue;
    }

    const x = Number(p[0]);
    const y = Number(p[1]);
    const z = Number(p[2]);
    const value = Number(p[3]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z) || !Number.isFinite(value)) {
      continue;
    }

    const ix = Math.round((x - latticeOrigin.x) / voxelXY);
    const iy = Math.round((y - latticeOrigin.y) / voxelXY);
    const iz = Math.round((z - latticeOrigin.z) / voxelZ);
    const key = buildVoxelKey(ix, iy, iz);

    const existing = occupancy.get(key);
    if (existing) {
      existing.sum += value;
      existing.count += 1;
      continue;
    }

    const sample = {
      ix,
      iy,
      iz,
      x,
      y,
      z,
      sum: value,
      count: 1,
    };
    occupancy.set(key, sample);
    allZLevels.add(iz);

    if (!planeByZ.has(iz)) {
      planeByZ.set(iz, new Set());
    }
    planeByZ.get(iz).add(buildPlaneKey(ix, iy));
  }

  return {
    occupancy,
    planeByZ,
    allZLevels,
    latticeOrigin,
  };
}

function interpolatePlaneHoleValues(componentKeys, planeCells, planeValueAt, minPlaneValue) {
  const remaining = new Set(componentKeys);
  const solved = new Map();
  const maxPasses = Math.max(4, componentKeys.length * 2);

  for (let pass = 0; pass < maxPasses && remaining.size; pass += 1) {
    let solvedInPass = 0;

    for (const key of Array.from(remaining)) {
      const [ix, iy] = decodePlaneKey(key);
      let sum = 0;
      let count = 0;

      for (const [nx, ny] of getNeighborPlaneCoords(ix, iy)) {
        const nKey = buildPlaneKey(nx, ny);
        if (!planeCells.has(nKey)) {
          continue;
        }
        const direct = planeValueAt.get(nKey);
        const inferred = solved.get(nKey);
        const v = Number.isFinite(direct) ? direct : inferred;
        if (!Number.isFinite(v)) {
          continue;
        }
        sum += v;
        count += 1;
      }

      if (count > 0) {
        solved.set(key, sum / count);
        remaining.delete(key);
        solvedInPass += 1;
      }
    }

    if (!solvedInPass) {
      break;
    }
  }

  for (const key of remaining) {
    solved.set(key, minPlaneValue);
  }

  return solved;
}

function addFilledVoxel(
  filledPoints,
  occupancy,
  planeByZ,
  latticeOrigin,
  ix,
  iy,
  iz,
  voxelXY,
  voxelZ,
  value,
) {
  const key = buildVoxelKey(ix, iy, iz);
  if (occupancy.has(key)) {
    return;
  }

  const point = [
    latticeOrigin.x + (ix * voxelXY),
    latticeOrigin.y + (iy * voxelXY),
    latticeOrigin.z + (iz * voxelZ),
    value,
    Number.NaN,
  ];
  filledPoints.push(point);

  occupancy.set(key, {
    ix,
    iy,
    iz,
    x: point[0],
    y: point[1],
    z: point[2],
    sum: value,
    count: 1,
  });

  if (!planeByZ.has(iz)) {
    planeByZ.set(iz, new Set());
  }
  planeByZ.get(iz).add(buildPlaneKey(ix, iy));
}

function fillVerticalGaps(
  filledPoints,
  occupancy,
  planeByZ,
  latticeOrigin,
  voxelXY,
  voxelZ,
  allZLevels,
) {
  let added = 0;

  const snapshots = Array.from(occupancy.values());
  for (const voxel of snapshots) {
    const ix = voxel.ix;
    const iy = voxel.iy;
    const iz = voxel.iz;
    if (!allZLevels.has(iz + 2)) {
      continue;
    }

    const lowKey = buildVoxelKey(ix, iy, iz);
    const midKey = buildVoxelKey(ix, iy, iz + 1);
    const highKey = buildVoxelKey(ix, iy, iz + 2);

    if (occupancy.has(midKey)) {
      continue;
    }

    const low = occupancy.get(lowKey);
    const high = occupancy.get(highKey);
    if (!low || !high) {
      continue;
    }

    const lowValue = low.sum / low.count;
    const highValue = high.sum / high.count;
    addFilledVoxel(
      filledPoints,
      occupancy,
      planeByZ,
      latticeOrigin,
      ix,
      iy,
      iz + 1,
      voxelXY,
      voxelZ,
      (lowValue + highValue) * 0.5,
    );
    added += 1;
  }

  return added;
}

function fillInPlaneHoles(
  filledPoints,
  occupancy,
  planeByZ,
  latticeOrigin,
  voxelXY,
  voxelZ,
  minHoleAreaMm2,
  allZLevels,
) {
  let added = 0;
  const maxHoleCells = Math.max(1, Math.floor(minHoleAreaMm2 / (voxelXY * voxelXY)));

  for (const iz of allZLevels) {
    const planeCells = planeByZ.get(iz);
    if (!planeCells || planeCells.size < 4) {
      continue;
    }

    let minIx = Number.POSITIVE_INFINITY;
    let minIy = Number.POSITIVE_INFINITY;
    let maxIx = Number.NEGATIVE_INFINITY;
    let maxIy = Number.NEGATIVE_INFINITY;
    const planeValueAt = new Map();

    for (const cellKey of planeCells) {
      const [ix, iy] = decodePlaneKey(cellKey);
      minIx = Math.min(minIx, ix);
      minIy = Math.min(minIy, iy);
      maxIx = Math.max(maxIx, ix);
      maxIy = Math.max(maxIy, iy);

      const voxel = occupancy.get(buildVoxelKey(ix, iy, iz));
      if (voxel) {
        planeValueAt.set(cellKey, voxel.sum / voxel.count);
      }
    }

    if (!Number.isFinite(minIx) || !Number.isFinite(minIy)) {
      continue;
    }

    const visited = new Set();
    const minPlaneValue = planeValueAt.size
      ? Math.min(...Array.from(planeValueAt.values()))
      : 0;

    for (let ix = minIx; ix <= maxIx; ix += 1) {
      for (let iy = minIy; iy <= maxIy; iy += 1) {
        const startKey = buildPlaneKey(ix, iy);
        if (planeCells.has(startKey) || visited.has(startKey)) {
          continue;
        }

        const queue = [startKey];
        const component = [];
        let touchesBoundary = false;
        visited.add(startKey);

        while (queue.length) {
          const key = queue.pop();
          component.push(key);
          const [cx, cy] = decodePlaneKey(key);
          if (cx === minIx || cx === maxIx || cy === minIy || cy === maxIy) {
            touchesBoundary = true;
          }

          for (const [nx, ny] of getNeighborPlaneCoords(cx, cy)) {
            if (nx < minIx || nx > maxIx || ny < minIy || ny > maxIy) {
              touchesBoundary = true;
              continue;
            }
            const nKey = buildPlaneKey(nx, ny);
            if (planeCells.has(nKey) || visited.has(nKey)) {
              continue;
            }
            visited.add(nKey);
            queue.push(nKey);
          }
        }

        if (touchesBoundary || !component.length || component.length > maxHoleCells) {
          continue;
        }

        const solvedValues = interpolatePlaneHoleValues(component, planeCells, planeValueAt, minPlaneValue);
        for (const holeKey of component) {
          const [hx, hy] = decodePlaneKey(holeKey);
          const value = solvedValues.get(holeKey);
          addFilledVoxel(
            filledPoints,
            occupancy,
            planeByZ,
            latticeOrigin,
            hx,
            hy,
            iz,
            voxelXY,
            voxelZ,
            Number.isFinite(value) ? value : minPlaneValue,
          );
          added += 1;
          planeValueAt.set(holeKey, Number.isFinite(value) ? value : minPlaneValue);
        }
      }
    }
  }

  return added;
}

export function fillVoxelizedGaps(points, options = {}) {
  if (!Array.isArray(points) || !points.length) {
    return points;
  }

  const enabled = Boolean(options.enabled);
  if (!enabled) {
    return points;
  }

  const voxelXY = normalizeVoxelPitch(options.voxelSizeMm, 1.0);
  const voxelZ = normalizeVoxelPitch(options.voxelSizeZMm, 1.0);
  const minHoleAreaMm2 = Math.max(0, Number(options.minHoleAreaMm2) || 0);
  const {
    occupancy,
    planeByZ,
    allZLevels,
    latticeOrigin,
  } = buildVoxelOccupancy(points, voxelXY, voxelZ);
  const filledPoints = points.map((p) => [...p]);

  const sortedZ = Array.from(allZLevels).sort((a, b) => a - b);
  const stableZSet = new Set(sortedZ);
  fillVerticalGaps(filledPoints, occupancy, planeByZ, latticeOrigin, voxelXY, voxelZ, stableZSet);
  fillInPlaneHoles(
    filledPoints,
    occupancy,
    planeByZ,
    latticeOrigin,
    voxelXY,
    voxelZ,
    minHoleAreaMm2,
    stableZSet,
  );

  return filledPoints;
}
