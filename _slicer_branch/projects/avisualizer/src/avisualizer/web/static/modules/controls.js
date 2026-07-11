function toNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function updateDualRangeVisual(minEl, maxEl) {
  if (!minEl || !maxEl || !minEl.parentElement) {
    return;
  }
  const minV = toNumber(minEl.value, 0);
  const maxV = toNumber(maxEl.value, 100);
  minEl.parentElement.style.setProperty("--start", `${Math.min(minV, maxV)}%`);
  minEl.parentElement.style.setProperty("--end", `${Math.max(minV, maxV)}%`);
}

export function bindDualRange(minEl, maxEl, onChanged) {
  if (!minEl || !maxEl) {
    return;
  }

  const onMinInput = () => {
    if (toNumber(minEl.value, 0) > toNumber(maxEl.value, 100)) {
      maxEl.value = minEl.value;
    }
    updateDualRangeVisual(minEl, maxEl);
    onChanged();
  };

  const onMaxInput = () => {
    if (toNumber(maxEl.value, 100) < toNumber(minEl.value, 0)) {
      minEl.value = maxEl.value;
    }
    updateDualRangeVisual(minEl, maxEl);
    onChanged();
  };

  minEl.addEventListener("input", onMinInput);
  maxEl.addEventListener("input", onMaxInput);
  updateDualRangeVisual(minEl, maxEl);
}
