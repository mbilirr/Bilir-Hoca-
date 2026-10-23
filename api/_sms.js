// ============================================================================
// Aşama 73/78: SMS (Gold Mesaj, Netgsm veya İleti Merkezi) — sunucu tarafı, api/mail.js kullanır.
// Adı "_" ile başladığı için Vercel bunu ayrı bir adres olarak yayınlamaz.
//
// Vercel › Settings › Environment Variables:
//   SMS_PROVIDER        goldmesaj | netgsm | iletimerkezi
//   SMS_SENDER          onaylı gönderici başlığı (ör. BILIREDU)
//   SMS_MODE            live  → gerçek gönderim. Başka her değer (ya da boş) = DENEME MODU: SMS gitmez, yalnızca kayıt tutulur.
//   SMS_DAILY_LIMIT     günde en çok kaç SMS (varsayılan 200)
//   Gold Mesaj:         GOLDMESAJ_USERNAME (API kullanıcı kodu), GOLDMESAJ_PASSWORD (API şifresi)
//   Netgsm:             NETGSM_USERCODE, NETGSM_PASSWORD
//   İleti Merkezi:      ILETIMERKEZI_KEY, ILETIMERKEZI_HASH  (panel › Ayarlar › API'de görünen anahtar ve hash)
//
// Kurallar:
//   * Mesajda öğrenci adı, not, puan gibi kişisel bilgi YAZILMAZ; kısa bir cümle ve sitenin bağlantısı yazılır.
//   * Aynı bilgi aynı numaraya iki kez gitmez (sms_log.dedupe_key benzersiz).
//   * Günlük sınır dolunca SMS gönderilmez, e-posta ve sistem çalışmaya devam eder.
//   * Sağlayıcı hata verirse (kontör bitti, başlık onaysız…) hata kaydedilir, hiçbir işlem durmaz.
//   * Kayıtta telefon numarasının yalnızca maskeli hâli (0532***4567) ve geri çevrilemez parmak izi tutulur.
// ============================================================================
import crypto from 'node:crypto';

const DEFAULT_APP_URL = 'https://biliredu.vercel.app';

export function smsEnv() {
  const provider = String(process.env.SMS_PROVIDER || '').trim().toLowerCase();
  return {
    provider: provider === 'goldmesaj' || provider === 'netgsm' || provider === 'iletimerkezi' ? provider : '',
    sender: String(process.env.SMS_SENDER || '').trim(),
    live: String(process.env.SMS_MODE || '').trim().toLowerCase() === 'live',
    dailyLimit: Math.max(1, Math.min(100000, Number(process.env.SMS_DAILY_LIMIT) || 200)),
    gmUser: String(process.env.GOLDMESAJ_USERNAME || '').trim(),
    gmPass: String(process.env.GOLDMESAJ_PASSWORD || '').trim(),
    netgsmUser: String(process.env.NETGSM_USERCODE || '').trim(),
    netgsmPass: String(process.env.NETGSM_PASSWORD || '').trim(),
    imKey: String(process.env.ILETIMERKEZI_KEY || '').trim(),
    imHash: String(process.env.ILETIMERKEZI_HASH || '').trim(),
    appName: String(process.env.SMS_APP_NAME || 'BilirEdu').trim().slice(0, 20),
  };
}

/** Sağlayıcı bilgileri eksiksiz mi */
export function smsConfigured(e = smsEnv()) {
  if (!e.provider || !e.sender) return false;
  if (e.provider === 'goldmesaj') return !!(e.gmUser && e.gmPass);
  if (e.provider === 'netgsm') return !!(e.netgsmUser && e.netgsmPass);
  return !!(e.imKey && e.imHash);
}

