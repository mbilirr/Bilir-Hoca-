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

function sahteSunucu(oyun: Record<string, any>, modules: Record<string, boolean> = { oyun: true }, ek: { turnuvalar?: any[]; sira?: any[] } = {}) {
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
    if (tablo === 'oyun_oyunlari') {
      // Aşama 385: öğrencinin listesi sınıfa göre arar (soru_sayisi veritabanında hesaplanır)
      if (u.searchParams.get('class_id')) return q('class_id') === oyun.class_id && !oyun.kapali_at ? [{ ...oyun, soru_sayisi: oyun.sorular.length }] : [];
      return q('id') === oyun.id ? [oyun] : [];
    }
    if (tablo === 'kurumlar') return [{ id: oyun.kurum_id, modules }];
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
      const oyunEsit = (id: string) => (q('oyun_id').startsWith('in.(') ? q('oyun_id').slice(4, -1).split(',').includes(id) : id === q('oyun_id'));
      return denemeler.filter((d) => oyunEsit(d.oyun_id) && (!u.searchParams.get('student_id') || d.student_id === q('student_id')));
    }
    // Aşama 389: turnuva (verilmediyse tablo yokmuş gibi: 389 SQL kurulmamış)
    if (tablo === 'oyun_turnuvalari') {
      if (!ek.turnuvalar) throw new Error('relation "oyun_turnuvalari" does not exist');
      return ek.turnuvalar;
    }
    if (tablo === 'rpc/oyun_turnuva_sira') return (ek.sira || []).filter(() => opt.body && opt.body.p_turnuva);
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

// ----------------------------------------------------------------------------- Aşama 382: bulmaca
const BS = ['ÇEKİRDEK', 'HÜCRE', 'ZAR', 'DNA', 'GEN', 'KROMOZOM', 'RİBOZOM', 'ENZİM'].map((c, i) => ({ id: 'b' + i, tur: 'kelime', metin: 'İpucu ' + i, siklar: [], dogru: null, cevap: c, aciklama: '', kazanim_kodu: i % 2 ? 'F.8.2.1.1' : null }));

/** yerleşimdeki her hücre tek harf taşır; kelimeler birbirine bitişik yanlış kelime oluşturmaz */
function yerlesimGecerli(d: any, sorular: any[]) {
  const izgara = new Map<string, string>();
  for (const k of d.kelimeler) {
    const w = Array.from(sorular.find((s) => s.id === k.id).cevap as string);
    assert.equal(w.length, k.n);
    w.forEach((h, j) => {
      const key = k.yon === 'y' ? `${k.x + j},${k.y}` : `${k.x},${k.y + j}`;
      if (izgara.has(key)) assert.equal(izgara.get(key), h, 'kesişen harf aynı olmalı');
      izgara.set(key, h);
      const [x, y] = key.split(',').map(Number);
      assert.ok(x >= 0 && y >= 0 && x < d.gen && y < d.yuk);
    });
  }
  // her yatay / dikey harf dizisi (2+ harf) bir kelimeye denk gelmeli
  const diziler = new Set(d.kelimeler.map((k: any) => `${k.yon}:${k.x},${k.y}:${k.n}`));
  for (const yon of ['y', 'd']) {
    for (const key of izgara.keys()) {
      const [x, y] = key.split(',').map(Number);
      const onceki = yon === 'y' ? `${x - 1},${y}` : `${x},${y - 1}`;
      if (izgara.has(onceki)) continue;
      let n = 0;
      while (izgara.has(yon === 'y' ? `${x + n},${y}` : `${x},${y + n}`)) n++;
      if (n >= 2) assert.ok(diziler.has(`${yon}:${x},${y}:${n}`), `fazladan kelime: ${yon} ${x},${y} ${n}`);
    }
  }
}

