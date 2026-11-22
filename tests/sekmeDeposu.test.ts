import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sekmeDeposuVar, sekmeyeYaz, sekmedenOku, sekmedenSil, sekmeDeposunuKapat, sahipsizKayitlariSil } from '../src/lib/sekmeDeposu';

// Aşama 355: IndexedDB olmayan ortamda (eski tarayıcı, gizli mod kısıtı) depo sessizce devre dışı kalır;
// uygulama eskisi gibi buluttan okur. (Asıl gidiş-dönüş, şifre ve silme denemeleri tarayıcıda yapıldı.)
test('IndexedDB yoksa depo kapalıdır ve hiçbir işlem hata vermez', async () => {
  assert.equal(sekmeDeposuVar(), false);
  sekmeyeYaz('edu_sys_students_v6', [{ id: 's1' }]);
  sekmedenSil('edu_sys_students_v6');
  sekmeDeposunuKapat();
  await sahipsizKayitlariSil();
  const m = await sekmedenOku();
  assert.equal(m.size, 0);
});

// Aşama 365: uzun liste parça parça yazılır; okurken yalnız bütün parçaları tamam olan en son yazım kullanılır
test('parçalı yazım: tamam olan en son yazım seçilir, yarım ve eski yazımlar okunmaz', async () => {
  const { okunacakKayitlar } = await import('../src/lib/sekmeDeposu');
  const k = (id: string, ad: string, t: number, nesil?: string, parca?: number, toplam?: number) => ({ id, ad, t, nesil, parca, toplam });
  const { secilen, okunmayacaklar } = okunacakKayitlar([
    k('o:L#a:1', 'L', 10, 'a', 1, 2),
    k('o:L#a:0', 'L', 9, 'a', 0, 2), // a tamam (2/2), sıra karışık geldi
    k('o:L#b:0', 'L', 20, 'b', 0, 3), // b yarım (1/3): daha yeni ama okunmaz
    k('o:L', 'L', 5), // eski tek kayıt
    k('o:M', 'M', 30), // yalnız tek kayıt
    k('o:N#c:0', 'N', 40, 'c', 0, 2), // N yalnız yarım: hiç okunmaz
  ]);
  assert.deepEqual(secilen.get('L')!.map((x) => x.id), ['o:L#a:0', 'o:L#a:1']);
  assert.deepEqual(secilen.get('M')!.map((x) => x.id), ['o:M']);
  assert.equal(secilen.has('N'), false);
  assert.deepEqual(okunmayacaklar.sort(), ['o:L', 'o:L#b:0', 'o:N#c:0']);
});

test('parçalı yazım: tek kayıt daha yeniyse o kazanır', async () => {
  const { okunacakKayitlar } = await import('../src/lib/sekmeDeposu');
  const { secilen, okunmayacaklar } = okunacakKayitlar([
    { id: 'o:L#a:0', ad: 'L', t: 1, nesil: 'a', parca: 0, toplam: 1 },
    { id: 'o:L', ad: 'L', t: 2 },
  ]);
  assert.deepEqual(secilen.get('L')!.map((x) => x.id), ['o:L']);
  assert.deepEqual(okunmayacaklar, ['o:L#a:0']);
});
