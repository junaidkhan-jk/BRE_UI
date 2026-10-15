// From vitest/config rather than vite: the `test` block below is not part of vite's own
// UserConfig, and importing defineConfig from 'vite' makes `tsc -b` reject it.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Rewrites the emitted `<script type="module">` into a classic script tag.
 *
 * The bundle is built as an IIFE (see `rollupOptions.output.format` below), so the `type="module"`
 * attribute buys nothing — and it costs something real: a browser fetches a module script under
 * CORS, and a `file://` page has no origin, so the module is blocked and the page renders BLANK
 * with no visible error. That is a defect this project actually shipped.
 *
 * It was previously fixed only in the hand-copied review page under docs/html, which left
 * `dist/index.html` still broken and the fix one regeneration away from being lost. Fixing it here
 * means the shipped artefact is correct by construction and the review copy is a straight copy.
 *
 * `defer` is added, and it is not optional. A module script is deferred by default; a classic one
 * is NOT. Vite puts the tag in `<head>`, so simply dropping `type="module"` makes the bundle
 * execute before `<div id="root">` has been parsed — React finds no mount point and the page
 * renders blank, which is the very failure this is meant to prevent, reintroduced by the fix for
 * it. Caught by the end-to-end test, which is the whole reason it exists.
 */
function classicScriptTag() {
  return {
    name: 'bre-classic-script-tag',
    transformIndexHtml(html: string) {
      return html
        .replace(/<script\s+type="module"\s+crossorigin\s+/g, '<script defer ')
        .replace(/<script\s+type="module"\s+/g, '<script defer ');
    },
  };
}

export default defineConfig({
  plugins: [react(), classicScriptTag()],
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
  // Unit tests only.
  //
  // Vitest's default `include` matches **/*.spec.ts, which swept up the Playwright specs under
  // e2e/ — where they cannot run: they got as far as calling test.describe() and failed with
  // "Playwright Test did not expect test.describe() to be called here". So `npm test` has always
  // reported three failed files and zero tests, which reads like a broken suite rather than an
  // empty one, and buried the signal that there are no unit tests yet.
  //
  // The e2e suite is `npm run e2e` and is what actually covers these screens.
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        // A classic IIFE bundle, not an ES module.
        //
        // Browsers refuse to load `<script type="module">` over file:// — modules are fetched
        // under CORS and a file has no origin — so a module build opens as a blank page when
        // someone double-clicks the HTML. The review copy in docs/html is meant to be opened
        // exactly that way, with no server.
        //
        // The cost is no code splitting, which this app does not use anyway: one entry, no
        // dynamic imports, 346 kB. Revisit if the Studio ever lazy-loads a route.
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'assets/studio.js',
        assetFileNames: 'assets/studio.[ext]',
      },
    },
  },
});
