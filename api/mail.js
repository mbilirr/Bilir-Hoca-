// ============================================================================
// OTOMATİK E-POSTA SERVİSİ (Aşama 9) — Vercel sunucu fonksiyonu: /api/mail
//
// Uygulama ödev/etüt kaydettikten sonra bu adrese "ne oldu" bilgisini (ör. ödev kimliği) gönderir.
// Alıcıları (öğrenci / etüt öğretmeni e-postaları) SUNUCU veritabanından bulur; tarayıcıdan adres
// kabul edilmez. Böylece servis başkalarına istenmeyen e-posta göndermek için kullanılamaz.
//
// Gönderen hesap:
//   1) Öğretmen "E-posta Ayarları"ndan kendi Gmail'ini bağladıysa onun adresi,
//   2) değilse okulun ortak Gmail hesabı (GMAIL_USER), gönderen adı öğretmenin adı olur ve
//      "Yanıtla" doğrudan öğretmene gider.
//
// Vercel ortam değişkenleri (Settings > Environment Variables):
//   SUPABASE_SERVICE_ROLE_KEY  (zorunlu)  Supabase > Project Settings > API Keys > service_role
//   GMAIL_USER                 (okul hesabı) ör. okul.hesabi@gmail.com
//   GMAIL_APP_PASSWORD         (okul hesabı) Google hesabından alınan 16 harfli uygulama şifresi
//   VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY  zaten tanımlı (uygulamanın kendi ayarları)
//   Zorunlu (zamanlanmış görevler için): CRON_SECRET. İsteğe bağlı: MAIL_SECRET_KEY, APP_URL, SCHOOL_NAME
//
// Hiçbir ek paket gerektirmez (Gmail'e Node.js'in kendi TLS bağlantısıyla bağlanır).
// ============================================================================
import tls from 'node:tls';
import crypto from 'node:crypto';

export const config = { maxDuration: 60 };

const DEFAULT_SUPABASE_URL = 'https://zzdchsxfjzedgciejuxd.supabase.co';
const TIME_BUDGET_MS = 30000; // bir çağrıda en fazla bu kadar süre e-posta gönderilir, kalanlar sonraki çağrıya kalır
const SOCKET_TIMEOUT_MS = 12000;
const REPEAT_LIMIT_PER_DAY = 4; // aynı etüt için aynı kişiye günde en fazla bu kadar 'değişti/iptal' e-postası
const HOURLY_LIMIT_PER_SENDER = 400; // bir öğretmenin saatte gönderebileceği en fazla e-posta
const ONCE_EVENTS = new Set(['homework-created', 'homework-reminder', 'etut-created', 'etut-scheduled', 'question-target']);
// Öğretmen hesap bildirimleri (Aşama 11): yöneticinin yaptığı değişiklikler; günde aynı türden en fazla bu kadar
const TEACHER_EVENTS = {
  created: 'teacher-created',
  updated: 'teacher-updated',
  access: 'teacher-access',
  role: 'teacher-role',
  suspended: 'teacher-status',
  reactivated: 'teacher-status',
};
const TEACHER_REPEAT_LIMIT = 10;

function env() {
  return {
    url: (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/+$/, ''),
    anon: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '',
    service: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    gmailUser: (process.env.GMAIL_USER || '').trim(),
    gmailPass: (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, ''),
    smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
    smtpPort: Number(process.env.SMTP_PORT || 465),
    smtpInsecure: process.env.SMTP_TLS_INSECURE === '1', // yalnızca yerel testler için
    secretKey: process.env.MAIL_SECRET_KEY || '',
    appUrl: (
      process.env.APP_URL ||
      (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '')
    ).replace(/\/+$/, ''),
    schoolName: process.env.SCHOOL_NAME || 'Eğitim & Öğrenci Takip Sistemi',
    cronSecret: process.env.CRON_SECRET || '',
  };
}

class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

