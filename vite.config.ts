import { defineConfig } from 'vite';

export default defineConfig({
  root: 'packages/client',
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
    target: 'esnext',
    minify: 'esbuild',
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) {
            return 'vendor-three';
          }
        },
      },
    },
  },
});
