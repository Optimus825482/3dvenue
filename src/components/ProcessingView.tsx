import type { ProcessingProgress } from "../types";
import { useEffect, useState } from "react";

interface Props {
  progress: ProcessingProgress;
  onCancel: () => void;
}

const phaseLabels: Record<ProcessingProgress["phase"], string> = {
  "loading-model": "Neural Engine Initialization",
  estimating: "Depth Map Analysis",
  "generating-mesh": "Polygon Generation",
  smoothing: "Surface Refinement",
  aligning: "Multi-View Alignment",
  merging: "Point Cloud Fusion",
  complete: "Rendering Complete",
};

const phaseIcons: Record<ProcessingProgress["phase"], string> = {
  "loading-model": "🔮",
  estimating: "🧠",
  "generating-mesh": "📐",
  smoothing: "✨",
  aligning: "🔗",
  merging: "☁️",
  complete: "✅",
};

export function ProcessingView({ progress, onCancel }: Props) {
  const isComplete = progress.phase === "complete";
  const [dots, setDots] = useState("");

  // Animated dots for "Processing..." effect
  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? "" : prev + "."));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-full max-w-2xl mx-auto px-4 mt-8 md:mt-16">
      {/* Holographic Container */}
      <div className="relative glass-panel rounded-3xl overflow-hidden p-1">
        {/* Animated Border Gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-secondary/20 opacity-50 pointer-events-none" />

        {/* Scan Line Effect */}
        <div className="scan-line top-0 z-0" />

        <div className="relative z-10 bg-base/80 backdrop-blur-md rounded-[20px] p-6 md:p-10 flex flex-col items-center">
          {/* Central Visualization */}
          <div className="relative mb-10 group">
            <div
              className={`w-32 h-32 md:w-48 md:h-48 rounded-full border-2 flex items-center justify-center relative
              ${isComplete ? "border-success bg-success/10" : "border-primary/30 neon-border bg-base/50"}
              transition-all duration-700
            `}
            >
              {/* Spinning Rings */}
              {!isComplete && (
                <>
                  <div className="absolute inset-0 rounded-full border-t-2 border-primary animate-[spin-slow_3s_linear_infinite]" />
                  <div className="absolute inset-2 rounded-full border-r-2 border-secondary/50 animate-[spin-slow_5s_linear_infinite_reverse]" />
                  <div className="absolute inset-0 bg-primary/5 blur-xl animate-pulse" />
                </>
              )}

              <span className="text-5xl md:text-7xl filter drop-shadow-[0_0_15px_rgba(255,255,255,0.5)] animate-in zoom-in duration-500">
                {phaseIcons[progress.phase]}
              </span>
            </div>

            {/* Status Badge */}
            <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 bg-base border border-white/10 px-4 py-1.5 rounded-full flex items-center gap-2 shadow-xl whitespace-nowrap">
              <div
                className={`w-2 h-2 rounded-full ${isComplete ? "bg-success" : "bg-primary animate-pulse"}`}
              />
              <span className="text-xs font-mono text-gray-400 uppercase tracking-widest">
                {isComplete ? "SYSTEM READY" : "PROCESSING"}
              </span>
            </div>
          </div>

          {/* Text Info */}
          <div className="text-center mb-8 space-y-2">
            <h2 className="text-2xl md:text-3xl font-display font-bold bg-clip-text text-transparent bg-gradient-to-r from-white via-primary-dim to-secondary animate-in fade-in slide-in-from-bottom-2">
              {phaseLabels[progress.phase]}
            </h2>
            <p className="text-gray-400 font-mono text-sm max-w-md mx-auto truncate">
              {progress.currentPhotoName || "Veri analizi yapılıyor"}
              {!isComplete && dots}
            </p>
          </div>

          {/* Futuristic Progress Bar */}
          <div className="w-full max-w-md space-y-2 mb-8">
            <div className="flex justify-between text-xs text-primary/80 font-mono">
              <span>PROGRESS</span>
              <span>{Math.round(progress.percentage)}%</span>
            </div>
            <div className="h-2 bg-surface rounded-full overflow-hidden border border-white/5 relative">
              <div
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary to-secondary transition-all duration-500 ease-out box-shadow-[0_0_15px_rgba(0,212,255,0.5)]"
                style={{ width: `${progress.percentage}%` }}
              >
                <div className="absolute top-0 right-0 bottom-0 w-1 bg-white/50 blur-[2px]" />
              </div>
            </div>
            <div className="flex justify-between text-[10px] text-gray-500 font-mono uppercase">
              <span>
                Step {progress.current}/{progress.total}
              </span>
              <span>
                EST_TIME:{" "}
                {progress.estimatedTimeRemaining
                  ? `${Math.ceil(progress.estimatedTimeRemaining / 1000)}s`
                  : "--:--"}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          {!isComplete && (
            <button
              onClick={onCancel}
              className="px-6 py-2 rounded-full border border-danger/30 text-danger/80 hover:bg-danger/10 hover:text-danger hover:border-danger transition-all text-sm font-medium tracking-wide uppercase"
            >
              Abort Sequence
            </button>
          )}

          {/* Terminal Log Styled Steps (Mobile Friendly) */}
          <div className="w-full mt-8 p-4 rounded-xl bg-black/40 border border-white/5 font-mono text-xs md:text-sm space-y-2 max-h-40 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
            {Object.keys(phaseLabels).map((phase) => {
              const p = phase as ProcessingProgress["phase"];
              const isDone = getPhaseStatus(progress.phase, p) === "done";
              const isActive = progress.phase === p;

              return (
                <div
                  key={phase}
                  className={`flex items-center gap-3 ${isActive ? "text-primary bg-primary/5 -mx-2 px-2 py-1 rounded" : isDone ? "text-gray-500" : "text-gray-700"}`}
                >
                  <span className="w-4">
                    {isDone ? "✓" : isActive ? "➤" : "•"}
                  </span>
                  <span className="flex-1 capitalize truncate">
                    {phase.replace("-", " ")}
                  </span>
                  {isActive && <span className="animate-pulse">_</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper to determine phase status order
function getPhaseStatus(
  current: ProcessingProgress["phase"],
  target: ProcessingProgress["phase"],
): "pending" | "active" | "done" {
  const phases: ProcessingProgress["phase"][] = [
    "loading-model",
    "estimating",
    "generating-mesh",
    "smoothing",
    "aligning",
    "merging",
    "complete",
  ];

  const currentIndex = phases.indexOf(current);
  const targetIndex = phases.indexOf(target);

  if (targetIndex < currentIndex) return "done";
  if (targetIndex === currentIndex) return "active";
  return "pending";
}