/** Türk cep numarası → "5XXXXXXXXX" (10 hane); geçersizse '' */
export function normPhone(v) {
  let d = String(v || '').replace(/\D+/g, '');
  if (d.startsWith('0090')) d = d.slice(4);
  else if (d.startsWith('90') && d.length === 12) d = d.slice(2);
  else if (d.startsWith('0') && d.length === 11) d = d.slice(1);
  return /^5\d{9}$/.test(d) ? d : '';
}
export const maskPhone = (p) => (p ? `0${p.slice(0, 3)}***${p.slice(-4)}` : '');
const phoneKey = (p) => crypto.createHash('sha256').update(`sms-tel:${p}`).digest('hex').slice(0, 24);

function istanbulDay() {
  return new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
}
function istanbulMidnightIso() {
  return new Date(`${istanbulDay()}T00:00:00+03:00`).toISOString();
}

async function fetchWithTimeout(url, opts, ms = 12000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

const NETGSM_ERRORS = {
  '20': 'Mesaj metni hatalı ya da çok uzun',
  '30': 'Kullanıcı adı / şifre hatalı ya da API erişimi kapalı (IP kısıtı olabilir)',
  '40': 'Gönderici başlığı tanımlı değil ya da onaysız',
  '50': 'Hesap İYS kontrollü gönderime uygun değil',
  '51': 'İYS marka bilgisi bulunamadı',
  '70': 'Hatalı istek (eksik ya da yanlış alan)',
  '80': 'Gönderim sınırı aşıldı',
  '85': 'Aynı numaraya kısa sürede çok fazla gönderim',
};
const IM_ERRORS = {
  '401': 'Anahtar / hash hatalı ya da IP kısıtı',
  '402': 'Yetersiz bakiye (kontör bitti)',
  '450': 'Gönderici başlığı kullanıma uygun değil',
  '451': 'Aynı mesaj 10 dakika içinde aynı numaralara gönderilmiş',
  '452': 'Alıcı numaraları hatalı',
  '453': 'Mesaj çok uzun',
  '454': 'Mesaj metni boş',
};

const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ----------------------------------------------------------------------------- Gold Mesaj (apiv3.goldmesaj.net)
// İstekler JSON; kullanıcı kodu ve şifre isteğin içinde gider (ayrı bir token gerekmez).
//   POST /api/sendSMS            { username, password, sdate:"", vperiod:"48", message:{ sender, text, utf8:"1", gsm:[...] } }
//   POST /api/kredi/get          { username, password }
//   POST /api/alfanumerik/getList { username, password }
// Cevap biçimi belgede yazmadığı için cevap TEMKİNLİ yorumlanır: açık bir başarı işareti yoksa SMS "doğrulanamadı"
// sayılır ve (şifresiz) ham cevap hata kaydına yazılır; böylece gerçek cevap görülüp kod kesinleştirilebilir.
const GOLD_BASE = 'https://apiv3.goldmesaj.net/api';
export const GOLD_BATCH = 50; // bir istekte en çok numara (sağlayıcının sınırı belgede yazmıyor; temkinli)

function goldSnippet(raw, e) {
  let t = String(raw || '').replace(/\s+/g, ' ').trim();
  for (const secret of [e.gmUser, e.gmPass]) if (secret && secret.length > 2) t = t.split(secret).join('***');
  return t.slice(0, 300);
}
async function goldPost(path, payload, e) {
  const res = await fetchWithTimeout(`${GOLD_BASE}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: e.gmUser, password: e.gmPass, ...payload }),
  });
  const raw = await res.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }
  return { status: res.status, httpOk: res.ok, raw: goldSnippet(raw, e), data };
}
// Boş değerler (null, '', [], {}) "yok" sayılır; böylece "errors": [] gibi boş alanlar hata sanılmaz
const goldHas = (v) =>
  v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0) && !(typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);
const goldPick = (o, keys) => {
  if (!o || typeof o !== 'object') return undefined;
  for (const k of keys) if (goldHas(o[k])) return o[k];
  return undefined;
};
/** Cevabı yorumlar: { verdict: 'ok' | 'fail' | 'unknown', id, message } */
function goldVerdict(r) {
  const d = r.data && typeof r.data === 'object' ? r.data : null;
  if (!r.httpOk) {
    const hint = r.status === 401 || r.status === 403 ? ' (kullanıcı kodu / şifre hatalı olabilir)' : '';
    return { verdict: 'fail', message: `HTTP ${r.status}${hint}` };
  }
  if (!d) return { verdict: 'unknown', message: 'cevap okunamadı' };
  const flags = [d.success, d.isSuccess, d.basarili, d.ok].filter((x) => x !== undefined);
  const word = String(goldPick(d, ['status', 'result', 'durum', 'sonuc']) ?? '').toLowerCase();
  const errVal = goldPick(d, ['error', 'hata', 'errors', 'errorMessage']);
  const msgVal = goldPick(d, ['message', 'mesaj', 'description', 'aciklama', 'detail']);
  if (flags.some((x) => x === false || String(x).toLowerCase() === 'false') || errVal || /^(error|fail|failed|hata|basarisiz|başarısız)/.test(word)) {
    return { verdict: 'fail', message: String(errVal && typeof errVal !== 'object' ? errVal : msgVal || 'sağlayıcı hata döndürdü').slice(0, 160) };
  }
  const nested = d.data && typeof d.data === 'object' ? d.data : null;
  const id = goldPick(d, ['bulkId', 'bulk_id', 'messageId', 'message_id', 'jobid', 'jobId', 'paketId', 'packageId', 'id']) ?? goldPick(nested, ['bulkId', 'bulk_id', 'messageId', 'jobid', 'jobId', 'paketId', 'id']);
  if (flags.some((x) => x === true || String(x).toLowerCase() === 'true') || /^(success|ok|basarili|başarılı|true)$/.test(word) || id !== undefined) {
    return { verdict: 'ok', id: id !== undefined ? String(id).slice(0, 60) : '' };
  }
  return { verdict: 'unknown', message: 'cevap başarı olarak doğrulanamadı' };
}
async function goldSend(list, text, e) {
  const r = await goldPost('sendSMS', { sdate: '', vperiod: '48', message: { sender: e.sender, text, utf8: '1', gsm: list } }, e);
  const v = goldVerdict(r);
  if (v.verdict === 'ok') return { ok: true, id: v.id || '', raw: r.raw };
  return { ok: false, error: `Gold Mesaj: ${v.message} — cevap: ${r.raw || '(boş)'}`.slice(0, 320), raw: r.raw };
}
/** Yönetici sınaması: kalan kontör ve onaylı başlıklar. Hata fırlatmaz. */
export async function providerInfo(e = smsEnv()) {
  if (e.provider !== 'goldmesaj' || !smsConfigured(e)) return null;
  const out = { credit: null, creditRaw: '', senderListed: null, sendersRaw: '', error: '' };
  try {
    const k = await goldPost('kredi/get', {}, e);
    out.creditRaw = k.raw;
    const find = (o, depth = 0) => {
      if (!o || typeof o !== 'object' || depth > 3) return undefined;
      for (const [key, val] of Object.entries(o)) {
        if (/kredi|credit|bakiye|balance/i.test(key) && (typeof val === 'number' || (typeof val === 'string' && /^-?\d+([.,]\d+)?$/.test(val.trim())))) return val;
        const inner = typeof val === 'object' ? find(val, depth + 1) : undefined;
        if (inner !== undefined) return inner;
      }
      return undefined;
    };
    const c = find(k.data);
    out.credit = c === undefined ? null : c;
    if (!k.httpOk) out.error = `Kontör sorgusu HTTP ${k.status}`;
  } catch (err) {
    out.error = `Kontör sorgulanamadı: ${(err && err.name === 'AbortError' ? 'zaman aşımı' : (err && err.message) || err)}`.slice(0, 200);
  }
  try {
    const a = await goldPost('alfanumerik/getList', {}, e);
    out.sendersRaw = a.raw;
    if (a.httpOk && e.sender) out.senderListed = JSON.stringify(a.data ?? a.raw).toLowerCase().includes(e.sender.toLowerCase());
  } catch (err) {
    out.error = out.error || `Başlık listesi alınamadı: ${(err && err.name === 'AbortError' ? 'zaman aşımı' : (err && err.message) || err)}`.slice(0, 200);
  }
  return out;
}

/**
 * Sağlayıcıya gönderir. numbers: "5XXXXXXXXX" listesi (en çok 100). Hata fırlatmaz.
 * Dönüş: { ok, id, error }
 */
export async function providerSend(numbers, text, e = smsEnv()) {
  if (!smsConfigured(e)) return { ok: false, error: 'SMS sağlayıcı bilgileri eksik' };
  const list = [...new Set(numbers.filter(Boolean))].slice(0, 100);
  if (!list.length) return { ok: false, error: 'Alıcı yok' };
  try {
    if (e.provider === 'goldmesaj') return await goldSend(list.slice(0, GOLD_BATCH), text, e);
    if (e.provider === 'netgsm') {
      const res = await fetchWithTimeout('https://api.netgsm.com.tr/sms/rest/v2/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${Buffer.from(`${e.netgsmUser}:${e.netgsmPass}`).toString('base64')}`,
        },
        body: JSON.stringify({
          msgheader: e.sender,
          encoding: 'TR',
          iysfilter: '0', // bilgilendirme mesajı (ticari değil)
          messages: list.map((no) => ({ msg: text, no })),
        }),
      });
      const raw = await res.text();
      let data = null;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        data = null;
      }
      const code = data && data.code !== undefined ? String(data.code) : res.status === 401 || res.status === 403 ? '30' : '';
      if (res.ok && (code === '00' || code === '01' || code === '02') && data && data.jobid) return { ok: true, id: String(data.jobid) };
      return { ok: false, error: `Netgsm ${code || res.status}: ${NETGSM_ERRORS[code] || (data && data.description) || 'beklenmeyen yanıt'}` };
    }
    // İleti Merkezi (XML)
    const body =
      `<request><authentication><key>${xmlEsc(e.imKey)}</key><hash>${xmlEsc(e.imHash)}</hash></authentication>` +
      `<order><sender>${xmlEsc(e.sender)}</sender><iys>0</iys><message><text><![CDATA[${String(text).replace(/]]>/g, '')}]]></text><receipents>` +
      list.map((n) => `<number>90${n}</number>`).join('') +
      `</receipents></message></order></request>`;
    const res = await fetchWithTimeout('https://api.iletimerkezi.com/v1/send-sms', {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=UTF-8' },
      body,
    });
    const raw = await res.text();
    const id = (/<order>\s*<id>\s*(\d+)\s*<\/id>/i.exec(raw) || [])[1];
    const code = (/<code>\s*(\d+)\s*<\/code>/i.exec(raw) || [])[1] || '';
    if (id) return { ok: true, id };
    return { ok: false, error: `İleti Merkezi ${code || res.status}: ${IM_ERRORS[code] || 'beklenmeyen yanıt'}` };
  } catch (err) {
    return { ok: false, error: err && err.name === 'AbortError' ? 'Sağlayıcı zamanında yanıt vermedi' : String((err && err.message) || err).slice(0, 200) };
  }
}

