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
