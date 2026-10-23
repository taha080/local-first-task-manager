/**
 * Turns the built file list into the URLs the service worker precaches.
 * Paths are absolute from the origin and include the GitHub Pages project
 * prefix (`/local-first-task-manager/`), which is also the worker's scope.
 */

/** Only caches with this prefix are deleted when a new build activates. */
export const CACHE_PREFIX = 'lftm-';

export function toPrecacheUrls(base: string, relativeFiles: readonly string[]): string[] {
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return relativeFiles
    .map((file) => file.replace(/\\/g, '/').replace(/^\//, ''))
    .filter((file) => file.length > 0 && file !== 'sw.js' && !file.endsWith('.map'))
    .sort()
    .map((file) => `${normalizedBase}${file}`);
}

/** Small stable id so each distinct shell opens a fresh cache. */
export function hashPrecache(urls: readonly string[]): string {
  let hash = 2166136261;
  const data = urls.join('\n');
  for (let index = 0; index < data.length; index += 1) {
    hash ^= data.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function cacheNameFor(urls: readonly string[]): string {
  return `${CACHE_PREFIX}${hashPrecache(urls)}`;
}
