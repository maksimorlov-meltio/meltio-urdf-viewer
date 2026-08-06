import {
  BufferGeometry,
  FileLoader,
  Float32BufferAttribute,
  Loader,
} from "three";

function isBinary(data) {
  if (!(data instanceof ArrayBuffer) || data.byteLength < 84) {
    return false;
  }

  const reader = new DataView(data);
  const faces = reader.getUint32(80, true);
  const expectedSize = 84 + (faces * 50);
  if (expectedSize === data.byteLength) {
    return true;
  }

  const header = new TextDecoder().decode(new Uint8Array(data, 0, 5)).toLowerCase();
  return header !== "solid";
}

function parseBinary(data) {
  const reader = new DataView(data);
  const faces = reader.getUint32(80, true);

  const positions = [];
  const normals = [];
  let offset = 84;

  for (let face = 0; face < faces; face += 1) {
    const nx = reader.getFloat32(offset, true); offset += 4;
    const ny = reader.getFloat32(offset, true); offset += 4;
    const nz = reader.getFloat32(offset, true); offset += 4;

    for (let i = 0; i < 3; i += 1) {
      const x = reader.getFloat32(offset, true); offset += 4;
      const y = reader.getFloat32(offset, true); offset += 4;
      const z = reader.getFloat32(offset, true); offset += 4;

      positions.push(x, y, z);
      normals.push(nx, ny, nz);
    }

    offset += 2;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  return geometry;
}

function parseASCII(text) {
  const positions = [];
  const normals = [];
  const facePattern = /facet\s+normal\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)[\s\S]*?endfacet/g;
  const vertexPattern = /vertex\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)/g;

  let faceMatch;
  while ((faceMatch = facePattern.exec(text)) !== null) {
    const nx = Number(faceMatch[1]);
    const ny = Number(faceMatch[2]);
    const nz = Number(faceMatch[3]);
    const facetText = faceMatch[0];

    vertexPattern.lastIndex = 0;
    const verts = [];
    let vertexMatch;
    while ((vertexMatch = vertexPattern.exec(facetText)) !== null) {
      verts.push([
        Number(vertexMatch[1]),
        Number(vertexMatch[2]),
        Number(vertexMatch[3]),
      ]);
      if (verts.length === 3) {
        break;
      }
    }

    if (verts.length !== 3) {
      continue;
    }

    for (const v of verts) {
      positions.push(v[0], v[1], v[2]);
      normals.push(nx, ny, nz);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  return geometry;
}

class STLLoader extends Loader {
  load(url, onLoad, onProgress, onError) {
    const loader = new FileLoader(this.manager);
    loader.setPath(this.path);
    loader.setRequestHeader(this.requestHeader);
    loader.setWithCredentials(this.withCredentials);
    loader.setResponseType("arraybuffer");

    loader.load(
      url,
      (data) => {
        try {
          onLoad(this.parse(data));
        } catch (e) {
          if (onError) {
            onError(e);
          }
        }
      },
      onProgress,
      onError,
    );
  }

  parse(data) {
    if (typeof data === "string") {
      return parseASCII(data);
    }

    let arrayBuffer = data;
    if (!(arrayBuffer instanceof ArrayBuffer) && ArrayBuffer.isView(arrayBuffer)) {
      arrayBuffer = arrayBuffer.buffer;
    }

    if (!(arrayBuffer instanceof ArrayBuffer)) {
      throw new Error("STLLoader: Unsupported input data type.");
    }

    if (isBinary(arrayBuffer)) {
      return parseBinary(arrayBuffer);
    }

    const text = new TextDecoder().decode(new Uint8Array(arrayBuffer));
    return parseASCII(text);
  }
}

export { STLLoader };
