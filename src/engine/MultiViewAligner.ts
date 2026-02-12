import { BufferGeometry, Float32BufferAttribute, Matrix4 } from "three";
import type { ProcessedMesh } from "../types";

// ─── Feature descriptor for a grid cell ────────────────────────────────────
interface CellDescriptor {
  meanDepth: number;
  variance: number;
  gradientDir: number; // dominant gradient angle in radians
  row: number;
  col: number;
}

/**
 * Simple multi-view alignment using depth-map overlap correlation.
 * Computes a translation offset to align mesh centers based on
 * shared depth-value histograms.
 */
export function alignMeshes(meshes: ProcessedMesh[]): ProcessedMesh[] {
  if (meshes.length <= 1) return meshes;

  const aligned = [meshes[0]];
  const spacing = 5; // base spacing between mesh origins

  for (let i = 1; i < meshes.length; i++) {
    const prev = meshes[i - 1];
    const curr = meshes[i];

    // Compute similarity between adjacent depth maps
    const overlap = computeDepthOverlap(prev.depthMap, curr.depthMap);

    // Feature-based translation offset
    const featureOffset = computeFeatureOffset(
      prev.depthMap, prev.width, prev.height,
      curr.depthMap, curr.width, curr.height,
    );

    // Reduce spacing if depth maps are similar (likely same area)
    const adjustedSpacing = spacing * (1 - overlap * 0.7);

    // Translate geometry using both histogram + feature offsets
    const translatedGeo = curr.geometry.clone();
    const transform = new Matrix4();
    transform.makeTranslation(
      adjustedSpacing * i + featureOffset.x,
      featureOffset.y,
      featureOffset.z,
    );
    translatedGeo.applyMatrix4(transform);

    aligned.push({
      ...curr,
      geometry: translatedGeo,
    });
  }

  return aligned;
}

/**
 * Merge multiple meshes into a combined point cloud geometry
 * for unified 3D visualization.
 */
export function mergePointClouds(meshes: ProcessedMesh[]): ProcessedMesh[] {
  if (meshes.length <= 1) return meshes;

  // Collect all vertices from all meshes
  const allPositions: number[] = [];
  const allColors: number[] = [];

  for (const mesh of meshes) {
    const positions = mesh.geometry.attributes.position;
    const colors = mesh.geometry.attributes.color;

    for (let i = 0; i < positions.count; i++) {
      allPositions.push(
        positions.getX(i),
        positions.getY(i),
        positions.getZ(i),
      );

      if (colors) {
        allColors.push(colors.getX(i), colors.getY(i), colors.getZ(i));
      } else {
        allColors.push(0.5, 0.8, 1.0);
      }
    }
  }

  // Attempt ICP alignment between consecutive mesh pairs
  if (meshes.length >= 2) {
    for (let i = 1; i < meshes.length; i++) {
      const srcPos = meshes[i].geometry.attributes.position;
      const tgtPos = meshes[i - 1].geometry.attributes.position;

      const srcArr = new Float32Array(srcPos.count * 3);
      const tgtArr = new Float32Array(tgtPos.count * 3);
      for (let j = 0; j < srcPos.count; j++) {
        srcArr[j * 3] = srcPos.getX(j);
        srcArr[j * 3 + 1] = srcPos.getY(j);
        srcArr[j * 3 + 2] = srcPos.getZ(j);
      }
      for (let j = 0; j < tgtPos.count; j++) {
        tgtArr[j * 3] = tgtPos.getX(j);
        tgtArr[j * 3 + 1] = tgtPos.getY(j);
        tgtArr[j * 3 + 2] = tgtPos.getZ(j);
      }

      const icpTransform = icpAlign(srcArr, tgtArr);
      meshes[i].geometry.applyMatrix4(icpTransform);
    }
  }

  // Adaptive voxel size based on total point count
  const totalPoints = allPositions.length / 3;
  const voxelSize = totalPoints > 500_000 ? 0.1 : totalPoints > 100_000 ? 0.07 : 0.05;

  const voxelMap = new Map<
    string,
    { pos: number[]; col: number[]; count: number }
  >();

  for (let i = 0; i < allPositions.length; i += 3) {
    const x = allPositions[i];
    const y = allPositions[i + 1];
    const z = allPositions[i + 2];
    const key = `${Math.round(x / voxelSize)},${Math.round(y / voxelSize)},${Math.round(z / voxelSize)}`;

    const existing = voxelMap.get(key);
    if (existing) {
      existing.pos[0] += x;
      existing.pos[1] += y;
      existing.pos[2] += z;
      existing.col[0] += allColors[i];
      existing.col[1] += allColors[i + 1];
      existing.col[2] += allColors[i + 2];
      existing.count++;
    } else {
      voxelMap.set(key, {
        pos: [x, y, z],
        col: [allColors[i], allColors[i + 1], allColors[i + 2]],
        count: 1,
      });
    }
  }

  // Average positions & colors
  const mergedPositions: number[] = [];
  const mergedColors: number[] = [];
  voxelMap.forEach((voxel) => {
    mergedPositions.push(
      voxel.pos[0] / voxel.count,
      voxel.pos[1] / voxel.count,
      voxel.pos[2] / voxel.count,
    );
    mergedColors.push(
      voxel.col[0] / voxel.count,
      voxel.col[1] / voxel.count,
      voxel.col[2] / voxel.count,
    );
  });

  // Statistical outlier removal on merged cloud
  const filteredPositions: number[] = [];
  const filteredColors: number[] = [];
  statisticalOutlierRemoval(mergedPositions, mergedColors, filteredPositions, filteredColors);

  const mergedGeometry = new BufferGeometry();
  mergedGeometry.setAttribute(
    "position",
    new Float32BufferAttribute(filteredPositions, 3),
  );
  mergedGeometry.setAttribute(
    "color",
    new Float32BufferAttribute(filteredColors, 3),
  );

  // Return merged as first mesh + original individual meshes
  const mergedMesh: ProcessedMesh = {
    photoId: "merged-cloud",
    geometry: mergedGeometry,
    textureUrl: meshes[0].textureUrl,
    depthMap: meshes[0].depthMap,
    width: meshes[0].width,
    height: meshes[0].height,
  };

  return [mergedMesh, ...meshes];
}

