import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const PUBLIC_DIR = join(import.meta.dirname, 'packages/client/public');

function publicAssetVersions(): Record<string, string> {
  const versions: Record<string, string> = {};
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
        continue;
      }
      const urlPath = '/' + relative(PUBLIC_DIR, fullPath).replaceAll('\\', '/');
      versions[urlPath] = createHash('sha256').update(readFileSync(fullPath)).digest('hex').slice(0, 12);
    }
  };
  visit(PUBLIC_DIR);
  return versions;
}

export default defineConfig({
  root: 'packages/client',
  define: {
    __PUBLIC_ASSET_VERSIONS__: JSON.stringify(publicAssetVersions()),
  },
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
