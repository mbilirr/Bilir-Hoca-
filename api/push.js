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
// Ayrıntılar ve ortam değişkenleri: bu dosyanın sonundaki ORTAK ÇEKİRDEK bölümü
// ============================================================================

// ============================================================================
// TELEFON BİLDİRİMLERİ — ORTAK ÇEKİRDEK (Aşama 34)
// Dış paket KULLANMAZ: bildirim şifreleme ve imza Node.js'in kendi crypto modülüyle yapılır (RFC 8291 / RFC 8292).
//
// Web Push: bildirim, telefonun / bilgisayarın tarayıcısına (Chrome, Safari, Edge…) gider; site kapalıyken de gelir.
// Ücretsizdir (SMS değildir). Alıcılar her zaman SUNUCUDA veritabanından bulunur; tarayıcıdan alıcı kabul edilmez.
//
// Vercel ortam değişkenleri (Settings > Environment Variables):
//   VAPID_PUBLIC_KEY   (zorunlu)  ortak anahtar (base64url, 65 bayt)
//   VAPID_PRIVATE_KEY  (zorunlu)  gizli anahtar (base64url, 32 bayt)
//   VAPID_SUBJECT      (isteğe bağlı) ör. mailto:okul@ornek.com  (yoksa yönetici e-postası kullanılır)
//   SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET, VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY  (zaten tanımlı)
// ============================================================================
import crypto from 'node:crypto';

const DEFAULT_SUPABASE_URL = 'https://zzdchsxfjzedgciejuxd.supabase.co';
const HEAD_ADMIN_EMAIL = 'm.bilirr@gmail.com';

export function pushEnv() {
  return {
    url: (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/+$/, ''),
    anon: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '',
    service: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    vapidPublic: (process.env.VAPID_PUBLIC_KEY || '').trim(),
    vapidPrivate: (process.env.VAPID_PRIVATE_KEY || '').trim(),
    vapidSubject: (process.env.VAPID_SUBJECT || `mailto:${HEAD_ADMIN_EMAIL}`).trim(),
    cronSecret: process.env.CRON_SECRET || '',
  };
}
export const pushConfigured = () => {
  const e = pushEnv();
  return !!(e.vapidPublic && e.vapidPrivate && e.service);
};

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ----------------------------------------------------------------------------- Supabase REST
export async function rest(path, { token, method = 'GET', body, prefer } = {}) {
  const e = pushEnv();
  const isService = token === 'service';
  const headers = {
    apikey: isService ? e.service : e.anon,
    ...(isService && e.service.startsWith('sb_') ? {} : { Authorization: `Bearer ${isService ? e.service : token}` }),
    'Content-Type': 'application/json',
  };
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${e.url}/rest/v1/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!r.ok) {
    const err = new Error(`Veritabanı isteği başarısız (${r.status}): ${(data && data.message) || text}`.slice(0, 300));
    err.status = r.status;
    throw err;
  }
  return data;
}
export const inList = (ids) => `(${ids.map((x) => `"${encodeURIComponent(String(x).replace(/["\\]/g, ''))}"`).join(',')})`;
export const arr = (v) => {
  if (Array.isArray(v)) return v.filter((x) => typeof x === 'string' && x);
  if (typeof v === 'string' && v.startsWith('[')) {
    try {
      return arr(JSON.parse(v));
    } catch {
      return [];
    }
  }
  return [];
};
const uniq = (list) => Array.from(new Set(list.filter((x) => typeof x === 'string' && x)));
const clip = (s, n) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

async function chunked(ids, size, fn) {
  const out = [];
  for (let i = 0; i < ids.length; i += size) out.push(...((await fn(ids.slice(i, i + size))) || []));
  return out;
}

