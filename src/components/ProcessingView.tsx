import type { ProcessingProgress } from "../types";

interface Props {
  progress: ProcessingProgress;
  onCancel: () => void;
}

const phaseLabels: Record<ProcessingProgress["phase"], string> = {
  "loading-model": "AI Model Yükleniyor",
  estimating: "Derinlik Analizi",
  "generating-mesh": "3D Mesh Oluşturuluyor",
  smoothing: "Mesh Smoothing",
  aligning: "Multi-View Hizalama",
  merging: "Point Cloud Birleştirme",
  complete: "Tamamlandı!",
};

const phaseIcons: Record<ProcessingProgress["phase"], string> = {
  "loading-model": "📥",
  estimating: "🧠",
  "generating-mesh": "🔺",
  smoothing: "✨",
  aligning: "📐",
  merging: "☁️",
  complete: "✅",
};

export function ProcessingView({ progress, onCancel }: Props) {
  const isComplete = progress.phase === "complete";

  return (
    <div className="processing-section">
      <div className="processing-card">
        <div className="processing-visual">
          <div
            className={`processing-spinner ${isComplete ? "processing-spinner--done" : ""}`}
          >
            <div className="spinner-ring" />
            <div className="spinner-ring" />
            <div className="spinner-ring" />
            <span className="spinner-icon">{phaseIcons[progress.phase]}</span>
          </div>
        </div>

        <div className="processing-info">
          <h2>{phaseLabels[progress.phase]}</h2>
          <p className="processing-file">{progress.currentPhotoName}</p>

          <div className="progress-bar-container">
            <div className="progress-bar">
              <div
                className="progress-bar-fill"
                style={{ width: `${progress.percentage}%` }}
              />
            </div>
            <div className="progress-meta">
              <span>
                {progress.current} / {progress.total} fotoğraf
              </span>
              <span className="progress-pct">{progress.percentage}%</span>
            </div>
          </div>

          {!isComplete && (
            <button className="btn btn-ghost" onClick={onCancel}>
              İptal
            </button>
          )}
        </div>
      </div>

      <div className="processing-steps">
        <ProcessingStep
          label="Model"
          done={progress.phase !== "loading-model"}
          active={progress.phase === "loading-model"}
        />
        <ProcessingStep
          label="Derinlik"
          done={[
            "generating-mesh",
            "smoothing",
            "aligning",
            "merging",
            "complete",
          ].includes(progress.phase)}
          active={progress.phase === "estimating"}
        />
        <ProcessingStep
          label="Mesh"
          done={["smoothing", "aligning", "merging", "complete"].includes(
            progress.phase,
          )}
          active={progress.phase === "generating-mesh"}
        />
        <ProcessingStep
          label="Smoothing"
          done={["aligning", "merging", "complete"].includes(progress.phase)}
          active={progress.phase === "smoothing"}
        />
        <ProcessingStep
          label="Hizalama"
          done={["merging", "complete"].includes(progress.phase)}
          active={progress.phase === "aligning"}
        />
        <ProcessingStep
          label="Birleştirme"
          done={progress.phase === "complete"}
          active={progress.phase === "merging"}
        />
      </div>
    </div>
  );
}

function ProcessingStep({
  label,
  done,
  active,
}: {
  label: string;
  done: boolean;
  active: boolean;
}) {
  return (
    <div
      className={`step ${done ? "step--done" : ""} ${active ? "step--active" : ""}`}
    >
      <div className="step-indicator">{done ? "✓" : active ? "◉" : "○"}</div>
      <span>{label}</span>
    </div>
  );
}
