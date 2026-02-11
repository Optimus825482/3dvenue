import type { BufferGeometry } from "three";

export interface PhotoFile {
  id: string;
  file: File;
  name: string;
  size: number;
  url: string;
  thumbnail: string;
  width: number;
  height: number;
}

export interface DepthResult {
  photoId: string;
  depthMap: Float32Array;
  width: number;
  height: number;
}

export interface ProcessedMesh {
  photoId: string;
  geometry: BufferGeometry;
  textureUrl: string;
  depthMap: Float32Array;
  width: number;
  height: number;
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
}

export const DEFAULT_QUALITY: QualitySettings = {
  modelSize: "small",
  maxResolution: 512,
  enableSmoothing: false,
  smoothingIterations: 3,
  enableMultiView: false,
  enablePointCloud: false,
  enableEnhancedNormals: false,
};

export const QUALITY_ENHANCEMENTS: QualityEnhancement[] = [
  {
    id: "modelSize",
    label: "Gelişmiş AI Model",
    description:
      "Depth-Anything-V2 large model ile maksimum detaylı derinlik haritası (~400MB)",
    impact: 5,
    difficulty: "medium",
    icon: "🧠",
    enabled: false,
    timeEstimate: "+60s indirme",
  },
  {
    id: "maxResolution",
    label: "Yüksek Çözünürlük",
    description: "İşleme boyutunu 512px → 1024px'e çıkarır, keskin detaylar",
    impact: 3,
    difficulty: "easy",
    icon: "🔍",
    enabled: false,
    timeEstimate: "+%50 süre",
  },
  {
    id: "enableSmoothing",
    label: "Mesh Smoothing",
    description: "Laplacian smoothing ile yüzey gürültüsünü azaltır",
    impact: 2,
    difficulty: "easy",
    icon: "✨",
    enabled: false,
    timeEstimate: "+2s/fotoğraf",
  },
  {
    id: "enableMultiView",
    label: "Multi-View Hizalama",
    description:
      "Fotoğraflar arası feature matching ile mesh'leri otomatik hizalar",
    impact: 4,
    difficulty: "medium",
    icon: "📐",
    enabled: false,
    timeEstimate: "+5s/çift",
  },
  {
    id: "enablePointCloud",
    label: "Point Cloud Birleştirme",
    description: "Ayrı mesh'ler yerine tek birleşik 3D nokta bulutu oluşturur",
    impact: 4,
    difficulty: "medium",
    icon: "☁️",
    enabled: false,
    timeEstimate: "+3s toplam",
  },
  {
    id: "enableEnhancedNormals",
    label: "Gelişmiş Normal Haritası",
    description: "Ağırlıklı normal hesaplama ile daha gerçekçi aydınlatma",
    impact: 2,
    difficulty: "medium",
    icon: "💡",
    enabled: false,
    timeEstimate: "+1s/fotoğraf",
  },
];

export type ViewMode = "textured" | "solid" | "wireframe";
export type AppStep = "upload" | "settings" | "processing" | "viewer";

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
  | { type: "RESET" };
