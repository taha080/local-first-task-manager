/**
 * Registers the production service worker.
 * In `vite` dev the worker is not emitted, and a dev-server worker would cache
 * stale modules, so registration is limited to production builds.
 */

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!import.meta.env.PROD) return null;
  if (!('serviceWorker' in navigator)) return null;

  const base = import.meta.env.BASE_URL;
  // Scope must stay inside the worker script's directory. The script is
  // emitted at `${base}sw.js`, so `base` is the widest legal scope and matches
  // the GitHub Pages project path.
  return navigator.serviceWorker.register(`${base}sw.js`, { scope: base });
}
