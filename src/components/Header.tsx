import type { AppStep } from "../types";

interface Props {
  currentStep: AppStep;
}

const steps: { key: AppStep; label: string; icon: string }[] = [
  { key: "upload", label: "Yükle", icon: "📸" },
  { key: "settings", label: "Ayarlar", icon: "⚙️" },
  { key: "processing", label: "İşle", icon: "🧠" },
  { key: "viewer", label: "3D Görüntüle", icon: "👁️" },
];

export function Header({ currentStep }: Props) {
  const currentIdx = steps.findIndex((s) => s.key === currentStep);

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between px-4 py-3 md:px-8 bg-glass-strong backdrop-blur-xl border-b border-white/5">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          <span className="text-2xl filter drop-shadow-[0_0_10px_rgba(0,212,255,0.3)] animate-[floatIcon_3s_ease-in-out_infinite]">
            🧊
          </span>
          <h1 className="font-display text-xl font-bold bg-gradient-to-br from-primary to-secondary bg-clip-text text-transparent tracking-tight">
            3D Venue
          </h1>
        </div>
        <p className="hidden md:block text-xs text-secondary border-l border-white/5 pl-4 tracking-wide h-4 leading-4">
          Fotoğraftan 3D Model Oluşturucu
        </p>
      </div>

      <nav className="flex items-center gap-1 md:gap-1.5">
        {steps.map((step, i) => {
          const isActive = i === currentIdx;
          const isDone = i < currentIdx;

          return (
            <div key={step.key} className="flex items-center">
              {i > 0 && <div className="w-3 md:w-5 h-px bg-white/5 mx-0.5" />}
              <div
                className={`
                  relative flex items-center gap-1.5 px-2.5 py-1.5 md:px-3.5 md:py-1.5 rounded-full text-xs md:text-sm font-medium transition-all duration-300
                  ${
                    isActive
                      ? "text-primary bg-primary/10 shadow-[0_0_16px_rgba(0,212,255,0.1)]"
                      : isDone
                        ? "text-success"
                        : "text-gray-500"
                  }
                `}
              >
                <span className="text-sm md:text-base">{step.icon}</span>
                <span className={`${isActive ? "block" : "hidden md:block"}`}>
                  {step.label}
                </span>
                {isActive && (
                  <div className="absolute -bottom-px left-1/2 -translate-x-1/2 w-6 h-0.5 bg-primary rounded-full shadow-[0_0_8px_rgba(0,212,255,0.3)]" />
                )}
              </div>
            </div>
          );
        })}
      </nav>
    </header>
  );
}
