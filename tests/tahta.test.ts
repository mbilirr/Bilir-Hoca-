import { test } from 'node:test';
import assert from 'node:assert/strict';
import { puanHesapla, siralama, tahtaCevap, tahtaKapat, tahtaKur, tahtaSonraki } from '../src/components/Teacher/oyunlar/tahta/kurallar';

// Aşama 383: tahtada Düello / Grup kuralları
const SORULAR = [0, 1, 2, 3].map((i) => ({ id: 's' + i, metin: 'Soru ' + i, siklar: ['a' + i, 'b' + i, 'c' + i, 'd' + i], dogru: i % 4, aciklama: '' }));
const sabit = () => 0.42;

test('tahta: şıklar karışsa da doğru şık izlenir; eksik soru alınmaz', () => {
  const d = tahtaKur('duello', ['A', 'B'], [...SORULAR, { id: 'x', metin: 'bozuk', siklar: ['1', '2'], dogru: 0 }], sabit);
  assert.equal(d.sorular.length, 4);
  for (const s of d.sorular) {
    const asil = SORULAR.find((x) => x.id === s.id)!;
    assert.equal(s.siklar[s.dogru], asil.siklar[asil.dogru]);
  }
  assert.equal(tahtaKur('grup', ['A', 'B'], []).asama, 'bitti');
});

test('düello: yanlış cevaplayan kilitlenir, ilk doğru puanı alır, ikisi de yanlışsa soru kapanır', () => {
  let d = tahtaKur('duello', ['Mavi', 'Kırmızı'], SORULAR, sabit);
  const s = d.sorular[0];
  const yanlis = (s.dogru + 1) % 4;
  d = tahtaCevap(d, 0, yanlis, 1000, 20000);
  assert.equal(d.asama, 'soru');
  assert.equal(tahtaCevap(d, 0, s.dogru, 1000, 20000), d); // kilitli takım yeniden cevaplayamaz
  d = tahtaCevap(d, 1, s.dogru, 0, 20000);
  assert.equal(d.asama, 'sonuc');
  assert.equal(d.takimlar[1].puan, 150);
  assert.equal(d.takimlar[0].puan, 0);
  assert.equal(tahtaCevap(d, 0, s.dogru, 0, 20000), d); // soru kapandı
  d = tahtaSonraki(d);
  const s2 = d.sorular[1];
  d = tahtaCevap(d, 0, (s2.dogru + 1) % 4, 0, 20000);
  d = tahtaCevap(d, 1, (s2.dogru + 2) % 4, 0, 20000);
  assert.equal(d.asama, 'sonuc');
  assert.deepEqual(d.takimlar.map((t) => t.puan), [0, 150]);
});

test('grup: sırası gelmeyen grup cevaplayamaz; tek cevap; pas; sıra döner; oyun biter', () => {
  let d = tahtaKur('grup', ['1', '2', '3'], SORULAR.slice(0, 3), sabit);
  assert.equal(tahtaCevap(d, 1, d.sorular[0].dogru, 0, 20000), d);
  d = tahtaCevap(d, 0, (d.sorular[0].dogru + 1) % 4, 0, 20000);
  assert.equal(d.asama, 'sonuc');
  assert.equal(d.takimlar[0].puan, 0);
  d = tahtaSonraki(d);
  assert.equal(d.sira, 1);
  d = tahtaKapat(d); // pas
  d = tahtaSonraki(d);
  assert.equal(d.sira, 2);
  d = tahtaCevap(d, 2, d.sorular[2].dogru, 10000, 20000);
  assert.equal(d.takimlar[2].puan, 125);
  d = tahtaSonraki(d);
  assert.equal(d.asama, 'bitti');
  assert.deepEqual(siralama(d).map((t) => t.ad), ['3', '1', '2']);
});

test('tahta: puan süreye bağlı, sınırlar içinde', () => {
  assert.equal(puanHesapla(0, 20000), 150);
  assert.equal(puanHesapla(20000, 20000), 100);
  assert.equal(puanHesapla(99999, 20000), 100);
  assert.equal(puanHesapla(-5, 20000), 150);
});