// ----------------------------------------------------------------------------- Kimlik -> giriş hesabı (auth) eşlemesi
export async function studentAuthIds(studentIds) {
  const ids = uniq(studentIds);
  if (!ids.length) return [];
  const rows = await chunked(ids, 100, (part) => rest(`students?select=id,auth_user_id,status&id=in.${inList(part)}`, { token: 'service' }));
  return uniq(rows.filter((s) => s.auth_user_id && (!s.status || s.status === 'active')).map((s) => s.auth_user_id));
}
export async function teacherAuthIds(teacherIds) {
  const ids = uniq(teacherIds).filter((id) => !id.startsWith('ext-')); // dış (kayıtsız) etüt öğretmenlerinin hesabı yok
  if (!ids.length) return [];
  const rows = await chunked(ids, 100, (part) => rest(`teachers?select=id,auth_user_id,status&id=in.${inList(part)}`, { token: 'service' }));
  return uniq(rows.filter((t) => t.auth_user_id && (!t.status || t.status === 'approved')).map((t) => t.auth_user_id));
}

// ----------------------------------------------------------------------------- Gönderim
// Web Push gönderimi (dış paket olmadan)
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const fromB64u = (s) => Buffer.from(String(s || '').trim().replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_'), 'base64url');

let vapidKey = null; // { key: KeyObject, pub: string }
let vapidProblem = '';
function ensureVapid() {
  if (vapidKey) return true;
  const e = pushEnv();
  if (!e.vapidPublic || !e.vapidPrivate) return false;
  try {
    const pub = fromB64u(e.vapidPublic);
    const d = fromB64u(e.vapidPrivate);
    if (pub.length !== 65 || pub[0] !== 4 || d.length !== 32) {
      vapidProblem = `VAPID anahtarları hatalı biçimde (ortak ${pub.length}/65, gizli ${d.length}/32 bayt)`;
      console.error('[push]', vapidProblem);
      return false;
    }
    // Gizli anahtar ortak anahtarın eşi mi? (eşleşmezse Apple "BadJwtToken", Google 403 verir)
    const ecdh = crypto.createECDH('prime256v1');
    ecdh.setPrivateKey(d);
    if (!ecdh.getPublicKey().equals(pub)) {
      vapidProblem = 'VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY ile eşleşmiyor (Vercel\'deki gizli anahtarı kontrol edin)';
      console.error('[push]', vapidProblem);
      return false;
    }
    const key = crypto.createPrivateKey({
      key: { kty: 'EC', crv: 'P-256', x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)), d: b64u(d) },
      format: 'jwk',
    });
    vapidKey = { key, pub: b64u(pub) };
    return true;
  } catch (err) {
    vapidProblem = `VAPID anahtarı okunamadı: ${(err && err.message) || ''}`;
    console.error('[push]', vapidProblem);
    return false;
  }
}

function vapidAuth(endpoint) {
  const e = pushEnv();
  const aud = new URL(endpoint).origin;
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  let sub = String(e.vapidSubject || '').replace(/\s+/g, '').replace(/^["']|["']$/g, '');
  if (/^mailto:/i.test(sub)) sub = 'mailto:' + sub.slice(7);
  if (!/^mailto:[^@]+@[^@]+\.[^@]+$/.test(sub) && !/^https:\/\/[^/]+\.[^/]+/.test(sub)) sub = `mailto:${HEAD_ADMIN_EMAIL}`;
  const claims = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 3600, sub }));
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${claims}`), { key: vapidKey.key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${head}.${claims}.${b64u(sig)}, k=${vapidKey.pub}`;
}

const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

// RFC 8291 (aes128gcm) içerik şifrelemesi
function encryptPayload(p256dh, authSecret, text) {
  const uaPublic = fromB64u(p256dh);
  const auth = fromB64u(authSecret);
  const ecdh = crypto.createECDH('prime256v1');
  const asPublic = ecdh.generateKeys();
  const shared = ecdh.computeSecret(uaPublic);
  const salt = crypto.randomBytes(16);
  const prkKey = hmac(auth, shared);
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])])).subarray(0, 32);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0'), Buffer.from([1])])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: nonce\0'), Buffer.from([1])])).subarray(0, 12);
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const enc = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(text, 'utf8'), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096, 0);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, enc]);
}

