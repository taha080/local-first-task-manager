import { describe, expect, it } from 'vitest';
import { cacheNameFor, hashPrecache, toPrecacheUrls } from '../src/pwa/precache';
import { renderServiceWorker } from '../src/pwa/service-worker';

describe('precache URLs', () => {
  it('prefixes the Pages base and skips the worker plus source maps', () => {
    expect(
      toPrecacheUrls('/local-first-task-manager/', [
        'index.html',
        'assets/index-abc.js',
        'sw.js',
        'assets/index-abc.js.map',
        'manifest.webmanifest',
        'icons\\icon-192.png',
      ]),
    ).toEqual([
      '/local-first-task-manager/assets/index-abc.js',
      '/local-first-task-manager/icons/icon-192.png',
      '/local-first-task-manager/index.html',
      '/local-first-task-manager/manifest.webmanifest',
    ]);
  });

  it('adds a trailing slash when the base omitted one', () => {
    expect(toPrecacheUrls('/local-first-task-manager', ['index.html'])).toEqual([
      '/local-first-task-manager/index.html',
    ]);
  });

  it('changes the cache name when the file list changes', () => {
    const first = cacheNameFor(['/local-first-task-manager/index.html']);
    const second = cacheNameFor(['/local-first-task-manager/index.html', '/local-first-task-manager/app.js']);
    expect(first).toBe(`lftm-${hashPrecache(['/local-first-task-manager/index.html'])}`);
    expect(first).not.toBe(second);
    expect(first.startsWith('lftm-')).toBe(true);
  });
});

describe('service worker source', () => {
  it('is valid JavaScript scoped to the project path', () => {
    const source = renderServiceWorker({
      cacheName: 'lftm-abc',
      base: '/local-first-task-manager',
      precacheUrls: ['/local-first-task-manager/index.html'],
    });

    expect(() => new Function(source)).not.toThrow();
    expect(source).toContain('const CACHE_NAME = "lftm-abc"');
    expect(source).toContain('const BASE = "/local-first-task-manager/"');
    expect(source).toContain('"/local-first-task-manager/index.html"');
    expect(source).toContain('url.pathname.startsWith(BASE)');
    expect(source).toContain("key.startsWith('lftm-')");
    expect(source).toContain('cache.addAll(PRECACHE_URLS)');
  });
});
