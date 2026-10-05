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
//   İsteğe bağlı: MAIL_SECRET_KEY, APP_URL, SCHOOL_NAME, CRON_SECRET
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
const ONCE_EVENTS = new Set(['homework-created', 'homework-reminder', 'etut-created', 'question-target']);
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
  const isAdmin = role === 'admin' || (user.email || '').toLowerCase() === 'm.bilirr@gmail.com';
  const rows = await rest(`teachers?select=id,name,email,branch,status,is_admin&auth_user_id=eq.${user.id}`, {
    token: 'service',
  });
  const t = rows && rows[0];
  if (!t && !isAdmin) throw new HttpError(403, 'Bu işlemi yalnızca öğretmenler yapabilir.');
  if (t && t.status && t.status !== 'approved' && !isAdmin) throw new HttpError(403, 'Öğretmen hesabınız onaylı değil.');
  return {
    token,
    authId: user.id,
    teacherId: t ? t.id : null,
    name: (t && t.name) || 'Öğretmen',
    email: ((t && t.email) || user.email || '').trim(),
    isAdmin: isAdmin || !!(t && t.is_admin),
  };
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
    ['Saat', `${clean(etut.time)}${end ? ` – ${end}` : ''} (${Number(etut.duration) || 45} dk)`],
    ['Yer', etut.location],
    ['Etüt öğretmeni', teacherName],
    ['Not', clean(etut.userNotes).slice(0, 400)],
  ];
}
function etutStudentMail(etut, student, teacherName, url) {
  const body = layout({
    heading: 'Yeni etüt planlandı',
    greeting: `Merhaba ${clean(student.name)},`,
    intro: 'Senin için aşağıdaki etüt planlandı. Lütfen zamanında katıl.',
    rows: etutRows(etut, teacherName),
    buttonLabel: 'Sistemde görüntüle',
    url,
  });
  return {
    subject: `Etüt: ${clean(etut.subject)} – ${trDate(etut.date, etut.time)}`,
    ...body,
  };
}
function etutTeacherMail(kind, etut, teacher, students, creatorName, url, changes) {
  const list = studentListBlock(students);
  const titles = {
    'etut-created': ['Size yeni bir etüt atandı', `Size etüt atandı: ${clean(etut.subject)} – ${trDate(etut.date, etut.time)}`],
    'etut-assigned': ['Size bir etüt atandı', `Size etüt atandı: ${clean(etut.subject)} – ${trDate(etut.date, etut.time)}`],
    'etut-changed': ['Etüt bilgileri değişti', `Etüt güncellendi: ${clean(etut.subject)} – ${trDate(etut.date, etut.time)}`],
    'etut-cancelled': ['Etüt iptal edildi', `Etüt iptal edildi: ${clean(etut.subject)} – ${trDate(etut.date, etut.time)}`],
    'etut-unassigned': [
      'Etüt artık size atanmış değil',
      `Etüt başka öğretmene verildi: ${clean(etut.subject)} – ${trDate(etut.date, etut.time)}`,
    ],
  };
  const [heading, subject] = titles[kind];
  const intros = {
    'etut-created': `${creatorName} tarafından size aşağıdaki etüt atandı.`,
    'etut-assigned': `${creatorName} aşağıdaki etüdü size atadı.`,
    'etut-changed': `${creatorName} aşağıdaki etüdün bilgilerini değiştirdi.`,
    'etut-cancelled': `${creatorName} aşağıdaki etüdü iptal etti. Etüt yapılmayacaktır.`,
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
    rows: etutRows(etut, teacher.name),
    extraHtml: changesHtml + (showStudents ? list.html : ''),
    extraText: [changesText, showStudents ? list.text : ''].filter(Boolean).join('\n\n'),
    buttonLabel: showStudents ? 'Sistemde görüntüle' : undefined,
    url: showStudents ? url : undefined,
  });
  return { subject, ...body };
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
    studentIds: arr(row.assigned_student_ids),
    createdById: meta.createdById || null,
  };
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

