// Accounts, login & modes for the Meltio operator console.
//
// Users sign in with a username + password. The backend (/api/auth/login)
// validates the credentials against a PBKDF2 credential store (salted hashes
// that never reach the browser, kept separate from the public users list) and
// returns the signed-in user, whose roleId maps to one of the modes in the
// permission matrix (Operator, Operator+, Meltio Support, God). The role grants
// a set of capability keys; controls opt into gating via
// `data-requires-permission="<key>"` (+ `data-perm-hide` to hide when denied).
// NOTE: this gating is UI-level only, not a security boundary for the machine.
//
// Signed out = a locked/guest state (no elevated permissions). The console opens
// signed out; tapping the account chip near the machine title (or the Settings
// header) opens the login. The signed-in operator is shown as an initials
// avatar next to "M600-PRO-1" and in Settings. Sessions auto-expire after idle.
//
// Config (roles + public user list, NO password hashes) is served by
// /api/permissions/config; God-level users can edit the matrix/modes there.
// Credentials are managed out-of-band with tools/set_password.py.
(function () {
  "use strict";

  const CONFIG_API = "/api/permissions/config";
  const LOGIN_API = "/api/auth/login";
  const SS_SESSION_KEY = "meltio.account.session.v1";
  const IDLE_MS = 10 * 60 * 1000; // auto sign-out after 10 min of inactivity
  const ADVANCED_KEY = "setup.network";

  // ---- Capability catalog (grouped for the admin matrix) --------------------
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
    { group: "Admin", key: "admin.users", label: "Manage modes & permissions (God)" },
  ];

  let config = { roles: [], users: [] };
  let currentUser = null; // null = signed out (locked / guest)
  let listeners = [];
  let idleTimer = null;
  let rootEl = null;

  // ---- DOM helper -----------------------------------------------------------
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
  let overlayOpenedAt = 0;
  function ensureRoot() {
    if (!rootEl) { rootEl = h("div", { class: "perm-root" }); document.body.appendChild(rootEl); }
    overlayOpenedAt = Date.now();
    return rootEl;
  }
  function closeOverlay() { if (rootEl) rootEl.innerHTML = ""; }
  // Dismiss when the operator taps the dimmed backdrop — but IGNORE the synthetic
  // "ghost click" that touchscreens fire ~300ms after a tap. Without this guard,
  // tapping a trigger such as "Sign in" opens the modal and the ghost click then
  // lands on the freshly-rendered full-screen backdrop and closes it instantly,
  // so on a touch panel the button looks dead. A short time gate after open blocks
  // that while still allowing an intentional tap-outside to dismiss.
  function backdropClose() {
    if (Date.now() - overlayOpenedAt < 500) return;
    closeOverlay();
  }

  // ---- State helpers --------------------------------------------------------
  function getRole(id) { return config.roles.find((r) => r.id === id) || null; }
  function isSignedIn() { return !!currentUser; }
  function hasPermission(key) {
    if (!currentUser) return false; // signed out = locked
    const perms = currentUser.permissions || [];
    if (perms.includes("admin.users")) return true; // God implicitly has all
    return perms.includes(key);
  }
  function isGod() { return hasPermission("admin.users"); }
  function currentLevelName() { return currentUser ? (currentUser.roleName || getRole(currentUser.roleId)?.name || "Signed in") : "Not signed in"; }

  function initialsOf(name) {
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  function avatarEl(user, extraClass) {
    const signedIn = !!user;
    const el = h("span", { class: "perm-avatar" + (extraClass ? " " + extraClass : ""), "aria-hidden": "true" });
    if (signedIn) {
      el.textContent = initialsOf(user.name);
      if (user.avatarColor) el.style.background = user.avatarColor;
    } else {
      // Generic "signed out" person glyph.
      el.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.4"/><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6"/></svg>';
      el.classList.add("perm-avatar-empty");
    }
    return el;
  }

  // ---- Config / session -----------------------------------------------------
  async function loadConfig() {
    try {
      const res = await fetch(CONFIG_API, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.roles)) config = { roles: data.roles, users: Array.isArray(data.users) ? data.users : [] };
      }
    } catch (_e) { /* keep whatever we have */ }
  }
  function saveSession() {
    try {
      if (currentUser) sessionStorage.setItem(SS_SESSION_KEY, JSON.stringify({ user: currentUser, ts: Date.now() }));
      else sessionStorage.removeItem(SS_SESSION_KEY);
    } catch (_e) {}
  }
  function loadSession() {
    try {
      const raw = sessionStorage.getItem(SS_SESSION_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (s && s.user && Date.now() - (s.ts || 0) < IDLE_MS) currentUser = s.user;
      else sessionStorage.removeItem(SS_SESSION_KEY);
    } catch (_e) {}
  }

  function setUser(user) {
    currentUser = user || null;
    saveSession();
    apply();
    emit();
    if (currentUser) startIdleWatch(); else stopIdleWatch();
  }
  function signOut() { setUser(null); closeOverlay(); }

  // ---- Idle auto sign-out ---------------------------------------------------
  function resetIdle() {
    if (!currentUser) return;
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => { if (currentUser) signOut(); }, IDLE_MS);
    // refresh the stored timestamp so a reload within the window stays signed in
    saveSession();
  }
  let idleWatching = false;
  function startIdleWatch() {
    resetIdle();
    if (idleWatching) return;
    idleWatching = true;
    ["pointerdown", "keydown"].forEach((ev) => document.addEventListener(ev, resetIdle, true));
  }
  function stopIdleWatch() {
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  }

  // ---- Change notification --------------------------------------------------
  function onChange(fn) { if (typeof fn === "function") listeners.push(fn); }
  function emit() {
    const info = { signedIn: isSignedIn(), user: currentUser, roleId: currentUser?.roleId, roleName: currentLevelName(), isGod: isGod() };
    for (const fn of listeners) { try { fn(info); } catch (_e) {} }
  }
  function driveAdvanced() {
    if (window.MeltioAdvanced && typeof window.MeltioAdvanced.set === "function") window.MeltioAdvanced.set(hasPermission(ADVANCED_KEY));
  }

  // ---- Gating ---------------------------------------------------------------
  function elementAllowed(el) {
    const spec = el.getAttribute("data-requires-permission");
    if (!spec) return true;
    const keys = spec.split(",").map((s) => s.trim()).filter(Boolean);
    if (!keys.length) return true;
    return keys.some((k) => hasPermission(k));
  }
  const CONTROL_SELECTOR = "button, input, select, textarea, a[href], [role='button']";
  function setControlDenied(ctrl, denied) {
    if (denied) {
      // Remember the control's pre-gate disabled state so restoring it never
      // re-enables something that was independently disabled.
      if (!ctrl.hasAttribute("data-perm-prev-disabled")) {
        ctrl.setAttribute("data-perm-prev-disabled", ("disabled" in ctrl && ctrl.disabled) ? "1" : "0");
      }
      if ("disabled" in ctrl) ctrl.disabled = true; // real, non-bypassable disable
      ctrl.setAttribute("aria-disabled", "true");
      // Take anchors / role=button (which have no `disabled` property) out of the
      // tab order too, so keyboard / assistive-tech activation can't reach them.
      if (!ctrl.hasAttribute("data-perm-prev-tabindex")) {
        ctrl.setAttribute("data-perm-prev-tabindex", ctrl.hasAttribute("tabindex") ? ctrl.getAttribute("tabindex") : "");
      }
      ctrl.setAttribute("tabindex", "-1");
    } else if (ctrl.hasAttribute("data-perm-prev-disabled")) {
      if ("disabled" in ctrl) ctrl.disabled = ctrl.getAttribute("data-perm-prev-disabled") === "1";
      ctrl.removeAttribute("data-perm-prev-disabled");
      ctrl.removeAttribute("aria-disabled");
      const prevTab = ctrl.getAttribute("data-perm-prev-tabindex");
      if (prevTab === "" || prevTab === null) ctrl.removeAttribute("tabindex");
      else ctrl.setAttribute("tabindex", prevTab);
      ctrl.removeAttribute("data-perm-prev-tabindex");
    }
  }
  function apply() {
    document.querySelectorAll("[data-requires-permission]").forEach((el) => {
      const allowed = elementAllowed(el);
      const hideMode = el.hasAttribute("data-perm-hide");
      el.classList.toggle("perm-denied", !allowed);
      if (hideMode) el.classList.toggle("perm-hidden", !allowed);
      // Distinguish "signed out entirely" from "signed in, but this level lacks
      // the capability" so the UI can show an accurate hint (not a false
      // "sign in to operate" when someone IS signed in). See the CSS label rules.
      el.classList.toggle("perm-denied-guest", !allowed && !isSignedIn());
      el.classList.toggle("perm-denied-auth", !allowed && isSignedIn());
      // Enforce on the ACTUAL controls: the element itself if it is a control,
      // otherwise every focusable control inside the gated container. The old code
      // only handled the former, so buttons inside a gated <section> stayed live
      // (only CSS pointer-events:none, which scripted/AT activation bypasses).
      const isControl = el.matches(CONTROL_SELECTOR);
      const controls = isControl ? [el] : Array.from(el.querySelectorAll(CONTROL_SELECTOR));
      controls.forEach((ctrl) => setControlDenied(ctrl, !allowed));
    });
    driveAdvanced();
    updateAccountChip();
    updateSettingsAccount();
  }
  let applyScheduled = false;
  function scheduleApply() {
    if (applyScheduled) return;
    applyScheduled = true;
    requestAnimationFrame(() => { applyScheduled = false; apply(); });
  }

  // ---- Account chip (near the machine title) --------------------------------
  let accountChipEl = null;
  function installAccountChip() {
    const left = document.querySelector(".topbar-left");
    if (!left || accountChipEl) return;
    accountChipEl = h("button", {
      class: "perm-account-chip", type: "button",
      "aria-label": "Account — sign in / out",
      onclick: () => { if (isSignedIn()) openAccountMenu(); else openLogin(); },
    });
    left.appendChild(accountChipEl);
    updateAccountChip();
  }
  function updateAccountChip() {
    if (!accountChipEl) return;
    accountChipEl.innerHTML = "";
    accountChipEl.classList.toggle("is-signed-in", isSignedIn());
    const text = h("span", { class: "perm-account-chip-text" },
      h("span", { class: "perm-account-chip-name" }, currentUser ? currentUser.name : "Sign in"),
      h("span", { class: "perm-account-chip-level" }, currentLevelName()));
    accountChipEl.append(avatarEl(currentUser, "perm-avatar-sm"), text);
    accountChipEl.title = currentUser ? `${currentUser.name} — ${currentLevelName()}` : "Sign in";
  }

  // ---- Settings header account block ----------------------------------------
  let settingsAccountEl = null;
  function installSettingsAccount() {
    const header = document.querySelector("#topbarSettingsMenu .topbar-settings-header");
    if (!header || settingsAccountEl) return;
    settingsAccountEl = h("div", { class: "perm-settings-account" });
    // Place as a full-width block directly BELOW the "Settings" title (not inside
    // the flex header row, which would collide with the title).
    header.insertAdjacentElement("afterend", settingsAccountEl);
    updateSettingsAccount();
  }
  function updateSettingsAccount() {
    if (!settingsAccountEl) return;
    settingsAccountEl.innerHTML = "";
    const info = h("div", { class: "perm-settings-account-info" },
      avatarEl(currentUser, "perm-avatar-lg"),
      h("div", { class: "perm-settings-account-text" },
        h("span", { class: "perm-settings-account-name" }, currentUser ? currentUser.name : "Not signed in"),
        h("span", { class: "perm-settings-account-level" }, currentLevelName())));
    const actions = h("div", { class: "perm-settings-account-actions" });
    if (isSignedIn()) {
      actions.appendChild(h("button", { class: "btn-secondary", type: "button", onclick: signOut }, "Sign out"));
    } else {
      actions.appendChild(h("button", { class: "btn-primary", type: "button", onclick: openLogin }, "Sign in"));
    }
    settingsAccountEl.append(info, actions);
  }

  // ---- Login modal ----------------------------------------------------------
  function openLogin() {
    ensureRoot();
    let error = null;
    let busy = false;
    // Create the inputs ONCE and reuse them across re-renders. A repaint clears
    // rootEl, but re-appending the SAME nodes keeps whatever the operator typed
    // (and their event listeners) intact — otherwise "Signing in…" / an error blanks
    // the fields and the button feels dead on a touch panel.
    const userInput = h("input", { class: "perm-inline-input", type: "text", autocomplete: "username", "aria-label": "Username", placeholder: "Username" });
    const passInput = h("input", { class: "perm-inline-input", type: "password", autocomplete: "current-password", "aria-label": "Password", placeholder: "Password" });
    const submit = async () => {
      if (busy) return;
      const username = userInput.value.trim();
      const password = passInput.value;
      if (!username || !password) { error = "Enter a username and password."; render(); return; }
      busy = true; error = null; render();
      try {
        const res = await fetch(LOGIN_API, { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }) });
        if (res.ok) {
          const data = await res.json();
          closeOverlay();
          setUser(data.user);
          return;
        }
        error = res.status === 401 ? "Username or password not recognised."
          : (res.status === 404 || res.status === 405) ? "Sign-in service unavailable — the viewer server may need a restart."
          : "Sign-in failed. Try again.";
      } catch (_e) {
        error = "Could not reach the server.";
      }
      busy = false; render();
    };
    [userInput, passInput].forEach((inp) => inp.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); }));
    const render = () => {
      rootEl.innerHTML = "";
      const card = h("div", { class: "perm-modal-card", role: "dialog", "aria-modal": "true" },
        h("div", { class: "perm-modal-head" }, h("h3", null, "Sign in"),
          h("button", { class: "perm-icon-btn", type: "button", "aria-label": "Close", onclick: closeOverlay }, "✕")),
        h("p", { class: "perm-modal-note" }, "Enter your operator credentials. Your access level is set by your account."),
        h("div", { class: "perm-field" }, h("label", null, "Username"), userInput),
        h("div", { class: "perm-field" }, h("label", null, "Password"), passInput),
        error ? h("p", { class: "perm-error" }, error) : null,
        h("div", { class: "perm-modal-actions" },
          h("button", { class: "perm-btn-quiet", type: "button", onclick: closeOverlay }, "Cancel"),
          h("button", { class: "perm-btn-primary", type: "button", disabled: busy ? true : false, onclick: submit }, busy ? "Signing in…" : "Sign in")));
      rootEl.append(h("div", { class: "perm-modal-backdrop", onclick: backdropClose }), h("div", { class: "perm-modal-shell" }, card));
    };
    render();
    userInput.focus();
  }

  // ---- Account menu (signed in) ---------------------------------------------
  function openAccountMenu() {
    ensureRoot();
    rootEl.innerHTML = "";
    const card = h("div", { class: "perm-modal-card", role: "dialog", "aria-modal": "true" },
      h("div", { class: "perm-modal-head" }, h("h3", null, "Account"),
        h("button", { class: "perm-icon-btn", type: "button", "aria-label": "Close", onclick: closeOverlay }, "✕")),
      h("div", { class: "perm-account-summary" },
        avatarEl(currentUser, "perm-avatar-lg"),
        h("div", { class: "perm-settings-account-text" },
          h("span", { class: "perm-settings-account-name" }, currentUser ? currentUser.name : ""),
          h("span", { class: "perm-settings-account-level" }, currentLevelName()))),
      h("div", { class: "perm-modal-actions" },
        isGod() ? h("button", { class: "perm-btn-quiet", type: "button", onclick: openAdmin }, "Manage modes") : null,
        h("button", { class: "perm-btn-primary", type: "button", onclick: signOut }, "Sign out")));
    rootEl.append(h("div", { class: "perm-modal-backdrop", onclick: backdropClose }), h("div", { class: "perm-modal-shell" }, card));
  }

  // ---- Admin: modes & permission matrix (God only) --------------------------
  function openAdmin() {
    if (!isGod()) return;
    ensureRoot();
    let tab = "matrix";
    const render = () => {
      rootEl.innerHTML = "";
      const body = h("div", { class: "perm-dash-body" });
      if (tab === "matrix") body.appendChild(renderMatrix());
      else if (tab === "users") body.appendChild(renderUsers());
      else body.appendChild(renderRoles(render));
      const card = h("div", { class: "perm-dash-card", role: "dialog", "aria-modal": "true" },
        h("div", { class: "perm-modal-head" }, h("h3", null, "Modes & Permissions"),
          h("button", { class: "perm-icon-btn", type: "button", "aria-label": "Close", onclick: closeOverlay }, "✕")),
        h("div", { class: "perm-tabs" },
          tabBtn("Permissions", "matrix", tab, () => { tab = "matrix"; render(); }),
          tabBtn("Modes", "roles", tab, () => { tab = "roles"; render(); }),
          tabBtn("Users", "users", tab, () => { tab = "users"; render(); })),
        body,
        h("div", { class: "perm-dash-foot" },
          h("span", { class: "perm-dash-current" }, `Signed in: ${currentUser?.name || ""}`),
          h("div", { class: "perm-modal-actions" },
            h("button", { class: "perm-btn-quiet", type: "button", onclick: closeOverlay }, "Close"),
            h("button", { class: "perm-btn-primary", type: "button", onclick: async () => { await saveConfig(); apply(); closeOverlay(); } }, "Save changes"))));
      rootEl.append(h("div", { class: "perm-modal-backdrop", onclick: backdropClose }), h("div", { class: "perm-modal-shell perm-modal-shell-wide" }, card));
    };
    render();
  }
  function tabBtn(label, id, active, onClick) {
    return h("button", { class: "perm-tab" + (active === id ? " is-active" : ""), type: "button", onclick: onClick }, label);
  }
  async function saveConfig() {
    try {
      await fetch(CONFIG_API, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) });
    } catch (_e) {}
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
        const checked = (role.permissions || []).includes(cap.key);
        const cb = h("input", { type: "checkbox", checked: checked || locked, disabled: locked,
          onchange: (e) => {
            const set = new Set(role.permissions || []);
            if (e.target.checked) set.add(cap.key); else set.delete(cap.key);
            role.permissions = Array.from(set);
            if (currentUser && currentUser.roleId === role.id) { currentUser.permissions = role.permissions.slice(); apply(); }
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
          onclick: () => { config.roles = config.roles.filter((r) => r.id !== role.id); rerender(); } }, "Delete")));
    }
    wrap.appendChild(h("button", { class: "perm-btn-primary perm-add", type: "button",
      onclick: () => { const id = "role_" + Math.abs(hashString(String(config.roles.length) + config.roles.map((r) => r.id).join(","))); config.roles.push({ id, name: "New mode", builtin: false, rank: 2, permissions: [] }); rerender(); } }, "+ Add custom mode"));
    return wrap;
  }
  function renderUsers() {
    // Read-only list — accounts + their level. Credentials are managed server-side
    // (passwords are hashed and never exposed here).
    const wrap = h("div", { class: "perm-list" });
    wrap.appendChild(h("p", { class: "perm-modal-note" }, "Accounts and their mode level. Passwords are stored hashed on the machine and are managed by editing the users table on the backend."));
    for (const user of config.users || []) {
      const role = getRole(user.roleId);
      wrap.appendChild(h("div", { class: "perm-list-row" },
        avatarEl(user, "perm-avatar-sm"),
        h("span", { class: "perm-inline-label" }, user.name),
        h("span", { class: "perm-badge" }, user.username ? "@" + user.username : ""),
        h("span", { class: "perm-inline-label" }, role ? role.name : user.roleId)));
    }
    if (!(config.users || []).length) wrap.appendChild(h("p", { class: "perm-modal-note" }, "No accounts found."));
    return wrap;
  }
  function hashString(s) { let k = 0; for (let i = 0; i < s.length; i += 1) k = (k * 31 + s.charCodeAt(i)) | 0; return k; }

  // ---- Boot -----------------------------------------------------------------
  async function init() {
    loadSession();
    installAccountChip();
    installSettingsAccount();
    apply();
    emit();
    await loadConfig();
    // If restored session references a role whose permissions changed, refresh them.
    if (currentUser) {
      const role = getRole(currentUser.roleId);
      if (role) { currentUser.roleName = role.name; currentUser.permissions = (role.permissions || []).slice(); }
      startIdleWatch();
    }
    apply();
    emit();
    const obs = new MutationObserver(() => scheduleApply());
    obs.observe(document.body, { childList: true, subtree: true });
  }

  window.MeltioPermissions = {
    init, hasPermission, can: hasPermission, isGod, isSignedIn,
    currentUser: () => currentUser,
    openLogin, signOut, refresh: apply, onChange,
    catalog: PERMISSION_CATALOG,
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
