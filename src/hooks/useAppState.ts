import { useCallback, useReducer, useRef, useEffect } from "react";
import type {
  PhotoFile,
  ProcessedMesh,
  AppState,
  AppAction,
  QualitySettings,
  ModelSize,
} from "../types";
import { DEFAULT_QUALITY } from "../types";
import {
  loadModel,
  estimateDepth,
  disposeModel,
} from "../engine/DepthEstimator";
import {
  generateDepthMesh,
  smoothMesh,
  generateNormalMapFromDepth,
  createNormalTexture,
} from "../engine/MeshGenerator";
import { alignMeshes, mergePointClouds } from "../engine/MultiViewAligner";
import { PersistenceService } from "../engine/Persistence";
import { extractCameraIntrinsics } from "../engine/ExifParser";

const initialState: AppState = {
  step: "upload",
  photos: [],
  meshes: [],
  progress: null,
  error: null,
  qualitySettings: { ...DEFAULT_QUALITY },
  viewMode: "textured",
  showGrid: true,
  depthScale: 1.5,
  selectedMeshIndex: 0,
};

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "ADD_PHOTOS":
      return {
        ...state,
        photos: [...state.photos, ...action.photos],
        error: null,
      };
    case "REMOVE_PHOTO":
      return {
        ...state,
        photos: state.photos.filter((p) => p.id !== action.id),
        error: null,
      };
    case "CLEAR_PHOTOS":
      state.photos.forEach((p) => URL.revokeObjectURL(p.url));
      return { ...state, photos: [], meshes: [], error: null };
    case "SET_STEP":
      return { ...state, step: action.step, error: null };
    case "SET_PROGRESS":
      return { ...state, progress: action.progress };
    case "SET_ERROR":
      return { ...state, error: action.error };
    case "ADD_MESH":
      return { ...state, meshes: [...state.meshes, action.mesh] };
    case "SET_MESHES":
      return { ...state, meshes: action.meshes };
    case "SET_QUALITY":
      return {
        ...state,
        qualitySettings: { ...state.qualitySettings, ...action.settings },
      };
    case "SET_VIEW_MODE":
      return { ...state, viewMode: action.mode };
    case "TOGGLE_GRID":
      return { ...state, showGrid: !state.showGrid };
    case "SET_DEPTH_SCALE":
      return { ...state, depthScale: action.scale };
    case "SET_SELECTED_MESH":
      return { ...state, selectedMeshIndex: action.index };
    case "RESET":
      state.photos.forEach((p) => URL.revokeObjectURL(p.url));
      disposeModel();
      PersistenceService.clearState(); // Clear IDB
      PersistenceService.clearAppCache(); // Clear PWA cache
      return { ...initialState };
    case "RESTORE_STATE":
      return action.state;
    default:
      return state;
  }
}

