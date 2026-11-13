import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  optimizeDeps: {
    // Preserve the package's new URL references to its bundled WebAssembly assets.
    exclude: ['@silurus/ooxml'],
  },

  server: {
    host: '127.0.0.1',
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/target/**'],
    },
  },

  envPrefix: ['VITE_', 'TAURI_ENV_*'],
});
