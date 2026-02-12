import {
  PlaneGeometry,
  Float32BufferAttribute,
  Vector3,
  DataTexture,
  RGBAFormat,
  FloatType,
  LinearFilter,
} from "three";
import type { CameraIntrinsics } from "../types";

interface MeshOptions {
  depthMap: Float32Array;
  width: number;
  height: number;
  depthScale?: number;
  segmentsX?: number;
  segmentsY?: number;
  enhancedNormals?: boolean;
  outlierRemoval?: boolean;
  perspective?: boolean;
  stretchRemoval?: boolean;
  stretchThreshold?: number;
  fov?: number;
  cameraIntrinsics?: CameraIntrinsics;
}

export function generateDepthMesh({
  depthMap,
  width,
  height,
  depthScale = 2.0,
  segmentsX,
  segmentsY,
  enhancedNormals = false,
  outlierRemoval = true,
  perspective = true,
  stretchRemoval = true,
  stretchThreshold = 0.2,
  fov = 60,
  cameraIntrinsics,
}: MeshOptions): PlaneGeometry {
  const maxSegments = 800; // Increased from 200 for smoother details
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
    const z = depth * depthScale;
    positions.setZ(i, z);

    // Perspective Projection: Expand X/Y based on Z
    if (perspective) {
      const effectiveFov = cameraIntrinsics?.fov ?? fov;
      const perspectiveFactor =
        Math.tan((effectiveFov * Math.PI) / 180 / 2) * 0.5;
      const scale = 1 + z * perspectiveFactor;

      const originalX = positions.getX(i);
      const originalY = positions.getY(i);

      positions.setX(i, originalX * scale);
      positions.setY(i, originalY * scale);
    }
  }

  // Edge/Stretch Removal
  if (stretchRemoval && geometry.index) {
    removeStretchedFaces(geometry, stretchThreshold);
  }

  // Edge Margin Culling — remove outer 3% of mesh faces
  // to eliminate noisy/distorted border regions from depth estimation
  if (geometry.index) {
    cullEdgeMargin(geometry, width, height, 0.03);
  }

  // Statistical Outlier Removal
  if (outlierRemoval) {
    let mean = 0;
    let count = 0;
    // 1. Calculate Mean
    for (let i = 0; i < vertexCount; i++) {
      const z = positions.getZ(i);
      if (z > 0) {
        mean += z;
        count++;
      }
    }
    mean /= count || 1;

    // 2. Calculate Std Dev
    let variance = 0;
    for (let i = 0; i < vertexCount; i++) {
      const z = positions.getZ(i);
      if (z > 0) {
        variance += Math.pow(z - mean, 2);
      }
    }
    const stdDev = Math.sqrt(variance / (count || 1));

    // 3. Filter Outliers — clamp to threshold instead of zeroing
    const threshold = mean + 2.5 * stdDev;

    for (let i = 0; i < vertexCount; i++) {
      if (positions.getZ(i) > threshold) {
        positions.setZ(i, threshold);
      }
    }
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
 * Removes faces (triangles) that have edges longer than the threshold in the Z-axis.
 * This fixes the "curtain" effect where foreground connects to background.
 */
function removeStretchedFaces(
  geometry: PlaneGeometry,
  threshold: number,
): void {
  const index = geometry.index;
  const positions = geometry.attributes.position;
  if (!index) return;

  // Collect only non-stretched triangles into a new index buffer
  const kept: number[] = [];

  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i);
    const b = index.getX(i + 1);
    const c = index.getX(i + 2);

    const z1 = positions.getZ(a);
    const z2 = positions.getZ(b);
    const z3 = positions.getZ(c);

    const d1 = Math.abs(z1 - z2);
    const d2 = Math.abs(z2 - z3);
    const d3 = Math.abs(z3 - z1);

    if (d1 <= threshold && d2 <= threshold && d3 <= threshold) {
      kept.push(a, b, c);
    }
  }

  // Rebuild the index buffer with only the kept triangles
  geometry.setIndex(kept);
}

/**
 * Culls triangles whose vertices fall within the outer margin of the mesh.
 * Depth estimation at image borders is unreliable and creates artifacts.
 */
