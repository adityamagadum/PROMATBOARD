import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  // Relative asset URLs so every page works from chrome-extension://<id>/
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome116',
    // The preload polyfill is unnecessary in Chrome and would add an inline helper.
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: {
        popup: r('./popup.html'),
        sidepanel: r('./sidepanel.html'),
        app: r('./app.html'),
        quicksave: r('./quicksave.html'),
        background: r('./src/background/index.ts'),
      },
      output: {
        // The service worker must live at a stable path referenced by manifest.json.
        entryFileNames: (chunk) =>
          chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js',
      },
    },
  },
});