/** Bilgi türüne göre kısa SMS cümlesi (kişisel bilgi yok) */
const EVENT_TEXT = {
  'homework-created': 'Yeni ödev verildi.',
  'homework-reminder': 'Ödev teslim günü yaklaşıyor.',
  'etut-created': 'Yeni etüt planlandı.',
  'etut-scheduled': 'Etüt hatırlatması.',
  'etut-changed': 'Etüt bilgisi değişti.',
  'etut-cancelled': 'Bir etüt iptal edildi.',
  'etut-attendance': 'Etüt yoklaması bekleniyor.',
  'etut-no-attendance': 'Yoklaması alınmamış bir etüt var.',
  'question-target': 'Yeni soru hedefi verildi.',
  'plan-sent': 'Haftalık çalışma planı gönderildi.',
  'plan-report': 'Haftalık plan raporu hazır.',
  'deneme-karne': 'Deneme sonucu (karne) hazır.',
};
export function smsTextFor(event, role, appUrl) {
  const e = smsEnv();
  const base = EVENT_TEXT[event];
  if (!base) return '';
  const url = String(appUrl || DEFAULT_APP_URL).replace(/\/+$/, '');
  const who = role === 'veli' ? 'Öğrenciniz için: ' : '';
  return `${e.appName}: ${who}${base} Ayrıntı: ${url}`.slice(0, 300);
}

