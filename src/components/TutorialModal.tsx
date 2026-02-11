import { createPortal } from "react-dom";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const STEPS = [
  {
    title: "1. Fotoğraf Yükle",
    desc: "Mekanınızın farklı açılardan çekilmiş en az 3 fotoğrafını yükleyin. Ne kadar çok açı, o kadar iyi sonuç!",
    icon: "📸",
  },
  {
    title: "2. Kalite Seçimi",
    desc: "Cihazınıza uygun AI modelini seçin. 'Base' veya 'Large' modeller daha detaylı sonuçlar verir.",
    icon: "🧠",
  },
  {
    title: "3. İşleme & Geliştirme",
    desc: "Yapay zeka derinlik haritalarını oluşturur ve 3D sahneyi inşa eder. Bu işlem cihaz hızına göre biraz zaman alabilir.",
    icon: "⚙️",
  },
  {
    title: "4. 3D Keşfet & İndir",
    desc: "Oluşan 3D modeli inceleyin, ölçüm yapın ve GLTF/OBJ formatında indirin.",
    icon: "📦",
  },
];

export function TutorialModal({ isOpen, onClose }: Props) {
  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="relative w-full max-w-lg bg-surface border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
        {/* Header */}
        <div className="p-6 border-b border-white/5 bg-base/50 flex justify-between items-center">
          <h2 className="text-xl font-display font-bold text-white flex items-center gap-2">
            <span>🎓</span> Nasıl Kullanılır?
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {STEPS.map((step, index) => (
            <div key={index} className="flex gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-xl text-primary border border-primary/20">
                {step.icon}
              </div>
              <div>
                <h3 className="text-white font-medium mb-1">{step.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">
                  {step.desc}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-4 bg-base/50 border-t border-white/5 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-primary text-black font-semibold rounded-lg hover:bg-primary-light transition-colors shadow-[0_0_15px_rgba(0,212,255,0.3)]"
          >
            Anlaşıldı, Başlayalım! 🚀
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