// ----------------------------------------------------------------------------- Supabase REST
async function rest(path, { token, method = 'GET', body, prefer } = {}) {
  const e = env();
  const isService = token === 'service';
  const headers = {
    apikey: isService ? e.service : e.anon,
    // Yeni tip "sb_secret_..." anahtarı JWT değildir: yalnızca apikey başlığında gönderilir
    ...(isService && e.service.startsWith('sb_') ? {} : { Authorization: `Bearer ${isService ? e.service : token}` }),
    'Content-Type': 'application/json',
  };
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${e.url}/rest/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
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
    err.code = data && data.code;
    throw err;
  }
  return data;
}
const inList = (ids) => `(${ids.map((x) => `"${encodeURIComponent(String(x).replace(/["\\]/g, ''))}"`).join(',')})`;
const arr = (v) => {
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

async function getAuthUser(token) {
  const e = env();
  const r = await fetch(`${e.url}/auth/v1/user`, {
    headers: { apikey: e.anon, Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  return r.json();
}

async function getCaller(req) {
  const e = env();
  if (!e.service)
    throw new HttpError(503, 'Sunucu e-posta için henüz ayarlanmamış (SUPABASE_SERVICE_ROLE_KEY eksik).', {
      code: 'server-not-configured',
    });
  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) throw new HttpError(401, 'Oturum bulunamadı. Lütfen yeniden giriş yapın.');
  const user = await getAuthUser(token);
  if (!user || !user.id) throw new HttpError(401, 'Oturum süresi dolmuş. Lütfen yeniden giriş yapın.');
  const role = user.app_metadata && user.app_metadata.role;
  const isHead = (user.email || '').toLowerCase() === 'm.bilirr@gmail.com';
  // Aşama 18: kurum bilgisi (17 numaralı SQL çalıştırılmadıysa eski davranış)
  let kurumSupported = true;
  let rows;
  try {
    rows = await rest(`teachers?select=id,name,email,branch,status,is_admin,kurum_id&auth_user_id=eq.${user.id}`, { token: 'service' });
  } catch (err) {
    if (!/kurum_id/i.test(String(err && err.message))) throw err;
    kurumSupported = false;
    rows = await rest(`teachers?select=id,name,email,branch,status,is_admin&auth_user_id=eq.${user.id}`, { token: 'service' });
  }
  const t = rows && rows[0];
  const legacyAdmin = role === 'admin' || isHead || !!(t && t.is_admin);
  const isAdmin = kurumSupported ? isHead : legacyAdmin;
  if (!t && !isAdmin) throw new HttpError(403, 'Bu işlemi yalnızca öğretmenler yapabilir.');
  if (t && t.status && t.status !== 'approved' && !isAdmin) throw new HttpError(403, 'Öğretmen hesabınız onaylı değil.');
  const kurumId = kurumSupported && t && t.kurum_id ? String(t.kurum_id) : null;
  return {
    token,
    authId: user.id,
    teacherId: t ? t.id : null,
    name: (t && t.name) || 'Öğretmen',
    email: ((t && t.email) || user.email || '').trim(),
    // Tam yetki: genel yönetici. Kurum yöneticisi yalnızca kendi kurumunun öğretmenleri adına işlem yapabilir.
    isAdmin,
    isKurumAdmin: !isAdmin && !!kurumId && !!(t && t.is_admin),
    kurumId,
  };
}

// Çağıran, verilen öğretmen adına işlem yapabilir mi? (genel yönetici: herkes; kurum yöneticisi: kendi kurumu)
async function managesTeacher(caller, { teacherId, authId }) {
  if (caller.isAdmin) return true;
  if (!caller.isKurumAdmin || !caller.kurumId) return false;
  const q = teacherId ? `id=eq.${encodeURIComponent(teacherId)}` : authId ? `auth_user_id=eq.${encodeURIComponent(authId)}` : '';
  if (!q) return false;
  try {
    const r = await rest(`teachers?select=kurum_id&${q}`, { token: 'service' });
    return !!(r && r[0] && r[0].kurum_id && String(r[0].kurum_id) === caller.kurumId);
  } catch {
    return false;
  }
}

// ----------------------------------------------------------------------------- Şifreleme (öğretmen Gmail uygulama şifresi)
function cryptoKey() {
  const e = env();
  const base = e.secretKey || `teacher-mail:${e.service}`;
  return crypto.createHash('sha256').update(base).digest();
}
function encryptSecret(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', cryptoKey(), iv, {
    authTagLength: 16,
  });
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return 'v1:' + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}
function decryptSecret(blob) {
  try {
    if (!blob || !blob.startsWith('v1:')) return null;
    const raw = Buffer.from(blob.slice(3), 'base64');
    if (raw.length < 29) return null;
    const d = crypto.createDecipheriv('aes-256-gcm', cryptoKey(), raw.subarray(0, 12), { authTagLength: 16 });
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------------------- SMTP (Gmail, port 465, TLS)
class SmtpClient {
  constructor(opts) {
    this.opts = opts;
    this.buf = '';
    this.lines = [];
    this.waiter = null;
    this.closedError = null;
  }
  connect() {
    const { host, port, insecure } = this.opts;
    return new Promise((resolve, reject) => {
      const sock = tls.connect({
        host,
        port,
        servername: host,
        rejectUnauthorized: !insecure,
      });
      this.sock = sock;
      sock.setEncoding('utf8');
      sock.setTimeout(SOCKET_TIMEOUT_MS, () => sock.destroy(new Error('E-posta sunucusu zaman aşımına uğradı')));
      sock.on('data', (d) => this.onData(d));
      sock.on('error', (err) => {
        this.closedError = err;
        if (this.waiter) {
          const w = this.waiter;
          this.waiter = null;
          w.reject(err);
        }
        reject(err);
      });
      sock.on('close', () => {
        if (!this.closedError) this.closedError = new Error('E-posta sunucusu bağlantıyı kapattı');
        reject(this.closedError); // bağlantı kurulmadan kapanırsa beklemede kalma
        if (this.waiter) {
          const w = this.waiter;
          this.waiter = null;
          w.reject(this.closedError);
        }
      });
      sock.once('secureConnect', async () => {
        try {
          await this.expect(220);
          await this.command('EHLO bilir-hoca.local', 250);
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });
  }
  onData(d) {
    this.buf += d;
    let idx;
    while ((idx = this.buf.indexOf('\r\n')) >= 0) {
      const line = this.buf.slice(0, idx);
      this.buf = this.buf.slice(idx + 2);
      this.lines.push(line);
      if (/^\d{3} /.test(line) || /^\d{3}$/.test(line)) {
        const reply = {
          code: Number(line.slice(0, 3)),
          text: this.lines.join('\n'),
        };
        this.lines = [];
        if (this.waiter) {
          const w = this.waiter;
          this.waiter = null;
          w.resolve(reply);
        } else {
          this.pending = reply;
        }
      }
    }
  }
  readReply() {
    if (this.pending) {
      const p = this.pending;
      this.pending = null;
      return Promise.resolve(p);
    }
    if (this.closedError) return Promise.reject(this.closedError);
    return new Promise((resolve, reject) => {
      this.waiter = { resolve, reject };
    });
  }
  async expect(codes) {
    const list = Array.isArray(codes) ? codes : [codes];
    const reply = await this.readReply();
    if (!list.includes(reply.code)) {
      const err = new Error(reply.text.replace(/\s+/g, ' ').slice(0, 240));
      err.smtpCode = reply.code;
      throw err;
    }
    return reply;
  }
  async command(line, codes) {
    this.sock.write(line + '\r\n');
    return this.expect(codes);
  }
  async login(user, pass) {
    const token = Buffer.from(`\u0000${user}\u0000${pass}`, 'utf8').toString('base64');
    try {
      await this.command(`AUTH PLAIN ${token}`, 235);
    } catch (err) {
      const e2 = new Error(
        err.smtpCode === 535 || err.smtpCode === 534
          ? 'Gmail girişi reddedildi: adres veya uygulama şifresi hatalı (normal Gmail şifresi çalışmaz).'
          : `Gmail girişi başarısız: ${err.message}`,
      );
      e2.auth = true;
      throw e2;
    }
  }
  async sendRaw(from, to, data) {
    try {
      await this.command(`MAIL FROM:<${from}>`, 250);
      await this.command(`RCPT TO:<${to}>`, [250, 251]);
      await this.command('DATA', 354);
      const body = data.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');
      await this.command(`${body}\r\n.`, 250);
    } catch (err) {
      try {
        if (!this.closedError) await this.command('RSET', 250);
      } catch {}
      throw err;
    }
  }
  async quit() {
    try {
      if (!this.closedError) await this.command('QUIT', 221);
    } catch {}
    try {
      this.sock.end();
    } catch {}
  }
}

// ----------------------------------------------------------------------------- MIME
const clean = (s) =>
  String(s == null ? '' : s)
    .replace(/[\r\n\t]+/g, ' ')
    .trim();
const EMAIL_RE = /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const isEmail = (s) => typeof s === 'string' && EMAIL_RE.test(s.trim());

function encodeWord(s) {
  const text = clean(s).slice(0, 400);
  if (/^[\x20-\x7e]*$/.test(text) && text.length <= 70) return text;
  const words = [];
  let cur = '';
  for (const ch of text) {
    if (Buffer.byteLength(cur + ch, 'utf8') > 42) {
      words.push(cur);
      cur = '';
    }
    cur += ch;
  }
  if (cur) words.push(cur);
  return words.map((w) => `=?UTF-8?B?${Buffer.from(w, 'utf8').toString('base64')}?=`).join('\r\n ');
}
function addressHeader(name, addr) {
  const n = clean(name);
  if (!n) return `<${addr}>`;
  if (/^[\x20-\x7e]*$/.test(n) && n.length <= 60) return `"${n.replace(/["\\]/g, '')}" <${addr}>`;
  return `${encodeWord(n)} <${addr}>`;
}
const b64lines = (s) =>
  Buffer.from(s, 'utf8')
    .toString('base64')
    .replace(/.{1,76}/g, '$&\r\n');

function buildMessage({ fromName, fromAddr, toName, toAddr, replyTo, subject, text, html }) {
  const boundary = 'b_' + crypto.randomBytes(12).toString('hex');
  const domain = (fromAddr.split('@')[1] || 'mail.local').replace(/[^\w.-]/g, '');
  const headers = [
    `From: ${addressHeader(fromName, fromAddr)}`,
    `To: ${addressHeader(toName, toAddr)}`,
    replyTo ? `Reply-To: ${replyTo}` : null,
    `Subject: ${encodeWord(subject)}`,
    `Date: ${new Date().toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${crypto.randomBytes(16).toString('hex')}@${domain}>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].filter(Boolean);
  return (
    headers.join('\r\n') +
    '\r\n\r\n' +
    `--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64lines(text)}` +
    `--${boundary}\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64lines(html)}` +
    `--${boundary}--\r\n`
  );
}

// ----------------------------------------------------------------------------- Biçimlendirme ve şablonlar
const esc = (s) =>
  String(s == null ? '' : s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const GUNLER = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
// "2026-12-01T20:59:00.000Z" gibi saat dilimli metni İstanbul yerel "2026-12-01T23:59" biçimine çevirir
function toIstanbulLocal(str) {
  const s = String(str || '');
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(s)) return s;
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  const parts = Object.fromEntries(
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
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
function trDate(dateStr, timeStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(toIstanbulLocal(dateStr));
  if (!m) return clean(dateStr) || '-';
  const [, y, mo, d, hh, mm] = m;
  const day = GUNLER[new Date(Date.UTC(+y, +mo - 1, +d)).getUTCDay()];
  const time = timeStr || (hh ? `${hh}:${mm}` : '');
  return `${+d} ${AYLAR[+mo - 1]} ${y} ${day}${time ? `, saat ${time}` : ''}`;
}
function endTime(time, minutes) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(time || ''));
  if (!m) return '';
  const total = +m[1] * 60 + +m[2] + (Number(minutes) || 0);
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function layout({ heading, greeting, intro, rows = [], extraHtml = '', extraText = '', buttonLabel, url, footer }) {
  const e = env();
  const rowsHtml = rows
    .filter((r) => r && r[1] !== undefined && r[1] !== null && String(r[1]).trim() !== '')
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 12px;color:#64748b;font-size:13px;white-space:nowrap;vertical-align:top;border-bottom:1px solid #eef0f5">${esc(k)}</td>` +
        `<td style="padding:8px 12px;color:#0f172a;font-size:14px;font-weight:600;border-bottom:1px solid #eef0f5">${esc(v).replace(/\n/g, '<br>')}</td></tr>`,
    )
    .join('');
  const html = `<!doctype html><html lang="tr"><body style="margin:0;padding:0;background:#f5f6fa;font-family:Segoe UI,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6fa;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e3e6ef;border-radius:16px;overflow:hidden">
<tr><td style="background:#4f46e5;padding:18px 24px;color:#ffffff;font-size:13px;font-weight:600;letter-spacing:.3px">${esc(e.schoolName)}</td></tr>
<tr><td style="padding:24px 24px 8px">
<h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:#0f172a">${esc(heading)}</h1>
${greeting ? `<p style="margin:0 0 8px;font-size:14px;color:#334155">${esc(greeting)}</p>` : ''}
${intro ? `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#334155">${esc(intro)}</p>` : ''}
${rowsHtml ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eef0f5;border-radius:12px;border-collapse:separate;overflow:hidden">${rowsHtml}</table>` : ''}
${extraHtml}
${url && buttonLabel ? `<p style="margin:20px 0 4px"><a href="${esc(url)}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:11px 20px;border-radius:10px">${esc(buttonLabel)}</a></p>` : ''}
</td></tr>
<tr><td style="padding:16px 24px 22px;color:#94a3b8;font-size:12px;line-height:1.5">${esc(footer || 'Bu e-posta okul takip sistemi tarafından otomatik gönderilmiştir.')}</td></tr>
</table></td></tr></table></body></html>`;
  const text = [
    heading,
    '',
    greeting,
    intro,
    '',
    ...rows.filter((r) => r && r[1] !== undefined && r[1] !== null && String(r[1]).trim() !== '').map(([k, v]) => `${k}: ${v}`),
    extraText ? `\n${extraText}` : '',
    url ? `\n${buttonLabel || 'Sisteme git'}: ${url}` : '',
    '',
    footer || 'Bu e-posta okul takip sistemi tarafından otomatik gönderilmiştir.',
  ]
    .filter((x) => x !== undefined && x !== null)
    .join('\n');
  return { html, text };
}

function studentListBlock(students) {
  if (!students.length) return { html: '', text: '' };
  const items = students.slice(0, 60).map((s) => `${s.name}${s.class_name ? ` (${s.class_name})` : ''}`);
  const more = students.length > 60 ? `… ve ${students.length - 60} öğrenci daha` : '';
  return {
    html:
      `<p style="margin:18px 0 6px;font-size:13px;font-weight:700;color:#0f172a">Öğrenciler (${students.length})</p>` +
      `<ol style="margin:0;padding-left:20px;font-size:13px;line-height:1.7;color:#334155">${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ol>` +
      (more ? `<p style="margin:4px 0 0;font-size:12px;color:#64748b">${esc(more)}</p>` : ''),
    text: `Öğrenciler (${students.length}):\n${items.map((i, n) => `${n + 1}. ${i}`).join('\n')}${more ? `\n${more}` : ''}`,
  };
}

function homeworkMail(hw, student, teacherName, url, reminder) {
  const resources = arr(hw.resources_titles);
  const outcomes = arr(hw.learning_outcomes);
  const subject = reminder
    ? `Hatırlatma: "${clean(hw.title)}" ödevinin son günü yarın`
    : `Yeni ödev: ${clean(hw.subject)} – ${clean(hw.title)}`;
  const body = layout({
    heading: reminder ? 'Ödev teslim hatırlatması' : 'Yeni bir ödeviniz var',
    greeting: `Merhaba ${clean(student.name)},`,
    intro: reminder
      ? 'Aşağıdaki ödevin son teslim günü yarın. Henüz teslim etmediysen sisteme girip teslim etmeyi unutma.'
      : `${teacherName} öğretmeniniz size yeni bir ödev verdi.`,
    rows: [
      ['Ders', hw.subject],
      ['Ödev', hw.title],
      ['Son teslim', trDate(hw.due_date)],
      ['Öğretmen', teacherName],
      ['Açıklama', clean(hw.description).slice(0, 600)],
      ['Kazanımlar', outcomes.join(', ')],
      ['Ekler', resources.length ? `${resources.length} kaynak (sistemde açabilirsiniz)` : ''],
    ],
    buttonLabel: 'Ödevi sistemde aç',
    url,
  });
  return { subject, ...body };
}

function etutRows(etut, teacherName) {
  const end = endTime(etut.time, etut.duration);
  return [
    ['Ders', etut.subject],
    ['Konu', etut.topic],
    ['Tarih', trDate(etut.date)],
    ['Saat', clean(etut.time) ? `${clean(etut.time)}${end ? ` – ${end}` : ''} (${Number(etut.duration) || 45} dk)` : 'Belirtilmedi'],
    ['Yer', etut.location],
    ['Etüt öğretmeni', teacherName],
    ['Not', clean(etut.userNotes).slice(0, 400)],
  ];
}
function etutStudentMail(etut, student, teacherName, url, scheduled) {
  const body = layout({
    heading: scheduled ? 'Etüdün yaklaşıyor' : 'Yeni etüt planlandı',
    greeting: `Merhaba ${clean(student.name)},`,
    intro: scheduled
      ? 'Aşağıdaki etüdün yakında başlayacak. Lütfen zamanında katıl.'
      : 'Senin için aşağıdaki etüt planlandı. Lütfen zamanında katıl.',
    rows: etutRows(etut, teacherName),
    buttonLabel: 'Sistemde görüntüle',
    url,
  });
  return {
    subject: `${scheduled ? 'Etüt hatırlatması' : 'Etüt'}: ${clean(etut.subject)} – ${trDate(etut.date, etut.time)}`,
    ...body,
  };
}
function etutTeacherMail(kind, etut, teacher, students, creatorName, url, changes) {
  const list = studentListBlock(students);
  const titles = {
    'etut-created': ['Size yeni bir etüt atandı', `Size etüt atandı: ${clean(etut.subject)} – ${trDate(etut.date, etut.time)}`],
    'etut-scheduled': ['Etüdünüz yaklaşıyor', `Etüt hatırlatması: ${clean(etut.subject)} – ${trDate(etut.date, etut.time)}`],
    'etut-assigned': ['Size bir etüt atandı', `Size etüt atandı: ${clean(etut.subject)} – ${trDate(etut.date, etut.time)}`],
    'etut-changed': ['Etüt bilgileri değişti', `Etüt güncellendi: ${clean(etut.subject)} – ${trDate(etut.date, etut.time)}`],
    'etut-cancelled': ['Etüt iptal edildi', `Etüt iptal edildi: ${clean(etut.subject)} – ${trDate(etut.date, etut.time)}`],
    'etut-attendance': ['Etüt yoklama bağlantınız', `Yoklama bağlantısı: ${clean(etut.subject)} – ${trDate(etut.date, etut.time)}`],
    'etut-unassigned': [
      'Etüt artık size atanmış değil',
      `Etüt başka öğretmene verildi: ${clean(etut.subject)} – ${trDate(etut.date, etut.time)}`,
    ],
  };
  const [heading, subject] = titles[kind];
  const intros = {
    'etut-created': `${creatorName} tarafından size aşağıdaki etüt atandı.`,
    'etut-scheduled': 'Aşağıdaki etüdünüz yakında başlayacak. Etüt sonrası yoklamayı aşağıdaki düğmeyle alabilirsiniz; sisteme giriş yapmanız gerekmez.',
    'etut-assigned': `${creatorName} aşağıdaki etüdü size atadı.`,
    'etut-changed': `${creatorName} aşağıdaki etüdün bilgilerini değiştirdi.`,
    'etut-cancelled': `${creatorName} aşağıdaki etüdü iptal etti. Etüt yapılmayacaktır.`,
    'etut-attendance': `${creatorName} aşağıdaki etüdün yoklamasını almanızı istiyor. Etüt günü aşağıdaki düğmeye dokunun; sisteme giriş yapmanız gerekmez.`,
    'etut-unassigned': `${creatorName} aşağıdaki etüdü başka bir öğretmene verdi; bu etüde girmenize gerek yok.`,
  };
  let changesHtml = '';
  let changesText = '';
  if (kind === 'etut-changed' && changes && changes.length) {
    changesHtml =
      `<p style="margin:18px 0 6px;font-size:13px;font-weight:700;color:#0f172a">Değişenler</p><ul style="margin:0;padding-left:20px;font-size:13px;line-height:1.7;color:#334155">` +
      changes
        .map((c) => `<li>${esc(c.label)}: <s style="color:#94a3b8">${esc(c.from || '-')}</s> → <b>${esc(c.to || '-')}</b></li>`)
        .join('') +
      '</ul>';
    changesText = 'Değişenler:\n' + changes.map((c) => `- ${c.label}: ${c.from || '-'} → ${c.to || '-'}`).join('\n');
  }
  const showStudents = kind !== 'etut-cancelled' && kind !== 'etut-unassigned';
  const body = layout({
    heading,
    greeting: `Merhaba ${clean(teacher.name)},`,
    intro: intros[kind],
    rows: etutRows(etut, etut.teacherIds && etut.teacherIds.length > 1 && etut.teacherName ? etut.teacherName : teacher.name),
    // Aşama 16: her öğretmene bu etüde özel, girişsiz yoklama bağlantısı
    buttonLabel: showStudents ? 'Yoklamayı al' : undefined,
    url: showStudents ? attendanceUrl(url, etut.id, teacher.id) : undefined,
    extraText: [changesText, showStudents ? list.text : '', showStudents ? ATTENDANCE_HINT : ''].filter(Boolean).join('\n\n'),
    extraHtml:
      changesHtml +
      (showStudents ? list.html : '') +
      (showStudents ? `<p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:#64748b">${esc(ATTENDANCE_HINT)}</p>` : ''),
  });
  return { subject, ...body };
}

// ----------------------------------------------------------------------------- Girişsiz etüt yoklaması (Aşama 16)
// Bağlantı yalnızca o etüdü ve o öğretmeni içerir, sunucunun gizli anahtarıyla imzalanır (değiştirilemez).
// Öğretmen etütten çıkarılırsa ya da etüt silinirse bağlantı çalışmaz. Yoklama etüt gününden
// itibaren 3 gün kaydedilebilir; bağlantı en geç 60 gün sonra tamamen geçersiz olur.
const ATTENDANCE_HINT =
  'Yoklama bağlantısı yalnız bu etüt içindir ve kişiseldir; başkasıyla paylaşmayın. Yoklama etüt gününden itibaren 3 gün içinde kaydedilebilir.';
const ATT_TOKEN_DAYS = 60;
const ATT_SAVE_DAYS = 3;
const ATT_STATUSES = new Set(['present', 'absent', 'late']);
function b64u(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function attendanceKey() {
  const e = env();
  const base = e.secretKey || e.service;
  if (!base) throw new HttpError(503, 'Sunucu ayarları eksik (SUPABASE_SERVICE_ROLE_KEY).');
  return crypto.createHash('sha256').update(`etut-attendance:${base}`).digest();
}
function makeAttendanceToken(etutId, teacherId) {
  const payload = b64u(JSON.stringify({ e: String(etutId), t: String(teacherId), x: Math.floor(Date.now() / 1000) + ATT_TOKEN_DAYS * 86400 }));
  const sig = b64u(crypto.createHmac('sha256', attendanceKey()).update(payload).digest());
  return `${payload}.${sig}`;
}
function attendanceUrl(base, etutId, teacherId) {
  if (!base || !etutId || !teacherId) return undefined;
  try {
    return `${String(base).replace(/\/+$/, '')}/?yoklama=${makeAttendanceToken(etutId, teacherId)}`;
  } catch {
    return undefined;
  }
}
function readAttendanceToken(token) {
  if (typeof token !== 'string' || token.length > 800 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))
    throw new HttpError(400, 'Yoklama bağlantısı geçersiz. Bağlantıyı e-postadan eksiksiz açtığınızdan emin olun.');
  const [payload, sig] = token.split('.');
  const expected = b64u(crypto.createHmac('sha256', attendanceKey()).update(payload).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b))
    throw new HttpError(400, 'Yoklama bağlantısı geçersiz. Bağlantıyı e-postadan eksiksiz açtığınızdan emin olun.');
  let data;
  try {
    data = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  } catch {
    throw new HttpError(400, 'Yoklama bağlantısı geçersiz.');
  }
  if (!data || typeof data.e !== 'string' || typeof data.t !== 'string') throw new HttpError(400, 'Yoklama bağlantısı geçersiz.');
  if (!(Number(data.x) > Date.now() / 1000)) throw new HttpError(410, 'Bu yoklama bağlantısının süresi dolmuş.');
  return { etutId: data.e, teacherId: data.t };
}
function istanbulToday() {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}
async function loadAttendanceContext(token) {
  const { etutId, teacherId } = readAttendanceToken(token);
  const rows = await rest(`etuts?select=*&id=eq.${encodeURIComponent(etutId)}`, { token: 'service' });
  const row = rows && rows[0];
  if (!row) throw new HttpError(404, 'Bu etüt silinmiş ya da bulunamadı.');
  const etut = etutView(row);
  if (!etut.teacherIds.includes(teacherId)) throw new HttpError(403, 'Bu etüde artık atanmış değilsiniz; bağlantı geçersiz.');
  const teacher = await resolveEtutTeacher(teacherId, null);
  const meta = parseEtutMeta(row);
  const students = (await studentsByIds(etut.studentIds, 'service')).sort((x, y) => String(x.name || '').localeCompare(String(y.name || ''), 'tr'));
  const today = istanbulToday();
  const date = String(etut.date || '').slice(0, 10);
  const last = addDaysYmd(date, ATT_SAVE_DAYS);
  let canSave = true;
  let reason = '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    canSave = false;
    reason = 'Etüt tarihi okunamadı.';
  } else if (today < date) {
    canSave = false;
    reason = `Yoklama etüt günü (${trDate(date)}) alınabilir. Listeyi şimdiden görebilirsiniz.`;
  } else if (today > last) {
    canSave = false;
    reason = 'Yoklama süresi doldu (etüt gününden itibaren 3 gün). Değişiklik için etüdü oluşturan öğretmene başvurun.';
  }
  if (!students.length) {
    canSave = false;
    reason = reason || 'Bu etütte kayıtlı öğrenci bulunamadı.';
  }
  return { row, etut, meta, teacher, teacherId, students, canSave, reason };
}
async function actionAttendanceGet(body) {
  const c = await loadAttendanceContext(body.token);
  const att = (c.meta && typeof c.meta.studentAttendance === 'object' && c.meta.studentAttendance) || {};
  return {
    ok: true,
    etut: {
      subject: clean(c.etut.subject),
      topic: clean(c.etut.topic),
      date: c.etut.date,
      time: clean(c.etut.time),
      duration: Number(c.etut.duration) || 45,
      location: clean(c.etut.location),
      teacherNames: clean(c.etut.teacherName),
    },
    teacherName: (c.teacher && c.teacher.name) || '',
    students: c.students.map((s) => ({ id: s.id, name: clean(s.name), className: clean(s.class_name) })),
    attendance: Object.fromEntries(
      Object.entries(att)
        .filter(([, v]) => v && typeof v.status === 'string')
        .map(([k, v]) => [k, v.status])
    ),
    takenBy: c.meta && c.meta.attendanceTakenBy ? { name: clean(c.meta.attendanceTakenBy.name), at: c.meta.attendanceTakenBy.at || null } : null,
    canSave: c.canSave,
    reason: c.reason,
  };
}
async function actionAttendanceSave(body) {
  const c = await loadAttendanceContext(body.token);
  if (!c.canSave) throw new HttpError(409, c.reason || 'Yoklama şu anda kaydedilemez.');
  const records = body.records && typeof body.records === 'object' ? body.records : {};
  const byId = new Map(c.students.map((s) => [s.id, s]));
  const entries = Object.entries(records).filter(([id]) => byId.has(id));
  if (!entries.length) throw new HttpError(400, 'Yoklama boş. Öğrencilerin durumunu seçin.');
  for (const [, st] of entries) if (!ATT_STATUSES.has(st)) throw new HttpError(400, 'Geçersiz yoklama durumu.');
  const now = new Date().toISOString();
  const teacherName = (c.teacher && c.teacher.name) || 'Etüt öğretmeni';
  const prev = (c.meta && typeof c.meta.studentAttendance === 'object' && c.meta.studentAttendance) || {};
  const next = { ...prev };
  for (const [id, status] of entries) {
    const s = byId.get(id);
    next[id] = { ...(prev[id] || {}), studentId: id, studentName: s.name, status, note: (prev[id] && prev[id].note) || '', markedAt: now, updatedAt: now, markedBy: teacherName };
  }
  const meta = { ...(c.meta || {}), __etut_meta__: true, studentAttendance: next, attendanceTakenBy: { name: teacherName, at: now, via: 'link' } };
  await rest(`etuts?id=eq.${encodeURIComponent(c.etut.id)}`, {
    token: 'service',
    method: 'PATCH',
    body: { notes: JSON.stringify(meta) },
    prefer: 'return=minimal',
  });
  // Öğrencinin genel devamsızlık kaydına da yansıt (sistemdeki yoklama penceresiyle aynı kural)
  try {
    const first = c.students.find((s) => next[s.id]);
    const classId = (first && first.class_id) || 'class-etut-general';
    const subject = `${c.etut.subject} (Etüt)`;
    const found = await rest(
      `attendance?select=id&date=eq.${encodeURIComponent(c.etut.date)}&class_id=eq.${encodeURIComponent(classId)}&subject=eq.${encodeURIComponent(subject)}`,
      { token: 'service' }
    );
    const id = (found && found[0] && found[0].id) || `att-${Date.now()}`;
    const recs = Object.entries(next).map(([sid, v]) => ({
      studentId: sid,
      studentName: (v && v.studentName) || (byId.get(sid) && byId.get(sid).name) || 'Öğrenci',
      status: v && v.status,
      note: (v && v.note) || `Etüt: ${c.etut.topic || c.etut.subject}`,
    }));
    await rest('attendance?on_conflict=id', {
      token: 'service',
      method: 'POST',
      body: [{ id, class_id: classId, date: c.etut.date, subject, records: recs }],
      prefer: 'resolution=merge-duplicates,return=minimal',
    });
  } catch (err) {
    console.warn('[yoklama] genel devamsızlık kaydı yazılamadı:', err && err.message);
  }
  return { ok: true, saved: entries.length, at: now };
}

// Etüdü oluşturan (veya yönetici) atanmış öğretmenlere yoklama bağlantısını yeniden gönderir
async function actionEtutAttendanceLink(caller, body, req, deadline) {
  const row = await fetchVisible('etuts', body.etutId, caller.token);
  const etut = etutView(row);
  if (
    etut.createdById &&
    caller.teacherId &&
    etut.createdById !== caller.teacherId &&
    !etut.teacherIds.includes(caller.teacherId) &&
    !(await managesTeacher(caller, { teacherId: etut.createdById }))
  ) {
    throw new HttpError(403, 'Bu etüdün yoklama bağlantısını yalnızca etüdü oluşturan öğretmen gönderebilir.');
  }
  const teachers = await resolveEtutTeachers(etut.teacherIds, etut.teacherName);
  const students = await studentsByIds(etut.studentIds, caller.token);
  const url = appUrl(req);
  const items = [];
  const notes = [];
  for (const t of teachers) {
    if (t.authId && t.authId === caller.authId) {
      notes.push({ status: 'self', name: t.name });
      continue;
    }
    if (!isEmail(t.email)) {
      notes.push({ status: 'no-email', name: t.name });
      continue;
    }
    items.push({
      event: 'etut-attendance',
      refId: etut.id,
      refTitle: `${etut.subject} – ${etut.topic}`,
      to: t.email,
      toName: t.name,
      role: 'ogretmen',
      ...etutTeacherMail('etut-attendance', etut, t, students, caller.name, url),
    });
    notes.push({ status: 'queued', name: t.name });
  }
  const sender = await resolveSender(caller);
  const summary = await deliver(sender, caller, items, deadline);
  return { ok: true, total: items.length, teachers: notes, ...summary };
}

// ----------------------------------------------------------------------------- Gönderen hesap
async function resolveSender(teacher) {
  const e = env();
  if (teacher.authId) {
    try {
      const rows = await rest(`teacher_mail_accounts?select=gmail,secret&teacher_auth_id=eq.${teacher.authId}`, {
        token: 'service',
      });
      const row = rows && rows[0];
      const pass = row ? decryptSecret(row.secret) : null;
      if (row && pass)
        return {
          via: 'ogretmen',
          user: row.gmail,
          pass,
          fromName: teacher.name,
          replyTo: null,
        };
    } catch {}
  }
  if (e.gmailUser && e.gmailPass) {
    const replyTo = isEmail(teacher.email) && teacher.email.toLowerCase() !== e.gmailUser.toLowerCase() ? teacher.email : null;
    return {
      via: 'okul',
      user: e.gmailUser,
      pass: e.gmailPass,
      fromName: teacher.name || e.schoolName,
      replyTo,
    };
  }
  return null;
}

async function openSmtp(sender) {
  const e = env();
  const client = new SmtpClient({
    host: e.smtpHost,
    port: e.smtpPort,
    insecure: e.smtpInsecure,
  });
  await client.connect();
  await client.login(sender.user, sender.pass);
  return client;
}

// items: [{ event, refId, refTitle, to, toName, role, subject, html, text }]
async function deliver(sender, senderMeta, items, deadline) {
  const summary = {
    sent: 0,
    failed: 0,
    skipped: 0,
    noEmail: 0,
    noEmailNames: [],
    remaining: 0,
    errors: [],
    via: sender ? sender.via : null,
  };
  const valid = [];
  for (const it of items) {
    if (!isEmail(it.to)) {
      summary.noEmail++;
      if (summary.noEmailNames.length < 40) summary.noEmailNames.push(it.toName);
    } else valid.push({ ...it, to: it.to.trim().toLowerCase() });
  }
  // Daha önce gönderilmiş "tek seferlik" e-postaları baştan ele (bağlantı açmadan)
  const onceGroups = new Map();
  for (const it of valid)
    if (ONCE_EVENTS.has(it.event))
      onceGroups.set(`${it.event}|${it.refId}`, {
        event: it.event,
        refId: it.refId,
      });
  const already = new Set();
  for (const g of onceGroups.values()) {
    const rows = await rest(
      `mail_log?select=recipient&status=in.(sent,sending)&event=eq.${encodeURIComponent(g.event)}&ref_id=eq.${encodeURIComponent(g.refId)}`,
      { token: 'service' },
    );
    for (const r of rows || []) already.add(`${g.event}|${g.refId}|${r.recipient}`);
  }
  // Tekrarlanabilen (değişti/iptal) e-postalarda günlük sınır
  const since = new Date(Date.now() - 86400000).toISOString();
  const queue = [];
  const seen = new Set();
  for (const it of valid) {
    const k = `${it.event}|${it.refId}|${it.to}`;
    if (seen.has(k)) continue;
    seen.add(k);
    if (ONCE_EVENTS.has(it.event)) {
      if (already.has(k)) {
        summary.skipped++;
        continue;
      }
    } else if (it.refId) {
      const prev = await rest(
        `mail_log?select=id&status=eq.sent&event=eq.${encodeURIComponent(it.event)}&ref_id=eq.${encodeURIComponent(it.refId)}&recipient=eq.${encodeURIComponent(it.to)}&created_at=gte.${encodeURIComponent(since)}&limit=${it.repeatLimit || REPEAT_LIMIT_PER_DAY}`,
        { token: 'service' },
      );
      if ((prev || []).length >= (it.repeatLimit || REPEAT_LIMIT_PER_DAY)) {
        summary.skipped++;
        summary.rateLimited = true;
        continue;
      }
    }
    queue.push(it);
  }
  if (queue.length === 0) return summary;
  if (!sender) {
    summary.notConfigured = true;
    summary.remaining = queue.length;
    return summary;
  }
  // Öğretmen başına saatlik sınır (hesabın Gmail tarafından kapatılmasını önler)
  if (senderMeta.authId) {
    const hourAgo = new Date(Date.now() - 3600000).toISOString();
    const recent = await rest(
      `mail_log?select=id&sender_auth_id=eq.${senderMeta.authId}&created_at=gte.${encodeURIComponent(hourAgo)}&limit=${HOURLY_LIMIT_PER_SENDER}`,
      { token: 'service' },
    );
    if ((recent || []).length + queue.length > HOURLY_LIMIT_PER_SENDER) {
      summary.failed = queue.length;
      summary.errors.push(`Saatlik e-posta sınırına ulaşıldı (${HOURLY_LIMIT_PER_SENDER}). Bir saat sonra tekrar deneyin.`);
      return summary;
    }
  }

  let client;
  try {
    client = await openSmtp(sender);
  } catch (err) {
    summary.failed = queue.length;
    summary.errors.push(err.message);
    summary.authError = !!err.auth;
    return summary;
  }
  try {
    for (let i = 0; i < queue.length; i++) {
      const it = queue[i];
      if (Date.now() > deadline) {
        summary.remaining = queue.length - i;
        break;
      }
      // Tek seferlik e-postada önce "gönderiliyor" kaydı alınır: aynı anda iki çağrı aynı kişiye iki kez gönderemez
      let claimId = null;
      if (ONCE_EVENTS.has(it.event)) {
        claimId = await claimMail(senderMeta, sender, it);
        if (claimId === 'taken') {
          summary.skipped++;
          continue;
        }
      }
      let status = 'sent';
      let error = null;
      try {
        const msg = buildMessage({
          fromName: sender.fromName,
          fromAddr: sender.user,
          toName: it.toName,
          toAddr: it.to,
          replyTo: sender.replyTo,
          subject: it.subject,
          text: it.text,
          html: it.html,
        });
        await client.sendRaw(sender.user, it.to, msg);
        summary.sent++;
      } catch (err) {
        status = 'failed';
        error = String(err.message || err).slice(0, 300);
        summary.failed++;
        if (summary.errors.length < 5) summary.errors.push(`${it.toName || it.to}: ${error}`);
      }
      if (claimId) await finishClaim(claimId, status, error);
      else await logMail(senderMeta, sender, it, status, error);
      if (status === 'failed' && client.closedError) {
        // bağlantı koptu: yeniden bağlanmayı bir kez dene
        try {
          client = await openSmtp(sender);
        } catch {
          summary.remaining = queue.length - i - 1;
          break;
        }
      }
    }
  } finally {
    if (client) await client.quit();
  }
  return summary;
}

function logBody(senderMeta, sender, it, status, error) {
  return {
    sender_auth_id: senderMeta.authId || null,
    sender_name: senderMeta.name || null,
    via: sender ? sender.via : null,
    event: it.event,
    ref_id: it.refId || null,
    ref_title: (it.refTitle || '').slice(0, 200),
    recipient: it.to,
    recipient_name: it.toName || null,
    recipient_role: it.role || null,
    subject: (it.subject || '').slice(0, 250),
    status,
    error,
  };
}
async function claimMail(senderMeta, sender, it) {
  try {
    const rows = await rest('mail_log', {
      token: 'service',
      method: 'POST',
      prefer: 'return=representation',
      body: logBody(senderMeta, sender, it, 'sending', null),
    });
    return rows && rows[0] ? rows[0].id : null;
  } catch (err) {
    if (err.status === 409) return 'taken';
    console.error('[mail] kayıt alınamadı:', err.message);
    return null;
  }
}
async function finishClaim(id, status, error) {
  try {
    await rest(`mail_log?id=eq.${Number(id)}`, {
      token: 'service',
      method: 'PATCH',
      prefer: 'return=minimal',
      body: { status, error },
    });
  } catch (err) {
    console.error('[mail] kayıt güncellenemedi:', err.message);
  }
}
async function logMail(senderMeta, sender, it, status, error) {
  try {
    await rest('mail_log', {
      token: 'service',
      method: 'POST',
      prefer: 'return=minimal',
      body: logBody(senderMeta, sender, it, status, error),
    });
  } catch (err) {
    if (err.status !== 409) console.error('[mail] kayıt yazılamadı:', err.message);
  }
}

// ----------------------------------------------------------------------------- Veri yardımcıları
// Öğrenciler, isteği yapan öğretmenin kendi oturumuyla okunur: veritabanı kuralları (RLS) öğretmenin
// erişemediği öğrencileri zaten döndürmez. Zamanlanmış görevde (hatırlatma) 'service' kullanılır.
async function studentsByIds(ids, token) {
  if (!ids.length) return [];
  const out = [];
  for (let i = 0; i < ids.length; i += 100) {
    const part = ids.slice(i, i + 100);
    const rows = await rest(`students?select=id,name,email,class_id,class_name,status&id=in.${inList(part)}`, { token });
    out.push(...(rows || []));
  }
  return out.filter((s) => !s.status || s.status === 'active');
}
async function studentsByClasses(classIds, token) {
  if (!classIds.length) return [];
  const rows = await rest(`students?select=id,name,email,class_id,class_name,status&class_id=in.${inList(classIds)}`, { token });
  return (rows || []).filter((s) => !s.status || s.status === 'active');
}
// Ödevin hedefi yalnızca veritabanının denetlediği target_* sütunlarından okunur
async function homeworkStudents(hw, token) {
  const ids = arr(hw.target_student_ids);
  if (ids.length) return studentsByIds(ids, token);
  return studentsByClasses(arr(hw.target_class_ids), token);
}
function parseEtutMeta(row) {
  try {
    if (row.notes && typeof row.notes === 'object') return row.notes;
    if (typeof row.notes === 'string' && row.notes.trim().startsWith('{')) return JSON.parse(row.notes);
  } catch {}
  return { userNotes: typeof row.notes === 'string' ? row.notes : '' };
}
function etutView(row) {
  const meta = parseEtutMeta(row);
  return {
    id: row.id,
    subject: row.subject,
    topic: row.topic,
    date: row.date,
    time: row.time,
    duration: row.duration,
    location: row.location,
    userNotes: meta.userNotes || '',
    teacherId: row.etut_teacher_id || meta.teacherId || null,
    teacherName: meta.teacherName || '',
    // Aşama 14: birden çok öğretmen (ilk sıradaki = teacherId)
    teacherIds: uniqIds([row.etut_teacher_id || meta.teacherId, ...arr(row.etut_teacher_ids), ...arr(meta.teacherIds)]),
    studentIds: arr(row.assigned_student_ids),
    createdById: meta.createdById || null,
    // Aşama 19: 'scheduled' = e-posta etüt gününde otomatik gider; 'off' = hiç gitmez; yoksa kaydedilirken anında gider
    mailMode: meta.mailMode === 'scheduled' || meta.mailMode === 'off' ? meta.mailMode : '',
  };
}
function uniqIds(list) {
  const out = [];
  for (const x of list) if (typeof x === 'string' && x && x.length <= 120 && !out.includes(x)) out.push(x);
  return out.slice(0, 40);
}
async function resolveEtutTeachers(ids, fallbackName) {
  const out = [];
  for (const id of ids) {
    const t = await resolveEtutTeacher(id, ids.length === 1 ? fallbackName : null);
    if (t) out.push(t);
  }
  return out;
}
async function resolveEtutTeacher(teacherId, fallbackName) {
  if (!teacherId) return null;
  if (String(teacherId).startsWith('ext-')) {
    const id = String(teacherId).slice(4);
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const rows = await rest(`etut_teachers?select=id,name,email&id=eq.${id}`, {
      token: 'service',
    });
    const r = rows && rows[0];
    return r ? { id: teacherId, name: r.name, email: r.email || '', authId: null } : null;
  }
  const rows = await rest(`teachers?select=id,name,email,auth_user_id&id=eq.${encodeURIComponent(teacherId)}`, {
    token: 'service',
  });
  const t = rows && rows[0];
  if (!t) return fallbackName ? { id: teacherId, name: fallbackName, email: '', authId: null } : null;
  let email = t.email || '';
  if (!isEmail(email)) {
    // Kayıtlı öğretmene ek bilgi olarak e-posta girilmiş olabilir
    try {
      const extra = await rest(`etut_teachers?select=email&teacher_id=eq.${encodeURIComponent(teacherId)}`, { token: 'service' });
      if (extra && extra[0] && isEmail(extra[0].email)) email = extra[0].email;
    } catch {}
  }
  return { id: t.id, name: t.name, email, authId: t.auth_user_id };
}
async function fetchVisible(table, id, token) {
  if (!id || typeof id !== 'string' || id.length > 120 || id.startsWith('__'))
    throw new HttpError(400, 'Geçersiz kayıt kimliği.');
  const rows = await rest(`${table}?select=*&id=eq.${encodeURIComponent(id)}`, {
    token,
  });
  if (!rows || !rows[0])
    throw new HttpError(
      404,
      table === 'homeworks'
        ? 'Ödev bulunamadı veya bu ödeve erişiminiz yok.'
        : table === 'question_targets'
          ? 'Soru hedefi bulunamadı veya bu hedefe erişiminiz yok.'
          : 'Etüt bulunamadı veya bu etüde erişiminiz yok.',
    );
  return rows[0];
}
function appUrl(req) {
  const e = env();
  if (e.appUrl) return e.appUrl;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return host ? `${proto}://${host}` : '';
}
function mergeSummaries(a, b) {
  if (!a) return b;
  const out = { ...a };
  for (const k of ['sent', 'failed', 'skipped', 'noEmail', 'remaining']) out[k] = (a[k] || 0) + (b[k] || 0);
  out.noEmailNames = [...(a.noEmailNames || []), ...(b.noEmailNames || [])].slice(0, 40);
  out.errors = [...(a.errors || []), ...(b.errors || [])].slice(0, 5);
  out.notConfigured = a.notConfigured || b.notConfigured;
  out.authError = a.authError || b.authError;
  out.via = a.via || b.via;
  return out;
}

// ----------------------------------------------------------------------------- İşlemler
async function actionStatus(caller) {
  const e = env();
  let own = null;
  try {
    const rows = await rest(`teacher_mail_accounts?select=gmail,updated_at&teacher_auth_id=eq.${caller.authId}`, {
      token: 'service',
    });
    if (rows && rows[0]) own = { gmail: rows[0].gmail, updatedAt: rows[0].updated_at };
  } catch {}
  const schoolConfigured = !!(e.gmailUser && e.gmailPass);
  return {
    ok: true,
    schoolConfigured,
    schoolAddress: schoolConfigured ? e.gmailUser : null,
    own,
    canSend: schoolConfigured || !!own,
    teacherEmail: caller.email || null,
    isAdmin: caller.isAdmin,
  };
}

async function actionConnectGmail(caller, body) {
  const gmail = clean(body.gmail).toLowerCase();
  const pass = String(body.appPassword || '').replace(/\s+/g, '');
  if (!isEmail(gmail)) throw new HttpError(400, 'Geçerli bir e-posta adresi yazın.');
  if (!/^[a-zA-Z]{16}$/.test(pass)) throw new HttpError(400, 'Uygulama şifresi 16 harften oluşur (boşluklar önemli değil).');
  const client = new SmtpClient({
    host: env().smtpHost,
    port: env().smtpPort,
    insecure: env().smtpInsecure,
  });
  try {
    await client.connect();
    await client.login(gmail, pass);
  } catch (err) {
    throw new HttpError(400, err.auth ? err.message : `Gmail'e bağlanılamadı: ${err.message}`);
  } finally {
    await client.quit();
  }
  await rest('teacher_mail_accounts?on_conflict=teacher_auth_id', {
    token: 'service',
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: {
      teacher_auth_id: caller.authId,
      gmail,
      secret: encryptSecret(pass),
      updated_at: new Date().toISOString(),
    },
  });
  return { ok: true, own: { gmail } };
}

async function actionDisconnectGmail(caller) {
  await rest(`teacher_mail_accounts?teacher_auth_id=eq.${caller.authId}`, {
    token: 'service',
    method: 'DELETE',
    prefer: 'return=minimal',
  });
  return { ok: true, own: null };
}

async function actionTest(caller, body, req) {
  const sender = await resolveSender(caller);
  if (!sender)
    throw new HttpError(
      400,
      "Henüz e-posta hesabı ayarlanmamış. Kendi Gmail'inizi bağlayın veya yöneticiden okul hesabını ayarlamasını isteyin.",
      { code: 'not-configured' },
    );
  // Deneme e-postası yalnızca öğretmenin kendi adresine gider (başka adrese gönderilemez)
  const to = caller.email && isEmail(caller.email) ? caller.email : sender.user;
  const mail = layout({
    heading: 'Deneme e-postası',
    greeting: `Merhaba ${caller.name},`,
    intro: 'Bu bir deneme e-postasıdır. Bu e-postayı aldıysanız otomatik ödev ve etüt e-postaları çalışıyor demektir.',
    rows: [
      ['Gönderen hesap', sender.via === 'ogretmen' ? `${sender.user} (kendi Gmail hesabınız)` : `${sender.user} (okul hesabı)`],
      ['Yanıt adresi', sender.replyTo || sender.user],
    ],
    buttonLabel: 'Sisteme git',
    url: appUrl(req),
  });
  const summary = await deliver(
    sender,
    caller,
    [
      {
        event: 'test',
        refId: null,
        refTitle: 'Deneme',
        to,
        toName: caller.name,
        role: 'ogretmen',
        subject: 'Deneme e-postası – Okul Takip Sistemi',
        ...mail,
      },
    ],
    Date.now() + TIME_BUDGET_MS,
  );
  if (summary.sent !== 1) throw new HttpError(502, summary.errors[0] || 'Deneme e-postası gönderilemedi.');
  return { ok: true, to, via: sender.via };
}

async function actionHomeworkCreated(caller, body, req, deadline) {
  const hw = await fetchVisible('homeworks', body.homeworkId, caller.token);
  const students = await homeworkStudents(hw, caller.token);
  const url = appUrl(req);
  hw.resources_titles = Array.isArray(hw.meta && hw.meta.resources)
    ? hw.meta.resources.map((r) => r && r.title).filter(Boolean)
    : [];
  const teacherName = caller.name;
  const items = students.map((s) => ({
    event: 'homework-created',
    refId: hw.id,
    refTitle: hw.title,
    to: s.email,
    toName: s.name,
    role: 'ogrenci',
    ...homeworkMail(hw, s, teacherName, url, false),
  }));
  const sender = await resolveSender(caller);
  const summary = await deliver(sender, caller, items, deadline);
  return { ok: true, total: students.length, ...summary };
}

function noMailYet(etut) {
  return {
    ok: true,
    total: 0,
    students: 0,
    teacher: { status: 'none' },
    teachers: [],
    sent: 0,
    failed: 0,
    skipped: 0,
    noEmail: 0,
    remaining: 0,
    scheduled: etut.mailMode === 'scheduled',
  };
}

// ----------------------------------------------------------------------------- Zamanlanmış etüt e-postası (Aşama 19)
// Kopyalanan (mailMode='scheduled') etütlerde e-posta, etüt gününde kendiliğinden gider:
// saat girilmişse etüt saatinden 1 saat önce, saat yoksa sabah 08:00'de. Etüdün son hâli kullanılır
// (tarih/saat sonradan değiştirilirse yeni zamana göre gider); her kişiye en fazla bir kez gider.
const ETUT_DEFAULT_MAIL_MINUTE = 8 * 60;
function istanbulNow() {
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
      .map((x) => [x.type, x.value]),
  );
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}
function etutStartMinute(etut) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(etut.time || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
function etutMailDueMinute(etut) {
  const st = etutStartMinute(etut);
  return st === null ? ETUT_DEFAULT_MAIL_MINUTE : Math.max(0, st - 60);
}
async function sendScheduledEtut(row, url, deadline) {
  const etut = etutView(row);
  const students = await studentsByIds(etut.studentIds, 'service');
  const teachers = await resolveEtutTeachers(etut.teacherIds, etut.teacherName);
  const teacherName = teachers.length ? teachers.map((t) => t.name).join(', ') : etut.teacherName || 'Öğretmen';
  // Gönderen: etüdü kaydeden öğretmen (kendi Gmail'i varsa o), yoksa okulun hesabı
  let owner = null;
  if (etut.createdById) {
    const t = await rest(`teachers?select=id,name,email,auth_user_id&id=eq.${encodeURIComponent(etut.createdById)}`, { token: 'service' });
    if (t && t[0]) owner = { authId: t[0].auth_user_id || null, name: t[0].name, email: t[0].email || '' };
  }
  if (!owner) owner = teachers[0] ? { authId: teachers[0].authId || null, name: teachers[0].name, email: teachers[0].email || '' } : { authId: null, name: 'Etüt', email: '' };
  const refTitle = `${etut.subject} – ${etut.topic}`;
  const items = students.map((s) => ({
    event: 'etut-scheduled',
    refId: etut.id,
    refTitle,
    to: s.email,
    toName: s.name,
    role: 'ogrenci',
    ...etutStudentMail(etut, s, teacherName, url, true),
  }));
  for (const t of teachers) {
    if (!isEmail(t.email)) continue;
    if (items.some((it) => String(it.to).toLowerCase() === t.email.toLowerCase())) continue;
    items.push({
      event: 'etut-scheduled',
      refId: etut.id,
      refTitle,
      to: t.email,
      toName: t.name,
      role: 'ogretmen',
      ...etutTeacherMail('etut-scheduled', etut, t, students, owner.name, url),
    });
  }
  if (!items.length) return null;
  const sender = await resolveSender(owner);
  return deliver(sender, owner, items, deadline);
}
// Sabit zamanlı karşılaştırma (gizli anahtar tahmin saldırısına karşı)
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

async function actionEtutReminders(req, deadline) {
  const now = istanbulNow();
  const rows = await rest(`etuts?select=*&date=like.${now.date}*`, { token: 'service' });
  const url = appUrl(req);
  const out = { ok: true, date: now.date, scheduled: 0, due: 0, leftover: 0, total: null };
  for (const row of rows || []) {
    if (!row || typeof row.id !== 'string' || row.id.startsWith('__')) continue;
    const etut = etutView(row);
    if (etut.mailMode !== 'scheduled') continue;
    out.scheduled++;
    if (now.minutes < etutMailDueMinute(etut)) continue;
    const st = etutStartMinute(etut);
    // Saati geçmiş (bitmiş) etüt için artık e-posta gitmez
    if (st !== null && now.minutes > st + (Number(etut.duration) || 45)) continue;
    if (Date.now() > deadline) {
      out.leftover++;
      continue;
    }
    out.due++;
    try {
      const summary = await sendScheduledEtut(row, url, deadline);
      if (summary) out.total = mergeSummaries(out.total, summary);
    } catch (err) {
      console.error('[mail] etüt e-postası hatası', row.id, err && err.message);
      out.total = mergeSummaries(out.total, { sent: 0, failed: 0, skipped: 0, noEmail: 0, remaining: 0, errors: [`${etut.subject}: ${err && err.message}`] });
    }
  }
  const t = out.total || {};
  return { ...out, sent: t.sent || 0, failed: t.failed || 0, skipped: t.skipped || 0, noEmail: t.noEmail || 0, errors: t.errors || [], total: undefined };
}

async function actionEtutCreated(caller, body, req, deadline) {
  const row = await fetchVisible('etuts', body.etutId, caller.token);
  const etut = etutView(row);
  // Aşama 19: kopyalanan etütlerde e-posta kaydederken gitmez; etüt gününde otomatik gider (ya da hiç gitmez)
  if (etut.mailMode) return noMailYet(etut);
  // Etüdü yalnızca kaydeden öğretmen (veya yönetici) duyurabilir
  if (etut.createdById && caller.teacherId && etut.createdById !== caller.teacherId && !(await managesTeacher(caller, { teacherId: etut.createdById }))) {
    throw new HttpError(403, 'Bu etüdün e-postasını yalnızca etüdü oluşturan öğretmen gönderebilir.');
  }
  const students = await studentsByIds(etut.studentIds, caller.token);
  const teachers = await resolveEtutTeachers(etut.teacherIds, etut.teacherName);
  const teacher = teachers[0] || null;
  const url = appUrl(req);
  const teacherName = teachers.length ? teachers.map((t) => t.name).join(', ') : etut.teacherName || caller.name;
  const items = students.map((s) => ({
    event: 'etut-created',
    refId: etut.id,
    refTitle: `${etut.subject} – ${etut.topic}`,
    to: s.email,
    toName: s.name,
    role: 'ogrenci',
    ...etutStudentMail(etut, s, teacherName, url),
  }));
  const teacherResults = [];
  for (const t of teachers) {
    if (t.authId && t.authId === caller.authId) teacherResults.push({ status: 'self', name: t.name });
    else if (!isEmail(t.email)) teacherResults.push({ status: 'no-email', name: t.name });
    else if (items.some((it) => it.role === 'ogretmen' && it.to.toLowerCase() === t.email.toLowerCase())) teacherResults.push({ status: 'queued', name: t.name });
    else {
      items.push({
        event: 'etut-created',
        refId: etut.id,
        refTitle: `${etut.subject} – ${etut.topic}`,
        to: t.email,
        toName: t.name,
        role: 'ogretmen',
        ...etutTeacherMail('etut-created', etut, t, students, caller.name, url),
      });
      teacherResults.push({ status: 'queued', name: t.name });
    }
  }
  const teacherResult = teacherResults[0] || { status: 'none' };
  void teacher;
  const sender = await resolveSender(caller);
  const summary = await deliver(sender, caller, items, deadline);
  return {
    ok: true,
    total: items.length,
    students: students.length,
    teacher: teacherResult,
    teachers: teacherResults,
    ...summary,
  };
}

async function actionEtutTeacherOnly(kind, caller, body, req, deadline) {
  const row = await fetchVisible('etuts', body.etutId, caller.token);
  const etut = etutView(row);
  // Aşama 19: kopyalanan etütte değişiklik e-postası gitmez. İptal e-postası yalnızca etüdün haberi
  // zaten gönderilmişse gider (kimseye haber verilmemiş bir etüdün iptali bildirilmez).
  if (etut.mailMode) {
    if (kind !== 'etut-cancelled') return noMailYet(etut);
    const sentBefore = await rest(`mail_log?select=id&status=eq.sent&event=eq.etut-scheduled&ref_id=eq.${encodeURIComponent(etut.id)}&limit=1`, { token: 'service' });
    if (!(sentBefore || []).length) return noMailYet(etut);
  }
  const url = appUrl(req);
  const students = kind === 'etut-cancelled' ? [] : await studentsByIds(etut.studentIds, caller.token);
  const currentList = await resolveEtutTeachers(etut.teacherIds, etut.teacherName);
  const items = [];
  const notes = [];
  const push = (k, t) => {
    if (!t) return;
    if (t.authId && t.authId === caller.authId) return notes.push({ status: 'self', name: t.name });
    if (!isEmail(t.email)) return notes.push({ status: 'no-email', name: t.name });
    items.push({
      event: k,
      refId: etut.id,
      refTitle: `${etut.subject} – ${etut.topic}`,
      to: t.email,
      toName: t.name,
      role: 'ogretmen',
      ...etutTeacherMail(k, etut, t, students, caller.name, url, changes),
    });
    notes.push({ status: 'queued', name: t.name });
  };
  const changes = (Array.isArray(body.changes) ? body.changes : [])
    .slice(0, 12)
    .map((c) => ({
      label: clean(c && c.label).slice(0, 40),
      from: clean(c && c.from).slice(0, 160),
      to: clean(c && c.to).slice(0, 160),
    }))
    .filter((c) => c.label);
  if (kind === 'etut-cancelled') currentList.forEach((t) => push('etut-cancelled', t));
  else {
    // Önceki öğretmenler: liste (Aşama 14) ya da tek öğretmen (eski sürüm)
    const prevIds = Array.isArray(body.previousTeacherIds)
      ? uniqIds(body.previousTeacherIds)
      : typeof body.previousTeacherId === 'string' && body.previousTeacherId
        ? [body.previousTeacherId]
        : null;
    const curIds = currentList.map((t) => t.id);
    if (prevIds) {
      for (const id of prevIds.filter((id) => !curIds.includes(id))) push('etut-unassigned', await resolveEtutTeacher(id, null));
      for (const t of currentList) {
        if (!prevIds.includes(t.id)) push('etut-assigned', t);
        else if (changes.length) push('etut-changed', t);
      }
    } else if (changes.length) currentList.forEach((t) => push('etut-changed', t));
  }
  const sender = await resolveSender(caller);
  const summary = await deliver(sender, caller, items, deadline);
  return { ok: true, total: items.length, teachers: notes, ...summary };
}

// ----------------------------------------------------------------------------- Soru hedefi (Aşama 10)
function addDaysYmd(ymd, days) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''));
  if (!m) return '';
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + days));
  return d.toISOString().slice(0, 10);
}
function questionTargetView(row) {
  const d = row && row.data && typeof row.data === 'object' ? row.data : {};
  const start = row.week_start_date || d.weekStartDate || '';
  const days = Math.max(1, Math.min(366, Math.round(Number(d.targetDays) || 7)));
  const end = /^\d{4}-\d{2}-\d{2}$/.test(String(d.weekEndDate || '')) ? d.weekEndDate : addDaysYmd(start, days - 1);
  const total = Math.max(0, Math.round(Number(d.targetQuestions || d.weeklyTarget) || 0));
  const daily = Math.max(0, Math.round(Number(d.dailyTarget) || (total && days ? total / days : 0)));
  let subjects = [];
  if (Array.isArray(d.subjectTargets)) subjects = d.subjectTargets.map((x) => [clean(x && x.subject), Number(x && x.target) || 0]);
  else if (d.subjectTargets && typeof d.subjectTargets === 'object') subjects = Object.entries(d.subjectTargets).map(([k, v]) => [clean(k), Number(v) || 0]);
  subjects = subjects.filter(([k, v]) => k && v > 0).slice(0, 20);
  return {
    id: row.id,
    isClass: row.target_type === 'class' || (!row.student_id && !!row.class_id),
    studentId: row.student_id || null,
    classId: row.class_id || null,
    className: clean(d.className),
    start,
    end,
    days,
    total,
    daily,
    subject: clean(d.subject),
    subjects,
    notes: clean(d.notes).slice(0, 400),
    ownerName: clean(d.assignedByTeacherName || (d.assignedBy && d.assignedBy !== 'Öğretmen' ? d.assignedBy : '')),
    createdBy: row.created_by || null,
  };
}
function questionTargetMail(t, student, teacherName, url, updated) {
  const scope = t.subject ? `${t.subject} ` : '';
  const subject = `${updated ? 'Soru hedefin güncellendi' : 'Yeni soru hedefin'}: ${t.total} ${scope}soru (${trDate(t.start).split(' ').slice(0, 2).join(' ')} – ${trDate(t.end).split(' ').slice(0, 2).join(' ')})`;
  const body = layout({
    heading: updated ? 'Soru hedefin güncellendi' : 'Yeni bir soru hedefin var',
    greeting: `Merhaba ${clean(student.name)},`,
    intro: `${teacherName} öğretmenin senin için ${t.days} günlük bir ${t.subject ? `${t.subject} ` : ''}soru çözme hedefi belirledi. Çözdüğün soruları her gün sisteme girmeyi unutma.`,
    rows: [
      ['Başlangıç', trDate(t.start)],
      ['Bitiş', trDate(t.end)],
      ['Toplam hedef', `${t.total} soru`],
      ['Günlük hedef', t.daily ? `${t.daily} soru/gün` : ''],
      ['Ders', t.subject || 'Tüm dersler'],
      ['Ders hedefleri', t.subjects.map(([k, v]) => `${k}: ${v}`).join(', ')],
      ['Sınıf', t.isClass ? t.className : ''],
      ['Öğretmen notu', t.notes],
      ['Hedefi veren', teacherName],
    ],
    buttonLabel: 'Soru takibini aç',
    url,
  });
  return { subject, ...body };
}

