// ============================================================================
// Aşama 367: VELİ GÖRÜNÜMÜ — sunucu tarafı yardımcıları (api/mail.js kullanır)
// Adı "_" ile başladığı için Vercel bunu ayrı bir adres olarak yayınlamaz; yalnızca içe aktarılır (yeni işlev yok).
//   * Bağlantı kodu, bağlantı kaydının kimliğinden gizli anahtarla türetilir (HMAC, 128 bit); veritabanında yalnız
//     kodun sha256 özeti durur. Karne bağlantısıyla aynı yöntem, ayrı anahtar.
//   * Sayfa sunucuda hazırlanır: uygulama indirilmez, betik yok (site güvenlik kuralı satır içi betiğe izin vermez);
//     hafta seçimi yalnız CSS ile çalışır.
//   * Gizlilik: ad soyadın baş harfi, TC / telefon / öğretmen notu / sıralama / başka öğrenci yok. SMS'te ad yok.
// Buradaki hesaplar saf işlevdir (tests/veli.test.ts sınar).
// ============================================================================
import crypto from 'node:crypto';

const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function linkKey(secretBase) {
  if (!secretBase) throw new Error('veli bağlantısı anahtarı yok');
  return crypto.createHash('sha256').update(`veli-link:${secretBase}`).digest();
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

// ----------------------------------------------------------------------------- tarih (İstanbul, UTC+3 sabit)
const IST = 3 * 3600000;
const AY = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const AY3 = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const GUN = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const GUN3 = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

export const istanbulYmd = (ms = Date.now()) => new Date(ms + IST).toISOString().slice(0, 10);
const ymdDate = (ymd) => new Date(`${ymd}T00:00:00Z`);
export const addDays = (ymd, n) => new Date(ymdDate(ymd).getTime() + n * 86400000).toISOString().slice(0, 10);
const gunNo = (ymd) => ymdDate(ymd).getUTCDay();
/** Pazartesi başlangıçlı bu hafta ve geçen hafta */
export function haftalar(bugun) {
  const bas = addDays(bugun, -((gunNo(bugun) + 6) % 7));
  return { bu: { bas, bit: addDays(bas, 6) }, gecen: { bas: addDays(bas, -7), bit: addDays(bas, -1) } };
}
const kisaTarih = (ymd) => `${Number(ymd.slice(8, 10))} ${AY3[Number(ymd.slice(5, 7)) - 1]}`;
const uzunTarih = (ymd) => `${Number(ymd.slice(8, 10))} ${AY[Number(ymd.slice(5, 7)) - 1]}`;
function aralikYazi(bas, bit) {
  const ayni = bas.slice(5, 7) === bit.slice(5, 7);
  return ayni ? `${Number(bas.slice(8, 10))}–${Number(bit.slice(8, 10))} ${AY3[Number(bit.slice(5, 7)) - 1]}` : `${kisaTarih(bas)} – ${kisaTarih(bit)}`;
}

/**
 * Bağlantının bitişi. sure: '7' | '30' | 'donem'. Dönem sonu: Ağustos–Ocak arası 31 Ocak, Şubat–Temmuz arası 30 Haziran
 * (İstanbul günü sonu). Dönem sonuna 7 günden az kaldıysa (ör. yaz tatili) 30 gün verilir.
 */
export function bitisTarihi(sure, now = Date.now()) {
  const gun = (n) => new Date(now + n * 86400000);
  if (String(sure) === '7') return gun(7);
  if (String(sure) === 'donem') {
    const t = istanbulYmd(now);
    const y = Number(t.slice(0, 4));
    const m = Number(t.slice(5, 7));
    const son = m >= 8 ? `${y + 1}-01-31` : m === 1 ? `${y}-01-31` : `${y}-06-30`;
    const ms = Date.parse(`${son}T23:59:00+03:00`);
    if (ms - now >= 7 * 86400000 && ms - now <= 190 * 86400000) return new Date(ms);
  }
  return gun(30);
}
export const bitisYazi = (iso) => uzunTarih(istanbulYmd(Date.parse(iso)));

// ----------------------------------------------------------------------------- veli listesi (mail.js pickParents ile aynı sıra)
const temiz = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const bilgiVar = (p) => !!p && typeof p === 'object' && !!(temiz(p.name) || temiz(p.phone) || temiz(p.email));
export function veliListesi(parents) {
  return (Array.isArray(parents) ? parents : []).filter(bilgiVar).slice(0, 3);
}
/** 0532 *** ** 12 */
export function telMaske(v) {
  let d = String(v || '').replace(/\D+/g, '');
  if (d.startsWith('90') && d.length === 12) d = d.slice(2);
  if (d.length === 10) d = `0${d}`;
  return d.length === 11 ? `${d.slice(0, 4)} *** ** ${d.slice(-2)}` : '';
}
/** a***@gmail.com */
export function epostaMaske(v) {
  const m = /^([^@\s]+)@([^@\s]+)$/.exec(String(v || '').trim());
  return m ? `${m[1].slice(0, 1)}***@${m[2]}` : '';
}
/** "Ali Yılmaz" → "Ali Y."; "Ali Can Yılmaz" → "Ali Can Y." */
export function kisaAd(ad) {
  const p = temiz(ad).split(' ').filter(Boolean);
  if (p.length < 2) return p[0] || 'Öğrenci';
  return `${p.slice(0, -1).join(' ')} ${p[p.length - 1].slice(0, 1).toLocaleUpperCase('tr-TR')}.`;
}
const basHarf = (ad) =>
  temiz(ad)
    .split(' ')
    .filter((w) => w && /\p{L}/u.test(w[0]))
    .slice(0, 2)
    .map((w) => w[0].toLocaleUpperCase('tr-TR'))
    .join('') || 'B';

// ----------------------------------------------------------------------------- metinler
export function smsMetni(url, bitisIso) {
  return `Değerli velimiz, öğrencimizin haftalık okul özeti: ${url} Bağlantı ${bitisYazi(bitisIso)} tarihine kadar geçerlidir.`;
}

// ----------------------------------------------------------------------------- soru hedefi (src/utils/targetDays.ts ile aynı kural, kısaltılmış)
const DERS_ESLE = { 'Fen Bilgisi': 'Fen Bilimleri', Edebiyat: 'Türk Dili ve Edebiyatı' };
const dersAd = (s) => DERS_ESLE[temiz(s)] || temiz(s);
const dersListesi = (s) => [...new Set(String(s || '').split(',').map(dersAd).filter(Boolean))];
const PLAN_KONU = 'Günlük plandan aktarılan konular';
const PLAN_SORU = 'Haftalık plandan aktarılan soru hedefi.';
const toplamHedef = (t) => Number(t.targetQuestions ?? t.weeklyTarget) || 0;
const esnek = (t) => !!t.dailyTargets && typeof t.dailyTargets === 'object' && Object.keys(t.dailyTargets).length > 0;
const planSoru = (t) => !!t.fromPlan && t.notes === PLAN_SORU && toplamHedef(t) >= 1;
const planKonu = (t) => !!t.fromPlan || String(t.notes || '').startsWith(PLAN_KONU);
function bekleyenPlan(t) {
  const n = toplamHedef(t);
  if (n > 1 || planSoru(t)) return false;
  if (planKonu(t)) return true;
  const konu = !!t.dailyTopics && typeof t.dailyTopics === 'object' && Object.keys(t.dailyTopics).length > 0;
  return konu || esnek(t) || n <= 0;
}
function hedefBitis(t) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(t.weekEndDate || '')) return t.weekEndDate;
  return /^\d{4}-\d{2}-\d{2}$/.test(t.weekStartDate || '') ? addDays(t.weekStartDate, Math.max(1, Number(t.targetDays) || 7) - 1) : t.weekStartDate || '';
}
function gunHedefi(t, ymd) {
  if (!t.weekStartDate || ymd < t.weekStartDate || ymd > hedefBitis(t)) return 0;
  if (esnek(t)) {
    const v = Number(t.dailyTargets[ymd]);
    return Number.isFinite(v) && v >= 0 ? Math.round(v) : 0;
  }
  const top = Math.max(1, toplamHedef(t) || 1);
  return Math.max(1, Number(t.dailyTarget) || Math.round(top / Math.max(1, Number(t.targetDays) || 7)) || 1);
}
const planSayi = (t) => planSoru(t) || (!!t.fromPlan && dersListesi(t.subject).length === 1 && toplamHedef(t) >= 1);
function planAynasi(t, hepsi) {
  if (t.targetType === 'class' || !esnek(t) || planKonu(t)) return false;
  const list = dersListesi(t.subject);
  if (list.length === 1) return false;
  const gunler = Object.entries(t.dailyTargets || {}).filter(([, n]) => (Number(n) || 0) > 0).map(([d]) => d);
  const planlar = hepsi.filter((o) => o !== t && planSayi(o) && o.studentId === t.studentId && (!list.length || list.includes(dersAd(o.subject))));
  return gunler.length > 0 && planlar.length > 0 && gunler.some((d) => planlar.some((o) => gunHedefi(o, d) > 0));
}
/** Bir günün hedefi: genel hedef varsa onun sayısı, yoksa ders hedeflerinin toplamı (weekDayGoal ile aynı) */
export function gunlukHedef(ymd, hedefler) {
  const ayna = new Set(hedefler.filter((t) => planAynasi(t, hedefler)));
  let genel = null;
  for (const t of hedefler) {
    if (t.subject || ayna.has(t)) continue;
    if (ymd < (t.weekStartDate || '') || ymd > hedefBitis(t)) continue;
    const g = gunHedefi(t, ymd);
    if (genel === null || g > genel) genel = g;
  }
  if (genel !== null) return Math.max(0, genel);
  let top = 0;
  for (const t of hedefler) if (t.subject && !ayna.has(t)) top += gunHedefi(t, ymd);
  return top;
}

