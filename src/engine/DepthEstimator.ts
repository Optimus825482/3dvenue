import { pipeline, env } from "@huggingface/transformers";
import type { ModelSize } from "../types";

env.allowLocalModels = false;

let depthPipeline: any = null;
let currentModelSize: ModelSize | null = null;
let activeDevice: "webgpu" | "wasm" = "wasm";
let deviceDetected = false;

const MODEL_MAP: Record<ModelSize, string> = {
  small: "onnx-community/depth-anything-v2-small",
  base: "onnx-community/depth-anything-v2-base",
  large: "onnx-community/depth-anything-v2-large",
};

/**
 * Detects the best available ONNX runtime device.
 * Prefers WebGPU for GPU-accelerated inference, falls back to WASM.
 */
export async function detectBestDevice(): Promise<"webgpu" | "wasm"> {
  if (deviceDetected) return activeDevice;

  try {
    if (typeof navigator !== "undefined" && "gpu" in navigator) {
      const gpu = (navigator as any).gpu;
      if (gpu) {
        const adapter = await gpu.requestAdapter();
        if (adapter) {
          activeDevice = "webgpu";
          deviceDetected = true;
          return "webgpu";
        }
      }
    }
  } catch {
    // WebGPU not available or failed — fall through to WASM
  }

  activeDevice = "wasm";
  deviceDetected = true;
  return "wasm";
}

/**
 * Returns info about the active inference backend.
 */
export function getDeviceInfo(): {
  device: "webgpu" | "wasm";
  detected: boolean;
  modelLoaded: boolean;
  currentModelSize: ModelSize | null;
} {
  return {
    device: activeDevice,
    detected: deviceDetected,
    modelLoaded: depthPipeline !== null,
    currentModelSize,
  };
}

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

  // Auto-detect best device before loading
  const device = await detectBestDevice();
  onProgress?.(
    `AI model yükleniyor (${device === "webgpu" ? "GPU hızlandırmalı" : "WASM"})...`,
  );

  const modelId = MODEL_MAP[modelSize];

  depthPipeline = await (pipeline as any)("depth-estimation", modelId, {
    device,
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
  onProgress?.(
    `Model hazır! (${device === "webgpu" ? "WebGPU" : "WASM"} backend)`,
  );
}

export async function estimateDepth(
  imageUrl: string,
  maxResolution: number = 1024,
): Promise<{
  depthMap: Float32Array;
  width: number;
  height: number;
  confidence: Float32Array;
}> {
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

  // Adaptive bilateral filter for edge-preserving smoothing of depth
  const minDim = Math.min(depthW, depthH);
  const adaptiveRadius = Math.max(2, Math.round(minDim / 128));
  const adaptiveSigmaRange = minDim < 512 ? 0.08 : minDim > 1024 ? 0.15 : 0.12;
  const filtered = bilateralFilter(
    normalized,
    depthW,
    depthH,
    adaptiveRadius,
    adaptiveSigmaRange,
  );

  // Post-processing pipeline
  const median = medianFilter(filtered, depthW, depthH); // Remove salt-and-pepper noise
  const filled = holeFilling(median, depthW, depthH);
  // Second bilateral pass for extra smoothing while preserving edges
  const smoothed = bilateralFilter(
    filled,
    depthW,
    depthH,
    Math.max(2, adaptiveRadius - 1),
    adaptiveSigmaRange * 0.8,
  );
  const confidence = depthConfidenceMap(smoothed, depthW, depthH);

  // Upsample depth using Joint Bilateral Upsampling (RGB-guided)
  let resized: Float32Array;
  if (depthW === w && depthH === h) {
    resized = smoothed;
  } else if (depthW * depthH < w * h) {
    // Upsampling — use JBU for edge-preserving upsample
    try {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0, w, h);
        const rgbData = ctx.getImageData(0, 0, w, h).data;
        resized = jointBilateralUpsample(
          smoothed,
          depthW,
          depthH,
          w,
          h,
          rgbData,
        );
      } else {
        resized = resizeDepthMap(smoothed, depthW, depthH, w, h);
      }
    } catch (_) {
      resized = resizeDepthMap(smoothed, depthW, depthH, w, h);
    }
  } else {
    // Downsampling — bilinear is fine
    resized = resizeDepthMap(smoothed, depthW, depthH, w, h);
  }
  const resizedConfidence = resizeDepthMap(confidence, depthW, depthH, w, h);

  return {
    depthMap: resized,
    width: w,
    height: h,
    confidence: resizedConfidence,
  };
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
  const earlyExitThreshold = 0.01;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const center = data[idx];

      // Fast early-exit: check if all neighbors are within threshold
      let allClose = true;
      outer: for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dy === 0 && dx === 0) continue;
          const ny = y + dy;
          const nx = x + dx;
          if (ny < 0 || ny >= h || nx < 0 || nx >= w) continue;
          if (Math.abs(data[ny * w + nx] - center) > earlyExitThreshold) {
            allClose = false;
            break outer;
          }
        }
      }
      if (allClose) {
        result[idx] = center;
        continue;
      }

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

/**
 * Fills zero/NaN depth values by averaging non-zero neighbors in a 5×5 window.
 */
function holeFilling(data: Float32Array, w: number, h: number): Float32Array {
  const result = new Float32Array(data);
  const radius = 2; // 5×5 window

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const val = result[idx];
      if (val !== 0 && !Number.isNaN(val)) continue;

      let sum = 0;
      let count = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const ny = y + dy;
          const nx = x + dx;
          if (ny < 0 || ny >= h || nx < 0 || nx >= w) continue;
          const nv = data[ny * w + nx];
          if (nv !== 0 && !Number.isNaN(nv)) {
            sum += nv;
            count++;
          }
        }
      }
      result[idx] = count > 0 ? sum / count : 0;
    }
  }

  return result;
}

