import { supabase } from './supabase';

// ============================================================================
// TELEFON BİLDİRİMLERİ — tarayıcı tarafı (Aşama 34)
// Kullanıcı "Bildirimleri aç" dediğinde: izin istenir → /sw.js kaydedilir → tarayıcıdan bildirim adresi alınır →
// sunucuya (/api/push) bu cihazın oturumdaki kullanıcıya bağlanması bildirilir.
// Uygulama kaydı yaptıktan sonra notifyPush(...) ile "ne oldu" bilgisini gönderir; alıcıları sunucu bulur.
// ============================================================================

export type PushState =
  | 'unsupported' // tarayıcı bildirimi desteklemiyor
  | 'ios-install' // iPhone/iPad: önce Safari > Paylaş > Ana Ekrana Ekle gerekiyor
  | 'not-configured' // sunucuda anahtarlar henüz tanımlı değil
  | 'denied' // kullanıcı izin vermedi (telefon ayarlarından açılmalı)
  | 'off' // destekleniyor, bu cihazda kapalı
  | 'on'; // bu cihazda açık

export type PushEvent = 'homework-created' | 'announcement' | 'message-reply' | 'message-new' | 'praise';

const isIos = () =>
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1));
const isStandalone = () =>
  typeof window !== 'undefined' &&
  ((window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || (navigator as any).standalone === true);

const supported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

async function accessToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || null;
  } catch {
    return null;
  }
}

async function post(body: Record<string, any>): Promise<any> {
  const token = await accessToken();
  if (!token) return { ok: false, error: 'Oturum bulunamadı.' };
  try {
    const r = await fetch('/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    return await r.json().catch(() => ({ ok: false }));
  } catch {
    return { ok: false, error: 'Bağlantı sorunu.' };
  }
}

let keyCache: { configured: boolean; publicKey: string | null } | null = null;
async function serverKey(): Promise<{ configured: boolean; publicKey: string | null }> {
  if (keyCache) return keyCache;
  try {
    const r = await fetch('/api/push?action=key', { cache: 'no-store' });
    const j = await r.json();
    keyCache = { configured: !!(j && j.configured && j.publicKey), publicKey: (j && j.publicKey) || null };
  } catch {
    keyCache = { configured: false, publicKey: null };
  }
  return keyCache;
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (existing) return existing;
  return navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

/** Bu cihazdaki bildirim durumu */
export async function getPushState(): Promise<PushState> {
  if (isIos() && !isStandalone()) return 'ios-install';
  if (!supported()) return 'unsupported';
  const key = await serverKey();
  if (!key.configured) return 'not-configured';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') return 'off';
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    return sub ? 'on' : 'off';
  } catch {
    return 'off';
  }
}

/** Bildirimleri aç (kullanıcı düğmeye bastığında çağrılmalı: tarayıcı izni yalnızca dokunuşla ister) */
export async function enablePush(): Promise<{ ok: boolean; error?: string }> {
  if (!supported()) return { ok: false, error: 'Bu tarayıcı bildirimleri desteklemiyor.' };
  const key = await serverKey();
  if (!key.configured || !key.publicKey) return { ok: false, error: 'Bildirimler sunucuda henüz ayarlanmamış.' };
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return { ok: false, error: 'Bildirim izni verilmedi.' };
  try {
    const reg = await registration();
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key.publicKey).buffer as ArrayBuffer });
    }
    const r = await post({ action: 'subscribe', subscription: sub.toJSON() });
    return r && r.ok ? { ok: true } : { ok: false, error: (r && r.error) || 'Abonelik kaydedilemedi.' };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Bildirim açılamadı.' };
  }
}

/** Bu cihazda bildirimleri kapat */
export async function disablePush(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub) {
      await post({ action: 'unsubscribe', endpoint: sub.endpoint });
      await sub.unsubscribe();
    }
  } catch {
    /* sessizce geç */
  }
}

/**
 * Uygulama açılınca: bildirim zaten açıksa cihazı OTURUMDAKİ kullanıcıya yeniden bağlar
 * (aynı telefonda başka hesapla giriş yapıldıysa bildirimler yeni hesaba gider).
 */
export async function resyncPush(): Promise<void> {
  try {
    if (!supported() || Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub) await post({ action: 'subscribe', subscription: sub.toJSON() });
  } catch {
    /* sessizce geç */
  }
}

/** Deneme bildirimi (bu kullanıcının bütün cihazlarına) */
export async function testPush(): Promise<{ ok: boolean; error?: string }> {
  const r = await post({ action: 'test' });
  return r && r.ok ? { ok: true } : { ok: false, error: (r && r.error) || 'Deneme bildirimi gönderilemedi.' };
}

/** Anlık bildirim isteği (kayıt BAŞARIYLA yapıldıktan sonra çağrılır; hata kullanıcıya gösterilmez) */
export function notifyPush(event: PushEvent, payload: Record<string, string>): void {
  void post({ action: 'notify', event, ...payload }).catch(() => undefined);
}
