import { useRef, useEffect, useState, useCallback } from "react";

type ViewType = "photo" | "depth" | "confidence";

interface Props {
    depthMap: Float32Array | null;
    width: number;
    height: number;
    photoUrl: string;
    confidence?: Float32Array;
}

/**
 * Depth heatmap color: blue (near) → cyan → green → yellow → red (far).
 */
function depthToColor(t: number): [number, number, number] {
    // t is 0..1 where 0 = near, 1 = far
    const clamped = Math.max(0, Math.min(1, t));
    let r: number, g: number, b: number;

    if (clamped < 0.25) {
        const s = clamped / 0.25;
        r = 0;
        g = s;
        b = 1;
    } else if (clamped < 0.5) {
        const s = (clamped - 0.25) / 0.25;
        r = 0;
        g = 1;
        b = 1 - s;
    } else if (clamped < 0.75) {
        const s = (clamped - 0.5) / 0.25;
        r = s;
        g = 1;
        b = 0;
    } else {
        const s = (clamped - 0.75) / 0.25;
        r = 1;
        g = 1 - s;
        b = 0;
    }

    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

/**
 * Confidence color: transparent (low) → green (high).
 */
function confidenceToColor(t: number): [number, number, number] {
    const c = Math.max(0, Math.min(1, t));
    return [Math.round((1 - c) * 255), Math.round(c * 255), 60];
}

export function DepthPreview({
    depthMap,
    width,
    height,
    photoUrl,
    confidence,
}: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [view, setView] = useState<ViewType>("depth");
    const [opacity, setOpacity] = useState(0.6);

    const drawOverlay = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        canvas.width = width;
        canvas.height = height;
        ctx.clearRect(0, 0, width, height);

        if (view === "photo" || !depthMap) return;

        const data = view === "confidence" && confidence ? confidence : depthMap;

        // Normalize data range
        let min = Infinity;
        let max = -Infinity;
        for (let i = 0; i < data.length; i++) {
            if (data[i] < min) min = data[i];
            if (data[i] > max) max = data[i];
        }
        const range = max - min || 1;

        const imageData = ctx.createImageData(width, height);
        const pixels = imageData.data;

        for (let i = 0; i < data.length; i++) {
            const t = (data[i] - min) / range;
            const [r, g, b] =
                view === "confidence" ? confidenceToColor(t) : depthToColor(t);

            const idx = i * 4;
            pixels[idx] = r;
            pixels[idx + 1] = g;
            pixels[idx + 2] = b;
            pixels[idx + 3] = 255;
        }

        ctx.putImageData(imageData, 0, 0);
    }, [depthMap, confidence, width, height, view]);

    useEffect(() => {
        drawOverlay();
    }, [drawOverlay]);

    const views: { key: ViewType; label: string; icon: string }[] = [
        { key: "photo", label: "Fotoğraf", icon: "📷" },
        { key: "depth", label: "Derinlik", icon: "🗺️" },
        ...(confidence
            ? [
                {
                    key: "confidence" as ViewType,
                    label: "Güven",
                    icon: "📊",
                },
            ]
            : []),
    ];

    return (
        <div className="glass-panel rounded-2xl overflow-hidden">
            {/* View Toggle */}
            <div className="flex items-center gap-1 p-2 bg-surface/60 border-b border-white/5">
                {views.map((v) => (
                    <button
                        key={v.key}
                        type="button"
                        onClick={() => setView(v.key)}
                        className={`
              flex items-center gap-1 px-2 py-1 md:px-3 md:py-1.5 rounded-lg text-[10px] md:text-xs font-medium transition-all
              ${view === v.key
                                ? "bg-primary/20 text-primary border border-primary/30"
                                : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
                            }
            `}
                    >
                        <span>{v.icon}</span>
                        {v.label}
                    </button>
                ))}

                {/* Opacity Slider */}
                {view !== "photo" && (
                    <div className="ml-auto flex items-center gap-1 md:gap-2 px-1 md:px-2">
                        <span className="hidden md:inline text-[10px] text-gray-500">Opaklık</span>
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={opacity}
                            onChange={(e) => setOpacity(parseFloat(e.target.value))}
                            className="w-12 md:w-20 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-primary"
                        />
                        <span className="text-[10px] font-mono text-gray-400 w-7 text-right">
                            {Math.round(opacity * 100)}%
                        </span>
                    </div>
                )}
            </div>

            {/* Image + Canvas Overlay */}
            <div className="relative" style={{ aspectRatio: `${width}/${height}` }}>
                <img
                    src={photoUrl}
                    alt="Preview"
                    className="absolute inset-0 w-full h-full object-cover"
                    draggable={false}
                />
                {view !== "photo" && depthMap && (
                    <canvas
                        ref={canvasRef}
                        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                        style={{ opacity }}
                    />
                )}

                {/* Legend */}
                {view === "depth" && depthMap && (
                    <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/60 backdrop-blur-sm rounded-lg px-2 py-1">
                        <span className="text-[9px] text-blue-400 font-mono">Yakın</span>
                        <div
                            className="w-16 h-2 rounded-sm"
                            style={{
                                background:
                                    "linear-gradient(to right, #0044ff, #00ffff, #00ff00, #ffff00, #ff0000)",
                            }}
                        />
                        <span className="text-[9px] text-red-400 font-mono">Uzak</span>
                    </div>
                )}

                {!depthMap && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                        <span className="text-sm text-gray-400">
                            Derinlik haritası henüz oluşturulmadı
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}
