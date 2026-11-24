// ============================================================================
// Aşama 381: OYUNLAR — sunucu tarafı (api/mail.js kullanır; adı "_" ile başladığı için ayrı işlev sayılmaz)
//   * Bağlantı: oyun kimliği + (kişisel bağlantıda) öğrenci kimliği, gizli anahtarla imzalı (HMAC, 128 bit).
//     Sınıf bağlantısında öğrenci listeden kendi adını seçer. Bağlantıyı iptal etmek = oyunu kapatmak.
//   * Doğru cevap tarayıcıya HİÇBİR ZAMAN soru sorulurken gitmez; cevap sunucuda denetlenir, puan ve süre sunucuda
//     hesaplanır (tarayıcıdan gelen süre / puan yok sayılır). Şıkların sırası her öğrenci için ayrı karıştırılır.
//   * Modlar: "quiz" (çoktan seçmeli, soru başına süre, hız bonuslu), "cark" (kelime çarkı: çevir, harf seç, çöz),
//     "bulmaca" (Aşama 382: kelime sorularından çengel bulmaca; tahmin, harf ipucu, bitir).
// Buradaki oyun kuralları saf işlevdir (tests/oyun.test.ts sınar); veritabanı işleri oyunApi() içindedir.
// ============================================================================
import crypto from 'node:crypto';

const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

export const SORU_SN = { en_az: 5, en_cok: 120, varsayilan: 20 };
export const QUIZ_SORU = { en_az: 3, en_cok: 30 };
export const CARK_KELIME = { en_az: 1, en_cok: 10 };
export const GUN_SECENEKLERI = [1, 3, 7, 14, 30];
export const CARK_HAK = 6;
export const CARK_DILIMLERI = [100, 150, 200, 250, 300, 400, 500, 'IFLAS'];
export const OGRENCI_GECMIS_GUN = 7; // Aşama 385: süresi dolan oyun öğrencinin listesinde bu kadar gün kalır (oynadıysa)
export const MOD_ADI = { quiz: 'Soru yarışı', cark: 'Kelime çarkı', bulmaca: 'Bulmaca' };
export const HARFLER = Array.from('ABCÇDEFGĞHIİJKLMNOÖPQRSŞTUÜVWXYZ');
const TR_BUYUK = /^[A-ZÇĞİÖŞÜ]{2,15}$/;

// ----------------------------------------------------------------------------- bağlantı imzası
export function linkKey(secretBase) {
  if (!secretBase) throw new Error('oyun bağlantısı anahtarı yok');
  return crypto.createHash('sha256').update(`oyun-link:${secretBase}`).digest();
}
const uuidBayt = (id) => Buffer.from(String(id).replace(/-/g, ''), 'hex');
const bajtUuid = (buf) => {
  const h = Buffer.from(buf).toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
};
const imza = (key, o, s) => b64u(crypto.createHmac('sha256', key).update(`${o}.${s}`).digest()).slice(0, 22);

/** oyun kimliği (uuid) + isteğe bağlı öğrenci kimliği → kısa imzalı kod */
export function makeToken(key, oyunId, studentId) {
  if (!/^[0-9a-f-]{36}$/i.test(String(oyunId))) throw new Error('oyun kimliği geçersiz');
  const o = b64u(uuidBayt(oyunId));
  const s = studentId ? b64u(Buffer.from(String(studentId), 'utf8')) : '';
  return s ? `${o}.${s}.${imza(key, o, s)}` : `${o}.${imza(key, o, '')}`;
}
/** Kodu doğrular: { oyunId, studentId|null } ya da null (biçim / imza hatalı) */
export function readToken(key, token) {
  if (typeof token !== 'string' || token.length > 400 || !/^[A-Za-z0-9_-]{22}(\.[A-Za-z0-9_-]{1,300})?\.[A-Za-z0-9_-]{22}$/.test(token)) return null;
  const p = token.split('.');
  const o = p[0];
  const s = p.length === 3 ? p[1] : '';
  const beklenen = Buffer.from(imza(key, o, s));
  const gelen = Buffer.from(p[p.length - 1]);
  if (beklenen.length !== gelen.length || !crypto.timingSafeEqual(beklenen, gelen)) return null;
  let studentId = null;
  if (s) {
    studentId = fromB64u(s).toString('utf8');
    if (!studentId || studentId.length > 120) return null;
  }
  const raw = fromB64u(o);
  if (raw.length !== 16) return null;
  return { oyunId: bajtUuid(raw), studentId };
}