export function useAppState() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const cancelRef = useRef(false);

  // Load persisted state on mount
  useEffect(() => {
    PersistenceService.loadState().then((persistedState) => {
      if (persistedState) {
        dispatch({ type: "RESTORE_STATE", state: persistedState });
      }
    });
  }, []);

  // Save state on change (Debounced 1s)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (state.photos.length > 0) {
        PersistenceService.saveState(state);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [state]);

  const addPhotos = useCallback(
    async (files: FileList | File[]) => {
      try {
        const fileArray = Array.from(files);
        const remaining = 50 - state.photos.length;
        const toAdd = fileArray.slice(0, remaining);

        const newPhotos: PhotoFile[] = await Promise.all(
          toAdd.map(async (file) => {
            const url = URL.createObjectURL(file);
            const [{ width, height }, cameraIntrinsics] = await Promise.all([
              getImageDimensions(url),
              extractCameraIntrinsics(file),
            ]);
            return {
              id:
                Math.random().toString(36).substring(2, 15) +
                Math.random().toString(36).substring(2, 15),
              file,
              name: file.name,
              size: file.size,
              url,
              thumbnail: url,
              width,
              height,
              ...(cameraIntrinsics ? { cameraIntrinsics } : {}),
            };
          }),
        );

        dispatch({ type: "ADD_PHOTOS", photos: newPhotos });
      } catch (e) {
        dispatch({
          type: "SET_ERROR",
          error: "Fotoğraflar eklenirken bir hata oluştu.",
        });
      }
    },
    [state.photos.length],
  );

  const startProcessing = useCallback(
    async (modelSize: ModelSize = "large") => {
      if (state.photos.length < 1) return;

      // Always use max quality with selected model size
      const qs: QualitySettings = { ...state.qualitySettings, modelSize };
      dispatch({ type: "SET_QUALITY", settings: { modelSize } });
      cancelRef.current = false;
      dispatch({ type: "SET_STEP", step: "processing" });
      dispatch({
        type: "SET_PROGRESS",
        progress: {
          current: 0,
          total: state.photos.length,
          percentage: 0,
          currentPhotoName: "",
          phase: "loading-model",
        },
      });

      try {
        // Phase 1: Load model
        await loadModel(qs.modelSize, (msg) => {
          dispatch({
            type: "SET_PROGRESS",
            progress: {
              current: 0,
              total: state.photos.length,
              percentage: 0,
              currentPhotoName: msg,
              phase: "loading-model",
            },
          });
        });

        const meshes: ProcessedMesh[] = [];

        // Phase 2: Estimate depth + generate mesh for each photo
        for (let i = 0; i < state.photos.length; i++) {
          if (cancelRef.current) {
            dispatch({ type: "SET_STEP", step: "upload" });
            dispatch({ type: "SET_PROGRESS", progress: null });
            return;
          }

          const photo = state.photos[i];
          dispatch({
            type: "SET_PROGRESS",
            progress: {
              current: i,
              total: state.photos.length,
              percentage: Math.round((i / state.photos.length) * 70),
              currentPhotoName: photo.name,
              phase: "estimating",
            },
          });

          const { depthMap, width, height } = await estimateDepth(
            photo.url,
            qs.maxResolution,
          );

          dispatch({
            type: "SET_PROGRESS",
            progress: {
              current: i,
              total: state.photos.length,
              percentage: Math.round(((i + 0.5) / state.photos.length) * 70),
              currentPhotoName: photo.name,
              phase: "generating-mesh",
            },
          });

          let geometry = generateDepthMesh({
            depthMap,
            width,
            height,
            depthScale: state.depthScale,
            enhancedNormals: qs.enableEnhancedNormals,
            perspective: qs.enablePerspective,
            stretchRemoval: qs.enableStretchRemoval,
            stretchThreshold: qs.stretchThreshold,
            fov: photo.cameraIntrinsics?.fov,
            cameraIntrinsics: photo.cameraIntrinsics,
          });

          // Phase 3: Smoothing (if enabled)
          if (qs.enableSmoothing) {
            dispatch({
              type: "SET_PROGRESS",
              progress: {
                current: i,
                total: state.photos.length,
                percentage: Math.round(((i + 0.7) / state.photos.length) * 70),
                currentPhotoName: photo.name,
                phase: "smoothing",
              },
            });
            geometry = smoothMesh(geometry, qs.smoothingIterations);
          }

          // Generate normal map from depth data
          const normalData = generateNormalMapFromDepth(
            depthMap,
            width,
            height,
            1.5,
          );
          const normalTexture = createNormalTexture(normalData, width, height);

          meshes.push({
            photoId: photo.id,
            geometry,
            textureUrl: photo.url,
            depthMap,
            width,
            height,
            normalMap: normalTexture,
          });
        }

        // Phase 4: Multi-view alignment (if enabled)
        let finalMeshes = meshes;
        if (qs.enableMultiView && meshes.length > 1) {
          dispatch({
            type: "SET_PROGRESS",
            progress: {
              current: state.photos.length,
              total: state.photos.length,
              percentage: 80,
              currentPhotoName: "Mesh'ler hizalanıyor...",
              phase: "aligning",
            },
          });
          finalMeshes = alignMeshes(meshes);
        }

        // Phase 5: Point cloud merge (if enabled)
        if (qs.enablePointCloud && finalMeshes.length > 1) {
          dispatch({
            type: "SET_PROGRESS",
            progress: {
              current: state.photos.length,
              total: state.photos.length,
              percentage: 90,
              currentPhotoName: "Point cloud birleştiriliyor...",
              phase: "merging",
            },
          });
          finalMeshes = mergePointClouds(finalMeshes);
        }

        dispatch({ type: "SET_MESHES", meshes: finalMeshes });
        dispatch({
          type: "SET_PROGRESS",
          progress: {
            current: state.photos.length,
            total: state.photos.length,
            percentage: 100,
            currentPhotoName: "Tamamlandı!",
            phase: "complete",
          },
        });

        setTimeout(() => {
          dispatch({ type: "SET_STEP", step: "viewer" });
          dispatch({ type: "SET_PROGRESS", progress: null });
        }, 800);
      } catch (error: any) {
        console.error("Processing error:", error);
        let errorMessage = "İşlem sırasında beklenmeyen bir hata oluştu.";

        if (error instanceof Error) {
          if (
            error.message.includes("memory") ||
            error.message.includes("allocation")
          ) {
            errorMessage =
              "Cihaz hafızası doldu. Daha az fotoğraf veya 'Low Res' deneyin.";
          } else if (
            error.message.includes("fetch") ||
            error.message.includes("network")
          ) {
            errorMessage =
              "Model indirilemedi. İnternet bağlantınızı kontrol edin.";
          } else if (
            error.message.includes("context") ||
            error.message.includes("webgl")
          ) {
            errorMessage =
              "WebGL bağlamı oluşturulamadı. Tarayıcınızı güncelleyin.";
          } else {
            errorMessage = `Hata detayı: ${error.message}`;
          }
        }

        dispatch({ type: "SET_ERROR", error: errorMessage });
        dispatch({ type: "SET_STEP", step: "upload" });
        dispatch({ type: "SET_PROGRESS", progress: null });
      }
    },
    [state.photos, state.depthScale, state.qualitySettings],
  );

  const cancelProcessing = useCallback(() => {
    cancelRef.current = true;
  }, []);

  return {
    state,
    dispatch,
    addPhotos,
    startProcessing,
    cancelProcessing,
  };
}

function getImageDimensions(
  url: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = () => resolve({ width: 800, height: 600 });
    img.src = url;
  });
}
