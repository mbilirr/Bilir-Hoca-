import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXCEL_BASLIKLAR, EXCEL_ORNEK, EXCEL_EN_COK, excelSorulariCoz } from '../src/lib/oyunExcel';

// Aşama 395: Excel ile toplu soru yükleme kuralları
const bas = [...EXCEL_BASLIKLAR];
const s = (n: number, ek: Partial<Record<number, string>> = {}) => {
  const h = [`Soru ${n} nedir?`, 'bir', 'iki', 'üç', 'dört', 'B', '', 'Kolay', ''];
  for (const [i, v] of Object.entries(ek)) h[Number(i)] = v as string;
  return h;
};

test('şablonun örnek satırı geçerli', () => {
  const r = excelSorulariCoz([bas, EXCEL_ORNEK], 'Fen Bilimleri', 8);
  assert.equal(r.hatali.length, 0);
  assert.equal(r.gecerli.length, 1);
  assert.equal(r.gecerli[0].dogru, 0);
  assert.equal(r.gecerli[0].zorluk, 'orta');
  assert.equal(r.gecerli[0].sinif, 8);
});

test('başlıklar serbest sırada ve Türkçe karakter / büyük harf farkıyla okunur', () => {
  const r = excelSorulariCoz([['DOĞRU', 'd', 'c', 'b', 'a', 'SORU'], ['c', 'dört', 'üç', 'iki', 'bir', 'Soru x?']], 'Matematik', null);
  assert.equal(r.eksikSutunlar.length, 0);
  assert.equal(r.gecerli[0].siklar.join(), 'bir,iki,üç,dört');
  assert.equal(r.gecerli[0].dogru, 2);
});

test('doğru cevap harf, sayı ya da şık metniyle yazılabilir', () => {
  const t = [bas, s(1, { 5: 'c' }), s(2, { 5: '4' }), s(3, { 5: 'iki' }), s(4, { 5: 'B şıkkı' })];
  const r = excelSorulariCoz(t, 'Fen', null);
  assert.deepEqual(r.gecerli.map((x) => x.dogru), [2, 3, 1, 1]);
});

test('hatalı satırlar nedenleriyle ayrılır, boş satır sayılmaz', () => {
  const t = [bas, s(1), ['', '', '', '', '', '', '', '', ''], s(2, { 5: 'E' }), s(3, { 7: 'Çok zor' }), s(4, { 2: 'bir' }), s(1)];
  const r = excelSorulariCoz(t, 'Fen', null);
  assert.equal(r.gecerli.length, 1);
  assert.deepEqual(r.hatali.map((x) => x.satir), [4, 5, 6, 7]);
  assert.match(r.hatali[0].hata!, /A, B, C ya da D/);
  assert.match(r.hatali[1].hata!, /Zorluk/);
  assert.match(r.hatali[2].hata!, /farklı/);
  assert.match(r.hatali[3].hata!, /iki kez/);
});

test('eksik sütun ve satır sınırı', () => {
  const e = excelSorulariCoz([['Soru', 'A', 'B'], ['x', 'y', 'z']], 'Fen', null);
  assert.deepEqual(e.eksikSutunlar, ['C', 'D', 'Doğru']);
  assert.equal(e.gecerli.length, 0);
  const cok = excelSorulariCoz([bas, ...Array.from({ length: EXCEL_EN_COK + 20 }, (_, i) => s(i))], 'Fen', null);
  assert.equal(cok.gecerli.length, EXCEL_EN_COK);
  assert.equal(cok.kesildi, true);
});
