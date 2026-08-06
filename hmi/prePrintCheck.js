// Pre-print self-check (start interlocks).
//
// When the operator confirms a print, this runs a checklist BEFORE anything
// moves: safety circuit, doors, controller, gas/atmosphere, laser head, coolant,
// material, and an operator confirmation that the build plate is installed. The
// print only starts when every check is green — or, for an authorised operator
// (God / Support), via an explicit override of a failed check.
//
// The machine is the source of truth: the automatic checks read the live signal
// snapshot (window.PRINTER_NOTIFICATION_SIGNALS via the host's getSignals(),
// wired to notifications' getSafetySignalsSnapshot() — which returns telemetry
// VERBATIM when a machine is linked, never merged with demo defaults). In the
// standalone demo those signals are all nominal, so only the build-plate
// confirmation and the material check gate the start. The panel re-evaluates
// continuously, so a red check turns green the moment the operator fixes it
// (closes the door, etc.) without reopening the dialog.
//
// Framework-free; builds its own DOM so it needs no markup in the page.

// Each check: id, label, kind, the signal keys it needs, and a predicate.
// kind "auto"     → evaluated from machine signals
//      "material" → evaluated from the host's material gate
//      "operator" → confirmed by the operator (build-plate checkbox)
//
// FAIL-CLOSED, deliberately. Every predicate demands an explicit boolean: a key
// the machine did not report is a failure with its own reason, never a pass.
// These used to read `!s.emergencyStopActive` / `s.doorsClosed !== false`, so an
// absent key passed — and combined with the old signal source (which filled
// gaps from the demo mock's nominal values) a partially-reporting machine
// produced an all-green safety checklist that had verified nothing.
const CHECKS = [
  { id: "estop", label: "Emergency stop released", kind: "auto", keys: ["emergencyStopActive"],
    hint: "E-stop is engaged.", pass: (s) => s.emergencyStopActive === false },
  { id: "security", label: "Safety circuit OK", kind: "auto", keys: ["externalSecurityFault"],
    hint: "External safety/security fault.", pass: (s) => s.externalSecurityFault === false },
  { id: "doors", label: "Doors closed", kind: "auto", keys: ["doorsClosed"],
    hint: "A door is open.", pass: (s) => s.doorsClosed === true },
  { id: "controller", label: "Controller connected", kind: "auto", keys: ["controllerBoardConnected"],
    hint: "Controller board not connected.", pass: (s) => s.controllerBoardConnected === true },
  { id: "gas", label: "Inert atmosphere ready", kind: "auto", keys: ["inertedSystemActive", "gasFlowLow"],
    hint: "Gas flow low / not inerted.",
    pass: (s) => s.inertedSystemActive === true && s.gasFlowLow === false },
  { id: "laser", label: "Laser head ready", kind: "auto", keys: ["laserHeadReady"],
    hint: "Laser head not responding.", pass: (s) => s.laserHeadReady === true },
  { id: "coolant", label: "Coolant OK", kind: "auto", keys: ["coolantFlowLow"],
    hint: "Coolant flow low.", pass: (s) => s.coolantFlowLow === false },
  { id: "material", label: "Material loaded & sufficient", kind: "material",
    hint: "No / insufficient material assigned." },
  { id: "buildplate", label: "Build plate installed", kind: "operator",
    hint: "Confirm the build plate is installed." },
];

// A signal the machine never sent. Distinguished from a reported failure so the
// operator can tell "the door is open" from "nobody is telling me about doors".
function missingKeys(check, signals) {
  return (check.keys || []).filter((key) => typeof signals[key] !== "boolean");
}

// The interlock decision, as a pure function of the signal snapshot — no DOM,
// so it can be unit-tested. Returns one entry per automatic check:
//   { id, ok, reason }   reason is null when ok.
export function evaluateAutoChecks(signals) {
  const s = signals && typeof signals === "object" ? signals : {};
  return CHECKS.filter((check) => check.kind === "auto").map((check) => {
    const absent = missingKeys(check, s);
    if (absent.length) {
      return { id: check.id, ok: false, reason: `Signal not reported (${absent.join(", ")}).` };
    }
    const ok = check.pass(s) === true;
    return { id: check.id, ok, reason: ok ? null : check.hint };
  });
}

