import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE_URL || "/",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Web Worker 支持
  worker: {
    format: "es",
  },
  // Monaco Editor 优化
  optimizeDeps: {
    include: ["@monaco-editor/react", "monaco-editor"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("codemirror")) {
              return "codemirror";
            }
            if (id.includes("ag-grid")) {
              return "ag-grid";
            }
            if (id.includes("monaco-editor")) {
              return "monaco-editor";
            }
            if (id.includes("@mui") || id.includes("@emotion")) {
              return "mui";
            }
            if (id.includes("lucide-react")) {
              return "icons";
            }
            if (id.includes("react")) {
              return "vendor";
            }
          }
        },
      },
    },
  },
  define: {
    global: "globalThis",
  },
  server: {
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY_TARGET || "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