/**
 * 3×3 Median filter — excellent for removing salt-and-pepper noise
 * from depth maps without blurring edges like Gaussian.
 */
function medianFilter(data: Float32Array, w: number, h: number): Float32Array {
  const result = new Float32Array(data.length);
  const window: number[] = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      window.length = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const ny = Math.max(0, Math.min(h - 1, y + dy));
          const nx = Math.max(0, Math.min(w - 1, x + dx));
          window.push(data[ny * w + nx]);
        }
      }
      // Sort and pick median (index 4 of 9 elements)
      window.sort((a, b) => a - b);
      result[y * w + x] = window[4];
    }
  }

  return result;
}

/**
 * Laplacian of Gaussian edge enhancement on depth discontinuities.
 * Sharpens edges while keeping smooth regions intact.
 */
function edgeSharpening(
  data: Float32Array,
  w: number,
  h: number,
): Float32Array {
  const result = new Float32Array(data.length);
  const sharpenStrength = 0.3;

  // LoG-inspired 3×3 kernel: approximation of Laplacian of Gaussian
  // [ 0, -1,  0 ]
  // [-1,  4, -1 ]
  // [ 0, -1,  0 ]
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;

      if (y === 0 || y === h - 1 || x === 0 || x === w - 1) {
        result[idx] = data[idx];
        continue;
      }

      const laplacian =
        4 * data[idx] -
        data[(y - 1) * w + x] -
        data[(y + 1) * w + x] -
        data[y * w + (x - 1)] -
        data[y * w + (x + 1)];

      // Only sharpen at actual depth discontinuities (large laplacian)
      const enhanced = data[idx] + sharpenStrength * laplacian;
      result[idx] = Math.max(0, Math.min(1, enhanced));
    }
  }

  return result;
}

/**
 * Computes a per-pixel confidence map (0–1).
 * High gradient magnitude → low confidence (depth discontinuities are uncertain).
 */
function depthConfidenceMap(
  data: Float32Array,
  w: number,
  h: number,
): Float32Array {
  const confidence = new Float32Array(data.length);

  // Compute gradient magnitude via Sobel-like finite differences
  let maxGrad = 0;
  const gradients = new Float32Array(data.length);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;

      if (y === 0 || y === h - 1 || x === 0 || x === w - 1) {
        gradients[idx] = 0;
        continue;
      }

      const gx = data[y * w + (x + 1)] - data[y * w + (x - 1)];
      const gy = data[(y + 1) * w + x] - data[(y - 1) * w + x];
      const mag = Math.sqrt(gx * gx + gy * gy);
      gradients[idx] = mag;
      if (mag > maxGrad) maxGrad = mag;
    }
  }

  // Normalize: high gradient → low confidence
  const norm = maxGrad > 0 ? maxGrad : 1;
  for (let i = 0; i < data.length; i++) {
    confidence[i] = 1 - Math.min(1, gradients[i] / norm);
  }

  return confidence;
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

/**
 * Joint Bilateral Upsampling — upsamples a low-res depth map guided by
 * a high-res RGB image. Preserves depth discontinuities at color edges.
 */
function jointBilateralUpsample(
  depthLow: Float32Array,
  lowW: number,
  lowH: number,
  highW: number,
  highH: number,
  rgbHigh: Uint8ClampedArray,
): Float32Array {
  const result = new Float32Array(highW * highH);
  const radius = 2;
  const sigmaSpace = 1.5;
  const sigmaColor = 30;
  const xRatio = lowW / highW;
  const yRatio = lowH / highH;

  for (let y = 0; y < highH; y++) {
    for (let x = 0; x < highW; x++) {
      const highIdx = (y * highW + x) * 4;
      const rH = rgbHigh[highIdx];
      const gH = rgbHigh[highIdx + 1];
      const bH = rgbHigh[highIdx + 2];

      const srcX = x * xRatio;
      const srcY = y * yRatio;
      const cx = Math.min(Math.round(srcX), lowW - 1);
      const cy = Math.min(Math.round(srcY), lowH - 1);

      let sum = 0;
      let wSum = 0;

      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || nx >= lowW || ny < 0 || ny >= lowH) continue;

          const depth = depthLow[ny * lowW + nx];

          const spatialDist = Math.sqrt(dx * dx + dy * dy);
          const ws = Math.exp(
            -(spatialDist * spatialDist) / (2 * sigmaSpace * sigmaSpace),
          );

          const corrHighX = Math.min(Math.round(nx / xRatio), highW - 1);
          const corrHighY = Math.min(Math.round(ny / yRatio), highH - 1);
          const corrIdx = (corrHighY * highW + corrHighX) * 4;
          const colorDist = Math.sqrt(
            (rH - rgbHigh[corrIdx]) ** 2 +
              (gH - rgbHigh[corrIdx + 1]) ** 2 +
              (bH - rgbHigh[corrIdx + 2]) ** 2,
          );
          const wc = Math.exp(
            -(colorDist * colorDist) / (2 * sigmaColor * sigmaColor),
          );

          const weight = ws * wc;
          sum += depth * weight;
          wSum += weight;
        }
      }

      result[y * highW + x] =
        wSum > 0 ? sum / wSum : depthLow[cy * lowW + cx] || 0;
    }
  }

  return result;
}

export function disposeModel(): void {
  depthPipeline = null;
  currentModelSize = null;
}
