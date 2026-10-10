// Offline support: the app shell is cached so Liftbook opens with no signal (gym basements).
// Bump VERSION whenever index.html changes so phones pick up the new build.
const VERSION = 'liftbook-v43';
const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js';
const THREE_JS = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
const GLTF_JS = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js';
const APP_FILES = ['css/app.css', 'js/core.js', 'js/training.js', 'js/ui.js', 'js/howto.js', 'js/program.js', 'js/body.js', 'js/food.js', 'js/scale.js', 'js/recipes.js', 'js/adaptive.js', 'js/figure.js', 'js/share.js', 'js/tester.js', 'js/settings.js', 'js/timer.js', 'js/events.js'].map(f => './' + f);
// './' is the app page everywhere; some hosts (Cloudflare) redirect /index.html to /, so it isn't listed
const SHELL = ['./', './config.js', ...APP_FILES, SUPABASE_JS, THREE_JS, GLTF_JS, './figure.glb', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  // cache each file on its own so one missing file doesn't block offline support
  e.waitUntil(caches.open(VERSION)
    // cache: 'reload' skips the browser's HTTP cache so a new version never installs yesterday's files
    .then(c => Promise.all(SHELL.map(u => c.add(new Request(u, {cache: 'reload'})).catch(() => {}))))
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
    // only the app page itself becomes the offline copy; another page (the privacy policy) is kept under its own address
    const app = req.mode === 'navigate' && /\/(index\.html)?$/.test(url.pathname);
    const key = req.mode !== 'navigate' ? './config.js' : app ? './' : req;
    e.respondWith(fetch(req).then(res => {
      if (res.ok && res.type === 'basic' && !res.redirected) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(key, copy)); }
      return res;
    }).catch(() => caches.match(key).then(r => r || (app ? undefined : caches.match('./')))));
    return;
  }

  // own files and Google Fonts: cache first, fill the cache on first use
  if (url.origin === location.origin || url.href === SUPABASE_JS || url.href === THREE_JS || url.href === GLTF_JS || url.host.endsWith('fonts.googleapis.com') || url.host.endsWith('fonts.gstatic.com')) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    })));
  }
});