/**
 * Simple point-to-point ICP alignment.
 * Uses grid-based nearest neighbor for kd-tree approximation.
 * Returns a 4x4 transformation matrix.
 */
export function icpAlign(
  sourcePoints: Float32Array,
  targetPoints: Float32Array,
  maxIterations: number = 20,
  tolerance: number = 0.001,
): Matrix4 {
  const srcCount = sourcePoints.length / 3;
  const tgtCount = targetPoints.length / 3;

  if (srcCount === 0 || tgtCount === 0) return new Matrix4();

  // Build grid-based spatial index for target
  const gridRes = 0.1;
  const targetGrid = new Map<string, number[]>();
  for (let i = 0; i < tgtCount; i++) {
    const gx = Math.round(targetPoints[i * 3] / gridRes);
    const gy = Math.round(targetPoints[i * 3 + 1] / gridRes);
    const gz = Math.round(targetPoints[i * 3 + 2] / gridRes);
    const key = `${gx},${gy},${gz}`;
    let cell = targetGrid.get(key);
    if (!cell) {
      cell = [];
      targetGrid.set(key, cell);
    }
    cell.push(i);
  }

  // Working copy of source points
  const src = new Float32Array(sourcePoints);
  const cumulativeTranslation = [0, 0, 0];

  for (let iter = 0; iter < maxIterations; iter++) {
    // Compute centroid of matched pairs
    let srcCx = 0, srcCy = 0, srcCz = 0;
    let tgtCx = 0, tgtCy = 0, tgtCz = 0;
    let matchCount = 0;

    // Subsample source for speed (max 2000 points)
    const step = Math.max(1, Math.floor(srcCount / 2000));

    for (let i = 0; i < srcCount; i += step) {
      const sx = src[i * 3];
      const sy = src[i * 3 + 1];
      const sz = src[i * 3 + 2];

      // Find nearest in target grid
      const gx = Math.round(sx / gridRes);
      const gy = Math.round(sy / gridRes);
      const gz = Math.round(sz / gridRes);

      let bestDist = Infinity;
      let bestIdx = -1;

      // Search 3x3x3 neighborhood
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dz = -1; dz <= 1; dz++) {
            const cell = targetGrid.get(`${gx + dx},${gy + dy},${gz + dz}`);
            if (!cell) continue;
            for (const ti of cell) {
              const tx = targetPoints[ti * 3];
              const ty = targetPoints[ti * 3 + 1];
              const tz = targetPoints[ti * 3 + 2];
              const d = (sx - tx) ** 2 + (sy - ty) ** 2 + (sz - tz) ** 2;
              if (d < bestDist) {
                bestDist = d;
                bestIdx = ti;
              }
            }
          }
        }
      }

      if (bestIdx >= 0 && bestDist < 1.0) {
        srcCx += sx;
        srcCy += sy;
        srcCz += sz;
        tgtCx += targetPoints[bestIdx * 3];
        tgtCy += targetPoints[bestIdx * 3 + 1];
        tgtCz += targetPoints[bestIdx * 3 + 2];
        matchCount++;
      }
    }

    if (matchCount < 3) break;

    srcCx /= matchCount;
    srcCy /= matchCount;
    srcCz /= matchCount;
    tgtCx /= matchCount;
    tgtCy /= matchCount;
    tgtCz /= matchCount;

    // Translation-only ICP (sufficient for depth-map alignment)
    const dx = tgtCx - srcCx;
    const dy = tgtCy - srcCy;
    const dz = tgtCz - srcCz;

    const change = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // Apply translation to working source
    for (let i = 0; i < srcCount; i++) {
      src[i * 3] += dx;
      src[i * 3 + 1] += dy;
      src[i * 3 + 2] += dz;
    }

    cumulativeTranslation[0] += dx;
    cumulativeTranslation[1] += dy;
    cumulativeTranslation[2] += dz;

    // Early termination
    if (change < tolerance) break;
  }

  const result = new Matrix4();
  result.makeTranslation(
    cumulativeTranslation[0],
    cumulativeTranslation[1],
    cumulativeTranslation[2],
  );
  return result;
}

