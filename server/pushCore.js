// ============================================================================
// TELEFON BİLDİRİMLERİ — ORTAK ÇEKİRDEK (Aşama 34)
// Dosya adı "_" ile başladığı için Vercel bunu ayrı bir adres olarak yayınlamaz; yalnızca api/push.js kullanır.
//
// Web Push: bildirim, telefonun / bilgisayarın tarayıcısına (Chrome, Safari, Edge…) gider; site kapalıyken de gelir.
// Ücretsizdir (SMS değildir). Alıcılar her zaman SUNUCUDA veritabanından bulunur; tarayıcıdan alıcı kabul edilmez.
//
// Vercel ortam değişkenleri (Settings > Environment Variables):
//   VAPID_PUBLIC_KEY   (zorunlu)  `npx web-push generate-vapid-keys` çıktısındaki Public Key
//   VAPID_PRIVATE_KEY  (zorunlu)  aynı çıktıdaki Private Key (GİZLİ)
//   VAPID_SUBJECT      (isteğe bağlı) ör. mailto:okul@ornek.com  (yoksa yönetici e-postası kullanılır)
//   SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET, VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY  (zaten tanımlı)
// ============================================================================
import webpush from 'web-push';

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
let vapidReady = false;
function ensureVapid() {
  if (vapidReady) return true;
  const e = pushEnv();
  if (!e.vapidPublic || !e.vapidPrivate) return false;
  webpush.setVapidDetails(e.vapidSubject, e.vapidPublic, e.vapidPrivate);
  vapidReady = true;
  return true;
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
  const out = { users: 0, sent: 0, failed: 0, removed: 0 };
  if (!ensureVapid()) return out;
  const ids = uniq(userIds);
  if (!ids.length) return out;
  const subs = await chunked(ids, 100, (part) =>
    rest(`push_subscriptions?select=endpoint,p256dh,auth,user_id&user_id=in.${inList(part)}`, { token: 'service' })
  );
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
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 6 * 3600, urgency: 'high' });
          out.sent++;
        } catch (err) {
          const code = err && err.statusCode;
          if (code === 404 || code === 410) {
            // Cihaz aboneliği bitmiş (uygulama silinmiş / izin kaldırılmış): kaydı sil
            out.removed++;
            try {
              await rest(`push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { token: 'service', method: 'DELETE' });
            } catch {}
          } else {
            out.failed++;
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
