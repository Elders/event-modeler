import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// A Miro app has two entry points:
//   index.html -> runs on the board, registers the toolbar icon
//   app.html   -> the React panel UI shown when the icon is clicked
// Both must be declared as build inputs so `vite build` emits both pages.
export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the build works under any URL prefix — in particular
  // a GitHub Pages project site at https://<user>.github.io/<repo>/ — without
  // hardcoding the repo name. The panel is opened via the relative 'app.html'
  // (see src/index.ts), which resolves against the same prefix.
  base: './',
  server: {
    port: 3000,
    // Same-origin proxy for the Figma REST API in dev. A browser ad blocker /
    // privacy extension / VPN intercepts a third-party request to
    // api.figma.com from the Miro panel iframe and hands back a blank 200, so
    // the Figma import can't call it directly. Routing through `/figma` keeps
    // the browser request same-origin (localhost) — out of any blocker's reach
    // — and Vite performs the real Figma fetch server-side in Node. The Figma
    // adapter targets this base automatically in dev (see adapters/figma/source).
    proxy: {
      '/figma': {
        target: 'https://api.figma.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/figma/, ''),
      },
    },
  },
  build: {
    rollupOptions: {
      input: {
        index: 'index.html',
        app: 'app.html',
      },
    },
  },
});
