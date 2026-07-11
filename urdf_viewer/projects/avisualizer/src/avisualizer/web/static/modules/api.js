const DEFAULT_DATASET_NAME = "small-torture-test_1-0-0";

export async function fetchSensorData(requested, options = {}) {
  const dataset = options.dataset ?? DEFAULT_DATASET_NAME;
  const attribute = options.attribute ?? "loadCell";
  const maxPoints = options.maxPoints ?? 150000;
  const sampleSeed = options.sampleSeed;

  const parseCsvFloatHeader = (value, expectedLength) => {
    if (!value) {
      return new Array(expectedLength).fill(0);
    }
    const values = value.split(",").map((v) => Number(v));
    if (values.length !== expectedLength || values.some((v) => Number.isNaN(v))) {
      throw new Error("Invalid binary sensor metadata header");
    }
    return values;
  };

  const unpackPoints = (buffer, renderedPoints, stride) => {
    const floats = new Float32Array(buffer);
    const expected = renderedPoints * stride;
    if (floats.length !== expected) {
      throw new Error("Invalid binary sensor payload size");
    }

    const points = new Array(renderedPoints);
    for (let i = 0; i < renderedPoints; i += 1) {
      const offset = i * stride;
      points[i] = [
        floats[offset],
        floats[offset + 1],
        floats[offset + 2],
        floats[offset + 3],
      ];
      if (stride >= 5) {
        points[i].push(floats[offset + 4]);
      }
    }
    return points;
  };

  const requestBinary = async (effectiveMaxPoints) => {
    const params = new URLSearchParams({
      dataset,
      attribute,
      view: requested.apiView,
      voxel_size_mm: requested.voxelSizeMm.toString(),
      voxel_size_z_mm: requested.voxelSizeZMm.toString(),
      max_points: effectiveMaxPoints.toString(),
    });
    if (Number.isInteger(sampleSeed)) {
      params.set("random_seed", sampleSeed.toString());
    }

    const response = await fetch(`/api/sensors?${params.toString()}`);
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`API error (${response.status}): ${detail}`);
    }

    const renderedPoints = Number(response.headers.get("x-av-renderedpoints")
      ?? response.headers.get("x-av-rendered-points")
      ?? "0");
    const totalPoints = Number(response.headers.get("x-av-totalpoints")
      ?? response.headers.get("x-av-total-points")
      ?? "0");

    const center = parseCsvFloatHeader(response.headers.get("x-av-center"), 3);
    const boundsMin = parseCsvFloatHeader(
      response.headers.get("x-av-bounds-min"),
      3,
    );
    const boundsMax = parseCsvFloatHeader(
      response.headers.get("x-av-bounds-max"),
      3,
    );
    const attrRange = parseCsvFloatHeader(response.headers.get("x-av-attr-range"), 2);
    const pointStride = Number(response.headers.get("x-av-pointstride") ?? "4");

    const buffer = await response.arrayBuffer();
    const points = unpackPoints(buffer, renderedPoints, pointStride);

    return {
      dataset: response.headers.get("x-av-dataset") ?? dataset,
      attribute: response.headers.get("x-av-attribute") ?? attribute,
      viewMode: response.headers.get("x-av-viewmode") ?? requested.apiView,
      voxelSizeMm: Number(response.headers.get("x-av-voxelsizemm") ?? requested.voxelSizeMm),
      voxelSizeZMm: Number(response.headers.get("x-av-voxelsizezmm") ?? requested.voxelSizeZMm),
      backendEngine: response.headers.get("x-av-backendengine") ?? "open3d",
      totalPoints,
      renderedPoints,
      center,
      bounds: {
        min: boundsMin,
        max: boundsMax,
      },
      attributeRange: {
        min: attrRange[0],
        max: attrRange[1],
      },
      points,
    };
  };

  try {
    return await requestBinary(maxPoints);
  } catch (error) {
    const isNetworkError = error instanceof TypeError;
    if (!isNetworkError || requested.apiView !== "voxel") {
      throw error;
    }

    const retryCaps = [100000, 60000, 30000].filter((cap) => cap < maxPoints);
    let lastError = error;

    for (const cap of retryCaps) {
      try {
        return await requestBinary(cap);
      } catch (retryError) {
        lastError = retryError;
      }
    }

    throw lastError;
  }
}

export async function fetchAttributeSeries(options = {}) {
  const dataset = options.dataset ?? DEFAULT_DATASET_NAME;
  const attribute = options.attribute ?? "loadCell";
  const maxSamples = options.maxSamples ?? 1200;

  const params = new URLSearchParams({
    dataset,
    attribute,
    max_samples: maxSamples.toString(),
  });

  const response = await fetch(`/api/attribute-series?${params.toString()}`);
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`API error (${response.status}): ${detail}`);
  }

  return response.json();
}
