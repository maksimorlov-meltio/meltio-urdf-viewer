// Print dialogs: the stop confirmation, the pause notice, and the two
// end-of-job summaries (completed / stopped mid-way) with the arithmetic that
// fills them. Extracted verbatim from urdf_viewer.js (step-5 phase B3g).
//
// DOM + pure arithmetic, no THREE. What actually DOES the stopping — tearing
// the simulation down, moving the gantry, committing the material draw to the
// feedstock ledger — stays host-side in confirmStopPrint / confirmPrintComplete
// / resetGantryToPrintPosition. This module only decides what the operator is
// told.
//
// The summaries are the reason it is worth extracting: buildPrintStopSummary
// works out how much wire actually came off the spool for a part that was
// abandoned at 37%, and buildPrintCompleteSummary turns that into "how many
// more prints fit on what is left". That is material accounting the operator
// acts on, and none of it could be reached from a test.

import {
  DEFAULT_PRINT_JOB_USAGE_GRAMS,
  formatGramsText,
  getSpoolDisplayLabel,
  lastPrintUsedGramsBySpool,
  normalizeSpoolKey,
  selectedPrintJobActualGrams,
  selectedPrintJobEstimatedGrams,
  spoolRemainingAmountGramsByKey,
} from "./state/materialsState.js";
import { printSim } from "./state/printFlowState.js";

// Representative DED over-deposition (bead over-run beyond the planned
// nominal), used for the stop summary when the job carries no recorded
// actual-vs-estimate figure. The whole print flow here is a synthetic
// simulation.
export const PRINT_OVERDEPOSITION_SIM_PCT = 4.2;

/** Elapsed print time, as the operator reads it. `—` for anything not a
 *  positive number, because "0s" would read as a real measurement. */
export function formatPrintDuration(seconds) {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s <= 0) {
    return "—";
  }
  // Round to whole seconds FIRST, then split. The original split first and
  // rounded the remainder, so 119.6s rendered as "1m 60s" — floor(119.6/60) is
  // 1 and round(59.6) is 60. Any duration whose seconds round up to 60 hit it.
  // This is a behaviour fix, not part of the verbatim move.
  const total = Math.round(s);
  const totalMin = Math.floor(total / 60);
  const sec = total % 60;
  if (totalMin >= 60) {
    return `${Math.floor(totalMin / 60)}h ${totalMin % 60}m`;
  }
  return totalMin > 0 ? `${totalMin}m ${sec}s` : `${sec}s`;
}

/** What to put in front of a plant operator when a machine command is refused.
 *
 *  Residue of N-C4. `stopPrint` requires an operator, and that is correct — it
 *  is a RECOVERABLE process halt, not an emergency stop, so knowing who
 *  ordered it matters (emergency stop is a hardware function; see
 *  ARCHITECTURE.md §1.1). What was wrong is what the refusal looked like: a
 *  signed-out operator pressing Stop got
 *  `Stop command failed: command HTTP 401`.
 *
 *  Deliberately a MESSAGE and not a permission gate on the button. Hiding or
 *  disabling Stop hides it exactly when someone is looking for it, and a
 *  control that is present and explains itself beats one that vanishes.
 *
 *  Only 401 is translated. Every other failure keeps its own text, because the
 *  operator's next move differs and a generic "something went wrong" would cost
 *  them the difference. */
export function describeCommandFailure(error, action = "control the machine") {
  if (error && error.status === 401) {
    return `Sign in to ${action}.`;
  }
  const detail = error && error.message ? error.message : "unknown error";
  return `Could not ${action}: ${detail}`;
}

/** Snapshot of what was laid down when a print is stopped part-way.
 *
 *  Pure, and exported on its own: this is what gets charged to the spool, so it
 *  is worth being able to check without a DOM. */
