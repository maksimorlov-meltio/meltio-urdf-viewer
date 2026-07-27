// Wire-drum + feedstock visibility (extracted from urdf_viewer.js, leaf 2/3 of the
// feeder+materials domain). Owns the wire-drum reveal animation + the wire-spool door
// joint, spool/drum mesh registration and their feed-type-driven visibility, and the
// feeder-wheel steel styling. Drum/mesh/reveal STATE is module-local (reset via the
// exported resetWireDrumState on URDF load); spool amounts/feed-type/assignments stay
// god-file-owned (they become the core module in leaf 3) and arrive via ctx, as do the
// jointsCore setJointValue, transparency setMaterialOpacity, and the door/feeder-run
// predicates. createWireDrum(ctx) -> the reveal/register/animate API.

export function createWireDrum(ctx) {
  const {
    getRobotRoot,
    studioEnvironmentTexture,
    setMaterialOpacity,
    setJointValue,
    approachValue,
    clamp,
    markUserActivity,
    isSpoolsDoorOpen,
    isFeederRunning,
    normalizeSpoolKey,
    getWireSpoolDoorState,
    getHotspotMaterialsFocusSpoolKey,
    getIsLightMode,
    feederFeedType,
    spoolRemainingAmountGramsByKey,
    hotspotMaterialAssignments,
    wireDrumAppearButtonEl,
    materialsWireDrumToggleEl,
    ENABLE_REALTIME_SHADOWS,
    WIRE_DRUM_APPEAR_SPEED_PER_SEC,
    WIRE_DRUM_APPEAR_END_BOOST_START,
    WIRE_DRUM_APPEAR_END_BOOST_MULTIPLIER,
    WIRE_SPOOL_DOOR_OPEN_TARGET_RAD,
    WIRE_SPOOL_DOOR_CLOSED_TARGET_RAD,
    WIRE_SPOOL_DOOR_OPEN_SPEED_RAD_PER_SEC,
    LEFT_FEEDER_WHEEL_LINK,
    RIGHT_FEEDER_WHEEL_LINK,
    CENTRAL_FEEDER_WHEEL_LINK,
  } = ctx;

  let wireDrumMaterials = [];
  let wireDrumMeshes = [];
  let spool1Meshes = [];
  let spool2Meshes = [];
  let spoolsDoorMeshes = [];
  let wireSpoolDoorMeshes = [];
  let wireDrumRevealProgress = 0;
  let wireDrumRevealTarget = 0;
  let manualWireDrumConnect = false;

  function resetWireDrumState() {
    wireDrumMaterials = [];
    wireDrumMeshes = [];
    spool1Meshes = [];
    spool2Meshes = [];
    spoolsDoorMeshes = [];
    wireSpoolDoorMeshes = [];
    wireDrumRevealProgress = 0;
    wireDrumRevealTarget = 0;
    manualWireDrumConnect = false;
  }

  function applyWireDrumAppearance() {
    const clampedProgress = clamp(wireDrumRevealProgress, 0, 1);
    const easedProgress = (clampedProgress * clampedProgress) * (3 - (2 * clampedProgress));
    const isHidden = easedProgress <= 0.001;
    for (const meshNode of wireDrumMeshes) {
      meshNode.visible = !isHidden;
      // In light mode, disable near-invisible shadow casting to avoid ghost shadows.
      if (getIsLightMode()) {
        meshNode.castShadow = ENABLE_REALTIME_SHADOWS && easedProgress > 0.08;
      } else {
        meshNode.castShadow = ENABLE_REALTIME_SHADOWS && !isHidden;
      }
    }

    // Spool models follow each feeder's feed type (a drum-fed feeder hides its
    // spool); spool 1 also hides while the drum is revealed (shared bay).
    applySpoolFeedTypeVisibility();

    for (const material of wireDrumMaterials) {
      setMaterialOpacity(material, easedProgress);
    }

    // Keep the Materials-menu "Connect wire drum" toggle in sync (it drives the
    // same reveal). Done before the early returns below so it always updates.
    updateMaterialsWireDrumToggle(clampedProgress);

    if (!wireDrumAppearButtonEl) {
      return;
    }

    const hasWireDrum = wireDrumMaterials.length > 0;
    wireDrumAppearButtonEl.disabled = !hasWireDrum;

    if (!hasWireDrum) {
      wireDrumAppearButtonEl.textContent = "Wire Drum";
      wireDrumAppearButtonEl.setAttribute("aria-pressed", "false");
      return;
    }

    if (wireDrumRevealTarget > clampedProgress + 1e-6) {
      wireDrumAppearButtonEl.textContent = "Appearing...";
      wireDrumAppearButtonEl.setAttribute("aria-pressed", "true");
      return;
    }

    if (wireDrumRevealTarget < clampedProgress - 1e-6) {
      wireDrumAppearButtonEl.textContent = "Hiding...";
      wireDrumAppearButtonEl.setAttribute("aria-pressed", "false");
      return;
    }

    if (clampedProgress >= 0.999) {
      wireDrumAppearButtonEl.textContent = "Hide Wire Drum + Close Door";
      wireDrumAppearButtonEl.setAttribute("aria-pressed", "true");
      return;
    }

    wireDrumAppearButtonEl.textContent = "Wire Drum";
    wireDrumAppearButtonEl.setAttribute("aria-pressed", "false");
  }

  // Each feeder (Materials menu) can be fed by its spool or by the shared wire drum.
  // A spool's 3D model is hidden ONLY when ITS OWN feeder is set to "drum":
  // Feeder 1 -> spool 1 model, Feeder 2 -> spool 2 model, fully independent. So a
  // spool-fed feeder keeps its spool visible even while the other feeder is on drum
  // (e.g. Feeder 1 = Spool + Feeder 2 = Drum shows Spool 1 AND the drum, hides
  // Spool 2). The drum's own visibility is handled by computeWireDrumVisibleTarget.
  function applySpoolFeedTypeVisibility() {
    // A spool model is visible only when ITS feeder is on "spool" AND it still has
    // material loaded (amount loaded > 0). A drum-fed feeder OR an empty spool
    // (0 g loaded) hides that spool.
    const grams = (key) => Number(spoolRemainingAmountGramsByKey[key]) || 0;
    const spool1Visible = feederFeedType.spool1 !== "drum" && grams("spool1") > 0;
    const spool2Visible = feederFeedType.spool2 !== "drum" && grams("spool2") > 0;
    for (const meshNode of spool1Meshes) {
      meshNode.visible = spool1Visible;
      meshNode.castShadow = ENABLE_REALTIME_SHADOWS && spool1Visible;
    }
    for (const meshNode of spool2Meshes) {
      meshNode.visible = spool2Visible;
      meshNode.castShadow = ENABLE_REALTIME_SHADOWS && spool2Visible;
    }
  }

  // Recompute all feedstock (spool + drum) visibility from the current feed types
  // and loaded amounts, then repaint. Call after any feed-type or amount change.
  function refreshFeedstockVisibility() {
    applySpoolFeedTypeVisibility();
    wireDrumRevealTarget = computeWireDrumVisibleTarget();
    applyWireDrumAppearance();
  }

  // Reflect the wire-drum reveal state on the Materials-menu toggle. Disabled until
  // the drum meshes exist (URDF loaded). Shows a transient "Connecting…/…" label
  // while the reveal animates, mirroring the Appearance button but framed as a
  // feedstock connection. Cosmetic only — never gates or affects a print.
  function updateMaterialsWireDrumToggle(clampedProgress) {
    if (!materialsWireDrumToggleEl) {
      return;
    }
    const progress =
      typeof clampedProgress === "number" ? clampedProgress : clamp(wireDrumRevealProgress, 0, 1);
    const hasWireDrum = wireDrumMaterials.length > 0;
    materialsWireDrumToggleEl.disabled = !hasWireDrum;

    let label = "Connect";
    let pressed = false;
    if (!hasWireDrum) {
      // keep defaults
    } else if (wireDrumRevealTarget > progress + 1e-6) {
      label = "Connecting…";
      pressed = true;
    } else if (wireDrumRevealTarget < progress - 1e-6) {
      label = "Disconnecting…";
      pressed = false;
    } else if (progress >= 0.999) {
      label = "Connected — tap to disconnect";
      pressed = true;
    }
    materialsWireDrumToggleEl.textContent = label;
    materialsWireDrumToggleEl.setAttribute("aria-pressed", pressed ? "true" : "false");
  }

  function registerWireDrumMaterials(object3d) {
    const known = new Set(wireDrumMaterials);
    const knownMeshes = new Set(wireDrumMeshes);

    object3d.traverse((node) => {
      if (!node.isMesh) {
        return;
      }

      if (!knownMeshes.has(node)) {
        knownMeshes.add(node);
        wireDrumMeshes.push(node);
      }

      if (!node.material) {
        return;
      }

      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) {
        if (!known.has(material)) {
          known.add(material);
          wireDrumMaterials.push(material);
        }
      }
    });
  }

  function registerSpool1Meshes(object3d) {
    registerMeshNodes(object3d, spool1Meshes);
  }

  function registerSpool2Meshes(object3d) {
    registerMeshNodes(object3d, spool2Meshes);
  }

  function registerSpoolsDoorMeshes(object3d) {
    registerMeshNodes(object3d, spoolsDoorMeshes);
  }

  function registerWireSpoolDoorMeshes(object3d) {
    registerMeshNodes(object3d, wireSpoolDoorMeshes);
  }

  function registerMeshNodes(object3d, targetMeshList) {
    const knownMeshes = new Set(targetMeshList);

    object3d.traverse((node) => {
      if (!node.isMesh) {
        return;
      }

      if (!knownMeshes.has(node)) {
        knownMeshes.add(node);
        targetMeshList.push(node);
      }
    });
  }

  function isWireDrumConnected() {
    return wireDrumRevealProgress > 0.5 || wireDrumRevealTarget > 0.5;
  }

  // Show ("connect") or hide the wire drum assembly. Purely cosmetic: it drives the
  // reveal animation + the wire-spool door only, and touches no material accounting
  // or print state, so it is safe to call at any time (including mid-print). Both
  // the Appearance "Wire Drum" button and the Materials "Connect wire drum" toggle
  // route through here so their states stay in sync.
  function setWireDrumConnected(connected) {
    manualWireDrumConnect = Boolean(connected);
    wireDrumRevealTarget = computeWireDrumVisibleTarget();
    markUserActivity();
    applyWireDrumAppearance();
  }

  // A feeder is set to the "drum" feed type (Materials menu).
  function isDrumFeederAssigned() {
    return (typeof feederFeedType === "object" && feederFeedType)
      ? (feederFeedType.spool1 === "drum" || feederFeedType.spool2 === "drum")
      : false;
  }

  // Drum ASSEMBLY visible when: the materials/spools compartment door is open, OR a
  // drum-type feeder is actively running, OR the manual Appearance override is on.
  function computeWireDrumVisibleTarget() {
    const spoolsOpen = typeof isSpoolsDoorOpen === "function" && isSpoolsDoorOpen();
    // The drum reveals when a feeder's feed type is Drum (as soon as it is selected —
    // it no longer has to be actively running) AND the drum still has material loaded
    // (amount loaded > 0); an empty drum stays hidden. The door-open and manual
    // "Wire Drum" appearance overrides still force it visible for inspection.
    const drumHasStock = (Number(spoolRemainingAmountGramsByKey.wiredrum) || 0) > 0;
    const drumFeederWantsReveal = isDrumFeederAssigned() && drumHasStock;
    return (spoolsOpen || drumFeederWantsReveal || manualWireDrumConnect) ? 1 : 0;
  }

  // The drum's OWN door opens only when the compartment door is CLOSED and a drum
  // feeder is actively running (so you can watch it feed); if the materials door is
  // open the drum is visible but its door stays closed.
  function computeWireDrumDoorOpen() {
    const spoolsOpen = typeof isSpoolsDoorOpen === "function" && isSpoolsDoorOpen();
    return !spoolsOpen && isDrumFeederAssigned() && isFeederRunning();
  }

  function triggerWireDrumAppearance() {
    setWireDrumConnected(!isWireDrumConnected());
  }

  function animateWireDrumAppearance(deltaSeconds) {
    // Recompute the drum-assembly visibility + door targets from the live door /
    // feeder state each frame (decoupled: the compartment door can show the drum
    // without opening the drum's own door).
    wireDrumRevealTarget = computeWireDrumVisibleTarget();

    if (Math.abs(wireDrumRevealProgress - wireDrumRevealTarget) > 1e-6) {
      const isShowing = wireDrumRevealTarget > wireDrumRevealProgress;
      let revealSpeed = WIRE_DRUM_APPEAR_SPEED_PER_SEC;

      if (isShowing) {
        const endPhase = clamp(
          (wireDrumRevealProgress - WIRE_DRUM_APPEAR_END_BOOST_START)
            / (1 - WIRE_DRUM_APPEAR_END_BOOST_START),
          0,
          1,
        );
        revealSpeed *= 1 + (endPhase * (WIRE_DRUM_APPEAR_END_BOOST_MULTIPLIER - 1));
      }

      wireDrumRevealProgress = approachValue(
        wireDrumRevealProgress,
        wireDrumRevealTarget,
        revealSpeed * deltaSeconds,
      );
      applyWireDrumAppearance();
    }

    if (!getWireSpoolDoorState()) {
      return;
    }

    const rawDoorTarget = computeWireDrumDoorOpen()
      ? WIRE_SPOOL_DOOR_OPEN_TARGET_RAD
      : WIRE_SPOOL_DOOR_CLOSED_TARGET_RAD;
    const targetDoorValue = clamp(rawDoorTarget, getWireSpoolDoorState().lower, getWireSpoolDoorState().upper);
    const nextDoorValue = approachValue(
      getWireSpoolDoorState().value,
      targetDoorValue,
      WIRE_SPOOL_DOOR_OPEN_SPEED_RAD_PER_SEC * deltaSeconds,
    );

    if (Math.abs(nextDoorValue - getWireSpoolDoorState().value) > 1e-6) {
      setJointValue(getWireSpoolDoorState(), nextDoorValue);
    }
  }

  // Give the feeder-wheel gears a proper machined-steel look. styleMeshTree tunes
  // every part to a low-metalness default; the feeder wheels are bare metal gears,
  // so with the scene environment now in place we push them to high metalness /
  // low roughness so the teeth catch reflections and read as real steel instead of
  // flat grey. Runs once per loaded model over the three wheel links only.
  function enhanceFeederWheelMaterials() {
    if (!getRobotRoot()) {
      return;
    }
    const steelTuned = new Set();
    for (const linkName of [LEFT_FEEDER_WHEEL_LINK, RIGHT_FEEDER_WHEEL_LINK, CENTRAL_FEEDER_WHEEL_LINK]) {
      const linkObject = getRobotRoot().getObjectByName(`link:${linkName}`);
      if (!linkObject) {
        continue;
      }
      linkObject.traverse((node) => {
        if (!node.isMesh || !node.material) {
          return;
        }
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        for (const mat of materials) {
          if (!mat || steelTuned.has(mat)) {
            continue;
          }
          steelTuned.add(mat);
          // Semi-metallic brushed-steel: metallic enough to catch environment
          // highlights on the teeth, but not so metallic that the gears go dark in
          // the near-black preview strip (pure metal only shows what it reflects).
          if ("metalness" in mat) mat.metalness = 0.6;
          if ("roughness" in mat) mat.roughness = 0.42;
          if ("envMapIntensity" in mat) mat.envMapIntensity = 1.5;
          // Scoped IBL: give just these gear materials the studio reflections so
          // the teeth read as steel, without a scene-wide env map.
          if ("envMap" in mat) mat.envMap = studioEnvironmentTexture;
          // Light steel tone so the gears stay legible against the dark UI.
          if (mat.color && typeof mat.color.setHex === "function") {
            mat.color.setHex(0xb4bcc6);
          }
          mat.needsUpdate = true;
        }
      });
    }
  }

  // If the print's feedstock is the wire drum (it's the active/assigned feedstock),
  // reveal the drum assembly (with its animation) so the scene reflects the real
  // feed source. Cosmetic — does not affect the print cycle.
  function revealWireDrumIfActiveFeedstock() {
    const drumIsFeedstock =
      normalizeSpoolKey(getHotspotMaterialsFocusSpoolKey()) === "wiredrum"
      && Boolean(hotspotMaterialAssignments.wiredrum);
    if (drumIsFeedstock) {
      setWireDrumConnected(true);
    }
  }

  return {
    applyWireDrumAppearance,
    refreshFeedstockVisibility,
    registerWireDrumMaterials,
    registerSpool1Meshes,
    registerSpool2Meshes,
    registerSpoolsDoorMeshes,
    registerWireSpoolDoorMeshes,
    isWireDrumConnected,
    setWireDrumConnected,
    triggerWireDrumAppearance,
    animateWireDrumAppearance,
    enhanceFeederWheelMaterials,
    revealWireDrumIfActiveFeedstock,
    resetWireDrumState,
  };
}
