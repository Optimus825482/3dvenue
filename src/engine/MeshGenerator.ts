import { PlaneGeometry, Float32BufferAttribute, Vector3 } from "three";

interface MeshOptions {
  depthMap: Float32Array;
  width: number;
  height: number;
  depthScale?: number;
  segmentsX?: number;
  segmentsY?: number;
  enhancedNormals?: boolean;
}

export function generateDepthMesh({
  depthMap,
  width,
  height,
  depthScale = 2.0,
  segmentsX,
  segmentsY,
  enhancedNormals = false,
}: MeshOptions): PlaneGeometry {
  const maxSegments = 200;
  const aspect = width / height;

  const segsX = segmentsX ?? Math.min(width, maxSegments);
  const segsY = segmentsY ?? Math.min(height, maxSegments);

  const planeWidth = aspect * 4;
  const planeHeight = 4;

  const geometry = new PlaneGeometry(planeWidth, planeHeight, segsX, segsY);
  const positions = geometry.attributes.position;
  const vertexCount = positions.count;

  for (let i = 0; i < vertexCount; i++) {
    const u = positions.getX(i) / planeWidth + 0.5;
    const v = 1.0 - (positions.getY(i) / planeHeight + 0.5);

    const px = Math.floor(u * (width - 1));
    const py = Math.floor(v * (height - 1));
    const idx = py * width + px;

    const depth = depthMap[idx] ?? 0;
    positions.setZ(i, depth * depthScale);
  }

  positions.needsUpdate = true;

  if (enhancedNormals) {
    computeEnhancedNormals(geometry);
  } else {
    geometry.computeVertexNormals();
  }

  // Vertex colors from depth for solid mode
  const colors = new Float32Array(vertexCount * 3);
  for (let i = 0; i < vertexCount; i++) {
    const z = positions.getZ(i);
    const t = z / depthScale;
    colors[i * 3] = lerp(0.1, 0.0, t);
    colors[i * 3 + 1] = lerp(0.6, 0.9, t);
    colors[i * 3 + 2] = lerp(0.9, 0.3, t);
  }
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));

  return geometry;
}

/**
 * Laplacian mesh smoothing — averages each vertex position
 * with its neighbors for the given number of iterations.
 */
export function smoothMesh(
  geometry: PlaneGeometry,
  iterations: number = 3,
): PlaneGeometry {
  const positions = geometry.attributes.position;
  const count = positions.count;
  const index = geometry.index;

  // Build adjacency list from index buffer
  const neighbors: Set<number>[] = Array.from(
    { length: count },
    () => new Set<number>(),
  );

  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i);
      const b = index.getX(i + 1);
      const c = index.getX(i + 2);
      neighbors[a].add(b);
      neighbors[a].add(c);
      neighbors[b].add(a);
      neighbors[b].add(c);
      neighbors[c].add(a);
      neighbors[c].add(b);
    }
  }

  // Laplacian smoothing (only Z axis — keep XY for texture coords)
  const lambda = 0.5;
  for (let iter = 0; iter < iterations; iter++) {
    const newZ = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const nbrs = neighbors[i];
      if (nbrs.size === 0) {
        newZ[i] = positions.getZ(i);
        continue;
      }

      let avgZ = 0;
      nbrs.forEach((n) => {
        avgZ += positions.getZ(n);
      });
      avgZ /= nbrs.size;

      newZ[i] = positions.getZ(i) + lambda * (avgZ - positions.getZ(i));
    }

    for (let i = 0; i < count; i++) {
      positions.setZ(i, newZ[i]);
    }
  }

  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Enhanced normals using area-weighted face normals for smoother lighting.
 */
function computeEnhancedNormals(geometry: PlaneGeometry): void {
  const positions = geometry.attributes.position;
  const count = positions.count;
  const index = geometry.index;

  const normals = new Float32Array(count * 3);

  if (!index) {
    geometry.computeVertexNormals();
    return;
  }

  const vA = new Vector3();
  const vB = new Vector3();
  const vC = new Vector3();
  const edge1 = new Vector3();
  const edge2 = new Vector3();
  const faceNormal = new Vector3();

  // Accumulate area-weighted face normals
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i);
    const b = index.getX(i + 1);
    const c = index.getX(i + 2);

    vA.fromBufferAttribute(positions, a);
    vB.fromBufferAttribute(positions, b);
    vC.fromBufferAttribute(positions, c);

    edge1.subVectors(vB, vA);
    edge2.subVectors(vC, vA);
    faceNormal.crossVectors(edge1, edge2);
    // Cross product magnitude = 2x triangle area, serves as weighting

    normals[a * 3] += faceNormal.x;
    normals[a * 3 + 1] += faceNormal.y;
    normals[a * 3 + 2] += faceNormal.z;

    normals[b * 3] += faceNormal.x;
    normals[b * 3 + 1] += faceNormal.y;
    normals[b * 3 + 2] += faceNormal.z;

    normals[c * 3] += faceNormal.x;
    normals[c * 3 + 1] += faceNormal.y;
    normals[c * 3 + 2] += faceNormal.z;
  }

  // Normalize
  for (let i = 0; i < count; i++) {
    const x = normals[i * 3];
    const y = normals[i * 3 + 1];
    const z = normals[i * 3 + 2];
    const len = Math.sqrt(x * x + y * y + z * z) || 1;
    normals[i * 3] = x / len;
    normals[i * 3 + 1] = y / len;
    normals[i * 3 + 2] = z / len;
  }

  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
}

export function updateDepthScale(
  geometry: PlaneGeometry,
  depthMap: Float32Array,
  width: number,
  height: number,
  depthScale: number,
): void {
  const positions = geometry.attributes.position;
  const planeWidth = geometry.parameters.width;
  const planeHeight = geometry.parameters.height;

  for (let i = 0; i < positions.count; i++) {
    const u = positions.getX(i) / planeWidth + 0.5;
    const v = 1.0 - (positions.getY(i) / planeHeight + 0.5);

    const px = Math.floor(u * (width - 1));
    const py = Math.floor(v * (height - 1));
    const idx = py * width + px;

    const depth = depthMap[idx] ?? 0;
    positions.setZ(i, depth * depthScale);
  }

  positions.needsUpdate = true;
  geometry.computeVertexNormals();
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}