/**
 * İşleri gönderir: jobs = [{ event, refId, role, phone, text, once }]
 * Tekrarı ve günlük sınırı denetler, kaydı tutar. Hiçbir zaman hata fırlatmaz.
 * rest: api/mail.js içindeki Supabase REST yardımcısı.
 */
export async function dispatchSms(rest, jobs) {
  const out = { queued: 0, sent: 0, dry: 0, failed: 0, skipped: 0, limited: 0, errors: [] };
  const e = smsEnv();
  if (!jobs.length || !smsConfigured(e)) return out;
  try {
    const day = istanbulDay();
    // 1) geçerli numaralar + tekrar anahtarı
    const rows = [];
    const seen = new Set();
    for (const j of jobs) {
      const p = normPhone(j.phone);
      if (!p || !j.text) continue;
      const key = `${j.event}|${j.refId || ''}|${phoneKey(p)}${j.once ? '' : `|${day}`}`.slice(0, 300);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ p, text: j.text, body: { dedupe_key: key, event: j.event, ref_id: String(j.refId || '').slice(0, 200) || null, recipient_role: j.role, phone_masked: maskPhone(p), status: e.live ? 'sending' : 'dry', provider: e.provider } });
    }
    if (!rows.length) return out;
    // 2) günlük sınır (yalnızca gerçek gönderimde)
    let allowedCount = rows.length;
    if (e.live) {
      const used = await rest(`sms_log?select=id&status=in.(sent,sending)&created_at=gte.${encodeURIComponent(istanbulMidnightIso())}&limit=${e.dailyLimit + 1}`, { token: 'service' });
      allowedCount = Math.max(0, e.dailyLimit - (used || []).length);
    }
    const take = rows.slice(0, allowedCount);
    out.limited = rows.length - take.length;
    if (out.limited) out.errors.push(`Günlük SMS sınırına (${e.dailyLimit}) ulaşıldı; ${out.limited} SMS gönderilmedi`);
    if (!take.length) return out;
    // 3) kayıt (daha önce gönderilmiş olanlar atlanır)
    const inserted = await rest('sms_log?on_conflict=dedupe_key', {
      token: 'service',
      method: 'POST',
      prefer: 'resolution=ignore-duplicates,return=representation',
      body: take.map((r) => r.body),
    });
    const fresh = new Map((inserted || []).map((r) => [r.dedupe_key, r.id]));
    out.skipped = take.length - fresh.size;
    const todo = take.filter((r) => fresh.has(r.body.dedupe_key));
    out.queued = todo.length;
    if (!todo.length) return out;
    if (!e.live) {
      out.dry = todo.length;
      return out;
    }
    // 4) aynı metin tek istekte (en çok 100 numara)
    const groups = new Map();
    for (const r of todo) groups.set(r.text, [...(groups.get(r.text) || []), r]);
    for (const [text, list] of groups) {
      const size = e.provider === 'goldmesaj' ? GOLD_BATCH : 100;
      for (let i = 0; i < list.length; i += size) {
        const part = list.slice(i, i + size);
        const r = await providerSend(
          part.map((x) => x.p),
          text,
          e
        );
        const ids = part.map((x) => fresh.get(x.body.dedupe_key)).filter((x) => x !== undefined);
        if (r.ok) out.sent += part.length;
        else {
          out.failed += part.length;
          if (out.errors.length < 3) out.errors.push(r.error);
        }
        try {
          await rest(`sms_log?id=in.(${ids.map(Number).join(',')})`, {
            token: 'service',
            method: 'PATCH',
            prefer: 'return=minimal',
            body: { status: r.ok ? 'sent' : 'failed', provider_id: r.ok ? r.id : null, error: r.ok ? null : String(r.error || '').slice(0, 300) },
          });
        } catch (err) {
          console.error('[sms] kayıt güncellenemedi', err && err.message);
        }
      }
    }
  } catch (err) {
    // sms_log tablosu yoksa (SQL çalıştırılmadıysa) SMS gönderilmez; e-posta etkilenmez
    console.error('[sms]', err && err.message);
    out.errors.push('SMS kaydı yapılamadı (sql/73_sms.sql çalıştırıldı mı?)');
  }
  return out;
}

