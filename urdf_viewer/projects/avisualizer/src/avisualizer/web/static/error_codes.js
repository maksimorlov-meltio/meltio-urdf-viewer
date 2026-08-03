// Machine error/warning code layer for the Meltio console.
//
// Pulls the fault catalog from the server (/api/error-codes, cached in
// localStorage), resolves a live code — including per-target families like
// lasers 1-9 (106.1.x) — to its description/cause/remediation, and surfaces it
// through the viewer's Notification Center bridge (window.MeltioNotifications).
// A safety-disengaging error also halts the print UI (window.MeltioMachine).
//
// Transport of live codes from the M600/Engine is intentionally out of scope
// here (catalog-first). When that feed exists, call MeltioErrors.raise(cls,code)
// per active code and MeltioErrors.clear(cls,code) when it clears.
(function () {
  "use strict";

  const API = "/api/error-codes";
  const LS_KEY = "meltio.errorcodes.catalog.v1";

  let catalog = { version: 0, codes: [] };

  // ---- Load / cache ---------------------------------------------------------
  function loadLocal() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_e) {}
    return null;
  }
  function saveLocal() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(catalog)); } catch (_e) {}
  }
  async function loadRemote() {
    try {
      const res = await fetch(API, { cache: "no-store" });
      if (!res.ok) return null;
      const data = await res.json();
      if (data && Array.isArray(data.codes)) return data;
    } catch (_e) {}
    return null;
  }

  // ---- Resolution -----------------------------------------------------------
  // Expand a family target index (e.g. 106.1.3 → "Laser 4") into a label.
  function targetLabel(target, idx) {
    if (!target) return "";
    const from = Number(target.from) || 0;
    if (Array.isArray(target.labels)) return target.labels[idx - from] || `#${idx}`;
    if (target.type === "tool") return `${target.label}${idx}`; // T0 / T1
    return `${target.label} ${idx - from + 1}`;                 // Laser 1..9, Line 1..
  }

  function interpolate(text, label) {
    return String(text || "").replace(/\{target\}/g, label);
  }

  // Resolve class+code to a flat entry, or null if unknown.
  function resolve(cls, code) {
    const codeStr = String(code || "").trim();
    const list = catalog.codes || [];
    // 1) exact code match within the class
    const exact = list.find((c) => c.class === cls && c.code === codeStr);
    if (exact) return { ...exact, code: codeStr, matched: "exact" };
    // 2) family match: codePrefix + trailing index within the target range
    for (const c of list) {
      if (c.class !== cls || !c.codePrefix) continue;
      if (!codeStr.startsWith(c.codePrefix + ".")) continue;
      const tail = codeStr.slice(c.codePrefix.length + 1);
      const idx = Number(tail);
      const t = c.target || {};
      if (!Number.isInteger(idx) || idx < (t.from ?? 0) || idx > (t.to ?? 0)) continue;
      const label = targetLabel(t, idx);
      return {
        ...c, code: codeStr, matched: "family", target: undefined,
        title: interpolate(c.title, label),
        description: interpolate(c.description, label),
        cause: interpolate(c.cause, label),
      };
    }
    return null;
  }

  // ---- Surfacing ------------------------------------------------------------
  function severityFor(cls) {
    return cls === "error" ? "critical" : "warning";
  }

  function notifId(cls, code) {
    return `errcode-${cls}-${code}`;
  }

  // Where "Resolve" should take the operator to make the fix. Maps a fault's
  // module to a Settings destination the viewer's goToNotificationIssue knows.
  const FIX_TARGET_BY_MODULE = {
    "200": "diagnostics",        // Engine/chiller/flow/fans/comms → Settings
    "103": "settings-calibrate", // Laser Control Unit → Calibrate / service
    "106": "settings-calibrate", // Process/head/laser → Calibrate
    "108": "settings-calibrate", // Load cell / protection glass → Calibrate
    "10F": "gas-control",        // Argon flow/pressure → Settings (gas)
    "11F": "gas-control",        // Oxygen / inert bubble → Settings (gas)
  };

  // Raise a live code: enrich via the catalog and push to the Notification
  // Center; a safety error also halts the print UI. Returns the resolved entry.
  function raise(cls, code) {
    const entry = resolve(cls, code) || {
      code: String(code), class: cls,
      title: "Unknown code",
      description: "No catalog entry for this code.",
      cause: "Code not present in the catalog — it may be newer than the cached catalog.",
      engineAction: cls === "error" ? "Disengages safety" : "",
      remediation: ["Update the error-code catalog from the master sheet."],
      module: String(code).split(".")[0] || "",
    };
    const remediation = Array.isArray(entry.remediation) ? entry.remediation : [];
    const moduleName = (catalog.modules && catalog.modules[entry.module]) || entry.module || "Machine";

    if (window.MeltioNotifications && typeof window.MeltioNotifications.raise === "function") {
      window.MeltioNotifications.raise({
        id: notifId(cls, entry.code),
        type: cls === "error" ? "machine_error" : "machine_warning",
        title: `[${entry.code}] ${entry.title}`,
        description: entry.engineAction ? `${entry.description} (${entry.engineAction})` : entry.description,
        severity: severityFor(cls),
        source: moduleName,
        possibleCauses: entry.cause || "",
        recommendedAction: remediation.length ? remediation.join(" • ") : "Follow standard procedure.",
        relatedScreen: FIX_TARGET_BY_MODULE[entry.module] || "diagnostics",
        canAcknowledge: true,
        canResolveManually: true,
        icon: cls === "error" ? "emergency" : "warning",
        priority: cls === "error" ? 95 : 50,
      });
    }

    if (cls === "error" && window.MeltioMachine && typeof window.MeltioMachine.haltPrintForError === "function") {
      window.MeltioMachine.haltPrintForError(`${entry.code} ${entry.title}`);
    }
    return entry;
  }

  // Clear a previously-raised code (when the machine reports it resolved).
  function clear(cls, code) {
    if (window.MeltioNotifications && typeof window.MeltioNotifications.resolve === "function") {
      window.MeltioNotifications.resolve(notifId(cls, String(code)));
    }
  }

  async function init() {
    const local = loadLocal();
    if (local && Array.isArray(local.codes)) catalog = local;
    const remote = await loadRemote();
    if (remote) { catalog = remote; saveLocal(); }
  }

  window.MeltioErrors = {
    init,
    resolve,
    raise,
    clear,
    get catalog() { return catalog; },
    list(cls) { return (catalog.codes || []).filter((c) => !cls || c.class === cls); },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
