// ============================================================================
// Aşama 339: HATALI GİRİŞ KAYDI VE HESAP KİLİDİ (sunucu)
// Giriş ekranı Supabase'e doğrudan bağlanır; şifre bu adrese GELMEZ. Bu adres yalnız sonucu işler:
//   POST /api/giris { action: 'hata', tur: 'ogretmen'|'ogrenci', kimlik, robot? }   (oturumsuz)
//        -> hatalı deneme kaydedilir (IP, cihaz, saat). Aynı hesapta 15 dakikada 5 hata: hesap 15 dk kilitli,
//           kurum yöneticilerine (kurumsuz hesapta sistem sahibine) kilit başına BİR kez telefon bildirimi + SMS.
//           Bildirim / SMS, Yönetim > Genel > Giriş güvenliği anahtarlarına uyar (varsayılan ikisi de açık).
//   POST /api/giris { action: 'basari' }  (Authorization: Bearer <yeni oturum>)
//        -> şifre doğruysa: kilit sürüyorsa { kilitli: true } (istemci oturumu kapatır), değilse sayaç sıfırlanır.
// Güvenlik:
//   * Veritabanına yalnız service_role yazar (sql/339). Aynı IP'den 10 dakikada en çok 200 kayıt.
//   * Vercel'e TURNSTILE_SECRET_KEY girilirse (Cloudflare Turnstile gizli anahtarı) 'hata' isteği robot jetonu
//     olmadan kabul edilmez: başkası adına sahte "hatalı giriş" gönderip hesabı kilitlemek de robot doğrulaması ister.
//     Girilmezse yalnız IP sınırı geçerlidir.
//   * SMS'te ad, puan yok: yalnız kullanıcı adı / numara, saat ve site adresi.
// Ortam değişkenleri: mevcut SUPABASE_* , VAPID_* , SMS_* (yeni zorunlu ayar yok; TURNSTILE_SECRET_KEY isteğe bağlı).
// ============================================================================

import { pushEnv, sendToUsers } from './push.js';
import { dispatchSms } from './_sms.js';

const APP_URL = 'https://www.biliredu.com';

function serviceHeaders(e) {
  return {
    apikey: e.service,
    ...(e.service.startsWith('sb_') ? {} : { Authorization: `Bearer ${e.service}` }),
    'Content-Type': 'application/json',
  };
}

