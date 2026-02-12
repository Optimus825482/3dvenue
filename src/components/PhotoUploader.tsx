import React, { useCallback, useRef, useState, useEffect } from "react";
import type { PhotoFile, ModelSize } from "../types";
import { analyzePhotoQuality, type PhotoQuality } from "../engine/PhotoAnalyzer";

const MODEL_OPTIONS: { value: ModelSize; label: string; desc: string; icon: string }[] = [
  { value: "small", label: "Hızlı", desc: "Düşük detay, çok hızlı", icon: "⚡" },
  { value: "base", label: "Dengeli", desc: "Orta detay, makul süre", icon: "⚖️" },
  { value: "large", label: "Maksimum", desc: "En yüksek kalite", icon: "💎" },
];

interface Props {
  photos: PhotoFile[];
  onAddPhotos: (files: FileList | File[]) => void;
  onRemovePhoto: (id: string) => void;
  onProcess: (modelSize: ModelSize) => void;
  disabled?: boolean;
}

export function PhotoUploader({
  photos,
  onAddPhotos,
  onRemovePhoto,
  onProcess,
  disabled,
}: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [qualityScores, setQualityScores] = useState<Record<string, PhotoQuality>>({});
  const [selectedModel, setSelectedModel] = useState<ModelSize>("large");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const acceptTypes = ["image/jpeg", "image/png", "image/heic", "image/heif"];

  // Analyze photo quality in background for new photos
  useEffect(() => {
    const unanalyzed = photos.filter((p) => !qualityScores[p.id]);
    if (unanalyzed.length === 0) return;

    let cancelled = false;
    (async () => {
      for (const photo of unanalyzed) {
        if (cancelled) break;
        try {
          const quality = await analyzePhotoQuality(photo.url);
          if (!cancelled) {
            setQualityScores((prev) => ({ ...prev, [photo.id]: quality }));
          }
        } catch {
          // Silently skip failed analysis
        }
      }
    })();

    return () => { cancelled = true; };
  }, [photos]);

  const filterFiles = useCallback((files: FileList | File[]): File[] => {
    return Array.from(files).filter(
      (f) =>
        acceptTypes.includes(f.type) ||
        /\.(jpe?g|png|heic|heif)$/i.test(f.name),
    );
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const valid = filterFiles(e.dataTransfer.files);
      if (valid.length > 0) onAddPhotos(valid);
    },
    [onAddPhotos, filterFiles],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDragging(false), []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.length) {
        const valid = filterFiles(e.target.files);
        if (valid.length > 0) onAddPhotos(valid);
      }
      e.target.value = "";
    },
    [onAddPhotos, filterFiles],
  );

  const previewPhoto = photos.find((p) => p.id === previewId);

  return (
    <div className="w-full max-w-6xl mx-auto">
      <div className="text-center mb-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="text-5xl mb-2 filter drop-shadow-[0_0_20px_rgba(0,212,255,0.3)] animate-[floatIcon_4s_ease-in-out_infinite]">
          📸
        </div>
        <h2 className="font-display text-3xl font-bold tracking-tight mb-2">
          Fotoğraf Yükle
        </h2>
        <p className="text-gray-400 text-sm md:text-base">
          Mekanın farklı açılardan çekilmiş fotoğraflarını yükleyin
        </p>
      </div>

      <div
        className={`
          relative border-2 border-dashed rounded-3xl p-8 md:p-14 text-center cursor-pointer transition-all duration-300 overflow-hidden
          ${
            isDragging
              ? "border-primary bg-primary/5 shadow-[0_0_50px_rgba(0,212,255,0.2)] scale-[1.01]"
              : "border-primary/20 bg-glass hover:border-primary/40 hover:bg-glass-hover hover:shadow-[0_0_40px_rgba(0,212,255,0.1)] hover:-translate-y-0.5"
          }
          ${photos.length >= 50 ? "opacity-50 cursor-not-allowed" : ""}
        `}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => photos.length < 50 && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/heic,image/heif"
          multiple
          onChange={handleFileSelect}
          style={{ display: "none" }}
        />
        <div className="flex flex-col items-center gap-3 relative z-10">
          <div
            className={`text-5xl transition-transform duration-500 ${isDragging ? "scale-125 -translate-y-1" : ""}`}
          >
            {isDragging ? "📥" : "🖼️"}
          </div>
          <span className="font-display text-lg font-semibold tracking-tight">
            {isDragging
              ? "Bırakın!"
              : photos.length >= 50
                ? "Maksimum 50 fotoğrafa ulaşıldı"
                : "Fotoğrafları sürükleyin veya tıklayın"}
          </span>
          <span className="text-xs text-gray-500 font-mono bg-base/50 px-2 py-1 rounded-md border border-white/5">
            JPEG, PNG, HEIC • Maks. 50 fotoğraf
          </span>
        </div>

        {/* Hover Gradient Effect */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,212,255,0.05),transparent_70%)] opacity-0 hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
      </div>

      {photos.length > 0 && (
        <div className="animate-in fade-in duration-500">
          <div className="flex justify-between items-end mt-10 mb-5">
            <h3 className="font-display font-semibold text-gray-400">
              Yüklenen Fotoğraflar{" "}
              <span className="text-primary ml-1">({photos.length}/50)</span>
            </h3>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 md:gap-4">
            {photos.map((photo, index) => (
              <div
                key={photo.id}
                className="group relative aspect-square rounded-2xl overflow-hidden cursor-pointer border border-white/10 bg-surface/50 transition-all duration-300 hover:border-primary/50 hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/10 animate-in fade-in zoom-in-50 fill-mode-both"
                style={{ animationDelay: `${index * 50}ms` }}
                onClick={() => setPreviewId(photo.id)}
              >
                <img
                  src={photo.thumbnail}
                  alt={photo.name}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
                {/* Quality Badge */}
                {qualityScores[photo.id] && (
                  <div
                    className={`absolute top-2 left-2 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider backdrop-blur-md border ${qualityScores[photo.id].recommendation === "excellent"
                      ? "bg-green-500/20 border-green-500/40 text-green-300"
                      : qualityScores[photo.id].recommendation === "good"
                        ? "bg-blue-500/20 border-blue-500/40 text-blue-300"
                        : qualityScores[photo.id].recommendation === "fair"
                          ? "bg-yellow-500/20 border-yellow-500/40 text-yellow-300"
                          : "bg-red-500/20 border-red-500/40 text-red-300"
                      }`}
                    title={qualityScores[photo.id].issues.join(" • ")}
                  >
                    {qualityScores[photo.id].overallScore}
                  </div>
                )}
                <button
                  className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full bg-danger/90 text-white shadow-sm opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100 transition-all duration-200 hover:bg-danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemovePhoto(photo.id);
                  }}
                  title="Sil"
                >
                  ×
                </button>
                <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/80 to-transparent translate-y-full group-hover:translate-y-0 transition-transform duration-300">
                  <p className="text-[10px] text-gray-300 truncate font-mono">
                    {photo.name}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col items-center gap-4 mt-10 animate-in fade-in slide-in-from-bottom-2 duration-500 delay-300">
            {/* Model Size Selector */}
            <div className="flex gap-1 md:gap-2 p-1 rounded-xl md:rounded-2xl bg-surface/80 border border-white/10 backdrop-blur-md">
              {MODEL_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSelectedModel(opt.value)}
                  className={`
                    flex items-center gap-1 md:gap-1.5 px-2.5 py-1.5 md:px-4 md:py-2 rounded-lg md:rounded-xl text-xs md:text-sm font-medium transition-all duration-200
                    ${selectedModel === opt.value
                      ? "bg-primary/20 text-primary border border-primary/30 shadow-[0_0_12px_rgba(0,212,255,0.15)]"
                      : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
                    }
                  `}
                  title={opt.desc}
                >
                  <span>{opt.icon}</span>
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
            <span className="text-[11px] text-gray-500">
              {MODEL_OPTIONS.find((m) => m.value === selectedModel)?.desc}
            </span>

            <button
              className="group relative inline-flex items-center gap-2 px-6 py-3 md:px-8 md:py-3.5 rounded-xl md:rounded-2xl bg-gradient-to-br from-primary to-secondary text-white font-semibold shadow-[0_4px_20px_rgba(0,212,255,0.3)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(0,212,255,0.4)] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none overflow-hidden"
              onClick={() => onProcess(selectedModel)}
              disabled={disabled || photos.length < 1}
            >
              <div className="absolute inset-0 bg-[linear-gradient(105deg,transparent_30%,rgba(255,255,255,0.2)_45%,rgba(255,255,255,0.3)_50%,rgba(255,255,255,0.2)_55%,transparent_70%)] bg-[length:200%_100%] animate-[shimmer_3s_infinite]" />
              <span className="text-xl relative z-10">🧊</span>
              <span className="relative z-10">3D Model Oluştur</span>
            </button>
            <span className="text-xs text-gray-500 font-mono">
              {photos.length} fotoğraf işlenmeye hazır
            </span>
          </div>
        </div>
      )}

      {previewPhoto && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md animate-in fade-in duration-300"
          onClick={() => setPreviewId(null)}
        >
          <div
            className="relative max-w-[90vw] max-h-[90vh] bg-surface rounded-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={previewPhoto.url}
              alt={previewPhoto.name}
              className="max-w-full max-h-[85vh] object-contain"
            />
            <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black/80 to-transparent flex justify-between items-end">
              <div>
                <span className="text-white font-medium drop-shadow-md block">
                  {previewPhoto.name}
                </span>
                {qualityScores[previewPhoto.id] && (
                  <div className="flex gap-3 mt-1.5 text-[10px] font-mono">
                    <span className="text-gray-300">
                      Netlik: <span className="text-white">{qualityScores[previewPhoto.id].sharpness}</span>
                    </span>
                    <span className="text-gray-300">
                      Parlaklık: <span className="text-white">{qualityScores[previewPhoto.id].brightness}</span>
                    </span>
                    <span className="text-gray-300">
                      Kontrast: <span className="text-white">{qualityScores[previewPhoto.id].contrast}</span>
                    </span>
                  </div>
                )}
              </div>
              <span className="text-xs text-gray-300 font-mono bg-black/50 px-2 py-1 rounded">
                {previewPhoto.width} × {previewPhoto.height}
              </span>
            </div>
            <button
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-danger transition-colors"
              onClick={() => setPreviewId(null)}
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
