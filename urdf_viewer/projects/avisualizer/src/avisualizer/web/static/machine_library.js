// Machine program library — a read-only browse panel for the Files menu.
//
// Shows the machine's stored G-code programs (local library) and the Meltio Cloud
// catalog, each with a thumbnail, name and details. Data comes from the viewer
// backend's read-only proxy (GET /api/machine/library, images via
// /api/machine/library/image), which forwards to the M600's ControlService.
//
// This is a self-contained add-on, deliberately NOT part of the bundled app:
// the backend injects it into /urdf only when a real machine is configured
// (window.AVIS_MACHINE.enabled), so the standalone demo is completely unaffected.
// Browse-only — it never sends a command to the machine.
(function () {
  "use strict";

  var cfg = (typeof window !== "undefined" && window.AVIS_MACHINE) || {};
  if (!cfg.enabled) return; // no machine configured → do nothing

  var REFRESH_MIN_MS = 5000;
  var lastFetch = 0;
  var inFlight = false;
  var listEl = null;
  var statusEl = null;

  function fmtSize(bytes) {
    if (typeof bytes !== "number" || !isFinite(bytes) || bytes <= 0) return null;
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function fmtDate(iso) {
    if (!iso || typeof iso !== "string") return null;
    var t = Date.parse(iso);
    if (isNaN(t) || t <= 0) return null;
    try {
      return new Date(t).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    } catch (e) {
      return null;
    }
  }

  function metaLine(item) {
    var parts = [];
    var size = fmtSize(item.sizeBytes);
    if (size) parts.push(size);
    if (typeof item.layerCount === "number" && item.layerCount > 0) parts.push(item.layerCount + " layers");
    var date = fmtDate(item.addedAt);
    if (date) parts.push(date);
    if (item.version) parts.push("v" + item.version);
    return parts.join("  ·  ");
  }

  function imageUrl(item, variant) {
    return (
      "/api/machine/library/image?kind=" +
      encodeURIComponent(item.kind) +
      "&id=" +
      encodeURIComponent(item.id) +
      "&variant=" +
      variant
    );
  }

  function makeRow(item) {
    var row = document.createElement("li");
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "machine-library-row";

    if (item.hasThumbnail) {
      var img = document.createElement("img");
      img.className = "machine-library-thumb";
      img.alt = "";
      img.loading = "lazy";
      img.src = imageUrl(item, "thumbnail");
      img.addEventListener("error", function () {
        img.replaceWith(fallbackThumb());
      });
      btn.appendChild(img);
    } else {
      btn.appendChild(fallbackThumb());
    }

    var body = document.createElement("div");
    body.className = "machine-library-body";
    var name = document.createElement("div");
    name.className = "machine-library-name";
    name.textContent = item.name || item.id || "(unnamed)";
    name.title = name.textContent;
    body.appendChild(name);
    var meta = document.createElement("div");
    meta.className = "machine-library-meta";
    meta.textContent = metaLine(item) || item.source || "";
    body.appendChild(meta);
    btn.appendChild(body);

    var tag = document.createElement("span");
    tag.className = "machine-library-tag" + (item.kind === "cloud" ? " is-cloud" : "");
    tag.textContent = item.kind === "cloud" ? "Cloud" : "Local";
    btn.appendChild(tag);

    // Read-only: clicking toggles an inline large preview, nothing else.
    var preview = null;
    btn.addEventListener("click", function () {
      if (preview) {
        preview.remove();
        preview = null;
        return;
      }
      if (!item.hasPreview) return;
      preview = document.createElement("div");
      preview.className = "machine-library-preview";
      var big = document.createElement("img");
      big.alt = "";
      big.src = imageUrl(item, "preview");
      big.addEventListener("error", function () {
        if (preview) {
          preview.remove();
          preview = null;
        }
      });
      preview.appendChild(big);
      btn.appendChild(preview);
    });

    row.appendChild(btn);
    return row;
  }

  function fallbackThumb() {
    var span = document.createElement("span");
    span.className = "machine-library-thumb-fallback";
    span.setAttribute("aria-hidden", "true");
    span.textContent = "▤";
    return span;
  }

  function renderGroup(label, items) {
    var frag = document.createDocumentFragment();
    var head = document.createElement("div");
    head.className = "machine-library-group-label";
    head.textContent = label + " (" + items.length + ")";
    frag.appendChild(head);
    items.forEach(function (item) {
      frag.appendChild(makeRow(item));
    });
    return frag;
  }

  function cloudLine(cloudStatus, cloudCount) {
    // One-line summary for the Meltio Cloud group header. When models are present
    // just count them; the connection state matters most when there are none
    // (it explains WHY the list is empty).
    if (cloudCount) return "Meltio Cloud (" + cloudCount + ")";
    if (cloudStatus && cloudStatus.connected) return "Meltio Cloud — connected · no models yet";
    return "Meltio Cloud — not connected";
  }

  function render(data, cloudStatus) {
    if (!listEl) return;
    listEl.textContent = "";
    var local = (data && Array.isArray(data.local)) ? data.local : [];
    var cloud = (data && Array.isArray(data.cloud)) ? data.cloud : [];

    // Local programs.
    if (local.length) listEl.appendChild(renderGroup("On this machine", local));

    // Meltio Cloud — always show the group so its connection state is visible.
    var cloudHead = document.createElement("div");
    cloudHead.className = "machine-library-group-label";
    cloudHead.textContent = cloudLine(cloudStatus, cloud.length);
    listEl.appendChild(cloudHead);
    if (cloud.length) {
      cloud.forEach(function (item) { listEl.appendChild(makeRow(item)); });
    } else if (cloudStatus && !cloudStatus.connected) {
      var hint = document.createElement("p");
      hint.className = "machine-library-status";
      hint.textContent = cloudStatus.note
        ? cloudStatus.note
        : "Pair the machine to Meltio Cloud to browse cloud models here.";
      listEl.appendChild(hint);
    }

    if (!local.length && !cloud.length && cloudStatus && cloudStatus.connected) {
      statusEl.textContent = "No programs on the machine yet.";
      statusEl.hidden = false;
    } else {
      statusEl.hidden = true;
    }
  }

  function fetchLibrary(force) {
    var now = Date.now();
    if (inFlight) return;
    if (!force && now - lastFetch < REFRESH_MIN_MS) return;
    inFlight = true;
    lastFetch = now;
    if (statusEl && (!listEl || !listEl.childNodes.length)) {
      statusEl.textContent = "Loading programs…";
      statusEl.hidden = false;
    }
    function getJson(url) {
      return fetch(url, { cache: "no-store" }).then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      });
    }
    Promise.all([
      getJson("/api/machine/library"),
      // Cloud status is best-effort: a failure just means "unknown → offline".
      getJson("/api/machine/cloud-status").catch(function () { return null; }),
    ])
      .then(function (results) {
        render(results[0], results[1]);
      })
      .catch(function () {
        if (statusEl) {
          statusEl.textContent = "Machine offline — programs unavailable.";
          statusEl.hidden = false;
        }
      })
      .then(function () {
        inFlight = false;
      });
  }

  function buildPanel() {
    var panel = document.createElement("section");
    panel.className = "machine-library-panel";
    panel.setAttribute("aria-label", "Machine programs");

    var head = document.createElement("div");
    head.className = "machine-library-head";
    var title = document.createElement("h4");
    title.className = "machine-library-title";
    title.textContent = "Machine programs";
    head.appendChild(title);
    var refresh = document.createElement("button");
    refresh.type = "button";
    refresh.className = "machine-library-refresh";
    refresh.textContent = "Refresh";
    refresh.addEventListener("click", function () {
      fetchLibrary(true);
    });
    head.appendChild(refresh);
    panel.appendChild(head);

    statusEl = document.createElement("p");
    statusEl.className = "machine-library-status";
    statusEl.setAttribute("aria-live", "polite");
    statusEl.hidden = true;
    panel.appendChild(statusEl);

    listEl = document.createElement("ul");
    listEl.className = "machine-library-list";
    panel.appendChild(listEl);
    return panel;
  }

  function insertPanel() {
    var anchor =
      document.getElementById("cloudStlFileRow") ||
      document.getElementById("printSimPanel") ||
      document.getElementById("filesMaterialsPanel");
    if (!anchor || !anchor.parentNode) return false;
    var panel = buildPanel();
    anchor.parentNode.insertBefore(panel, anchor.nextSibling);

    // Fetch when the panel becomes visible (Files menu opened), and once now.
    if (typeof IntersectionObserver === "function") {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) fetchLibrary(false);
        });
      });
      io.observe(panel);
    }
    fetchLibrary(true);
    return true;
  }

  function start() {
    if (!insertPanel()) {
      // Files-menu markup not present yet — retry briefly, then give up quietly.
      var tries = 0;
      var timer = setInterval(function () {
        tries += 1;
        if (insertPanel() || tries > 20) clearInterval(timer);
      }, 250);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
