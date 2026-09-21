// Cache "network first" sui dati: online mostra i dati freschi, offline l'ultima copia.
const CACHE = 'volley-v4';
const SHELL = ['./', 'index.html', 'manifest.webmanifest'];
const CONTO = 'volley-conto';   // quante notifiche non hai ancora guardato

async function leggiConto() {
  try {
    const c = await caches.open(CONTO);
    const r = await c.match('conto');
    return r ? (Number(await r.text()) || 0) : 0;
  } catch (e) { return 0; }
}
async function scriviConto(n) {
  try { (await caches.open(CONTO)).put('conto', new Response(String(n))); } catch (e) {}
}
async function pallino(n) {
  try { await self.navigator.setAppBadge?.(n); } catch (e) {}
}
async function azzera() {
  await scriviConto(0);
  try { await self.navigator.clearAppBadge?.(); } catch (e) {}
}

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks =>
    Promise.all(ks.filter(k => k !== CACHE && k !== CONTO).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});

/* --- notifiche ---------------------------------------------------------
   La spinta che arriva dal servizio non porta testo: il messaggio sta in
   notifica.json, che l'automazione pubblica insieme ai dati. Cosi' non
   serve cifrare niente e il contenuto e' sempre l'ultimo disponibile. */
self.addEventListener('push', e => {
  e.waitUntil((async () => {
    let n = { titolo: 'Martesana Volley', testo: 'Ci sono novità.', tag: 'volley' };
    try {
      const r = await fetch('notifica.json?t=' + Date.now(), { cache: 'no-store' });
      if (r.ok) n = { ...n, ...(await r.json()) };
    } catch (err) { /* senza rete mostro il messaggio generico */ }
    await self.registration.showNotification(n.titolo, {
      body: n.testo,
      icon: 'icon-180.png',
      badge: 'icon-180.png',
      tag: n.tag || 'volley',
      renotify: true,
      data: { url: './' },
    });
    const conto = await leggiConto() + 1;
    await scriviConto(conto);
    await pallino(conto);
  })());
});

self.addEventListener('message', e => {
  if (e.data === 'azzera') e.waitUntil(azzera());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil((async () => {
    await azzera();
    const aperte = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of aperte) if ('focus' in c) return c.focus();
    if (self.clients.openWindow) return self.clients.openWindow(e.notification.data?.url || './');
  })());
});
