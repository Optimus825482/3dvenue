import { pipeline, env } from "@huggingface/transformers";
import type { ModelSize } from "../types";

env.allowLocalModels = false;

let depthPipeline: any = null;
let currentModelSize: ModelSize | null = null;

const MODEL_MAP: Record<ModelSize, string> = {
  small: "onnx-community/depth-anything-v2-small",
  base: "onnx-community/depth-anything-v2-base",
  large: "onnx-community/depth-anything-v2-large",
};

export async function loadModel(
  modelSize: ModelSize = "small",
  onProgress?: (msg: string) => void,
): Promise<void> {
  // Reload if model size changed
  if (depthPipeline && currentModelSize === modelSize) return;

  if (depthPipeline && currentModelSize !== modelSize) {
    depthPipeline = null;
    currentModelSize = null;
    onProgress?.("Yeni model yükleniyor...");
  }

  onProgress?.("AI model yükleniyor...");

  const modelId = MODEL_MAP[modelSize];

  depthPipeline = await (pipeline as any)("depth-estimation", modelId, {
    device: "wasm",
    dtype: "fp32",
    progress_callback: (progress: any) => {
      if (progress.status === "downloading") {
        const pct = progress.progress ? Math.round(progress.progress) : 0;
        onProgress?.(`Model indiriliyor... ${pct}%`);
      } else if (progress.status === "loading") {
        onProgress?.("Model yükleniyor...");
      }
    },
  });

  currentModelSize = modelSize;
  onProgress?.("Model hazır!");
}

export async function estimateDepth(
  imageUrl: string,
  maxResolution: number = 512,
): Promise<{ depthMap: Float32Array; width: number; height: number }> {
  if (!depthPipeline)
    throw new Error("Model not loaded. Call loadModel() first.");

  // Load image to get dimensions
  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = imageUrl;
  });

  // Cap resolution
  let w = img.width;
  let h = img.height;
  if (w > maxResolution || h > maxResolution) {
    const scale = maxResolution / Math.max(w, h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }

  // Run depth estimation
  const result = await depthPipeline(imageUrl);
  const single = Array.isArray(result) ? result[0] : result;
  const depthTensor = single.depth;
  const depthData = depthTensor.data as Float32Array;
  const depthW = depthTensor.width;
  const depthH = depthTensor.height;

  // Normalize to 0-1
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < depthData.length; i++) {
    if (depthData[i] < min) min = depthData[i];
    if (depthData[i] > max) max = depthData[i];
  }

  const range = max - min || 1;
  const normalized = new Float32Array(depthData.length);
  for (let i = 0; i < depthData.length; i++) {
    normalized[i] = (depthData[i] - min) / range;
  }

  // Bilateral filter for edge-preserving smoothing of depth
  const filtered = bilateralFilter(normalized, depthW, depthH, 3, 0.1);

  // Resize to target dimensions
  const resized = resizeDepthMap(filtered, depthW, depthH, w, h);

  return { depthMap: resized, width: w, height: h };
}

function bilateralFilter(
  data: Float32Array,
  w: number,
  h: number,
  radius: number,
  sigmaRange: number,
): Float32Array {
  const result = new Float32Array(data.length);
  const sigmaSpace = radius / 2;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const center = data[idx];
      let sum = 0;
      let wSum = 0;

      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const ny = y + dy;
          const nx = x + dx;
          if (ny < 0 || ny >= h || nx < 0 || nx >= w) continue;

          const nIdx = ny * w + nx;
          const neighbor = data[nIdx];
          const spatialDist = Math.sqrt(dx * dx + dy * dy);
          const rangeDist = Math.abs(center - neighbor);

          const ws = Math.exp(
            -(spatialDist * spatialDist) / (2 * sigmaSpace * sigmaSpace),
          );
          const wr = Math.exp(
            -(rangeDist * rangeDist) / (2 * sigmaRange * sigmaRange),
          );
          const weight = ws * wr;

          sum += neighbor * weight;
          wSum += weight;
        }
      }

      result[idx] = wSum > 0 ? sum / wSum : center;
    }
  }

  return result;
}

function resizeDepthMap(
  source: Float32Array,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): Float32Array {
  if (srcW === dstW && srcH === dstH) return source;

  const result = new Float32Array(dstW * dstH);
  const xRatio = srcW / dstW;
  const yRatio = srcH / dstH;

  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      // Bilinear interpolation
      const srcX = x * xRatio;
      const srcY = y * yRatio;
      const x0 = Math.floor(srcX);
      const y0 = Math.floor(srcY);
      const x1 = Math.min(x0 + 1, srcW - 1);
      const y1 = Math.min(y0 + 1, srcH - 1);
      const fx = srcX - x0;
      const fy = srcY - y0;

      const v00 = source[y0 * srcW + x0];
      const v10 = source[y0 * srcW + x1];
      const v01 = source[y1 * srcW + x0];
      const v11 = source[y1 * srcW + x1];

      result[y * dstW + x] =
        v00 * (1 - fx) * (1 - fy) +
        v10 * fx * (1 - fy) +
        v01 * (1 - fx) * fy +
        v11 * fx * fy;
    }
  }

  return result;
}

export function disposeModel(): void {
  depthPipeline = null;
  currentModelSize = null;
}
