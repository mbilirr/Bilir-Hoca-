import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore — sunucu dosyası düz JavaScript
import * as v from '../api/_veli.js';

// Aşama 367: veli görünümü (sunucu yardımcıları). Saf işlevler; ağ ve veritabanı yok.
const SIMDI = Date.parse('2026-11-19T11:20:00Z'); // Perşembe 14:20 (İstanbul)

test('bağlantı kodu: 22 karakter, kimlikten aynı kod, özet geri çevrilemez', () => {
  const key = v.linkKey('gizli');
  const a = v.linkToken(key, 'id-1');
  assert.equal(a.length, 22);
  assert.ok(v.isTokenShape(a));
  assert.equal(a, v.linkToken(key, 'id-1'));
  assert.notEqual(a, v.linkToken(v.linkKey('baska'), 'id-1'));
  assert.equal(v.hashToken(a).length, 64);
  assert.ok(!v.isTokenShape('kisa') && !v.isTokenShape('a'.repeat(21) + '/'));
});

test('hafta pazartesi başlar; bitiş süresi ve dönem sonu', () => {
  assert.deepEqual(v.haftalar('2026-11-19'), { bu: { bas: '2026-11-16', bit: '2026-11-22' }, gecen: { bas: '2026-11-09', bit: '2026-11-15' } });
  assert.deepEqual(v.haftalar('2026-11-16').bu.bas, '2026-11-16');
  assert.deepEqual(v.haftalar('2026-11-22').bu.bas, '2026-11-16'); // pazar
  const gun = (d: Date) => Math.round((d.getTime() - SIMDI) / 86400000);
  assert.equal(gun(v.bitisTarihi('7', SIMDI)), 7);
  assert.equal(gun(v.bitisTarihi('30', SIMDI)), 30);
  assert.equal(v.istanbulYmd(v.bitisTarihi('donem', SIMDI).getTime()), '2027-01-31');
  assert.equal(v.istanbulYmd(v.bitisTarihi('donem', Date.parse('2027-03-01T09:00:00Z')).getTime()), '2027-06-30');
  // dönem sonuna 7 günden az: 30 gün
  assert.equal(Math.round((v.bitisTarihi('donem', Date.parse('2027-06-27T09:00:00Z')).getTime() - Date.parse('2027-06-27T09:00:00Z')) / 86400000), 30);
});

test('veli sırası boş satırları atlar (veritabanı tetiğiyle aynı), maske ve kısa ad', () => {
  const l = v.veliListesi([{ name: 'Ayşe', phone: '05321112212' }, { name: ' ', phone: '' }, { relation: 'Baba', email: 'm@x.com' }, { name: 'D' }]);
  assert.equal(l.length, 3);
  assert.equal(l[1].relation, 'Baba');
  assert.equal(v.telMaske('0532 111 22 12'), '0532 *** ** 12');
  assert.equal(v.telMaske('905321112212'), '0532 *** ** 12');
  assert.equal(v.telMaske('123'), '');
  assert.equal(v.epostaMaske('ayse@gmail.com'), 'a***@gmail.com');
  assert.equal(v.kisaAd('Ali Yılmaz'), 'Ali Y.');
  assert.equal(v.kisaAd('ali can ışık'), 'ali can I.');
  assert.equal(v.kisaAd('Ali'), 'Ali');
});

test('günlük soru hedefi: genel hedef öncelikli, yoksa ders hedeflerinin toplamı', () => {
  const genel = { weekStartDate: '2026-11-16', weeklyTarget: 350, targetDays: 7 };
  const mat = { weekStartDate: '2026-11-16', weeklyTarget: 140, targetDays: 7, subject: 'Matematik' };
  const fen = { weekStartDate: '2026-11-16', weeklyTarget: 70, targetDays: 7, subject: 'Fen Bilimleri', dailyTargets: { '2026-11-17': 30 } };
  assert.equal(v.gunlukHedef('2026-11-17', [genel, mat, fen]), 50);
  assert.equal(v.gunlukHedef('2026-11-17', [mat, fen]), 20 + 30);
  assert.equal(v.gunlukHedef('2026-11-18', [mat, fen]), 20);
  assert.equal(v.gunlukHedef('2026-11-25', [mat, fen]), 0);
});

