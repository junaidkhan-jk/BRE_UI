import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative asset paths, so the built bundle works from a file, a static host or a published
  // preview — none of which serve from the domain root. An absolute '/assets/...' 404s in all
  // three.
  base: './',
  server: {
    port: 5173,
    // The studio never calls the Decision API directly — it talks to the BFF (TRD §13.1), which
    // is what keeps per-screen aggregation and masking out of the browser. In development the BFF
    // is proxied so the app runs same-origin and needs no CORS configuration.
    proxy: {
      '/bff': {
        target: process.env.BRE_BFF_URL ?? 'http://localhost:8081',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
