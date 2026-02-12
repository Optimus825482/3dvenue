import { useRef, useMemo, useEffect } from "react";
import {
  TextureLoader,
  DoubleSide,
  SRGBColorSpace,
  LinearMipmapLinearFilter,
  LinearFilter,
  Vector2,
} from "three";
import type { Texture, Mesh as ThreeMesh, Points as ThreePoints } from "three";
import { useLoader, useThree } from "@react-three/fiber";
import type { ProcessedMesh, ViewMode } from "../types";

interface Props {
  mesh: ProcessedMesh;
  viewMode: ViewMode;
  position?: [number, number, number];
  isPointCloud?: boolean;
  pointSize?: number;
  roughness?: number;
  metalness?: number;
  normalMap?: Texture | null;
  depthScale?: number;
}

export function DepthMesh({
  mesh,
  viewMode,
  position = [0, 0, 0],
  isPointCloud = false,
  pointSize = 0.05,
  roughness = 0.7,
  metalness = 0.1,
  normalMap = null,
  depthScale,
}: Props) {
  const meshRef = useRef<ThreeMesh | ThreePoints>(null);
  const { gl } = useThree();
  const texture = useLoader(TextureLoader, mesh.textureUrl);

  // Enhance texture quality
  useEffect(() => {
    if (texture) {
      texture.colorSpace = SRGBColorSpace;
      texture.anisotropy = gl.capabilities.getMaxAnisotropy();
      texture.minFilter = LinearMipmapLinearFilter;
      texture.magFilter = LinearFilter;
      texture.generateMipmaps = true;
      texture.needsUpdate = true;
    }
  }, [texture, gl]);

  const materialProps = useMemo(() => {
    switch (viewMode) {
      case "textured":
        return {
          type: "standard" as const,
          map: texture as Texture | undefined,
          normalMap: (normalMap ?? undefined) as Texture | undefined,
          side: DoubleSide,
          roughness,
          metalness,
        };
      case "solid":
        return {
          type: "standard" as const,
          map: undefined as Texture | undefined,
          normalMap: undefined as Texture | undefined,
          vertexColors: true,
          side: DoubleSide,
          roughness: 0.5,
          metalness: 0.2,
        };
      case "wireframe":
        return {
          type: "basic" as const,
          wireframe: true,
          color: "#00d4ff",
          opacity: 0.8,
          transparent: true,
        };
    }
  }, [viewMode, texture, roughness, metalness, normalMap]);

  const normalScaleVec = useMemo(() => new Vector2(0.8, 0.8), []);

  if (isPointCloud) {
    return (
      <points
        ref={meshRef}
        geometry={mesh.geometry}
        position={position}
        castShadow
        receiveShadow
      >
        <pointsMaterial
          map={texture}
          size={pointSize}
          sizeAttenuation={true}
          vertexColors={false}
          transparent={true}
          opacity={0.9}
        />
      </points>
    );
  }

  return (
    <mesh
      ref={meshRef}
      geometry={mesh.geometry}
      position={position}
      castShadow
      receiveShadow
    >
      {materialProps.type === "basic" ? (
        <meshBasicMaterial
          wireframe={materialProps.wireframe}
          color={materialProps.color}
          opacity={materialProps.opacity}
          transparent={materialProps.transparent}
        />
      ) : (
        <meshPhysicalMaterial
          map={materialProps.map ?? undefined}
          side={materialProps.side}
          roughness={materialProps.roughness}
          metalness={materialProps.metalness}
          vertexColors={materialProps.vertexColors ?? false}
          normalMap={materialProps.normalMap ?? undefined}
          normalScale={normalScaleVec}
          clearcoat={0.05}
          clearcoatRoughness={0.5}
          envMapIntensity={0.3}
        />
      )}
    </mesh>
  );
}
