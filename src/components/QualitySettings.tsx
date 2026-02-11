import { QUALITY_ENHANCEMENTS } from "../types";
import type { QualitySettings, AppAction, ModelSize } from "../types";
import { useEffect, useState } from "react";

interface Props {
  settings: QualitySettings;
  photoCount: number;
  dispatch: React.Dispatch<AppAction>;
  onProcess: () => void;
  onBack: () => void;
}

const MODEL_TIERS: {
  value: ModelSize;
  label: string;
  desc: string;
  size: string;
}[] = [
  {
    value: "small",
    label: "Small",
    desc: "Hızlı, hafif (~25MB)",
    size: "25MB",
  },
  {
    value: "base",
    label: "Base",
    desc: "Dengeli kalite (~100MB)",
    size: "100MB",
  },
  {
    value: "large",
    label: "Large",
    desc: "Maksimum detay (~400MB)",
    size: "400MB",
  },
];

export function QualitySettings({
  settings,
  photoCount,
  dispatch,
  onProcess,
  onBack,
}: Props) {
  const activeCount = countActive(settings);
  const enhancements = QUALITY_ENHANCEMENTS.filter((e) => e.id !== "modelSize");
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile && settings.modelSize !== "small") {
        dispatch({ type: "SET_QUALITY", settings: { modelSize: "small" } });
      }
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, [settings.modelSize, dispatch]);

  function setModelSize(size: ModelSize) {
    if (isMobile && size !== "small") return;
    dispatch({ type: "SET_QUALITY", settings: { modelSize: size } });
  }

  function toggle(id: string) {
    switch (id) {
      case "maxResolution":
        dispatch({
          type: "SET_QUALITY",
          settings: {
            maxResolution: settings.maxResolution === 512 ? 1024 : 512,
          },
        });
        break;
      case "enableSmoothing":
        dispatch({
          type: "SET_QUALITY",
          settings: { enableSmoothing: !settings.enableSmoothing },
        });
        break;
      case "enableMultiView":
        dispatch({
          type: "SET_QUALITY",
          settings: { enableMultiView: !settings.enableMultiView },
        });
        break;
      case "enablePointCloud":
        dispatch({
          type: "SET_QUALITY",
          settings: { enablePointCloud: !settings.enablePointCloud },
        });
        break;
      case "enableEnhancedNormals":
        dispatch({
          type: "SET_QUALITY",
          settings: { enableEnhancedNormals: !settings.enableEnhancedNormals },
        });
        break;
    }
  }

  function isEnabled(id: string): boolean {
    switch (id) {
      case "maxResolution":
        return settings.maxResolution === 1024;
      case "enableSmoothing":
        return settings.enableSmoothing;
      case "enableMultiView":
        return settings.enableMultiView;
      case "enablePointCloud":
        return settings.enablePointCloud;
      case "enableEnhancedNormals":
        return settings.enableEnhancedNormals;
      default:
        return false;
    }
  }

  return (
    <section className="animate-in fade-in slide-in-from-right-8 duration-500">
      <div className="text-center mb-8">
        <div className="text-4xl mb-2 animate-bounce">⚙️</div>
        <h2 className="font-display text-2xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
          Kalite Ayarları
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          <span className="text-primary font-mono">{photoCount}</span> fotoğraf
          hazır • İşleme öncesi kalite seçeneklerini ayarlayın
        </p>
      </div>

      {/* Model Tier Selector */}
      <div className="bg-surface/50 rounded-2xl p-5 border border-white/5 mb-6 backdrop-blur-sm">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl bg-primary/10 p-2 rounded-lg">🧠</span>
          <div>
            <h3 className="font-semibold text-gray-200">AI Model Seçimi</h3>
            <p className="text-xs text-gray-500 max-w-md">
              Daha büyük model = daha detaylı derinlik haritası (ilk kullanımda
              indirilir)
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {MODEL_TIERS.map((tier) => {
            const isDisabled = isMobile && tier.value !== "small";
            return (
              <button
                key={tier.value}
                type="button"
                className={`
                  group relative flex flex-col items-start p-4 rounded-xl border transition-all duration-300
                  ${
                    settings.modelSize === tier.value
                      ? "bg-primary/10 border-primary shadow-[0_0_20px_rgba(0,212,255,0.15)]"
                      : "bg-base/50 border-white/5 hover:border-white/20 hover:bg-surface"
                  }
                  ${isDisabled ? "opacity-40 cursor-not-allowed grayscale" : ""}
                `}
                onClick={() => setModelSize(tier.value)}
                disabled={isDisabled}
              >
                <div className="flex justify-between w-full mb-1">
                  <span
                    className={`font-display font-medium ${settings.modelSize === tier.value ? "text-primary" : "text-gray-300"}`}
                  >
                    {tier.label}
                  </span>
                  <span className="text-[10px] font-mono bg-black/30 px-1.5 py-0.5 rounded text-gray-500 group-hover:text-primary transition-colors">
                    {tier.size}
                  </span>
                </div>
                <span className="text-xs text-gray-500 text-left leading-relaxed">
                  {tier.desc}
                </span>
                {isDisabled && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-[1px] rounded-xl text-[10px] font-mono text-white/50 uppercase tracking-widest border border-white/5">
                    Desktop Only
                  </span>
                )}

                {settings.modelSize === tier.value && (
                  <div className="absolute inset-0 border-2 border-primary rounded-xl pointer-events-none animate-pulse opacity-50" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Enhancement Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
        {enhancements.map((item) => {
          const enabled = isEnabled(item.id);
          return (
            <button
              key={item.id}
              className={`
                relative flex flex-col p-4 rounded-xl border text-left transition-all duration-300 min-h-[140px]
                ${
                  enabled
                    ? "bg-gradient-to-br from-surface to-primary/5 border-primary/50 shadow-[0_4px_20px_rgba(0,0,0,0.2)]"
                    : "bg-surface/30 border-white/5 hover:border-white/10 hover:bg-surface/50"
                }
              `}
              onClick={() => toggle(item.id)}
              type="button"
            >
              <div className="flex justify-between items-start mb-2 w-full">
                <span className="text-2xl filter drop-shadow-lg">
                  {item.icon}
                </span>
                <div
                  className={`
                    w-11 h-6 rounded-full p-1 transition-colors duration-300
                    ${enabled ? "bg-success shadow-[0_0_10px_rgba(0,230,138,0.4)]" : "bg-gray-700"}
                  `}
                >
                  <div
                    className={`
                      w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-300
                      ${enabled ? "translate-x-5" : "translate-x-0"}
                    `}
                  />
                </div>
              </div>

              <h3
                className={`font-semibold mb-1 ${enabled ? "text-white" : "text-gray-400"}`}
              >
                {item.label}
              </h3>
              <p className="text-xs text-gray-500 leading-relaxed mb-4 flex-1">
                {item.description}
              </p>

              <div className="flex items-center justify-between w-full pt-3 border-t border-white/5">
                <div className="flex items-center gap-2">
                  <div className="flex gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <span
                        key={i}
                        className={`text-[10px] ${i < item.impact ? "text-warning" : "text-gray-800"}`}
                      >
                        ★
                      </span>
                    ))}
                  </div>
                  <span
                    className={`
                      text-[10px] px-1.5 py-0.5 rounded font-medium
                      ${
                        item.difficulty === "easy"
                          ? "bg-success/10 text-success"
                          : "bg-warning/10 text-warning"
                      }
                    `}
                  >
                    {item.difficulty === "easy" ? "Kolay" : "Orta"}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-gray-600">
                  {item.timeEstimate}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Smoothing slider (visible when enabled) */}
      {settings.enableSmoothing && (
        <div className="bg-surface/50 rounded-xl p-4 border border-white/5 mb-8 animate-in slide-in-from-top-2">
          <div className="flex justify-between mb-2">
            <label className="text-sm text-gray-300">
              Smoothing Iterasyonları
            </label>
            <span className="text-sm font-mono text-primary font-bold">
              {settings.smoothingIterations}
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={10}
            value={settings.smoothingIterations}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-primary hover:accent-primary-dim transition-all"
            onChange={(e) =>
              dispatch({
                type: "SET_QUALITY",
                settings: { smoothingIterations: parseInt(e.target.value) },
              })
            }
          />
        </div>
      )}

      <div className="sticky bottom-4 z-20 bg-base/80 backdrop-blur-lg p-4 rounded-2xl border border-white/10 shadow-[0_8px_30px_rgba(0,0,0,0.5)] flex flex-col md:flex-row items-center justify-between gap-4">
        <button
          className="w-full md:w-auto px-6 py-3 rounded-xl hover:bg-white/5 text-gray-400 hover:text-white transition-colors flex items-center justify-center gap-2 text-sm font-medium"
          onClick={onBack}
          type="button"
        >
          <span>←</span> Geri
        </button>

        <div className="flex flex-col items-center md:items-end">
          <div className="flex items-center gap-2">
            <span className="bg-primary/20 text-primary text-xs font-bold px-2 py-0.5 rounded-md">
              {activeCount}
            </span>
            <span className="text-sm text-gray-300">iyileştirme aktif</span>
          </div>
        </div>

        <button
          className="w-full md:w-auto relative group overflow-hidden px-8 py-3.5 rounded-xl bg-success text-black font-bold shadow-[0_0_20px_rgba(0,230,138,0.3)] transition-all hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(0,230,138,0.5)] active:scale-95"
          onClick={onProcess}
          type="button"
        >
          <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
          <span className="relative flex items-center justify-center gap-2">
            🚀 İşlemeyi Başlat
          </span>
        </button>
      </div>
    </section>
  );
}

function countActive(s: QualitySettings): number {
  let count = 0;
  if (s.modelSize !== "small") count++;
  if (s.maxResolution === 1024) count++;
  if (s.enableSmoothing) count++;
  if (s.enableMultiView) count++;
  if (s.enablePointCloud) count++;
  if (s.enableEnhancedNormals) count++;
  return count;
}
