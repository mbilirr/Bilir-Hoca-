// ============================================================================
// biliredu — bildirim çalışanı (Aşama 34)
// Yalnızca telefon / bilgisayar bildirimlerini gösterir ve bildirime dokununca uygulamayı açar.
// Sayfaları (index.html) önbelleğe ALMAZ: site her zaman sunucudaki güncel sürümle açılır.
// Aşama 124: YALNIZ /assets/ altındaki sürüm adlı dosyalar (adlarında içerik özeti var, hiç değişmez)
// cihazda tutulur; tekrar açılışta JS / CSS ağdan inmez. Yeni sürümde dosya adları değiştiği için
// eski dosya asla gösterilmez. En fazla 160 dosya tutulur (eskiler silinir).
// ============================================================================

const ASSET_CACHE = 'biliredu-assets-v1';
const ASSET_MAX = 160;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) =>
  event.waitUntil(
    (async () => {
      try {
        const names = await caches.keys();
        await Promise.all(names.filter((n) => n.startsWith('biliredu-assets-') && n !== ASSET_CACHE).map((n) => caches.delete(n)));
      } catch {
        /* önbellek kullanılamıyor: normal ağdan devam */
      }
      await self.clients.claim();
    })()
  )
);

async function trimAssetCache(cache) {
  try {
    const keys = await cache.keys();
    for (let i = 0; i < keys.length - ASSET_MAX; i++) await cache.delete(keys[i]);
  } catch {
    /* sorun değil */
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin || !url.pathname.startsWith('/assets/')) return;
  event.respondWith(
    (async () => {
      let cache = null;
      try {
        cache = await caches.open(ASSET_CACHE);
        const hit = await cache.match(req);
        if (hit) return hit;
      } catch {
        cache = null;
      }
      const res = await fetch(req);
      if (cache && res && res.ok && res.type === 'basic') {
        const copy = res.clone();
        event.waitUntil(cache.put(req, copy).then(() => trimAssetCache(cache)).catch(() => {}));
      }
      return res;
    })()
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'biliredu', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'biliredu';
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || undefined,
    renotify: !!data.tag,
    data: { url: data.url || '/' },
    lang: 'tr',
  };
  // Aşama 99: bilgisayarda (etüt yoklama dahil) bildirim 15 sn ekranda kalır, sonra kapanır.
  // Telefonda bildirim çubuğunda kalmaya devam eder (kapatılmaz).
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test((self.navigator && self.navigator.userAgent) || '');
  if (!mobile) options.requireInteraction = true;
  event.waitUntil(
    self.registration.showNotification(title, options).then(async () => {
      if (mobile) return;
      await new Promise((r) => setTimeout(r, 15000));
      const list = await self.registration.getNotifications(options.tag ? { tag: options.tag } : undefined);
      for (const n of list) if (n.title === title && n.body === options.body) n.close();
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of list) {
        if (new URL(c.url).origin === self.location.origin && 'focus' in c) {
          try {
            await c.navigate(target);
          } catch {
            /* bazı tarayıcılar navigate'e izin vermez; yalnızca öne getirilir */
          }
          return c.focus();
        }
      }
      return self.clients.openWindow(target);
    })()
  );
});
