// Configurable client for the optional real slicer backend (aslicer).
//
// The slicer is OPTIONAL. By default the print simulation uses a client-side
// clip-plane reveal of the selected STL (no backend required). When a slicer
// service is configured, this client requests a real toolpath instead.
//
// The URL is NOT hardcoded: it is read from `window.AVIS_SLICER` (injected via a
// small inline config in urdf.html) and otherwise falls back to a same-origin
// proxy ("/api/slice/proxy") that the avisualizer backend exposes. The proxy
// keeps requests same-origin (no CORS) and lets the deployment point at any
// aslicer instance via the AVIS_SLICER_URL environment variable.

const DEFAULT_PROXY_PATH = "/api/slice/proxy";

function readConfig() {
  const cfg = (typeof window !== "undefined" && window.AVIS_SLICER) || {};
  return {
    // When false (default), the client is dormant and prepare() uses the
    // client-side fallback. Set window.AVIS_SLICER = { enabled: true } to use it.
    enabled: Boolean(cfg.enabled),
    baseUrl: typeof cfg.baseUrl === "string" && cfg.baseUrl ? cfg.baseUrl : DEFAULT_PROXY_PATH,
    profile: typeof cfg.profile === "string" && cfg.profile ? cfg.profile : null,
  };
}

export function createSlicerClient(overrides = {}) {
  const base = readConfig();
  const config = { ...base, ...overrides };

  function isEnabled() {
    return Boolean(config.enabled);
  }

  // Request a slice for a model already known to the backend by file name
  // (resolved against the same global STL store the Files list uses). Returns
  // the parsed toolpath payload, or throws a typed Error on failure so the
  // controller can fall back gracefully.
  async function sliceByName(name, options = {}) {
    if (!name) {
      throw new Error("slicer: model name is required");
    }
    const profile = options.profile || config.profile || undefined;
    let response;
    try {
      response = await fetch(config.baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, profile }),
        cache: "no-store",
        signal: options.signal,
      });
    } catch (networkError) {
      const err = new Error(`slicer unreachable: ${networkError?.message || "network error"}`);
      err.code = "unreachable";
      throw err;
    }

    if (response.status === 503) {
      const err = new Error("slicer not configured on the backend");
      err.code = "not_configured";
      throw err;
    }
    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const body = await response.json();
        if (body && body.detail) {
          detail = body.detail;
        }
      } catch (_ignored) {
        /* non-JSON error body */
      }
      const err = new Error(`slicer error: ${detail}`);
      err.code = "error";
      throw err;
    }

    const payload = await response.json();
    if (!payload || !Array.isArray(payload.moves)) {
      const err = new Error("slicer returned an unexpected payload (no moves[])");
      err.code = "bad_payload";
      throw err;
    }
    return payload;
  }

  return { isEnabled, sliceByName, config };
}
