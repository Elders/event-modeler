import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// A Miro app has two entry points:
//   index.html -> runs on the board, registers the toolbar icon
//   app.html   -> the React panel UI shown when the icon is clicked
// Both must be declared as build inputs so `vite build` emits both pages.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
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
