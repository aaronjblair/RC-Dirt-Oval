import { defineConfig } from "vite";

// Havok ships a .wasm that must not be pre-bundled by esbuild.
export default defineConfig({
  // relative base so the build runs from any path: a GitHub Pages project
  // subpath (/RCSprint/), Netlify/itch.io roots, or a local static server.
  base: "./",
  server: { port: 5173, host: "127.0.0.1" },
  optimizeDeps: { exclude: ["@babylonjs/havok"] },
  build: { target: "es2020" },
});
