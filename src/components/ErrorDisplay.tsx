import { useEffect } from "react";

interface Props {
  error: string;
  onClear: () => void;
}

export function ErrorDisplay({ error, onClear }: Props) {
  useEffect(() => {
    // Auto clear error after 10 seconds
    const timer = setTimeout(onClear, 10000);
    return () => clearTimeout(timer);
  }, [onClear]);

  return (
    <div className="fixed top-4 left-4 right-4 z-50 animate-in slide-in-from-top-4 fade-in duration-300">
      <div className="max-w-md mx-auto bg-base/80 backdrop-blur-md border border-danger/50 text-danger rounded-xl p-4 shadow-2xl flex items-start gap-3">
        <div className="text-xl">⚠️</div>
        <div className="flex-1">
          <h3 className="font-bold text-sm uppercase tracking-wide">
            Sistem Hatası
          </h3>
          <p className="text-sm opacity-90 mt-1">{error}</p>
        </div>
        <button
          onClick={onClear}
          className="text-white/50 hover:text-white transition-colors"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