async function actionEtutCreated(caller, body, req, deadline) {
  const row = await fetchVisible('etuts', body.etutId, caller.token);
  const etut = etutView(row);
  // Etüdü yalnızca kaydeden öğretmen (veya yönetici) duyurabilir
  if (etut.createdById && caller.teacherId && etut.createdById !== caller.teacherId && !caller.isAdmin) {
    throw new HttpError(403, 'Bu etüdün e-postasını yalnızca etüdü oluşturan öğretmen gönderebilir.');
  }
  const students = await studentsByIds(etut.studentIds, caller.token);
  const teacher = await resolveEtutTeacher(etut.teacherId, etut.teacherName);
  const url = appUrl(req);
  const teacherName = (teacher && teacher.name) || etut.teacherName || caller.name;
  const items = students.map((s) => ({
    event: 'etut-created',
    refId: etut.id,
    refTitle: `${etut.subject} – ${etut.topic}`,
    to: s.email,
    toName: s.name,
    role: 'ogrenci',
    ...etutStudentMail(etut, s, teacherName, url),
  }));
  let teacherResult = { status: 'none' };
  if (teacher) {
    if (teacher.authId && teacher.authId === caller.authId) teacherResult = { status: 'self', name: teacher.name };
    else if (!isEmail(teacher.email)) teacherResult = { status: 'no-email', name: teacher.name };
    else {
      items.push({
        event: 'etut-created',
        refId: etut.id,
        refTitle: `${etut.subject} – ${etut.topic}`,
        to: teacher.email,
        toName: teacher.name,
        role: 'ogretmen',
        ...etutTeacherMail('etut-created', etut, teacher, students, caller.name, url),
      });
      teacherResult = { status: 'queued', name: teacher.name };
    }
  }
  const sender = await resolveSender(caller);
  const summary = await deliver(sender, caller, items, deadline);
  return {
    ok: true,
    total: items.length,
    students: students.length,
    teacher: teacherResult,
    ...summary,
  };
}

async function actionEtutTeacherOnly(kind, caller, body, req, deadline) {
  const row = await fetchVisible('etuts', body.etutId, caller.token);
  const etut = etutView(row);
  const url = appUrl(req);
  const students = kind === 'etut-cancelled' ? [] : await studentsByIds(etut.studentIds, caller.token);
  const current = await resolveEtutTeacher(etut.teacherId, etut.teacherName);
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
  if (kind === 'etut-cancelled') push('etut-cancelled', current);
  else {
    const prevId = typeof body.previousTeacherId === 'string' ? body.previousTeacherId : null;
    if (prevId && current && prevId !== current.id) {
      const prev = await resolveEtutTeacher(prevId, null);
      push('etut-unassigned', prev);
      push('etut-assigned', current);
    } else if (changes.length) push('etut-changed', current);
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
  if (t.createdBy && t.createdBy !== caller.authId && !caller.isAdmin) {
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
  if (!caller.isAdmin) throw new HttpError(403, 'Öğretmen hesap e-postalarını yalnızca yönetici gönderebilir.');
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
      if (task !== 'reminders' && !isCron) return res.status(200).json({ ok: true, service: 'mail' });
      const e = env();
      if (e.cronSecret && String(req.headers.authorization || '') !== `Bearer ${e.cronSecret}`) {
        return res.status(401).json({ ok: false, error: 'Yetkisiz' });
      }
      if (!e.service) return res.status(503).json({ ok: false, error: 'SUPABASE_SERVICE_ROLE_KEY eksik' });
      const r = await actionReminders(req, deadline);
      // Zamanlanmış görev yanıtında kişi/ödev adı verilmez (yalnızca sayılar)
      return res.status(200).json({
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
      error: err.message || 'Beklenmeyen hata',
      ...(err.extra || {}),
    });
  }
}