async function actionQuestionTarget(caller, body, req, deadline) {
  const row = await fetchVisible('question_targets', body.targetId, caller.token);
  const t = questionTargetView(row);
  // Hedefin e-postasını yalnızca hedefi veren öğretmen (veya yönetici) gönderebilir
  if (t.createdBy && t.createdBy !== caller.authId && !(await managesTeacher(caller, { authId: t.createdBy }))) {
    throw new HttpError(403, 'Bu hedefin e-postasını yalnızca hedefi veren öğretmen gönderebilir.');
  }
  if (!t.start || !t.total) throw new HttpError(400, 'Hedef bilgisi eksik.');
  // Süresi bitmiş hedef duyurulmaz
  if (t.end && t.end < istanbulDate(0)) {
    return { ok: true, total: 0, expired: true, sent: 0, failed: 0, skipped: 0, noEmail: 0, remaining: 0, errors: [] };
  }
  const students = t.isClass
    ? t.classId
      ? await studentsByClasses([t.classId], caller.token)
      : []
    : t.studentId
      ? await studentsByIds([t.studentId], caller.token)
      : [];
  const url = appUrl(req);
  const teacherName = t.ownerName || caller.name;
  // Aynı içerik tekrar kaydedilirse e-posta yeniden gitmez; içerik değişirse yeni e-posta gider
  const sig = crypto
    .createHash('sha1')
    .update(JSON.stringify([t.start, t.end, t.total, t.daily, t.subject, t.subjects, t.notes]))
    .digest('hex')
    .slice(0, 12);
  const updated = body.mode === 'updated';
  const items = students.map((s) => ({
    event: 'question-target',
    refId: `${t.id}#${sig}`,
    refTitle: `Soru hedefi: ${t.total} soru${t.subject ? ` (${t.subject})` : ''}`,
    to: s.email,
    toName: s.name,
    role: 'ogrenci',
    ...questionTargetMail(t, s, teacherName, url, updated),
  }));
  const sender = await resolveSender(caller);
  const summary = await deliver(sender, caller, items, deadline);
  return { ok: true, total: students.length, ...summary };
}

