import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore — sunucu dosyası düz JavaScript
import * as o from '../api/_oyun.js';

// Aşama 398: Hafıza (eşleştirme) kuralları. Ağ ve veritabanı yok.
const S = [
  { id: 'a', tur: 'kelime', metin: 'Canlının en küçük birimi', cevap: 'hücre', kazanim_kodu: 'F.6.1' },
  { id: 'b', tur: 'kelime', metin: 'Bitkinin besin ürettiği olay', cevap: 'fotosentez', kazanim_kodu: null },
  { id: 'c', tur: 'kelime', metin: 'Kalıtım maddesi', cevap: 'dna', kazanim_kodu: null },
];
const sabit = () => 0.42;
const yer = (d: any, sid: string, y: 'i' | 'k') => d.kartlar.indexOf(`${sid}|${y}`);

test('hafıza: kartlar kapalı gelir, yazı yalnız açılınca', () => {
  const d = o.hafizaBaslat(S, sabit);
  assert.equal(d.kartlar.length, 6);
  const g = o.hafizaGorunum(d, S);
  assert.equal(g.cift, 3);
  assert.ok(g.kartlar.every((k: any) => k.durum === 'kapali' && k.metin === undefined && k.tur === undefined));
  const r = o.hafizaAc(d, S, yer(d, 'a', 'k'));
  assert.equal(r.olay.tur, 'ilk');
  assert.equal(r.olay.kart.metin, 'HÜCRE');
  const g2 = o.hafizaGorunum(r.durum, S);
  assert.equal(g2.kartlar.filter((k: any) => k.durum === 'acik').length, 1);
  // aynı kart iki kez açılamaz, geçersiz kart reddedilir
  assert.ok(o.hafizaAc(r.durum, S, yer(d, 'a', 'k')).hata);
  assert.ok(o.hafizaAc(r.durum, S, 99).hata);
  assert.ok(o.hafizaAc(r.durum, S, 'x').hata);
});

test('hafıza: eşleşme puanı, yanlış düşer, bitince bitti', () => {
  let d = o.hafizaBaslat(S, sabit);
  // ilk deneme doğru: 100 puan, bilindi
  d = o.hafizaAc(d, S, yer(d, 'a', 'i')).durum;
  let r = o.hafizaAc(d, S, yer(d, 'a', 'k'));
  assert.equal(r.olay.tur, 'eslesti');
  assert.deepEqual(r.kayit, { soruId: 'a', kazanim: 'F.6.1', dogru: true, puan: 100, sureMs: 0 });
  d = r.durum;
  assert.ok(o.hafizaAc(d, S, yer(d, 'a', 'i')).hata, 'eşleşmiş kart açılamaz');
  // b ile c iki kez karıştırılır → ikisi de 2 yanlış
  for (let i = 0; i < 2; i++) {
    d = o.hafizaAc(d, S, yer(d, 'b', 'i')).durum;
    r = o.hafizaAc(d, S, yer(d, 'c', 'k'));
    assert.equal(r.olay.tur, 'yanlis');
    assert.equal(r.olay.kartlar.length, 2);
    assert.equal(r.kayit, undefined);
    d = r.durum;
  }
  assert.equal(d.secili, null);
  assert.equal(d.hamle, 3);
  d = o.hafizaAc(d, S, yer(d, 'b', 'k')).durum;
  r = o.hafizaAc(d, S, yer(d, 'b', 'i'));
  assert.equal(r.kayit.puan, 60);
  assert.equal(r.kayit.dogru, false, '2 yanlıştan sonra bilinmemiş sayılır');
  d = r.durum;
  assert.equal(o.hafizaBitti(d, S), false);
  const b = o.hafizaBitir(d, S);
  assert.equal(o.hafizaBitti(b.durum, S), true);
  assert.deepEqual(b.kayitlar.map((k: any) => [k.soruId, k.dogru, k.puan]), [['c', false, 0]]);
});

test('hafıza: puan tabanın altına inmez; tür ve birim tek yerden', () => {
  let d = o.hafizaBaslat(S, sabit);
  for (let i = 0; i < 6; i++) {
    d = o.hafizaAc(d, S, yer(d, 'a', 'i')).durum;
    d = o.hafizaAc(d, S, yer(d, 'b', 'k')).durum;
  }
  d = o.hafizaAc(d, S, yer(d, 'a', 'i')).durum;
  assert.equal(o.hafizaAc(d, S, yer(d, 'a', 'k')).kayit.puan, o.HAFIZA_TABAN);
  assert.equal(o.MOD_TUR.hafiza, 'kelime');
  assert.equal(o.modBirim('hafiza'), 'kelime');
  assert.equal(o.modBirim('quiz'), 'soru');
  assert.deepEqual(o.OGRETMEN_LIM.hafiza, o.HAFIZA_CIFT);
  assert.ok(o.SERBEST_MODLAR.includes('hafiza'));
});
