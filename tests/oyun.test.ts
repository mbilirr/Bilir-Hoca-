import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore — sunucu dosyası düz JavaScript
import * as o from '../api/_oyun.js';

// Aşama 381: Oyunlar (bağlantı imzası, quiz ve çark kuralları, sunucu akışı). Ağ ve gerçek veritabanı yok.
const key = o.linkKey('gizli');
const OYUN = '3f2b8c1e-9a47-4d65-8e10-0b7a5c6d4e21';

test('bağlantı kodu: imzalı, sınıf ve kişisel biçim, bozulursa reddedilir', () => {
  const a = o.makeToken(key, OYUN, null);
  assert.equal(a.length, 22 + 1 + 22);
  assert.deepEqual(o.readToken(key, a), { oyunId: OYUN, studentId: null });
  const b = o.makeToken(key, OYUN, 'ogr-123');
  assert.deepEqual(o.readToken(key, b), { oyunId: OYUN, studentId: 'ogr-123' });
  assert.equal(o.readToken(o.linkKey('baska'), a), null);
  assert.equal(o.readToken(key, a.slice(0, -1) + (a.endsWith('A') ? 'B' : 'A')), null);
  assert.equal(o.readToken(key, b.replace('.', '.X')), null);
  assert.equal(o.readToken(key, 'kisa'), null);
  assert.equal(o.readToken(key, ''), null);
  // kişisel koddaki öğrenci kimliğini değiştirmek imzayı bozar
  const p = b.split('.');
  assert.equal(o.readToken(key, [p[0], Buffer.from('ogr-124').toString('base64url'), p[2]].join('.')), null);
});

test('adlar bağlantıya sahip herkese kısaltılmış görünür', () => {
  assert.equal(o.kisaAd('Ali Veli Yılmaz'), 'Ali Veli Y.');
  assert.equal(o.kisaAd('İrem Şahin'), 'İrem Ş.');
  assert.equal(o.kisaAd('Zeynep'), 'Zeynep');
  assert.equal(o.kisaAd(''), '');
});

const QS = [0, 1, 2, 3].map((i) => ({ id: 'q' + i, tur: 'coktan', metin: 'Soru ' + i, siklar: ['a' + i, 'b' + i, 'c' + i, 'd' + i], dogru: i % 4, cevap: '', aciklama: 'açıklama ' + i, kazanim_kodu: 'K.' + i }));

test('quiz: şıklar karışık, doğru cevap sunucuda denetlenir, puan süreye bağlı', () => {
  const d0 = o.quizBaslat(QS);
  assert.equal(d0.sira.length, 4);
  assert.deepEqual([...d0.sira].sort(), ['q0', 'q1', 'q2', 'q3']);
  for (const id of d0.sira) assert.deepEqual([...d0.sik[id]].sort(), [0, 1, 2, 3]);
  const t0 = 1_000_000;
  const { durum: d1, soru } = o.quizSoru(d0, QS, 20, t0);
  assert.equal(soru.no, 1);
  assert.equal(soru.siklar.length, 4);
  assert.ok(!('dogru' in soru));
  const q = QS.find((x) => x.id === d0.sira[0])!;
  const dogruGosterilen = d1.sik[q.id].indexOf(q.dogru);
  // anında doğru: 100 + 50
  let r = o.quizCevapla(d1, QS, 1, dogruGosterilen, 20, t0);
  assert.equal(r.sonuc.dogru, true);
  assert.equal(r.sonuc.kazanilan, 150);
  assert.equal(r.sonuc.dogruSik, dogruGosterilen);
  assert.equal(r.durum.i, 1);
  // sürenin yarısında doğru: 100 + 25
  r = o.quizCevapla(d1, QS, 1, dogruGosterilen, 20, t0 + 10_000);
  assert.equal(r.sonuc.kazanilan, 125);
  // yanlış şık, süre dolunca ve boş cevap: 0 puan
  const yanlis = (dogruGosterilen + 1) % 4;
  assert.equal(o.quizCevapla(d1, QS, 1, yanlis, 20, t0).sonuc.kazanilan, 0);
  assert.equal(o.quizCevapla(d1, QS, 1, dogruGosterilen, 20, t0 + 30_000).sonuc.dogru, false);
  assert.equal(o.quizCevapla(d1, QS, 1, null, 20, t0).sonuc.dogru, false);
  // yanlış soru sırası, geçersiz şık
  assert.ok(o.quizCevapla(d1, QS, 2, 0, 20, t0).hata);
  assert.equal(o.quizCevapla(d1, QS, 1, 7, 20, t0).sonuc.dogru, false);
  // soru hiç sunulmadan cevap: süre dolmuş sayılır
  assert.equal(o.quizCevapla(d0, QS, 1, dogruGosterilen, 20, t0).sonuc.dogru, false);
});

