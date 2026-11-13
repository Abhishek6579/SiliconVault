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

  build: {
    rollupOptions: {
      output: {
        // Split heavyweight dependencies by feature. Keep React and shared runtime
        // packages under Rollup's normal chunking to avoid artificial chunk cycles.
        manualChunks(id) {
          if (!id.includes('/node_modules/')) return;
          if (id.includes('/node_modules/pdfjs-dist/')) return 'vendor-pdf';
          if (id.includes('/node_modules/@silurus/ooxml/')) return 'vendor-ooxml';
          if (
            id.includes('/node_modules/@uiw/react-codemirror/') ||
            id.includes('/node_modules/@codemirror/') ||
            id.includes('/node_modules/@lezer/')
          ) return 'vendor-codemirror';
          if (
            id.includes('/node_modules/react-markdown/') ||
            id.includes('/node_modules/remark-gfm/') ||
            id.includes('/node_modules/remark-math/') ||
            id.includes('/node_modules/rehype-katex/') ||
            id.includes('/node_modules/unified/') ||
            id.includes('/node_modules/katex/')
          ) return 'vendor-markdown';
          if (id.includes('/node_modules/mermaid/')) return 'vendor-mermaid';
        },
      },
    },
  },

  envPrefix: ['VITE_', 'TAURI_ENV_*'],
});
