// Cache "network first" sui dati: online mostra i dati freschi, offline l'ultima copia.
const CACHE = 'volley-v2';
const SHELL = ['./', 'index.html', 'manifest.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks =>
    Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
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
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil((async () => {
    const aperte = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of aperte) if ('focus' in c) return c.focus();
    if (self.clients.openWindow) return self.clients.openWindow(e.notification.data?.url || './');
  })());
});