// ----------------------------------------------------------------------------- özet
const ODEV_SIRA = { bad: 0, n: 1, warn: 2, ok: 3 };
function odevDurum(o, bugun) {
  if (o.teslim === 'on_time') return { cls: 'ok', yazi: 'Teslim' };
  if (o.teslim === 'late') return { cls: 'warn', yazi: 'Geç teslim' };
  if (o.teslim === 'not_submitted') return { cls: 'bad', yazi: 'Teslim etmedi' };
  return o.son && o.son < bugun ? { cls: 'bad', yazi: 'Gecikti' } : { cls: 'n', yazi: 'Bekliyor' };
}
function etutDurum(e, simdiYmd, simdiSaat) {
  const m = { present: ['ok', 'Geldi'], absent: ['bad', 'Gelmedi'], late: ['warn', 'Geç geldi'], excused: ['n', 'İzinli'] }[e.durum];
  if (m) return { cls: m[0], yazi: m[1] };
  const ileride = e.tarih > simdiYmd || (e.tarih === simdiYmd && String(e.saat || '') > simdiSaat);
  return { cls: 'n', yazi: ileride ? 'Planlandı' : 'Yoklama yok' };
}

/**
 * Sunucudan gelen ham veriden (veli_sayfa_verisi) iki haftanın özeti.
 * now: ms (sınama için verilebilir)
 */
