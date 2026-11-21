// Aşama 346: şifre kuralı (339): öğrenci en az 6, personel en az 8 + harf ve rakam, yaygın şifreler reddedilir
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sifreSorunu } from '../src/lib/sifreKurali';

test('kısa şifre reddedilir', () => {
  assert.ok(sifreSorunu('ab12'));
});

test('personel: 8 karakter, harf ve rakam şart', () => {
  assert.match(String(sifreSorunu('Kx7mQ2', { personel: true })), /en az 8/);
  assert.match(String(sifreSorunu('Kxzmqwvtpl', { personel: true })), /harf ve bir rakam/);
});

test('yaygın ve ardışık şifreler reddedilir', () => {
  assert.ok(sifreSorunu('123456'));
  assert.ok(sifreSorunu('qwerty123'));
  assert.ok(sifreSorunu('galatasaray'));
});

test('güçlü şifre kabul edilir', () => {
  assert.equal(sifreSorunu('Mavi7Kalem3', { personel: true }), null);
});