const VERI = {
  durum: 'ok',
  kurum: 'İsabet Koleji',
  ogrenci: { ad: 'Ali Yılmaz', sinif: '8/A' },
  bitis: '2026-12-22T11:15:25Z',
  kartlar: ['devam', 'odev', 'soru', 'etut', 'deneme'],
  devam: [
    { tarih: '2026-11-10', sira: 1, durum: 'late' },
    { tarih: '2026-11-16', sira: 2, durum: 'absent' },
    { tarih: '2026-11-16', sira: 1, durum: 'present' },
    { tarih: '2026-11-21', sira: 1, durum: 'present' },
  ],
  odev: [
    { baslik: 'Üslü ifadeler', ders: 'Matematik', son: '2026-11-19', verildi: '2026-11-12', teslim: 'on_time' },
    { baslik: 'Paragraf <b>', ders: 'Türkçe', son: '2026-11-18', verildi: '2026-11-17', teslim: null },
    { baslik: 'DNA', ders: 'Fen', son: '2026-11-24', verildi: '2026-11-18', teslim: null },
    { baslik: 'İleri tarihli', ders: 'Din', son: '2026-11-30', verildi: '2026-11-21', teslim: null },
    { baslik: 'Geçen hafta', ders: 'Din', son: '2026-11-13', verildi: '2026-11-10', teslim: 'late' },
  ],
  sorular: [
    { tarih: '2026-11-17', toplam: 40, dersler: [{ subject: 'Matematik', questionCount: 30 }, { subject: 'Fen Bilgisi', questionCount: 10 }] },
    { tarih: '2026-11-18', toplam: 25, dersler: [{ subject: 'Fen Bilimleri', questionCount: 25 }] },
  ],
  hedefler: [{ tur: 'student', bas: '2026-11-16', veri: { weeklyTarget: 280, targetDays: 7 } }],
  etut: [
    { ders: 'Matematik', konu: 'Kareköklü', tarih: '2026-11-18', saat: '15:30', durum: 'present' },
    { ders: 'Fen', konu: 'Basınç', tarih: '2026-11-19', saat: '15:30', durum: null },
    { ders: 'Fen', konu: 'Basınç', tarih: '2026-11-17', saat: '15:30', durum: null },
  ],
  deneme: [
    { ad: 'Turuncu 3', tarih: '2026-11-15', net: 71.25, puan: 412.6, dersler: [{ key: 'tr', name: 'Türkçe', short: 'TÜR' }, { key: 'mat', name: 'Matematik', short: 'MAT' }], netler: { tr: { net: 17 }, mat: { net: 14.33 } } },
    { ad: 'Turuncu 2', net: 60, puan: 380 },
  ],
};

test('haftalık özet: devam, ödev sırası, soru hedefi, etüt durumu, deneme', () => {
  const o = v.ozetHesapla(VERI, SIMDI);
  assert.equal(o.bu.yazi, '16–22 Kas');
  assert.deepEqual([o.bu.devam.ders, o.bu.devam.gelmedi, o.bu.devam.gec], [3, 1, 0]);
  assert.deepEqual(o.bu.devam.gunler[0].dersler, ['present', 'absent']); // ders sırasıyla
  assert.equal(o.bu.devam.gunler.length, 6); // cumartesi yoklaması olduğu için 6 gün
  assert.equal(o.gecen.devam.gec, 1);
  // ileri tarihli ödev henüz verilmedi; önce geciken, sonra bekleyen, sonra teslim
  assert.equal(o.bu.odev.toplam, 3);
  assert.deepEqual(o.bu.odev.satirlar.map((x: any) => x.yazi), ['Gecikti', 'Bekliyor', 'Teslim']);
  assert.equal(o.gecen.odev.satirlar[0].yazi, 'Geç teslim');
  assert.deepEqual([o.bu.soru.cozulen, o.bu.soru.hedef, o.bu.soru.yuzde], [65, 280, 23]);
  assert.deepEqual(o.bu.soru.enCok, ['Fen Bilimleri', 35]);
  const etut = Object.fromEntries(o.bu.etut.satirlar.map((x: any) => [x.gun, x.yazi]));
  assert.equal(etut['Çarşamba'], 'Geldi');
  assert.equal(etut['Perşembe'], 'Planlandı'); // bugün 15:30, saat 14:20
  assert.equal(etut['Salı'], 'Yoklama yok');
  assert.equal(o.deneme.onceki, 60);
  assert.deepEqual(o.deneme.dersler.map((x: any) => x.kisa), ['TÜR', 'MAT']);
});

test('sayfa: betik yok, ad kısaltılır, yazılar kaçışlı, kapalı kart çıkmaz', () => {
  const html = v.veliSayfasi(VERI, SIMDI);
  assert.ok(!/<script/i.test(html));
  assert.ok(html.includes('Ali Y.') && !html.includes('Yılmaz'));
  assert.ok(html.includes('Paragraf &lt;b&gt;'));
  assert.ok(html.includes('22 Aralık'));
  assert.ok(html.includes('Son güncelleme bugün 14:20'));
  assert.ok(!html.includes('Geçen hafta ödev yok.')); // geçen hafta ödevi var
  const yalniz = v.veliSayfasi({ ...VERI, kartlar: ['deneme'] }, SIMDI);
  assert.ok(!yalniz.includes('Devam') && !yalniz.includes('class="hafta"') && yalniz.includes('Son deneme'));
  const bos = v.veliSayfasi({ ...VERI, kartlar: [] }, SIMDI);
  assert.ok(bos.includes('gösterilecek bilgi seçmedi'));
  assert.ok(v.bilgiSayfasi('<x>', v.GECERSIZ_YAZI).includes('&lt;x&gt;'));
});

test('SMS metninde ad ve numara yok; önizleme botları sayılmaz', () => {
  const t = v.smsMetni('https://www.biliredu.com/v/AAAAAAAAAAAAAAAAAAAAAA', '2026-12-22T11:15:25Z');
  assert.ok(t.includes('/v/') && t.includes('22 Aralık'));
  assert.ok(t.length <= 160);
  assert.ok(v.onizlemeBotu('WhatsApp/2.23.20.0') && v.onizlemeBotu('facebookexternalhit/1.1'));
  assert.ok(!v.onizlemeBotu('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'));
});