export function ozetHesapla(v, now = Date.now()) {
  const bugun = istanbulYmd(now);
  const simdiSaat = new Date(now + IST).toISOString().slice(11, 16);
  const h = haftalar(bugun);
  const kartlar = new Set(Array.isArray(v.kartlar) ? v.kartlar : []);
  const hafta = (w) => {
    const icinde = (d) => !!d && d >= w.bas && d <= w.bit;
    const out = { ...w, yazi: aralikYazi(w.bas, w.bit) };
    if (kartlar.has('devam')) {
      const satir = (v.devam || []).filter((x) => icinde(String(x.tarih || '').slice(0, 10)));
      const gunler = [];
      for (let i = 0; i < 7; i++) {
        const d = addDays(w.bas, i);
        const dersler = satir.filter((x) => String(x.tarih).slice(0, 10) === d).sort((a, b) => (a.sira || 0) - (b.sira || 0));
        if (i < 5 || dersler.length) gunler.push({ gun: GUN3[gunNo(d)], tarih: d, dersler: dersler.map((x) => x.durum) });
      }
      out.devam = {
        ders: satir.length,
        gelmedi: satir.filter((x) => x.durum === 'absent').length,
        gec: satir.filter((x) => x.durum === 'late').length,
        izinli: satir.filter((x) => x.durum === 'excused').length,
        gunler,
      };
    }
    if (kartlar.has('odev')) {
      const list = (v.odev || [])
        .filter((o) => icinde(o.son) || icinde(o.verildi))
        .filter((o) => !o.verildi || o.verildi <= bugun) // ileri tarihli (zamanlanmış) ödev henüz verilmedi
        .map((o) => ({ baslik: temiz(o.baslik) || 'Ödev', ders: temiz(o.ders), son: o.son || '', ...odevDurum(o, bugun) }))
        .sort((a, b) => ODEV_SIRA[a.cls] - ODEV_SIRA[b.cls] || a.son.localeCompare(b.son));
      out.odev = { toplam: list.length, satirlar: list.slice(0, 3), fazla: Math.max(0, list.length - 3) };
    }
    if (kartlar.has('soru')) {
      const gunluk = new Map();
      const ders = new Map();
      for (const q of v.sorular || []) {
        const d = String(q.tarih || '').slice(0, 10);
        if (!icinde(d)) continue;
        const n = Number(q.toplam) || 0;
        gunluk.set(d, (gunluk.get(d) || 0) + n);
        for (const e of Array.isArray(q.dersler) ? q.dersler : []) {
          const ad = dersAd(e && e.subject);
          if (ad) ders.set(ad, (ders.get(ad) || 0) + (Number(e.questionCount) || 0));
        }
      }
      const hedefler = (v.hedefler || [])
        .map((t) => ({ ...(t.veri && typeof t.veri === 'object' ? t.veri : {}), targetType: t.tur === 'class' ? 'class' : 'student', weekStartDate: t.bas || (t.veri && t.veri.weekStartDate) }))
        .filter((t) => !bekleyenPlan(t));
      let hedef = 0;
      for (let i = 0; i < 7; i++) hedef += gunlukHedef(addDays(w.bas, i), hedefler);
      const cozulen = [...gunluk.values()].reduce((a, b) => a + b, 0);
      const enCok = [...ders.entries()].sort((a, b) => b[1] - a[1])[0] || null;
      out.soru = { cozulen, hedef, yuzde: hedef > 0 ? Math.min(100, Math.round((cozulen / hedef) * 100)) : 0, enCok, gun: gunluk.size };
    }
    if (kartlar.has('etut')) {
      const list = (v.etut || [])
        .filter((e) => icinde(e.tarih))
        .map((e) => ({ ders: temiz(e.ders), konu: temiz(e.konu), gun: GUN[gunNo(e.tarih)], saat: temiz(e.saat).slice(0, 5), ...etutDurum(e, bugun, simdiSaat) }));
      out.etut = { toplam: list.length, satirlar: list.slice(0, 3), fazla: Math.max(0, list.length - 3) };
    }
    return out;
  };
  let deneme;
  if (kartlar.has('deneme')) {
    const d = (v.deneme || [])[0];
    if (d) {
      const netler = d.netler && typeof d.netler === 'object' ? d.netler : {};
      const dersler = Array.isArray(d.dersler) && d.dersler.length ? d.dersler : Object.keys(netler).map((k) => ({ key: k, short: k.toLocaleUpperCase('tr-TR') }));
      const onceki = (v.deneme || [])[1];
      deneme = {
        ad: temiz(d.ad) || 'Deneme',
        tarih: d.tarih ? kisaTarih(String(d.tarih).slice(0, 10)) : '',
        net: d.net === null || d.net === undefined ? null : Number(d.net),
        puan: d.puan === null || d.puan === undefined ? null : Number(d.puan),
        onceki: onceki && onceki.net !== null && onceki.net !== undefined ? Number(onceki.net) : null,
        dersler: dersler
          .filter((x) => x && netler[x.key] && Number.isFinite(Number(netler[x.key].net)))
          .map((x) => ({ ad: temiz(x.name) || temiz(x.short) || x.key, kisa: temiz(x.short) || temiz(x.name), net: Number(netler[x.key].net) })),
      };
    } else deneme = null;
  }
  return { bugun, kartlar: [...kartlar], bu: hafta(h.bu), gecen: hafta(h.gecen), deneme };
}

