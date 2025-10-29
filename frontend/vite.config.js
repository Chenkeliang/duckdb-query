import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
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
});