async function readJson(r) {
  const text = await r.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

async function rpc(e, name, args) {
  const r = await fetch(`${e.url}/rest/v1/rpc/${name}`, { method: 'POST', headers: serviceHeaders(e), body: JSON.stringify(args) });
  const data = await readJson(r);
  if (!r.ok) {
    const err = new Error(`rpc ${name} ${r.status}`);
    err.status = r.status;
    throw err;
  }
  return data;
}

// dispatchSms'in beklediği REST yardımcısı (api/push.js rest ile aynı imza; yalnız service)
function smsRest(e) {
  return async (path, { method = 'GET', body, prefer } = {}) => {
    const headers = serviceHeaders(e);
    if (prefer) headers.Prefer = prefer;
    const r = await fetch(`${e.url}/rest/v1/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await readJson(r);
    if (!r.ok) throw new Error(`Veritabanı isteği başarısız (${r.status})`);
    return data;
  };
}

// İstemcideki girisYardimci.ts ile AYNI kural (trLoginFold + canonicalAuthEmail)
function trFold(v) {
  return String(v || '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıöşüâîû]/g, (c) => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' })[c] || c)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}
function sistemAdresi(tur, kimlik) {
  const clean = String(kimlik || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  return `${tur === 'ogretmen' ? 'tch' : 'std'}_${clean || 'user'}@okul.internal.net`;
}
function adresler(tur, kimlik) {
  const term = String(kimlik || '').trim().toLowerCase();
  if (term.includes('@')) return [term];
  return Array.from(new Set([sistemAdresi(tur, trFold(kimlik)), sistemAdresi(tur, term)]));
}

function istemciIp(req) {
  const real = String(req.headers['x-real-ip'] || '').trim();
  if (real) return real.slice(0, 64);
  return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim().slice(0, 64);
}

async function robotGecerli(token, ip) {
  const secret = String(process.env.TURNSTILE_SECRET_KEY || '').trim();
  if (!secret) return true; // anahtar girilmemiş: yalnız IP sınırı
  if (typeof token !== 'string' || !token || token.length > 4096) return false;
  try {
    const form = new URLSearchParams({ secret, response: token });
    if (ip) form.set('remoteip', ip);
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
    const d = await readJson(r);
    return !!(d && d.success);
  } catch {
    return false;
  }
}

function saat() {
  return new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' }).format(new Date());
}

// Kilit yeni düştü: yöneticilere bildirim + SMS (her biri kilit başına bir kez)
async function yoneticilereBildir(e, k) {
  const alicilar = Array.isArray(k.alicilar) ? k.alicilar : [];
  if (!alicilar.length) return;
  const kim = `${k.tur === 'ogrenci' ? 'Öğrenci' : 'Öğretmen'} hesabı "${String(k.kimlik || '').slice(0, 40)}"`;
  const metin = `${kim}: 5 hatalı giriş denemesi (${saat()}). Hesap 15 dakika kilitlendi.`;
  const isler = [];
  if (k.bildirim) {
    const uids = alicilar.map((a) => a && a.uid).filter((x) => typeof x === 'string' && x);
    isler.push(
      sendToUsers(uids, { title: 'Hatalı giriş uyarısı', body: metin, url: '/#yonetim', tag: `giris-kilit-${k.kilit_id}` }, { dedupe: `giris-kilit:${k.kilit_id}`, deadline: Date.now() + 8000 }).catch(
        (err) => console.error('[giris] bildirim', err && err.message)
      )
    );
  }
  if (k.sms) {
    const jobs = alicilar
      .filter((a) => a && a.tel)
      .map((a) => ({ event: 'giris-kilit', refId: String(k.kilit_id), role: 'ogretmen', phone: a.tel, text: `Güvenlik uyarısı: ${metin} ${APP_URL}`, once: true }));
    if (jobs.length) isler.push(dispatchSms(smsRest(e), jobs).catch((err) => console.error('[giris] sms', err && err.message)));
  }
  await Promise.all(isler);
}

async function actionHata(e, req, body) {
  const tur = body.tur === 'ogrenci' ? 'ogrenci' : body.tur === 'ogretmen' ? 'ogretmen' : '';
  const kimlik = String(body.kimlik || '').trim().slice(0, 80);
  if (!tur || !kimlik) return { status: 400, json: { ok: false, error: 'Eksik bilgi.' } };
  const ip = istemciIp(req);
  if (!(await robotGecerli(body.robot, ip))) return { status: 400, json: { ok: false, error: 'Robot doğrulaması geçmedi.' } };
  const k = await rpc(e, 'giris_hata_kaydet', {
    p_tur: tur,
    p_kimlik: kimlik,
    p_emails: adresler(tur, kimlik),
    p_ip: ip || null,
    p_cihaz: String(req.headers['user-agent'] || '').slice(0, 160) || null,
  });
  if (k && k.yeni_kilit) await yoneticilereBildir(e, k);
  return { status: 200, json: { ok: true, kilitli: !!(k && k.kilitli), dakika: (k && k.dakika) || 0 } };
}

async function actionBasari(e, req) {
  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return { status: 401, json: { ok: false, error: 'Oturum yok.' } };
  const ur = await fetch(`${e.url}/auth/v1/user`, { headers: { apikey: e.anon || e.service, Authorization: `Bearer ${token}` } });
  const user = ur.ok ? await readJson(ur) : null;
  if (!user || !user.id) return { status: 401, json: { ok: false, error: 'Oturum geçersiz.' } };
  const d = await rpc(e, 'giris_basari', { p_uid: user.id });
  return { status: 200, json: { ok: true, kilitli: !!(d && d.kilitli), dakika: (d && d.dakika) || 0 } };
}

export const config = { maxDuration: 15 };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Yalnızca POST.' });
  try {
    const e = pushEnv();
    if (!e.service) return res.status(503).json({ ok: false, error: 'Sunucu ayarı eksik.' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const r = body.action === 'hata' ? await actionHata(e, req, body) : body.action === 'basari' ? await actionBasari(e, req) : { status: 400, json: { ok: false, error: 'Bilinmeyen işlem.' } };
    return res.status(r.status).json(r.json);
  } catch (err) {
    // SQL 339 kurulu değilse (404) giriş etkilenmez: istemci kilit yok sayar
    console.error('[giris]', err && err.message);
    return res.status(err && err.status === 404 ? 501 : 500).json({ ok: false, error: 'Giriş kaydı yapılamadı.' });
  }
}
