// Native IndexedDB implementation

import { AppState, PhotoFile, ProcessedMesh } from "../types";
import * as THREE from "three";

const DB_NAME = "3d-venue-db";
const STORE_NAME = "app-state";
const DB_VERSION = 1;

interface SerializedMesh extends Omit<ProcessedMesh, "geometry"> {
  geometry: any; // JSON representation
}

interface SerializedState extends Omit<AppState, "meshes" | "photos"> {
  photos: PhotoFile[]; // Files are serializable in IDB
  meshes: SerializedMesh[];
}

export const PersistenceService = {
  async initDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
    });
  },

  async saveState(state: AppState) {
    try {
      const db = await this.initDB();
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);

      // Serialize Geometry
      const serializedMeshes = state.meshes.map((mesh) => ({
        ...mesh,
        geometry: mesh.geometry.toJSON(),
      }));

      // Photos (File objects) are natively supported by IDB

      const serializedState: SerializedState = {
        ...state,
        meshes: serializedMeshes,
        // We only save relevant parts for restoration
        step: state.step,
        photos: state.photos,
        progress: state.progress,
        error: null, // Don't persist errors
        qualitySettings: state.qualitySettings,
        viewMode: state.viewMode,
        showGrid: state.showGrid,
        depthScale: state.depthScale,
        selectedMeshIndex: state.selectedMeshIndex,
      };

      store.put(serializedState, "current");
      return new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.error("Save state failed:", e);
    }
  },

  async loadState(): Promise<AppState | null> {
    try {
      const db = await this.initDB();
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get("current");

      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          const data = request.result as SerializedState;
          if (!data) {
            resolve(null);
            return;
          }

          // Restore Photos (Blobs to URLs)
          const restoredPhotos = data.photos.map((p) => ({
            ...p,
            url: URL.createObjectURL(p.file),
            thumbnail: URL.createObjectURL(p.file), // Assuming same for now
          }));

          // Restore Meshes (JSON to BufferGeometry)
          // const loader = new THREE.ObjectLoader();
          const restoredMeshes = data.meshes.map((m) => {
            // toJSON returns a generic object, we need to parse geometry
            // But THREE.ObjectLoader parses a whole scene/object usually.
            // BufferGeometry.toJSON returns { metadata:..., uuid:..., type:..., data:... }
            // We can use the generic JSONLoader-like approach or just reconstruct.
            // Actually, simplest is to use:
            const geometry = new THREE.BufferGeometryLoader().parse(m.geometry);
            return {
              ...m,
              geometry,
              textureUrl:
                restoredPhotos.find((p) => p.id === m.photoId)?.url || "",
            };
          });

          resolve({
            ...data,
            photos: restoredPhotos,
            meshes: restoredMeshes,
          } as AppState);
        };
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.error("Load state failed:", e);
      return null;
    }
  },

  async clearState() {
    const db = await this.initDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).clear();
    return new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
    });
  },

  async clearAppCache() {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  },
};
