import { useCallback, useReducer, useRef } from "react";
import type {
  PhotoFile,
  ProcessedMesh,
  AppState,
  AppAction,
  QualitySettings,
} from "../types";
import { DEFAULT_QUALITY } from "../types";
import {
  loadModel,
  estimateDepth,
  disposeModel,
} from "../engine/DepthEstimator";
import { generateDepthMesh, smoothMesh } from "../engine/MeshGenerator";
import { alignMeshes, mergePointClouds } from "../engine/MultiViewAligner";

const initialState: AppState = {
  step: "upload",
  photos: [],
  meshes: [],
  progress: null,
  qualitySettings: { ...DEFAULT_QUALITY },
  viewMode: "textured",
  showGrid: true,
  depthScale: 2.0,
  selectedMeshIndex: 0,
};

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "ADD_PHOTOS":
      return { ...state, photos: [...state.photos, ...action.photos] };
    case "REMOVE_PHOTO":
      return {
        ...state,
        photos: state.photos.filter((p) => p.id !== action.id),
      };
    case "CLEAR_PHOTOS":
      state.photos.forEach((p) => URL.revokeObjectURL(p.url));
      return { ...state, photos: [], meshes: [] };
    case "SET_STEP":
      return { ...state, step: action.step };
    case "SET_PROGRESS":
      return { ...state, progress: action.progress };
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
      return { ...initialState };
    default:
      return state;
  }
}

export function useAppState() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const cancelRef = useRef(false);

  const addPhotos = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      const remaining = 50 - state.photos.length;
      const toAdd = fileArray.slice(0, remaining);

      const newPhotos: PhotoFile[] = await Promise.all(
        toAdd.map(async (file) => {
          const url = URL.createObjectURL(file);
          const { width, height } = await getImageDimensions(url);
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
          };
        }),
      );

      dispatch({ type: "ADD_PHOTOS", photos: newPhotos });
    },
    [state.photos.length],
  );

  const goToSettings = useCallback(() => {
    if (state.photos.length >= 1) {
      dispatch({ type: "SET_STEP", step: "settings" });
    }
  }, [state.photos.length]);

  const processPhotos = useCallback(async () => {
    if (state.photos.length < 1) return;

    const qs: QualitySettings = state.qualitySettings;
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
          dispatch({ type: "SET_STEP", step: "settings" });
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

        meshes.push({
          photoId: photo.id,
          geometry,
          textureUrl: photo.url,
          depthMap,
          width,
          height,
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
    } catch (error) {
      console.error("Processing error:", error);
      dispatch({ type: "SET_STEP", step: "settings" });
      dispatch({ type: "SET_PROGRESS", progress: null });
    }
  }, [state.photos, state.depthScale, state.qualitySettings]);

  const cancelProcessing = useCallback(() => {
    cancelRef.current = true;
  }, []);

  return {
    state,
    dispatch,
    addPhotos,
    goToSettings,
    processPhotos,
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
