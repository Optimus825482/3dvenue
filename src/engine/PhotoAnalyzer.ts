/**
 * PhotoAnalyzer — Analyze photo quality for 3D reconstruction suitability.
 * Computes sharpness (Laplacian), brightness, contrast, and generates
 * actionable feedback in Turkish.
 */

export interface PhotoQuality {
  overallScore: number; // 0-100
  sharpness: number; // 0-100
  brightness: number; // 0-100
  contrast: number; // 0-100
  issues: string[];
  recommendation: "excellent" | "good" | "fair" | "poor";
}

/**
 * Load an image URL into a canvas and return its luminance data.
 */
function loadImageData(
  imageUrl: string,
  maxSize: number = 512,
): Promise<{ luminance: Float32Array; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas 2D context not available"));
        return;
      }

      ctx.drawImage(img, 0, 0, w, h);
      const imageData = ctx.getImageData(0, 0, w, h);
      const pixels = imageData.data;

      // Convert to luminance (Rec. 709)
      const luminance = new Float32Array(w * h);
      for (let i = 0; i < w * h; i++) {
        const idx = i * 4;
        luminance[i] =
          0.2126 * pixels[idx] +
          0.7152 * pixels[idx + 1] +
          0.0722 * pixels[idx + 2];
      }

      resolve({ luminance, width: w, height: h });
    };

    img.onerror = () => reject(new Error("Image loading failed"));
    img.src = imageUrl;
  });
}

/**
 * Compute sharpness using the variance of the Laplacian operator.
 * Higher variance = sharper image.
 */
function computeSharpness(
  luminance: Float32Array,
  width: number,
  height: number,
): number {
  // 3x3 Laplacian kernel
  const kernel = [0, 1, 0, 1, -4, 1, 0, 1, 0];
  let sum = 0;
  let sumSq = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let lap = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const idx = (y + ky) * width + (x + kx);
          const ki = (ky + 1) * 3 + (kx + 1);
          lap += luminance[idx] * kernel[ki];
        }
      }
      sum += lap;
      sumSq += lap * lap;
      count++;
    }
  }

  const mean = sum / (count || 1);
  const variance = sumSq / (count || 1) - mean * mean;

  // Normalize: variance < 50 = blurry, > 500 = very sharp
  return Math.min(100, Math.max(0, (variance / 500) * 100));
}

/**
 * Compute brightness as mean luminance, normalized to 0-100.
 * Ideal brightness is around 40-60% (100-150 out of 255).
 */
function computeBrightness(luminance: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < luminance.length; i++) {
    sum += luminance[i];
  }
  const mean = sum / (luminance.length || 1);
  // Map 0-255 to 0-100
  return (mean / 255) * 100;
}

/**
 * Compute contrast as the standard deviation of luminance, normalized to 0-100.
 */
function computeContrast(luminance: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < luminance.length; i++) {
    sum += luminance[i];
  }
  const mean = sum / (luminance.length || 1);

  let variance = 0;
  for (let i = 0; i < luminance.length; i++) {
    const diff = luminance[i] - mean;
    variance += diff * diff;
  }
  const stdDev = Math.sqrt(variance / (luminance.length || 1));

  // Normalize: stdDev < 20 = low contrast, > 70 = high contrast
  return Math.min(100, Math.max(0, (stdDev / 70) * 100));
}

/**
 * Generate issue descriptions and recommendation based on metrics.
 */
function generateFeedback(
  sharpness: number,
  brightness: number,
  contrast: number,
): { issues: string[]; recommendation: PhotoQuality["recommendation"] } {
  const issues: string[] = [];

  if (sharpness < 25) {
    issues.push("Çok bulanık — tripod veya sabit çekim önerilir");
  } else if (sharpness < 45) {
    issues.push("Hafif bulanıklık algılandı");
  }

  if (brightness < 20) {
    issues.push("Çok karanlık — daha iyi aydınlatma gerekli");
  } else if (brightness < 30) {
    issues.push("Düşük parlaklık — sonuçlar gürültülü olabilir");
  } else if (brightness > 85) {
    issues.push("Aşırı parlak — detaylar kaybolabilir");
  } else if (brightness > 75) {
    issues.push("Biraz parlak — pozlama azaltılabilir");
  }

  if (contrast < 20) {
    issues.push("Düşük kontrast — derinlik tahmini zayıf olabilir");
  } else if (contrast < 35) {
    issues.push("Orta düzey kontrast");
  }

  // Weighted overall score
  const overall = sharpness * 0.45 + brightness * 0.2 + contrast * 0.35;

  let recommendation: PhotoQuality["recommendation"];
  if (overall >= 75) {
    recommendation = "excellent";
  } else if (overall >= 55) {
    recommendation = "good";
  } else if (overall >= 35) {
    recommendation = "fair";
  } else {
    recommendation = "poor";
  }

  if (issues.length === 0) {
    issues.push("Fotoğraf kalitesi iyi görünüyor");
  }

  return { issues, recommendation };
}

/**
 * Analyze photo quality for 3D reconstruction.
 * Returns scores for sharpness, brightness, contrast, and actionable issues.
 */
export async function analyzePhotoQuality(
  imageUrl: string,
): Promise<PhotoQuality> {
  const { luminance, width, height } = await loadImageData(imageUrl);

  const sharpness = computeSharpness(luminance, width, height);
  const brightness = computeBrightness(luminance);
  const contrast = computeContrast(luminance);

  const overallScore = Math.round(
    sharpness * 0.45 + brightness * 0.2 + contrast * 0.35,
  );

  const { issues, recommendation } = generateFeedback(
    sharpness,
    brightness,
    contrast,
  );

  return {
    overallScore: Math.min(100, Math.max(0, overallScore)),
    sharpness: Math.round(sharpness),
    brightness: Math.round(brightness),
    contrast: Math.round(contrast),
    issues,
    recommendation,
  };
}
