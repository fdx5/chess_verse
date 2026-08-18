import { defineConfig } from 'vite';

export default defineConfig({
  root: 'packages/client',
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
  },
});
