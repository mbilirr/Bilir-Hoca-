import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hataMetniniBol, eskiBildirimCevir } from '../src/lib/bildirim';

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

// Aşama 353: sayfa içi eski geçici yazıların bütün biçimleri ortak bildirime çevrilir
test('boş yazı bildirim değildir', () => {
  assert.equal(eskiBildirimCevir(null), null);
  assert.equal(eskiBildirimCevir(''), null);
  assert.equal(eskiBildirimCevir({ tone: 'success', text: '  ' }), null);
});

test('ton adları doğru türe gider', () => {
  assert.equal(eskiBildirimCevir({ tone: 'success', text: 'Kaydedildi.' })?.tur, 'basari');
  assert.equal(eskiBildirimCevir({ type: 'ok', text: 'Tamam.' })?.tur, 'basari');
  assert.equal(eskiBildirimCevir({ tone: 'danger', text: 'Kaydedilemedi.' })?.tur, 'hata');
  assert.equal(eskiBildirimCevir({ type: 'err', text: 'Olmadı.' })?.tur, 'hata');
  assert.equal(eskiBildirimCevir({ ton: 'bad', text: 'Olmadı.' })?.tur, 'hata');
  assert.equal(eskiBildirimCevir({ tip: 'hata', yazi: 'Olmadı.' })?.tur, 'hata');
  assert.equal(eskiBildirimCevir({ ok: false, text: 'Açılamadı.' })?.tur, 'hata');
  assert.equal(eskiBildirimCevir({ t: 'Plana eklendi.', err: false })?.tur, 'basari');
  assert.equal(eskiBildirimCevir({ tone: 'warning', text: '2 e-posta gönderilemedi.' })?.tur, 'bilgi');
  assert.equal(eskiBildirimCevir({ tone: 'info', text: 'E-postalar gönderiliyor…' })?.tur, 'bilgi');
});

test('düz yazıda hata ve sürüyor yazısı tanınır', () => {
  assert.equal(eskiBildirimCevir('Öğretmen eklendi.')?.tur, 'basari');
  assert.equal(eskiBildirimCevir('Kayıt silinemedi.')?.tur, 'hata');
  assert.equal(eskiBildirimCevir('Yükleniyor…')?.tur, 'bilgi');
});

test('satır listesi başlık + ayrıntı olur', () => {
  const r = eskiBildirimCevir({ tone: 'success', lines: ['Duyuru gönderildi.', '12 veli', '2 SMS'] });
  assert.equal(r?.baslik, 'Duyuru gönderildi.');
  assert.equal(r?.ayrinti, '12 veli · 2 SMS');
});

test('uzun başarı yazısı ilk cümle + ayrıntıya bölünür', () => {
  const r = eskiBildirimCevir('Etüt kaydedildi. E-postalar etüt gününde otomatik gönderilecek (saat girilmişse 1 saat önce).');
  assert.equal(r?.baslik, 'Etüt kaydedildi.');
  assert.match(r?.ayrinti || '', /otomatik gönderilecek/);
});