// ----------------------------------------------------------------------------- Öğretmen hesap bildirimleri (Aşama 11)
async function teacherAccessSummary(t) {
  if (t.is_admin) return { classes: 'Yönetici olarak tüm sınıflar', students: '' };
  if (!t.auth_user_id) return { classes: 'Henüz yetki verilmedi', students: '' };
  const authId = encodeURIComponent(t.auth_user_id);
  let classNames = [];
  let studentCount = 0;
  try {
    const cls = await rest(`teacher_class_access?select=class_id&teacher_auth_id=eq.${authId}`, { token: 'service' });
    const ids = (cls || []).map((r) => r.class_id).filter(Boolean);
    if (ids.length) {
      const rows = await rest(`classes?select=id,name&id=in.${inList(ids)}`, { token: 'service' });
      classNames = (rows || []).map((r) => clean(r.name)).filter(Boolean).sort((a, b) => a.localeCompare(b, 'tr'));
    }
    const st = await rest(`teacher_student_access?select=student_id&teacher_auth_id=eq.${authId}`, { token: 'service' });
    studentCount = (st || []).length;
  } catch {}
  return {
    classes: classNames.length ? classNames.join(', ') : 'Sınıf yetkisi yok',
    students: studentCount ? `${studentCount} öğrenci (sınıf dışında ayrıca)` : '',
  };
}

