import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

const plugins = [react(), tailwindcss()];

export default defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    // The Firebase SDK vendor chunk below (auth + firestore + app-check) is ~700kb on its own —
    // that's the SDK itself, not something splitting further meaningfully shrinks, and it's now
    // isolated so a normal deploy never re-downloads it. Raising this just stops the build from
    // re-flagging that already-understood, already-isolated chunk on every build.
    chunkSizeWarningLimit: 750,
    rollupOptions: {
      output: {
        // Firebase (auth + firestore + app-check) is the single largest dependency and changes far
        // less often than the app's own code — splitting it into its own vendor chunk means a normal
        // deploy only re-downloads the small app chunk, not this one too, and it can cache separately.
        manualChunks: {
          firebase: ["firebase/app", "firebase/auth", "firebase/firestore", "firebase/app-check"],
          "react-vendor": ["react", "react-dom"],
        },
      },
    },
  },
  server: {
    port: 3000,
    strictPort: false, // Will find next available port if 3000 is busy
    host: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
