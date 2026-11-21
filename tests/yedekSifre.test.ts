// Aşama 346: şifreli yedek dosyası (345) — paketle / aç, yanlış parola, bozuk ve yabancı dosya
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sifreliAc, sifreliPaketle, yedekParolaHatasi } from '../src/lib/yedekSifre';

const PAROLA = 'deneme parolası 1';

test('paketlenen dosyalar aynen geri açılır', async () => {
  const xl = crypto.getRandomValues(new Uint8Array(4096));
  const js = new TextEncoder().encode(JSON.stringify({ ogrenci: 'Ğüşİöç Ali', not: 87 }));
  const paket = await sifreliPaketle(
    [
      { ad: 'y.xlsx', tur: 'x', veri: xl },
      { ad: 'y.json', tur: 'application/json', veri: js },
    ],
    PAROLA
  );
  const r = await sifreliAc(paket, PAROLA);
  assert.deepEqual(r.dosyalar.map((d) => d.ad), ['y.xlsx', 'y.json']);
  assert.deepEqual(Array.from(r.dosyalar[0].veri), Array.from(xl));
  assert.equal(new TextDecoder().decode(r.dosyalar[1].veri), new TextDecoder().decode(js));
});

test('dosyada öğrenci bilgisi açık yazı olarak geçmez', async () => {
  const js = new TextEncoder().encode('GIZLI_OGRENCI_ADI');
  const paket = await sifreliPaketle([{ ad: 'y.json', tur: 'application/json', veri: js }], PAROLA);
  const metin = new TextDecoder().decode(new Uint8Array(await paket.arrayBuffer()));
  assert.ok(!metin.includes('GIZLI_OGRENCI_ADI'));
});

test('yanlış parola, bozulmuş ve yabancı dosya reddedilir', async () => {
  const paket = await sifreliPaketle([{ ad: 'a.json', tur: 'application/json', veri: new Uint8Array([1, 2, 3]) }], PAROLA);
  await assert.rejects(sifreliAc(paket, 'baska parola 12'), /Parola yanlış/);
  const b = new Uint8Array(await paket.arrayBuffer());
  b[b.length - 3] ^= 1;
  await assert.rejects(sifreliAc(new Blob([b]), PAROLA), /Parola yanlış ya da dosya bozulmuş/);
  await assert.rejects(sifreliAc(new Blob(['merhaba']), PAROLA), /şifreli yedeği değil/);
});

test('parola kuralı', () => {
  assert.match(String(yedekParolaHatasi('kisa', 'kisa')), /en az 10/);
  assert.match(String(yedekParolaHatasi('uzun parola 1', 'uzun parola 2')), /aynı değil/);
  assert.equal(yedekParolaHatasi('uzun parola 1', 'uzun parola 1'), null);
});
