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

  const handleExport = useCallback(
    (format: "gltf" | "obj" | "stl" | "screenshot") => {
      exportRef.current?.[format]?.();
    },
    [],
  );

  const spacing = 5;

  return (
    <div className="viewer-section">
      <div className="viewer-toolbar">
        <div className="toolbar-group">
          <span className="toolbar-label">Görünüm:</span>
          <div className="btn-group">
            {(["textured", "solid", "wireframe"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                className={`btn btn-sm ${viewMode === mode ? "btn-active" : ""}`}
                onClick={() => dispatch({ type: "SET_VIEW_MODE", mode })}
              >
                {mode === "textured"
                  ? "🖼️ Dokulu"
                  : mode === "solid"
                    ? "🎨 Solid"
                    : "📐 Wireframe"}
              </button>
            ))}
          </div>
        </div>

        <div className="toolbar-group">
          <span className="toolbar-label">Derinlik:</span>
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
            className="depth-slider"
          />
          <span className="depth-value">{depthScale.toFixed(1)}x</span>
        </div>

        <div className="toolbar-group">
          <button
            className={`btn btn-sm btn-icon-only ${showGrid ? "btn-active" : ""}`}
            onClick={() => dispatch({ type: "TOGGLE_GRID" })}
            title="Grid"
          >
            ⊞
          </button>
        </div>
      </div>

      {meshes.length > 1 && (
        <div className="mesh-tabs">
          {meshes.map((_, i) => (
            <button
              key={i}
              className={`mesh-tab ${selectedMeshIndex === i ? "mesh-tab--active" : ""}`}
              onClick={() => dispatch({ type: "SET_SELECTED_MESH", index: i })}
            >
              Foto {i + 1}
            </button>
          ))}
          <button
            className={`mesh-tab ${selectedMeshIndex === -1 ? "mesh-tab--active" : ""}`}
            onClick={() => dispatch({ type: "SET_SELECTED_MESH", index: -1 })}
          >
            🌐 Tümü
          </button>
        </div>
      )}

      <div className="canvas-container">
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

      <div className="viewer-actions">
        <div className="export-group">
          <span className="toolbar-label">Dışa Aktar:</span>
          <button
            className="btn btn-export"
            onClick={() => handleExport("gltf")}
          >
            <span>📦</span> GLTF
          </button>
          <button
            className="btn btn-export"
            onClick={() => handleExport("obj")}
          >
            <span>📄</span> OBJ
          </button>
          <button
            className="btn btn-export"
            onClick={() => handleExport("stl")}
          >
            <span>🔩</span> STL
          </button>
          <button
            className="btn btn-export btn-screenshot"
            onClick={() => handleExport("screenshot")}
          >
            <span>📷</span> Ekran Görüntüsü
          </button>
        </div>
        <button className="btn btn-ghost" onClick={onNewProject}>
          ← Yeni Proje
        </button>
      </div>
    </div>
  );
}
