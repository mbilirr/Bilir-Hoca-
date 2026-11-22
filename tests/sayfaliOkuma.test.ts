import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keysetIleOku, siralaSutunaGore } from '../src/lib/sayfaliOkuma';

// Aşama 356: sahte tablo (kimlik sırasıyla); sayfa getiren işlev "son kimlikten sonra" en çok n satır verir
const tablo = (n: number) => Array.from({ length: n }, (_, i) => ({ id: 'k' + String(i).padStart(6, '0'), date: `2026-11-${String(1 + (i % 28)).padStart(2, '0')}` }));
const getir = (rows: any[], sayfa: number, istekler: unknown[]) => async (son: unknown) => {
  istekler.push(son);
  const kalan = son === null ? rows : rows.filter((r) => r.id > (son as string));
  return { data: kalan.slice(0, sayfa), error: null };
};

test('bütün satırlar eksiksiz ve tekrarsız gelir', async () => {
  const rows = tablo(2503);
  const ist: unknown[] = [];
  const r = await keysetIleOku(getir(rows, 1000, ist), 1000, 100000);
  assert.equal(r.data!.length, 2503);
  assert.equal(new Set(r.data!.map((x) => x.id)).size, 2503);
  assert.deepEqual(ist, [null, 'k000999', 'k001999']);
});

test('tam sayfa katında son boş sayfa okunup durulur', async () => {
  const ist: unknown[] = [];
  const r = await keysetIleOku(getir(tablo(2000), 1000, ist), 1000, 100000);
  assert.equal(r.data!.length, 2000);
  assert.equal(ist.length, 3);
});

test('okuma sürerken önceki sayfadan satır silinse de kayıt kaçmaz', async () => {
  const rows = tablo(2500);
  let ilk = true;
  const r = await keysetIleOku(
    async (son) => {
      if (!ilk) rows.splice(10, 1); // ilk sayfadan sonra baştaki bir satır silinir
      ilk = false;
      const kalan = son === null ? rows : rows.filter((x) => x.id > (son as string));
      return { data: kalan.slice(0, 1000), error: null };
    },
    1000,
    100000
  );
  // atla-al (offset) bu durumda k001000'ı atlardı
  assert.ok(r.data!.some((x) => x.id === 'k001000'));
  assert.equal(r.data!.length, 2500);
});

test('hata olursa veri dönmez', async () => {
  const r = await keysetIleOku(async () => ({ data: null, error: { message: 'x' } }), 1000, 100000);
  assert.equal(r.data, null);
  assert.ok(r.error);
});

test('kimlik sütunu yoksa eski yola geçilmesi istenir', async () => {
  const rows = Array.from({ length: 1000 }, (_, i) => ({ ad: 'a' + i }));
  const r = await keysetIleOku(async () => ({ data: rows, error: null }), 1000, 100000);
  assert.equal(r.eksikKimlik, true);
  assert.equal(r.data!.length, 1000);
});

test('sıralama veritabanıyla aynı: tarih azalan, eşitse kimlik artan, boş değer başta', () => {
  const rows = [
    { id: 'b', date: '2026-11-02' },
    { id: 'a', date: '2026-11-02' },
    { id: 'c', date: null },
    { id: 'd', date: '2026-11-05' },
  ];
  assert.deepEqual(siralaSutunaGore(rows.slice(), 'date', false).map((r) => r.id), ['c', 'd', 'a', 'b']);
  assert.deepEqual(siralaSutunaGore(rows.slice(), 'date', true).map((r) => r.id), ['a', 'b', 'd', 'c']);
  assert.deepEqual(siralaSutunaGore(rows.slice(), undefined).map((r) => r.id), ['b', 'a', 'c', 'd']);
});

test('zaman damgasında kesir hanesi farklı olsa da sıra doğru', () => {
  const rows = [
    { id: '1', created_at: '2026-11-22T10:00:00.5+00:00' },
    { id: '2', created_at: '2026-11-22T10:00:00+00:00' },
    { id: '3', created_at: '2026-11-22T10:00:00.123+00:00' },
  ];
  assert.deepEqual(siralaSutunaGore(rows, 'created_at', true).map((r) => r.id), ['2', '3', '1']);
});
