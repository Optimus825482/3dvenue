import { useRef, useCallback, useEffect, Suspense, useState } from "react";
import type { Dispatch } from "react";
import * as THREE from "three";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { OrbitControls, Grid, Environment, Center } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import {
  EffectComposer,
  SSAO,
  Bloom,
} from "@react-three/postprocessing";
import type {
  ProcessedMesh,
  ViewMode,
  AppAction,
  QualitySettings,
} from "../types";
import { DepthMesh } from "./DepthMesh";
import { DepthPreview } from "./DepthPreview";
import {
  exportGLTF,
  exportOBJ,
  exportSTL,
  exportScreenshot,
  exportPLY,
  exportScreenshotHD,
} from "../engine/Exporter";

interface Props {
  meshes: ProcessedMesh[];
  viewMode: ViewMode;
  showGrid: boolean;
  depthScale: number;
  selectedMeshIndex: number;
  qualitySettings: QualitySettings;
  dispatch: Dispatch<AppAction>;
  onNewProject: () => void;
}

interface ExportFns {
  gltf: () => void;
  obj: () => void;
  stl: () => void;
  screenshot: () => void;
  ply: () => void;
  screenshotHD: () => void;
}

const CAMERA_PRESETS: Record<string, { position: [number, number, number]; label: string }> = {
  front: { position: [0, 0, 8], label: "Front" },
  top: { position: [0, 10, 0.1], label: "Top" },
  side: { position: [8, 0, 0], label: "Side" },
  "3/4": { position: [5, 4, 5], label: "3/4" },
};

const MATERIAL_PRESETS: Record<string, { roughness: number; metalness: number; label: string }> = {
  default: { roughness: 0.5, metalness: 0.05, label: "Default" },
  matte: { roughness: 0.9, metalness: 0.0, label: "Matte" },
  glossy: { roughness: 0.1, metalness: 0.0, label: "Glossy" },
  metallic: { roughness: 0.3, metalness: 0.9, label: "Metallic" },
};

function CameraController({
  targetPosition,
  controlsRef,
}: {
  targetPosition: [number, number, number] | null;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
}) {
  const { camera } = useThree();
  const lerpTarget = useRef<THREE.Vector3 | null>(null);

  useEffect(() => {
    if (targetPosition) {
      lerpTarget.current = new THREE.Vector3(...targetPosition);
    }
  }, [targetPosition]);

  useFrame(() => {
    if (lerpTarget.current) {
      camera.position.lerp(lerpTarget.current, 0.05);
      if (camera.position.distanceTo(lerpTarget.current) < 0.01) {
        camera.position.copy(lerpTarget.current);
        lerpTarget.current = null;
      }
      controlsRef.current?.update();
    }
  });

  return null;
}

function SceneExporter({
  exportRef,
}: {
  exportRef: React.MutableRefObject<ExportFns | null>;
}) {
  const { scene, gl } = useThree();

  useEffect(() => {
    exportRef.current = {
      gltf: () => exportGLTF(scene),
      obj: () => exportOBJ(scene),
      stl: () => exportSTL(scene),
      screenshot: () => exportScreenshot(gl),
      ply: () => exportPLY(scene),
      screenshotHD: () => exportScreenshotHD(gl),
    };
  }, [scene, gl, exportRef]);

  return null;
}

