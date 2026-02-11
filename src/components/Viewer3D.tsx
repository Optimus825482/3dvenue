import { useRef, useCallback, useEffect, Suspense } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Grid, Environment, Center } from "@react-three/drei";
import type { ProcessedMesh, ViewMode, AppAction } from "../types";
import { DepthMesh } from "./DepthMesh";
import {
  exportGLTF,
  exportOBJ,
  exportSTL,
  exportScreenshot,
} from "../engine/Exporter";

interface Props {
  meshes: ProcessedMesh[];
  viewMode: ViewMode;
  showGrid: boolean;
  depthScale: number;
  selectedMeshIndex: number;
  dispatch: React.Dispatch<AppAction>;
  onNewProject: () => void;
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
    };
  }, [scene, gl, exportRef]);

  return null;
}

interface ExportFns {
  gltf: () => void;
  obj: () => void;
  stl: () => void;
  screenshot: () => void;
}

import { useRef, useCallback, useEffect, Suspense, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Grid, Environment, Center } from "@react-three/drei";
import type { ProcessedMesh, ViewMode, AppAction } from "../types";
import { DepthMesh } from "./DepthMesh";
import {
  exportGLTF,
  exportOBJ,
  exportSTL,
  exportScreenshot,
} from "../engine/Exporter";

interface Props {
  meshes: ProcessedMesh[];
  viewMode: ViewMode;
  showGrid: boolean;
  depthScale: number;
  selectedMeshIndex: number;
  dispatch: React.Dispatch<AppAction>;
  onNewProject: () => void;
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
    };
  }, [scene, gl, exportRef]);

  return null;
}

interface ExportFns {
  gltf: () => void;
  obj: () => void;
  stl: () => void;
  screenshot: () => void;
}

export function Viewer3D({
  meshes,
  viewMode,
  showGrid,
  depthScale,
  selectedMeshIndex,
  dispatch,
  onNewProject,
}: Props) {
  const exportRef = useRef<ExportFns | null>(null);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);

  const handleExport = useCallback(
    (format: "gltf" | "obj" | "stl" | "screenshot") => {
      exportRef.current?.[format]?.();
      setIsExportMenuOpen(false);
    },
    [],
  );

  const spacing = 5;

  return (
    <div className="relative w-full h-[85vh] md:h-[90vh] bg-[#0a0a0f] overflow-hidden rounded-3xl border border-white/5 shadow-2xl">
      {/* ─── Top HUD ─── */}
      <div className="absolute top-4 left-4 right-4 z-10 flex justify-between items-start pointer-events-none">
        {/* Left: Project Info & Back */}
        <div className="flex flex-col gap-2 pointer-events-auto">
          <button
            onClick={onNewProject}
            className="flex items-center gap-2 px-4 py-2 bg-black/60 backdrop-blur-md border border-white/10 rounded-full text-white/80 hover:bg-black/80 hover:text-white transition-all text-sm font-medium"
          >
            ← Proje
          </button>

          <div className="bg-black/40 backdrop-blur-md rounded-2xl p-3 border border-white/5">
            <span className="text-[10px] text-gray-500 font-mono uppercase block mb-1">
              SELECTED OBJECT
            </span>
            <select
              className="bg-transparent text-sm font-semibold text-white outline-none w-32 cursor-pointer"
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

        {/* Right: Export Menu */}
        <div className="relative pointer-events-auto">
          <button
            onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
            className={`flex items-center justify-center w-10 h-10 rounded-full bg-primary/20 backdrop-blur-md border border-primary/50 text-primary transition-all shadow-[0_0_15px_rgba(0,212,255,0.3)] hover:scale-110 ${isExportMenuOpen ? "rotate-45 bg-primary text-black" : ""}`}
          >
            <span className="text-xl">⤓</span>
          </button>

          {isExportMenuOpen && (
            <div className="absolute top-12 right-0 w-48 glass-panel rounded-xl p-2 flex flex-col gap-1 animate-in zoom-in-95 origin-top-right">
              <span className="text-[10px] text-gray-500 font-mono uppercase px-2 py-1">
                Export Format
              </span>
              <button
                onClick={() => handleExport("gltf")}
                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/10 text-left text-sm text-gray-200 transition-colors"
              >
                <span>📦</span> GLTF{" "}
                <span className="text-[10px] ml-auto text-gray-600">
                  Web & AR
                </span>
              </button>
              <button
                onClick={() => handleExport("obj")}
                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/10 text-left text-sm text-gray-200 transition-colors"
              >
                <span>📄</span> OBJ{" "}
                <span className="text-[10px] ml-auto text-gray-600">
                  Standard
                </span>
              </button>
              <button
                onClick={() => handleExport("stl")}
                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/10 text-left text-sm text-gray-200 transition-colors"
              >
                <span>🔩</span> STL{" "}
                <span className="text-[10px] ml-auto text-gray-600">
                  3D Print
                </span>
              </button>
              <div className="h-px bg-white/10 my-1" />
              <button
                onClick={() => handleExport("screenshot")}
                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-primary/20 text-left text-sm text-primary transition-colors"
              >
                <span>📷</span> Screenshot
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ─── 3D Canvas ─── */}
      <div className="w-full h-full cursor-move active:cursor-grabbing">
        <Canvas
          camera={{ position: [0, 2, 8], fov: 50 }}
          shadows
          gl={{ preserveDrawingBuffer: true, antialias: true }}
        >
          <color attach="background" args={["#0a0a0f"]} />
          <ambientLight intensity={0.4} />
          <directionalLight position={[5, 8, 5]} intensity={1} castShadow />
          <pointLight position={[-5, 3, -5]} intensity={0.5} color="#4488ff" />

          <Suspense fallback={null}>
            <Center>
              {selectedMeshIndex === -1
                ? meshes.map((m, i) => (
                    <DepthMesh
                      key={m.photoId}
                      mesh={m}
                      viewMode={viewMode}
                      depthScale={depthScale}
                      position={[i * spacing, 0, 0]}
                    />
                  ))
                : meshes[selectedMeshIndex] && (
                    <DepthMesh
                      mesh={meshes[selectedMeshIndex]}
                      viewMode={viewMode}
                      depthScale={depthScale}
                    />
                  )}
            </Center>

            <Environment preset="city" />
          </Suspense>

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
            makeDefault
            enableDamping
            dampingFactor={0.08}
            minDistance={2}
            maxDistance={30}
          />

          <SceneExporter exportRef={exportRef} />
        </Canvas>
      </div>

      {/* ─── Bottom Floating Dock ─── */}
      <div className="absolute bottom-6 inset-x-4 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:max-w-2xl z-20">
        <div className="glass-panel rounded-2xl p-4 flex flex-col md:flex-row gap-4 items-center justify-between">
          {/* View Modes */}
          <div className="flex bg-black/40 rounded-xl p-1 border border-white/5 w-full md:w-auto">
            {(["textured", "solid", "wireframe"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => dispatch({ type: "SET_VIEW_MODE", mode })}
                className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-xs font-medium transition-all duration-200
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
          <div className="flex items-center gap-3 w-full md:w-auto">
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

          {/* Toggles */}
          <div className="flex gap-2">
            <button
              onClick={() => dispatch({ type: "TOGGLE_GRID" })}
              className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-all
                   ${showGrid ? "border-secondary bg-secondary/20 text-secondary" : "border-white/10 text-gray-500 hover:border-white/30"}
                 `}
              title="Toggle Grid"
            >
              ⊞
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
