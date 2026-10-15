// ============================================================================
// TELEFON BİLDİRİMLERİ — /api/push (Aşama 34)
//
//  GET  /api/push?action=key            -> { publicKey }  (tarayıcının abone olması için ortak anahtar; gizli değildir)
//  GET  /api/push?task=tick             -> zamanlanmış hatırlatmalar (yalnızca CRON_SECRET ile; Supabase her 10 dk çağırır)
//  POST /api/push { action: 'subscribe', subscription }   -> bu cihazı oturumdaki kullanıcıya bağlar
//  POST /api/push { action: 'unsubscribe', endpoint }     -> bu cihazın bildirimini kapatır
//  POST /api/push { action: 'test' }                      -> kendi cihaz(lar)ına deneme bildirimi
//  POST /api/push { action: 'notify', event, ... }        -> anlık bildirim (yeni ödev, duyuru/not, cevap, öğrenci mesajı)
//
// POST istekleri giriş yapmış kullanıcının oturum anahtarıyla gelir (Authorization: Bearer …).
// Ayrıntılar ve ortam değişkenleri: server/pushCore.js
// ============================================================================
import crypto from 'node:crypto';
import {
  HttpError,
  pushEnv,
  pushConfigured,
  rest,
  sendToUsers,
  runPushTick,
  notifyHomeworkCreated,
  notifyAnnouncement,
  notifyMessageReply,
  notifyMessageNew,
} from '../server/pushCore.js';

export const config = { maxDuration: 30 };
const TIME_BUDGET_MS = 22000;
const HEAD_ADMIN_EMAIL = 'm.bilirr@gmail.com';

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

