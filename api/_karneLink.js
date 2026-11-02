// ============================================================================
// Aşama 101: KARNE LİNKİ — sunucu tarafı yardımcıları (api/mail.js kullanır)
// Adı "_" ile başladığı için Vercel bunu ayrı bir adres olarak yayınlamaz; yalnızca içe aktarılır.
//   * Link kodu, link kaydının kimliğinden gizli anahtarla türetilir (HMAC): aynı link aynı kodu verir,
//     veritabanında yalnızca kodun sha256 özeti tutulur; kod tahmin edilemez (128 bit).
//   * PDF'ler Supabase Storage'ın gizli "karneler" deposunda; link açılınca 60 sn geçerli imzalı adrese yönlendirilir.
//   * SMS metninde ad, numara, puan yazmaz.
// ============================================================================
import crypto from 'node:crypto';

export const KARNE_LINK_DAYS = 30;
export const KARNE_SIGN_SECONDS = 60;
export const KARNE_BUCKET = 'karneler';

const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Gizli anahtar (sunucu ortam değişkeninden türetilir; ayrı bir değişken gerekmez) */
export function linkKey(secretBase) {
  if (!secretBase) throw new Error('karne linki anahtarı yok');
  return crypto.createHash('sha256').update(`karne-link:${secretBase}`).digest();
}
export function linkToken(key, linkId) {
  return b64u(crypto.createHmac('sha256', key).update(String(linkId)).digest()).slice(0, 22);
}
export function hashToken(t) {
  return crypto.createHash('sha256').update(String(t)).digest('hex');
}
export function isTokenShape(t) {
  return typeof t === 'string' && /^[A-Za-z0-9_-]{22}$/.test(t);
}
/** Deneme kümesinin kısa özeti (sıra önemsiz) */
export function examKey(examIds) {
  const ids = (Array.isArray(examIds) ? examIds : []).map(String).filter(Boolean).sort();
  return crypto.createHash('sha256').update(ids.join(',')).digest('hex').slice(0, 32);
}

/**
 * Aşama 137: SMS metni — başta uygulama adı yok; tek denemede "'Ad (Yayınevi)'", birden çokta "son N" (metin: "son 3 deneme karnesi").
 * Ad 32 karakterle sınırlı: link ile birlikte tek SMS'e (≈155 Türkçe karakter) sığar.
 */
export function karneDenemeEtiketi(exams, count) {
  const n = Math.max(1, Number(count) || 0);
  if (n > 1) return `son ${n}`; // "son 3 deneme karnesi" 
  const ex = (Array.isArray(exams) ? exams : [])[0] || {};
  const name = String(ex.name || '').replace(/\s+/g, ' ').trim();
  const pub = String(ex.publisher || '').replace(/\s+/g, ' ').trim();
  let label = name;
  if (pub && !name.toLocaleLowerCase('tr').includes(pub.toLocaleLowerCase('tr'))) label = name ? `${name} (${pub})` : pub;
  label = label.replace(/'/g, '');
  if (label.length > 32) label = (label.slice(0, 33).replace(/\s+\S*$/, '') || label.slice(0, 32)).trim(); // kelime ortasında kesmez
  return label ? `'${label}'` : '';
}
export function karneSmsText(role, link, etiket) {
  const et = String(etiket || '').trim();
  if (role === 'veli') return `Değerli velimiz, öğrencimizin ${et ? `${et} ` : ''}deneme karnesi hazır: ${link} Hayırlı günler.`;
  return `Sevgili öğrencimiz, ${et ? `${et} ` : ''}deneme karnen hazır: ${link} Başarılar.`;
}

// ----------------------------------------------------------------------------- Supabase Storage (service_role)
function storageHeaders(e, extra = {}) {
  // Yeni tip "sb_secret_..." anahtarı JWT değildir: yalnızca apikey başlığında gönderilir (rest() ile aynı kural)
  return { apikey: e.service, ...(e.service.startsWith('sb_') ? {} : { Authorization: `Bearer ${e.service}` }), ...extra };
}
async function storageFail(r, what) {
  const text = await r.text().catch(() => '');
  const err = new Error(`Depo isteği başarısız (${what}, ${r.status}): ${text}`.slice(0, 300));
  err.status = r.status;
  return err;
}
const objUrl = (e, path) => `${e.url}/storage/v1/object/${KARNE_BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`;

export async function storagePut(e, path, buf) {
  const r = await fetch(objUrl(e, path), { method: 'POST', headers: storageHeaders(e, { 'Content-Type': 'application/pdf', 'x-upsert': 'true' }), body: buf });
  if (!r.ok) throw await storageFail(r, 'yükleme');
}
export async function storageSign(e, path, seconds = KARNE_SIGN_SECONDS) {
  const r = await fetch(`${e.url}/storage/v1/object/sign/${KARNE_BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'POST',
    headers: storageHeaders(e, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ expiresIn: seconds }),
  });
  if (!r.ok) throw await storageFail(r, 'imza');
  const d = await r.json();
  const rel = String((d && (d.signedURL || d.signedUrl)) || '');
  if (!rel) throw new Error('Depo imzalı adres vermedi');
  return rel.startsWith('http') ? rel : `${e.url}/storage/v1${rel.startsWith('/') ? '' : '/'}${rel}`;
}
export async function storageRemove(e, paths) {
  const list = (paths || []).filter(Boolean);
  if (!list.length) return;
  const r = await fetch(`${e.url}/storage/v1/object/${KARNE_BUCKET}`, {
    method: 'DELETE',
    headers: storageHeaders(e, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ prefixes: list }),
  });
  if (!r.ok) throw await storageFail(r, 'silme');
}

/** Süresi dolmuş / iptal edilmiş link sayfası (dış kaynak yok) */
export function expiredPage(appName) {
  const name = String(appName || 'BilirEdu').replace(/[<>&"]/g, '');
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${name} karne</title>
<style>body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f8fafc;color:#1e1b4b;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px}main{max-width:360px;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:20px;text-align:center}h1{font-size:16px;margin:0 0 8px}p{font-size:13px;color:#475569;margin:0;line-height:1.5}</style></head>
<body><main><h1>${name}</h1><p>Bu karne bağlantısının süresi doldu ya da bağlantı kapatıldı. Yeni karne için kurumunuza başvurun.</p></main></body></html>`;
}