// ----------------------------------------------------------------------------- yardımcılar
const trUpper = (v) => String(v || '').replace(/i/g, 'İ').replace(/ı/g, 'I').toLocaleUpperCase('tr-TR');
/** "Ali Veli Yılmaz" → "Ali Veli Y." (bağlantıya sahip herkese görünen ad) */
export function kisaAd(ad) {
  const p = String(ad || '').trim().split(/\s+/).filter(Boolean);
  if (p.length <= 1) return p[0] || '';
  return `${p.slice(0, -1).join(' ')} ${p[p.length - 1].charAt(0).toLocaleUpperCase('tr-TR')}.`;
}
export function karistir(liste, rnd = Math.random) {
  const a = liste.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ----------------------------------------------------------------------------- QUIZ
/** Soru başına puan: doğruysa 100 + (kalan süreye göre en çok 50) */
export const QUIZ_TABAN = 100;
export const QUIZ_BONUS = 50;
const QUIZ_TOLERANS_MS = 2500; // ağ gecikmesi payı

export function quizBaslat(sorular, rnd = Math.random) {
  const sira = karistir(sorular.map((s) => s.id), rnd);
  const sik = {};
  for (const s of sorular) sik[s.id] = karistir([0, 1, 2, 3], rnd);
  return { mod: 'quiz', sira, sik, i: 0, servis: null };
}
export function quizBitti(d) {
  return d.i >= d.sira.length;
}
/** Sıradaki soruyu sunar (süre sayacı ilk sunuşta başlar). Döner: { durum, soru } */
export function quizSoru(d, sorular, sureSn, now) {
  if (quizBitti(d)) return { durum: d, soru: null };
  const s = sorular.find((x) => x.id === d.sira[d.i]);
  const yeni = d.servis ? d : { ...d, servis: now };
  const gecen = now - yeni.servis;
  return {
    durum: yeni,
    soru: {
      no: d.i + 1,
      toplam: d.sira.length,
      metin: s.metin,
      siklar: d.sik[s.id].map((k) => s.siklar[k]),
      sureSn,
      kalanMs: Math.max(0, sureSn * 1000 - gecen),
    },
  };
}
/** Cevabı denetler. secim: gösterilen sıradaki şık (0-3) ya da null (süre doldu / boş). */
export function quizCevapla(d, sorular, no, secim, sureSn, now) {
  if (quizBitti(d)) return { hata: 'Oyun bitti.' };
  if (Number(no) !== d.i + 1) return { hata: 'Soru sırası eşleşmedi, sayfayı yenileyin.' };
  const s = sorular.find((x) => x.id === d.sira[d.i]);
  const perm = d.sik[s.id];
  const gecen = d.servis ? now - d.servis : sureSn * 1000;
  const sureMs = sureSn * 1000;
  // soru hiç sunulmadan (süre sayacı başlamadan) gelen cevap geçersizdir: süre sınırı atlatılamaz
  const gecerli = !!d.servis && Number.isInteger(secim) && secim >= 0 && secim <= 3 && gecen <= sureMs + QUIZ_TOLERANS_MS;
  const dogru = gecerli && perm[secim] === s.dogru;
  const kazanilan = dogru ? QUIZ_TABAN + Math.floor(QUIZ_BONUS * Math.max(0, 1 - Math.min(gecen, sureMs) / sureMs)) : 0;
  return {
    durum: { ...d, i: d.i + 1, servis: null },
    sonuc: { dogru, dogruSik: perm.indexOf(s.dogru), aciklama: s.aciklama || '', kazanilan },
    kayit: { soruId: s.id, kazanim: s.kazanim_kodu || null, dogru, puan: kazanilan, sureMs: Math.min(Math.max(0, Math.round(gecen)), 3600000) },
  };
}

// ----------------------------------------------------------------------------- ÇARK
export function carkBaslat(sorular, rnd = Math.random) {
  return { mod: 'cark', sira: karistir(sorular.map((s) => s.id), rnd), i: 0, harfler: [], hata: 0, tur: 0, asama: 'cevir', deger: 0 };
}
export const carkBitti = (d) => d.i >= d.sira.length;
const kelimeOf = (d, sorular) => trUpper(sorular.find((x) => x.id === d.sira[d.i]).cevap);
/** Tahtadaki görünüm: harfi açılmış yerler harf, kapalı yerler null */
export function carkGorunum(d, sorular) {
  if (carkBitti(d)) return null;
  const s = sorular.find((x) => x.id === d.sira[d.i]);
  const k = kelimeOf(d, sorular);
  return {
    no: d.i + 1,
    toplam: d.sira.length,
    ipucu: s.metin,
    acik: Array.from(k).map((h) => (d.harfler.includes(h) ? h : null)),
    denenen: d.harfler,
    hata: d.hata,
    hak: CARK_HAK,
    tur: d.tur,
    asama: d.asama,
    deger: d.deger,
  };
}
export function carkCevir(d, rnd = Math.random) {
  if (carkBitti(d)) return { hata: 'Oyun bitti.' };
  if (d.asama !== 'cevir') return { hata: 'Önce bir harf seçin.' };
  const dilim = CARK_DILIMLERI[Math.floor(rnd() * CARK_DILIMLERI.length)];
  if (dilim === 'IFLAS') return { durum: { ...d, tur: 0, asama: 'cevir', deger: 0 }, olay: { tur: 'iflas', dilim: 'IFLAS', kaybedilen: d.tur } };
  return { durum: { ...d, asama: 'harf', deger: dilim }, olay: { tur: 'dilim', dilim } };
}
function kelimeBitir(d, sorular, cozuldu, kazanilanEk) {
  const s = sorular.find((x) => x.id === d.sira[d.i]);
  const kazanilan = cozuldu ? d.tur + kazanilanEk : 0;
  return {
    durum: { ...d, i: d.i + 1, harfler: [], hata: 0, tur: 0, asama: 'cevir', deger: 0 },
    olay: { tur: cozuldu ? 'cozuldu' : 'kaybetti', cevap: kelimeOf(d, sorular), kazanilan, aciklama: s.aciklama || '' },
    kayit: { soruId: s.id, kazanim: s.kazanim_kodu || null, dogru: cozuldu, puan: kazanilan, sureMs: 0 },
  };
}
export function carkHarf(d, sorular, harf) {
  if (carkBitti(d)) return { hata: 'Oyun bitti.' };
  if (d.asama !== 'harf') return { hata: 'Önce çarkı çevirin.' };
  const h = trUpper(harf);
  if (!HARFLER.includes(h)) return { hata: 'Geçersiz harf.' };
  if (d.harfler.includes(h)) return { hata: 'Bu harf zaten denendi.' };
  const k = kelimeOf(d, sorular);
  const adet = Array.from(k).filter((x) => x === h).length;
  const yeni = { ...d, harfler: [...d.harfler, h], asama: 'cevir', deger: 0, tur: d.tur + adet * d.deger, hata: d.hata + (adet ? 0 : 1) };
  if (Array.from(k).every((x) => yeni.harfler.includes(x))) return kelimeBitir(yeni, sorular, true, 100);
  if (yeni.hata >= CARK_HAK) return kelimeBitir(yeni, sorular, false, 0);
  return { durum: yeni, olay: { tur: adet ? 'dogru' : 'yanlis', harf: h, adet, kazanilan: adet * d.deger } };
}
export function carkCoz(d, sorular, tahmin) {
  if (carkBitti(d)) return { hata: 'Oyun bitti.' };
  const t = trUpper(String(tahmin || '').replace(/\s+/g, ''));
  if (!TR_BUYUK.test(t)) return { hata: 'Tahmin yalnız harflerden oluşan tek bir kelime olmalı.' };
  const k = kelimeOf(d, sorular);
  if (t === k) {
    const gizli = Array.from(k).filter((x) => !d.harfler.includes(x)).length;
    return kelimeBitir(d, sorular, true, 100 + 50 * gizli);
  }
  const yeni = { ...d, hata: d.hata + 2 };
  if (yeni.hata >= CARK_HAK) return kelimeBitir(yeni, sorular, false, 0);
  return { durum: yeni, olay: { tur: 'yanlis-tahmin' } };
}

// ----------------------------------------------------------------------------- BULMACA (Aşama 382)
// Kelime sorularından çengel bulmaca kurulur. Yerleşim oyun kimliğinden tohumlanır: herkes aynı bulmacayı görür ve
// yerleşim veritabanında saklanmaz (her istekte aynı sonuç). Tarayıcıya yalnız açılmış harfler gider.
export const BULMACA_KELIME = { en_az: 2, en_cok: 12 };
export const BULMACA_PUAN = 100;
export const BULMACA_YANLIS = 25; // her yanlış tahmin kelimenin puanından düşer
export const BULMACA_IPUCU = 20; // her harf ipucu kelimenin puanından düşer
export const BULMACA_TABAN = 20; // bilinen kelime en az bu kadar kazandırır
export const BULMACA_HAK = 3; // bir kelimede 3 yanlış: kelime açılır, puan yok

/** Tohumlu sözde rastgele sayı (mulberry32); aynı tohum her zaman aynı diziyi verir */
export function tohumluRnd(tohum) {
  let h = 1779033703 ^ String(tohum).length;
  for (const c of String(tohum)) h = Math.imul(h ^ c.charCodeAt(0), 3432918353), (h = (h << 13) | (h >>> 19));
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const anahtar = (x, y) => `${x},${y}`;

function yerlestirmeDene(kelimeler) {
  const hucre = new Map(); // "x,y" → { h: harf, yon: Set }
  const yerler = [];
  let kopuk = 0;
  const kutu = () => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const k of hucre.keys()) {
      const [x, y] = k.split(',').map(Number);
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    return { x0, y0, x1, y1 };
  };
  const bos = (x, y) => !hucre.has(anahtar(x, y));
  const uygunMu = (w, sx, sy, yon) => {
    const dx = yon === 'y' ? 1 : 0, dy = yon === 'y' ? 0 : 1;
    if (!bos(sx - dx, sy - dy) || !bos(sx + dx * w.length, sy + dy * w.length)) return -1;
    let kesisim = 0;
    for (let j = 0; j < w.length; j++) {
      const x = sx + dx * j, y = sy + dy * j;
      const c = hucre.get(anahtar(x, y));
      if (c) {
        if (c.h !== w[j] || c.yon.has(yon)) return -1;
        kesisim++;
      } else if (!bos(x + dy, y + dx) || !bos(x - dy, y - dx)) return -1; // dik komşular boş olmalı
    }
    return kesisim;
  };
  const koy = (k, sx, sy, yon) => {
    const dx = yon === 'y' ? 1 : 0, dy = yon === 'y' ? 0 : 1;
    for (let j = 0; j < k.w.length; j++) {
      const key = anahtar(sx + dx * j, sy + dy * j);
      const c = hucre.get(key) || { h: k.w[j], yon: new Set() };
      c.yon.add(yon);
      hucre.set(key, c);
    }
    yerler.push({ id: k.id, x: sx, y: sy, yon, n: k.w.length });
  };
  kelimeler.forEach((k, i) => {
    if (i === 0) return koy(k, 0, 0, 'y');
    let en = null;
    const b = kutu();
    for (const [key, c] of hucre) {
      const [x, y] = key.split(',').map(Number);
      for (let j = 0; j < k.w.length; j++) {
        if (k.w[j] !== c.h) continue;
        for (const yon of ['y', 'd']) {
          if (c.yon.has(yon)) continue;
          const sx = yon === 'y' ? x - j : x, sy = yon === 'y' ? y : y - j;
          const kes = uygunMu(k.w, sx, sy, yon);
          if (kes < 1) continue;
          const ex = yon === 'y' ? sx + k.w.length - 1 : sx, ey = yon === 'y' ? sy : sy + k.w.length - 1;
          const alan = (Math.max(b.x1, ex) - Math.min(b.x0, sx) + 1) * (Math.max(b.y1, ey) - Math.min(b.y0, sy) + 1);
          // kare yakın, küçük, çok kesişimli yerleşim tercih edilir
          const gen = Math.max(b.x1, ex) - Math.min(b.x0, sx) + 1, yuk = Math.max(b.y1, ey) - Math.min(b.y0, sy) + 1;
          const puan = kes * 40 - alan - Math.abs(gen - yuk) * 3;
          if (!en || puan > en.puan) en = { sx, sy, yon, puan };
        }
      }
    }
    if (en) return koy(k, en.sx, en.sy, en.yon);
    // kesişemeyen kelime bulmacanın altına ayrı satıra konur (bulmaca yine çözülebilir)
    kopuk++;
    koy(k, b.x0, b.y1 + 2, 'y');
  });
  const b = kutu();
  return { yerler, kopuk, alan: (b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1), b };
}

/**
 * Bulmaca yerleşimi: { gen, yuk, kelimeler: [{ id, no, yon: 'y'|'d', x, y, n }] } (sıra: soldan sağa, sonra yukarıdan aşağı)
 * sorular: oyunun soru kopyası (kelime türü); tohum: oyun kimliği
 */
export function bulmacaKur(sorular, tohum) {
  const rnd = tohumluRnd(tohum);
  const temel = sorular.map((s) => ({ id: s.id, w: Array.from(trUpper(s.cevap)) }));
  let en = null;
  for (let deneme = 0; deneme < 40; deneme++) {
    const sira = deneme === 0 ? temel.slice().sort((a, b) => b.w.length - a.w.length) : karistir(temel, rnd);
    const r = yerlestirmeDene(sira);
    const puan = r.kopuk * 10000 + r.alan;
    if (!en || puan < en.puan) en = { ...r, puan };
  }
  const { b } = en;
  const yerler = en.yerler.map((k) => ({ ...k, x: k.x - b.x0, y: k.y - b.y0 }));
  // numara: başlangıç hücresi soldan sağa / yukarıdan aşağı okuma sırasında; aynı hücreden iki kelime aynı numarayı alır
  const baslar = [...new Set(yerler.map((k) => anahtar(k.x, k.y)))]
    .map((k) => k.split(',').map(Number))
    .sort((p, q) => p[1] - q[1] || p[0] - q[0]);
  const no = new Map(baslar.map(([x, y], i) => [anahtar(x, y), i + 1]));
  const kelimeler = yerler
    .map((k) => ({ ...k, no: no.get(anahtar(k.x, k.y)) }))
    .sort((p, q) => (p.yon === q.yon ? p.no - q.no : p.yon === 'y' ? -1 : 1));
  return { gen: b.x1 - b.x0 + 1, yuk: b.y1 - b.y0 + 1, kelimeler };
}

export function bulmacaBaslat() {
  return { mod: 'bulmaca', sonuc: {}, yanlis: {}, ipucu: {} };
}
export const bulmacaBitti = (d, sorular) => sorular.every((s) => d.sonuc[s.id] !== undefined);

/** Açık harfler: çözülen ya da kaçan kelimelerin bütün harfleri + alınan ipuçları (kesişen kelimeye de geçer) */
function acikHucreler(d, duzen, sorular) {
  const acik = new Map();
  for (const k of duzen.kelimeler) {
    const w = Array.from(trUpper(sorular.find((s) => s.id === k.id).cevap));
    const hepsi = d.sonuc[k.id] !== undefined;
    const ip = d.ipucu[k.id] || [];
    w.forEach((h, j) => {
      if (hepsi || ip.includes(j)) acik.set(anahtar(k.yon === 'y' ? k.x + j : k.x, k.yon === 'y' ? k.y : k.y + j), h);
    });
  }
  return acik;
}
const kelimeHarfleri = (k, acik) => Array.from({ length: k.n }, (_, j) => acik.get(anahtar(k.yon === 'y' ? k.x + j : k.x, k.yon === 'y' ? k.y : k.y + j)) || null);
const kelimePuani = (d, id) => Math.max(BULMACA_TABAN, BULMACA_PUAN - (d.yanlis[id] || 0) * BULMACA_YANLIS - (d.ipucu[id] || []).length * BULMACA_IPUCU);

/** Tahta görünümü: ölçü + her kelimenin ipucu, durumu, açık harfleri (cevap yok) */
export function bulmacaGorunum(d, sorular, duzen) {
  const acik = acikHucreler(d, duzen, sorular);
  return {
    gen: duzen.gen,
    yuk: duzen.yuk,
    hak: BULMACA_HAK,
    kelimeler: duzen.kelimeler.map((k, i) => ({
      k: i,
      no: k.no,
      yon: k.yon,
      x: k.x,
      y: k.y,
      n: k.n,
      ipucu: sorular.find((s) => s.id === k.id).metin,
      durum: d.sonuc[k.id] === true ? 'bildi' : d.sonuc[k.id] === false ? 'kacti' : 'acik',
      yanlis: d.yanlis[k.id] || 0,
      deger: kelimePuani(d, k.id),
      harfler: kelimeHarfleri(k, acik),
    })),
  };
}

const kayitYap = (s, dogru, puan) => ({ soruId: s.id, kazanim: s.kazanim_kodu || null, dogru, puan, sureMs: 0 });

/** Kelime tahmini. Döner: { durum, olay, kayit? } ya da { hata } */
export function bulmacaTahmin(d, sorular, duzen, k, tahmin) {
  const yer = duzen.kelimeler[Number(k)];
  if (!yer) return { hata: 'Kelime bulunamadı.' };
  if (d.sonuc[yer.id] !== undefined) return { hata: 'Bu kelime zaten açıldı.' };
  const s = sorular.find((x) => x.id === yer.id);
  const t = trUpper(String(tahmin || '').replace(/\s+/g, ''));
  if (!TR_BUYUK.test(t)) return { hata: 'Tahmin yalnız harflerden oluşan tek bir kelime olmalı.' };
  if (Array.from(t).length !== yer.n) return { hata: `Bu kelime ${yer.n} harfli.` };
  if (t === trUpper(s.cevap)) {
    const puan = kelimePuani(d, yer.id);
    return { durum: { ...d, sonuc: { ...d.sonuc, [yer.id]: true } }, olay: { tur: 'dogru', kazanilan: puan, aciklama: s.aciklama || '' }, kayit: kayitYap(s, true, puan) };
  }
  const yanlis = (d.yanlis[yer.id] || 0) + 1;
  const yeni = { ...d, yanlis: { ...d.yanlis, [yer.id]: yanlis } };
  if (yanlis >= BULMACA_HAK) {
    return { durum: { ...yeni, sonuc: { ...d.sonuc, [yer.id]: false } }, olay: { tur: 'kacti', cevap: trUpper(s.cevap), aciklama: s.aciklama || '' }, kayit: kayitYap(s, false, 0) };
  }
  return { durum: yeni, olay: { tur: 'yanlis', kalanHak: BULMACA_HAK - yanlis } };
}

/** Harf ipucu: kelimenin kapalı bir harfini açar (son kapalı harf verilmez) */
export function bulmacaIpucu(d, sorular, duzen, k, rnd = Math.random) {
  const yer = duzen.kelimeler[Number(k)];
  if (!yer) return { hata: 'Kelime bulunamadı.' };
  if (d.sonuc[yer.id] !== undefined) return { hata: 'Bu kelime zaten açıldı.' };
  const kapali = kelimeHarfleri(yer, acikHucreler(d, duzen, sorular))
    .map((h, j) => (h ? -1 : j))
    .filter((j) => j >= 0);
  if (kapali.length <= 1) return { hata: 'Son harfi sen bul!' };
  const j = kapali[Math.floor(rnd() * kapali.length)];
  return { durum: { ...d, ipucu: { ...d.ipucu, [yer.id]: [...(d.ipucu[yer.id] || []), j] } }, olay: { tur: 'ipucu' } };
}

/** Oyunu bitir: açılmamış kelimeler bilinmemiş sayılır */
export function bulmacaBitir(d, sorular) {
  const kalan = sorular.filter((s) => d.sonuc[s.id] === undefined);
  const sonuc = { ...d.sonuc };
  for (const s of kalan) sonuc[s.id] = false;
  return { durum: { ...d, sonuc }, kayitlar: kalan.map((s) => kayitYap(s, false, 0)) };
}

// ----------------------------------------------------------------------------- veritabanı işleri
const durumYazi = {
  kapali: 'Bu oyun öğretmen tarafından kapatıldı.',
  doldu: 'Bu oyun bağlantısının süresi dolmuş.',
  gecersiz: 'Oyun bağlantısı geçersiz. Bağlantıyı eksiksiz açtığınızdan emin olun.',
};

// ----------------------------------------------------------------------------- HIZ SINIRI (Aşama 386)
/**
 * Herkese açık oyun isteği için dakikalık sayaç (sunucu örneğinin belleğinde). Bir döngüye giren ya da kötü niyetli
 * istemcinin Vercel / Supabase kotasını tüketmesini önler; gerçek oyunda (öğrenci saniyede en çok bir iki tıklar)
 * sınıra yaklaşılmaz. Sayaç örnek başınadır: Vercel yeni örnek açarsa sayaç sıfırdan başlar (kaba bir fren, kilit değil).
 */
export const OYUN_HIZ = {
  pencereMs: 60_000,
  ogrenci: 150, // bir öğrenci + bir bağlantı: dakikada en çok (çarkta harf, bulmacada ipucu dahil)
  adres: 1500, // bir IP adresi: okulda bütün sınıf aynı adresten çıkar
};
export function hizSayaci(pencereMs = OYUN_HIZ.pencereMs, enCokAnahtar = 20_000) {
  const m = new Map();
  return function say(anahtar, sinir, now = Date.now()) {
    let k = m.get(anahtar);
    if (!k || now - k.bas >= pencereMs) {
      if (m.size >= enCokAnahtar) for (const [a, v] of m) if (now - v.bas >= pencereMs) m.delete(a);
      if (m.size >= enCokAnahtar) m.delete(m.keys().next().value); // en eski anahtar
      k = { bas: now, n: 0 };
      m.set(anahtar, k);
    }
    k.n += 1;
    return k.n <= sinir;
  };
}

export function oyunApi(deps) {
  const { rest, env, HttpError, inList, appUrl, clean } = deps;
  const key = () => {
    const e = env();
    const base = e.secretKey || e.service;
    if (!base) throw new HttpError(503, 'Sunucu ayarları eksik (SUPABASE_SERVICE_ROLE_KEY).');
    return linkKey(base);
  };
  const sv = { token: 'service' };

  async function oyunYukle(oyunId) {
    const r = await rest(`oyun_oyunlari?select=*&id=eq.${encodeURIComponent(oyunId)}`, sv);
    return r && r[0] ? r[0] : null;
  }
  const oyunDurumu = (o) => (o.kapali_at ? 'kapali' : Date.parse(o.bitis) <= Date.now() ? 'doldu' : 'acik');
  const kapsamOgrenciler = async (o) =>
    (await rest(`students?select=id,name,class_id,class_name,status&class_id=eq.${encodeURIComponent(o.class_id)}&limit=400`, sv)) || [];

  /** Bağlantıdan oyun + öğrenci çözülür; her halükârda sunucu denetler */
  async function baglam(body, { ogrenciGerek }) {
    const t = readToken(key(), body.token);
    if (!t) throw new HttpError(400, durumYazi.gecersiz);
    const o = await oyunYukle(t.oyunId);
    if (!o) throw new HttpError(404, durumYazi.gecersiz);
    const durum = oyunDurumu(o);
    if (durum !== 'acik') throw new HttpError(410, durumYazi[durum], { code: durum });
    // Oyunlar bölümü kurumda kapatılınca bütün açık bağlantılar çalışmaz (kayıtlar silinmez)
    const kr = await rest(`kurumlar?select=modules&id=eq.${encodeURIComponent(String(o.kurum_id))}`, sv);
    if (!kr || !kr[0] || !kr[0].modules || kr[0].modules.oyun !== true) throw new HttpError(403, 'Oyunlar bu kurumda şu an kapalı.', { code: 'kapali' });
    let ogrenci = null;
    if (ogrenciGerek) {
      const sid = t.studentId || clean(body.studentId || '').slice(0, 120);
      if (!sid) throw new HttpError(400, 'Önce adınızı seçin.');
      if (o.kapsam === 'kisisel' && t.studentId !== sid) throw new HttpError(403, durumYazi.gecersiz);
      const r = await rest(`students?select=id,name,class_id,class_name,status&id=eq.${encodeURIComponent(sid)}`, sv);
      const s = r && r[0];
      // sınıf kuruma açılmış (genel yöneticinin) sınıfı olabilir: kurum eşleşmesi aranmaz, sınıf eşleşmesi aranır
      if (!s || String(s.class_id) !== String(o.class_id) || (s.status && s.status !== 'active')) {
        throw new HttpError(403, 'Bu oyun bu öğrenci için açık değil.');
      }
      ogrenci = s;
    }
    return { t, o, ogrenci };
  }

  async function denemeYukle(o, ogrenci, olustur) {
    const q = `oyun_denemeleri?select=*&oyun_id=eq.${o.id}&student_id=eq.${encodeURIComponent(String(ogrenci.id))}`;
    let r = await rest(q, sv);
    if (r && r[0]) return r[0];
    if (!olustur) return null;
    const durum = o.mod === 'cark' ? carkBaslat(o.sorular) : o.mod === 'bulmaca' ? bulmacaBaslat() : quizBaslat(o.sorular);
    await rest('oyun_denemeleri?on_conflict=oyun_id,student_id', {
      ...sv,
      method: 'POST',
      prefer: 'resolution=ignore-duplicates,return=minimal',
      body: {
        oyun_id: o.id,
        kurum_id: o.kurum_id,
        student_id: String(ogrenci.id),
        ogrenci_ad: clean(ogrenci.name || '').slice(0, 120),
        toplam: o.sorular.length,
        durum_json: durum,
      },
    });
    r = await rest(q, sv);
    if (!r || !r[0]) throw new HttpError(500, 'Oyun başlatılamadı. Biraz sonra tekrar deneyin.');
    return r[0];
  }

  async function denemeYaz(dn, durum, puan, dogru, bitti) {
    const rows = await rest(`oyun_denemeleri?id=eq.${dn.id}&v=eq.${dn.v}`, {
      ...sv,
      method: 'PATCH',
      prefer: 'return=representation',
      body: {
        durum_json: durum,
        puan,
        dogru,
        v: dn.v + 1,
        durum: bitti ? 'bitti' : 'suruyor',
        bitis_at: bitti ? new Date().toISOString() : null,
      },
    });
    if (!rows || !rows.length) throw new HttpError(409, 'Bir önceki işlem sürüyor. Birkaç saniye sonra tekrar deneyin.');
    return rows[0];
  }
  async function cevapYaz(o, dn, kayit) {
    await rest('oyun_cevaplari?on_conflict=deneme_id,soru_id', {
      ...sv,
      method: 'POST',
      prefer: 'resolution=ignore-duplicates,return=minimal',
      body: {
        deneme_id: dn.id,
        oyun_id: o.id,
        kurum_id: o.kurum_id,
        student_id: dn.student_id,
        soru_id: kayit.soruId,
        kazanim_kodu: kayit.kazanim,
        dogru: kayit.dogru,
        puan: kayit.puan,
        sure_ms: kayit.sureMs,
      },
    });
  }

  const ozet = (o) => ({ ad: o.ad, mod: o.mod, kapsam: o.kapsam, sinif: o.class_ad || '', sureSn: o.soru_sn, soruSayisi: o.sorular.length, bitis: o.bitis });
  const sonucOzeti = (dn) => ({ puan: dn.puan, dogru: dn.dogru, toplam: dn.toplam, bitti: dn.durum === 'bitti' });

  /** Oyunun şu anki ekranı (soru ya da çark tahtası) */
  function gorunum(o, dn, now) {
    const d = dn.durum_json;
    if (dn.durum === 'bitti') return { tur: 'bitti', sonuc: sonucOzeti(dn) };
    if (o.mod === 'quiz') {
      const r = quizSoru(d, o.sorular, o.soru_sn, now);
      return { tur: 'quiz', soru: r.soru, puan: dn.puan, yeniDurum: r.durum };
    }
    if (o.mod === 'bulmaca') return { tur: 'bulmaca', bulmaca: bulmacaGorunum(d, o.sorular, bulmacaKur(o.sorular, o.id)), puan: dn.puan };
    return { tur: 'cark', tahta: carkGorunum(d, o.sorular), puan: dn.puan };
  }

  const hiz = hizSayaci();
  /** Aşama 386: oyun isteği hız sınırı (adres + bağlantı/öğrenci); aşılırsa 429 */
  function hizDenetle(body, ip) {
    const adres = String(ip || '-').slice(0, 64);
    const bag = `${adres}|${String(body.token || '').slice(-24)}|${String(body.studentId || '').slice(0, 64)}`;
    if (!hiz('a:' + adres, OYUN_HIZ.adres) || !hiz('b:' + bag, OYUN_HIZ.ogrenci)) {
      throw new HttpError(429, 'Çok hızlı istek gönderildi. Birkaç saniye bekleyip tekrar dene.', { code: 'hiz' });
    }
  }

  async function play(body, ip) {
    hizDenetle(body, ip);
    const op = String(body.op || '');
    const now = Date.now();
    if (op === 'bilgi') {
      const { t, o } = await baglam(body, { ogrenciGerek: false });
      const out = { ok: true, oyun: ozet(o), kisisel: !!t.studentId };
      if (t.studentId) {
        const r = await rest(`students?select=id,name,class_id&id=eq.${encodeURIComponent(t.studentId)}`, sv);
        if (!r || !r[0] || String(r[0].class_id) !== String(o.class_id)) throw new HttpError(403, durumYazi.gecersiz);
        out.ogrenci = { id: String(r[0].id), ad: kisaAd(r[0].name) };
      } else {
        const ogr = (await kapsamOgrenciler(o)).filter((s) => !s.status || s.status === 'active');
        const dn = (await rest(`oyun_denemeleri?select=student_id,durum&oyun_id=eq.${o.id}&limit=1000`, sv)) || [];
        const durumlar = new Map(dn.map((x) => [String(x.student_id), x.durum]));
        out.ogrenciler = ogr
          .map((s) => ({ id: String(s.id), ad: kisaAd(s.name), durum: durumlar.get(String(s.id)) || null }))
          .sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
      }
      return out;
    }

    const { o, ogrenci } = await baglam(body, { ogrenciGerek: true });
    let dn = await denemeYukle(o, ogrenci, op === 'basla');
    if (!dn) throw new HttpError(404, 'Önce oyunu başlatın.');
    const d = dn.durum_json;

    if (op === 'basla' || op === 'durum') {
      const g = gorunum(o, dn, now);
      if (g.yeniDurum && g.yeniDurum !== d) dn = await denemeYaz(dn, g.yeniDurum, dn.puan, dn.dogru, false);
      const { yeniDurum, ...gorunur } = g;
      return { ok: true, oyun: ozet(o), ogrenci: { id: String(ogrenci.id), ad: kisaAd(ogrenci.name) }, ...gorunur };
    }
    if (dn.durum === 'bitti') throw new HttpError(409, 'Bu oyun zaten tamamlandı.');

    if (o.mod === 'quiz' && op === 'cevap') {
      const r = quizCevapla(d, o.sorular, body.no, body.secim === null || body.secim === undefined ? null : Number(body.secim), o.soru_sn, now);
      if (r.hata) throw new HttpError(409, r.hata);
      const bitti = quizBitti(r.durum);
      await cevapYaz(o, dn, r.kayit);
      dn = await denemeYaz(dn, r.durum, dn.puan + r.sonuc.kazanilan, dn.dogru + (r.sonuc.dogru ? 1 : 0), bitti);
      return { ok: true, sonuc: r.sonuc, puan: dn.puan, bitti, ...(bitti ? { ozet: sonucOzeti(dn) } : {}) };
    }
    if (o.mod === 'cark' && (op === 'cevir' || op === 'harf' || op === 'coz')) {
      const r = op === 'cevir' ? carkCevir(d) : op === 'harf' ? carkHarf(d, o.sorular, body.harf) : carkCoz(d, o.sorular, body.tahmin);
      if (r.hata) throw new HttpError(409, r.hata);
      let puan = dn.puan;
      let dogru = dn.dogru;
      if (r.kayit) {
        await cevapYaz(o, dn, r.kayit);
        puan += r.kayit.puan;
        dogru += r.kayit.dogru ? 1 : 0;
      }
      const bitti = carkBitti(r.durum);
      dn = await denemeYaz(dn, r.durum, puan, dogru, bitti);
      return { ok: true, olay: r.olay, puan: dn.puan, tahta: bitti ? null : carkGorunum(r.durum, o.sorular), bitti, ...(bitti ? { ozet: sonucOzeti(dn) } : {}) };
    }
    if (o.mod === 'bulmaca' && (op === 'kelime' || op === 'ipucu' || op === 'bitir')) {
      const duzen = bulmacaKur(o.sorular, o.id);
      let r;
      if (op === 'bitir') {
        const b = bulmacaBitir(d, o.sorular);
        r = { durum: b.durum, olay: { tur: 'bitti' }, kayitlar: b.kayitlar };
      } else {
        r = op === 'kelime' ? bulmacaTahmin(d, o.sorular, duzen, body.k, body.tahmin) : bulmacaIpucu(d, o.sorular, duzen, body.k);
        if (r.hata) throw new HttpError(409, r.hata);
        r.kayitlar = r.kayit ? [r.kayit] : [];
      }
      let puan = dn.puan;
      let dogru = dn.dogru;
      for (const k of r.kayitlar) {
        await cevapYaz(o, dn, k);
        puan += k.puan;
        dogru += k.dogru ? 1 : 0;
      }
      const bitti = bulmacaBitti(r.durum, o.sorular);
      dn = await denemeYaz(dn, r.durum, puan, dogru, bitti);
      return { ok: true, olay: r.olay, puan: dn.puan, bulmaca: bulmacaGorunum(r.durum, o.sorular, duzen), bitti, ...(bitti ? { ozet: sonucOzeti(dn) } : {}) };
    }
    throw new HttpError(400, 'Bilinmeyen oyun işlemi.');
  }

  // --------------------------------------------------------------------------- öğretmen işlemleri
  async function yetki(caller) {
    let ok;
    try {
      ok = await rest('rpc/oyun_yetkili', { token: caller.token, method: 'POST', body: {} });
    } catch (err) {
      if (err && (err.code === 'PGRST202' || err.code === '42883' || err.status === 404)) throw new HttpError(400, 'Oyunlar için 381 numaralı SQL dosyası çalıştırılmalı.', { fatal: true });
      throw err;
    }
    if (ok !== true) throw new HttpError(403, 'Oyunlar bölümü bu kurumda kapalı ya da yetkiniz yok.', { fatal: true });
  }
  /** Çağıranın kendi oturumuyla görebildiği oyun (kendi oyunu; kurum yöneticisi / Müdür / Müdür Yrd. hepsi) */
  async function oyunum(caller, id) {
    if (!/^[0-9a-f-]{36}$/i.test(String(id || ''))) throw new HttpError(400, 'Oyun bulunamadı.');
    const r = await rest(`oyun_oyunlari?select=id,kurum_id,kapsam,class_id,bitis,mod,ad&id=eq.${id}`, { token: caller.token });
    if (!r || !r[0]) throw new HttpError(404, 'Oyun bulunamadı ya da bu oyunu görme yetkiniz yok.');
    return r[0];
  }
  async function baglantilar(o, req) {
    const k = key();
    const base = appUrl(req);
    const url = (sid) => `${base}/?oyun=${makeToken(k, o.id, sid)}`;
    if (o.kapsam !== 'kisisel') return { sinif: url(null) };
    const ogr = (await kapsamOgrenciler(o)).filter((s) => !s.status || s.status === 'active');
    return { kisisel: ogr.sort((a, b) => String(a.name).localeCompare(String(b.name), 'tr')).map((s) => ({ id: String(s.id), ad: clean(s.name), url: url(String(s.id)) })) };
  }

  /** Aşama 385: yeni oyun bildirimi (yazma sunucu anahtarıyla; bildirim kimliği oyun + öğrenciye bağlı, tekrar yazılmaz) */
  async function ogrencilereBildir(o, ogr, caller, gun) {
    const birim = o.mod === 'quiz' ? 'soru' : 'kelime';
    const satirlar = ogr
      .map((s) => String(s.id))
      .filter((sid) => sid.length <= 80)
      .map((sid) => ({
        id: `oyun-${o.id}-${sid}`,
        student_id: sid,
        type: 'general',
        title: clean(`Yeni oyun: ${o.ad}`).slice(0, 200),
        message: `${MOD_ADI[o.mod] || 'Oyun'} · ${o.sorular.length} ${birim} · ${gun} gün açık. Ana sayfanda Bana Gelenler › Oyun sekmesinden oynayabilirsin.`,
        source_id: `oyun:${o.id}`,
        source_title: clean(o.ad).slice(0, 300),
        teacher_name: clean(caller.name || '').slice(0, 120) || null,
        link_tab: 'home',
        created_by: caller.authId || null,
      }));
    if (!satirlar.length) return 0;
    try {
      await rest('student_notifications?on_conflict=id', { ...sv, method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal', body: satirlar });
      return satirlar.length;
    } catch (err) {
      console.error('[oyun] bildirim yazılamadı:', err && err.message);
      return 0; // oyun kuruldu; bildirim yazılamaması oyunu bozmaz
    }
  }

  // --------------------------------------------------------------------------- öğrenci (kendi oturumuyla; Aşama 385)
  /**
   * Öğrencinin ana sayfasındaki "Oyun" sekmesi: kendi sınıfındaki açık oyunlar + son 7 günde süresi dolanlar.
   * Oynamak için öğrenciye KENDİ adına imzalı kişisel bağlantı verilir; böylece sınıf bağlantısındaki gibi ad seçmez.
   */
  async function ogrenci(st, body) {
    const op = String(body.op || 'liste');
    if (op !== 'liste') throw new HttpError(400, 'Bilinmeyen işlem.');
    const kurumAcik = async (ids) => {
      const l = [...new Set(ids.filter(Boolean).map(String))];
      if (!l.length) return new Set();
      const kr = (await rest(`kurumlar?select=id,modules&id=in.${inList(l)}`, sv)) || [];
      return new Set(kr.filter((k) => k.modules && k.modules.oyun === true).map((k) => String(k.id)));
    };
    // öğrencinin kendi kurumunda bölüm kapalıysa sekme hiç çıkmaz
    const kendi = st.kurum_id ? await kurumAcik([st.kurum_id]) : new Set();
    if (!st.class_id || (st.kurum_id && !kendi.size)) return { ok: true, acik: false, oyunlar: [] };
    const sinir = new Date(Date.now() - OGRENCI_GECMIS_GUN * 86400000).toISOString();
    let oyunlar;
    try {
      oyunlar =
        (await rest(
          `oyun_oyunlari?select=id,kurum_id,ad,mod,class_ad,bitis,soru_sayisi,olusturan_ad,created_at&class_id=eq.${encodeURIComponent(String(st.class_id))}&kapali_at=is.null&bitis=gt.${encodeURIComponent(sinir)}&order=created_at.desc&limit=30`,
          sv
        )) || [];
    } catch (err) {
      if (/soru_sayisi/.test(String(err && err.message))) throw new HttpError(400, 'Oyunlar için 385 numaralı SQL dosyası çalıştırılmalı.', { fatal: true });
      throw err;
    }
    const acikKurum = await kurumAcik(oyunlar.map((o) => o.kurum_id));
    oyunlar = oyunlar.filter((o) => acikKurum.has(String(o.kurum_id)));
    const dn = oyunlar.length
      ? (await rest(`oyun_denemeleri?select=oyun_id,durum,puan,dogru,toplam&student_id=eq.${encodeURIComponent(String(st.id))}&oyun_id=in.${inList(oyunlar.map((o) => o.id))}`, sv)) || []
      : [];
    const dm = new Map(dn.map((d) => [String(d.oyun_id), d]));
    const k = key();
    const simdi = Date.now();
    const liste = oyunlar
      .map((o) => {
        const d = dm.get(String(o.id));
        const acik = Date.parse(o.bitis) > simdi;
        const oyna = acik && (!d || d.durum !== 'bitti');
        return {
          id: String(o.id),
          ad: o.ad,
          mod: o.mod,
          sinif: o.class_ad || '',
          soruSayisi: Number(o.soru_sayisi) || 0,
          bitis: o.bitis,
          ogretmen: o.olusturan_ad || '',
          olusturma: o.created_at,
          acik,
          deneme: d ? { durum: d.durum, puan: d.puan, dogru: d.dogru, toplam: d.toplam } : null,
          ...(oyna ? { token: makeToken(k, o.id, String(st.id)) } : {}),
        };
      })
      // oynanmamış süresi dolmuş oyun listede kalabalık yapmaz
      .filter((o) => o.acik || o.deneme);
    return { ok: true, acik: true, oyunlar: liste };
  }

  async function ogretmen(caller, body, req) {
    if (!env().service) throw new HttpError(503, 'Sunucu ayarları eksik (SUPABASE_SERVICE_ROLE_KEY).', { fatal: true });
    await yetki(caller);
    const op = String(body.op || '');
    if (op === 'olustur') {
      const mod = ['quiz', 'cark', 'bulmaca'].includes(body.mod) ? body.mod : '';
      if (!mod) throw new HttpError(400, 'Oyun türünü seçin.');
      const kapsam = body.kapsam === 'kisisel' ? 'kisisel' : 'sinif';
      const ad = clean(body.ad || '').slice(0, 80);
      if (ad.length < 2) throw new HttpError(400, 'Oyuna bir ad verin.');
      const sn = Math.round(Number(body.sureSn) || SORU_SN.varsayilan);
      if (sn < SORU_SN.en_az || sn > SORU_SN.en_cok) throw new HttpError(400, `Soru süresi ${SORU_SN.en_az}-${SORU_SN.en_cok} saniye olmalı.`);
      const gun = Number(body.gun);
      if (!GUN_SECENEKLERI.includes(gun)) throw new HttpError(400, 'Geçerlilik süresi seçin.');
      const ids = [...new Set((Array.isArray(body.soruIds) ? body.soruIds : []).map((x) => String(x || '')).filter((x) => /^[0-9a-f-]{36}$/i.test(x)))];
      const lim = mod === 'quiz' ? QUIZ_SORU : mod === 'bulmaca' ? BULMACA_KELIME : CARK_KELIME;
      if (ids.length < lim.en_az || ids.length > lim.en_cok) throw new HttpError(400, `Bu oyun için ${lim.en_az} ile ${lim.en_cok} arasında soru seçin.`);
      // Sorular ve sınıf çağıranın KENDİ oturumuyla okunur: göremediği sınıf / soru işe yaramaz
      const sorular = (await rest(`oyun_sorulari?select=id,tur,metin,siklar,dogru,cevap,aciklama,kazanim_kodu,ders,konu,zorluk&id=in.${inList(ids)}`, { token: caller.token })) || [];
      if (sorular.length !== ids.length) throw new HttpError(404, 'Seçilen sorulardan bazıları bulunamadı (silinmiş olabilir).');
      const uygun = mod === 'quiz' ? 'coktan' : 'kelime';
      if (sorular.some((s) => s.tur !== uygun)) throw new HttpError(400, mod === 'quiz' ? 'Soru yarışında yalnız çoktan seçmeli sorular kullanılır.' : 'Kelime çarkı ve bulmacada yalnız kelime soruları kullanılır.');
      if (mod === 'bulmaca' && new Set(sorular.map((s) => trUpper(s.cevap))).size !== sorular.length) throw new HttpError(400, 'Bulmacada aynı cevap iki kez kullanılamaz.');
      const sinif = ((await rest(`classes?select=id,name&id=eq.${encodeURIComponent(String(body.classId || ''))}`, { token: caller.token })) || [])[0];
      if (!sinif) throw new HttpError(404, 'Sınıf bulunamadı ya da bu sınıfı görme yetkiniz yok.');
      const ogr = ((await rest(`students?select=id,status&class_id=eq.${encodeURIComponent(String(sinif.id))}&limit=400`, { token: caller.token })) || []).filter((s) => !s.status || s.status === 'active');
      if (!ogr.length) throw new HttpError(400, 'Bu sınıfta etkin öğrenci yok.');
      const siraliSorular = ids.map((id) => {
        const s = sorular.find((x) => x.id === id);
        return {
          id: s.id,
          tur: s.tur,
          metin: s.metin,
          siklar: s.tur === 'coktan' ? s.siklar : [],
          dogru: s.tur === 'coktan' ? s.dogru : null,
          cevap: s.tur === 'kelime' ? s.cevap : '',
          aciklama: s.aciklama || '',
          kazanim_kodu: s.kazanim_kodu || null,
        };
      });
      const bitis = new Date(Date.now() + gun * 86400000).toISOString();
      const kayit = await rest('oyun_oyunlari', {
        ...sv,
        method: 'POST',
        prefer: 'return=representation',
        body: {
          kurum_id: caller.kurumId,
          olusturan: caller.authId,
          olusturan_ad: clean(caller.name || '').slice(0, 120),
          ad,
          mod,
          kapsam,
          class_id: String(sinif.id),
          class_ad: clean(sinif.name || '').slice(0, 60),
          sorular: siraliSorular,
          soru_sn: sn,
          bitis,
        },
      });
      const o = kayit && kayit[0];
      if (!o) throw new HttpError(500, 'Oyun kaydedilemedi.');
      // Aşama 385: öğrenciye uygulama içi bildirim (Bildirim sekmesi); oyun ana sayfadaki "Oyun" sekmesinde de çıkar
      const bildirim = body.bildir === false ? 0 : await ogrencilereBildir(o, ogr, caller, gun);
      return { ok: true, oyun: { id: o.id, bitis }, bildirim, ...(await baglantilar(o, req)) };
    }
    const o = await oyunum(caller, body.oyunId);
    if (op === 'baglantilar') {
      const tam = await oyunYukle(o.id);
      return { ok: true, ...(await baglantilar(tam, req)) };
    }
    if (op === 'kapat' || op === 'ac') {
      await rest(`oyun_oyunlari?id=eq.${o.id}`, { ...sv, method: 'PATCH', prefer: 'return=minimal', body: { kapali_at: op === 'kapat' ? new Date().toISOString() : null } });
      return { ok: true };
    }
    if (op === 'uzat') {
      const gun = Number(body.gun);
      if (!GUN_SECENEKLERI.includes(gun)) throw new HttpError(400, 'Geçerlilik süresi seçin.');
      const bitis = new Date(Date.now() + gun * 86400000).toISOString();
      await rest(`oyun_oyunlari?id=eq.${o.id}`, { ...sv, method: 'PATCH', prefer: 'return=minimal', body: { bitis, kapali_at: null } });
      return { ok: true, bitis };
    }
    if (op === 'sil') {
      await rest(`oyun_oyunlari?id=eq.${o.id}`, { ...sv, method: 'DELETE', prefer: 'return=minimal' });
      // Aşama 385: silinen oyunun "Yeni oyun" bildirimi öğrencide kalmaz
      await rest(`student_notifications?source_id=eq.${encodeURIComponent(`oyun:${o.id}`)}`, { ...sv, method: 'DELETE', prefer: 'return=minimal' }).catch(() => undefined);
      return { ok: true };
    }
    if (op === 'sifirla') {
      const sid = clean(body.studentId || '').slice(0, 120);
      if (!sid) throw new HttpError(400, 'Öğrenci seçilmedi.');
      await rest(`oyun_denemeleri?oyun_id=eq.${o.id}&student_id=eq.${encodeURIComponent(sid)}`, { ...sv, method: 'DELETE', prefer: 'return=minimal' });
      return { ok: true };
    }
    throw new HttpError(400, 'Bilinmeyen işlem.');
  }

  return { play, ogretmen, ogrenci };
}
