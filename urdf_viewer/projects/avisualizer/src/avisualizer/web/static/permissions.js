// Roles & permissions ("modes") for the Meltio operator console.
//
// Four built-in modes (Operator, Operator+, Meltio Support, God Mode) plus any
// custom modes a God-Mode user creates. Access is a permission matrix: each mode
// grants a set of capability keys (PERMISSION_CATALOG). Controls opt in to gating
// with `data-requires-permission="<key>"` (+ `data-perm-hide` to hide instead of
// disable when denied).
//
// Mode selection lives in Settings ▸ Mode. Operator / Operator+ / Support (and
// custom modes) are switched directly; God Mode requires a login + password.
// The active mode is always shown by the topbar chip. Support & God enable the
// machine's advanced controls (via window.MeltioAdvanced) — this replaces the
// old standalone "Advanced Mode" toggle/PIN.
//
// Storage is "both": the backend (/api/permissions/config) is the source of
// truth, mirrored to localStorage for instant startup. This is an operator
// console, not a security boundary — enforcement is UI gating.
(function () {
  "use strict";

  const LS_CONFIG_KEY = "meltio.permissions.config.v2";
  const SS_SESSION_KEY = "meltio.permissions.session.v2";
  const CONFIG_API = "/api/permissions/config";
  // Capability that maps to the machine's "advanced" controls (network, fixtures,
  // sensors, calibration service, cloud advanced panel).
  const ADVANCED_KEY = "setup.network";

  // ---- Capability catalog (grouped for the dashboard matrix) ----------------
  const PERMISSION_CATALOG = [
    { group: "Files & Print", key: "files.browse", label: "Browse & select files" },
    { group: "Files & Print", key: "print.control", label: "Start / pause / stop print" },
    { group: "Files & Print", key: "files.upload", label: "Upload files" },
    { group: "Files & Print", key: "files.delete", label: "Delete files" },
    { group: "Materials", key: "materials.assign", label: "Assign / refill materials" },
    { group: "Slicing", key: "slice.run", label: "Slice / open slicer" },
    { group: "Slicing", key: "slice.placement", label: "Change part placement (bead location)" },
    { group: "Slicing", key: "slice.profileSelect", label: "Select slicer profile" },
    { group: "Slicing", key: "slice.profileEdit", label: "Edit slicer profiles" },
    { group: "Machine", key: "machine.doors", label: "Doors / chiller / fan / light" },
    { group: "Machine", key: "machine.motion", label: "Motion presets / joint jog / feeder" },
    { group: "Setup", key: "setup.calibration", label: "Calibration routines" },
    { group: "Setup", key: "setup.firmware", label: "Firmware update" },
    { group: "Setup", key: ADVANCED_KEY, label: "Advanced (network / Wi-Fi / SSL / API / fixtures)" },
    { group: "Monitoring", key: "data.read", label: "Read machine data & settings" },
    { group: "Monitoring", key: "notifications.manage", label: "Manage notifications" },
    { group: "Monitoring", key: "calendar.edit", label: "Edit calendar" },
    { group: "Admin", key: "admin.users", label: "Manage modes & permissions (God Mode)" },
  ];
  const ALL_KEYS = PERMISSION_CATALOG.map((p) => p.key);

  // ---- Built-in mode defaults ----------------------------------------------
  const OPERATOR = ["files.browse", "print.control", "materials.assign", "notifications.manage"];
  const OPERATOR_PLUS = OPERATOR.concat([
    "files.upload", "files.delete", "slice.run", "slice.placement",
    "slice.profileSelect", "machine.doors", "calendar.edit",
  ]);
  const SUPPORT = OPERATOR_PLUS.concat([
    "data.read", "slice.profileEdit", "setup.calibration", "machine.motion",
    "setup.firmware", ADVANCED_KEY,
  ]);

  function defaultConfig() {
    return {
      version: 2,
      // God Mode is the only mode gated by credentials (secret login + password).
      godAuth: { username: "admin", password: "meltio" },
      roles: [
        { id: "operator", name: "Operator", builtin: true, rank: 1, permissions: OPERATOR.slice() },
        { id: "operator_plus", name: "Operator+", builtin: true, rank: 2, permissions: OPERATOR_PLUS.slice() },
        { id: "support", name: "Meltio Support", builtin: true, rank: 3, permissions: SUPPORT.slice() },
        { id: "god", name: "God Mode", builtin: true, rank: 99, permissions: ALL_KEYS.slice() },
      ],
      users: [{ id: "u_admin", name: "Administrator", roleId: "god" }],
    };
  }

  // Baseline mode before anyone selects one (kiosk default). Lowest-privilege.
  const DEFAULT_ROLE_ID = "operator";

  let config = defaultConfig();
  let currentRoleId = DEFAULT_ROLE_ID;
  let currentUserName = null;
  let listeners = [];

  function getRole(id) { return config.roles.find((r) => r.id === id) || null; }
  function currentRole() { return getRole(currentRoleId) || getRole(DEFAULT_ROLE_ID) || config.roles[0]; }
  function isGod() { return hasPermission("admin.users"); }

  function hasPermission(key) {
    const role = currentRole();
    if (!role) return false;
    if (role.permissions.includes("admin.users")) return true; // God implicitly has all
    return role.permissions.includes(key);
  }

  function normalizeConfig(raw) {
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.roles) || !raw.roles.length) {
      return defaultConfig();
    }
    const base = defaultConfig();
    const byId = new Map(raw.roles.map((r) => [r.id, r]));
    for (const b of base.roles) if (!byId.has(b.id)) raw.roles.push(b);
    const god = raw.roles.find((r) => r.id === "god");
    if (god) god.permissions = ALL_KEYS.slice(); // God always holds every key
    if (!Array.isArray(raw.users)) raw.users = base.users;
    if (!raw.godAuth || typeof raw.godAuth !== "object") raw.godAuth = base.godAuth;
    raw.version = raw.version || 2;
    return raw;
  }

  // ---- Persistence ----------------------------------------------------------
  function saveLocal() { try { localStorage.setItem(LS_CONFIG_KEY, JSON.stringify(config)); } catch (_e) {} }
  function loadLocal() {
    try { const raw = localStorage.getItem(LS_CONFIG_KEY); if (raw) return normalizeConfig(JSON.parse(raw)); } catch (_e) {}
    return null;
  }
  async function loadRemote() {
    try {
      const res = await fetch(CONFIG_API, { cache: "no-store" });
      if (!res.ok) return null;
      const data = await res.json();
      if (data && Array.isArray(data.roles) && data.roles.length) return normalizeConfig(data);
    } catch (_e) {}
    return null;
  }
  async function saveRemote() {
    try {
      await fetch(CONFIG_API, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) });
    } catch (_e) {}
  }
  async function persist() { saveLocal(); await saveRemote(); }

  // ---- Session --------------------------------------------------------------
  function saveSession() {
    try { sessionStorage.setItem(SS_SESSION_KEY, JSON.stringify({ roleId: currentRoleId, user: currentUserName })); } catch (_e) {}
  }
  function loadSession() {
    try {
      const raw = sessionStorage.getItem(SS_SESSION_KEY);
      if (raw) { const s = JSON.parse(raw); if (s && getRole(s.roleId)) { currentRoleId = s.roleId; currentUserName = s.user || null; } }
    } catch (_e) {}
  }

  function setRole(roleId, userName) {
    currentRoleId = getRole(roleId) ? roleId : DEFAULT_ROLE_ID;
    currentUserName = userName || null;
    saveSession();
    apply();
    emit();
  }
  function signOut() { setRole(DEFAULT_ROLE_ID, null); }

  function validateGod(username, password) {
    const a = config.godAuth || {};
    return String(username || "") === String(a.username || "") && String(password || "") === String(a.password || "");
  }

  // ---- Advanced-access bridge (drives the machine's advanced controls) ------
  function driveAdvanced() {
    if (window.MeltioAdvanced && typeof window.MeltioAdvanced.set === "function") {
      window.MeltioAdvanced.set(hasPermission(ADVANCED_KEY));
    }
  }

  // ---- Change notification --------------------------------------------------
  function onChange(fn) { if (typeof fn === "function") listeners.push(fn); }
  function emit() {
    const info = { roleId: currentRoleId, roleName: currentRole()?.name, user: currentUserName, isGod: isGod() };
    for (const fn of listeners) { try { fn(info); } catch (_e) {} }
  }

  // ---- Gating ---------------------------------------------------------------
  function elementAllowed(el) {
    const spec = el.getAttribute("data-requires-permission");
    if (!spec) return true;
    const keys = spec.split(",").map((s) => s.trim()).filter(Boolean);
    if (!keys.length) return true;
    return keys.some((k) => hasPermission(k));
  }

  function apply() {
    document.querySelectorAll("[data-requires-permission]").forEach((el) => {
      const allowed = elementAllowed(el);
      const hideMode = el.hasAttribute("data-perm-hide");
      el.classList.toggle("perm-denied", !allowed);
      if (hideMode) el.classList.toggle("perm-hidden", !allowed);
      const isControl = el.matches("button, input, select, textarea, a, [role='button']");
      if (isControl) {
        if (!allowed) {
          if (!el.hasAttribute("data-perm-prev-disabled")) el.setAttribute("data-perm-prev-disabled", el.disabled ? "1" : "0");
          el.disabled = true; el.setAttribute("aria-disabled", "true");
        } else if (el.hasAttribute("data-perm-prev-disabled")) {
          el.disabled = el.getAttribute("data-perm-prev-disabled") === "1";
          el.removeAttribute("data-perm-prev-disabled"); el.removeAttribute("aria-disabled");
        }
      }
    });
    driveAdvanced();
    updateRoleChip();
    updateModesSection();
  }

  let applyScheduled = false;
  function scheduleApply() {
    if (applyScheduled) return;
    applyScheduled = true;
    requestAnimationFrame(() => { applyScheduled = false; apply(); });
  }

  // =========================================================================
  //  UI helpers
  // =========================================================================
  let rootEl = null;

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") el.className = v;
      else if (k === "html") el.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (v !== null && v !== undefined && v !== false) el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids) { if (kid == null) continue; el.appendChild(typeof kid === "string" ? document.createTextNode(kid) : kid); }
    return el;
  }
  function ensureRoot() { if (!rootEl) { rootEl = h("div", { class: "perm-root" }); document.body.appendChild(rootEl); } return rootEl; }
  function closeOverlay() { if (rootEl) rootEl.innerHTML = ""; }

  // ---- Topbar chip ----------------------------------------------------------
  let roleChipEl = null;
  function updateRoleChip() {
    if (!roleChipEl) return;
    const role = currentRole();
    roleChipEl.textContent = role ? role.name : "Operator";
    roleChipEl.classList.toggle("perm-role-chip-god", isGod());
    roleChipEl.title = currentUserName ? `${currentUserName} — ${role?.name}` : role?.name || "";
  }
  function installRoleChip() {
    const topbarRight = document.querySelector(".topbar-right");
    if (!topbarRight) return;
    roleChipEl = h("button", { id: "topbarRoleChip", class: "perm-role-chip", type: "button",
      "aria-label": "Active mode — change mode or manage modes", onclick: openEntry });
    topbarRight.insertBefore(roleChipEl, topbarRight.firstChild);
    updateRoleChip();
  }
  // Chip: God → dashboard; anyone else → God login (fast escalate). Switching to
  // the non-credential modes is done in Settings ▸ Mode.
  function openEntry() { if (isGod()) openDashboard(); else openGodLogin(); }

  // ---- Settings ▸ Mode section ----------------------------------------------
  let modesSectionEl = null;
  function installModesSection() {
    const menu = document.getElementById("topbarSettingsMenu");
    if (!menu || modesSectionEl) return;
    modesSectionEl = h("section", { class: "perm-modes-section", "aria-label": "Operating mode" },
      h("p", { class: "perm-modes-title" }, "Mode"));
    const header = menu.querySelector(".topbar-settings-header");
    if (header && header.nextSibling) menu.insertBefore(modesSectionEl, header.nextSibling);
    else menu.insertBefore(modesSectionEl, menu.firstChild);
    updateModesSection();
  }
  function updateModesSection() {
    if (!modesSectionEl) return;
    modesSectionEl.querySelectorAll(".perm-mode-btn").forEach((n) => n.remove());
    for (const role of config.roles) {
      const active = role.id === currentRoleId;
      const isGodRole = role.id === "god";
      const btn = h("button", {
        class: "perm-mode-btn" + (active ? " is-active" : "") + (isGodRole ? " perm-mode-btn-god" : ""),
        type: "button",
        onclick: () => {
          if (isGodRole) { openGodLogin(); return; }
          setRole(role.id, null);
        },
      }, role.name, active ? h("span", { class: "perm-mode-check", "aria-hidden": "true" }, "●") : (isGodRole ? h("span", { class: "perm-mode-check" }, "🔒") : null));
      modesSectionEl.appendChild(btn);
    }
  }

  // ---- God login (username + password) --------------------------------------
  function openGodLogin() {
    ensureRoot();
    let error = null;
    const render = () => {
      rootEl.innerHTML = "";
      const userInput = h("input", { class: "perm-inline-input", type: "text", autocomplete: "off", "aria-label": "Login" });
      const passInput = h("input", { class: "perm-inline-input", type: "password", autocomplete: "off", "aria-label": "Password" });
      const submit = () => {
        if (validateGod(userInput.value, passInput.value)) { closeOverlay(); setRole("god", userInput.value.trim() || "God Mode"); openDashboard(); }
        else { error = "Login or password not recognised."; render(); userInput.focus(); }
      };
      const card = h("div", { class: "perm-modal-card", role: "dialog", "aria-modal": "true" },
        h("div", { class: "perm-modal-head" }, h("h3", null, "Enter God Mode"),
          h("button", { class: "perm-icon-btn", type: "button", "aria-label": "Close", onclick: closeOverlay }, "✕")),
        h("p", { class: "perm-modal-note" }, "God Mode requires the secret login and password. Other modes are chosen in Settings ▸ Mode."),
        h("div", { class: "perm-field" }, h("label", null, "Login"), userInput),
        h("div", { class: "perm-field" }, h("label", null, "Password"), passInput),
        error ? h("p", { class: "perm-error" }, error) : null,
        h("div", { class: "perm-modal-actions" },
          h("button", { class: "perm-btn-quiet", type: "button", onclick: closeOverlay }, "Cancel"),
          h("button", { class: "perm-btn-primary", type: "button", onclick: submit }, "Unlock")),
      );
      passInput.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
      rootEl.append(h("div", { class: "perm-modal-backdrop", onclick: closeOverlay }), h("div", { class: "perm-modal-shell" }, card));
      userInput.focus();
    };
    render();
  }

  // ---- God-Mode dashboard ---------------------------------------------------
  function openDashboard() {
    if (!isGod()) { openGodLogin(); return; }
    ensureRoot();
    let tab = "matrix";
    const render = () => {
      rootEl.innerHTML = "";
      const body = h("div", { class: "perm-dash-body" });
      if (tab === "matrix") body.appendChild(renderMatrix());
      else if (tab === "users") body.appendChild(renderUsers(render));
      else body.appendChild(renderRoles(render));
      const card = h("div", { class: "perm-dash-card", role: "dialog", "aria-modal": "true" },
        h("div", { class: "perm-modal-head" }, h("h3", null, "God Mode — Modes & Permissions"),
          h("button", { class: "perm-icon-btn", type: "button", "aria-label": "Close", onclick: closeOverlay }, "✕")),
        h("div", { class: "perm-tabs" },
          tabBtn("Permissions", "matrix", tab, () => { tab = "matrix"; render(); }),
          tabBtn("Modes", "roles", tab, () => { tab = "roles"; render(); }),
          tabBtn("Users & login", "users", tab, () => { tab = "users"; render(); })),
        body,
        h("div", { class: "perm-dash-foot" },
          h("span", { class: "perm-dash-current" }, `Active: ${currentUserName || currentRole().name}`),
          h("div", { class: "perm-modal-actions" },
            h("button", { class: "perm-btn-quiet", type: "button", onclick: () => { signOut(); closeOverlay(); } }, "Exit God Mode"),
            h("button", { class: "perm-btn-primary", type: "button", onclick: async () => { await persist(); apply(); closeOverlay(); } }, "Save changes"))),
      );
      rootEl.append(h("div", { class: "perm-modal-backdrop", onclick: closeOverlay }), h("div", { class: "perm-modal-shell perm-modal-shell-wide" }, card));
    };
    render();
  }

  function tabBtn(label, id, active, onClick) {
    return h("button", { class: "perm-tab" + (active === id ? " is-active" : ""), type: "button", onclick: onClick }, label);
  }

  function renderMatrix() {
    const wrap = h("div", { class: "perm-matrix-wrap" });
    const table = h("table", { class: "perm-matrix" });
    const thead = h("tr", null, h("th", { class: "perm-matrix-capcol" }, "Capability"));
    for (const role of config.roles) thead.appendChild(h("th", null, role.name));
    table.appendChild(thead);
    let lastGroup = null;
    for (const cap of PERMISSION_CATALOG) {
      if (cap.group !== lastGroup) {
        lastGroup = cap.group;
        const gr = h("tr", { class: "perm-matrix-group" });
        gr.appendChild(h("td", { colspan: String(config.roles.length + 1) }, cap.group));
        table.appendChild(gr);
      }
      const row = h("tr", null, h("td", { class: "perm-matrix-cap" }, cap.label));
      for (const role of config.roles) {
        const locked = role.id === "god";
        const checked = role.permissions.includes(cap.key);
        const cb = h("input", { type: "checkbox", checked: checked || locked, disabled: locked,
          onchange: (e) => {
            const set = new Set(role.permissions);
            if (e.target.checked) set.add(cap.key); else set.delete(cap.key);
            role.permissions = Array.from(set);
            if (role.id === currentRoleId) apply();
          } });
        row.appendChild(h("td", { class: "perm-matrix-cell" }, cb));
      }
      table.appendChild(row);
    }
    wrap.appendChild(table);
    return wrap;
  }

  function renderRoles(rerender) {
    const wrap = h("div", { class: "perm-list" });
    for (const role of config.roles) {
      wrap.appendChild(h("div", { class: "perm-list-row" },
        h("input", { class: "perm-inline-input", type: "text", value: role.name, disabled: role.builtin ? true : false,
          onchange: (e) => { role.name = e.target.value.trim() || role.name; } }),
        h("span", { class: "perm-badge" }, role.builtin ? "built-in" : "custom"),
        role.builtin ? null : h("button", { class: "perm-btn-danger", type: "button",
          onclick: () => { config.roles = config.roles.filter((r) => r.id !== role.id); config.users.forEach((u) => { if (u.roleId === role.id) u.roleId = DEFAULT_ROLE_ID; }); rerender(); } }, "Delete")));
    }
    wrap.appendChild(h("button", { class: "perm-btn-primary perm-add", type: "button",
      onclick: () => { const id = "role_" + Math.abs(hashString(String(config.roles.length) + config.roles.map((r) => r.id).join(","))); config.roles.push({ id, name: "New mode", builtin: false, rank: 2, permissions: OPERATOR.slice() }); rerender(); } }, "+ Add custom mode"));
    return wrap;
  }

  function renderUsers(rerender) {
    const wrap = h("div", { class: "perm-list" });
    // God-Mode credentials editor (the secret login + password).
    const ga = config.godAuth || (config.godAuth = { username: "admin", password: "meltio" });
    wrap.appendChild(h("div", { class: "perm-list-row" },
      h("span", { class: "perm-inline-label" }, "God login"),
      h("input", { class: "perm-inline-input", type: "text", value: ga.username || "", onchange: (e) => { ga.username = e.target.value.trim(); } }),
      h("span", { class: "perm-inline-label" }, "Password"),
      h("input", { class: "perm-inline-input", type: "text", value: ga.password || "", onchange: (e) => { ga.password = e.target.value; } })));
    wrap.appendChild(h("p", { class: "perm-modal-note" }, "Named users below are for records / assignment; the login above is what unlocks God Mode."));
    for (const user of config.users) {
      wrap.appendChild(h("div", { class: "perm-list-row" },
        h("input", { class: "perm-inline-input", type: "text", value: user.name, onchange: (e) => { user.name = e.target.value.trim() || user.name; } }),
        (() => {
          const sel = h("select", { class: "perm-inline-select", onchange: (e) => { user.roleId = e.target.value; } });
          for (const role of config.roles) sel.appendChild(h("option", { value: role.id, selected: role.id === user.roleId ? true : false }, role.name));
          return sel;
        })(),
        h("button", { class: "perm-btn-danger", type: "button", onclick: () => { config.users = config.users.filter((u) => u.id !== user.id); rerender(); } }, "Delete")));
    }
    wrap.appendChild(h("button", { class: "perm-btn-primary perm-add", type: "button",
      onclick: () => { const id = "u_" + Math.abs(hashString(String(config.users.length) + config.users.map((u) => u.id).join(","))); config.users.push({ id, name: "New user", roleId: DEFAULT_ROLE_ID }); rerender(); } }, "+ Add user"));
    return wrap;
  }

  function hashString(s) { let k = 0; for (let i = 0; i < s.length; i += 1) k = (k * 31 + s.charCodeAt(i)) | 0; return k; }

  // ---- Boot -----------------------------------------------------------------
  async function init() {
    const local = loadLocal();
    if (local) config = local;
    loadSession();
    installRoleChip();
    installModesSection();
    apply();
    emit();
    const remote = await loadRemote();
    if (remote) { config = remote; saveLocal(); apply(); emit(); }
    const obs = new MutationObserver(() => scheduleApply());
    obs.observe(document.body, { childList: true, subtree: true });
  }

  window.MeltioPermissions = {
    init, hasPermission, can: hasPermission, isGod,
    currentRole: () => ({ id: currentRoleId, name: currentRole()?.name, user: currentUserName }),
    setMode: (id) => setRole(id, null),
    refresh: apply, onChange, openGodLogin, openDashboard, signOut,
    catalog: PERMISSION_CATALOG,
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
