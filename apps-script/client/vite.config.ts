import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const clientDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: clientDir,
  plugins: [react()],
  build: {
    outDir: resolve(clientDir, '../dist-client'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(clientDir, 'src/main.tsx'),
      output: {
        format: 'iife',
        entryFileNames: 'sidebar.js',
        name: 'CipherSheetApp',
        inlineDynamicImports: true,
      },
    },
    cssCodeSplit: false,
    assetsInlineLimit: Infinity,
    minify: true,
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
});
