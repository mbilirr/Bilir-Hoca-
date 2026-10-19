// ============================================================================
// TC KİMLİK PARMAK İZİ SERVİSİ (Aşama 50) — Vercel sunucu fonksiyonu: /api/tc
//
// Amaç: Deneme optiklerini öğrencilerle eşleştirirken TC kimlik numarasından yararlanmak, ama TC'nin
// KENDİSİNİ hiçbir yerde saklamamak.
//
// Nasıl çalışır:
//   - Tarayıcı, Excel'deki ya da optik dosyasındaki TC numaralarını bu servise (HTTPS ile) gönderir.
//   - Servis her TC'yi doğrular (11 hane + resmî kontrol haneleri) ve yalnızca sunucuda duran gizli
//     anahtarla geri çevrilemez bir "parmak izi" üretir (HMAC-SHA256). TC'yi kaydetmez, günlüğe yazmaz.
//   - Veritabanında yalnızca parmak izi durur (students.tc_hash). Gizli anahtar olmadan parmak izinden
//     TC bulunamaz; veritabanı ele geçse bile TC'ler okunamaz.
//
// Yetki: Yalnızca Deneme Analizi'ni kullanabilen kişiler (deneme_can_manage) çağırabilir.
//
// Vercel ortam değişkeni (Settings > Environment Variables):
//   TC_HASH_SECRET : en az 32 karakterlik rastgele bir metin. BİR KEZ belirlenir, sonra DEĞİŞTİRİLMEZ
//                    (değişirse kayıtlı parmak izleri eşleşmez; TC'lerin yeniden yüklenmesi gerekir).
// Hiçbir ek paket gerektirmez.
// ============================================================================
import { createHmac } from 'node:crypto';

export const config = { maxDuration: 20 };

const DEFAULT_SUPABASE_URL = 'https://zzdchsxfjzedgciejuxd.supabase.co';
const MAX_ITEMS = 3000;
const PER_MINUTE_LIMIT = 30;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function env() {
  return {
    url: (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/+$/, ''),
    anon: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '',
    secret: String(process.env.TC_HASH_SECRET || ''),
  };
}

async function getCaller(req) {
  const e = env();
  if (!e.anon) throw new HttpError(503, 'Sunucu ayarları eksik (VITE_SUPABASE_ANON_KEY).');
  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) throw new HttpError(401, 'Oturum bulunamadı. Lütfen yeniden giriş yapın.');
  const ur = await fetch(`${e.url}/auth/v1/user`, { headers: { apikey: e.anon, Authorization: `Bearer ${token}` } });
  if (!ur.ok) throw new HttpError(401, 'Oturum süresi dolmuş. Lütfen yeniden giriş yapın.');
  const user = await ur.json();
  if (!user || !user.id) throw new HttpError(401, 'Oturum süresi dolmuş. Lütfen yeniden giriş yapın.');
  const cr = await fetch(`${e.url}/rest/v1/rpc/deneme_can_manage`, {
    method: 'POST',
    headers: { apikey: e.anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  let can = false;
  try {
    can = cr.ok && (await cr.json()) === true;
  } catch {
    can = false;
  }
  if (!can) throw new HttpError(403, 'Bu işlem için Deneme Analizi yetkiniz yok.');
  return { id: user.id };
}

const hits = new Map();
function rateLimit(userId) {
  const now = Date.now();
  const list = (hits.get(userId) || []).filter((t) => now - t < 60000);
  if (list.length >= PER_MINUTE_LIMIT) throw new HttpError(429, 'Çok hızlı istek gönderildi. Bir dakika bekleyip tekrar deneyin.');
  list.push(now);
  hits.set(userId, list);
  if (hits.size > 500) for (const k of hits.keys()) if (k !== userId) hits.delete(k);
}

/** Resmî TC kimlik numarası kuralı: 11 hane, ilk hane 0 değil, 10. ve 11. haneler kontrol hanesi */
function validTc(v) {
  const s = String(v || '').replace(/\D/g, '');
  if (!/^[1-9]\d{10}$/.test(s)) return '';
  const d = s.split('').map(Number);
  const odd = d[0] + d[2] + d[4] + d[6] + d[8];
  const even = d[1] + d[3] + d[5] + d[7];
  const d10 = (((odd * 7 - even) % 10) + 10) % 10;
  if (d10 !== d[9]) return '';
  const d11 = d.slice(0, 10).reduce((a, b) => a + b, 0) % 10;
  if (d11 !== d[10]) return '';
  return s;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Yalnızca POST.');
    const e = env();
    if (e.secret.length < 32) throw new HttpError(503, 'TC eşleştirmesi ayarlı değil (Vercel > TC_HASH_SECRET en az 32 karakter olmalı).');
    const caller = await getCaller(req);
    rateLimit(caller.id);
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const list = Array.isArray(body.tcs) ? body.tcs.slice(0, MAX_ITEMS) : [];
    // Her TC için parmak izi; geçersiz TC için null. TC'ler hiçbir yere yazılmaz.
    const hashes = list.map((v) => {
      const tc = validTc(v);
      return tc ? createHmac('sha256', e.secret).update(`tc:${tc}`).digest('hex').slice(0, 40) : null;
    });
    return res.status(200).json({ ok: true, hashes });
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    // Güvenlik: hata günlüğüne istek gövdesi (TC'ler) YAZILMAZ
    if (!(err instanceof HttpError)) console.error('[tc] beklenmeyen hata', err && err.name);
    return res.status(status).json({ ok: false, error: err instanceof HttpError ? err.message : 'Beklenmeyen bir sunucu hatası oluştu.' });
  }
}
