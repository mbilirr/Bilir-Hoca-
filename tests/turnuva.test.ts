import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kisaAd, sinifSirasi, type TurnuvaSatiri } from '../src/lib/turnuvaSira';

const s = (studentId: string, classAd: string, puan: number): TurnuvaSatiri => ({ studentId, ad: studentId, classId: classAd, classAd, puan, dogru: 0, toplam: 0, oyunSayisi: 1, sira: 0 });

test('turnuva: sınıf sırası ortalama puanla; kalabalık sınıf öne geçmez, eşitlikte çok oynayan önde ve aynı sıra paylaşılır', () => {
  const l = sinifSirasi([s('a', '8/A', 300), s('b', '8/A', 100), s('c', '8/B', 250), s('d', '8/C', 200), s('e', '8/C', 200), s('f', '8/D', 200), s('g', '8/D', 200)]);
  assert.deepEqual(
    l.map((x) => [x.classAd, x.ortalama, x.oynayan, x.sira]),
    [['8/B', 250, 1, 1], ['8/A', 200, 2, 2], ['8/C', 200, 2, 2], ['8/D', 200, 2, 2]]
  );
  assert.deepEqual(sinifSirasi([]), []);
});

test('turnuva: tahtada kısa ad', () => {
  assert.equal(kisaAd('Ayşe Nur yılmaz'), 'Ayşe Nur Y.');
  assert.equal(kisaAd('Ali Y.'), 'Ali Y.');
  assert.equal(kisaAd('  Ece  '), 'Ece');
  assert.equal(kisaAd('ismail ışık'), 'ismail I.');
});
