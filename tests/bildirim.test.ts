import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hataMetniniBol } from '../src/lib/bildirim';

// Aşama 348: eski tek satırlık hata yazıları başlık + ne yapılacağı olarak bölünür
test('geri alındı yazısı ayrıntıya taşınır', () => {
  const r = hataMetniniBol('Hata: Öğrenci silinemedi (Bu işlem için yetkiniz yok). Değişiklikler geri alındı.');
  assert.equal(r.baslik, 'Öğrenci silinemedi (Bu işlem için yetkiniz yok)');
  assert.match(r.ayrinti || '', /bir daha deneyin/);
});

test('tek cümle olduğu gibi kalır', () => {
  assert.deepEqual(hataMetniniBol('Hata: Dosya açılamadı.'), { baslik: 'Dosya açılamadı.' });
});

test('iki cümle başlık + ayrıntı olur', () => {
  const r = hataMetniniBol('Diğer bilgiler kaydedildi; veli bilgileri kaydedilmedi. Supabase’de SQL çalıştırın.');
  assert.equal(r.baslik, 'Diğer bilgiler kaydedildi; veli bilgileri kaydedilmedi.');
  assert.equal(r.ayrinti, 'Supabase’de SQL çalıştırın.');
});
