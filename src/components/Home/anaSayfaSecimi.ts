import { dataService } from '../../services/dataService';

// ============================================================================
// Aşama 244: hangi ana sayfa açılacak (rol / portal)
// Yeni tasarımlı ana sayfalar sırayla eklenir; listede olmayan hesap bugünkü ana sayfayı (TeacherHome) görür.
//  - 'sistem': genel yönetici kendi panelinde (kuruma geçince o kurumun sayfası açılır)
// Kabuklu ana sayfada üst menünün bölüm satırı gizlenir: menü solda (hayalet etiketli simgeler).
// ============================================================================
export type AnaSayfaTuru = 'sistem' | null;

export function anaSayfaTuru(): AnaSayfaTuru {
  if (dataService.getAuthSession()?.role !== 'teacher') return null;
  if (dataService.isHeadAdmin()) return 'sistem';
  return null;
}
