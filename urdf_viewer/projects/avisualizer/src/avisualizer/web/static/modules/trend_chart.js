import { computePercentileRange } from "./data_refinement.js";

export function drawTrendChart(options) {
  const {
    trendCanvasEl,
    seriesPayload,
    visiblePointIndices,
    getPercentileSettings,
    currentAttribute,
  } = options;

  if (!trendCanvasEl) {
    return;
  }

  const width = Math.max(1, trendCanvasEl.clientWidth);
  const height = Math.max(1, trendCanvasEl.clientHeight);
  const ratio = Math.min(window.devicePixelRatio || 1, 2);

  trendCanvasEl.width = Math.floor(width * ratio);
  trendCanvasEl.height = Math.floor(height * ratio);

  const ctx = trendCanvasEl.getContext("2d");
  if (!ctx) {
    return;
  }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

  ctx.clearRect(0, 0, width, height);

  if (!seriesPayload || !seriesPayload.sampledValues || seriesPayload.sampledValues.length < 2) {
    ctx.fillStyle = "rgba(190, 206, 220, 0.85)";
    ctx.font = "12px Segoe UI";
    ctx.fillText("No series data", 12, height / 2);
    return;
  }

  const values = seriesPayload.sampledValues;
  const sampledIndices = Array.isArray(seriesPayload.sampledIndices)
    ? seriesPayload.sampledIndices
    : [];
  const percentile = getPercentileSettings();
  const pr = computePercentileRange(values, percentile.low, percentile.high);
  const yMin = pr.min;
  const yMax = pr.max;
  const avg = pr.avg;

  const padX = 10;
  const headerSpace = 20;
  const bottomPad = 8;
  const labelZone = 44;
  const plotW = Math.max(1, width - padX * 2 - labelZone);
  const plotH = Math.max(1, height - headerSpace - bottomPad);

  const mapY = (v) => {
    const t = (v - yMin) / (yMax - yMin);
    return headerSpace + (1 - t) * plotH;
  };

  const guide20 = yMin + (yMax - yMin) * 0.2;
  const guide80 = yMin + (yMax - yMin) * 0.8;
  const guides = [0, guide20, guide80];

  guides.forEach((v) => {
    const y = mapY(v);
    ctx.beginPath();
    ctx.moveTo(padX, y);
    ctx.lineTo(padX + plotW, y);
    ctx.strokeStyle = "rgba(122, 160, 194, 0.28)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = "rgba(190, 206, 220, 0.9)";
    ctx.font = "11px Segoe UI";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(`${Math.round(v)}`, padX + plotW + 10, y);
  });

  const hasSeriesIndices = sampledIndices.length === values.length;
  const hasVisibilitySet = visiblePointIndices instanceof Set;
  const lineColorActive = "#8fd1ff";
  const lineColorInactive = "rgba(143, 209, 255, 0.28)";

  for (let i = 1; i < values.length; i += 1) {
    const x0 = padX + ((i - 1) / (values.length - 1)) * plotW;
    const x1 = padX + (i / (values.length - 1)) * plotW;
    const y0 = mapY(Math.max(yMin, Math.min(yMax, values[i - 1])));
    const y1 = mapY(Math.max(yMin, Math.min(yMax, values[i])));

    let isActive = true;
    if (hasSeriesIndices && hasVisibilitySet) {
      const prevIdx = sampledIndices[i - 1];
      const nextIdx = sampledIndices[i];
      isActive = visiblePointIndices.has(prevIdx) && visiblePointIndices.has(nextIdx);
    }

    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.strokeStyle = isActive ? lineColorActive : lineColorInactive;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  ctx.fillStyle = "#e7f5ff";
  ctx.font = "13px Segoe UI";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const rawAttribute = (seriesPayload.attribute || currentAttribute || "loadCell");
  const attributeName = rawAttribute
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
  ctx.fillText(`${attributeName} Avg: ${Math.round(avg)}`, padX, 1);
}
