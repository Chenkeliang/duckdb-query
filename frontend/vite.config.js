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
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("commonjsHelpers")) {
            return "vendor";
          }
          if (
            id.includes("/src/Query/JoinQuery/") ||
            id.includes("/src/Query/PivotTable/") ||
            id.includes("/src/Query/SetOperations/")
          ) {
            return "query-builders";
          }
          if (
            id.includes("/src/Query/DataGrid/") ||
            id.includes("/src/Query/ResultPanel/")
          ) {
            return "query-results";
          }
          if (
            id.includes("/src/DataSource/") ||
            id.includes("/src/Query/DataSourcePanel/")
          ) {
            return "data-sources";
          }
          if (id.includes("node_modules")) {
            if (id.includes("codemirror")) {
              return "codemirror";
            }
            if (id.includes("lucide-react")) {
              return "icons";
            }
            if (
              id.includes("/recharts/") ||
              id.includes("/d3-") ||
              id.includes("/victory-vendor/")
            ) {
              return "charts";
            }
            if (
              id.includes("/react-markdown/") ||
              id.includes("/remark-") ||
              id.includes("/micromark") ||
              id.includes("/mdast-util-") ||
              id.includes("/hast-util-") ||
              id.includes("/unist-util-")
            ) {
              return "markdown";
            }
            if (id.includes("/sql-formatter/")) {
              return "sql-formatter";
            }
            if (id.includes("/@radix-ui/")) {
              return "radix-ui";
            }
            if (id.includes("/@tanstack/")) {
              return "tanstack";
            }
            if (id.includes("/@tauri-apps/")) {
              return "tauri";
            }
            if (
              id.includes("/axios/") ||
              id.includes("/@dnd-kit/") ||
              id.includes("/i18next/") ||
              id.includes("/sonner/") ||
              id.includes("/cmdk/") ||
              id.includes("/tailwind-merge/") ||
              id.includes("/class-variance-authority/")
            ) {
              return "app-vendor";
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
    port: 48000,
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY_TARGET || "http://127.0.0.1:48001",
        changeOrigin: true,
      },
    },
  },
});