// ----------------------------------------------------------------------------- sayfa
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const sayi = (n, en = 2) => (n === null || n === undefined || !Number.isFinite(Number(n)) ? '—' : Number(n).toLocaleString('tr-TR', { maximumFractionDigits: en }));

const CSS = `:root{--bg:#f3f5f9;--surface:#fff;--surface-2:#eaeef5;--fg:#0f172a;--muted:#5b6679;--subtle:#8b96aa;--line:#e2e7f0;--line-2:#cdd5e2;--accent:#0f172a;--accent-fg:#fff;--hi:#4f46e5;--ok:#0f8a5f;--ok-soft:#dff5ec;--warn:#b45309;--warn-soft:#fdf1dc;--bad:#be123c;--bad-soft:#fde8ee;--gol:0 1px 2px rgb(15 23 42/.04),0 4px 16px -4px rgb(15 23 42/.06);--serif:Georgia,"Times New Roman",serif;--sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--bg:#0b0f18;--surface:#131926;--surface-2:#1b2333;--fg:#e8edf7;--muted:#93a0b8;--subtle:#64708a;--line:#212a3b;--line-2:#2e3a50;--accent:#e8edf7;--accent-fg:#0b0f18;--hi:#818cf8;--ok:#34d399;--ok-soft:#0f2a22;--warn:#fbbf24;--warn-soft:#2a2210;--bad:#fb7185;--bad-soft:#2b1219;--gol:0 1px 2px rgb(0 0 0/.3),0 8px 24px -8px rgb(0 0 0/.4)}}
*{box-sizing:border-box}html{font-size:15px;-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);font-family:var(--sans);-webkit-font-smoothing:antialiased;line-height:1.45}
.sayfa{max-width:440px;margin:0 auto;padding:8px 0 24px}
.ust{display:flex;align-items:center;gap:10px;padding:14px 16px 10px}
.logo{width:34px;height:34px;border-radius:10px;background:var(--accent);color:var(--accent-fg);display:grid;place-items:center;font-weight:700;font-size:12px;flex:none}
.ust b{font-size:13px;display:block}.ust small{color:var(--muted);font-size:11px}
.kim{padding:4px 16px 12px}.kim h1{font-family:var(--serif);font-weight:400;font-size:34px;line-height:1.05;margin:0;letter-spacing:-.01em}
.kim p{margin:6px 0 0;color:var(--muted);font-size:12px}
.radyo{position:absolute;opacity:0;pointer-events:none}
.hafta{display:flex;gap:4px;margin:0 16px 12px;padding:3px;background:var(--surface-2);border-radius:999px}
.hafta label{flex:1;height:30px;border-radius:999px;color:var(--muted);font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .2s,color .2s}
#h0:checked~.sayfa label[for=h0],#h1:checked~.sayfa label[for=h1]{background:var(--surface);color:var(--fg);box-shadow:var(--gol)}
#h0:focus-visible~.sayfa label[for=h0],#h1:focus-visible~.sayfa label[for=h1]{outline:2px solid var(--hi);outline-offset:2px}
.w1{display:none}#h1:checked~.sayfa .w0{display:none}#h1:checked~.sayfa .w1{display:block}
.kart{background:var(--surface);border:1px solid var(--line);border-radius:20px;margin:0 12px 10px;padding:14px;box-shadow:var(--gol)}
.bas{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:10px}
.bas h2{margin:0;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:700}
.bas span{font-size:11px;color:var(--subtle)}
.sayilar{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.sayi{background:var(--surface-2);border-radius:12px;padding:8px 10px}
.sayi b{display:block;font-family:var(--serif);font-weight:400;font-size:28px;line-height:1}
.sayi small{font-size:11px;color:var(--muted)}
.sayi.bad b{color:var(--bad)}.sayi.warn b{color:var(--warn)}
.gunler{display:grid;grid-template-columns:repeat(auto-fit,minmax(0,1fr));gap:8px;margin-top:10px}
.gun{text-align:center;font-size:10px;color:var(--muted)}
.gun i{display:flex;gap:2px;margin-top:4px;min-height:14px}
.gun u{flex:1;min-width:0;height:14px;border-radius:2px;background:var(--ok);text-decoration:none}
.gun u.absent{background:var(--bad)}.gun u.late{background:var(--warn)}.gun u.excused{background:var(--line-2)}
.gun i:empty{background:var(--surface-2);border-radius:2px}
.not{margin:8px 0 0;font-size:11px;color:var(--muted)}
.satir{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--line);font-size:12.5px}
.satir:first-of-type{border-top:0}
.satir .ad{flex:1;min-width:0}
.satir .ad b,.satir .ad small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600}
.satir .ad small{color:var(--muted);font-size:11px;font-weight:400}
.cip{height:22px;padding:0 8px;border-radius:999px;font-size:11px;font-weight:600;display:inline-flex;align-items:center;flex:none}
.cip.ok{background:var(--ok-soft);color:var(--ok)}.cip.bad{background:var(--bad-soft);color:var(--bad)}.cip.warn{background:var(--warn-soft);color:var(--warn)}.cip.n{background:var(--surface-2);color:var(--muted)}
.cubuk{height:8px;border-radius:999px;background:var(--surface-2);overflow:hidden;margin:10px 0 6px}
.cubuk i{display:block;height:100%;background:var(--hi);border-radius:999px}
.buyuk{font-family:var(--serif);font-size:40px;line-height:1}
.buyuk small{font-family:var(--sans);font-size:12px;color:var(--muted);margin-left:6px}
.alt{font-size:12px;color:var(--muted)}
.dersler{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-top:10px}
.dersler span{background:var(--surface-2);border-radius:10px;padding:6px 8px;font-size:11px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dersler b{display:block;color:var(--fg);font-size:14px}
.bos{font-size:12px;color:var(--muted);padding:4px 0}
.son{padding:6px 20px 0;font-size:11px;color:var(--muted);text-align:center}.son b{color:var(--fg)}
.tek{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}
.tek .kart{max-width:360px;margin:0;text-align:center}.tek h1{font-size:16px;margin:0 0 8px}.tek p{font-size:13px;color:var(--muted);margin:0}`;