/** Eksik ayarların adları + SMS_PROVIDER'ın ham değeri (gizli bilgi değildir). Şifre / kullanıcı kodu asla döndürülmez. */
export function smsDiag(e = smsEnv()) {
  const rawProvider = String(process.env.SMS_PROVIDER || '').trim();
  const missing = [];
  if (!rawProvider) missing.push('SMS_PROVIDER');
  else if (!e.provider) missing.push('SMS_PROVIDER (değer tanınmıyor)');
  if (!e.sender) missing.push('SMS_SENDER');
  if (e.provider === 'goldmesaj' || rawProvider.toLowerCase() === 'goldmesaj') {
    if (!e.gmUser) missing.push('GOLDMESAJ_USERNAME');
    if (!e.gmPass) missing.push('GOLDMESAJ_PASSWORD');
  } else if (e.provider === 'netgsm') {
    if (!e.netgsmUser) missing.push('NETGSM_USERCODE');
    if (!e.netgsmPass) missing.push('NETGSM_PASSWORD');
  } else if (e.provider === 'iletimerkezi') {
    if (!e.imKey) missing.push('ILETIMERKEZI_KEY');
    if (!e.imHash) missing.push('ILETIMERKEZI_HASH');
  }
  return { providerValue: rawProvider.slice(0, 30), missing };
}

