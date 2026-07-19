import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// Havok ships a .wasm that must not be pre-bundled by esbuild.
export default defineConfig({
  // relative base so the build runs from any path: a GitHub Pages project
  // subpath (/RC-Dirt-Oval/), Netlify/itch.io roots, or a local static server.
  base: "./",
  server: { port: 5173, host: "127.0.0.1" },
  optimizeDeps: { exclude: ["@babylonjs/havok"] },
  build: { target: "es2020" },
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["apple-touch-icon-180.png"],
      manifest: {
        name: "Super Jay RC",
        short_name: "Super Jay RC",
        description: "1/10 dirt-oval RC sprint car racing",
        display: "standalone",
        orientation: "landscape",
        background_color: "#0a0c10",
        theme_color: "#0a0c10",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
        globPatterns: ["**/*.{js,css,html,png,jpg,svg,wasm,env}"],
      },
    }),
  ],
});