const KS = [
  { id: 'k0', tur: 'kelime', metin: 'Hücrenin yönetim merkezi', cevap: 'ÇEKİRDEK', aciklama: '', kazanim_kodu: 'F.1' },
  { id: 'k1', tur: 'kelime', metin: 'Su', cevap: 'SU', aciklama: 'su', kazanim_kodu: null },
];
const sabit = (v: number) => () => v;

test('çark: çevir, harf seç, çöz; iflas puanı götürür; 6 hatada kelime kaybedilir', () => {
  let d = o.carkBaslat(KS, sabit(0));
  // sıra karıştırılmış olabilir: ilk kelimeyi bul
  const ilk = KS.find((k) => k.id === d.sira[0])!;
  assert.ok(o.carkHarf(d, KS, 'A').hata); // önce çevirmek gerekir
  let r = o.carkCevir(d, sabit(0)); // 100
  assert.equal(r.durum.asama, 'harf');
  assert.equal(r.durum.deger, 100);
  assert.ok(o.carkCevir(r.durum, sabit(0)).hata); // harf seçmeden tekrar çevrilemez
  d = r.durum;
  const harf = Array.from(ilk.cevap)[0];
  const adet = Array.from(ilk.cevap).filter((x) => x === harf).length;
  r = o.carkHarf(d, KS, harf.toLowerCase());
  assert.equal(r.olay.tur, 'dogru');
  assert.equal(r.durum.tur, 100 * adet);
  d = r.durum;
  assert.ok(o.carkHarf(d, KS, harf).hata === 'Önce çarkı çevirin.');
  // iflas
  r = o.carkCevir(d, sabit(0.99));
  assert.equal(r.olay.tur, 'iflas');
  assert.equal(r.durum.tur, 0);
  // yanlış harfler: tahtada olmayan harf
  d = r.durum;
  const yok = o.HARFLER.find((h: string) => !ilk.cevap.includes(h))!;
  r = o.carkCevir(d, sabit(0));
  r = o.carkHarf(r.durum, KS, yok);
  assert.equal(r.olay.tur, 'yanlis');
  assert.equal(r.durum.hata, 1);
  // tahmin: doğru çözüm kalan gizli harf başına bonus verir
  const g = o.carkGorunum(r.durum, KS);
  assert.equal(g.acik.length, Array.from(ilk.cevap).length);
  const c = o.carkCoz(r.durum, KS, ilk.cevap.toLowerCase());
  assert.equal(c.olay.tur, 'cozuldu');
  assert.ok(c.olay.kazanilan >= 100 + 50);
  assert.equal(c.kayit.dogru, true);
  assert.equal(c.durum.i, 1);
  // yanlış tahmin 2 hata sayılır; 6'ya varınca kelime kaybedilir ve puan verilmez
  let k = r.durum;
  for (let i = 0; i < 2; i++) k = o.carkCoz(k, KS, 'YANLIS').durum;
  assert.equal(k.hata, 5);
  const son = o.carkCoz(k, KS, 'YANLIS');
  assert.equal(son.olay.tur, 'kaybetti');
  assert.equal(son.olay.kazanilan, 0);
  assert.equal(son.olay.cevap, ilk.cevap); // kelime ancak bittikten sonra açıklanır
  assert.equal(son.kayit.dogru, false);
  // geçersiz tahmin
  assert.ok(o.carkCoz(d, KS, 'iki kelime 3').hata);
});

test('çark: bütün harfler açılınca kelime çözülür ve oyun biter', () => {
  let d = o.carkBaslat([KS[1]], sabit(0));
  let r = o.carkCevir(d, sabit(0.2));
  r = o.carkHarf(r.durum, KS, 'S');
  assert.equal(r.olay.tur, 'dogru');
  r = o.carkCevir(r.durum, sabit(0.2));
  r = o.carkHarf(r.durum, KS, 'U');
  assert.equal(r.olay.tur, 'cozuldu');
  assert.ok(o.carkBitti(r.durum));
  assert.equal(o.carkGorunum(r.durum, KS), null);
});