test('bulmaca: yerleşim geçerli, kesişimli ve aynı oyun için hep aynı', () => {
  const a = o.bulmacaKur(BS, OYUN);
  const b = o.bulmacaKur(BS, OYUN);
  assert.deepEqual(a, b);
  assert.equal(a.kelimeler.length, BS.length);
  yerlesimGecerli(a, BS);
  // numaralar okuma sırasında 1'den başlar; yatay kelimeler önce listelenir
  assert.equal(Math.min(...a.kelimeler.map((k: any) => k.no)), 1);
  const yonler = a.kelimeler.map((k: any) => k.yon).join('');
  assert.match(yonler, /^y+d+$/);
  // farklı oyun kimlikleri, farklı kelime grupları: hep geçerli
  for (let i = 0; i < 30; i++) {
    const s = BS.slice(0, 2 + (i % 7));
    yerlesimGecerli(o.bulmacaKur(s, 'oyun-' + i), s);
  }
  // hiç ortak harfi olmayan kelimeler de yerleşir (ayrı satıra)
  const ayri = [{ ...BS[2], cevap: 'ZAR' }, { ...BS[3], id: 'x', cevap: 'BOŞ' }];
  yerlesimGecerli(o.bulmacaKur(ayri, OYUN), ayri);
});

test('bulmaca: tahmin, yanlış hakkı, ipucu, cevap sızmaz, bitir', () => {
  const duzen = o.bulmacaKur(BS, OYUN);
  let d = o.bulmacaBaslat();
  let g = o.bulmacaGorunum(d, BS, duzen);
  assert.ok(g.kelimeler.every((k: any) => k.harfler.every((h: any) => h === null)));
  assert.ok(!JSON.stringify(g).includes('KROMOZOM'));
  const kNo = (id: string) => duzen.kelimeler.findIndex((k: any) => k.id === id);
  // uzunluk ve biçim denetimi
  assert.match(o.bulmacaTahmin(d, BS, duzen, kNo('b0'), 'ÇEK').hata, /8 harfli/);
  assert.match(o.bulmacaTahmin(d, BS, duzen, 99, 'X').hata, /bulunamadı/);
  // doğru (küçük harfle de)
  let r = o.bulmacaTahmin(d, BS, duzen, kNo('b0'), 'çekirdek');
  assert.equal(r.olay.tur, 'dogru');
  assert.equal(r.kayit.puan, 100);
  d = r.durum;
  g = o.bulmacaGorunum(d, BS, duzen);
  assert.deepEqual(g.kelimeler[kNo('b0')].harfler.join(''), 'ÇEKİRDEK');
  assert.equal(g.kelimeler[kNo('b0')].durum, 'bildi');
  assert.match(o.bulmacaTahmin(d, BS, duzen, kNo('b0'), 'ÇEKİRDEK').hata, /zaten/);
  // ipucu + yanlış puanı düşürür
  r = o.bulmacaIpucu(d, BS, duzen, kNo('b5'), () => 0);
  d = r.durum;
  r = o.bulmacaTahmin(d, BS, duzen, kNo('b5'), 'KROMOZAM');
  assert.equal(r.olay.tur, 'yanlis');
  assert.equal(r.olay.kalanHak, 2);
  d = r.durum;
  r = o.bulmacaTahmin(d, BS, duzen, kNo('b5'), 'KROMOZOM');
  assert.equal(r.kayit.puan, 100 - 25 - 20);
  d = r.durum;
  // 3 yanlış: kelime kaçar, cevap açılır, puan yok
  for (let i = 0; i < 2; i++) d = o.bulmacaTahmin(d, BS, duzen, kNo('b2'), 'ZİL').durum;
  r = o.bulmacaTahmin(d, BS, duzen, kNo('b2'), 'ZOR');
  assert.equal(r.olay.tur, 'kacti');
  assert.equal(r.olay.cevap, 'ZAR');
  assert.equal(r.kayit.dogru, false);
  d = r.durum;
  // son kapalı harf ipucuyla verilmez
  let i = 0;
  let son: any;
  while (!(son = o.bulmacaIpucu(d, BS, duzen, kNo('b3'), () => 0)).hata && i++ < 10) d = son.durum;
  assert.match(son.hata, /Son harfi/);
  assert.equal(o.bulmacaGorunum(d, BS, duzen).kelimeler[kNo('b3')].harfler.filter((h: any) => !h).length, 1);
  assert.equal(o.bulmacaBitti(d, BS), false);
  const b = o.bulmacaBitir(d, BS);
  assert.equal(o.bulmacaBitti(b.durum, BS), true);
  assert.equal(b.kayitlar.length, BS.length - 3);
  assert.ok(b.kayitlar.every((k: any) => !k.dogru && k.puan === 0));
});

