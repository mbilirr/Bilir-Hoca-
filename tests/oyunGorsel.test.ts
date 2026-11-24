import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore — sunucu dosyası düz JavaScript
import * as o from '../api/_oyun.js';
import { tahtaKur } from '../src/components/Teacher/oyunlar/tahta/kurallar';
import { yalnizHarf } from '../src/components/Public/oyun/istek';

// Aşama 393: görselli soru — şıklar resimdeki sırada kalır, görsel kimliği soruyla gelir
const G = '0f0e0d0c-0b0a-4909-8807-060504030201';
const SORULAR = [
  { id: 'g', tur: 'coktan', metin: 'Görselli', siklar: ['A', 'B', 'C', 'D'], dogru: 2, gorsel_id: G },
  { id: 'd', tur: 'coktan', metin: 'Düz', siklar: ['a', 'b', 'c', 'd'], dogru: 1 },
];
let tohum = 7;
const rnd = () => ((tohum = (tohum * 16807) % 2147483647) / 2147483647);

test('quiz: görselli soruda şık sırası değişmez, görsel kimliği sunulur', () => {
  for (let k = 0; k < 20; k++) {
    const d = o.quizBaslat(SORULAR, rnd);
    assert.deepEqual(d.sik.g, [0, 1, 2, 3]);
  }
  let d = o.quizBaslat(SORULAR, () => 0);
  d = { ...d, sira: ['g', 'd'] };
  const r = o.quizSoru(d, SORULAR, 20, 1000);
  assert.equal(r.soru.gorselId, G);
  assert.deepEqual(r.soru.siklar, ['A', 'B', 'C', 'D']);
  const c = o.quizCevapla(r.durum, SORULAR, 1, 2, 20, 2000);
  assert.equal(c.sonuc.dogru, true);
  const r2 = o.quizSoru(c.durum, SORULAR, 20, 3000);
  assert.equal(r2.soru.gorselId, null);
});

test('tahta: görselli soruda şıklar karışmaz, görsel kimliği taşınır', () => {
  const t = tahtaKur('grup', ['A', 'B'], SORULAR.map((s) => ({ ...s, gorselId: s.gorsel_id })), rnd);
  const g = t.sorular.find((s) => s.id === 'g')!;
  assert.deepEqual(g.siklar, ['A', 'B', 'C', 'D']);
  assert.equal(g.dogru, 2);
  assert.equal(g.gorselId, G);
  assert.equal('gorselId' in t.sorular.find((s) => s.id === 'd')!, false);
});

test('yalnız harf şıkları tanınır', () => {
  assert.equal(yalnizHarf(['A', 'B', 'C', 'D']), true);
  assert.equal(yalnizHarf([' a', 'b ', 'C', 'd']), true);
  assert.equal(yalnizHarf(['A', 'B', 'D', 'C']), false);
  assert.equal(yalnizHarf(['A) 12', 'B', 'C', 'D']), false);
  assert.equal(yalnizHarf(['A', 'B', 'C']), false);
});
