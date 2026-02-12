/**
 * WorkerBridge.ts
 *
 * Abstraction layer that manages the ProcessingWorker lifecycle and provides
 * async wrappers for depth estimation and mesh generation.
 *
 * Key behaviours:
 *  - Attempts to spin up a Web Worker for off-main-thread processing.
 *  - If the worker fails to load (e.g. @huggingface/transformers doesn't work
 *    inside a Worker due to dynamic imports / DOM dependencies), transparently
 *    falls back to direct main-thread execution via the DepthEstimator module.
 *  - Supports cancellation via AbortController.
 *  - Uses Transferable objects to avoid copying Float32Array data.
 */

import type { ModelSize } from "../types";
import {
  loadModel as directLoadModel,
  estimateDepth as directEstimateDepth,
  disposeModel as directDispose,
  getDeviceInfo,
} from "./DepthEstimator";

// ---------- Types ----------

export interface DepthEstimationResult {
  depthMap: Float32Array;
  width: number;
  height: number;
}

export interface WorkerBridgeStatus {
  mode: "worker" | "main-thread";
  workerReady: boolean;
  modelLoaded: boolean;
  device: "webgpu" | "wasm";
}

type PendingResolver = {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  onProgress?: (msg: string) => void;
};

// ---------- Bridge ----------

let worker: Worker | null = null;
let workerReady = false;
let workerFailed = false;
const pendingCalls = new Map<string, PendingResolver>();
let msgCounter = 0;

function nextId(): string {
  return `msg_${++msgCounter}_${Date.now()}`;
}

/**
 * Spin up the worker. Resolves `true` if the worker is usable,
 * `false` if it isn't (triggers main-thread fallback).
 */
async function ensureWorker(): Promise<boolean> {
  if (workerFailed) return false;
  if (worker && workerReady) return true;

  return new Promise<boolean>((resolve) => {
    try {
      worker = new Worker(new URL("./ProcessingWorker.ts", import.meta.url), {
        type: "module",
      });

      const initTimeout = setTimeout(() => {
        // Worker didn't signal readiness in time
        workerFailed = true;
        worker?.terminate();
        worker = null;
        resolve(false);
      }, 10_000);

      worker.onmessage = (e) => {
        const { type, id, payload } = e.data;

        // Handle init signal
        if (id === "__init__" && payload?.ready) {
          workerReady = true;
          clearTimeout(initTimeout);
          resolve(true);
          return;
        }

        const pending = pendingCalls.get(id);
        if (!pending) return;

        switch (type) {
          case "result":
            pending.resolve(payload);
            pendingCalls.delete(id);
            break;
          case "progress":
            pending.onProgress?.(payload?.message ?? "");
            break;
          case "error":
            pending.reject(new Error(payload?.error ?? "Worker error"));
            pendingCalls.delete(id);
            break;
        }
      };

      worker.onerror = (err) => {
        console.warn(
          "[WorkerBridge] Worker error, falling back to main thread:",
          err,
        );
        workerFailed = true;
        clearTimeout(initTimeout);
        worker?.terminate();
        worker = null;

        // Reject all pending calls
        for (const [, p] of pendingCalls) {
          p.reject(new Error("Worker crashed — falling back to main thread"));
        }
        pendingCalls.clear();

        resolve(false);
      };
    } catch {
      workerFailed = true;
      resolve(false);
    }
  });
}

/**
 * Send a message to the worker and return a promise that resolves
 * when the worker posts a result back.
 */