async function getAuthUser(token) {
  const e = pushEnv();
  const r = await fetch(`${e.url}/auth/v1/user`, { headers: { apikey: e.anon, Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  return r.json();
}

// Çağıran: öğretmen mi öğrenci mi (veritabanından)
async function getCaller(req) {
  if (!pushEnv().service) throw new HttpError(503, 'Sunucu ayarları eksik (SUPABASE_SERVICE_ROLE_KEY).');
  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) throw new HttpError(401, 'Oturum bulunamadı. Lütfen yeniden giriş yapın.');
  const user = await getAuthUser(token);
  if (!user || !user.id) throw new HttpError(401, 'Oturum süresi dolmuş. Lütfen yeniden giriş yapın.');
  const t = await rest(`teachers?select=id,name,status,is_admin&auth_user_id=eq.${user.id}`, { token: 'service' });
  if (t && t[0]) {
    if (t[0].status && t[0].status !== 'approved') throw new HttpError(403, 'Öğretmen hesabınız onaylı değil.');
    return {
      token,
      authId: user.id,
      role: 'teacher',
      teacherId: t[0].id,
      name: t[0].name || 'Öğretmen',
      isAdmin: (user.email || '').toLowerCase() === HEAD_ADMIN_EMAIL || !!t[0].is_admin,
    };
  }
  const s = await rest(`students?select=id,name,status&auth_user_id=eq.${user.id}`, { token: 'service' });
  if (s && s[0]) {
    if (s[0].status && s[0].status !== 'active') throw new HttpError(403, 'Öğrenci hesabı aktif değil.');
    return { token, authId: user.id, role: 'student', studentId: s[0].id, name: s[0].name || 'Öğrenci', isAdmin: false };
  }
  // Genel yönetici öğretmen tablosunda olmayabilir
  if ((user.email || '').toLowerCase() === HEAD_ADMIN_EMAIL) return { token, authId: user.id, role: 'teacher', teacherId: null, name: 'Yönetici', isAdmin: true };
  throw new HttpError(403, 'Hesap bulunamadı.');
}

function cleanSubscription(sub) {
  const endpoint = sub && typeof sub.endpoint === 'string' ? sub.endpoint : '';
  const keys = (sub && sub.keys) || {};
  if (!/^https:\/\/[^\s]{10,800}$/.test(endpoint)) throw new HttpError(400, 'Geçersiz abonelik.');
  if (typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string' || keys.p256dh.length > 200 || keys.auth.length > 100)
    throw new HttpError(400, 'Geçersiz abonelik anahtarı.');
  return { endpoint, p256dh: keys.p256dh, auth: keys.auth };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const deadline = Date.now() + TIME_BUDGET_MS;
  try {
    if (req.method === 'OPTIONS') return res.status(204).end();
    const q = (req.query && Object.keys(req.query).length ? req.query : Object.fromEntries(new URL(req.url, 'http://x').searchParams)) || {};

    if (req.method === 'GET') {
      if (q.action === 'key') {
        const e = pushEnv();
        return res.status(200).json({ ok: true, configured: pushConfigured(), publicKey: e.vapidPublic || null });
      }
      if (q.task === 'tick') {
        const e = pushEnv();
        if (!e.cronSecret) return res.status(503).json({ ok: false, error: 'CRON_SECRET tanımlı değil' });
        if (!safeEqual(String(req.headers.authorization || ''), `Bearer ${e.cronSecret}`)) return res.status(401).json({ ok: false, error: 'Yetkisiz' });
        const r = await runPushTick(deadline);
        return res.status(200).json(r);
      }
      return res.status(200).json({ ok: true, service: 'push' });
    }
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Desteklenmeyen istek' });

    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }
    body = body && typeof body === 'object' ? body : {};
    if (!pushConfigured()) return res.status(200).json({ ok: false, notConfigured: true, error: 'Telefon bildirimleri sunucuda henüz ayarlanmamış (VAPID anahtarları eksik).' });

    const caller = await getCaller(req);
    let result;
    switch (body.action) {
      case 'subscribe': {
        const s = cleanSubscription(body.subscription);
        // Aynı cihaz başka bir hesapla açılırsa cihaz yeni hesaba geçer (endpoint birincil anahtar)
        await rest('push_subscriptions?on_conflict=endpoint', {
          token: 'service',
          method: 'POST',
          body: [
            {
              endpoint: s.endpoint,
              p256dh: s.p256dh,
              auth: s.auth,
              user_id: caller.authId,
              role: caller.role,
              user_agent: String(req.headers['user-agent'] || '').slice(0, 300),
              updated_at: new Date().toISOString(),
            },
          ],
          prefer: 'resolution=merge-duplicates,return=minimal',
        });
        result = { ok: true, role: caller.role };
        break;
      }
      case 'unsubscribe': {
        const endpoint = typeof body.endpoint === 'string' ? body.endpoint : '';
        if (endpoint) {
          await rest(`push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}&user_id=eq.${caller.authId}`, { token: 'service', method: 'DELETE' });
        }
        result = { ok: true };
        break;
      }
      case 'test': {
        const r = await sendToUsers([caller.authId], {
          title: 'Bildirimler açık ✓',
          body: `${caller.name}, bu cihaza Eğitim Takip bildirimleri gelecek.`,
          url: caller.role === 'teacher' ? '/#/teacher/home' : '/#/student',
          tag: 'test',
        });
        result = { ok: r.sent > 0, ...r };
        break;
      }
      case 'notify': {
        switch (body.event) {
          case 'homework-created':
            result = await notifyHomeworkCreated(caller, body, deadline);
            break;
          case 'announcement':
            result = await notifyAnnouncement(caller, body, deadline);
            break;
          case 'message-reply':
            result = await notifyMessageReply(caller, body, deadline);
            break;
          case 'message-new':
            result = await notifyMessageNew(caller, body, deadline);
            break;
          default:
            throw new HttpError(400, 'Bilinmeyen bildirim türü.');
        }
        result = { ok: true, ...result };
        break;
      }
      default:
        throw new HttpError(400, 'Bilinmeyen işlem.');
    }
    return res.status(200).json(result);
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    if (status >= 500) console.error('[push]', err && err.stack ? err.stack : err);
    return res.status(status).json({ ok: false, error: err instanceof HttpError ? err.message : 'Beklenmeyen bir sunucu hatası oluştu.' });
  }
}