function teacherMail(kind, t, ctx) {
  const { url, adminName, password, changes, access } = ctx;
  const loginRows = [
    ['Giriş adresi', url],
    ['Giriş', 'Giriş ekranında "Öğretmen" sekmesini seçin'],
    ['Kullanıcı adı', t.username],
    ['Şifre', password],
  ];
  const pwFooter = password
    ? 'Güvenliğiniz için ilk girişten sonra profil menüsünden şifrenizi değiştirin. Bu e-postayı kimseyle paylaşmayın.'
    : undefined;
  const greeting = `Merhaba ${clean(t.name)},`;
  if (kind === 'created') {
    return {
      subject: 'Öğretmen hesabınız açıldı',
      ...layout({
        heading: 'Öğretmen hesabınız açıldı',
        greeting,
        intro: `${adminName} sizin için Eğitim & Öğrenci Takip Sistemi'nde bir öğretmen hesabı açtı. Giriş bilgileriniz aşağıdadır.`,
        rows: [...loginRows, ['Branş', t.branch]],
        buttonLabel: 'Sisteme giriş yap',
        url,
        footer: pwFooter,
      }),
    };
  }
  if (kind === 'updated') {
    const rows = (changes || []).map((c) => [c.label, c.value]);
    if (password) rows.push(['Yeni şifre', password]);
    if (password || (changes || []).some((c) => c.login)) rows.push(['Kullanıcı adı', t.username], ['Giriş adresi', url]);
    return {
      subject: password ? 'Hesap bilgileriniz ve şifreniz güncellendi' : 'Hesap bilgileriniz güncellendi',
      ...layout({
        heading: 'Hesap bilgileriniz güncellendi',
        greeting,
        intro: `${adminName} hesap bilgilerinizde değişiklik yaptı. Güncel bilgiler aşağıdadır. Bu değişikliği beklemiyorsanız yöneticinizle görüşün.`,
        rows,
        buttonLabel: 'Sisteme giriş yap',
        url,
        footer: pwFooter,
      }),
    };
  }
  if (kind === 'access') {
    return {
      subject: 'Sınıf ve öğrenci erişim yetkileriniz güncellendi',
      ...layout({
        heading: 'Erişim yetkileriniz güncellendi',
        greeting,
        intro: `${adminName} sistemde görebileceğiniz sınıfları ve öğrencileri güncelledi. Değişiklik bir sonraki girişinizde (en geç 1 saat içinde) tamamen geçerli olur.`,
        rows: [
          ['Yetkili sınıflar', access && access.classes],
          ['Ek öğrenciler', access && access.students],
        ],
        buttonLabel: 'Sisteme giriş yap',
        url,
      }),
    };
  }
  if (kind === 'role') {
    const admin = !!t.is_admin;
    return {
      subject: admin ? 'Size yönetici yetkisi verildi' : 'Yönetici yetkiniz kaldırıldı',
      ...layout({
        heading: admin ? 'Yönetici yetkisi verildi' : 'Yönetici yetkiniz kaldırıldı',
        greeting,
        intro: admin
          ? `${adminName} hesabınıza yönetici yetkisi verdi. Artık kullanıcı yönetimi ve tüm sınıflara erişim dahil yönetici işlemlerini yapabilirsiniz.`
          : `${adminName} hesabınızdaki yönetici yetkisini kaldırdı. Öğretmen olarak, size verilen sınıf ve öğrencilerle çalışmaya devam edebilirsiniz.`,
        rows: [['Yeni rol', admin ? 'Yönetici' : 'Öğretmen']],
        buttonLabel: 'Sisteme giriş yap',
        url,
      }),
    };
  }
  if (kind === 'suspended') {
    return {
      subject: 'Hesabınız geçici olarak askıya alındı',
      ...layout({
        heading: 'Hesabınız askıya alındı',
        greeting,
        intro: `${adminName} hesabınızı geçici olarak askıya aldı. Hesap yeniden açılana kadar sisteme giriş yapamazsınız. Bilgi için yöneticinizle görüşün.`,
        rows: [['Durum', 'Askıda']],
      }),
    };
  }
  return {
    subject: 'Hesabınız yeniden açıldı',
    ...layout({
      heading: 'Hesabınız yeniden açıldı',
      greeting,
      intro: `${adminName} hesabınızı yeniden etkinleştirdi. Kullanıcı adınız ve şifrenizle tekrar giriş yapabilirsiniz.`,
      rows: [['Durum', 'Aktif'], ['Kullanıcı adı', t.username]],
      buttonLabel: 'Sisteme giriş yap',
      url,
    }),
  };
}

