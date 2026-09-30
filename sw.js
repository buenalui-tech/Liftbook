// Offline support: the app shell is cached so Liftbook opens with no signal (gym basements).
// Bump VERSION whenever index.html changes so phones pick up the new build.
const VERSION = 'liftbook-v5';
const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js';
const SHELL = ['./', './index.html', './config.js', SUPABASE_JS, './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  // cache each file on its own so one missing file doesn't block offline support
  e.waitUntil(caches.open(VERSION)
    .then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {}))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // the page and its settings: network first so updates land, cache when offline
  if (req.mode === 'navigate' || (url.origin === location.origin && url.pathname.endsWith('/config.js'))) {
    const key = req.mode === 'navigate' ? './index.html' : './config.js';
    e.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(key, copy)); }
      return res;
    }).catch(() => caches.match(key)));
    return;
  }

  // own files and Google Fonts: cache first, fill the cache on first use
  if (url.origin === location.origin || url.href === SUPABASE_JS || url.host.endsWith('fonts.googleapis.com') || url.host.endsWith('fonts.gstatic.com')) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    })));
  }
});
