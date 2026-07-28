// Slicer bridge (extracted from urdf_viewer.js) — the viewer<->slicer frontier.
// Owns the embedded-slicer iframe lifecycle (health/reload/fallback), the trusted
// postMessage handling (slice-data + dock-ready), the slicer menu + fullscreen, and
// loading a file into the slicer. Bridged slice output + shared print/files state stay
// god-file-owned via ctx get/set (printSim is assigned later in eval, so it arrives as a
// getter); iframe-embed state is module-local. createSlicerBridge(ctx) -> { ...slicer API }.

export function createSlicerBridge(ctx) {
  const {
    alignCloudStlUnderHeadViaXY,
    applyCloudStlDisplayState,
    cloudFileSliceStatusByName,
    cloudModelPopupEl,
    cloudStlFileSelectEl,
    getBridgedSliceData,
    getCloudStlObject,
    getFilesListCollapsedForPrint,
    getIsCloudModelMenuOpen,
    getIsDockedPrintActive,
    getIsSlicerFullscreen,
    getIsSlicerMenuOpen,
    getPrintSim,
    getPrintSimAutoRunInProgress,
    getSelectedCloudLibraryFileName,
    loadCloudOverlayFromSelectedFile,
    setAutoSliceFlowActive,
    setBridgedSliceData,
    setBridgedToolpathFresh,
    setCloudFileRowSliceStatus,
    setIsSlicerFullscreen,
    setIsSlicerMenuOpen,
    setPrintHideStl,
    setPrintSimAutoRunInProgress,
    setSelectedCloudLibraryFile,
    slicerChosenFileEl,
    slicerEmbedToggleEl,
    slicerEmbedWrapEl,
    slicerFallbackEl,
    slicerFrameEl,
    slicerMenuToggleEl,
    slicerPaneEl,
    updateBottomNavState,
  } = ctx;

  let slicerEmbedState = "idle"; // idle | loading | ready | unavailable
  let slicerEmbedUrl = null;
  let slicerEmbedInFlight = false;
  let slicerDockReady = false;

  // --- postMessage trust boundary -------------------------------------------
  // The browser delivers `message` events from ANY origin (any other tab the
  // operator has open, any third-party frame, any popup). Several handlers below
  // act on these messages — injecting slice/toolpath geometry, triggering a
  // machine "Start print", and driving the chamber-O2 "safe to open" SAFETY
  // notice. Trusting only the spoofable `event.data.source` string would let a
  // hostile page start a print or fake an inert-atmosphere reading. So every
  // handler must verify the SENDER, not just the payload:
  //   * slicer messages are trusted only when they actually came from our own
  //     embedded slicer iframe's window (origin-independent, so it keeps working
  //     whatever origin AVIS_SLICER_UI_URL points at);
  //   * the M600 sensor bridge is trusted only when it is strictly same-origin
  //     (an external bridge origin must be added to the allowlist deliberately).
  function isTrustedSlicerMessage(event) {
    return Boolean(
      event
      && slicerFrameEl
      && slicerFrameEl.contentWindow
      && event.source === slicerFrameEl.contentWindow,
    );
  }

  function showSlicerFallback(message) {
    if (slicerFrameEl) {
      slicerFrameEl.hidden = true;
      slicerFrameEl.src = "about:blank";
    }
    if (slicerFallbackEl) {
      slicerFallbackEl.hidden = false;
      slicerFallbackEl.textContent = message;
    }
  }

  function showSlicerFrame(url) {
    if (!slicerFrameEl) {
      return;
    }
    if (slicerFrameEl.src !== url && !(slicerFrameEl.src.endsWith(url) && url.startsWith("/"))) {
      slicerFrameEl.src = url;
    }
    slicerFrameEl.hidden = false;
    if (slicerFallbackEl) {
      slicerFallbackEl.hidden = true;
    }
  }

  async function refreshSlicerEmbed(options = {}) {
    if (!slicerFrameEl && !slicerFallbackEl) {
      return;
    }
    const { force = false } = options;
    if (slicerEmbedInFlight) {
      return;
    }
    if (slicerEmbedState === "ready" && !force) {
      return;
    }

    slicerEmbedInFlight = true;
    slicerEmbedState = "loading";
    if (slicerEmbedUrl === null) {
      showSlicerFallback("Loading slicer...");
    }

    try {
      const response = await fetch("/api/slicer/status", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const status = await response.json();
      if (status && status.configured && typeof status.url === "string") {
        slicerEmbedUrl = status.url;
        slicerEmbedState = "ready";
        // dock=1 → embedded bottom-bar slicer layout (forwarded by the /slicer route).
        const base = `${status.url}?dock=1`;
        const target = force ? `${base}&t=${Date.now()}` : base;
        showSlicerFrame(target);
      } else {
        slicerEmbedUrl = null;
        slicerEmbedState = "unavailable";
        showSlicerFallback(
          "Slicer not connected. Set AVIS_SLICER_URL to embed the slicer here.",
        );
      }
    } catch (error) {
      slicerEmbedState = "unavailable";
      showSlicerFallback(`Could not reach slicer status (${error?.message || "error"}).`);
    } finally {
      slicerEmbedInFlight = false;
    }
  }

  // Toggle the embedded full-slicer pane inside the flyout. The full slicer app
  // is large, so it stays collapsed by default and expands the flyout on demand.
  function setSlicerEmbedOpen(open) {
    const willOpen = Boolean(open);
    if (slicerEmbedWrapEl) {
      slicerEmbedWrapEl.hidden = !willOpen;
    }
    if (slicerEmbedToggleEl) {
      slicerEmbedToggleEl.setAttribute("aria-expanded", willOpen ? "true" : "false");
      slicerEmbedToggleEl.textContent = willOpen ? "Hide full slicer" : "Open full slicer";
    }
    if (slicerPaneEl) {
      slicerPaneEl.classList.toggle("slicer-embed-open", willOpen);
    }
    if (willOpen) {
      refreshSlicerEmbed().catch(() => {});
    }
    positionSlicerMenu();
  }

  // Handle a fresh slice pushed by the embedded slicer. Invoked by the unified
  // message dispatcher (defined below, near applyChamberAtmosphere) once the
  // slicer origin gate has passed, so `data` is already trusted here.
  function handleSliceData(data) {
    setBridgedSliceData({
      toolpath: data.toolpath || null,
      thermal: data.thermal || null,
      mesh: data.mesh || null,
      // Build-plate centring point (mm) used by the slicer. Lets the viewer map
      // the slicer's plate origin onto the nozzle while preserving any offset the
      // user gave the model on the plate. See setupToolpathSource().
      plate: data.plate || null,
      // Real deposition movement speed (mm/s) for true-1x print playback.
      speedMmPerSec: Number.isFinite(data.speedMmPerSec) ? data.speedMmPerSec : null,
    });
    const hasMoves = Boolean(
      getBridgedSliceData().toolpath
      && Array.isArray(getBridgedSliceData().toolpath.moves)
      && getBridgedSliceData().toolpath.moves.length > 0,
    );
    if (hasMoves) {
      // A newer slice than whatever getPrintSim() last prepared — don't reuse the old one.
      setBridgedToolpathFresh(true);
      // The part now has a real toolpath — mark its Files row print-ready so the
      // per-row "Start print" (with placement preview) appears without needing to
      // return to the full slicer. There is only ONE bridged slice at a time, so
      // clear any other row's stale "ready" first — otherwise an older row's Start
      // print would run this newer part's toolpath.
      if (getSelectedCloudLibraryFileName()) {
        for (const [name, status] of Array.from(cloudFileSliceStatusByName.entries())) {
          if (status === "ready" && name !== getSelectedCloudLibraryFileName()) {
            setCloudFileRowSliceStatus(name, "");
          }
        }
        setCloudFileRowSliceStatus(getSelectedCloudLibraryFileName(), "ready");
      }
      // Reflect the slicer's exact orientation + placement in the main model:
      // prepare from this fresh slice and show the placed slicer solid as the
      // preview (the cloud STL keeps its loaded orientation, so we swap to the
      // slicer geometry, which carries the reorientation the operator applied).
      if (!getIsDockedPrintActive() && !getFilesListCollapsedForPrint() && getPrintSim() && !getPrintSimAutoRunInProgress()) {
        setPrintSimAutoRunInProgress(true);
        Promise.resolve(getPrintSim().prepare())
          .then(() => updateSlicerModelPreview())
          .catch(() => {})
          .finally(() => { setPrintSimAutoRunInProgress(false); });
      }
    } else {
      // Mesh-only update (e.g. a reorient/move in the slicer): the toolpath is now
      // stale, so the part is no longer print-ready. Clear its "Start print" and
      // drop back to the cloud STL until the operator re-slices.
      if (getSelectedCloudLibraryFileName()) {
        setCloudFileRowSliceStatus(getSelectedCloudLibraryFileName(), "");
      }
      if (!getIsDockedPrintActive() && !getFilesListCollapsedForPrint()) {
        updateSlicerModelPreview();
      }
    }
    // Live-match the preview to where the operator just placed the part on the
    // slicer plate (only while a preview is shown, not during a docked print —
    // that flow positions the gantry itself).
    if (getCloudStlObject() && !getIsDockedPrintActive()) {
      const placement = getSlicerPlacementWorldOffset();
      if (placement) {
        alignCloudStlUnderHeadViaXY(0.6, placement);
      }
    }
  }

  // Reflect the sliced part's exact orientation/placement in the "main model": when
  // a real toolpath is prepared and no print is running, show the placed slicer
  // solid (which carries the slicer's orientation) and hide the cloud STL; else
  // show the cloud STL. During a docked print, applyPrintModelSubstitution owns the
  // STL hide/show, so this no-ops then.
  function updateSlicerModelPreview() {
    if (!getPrintSim() || typeof getPrintSim().setSolidPreview !== "function") {
      return;
    }
    if (getIsDockedPrintActive() || getFilesListCollapsedForPrint()) {
      return;
    }
    const showSlicerSolid =
      typeof getPrintSim().getSource === "function" && getPrintSim().getSource() === "toolpath"
      && typeof getPrintSim().hasStlView === "function" && getPrintSim().hasStlView();
    getPrintSim().setSolidPreview(showSlicerSolid);
    setPrintHideStl(showSlicerSolid);
    applyCloudStlDisplayState();
  }

  function hasBridgedToolpath() {
    return Boolean(
      getBridgedSliceData() &&
        getBridgedSliceData().toolpath &&
        Array.isArray(getBridgedSliceData().toolpath.moves) &&
        getBridgedSliceData().toolpath.moves.length > 0,
    );
  }

  // World-space XY offset (metres) that reproduces where the operator placed the
  // part on the slicer build plate: (part-centre − plate-centre) in plate mm, laid
  // in the horizontal plane. Null when no bridged slice carries a plate + bounds.
  // Fed to alignCloudStlUnderHeadViaXY so the preview matches the slicer layout.
  function getSlicerPlacementWorldOffset() {
    const plate = getBridgedSliceData() && getBridgedSliceData().plate;
    const bounds = getBridgedSliceData() && getBridgedSliceData().mesh && getBridgedSliceData().mesh.bounds;
    if (!plate || !bounds || !Array.isArray(bounds.min) || !Array.isArray(bounds.max)) {
      return null;
    }
    if (!Number.isFinite(plate.centerXmm) || !Number.isFinite(plate.centerYmm)) {
      return null;
    }
    const offXmm = (bounds.min[0] + bounds.max[0]) / 2 - plate.centerXmm;
    const offYmm = (bounds.min[1] + bounds.max[1]) / 2 - plate.centerYmm;
    return new THREE.Vector3(offXmm / 1000, offYmm / 1000, 0);
  }

  function updateSlicerChosenFileLabel() {
    if (!slicerChosenFileEl) {
      return;
    }
    const name = String(getSelectedCloudLibraryFileName() || cloudStlFileSelectEl?.value || "").trim();
    slicerChosenFileEl.textContent = name ? `File: ${name}` : "No file selected";
  }

  function setSlicerFullscreen(open, options = {}) {
    // preserveIframe: leave the (already-loaded, possibly-sliced) slicer iframe
    // intact instead of blanking it. Used for the material-block detour to
    // Materials so "Return to slicer" restores the same sliced, print-ready view
    // WITHOUT a reload — a reload re-slices from scratch and the fresh slicer
    // emits a mesh-only update that clears the row's "ready" status (the reported
    // "lost slice" bug). The .slicer-fullscreen class removal hides the iframe via
    // CSS while Materials is open, so the preserved frame simply stays parked.
    const { preserveIframe = false } = options;
    setIsSlicerFullscreen(Boolean(open));
    document.body.classList.toggle("slicer-fullscreen", getIsSlicerFullscreen());
    if (getIsSlicerFullscreen()) {
      // Drop the anchored inline geometry so the fullscreen CSS (inset:0) wins;
      // positionSlicerMenu() would otherwise re-anchor to the (now hidden) Files
      // popup and leave a tiny sliver.
      if (slicerPaneEl) {
        slicerPaneEl.style.left = "";
        slicerPaneEl.style.top = "";
        slicerPaneEl.style.maxHeight = "";
      }
      updateSlicerChosenFileLabel();
      // Reveal the embedded full slicer area (the iframe src is set per-file by
      // loadSlicerIframeForFile).
      if (slicerEmbedWrapEl) {
        slicerEmbedWrapEl.hidden = false;
      }
    } else if (slicerFrameEl) {
      if (preserveIframe) {
        // Keep the loaded slicer alive and its wrap visible; the CSS-hidden
        // embed section keeps it off-screen until we reopen full view.
        if (slicerEmbedWrapEl) {
          slicerEmbedWrapEl.hidden = false;
        }
      } else {
        // Leaving full view: stop the slicer iframe so it isn't polling in the
        // background, and hide its area.
        slicerFrameEl.src = "about:blank";
        slicerFrameEl.hidden = true;
        if (slicerEmbedWrapEl) {
          slicerEmbedWrapEl.hidden = true;
        }
      }
    }
  }

  // Point the embedded slicer at one of our STL files so it auto-loads that model
  // (the slicer reads ?stl=<url> and fetches it; /slicer forwards the param, and
  // CORS lets the slicer's origin fetch /api/stl/file). All slicer tools stay
  // available on the loaded model.
  function loadSlicerIframeForFile(fileName) {
    if (!slicerFrameEl) {
      return;
    }
    const name = String(fileName || "").trim();
    const stlUrl = `${window.location.origin}/api/stl/file?name=${encodeURIComponent(name)}`;
    // dock=1 → the slicer renders its embedded bottom-bar layout (see /slicer route,
    // which forwards these params on to the configured slicer origin).
    slicerFrameEl.src = `/slicer?dock=1&stl=${encodeURIComponent(stlUrl)}`;
    slicerFrameEl.hidden = false;
    if (slicerFallbackEl) {
      slicerFallbackEl.hidden = true;
    }
    if (slicerEmbedWrapEl) {
      slicerEmbedWrapEl.hidden = false;
    }
  }

  // "Load to slicer" from a Files-list row: open the full slicer (all its tools)
  // with the chosen file auto-loaded, and warm the viewer-side slice in the
  // background so the later "Load to viewer" 3D print sim is ready.
  function loadFileToSlicer(fileName) {
    setAutoSliceFlowActive(true);
    setSelectedCloudLibraryFile(fileName, { updateSelect: true, syncDataset: true });
    setCloudFileRowSliceStatus(fileName, "slicing");
    updateSlicerChosenFileLabel();

    // Open the full-view slicer now, then point its iframe at the chosen STL.
    if (getIsCloudModelMenuOpen()) {
      setSlicerMenuOpen(true);
    }
    loadSlicerIframeForFile(fileName);

    // Warm the viewer-side slice (used by "Load to viewer") behind the slicer.
    loadCloudOverlayFromSelectedFile()
      .then(() => updateSlicerChosenFileLabel())
      .catch((error) => {
        console.warn("[slicer] load-to-slicer failed:", error?.message || error);
      });
  }

  // Docked-print flyout: sit the pane just ABOVE the bottom nav, centred, opening
  // upward. Measured off the nav so it clears it whatever its height.
  function positionSlicerMenuDocked() {
    if (!slicerPaneEl || slicerPaneEl.hidden) {
      return;
    }
    const navEl = document.querySelector(".bottom-nav");
    if (!navEl) {
      return;
    }
    const navRect = navEl.getBoundingClientRect();
    const gap = 12;
    slicerPaneEl.style.top = "";
    slicerPaneEl.style.left = "50%";
    slicerPaneEl.style.right = "auto";
    slicerPaneEl.style.transform = "translateX(-50%)";
    slicerPaneEl.style.bottom = `${Math.round(window.innerHeight - navRect.top + gap)}px`;
    slicerPaneEl.style.maxHeight = `${Math.max(180, Math.round(navRect.top - gap - 24))}px`;
  }

  function positionSlicerMenu() {
    if (!slicerPaneEl || !cloudModelPopupEl || slicerPaneEl.hidden) {
      return;
    }
    // Clear any docked-flyout inline styles so the Files-anchored position wins.
    slicerPaneEl.style.bottom = "";
    slicerPaneEl.style.transform = "";
    if (getIsSlicerFullscreen()) {
      // Fullscreen geometry is owned entirely by CSS; the Files popup is hidden so
      // its rect is unusable for anchoring.
      return;
    }
    if (getFilesListCollapsedForPrint()) {
      // Detached (fixed) position is handled by CSS while the list is collapsed.
      return;
    }
    const rect = cloudModelPopupEl.getBoundingClientRect();
    const gap = 12;
    const menuWidth = slicerPaneEl.offsetWidth || 360;
    let left = rect.right + gap;
    const maxLeft = window.innerWidth - menuWidth - 12;
    if (left > maxLeft) {
      left = Math.max(12, maxLeft);
    }
    slicerPaneEl.style.left = `${Math.round(left)}px`;
    slicerPaneEl.style.top = `${Math.round(rect.top)}px`;
    slicerPaneEl.style.maxHeight = `${Math.round(rect.height)}px`;
  }

  function setSlicerMenuOpen(isOpen) {
    // The slicer flyout makes sense while the Files menu is open OR while a print
    // is docked (where it's the upward Slicer-button flyout of print controls).
    setIsSlicerMenuOpen(Boolean(isOpen) && (getIsCloudModelMenuOpen() || getFilesListCollapsedForPrint()));
    if (slicerPaneEl) {
      slicerPaneEl.hidden = !getIsSlicerMenuOpen();
      slicerPaneEl.setAttribute("aria-hidden", getIsSlicerMenuOpen() ? "false" : "true");
    }
    if (getIsSlicerMenuOpen()) {
      // A fresh open from the Files menu takes the whole view for slicing. While a
      // print is docked it stays compact (the upward flyout of print controls).
      if (!getFilesListCollapsedForPrint()) {
        setSlicerFullscreen(true);
      }
    } else {
      // Closing the flyout leaves full view and collapses the embed so it reopens
      // compact next time.
      setSlicerFullscreen(false);
    }
    if (slicerMenuToggleEl) {
      slicerMenuToggleEl.setAttribute("aria-expanded", getIsSlicerMenuOpen() ? "true" : "false");
    }
    if (getIsSlicerMenuOpen() && !getFilesListCollapsedForPrint()) {
      positionSlicerMenu();
    } else if (getIsSlicerMenuOpen() && getFilesListCollapsedForPrint()) {
      positionSlicerMenuDocked();
    }
    // NOTE: while a print is docked, closing the flyout must NOT expand the Files
    // list — the docked print bar (Stop/Pause/Slicer) stays put. The list only
    // comes back on Stop.
    updateBottomNavState();
  }

  // slice-data / start-print / dock-ready (slicer) and the M600 O2 bridge are all
  // routed by the single message dispatcher defined near applyChamberAtmosphere
  // (see handleSliceData / handleSlicerDockReady).
  function handleSlicerDockReady() {
    slicerDockReady = true;
    document.body.classList.add("slicer-dock-ready");
  }

  return {
    isTrustedSlicerMessage,
    showSlicerFallback,
    showSlicerFrame,
    refreshSlicerEmbed,
    setSlicerEmbedOpen,
    handleSliceData,
    updateSlicerModelPreview,
    hasBridgedToolpath,
    getSlicerPlacementWorldOffset,
    updateSlicerChosenFileLabel,
    setSlicerFullscreen,
    loadSlicerIframeForFile,
    loadFileToSlicer,
    positionSlicerMenuDocked,
    positionSlicerMenu,
    setSlicerMenuOpen,
    handleSlicerDockReady,
  };
}
