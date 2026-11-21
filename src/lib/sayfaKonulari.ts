import type { VeriKonusu } from '../services/dataService';

/**
 * Aşama 349b: açık sayfanın okuduğu sık değişen veriler. Ana kabuk (App) bir değişiklik bildirimi gelince
 * yalnız açık sayfanın konusuna değiyorsa ekranı yeniden çizer; örneğin Ödevler sayfası açıkken bir öğrencinin
 * soru kaydı gelirse hiçbir şey yeniden çizilmez (sayfaya geçilince en güncel hâli çizilir).
 *
 * Tablo elle yazılır ama `npm run denetim:konu` (CI'da da çalışır) her sayfanın içe aktardığı bütün dosyaları
 * tarayıp okunan veriyle karşılaştırır: sayfa yeni bir veri okumaya başlar da buraya yazılmazsa denetim düşer.
 * Tabloda olmayan sayfa her değişiklikte yeniden çizilir (eskisi gibi, güvenli taraf).
 */
export const SAYFA_KONULARI: Readonly<Record<string, readonly VeriKonusu[]>> = {
  // Öğretmen / idare / yönetim bölümleri
  'sekme:home': [],
  'sekme:students': [],
  'sekme:homework': ['hedef', 'odev', 'teslim'],
  'sekme:etuts': ['etut'],
  'sekme:messages': ['etut', 'mesaj'],
  'sekme:archive': ['belge'],
  'sekme:grades': ['not', 'yoklama'],
  'sekme:question_tracking': ['hedef', 'soru'],
  'sekme:deneme': ['etut', 'hedef'],
  'sekme:akademik_takvim': [],
  'sekme:user_management': [],
  // Ana sayfalar
  'ana:sistem': [],
  'ana:kurum': ['etut', 'not', 'odev', 'teslim'],
  'ana:mudur': ['etut', 'not', 'odev', 'teslim'],
  'ana:mudur_yrd': ['etut', 'not', 'odev', 'teslim'],
  'ana:rehberlik': ['etut'],
  'ana:olcme': [],
  'ana:etut': ['etut'],
  'ana:ogretmen': ['etut', 'mesaj', 'odev', 'soru', 'teslim'],
  // Öğrenci portalı (öğrenciye yalnız kendi değişiklikleri gelir)
  ogrenci: ['etut', 'hedef', 'mesaj', 'not', 'odev', 'soru', 'teslim', 'yoklama'],
};

export function sayfaKonulari(anahtar: string): ReadonlySet<VeriKonusu> | null {
  const k = SAYFA_KONULARI[anahtar];
  return k ? new Set(k) : null;
}
