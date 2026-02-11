import { BufferGeometry, Float32BufferAttribute, Matrix4 } from "three";
import type { ProcessedMesh } from "../types";

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

    // Reduce spacing if depth maps are similar (likely same area)
    const adjustedSpacing = spacing * (1 - overlap * 0.7);

    // Translate geometry
    const translatedGeo = curr.geometry.clone();
    const transform = new Matrix4();
    transform.makeTranslation(adjustedSpacing * i, 0, 0);
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

  // Simple voxel-grid downsampling to remove near-duplicate points
  const voxelSize = 0.05;
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

  const mergedGeometry = new BufferGeometry();
  mergedGeometry.setAttribute(
    "position",
    new Float32BufferAttribute(mergedPositions, 3),
  );
  mergedGeometry.setAttribute(
    "color",
    new Float32BufferAttribute(mergedColors, 3),
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