async function sendOne(sub, text, { TTL = 6 * 3600, urgency = 'high' } = {}) {
  const body = encryptPayload(sub.keys.p256dh, sub.keys.auth, text);
  const r = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: vapidAuth(sub.endpoint),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(TTL),
      Urgency: urgency,
    },
    body,
  });
  if (r.status >= 200 && r.status < 300) return;
  const err = new Error(`Bildirim servisi ${r.status}`);
  err.statusCode = r.status;
  err.body = await r.text().catch(() => '');
  throw err;
}

// Aynı bildirim aynı kişiye bir kez: anahtar ilk kez yazılabilirse true
async function claim(key) {
  try {
    const rows = await rest('push_log?on_conflict=key', {
      token: 'service',
      method: 'POST',
      body: [{ key: String(key).slice(0, 300) }],
      prefer: 'resolution=ignore-duplicates,return=representation',
    });
    return Array.isArray(rows) && rows.length > 0;
  } catch (err) {
    console.error('[push] kayıt hatası', err && err.message);
    return false;
  }
}

/**
 * Verilen kullanıcılara (auth id) bildirim gönderir.
 * payload: { title, body, url, tag }
 * dedupe: verilirse her kullanıcı için `${dedupe}:${kullanıcı}` anahtarıyla en fazla bir kez gönderilir.
 */