function oldEmailNoticeMail(t, newEmail, adminName) {
  return {
    subject: 'Hesabınızın e-posta adresi değiştirildi',
    ...layout({
      heading: 'E-posta adresiniz değiştirildi',
      greeting: `Merhaba ${clean(t.name)},`,
      intro: `${adminName}, okul sistemindeki öğretmen hesabınızın e-posta adresini değiştirdi. Bundan sonraki bildirimler yeni adrese gidecek. Bu değişikliği beklemiyorsanız yöneticinizle görüşün.`,
      rows: [['Yeni adres', newEmail]],
    }),
  };
}

async function actionTeacherAccount(caller, body, req, deadline) {
  if (!caller.isAdmin && !caller.isKurumAdmin) throw new HttpError(403, 'Öğretmen hesap e-postalarını yalnızca yönetici gönderebilir.');
  const kind = String(body.kind || '');
  const event = TEACHER_EVENTS[kind];
  if (!event) throw new HttpError(400, 'Geçersiz bildirim türü.');
  const id = String(body.teacherId || '');
  if (!id || id.length > 120 || id.startsWith('__')) throw new HttpError(400, 'Geçersiz öğretmen kimliği.');
  const rows = await rest(`teachers?select=id,name,username,email,branch,is_admin,status,auth_user_id&id=eq.${encodeURIComponent(id)}`, {
    token: 'service',
  });
  const t = rows && rows[0];
  if (!t) throw new HttpError(404, 'Öğretmen bulunamadı.');
  if (!caller.isAdmin && (t.is_admin || !(await managesTeacher(caller, { teacherId: t.id })))) {
    throw new HttpError(403, 'Bu öğretmenin hesap e-postasını gönderme yetkiniz yok.');
  }
  const empty = { ok: true, total: 0, sent: 0, failed: 0, skipped: 0, noEmail: 0, remaining: 0, errors: [] };
  // Yönetici kendi hesabını düzenliyorsa kendisine e-posta gönderilmez
  if (t.auth_user_id && t.auth_user_id === caller.authId) return { ...empty, teacher: { status: 'self', name: t.name } };

  const url = appUrl(req);
  const password = (kind === 'created' || kind === 'updated') && typeof body.password === 'string' ? body.password.trim().slice(0, 100) : '';
  const changes = (Array.isArray(body.changes) ? body.changes : [])
    .slice(0, 12)
    .map((c) => ({ label: clean(c && c.label).slice(0, 60), value: clean(c && c.value).slice(0, 200), login: !!(c && c.login) }))
    .filter((c) => c.label);
  if (kind === 'updated' && !changes.length && !password) return { ...empty, unchanged: true };
  const access = kind === 'access' ? await teacherAccessSummary(t) : null;
  const ctx = { url, adminName: caller.name, password, changes, access };

  const items = [];
  let teacherResult;
  if (isEmail(t.email)) {
    items.push({
      event,
      refId: t.id,
      refTitle: `${t.name} – ${kind}`,
      to: t.email,
      toName: t.name,
      role: 'ogretmen',
      repeatLimit: TEACHER_REPEAT_LIMIT,
      ...teacherMail(kind, t, ctx),
    });
    teacherResult = { status: 'queued', name: t.name };
  } else {
    teacherResult = { status: 'no-email', name: t.name };
  }
  // E-posta adresi değiştiyse eski adrese yalnızca kısa bir bilgi gider (şifre ve diğer bilgiler gitmez)
  const prev = typeof body.previousEmail === 'string' ? body.previousEmail.trim() : '';
  if (kind === 'updated' && isEmail(prev) && isEmail(t.email) && prev.toLowerCase() !== t.email.trim().toLowerCase()) {
    items.push({
      event: 'teacher-email-changed',
      refId: t.id,
      refTitle: `${t.name} – eski adres bilgisi`,
      to: prev,
      toName: t.name,
      role: 'ogretmen',
      repeatLimit: TEACHER_REPEAT_LIMIT,
      ...oldEmailNoticeMail(t, t.email, caller.name),
    });
  }
  if (!items.length) return { ...empty, total: 1, teacher: teacherResult };
  const sender = await resolveSender(caller);
  const summary = await deliver(sender, caller, items, deadline);
  return { ok: true, total: items.length, teacher: teacherResult, ...summary };
}

