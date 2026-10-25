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
// Aşama 75: yardımcı dosyalar (bildirim izinleri, SMS) GÜVENLİ yüklenir. Dosya eksik ya da hatalıysa
// e-posta sistemi çökmez; izinler varsayılan (eski davranış) kalır, SMS gönderilmez. Hata Vercel günlüğüne yazılır.
let policyModCache;
let smsModCache;
async function policyMod() {
  if (policyModCache === undefined) {
    try {
      policyModCache = await import('./_notifyPolicy.js');
    } catch (err) {
      console.error('[mail] api/_notifyPolicy.js yüklenemedi:', err && err.message);
      policyModCache = null;
    }
  }
  return policyModCache;
}
async function smsMod() {
  if (smsModCache === undefined) {
    try {
      smsModCache = await import('./_sms.js');
    } catch (err) {
      console.error('[mail] api/_sms.js yüklenemedi:', err && err.message);
      smsModCache = null;
    }
  }
  return smsModCache;
}

export const config = { maxDuration: 60 };

const DEFAULT_SUPABASE_URL = 'https://zzdchsxfjzedgciejuxd.supabase.co';
const TIME_BUDGET_MS = 30000; // bir çağrıda en fazla bu kadar süre e-posta gönderilir, kalanlar sonraki çağrıya kalır
const SOCKET_TIMEOUT_MS = 12000;
const REPEAT_LIMIT_PER_DAY = 4; // aynı etüt için aynı kişiye günde en fazla bu kadar 'değişti/iptal' e-postası
const HOURLY_LIMIT_PER_SENDER = 400; // bir öğretmenin saatte gönderebileceği en fazla e-posta
const ONCE_EVENTS = new Set(['homework-created', 'homework-reminder', 'etut-created', 'etut-scheduled', 'etut-no-attendance', 'question-target', 'plan-report', 'parent-announce']);
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
    // Aşama 87: SCHOOL_NAME ayarına yanlışlıkla bir site adresi yazılmışsa (ör. bilir-hoca.vercel.app) e-postada görünmez
    schoolName: (() => {
      const n = String(process.env.SCHOOL_NAME || '').trim();
      return n && !/vercel\.app|https?:\/\/|\.(com|net|org|app)\b/i.test(n) ? n : 'Eğitim & Öğrenci Takip Sistemi';
    })(),
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
  // Aşama 82: Müdür / Müdür Yardımcısı rolüyle (rol yetkileri açık kurumda) kurum yöneticisi olanlar
  let roleKurumAdmin = false;
  if (!isAdmin && kurumId && !(t && t.is_admin)) {
    try {
      roleKurumAdmin = (await rest('rpc/is_kurum_admin', { token, method: 'POST', body: {} })) === true;
    } catch {
      roleKurumAdmin = false;
    }
  }
  return {
    token,
    authId: user.id,
    teacherId: t ? t.id : null,
    name: (t && t.name) || 'Öğretmen',
    email: ((t && t.email) || user.email || '').trim(),
    // Tam yetki: genel yönetici. Kurum yöneticisi yalnızca kendi kurumunun öğretmenleri adına işlem yapabilir.
    isAdmin,
    isKurumAdmin: !isAdmin && !!kurumId && (!!(t && t.is_admin) || roleKurumAdmin),
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

function buildMessage({ fromName, fromAddr, toName, toAddr, replyTo, subject, text, html, attachments, inline }) {
  const boundary = 'b_' + crypto.randomBytes(12).toString('hex');
  const files = (attachments || []).filter((a) => a && a.content && a.filename);
  const domain = (fromAddr.split('@')[1] || 'mail.local').replace(/[^\w.-]/g, '');
  const headers = [
    `From: ${addressHeader(fromName, fromAddr)}`,
    `To: ${addressHeader(toName, toAddr)}`,
    replyTo ? `Reply-To: ${replyTo}` : null,
    `Subject: ${encodeWord(subject)}`,
    `Date: ${new Date().toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${crypto.randomBytes(16).toString('hex')}@${domain}>`,
    'MIME-Version: 1.0',
  ].filter(Boolean);
  const alternative =
    `--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64lines(text)}` +
    `--${boundary}\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64lines(html)}` +
    `--${boundary}--\r\n`;
  // Aşama 83: e-posta içindeki görseller (kurum logosu) — multipart/related, Content-ID ile
  const pics = (inline || []).filter((p) => p && p.cid && p.content && /^image\/(png|jpeg)$/.test(String(p.contentType || '')));
  let bodyType = `multipart/alternative; boundary="${boundary}"`;
  let body = alternative;
  if (pics.length) {
    const rel = 'r_' + crypto.randomBytes(12).toString('hex');
    body =
      `--${rel}\r\nContent-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n${alternative}` +
      pics
        .map((p, i) => {
          const name = `logo${i ? i + 1 : ''}.${p.contentType === 'image/png' ? 'png' : 'jpg'}`;
          return (
            `--${rel}\r\nContent-Type: ${p.contentType}; name="${name}"\r\nContent-Transfer-Encoding: base64\r\n` +
            `Content-ID: <${String(p.cid).replace(/[<>\s]/g, '')}>\r\nContent-Disposition: inline; filename="${name}"\r\n\r\n` +
            Buffer.from(p.content).toString('base64').replace(/.{1,76}/g, '$&\r\n')
          );
        })
        .join('') +
      `--${rel}--\r\n`;
    bodyType = `multipart/related; boundary="${rel}"; type="multipart/alternative"`;
  }
  if (!files.length) {
    return headers.join('\r\n') + `\r\nContent-Type: ${bodyType}` + '\r\n\r\n' + body;
  }
  // Aşama 22: ekli dosya (ör. haftalık plan PDF'i) — multipart/mixed
  const mixed = 'm_' + crypto.randomBytes(12).toString('hex');
  const parts = files
    .map((f) => {
      const name = String(f.filename).replace(/[^\w.-]+/g, '_').slice(0, 80) || 'ek.pdf';
      const type = /^[\w.+-]+\/[\w.+-]+$/.test(String(f.contentType || '')) ? f.contentType : 'application/octet-stream';
      return (
        `--${mixed}\r\nContent-Type: ${type}; name="${name}"\r\nContent-Transfer-Encoding: base64\r\n` +
        `Content-Disposition: attachment; filename="${name}"\r\n\r\n` +
        Buffer.from(f.content).toString('base64').replace(/.{1,76}/g, '$&\r\n')
      );
    })
    .join('');
  return (
    headers.join('\r\n') +
    `\r\nContent-Type: multipart/mixed; boundary="${mixed}"` +
    '\r\n\r\n' +
    `--${mixed}\r\nContent-Type: ${bodyType}\r\n\r\n${body}` +
    parts +
    `--${mixed}--\r\n`
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
// Aşama 23: öğretmen e-postasında her öğrencinin yanında "Not yaz" bağlantısı (yoklama sayfasında o öğrencinin
// not penceresini açar: öğrenciye özel not ve etüt konusundan farklı anlatılan konu)
function teacherStudentListBlock(students, attUrl) {
  if (!attUrl || !students.length) return studentListBlock(students);
  const shown = students.slice(0, 60);
  const more = students.length > 60 ? `… ve ${students.length - 60} öğrenci daha` : '';
  const rows = shown
    .map((s, i) => {
      const name = `${s.name}${s.class_name ? ` (${s.class_name})` : ''}`;
      const link = `${attUrl}&not=${encodeURIComponent(s.id)}`;
      return (
        `<tr><td style="padding:6px 8px 6px 0;font-size:13px;color:#334155;border-bottom:1px solid #e2e8f0">${i + 1}. ${esc(name)}</td>` +
        `<td style="padding:6px 0;text-align:right;border-bottom:1px solid #e2e8f0;white-space:nowrap">` +
        `<a href="${esc(link)}" style="display:inline-block;padding:4px 10px;border-radius:999px;background:#eef2ff;color:#4338ca;font-size:12px;font-weight:700;text-decoration:none">Not yaz</a></td></tr>`
      );
    })
    .join('');
  return {
    html:
      `<p style="margin:18px 0 6px;font-size:13px;font-weight:700;color:#0f172a">Öğrenciler (${students.length})</p>` +
      `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">${rows}</table>` +
      `<p style="margin:6px 0 0;font-size:12px;color:#64748b">"Not yaz" ile öğrenciye özel not ya da o öğrenciye farklı anlatılan konuyu yazabilirsiniz (yalnız öğretmenler görür).</p>` +
      (more ? `<p style="margin:4px 0 0;font-size:12px;color:#64748b">${esc(more)}</p>` : ''),
    text: studentListBlock(students).text + '\n(Öğrenciye özel not yazmak için yoklama bağlantısını açıp öğrencinin yanındaki "Not" düğmesine dokunun.)',
  };
}

function etutTeacherMail(kind, etut, teacher, students, creatorName, url, changes) {
  const showList = kind !== 'etut-cancelled' && kind !== 'etut-unassigned';
  const attUrl = showList ? attendanceUrl(url, etut.id, teacher.id) : undefined;
  const list = attUrl ? teacherStudentListBlock(students, attUrl) : studentListBlock(students);
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
    url: showStudents ? attUrl : undefined,
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
const ATT_NOTE_MAX = 500;
const ATT_TOPIC_MAX = 200;
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
    // Aşama 23: öğrenciye özel not ve (etüt konusundan farklıysa) anlatılan konu
    notes: Object.fromEntries(
      Object.entries(att)
        .filter(([k, v]) => v && (v.note || v.topic) && c.students.some((s) => s.id === k))
        .map(([k, v]) => [k, { note: String(v.note || '').slice(0, ATT_NOTE_MAX), topic: String(v.topic || '').slice(0, ATT_TOPIC_MAX) }])
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
  // Aşama 23: öğrenciye özel not / farklı konu (gönderilmediyse eskisi korunur)
  const notesIn = body.notes && typeof body.notes === 'object' && !Array.isArray(body.notes) ? body.notes : null;
  const noteOf = (id) => {
    if (!notesIn || !Object.prototype.hasOwnProperty.call(notesIn, id)) return null;
    const v = notesIn[id] && typeof notesIn[id] === 'object' ? notesIn[id] : {};
    const note = String(v.note == null ? '' : v.note).replace(/\r\n?/g, '\n').trim();
    const topic = String(v.topic == null ? '' : v.topic).replace(/\s+/g, ' ').trim();
    if (note.length > ATT_NOTE_MAX) throw new HttpError(400, `Öğrenci notu en fazla ${ATT_NOTE_MAX} karakter olabilir.`);
    if (topic.length > ATT_TOPIC_MAX) throw new HttpError(400, `Anlatılan konu en fazla ${ATT_TOPIC_MAX} karakter olabilir.`);
    return { note, topic };
  };
  const now = new Date().toISOString();
  const teacherName = (c.teacher && c.teacher.name) || 'Etüt öğretmeni';
  const prev = (c.meta && typeof c.meta.studentAttendance === 'object' && c.meta.studentAttendance) || {};
  const next = { ...prev };
  for (const [id, status] of entries) {
    const s = byId.get(id);
    const n = noteOf(id);
    const old = prev[id] || {};
    next[id] = {
      ...old,
      studentId: id,
      studentName: s.name,
      status,
      note: n ? n.note : old.note || '',
      topic: n ? n.topic : old.topic || '',
      markedAt: now,
      updatedAt: now,
      markedBy: teacherName,
    };
    if (!next[id].topic) delete next[id].topic;
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
      note: (v && v.note) || `Etüt: ${(v && v.topic) || c.etut.topic || c.etut.subject}`,
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
// Aşama 82: KURUM GÖNDERİM HESABI — kurumun bir gönderim Gmail'i tanımlıysa o kurumdaki bütün e-postalar
// bu tek adresten gider (öğretmenin kendi Gmail'i kullanılmaz); "Yanıtla" öğretmene gider. Genel yönetici ve
// kurumsuz öğretmenler eskisi gibi (öğretmenin Gmail'i ya da okul hesabı) gönderir.
const kurumOfAuthCache = new Map();
async function kurumIdForSender(teacher) {
  if (teacher && teacher.kurumId !== undefined) return teacher.kurumId || null;
  if (teacher && teacher.kurum_id !== undefined) return teacher.kurum_id || null;
  const auth = (teacher && (teacher.authId || teacher.auth_user_id)) || null;
  if (!auth) return null;
  if (kurumOfAuthCache.has(auth)) return kurumOfAuthCache.get(auth);
  let kid = null;
  try {
    const rows = await rest(`teachers?select=kurum_id&auth_user_id=eq.${encodeURIComponent(auth)}`, { token: 'service' });
    kid = (rows && rows[0] && rows[0].kurum_id) || null;
  } catch {
    kid = null; // kurum sütunu yoksa (eski kurulum) kurum hesabı kullanılmaz
  }
  kurumOfAuthCache.set(auth, kid);
  return kid;
}
// Aşama 83: kurumun adı ve logosu (e-posta başlığı) — kısa süre önbellekte tutulur
const kurumBrandCache = new Map();
async function kurumBrandFor(kid) {
  if (!kid) return null;
  const hit = kurumBrandCache.get(kid);
  if (hit && Date.now() - hit.at < 5 * 60 * 1000) return hit.v;
  let v = null;
  try {
    let k;
    try {
      k = await rest(`kurumlar?select=name,logo&id=eq.${encodeURIComponent(kid)}`, { token: 'service' });
    } catch {
      k = await rest(`kurumlar?select=name&id=eq.${encodeURIComponent(kid)}`, { token: 'service' }); // logo sütunu yoksa (82 öncesi)
    }
    const r = k && k[0];
    if (r) v = { name: String(r.name || ''), logo: typeof r.logo === 'string' ? r.logo : '' };
  } catch {
    v = null;
  }
  kurumBrandCache.set(kid, { at: Date.now(), v });
  return v;
}

async function kurumSender(teacher) {
  const kid = await kurumIdForSender(teacher);
  if (!kid) return null;
  try {
    const rows = await rest(`kurum_mail_accounts?select=gmail,secret&kurum_id=eq.${encodeURIComponent(kid)}`, { token: 'service' });
    const row = rows && rows[0];
    const pass = row ? decryptSecret(row.secret) : null;
    if (!row || !pass) return null;
    const brand = await kurumBrandFor(kid);
    const brandName = (brand && brand.name) || '';
    const brandLogo = (brand && brand.logo) || '';
    const gmail = String(row.gmail || '').toLowerCase();
    const replyTo = isEmail(teacher.email) && String(teacher.email).toLowerCase() !== gmail ? teacher.email : null;
    return { via: 'kurum', user: row.gmail, pass, fromName: teacher.name || brandName || env().schoolName, replyTo, brandName, brandLogo };
  } catch {
    return null; // tablo yoksa (82 numaralı SQL çalışmadıysa) eski davranış
  }
}

// Aşama 83: kurum öğretmeninin e-postası hangi hesaptan giderse gitsin başlıkta kendi kurumunun adı ve logosu görünür
async function resolveSender(teacher) {
  const s = await resolveSenderAccount(teacher || {});
  if (!s || s.via === 'kurum') return s;
  try {
    const brand = await kurumBrandFor(await kurumIdForSender(teacher || {}));
    if (brand && (brand.name || brand.logo)) return { ...s, brandName: brand.name, brandLogo: brand.logo };
  } catch {}
  return s;
}

async function resolveSenderAccount(teacher) {
  const e = env();
  const ks = await kurumSender(teacher || {});
  if (ks) return ks;
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
// ----------------------------------------------------------------------------- Aşama 72: bildirim izinleri
// Yöneticinin "Bildirim izinleri" ayarına göre: kapalı olan e-postalar gönderilmez; veliye e-posta açıksa
// öğrenciye giden e-postanın bir kopyası öğrencinin kayıtlı velilerine (students.parents) gönderilir.
const VELI_NOTE = 'Bu e-posta, velisi olduğunuz öğrenciye gönderilen bilgilendirmenin bir kopyasıdır.';
// ----------------------------------------------------------------------------- Aşama 85: iletişim bilgisi
// Veli bilgisi ile öğrencinin e-postası / telefonu korumalı tablodadır (student_contacts, sql/85).
// Sunucu bu bilgiyi yalnızca service yetkisiyle okur; kime gideceği her işlemde ayrıca denetlenir.
// Tablo yoksa (85 çalıştırılmadıysa) eski sütunlar okunur; tabloda boş kalan bilgi için de eski sütun yedek olur.
let contactsTableMissing = false;
async function studentContactsMap(ids) {
  const map = new Map();
  const list = [...new Set((ids || []).filter(Boolean).map(String))];
  for (let i = 0; i < list.length; i += 100) {
    const part = list.slice(i, i + 100);
    let legacy = [];
    try {
      legacy = (await rest(`students?select=id,email,phone,parents&id=in.${inList(part)}`, { token: 'service' })) || [];
    } catch {
      try {
        legacy = (await rest(`students?select=id,email,phone&id=in.${inList(part)}`, { token: 'service' })) || []; // veli sütunu yoksa
      } catch {
        legacy = [];
      }
    }
    for (const r of legacy) {
      map.set(String(r.id), { email: r.email || '', phone: r.phone || '', parents: Array.isArray(r.parents) ? r.parents : [] });
    }
    if (contactsTableMissing) continue;
    try {
      const rows = (await rest(`student_contacts?select=id,email,phone,parents&id=in.${inList(part)}`, { token: 'service' })) || [];
      for (const c of rows) {
        const old = map.get(String(c.id)) || { email: '', phone: '', parents: [] };
        map.set(String(c.id), {
          email: c.email || old.email || '',
          phone: c.phone || old.phone || '',
          parents: Array.isArray(c.parents) && c.parents.length ? c.parents : old.parents,
        });
      }
    } catch {
      contactsTableMissing = true; // 85 numaralı SQL çalıştırılmadı: eski sütunlar yeterli
    }
  }
  return map;
}
/** Öğrenci satırlarına e-posta adresini ekler (service ile; satırlar çağıranın kendi yetkisiyle okunmuştur) */
async function withStudentEmails(rows) {
  const list = rows || [];
  if (!list.length) return list;
  const cmap = await studentContactsMap(list.map((s) => s.id));
  return list.map((s) => ({ ...s, email: (cmap.get(String(s.id)) || {}).email || '' }));
}

async function studentParentsMap(ids) {
  const map = new Map();
  const list = [...new Set(ids.filter(Boolean).map(String))];
  const cmap = await studentContactsMap(list);
  for (let i = 0; i < list.length; i += 100) {
    const part = list.slice(i, i + 100);
    try {
      const rows = await rest(`students?select=id,name&id=in.${inList(part)}`, { token: 'service' });
      for (const r of rows || []) {
        const c = cmap.get(String(r.id)) || { phone: '', parents: [] };
        map.set(String(r.id), { name: r.name || '', phone: c.phone || '', parents: Array.isArray(c.parents) ? c.parents : [] });
      }
    } catch {
      // öğrenci okunamadı: veliye gönderilmez
    }
  }
  return map;
}
function veliCopy(it, parent, studentName) {
  const who = String((parent && parent.name) || '').trim() || 'Sayın Veli';
  const html = typeof it.html === 'string'
    ? it.html.replace(
        '<tr><td style="padding:24px 24px 8px">',
        `<tr><td style="padding:12px 24px 0"><p style="margin:0;padding:10px 12px;background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;font-size:13px;color:#9a3412">${esc(VELI_NOTE)}${studentName ? ` (${esc(studentName)})` : ''}</p></td></tr><tr><td style="padding:24px 24px 8px">`,
      )
    : it.html;
  return {
    ...it,
    to: String(parent.email || '').trim(),
    toName: `${who}${studentName ? ` (${studentName} velisi)` : ''}`.slice(0, 120),
    role: 'veli',
    subject: `[Veli] ${it.subject || ''}`.slice(0, 250),
    text: `${VELI_NOTE}${studentName ? ` (${studentName})` : ''}\n\n${it.text || ''}`,
    html,
  };
}
// ----------------------------------------------------------------------------- Aşama 73: SMS
// Bildirim izinlerinde SMS açık olan bilgi, ilgili kişinin cep telefonuna kısa bir cümle + site bağlantısı olarak gider.
// Öğrenci: öğrenci kaydındaki telefon · Veli: kayıttaki velilerin cep telefonları · Öğretmen: öğretmen kaydındaki telefon.
async function sendPolicySms(items, policy) {
  const pm = await policyMod();
  const sm = await smsMod();
  if (!pm || !sm) return null;
  const { allowed, MAIL_EVENT_CATEGORY } = pm;
  const { dispatchSms, smsTextFor, smsConfigured } = sm;
  if (!smsConfigured()) return null;
  const want = [];
  for (const it of items) {
    const cat = MAIL_EVENT_CATEGORY[it.event];
    if (!cat) continue;
    const role = it.role === 'ogrenci' ? 'ogrenci' : 'ogretmen';
    if (role === 'ogrenci' && it.studentId) {
      const toStudent = allowed(policy, cat, 'ogrenci', 'sms');
      const toVeli = allowed(policy, cat, 'veli', 'sms');
      if (toStudent || toVeli) want.push({ it, toStudent, toVeli });
    } else if (role === 'ogretmen' && allowed(policy, cat, 'ogretmen', 'sms') && isEmail(it.to)) {
      want.push({ it, toTeacher: true });
    }
  }
  if (!want.length) return null;
  const url = appUrl(null);
  const students = await studentParentsMap(want.filter((w) => w.it.studentId).map((w) => w.it.studentId));
  const teacherEmails = [...new Set(want.filter((w) => w.toTeacher).map((w) => w.it.to.trim().toLowerCase()))];
  const teacherPhone = new Map();
  for (let i = 0; i < teacherEmails.length; i += 50) {
    try {
      const rows = await rest(`teachers?select=email,phone&email=in.${inList(teacherEmails.slice(i, i + 50))}`, { token: 'service' });
      for (const r of rows || []) if (r.email) teacherPhone.set(String(r.email).toLowerCase(), r.phone || '');
    } catch {
      // öğretmen telefonu okunamazsa öğretmene SMS gitmez
    }
  }
  const jobs = [];
  for (const w of want) {
    const it = w.it;
    const base = { event: it.event, refId: it.refId, once: ONCE_EVENTS.has(it.event) };
    if (w.toTeacher) {
      const ph = teacherPhone.get(it.to.trim().toLowerCase());
      if (ph) jobs.push({ ...base, role: 'ogretmen', phone: ph, text: smsTextFor(it.event, 'ogretmen', url) });
      continue;
    }
    const st = students.get(String(it.studentId));
    if (!st) continue;
    if (w.toStudent && st.phone) jobs.push({ ...base, role: 'ogrenci', phone: st.phone, text: smsTextFor(it.event, 'ogrenci', url) });
    if (w.toVeli) {
      for (const p of st.parents) {
        if (p && p.phone) jobs.push({ ...base, role: 'veli', phone: p.phone, text: smsTextFor(it.event, 'veli', url) });
      }
    }
  }
  const r = await dispatchSms(rest, jobs);
  if (r.errors.length) console.error('[sms]', r.errors.join(' | '));
  return r;
}

async function actionSmsStatus(caller) {
  if (!caller.isAdmin) throw new HttpError(403, 'SMS ayarlarını yalnızca yönetici görebilir.');
  const sm = await smsMod();
  if (!sm) throw new HttpError(503, 'SMS dosyası (api/_sms.js) sunucuda bulunamadı. Dosyayı GitHub\'da api klasörüne yükleyin.');
  return { ok: true, sms: await sm.smsStatus(rest) };
}

async function actionSmsTest(caller, body) {
  if (!caller.isAdmin) throw new HttpError(403, 'SMS sınamasını yalnızca yönetici yapabilir.');
  const sm = await smsMod();
  if (!sm) throw new HttpError(503, 'SMS dosyası (api/_sms.js) sunucuda bulunamadı. Dosyayı GitHub\'da api klasörüne yükleyin.');
  const { smsEnv, smsConfigured, normPhone, providerSend } = sm;
  const e = smsEnv();
  if (!smsConfigured(e)) throw new HttpError(400, 'SMS sağlayıcı bilgileri Vercel ortam değişkenlerinde eksik.');
  const phone = normPhone(body.phone);
  if (!phone) throw new HttpError(400, 'Geçerli bir cep telefonu yazın (ör. 0532 123 45 67).');
  // Sınama gerçek bir SMS gönderir (deneme modunda da); günde en çok 5 kez
  try {
    const since = new Date(Date.now() - 86400000).toISOString();
    const used = await rest(`sms_log?select=id&event=eq.sms-test&created_at=gte.${encodeURIComponent(since)}&limit=6`, { token: 'service' });
    if ((used || []).length >= 5) throw new HttpError(429, 'Bugün yeterince sınama yapıldı (en çok 5). Yarın tekrar deneyin.');
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(503, 'SMS kayıt tablosu bulunamadı. Supabase SQL Editor\'de sql/73_sms.sql dosyasını çalıştırın.');
  }
  const text = `${e.appName}: SMS bağlantısı çalışıyor. Bu bir deneme mesajıdır.`;
  const r = await providerSend([phone], text, e);
  try {
    await rest('sms_log', {
      token: 'service',
      method: 'POST',
      prefer: 'return=minimal',
      body: {
        dedupe_key: `sms-test|${Date.now()}|${Math.random().toString(36).slice(2, 8)}`,
        event: 'sms-test',
        recipient_role: 'ogretmen',
        phone_masked: `0${phone.slice(0, 3)}***${phone.slice(-4)}`,
        status: r.ok ? 'sent' : 'failed',
        provider: e.provider,
        provider_id: r.ok ? r.id : null,
        error: r.ok ? null : String(r.error || '').slice(0, 300),
      },
    });
  } catch {}
  if (!r.ok) return { ok: false, error: r.error || 'SMS gönderilemedi.', raw: r.raw || '' };
  return { ok: true, sent: 1, raw: r.raw || '' };
}

// Aşama 78: SMS göndermeden kalan kontör ve onaylı gönderen başlıklarını sorgular (şimdilik yalnızca Gold Mesaj)
async function actionSmsInfo(caller) {
  if (!caller.isAdmin) throw new HttpError(403, 'SMS bilgisini yalnızca yönetici görebilir.');
  const sm = await smsMod();
  if (!sm) throw new HttpError(503, 'SMS dosyası (api/_sms.js) sunucuda bulunamadı. Dosyayı GitHub\'da api klasörüne yükleyin.');
  const e = sm.smsEnv();
  if (!sm.smsConfigured(e)) throw new HttpError(400, 'SMS sağlayıcı bilgileri Vercel ortam değişkenlerinde eksik.');
  if (e.provider !== 'goldmesaj') throw new HttpError(400, 'Kontör sorgusu şimdilik yalnızca Gold Mesaj için kullanılabilir.');
  return { ok: true, info: await sm.providerInfo(e) };
}

// ----------------------------------------------------------------------------- Aşama 73: Veli duyurusu
// Öğretmen / yönetici, seçtiği öğrencilerin velilerine (students.parents) e-posta ve/veya SMS ile serbest metinli duyuru gönderir.
// Alıcılar SUNUCUDA bulunur: yalnızca çağıranın kendi oturumuyla görebildiği öğrencilerin velilerine gider (veritabanı kuralları denetler).
// Aynı gönderim kimliği (sendId) tekrar gönderilirse daha önce giden kişilere ikinci kez gitmez.
const ANNOUNCE_MAX_STUDENTS = 400;
const ANNOUNCE_SUBJECT_MAX = 100;
const ANNOUNCE_TEXT_MAX = 1500;
const ANNOUNCE_SMS_MAX = 270;

async function actionParentAnnounce(caller, body, deadline) {
  const sendId = String(body.sendId || '');
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(sendId)) throw new HttpError(400, 'Gönderim kimliği eksik. Sayfayı yenileyip tekrar deneyin.');
  const ids = [...new Set(arr(body.studentIds))];
  if (!ids.length) throw new HttpError(400, 'Alıcı seçilmedi.');
  if (ids.length > ANNOUNCE_MAX_STUDENTS) throw new HttpError(400, `Bir seferde en çok ${ANNOUNCE_MAX_STUDENTS} öğrencinin velisine gönderilebilir.`);
  const subject = clean(body.subject).slice(0, ANNOUNCE_SUBJECT_MAX);
  if (!subject) throw new HttpError(400, 'Başlık yazın.');
  const message = String(body.message == null ? '' : body.message).replace(/\r\n/g, '\n').trim();
  if (!message) throw new HttpError(400, 'Mesaj yazın.');
  if (message.length > ANNOUNCE_TEXT_MAX) throw new HttpError(400, `Mesaj en çok ${ANNOUNCE_TEXT_MAX} karakter olabilir.`);
  const ch = body.channels && typeof body.channels === 'object' ? body.channels : {};
  const wantMail = !!ch.email;
  const wantSms = !!ch.sms;
  if (!wantMail && !wantSms) throw new HttpError(400, 'En az bir gönderim yolu seçin (e-posta veya SMS).');
  if (wantSms && message.length > ANNOUNCE_SMS_MAX) throw new HttpError(400, `SMS için mesaj en çok ${ANNOUNCE_SMS_MAX} karakter olabilir. Mesajı kısaltın ya da yalnızca e-posta seçin.`);
  // Aşama 83: alıcılar — veliler ve/veya öğrencilerin kendileri (eski sürüm yalnızca velilere gönderir)
  const au = body.audience && typeof body.audience === 'object' ? body.audience : { parents: true };
  const toParents = au.parents !== false;
  const toStudents = au.students === true;
  if (!toParents && !toStudents) throw new HttpError(400, 'Alıcı seçin (veliler ve/veya öğrenciler).');

  // Aşama 82: rol yetkileri açık kurumda veli duyurusunu yalnızca yönetici, Rehberlik ve Ölçme Değerlendirme gönderir
  if (!caller.isAdmin && !caller.isKurumAdmin && caller.kurumId) {
    let rolesOn = false;
    try {
      rolesOn = (await rest('rpc/kurum_roles_on', { token: caller.token, method: 'POST', body: {} })) === true;
    } catch {
      rolesOn = false; // 82 numaralı SQL yoksa eski davranış
    }
    if (rolesOn) {
      const ok = await rest('rpc/has_any_role', { token: caller.token, method: 'POST', body: { p_roles: ['rehberlik', 'olcme_degerlendirme'] } }).catch(() => false);
      if (ok !== true) throw new HttpError(403, 'Veli / öğrenci duyurusunu yalnızca Müdür, Müdür Yardımcısı, Rehberlik ve Ölçme Değerlendirme gönderebilir.');
    }
  }

  // Çağıranın görebildiği öğrenciler (kendi oturumuyla)
  const visible = await studentsByIds(ids, caller.token);
  if (!visible.length) throw new HttpError(404, 'Seçilen öğrencilere erişiminiz yok ya da öğrenci bulunamadı.');
  const pmap = await studentParentsMap(visible.map((s) => s.id));
  const sm = wantSms ? await smsMod() : null;

  const byMail = new Map(); // e-posta -> { name, students: [], kind: 'veli' | 'ogrenci' }
  const phones = new Map(); // telefon -> 'veli' | 'ogrenci'
  const noContact = [];
  let studentMailCount = 0;
  let studentSmsCount = 0;
  const realMail = (em) => isEmail(em) && !/@(okul\.internal\.net|school\.internal|student\.school\.internal)$/i.test(em);
  for (const s of visible) {
    const info = pmap.get(String(s.id));
    const parents = toParents && info ? info.parents : [];
    let any = false;
    // Aşama 83: öğrencinin kendi e-postası / telefonu
    if (toStudents) {
      const sem = String(s.email || '').trim().toLowerCase();
      if (wantMail && realMail(sem) && !byMail.has(sem)) {
        any = true;
        studentMailCount += 1;
        byMail.set(sem, { name: clean(s.name), studentId: s.id, students: [s.name], kind: 'ogrenci' });
      }
      const sph = sm ? sm.normPhone(info && info.phone) : '';
      if (wantSms && sph && !phones.has(sph)) {
        any = true;
        studentSmsCount += 1;
        phones.set(sph, 'ogrenci');
      }
    }
    for (const p of parents) {
      const em = String((p && p.email) || '').trim().toLowerCase();
      if (wantMail && isEmail(em)) {
        any = true;
        const cur = byMail.get(em) || { name: clean(p.name), studentId: s.id, students: [], kind: 'veli' };
        if (!cur.name) cur.name = clean(p.name);
        if (!cur.students.includes(s.name)) cur.students.push(s.name);
        byMail.set(em, cur);
      }
      const ph = sm ? sm.normPhone(p && p.phone) : '';
      if (wantSms && ph) {
        any = true;
        if (!phones.has(ph)) phones.set(ph, 'veli');
      }
    }
    if (!any) noContact.push(s.name || '—');
  }

  // SMS (önce: hızlıdır; hata olsa da e-posta devam eder)
  let smsRes = null;
  if (wantSms) {
    if (!sm) smsRes = { available: false, error: 'SMS dosyası (api/_sms.js) sunucuda bulunamadı.' };
    else if (!sm.smsConfigured()) smsRes = { available: false, error: 'SMS sağlayıcı bilgileri Vercel ayarlarında eksik.' };
    else {
      const e = sm.smsEnv();
      const text = `${e.appName}: ${message}`.slice(0, 300);
      const jobs = [...phones].map(([phone, role]) => ({ event: 'parent-announce', refId: sendId, once: true, role, phone, text }));
      const r = await sm.dispatchSms(rest, jobs);
      smsRes = {
        available: true,
        live: e.live,
        recipients: jobs.length,
        sent: r.sent,
        dry: r.dry,
        failed: r.failed,
        skipped: r.skipped,
        limited: r.limited,
        errors: (r.errors || []).slice(0, 3),
      };
    }
  }

  // E-posta
  let mailRes = { sent: 0, failed: 0, skipped: 0, remaining: 0, errors: [] };
  if (wantMail && byMail.size) {
    const sender = await resolveSender(caller);
    const items = [];
    for (const [em, v] of byMail) {
      const isStudent = v.kind === 'ogrenci';
      const who = v.name || (isStudent ? 'Öğrenci' : 'Veli');
      const { html, text } = layout({
        heading: subject,
        greeting: isStudent ? `Merhaba ${who},` : `Sayın ${who},`,
        rows: isStudent
          ? [['Gönderen', caller.name]]
          : [
              [v.students.length > 1 ? 'Öğrenciler' : 'Öğrenci', v.students.join(', ')],
              ['Gönderen', caller.name],
            ],
        extraHtml: `<p style="margin:16px 0 0;font-size:14px;line-height:1.7;color:#334155;white-space:pre-wrap">${esc(message)}</p>`,
        extraText: message,
        footer: isStudent
          ? 'Bu e-posta, kayıtlı e-posta adresinize öğretmeniniz tarafından gönderilmiştir. E-postayı yanıtlarsanız yanıtınız göndericiye ulaşır.'
          : 'Bu e-posta, öğrencinizin velisi olarak kayıtlı e-posta adresinize öğretmeniniz tarafından gönderilmiştir. E-postayı yanıtlarsanız yanıtınız göndericiye ulaşır.',
      });
      items.push({
        event: 'parent-announce',
        refId: sendId,
        refTitle: subject,
        to: em,
        toName: (isStudent ? who : `${who} (${v.students[0]} velisi)`).slice(0, 120),
        role: isStudent ? 'ogrenci' : 'veli',
        studentId: v.studentId,
        subject,
        html,
        text,
      });
    }
    mailRes = await deliver(sender, caller, items, deadline);
  }

  return {
    ok: true,
    ...mailRes,
    announce: {
      students: visible.length,
      notVisible: ids.length - visible.length,
      mailRecipients: byMail.size,
      smsRecipients: phones.size,
      studentMailRecipients: studentMailCount,
      studentSmsRecipients: studentSmsCount,
      noContact: noContact.length,
      noContactNames: noContact.slice(0, 40),
    },
    sms: smsRes,
  };
}

async function applyMailPolicy(items) {
  const pm = await policyMod();
  if (!pm) return items; // izin dosyası yoksa eski davranış: e-postalar olduğu gibi gider
  const { loadPolicy, allowed, MAIL_EVENT_CATEGORY } = pm;
  const policy = await loadPolicy(rest);
  // Aşama 73: SMS (yönetici izin verdiyse) — e-postadan bağımsız; hata olsa da e-posta devam eder
  try {
    await sendPolicySms(items, policy);
  } catch (err) {
    console.error('[sms] gönderim hazırlanamadı', err && err.message);
  }
  const out = [];
  const veliFor = [];
  for (const it of items) {
    const cat = MAIL_EVENT_CATEGORY[it.event];
    const role = it.role === 'ogrenci' ? 'ogrenci' : it.role === 'veli' ? 'veli' : 'ogretmen';
    if (allowed(policy, cat, role, 'email')) out.push(it);
    if (cat && role === 'ogrenci' && it.studentId && allowed(policy, cat, 'veli', 'email')) veliFor.push(it);
  }
  if (veliFor.length) {
    const map = await studentParentsMap(veliFor.map((it) => it.studentId));
    for (const it of veliFor) {
      const st = map.get(String(it.studentId));
      if (!st) continue;
      const seen = new Set();
      for (const p of st.parents) {
        const em = String((p && p.email) || '').trim().toLowerCase();
        if (!isEmail(em) || seen.has(em) || em === String(it.to || '').trim().toLowerCase()) continue;
        seen.add(em);
        out.push(veliCopy(it, p, st.name || it.toName || ''));
      }
    }
  }
  return out;
}

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
  items = await applyMailPolicy(items);
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

  // Aşama 82-83: kurum öğretmenlerinin e-postalarında başlıktaki okul adı yerine kurumun adı ve logosu görünür
  if (sender.brandName || sender.brandLogo) {
    const m = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$/.exec(String(sender.brandLogo || ''));
    const logo = m ? { cid: 'kurum-logo@biliredu', contentType: m[1], content: Buffer.from(m[2], 'base64') } : null;
    const from = `letter-spacing:.3px">${esc(env().schoolName)}</td>`;
    const img = logo
      ? `<img src="cid:${logo.cid}" alt="" width="28" height="28" style="display:inline-block;vertical-align:middle;width:28px;height:28px;border:0;border-radius:6px;background:#ffffff;padding:2px;margin-right:10px;object-fit:contain">`
      : '';
    const to = `letter-spacing:.3px">${img}<span style="vertical-align:middle">${esc(sender.brandName || env().schoolName)}</span></td>`;
    for (const it of queue) {
      if (typeof it.html !== 'string' || !it.html.includes(from)) continue;
      it.html = it.html.replace(from, to);
      if (logo) it.inline = [logo];
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
          attachments: it.attachments,
          inline: it.inline,
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
    const rows = await rest(`students?select=id,name,class_id,class_name,status&id=in.${inList(part)}`, { token });
    out.push(...(rows || []));
  }
  return withStudentEmails(out.filter((s) => !s.status || s.status === 'active')); // Aşama 85
}
async function studentsByClasses(classIds, token) {
  if (!classIds.length) return [];
  const rows = await rest(`students?select=id,name,class_id,class_name,status&class_id=in.${inList(classIds)}`, { token });
  return withStudentEmails((rows || []).filter((s) => !s.status || s.status === 'active')); // Aşama 85
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
// Aşama 87: e-posta ve SMS bağlantıları her zaman sitenin asıl adresine gider.
// Eski / yedek Vercel adresleri (ör. bilir-hoca.vercel.app, *.vercel.app deneme adresleri) hiç kullanılmaz;
// APP_URL ayarı eski bir adres gösterse bile www.biliredu.com kullanılır. Yerel denemede (localhost) yerel adres kalır.
const MAIN_APP_URL = 'https://www.biliredu.com';
function hostOf(u) {
  try {
    return new URL(u).hostname.toLowerCase();
  } catch {
    return '';
  }
}
function isLocalHost(h) {
  return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(h);
}
function appUrl(req) {
  const e = env();
  const envHost = e.appUrl ? hostOf(e.appUrl) : '';
  if (envHost && !envHost.endsWith('.vercel.app')) return e.appUrl;
  const host = req && req.headers ? String(req.headers['x-forwarded-host'] || req.headers.host || '') : '';
  if (host && isLocalHost(hostOf(`http://${host}`))) return `http://${host}`;
  return MAIN_APP_URL;
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
  // Aşama 82: kurumun gönderim hesabı varsa bütün e-postalar oradan gider
  let kurumAccount = null;
  if (caller.kurumId) {
    try {
      const rows = await rest(`kurum_mail_accounts?select=gmail&kurum_id=eq.${encodeURIComponent(caller.kurumId)}`, { token: 'service' });
      if (rows && rows[0]) kurumAccount = { gmail: rows[0].gmail };
    } catch {}
  }
  return {
    ok: true,
    kurumAccount,
    schoolConfigured,
    schoolAddress: schoolConfigured ? e.gmailUser : null,
    own,
    canSend: schoolConfigured || !!own || !!kurumAccount,
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

// ----------------------------------------------------------------------------- Aşama 82: kurum gönderim hesabı
async function kurumIdForAdmin(caller, body) {
  if (caller.isAdmin) {
    const id = String((body && body.kurumId) || '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(400, 'Kurum seçiniz.');
    return id;
  }
  if (caller.isKurumAdmin && caller.kurumId) return caller.kurumId;
  throw new HttpError(403, 'Kurum e-posta ayarını yalnızca kurum yöneticisi (Müdür / Müdür Yardımcısı) değiştirebilir.');
}
async function actionKurumMailStatus(caller, body) {
  const kid = await kurumIdForAdmin(caller, body);
  try {
    const rows = await rest(`kurum_mail_accounts?select=gmail,updated_at&kurum_id=eq.${encodeURIComponent(kid)}`, { token: 'service' });
    const r = rows && rows[0];
    return { ok: true, account: r ? { gmail: r.gmail, updatedAt: r.updated_at } : null };
  } catch {
    throw new HttpError(503, 'Kurum e-posta tablosu bulunamadı. Supabase SQL Editor\'de sql/82 numaralı dosyayı çalıştırın.');
  }
}
async function actionKurumMailConnect(caller, body) {
  const kid = await kurumIdForAdmin(caller, body);
  const gmail = clean(body.gmail).toLowerCase();
  const pass = String(body.appPassword || '').replace(/\s+/g, '');
  if (!isEmail(gmail)) throw new HttpError(400, 'Geçerli bir e-posta adresi yazın.');
  if (!/^[a-zA-Z]{16}$/.test(pass)) throw new HttpError(400, 'Uygulama şifresi 16 harften oluşur (boşluklar önemli değil).');
  const client = new SmtpClient({ host: env().smtpHost, port: env().smtpPort, insecure: env().smtpInsecure });
  try {
    await client.connect();
    await client.login(gmail, pass);
  } catch (err) {
    throw new HttpError(400, err.auth ? err.message : `Gmail'e bağlanılamadı: ${err.message}`);
  } finally {
    await client.quit();
  }
  try {
    await rest('kurum_mail_accounts?on_conflict=kurum_id', {
      token: 'service',
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=minimal',
      body: { kurum_id: kid, gmail, secret: encryptSecret(pass), updated_at: new Date().toISOString(), updated_by: caller.authId },
    });
  } catch {
    throw new HttpError(503, 'Kurum e-posta tablosu bulunamadı. Supabase SQL Editor\'de sql/82 numaralı dosyayı çalıştırın.');
  }
  return { ok: true, account: { gmail } };
}
async function actionKurumMailDisconnect(caller, body) {
  const kid = await kurumIdForAdmin(caller, body);
  await rest(`kurum_mail_accounts?kurum_id=eq.${encodeURIComponent(kid)}`, { token: 'service', method: 'DELETE', prefer: 'return=minimal' });
  return { ok: true, account: null };
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
    studentId: s.id,
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
    studentId: s.id,
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

// ----------------------------------------------------------------------------- Yoklaması alınmayan etüt uyarısı (Aşama 24)
// Etüt bittikten NOATT_GRACE_MIN dakika sonra hâlâ yoklama kaydı yoksa, etüdün kurum yöneticilerine
// (kurum yöneticisi yoksa genel yöneticiye) e-posta gider. Her etüt için her yöneticiye en fazla bir kez gider.
// Bugün ve dün (gece yarısını geçen etütler için) bakılır; bu görev 10 dakikalık zamanlayıcıyla birlikte çalışır.
const NOATT_GRACE_MIN = 60;
const NOATT_LOOKBACK_DAYS = 1;
const HEAD_ADMIN_EMAIL = 'm.bilirr@gmail.com';

function etutHasAttendanceRow(row) {
  const att = parseEtutMeta(row).studentAttendance;
  return !!att && typeof att === 'object' && Object.keys(att).length > 0;
}
// Öğrencisi olmayan etütte yoklama alınamaz; bu etütler için uyarı gitmez
function etutExpectsAttendanceRow(row) {
  if (arr(row.assigned_student_ids).length > 0) return true;
  const a = parseEtutMeta(row).assignedStudentIds;
  return a === 'all' || (Array.isArray(a) && a.length > 0);
}
// Tarih + dakika -> mutlak dakika (Türkiye saatine göre karşılaştırmak için)
function absMinutes(dateStr, minute) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr || ''));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 60000 + minute : null;
}
function addDaysStr(dateStr, delta) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + delta)).toISOString().slice(0, 10);
}
function etutNoAttendanceMail(etut, admin, teacherName, url) {
  const subject = `Yoklama alınmadı: ${clean(etut.subject)} – ${trDate(etut.date, etut.time)}`;
  const body = layout({
    heading: 'Etüt yoklaması alınmadı',
    greeting: `Merhaba ${clean(admin.name)},`,
    intro: 'Aşağıdaki etüt sona erdi ancak yoklaması henüz alınmadı. Etüt öğretmeninden yoklamayı almasını isteyebilirsiniz.',
    rows: etutRows(etut, teacherName),
    buttonLabel: 'Etütleri görüntüle',
    url,
  });
  return { subject, ...body };
}
// Etüdün kurumu: etüdü kaydeden (yoksa atanan sistem) öğretmenin kurumu. Alıcılar: o kurumun yöneticileri;
// kurum ya da kurum yöneticisi yoksa genel yönetici.
async function noAttendanceRecipients(etut, cache) {
  let kurumId = null;
  const probeIds = [etut.createdById, ...etut.teacherIds].filter((x) => x && !String(x).startsWith('ext-'));
  for (const id of probeIds) {
    if (!cache.teacherKurum.has(id)) {
      let k = null;
      try {
        const r = await rest(`teachers?select=kurum_id&id=eq.${encodeURIComponent(id)}`, { token: 'service' });
        k = r && r[0] && r[0].kurum_id ? String(r[0].kurum_id) : null;
      } catch {
        k = null; // kurum sütunu yoksa (17 numaralı SQL çalışmamışsa)
      }
      cache.teacherKurum.set(id, k);
    }
    kurumId = cache.teacherKurum.get(id);
    if (kurumId) break;
  }
  const key = kurumId || '-';
  if (!cache.admins.has(key)) {
    let list = [];
    if (kurumId) {
      try {
        const r = await rest(`teachers?select=name,email,status&is_admin=eq.true&kurum_id=eq.${encodeURIComponent(kurumId)}`, { token: 'service' });
        list = (r || [])
          .filter((a) => isEmail(a.email) && (!a.status || a.status === 'approved'))
          .map((a) => ({ name: a.name, email: a.email.trim() }));
      } catch {}
    }
    if (!list.length) list = [{ name: 'Genel Yönetici', email: HEAD_ADMIN_EMAIL }];
    cache.admins.set(key, list);
  }
  return cache.admins.get(key);
}
async function actionNoAttendanceAlerts(req, deadline) {
  const now = istanbulNow();
  const nowAbs = Date.UTC(+now.date.slice(0, 4), +now.date.slice(5, 7) - 1, +now.date.slice(8, 10)) / 60000 + now.minutes;
  const from = addDaysStr(now.date, -NOATT_LOOKBACK_DAYS);
  const to = addDaysStr(now.date, 1);
  const out = { checked: 0, due: 0, sent: 0, failed: 0, skipped: 0, noEmail: 0 };
  const rows = await rest(`etuts?select=*&date=gte.${from}&date=lt.${to}`, { token: 'service' });
  const url = appUrl(req);
  const cache = { teacherKurum: new Map(), admins: new Map() };
  const items = [];
  for (const row of rows || []) {
    if (!row || typeof row.id !== 'string' || row.id.startsWith('__')) continue;
    out.checked++;
    if (etutHasAttendanceRow(row) || !etutExpectsAttendanceRow(row)) continue;
    const etut = etutView(row);
    const st = etutStartMinute(etut);
    // Saat girilmemişse etüt günün sonunda bitmiş sayılır
    const endMin = st === null ? 24 * 60 - 1 : st + (Number(etut.duration) || 45);
    const endAbs = absMinutes(etut.date, endMin);
    if (endAbs === null || nowAbs < endAbs + NOATT_GRACE_MIN) continue;
    out.due++;
    const admins = await noAttendanceRecipients(etut, cache);
    const teachers = await resolveEtutTeachers(etut.teacherIds, etut.teacherName);
    const teacherName = teachers.length ? teachers.map((t) => t.name).join(', ') : etut.teacherName || 'Öğretmen';
    for (const a of admins) {
      items.push({
        event: 'etut-no-attendance',
        refId: etut.id,
        refTitle: `${etut.subject} – ${etut.topic}`,
        to: a.email,
        toName: a.name,
        role: 'ogretmen',
        ...etutNoAttendanceMail(etut, a, teacherName, url),
      });
    }
  }
  if (!items.length) return out;
  const owner = { authId: null, name: '', email: '' };
  const sender = await resolveSender(owner);
  const summary = await deliver(sender, owner, items, deadline);
  if (summary) {
    out.sent = summary.sent || 0;
    out.failed = summary.failed || 0;
    out.skipped = summary.skipped || 0;
    out.noEmail = summary.noEmail || 0;
  }
  return out;
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
    studentId: s.id,
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
    studentId: s.id,
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
        studentId: s.id,
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
// ============================================================================
// HAFTALIK PLAN: E-POSTA, İŞARETLEME BAĞLANTISI VE ÖĞRETMEN RAPORU (Aşama 22)
//  * plan-group : öğretmen planı gönderirken bir "gönderim grubu" açar (tek öğrenci / seçili öğrenciler / sınıf).
//  * plan-mail  : öğrenciye planı e-postayla (gövdede tablo + PDF eki) gönderir; e-postada kişisel işaretleme bağlantısı vardır.
//  * plan-get / plan-mark : giriş gerektirmeyen işaretleme sayfası (imzalı bağlantı).
//  * Zamanlanmış görev: planın son görev günü saat 20:00'de öğretmene rapor (sınıfa verildiyse toplu karne).
//    Öğrencilere e-posta gönderilmemiş gruplar için rapor gitmez.
// ============================================================================
const PLAN_DAY_NAMES = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
const PLAN_DAY_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
// Esnek hafta başlangıcı: plan Pazartesi dışında bir günde başlayabilir; gün adı gerçek tarihten hesaplanır.
// "day" = planın başlangıcından itibaren gün sırası (Pazartesi başlayan eski planlarda 0 = Pazartesi).
function planDowIndex(weekStart, day) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(addDaysYmd(weekStart, day));
  if (!m) return ((Number(day) % 7) + 7) % 7;
  return (new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay() + 6) % 7; // Pazartesi = 0 … Pazar = 6
}
const planDayName = (weekStart, day) => PLAN_DAY_NAMES[planDowIndex(weekStart, day)];
const planDayShort = (weekStart, day) => PLAN_DAY_SHORT[planDowIndex(weekStart, day)];
const PLAN_REPORT_MINUTE = 20 * 60; // görev verilen son gün saat 20:00
const PLAN_LINK_EXTRA_DAYS = 21; // işaretleme bağlantısı hafta bittikten sonra 3 hafta daha açılır
const PLAN_PDF_MAX_BYTES = 3 * 1024 * 1024;
const PLAN_MAX_STUDENTS = 80;

const planIdOf = (studentId, weekStart) => `plan-${studentId}-${weekStart}`;
const isWeekStart = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
function planDateText(weekStart, day) {
  const d = addDaysYmd(weekStart, day);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  return m ? `${+m[3]} ${AYLAR[+m[2] - 1]}` : d;
}
function planWeekText(weekStart) {
  const end = addDaysYmd(weekStart, 6);
  const a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(weekStart);
  const b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(end);
  if (!a || !b) return weekStart;
  return a[2] === b[2] ? `${+a[3]}–${+b[3]} ${AYLAR[+b[2] - 1]} ${b[1]}` : `${+a[3]} ${AYLAR[+a[2] - 1]} – ${+b[3]} ${AYLAR[+b[2] - 1]} ${b[1]}`;
}
function planKey() {
  const e = env();
  const base = e.secretKey || e.service;
  if (!base) throw new HttpError(503, 'Sunucu ayarları eksik (SUPABASE_SERVICE_ROLE_KEY).');
  return crypto.createHash('sha256').update(`study-plan:${base}`).digest();
}
function makePlanToken(planId, studentId, weekStart) {
  const end = Date.parse(`${addDaysYmd(weekStart, 7)}T00:00:00Z`) || Date.now();
  const payload = b64u(JSON.stringify({ p: String(planId), s: String(studentId), x: Math.floor(end / 1000) + PLAN_LINK_EXTRA_DAYS * 86400 }));
  const sig = b64u(crypto.createHmac('sha256', planKey()).update(payload).digest());
  return `${payload}.${sig}`;
}
function planMarkUrl(base, planId, studentId, weekStart) {
  if (!base) return '';
  return `${String(base).replace(/\/+$/, '')}/?plan=${makePlanToken(planId, studentId, weekStart)}`;
}
function readPlanToken(token) {
  const bad = 'Plan bağlantısı geçersiz. Bağlantıyı e-postadan eksiksiz açtığınızdan emin olun.';
  if (typeof token !== 'string' || token.length > 800 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) throw new HttpError(400, bad);
  const [payload, sig] = token.split('.');
  const expected = b64u(crypto.createHmac('sha256', planKey()).update(payload).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new HttpError(400, bad);
  let data;
  try {
    data = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  } catch {
    throw new HttpError(400, bad);
  }
  if (!data || typeof data.p !== 'string' || typeof data.s !== 'string') throw new HttpError(400, bad);
  if (!(Number(data.x) > Date.now() / 1000)) throw new HttpError(410, 'Bu plan bağlantısının süresi dolmuş.');
  return { planId: data.p, studentId: data.s };
}
async function planItemsFor(planIds) {
  if (!planIds.length) return [];
  const out = [];
  for (let i = 0; i < planIds.length; i += 60) {
    const rows = await rest(
      `study_plan_items?select=id,plan_id,student_id,day,subject,book,note,position,created_by_name,done_at&plan_id=in.${inList(planIds.slice(i, i + 60))}&order=day.asc,position.asc`,
      { token: 'service' },
    );
    out.push(...(rows || []));
  }
  return out;
}
const sortPlanItems = (items) =>
  [...items].sort((x, y) => x.day - y.day || (x.position || 0) - (y.position || 0) || String(x.subject).localeCompare(String(y.subject), 'tr'));

// ----------------------------------------------------------------------------- Öğrenciye giden plan e-postası
function planTableBlock(weekStart, items, withStatus) {
  const days = PLAN_DAY_NAMES.map((_, d) => ({ name: planDayName(weekStart, d), d, list: sortPlanItems(items.filter((i) => i.day === d)) })).filter((x) => x.list.length);
  const html = days
    .map(
      (x) =>
        `<p style="margin:16px 0 6px;font-size:13px;font-weight:700;color:#3730a3">${esc(x.name)} · ${esc(planDateText(weekStart, x.d))}</p>` +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e3e6ef;border-radius:10px;border-collapse:separate;overflow:hidden">` +
        x.list
          .map(
            (i) =>
              `<tr><td style="padding:8px 10px;border-bottom:1px solid #eef0f5;font-size:13px;color:#0f172a;vertical-align:top;width:34%"><strong>${esc(i.subject)}</strong>${i.book ? `<br><span style="color:#64748b;font-size:12px">${esc(i.book)}</span>` : ''}</td>` +
              `<td style="padding:8px 10px;border-bottom:1px solid #eef0f5;font-size:13px;color:#334155;vertical-align:top">${esc(i.note || '-').replace(/\n/g, '<br>')}</td>` +
              (withStatus
                ? `<td style="padding:8px 10px;border-bottom:1px solid #eef0f5;font-size:13px;font-weight:700;white-space:nowrap;vertical-align:top;width:92px;text-align:right;color:${i.done_at ? '#047857' : '#b91c1c'}">${i.done_at ? '✓ Yaptı' : '✗ Yapmadı'}</td>`
                : ''),
          )
          .join('') +
        `</table>`,
    )
    .join('');
  const text = days
    .map((x) => `${x.name} (${planDateText(weekStart, x.d)}):\n${x.list.map((i) => `  - ${i.subject}${i.book ? ` / ${i.book}` : ''}: ${i.note || '-'}${withStatus ? (i.done_at ? ' [YAPTI]' : ' [YAPMADI]') : ''}`).join('\n')}`)
    .join('\n\n');
  return { html, text };
}
function planStudentMail(weekStart, items, student, teacherName, markUrl) {
  const block = planTableBlock(weekStart, items, false);
  const { html, text } = layout({
    heading: `Haftalık çalışma planın (${planWeekText(weekStart)})`,
    greeting: `Merhaba ${clean(student.name)},`,
    intro: `${teacherName} öğretmenin bu hafta için sana gün gün çalışma planı hazırladı. Planın aşağıda ve ekteki PDF dosyasında. Her görevi yaptıkça aşağıdaki düğmeden "yaptım" diye işaretle; öğretmenin hangi görevleri yaptığını görecek.`,
    extraHtml: block.html,
    extraText: block.text,
    buttonLabel: 'Planımı aç ve işaretle',
    url: markUrl,
    footer: 'Bu bağlantı sana özeldir; başkasıyla paylaşma. Görevlerini uygulamaya girerek ana sayfandan da işaretleyebilirsin.',
  });
  return { subject: `Haftalık çalışma planın: ${planWeekText(weekStart)}`, html, text };
}

async function actionPlanGroup(caller, body, req) {
  const weekStart = String(body.weekStart || '');
  if (!isWeekStart(weekStart)) throw new HttpError(400, 'Hafta bilgisi geçersiz.');
  const ids = uniqIds(arr(body.studentIds).map(String)).slice(0, PLAN_MAX_STUDENTS + 1);
  if (!ids.length) throw new HttpError(400, 'Öğrenci seçilmedi.');
  if (ids.length > PLAN_MAX_STUDENTS) throw new HttpError(400, `Bir seferde en fazla ${PLAN_MAX_STUDENTS} öğrenciye gönderilebilir.`);
  // Öğretmen bu öğrencilerin planlarını görebiliyor mu? (veritabanı kuralları öğretmenin oturumuyla denetlenir)
  const planIds = ids.map((sid) => planIdOf(sid, weekStart));
  const visible = await rest(`study_plans?select=id,student_id,sent_at&id=in.${inList(planIds)}`, { token: caller.token });
  const ok = (visible || []).filter((p) => p.sent_at);
  if (!ok.length) throw new HttpError(404, 'Gönderilmiş plan bulunamadı. Önce planı öğrenciye gönderin.');
  const students = await studentsByIds(ok.map((p) => p.student_id), caller.token);
  let kind = ['student', 'students', 'class'].includes(body.kind) ? body.kind : ok.length === 1 ? 'student' : 'students';
  if (ok.length === 1) kind = 'student';
  let label = '';
  let classId = null;
  if (kind === 'class' && typeof body.classId === 'string' && body.classId) {
    const cls = await rest(`classes?select=id,name&id=eq.${encodeURIComponent(body.classId)}`, { token: caller.token });
    if (cls && cls[0]) {
      classId = cls[0].id;
      label = clean(cls[0].name).slice(0, 120);
    } else kind = 'students';
  } else if (kind === 'class') kind = 'students';
  if (kind === 'student') label = clean((students[0] && students[0].name) || '').slice(0, 120);
  if (kind === 'students') label = `Seçili öğrenciler (${ok.length})`;
  const groupId = `pg-${crypto.randomUUID()}`;
  await rest('study_plan_groups', {
    token: 'service',
    method: 'POST',
    prefer: 'return=minimal',
    body: {
      id: groupId,
      week_start: weekStart,
      kind,
      class_id: classId,
      label,
      teacher_id: caller.teacherId,
      teacher_auth_id: caller.authId,
      teacher_name: clean(caller.name).slice(0, 120),
      mail_students: !!body.mailStudents,
    },
  });
  await rest(`study_plans?id=in.${inList(ok.map((p) => p.id))}`, { token: 'service', method: 'PATCH', prefer: 'return=minimal', body: { group_id: groupId } });
  const base = appUrl(req);
  const links = {};
  for (const p of ok) links[p.student_id] = planMarkUrl(base, p.id, p.student_id, weekStart);
  const byId = new Map(students.map((s) => [s.id, s]));
  return {
    ok: true,
    groupId,
    kind,
    label,
    links,
    students: ok.map((p) => ({ id: p.student_id, hasEmail: isEmail((byId.get(p.student_id) || {}).email) })),
    skipped: ids.length - ok.length,
  };
}

async function actionPlanMail(caller, body, req, deadline) {
  const groupId = String(body.groupId || '');
  const studentId = String(body.studentId || '');
  if (!/^pg-[\w-]{8,64}$/.test(groupId) || !studentId) throw new HttpError(400, 'Eksik bilgi.');
  const groups = await rest(`study_plan_groups?select=*&id=eq.${encodeURIComponent(groupId)}`, { token: 'service' });
  const group = groups && groups[0];
  if (!group) throw new HttpError(404, 'Gönderim bulunamadı.');
  if (group.teacher_auth_id !== caller.authId && !caller.isAdmin) throw new HttpError(403, 'Bu gönderimi yalnızca planı gönderen öğretmen kullanabilir.');
  const planId = planIdOf(studentId, group.week_start);
  // Öğretmenin bu öğrenciye erişimi hâlâ var mı? (kendi oturumuyla)
  const vis = await rest(`study_plans?select=id,sent_at,group_id&id=eq.${encodeURIComponent(planId)}`, { token: caller.token });
  const plan = vis && vis[0];
  if (!plan || plan.group_id !== groupId) throw new HttpError(404, 'Bu öğrencinin planı bu gönderimde değil.');
  if (!plan.sent_at) throw new HttpError(409, 'Plan geri çekilmiş; önce planı yeniden gönderin.');
  const students = await studentsByIds([studentId], caller.token);
  const student = students[0];
  if (!student) throw new HttpError(404, 'Öğrenci bulunamadı.');
  const items = await planItemsFor([planId]);
  if (!items.length) throw new HttpError(409, 'Planda görev yok.');
  let attachments;
  if (typeof body.pdf === 'string' && body.pdf) {
    const buf = Buffer.from(body.pdf.replace(/^data:application\/pdf;[^,]*,/, ''), 'base64');
    if (buf.length > PLAN_PDF_MAX_BYTES) throw new HttpError(413, 'PDF dosyası çok büyük.');
    if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') throw new HttpError(400, 'Ek bir PDF dosyası değil.');
    const safe = clean(student.name)
      .normalize('NFKD')
      .replace(/[^\w ]+/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 40);
    attachments = [{ filename: `Haftalik-Plan-${safe || 'ogrenci'}-${group.week_start}.pdf`, contentType: 'application/pdf', content: buf }];
  }
  const markUrl = planMarkUrl(appUrl(req), planId, studentId, group.week_start);
  const mail = planStudentMail(group.week_start, items, student, caller.name, markUrl);
  const sender = await resolveSender(caller);
  const summary = await deliver(
    sender,
    caller,
    [
      {
        event: 'plan-sent',
        refId: planId,
        refTitle: `Haftalık plan ${group.week_start}`,
        to: student.email,
        toName: student.name,
        role: 'ogrenci',
        studentId: student.id || studentId,
        repeatLimit: 3,
        attachments,
        ...mail,
      },
    ],
    deadline,
  );
  if (summary.sent > 0) {
    await rest(`study_plans?id=eq.${encodeURIComponent(planId)}`, { token: 'service', method: 'PATCH', prefer: 'return=minimal', body: { mailed_at: new Date().toISOString() } });
  }
  return { ok: true, markUrl, ...summary };
}

// ----------------------------------------------------------------------------- Aşama 47: deneme karnesi
// Yalnızca Deneme Analizi yetkisi olan yönetici, kendi kapsamındaki (sonucunu görebildiği) öğrenciye gönderebilir.
// Alıcı her zaman sunucuda veritabanından bulunur; tarayıcıdan e-posta adresi kabul edilmez.
async function actionDenemeKarne(caller, body, req, deadline) {
  const studentId = String(body.studentId || '');
  if (!studentId || studentId.length > 120) throw new HttpError(400, 'Eksik bilgi.');
  const can = await rest('rpc/deneme_can_manage', { token: caller.token, method: 'POST', body: {} });
  if (can !== true) throw new HttpError(403, 'Deneme karnesi göndermek için yetkiniz yok.');
  // Yöneticinin bu öğrencinin sonucunu görme yetkisi var mı? (kendi oturumuyla; veritabanı kuralları denetler)
  const vis = await rest(`deneme_results?select=id&student_id=eq.${encodeURIComponent(studentId)}&limit=1`, { token: caller.token });
  if (!vis || !vis.length) throw new HttpError(404, 'Bu öğrencinin size açık bir deneme sonucu yok.');
  const rows = await withStudentEmails(await rest(`students?select=id,name,status&id=eq.${encodeURIComponent(studentId)}`, { token: 'service' }));
  const student = rows && rows[0];
  if (!student || (student.status && student.status !== 'active')) throw new HttpError(404, 'Öğrenci bulunamadı.');
  if (typeof body.pdf !== 'string' || !body.pdf) throw new HttpError(400, 'Karne PDF dosyası eksik.');
  const buf = Buffer.from(body.pdf.replace(/^data:application\/pdf;[^,]*,/, ''), 'base64');
  if (buf.length > PLAN_PDF_MAX_BYTES) throw new HttpError(413, 'PDF dosyası çok büyük.');
  if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') throw new HttpError(400, 'Ek bir PDF dosyası değil.');
  const title = clean(String(body.title || 'Deneme karnesi')).slice(0, 120);
  const safe = clean(student.name)
    .normalize('NFKD')
    .replace(/[^\w ]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40);
  const { html, text } = layout({
    heading: title,
    greeting: `Merhaba ${clean(student.name)},`,
    intro: 'Deneme sonuçlarını, ders netlerini ve konu/kazanım analizini içeren karnen ekteki PDF dosyasında. Karneni uygulamaya girerek "Deneme Sonuçlarım" bölümünden de görebilirsin.',
    buttonLabel: 'Uygulamayı aç',
    url: appUrl(req),
    footer: 'Bu e-posta yalnızca sana gönderilmiştir; karnende kişisel bilgilerin bulunur, başkasıyla paylaşma.',
  });
  const sender = await resolveSender(caller);
  const summary = await deliver(
    sender,
    caller,
    [
      {
        event: 'deneme-karne',
        refId: `deneme-${studentId}`,
        refTitle: title,
        to: student.email,
        toName: student.name,
        role: 'ogrenci',
        studentId: student.id || studentId,
        repeatLimit: 5,
        attachments: [{ filename: `Deneme-Karnesi-${safe || 'ogrenci'}.pdf`, contentType: 'application/pdf', content: buf }],
        subject: title,
        html,
        text,
      },
    ],
    deadline,
  );
  return { ok: true, ...summary };
}

// ----------------------------------------------------------------------------- İşaretleme sayfası (giriş gerektirmez)
async function loadPlanByToken(token) {
  const { planId, studentId } = readPlanToken(token);
  const rows = await rest(`study_plans?select=id,student_id,week_start,sent_at,sent_by_name&id=eq.${encodeURIComponent(planId)}`, { token: 'service' });
  const plan = rows && rows[0];
  if (!plan || plan.student_id !== studentId) throw new HttpError(404, 'Plan bulunamadı ya da silinmiş.');
  if (!plan.sent_at) throw new HttpError(410, 'Öğretmenin bu planı geri çekmiş.');
  return plan;
}
async function actionPlanGet(body) {
  const plan = await loadPlanByToken(body.token);
  const st = await rest(`students?select=name,class_name&id=eq.${encodeURIComponent(plan.student_id)}`, { token: 'service' });
  const items = sortPlanItems(await planItemsFor([plan.id]));
  return {
    ok: true,
    studentName: clean((st && st[0] && st[0].name) || ''),
    className: clean((st && st[0] && st[0].class_name) || ''),
    weekStart: plan.week_start,
    weekLabel: planWeekText(plan.week_start),
    teacherName: clean(plan.sent_by_name || ''),
    today: istanbulNow().date,
    items: items.map((i) => ({
      id: i.id,
      day: i.day,
      date: addDaysYmd(plan.week_start, i.day),
      subject: clean(i.subject),
      book: clean(i.book || ''),
      note: String(i.note || '').slice(0, 1000),
      doneAt: i.done_at || null,
    })),
  };
}
async function actionPlanMark(body) {
  const plan = await loadPlanByToken(body.token);
  const itemId = String(body.itemId || '');
  if (!itemId || itemId.length > 120) throw new HttpError(400, 'Görev bulunamadı.');
  const doneAt = body.done ? new Date().toISOString() : null;
  const rows = await rest(`study_plan_items?id=eq.${encodeURIComponent(itemId)}&plan_id=eq.${encodeURIComponent(plan.id)}`, {
    token: 'service',
    method: 'PATCH',
    prefer: 'return=representation',
    body: { done_at: doneAt },
  });
  if (!rows || !rows.length) throw new HttpError(404, 'Görev bulunamadı ya da silinmiş.');
  return { ok: true, itemId, doneAt: rows[0].done_at || null };
}

// ----------------------------------------------------------------------------- Öğretmene rapor (son akşam 20:00)
const pctOf = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
const pctColor = (p) => (p >= 80 ? '#047857' : p >= 50 ? '#b45309' : '#b91c1c');
function planReportMail(group, students, plans, items) {
  const week = planWeekText(group.week_start);
  const byPlan = new Map();
  for (const it of items) {
    if (!byPlan.has(it.plan_id)) byPlan.set(it.plan_id, []);
    byPlan.get(it.plan_id).push(it);
  }
  const rows = plans
    .map((p) => {
      const s = students.find((x) => x.id === p.student_id) || { name: p.student_id, class_name: '' };
      const list = sortPlanItems(byPlan.get(p.id) || []);
      const done = list.filter((i) => i.done_at).length;
      return { plan: p, student: s, list, done, total: list.length, pct: pctOf(done, list.length) };
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => String(a.student.name).localeCompare(String(b.student.name), 'tr'));
  const allDone = rows.reduce((n, r) => n + r.done, 0);
  const allTotal = rows.reduce((n, r) => n + r.total, 0);

  if (group.kind === 'student' && rows.length === 1) {
    const r = rows[0];
    const block = planTableBlock(group.week_start, r.list, true);
    const { html, text } = layout({
      heading: `Haftalık plan raporu: ${clean(r.student.name)}`,
      greeting: `Sayın ${clean(group.teacher_name || 'Öğretmenim')},`,
      intro: `${week} haftası için gönderdiğiniz çalışma planının son durumu aşağıdadır. Öğrencinin "yaptım" işaretleri (uygulamadan ya da e-postadaki bağlantıdan) esas alınmıştır.`,
      rows: [
        ['Öğrenci', `${clean(r.student.name)}${r.student.class_name ? ` (${clean(r.student.class_name)})` : ''}`],
        ['Hafta', week],
        ['Tamamlanan', `${r.done} / ${r.total} görev (%${r.pct})`],
        ['E-posta', r.plan.mailed_at ? 'Plan öğrenciye e-postayla gönderildi' : 'Öğrencinin e-posta adresi yok; plan yalnız uygulamada görüldü'],
      ],
      extraHtml: block.html,
      extraText: block.text,
    });
    return { subject: `Plan raporu: ${clean(r.student.name)} – ${r.done}/${r.total} görev (%${r.pct})`, html, text };
  }

  // Toplu karne (sınıf ya da seçili öğrenciler)
  const usedDays = PLAN_DAY_NAMES.map((_, d) => d).filter((d) => rows.some((r) => r.list.some((i) => i.day === d)));
  const th = (t) => `<th style="padding:6px 4px;background:#eef2ff;color:#3730a3;font-size:11px;font-weight:700;border-bottom:1px solid #c7d2fe;text-align:center">${esc(t)}</th>`;
  const cell = (dn, dt) => {
    if (!dt) return `<td style="padding:6px 4px;font-size:12px;color:#cbd5e1;text-align:center;border-bottom:1px solid #eef0f5">–</td>`;
    const c = dn === dt ? '#047857' : dn === 0 ? '#b91c1c' : '#b45309';
    return `<td style="padding:6px 4px;font-size:12px;font-weight:700;color:${c};text-align:center;border-bottom:1px solid #eef0f5">${dn}/${dt}</td>`;
  };
  const tableHtml =
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;border:1px solid #e3e6ef;border-radius:10px;border-collapse:separate;overflow:hidden">` +
    `<tr><th style="padding:6px 8px;background:#eef2ff;color:#3730a3;font-size:11px;font-weight:700;border-bottom:1px solid #c7d2fe;text-align:left">Öğrenci</th>${usedDays.map((d) => th(planDayShort(group.week_start, d))).join('')}${th('Toplam')}</tr>` +
    rows
      .map(
        (r) =>
          `<tr><td style="padding:6px 8px;font-size:12px;color:#0f172a;font-weight:600;border-bottom:1px solid #eef0f5">${esc(r.student.name)}</td>` +
          usedDays
            .map((d) => {
              const l = r.list.filter((i) => i.day === d);
              return cell(l.filter((i) => i.done_at).length, l.length);
            })
            .join('') +
          `<td style="padding:6px 6px;font-size:12px;font-weight:800;color:${pctColor(r.pct)};text-align:center;border-bottom:1px solid #eef0f5;white-space:nowrap">${r.done}/${r.total} %${r.pct}</td></tr>`,
      )
      .join('') +
    `</table>`;
  const full = rows.filter((r) => r.done === r.total);
  const none = rows.filter((r) => r.done === 0);
  const missing = rows.filter((r) => r.done > 0 && r.done < r.total);
  const missingHtml = missing.length
    ? `<p style="margin:18px 0 6px;font-size:13px;font-weight:700;color:#0f172a">Eksik kalan görevler</p>` +
      missing
        .slice(0, 40)
        .map((r) => {
          const left = r.list.filter((i) => !i.done_at);
          const txt = left
            .slice(0, 6)
            .map((i) => `${planDayShort(group.week_start, i.day)} ${i.subject}${i.book ? ` (${i.book})` : ''}`)
            .join(', ');
          return `<p style="margin:0 0 4px;font-size:12px;color:#334155"><strong>${esc(r.student.name)}:</strong> ${esc(txt)}${left.length > 6 ? ` … +${left.length - 6}` : ''}</p>`;
        })
        .join('')
    : '';
  const listLine = (title, list) => (list.length ? `<p style="margin:12px 0 0;font-size:12px;color:#334155"><strong>${esc(title)} (${list.length}):</strong> ${esc(list.map((r) => r.student.name).join(', '))}</p>` : '');
  const heading = group.kind === 'class' ? `${clean(group.label)} haftalık plan karnesi` : `Haftalık plan karnesi: ${clean(group.label)}`;
  const { html, text } = layout({
    heading,
    greeting: `Sayın ${clean(group.teacher_name || 'Öğretmenim')},`,
    intro: `${week} haftası için gönderdiğiniz çalışma planlarının son durumu aşağıdadır. Hücrelerde "yapılan / verilen görev" sayısı yazar.`,
    rows: [
      [group.kind === 'class' ? 'Sınıf' : 'Grup', clean(group.label)],
      ['Hafta', week],
      ['Öğrenci', String(rows.length)],
      ['Genel tamamlama', `${allDone} / ${allTotal} görev (%${pctOf(allDone, allTotal)})`],
      ['Tamamını yapan', String(full.length)],
      ['Hiç işaretlemeyen', String(none.length)],
    ],
    extraHtml: tableHtml + listLine('Tamamını yapanlar', full) + listLine('Hiç işaretlemeyenler', none) + missingHtml,
    extraText:
      rows.map((r) => `${r.student.name}: ${r.done}/${r.total} (%${r.pct})`).join('\n') +
      (none.length ? `\n\nHiç işaretlemeyenler: ${none.map((r) => r.student.name).join(', ')}` : ''),
  });
  return { subject: `${heading} – %${pctOf(allDone, allTotal)}`, html, text };
}

async function actionPlanReports(req, deadline) {
  const now = istanbulNow();
  const out = { groups: 0, due: 0, sent: 0, failed: 0 };
  let groups;
  try {
    groups = await rest(
      `study_plan_groups?select=*&mail_students=is.true&report_sent_at=is.null&week_start=gte.${addDaysYmd(now.date, -21)}&week_start=lte.${now.date}&limit=200`,
      { token: 'service' },
    );
  } catch (err) {
    // 21 numaralı SQL çalıştırılmadıysa sessizce geç
    if (/study_plan_groups|does not exist|schema cache/i.test(String(err && err.message))) return out;
    throw err;
  }
  for (const g of groups || []) {
    if (Date.now() > deadline) break;
    out.groups++;
    const plans = (await rest(`study_plans?select=id,student_id,sent_at,mailed_at&group_id=eq.${encodeURIComponent(g.id)}`, { token: 'service' })) || [];
    const live = plans.filter((p) => p.sent_at);
    if (!live.length || !live.some((p) => p.mailed_at)) continue; // öğrenciye e-posta gitmediyse rapor yok
    const items = await planItemsFor(live.map((p) => p.id));
    if (!items.length) continue;
    const lastDay = Math.max(...items.map((i) => Number(i.day) || 0));
    const lastDate = addDaysYmd(g.week_start, lastDay);
    const due = now.date > lastDate || (now.date === lastDate && now.minutes >= PLAN_REPORT_MINUTE);
    if (!due) continue;
    if (now.date > addDaysYmd(lastDate, 7)) {
      // çok eski: artık gönderilmez
      await rest(`study_plan_groups?id=eq.${encodeURIComponent(g.id)}`, { token: 'service', method: 'PATCH', prefer: 'return=minimal', body: { report_sent_at: new Date().toISOString() } });
      continue;
    }
    // Rapor için "kilit" al: aynı anda iki çağrı aynı raporu göndermesin
    const claimed = await rest(`study_plan_groups?id=eq.${encodeURIComponent(g.id)}&report_sent_at=is.null`, {
      token: 'service',
      method: 'PATCH',
      prefer: 'return=representation',
      body: { report_sent_at: new Date().toISOString(), report_attempts: (Number(g.report_attempts) || 0) + 1 },
    });
    if (!claimed || !claimed.length) continue;
    out.due++;
    const trows = g.teacher_id ? await rest(`teachers?select=id,name,email,auth_user_id&id=eq.${encodeURIComponent(g.teacher_id)}`, { token: 'service' }) : [];
    const teacher = (trows && trows[0]) || { name: g.teacher_name, email: '', auth_user_id: g.teacher_auth_id };
    const students = await studentsByIds(live.map((p) => p.student_id), 'service');
    const mail = planReportMail({ ...g, teacher_name: teacher.name || g.teacher_name }, students, live, items);
    const owner = { authId: teacher.auth_user_id || g.teacher_auth_id || null, name: teacher.name || g.teacher_name || 'Öğretmen', email: teacher.email || '' };
    const sender = await resolveSender(owner);
    const summary = await deliver(
      sender,
      { authId: null, name: owner.name },
      [{ event: 'plan-report', refId: g.id, refTitle: `Plan raporu ${g.week_start}`, to: owner.email, toName: owner.name, role: 'ogretmen', ...mail }],
      deadline,
    );
    out.sent += summary.sent;
    if (!summary.sent && !summary.skipped && !summary.noEmail) {
      out.failed++;
      // Geçici hata: 3 denemeye kadar sonraki turda yeniden dene
      if ((Number(g.report_attempts) || 0) + 1 < 3)
        await rest(`study_plan_groups?id=eq.${encodeURIComponent(g.id)}`, { token: 'service', method: 'PATCH', prefer: 'return=minimal', body: { report_sent_at: null } });
    }
  }
  return out;
}

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
      // Aşama 19: etüt e-postaları (Supabase zamanlayıcısı her 10 dakikada çağırır); Aşama 22: plan raporları da
      if (task === 'etut-reminders') {
        const er = await actionEtutReminders(req, deadline);
        // Aşama 22: haftalık plan raporları (son görev günü 20:00)
        let pr = null;
        try {
          pr = await actionPlanReports(req, deadline);
        } catch (err) {
          console.error('[mail] plan raporu hatası', err && err.message);
        }
        // Aşama 24: etüdü bitmiş ama yoklaması alınmamış etütler için yöneticiye uyarı
        let na = null;
        try {
          na = await actionNoAttendanceAlerts(req, deadline);
        } catch (err) {
          console.error('[mail] yoklama uyarısı hatası', err && err.message);
        }
        return res.status(200).json({ ok: er.ok, date: er.date, scheduled: er.scheduled, due: er.due, leftover: er.leftover, sent: er.sent, failed: er.failed, skipped: er.skipped, noEmail: er.noEmail, planReports: pr ? pr.sent : 0, noAttendance: na ? na.sent : 0 });
      }
      const r = await actionReminders(req, deadline);
      // Günlük görevde de bir kez bakılır (10 dakikalık zamanlayıcı kurulmadıysa etüt e-postası hiç kaybolmasın)
      let er = null;
      try {
        er = await actionEtutReminders(req, deadline);
      } catch (err) {
        console.error('[mail] günlük etüt e-postası hatası', err && err.message);
      }
      let pr = null;
      try {
        pr = await actionPlanReports(req, deadline);
      } catch (err) {
        console.error('[mail] günlük plan raporu hatası', err && err.message);
      }
      let na = null;
      try {
        na = await actionNoAttendanceAlerts(req, deadline);
      } catch (err) {
        console.error('[mail] günlük yoklama uyarısı hatası', err && err.message);
      }
      // Zamanlanmış görev yanıtında kişi/ödev adı verilmez (yalnızca sayılar)
      return res.status(200).json({
        noAttendance: na ? na.sent : 0,
        etutSent: er ? er.sent : 0,
        planReports: pr ? pr.sent : 0,
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
    // Aşama 22: e-postadaki haftalık plan bağlantısı (giriş gerektirmez; imzalı bağlantı denetlenir)
    if (body.action === 'plan-get' || body.action === 'plan-mark') {
      if (!env().service) throw new HttpError(503, 'Sunucu ayarları eksik.');
      const r = body.action === 'plan-get' ? await actionPlanGet(body) : await actionPlanMark(body);
      return res.status(200).json(r);
    }
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
      case 'plan-group':
        result = await actionPlanGroup(caller, body, req);
        break;
      case 'plan-mail':
        result = await actionPlanMail(caller, body, req, deadline);
        break;
      case 'deneme-karne':
        result = await actionDenemeKarne(caller, body, req, deadline);
        break;
      case 'parent-announce':
        result = await actionParentAnnounce(caller, body, deadline);
        break;
      case 'kurum-mail-status':
        result = await actionKurumMailStatus(caller, body);
        break;
      case 'kurum-mail-connect':
        result = await actionKurumMailConnect(caller, body);
        break;
      case 'kurum-mail-disconnect':
        result = await actionKurumMailDisconnect(caller, body);
        break;
      case 'sms-status':
        result = await actionSmsStatus(caller);
        break;
      case 'sms-test':
        result = await actionSmsTest(caller, body);
        break;
      case 'sms-info':
        result = await actionSmsInfo(caller);
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