function callWorker<T = unknown>(
  message: Record<string, unknown>,
  options?: {
    onProgress?: (msg: string) => void;
    signal?: AbortSignal;
    transfer?: Transferable[];
  },
): Promise<T> {
  const id = nextId();
  const msg = { ...message, id };

  return new Promise<T>((resolve, reject) => {
    if (options?.signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    pendingCalls.set(id, {
      resolve: resolve as (value: unknown) => void,
      reject: reject as (reason: unknown) => void,
      onProgress: options?.onProgress,
    });

    // Listen for abort
    options?.signal?.addEventListener(
      "abort",
      () => {
        pendingCalls.delete(id);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );

    worker!.postMessage(msg, options?.transfer ?? []);
  });
}

// ---------- Public API ----------

/**
 * Load the depth-estimation model.
 * Tries the worker first; falls back to main-thread `DepthEstimator`.
 */
export async function loadModelViaWorker(
  modelSize: ModelSize = "small",
  onProgress?: (msg: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const canWorker = await ensureWorker();

  if (canWorker) {
    try {
      await callWorker(
        { type: "loadModel", modelSize },
        { onProgress, signal },
      );
      return;
    } catch (err) {
      // Worker failed during model load — fallback
      console.warn(
        "[WorkerBridge] Worker model load failed, falling back:",
        err,
      );
      workerFailed = true;
      worker?.terminate();
      worker = null;
    }
  }

  // Main-thread fallback
  onProgress?.("Ana thread üzerinde model yükleniyor...");
  await directLoadModel(modelSize, onProgress);
}

/**
 * Run depth estimation on an image.
 * Returns the depth map, width and height.
 */
export async function estimateDepthViaWorker(
  imageData: string,
  maxResolution: number = 512,
  onProgress?: (msg: string) => void,
  signal?: AbortSignal,
): Promise<DepthEstimationResult> {
  if (!workerFailed && worker && workerReady) {
    try {
      const result = await callWorker<DepthEstimationResult>(
        { type: "estimateDepth", imageData, maxResolution },
        { onProgress, signal },
      );
      return result;
    } catch (err) {
      if ((err as Error).name === "AbortError") throw err;
      console.warn(
        "[WorkerBridge] Worker depth estimation failed, falling back:",
        err,
      );
      workerFailed = true;
      worker?.terminate();
      worker = null;
    }
  }

  // Main-thread fallback
  onProgress?.("Ana thread üzerinde derinlik tahmini...");
  return directEstimateDepth(imageData, maxResolution);
}

/**
 * Generate mesh vertex data in the worker.
 * Falls back to a no-op on the main thread (MeshGenerator handles it there).
 */
export async function generateMeshViaWorker(
  depthMap: Float32Array,
  width: number,
  height: number,
  depthScale: number = 2.0,
  onProgress?: (msg: string) => void,
  signal?: AbortSignal,
): Promise<{
  positions: Float32Array;
  width: number;
  height: number;
  vertexCount: number;
} | null> {
  if (!workerFailed && worker && workerReady) {
    try {
      // Copy the buffer so we don't transfer the caller's data
      const copy = new Float32Array(depthMap);
      const result = await callWorker<{
        positions: Float32Array;
        width: number;
        height: number;
        vertexCount: number;
      }>(
        { type: "generateMesh", depthMap: copy, width, height, depthScale },
        { onProgress, signal, transfer: [copy.buffer] },
      );
      return result;
    } catch (err) {
      if ((err as Error).name === "AbortError") throw err;
      console.warn("[WorkerBridge] Worker mesh gen failed, falling back:", err);
    }
  }

  // Returning null signals the caller to use MeshGenerator on the main thread
  return null;
}

/**
 * Dispose the model and terminate the worker.
 */
export async function disposeWorker(): Promise<void> {
  if (worker && workerReady && !workerFailed) {
    try {
      await callWorker({ type: "dispose" });
    } catch {
      // Ignore
    }
    worker.terminate();
  }
  worker = null;
  workerReady = false;
  workerFailed = false;
  pendingCalls.clear();
  msgCounter = 0;

  // Also dispose main-thread model if loaded
  directDispose();
}

/**
 * Returns the current bridge status.
 */
export function getWorkerStatus(): WorkerBridgeStatus {
  const info = getDeviceInfo();

  return {
    mode: workerFailed || !worker ? "main-thread" : "worker",
    workerReady,
    modelLoaded: info.modelLoaded,
    device: info.device,
  };
}
