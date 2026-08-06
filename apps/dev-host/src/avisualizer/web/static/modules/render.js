import * as THREE from "three";

function clamp01(value) {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function viridisColor(t) {
  const clamped = clamp01(t);
  const color = new THREE.Color();
  color.setHSL(0.78 - clamped * 0.72, 0.95, 0.5);
  return color;
}

export function buildSpriteMaterial(pointSize, outlineColor, outlineStart) {
  const vertexShader = `
    attribute vec3 color;
    varying vec3 vColor;
    uniform float uPointSize;

    void main() {
      vColor = color;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      float depth = max(0.05, -mvPosition.z);
      float depthScale = 8.0 / depth;
      gl_PointSize = clamp(uPointSize * depthScale, 1.0, 24.0);
    }
  `;

  const fragmentShader = `
    varying vec3 vColor;
    uniform vec3 uOutlineColor;
    uniform float uOutlineStart;

    void main() {
      vec2 p = gl_PointCoord * 2.0 - 1.0;
      float r = length(p);
      if (r > 1.0) {
        discard;
      }

      float ringMask = step(uOutlineStart, r);
      vec3 finalColor = mix(vColor, uOutlineColor, ringMask);
      gl_FragColor = vec4(finalColor, 1.0);
    }
  `;

  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uPointSize: { value: pointSize },
      uOutlineColor: { value: outlineColor.clone() },
      uOutlineStart: { value: outlineStart },
    },
    depthTest: true,
    depthWrite: true,
    transparent: false,
  });
}

export function createBuildPlateGrid(sizeX, sizeY, zLevel, gridMajorColor, gridMinorColor) {
  const gridGroup = new THREE.Group();
  const minorStep = 10;
  const majorStep = 50;

  const majorPositions = [];
  const minorPositions = [];

  const addSegment = (buffer, x1, y1, x2, y2) => {
    buffer.push(x1, y1, zLevel, x2, y2, zLevel);
  };

  for (let x = 0; x <= sizeX + 1e-6; x += minorStep) {
    const isMajor = x === 0 || Math.abs(x - sizeX) < 1e-6 || Math.round(x) % majorStep === 0;
    addSegment(isMajor ? majorPositions : minorPositions, x, 0, x, sizeY);
  }

  for (let y = 0; y <= sizeY + 1e-6; y += minorStep) {
    const isMajor = y === 0 || Math.abs(y - sizeY) < 1e-6 || Math.round(y) % majorStep === 0;
    addSegment(isMajor ? majorPositions : minorPositions, 0, y, sizeX, y);
  }

  if (minorPositions.length > 0) {
    const minorGeometry = new THREE.BufferGeometry();
    minorGeometry.setAttribute("position", new THREE.Float32BufferAttribute(minorPositions, 3));
    const minorMaterial = new THREE.LineBasicMaterial({ color: gridMinorColor, toneMapped: false });
    gridGroup.add(new THREE.LineSegments(minorGeometry, minorMaterial));
  }

  if (majorPositions.length > 0) {
    const majorGeometry = new THREE.BufferGeometry();
    majorGeometry.setAttribute("position", new THREE.Float32BufferAttribute(majorPositions, 3));
    const majorMaterial = new THREE.LineBasicMaterial({ color: gridMajorColor, toneMapped: false });
    gridGroup.add(new THREE.LineSegments(majorGeometry, majorMaterial));
  }

  return gridGroup;
}

export function createReferenceMarkers(modelOrigin, gridOrigin, zLevel) {
  const markerGroup = new THREE.Group();
  const white = new THREE.LineBasicMaterial({ color: 0xffffff, toneMapped: false });
  const halfSize = 5;
  const radius = 5;

  const crossPositions = new Float32Array([
    modelOrigin[0] - halfSize, modelOrigin[1], zLevel,
    modelOrigin[0] + halfSize, modelOrigin[1], zLevel,
    modelOrigin[0], modelOrigin[1] - halfSize, zLevel,
    modelOrigin[0], modelOrigin[1] + halfSize, zLevel,
  ]);
  const crossGeometry = new THREE.BufferGeometry();
  crossGeometry.setAttribute("position", new THREE.BufferAttribute(crossPositions, 3));
  markerGroup.add(new THREE.LineSegments(crossGeometry, white));

  const circleSegments = 48;
  const circlePositions = new Float32Array(circleSegments * 3);
  for (let i = 0; i < circleSegments; i += 1) {
    const t = (i / circleSegments) * Math.PI * 2;
    circlePositions[i * 3] = gridOrigin[0] + Math.cos(t) * radius;
    circlePositions[i * 3 + 1] = gridOrigin[1] + Math.sin(t) * radius;
    circlePositions[i * 3 + 2] = zLevel;
  }

  const circleGeometry = new THREE.BufferGeometry();
  circleGeometry.setAttribute("position", new THREE.BufferAttribute(circlePositions, 3));
  markerGroup.add(new THREE.LineLoop(circleGeometry, white));

  return markerGroup;
}