test('sunucu: bulmaca uçtan uca; oyun bitince sonuç kaydedilir', async () => {
  const { api, denemeler, cevaplar } = sahteSunucu({ ...oyunSatiri('cark', 'kisisel'), mod: 'bulmaca', sorular: BS.slice(0, 4) });
  const token = o.makeToken(key, OYUN, 's1');
  const b = await api.play({ op: 'basla', token, studentId: 's1' });
  assert.equal(b.tur, 'bulmaca');
  assert.equal(b.bulmaca.kelimeler.length, 4);
  assert.ok(!JSON.stringify(b).includes('ÇEKİRDEK'));
  const k0 = b.bulmaca.kelimeler.find((k: any) => k.n === 8).k;
  let r = await api.play({ op: 'kelime', token, studentId: 's1', k: k0, tahmin: 'ÇEKİRDEK' });
  assert.equal(r.olay.tur, 'dogru');
  assert.equal(r.bitti, false);
  r = await api.play({ op: 'ipucu', token, studentId: 's1', k: (k0 + 1) % 4 });
  assert.equal(r.olay.tur, 'ipucu');
  r = await api.play({ op: 'bitir', token, studentId: 's1' });
  assert.equal(r.bitti, true);
  assert.equal(r.ozet.dogru, 1);
  assert.equal(r.ozet.puan, 100);
  assert.equal(denemeler[0].durum, 'bitti');
  assert.equal(cevaplar.length, 4);
  await assert.rejects(() => api.play({ op: 'kelime', token, studentId: 's1', k: 0, tahmin: 'X' }), /tamamlandı/);
});

// ----------------------------------------------------------------------------- Aşama 385: öğrencinin kendi listesi
test('öğrenci: kendi sınıfının açık oyunları kendi adına bağlantıyla gelir; bitince bağlantı verilmez', async () => {
  const { api } = sahteSunucu(oyunSatiri('quiz', 'sinif'));
  const ali = { id: 's1', name: 'Ali Yılmaz', class_id: 'c1', kurum_id: 'k1', status: 'active' };
  const l = await api.ogrenci(ali, { op: 'liste' });
  assert.equal(l.acik, true);
  assert.equal(l.oyunlar.length, 1);
  const g = l.oyunlar[0];
  assert.equal(g.soruSayisi, 4);
  assert.equal(g.deneme, null);
  assert.ok(!JSON.stringify(l).includes('"dogru":'), 'cevaplar listeye sızmaz');
  // sınıf oyunu da öğrencinin kendi adıyla açılır: ad seçmez, başkası yerine oynayamaz
  const bilgi = await api.play({ op: 'bilgi', token: g.token });
  assert.equal(bilgi.kisisel, true);
  assert.equal(bilgi.ogrenci.id, 's1');
  const b = await api.play({ op: 'basla', token: g.token, studentId: 's2' });
  assert.equal(b.ogrenci.id, 's1');
  for (let i = 1; i <= 4; i++) await api.play({ op: 'cevap', token: g.token, no: i, secim: 0 });
  const son = (await api.ogrenci(ali, { op: 'liste' })).oyunlar[0];
  assert.equal(son.deneme.durum, 'bitti');
  assert.equal(son.token, undefined);
  // başka sınıfın öğrencisi bu oyunu görmez
  const can = { id: 's3', name: 'Can Kaya', class_id: 'c2', kurum_id: 'k1', status: 'active' };
  assert.equal((await api.ogrenci(can, { op: 'liste' })).oyunlar.length, 0);
});

test('öğrenci: bölüm kapalıysa sekme yok; süresi dolan oyun yalnız oynadıysa görünür', async () => {
  const ali = { id: 's1', name: 'Ali Yılmaz', class_id: 'c1', kurum_id: 'k1', status: 'active' };
  const kapali = sahteSunucu(oyunSatiri('quiz', 'sinif'), { oyun: false });
  assert.deepEqual(await kapali.api.ogrenci(ali, { op: 'liste' }), { ok: true, acik: false, oyunlar: [] });
  const doldu = sahteSunucu(oyunSatiri('quiz', 'sinif', { bitis: new Date(Date.now() - 3600000).toISOString() }));
  assert.equal((await doldu.api.ogrenci(ali, { op: 'liste' })).oyunlar.length, 0);
  doldu.denemeler.push({ id: 'd0', oyun_id: OYUN, student_id: 's1', durum: 'bitti', puan: 220, dogru: 2, toplam: 4, v: 3 });
  const l = (await doldu.api.ogrenci(ali, { op: 'liste' })).oyunlar;
  assert.equal(l.length, 1);
  assert.equal(l[0].acik, false);
  assert.equal(l[0].deneme.puan, 220);
  assert.equal(l[0].token, undefined);
});

