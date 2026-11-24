import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore — sunucu dosyası düz JavaScript
import * as o from '../api/_oyun.js';

// Aşama 396: öğrenci kendi oynar — Çalışma modu kuralları ve serbest oyun sunucu akışı. Ağ ve gerçek veritabanı yok.
const QS = [0, 1, 2].map((i) => ({ id: 'q' + i, tur: 'coktan', metin: 'Soru ' + i, siklar: ['a' + i, 'b' + i, 'c' + i, 'd' + i], dogru: i % 4, cevap: '', aciklama: 'açıklama ' + i, kazanim_kodu: null }));
const dogruSik = (d: any, id: string) => d.sik[id].indexOf(QS.find((x) => x.id === id)!.dogru);
const yanlisSik = (d: any, id: string) => (dogruSik(d, id) + 1) % 4;

test('çalışma: süre yok, yanlış soru sonda bir kez daha sorulur, sonuç ilk cevaplardan sayılır', () => {
  let d = o.calismaBaslat(QS);
  assert.equal(d.mod, 'calisma');
  // soru açılmadan cevap verilemez
  assert.ok(o.calismaCevapla(d, QS, 1, 0).hata);
  const ilk = d.sira[0];
  let r: any = o.calismaSoru(d, QS, 1000);
  assert.equal(r.soru.tekrar, false);
  assert.ok(!('dogru' in r.soru));
  r = o.calismaCevapla(r.durum, QS, 1, yanlisSik(r.durum, ilk));
  assert.equal(r.sonuc.dogru, false);
  assert.equal(r.sonuc.tekrarlanacak, true);
  assert.equal(r.sonuc.aciklama, 'açıklama ' + ilk.slice(1));
  assert.equal(r.kayit.dogru, false);
  d = r.durum;
  assert.equal(d.sira.length, 4);
  // ikinci soru: "Bilmiyorum" (null) da yanlış sayılır ve tekrar edilir
  r = o.calismaSoru(d, QS, 2000);
  r = o.calismaCevapla(r.durum, QS, 2, null);
  assert.equal(r.sonuc.dogru, false);
  d = r.durum;
  assert.equal(d.sira.length, 5);
  // üçüncü: doğru
  r = o.calismaSoru(d, QS, 3000);
  r = o.calismaCevapla(r.durum, QS, 3, dogruSik(r.durum, d.sira[2]));
  assert.equal(r.sonuc.dogru, true);
  assert.equal(r.sonuc.tekrarlanacak, false);
  d = r.durum;
  // tekrar sorusu: işaretlidir, yanlışta bir daha eklenmez, kayda geçmez
  r = o.calismaSoru(d, QS, 4000);
  assert.equal(r.soru.tekrar, true);
  assert.equal(r.soru.toplam, 5);
  r = o.calismaCevapla(r.durum, QS, 4, yanlisSik(r.durum, ilk));
  assert.equal(r.kayit, null);
  assert.equal(r.sonuc.tekrarlanacak, false);
  d = r.durum;
  assert.equal(d.sira.length, 5);
  r = o.calismaSoru(d, QS, 5000);
  r = o.calismaCevapla(r.durum, QS, 5, dogruSik(r.durum, d.sira[4]));
  assert.equal(r.kayit, null);
  assert.ok(o.quizBitti(r.durum));
  // sıra karışırsa reddedilir; geçersiz şık reddedilir
  const d2 = o.calismaSoru(o.calismaBaslat(QS), QS, 1).durum;
  assert.ok(o.calismaCevapla(d2, QS, 2, 0).hata);
  assert.ok(o.calismaCevapla(d2, QS, 1, 7).hata);
});