function kabuk(baslik, govde) {
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><title>${esc(baslik)}</title><style>${CSS}</style></head><body>${govde}</body></html>`;
}

/** Süresi dolmuş, iptal edilmiş ya da bölümü kapalı bağlantı */
export function bilgiSayfasi(kurum, metin) {
  const ad = temiz(kurum) || 'biliredu';
  return kabuk(`${ad} · veli`, `<main class="tek"><section class="kart"><h1>${esc(ad)}</h1><p>${esc(metin)}</p></section></main>`);
}
export const GECERSIZ_YAZI = 'Bu bağlantının süresi doldu ya da bağlantı kapatıldı. Yeni bağlantı için okulunuza başvurun.';
export const KAPALI_YAZI = 'Okulunuz veli görünümünü şu an kullanmıyor. Bilgi için okulunuza başvurun.';

function devamKart(d, hf) {
  if (!d.ders) return `<p class="bos">${hf} alınmış ders yoklaması yok.</p>`;
  const gun = d.gunler.map((g) => `<div class="gun">${esc(g.gun)}<i>${g.dersler.map((s) => `<u class="${esc(s)}"></u>`).join('')}</i></div>`).join('');
  return `<div class="sayilar"><div class="sayi"><b>${d.ders}</b><small>derste</small></div><div class="sayi${d.gelmedi ? ' bad' : ''}"><b>${d.gelmedi}</b><small>gelmedi</small></div><div class="sayi${d.gec ? ' warn' : ''}"><b>${d.gec}</b><small>geç</small></div></div><div class="gunler">${gun}</div>${d.izinli ? `<p class="not">${d.izinli} derste izinli (gri).</p>` : ''}`;
}
function listeKart(l, bosYazi, satir) {
  if (!l.toplam) return `<p class="bos">${esc(bosYazi)}</p>`;
  return l.satirlar.map(satir).join('') + (l.fazla ? `<p class="not">+${l.fazla} tane daha</p>` : '');
}
function soruKart(s, hf) {
  if (!s.cozulen && !s.hedef) return `<p class="bos">${hf} soru kaydı yok.</p>`;
  const ust = s.hedef ? `<div class="buyuk">${sayi(s.cozulen, 0)}<small>/ ${sayi(s.hedef, 0)} soru</small></div><div class="cubuk" role="img" aria-label="Hedefin yüzde ${s.yuzde}'i"><i style="width:${s.yuzde}%"></i></div>` : `<div class="buyuk">${sayi(s.cozulen, 0)}<small>soru</small></div>`;
  const alt = [s.hedef ? `Hedefin %${s.yuzde}'i` : `${hf} soru hedefi verilmedi`, s.enCok && s.enCok[1] ? `en çok ${esc(s.enCok[0])} (${sayi(s.enCok[1], 0)})` : ''].filter(Boolean).join(' · ');
  return `${ust}<p class="alt" style="margin:${s.hedef ? 0 : '8px 0 0'}">${alt}</p>`;
}
function haftaKartlari(w, gecen) {
  const hf = gecen ? 'Geçen hafta' : 'Bu hafta';
  const kucuk = gecen ? 'geçen hafta' : 'bu hafta';
  const k = [];
  if (w.devam) k.push(`<section class="kart"><div class="bas"><h2>Devam</h2><span>ders yoklaması</span></div>${devamKart(w.devam, hf)}</section>`);
  if (w.odev)
    k.push(
      `<section class="kart"><div class="bas"><h2>Ödevler</h2><span>${kucuk} ${w.odev.toplam}</span></div>${listeKart(w.odev, `${hf} ödev yok.`, (o) => `<div class="satir"><div class="ad"><b>${esc(o.baslik)}</b><small>${esc(o.ders)}${o.son ? ` · son gün ${esc(kisaTarih(o.son))}` : ''}</small></div><span class="cip ${o.cls}">${esc(o.yazi)}</span></div>`)}</section>`
    );
  if (w.soru) k.push(`<section class="kart"><div class="bas"><h2>Soru çözümü</h2><span>${w.soru.hedef ? 'haftalık hedef' : kucuk}</span></div>${soruKart(w.soru, hf)}</section>`);
  if (w.etut)
    k.push(
      `<section class="kart"><div class="bas"><h2>Etütler</h2><span>${kucuk} ${w.etut.toplam}</span></div>${listeKart(w.etut, `${hf} etüt yok.`, (e) => `<div class="satir"><div class="ad"><b>${esc(e.ders)}${e.konu ? ` · ${esc(e.konu)}` : ''}</b><small>${esc(e.gun)}${e.saat ? ` ${esc(e.saat)}` : ''}</small></div><span class="cip ${e.cls}">${esc(e.yazi)}</span></div>`)}</section>`
    );
  return k.join('');
}
function denemeKart(d) {
  if (d === undefined) return '';
  if (!d) return `<section class="kart"><div class="bas"><h2>Son deneme</h2></div><p class="bos">Açıklanmış deneme sonucu yok.</p></section>`;
  const fark = d.net !== null && d.onceki !== null ? Math.round((d.net - d.onceki) * 100) / 100 : null;
  const dersler = d.dersler.length ? `<div class="dersler">${d.dersler.map((x) => `<span title="${esc(x.ad)}"><b>${sayi(x.net)}</b>${esc(x.kisa)}</span>`).join('')}</div>` : '';
  return `<section class="kart"><div class="bas"><h2>Son deneme</h2><span>${esc(d.tarih)}${d.tarih ? ' · ' : ''}${esc(d.ad)}</span></div><div class="buyuk">${sayi(d.puan)}<small>puan · ${sayi(d.net)} net</small></div>${fark !== null ? `<p class="alt" style="margin:6px 0 0">Önceki denemeye göre ${fark >= 0 ? '+' : ''}${sayi(fark)} net</p>` : ''}${dersler}</section>`;
}

