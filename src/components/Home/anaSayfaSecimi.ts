import { dataService } from '../../services/dataService';

// ============================================================================
// Aşama 244: hangi ana sayfa açılacak (rol / portal)
// Yeni tasarımlı ana sayfalar sırayla eklenir; listede olmayan hesap bugünkü ana sayfayı (TeacherHome) görür.
//  - 'sistem': genel yönetici kendi panelinde (kuruma geçince o kurumun sayfası açılır)
//  - 'kurum' (Aşama 245): kurum yöneticisi kaydı olan hesap — Kurum yöneticisi portalında ya da portal seçimi yoksa.
//             İdare / Öğretmen portalını seçen kurum yöneticisi o portalın ana sayfasını görür (yoneticiKaydi portala bakar).
//             Genel yönetici kuruma geçince de bu sayfa açılır.
// Kabuklu ana sayfada üst menünün bölüm satırı gizlenir: menü solda (hayalet etiketli simgeler).
// ============================================================================
export type AnaSayfaTuru = 'sistem' | 'kurum' | null;

export function anaSayfaTuru(): AnaSayfaTuru {
  if (dataService.getAuthSession()?.role !== 'teacher') return null;
  if (dataService.isHeadAdmin()) return 'sistem';
  const k = dataService.getMyKurum();
  if (k.loaded && k.supported && k.kurumId && dataService.yoneticiKaydi(dataService.getCurrentTeacher())) return 'kurum';
  return null;
}