const CSS_ID = "prePrintCheckStyles";
// Built from the STYLEGUIDE's :root tokens, not from its own palette. This
// dialog used to carry ~20 hardcoded hex values — a second, drifting theme
// living inside the one screen an operator sees before starting a print. The
// `var(--token, fallback)` form keeps it readable if it is ever rendered
// outside the host page (the release artefact ships without urdf_viewer.css).
const STYLE = `
.ppc-overlay{position:fixed;inset:0;z-index:10050;display:flex;align-items:center;
  justify-content:center;background:rgba(0,0,0,.66);backdrop-filter:blur(2px);padding:16px;}
.ppc-card{width:min(460px,100%);max-height:calc(100vh - 32px);overflow:auto;
  background:var(--ui-bg-canvas-top,#151515);color:var(--ui-text-primary,#ededed);
  border:1px solid var(--ui-border-subtle,rgba(255,255,255,.08));
  border-radius:var(--ui-radius-lg,14px);
  box-shadow:var(--ui-shadow-panel,0 14px 30px rgba(0,0,0,.5));font:14px system-ui,sans-serif;}
.ppc-hd{padding:18px 20px 8px;}
.ppc-title{font-size:17px;font-weight:700;margin:0;}
.ppc-sub{margin:4px 0 0;color:var(--ui-text-secondary,#bbbbbb);font-size:13px;}
.ppc-list{list-style:none;margin:12px 0;padding:0 8px;}
.ppc-row{display:flex;align-items:center;gap:12px;padding:9px 12px;
  border-radius:var(--ui-radius-sm,9px);}
.ppc-row+.ppc-row{margin-top:2px;}
.ppc-ico{flex:0 0 22px;width:22px;height:22px;border-radius:50%;display:flex;
  align-items:center;justify-content:center;font-size:13px;font-weight:700;}
.ppc-ico.checking{background:var(--ui-button-disabled-bg,rgba(52,52,52,.6));
  color:var(--ui-text-secondary,#bbbbbb);}
.ppc-ico.pass{background:rgba(67,181,106,.18);color:var(--ui-success,#43b56a);}
.ppc-ico.fail{background:var(--ui-danger-soft,rgba(238,81,56,.18));
  color:var(--ui-error,#ee5138);}
.ppc-label{flex:1;}
.ppc-name{font-weight:600;}
.ppc-msg{display:block;color:var(--ui-error,#ee5138);font-size:12px;margin-top:1px;}
.ppc-row.pass .ppc-msg{display:none;}
.ppc-cb{width:18px;height:18px;accent-color:var(--ui-success,#43b56a);cursor:pointer;}
.ppc-ft{display:flex;gap:8px;justify-content:flex-end;padding:12px 20px 18px;
  border-top:1px solid var(--ui-border-subtle,rgba(255,255,255,.08));flex-wrap:wrap;}
.ppc-btn{border:0;border-radius:var(--ui-radius-sm,9px);padding:10px 16px;
  font:600 14px system-ui,sans-serif;cursor:pointer;}
.ppc-btn:disabled{opacity:.45;cursor:not-allowed;}
.ppc-cancel{background:var(--ui-button-disabled-bg,rgba(52,52,52,.6));
  color:var(--ui-text-secondary,#bbbbbb);}
.ppc-fix{background:var(--ui-button-primary-bg,rgba(255,255,255,.05));
  color:var(--ui-button-primary-text,#f0913a);}
.ppc-start{background:var(--ui-success,#43b56a);color:var(--ui-bg-canvas,#0a0a0a);}
/* Override is the deliberately uncomfortable button: warning, not success. */
.ppc-override{background:var(--ui-warning,#f0b53a);color:var(--ui-bg-canvas,#0a0a0a);}
.ppc-note{margin:0 20px 8px;color:var(--ui-warning,#f0b53a);font-size:12px;}
`;