class HttpError extends Error {
  status: number;
  extra: unknown;
  constructor(status: number, message: string, extra?: unknown) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const ali = { id: 's1', name: 'Ali Yılmaz', class_id: 'c1', kurum_id: 'k1', status: 'active' };
const ayse = { id: 's2', name: 'Ayşe Demir', class_id: 'c1', kurum_id: 'k1', status: 'active' };

function sahte(modules: Record<string, boolean> = { oyun: true }) {
  const oyunlar: any[] = [];
  const denemeler: any[] = [];
  const cevaplar: any[] = [];
  const ozet: any[] = [];
  const cagri: Array<{ yol: string; govde?: any }> = [];
  const rest = async (path: string, opt: any = {}) => {
    const u = new URL('http://x/' + path);
    const tablo = u.pathname.slice(1);
    const q = (k: string) => (u.searchParams.get(k) || '').replace(/^eq\./, '');
    const method = opt.method || 'GET';
    cagri.push({ yol: `${method} ${tablo}`, govde: opt.body });
    if (tablo === 'kurumlar') return [{ id: 'k1', modules }];
    // Aşama 397
    if (tablo === 'oyun_rozetleri') return q('deneme_id') === (denemeler[0] && denemeler[0].id) ? [{ rozet: 'ilk_adim', detay: null }] : [];
    if (tablo === 'rpc/oyun_gelisim') return { seri: 2, enUzunSeri: 2, toplamDogru: 12, bugun: '2026-11-24', takvim: [], konular: [], rozetler: [{ rozet: 'ilk_adim' }] };
    if (tablo === 'rpc/oyun_yetkili') return opt.token === 'ogretmen';
    if (tablo === 'rpc/oyun_sinif_gelisim') {
      assert.deepEqual(opt.body.p_ogrenciler, ['s1', 's2']);
      return { ogrenciler: [{ id: 's1', soru: 5, dogru: 4, seri: 1, rozet: 2 }, { id: 's2', soru: 9, dogru: 3, seri: 0, rozet: 0 }], zayif: [{ ders: 'Fen', konu: 'Basınç', dogru: 3, toplam: 12 }] };
    }
    if (tablo === 'classes') return opt.token === 'ogretmen' ? (q('id') === 'c1' ? [{ id: 'c1', name: '8/A' }] : []) : [{ name: '8/A', level: 8 }];
    if (tablo === 'students') return u.searchParams.get('class_id') ? [ali, ayse].map((x) => ({ ...x, name: x.name })) : [ali, ayse].filter((s) => s.id === q('id'));
    if (tablo === 'rpc/oyun_serbest_bilgi') return { seri: 3, bugun: false, enUzunSeri: 5, rekor: {}, sonAyar: null, hafta: { dogru: 7, toplam: 9 }, zayif: null, banka: [] };
    if (tablo === 'rpc/oyun_serbest_sec') {
      assert.equal(opt.body.p_sinif, 8);
      return opt.body.p_tur === 'coktan' ? QS.map((s) => ({ ...s, gorsel_id: null })) : [];
    }
    if (tablo === 'oyun_oyunlari') {
      if (method === 'POST') {
        const row = { id: '3f2b8c1e-9a47-4d65-8e10-0b7a5c6d4e2' + oyunlar.length, created_at: new Date().toISOString(), kapali_at: null, ...opt.body };
        oyunlar.push(row);
        return [row];
      }
      if (method === 'DELETE') return null;
      if (u.searchParams.get('created_at')) return [];
      return oyunlar.filter((x) => x.id === q('id') && (!u.searchParams.get('student_id') || x.student_id === q('student_id')));
    }
    if (tablo === 'oyun_ogrenci_ozet') {
      if (method === 'POST') return ozet.push(opt.body) && null;
      return [{ seri: 4, en_uzun_seri: 5, rekor: {} }];
    }
    if (tablo === 'oyun_denemeleri') {
      if (method === 'POST') {
        if (!denemeler.some((d) => d.oyun_id === opt.body.oyun_id)) denemeler.push({ id: 'd' + denemeler.length, v: 0, puan: 0, dogru: 0, durum: 'suruyor', ...opt.body });
        return null;
      }
      if (method === 'PATCH') {
        const d = denemeler.find((x) => x.id === q('id') && String(x.v) === q('v'));
        if (!d) return [];
        Object.assign(d, opt.body);
        return [d];
      }
      return denemeler.filter((d) => d.oyun_id === q('oyun_id') && d.student_id === q('student_id'));
    }
    if (tablo === 'oyun_cevaplari') {
      if (method === 'POST') {
        if (!cevaplar.some((c) => c.deneme_id === opt.body.deneme_id && c.soru_id === opt.body.soru_id)) cevaplar.push(opt.body);
        return null;
      }
      return cevaplar.filter((c) => c.oyun_id === q('oyun_id') && (!u.searchParams.get('dogru') || String(c.dogru) === q('dogru')));
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
  return { api, oyunlar, denemeler, cevaplar, ozet, cagri };
}

test('serbest: bilgi, oyun kurma, yalnız sahibi oynar, çalışma akışı ve sonuç', async () => {
  const s = sahte();
  const b = await s.api.ogrenci(ali, { op: 'serbest-bilgi' });
  assert.equal(b.seri, 3);
  assert.deepEqual(s.cagri.find((c) => c.yol === 'POST rpc/oyun_serbest_bilgi')!.govde, { p_kurum: 'k1', p_student: 's1', p_sinif: 8 });

  await assert.rejects(s.api.ogrenci(ali, { op: 'serbest-baslat', mod: 'hile', ders: 'Fen Bilimleri' }), /türünü/);
  await assert.rejects(s.api.ogrenci(ali, { op: 'serbest-baslat', mod: 'cark', ders: 'Fen Bilimleri' }), /yeterli kelime/);
  const r = await s.api.ogrenci(ali, { op: 'serbest-baslat', mod: 'calisma', ders: 'Fen Bilimleri', konu: 'Basınç', zorluk: 'kolay', adet: 99 });
  assert.equal(r.oyun.mod, 'calisma');
  const row = s.oyunlar[0];
  assert.equal(row.kapsam, 'serbest');
  assert.equal(row.student_id, 's1');
  assert.equal(row.olusturan, null);
  assert.equal(row.ad, 'Fen Bilimleri · Basınç');
  assert.deepEqual(row.ayar, { ders: 'Fen Bilimleri', konu: 'Basınç', zorluk: 'kolay', adet: 20, mod: 'calisma' });
  assert.deepEqual(s.ozet[0].son_ayar, row.ayar);
  // sayı sınırı sunucuda: 99 istendi, en çok 20 seçilir
  assert.equal(s.cagri.filter((c) => c.yol === 'POST rpc/oyun_serbest_sec').pop()!.govde.p_adet, 20);

  // başka öğrenci kendi adına imzalı bağlantıyla bile bu oyunu oynayamaz; sonucunu da göremez
  await assert.rejects(s.api.play({ op: 'basla', token: o.makeToken(o.linkKey('gizli'), row.id, 's2'), studentId: 's2' }), (e: any) => e.status === 403);
  await assert.rejects(s.api.ogrenci(ayse, { op: 'serbest-sonuc', oyunId: row.id }), /bulunamadı/);

  let g = await s.api.play({ op: 'basla', token: r.token, studentId: 's1' });
  assert.equal(g.tur, 'calisma');
  await assert.rejects(s.api.ogrenci(ali, { op: 'serbest-sonuc', oyunId: row.id }), /bitmedi/);
  // ilk soru yanlış, diğerleri doğru; sonra tekrar sorusu
  const dn = () => s.denemeler[0];
  for (let n = 1; ; n++) {
    const d = dn().durum_json;
    const id = d.sira[d.i];
    const yanlis = n === 1 || n === 4;
    const sec = yanlis ? yanlisSik(d, id) : dogruSik(d, id);
    const c = await s.api.play({ op: 'cevap', token: r.token, studentId: 's1', no: n, secim: sec });
    if (c.bitti) break;
    g = await s.api.play({ op: 'durum', token: r.token, studentId: 's1' });
    assert.ok(n < 10);
  }
  assert.equal(dn().durum, 'bitti');
  assert.equal(dn().dogru, 2);
  assert.equal(s.cevaplar.length, 3);

  const son = await s.api.ogrenci(ali, { op: 'serbest-sonuc', oyunId: row.id });
  assert.deepEqual(son.sonuc, { puan: 0, dogru: 2, toplam: 3 });
  assert.equal(son.yanlislar.length, 1);
  const q = QS.find((x) => x.metin === son.yanlislar[0].metin)!;
  assert.equal(son.yanlislar[0].dogru, q.siklar[q.dogru]);
  assert.equal(son.seri, 4);
  assert.deepEqual(son.yeniRozetler, [{ rozet: 'ilk_adim', detay: null }]);
  // Aşama 397: gelişim
  const gl = await s.api.ogrenci(ali, { op: 'gelisim' });
  assert.equal(gl.toplamDogru, 12);
  assert.deepEqual(s.cagri.find((c) => c.yol === 'POST rpc/oyun_gelisim')!.govde, { p_student: 's1' });

  // yanlışları tekrar: yalnız yanlış soru, Çalışma modunda; son ayar değişmez
  const t = await s.api.ogrenci(ali, { op: 'serbest-baslat', tekrarOyunId: row.id });
  assert.equal(t.oyun.mod, 'calisma');
  assert.deepEqual(s.oyunlar[1].sorular.map((x: any) => x.id), [q.id]);
  assert.equal(s.oyunlar[1].ad, 'Fen Bilimleri · Yanlışlarım');
  assert.equal(s.ozet.length, 1);
});

test('serbest: okulda oyunlar kapalıysa ya da sınıf yoksa açılmaz', async () => {
  await assert.rejects(sahte({ oyun: false }).api.ogrenci(ali, { op: 'serbest-bilgi' }), (e: any) => e.status === 403);
  await assert.rejects(sahte().api.ogrenci({ ...ali, class_id: null }, { op: 'serbest-baslat', mod: 'quiz', ders: 'Fen' }), (e: any) => e.status === 403);
});

test('öğretmen: sınıf gelişimi yalnız görebildiği sınıfta, adlar sunucudan, çok oynayan üstte', async () => {
  const s = sahte();
  const ogretmen = { token: 'ogretmen', kurumId: 'k1', authId: 'a1', name: 'Deneme' };
  const r = await s.api.ogretmen(ogretmen, { op: 'sinif-gelisim', classId: 'c1' });
  assert.deepEqual(r.ogrenciler.map((x: any) => [x.ad, x.soru]), [['Ayşe Demir', 9], ['Ali Yılmaz', 5]]);
  assert.equal(r.zayif[0].konu, 'Basınç');
  await assert.rejects(s.api.ogretmen(ogretmen, { op: 'sinif-gelisim', classId: 'baska' }), (e: any) => e.status === 404);
  await assert.rejects(s.api.ogretmen({ ...ogretmen, token: 'yetkisiz' }, { op: 'sinif-gelisim', classId: 'c1' }), (e: any) => e.status === 403);
});
