import { Scene, WebGLRenderer } from "three";
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
  const result = await exporter.parseAsync(scene, { binary: true });
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
