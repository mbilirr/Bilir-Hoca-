// ============================================================================
// Aşama 381: OYUNLAR — sunucu tarafı (api/mail.js kullanır; adı "_" ile başladığı için ayrı işlev sayılmaz)
//   * Bağlantı: oyun kimliği + (kişisel bağlantıda) öğrenci kimliği, gizli anahtarla imzalı (HMAC, 128 bit).
//     Sınıf bağlantısında öğrenci listeden kendi adını seçer. Bağlantıyı iptal etmek = oyunu kapatmak.
//   * Doğru cevap tarayıcıya HİÇBİR ZAMAN soru sorulurken gitmez; cevap sunucuda denetlenir, puan ve süre sunucuda
//     hesaplanır (tarayıcıdan gelen süre / puan yok sayılır). Şıkların sırası her öğrenci için ayrı karıştırılır.
//   * İki mod: "quiz" (çoktan seçmeli, soru başına süre, hız bonuslu) ve "cark" (kelime çarkı: çevir, harf seç, çöz).
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

// ----------------------------------------------------------------------------- veritabanı işleri
const durumYazi = {
  kapali: 'Bu oyun öğretmen tarafından kapatıldı.',
  doldu: 'Bu oyun bağlantısının süresi dolmuş.',
  gecersiz: 'Oyun bağlantısı geçersiz. Bağlantıyı eksiksiz açtığınızdan emin olun.',
};

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
    const durum = o.mod === 'cark' ? carkBaslat(o.sorular) : quizBaslat(o.sorular);
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
    return { tur: 'cark', tahta: carkGorunum(d, o.sorular), puan: dn.puan };
  }

  async function play(body) {
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

  async function ogretmen(caller, body, req) {
    if (!env().service) throw new HttpError(503, 'Sunucu ayarları eksik (SUPABASE_SERVICE_ROLE_KEY).', { fatal: true });
    await yetki(caller);
    const op = String(body.op || '');
    if (op === 'olustur') {
      const mod = body.mod === 'cark' ? 'cark' : body.mod === 'quiz' ? 'quiz' : '';
      if (!mod) throw new HttpError(400, 'Oyun türünü seçin.');
      const kapsam = body.kapsam === 'kisisel' ? 'kisisel' : 'sinif';
      const ad = clean(body.ad || '').slice(0, 80);
      if (ad.length < 2) throw new HttpError(400, 'Oyuna bir ad verin.');
      const sn = Math.round(Number(body.sureSn) || SORU_SN.varsayilan);
      if (sn < SORU_SN.en_az || sn > SORU_SN.en_cok) throw new HttpError(400, `Soru süresi ${SORU_SN.en_az}-${SORU_SN.en_cok} saniye olmalı.`);
      const gun = Number(body.gun);
      if (!GUN_SECENEKLERI.includes(gun)) throw new HttpError(400, 'Geçerlilik süresi seçin.');
      const ids = [...new Set((Array.isArray(body.soruIds) ? body.soruIds : []).map((x) => String(x || '')).filter((x) => /^[0-9a-f-]{36}$/i.test(x)))];
      const lim = mod === 'quiz' ? QUIZ_SORU : CARK_KELIME;
      if (ids.length < lim.en_az || ids.length > lim.en_cok) throw new HttpError(400, `Bu oyun için ${lim.en_az} ile ${lim.en_cok} arasında soru seçin.`);
      // Sorular ve sınıf çağıranın KENDİ oturumuyla okunur: göremediği sınıf / soru işe yaramaz
      const sorular = (await rest(`oyun_sorulari?select=id,tur,metin,siklar,dogru,cevap,aciklama,kazanim_kodu,ders,konu,zorluk&id=in.${inList(ids)}`, { token: caller.token })) || [];
      if (sorular.length !== ids.length) throw new HttpError(404, 'Seçilen sorulardan bazıları bulunamadı (silinmiş olabilir).');
      const uygun = mod === 'quiz' ? 'coktan' : 'kelime';
      if (sorular.some((s) => s.tur !== uygun)) throw new HttpError(400, mod === 'quiz' ? 'Soru yarışında yalnız çoktan seçmeli sorular kullanılır.' : 'Kelime çarkında yalnız kelime soruları kullanılır.');
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
      return { ok: true, oyun: { id: o.id, bitis }, ...(await baglantilar(o, req)) };
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

  return { play, ogretmen };
}