export function createPrePrintCheck(options = {}) {
  // No signal source wired => every auto check reports "signal not reported"
  // and the start stays blocked. That is the intended default for a safety gate.
  const getSignals = typeof options.getSignals === "function" ? options.getSignals : () => ({});
  const getMaterialStatus = typeof options.getMaterialStatus === "function"
    ? options.getMaterialStatus : () => ({ ok: true });
  const isAuthorized = typeof options.isAuthorized === "function" ? options.isAuthorized : () => false;
  const onProceed = typeof options.onProceed === "function" ? options.onProceed : () => {};
  const onMaterialFix = typeof options.onMaterialFix === "function" ? options.onMaterialFix : null;
  // Fired when the operator leaves without starting (Cancel, click-outside, or
  // routing to Materials). The host needs this to undo whatever it set up for
  // the print — the camera, in practice. Without it the caller had no way to
  // learn the print did not start: open() hands over and returns immediately.
  const onDismiss = typeof options.onDismiss === "function" ? options.onDismiss : () => {};

  let overlayEl = null;
  let rowEls = {};
  let plateConfirmed = false;
  let pollTimer = null;
  let startBtn = null;
  let overrideBtn = null;
  let noteEl = null;
  let lastMaterialStatus = { ok: true };

  function ensureStyles() {
    if (document.getElementById(CSS_ID)) return;
    const el = document.createElement("style");
    el.id = CSS_ID;
    el.textContent = STYLE;
    document.head.appendChild(el);
  }

  function build() {
    ensureStyles();
    overlayEl = document.createElement("div");
    overlayEl.className = "ppc-overlay";
    overlayEl.setAttribute("role", "dialog");
    overlayEl.setAttribute("aria-modal", "true");

    const card = document.createElement("div");
    card.className = "ppc-card";

    const hd = document.createElement("div");
    hd.className = "ppc-hd";
    hd.innerHTML = '<p class="ppc-title">Pre-print safety check</p>'
      + '<p class="ppc-sub">The machine is verifying it is safe to print. The print starts only when every check passes.</p>';
    card.appendChild(hd);

    const list = document.createElement("ul");
    list.className = "ppc-list";
    rowEls = {};
    for (const check of CHECKS) {
      const li = document.createElement("li");
      li.className = "ppc-row";
      const ico = document.createElement("span");
      ico.className = "ppc-ico checking";
      ico.textContent = "";
      const label = document.createElement("div");
      label.className = "ppc-label";
      label.innerHTML = `<span class="ppc-name">${check.label}</span><span class="ppc-msg">${check.hint}</span>`;
      li.appendChild(ico);
      // The build-plate check is confirmed by the operator via a checkbox.
      if (check.kind === "operator") {
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.className = "ppc-cb";
        cb.addEventListener("change", () => {
          plateConfirmed = cb.checked;
          evaluate();
        });
        li.insertBefore(cb, ico.nextSibling);
        rowEls[check.id] = { li, ico, cb, msg: label.querySelector(".ppc-msg") };
      } else {
        rowEls[check.id] = { li, ico, msg: label.querySelector(".ppc-msg") };
      }
      li.appendChild(label);
      list.appendChild(li);
    }
    card.appendChild(list);

    noteEl = document.createElement("p");
    noteEl.className = "ppc-note";
    noteEl.hidden = true;
    card.appendChild(noteEl);

    const ft = document.createElement("div");
    ft.className = "ppc-ft";
    const cancelBtn = document.createElement("button");
    cancelBtn.className = "ppc-btn ppc-cancel";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", () => { close(); onDismiss("cancel"); });

    // "Go to Materials" appears only when the material check is the blocker and
    // the host provided a fix handler.
    const fixBtn = document.createElement("button");
    fixBtn.className = "ppc-btn ppc-fix";
    fixBtn.textContent = "Go to Materials";
    fixBtn.hidden = true;
    fixBtn.addEventListener("click", () => {
      close();
      onDismiss("materialFix");
      if (onMaterialFix) onMaterialFix(lastMaterialStatus);
    });

    overrideBtn = document.createElement("button");
    overrideBtn.className = "ppc-btn ppc-override";
    overrideBtn.textContent = "Override & start";
    overrideBtn.hidden = true;
    overrideBtn.addEventListener("click", () => {
      close();
      onProceed({ overridden: true });
    });

    startBtn = document.createElement("button");
    startBtn.className = "ppc-btn ppc-start";
    startBtn.textContent = "Start print";
    startBtn.disabled = true;
    startBtn.addEventListener("click", () => {
      close();
      onProceed({ overridden: false });
    });

    ft.append(cancelBtn, fixBtn, overrideBtn, startBtn);
    card.appendChild(ft);
    overlayEl._fixBtn = fixBtn;
    overlayEl.appendChild(card);

    // Click outside the card = cancel.
    overlayEl.addEventListener("click", (e) => {
      if (e.target === overlayEl) { close(); onDismiss("cancel"); }
    });
    document.body.appendChild(overlayEl);
  }

  // textContent, not innerHTML: the reason can carry signal keys that came off
  // the wire.
  function setRowMessage(id, text) {
    const row = rowEls[id];
    if (row && row.msg) row.msg.textContent = text;
  }

  function setRow(id, status) {
    const row = rowEls[id];
    if (!row) return;
    row.ico.className = `ppc-ico ${status}`;
    row.ico.textContent = status === "pass" ? "✓" : status === "fail" ? "✗" : "";
    row.li.classList.toggle("pass", status === "pass");
    row.li.classList.toggle("fail", status === "fail");
  }

  function evaluate() {
    const signals = getSignals() || {};
    lastMaterialStatus = getMaterialStatus() || { ok: true };
    const autoResults = new Map(
      evaluateAutoChecks(signals).map((result) => [result.id, result]),
    );
    let allPass = true;
    let materialFailed = false;
    for (const check of CHECKS) {
      let ok;
      if (check.kind === "operator") {
        ok = plateConfirmed;
      } else if (check.kind === "material") {
        ok = Boolean(lastMaterialStatus.ok);
        if (!ok) materialFailed = true;
      } else {
        const result = autoResults.get(check.id);
        ok = Boolean(result && result.ok);
        setRowMessage(check.id, (result && result.reason) || check.hint);
      }
      setRow(check.id, ok ? "pass" : "fail");
      if (!ok) allPass = false;
    }

    if (startBtn) startBtn.disabled = !allPass;
    // Authorised override only when something (other than a purely operator
    // confirmation) is failing. The build-plate confirmation is never
    // overridable — the operator must physically confirm the plate.
    const canOverride = !allPass && plateConfirmed && isAuthorized();
    if (overrideBtn) overrideBtn.hidden = !canOverride;
    if (noteEl) {
      noteEl.hidden = !canOverride;
      noteEl.textContent = canOverride
        ? "A safety check is failing. Override is available to authorised operators only."
        : "";
    }
    if (overlayEl && overlayEl._fixBtn) {
      overlayEl._fixBtn.hidden = !(materialFailed && onMaterialFix);
    }
  }

  function open() {
    if (overlayEl) close();
    plateConfirmed = false;
    build();
    evaluate();
    // Re-evaluate continuously so auto checks reflect live machine signals.
    pollTimer = window.setInterval(evaluate, 500);
  }

  function close() {
    if (pollTimer) window.clearInterval(pollTimer);
    pollTimer = null;
    if (overlayEl && overlayEl.parentNode) overlayEl.parentNode.removeChild(overlayEl);
    overlayEl = null;
    rowEls = {};
    startBtn = null;
    overrideBtn = null;
    noteEl = null;
  }

  function isOpen() {
    return Boolean(overlayEl);
  }

  return { open, close, isOpen };
}
