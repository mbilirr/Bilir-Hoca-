import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anahtarUygula, eklenenOku, eklenenYaz, harfSira, kutuCevir, okumaSirasi, ortusme, siklarDuzelt, yedekMetin, yeniKutular } from '../src/lib/oyunKitap';

// Aşama 407: kitaptan soru ekleme yardımcıları (saf; ağ ve tarayıcı yok)

test('kutuCevir: [üst, sol, alt, sağ] 0-1000 → oran; bozuk kutu null', () => {
  assert.deepEqual(kutuCevir([100, 50, 400, 500]), { x: 0.05, y: 0.1, w: 0.45, h: 0.3 });
  assert.deepEqual(kutuCevir([0, 0, 1200, 1000]), { x: 0, y: 0, w: 1, h: 1 }); // sınır dışı kırpılır
  assert.equal(kutuCevir([100, 100, 110, 500]), null); // çok ince
  assert.equal(kutuCevir([400, 50, 100, 500]), null); // ters
  assert.equal(kutuCevir([1, 2, 3]), null);
  assert.equal(kutuCevir('x'), null);
});

test('ortusme ve yeniKutular: yarıdan çok örtüşen kutu eklenmez', () => {
  const a = { x: 0, y: 0, w: 0.5, h: 0.2 };
  assert.equal(ortusme(a, { x: 0.6, y: 0, w: 0.3, h: 0.2 }), 0);
  assert.ok(ortusme(a, { x: 0.05, y: 0.02, w: 0.4, h: 0.15 }) > 0.9);
  const gelen = [
    { kutu: { x: 0.02, y: 0.01, w: 0.46, h: 0.18 }, no: 1 }, // var olanla aynı
    { kutu: { x: 0, y: 0.3, w: 0.5, h: 0.2 }, no: 2 },
    { kutu: { x: 0.01, y: 0.31, w: 0.48, h: 0.19 }, no: 2 }, // kendi içinde tekrar
  ];
  assert.deepEqual(
    yeniKutular([a], gelen).map((x) => x.no),
    [2]
  );
});

test('okumaSirasi: önce sol sütun yukarıdan aşağı, sonra sağ sütun', () => {
  const l = [
    { kutu: { x: 0.55, y: 0.1, w: 0.4, h: 0.2 }, no: 3 },
    { kutu: { x: 0.05, y: 0.5, w: 0.4, h: 0.2 }, no: 2 },
    { kutu: { x: 0.05, y: 0.1, w: 0.4, h: 0.2 }, no: 1 },
    { kutu: { x: 0.55, y: 0.6, w: 0.4, h: 0.2 }, no: 4 },
  ];
  assert.deepEqual(
    okumaSirasi(l).map((x) => x.no),
    [1, 2, 3, 4]
  );
});

test('anahtarUygula: yalnız numarası eşleşen ve şıkkı boş taslağa; E ve bozuk harf atlanır', () => {
  const t = [
    { id: 'a', no: 1, dogru: null },
    { id: 'b', no: 2, dogru: 3 }, // öğretmen seçmiş: değişmez
    { id: 'c', no: null, dogru: null }, // numarasız: değişmez
    { id: 'd', no: 4, dogru: null },
    { id: 'e', no: 5, dogru: null },
  ];
  const { liste, uygulanan } = anahtarUygula(t, [
    { no: 1, cevap: 'c' },
    { no: 2, cevap: 'A' },
    { no: 4, cevap: 'E' },
    { no: 5, cevap: 'B' },
    { no: 5, cevap: 'D' }, // aynı numara ikinci kez: ilki geçerli
  ]);
  assert.equal(uygulanan, 2);
  assert.deepEqual(
    liste.map((x) => x.dogru),
    [2, 3, null, null, 1]
  );
  assert.equal(harfSira('d'), 3);
  assert.equal(harfSira(''), -1);
});

test('siklarDuzelt ve yedekMetin', () => {
  assert.deepEqual(siklarDuzelt(['Su', 'Hava', 'Toprak', 'Ateş']), ['Su', 'Hava', 'Toprak', 'Ateş']);
  assert.deepEqual(siklarDuzelt(['Su', '', 'Toprak', 'Ateş']), ['A', 'B', 'C', 'D']); // biri okunamadı (şekil)
  assert.deepEqual(siklarDuzelt(['Su', 'su', 'Toprak', 'Ateş']), ['A', 'B', 'C', 'D']); // aynı şık
  assert.deepEqual(siklarDuzelt(undefined), ['A', 'B', 'C', 'D']);
  assert.equal(yedekMetin('5. SINIF FEN.pdf', 12, 3), '5. SINIF FEN · sayfa 12 · 3. soru');
  assert.equal(yedekMetin('', 4, null), 'Kitap · sayfa 4');
});

test('eklenenOku / eklenenYaz: sayfa başına kutular gidip gelir, bozuk kayıt atlanır', () => {
  const m = new Map([[12, [{ x: 0.1, y: 0.2, w: 0.3333333, h: 0.4 }]]]);
  const y = eklenenYaz(m);
  assert.deepEqual(y, { '12': [[0.1, 0.2, 0.3333, 0.4]] });
  assert.deepEqual([...eklenenOku(y)], [[12, [{ x: 0.1, y: 0.2, w: 0.3333, h: 0.4 }]]]);
  assert.equal(eklenenOku({ x: [[0, 0, 1, 1]], '3': [[0, 0, 2, 1], 'a'], '-1': [[0, 0, 1, 1]] }).size, 0);
  assert.equal(eklenenOku(null).size, 0);
});
