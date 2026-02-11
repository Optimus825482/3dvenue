import { lazy, Suspense } from "react";
import { Header } from "./components/Header";
import { PhotoUploader } from "./components/PhotoUploader";
import { QualitySettings } from "./components/QualitySettings";
import { ProcessingView } from "./components/ProcessingView";
import { ErrorDisplay } from "./components/ErrorDisplay";
import { useAppState } from "./hooks/useAppState";
import "./styles/index.css";

const Viewer3D = lazy(() =>
  import("./components/Viewer3D").then((m) => ({ default: m.Viewer3D })),
);

function ViewerSkeleton() {
  return (
    <div className="loading-skeleton">
      <div className="loading-skeleton-icon">🧊</div>
      <div className="loading-skeleton-text">3D Viewer yükleniyor...</div>
    </div>
  );
}

export default function App() {
  const {
    state,
    dispatch,
    addPhotos,
    goToSettings,
    processPhotos,
    cancelProcessing,
  } = useAppState();

  return (
    <div className="relative min-h-screen flex flex-col bg-base text-gray-200">
      {state.error && (
        <ErrorDisplay
          error={state.error}
          onClear={() => dispatch({ type: "SET_ERROR", error: null })}
        />
      )}
      <Header currentStep={state.step} />

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 py-6 md:px-8 md:py-10">
        {state.step === "upload" && (
          <PhotoUploader
            photos={state.photos}
            onAddPhotos={addPhotos}
            onRemovePhoto={(id) => dispatch({ type: "REMOVE_PHOTO", id })}
            onProcess={goToSettings}
          />
        )}

        {state.step === "settings" && (
          <QualitySettings
            settings={state.qualitySettings}
            photoCount={state.photos.length}
            dispatch={dispatch}
            onProcess={processPhotos}
            onBack={() => dispatch({ type: "SET_STEP", step: "upload" })}
          />
        )}

        {state.step === "processing" && state.progress && (
          <ProcessingView
            progress={state.progress}
            onCancel={cancelProcessing}
          />
        )}

        {state.step === "viewer" && (
          <ErrorBoundary>
            <Suspense fallback={<ViewerSkeleton />}>
              <Viewer3D
                meshes={state.meshes}
                viewMode={state.viewMode}
                showGrid={state.showGrid}
                depthScale={state.depthScale}
                selectedMeshIndex={state.selectedMeshIndex}
                dispatch={dispatch}
                onNewProject={() => dispatch({ type: "RESET" })}
              />
            </Suspense>
          </ErrorBoundary>
        )}
      </main>

      <footer className="py-6 text-center text-sm text-gray-500 border-t border-white/5">
        <span>
          3D Venue Builder • Tamamen tarayıcıda çalışır • Sunucu gerektirmez
        </span>
      </footer>
    </div>
  );
}