function istanbulDate(offsetDays) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

async function actionReminders(req, deadline) {
  const tomorrow = istanbulDate(1);
  // Son teslim yerel ("2026-10-05T23:59") veya UTC ("2026-10-04T21:30:00Z") kaydedilmiş olabilir
  const candidates = [];
  for (const day of [tomorrow, istanbulDate(0)]) {
    const part = await rest(`homeworks?select=*&due_date=like.${day}*`, {
      token: 'service',
    });
    candidates.push(...(part || []));
  }
  const seenIds = new Set();
  const hws = candidates.filter((h) => {
    if (!h || typeof h.id !== 'string' || h.id.startsWith('__') || seenIds.has(h.id)) return false;
    seenIds.add(h.id);
    return toIstanbulLocal(h.due_date).startsWith(tomorrow);
  });
  const url = appUrl(req);
  let total = null;
  const perHomework = [];
  let leftover = 0;
  for (const hw of hws) {
    if (Date.now() > deadline) {
      leftover++;
      continue;
    }
    try {
      const students = await homeworkStudents(hw, 'service');
      if (!students.length) continue;
      const subs = await rest(
        `homework_submissions?select=student_id,status,check_status&homework_id=eq.${encodeURIComponent(hw.id)}`,
        { token: 'service' },
      );
      const done = new Set(
        (subs || [])
          .filter((s) => s.status === 'on_time' || s.status === 'late' || s.check_status === 'yapti')
          .map((s) => s.student_id),
      );
      const pending = students.filter((s) => !done.has(s.id));
      if (!pending.length) continue;
      let teacher = {
        authId: hw.teacher_auth_id || null,
        name: hw.teacher_name || 'Öğretmen',
        email: '',
      };
      if (hw.teacher_auth_id) {
        const t = await rest(`teachers?select=name,email&auth_user_id=eq.${hw.teacher_auth_id}`, { token: 'service' });
        if (t && t[0])
          teacher = {
            authId: hw.teacher_auth_id,
            name: t[0].name,
            email: t[0].email || '',
          };
      }
      hw.resources_titles = Array.isArray(hw.meta && hw.meta.resources)
        ? hw.meta.resources.map((r) => r && r.title).filter(Boolean)
        : [];
      const items = pending.map((s) => ({
        event: 'homework-reminder',
        refId: hw.id,
        refTitle: hw.title,
        to: s.email,
        toName: s.name,
        role: 'ogrenci',
        ...homeworkMail(hw, s, teacher.name, url, true),
      }));
      const sender = await resolveSender(teacher);
      const summary = await deliver(sender, teacher, items, deadline);
      perHomework.push({
        id: hw.id,
        title: hw.title,
        sent: summary.sent,
        failed: summary.failed,
        skipped: summary.skipped,
        noEmail: summary.noEmail,
      });
      total = mergeSummaries(total, summary);
    } catch (err) {
      console.error('[mail] hatırlatma hatası', hw.id, err && err.message);
      total = mergeSummaries(total, {
        sent: 0,
        failed: 0,
        skipped: 0,
        noEmail: 0,
        remaining: 0,
        errors: [`${hw.title}: ${err && err.message}`],
      });
    }
  }
  return {
    ok: true,
    date: tomorrow,
    homeworks: perHomework,
    leftoverHomeworks: leftover,
    ...(total || {
      sent: 0,
      failed: 0,
      skipped: 0,
      noEmail: 0,
      remaining: 0,
      errors: [],
    }),
  };
}