// ─── Feature-based alignment ───────────────────────────────────────────────

/**
 * Divide a depth map into an 8x8 grid and compute feature descriptors per cell.
 */
function extractGridFeatures(
  depthMap: Float32Array,
  width: number,
  height: number,
): CellDescriptor[] {
  const gridCols = 8;
  const gridRows = 8;
  const cellW = Math.floor(width / gridCols);
  const cellH = Math.floor(height / gridRows);
  const descriptors: CellDescriptor[] = [];

  for (let row = 0; row < gridRows; row++) {
    for (let col = 0; col < gridCols; col++) {
      const x0 = col * cellW;
      const y0 = row * cellH;

      // Compute mean depth
      let sum = 0;
      let count = 0;
      for (let y = y0; y < y0 + cellH && y < height; y++) {
        for (let x = x0; x < x0 + cellW && x < width; x++) {
          sum += depthMap[y * width + x];
          count++;
        }
      }
      const meanDepth = count > 0 ? sum / count : 0;

      // Compute variance
      let varSum = 0;
      for (let y = y0; y < y0 + cellH && y < height; y++) {
        for (let x = x0; x < x0 + cellW && x < width; x++) {
          const diff = depthMap[y * width + x] - meanDepth;
          varSum += diff * diff;
        }
      }
      const variance = count > 0 ? varSum / count : 0;

      // Compute dominant gradient direction
      let gx = 0, gy = 0;
      for (let y = y0 + 1; y < y0 + cellH - 1 && y < height - 1; y++) {
        for (let x = x0 + 1; x < x0 + cellW - 1 && x < width - 1; x++) {
          gx += depthMap[y * width + x + 1] - depthMap[y * width + x - 1];
          gy += depthMap[(y + 1) * width + x] - depthMap[(y - 1) * width + x];
        }
      }
      const gradientDir = Math.atan2(gy, gx);

      descriptors.push({ meanDepth, variance, gradientDir, row, col });
    }
  }

  return descriptors;
}

/**
 * Compute normalized cross-correlation between two cell descriptors.
 */
