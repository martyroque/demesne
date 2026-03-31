import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Prevent vite from obscuring Rust compile errors
  clearScreen: false,
  server: {
    port: 5173,
    // Fail if the port is already in use (Tauri relies on a fixed port)
    strictPort: true,
    // Expose to the network when TAURI_DEV_HOST is set (e.g. iOS device testing)
    host: host || false,
    hmr: host
      ? { protocol: "ws", host, port: 5174 }
      : undefined,
  },
  // Make TAURI_ENV_* vars available to the frontend
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    // Tauri targets specific browser engines per platform
    target:
      process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari15",
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
