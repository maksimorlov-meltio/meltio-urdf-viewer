const DEFAULT_DATASET_NAME = "small-torture-test_1-0-0";

/**
 * Upload a CSV straight to S3 via a presigned PUT and return its object key,
 * reporting 0-100% via `onProgress`. Returns null when direct upload isn't
 * configured (HTTP 503) or fails, so callers fall back to the legacy multipart
 * upload. Uploading once this way bypasses the Cloudflare 100 MB edge limit and
 * lets every view reference the same object instead of re-uploading the file.
 */
export async function presignAndUploadCsv(file, onProgress) {
  let presign;
  try {
    const res = await fetch("/api/uploads/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: file.name }),
    });
    if (res.status === 503) return null; // direct upload not configured
    if (!res.ok) return null;
    presign = await res.json();
  } catch {
    return null;
  }

  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", presign.url, true);
    xhr.upload.onprogress = (e) => {
      if (onProgress && e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed (${xhr.status})`));
    xhr.onerror = () => reject(new Error("Upload network error"));
    xhr.send(file);
  });

  return presign.key;
}

/** Append the CSV source to a FormData: the S3 key if uploaded, else the file. */
function appendCsvSource(formData, s3Key, localSensorsFile) {
  if (s3Key) {
    formData.append("s3_key", s3Key);
  } else {
    formData.append("sensors_file", localSensorsFile, localSensorsFile.name);
  }
}

export async function fetchSensorData(requested, options = {}) {
  const dataset = options.dataset ?? DEFAULT_DATASET_NAME;
  const attribute = options.attribute ?? "loadCell";
  const maxPoints = options.maxPoints ?? 150000;
  const sampleSeed = options.sampleSeed;
  const localSensorsFile = options.localSensorsFile ?? null;
  const localSystemHint = options.localSystemHint ?? "m600";

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
    if (options.s3Key || localSensorsFile) {
      const formData = new FormData();
      appendCsvSource(formData, options.s3Key, localSensorsFile);
      formData.append("dataset_label", dataset);
      formData.append("system_hint", localSystemHint);
      formData.append("attribute", attribute);
      formData.append("view", requested.apiView);
      formData.append("voxel_size_mm", requested.voxelSizeMm.toString());
      formData.append("voxel_size_z_mm", requested.voxelSizeZMm.toString());
      formData.append("max_points", effectiveMaxPoints.toString());
      if (Number.isInteger(sampleSeed)) {
        formData.append("random_seed", sampleSeed.toString());
      }

      const response = await fetch("/api/sensors/upload", {
        method: "POST",
        body: formData,
      });
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
        system: response.headers.get("x-av-system") ?? "unknown",
        gridOrigin: response.headers.get("x-av-gridorigin") ?? "corner",
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
    }

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
      system: response.headers.get("x-av-system") ?? "unknown",
      gridOrigin: response.headers.get("x-av-gridorigin") ?? "corner",
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

  const requestGet = async (effectiveMaxPoints) => requestBinary(effectiveMaxPoints);

  try {
    return await requestGet(maxPoints);
  } catch (error) {
    const isNetworkError = error instanceof TypeError;
    if (!isNetworkError || requested.apiView !== "voxel") {
      throw error;
    }

    const retryCaps = [100000, 60000, 30000].filter((cap) => cap < maxPoints);
    let lastError = error;

    for (const cap of retryCaps) {
      try {
        return await requestGet(cap);
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
  const localSensorsFile = options.localSensorsFile ?? null;

  if (options.s3Key || localSensorsFile) {
    const formData = new FormData();
    appendCsvSource(formData, options.s3Key, localSensorsFile);
    formData.append("dataset_label", dataset);
    formData.append("attribute", attribute);
    formData.append("max_samples", maxSamples.toString());

    const response = await fetch("/api/attribute-series/upload", {
      method: "POST",
      body: formData,
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`API error (${response.status}): ${detail}`);
    }

    return response.json();
  }

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

function parseMultiRangesHeader(value) {
  if (!value) {
    return [];
  }
  return value
    .split(";")
    .filter((token) => token.length > 0)
    .map((token) => {
      const parts = token.split(",").map((v) => Number(v));
      return { min: parts[0] ?? 0, max: parts[1] ?? 0 };
    });
}

function parseMultiSensorResponse(response, fallbackDataset, fallbackMaxPoints) {
  const renderedPoints = Number(
    response.headers.get("x-av-renderedpoints")
      ?? response.headers.get("x-av-rendered-points")
      ?? "0",
  );
  const totalPoints = Number(
    response.headers.get("x-av-totalpoints")
      ?? response.headers.get("x-av-total-points")
      ?? "0",
  );

  const parseFloats = (headerValue, length) => {
    if (!headerValue) {
      return new Array(length).fill(0);
    }
    return headerValue.split(",").map((v) => Number(v));
  };

  const attributes = (response.headers.get("x-av-attributes") ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
  const rangesList = parseMultiRangesHeader(response.headers.get("x-av-attr-ranges"));
  const ranges = {};
  attributes.forEach((name, idx) => {
    ranges[name] = rangesList[idx] ?? { min: 0, max: 0 };
  });

  const stride = Number(response.headers.get("x-av-pointstride") ?? String(4 + attributes.length));

  return {
    dataset: response.headers.get("x-av-dataset") ?? fallbackDataset,
    system: response.headers.get("x-av-system") ?? "unknown",
    gridOrigin: response.headers.get("x-av-gridorigin") ?? "corner",
    viewMode: "point",
    backendEngine: response.headers.get("x-av-backendengine") ?? "open3d",
    totalPoints,
    renderedPoints,
    center: parseFloats(response.headers.get("x-av-center"), 3),
    bounds: {
      min: parseFloats(response.headers.get("x-av-bounds-min"), 3),
      max: parseFloats(response.headers.get("x-av-bounds-max"), 3),
    },
    attributes,
    ranges,
    stride,
    count: renderedPoints,
    maxPoints: fallbackMaxPoints,
  };
}

export async function fetchSensorPointcloudMulti(requested, options = {}) {
  const dataset = options.dataset ?? DEFAULT_DATASET_NAME;
  const attributes = (options.attributes && options.attributes.length
    ? options.attributes
    : ["loadCell"]);
  const maxPoints = options.maxPoints ?? 150000;
  const sampleSeed = options.sampleSeed;
  const localSensorsFile = options.localSensorsFile ?? null;
  const localSystemHint = options.localSystemHint ?? "m600";
  const attributesParam = attributes.join(",");

  let response;
  if (options.s3Key || localSensorsFile) {
    const formData = new FormData();
    appendCsvSource(formData, options.s3Key, localSensorsFile);
    formData.append("dataset_label", dataset);
    formData.append("system_hint", localSystemHint);
    formData.append("attributes", attributesParam);
    formData.append("max_points", maxPoints.toString());
    if (Number.isInteger(sampleSeed)) {
      formData.append("random_seed", sampleSeed.toString());
    }
    response = await fetch("/api/sensors/multi/upload", {
      method: "POST",
      body: formData,
    });
  } else {
    const params = new URLSearchParams({
      dataset,
      attributes: attributesParam,
      max_points: maxPoints.toString(),
    });
    if (Number.isInteger(sampleSeed)) {
      params.set("random_seed", sampleSeed.toString());
    }
    response = await fetch(`/api/sensors/multi?${params.toString()}`);
  }

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`API error (${response.status}): ${detail}`);
  }

  const meta = parseMultiSensorResponse(response, dataset, maxPoints);
  const buffer = await response.arrayBuffer();
  const floats = new Float32Array(buffer);
  const expected = meta.count * meta.stride;
  if (floats.length !== expected) {
    throw new Error("Invalid multi-attribute sensor payload size");
  }
  meta.floats = floats;
  return meta;
}

export async function fetchAttributeSeriesMulti(options = {}) {
  const dataset = options.dataset ?? DEFAULT_DATASET_NAME;
  const attributes = (options.attributes && options.attributes.length
    ? options.attributes
    : ["loadCell"]);
  const maxSamples = options.maxSamples ?? 1200;
  const localSensorsFile = options.localSensorsFile ?? null;
  const attributesParam = attributes.join(",");

  if (options.s3Key || localSensorsFile) {
    const formData = new FormData();
    appendCsvSource(formData, options.s3Key, localSensorsFile);
    formData.append("dataset_label", dataset);
    formData.append("attributes", attributesParam);
    formData.append("max_samples", maxSamples.toString());

    const response = await fetch("/api/attribute-series/multi/upload", {
      method: "POST",
      body: formData,
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`API error (${response.status}): ${detail}`);
    }
    return response.json();
  }

  const params = new URLSearchParams({
    dataset,
    attributes: attributesParam,
    max_samples: maxSamples.toString(),
  });

  const response = await fetch(`/api/attribute-series/multi?${params.toString()}`);
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`API error (${response.status}): ${detail}`);
  }
  return response.json();
}