/** Yönetici ekranı için durum: ayarlar + bugünkü sayılar + son kayıtlar */
export async function smsStatus(rest) {
  const e = smsEnv();
  const status = {
    provider: e.provider || null,
    sender: e.sender || null,
    configured: smsConfigured(e),
    live: e.live,
    dailyLimit: e.dailyLimit,
    today: { sent: 0, dry: 0, failed: 0 },
    recent: [],
    tableMissing: false,
    // Aşama 78: sunucunun gördüğü ayarların durumu (değerler gösterilmez; yalnızca SMS_PROVIDER değeri ve eksik ayarların adları)
    diag: smsDiag(e),
  };
  try {
    const rows = await rest(`sms_log?select=created_at,event,recipient_role,phone_masked,status,error&created_at=gte.${encodeURIComponent(istanbulMidnightIso())}&order=created_at.desc&limit=500`, { token: 'service' });
    for (const r of rows || []) {
      if (r.status === 'sent') status.today.sent++;
      else if (r.status === 'dry') status.today.dry++;
      else if (r.status === 'failed') status.today.failed++;
    }
    const last = await rest('sms_log?select=created_at,event,recipient_role,phone_masked,status,error&order=created_at.desc&limit=12', { token: 'service' });
    status.recent = last || [];
  } catch {
    status.tableMissing = true;
  }
  return status;
}
