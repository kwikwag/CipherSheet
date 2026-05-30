import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const clientDir = fileURLToPath(new URL('.', import.meta.url));

// BUILD_ENTRY is set by build-apps-script.mjs when invoking multiple builds.
// Defaults to 'sidebar' for `vite dev` / manual invocations.
const entryName  = process.env.BUILD_ENTRY ?? 'sidebar';
const entryPaths: Record<string, string> = {
  sidebar:  'src/main.tsx',
  settings: 'src/settings/main.tsx',
};
const entryFile = entryPaths[entryName];
if (!entryFile) throw new Error(`Unknown BUILD_ENTRY: ${entryName}`);

export default defineConfig({
  root: clientDir,
  plugins: [react()],
  build: {
    outDir: resolve(clientDir, '../dist-client'),
    emptyOutDir: process.env.BUILD_CLEAN === '1',
    rollupOptions: {
      input: resolve(clientDir, entryFile),
      output: {
        format: 'iife',
        entryFileNames: `${entryName}.js`,
        name: `CipherSheet_${entryName}`,
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
