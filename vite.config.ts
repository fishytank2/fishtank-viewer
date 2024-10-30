import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/stream": {
        target: "https://ftest.3045x.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/stream/, ""),
        configure: (proxy, _options) => {
          proxy.on("proxyReq", (proxyReq) => {
            proxyReq.setHeader("Origin", "https://ftest.3045x.com");
            proxyReq.setHeader("Referer", "https://ftest.3045x.com/");
            proxyReq.setHeader("Connection", "keep-alive");
            proxyReq.setHeader("Cache-Control", "no-cache");
          });
        },
      },
      "/yt": {
        target: "https://www.youtube.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/yt/, ""),
      },
    },
  },
});
