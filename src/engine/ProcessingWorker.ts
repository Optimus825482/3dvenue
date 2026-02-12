/**
 * ProcessingWorker.ts
 *
 * Web Worker for offloading depth estimation and mesh generation
 * from the main thread. Communicates via structured messages and
 * uses Transferable objects (Float32Array buffers) to avoid copies.
 *
 * NOTE: @huggingface/transformers relies on dynamic imports and DOM APIs
 * that may not be available in all Worker contexts. If the pipeline fails
 * to load inside the worker, an error message is posted back so the
 * WorkerBridge can fall back to main-thread execution.
 */

// ---------- Types ----------

interface LoadModelMessage {
  type: "loadModel";
  id: string;
  modelSize: "small" | "base" | "large";
}

interface EstimateDepthMessage {
  type: "estimateDepth";
  id: string;
  imageData: string; // base64 data-URL or object-URL (string-serialisable)
  maxResolution: number;
}

interface GenerateMeshMessage {
  type: "generateMesh";
  id: string;
  depthMap: Float32Array;
  width: number;
  height: number;
  depthScale: number;
}

interface DisposeMessage {
  type: "dispose";
  id: string;
}

type WorkerIncoming =
  | LoadModelMessage
  | EstimateDepthMessage
  | GenerateMeshMessage
  | DisposeMessage;

interface WorkerResponse {
  type: "result" | "progress" | "error";
  id: string;
  payload?: Record<string, unknown>;
  transfer?: Transferable[];
}

// ---------- State ----------

let pipeline: ((input: unknown) => Promise<unknown>) | null = null;
let currentModelSize: string | null = null;
let deviceUsed: "webgpu" | "wasm" = "wasm";

// ---------- Helpers ----------

function post(msg: WorkerResponse, transfer?: Transferable[]) {
  (self as unknown as Worker).postMessage(msg, { transfer: transfer ?? [] });
}

function postProgress(id: string, message: string) {
  post({ type: "progress", id, payload: { message } });
}

function postResult(
  id: string,
  payload: Record<string, unknown>,
  transfer?: Transferable[],
) {
  post({ type: "result", id, payload }, transfer);
}

function postError(id: string, error: string) {
  post({ type: "error", id, payload: { error } });
}

// ---------- Device detection (mirrors DepthEstimator) ----------

async function detectBestDevice(): Promise<"webgpu" | "wasm"> {
  try {
    if (typeof navigator !== "undefined" && "gpu" in navigator) {
      const gpu = (
        navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }
      ).gpu;
      if (gpu) {
        const adapter = await gpu.requestAdapter();
        if (adapter) return "webgpu";
      }
    }
  } catch {
    // WebGPU unavailable
  }
  return "wasm";
}

// ---------- Handlers ----------