/** Velinin sayfası. v: veli_sayfa_verisi sonucu */
export function veliSayfasi(v, now = Date.now()) {
  const o = ozetHesapla(v, now);
  const kurum = temiz(v.kurum) || 'Okul';
  const ad = kisaAd(v.ogrenci && v.ogrenci.ad);
  const sinif = temiz(v.ogrenci && v.ogrenci.sinif);
  const saat = new Date(now + IST).toISOString().slice(11, 16);
  const haftalik = o.kartlar.some((k) => k !== 'deneme');
  const govde = `<input class="radyo" type="radio" name="h" id="h0" checked aria-label="Bu hafta"><input class="radyo" type="radio" name="h" id="h1" aria-label="Geçen hafta">
<div class="sayfa"><header class="ust"><div class="logo" aria-hidden="true">${esc(basHarf(kurum))}</div><div><b>${esc(kurum)}</b><small>Veli bilgilendirme</small></div></header>
<div class="kim"><h1>${esc(ad)}</h1><p>${sinif ? `${esc(sinif)} · ` : ''}Son güncelleme bugün ${saat}</p></div>
${haftalik ? `<nav class="hafta" aria-label="Hafta"><label for="h0">Bu hafta · ${esc(o.bu.yazi)}</label><label for="h1">Geçen hafta</label></nav><div class="w0">${haftaKartlari(o.bu, false)}</div><div class="w1">${haftaKartlari(o.gecen, true)}</div>` : ''}
${denemeKart(o.deneme)}
${!o.kartlar.length ? `<section class="kart"><p class="bos">Okulunuz bu sayfada gösterilecek bilgi seçmedi.</p></section>` : ''}
<p class="son">Bu bağlantı <b>${esc(bitisYazi(v.bitis))}</b> tarihine kadar geçerlidir; lütfen başkasıyla paylaşmayın.</p></div>`;
  return kabuk(`${ad} · ${kurum}`, govde);
}

/** Bağlantı önizlemesi yapan uygulamalar (WhatsApp, Telegram…) açılma sayısına katılmaz */
export function onizlemeBotu(ua) {
  return /bot\b|crawler|spider|preview|facebookexternalhit|whatsapp|telegram|slack|discord|skype|linkedin|embedly|curl|wget|python|node-fetch|headless/i.test(String(ua || ''));
}