export async function sendToUsers(userIds, payload, { dedupe, deadline } = {}) {
  const out = { users: 0, devices: 0, sent: 0, failed: 0, removed: 0, lastError: '' };
  if (!ensureVapid()) {
    out.lastError = vapidProblem || 'VAPID anahtarları okunamadı';
    return out;
  }
  const ids = uniq(userIds);
  if (!ids.length) return out;
  const subs = await chunked(ids, 100, (part) =>
    rest(`push_subscriptions?select=endpoint,p256dh,auth,user_id&user_id=in.${inList(part)}`, { token: 'service' })
  );
  out.devices = subs.length;
  if (!subs.length) return out;
  const byUser = new Map();
  for (const s of subs) byUser.set(s.user_id, [...(byUser.get(s.user_id) || []), s]);
  const body = JSON.stringify({
    title: clip(payload.title, 80),
    body: clip(payload.body, 180),
    url: payload.url || '/',
    tag: payload.tag || undefined,
  });
  for (const [uid, list] of byUser) {
    if (deadline && Date.now() > deadline) break;
    if (dedupe && !(await claim(`${dedupe}:${uid}`))) continue;
    out.users++;
    await Promise.all(
      list.map(async (s) => {
        try {
          await sendOne({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 6 * 3600, urgency: 'high' });
          out.sent++;
        } catch (err) {
          const code = err && err.statusCode;
          if (code === 404 || code === 410) {
            // Cihaz aboneliği bitmiş (uygulama silinmiş / izin kaldırılmış): kaydı sil
            out.removed++;
            out.lastError = `abonelik geçersiz (${code})`;
            try {
              await rest(`push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { token: 'service', method: 'DELETE' });
            } catch {}
          } else {
            out.failed++;
            out.lastError = `${code || 'ağ'} ${err && err.body ? String(err.body).slice(0, 120) : (err && err.message) || ''}`.trim();
            console.error('[push] gönderilemedi', code, err && err.body ? String(err.body).slice(0, 200) : err && err.message);
          }
        }
      })
    );
  }
  return out;
}
const addOut = (a, b) => ({ users: a.users + b.users, sent: a.sent + b.sent, failed: a.failed + b.failed, removed: a.removed + b.removed });
const EMPTY = { users: 0, sent: 0, failed: 0, removed: 0 };

// ----------------------------------------------------------------------------- Türkiye saati yardımcıları
export function istanbulNow() {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Istanbul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date())
      .map((x) => [x.type, x.value])
  );
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}
export function addDaysStr(dateStr, delta) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + delta)).toISOString().slice(0, 10);
}
const absMinutes = (dateStr, minute) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr || ''));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 60000 + minute : null;
};
// Son teslim yerel ("2026-10-05T23:59") ya da UTC ("…Z") kaydedilmiş olabilir: Türkiye saatine çevir
function toIstanbulLocal(str) {
  const s = String(str || '');
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(s)) return s;
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Istanbul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value])
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const shortTr = (ymd) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd || ''));
  return m ? `${+m[3]} ${AYLAR[+m[2] - 1]}` : String(ymd || '');
};

// ----------------------------------------------------------------------------- Etüt satırı
function parseEtutMeta(row) {
  try {
    if (row.notes && typeof row.notes === 'object') return row.notes;
    if (typeof row.notes === 'string' && row.notes.trim().startsWith('{')) return JSON.parse(row.notes);
  } catch {}
  return {};
}
export function etutInfo(row) {
  const meta = parseEtutMeta(row);
  const att = meta.studentAttendance;
  const m = /^(\d{1,2}):(\d{2})/.exec(String(row.time || ''));
  return {
    id: row.id,
    date: String(row.date || '').slice(0, 10),
    time: m ? `${m[1].padStart(2, '0')}:${m[2]}` : '',
    start: m ? Number(m[1]) * 60 + Number(m[2]) : null,
    duration: Number(row.duration) || 45,
    subject: row.subject || 'Etüt',
    topic: row.topic || '',
    location: row.location || '',
    teacherIds: uniq([row.etut_teacher_id || meta.teacherId, ...arr(row.etut_teacher_ids), ...arr(meta.teacherIds)]),
    studentIds: arr(row.assigned_student_ids),
    hasAttendance: !!att && typeof att === 'object' && Object.keys(att).length > 0,
    expectsAttendance: arr(row.assigned_student_ids).length > 0 || meta.assignedStudentIds === 'all' || (Array.isArray(meta.assignedStudentIds) && meta.assignedStudentIds.length > 0),
  };
}
const etutLine = (e) => [e.time && `saat ${e.time}`, e.subject + (e.topic ? ` – ${e.topic}` : ''), e.location].filter(Boolean).join(' · ');

// ============================================================================
// ZAMANLANMIŞ HATIRLATMALAR (Supabase zamanlayıcısı her 10 dakikada /api/push?task=tick çağırır)
// Her hatırlatma kişi başına bir kez gider (push_log). Gece 22:30 – 07:30 arası hatırlatma gönderilmez.
// ============================================================================
export const ETUT_SOON_FROM = 40; // etüt başlamadan en çok 40 dk önce …
export const ETUT_SOON_TO = 5; // … en az 5 dk önce (10 dakikalık zamanlayıcıyla ~30 dk önce gider)
export const NOATT_AFTER_MIN = 15; // etüt bittikten 15 dk sonra yoklama hâlâ yoksa etüt öğretmenine
export const HW_DUE_EVENING = 17 * 60; // yarın teslim edilecek ödevler: bugün 17:00'den sonra
export const HW_DUE_MORNING = 8 * 60; // bugün teslim edilecek ödevler: sabah 08:00'den sonra
export const PLAN_MORNING = 8 * 60; // günlük plan: sabah 08:00'den sonra
export const QUESTION_EVENING = 20 * 60; // günlük soru sayısı: akşam 20:00'den sonra
const QUIET_START = 22 * 60 + 30;
const QUIET_END = 7 * 60 + 30;

async function tickEtutSoon(now, deadline) {
  let out = EMPTY;
  const rows = await rest(`etuts?select=*&date=like.${now.date}*`, { token: 'service' });
  for (const row of rows || []) {
    if (!row || typeof row.id !== 'string' || row.id.startsWith('__')) continue;
    const e = etutInfo(row);
    if (e.start === null) continue;
    const left = e.start - now.minutes;
    if (left > ETUT_SOON_FROM || left < ETUT_SOON_TO) continue;
    const payload = { title: `Etüdün ${left} dk sonra başlıyor`, body: etutLine(e), tag: `etut-${e.id}` };
    const stu = await studentAuthIds(e.studentIds);
    out = addOut(out, await sendToUsers(stu, { ...payload, url: '/#/student/etuts' }, { dedupe: `etut-soon:${e.id}`, deadline }));
    const tch = await teacherAuthIds(e.teacherIds);
    out = addOut(
      out,
      await sendToUsers(tch, { ...payload, title: `Etüdünüz ${left} dk sonra başlıyor`, url: '/#/teacher/etuts' }, { dedupe: `etut-soon:${e.id}`, deadline })
    );
  }
  return out;
}

async function tickNoAttendance(now, deadline) {
  let out = EMPTY;
  const nowAbs = absMinutes(now.date, now.minutes);
  const rows = await rest(`etuts?select=*&date=gte.${addDaysStr(now.date, -1)}&date=lt.${addDaysStr(now.date, 1)}`, { token: 'service' });
  for (const row of rows || []) {
    if (!row || typeof row.id !== 'string' || row.id.startsWith('__')) continue;
    const e = etutInfo(row);
    if (e.hasAttendance || !e.expectsAttendance) continue;
    const endMin = e.start === null ? 24 * 60 - 1 : e.start + e.duration;
    const endAbs = absMinutes(e.date, endMin);
    // Bitişinden 15 dk sonra; 12 saatten eski etütler için artık gönderilmez
    if (endAbs === null || nowAbs < endAbs + NOATT_AFTER_MIN || nowAbs > endAbs + 12 * 60) continue;
    const tch = await teacherAuthIds(e.teacherIds);
    out = addOut(
      out,
      await sendToUsers(
        tch,
        { title: 'Etüt yoklaması alınmadı', body: `${shortTr(e.date)} ${etutLine(e)} — yoklamayı girmeyi unutmayın.`, url: '/#/teacher/etuts', tag: `noatt-${e.id}` },
        { dedupe: `etut-noatt:${e.id}`, deadline }
      )
    );
  }
  return out;
}

async function homeworkPending(hw) {
  const studentIds = arr(hw.target_student_ids).length
    ? arr(hw.target_student_ids)
    : (await chunked(arr(hw.target_class_ids), 50, (part) => rest(`students?select=id,status&class_id=in.${inList(part)}`, { token: 'service' })))
        .filter((s) => !s.status || s.status === 'active')
        .map((s) => s.id);
  if (!studentIds.length) return [];
  const subs = await rest(`homework_submissions?select=student_id,status,check_status&homework_id=eq.${encodeURIComponent(hw.id)}`, { token: 'service' });
  const done = new Set((subs || []).filter((s) => s.status === 'on_time' || s.status === 'late' || s.check_status === 'yapti').map((s) => s.student_id));
  return studentIds.filter((id) => !done.has(id));
}

async function tickHomeworkDue(now, deadline) {
  let out = EMPTY;
  const checks = [];
  if (now.minutes >= HW_DUE_EVENING) checks.push({ day: addDaysStr(now.date, 1), when: 'Yarın', key: 'hw-due1' });
  if (now.minutes >= HW_DUE_MORNING) checks.push({ day: now.date, when: 'Bugün', key: 'hw-due0' });
  for (const c of checks) {
    const seen = new Set();
    const list = [];
    for (const day of [c.day, addDaysStr(c.day, -1)]) {
      const part = await rest(`homeworks?select=*&due_date=like.${day}*`, { token: 'service' });
      for (const h of part || []) if (h && typeof h.id === 'string' && !h.id.startsWith('__') && !seen.has(h.id)) (seen.add(h.id), list.push(h));
    }
    for (const hw of list) {
      if (deadline && Date.now() > deadline) return out;
      const local = toIstanbulLocal(hw.due_date);
      if (!local.startsWith(c.day)) continue;
      const time = local.length >= 16 ? local.slice(11, 16) : '';
      // Bugün teslimse ve saati geçtiyse hatırlatma gönderilmez
      if (c.when === 'Bugün' && time) {
        const [hh, mm] = time.split(':').map(Number);
        if (hh * 60 + mm <= now.minutes) continue;
      }
      const pending = await homeworkPending(hw);
      if (!pending.length) continue;
      const users = await studentAuthIds(pending);
      out = addOut(
        out,
        await sendToUsers(
          users,
          {
            title: `${c.when} teslim: ${hw.title || 'Ödev'}`,
            body: `${hw.subject || 'Ödev'}${time && time !== '23:59' ? ` · saat ${time}` : ''} — henüz teslim etmedin.`,
            url: '/#/student/homework',
            tag: `hw-${hw.id}`,
          },
          { dedupe: `${c.key}:${hw.id}`, deadline }
        )
      );
    }
  }
  return out;
}

async function tickPlanDaily(now, deadline) {
  if (now.minutes < PLAN_MORNING) return EMPTY;
  let out = EMPTY;
  // Bugünü kapsayabilecek, öğrenciye GÖNDERİLMİŞ planlar (plan haftanın herhangi bir gününde başlayabilir)
  const plans = await rest(
    `study_plans?select=id,student_id,week_start&sent_at=not.is.null&week_start=gte.${addDaysStr(now.date, -6)}&week_start=lte.${now.date}`,
    { token: 'service' }
  );
  if (!plans || !plans.length) return out;
  const planIds = plans.map((p) => p.id);
  const items = await chunked(planIds, 60, (part) =>
    rest(`study_plan_items?select=plan_id,student_id,week_start,day,subject,done_at&plan_id=in.${inList(part)}`, { token: 'service' })
  );
  const byStudent = new Map();
  for (const it of items) {
    if (it.done_at) continue;
    if (addDaysStr(String(it.week_start), Number(it.day) || 0) !== now.date) continue;
    const list = byStudent.get(it.student_id) || [];
    list.push(String(it.subject || '').trim());
    byStudent.set(it.student_id, list);
  }
  for (const [studentId, subjects] of byStudent) {
    if (deadline && Date.now() > deadline) break;
    const users = await studentAuthIds([studentId]);
    const names = uniq(subjects.filter(Boolean));
    out = addOut(
      out,
      await sendToUsers(
        users,
        {
          title: `Bugünkü çalışma planın: ${subjects.length} görev`,
          body: names.length ? `${names.slice(0, 4).join(', ')}${names.length > 4 ? ' …' : ''}` : 'Görevlerini işaretlemeyi unutma.',
          url: '/#/student',
          tag: `plan-${now.date}`,
        },
        { dedupe: `plan-day:${now.date}`, deadline }
      )
    );
  }
  return out;
}

async function tickQuestionDaily(now, deadline) {
  if (now.minutes < QUESTION_EVENING) return EMPTY;
  // Yalnızca bildirimi açmış öğrencilere bakılır (gereksiz sorgu yapılmaz)
  const subs = await rest(`push_subscriptions?select=user_id&role=eq.student`, { token: 'service' });
  const userIds = uniq((subs || []).map((s) => s.user_id));
  if (!userIds.length) return EMPTY;
  const students = await chunked(userIds, 100, (part) =>
    rest(`students?select=id,auth_user_id,status&auth_user_id=in.${inList(part)}`, { token: 'service' })
  );
  const active = students.filter((s) => !s.status || s.status === 'active');
  if (!active.length) return EMPTY;
  const logs = await chunked(
    active.map((s) => s.id),
    100,
    (part) => rest(`question_logs?select=student_id,total_questions&date=eq.${now.date}&student_id=in.${inList(part)}`, { token: 'service' })
  );
  const entered = new Set(logs.filter((l) => Number(l.total_questions) > 0).map((l) => l.student_id));
  const users = active.filter((s) => !entered.has(s.id)).map((s) => s.auth_user_id);
  return sendToUsers(
    users,
    { title: 'Bugünkü soru sayını girdin mi?', body: 'Bugün çözdüğün soruları girmeyi unutma.', url: '/#/student/questions', tag: `soru-${now.date}` },
    { dedupe: `soru-gun:${now.date}`, deadline }
  );
}

export async function runPushTick(deadline) {
  const now = istanbulNow();
  const result = { ok: true, date: now.date, configured: pushConfigured(), sent: 0, failed: 0, removed: 0, errors: [] };
  if (!result.configured) return result;
  if (now.minutes >= QUIET_START || now.minutes < QUIET_END) return { ...result, quiet: true };
  const jobs = [
    ['etüt', tickEtutSoon],
    ['yoklama', tickNoAttendance],
    ['ödev', tickHomeworkDue],
    ['plan', tickPlanDaily],
    ['soru', tickQuestionDaily],
  ];
  for (const [name, fn] of jobs) {
    if (Date.now() > deadline) break;
    try {
      const r = await fn(now, deadline);
      result.sent += r.sent;
      result.failed += r.failed;
      result.removed += r.removed;
    } catch (err) {
      console.error(`[push] ${name} hatırlatma hatası`, err && err.message);
      result.errors.push(name);
    }
  }
  return result;
}

// ============================================================================
// ANLIK BİLDİRİMLER (uygulama kaydı yaptıktan sonra /api/push'a "ne oldu" bilgisini gönderir)
// Kayıt, ÇAĞIRANIN kendi oturumuyla okunur: göremediği kaydın bildirimini gönderemez.
// ============================================================================
async function visibleRow(table, filter, token) {
  const rows = await rest(`${table}?select=*&${filter}`, { token });
  return rows && rows[0] ? rows[0] : null;
}

export async function notifyHomeworkCreated(caller, body, deadline) {
  if (caller.role !== 'teacher') throw new HttpError(403, 'Yalnızca öğretmen.');
  const id = String(body.homeworkId || '');
  if (!id || id.length > 120) throw new HttpError(400, 'Geçersiz ödev.');
  const hw = await visibleRow('homeworks', `id=eq.${encodeURIComponent(id)}`, caller.token);
  if (!hw) throw new HttpError(404, 'Ödev bulunamadı.');
  const studentIds = arr(hw.target_student_ids).length
    ? arr(hw.target_student_ids)
    : (await chunked(arr(hw.target_class_ids), 50, (part) => rest(`students?select=id&class_id=in.${inList(part)}`, { token: 'service' }))).map((s) => s.id);
  const local = toIstanbulLocal(hw.due_date);
  const users = await studentAuthIds(studentIds);
  return sendToUsers(
    users,
    {
      title: `Yeni ödev: ${hw.title || 'Ödev'}`,
      body: `${hw.subject || ''}${local ? ` · son teslim ${shortTr(local)}${local.length >= 16 && local.slice(11, 16) !== '23:59' ? ` ${local.slice(11, 16)}` : ''}` : ''}`,
      url: '/#/student/homework',
      tag: `hw-${hw.id}`,
    },
    { dedupe: `hw-new:${hw.id}`, deadline }
  );
}

export async function notifyAnnouncement(caller, body, deadline) {
  if (caller.role !== 'teacher') throw new HttpError(403, 'Yalnızca öğretmen.');
  const groupId = String(body.groupId || '');
  if (!groupId || groupId.length > 120) throw new HttpError(400, 'Geçersiz duyuru.');
  const rows = await rest(`messages?select=student_id,subject,text,kind,sender_id&group_id=eq.${encodeURIComponent(groupId)}`, { token: caller.token });
  const list = (rows || []).filter((r) => r.kind === 'announcement' || r.kind === 'note');
  if (!list.length) throw new HttpError(404, 'Duyuru bulunamadı.');
  if (!caller.isAdmin && list.some((r) => r.sender_id && r.sender_id !== caller.teacherId)) throw new HttpError(403, 'Bu duyuruyu siz göndermediniz.');
  const first = list[0];
  const single = list.length === 1;
  const title =
    first.kind === 'note'
      ? single
        ? `${caller.name || 'Öğretmenin'}: sana özel mesaj`
        : `${caller.name || 'Öğretmeninden'} not`
      : `Yeni duyuru: ${first.subject || ''}`;
  const users = await studentAuthIds(list.map((r) => r.student_id));
  return sendToUsers(
    users,
    { title, body: first.kind === 'note' ? `${first.subject ? `${first.subject} — ` : ''}${first.text || ''}` : first.text || '', url: '/#/student', tag: `ann-${groupId}` },
    { dedupe: `ann:${groupId}`, deadline }
  );
}

export async function notifyMessageReply(caller, body, deadline) {
  if (caller.role !== 'teacher') throw new HttpError(403, 'Yalnızca öğretmen.');
  const id = String(body.messageId || '');
  if (!id || id.length > 120) throw new HttpError(400, 'Geçersiz mesaj.');
  const m = await visibleRow('messages', `id=eq.${encodeURIComponent(id)}`, caller.token);
  if (!m || !m.teacher_reply) throw new HttpError(404, 'Cevap bulunamadı.');
  const users = await studentAuthIds([m.student_id]);
  return sendToUsers(
    users,
    { title: `Sorunuza cevap geldi: ${m.subject || ''}`, body: m.teacher_reply, url: '/#/student/messages', tag: `msg-${id}` },
    { dedupe: `reply:${id}:${m.replied_at || ''}`, deadline }
  );
}

export async function notifyMessageNew(caller, body, deadline) {
  if (caller.role !== 'student') throw new HttpError(403, 'Yalnızca öğrenci.');
  const id = String(body.messageId || '');
  if (!id || id.length > 120) throw new HttpError(400, 'Geçersiz mesaj.');
  const rows = await rest(`messages?select=*&id=eq.${encodeURIComponent(id)}`, { token: 'service' });
  const m = rows && rows[0];
  if (!m || m.student_id !== caller.studentId || m.kind === 'announcement' || m.kind === 'note') throw new HttpError(404, 'Mesaj bulunamadı.');
  // Alıcılar: öğrencinin sınıfına ya da kendisine erişim izni olan öğretmenler; yoksa yönetici(ler)
  const st = await rest(`students?select=id,class_id&id=eq.${encodeURIComponent(caller.studentId)}`, { token: 'service' });
  const classId = st && st[0] ? st[0].class_id : null;
  const [byClass, byStudent] = await Promise.all([
    classId ? rest(`teacher_class_access?select=teacher_auth_id&class_id=eq.${encodeURIComponent(classId)}`, { token: 'service' }).catch(() => []) : [],
    rest(`teacher_student_access?select=teacher_auth_id&student_id=eq.${encodeURIComponent(caller.studentId)}`, { token: 'service' }).catch(() => []),
  ]);
  let users = uniq([...(byClass || []), ...(byStudent || [])].map((r) => r.teacher_auth_id));
  if (!users.length) {
    try {
      const admins = await rest(`teachers?select=auth_user_id,email,status&is_admin=eq.true`, { token: 'service' });
      const head = (admins || []).filter((a) => (a.email || '').toLowerCase() === HEAD_ADMIN_EMAIL);
      users = uniq((head.length ? head : admins || []).filter((a) => !a.status || a.status === 'approved').map((a) => a.auth_user_id));
    } catch {}
  }
  return sendToUsers(
    users,
    { title: `Yeni öğrenci mesajı: ${m.student_name || 'Öğrenci'}`, body: `${m.student_class ? `${m.student_class} · ` : ''}${m.subject || ''}: ${m.text || ''}`, url: '/#/teacher/messages', tag: `msg-${id}` },
    { dedupe: `msg-new:${id}`, deadline }
  );
}

// ============================================================================ İSTEK İŞLEYİCİ
export const config = { maxDuration: 30 };
const TIME_BUDGET_MS = 22000;

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
        let why = '';
        if (r.sent === 0) {
          if (!r.devices && r.lastError) why = r.lastError;
          else if (!r.devices) why = 'Bu hesaba kayıtlı cihaz bulunamadı. Kapat\'a basıp Bildirimleri aç\'a yeniden dokunun.';
          else if (r.removed && !r.failed) why = 'Cihaz aboneliği geçersiz çıktı ve silindi. Bildirimleri aç\'a yeniden dokunun.';
          else why = `Bildirim servisi reddetti: ${r.lastError || 'bilinmeyen neden'}`;
        }
        result = { ok: r.sent > 0, ...r, ...(why ? { error: why } : {}) };
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
