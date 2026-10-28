// ============================================================================
// Eğitim Takip — bildirim çalışanı (Aşama 34)
// Yalnızca telefon / bilgisayar bildirimlerini gösterir ve bildirime dokununca uygulamayı açar.
// Sayfaları önbelleğe ALMAZ (fetch olayı yok): site her zaman sunucudaki güncel sürümle açılır.
// ============================================================================

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Eğitim Takip', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Eğitim Takip';
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
