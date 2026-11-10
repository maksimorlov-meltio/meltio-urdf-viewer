// The embedded-slicer pane: the lazily-iframed slicer UI, its flyout off the
// Files menu, the fullscreen slice view and the docked-print variant that sits
// above the bottom nav. Extracted verbatim from urdf_viewer.js (step-5 phase
// B3f).
//
// DOM only, no THREE. The pane owns its five state fields, its seven elements
// and its own listeners; the print-flow flags it reads come from
// hmi/state/printFlowState.js rather than from deps, which is what the
// preceding phase was for.
//
// Mirrors the WPF host's slicer-dock surface.

import {
  filesListCollapsedForPrint,
  setAutoSliceFlowActive,
} from "./state/printFlowState.js";

export function createSlicerPaneUi({
  markUserActivity,
  updateBottomNavState,
  isCloudModelMenuOpen,
  getCloudModelPopupEl,
  getSelectedFileName,
  setSelectedCloudLibraryFile,
  setCloudFileRowSliceStatus,
  loadCloudOverlayFromSelectedFile,
}) {
  const paneEl = document.getElementById("slicerPane");
  const frameEl = document.getElementById("slicerFrame");
  const fallbackEl = document.getElementById("slicerFallback");
  const reloadButtonEl = document.getElementById("slicerReloadButton");
  const embedToggleEl = document.getElementById("slicerEmbedToggle");
  const embedWrapEl = document.getElementById("slicerEmbedWrap");
  const menuCloseEl = document.getElementById("slicerMenuClose");
  const chosenFileEl = document.getElementById("slicerChosenFile");

  // --- Embedded slicer (Files-menu right pane) -------------------------------
  // Lazily loads the slicer web UI into the Files menu when it first opens.
  // Talks to the backend `/api/slicer/status`; if a slicer is configured it
  // iframes the same-origin `/slicer` entry, otherwise it shows a graceful
  // placeholder so the Files menu stays usable with no slicer running.
  let embedState = "idle"; // idle | loading | ready | unavailable
  let embedUrl = null;
  let embedInFlight = false;
  // How the slicer is reached, from /api/slicer/status: "legacy" is the
  // vendored standalone slicer (`/slicer?dock=1&stl=<url>`), "platform" is
  // the Meltio platform's slicer proxied same-origin under /slicer/
  // (`/slicer/?embed=1&part=<id>`), "none" is not configured or not asked yet.
  let embedMode = "none";
  let embedQuery = "dock=1";
  let statusPromise = null;
  // Platform mode: which HMI file became which platform part, so the iframe's
  // `slice-saved` can badge the right Files row.
  const platformFileByPart = new Map();
  let lastPlatformSlice = null;

  // The slicer is a flyout panel anchored to the top-right corner of the Files
  // menu, opened/closed on demand — not shown permanently in the viewer.
  let isMenuOpen = false;
  // When true, the slicer takes the whole view (full slice UI) and the robot
  // model + Files menu are hidden via the `slicer-fullscreen` body class. This
  // is the "prepare a slice" phase; "Load to viewer" leaves it and drops the
  // part into the 3D scene.
  let isFullscreen = false;

  function showFallback(message) {
    if (frameEl) {
      frameEl.hidden = true;
      frameEl.src = "about:blank";
    }
    if (fallbackEl) {
      fallbackEl.hidden = false;
      fallbackEl.textContent = message;
    }
  }

  function showFrame(url) {
    if (!frameEl) {
      return;
    }
    if (frameEl.src !== url && !(frameEl.src.endsWith(url) && url.startsWith("/"))) {
      frameEl.src = url;
    }
    frameEl.hidden = false;
    if (fallbackEl) {
      fallbackEl.hidden = true;
    }
  }

  // Ask the backend how the slicer is reached. Cached; `force` re-asks. It
  // does NOT touch the iframe (refreshEmbed does) - it is kicked off at
  // creation so the mode is known by the time an operator taps "Load to
  // slicer". Resolves to the status, or null when no slicer is configured.
  function loadStatus(options = {}) {
    const { force = false } = options;
    if (statusPromise && !force) {
      return statusPromise;
    }
    statusPromise = fetch("/api/slicer/status", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.json();
      })
      .then((status) => {
        const configured = Boolean(
          status && status.configured && typeof status.url === "string",
        );
        embedMode = configured ? String(status.mode || "legacy") : "none";
        embedQuery = configured && typeof status.embedQuery === "string"
          ? status.embedQuery
          : "dock=1";
        return configured ? status : null;
      })
      .catch((error) => {
        // A failed probe is not an answer: forget it so the next call re-asks.
        statusPromise = null;
        throw error;
      });
    return statusPromise;
  }

  async function refreshEmbed(options = {}) {
    if (!frameEl && !fallbackEl) {
      return;
    }
    const { force = false } = options;
    if (embedInFlight) {
      return;
    }
    if (embedState === "ready" && !force) {
      return;
    }

    embedInFlight = true;
    embedState = "loading";
    if (embedUrl === null) {
      showFallback("Loading slicer...");
    }

    try {
      const status = await loadStatus({ force });
      if (status) {
        embedUrl = status.url;
        embedState = "ready";
        // legacy: dock=1 → the embedded bottom-bar layout (forwarded by
        // /slicer); platform: embed=1 → the platform slicer hides its own
        // header. The query comes from the backend so the two never disagree.
        const base = `${status.url}?${embedQuery}`;
        const target = force ? `${base}&t=${Date.now()}` : base;
        showFrame(target);
      } else {
        embedUrl = null;
        embedState = "unavailable";
        showFallback(
          "Slicer not connected. Set AVIS_SLICER_URL (or AVIS_PLATFORM_URL) to embed the slicer here.",
        );
      }
    } catch (error) {
      embedState = "unavailable";
      showFallback(`Could not reach slicer status (${error?.message || "error"}).`);
    } finally {
      embedInFlight = false;
    }
  }

  // Toggle the embedded full-slicer pane inside the flyout. The full slicer app
  // is large, so it stays collapsed by default and expands the flyout on demand.
  function setEmbedOpen(open) {
    const willOpen = Boolean(open);
    if (embedWrapEl) {
      embedWrapEl.hidden = !willOpen;
    }
    if (embedToggleEl) {
      embedToggleEl.setAttribute("aria-expanded", willOpen ? "true" : "false");
      embedToggleEl.textContent = willOpen ? "Hide full slicer" : "Open full slicer";
    }
    if (paneEl) {
      paneEl.classList.toggle("slicer-embed-open", willOpen);
    }
    if (willOpen) {
      refreshEmbed().catch(() => {});
    }
    positionMenu();
  }

  function updateChosenFileLabel() {
    if (!chosenFileEl) {
      return;
    }
    const name = String(getSelectedFileName() || "").trim();
    chosenFileEl.textContent = name ? `File: ${name}` : "No file selected";
  }

  function setFullscreen(open, options = {}) {
    // preserveIframe: leave the (already-loaded, possibly-sliced) slicer iframe
    // intact instead of blanking it. Used for the material-block detour to
    // Materials so "Return to slicer" restores the same sliced, print-ready view
    // WITHOUT a reload — a reload re-slices from scratch and the fresh slicer
    // emits a mesh-only update that clears the row's "ready" status (the
    // reported "lost slice" bug). The .slicer-fullscreen class removal hides the
    // iframe via CSS while Materials is open, so the preserved frame stays
    // parked.
    const { preserveIframe = false } = options;
    isFullscreen = Boolean(open);
    document.body.classList.toggle("slicer-fullscreen", isFullscreen);
    if (isFullscreen) {
      // Drop the anchored inline geometry so the fullscreen CSS (inset:0) wins;
      // positionMenu() would otherwise re-anchor to the (now hidden) Files popup
      // and leave a tiny sliver.
      if (paneEl) {
        paneEl.style.left = "";
        paneEl.style.top = "";
        paneEl.style.maxHeight = "";
      }
      updateChosenFileLabel();
      // Reveal the embedded full slicer area (the iframe src is set per-file by
      // loadIframeForFile).
      if (embedWrapEl) {
        embedWrapEl.hidden = false;
      }
    } else if (frameEl) {
      if (preserveIframe) {
        // Keep the loaded slicer alive and its wrap visible; the CSS-hidden
        // embed section keeps it off-screen until we reopen full view.
        if (embedWrapEl) {
          embedWrapEl.hidden = false;
        }
      } else {
        // Leaving full view: stop the slicer iframe so it isn't polling in the
        // background, and hide its area. The embed is no longer "ready" once
        // its frame is blank - without this the next refreshEmbed() would
        // short-circuit on the stale state and platform mode would reopen
        // Files onto an empty frame.
        frameEl.src = "about:blank";
        frameEl.hidden = true;
        embedState = "idle";
        if (embedWrapEl) {
          embedWrapEl.hidden = true;
        }
      }
    }
  }

  // Point the embedded slicer at one of our STL files so it auto-loads that
  // model (the slicer reads ?stl=<url> and fetches it; /slicer forwards the
  // param, and CORS lets the slicer's origin fetch /api/stl/file). All slicer
  // tools stay available on the loaded model.
  function loadIframeForFile(fileName) {
    if (!frameEl) {
      return;
    }
    const name = String(fileName || "").trim();
    if (embedMode === "platform") {
      loadPlatformPartForFile(name).catch((error) => {
        showFallback(`Could not hand ${name} to the platform (${error?.message || "error"}).`);
      });
      return;
    }
    const stlUrl = `${window.location.origin}/api/stl/file?name=${encodeURIComponent(name)}`;
    // dock=1 → the slicer renders its embedded bottom-bar layout.
    frameEl.src = `/slicer?dock=1&stl=${encodeURIComponent(stlUrl)}`;
    frameEl.hidden = false;
    if (fallbackEl) {
      fallbackEl.hidden = true;
    }
    if (embedWrapEl) {
      embedWrapEl.hidden = false;
    }
  }

  // Platform mode: the current slicer opens platform PARTS (`?part=<id>`), not
  // STL URLs. Hand the HMI file over through the backend - it carries the
  // HMI's platform identity, the browser never does - then open that part in
  // the embedded slicer. Resolves to the part id.
  async function loadPlatformPartForFile(name) {
    if (fallbackEl) {
      fallbackEl.hidden = false;
      fallbackEl.textContent = `Sending ${name} to the platform...`;
    }
    const response = await fetch("/api/slicer/part-from-file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
      cache: "no-store",
    });
    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const body = await response.json();
        if (body && body.detail) {
          detail = String(body.detail);
        }
      } catch (_ignored) {
        /* non-JSON error body */
      }
      throw new Error(detail);
    }
    const payload = await response.json();
    const partId = String((payload && payload.partId) || "").trim();
    if (!partId) {
      throw new Error("the platform answered without a part id");
    }
    platformFileByPart.set(partId, name);
    showFrame(`/slicer/?${embedQuery}&part=${encodeURIComponent(partId)}`);
    if (embedWrapEl) {
      embedWrapEl.hidden = false;
    }
    return partId;
  }

  // Platform mode: the slicer tells its parent when a slice was SAVED to the
  // platform - `{type:"slice-saved", partId, version}`, posted to
  // location.origin, which is why the proxy must keep everything same-origin.
  // Sender-checked like the host's handlers: the event must come from OUR
  // iframe's window, not merely carry the right shape. Returns whether it was
  // consumed.
  function handleFrameMessage(event) {
    if (!frameEl || !frameEl.contentWindow || !event || event.source !== frameEl.contentWindow) {
      return false;
    }
    if (event.origin !== window.location.origin) {
      return false;
    }
    const data = event.data;
    if (!data || data.type !== "slice-saved" || !data.partId) {
      return false;
    }
    const partId = String(data.partId);
    const fileName = platformFileByPart.get(partId) || null;
    lastPlatformSlice = {
      partId,
      version: data.version === undefined ? null : data.version,
      fileName,
    };
    if (fileName) {
      setCloudFileRowSliceStatus(fileName, "saved");
    }
    return true;
  }

  // Platform mode: pressing Files IS the hand-off. The host calls this right
  // after opening the Files menu; in platform mode the pane takes the full view
  // with the platform slicer (its own part picker lists the org's parts) and
  // the local file list waits behind the pane's close button. Returns whether
  // it took over, so legacy mode is untouched.
  function openForFilesMenu() {
    if (embedMode !== "platform") {
      return false;
    }
    setMenuOpen(true);
    refreshEmbed().catch(() => {});
    return isMenuOpen;
  }

  // "Load to slicer" from a Files-list row: open the full slicer (all its tools)
  // with the chosen file auto-loaded, and warm the viewer-side slice in the
  // background so the later "Load to viewer" 3D print sim is ready.
  function loadFileToSlicer(fileName) {
    setAutoSliceFlowActive(true);
    setSelectedCloudLibraryFile(fileName, { updateSelect: true, syncDataset: true });
    updateChosenFileLabel();

    // Open the full-view slicer now, then point its iframe at the chosen STL.
    if (isCloudModelMenuOpen()) {
      setMenuOpen(true);
    }
    loadIframeForFile(fileName);

    if (embedMode === "platform") {
      // No viewer-side slice to warm: the platform slicer saves to the
      // platform (badge "Saved to platform" arrives via slice-saved), and the
      // legacy /api/slice/proxy answers 503 in this mode - running it anyway
      // only races its failure path against that badge.
      return;
    }
    setCloudFileRowSliceStatus(fileName, "slicing");

    // Warm the viewer-side slice (used by "Load to viewer") behind the slicer.
    loadCloudOverlayFromSelectedFile()
      .then(() => updateChosenFileLabel())
      .catch((error) => {
        console.warn("[slicer] load-to-slicer failed:", error?.message || error);
      });
  }

  // Docked-print flyout: sit the pane just ABOVE the bottom nav, centred,
  // opening upward. Measured off the nav so it clears it whatever its height.
  function positionMenuDocked() {
    if (!paneEl || paneEl.hidden) {
      return;
    }
    const navEl = document.querySelector(".bottom-nav");
    if (!navEl) {
      return;
    }
    const navRect = navEl.getBoundingClientRect();
    const gap = 12;
    paneEl.style.top = "";
    paneEl.style.left = "50%";
    paneEl.style.right = "auto";
    paneEl.style.transform = "translateX(-50%)";
    paneEl.style.bottom = `${Math.round(window.innerHeight - navRect.top + gap)}px`;
    paneEl.style.maxHeight = `${Math.max(180, Math.round(navRect.top - gap - 24))}px`;
  }

  function positionMenu() {
    const popupEl = getCloudModelPopupEl();
    if (!paneEl || !popupEl || paneEl.hidden) {
      return;
    }
    // Clear any docked-flyout inline styles so the Files-anchored position wins.
    paneEl.style.bottom = "";
    paneEl.style.transform = "";
    if (isFullscreen) {
      // Fullscreen geometry is owned entirely by CSS; the Files popup is hidden
      // so its rect is unusable for anchoring.
      return;
    }
    if (filesListCollapsedForPrint) {
      // Detached (fixed) position is handled by CSS while the list is collapsed.
      return;
    }
    const rect = popupEl.getBoundingClientRect();
    const gap = 12;
    const menuWidth = paneEl.offsetWidth || 360;
    let left = rect.right + gap;
    const maxLeft = window.innerWidth - menuWidth - 12;
    if (left > maxLeft) {
      left = Math.max(12, maxLeft);
    }
    paneEl.style.left = `${Math.round(left)}px`;
    paneEl.style.top = `${Math.round(rect.top)}px`;
    paneEl.style.maxHeight = `${Math.round(rect.height)}px`;
  }

  function setMenuOpen(isOpen) {
    // The slicer flyout makes sense while the Files menu is open OR while a
    // print is docked (where it's the upward Slicer-button flyout of print
    // controls).
    isMenuOpen = Boolean(isOpen) && (isCloudModelMenuOpen() || filesListCollapsedForPrint);
    if (paneEl) {
      paneEl.hidden = !isMenuOpen;
      paneEl.setAttribute("aria-hidden", isMenuOpen ? "false" : "true");
    }
    if (isMenuOpen) {
      // A fresh open from the Files menu takes the whole view for slicing. While
      // a print is docked it stays compact (the upward flyout of print controls).
      if (!filesListCollapsedForPrint) {
        setFullscreen(true);
      }
    } else {
      // Closing the flyout leaves full view and collapses the embed so it
      // reopens compact next time.
      setFullscreen(false);
    }
    // NOTE: there is no #slicerMenuToggle in urdf.html and there never has
    // been — the bottom-nav Slicer button is what opens this pane. The old
    // lookup, its aria-expanded update and its click listener were dead code
    // hidden inside the host, where tools/check_dead_lookups.mjs does not
    // reach; moving the domain into hmi/ is what surfaced them.
    if (isMenuOpen && !filesListCollapsedForPrint) {
      positionMenu();
    } else if (isMenuOpen && filesListCollapsedForPrint) {
      positionMenuDocked();
    }
    // NOTE: while a print is docked, closing the flyout must NOT expand the
    // Files list — the docked print bar (Stop/Pause/Slicer) stays put. The list
    // only comes back on Stop.
    updateBottomNavState();
  }

  /** Drop the anchored inline geometry so a CSS-driven position can take over
   *  (the detached corner while the Files list is collapsed for a print). */
  function clearAnchoredGeometry() {
    if (!paneEl) {
      return;
    }
    paneEl.style.left = "";
    paneEl.style.top = "";
    paneEl.style.maxHeight = "";
  }

  // --- Listener wiring (moved with the domain) -------------------------------
  if (reloadButtonEl) {
    reloadButtonEl.addEventListener("click", () => {
      // Reload the slicer with the currently chosen file still selected.
      const name = String(getSelectedFileName() || "").trim();
      if (name) {
        loadIframeForFile(name);
      } else {
        refreshEmbed({ force: true }).catch(() => {});
      }
    });
  }

  if (embedToggleEl) {
    embedToggleEl.addEventListener("click", () => {
      markUserActivity();
      setEmbedOpen(embedWrapEl ? embedWrapEl.hidden : true);
    });
  }

  if (menuCloseEl) {
    menuCloseEl.addEventListener("click", () => {
      markUserActivity();
      setMenuOpen(false);
    });
  }

  window.addEventListener("message", handleFrameMessage);

  // Learn the mode early (one small GET); a failure here is silent - the first
  // real use re-asks and reports through the pane's fallback text.
  loadStatus().catch(() => {});

  return {
    refreshEmbed,
    loadStatus,
    loadPlatformPartForFile,
    openForFilesMenu,
    handleFrameMessage,
    getMode: () => embedMode,
    getLastPlatformSlice: () => lastPlatformSlice,
    setEmbedOpen,
    setFullscreen,
    setMenuOpen,
    positionMenu,
    positionMenuDocked,
    loadIframeForFile,
    loadFileToSlicer,
    updateChosenFileLabel,
    clearAnchoredGeometry,
    isMenuOpen: () => isMenuOpen,
    isFullscreen: () => isFullscreen,
    getEmbedState: () => embedState,
    /** The embedded slicer's window, or null.
     *
     *  The host's postMessage handler authenticates the SENDER against this —
     *  `event.source === getFrameWindow()` — rather than trusting the spoofable
     *  `event.data.source` string, because a slicer message can start a print.
     *  Returning null (no iframe yet) must therefore fail the check, not pass
     *  it; every caller compares for identity, and `event.source` is never
     *  null. */
    getFrameWindow: () => (frameEl ? frameEl.contentWindow : null),
  };
}
