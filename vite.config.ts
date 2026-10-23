import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { cacheNameFor, toPrecacheUrls } from './src/pwa/precache.ts';
import { renderServiceWorker } from './src/pwa/service-worker.ts';

/**
 * Project site path. The deployed app is
 * https://taha080.github.io/local-first-task-manager/
 * Vite prefixes every built asset URL with this base.
 */
export const BASE_PATH = '/local-first-task-manager/';

export default defineConfig({
  base: BASE_PATH,
  plugins: [serviceWorkerPlugin()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    port: 5173,
  },
  preview: {
    port: 4173,
  },
  test: {
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
  },
});

/**
 * After the bundle is written, emit `sw.js` next to `index.html`.
 * Public files are read from `public/` directly because Vite copies them
 * after Rollup's write hooks, and the precache list must include icons and
 * the manifest as well as the hashed JS and CSS.
 */
function serviceWorkerPlugin(): Plugin {
  let publicDir = '';

  return {
    name: 'local-first-service-worker',
    apply: 'build',
    configResolved(config) {
      publicDir = config.publicDir;
    },
    writeBundle(options, bundle) {
      const outDir = options.dir;
      if (!outDir) throw new Error('The service worker plugin expected an output directory.');

      const emitted = Object.values(bundle).map((item) => item.fileName);
      const publicFiles = publicDir && existsSync(publicDir) ? listRelativeFiles(publicDir) : [];
      const precacheUrls = toPrecacheUrls(BASE_PATH, [...emitted, ...publicFiles]);

      if (!precacheUrls.some((url) => url.endsWith('/index.html'))) {
        throw new Error('Service worker precache is missing index.html.');
      }
      if (!precacheUrls.some((url) => url.endsWith('.webmanifest'))) {
        throw new Error('Service worker precache is missing the web app manifest.');
      }

      const source = renderServiceWorker({
        cacheName: cacheNameFor(precacheUrls),
        base: BASE_PATH,
        precacheUrls,
      });
      writeFileSync(join(outDir, 'sw.js'), source);
    },
  };
}

function listRelativeFiles(root: string, dir = root): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...listRelativeFiles(root, fullPath));
    } else {
      files.push(relative(root, fullPath).split('\\').join('/'));
    }
  }
  return files;
}
