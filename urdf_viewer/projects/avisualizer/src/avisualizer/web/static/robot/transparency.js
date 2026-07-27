// Robot transparency (extracted from urdf_viewer.js). Owns the three binary
// see-through toggles (user-step / display / head) plus the material+visual
// registration that feeds them during model load, and the shared per-material
// opacity setter. The transparency STATE (material arrays, flags) stays
// god-file-owned (reset on load, flipped by the toggle handlers, saved/restored
// by feeder-focus) and is reached through ctx getters/setters; DOM handles and
// clamp arrive via ctx. createTransparency(ctx) -> the toggle/registration API.

export function createTransparency(ctx) {
  const {
    clamp,
    userStepTransparencyEnabledEl,
    displayTransparencyEnabledEl,
    headTransparencyEnabledEl,
    getUserStepMaterials,
    getDisplayMaterials,
    getHeadMaterials,
    getHeadVisuals,
    getUserStepTransparencyEnabled,
    getDisplayTransparencyEnabled,
    getHeadTransparencyEnabled,
    setUserStepOpacity,
    setDisplayOpacity,
    setHeadTransparency,
    setUserStepTransparencyEnabled,
    setDisplayTransparencyEnabled,
    setHeadTransparencyEnabled,
  } = ctx;

  function setMaterialOpacity(material, opacity) {
    const clampedOpacity = clamp(opacity, 0, 1);
    const nextTransparent = clampedOpacity < 0.999;
    const nextDepthWrite = clampedOpacity >= 0.999;
    const transparencyModeChanged =
      material.transparent !== nextTransparent || material.depthWrite !== nextDepthWrite;

    material.opacity = clampedOpacity;
    material.transparent = nextTransparent;
    material.depthWrite = nextDepthWrite;

    if (transparencyModeChanged) {
      material.needsUpdate = true;
    }
  }

  function setTransparencyToggleState(buttonEl, enabled) {
    if (!buttonEl) {
      return;
    }
    buttonEl.setAttribute("aria-pressed", enabled ? "true" : "false");
    buttonEl.classList.toggle("active", Boolean(enabled));
  }

  function applyUserStepTransparency() {
    // Binary toggle: enabled = fully transparent (opacity 0), disabled = fully opaque.
    const effectiveOpacity = getUserStepTransparencyEnabled() ? 0 : 1;

    for (const material of getUserStepMaterials()) {
      setMaterialOpacity(material, effectiveOpacity);
    }

    const hasUserStep = getUserStepMaterials().length > 0;

    if (userStepTransparencyEnabledEl) {
      setTransparencyToggleState(userStepTransparencyEnabledEl, getUserStepTransparencyEnabled());
      userStepTransparencyEnabledEl.disabled = !hasUserStep;
    }
  }

  function applyDisplayTransparency() {
    // Binary toggle: enabled = fully transparent (opacity 0), disabled = fully opaque.
    const effectiveOpacity = getDisplayTransparencyEnabled() ? 0 : 1;

    for (const material of getDisplayMaterials()) {
      setMaterialOpacity(material, effectiveOpacity);
    }

    const hasDisplay = getDisplayMaterials().length > 0;

    if (displayTransparencyEnabledEl) {
      setTransparencyToggleState(displayTransparencyEnabledEl, getDisplayTransparencyEnabled());
      displayTransparencyEnabledEl.disabled = !hasDisplay;
    }
  }

  function applyHeadTransparency() {
    // Binary toggle: enabled = fully transparent (opacity 0), disabled = fully opaque.
    const effectiveOpacity = getHeadTransparencyEnabled() ? 0 : 1;

    for (const material of getHeadMaterials()) {
      setMaterialOpacity(material, effectiveOpacity);
    }

    const effectiveHeadVisible = !getHeadTransparencyEnabled() || effectiveOpacity > 0.001;
    for (const object3d of getHeadVisuals()) {
      object3d.visible = effectiveHeadVisible;
    }

    const hasHead = getHeadMaterials().length > 0;

    if (headTransparencyEnabledEl) {
      setTransparencyToggleState(headTransparencyEnabledEl, getHeadTransparencyEnabled());
      headTransparencyEnabledEl.disabled = !hasHead;
    }
  }

  function resetInitialTransparencyState() {
    setUserStepOpacity(0);
    setDisplayOpacity(0);
    setHeadTransparency(0);

    setUserStepTransparencyEnabled(false);
    setDisplayTransparencyEnabled(false);
    setHeadTransparencyEnabled(false);

    if (userStepTransparencyEnabledEl) {
      setTransparencyToggleState(userStepTransparencyEnabledEl, false);
    }
    if (displayTransparencyEnabledEl) {
      setTransparencyToggleState(displayTransparencyEnabledEl, false);
    }
    if (headTransparencyEnabledEl) {
      setTransparencyToggleState(headTransparencyEnabledEl, false);
    }
  }

  function registerUserStepMaterials(object3d) {
    const known = new Set(getUserStepMaterials());

    object3d.traverse((node) => {
      if (!node.isMesh || !node.material) {
        return;
      }

      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) {
        if (!known.has(material)) {
          known.add(material);
          getUserStepMaterials().push(material);
        }
      }
    });
  }

  function registerDisplayMaterials(object3d) {
    const known = new Set(getDisplayMaterials());

    object3d.traverse((node) => {
      if (!node.isMesh || !node.material) {
        return;
      }

      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) {
        if (!known.has(material)) {
          known.add(material);
          getDisplayMaterials().push(material);
        }
      }
    });
  }

  function registerHeadMaterials(object3d) {
    const known = new Set(getHeadMaterials());

    object3d.traverse((node) => {
      if (!node.isMesh || !node.material) {
        return;
      }

      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) {
        if (!known.has(material)) {
          known.add(material);
          getHeadMaterials().push(material);
        }
      }
    });
  }

  function registerHeadVisual(object3d) {
    getHeadVisuals().push(object3d);
  }

  return {
    setMaterialOpacity,
    setTransparencyToggleState,
    applyUserStepTransparency,
    applyDisplayTransparency,
    applyHeadTransparency,
    resetInitialTransparencyState,
    registerUserStepMaterials,
    registerDisplayMaterials,
    registerHeadMaterials,
    registerHeadVisual,
  };
}