export function buildPrintStopSummary(progress) {
  const fraction = Math.max(0, Math.min(1, Number(progress) || 0));
  const estimatedTotal = Number(selectedPrintJobEstimatedGrams);
  const estTotal =
    Number.isFinite(estimatedTotal) && estimatedTotal > 0
      ? estimatedTotal
      : DEFAULT_PRINT_JOB_USAGE_GRAMS;
  // Planned (nominal) material for just the printed fraction.
  const nominalGrams = estTotal * fraction;
  // Over-deposition: excess laid down beyond nominal. Prefer the job's recorded
  // actual-vs-estimate delta; otherwise fall back to the representative figure.
  const actualTotal = Number(selectedPrintJobActualGrams);
  const overPct =
    Number.isFinite(actualTotal) && actualTotal > estTotal
      ? (actualTotal / estTotal - 1) * 100
      : PRINT_OVERDEPOSITION_SIM_PCT;
  const overGrams = nominalGrams * (overPct / 100);
  return {
    percentPrinted: Math.round(fraction * 100),
    materialUsedGrams: nominalGrams + overGrams, // actual off-spool draw
    overGrams,
    overPct,
  };
}

export function createPrintDialogsUi({
  // Shared with the topbar clock so there is one Intl.DateTimeFormat, not two:
  // formatFinishClock runs on the print-stats path at frame rate and building a
  // formatter per call measured ~18x the cost of reusing one.
  //
  // A getter, not the formatter itself, so the host can create this UI at the
  // top of its module body without caring where CLOCK_TIME_FORMAT is declared.
  // Passing values instead of thunks is how a boot-order bug gets written.
  getClockTimeFormat,
  getFocusedSpoolKey,
  renderChamberAtmosphere,
}) {
  const stopConfirmModalEl = document.getElementById("printStopConfirmModal");
  const pauseNoticeEl = document.getElementById("printPauseNotice");
  const completeModalEl = document.getElementById("printCompleteModal");
  const completeMaterialEl = document.getElementById("printCompleteMaterial");
  const completeSpoolEl = document.getElementById("printCompleteSpool");
  const completeTimeEl = document.getElementById("printCompleteTime");
  const completeLayersEl = document.getElementById("printCompleteLayers");
  const completeThermalEl = document.getElementById("printCompleteThermal");
  const stopSummaryModalEl = document.getElementById("printStopSummaryModal");
  const stopSummaryPrintedEl = document.getElementById("printStopSummaryPrinted");
  const stopSummaryMaterialEl = document.getElementById("printStopSummaryMaterial");
  const stopSummaryOverprintEl = document.getElementById("printStopSummaryOverprint");

  function setModalOpen(modalEl, open) {
    if (!modalEl) {
      return;
    }
    modalEl.hidden = !open;
    modalEl.setAttribute("aria-hidden", open ? "false" : "true");
  }

  // Absolute wall-clock finish estimate for a running print — complements the
  // relative ETA with "when will it be done" ("Finishes 14:32", "Finishes
  // tomorrow 08:15", "Finishes Wed 19:40", "Finishes Aug 03 06:00"). 24h clock
  // to match the topbar clock. Empty string when the remaining time is unknown
  // or non-positive.
  //
  // `now` is a parameter so the wording can be checked across a midnight, a
  // week and a year boundary without waiting for one.
  function formatFinishClock(remainingSeconds, now = new Date()) {
    const s = Number(remainingSeconds);
    if (!Number.isFinite(s) || s <= 0) {
      return "";
    }
    const finish = new Date(now.getTime() + s * 1000);
    const time = getClockTimeFormat().format(finish);
    // Whole-calendar-day difference (not a 24h-bucket difference) so an
    // 11pm→1am print reads "tomorrow", not "today".
    const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const dayDelta = Math.round((startOfDay(finish) - startOfDay(now)) / 86400000);
    if (dayDelta <= 0) {
      return `Finishes ${time}`;
    }
    if (dayDelta === 1) {
      return `Finishes tomorrow ${time}`;
    }
    if (dayDelta < 7) {
      return `Finishes ${finish.toLocaleDateString([], { weekday: "short" })} ${time}`;
    }
    return `Finishes ${finish.toLocaleDateString([], { day: "2-digit", month: "short" })} ${time}`;
  }

  function buildCompleteSummary() {
    const focusKey = normalizeSpoolKey(getFocusedSpoolKey()) || "spool1";
    const usedThis = Number(lastPrintUsedGramsBySpool[focusKey]);
    // A finished print should have a recorded draw; if it does not, fall back to
    // the full-progress stop summary rather than reporting zero grams used.
    const materialUsedGrams = Number.isFinite(usedThis) && usedThis > 0
      ? usedThis
      : buildPrintStopSummary(1).materialUsedGrams;
    const remainingGrams = Number(spoolRemainingAmountGramsByKey[focusKey]) || 0;
    const printsLeft = materialUsedGrams > 0
      ? Math.floor(remainingGrams / materialUsedGrams)
      : null;
    const stats = printSim && typeof printSim.getStats === "function" ? printSim.getStats() : null;
    return { spoolKey: focusKey, materialUsedGrams, remainingGrams, printsLeft, stats };
  }

  function openCompleteModal(summary) {
    if (!completeModalEl || !summary) {
      return;
    }
    if (completeMaterialEl) {
      completeMaterialEl.textContent = formatGramsText(summary.materialUsedGrams);
    }
    if (completeSpoolEl) {
      let txt = `${formatGramsText(summary.remainingGrams)} left (${getSpoolDisplayLabel(summary.spoolKey)})`;
      if (Number.isFinite(summary.printsLeft)) {
        txt += ` · ~${summary.printsLeft} more print(s)`;
      }
      completeSpoolEl.textContent = txt;
    }
    const st = summary.stats;
    if (completeTimeEl) {
      completeTimeEl.textContent = st ? formatPrintDuration(st.printSeconds) : "—";
    }
    if (completeLayersEl) {
      const layers = st && Number.isFinite(st.layerCount) ? `${st.layerCount} layers` : "—";
      const height = st && Number.isFinite(st.heightMm) ? ` · ${st.heightMm.toFixed(1)} mm` : "";
      completeLayersEl.textContent = layers + height;
    }
    if (completeThermalEl) {
      const t = st && st.thermal ? st.thermal : null;
      completeThermalEl.textContent = t
        ? `peak ${Math.round(t.peak * 100)}% · avg ${Math.round(t.avg * 100)}% · hottest layer ${t.hottestLayer}`
        : "no thermal data";
    }
    renderChamberAtmosphere();
    setModalOpen(completeModalEl, true);
  }

  function openStopSummary(summary) {
    if (!stopSummaryModalEl || !summary) {
      return;
    }
    if (stopSummaryPrintedEl) {
      stopSummaryPrintedEl.textContent = `${summary.percentPrinted}% complete`;
    }
    if (stopSummaryMaterialEl) {
      stopSummaryMaterialEl.textContent = formatGramsText(summary.materialUsedGrams);
    }
    if (stopSummaryOverprintEl) {
      stopSummaryOverprintEl.textContent =
        `+${summary.overGrams.toFixed(1)}g (${summary.overPct.toFixed(1)}% over nominal)`;
    }
    setModalOpen(stopSummaryModalEl, true);
  }

  // --- Listener wiring (moved with the domain) -------------------------------
  // Clicking the scrim (outside the card) dismisses, matching the other modals.
  // The guard is `event.target === modal`: without it a click anywhere inside
  // the card bubbles up and closes the dialog under the operator's finger.
  for (const [modalEl, close] of [
    [stopConfirmModalEl, () => setModalOpen(stopConfirmModalEl, false)],
    [stopSummaryModalEl, () => setModalOpen(stopSummaryModalEl, false)],
  ]) {
    if (!modalEl) {
      continue;
    }
    modalEl.addEventListener("click", (event) => {
      if (event.target === modalEl) {
        close();
      }
    });
  }

  return {
    openStopConfirm: () => setModalOpen(stopConfirmModalEl, true),
    closeStopConfirm: () => setModalOpen(stopConfirmModalEl, false),
    openPauseNotice: () => setModalOpen(pauseNoticeEl, true),
    closePauseNotice: () => setModalOpen(pauseNoticeEl, false),
    buildCompleteSummary,
    openCompleteModal,
    closeCompleteModal: () => setModalOpen(completeModalEl, false),
    /** The live chamber-atmosphere note only needs re-rendering while the
     *  complete modal is actually on screen; the sensor path polls. */
    isCompleteModalOpen: () => Boolean(completeModalEl && !completeModalEl.hidden),
    openStopSummary,
    closeStopSummary: () => setModalOpen(stopSummaryModalEl, false),
    formatFinishClock,
  };
}