// ----------------------------------------------------------------------------- Aşama 386: hız sınırı
test('hız sınırı: dakikada sınırı aşan istek reddedilir, pencere dolunca yeniden açılır', () => {
  const say = o.hizSayaci(60_000, 3);
  const t0 = 1_000_000;
  assert.equal(say('x', 2, t0), true);
  assert.equal(say('x', 2, t0 + 10), true);
  assert.equal(say('x', 2, t0 + 20), false);
  assert.equal(say('y', 2, t0 + 20), true, 'başka anahtar etkilenmez');
  assert.equal(say('x', 2, t0 + 60_000), true, 'yeni pencere');
  // anahtar sayısı tavanda kalır (bellek büyümez)
  for (let i = 0; i < 10; i++) say('k' + i, 5, t0 + 60_001);
  assert.equal(say('k9', 5, t0 + 60_002), true);
});

test('sunucu: aynı öğrenciden döngüyle gelen oyun isteği 429 alır', async () => {
  const { api } = sahteSunucu(oyunSatiri('quiz', 'kisisel'));
  const token = o.makeToken(key, OYUN, 's1');
  let red: any = null;
  for (let i = 0; i < o.OYUN_HIZ.ogrenci + 5 && !red; i++) {
    await api.play({ op: 'bilgi', token }, '10.0.0.1').catch((e: any) => (red = e));
  }
  assert.equal(red?.status, 429);
  // başka adresten gelen öğrenci etkilenmez
  const b = await api.play({ op: 'bilgi', token }, '10.0.0.2');
  assert.equal(b.ok, true);
});

test('öğrenci: turnuvada yalnız kendi sırası ve katılımcı sayısı gelir; 389 kurulu değilse oyunlar etkilenmez', async () => {
  const ali = { id: 's1', name: 'Ali Yılmaz', class_id: 'c1', kurum_id: 'k1', status: 'active' };
  const yok = sahteSunucu(oyunSatiri('quiz', 'sinif'));
  const l0 = await yok.api.ogrenci(ali, { op: 'liste' });
  assert.equal(l0.oyunlar.length, 1);
  assert.equal(l0.turnuva, null);
  const sira = [
    { student_id: 's2', ad: 'Ayşe Demir', puan: 900, dogru: 8, toplam: 8, oyun_sayisi: 2, sira: 1 },
    { student_id: 's1', ad: 'Ali Yılmaz', puan: 500, dogru: 5, toplam: 8, oyun_sayisi: 2, sira: 2 },
  ];
  const T = { id: 't1', ad: 'Kasım turnuvası', oyun_ids: [OYUN, 'baska-oyun'], olusturan_ad: 'Mehmet Öz' };
  const var_ = sahteSunucu(oyunSatiri('quiz', 'sinif'), { oyun: true }, { turnuvalar: [T], sira });
  const l = await var_.api.ogrenci(ali, { op: 'liste' });
  assert.deepEqual(l.turnuva, { id: 't1', ad: 'Kasım turnuvası', ogretmen: 'Mehmet Öz', oyunSayisi: 2, katilan: 2, ben: { sira: 2, puan: 500, oyun: 2 } });
  assert.ok(!JSON.stringify(l).includes('Ayşe'), 'başka öğrencinin adı gitmez');
  // turnuvadaki oyunlardan hiçbiri öğrencinin sınıfında değilse turnuva gösterilmez
  const can = { id: 's3', name: 'Can Kaya', class_id: 'c2', kurum_id: 'k1', status: 'active' };
  assert.equal((await var_.api.ogrenci(can, { op: 'liste' })).turnuva, null);
  // oynamadıysa sırası yok ama turnuva görünür
  const veli = { id: 's9', name: 'Veli Ak', class_id: 'c1', kurum_id: 'k1', status: 'active' };
  assert.equal((await var_.api.ogrenci(veli, { op: 'liste' })).turnuva.ben, null);
});
