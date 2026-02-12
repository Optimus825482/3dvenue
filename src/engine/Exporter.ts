import {
  Scene,
  WebGLRenderer,
  Mesh,
  BufferGeometry,
  WebGLRenderTarget,
  Vector2,
} from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { OBJExporter } from "three/addons/exporters/OBJExporter.js";
import { STLExporter } from "three/addons/exporters/STLExporter.js";

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadText(
  text: string,
  filename: string,
  mime = "text/plain",
): void {
  const blob = new Blob([text], { type: mime });
  downloadBlob(blob, filename);
}

export async function exportGLTF(scene: Scene): Promise<void> {
  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(scene, {
    binary: true,
    includeCustomExtensions: true,
  });
  const blob = new Blob([result as ArrayBuffer], {
    type: "application/octet-stream",
  });
  downloadBlob(blob, "venue-3d-model.glb");
}

export function exportOBJ(scene: Scene): void {
  const exporter = new OBJExporter();
  const result = exporter.parse(scene);
  downloadText(result, "venue-3d-model.obj");
}

export function exportSTL(scene: Scene): void {
  const exporter = new STLExporter();
  const result = exporter.parse(scene, { binary: true });
  const blob = new Blob([result], { type: "application/octet-stream" });
  downloadBlob(blob, "venue-3d-model.stl");
}

export function exportScreenshot(
  renderer: WebGLRenderer,
  filename = "venue-3d-screenshot.png",
): void {
  renderer.domElement.toBlob((blob) => {
    if (blob) downloadBlob(blob, filename);
  }, "image/png");
}

export function exportPLY(scene: Scene): void {
  const vertices: number[] = [];
  const colors: number[] = [];

  scene.traverse((obj) => {
    if (obj instanceof Mesh && obj.geometry instanceof BufferGeometry) {
      const geo = obj.geometry;
      const pos = geo.getAttribute("position");
      const col = geo.getAttribute("color");

      if (!pos) return;

      for (let i = 0; i < pos.count; i++) {
        vertices.push(pos.getX(i), pos.getY(i), pos.getZ(i));
        if (col) {
          colors.push(
            Math.round(col.getX(i) * 255),
            Math.round(col.getY(i) * 255),
            Math.round(col.getZ(i) * 255),
          );
        } else {
          colors.push(200, 200, 200);
        }
      }
    }
  });

  const vertexCount = vertices.length / 3;
  let ply = "ply\n";
  ply += "format ascii 1.0\n";
  ply += `element vertex ${vertexCount}\n`;
  ply += "property float x\n";
  ply += "property float y\n";
  ply += "property float z\n";
  ply += "property uchar red\n";
  ply += "property uchar green\n";
  ply += "property uchar blue\n";
  ply += "end_header\n";

  for (let i = 0; i < vertexCount; i++) {
    const vi = i * 3;
    ply += `${vertices[vi].toFixed(6)} ${vertices[vi + 1].toFixed(6)} ${vertices[vi + 2].toFixed(6)} ${colors[vi]} ${colors[vi + 1]} ${colors[vi + 2]}\n`;
  }

  downloadText(ply, "venue-3d-model.ply");
}

export function exportScreenshotHD(
  renderer: WebGLRenderer,
  width?: number,
  height?: number,
): void {
  const currentSize = new Vector2();
  renderer.getSize(currentSize);

  const hdWidth = width ?? currentSize.x * 2;
  const hdHeight = height ?? currentSize.y * 2;

  const renderTarget = new WebGLRenderTarget(hdWidth, hdHeight);
  const originalRenderTarget = renderer.getRenderTarget();

  renderer.setRenderTarget(renderTarget);
  renderer.setSize(hdWidth, hdHeight, false);

  // Read pixels from the render target
  const pixels = new Uint8Array(hdWidth * hdHeight * 4);
  renderer.readRenderTargetPixels(
    renderTarget,
    0,
    0,
    hdWidth,
    hdHeight,
    pixels,
  );

  // Restore original state
  renderer.setRenderTarget(originalRenderTarget);
  renderer.setSize(currentSize.x, currentSize.y, false);
  renderTarget.dispose();

  // Convert to canvas and download
  const canvas = document.createElement("canvas");
  canvas.width = hdWidth;
  canvas.height = hdHeight;
  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.createImageData(hdWidth, hdHeight);

  // Flip Y axis (WebGL reads bottom-up)
  for (let y = 0; y < hdHeight; y++) {
    for (let x = 0; x < hdWidth; x++) {
      const srcIdx = ((hdHeight - y - 1) * hdWidth + x) * 4;
      const dstIdx = (y * hdWidth + x) * 4;
      imageData.data[dstIdx] = pixels[srcIdx];
      imageData.data[dstIdx + 1] = pixels[srcIdx + 1];
      imageData.data[dstIdx + 2] = pixels[srcIdx + 2];
      imageData.data[dstIdx + 3] = pixels[srcIdx + 3];
    }
  }

  ctx.putImageData(imageData, 0, 0);
  canvas.toBlob((blob) => {
    if (blob) downloadBlob(blob, "venue-3d-screenshot-hd.png");
  }, "image/png");
}