function cellNCC(a: CellDescriptor, b: CellDescriptor): number {
  // Feature vector: [meanDepth, sqrt(variance), gradientDir / PI]
  const fa = [a.meanDepth, Math.sqrt(a.variance), a.gradientDir / Math.PI];
  const fb = [b.meanDepth, Math.sqrt(b.variance), b.gradientDir / Math.PI];

  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < 3; i++) {
    dot += fa[i] * fb[i];
    magA += fa[i] * fa[i];
    magB += fb[i] * fb[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom > 0 ? dot / denom : 0;
}

/**
 * Compute a translation offset from feature-based cell matching
 * between two depth maps.
 */
function computeFeatureOffset(
  depthA: Float32Array, widthA: number, heightA: number,
  depthB: Float32Array, widthB: number, heightB: number,
): { x: number; y: number; z: number } {
  const featA = extractGridFeatures(depthA, widthA, heightA);
  const featB = extractGridFeatures(depthB, widthB, heightB);

  // For each cell in A, find best-matching cell in B
  let totalDx = 0;
  let totalDy = 0;
  let totalDz = 0;
  let matches = 0;

  for (const a of featA) {
    let bestScore = -Infinity;
    let bestB: CellDescriptor | null = null;

    for (const b of featB) {
      const score = cellNCC(a, b);
      if (score > bestScore) {
        bestScore = score;
        bestB = b;
      }
    }

    if (bestB && bestScore > 0.8) {
      // Translation in grid coordinates
      totalDx += (bestB.col - a.col);
      totalDy += (bestB.row - a.row);
      totalDz += (bestB.meanDepth - a.meanDepth);
      matches++;
    }
  }

  if (matches === 0) return { x: 0, y: 0, z: 0 };

  // Scale grid offsets to world-space (approximate)
  const cellWorldSize = 0.5; // approximate world-space cell size
  return {
    x: (totalDx / matches) * cellWorldSize,
    y: (totalDy / matches) * cellWorldSize,
    z: (totalDz / matches) * 0.5,
  };
}

// ─── Statistical outlier removal ───────────────────────────────────────────

/**
 * Removes statistical outliers from a point cloud using mean distance criterion.
 * Points whose average distance to k nearest neighbors exceeds
 * mean + 2*stddev are removed.
 */
function statisticalOutlierRemoval(
  positions: number[],
  colors: number[],
  outPositions: number[],
  outColors: number[],
  k: number = 8,
): void {
  const count = positions.length / 3;
  if (count < k + 1) {
    // Not enough points, copy through
    outPositions.push(...positions);
    outColors.push(...colors);
    return;
  }

  // Build grid index for neighbor queries
  const gridRes = 0.15;
  const grid = new Map<string, number[]>();
  for (let i = 0; i < count; i++) {
    const gx = Math.round(positions[i * 3] / gridRes);
    const gy = Math.round(positions[i * 3 + 1] / gridRes);
    const gz = Math.round(positions[i * 3 + 2] / gridRes);
    const key = `${gx},${gy},${gz}`;
    let cell = grid.get(key);
    if (!cell) {
      cell = [];
      grid.set(key, cell);
    }
    cell.push(i);
  }

  // Compute average distance to k nearest neighbors for each point
  // (subsample for speed if too many points)
  const step = Math.max(1, Math.floor(count / 50000));
  const avgDists = new Float32Array(count);

  for (let i = 0; i < count; i += step) {
    const px = positions[i * 3];
    const py = positions[i * 3 + 1];
    const pz = positions[i * 3 + 2];

    const gx = Math.round(px / gridRes);
    const gy = Math.round(py / gridRes);
    const gz = Math.round(pz / gridRes);

    // Collect candidate neighbors from 3x3x3 grid neighborhood
    const dists: number[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const cell = grid.get(`${gx + dx},${gy + dy},${gz + dz}`);
          if (!cell) continue;
          for (const ni of cell) {
            if (ni === i) continue;
            const d = Math.sqrt(
              (px - positions[ni * 3]) ** 2 +
              (py - positions[ni * 3 + 1]) ** 2 +
              (pz - positions[ni * 3 + 2]) ** 2,
            );
            dists.push(d);
          }
        }
      }
    }

    dists.sort((a, b) => a - b);
    let sum = 0;
    const nk = Math.min(k, dists.length);
    for (let j = 0; j < nk; j++) sum += dists[j];
    avgDists[i] = nk > 0 ? sum / nk : 0;

    // Fill skipped entries with same value (good enough for filtering)
    for (let s = 1; s < step && i + s < count; s++) {
      avgDists[i + s] = avgDists[i];
    }
  }

  // Compute mean and stddev of average distances
  let mean = 0;
  let validCount = 0;
  for (let i = 0; i < count; i++) {
    if (avgDists[i] > 0) {
      mean += avgDists[i];
      validCount++;
    }
  }
  mean /= validCount || 1;

  let varianceSum = 0;
  for (let i = 0; i < count; i++) {
    if (avgDists[i] > 0) {
      varianceSum += (avgDists[i] - mean) ** 2;
    }
  }
  const stdDev = Math.sqrt(varianceSum / (validCount || 1));
  const cutoff = mean + 2 * stdDev;

  // Filter
  for (let i = 0; i < count; i++) {
    if (avgDists[i] <= cutoff || avgDists[i] === 0) {
      outPositions.push(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
      outColors.push(colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2]);
    }
  }
}

/**
 * Compute similarity between two depth maps using histogram correlation.
 * Returns a value between 0 (no similarity) and 1 (identical).
 */
function computeDepthOverlap(
  depthA: Float32Array,
  depthB: Float32Array,
): number {
  const bins = 32;
  const histA = new Float32Array(bins);
  const histB = new Float32Array(bins);

  for (let i = 0; i < depthA.length; i++) {
    const bin = Math.min(Math.floor(depthA[i] * bins), bins - 1);
    histA[bin]++;
  }
  for (let i = 0; i < depthB.length; i++) {
    const bin = Math.min(Math.floor(depthB[i] * bins), bins - 1);
    histB[bin]++;
  }

  // Normalize
  const sumA = depthA.length || 1;
  const sumB = depthB.length || 1;
  for (let i = 0; i < bins; i++) {
    histA[i] /= sumA;
    histB[i] /= sumB;
  }

  // Bhattacharyya coefficient
  let bc = 0;
  for (let i = 0; i < bins; i++) {
    bc += Math.sqrt(histA[i] * histB[i]);
  }

  return bc;
}
