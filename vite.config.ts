import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["vite.svg", "robots.txt"],
      manifest: {
        name: "3D Venue Architect",
        short_name: "3D Venue",
        description: "AI Powered 3D Venue Reconstruction",
        theme_color: "#0a0a0f",
        background_color: "#0a0a0f",
        display: "standalone",
        icons: [
          {
            src: "vite.svg",
            sizes: "192x192 512x512",
            type: "image/svg+xml",
          },
        ],
      },
    }),
  ],
  optimizeDeps: {
    exclude: ["@huggingface/transformers"],
  },
  build: {
    target: "esnext",
    rollupOptions: {
      output: {
        manualChunks: {
          three: ["three", "@react-three/fiber", "@react-three/drei"],
          transformers: ["@huggingface/transformers"],
        },
      },
    },
  },
});
