import type { BufferGeometry } from "three";

export interface CameraIntrinsics {
  focalLength: number;
  fov: number;
  sensorWidth: number;
  aspectRatio: number;
}

export interface PhotoFile {
  id: string;
  file: File;
  name: string;
  size: number;
  url: string;
  thumbnail: string;
  width: number;
  height: number;
  cameraIntrinsics?: CameraIntrinsics;
}

/** Depth estimation result including optional per-pixel confidence map */
export interface DepthResult {
  photoId: string;
  depthMap: Float32Array;
  width: number;
  height: number;
  confidence?: Float32Array;
}

export interface ProcessedMesh {
  photoId: string;
  geometry: BufferGeometry;
  textureUrl: string;
  depthMap: Float32Array;
  width: number;
  height: number;
  normalMap?: any;
}

export type ModelSize = "small" | "base" | "large";

export interface QualityEnhancement {
  id: string;
  label: string;
  description: string;
  impact: 1 | 2 | 3 | 4 | 5;
  difficulty: "easy" | "medium";
  icon: string;
  enabled: boolean;
  timeEstimate: string;
}

export interface QualitySettings {
  modelSize: ModelSize;
  maxResolution: number;
  enableSmoothing: boolean;
  smoothingIterations: number;
  enableMultiView: boolean;
  enablePointCloud: boolean;
  enableEnhancedNormals: boolean;
  enablePerspective: boolean;
  enableStretchRemoval: boolean;
  stretchThreshold: number;
  pointSize: number;
  roughness: number;
  metalness: number;
  environmentPreset: "city" | "studio" | "sunset" | "dawn" | "night";
}

export const DEFAULT_QUALITY: QualitySettings = {
  modelSize: "large",
  maxResolution: 1536,
  enableSmoothing: true,
  smoothingIterations: 6,
  enableMultiView: true,
  enablePointCloud: false,
  enableEnhancedNormals: true,
  enablePerspective: true,
  enableStretchRemoval: true,
  stretchThreshold: 0.12,
  pointSize: 0.05,
  roughness: 0.7,
  metalness: 0.1,
  environmentPreset: "studio",
};

export const QUALITY_ENHANCEMENTS: QualityEnhancement[] = [];

export type ViewMode = "textured" | "solid" | "wireframe";
export type AppStep = "upload" | "processing" | "viewer";

export interface ProcessingProgress {
  current: number;
  total: number;
  percentage: number;
  currentPhotoName: string;
  phase:
    | "loading-model"
    | "estimating"
    | "generating-mesh"
    | "smoothing"
    | "aligning"
    | "merging"
    | "complete";
  estimatedTimeRemaining?: number;
}

export interface AppState {
  step: AppStep;
  photos: PhotoFile[];
  meshes: ProcessedMesh[];
  progress: ProcessingProgress | null;
  error: string | null;
  qualitySettings: QualitySettings;
  viewMode: ViewMode;
  showGrid: boolean;
  depthScale: number;
  selectedMeshIndex: number;
}

export type AppAction =
  | { type: "ADD_PHOTOS"; photos: PhotoFile[] }
  | { type: "REMOVE_PHOTO"; id: string }
  | { type: "CLEAR_PHOTOS" }
  | { type: "SET_STEP"; step: AppStep }
  | { type: "SET_PROGRESS"; progress: ProcessingProgress | null }
  | { type: "SET_ERROR"; error: string | null }
  | { type: "ADD_MESH"; mesh: ProcessedMesh }
  | { type: "SET_MESHES"; meshes: ProcessedMesh[] }
  | { type: "SET_QUALITY"; settings: Partial<QualitySettings> }
  | { type: "SET_VIEW_MODE"; mode: ViewMode }
  | { type: "TOGGLE_GRID" }
  | { type: "SET_DEPTH_SCALE"; scale: number }
  | { type: "SET_SELECTED_MESH"; index: number }
  | { type: "RESET" }
  | { type: "RESTORE_STATE"; state: AppState };
