import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defaultClientConditions, defineConfig} from 'vite';
import pkg from './package.json' with { type: 'json' };

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    define: {
      // Single source of truth for the version shown in the app
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    resolve: {
      // ONNX Runtime loads its WebAssembly from the CDN (see src/audio/stems/stemTypes.ts): do not
      // copy the 28 MB runtime into the build
      conditions: ['onnxruntime-web-use-extern-wasm', ...defaultClientConditions],
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