// ----------------------------------------------------------------------------- sunucu akışı (sahte veritabanı)
class HttpError extends Error {
  status: number;
  extra: unknown;
  constructor(status: number, message: string, extra?: unknown) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

function sahteSunucu(oyun: Record<string, any>, modules: Record<string, boolean> = { oyun: true }) {
  const ogrenciler = [
    { id: 's1', name: 'Ali Yılmaz', class_id: 'c1', class_name: '8/A', status: 'active' },
    { id: 's2', name: 'Ayşe Demir', class_id: 'c1', class_name: '8/A', status: 'active' },
    { id: 's3', name: 'Can Kaya', class_id: 'c2', class_name: '8/B', status: 'active' },
  ];
  const denemeler: any[] = [];
  const cevaplar: any[] = [];
  const rest = async (path: string, opt: any = {}) => {
    const u = new URL('http://x/' + path);
    const tablo = u.pathname.slice(1);
    const q = (k: string) => (u.searchParams.get(k) || '').replace(/^eq\./, '');
    const method = opt.method || 'GET';
    if (tablo === 'oyun_oyunlari') return q('id') === oyun.id ? [oyun] : [];
    if (tablo === 'kurumlar') return [{ modules }];
    if (tablo === 'students') {
      if (u.searchParams.get('class_id')) return ogrenciler.filter((s) => s.class_id === q('class_id'));
      return ogrenciler.filter((s) => s.id === q('id'));
    }
    if (tablo === 'oyun_denemeleri') {
      if (method === 'POST') {
        if (!denemeler.some((d) => d.oyun_id === opt.body.oyun_id && d.student_id === opt.body.student_id)) denemeler.push({ id: 'd' + denemeler.length, v: 0, puan: 0, dogru: 0, durum: 'suruyor', ...opt.body });
        return null;
      }
      if (method === 'PATCH') {
        const d = denemeler.find((x) => x.id === q('id') && String(x.v) === q('v'));
        if (!d) return [];
        Object.assign(d, opt.body);
        return [d];
      }
      return denemeler.filter((d) => d.oyun_id === q('oyun_id') && (!u.searchParams.get('student_id') || d.student_id === q('student_id')));
    }
    if (tablo === 'oyun_cevaplari') {
      if (!cevaplar.some((c) => c.deneme_id === opt.body.deneme_id && c.soru_id === opt.body.soru_id)) cevaplar.push(opt.body);
      return null;
    }
    throw new Error('sahte sunucu: ' + path);
  };
  const api = o.oyunApi({
    rest,
    env: () => ({ secretKey: 'gizli', service: 'x' }),
    HttpError,
    inList: (a: string[]) => `(${a.join(',')})`,
    appUrl: () => 'https://ornek.test',
    clean: (s: string) => String(s || '').trim(),
  });
  return { api, denemeler, cevaplar };
}

const oyunSatiri = (mod: 'quiz' | 'cark', kapsam: 'sinif' | 'kisisel', extra: Record<string, any> = {}) => ({
  id: OYUN, kurum_id: 'k1', ad: 'Deneme oyunu', mod, kapsam, class_id: 'c1', class_ad: '8/A', soru_sn: 20,
  sorular: mod === 'quiz' ? QS : KS, bitis: new Date(Date.now() + 86400000).toISOString(), kapali_at: null, ...extra,
});

test('sunucu: sınıf bağlantısı — ad listesi kısaltılmış, yalnız sınıfın öğrencisi oynar, doğru cevap önceden gitmez', async () => {
  const { api, denemeler, cevaplar } = sahteSunucu(oyunSatiri('quiz', 'sinif'));
  const token = o.makeToken(key, OYUN, null);
  const bilgi = await api.play({ op: 'bilgi', token });
  assert.deepEqual(bilgi.ogrenciler.map((x: any) => x.ad), ['Ali Y.', 'Ayşe D.']);
  assert.equal(bilgi.oyun.soruSayisi, 4);
  // başka sınıfın öğrencisi
  await assert.rejects(() => api.play({ op: 'basla', token, studentId: 's3' }), /bu öğrenci için açık değil/);
  await assert.rejects(() => api.play({ op: 'basla', token }), /adınızı seçin/);
  const b = await api.play({ op: 'basla', token, studentId: 's1' });
  assert.equal(b.tur, 'quiz');
  assert.equal(b.soru.no, 1);
  assert.ok(!JSON.stringify(b).includes('"dogru"'));
  assert.ok(!JSON.stringify(b).includes('açıklama'));
  // tam oyun: hep ilk şıkkı seç; gösterilen sıraya göre doğru/yanlış sunucu karar verir
  let son: any = b;
  let toplamDogru = 0;
  for (let i = 1; i <= 4; i++) {
    const c = await api.play({ op: 'cevap', token, studentId: 's1', no: i, secim: 0 });
    toplamDogru += c.sonuc.dogru ? 1 : 0;
    assert.ok(c.sonuc.dogruSik >= 0 && c.sonuc.dogruSik <= 3);
    son = c;
    if (!c.bitti) {
      const s = await api.play({ op: 'durum', token, studentId: 's1' });
      assert.equal(s.soru.no, i + 1);
    }
  }
  assert.equal(son.bitti, true);
  assert.equal(son.ozet.dogru, toplamDogru);
  assert.equal(denemeler[0].durum, 'bitti');
  assert.equal(cevaplar.length, 4);
  assert.equal(cevaplar[0].kazanim_kodu?.startsWith('K.'), true);
  // tamamlanan oyun tekrar oynanamaz; sonucu görünür
  await assert.rejects(() => api.play({ op: 'cevap', token, studentId: 's1', no: 1, secim: 0 }), /zaten tamamlandı/);
  assert.equal((await api.play({ op: 'durum', token, studentId: 's1' })).tur, 'bitti');
  // listede artık tamamlandı görünür
  const yeni = await api.play({ op: 'bilgi', token });
  assert.equal(yeni.ogrenciler.find((x: any) => x.id === 's1').durum, 'bitti');
});

test('sunucu: kişisel bağlantı yalnız o öğrenciyi açar; kapalı ve süresi dolmuş oyun açılmaz', async () => {
  const { api } = sahteSunucu(oyunSatiri('quiz', 'kisisel'));
  const t1 = o.makeToken(key, OYUN, 's1');
  const bilgi = await api.play({ op: 'bilgi', token: t1 });
  assert.equal(bilgi.kisisel, true);
  assert.equal(bilgi.ogrenci.ad, 'Ali Y.');
  assert.ok(!bilgi.ogrenciler);
  // bağlantıdaki öğrenci yerine başkasını göndermek işe yaramaz
  const b = await api.play({ op: 'basla', token: t1, studentId: 's2' });
  assert.equal(b.ogrenci.id, 's1');
  // sınıfta olmayan öğrenci için kişisel bağlantı
  await assert.rejects(() => api.play({ op: 'bilgi', token: o.makeToken(key, OYUN, 's3') }), /geçersiz/);
  await assert.rejects(() => api.play({ op: 'bilgi', token: 'uydurma' }), /geçersiz/);
  const kapali = sahteSunucu(oyunSatiri('quiz', 'sinif', { kapali_at: new Date().toISOString() }));
  await assert.rejects(() => kapali.api.play({ op: 'bilgi', token: o.makeToken(key, OYUN, null) }), /kapatıldı/);
  const bolumKapali = sahteSunucu(oyunSatiri('quiz', 'sinif'), { oyun: false });
  await assert.rejects(() => bolumKapali.api.play({ op: 'bilgi', token: o.makeToken(key, OYUN, null) }), /kapalı/);
  const doldu = sahteSunucu(oyunSatiri('quiz', 'sinif', { bitis: new Date(Date.now() - 1000).toISOString() }));
  await assert.rejects(() => doldu.api.play({ op: 'bilgi', token: o.makeToken(key, OYUN, null) }), /süresi dolmuş/);
});

test('sunucu: çark oyunu uçtan uca; kelime kaybedilene kadar cevap gönderilmez', async () => {
  const { api, cevaplar } = sahteSunucu(oyunSatiri('cark', 'sinif'));
  const token = o.makeToken(key, OYUN, null);
  const b = await api.play({ op: 'basla', token, studentId: 's2' });
  assert.equal(b.tur, 'cark');
  assert.ok(b.tahta.acik.every((x: unknown) => x === null));
  assert.ok(!JSON.stringify(b).includes('ÇEKİRDEK'));
  // kelimeyi harf harf aç: sunucudan cevap öğrenmeden, tahmin ederek
  let bitti = false;
  let guvenlik = 0;
  while (!bitti && guvenlik++ < 200) {
    let cv = await api.play({ op: 'cevir', token, studentId: 's2' });
    if (cv.olay.tur === 'iflas') continue;
    const durum = await api.play({ op: 'durum', token, studentId: 's2' });
    const denenen = durum.tahta.denenen as string[];
    const harf = o.HARFLER.find((h: string) => !denenen.includes(h));
    const hr = await api.play({ op: 'harf', token, studentId: 's2', harf });
    bitti = hr.bitti;
  }
  assert.ok(cevaplar.length >= 1);
  assert.ok(guvenlik < 200);
});