// ----------------------------------------------------------------------------- Giriş noktası
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const deadline = Date.now() + TIME_BUDGET_MS;
  try {
    if (req.method === 'OPTIONS') return res.status(204).end();

    // Vercel zamanlanmış görev: her gün ödev hatırlatmaları
    if (req.method === 'GET') {
      const task = (req.query && req.query.task) || new URL(req.url, 'http://x').searchParams.get('task');
      const isCron = /vercel-cron/i.test(String(req.headers['user-agent'] || ''));
      if (task !== 'reminders' && task !== 'etut-reminders' && !isCron) return res.status(200).json({ ok: true, service: 'mail' });
      const e = env();
      // Aşama 20: zamanlanmış görevler artık yalnızca CRON_SECRET ile çalışır (secret yoksa kapalı kalır)
      if (!e.cronSecret) {
        return res.status(503).json({ ok: false, error: 'CRON_SECRET tanımlı değil' });
      }
      if (!safeEqual(String(req.headers.authorization || ''), `Bearer ${e.cronSecret}`)) {
        return res.status(401).json({ ok: false, error: 'Yetkisiz' });
      }
      if (!e.service) return res.status(503).json({ ok: false, error: 'SUPABASE_SERVICE_ROLE_KEY eksik' });
      // Aşama 19: etüt e-postaları (Supabase zamanlayıcısı her 10 dakikada çağırır)
      if (task === 'etut-reminders') {
        const er = await actionEtutReminders(req, deadline);
        return res.status(200).json({ ok: er.ok, date: er.date, scheduled: er.scheduled, due: er.due, leftover: er.leftover, sent: er.sent, failed: er.failed, skipped: er.skipped, noEmail: er.noEmail });
      }
      const r = await actionReminders(req, deadline);
      // Günlük görevde de bir kez bakılır (10 dakikalık zamanlayıcı kurulmadıysa etüt e-postası hiç kaybolmasın)
      let er = null;
      try {
        er = await actionEtutReminders(req, deadline);
      } catch (err) {
        console.error('[mail] günlük etüt e-postası hatası', err && err.message);
      }
      // Zamanlanmış görev yanıtında kişi/ödev adı verilmez (yalnızca sayılar)
      return res.status(200).json({
        etutSent: er ? er.sent : 0,
        ok: r.ok,
        date: r.date,
        homeworks: r.homeworks.length,
        sent: r.sent,
        failed: r.failed,
        skipped: r.skipped,
        noEmail: r.noEmail,
        leftoverHomeworks: r.leftoverHomeworks,
      });
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
    // Aşama 16: e-postadaki yoklama bağlantısı (giriş gerektirmez; imzalı bağlantı denetlenir)
    if (body.action === 'attendance-get' || body.action === 'attendance-save') {
      if (!env().service) throw new HttpError(503, 'Sunucu ayarları eksik.');
      const r = body.action === 'attendance-get' ? await actionAttendanceGet(body) : await actionAttendanceSave(body);
      return res.status(200).json(r);
    }
    const caller = await getCaller(req);
    let result;
    switch (body.action) {
      case 'status':
        result = await actionStatus(caller);
        break;
      case 'connect-gmail':
        result = await actionConnectGmail(caller, body);
        break;
      case 'disconnect-gmail':
        result = await actionDisconnectGmail(caller);
        break;
      case 'test':
        result = await actionTest(caller, body, req);
        break;
      case 'homework-created':
        result = await actionHomeworkCreated(caller, body, req, deadline);
        break;
      case 'etut-created':
        result = await actionEtutCreated(caller, body, req, deadline);
        break;
      case 'etut-changed':
        result = await actionEtutTeacherOnly('etut-changed', caller, body, req, deadline);
        break;
      case 'etut-cancelled':
        result = await actionEtutTeacherOnly('etut-cancelled', caller, body, req, deadline);
        break;
      case 'etut-attendance-link':
        result = await actionEtutAttendanceLink(caller, body, req, deadline);
        break;
      case 'question-target':
        result = await actionQuestionTarget(caller, body, req, deadline);
        break;
      case 'teacher-account':
        result = await actionTeacherAccount(caller, body, req, deadline);
        break;
      case 'reminders':
        if (!caller.isAdmin) throw new HttpError(403, 'Hatırlatmaları elle yalnızca yönetici çalıştırabilir.');
        result = await actionReminders(req, deadline);
        break;
      default:
        throw new HttpError(400, 'Bilinmeyen işlem.');
    }
    return res.status(200).json(result);
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    if (status >= 500) console.error('[mail]', err && err.stack ? err.stack : err);
    return res.status(status).json({
      ok: false,
      // Aşama 20: beklenmeyen hatalarda veritabanı ayrıntısı istemciye verilmez (günlükte kalır)
      error: !(err instanceof HttpError) ? 'Beklenmeyen bir sunucu hatası oluştu. Lütfen tekrar deneyin.' : err.message || 'Beklenmeyen hata',
      ...(err.extra || {}),
    });
  }
}
