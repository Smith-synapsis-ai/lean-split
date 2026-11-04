// sw.js: offline cache for Lean Split.
// Bump VERSION on every deploy (keep it equal to js/version.js). A new
// VERSION makes this file byte-different, so the browser installs the new
// worker; the page then shows "Update available. Tap to refresh".
const VERSION = '1.0.0';
const CACHE = `lean-split-v${VERSION}`;

// The whole app shell. Relative URLs resolve against this file, so the
// app works under any sub-path (e.g. /lean-split/ on GitHub Pages).
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'js/app.js',
  'js/state.js',
  'js/views.js',
  'js/program.js',
  'js/store.js',
  'js/stats.js',
  'js/timer.js',
  'js/charts.js',
  'js/util.js',
  'js/version.js',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // cache: 'reload' bypasses the HTTP cache so a new version never stores stale files.
    await cache.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })));
    // No skipWaiting here: an open app keeps its version until the user taps the banner.
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('lean-split-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// Cache-first from the versioned shell: every file of one version is served
// together, so the app never mixes old and new code. Navigations fall back
// to the cached index.html, which makes the app open offline.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (req.mode === 'navigate') {
      return (await cache.match('index.html')) || fetch(req);
    }
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      return await fetch(req);
    } catch (e) {
      return new Response('', { status: 504, statusText: 'Offline' });
    }
  })());
});