export function Viewer3D({
  meshes,
  viewMode,
  showGrid,
  depthScale,
  selectedMeshIndex,
  qualitySettings,
  dispatch,
  onNewProject,
}: Props) {
  const exportRef = useRef<ExportFns | null>(null);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [cameraTarget, setCameraTarget] = useState<[number, number, number] | null>(null);
  const [materialPreset, setMaterialPreset] = useState<string>("default");
  const [showDepthPreview, setShowDepthPreview] = useState(false);

  const activeMaterial = MATERIAL_PRESETS[materialPreset];

  const handleExport = useCallback(
    (format: "gltf" | "obj" | "stl" | "screenshot" | "ply" | "screenshotHD") => {
      exportRef.current?.[format]?.();
      setIsExportMenuOpen(false);
    },
    [],
  );

  const spacing = 5;

  return (
    <div className="relative w-full h-[85vh] md:h-[90vh] bg-[#0a0a0f] overflow-hidden rounded-3xl border border-white/5 shadow-2xl">
      {/* ─── Top HUD ─── */}
      <div className="absolute top-2 left-2 right-2 md:top-4 md:left-4 md:right-4 z-10 flex justify-between items-start pointer-events-none">
        {/* Left: Project Info & Back */}
        <div className="flex flex-col gap-2 pointer-events-auto">
          <button
            onClick={() => {
              // Full session reset: clear all browser storage
              try { localStorage.clear(); } catch { }
              try { sessionStorage.clear(); } catch { }
              // Clear cookies
              document.cookie.split(";").forEach((c) => {
                document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
              });
              // Dispatch RESET (clears IndexedDB + cache)
              onNewProject();
              // Hard reload
              window.location.reload();
            }}
            className="flex items-center gap-1.5 md:gap-2 px-3 py-2 md:px-5 md:py-2.5 bg-gradient-to-r from-red-600/90 to-orange-500/90 backdrop-blur-md border border-red-400/30 rounded-full text-white font-semibold shadow-[0_0_16px_rgba(239,68,68,0.35)] hover:shadow-[0_0_24px_rgba(239,68,68,0.5)] hover:scale-105 active:scale-95 transition-all text-xs md:text-sm"
          >
            🔄 Yeni Oturum
          </button>

          <div className="bg-black/40 backdrop-blur-md rounded-xl md:rounded-2xl p-2 md:p-3 border border-white/5">
            <span className="text-[10px] text-gray-500 font-mono uppercase block mb-1">
              SELECTED OBJECT
            </span>
            <select
              className="bg-transparent text-xs md:text-sm font-semibold text-white outline-none w-24 md:w-32 cursor-pointer"
              value={selectedMeshIndex}
              onChange={(e) =>
                dispatch({
                  type: "SET_SELECTED_MESH",
                  index: parseInt(e.target.value),
                })
              }
            >
              <option value={-1} className="bg-surface text-white">
                🌐 Tüm Sahne
              </option>
              {meshes.map((_, i) => (
                <option key={i} value={i} className="bg-surface text-white">
                  📦 Obje {i + 1}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Right: Camera Presets & Auto-Rotate */}
        <div className="flex flex-col gap-2 pointer-events-auto items-end">
          <div className="flex gap-0.5 md:gap-1 bg-black/60 backdrop-blur-md rounded-lg md:rounded-xl p-0.5 md:p-1 border border-white/10">
            {Object.entries(CAMERA_PRESETS).map(([key, preset]) => (
              <button
                key={key}
                onClick={() => setCameraTarget(preset.position)}
                className="px-1.5 py-1 md:px-3 md:py-1.5 rounded-lg text-[10px] md:text-xs font-medium text-gray-300 hover:text-white hover:bg-white/10 transition-all"
                title={preset.label}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setAutoRotate((r) => !r)}
            className={`px-2 py-1 md:px-3 md:py-1.5 rounded-xl text-[10px] md:text-xs font-medium border transition-all
              ${autoRotate ? "bg-primary/20 text-primary border-primary/50" : "bg-black/60 text-gray-400 border-white/10 hover:text-white"}`}
          >
            {autoRotate ? "⟳ ON" : "⟳"}
          </button>
          <button
            onClick={() => setShowDepthPreview((v) => !v)}
            className={`px-2 py-1 md:px-3 md:py-1.5 rounded-xl text-[10px] md:text-xs font-medium border transition-all
              ${showDepthPreview ? "bg-secondary/20 text-secondary border-secondary/50" : "bg-black/60 text-gray-400 border-white/10 hover:text-white"}`}
          >
            {showDepthPreview ? "🗺️ ON" : "🗺️"}
          </button>
        </div>
      </div>

      {/* ─── Depth Preview Panel ─── */}
      {showDepthPreview && meshes.length > 0 && (() => {
        const idx = selectedMeshIndex === -1 ? 0 : selectedMeshIndex;
        const m = meshes[idx];
        return m ? (
          <div className="absolute top-14 right-2 md:top-20 md:right-4 z-20 w-44 md:w-72 animate-in slide-in-from-right-4 duration-300">
            <DepthPreview
              depthMap={m.depthMap}
              width={m.width}
              height={m.height}
              photoUrl={m.textureUrl}
            />
          </div>
        ) : null;
      })()}

      {/* ─── 3D Canvas ─── */}
      <div className="w-full h-full cursor-move active:cursor-grabbing">
        <Canvas
          camera={{ position: [0, 2, 8], fov: 50 }}
          shadows={{ type: THREE.PCFSoftShadowMap }}
          dpr={[1, 2]}
          gl={{
            preserveDrawingBuffer: true,
            antialias: true,
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 0.65,
            outputColorSpace: THREE.SRGBColorSpace,
          }}
        >
          <color attach="background" args={["#0a0a0f"]} />
          <fog attach="fog" args={["#0a0a0f", 30, 80]} />
          <ambientLight intensity={0.35} />
          <directionalLight
            position={[5, 8, 5]}
            intensity={0.7}
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-camera-far={50}
            shadow-camera-left={-10}
            shadow-camera-right={10}
            shadow-camera-top={10}
            shadow-camera-bottom={-10}
          />
          <directionalLight position={[-3, 4, -3]} intensity={0.25} />

          <Suspense fallback={null}>
            <Center>
              {selectedMeshIndex === -1
                ? meshes.map((m, i) => (
                    <DepthMesh
                      key={m.photoId}
                      mesh={m}
                    viewMode={viewMode}
                      position={[i * spacing, 0, 0]}
                    isPointCloud={qualitySettings.enablePointCloud}
                    roughness={activeMaterial.roughness}
                    metalness={activeMaterial.metalness}
                    depthScale={depthScale}
                    normalMap={m.normalMap ?? null}
                    />
                  ))
                : meshes[selectedMeshIndex] && (
                    <DepthMesh
                      mesh={meshes[selectedMeshIndex]}
                      viewMode={viewMode}
                    roughness={activeMaterial.roughness}
                    metalness={activeMaterial.metalness}
                      depthScale={depthScale}
                    normalMap={meshes[selectedMeshIndex].normalMap ?? null}
                    />
                  )}
            </Center>

            <Environment preset={qualitySettings.environmentPreset} />
          </Suspense>

          {/* Shadow catcher ground plane */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2, 0]} receiveShadow>
            <planeGeometry args={[50, 50]} />
            <shadowMaterial opacity={0.3} />
          </mesh>

          {showGrid && (
            <Grid
              args={[20, 20]}
              position={[0, -2, 0]}
              cellSize={0.5}
              cellThickness={0.5}
              cellColor="#1a1a2e"
              sectionSize={2}
              sectionThickness={1}
              sectionColor="#16213e"
              fadeDistance={25}
              infiniteGrid
            />
          )}

          <OrbitControls
            ref={controlsRef}
            makeDefault
            enableDamping
            dampingFactor={0.08}
            minDistance={2}
            maxDistance={30}
            autoRotate={autoRotate}
            autoRotateSpeed={2}
          />

          <CameraController targetPosition={cameraTarget} controlsRef={controlsRef} />
          <SceneExporter exportRef={exportRef} />

          <EffectComposer enableNormalPass>
            <SSAO radius={0.3} intensity={6} luminanceInfluence={0.15} />
          </EffectComposer>
        </Canvas>
      </div>

      {/* ─── Bottom Floating Dock ─── */}
      <div className="absolute bottom-2 md:bottom-6 inset-x-2 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:max-w-3xl z-20">
        <div className="glass-panel rounded-xl md:rounded-2xl p-2 md:p-4 flex flex-row flex-wrap gap-1.5 md:gap-4 items-center justify-between">
          {/* View Modes */}
          <div className="flex bg-black/40 rounded-lg md:rounded-xl p-0.5 md:p-1 border border-white/5">
            {(["textured", "solid", "wireframe"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => dispatch({ type: "SET_VIEW_MODE", mode })}
                className={`flex-1 md:flex-none px-2.5 py-1.5 md:px-4 md:py-2 rounded-lg text-[10px] md:text-xs font-medium transition-all duration-200
                    ${
                      viewMode === mode
                        ? "bg-primary text-black shadow-[0_0_10px_rgba(0,212,255,0.4)]"
                        : "text-gray-400 hover:text-white hover:bg-white/5"
                    }
                  `}
              >
                {mode === "textured" ? "T" : mode === "solid" ? "S" : "W"}
                <span className="hidden md:inline ml-1 capitalize">{mode}</span>
              </button>
            ))}
          </div>

          {/* Depth Slider */}
          <div className="flex items-center gap-1.5 md:gap-3 flex-1 min-w-[100px] md:flex-none md:w-auto">
            <span className="text-[10px] text-gray-500 font-mono uppercase">
              Depth
            </span>
            <div className="relative flex-1 md:w-32 h-6 flex items-center">
              <input
                type="range"
                min="0.5"
                max="8"
                step="0.1"
                value={depthScale}
                onChange={(e) =>
                  dispatch({
                    type: "SET_DEPTH_SCALE",
                    scale: parseFloat(e.target.value),
                  })
                }
                className="w-full h-1 bg-white/20 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(0,212,255,0.8)]"
              />
            </div>
            <span className="text-xs font-mono text-primary min-w-[3ch]">
              {depthScale.toFixed(1)}
            </span>
          </div>

          {/* Material Presets — desktop only */}
          <div className="hidden md:flex bg-black/40 rounded-xl p-1 border border-white/5">
            {Object.entries(MATERIAL_PRESETS).map(([key, preset]) => (
              <button
                key={key}
                onClick={() => setMaterialPreset(key)}
                className={`flex-1 md:flex-none px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200
                  ${materialPreset === key
                    ? "bg-secondary/30 text-secondary border border-secondary/40"
                    : "text-gray-400 hover:text-white hover:bg-white/5"}`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Controls Group */}
          <div className="flex gap-1.5 md:gap-2 ml-auto">
            {/* Grid Toggle */}
            <button
              onClick={() => dispatch({ type: "TOGGLE_GRID" })}
              className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-all
                   ${showGrid ? "border-secondary bg-secondary/20 text-secondary" : "border-white/10 text-gray-500 hover:border-white/30"}
                 `}
              title="Toggle Grid"
            >
              ⊞
            </button>

            {/* Export Button (Mobile Optimized) */}
            <div className="relative">
              <button
                onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-all shadow-[0_0_15px_rgba(0,212,255,0.2)]
                     ${
                       isExportMenuOpen
                         ? "bg-primary text-black border-primary rotate-45"
                         : "bg-primary/20 text-primary border-primary/50 hover:bg-primary/30"
                     }
                   `}
                title="Export"
              >
                <span className="text-xl">⤓</span>
              </button>

              {isExportMenuOpen && (
                <div className="absolute bottom-14 right-0 w-48 glass-panel rounded-xl p-2 flex flex-col gap-1 animate-in zoom-in-95 origin-bottom-right">
                  <span className="text-[10px] text-gray-500 font-mono uppercase px-2 py-1">
                    Export Format
                  </span>
                  <button
                    onClick={() => handleExport("gltf")}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/10 text-left text-sm text-gray-200 transition-colors"
                  >
                    <span>📦</span> GLTF{" "}
                    <span className="text-[10px] ml-auto text-gray-600">
                      Web
                    </span>
                  </button>
                  <button
                    onClick={() => handleExport("obj")}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/10 text-left text-sm text-gray-200 transition-colors"
                  >
                    <span>📄</span> OBJ{" "}
                    <span className="text-[10px] ml-auto text-gray-600">
                      Std
                    </span>
                  </button>
                  <button
                    onClick={() => handleExport("stl")}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/10 text-left text-sm text-gray-200 transition-colors"
                  >
                    <span>🔩</span> STL{" "}
                    <span className="text-[10px] ml-auto text-gray-600">
                      Print
                    </span>
                  </button>
                  <div className="h-px bg-white/10 my-1" />
                  <button
                    onClick={() => handleExport("ply")}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/10 text-left text-sm text-gray-200 transition-colors"
                  >
                    <span>☁️</span> PLY{" "}
                    <span className="text-[10px] ml-auto text-gray-600">
                      PtCloud
                    </span>
                  </button>
                  <div className="h-px bg-white/10 my-1" />
                  <button
                    onClick={() => handleExport("screenshot")}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-primary/20 text-left text-sm text-primary transition-colors"
                  >
                    <span>📷</span> Shot
                  </button>
                  <button
                    onClick={() => handleExport("screenshotHD")}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-primary/20 text-left text-sm text-primary transition-colors"
                  >
                    <span>📷</span> Shot HD{" "}
                    <span className="text-[10px] ml-auto text-gray-600">
                      2x
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