async function handleLoadModel(msg: LoadModelMessage) {
  try {
    if (pipeline && currentModelSize === msg.modelSize) {
      postResult(msg.id, { alreadyLoaded: true, device: deviceUsed });
      return;
    }

    postProgress(msg.id, "Worker: model yükleniyor...");

    // Dynamic import — this is the step that may fail in a worker context
    const transformers = await import("@huggingface/transformers");
    transformers.env.allowLocalModels = false;

    const MODEL_MAP: Record<string, string> = {
      small: "onnx-community/depth-anything-v2-small",
      base: "onnx-community/depth-anything-v2-base",
      large: "onnx-community/depth-anything-v2-large",
    };

    deviceUsed = await detectBestDevice();
    postProgress(
      msg.id,
      `Worker: ${deviceUsed === "webgpu" ? "WebGPU" : "WASM"} backend kullanılıyor`,
    );

    const modelId = MODEL_MAP[msg.modelSize] ?? MODEL_MAP.small;

    pipeline = (await (
      transformers.pipeline as (...args: unknown[]) => Promise<unknown>
    )("depth-estimation", modelId, {
      device: deviceUsed,
      dtype: "fp32",
      progress_callback: (progress: { status: string; progress?: number }) => {
        if (progress.status === "downloading") {
          const pct = progress.progress ? Math.round(progress.progress) : 0;
          postProgress(msg.id, `Model indiriliyor... ${pct}%`);
        } else if (progress.status === "loading") {
          postProgress(msg.id, "Model yükleniyor...");
        }
      },
    })) as (input: unknown) => Promise<unknown>;

    currentModelSize = msg.modelSize;
    postResult(msg.id, { loaded: true, device: deviceUsed });
  } catch (err: unknown) {
    postError(
      msg.id,
      `Worker model yükleme hatası: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

async function handleEstimateDepth(msg: EstimateDepthMessage) {
  try {
    if (!pipeline) {
      postError(msg.id, "Model henüz yüklenmedi.");
      return;
    }

    postProgress(msg.id, "Derinlik tahmini çalışıyor...");

    const result = await pipeline(msg.imageData);
    const resultArr = result as {
      depth: { data: Float32Array; width: number; height: number };
    }[];
    const single = Array.isArray(result)
      ? resultArr[0]
      : (result as {
          depth: { data: Float32Array; width: number; height: number };
        });
    const depthTensor = single.depth;
    const depthData = depthTensor.data as Float32Array;
    const depthW: number = depthTensor.width;
    const depthH: number = depthTensor.height;

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

    // Bilateral filter
    const filtered = bilateralFilter(normalized, depthW, depthH, 3, 0.1);

    // Resize if needed
    let w = depthW;
    let h = depthH;
    const maxRes = msg.maxResolution;
    if (w > maxRes || h > maxRes) {
      const scale = maxRes / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }

    const resized = resizeDepthMap(filtered, depthW, depthH, w, h);

    // Transfer the buffer — zero-copy
    postResult(msg.id, { depthMap: resized, width: w, height: h }, [
      resized.buffer,
    ]);
  } catch (err: unknown) {
    postError(
      msg.id,
      `Derinlik tahmini hatası: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function handleGenerateMesh(msg: GenerateMeshMessage) {
  try {
    postProgress(msg.id, "Mesh oluşturuluyor...");

    // Lightweight mesh data generation (positions + indices) without Three.js
    const { depthMap, width, height, depthScale } = msg;
    const aspect = width / height;
    const segsX = Math.min(width, 400);
    const segsY = Math.min(height, 400);

    const verticesPerRow = segsX + 1;
    const verticesPerCol = segsY + 1;
    const vertexCount = verticesPerRow * verticesPerCol;

    const positions = new Float32Array(vertexCount * 3);
    const planeW = aspect * 4;
    const planeH = 4;

    for (let iy = 0; iy <= segsY; iy++) {
      for (let ix = 0; ix <= segsX; ix++) {
        const idx = iy * verticesPerRow + ix;
        const u = ix / segsX;
        const v = iy / segsY;

        const x = (u - 0.5) * planeW;
        const y = (0.5 - v) * planeH;

        const px = Math.floor(u * (width - 1));
        const py = Math.floor(v * (height - 1));
        const dIdx = py * width + px;
        const z = (depthMap[dIdx] ?? 0) * depthScale;

        positions[idx * 3] = x;
        positions[idx * 3 + 1] = y;
        positions[idx * 3 + 2] = z;
      }
    }

    postResult(
      msg.id,
      {
        positions,
        width: segsX,
        height: segsY,
        vertexCount,
      },
      [positions.buffer],
    );
  } catch (err: unknown) {
    postError(
      msg.id,
      `Mesh hatası: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function handleDispose(msg: DisposeMessage) {
  pipeline = null;
  currentModelSize = null;
  postResult(msg.id, { disposed: true });
}

// ---------- Bilateral filter (same as DepthEstimator) ----------

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

// ---------- Resize (same as DepthEstimator) ----------

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

// ---------- Message handler ----------

self.onmessage = async (e: MessageEvent<WorkerIncoming>) => {
  const msg = e.data;

  switch (msg.type) {
    case "loadModel":
      await handleLoadModel(msg);
      break;
    case "estimateDepth":
      await handleEstimateDepth(msg);
      break;
    case "generateMesh":
      handleGenerateMesh(msg);
      break;
    case "dispose":
      handleDispose(msg);
      break;
    default:
      postError(
        "unknown",
        `Bilinmeyen mesaj tipi: ${(msg as unknown as { type: string }).type}`,
      );
  }
};

// Signal that the worker is ready
post({ type: "result", id: "__init__", payload: { ready: true } });
