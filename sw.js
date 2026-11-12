// Service worker di Ottoshots: tiene l'app in memoria per aprirla subito.
const CACHE = 'ottoshots-21';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-192.png', 'icon-maskable-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (new URL(e.request.url).origin !== location.origin) return;
  /* prima la rete (così l'app è sempre l'ultima versione); se manca la rete, quella salvata */
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => { if (r && r.ok) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); } return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});

self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) { d = { testo: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.titolo || 'Ottoshots', { body: d.testo || 'Ci sono novità.', icon: 'icon-192.png', badge: 'icon-192.png', tag: 'ottoshots', renotify: true }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(l => { for (const c of l) { if ('focus' in c) return c.focus(); } return self.clients.openWindow('./'); }));
});


/* ---------- Rinnovo automatico delle notifiche, anche con l'app chiusa ---------- */
const VAPID_PUB = 'BM1nBAYKhFCtuM4cE0lH1PyN2sV2p02GPusQUmEjs_KvA0JsRN-mGOL9EXRD6S7nSKWOnksQUJGAGMSTXyOX7pQ';
function urlB64(b) { const p = '='.repeat((4 - b.length % 4) % 4), s = (b + p).replace(/-/g, '+').replace(/_/g, '/'), r = atob(s), o = new Uint8Array(r.length); for (let i = 0; i < r.length; i++) o[i] = r.charCodeAt(i); return o; }
async function leggiCfg() { try { const c = await caches.open('ottoshots-cfg'); const r = await c.match('cfg'); return r ? await r.json() : null; } catch (e) { return null; } }
async function rinnova() {
  const c = await leggiCfg(); if (!c || !c.token || !c.repo) return;
  const reg = self.registration;
  let sub = await reg.pushManager.getSubscription();
  const vecchio = sub && sub.endpoint;
  if (sub) { try { await sub.unsubscribe(); } catch (e) {} }
  sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64(VAPID_PUB) });
  const js = sub.toJSON();
  const url = 'https://api.github.com/repos/' + c.repo + '/contents/push/sub.json';
  const H = { Authorization: 'Bearer ' + c.token, Accept: 'application/vnd.github+json' };
  const g = await fetch(url + '?t=' + Date.now(), { headers: H, cache: 'no-store' });
  let l = [], sha;
  if (g.ok) { const j = await g.json(); sha = j.sha; try { l = JSON.parse(decodeURIComponent(escape(atob(j.content.replace(/\s/g, ''))))); } catch (e) { l = []; } }
  if (!Array.isArray(l)) l = [];
  l = l.filter(x => x && x.endpoint !== js.endpoint && x.endpoint !== vecchio); l.push(js); if (l.length > 5) l = l.slice(-5);
  const body = { message: 'Notifiche rinnovate (in automatico)', content: btoa(unescape(encodeURIComponent(JSON.stringify(l, null, 1)))) };
  if (sha) body.sha = sha;
  await fetch(url, { method: 'PUT', headers: H, body: JSON.stringify(body) });
}
self.addEventListener('pushsubscriptionchange', e => { e.waitUntil(rinnova().catch(() => {})); });
self.addEventListener('periodicsync', e => { if (e.tag === 'rinnova-notifiche') e.waitUntil(rinnova().catch(() => {})); });
