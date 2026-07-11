// Cache of sorted values keyed by the source points array. The percentile
// slider triggers many redraws against the same points, so caching the sort
// keeps dragging responsive on large datasets.
const sortedValuesCache = new WeakMap();

function getSortedValues(points, valueIndex) {
  if (!Array.isArray(points) || points.length < 2) {
    return null;
  }
  const cached = sortedValuesCache.get(points);
  if (cached) {
    return cached;
  }
  const sorted = new Float64Array(points.length);
  for (let i = 0; i < points.length; i += 1) {
    sorted[i] = points[i][valueIndex];
  }
  sorted.sort();
  sortedValuesCache.set(points, sorted);
  return sorted;
}

export function drawDistributionChart(options) {
  const {
    canvasEl,
    points,
    valueIndex = 3,
    percentile,
    attributeName,
  } = options;

  if (!canvasEl) {
    return;
  }

  const width = Math.max(1, canvasEl.clientWidth);
  const height = Math.max(1, canvasEl.clientHeight);
  const ratio = Math.min(window.devicePixelRatio || 1, 2);

  canvasEl.width = Math.floor(width * ratio);
  canvasEl.height = Math.floor(height * ratio);

  const ctx = canvasEl.getContext("2d");
  if (!ctx) {
    return;
  }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const sorted = getSortedValues(points, valueIndex);
  if (!sorted) {
    ctx.fillStyle = "rgba(190, 206, 220, 0.85)";
    ctx.font = "11px Segoe UI";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("No distribution data", 8, height / 2);
    return;
  }

  // All quantiles are read from the cached sorted array (no per-redraw sort).
  const sortedLen = sorted.length;
  const pick = (p) => {
    const idx = Math.floor((sortedLen - 1) * p);
    return sorted[Math.max(0, Math.min(sortedLen - 1, idx))];
  };

  const dataMin = sorted[0];
  const dataMax = sorted[sortedLen - 1];

  // Percentile thresholds for the selected (highlighted) band.
  const pMinVal = pick(percentile.low);
  const pMaxVal = pick(percentile.high);

  // Bin over a STABLE reference domain that does not depend on the percentile
  // slider, so bin heights (and the vertical axis) stay fixed. Moving the
  // slider then only changes the horizontal display window (a pure zoom).
  const refMin = pick(0.001);
  const refMaxRaw = pick(0.999);
  const refMax = refMaxRaw > refMin ? refMaxRaw : refMin + 1;
  const refSpan = refMax - refMin;

  const binCount = 240;
  const bins = new Array(binCount).fill(0);
  for (let i = 0; i < sortedLen; i += 1) {
    const v = sorted[i];
    if (v < refMin || v > refMax) {
      continue;
    }
    let idx = Math.floor(((v - refMin) / refSpan) * binCount);
    if (idx < 0) idx = 0;
    if (idx >= binCount) idx = binCount - 1;
    bins[idx] += 1;
  }
  let maxBin = 0;
  for (const b of bins) {
    if (b > maxBin) maxBin = b;
  }
  if (maxBin <= 0) maxBin = 1;

  // Horizontal display window: the selected band plus a small margin so the
  // relevant curve fills the chart instead of being squashed by outlier tails.
  const bandSpan = Math.max(pMaxVal - pMinVal, 1e-9);
  const margin = bandSpan * 0.2;
  let vMin = Math.max(dataMin, pMinVal - margin);
  let vMax = Math.min(dataMax, pMaxVal + margin);
  if (!(vMax > vMin)) {
    vMax = vMin + 1;
  }
  const span = vMax - vMin;

  const padX = 8;
  const padTop = 16;
  const padBottom = 6;
  const plotW = Math.max(1, width - padX * 2);
  const plotH = Math.max(1, height - padTop - padBottom);
  const baseY = padTop + plotH;

  const clampX = (x) => Math.max(padX, Math.min(padX + plotW, x));
  const xAtValue = (v) => clampX(padX + ((v - vMin) / span) * plotW);
  const valueAtBin = (i) => refMin + ((i + 0.5) / binCount) * refSpan;
  const yAtCount = (c) => padTop + (1 - c / maxBin) * plotH;

  // Only render bins whose value falls inside the display window, so the curve
  // is a clean horizontal slice of the stable-height histogram.
  const curve = [];
  for (let i = 0; i < binCount; i += 1) {
    const v = valueAtBin(i);
    if (v < vMin || v > vMax) {
      continue;
    }
    curve.push({ x: xAtValue(v), y: yAtCount(bins[i]), v });
  }
  if (curve.length === 0) {
    ctx.fillStyle = "#e7f5ff";
    ctx.font = "12px Segoe UI";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(attributeName ? `${attributeName} Distribution` : "Distribution", padX, 1);
    return;
  }

  const softFill = "rgba(143, 209, 255, 0.14)";
  const softLine = "rgba(143, 209, 255, 0.3)";
  const brightFill = "rgba(143, 209, 255, 0.4)";
  const brightLine = "#8fd1ff";

  const traceArea = () => {
    ctx.beginPath();
    ctx.moveTo(curve[0].x, baseY);
    for (const pt of curve) {
      ctx.lineTo(pt.x, pt.y);
    }
    ctx.lineTo(curve[curve.length - 1].x, baseY);
    ctx.closePath();
  };

  // Full (clipped) distribution shown softly.
  traceArea();
  ctx.fillStyle = softFill;
  ctx.fill();

  // Highlighted (shown) percentile band drawn brighter on top.
  const clipXMin = xAtValue(Math.max(vMin, pMinVal));
  const clipXMax = xAtValue(Math.min(vMax, pMaxVal));
  ctx.save();
  ctx.beginPath();
  ctx.rect(clipXMin, padTop, Math.max(0, clipXMax - clipXMin), plotH);
  ctx.clip();
  traceArea();
  ctx.fillStyle = brightFill;
  ctx.fill();
  ctx.restore();

  // Curve outline, segment-colored by inclusion in the percentile band.
  for (let i = 1; i < curve.length; i += 1) {
    const a = curve[i - 1];
    const b = curve[i];
    const isActive = b.v >= pMinVal && a.v <= pMaxVal;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = isActive ? brightLine : softLine;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Percentile boundary markers.
  [clipXMin, clipXMax].forEach((mx) => {
    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(mx, padTop);
    ctx.lineTo(mx, baseY);
    ctx.strokeStyle = "rgba(231, 245, 255, 0.45)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  });

  ctx.fillStyle = "#e7f5ff";
  ctx.font = "12px Segoe UI";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const title = attributeName ? `${attributeName} Distribution` : "Distribution";
  ctx.fillText(title, padX, 1);
}