export function buildSpriteObject(points, attributeRange, xyOffset, pointSize, outlineColor, outlineStart) {
  const count = points.length;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  const minVal = attributeRange.min;
  const maxVal = attributeRange.max;
  const span = Math.max(maxVal - minVal, 1e-9);

  for (let i = 0; i < count; i += 1) {
    const p = points[i];
    const offset = i * 3;
    positions[offset] = p[0] + xyOffset[0];
    positions[offset + 1] = p[1] + xyOffset[1];
    positions[offset + 2] = p[2];

    const c = viridisColor((p[3] - minVal) / span);
    colors[offset] = c.r;
    colors[offset + 1] = c.g;
    colors[offset + 2] = c.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const material = buildSpriteMaterial(pointSize, outlineColor, outlineStart);
  const pointsObject = new THREE.Points(geometry, material);
  pointsObject.renderOrder = 2;
  return { object: pointsObject, material };
}

export function buildVoxelCubeObject(points, attributeRange, voxelXY, voxelZ, edgeSize, xyOffset, gridMajorColor) {
  const count = points.length;
  const minVal = attributeRange.min;
  const maxVal = attributeRange.max;
  const span = Math.max(maxVal - minVal, 1e-9);

  const boxGeometry = new THREE.BoxGeometry(voxelXY, voxelXY, voxelZ);
  const boxMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });

  const mesh = new THREE.InstancedMesh(boxGeometry, boxMaterial, count);
  const instanceColors = new Float32Array(count * 3);
  const dummy = new THREE.Object3D();

  for (let i = 0; i < count; i += 1) {
    const p = points[i];

    dummy.position.set(p[0] + xyOffset[0], p[1] + xyOffset[1], p[2]);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);

    const c = viridisColor((p[3] - minVal) / span);
    const offset = i * 3;
    instanceColors[offset] = c.r;
    instanceColors[offset + 1] = c.g;
    instanceColors[offset + 2] = c.b;
  }

  mesh.instanceColor = new THREE.InstancedBufferAttribute(instanceColors, 3);
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = true;
  mesh.renderOrder = 2;

  if (edgeSize <= 0) {
    return mesh;
  }

  const edgeTemplate = new THREE.EdgesGeometry(boxGeometry);
  const edgeTemplatePos = edgeTemplate.getAttribute("position").array;
  const mergedEdgePos = new Float32Array(count * edgeTemplatePos.length);
  const edgeVertexCount = edgeTemplatePos.length / 3;

  for (let i = 0; i < count; i += 1) {
    const p = points[i];
    const voxelOffset = i * edgeTemplatePos.length;

    for (let j = 0; j < edgeTemplatePos.length; j += 3) {
      mergedEdgePos[voxelOffset + j] = edgeTemplatePos[j] + p[0] + xyOffset[0];
      mergedEdgePos[voxelOffset + j + 1] = edgeTemplatePos[j + 1] + p[1] + xyOffset[1];
      mergedEdgePos[voxelOffset + j + 2] = edgeTemplatePos[j + 2] + p[2];
    }
  }

  const edgeGeometry = new THREE.BufferGeometry();
  edgeGeometry.setAttribute("position", new THREE.BufferAttribute(mergedEdgePos, 3));
  edgeGeometry.setDrawRange(0, count * edgeVertexCount);

  const edgeMaterial = new THREE.LineBasicMaterial({
    color: gridMajorColor,
    toneMapped: false,
    linewidth: edgeSize,
  });
  const edgeLines = new THREE.LineSegments(edgeGeometry, edgeMaterial);
  edgeLines.renderOrder = 3;

  edgeTemplate.dispose();

  const group = new THREE.Group();
  group.add(mesh);
  group.add(edgeLines);
  return group;
}
