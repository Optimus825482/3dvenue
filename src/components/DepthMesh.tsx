import { useRef, useMemo } from "react";
import { TextureLoader, DoubleSide } from "three";
import { useLoader } from "@react-three/fiber";
import type { ProcessedMesh, ViewMode } from "../types";

interface Props {
  mesh: ProcessedMesh;
  viewMode: ViewMode;
  depthScale: number;
  position?: [number, number, number];
}

export function DepthMesh({ mesh, viewMode, position = [0, 0, 0] }: Props) {
  const meshRef = useRef<any>(null);
  const texture = useLoader(TextureLoader, mesh.textureUrl);

  const material = useMemo(() => {
    switch (viewMode) {
      case "textured":
        return (
          <meshStandardMaterial
            map={texture}
            side={DoubleSide}
            roughness={0.7}
            metalness={0.1}
          />
        );
      case "solid":
        return (
          <meshStandardMaterial
            vertexColors
            side={DoubleSide}
            roughness={0.5}
            metalness={0.2}
          />
        );
      case "wireframe":
        return (
          <meshBasicMaterial
            wireframe
            color="#00d4ff"
            opacity={0.8}
            transparent
          />
        );
    }
  }, [viewMode, texture]);

  return (
    <mesh
      ref={meshRef}
      geometry={mesh.geometry}
      position={position}
      castShadow
      receiveShadow
    >
      {material}
    </mesh>
  );
}