function cullEdgeMargin(
  geometry: PlaneGeometry,
  imageWidth: number,
  imageHeight: number,
  marginPercent: number = 0.03,
): void {
  const index = geometry.index;
  const positions = geometry.attributes.position;
  if (!index) return;

  const planeWidth = geometry.parameters.width;
  const planeHeight = geometry.parameters.height;
  const marginU = marginPercent;
  const marginV = marginPercent;

  const isInMargin = (vertexIndex: number): boolean => {
    const u = positions.getX(vertexIndex) / planeWidth + 0.5;
    const v = 1.0 - (positions.getY(vertexIndex) / planeHeight + 0.5);
    return u < marginU || u > 1 - marginU || v < marginV || v > 1 - marginV;
  };

  const kept: number[] = [];
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i);
    const b = index.getX(i + 1);
    const c = index.getX(i + 2);

    // Remove triangle if ANY vertex is in the margin
    if (!isInMargin(a) && !isInMargin(b) && !isInMargin(c)) {
      kept.push(a, b, c);
    }
  }

  geometry.setIndex(kept);
}

/**
 * Taubin mesh smoothing — alternates lambda (smooth) and mu (inflate) passes.
 * Unlike pure Laplacian, this prevents mesh shrinkage while still removing noise.
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

  // Taubin smoothing (only Z axis — keep XY for texture coords)
  // lambda > 0 smooths, mu < 0 and |mu| > lambda prevents shrinkage
  const lambda = 0.5;
  const mu = -0.53; // Must satisfy |mu| > lambda
  for (let iter = 0; iter < iterations; iter++) {
    // Lambda pass (smooth)
    const afterLambda = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const nbrs = neighbors[i];
      if (nbrs.size === 0) {
        afterLambda[i] = positions.getZ(i);
        continue;
      }
      let avgZ = 0;
      nbrs.forEach((n) => {
        avgZ += positions.getZ(n);
      });
      avgZ /= nbrs.size;
      afterLambda[i] = positions.getZ(i) + lambda * (avgZ - positions.getZ(i));
    }
    for (let i = 0; i < count; i++) {
      positions.setZ(i, afterLambda[i]);
    }

    // Mu pass (un-shrink)
    const afterMu = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const nbrs = neighbors[i];
      if (nbrs.size === 0) {
        afterMu[i] = positions.getZ(i);
        continue;
      }
      let avgZ = 0;
      nbrs.forEach((n) => {
        avgZ += positions.getZ(n);
      });
      avgZ /= nbrs.size;
      afterMu[i] = positions.getZ(i) + mu * (avgZ - positions.getZ(i));
    }
    for (let i = 0; i < count; i++) {
      positions.setZ(i, afterMu[i]);
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

/**
 * Generates a normal map from a depth map using Sobel operators (3×3).
 * Returns RGBA Float32Array (width × height × 4).
 */
export function generateNormalMapFromDepth(
  depthMap: Float32Array,
  width: number,
  height: number,
  strength: number = 1.0,
): Float32Array {
  const output = new Float32Array(width * height * 4);

  // Scharr kernels — more rotationally symmetric than Sobel
  const sobelX = [-3, 0, 3, -10, 0, 10, -3, 0, 3];
  const sobelY = [-3, -10, -3, 0, 0, 0, 3, 10, 3];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let dzdx = 0;
      let dzdy = 0;

      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const sx = Math.min(Math.max(x + kx, 0), width - 1);
          const sy = Math.min(Math.max(y + ky, 0), height - 1);
          const sample = depthMap[sy * width + sx];
          const ki = (ky + 1) * 3 + (kx + 1);
          dzdx += sample * sobelX[ki];
          dzdy += sample * sobelY[ki];
        }
      }

      // Construct normal vector
      const nx = -dzdx * strength;
      const ny = -dzdy * strength;
      const nz = 1.0;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;

      // Encode to 0-1 range
      const idx = (y * width + x) * 4;
      output[idx] = (nx / len) * 0.5 + 0.5;
      output[idx + 1] = (ny / len) * 0.5 + 0.5;
      output[idx + 2] = (nz / len) * 0.5 + 0.5;
      output[idx + 3] = 1.0;
    }
  }

  return output;
}

/**
 * Creates a Three.js DataTexture from a normal map Float32Array.
 */
export function createNormalTexture(
  normalData: Float32Array,
  width: number,
  height: number,
): DataTexture {
  const texture = new DataTexture(
    normalData,
    width,
    height,
    RGBAFormat,
    FloatType,
  );
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
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
