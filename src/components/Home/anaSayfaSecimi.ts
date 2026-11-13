import { dataService } from '../../services/dataService';

// ============================================================================
// Aşama 244: hangi ana sayfa açılacak (rol / portal)
// Her öğretmen hesabı bir yeni tasarımlı ana sayfa görür (Aşama 255: eski TeacherHome kaldırıldı).
//  - 'sistem': genel yönetici kendi panelinde (kuruma geçince o kurumun sayfası açılır)
//  - 'kurum' (Aşama 245): kurum yöneticisi kaydı olan hesap — Kurum yöneticisi portalında ya da portal seçimi yoksa.
//             İdare / Öğretmen portalını seçen kurum yöneticisi o portalın ana sayfasını görür (yoneticiKaydi portala bakar).
//             Genel yönetici kuruma geçince de bu sayfa açılır.
//  - 'mudur_yrd' (Aşama 247): Müdür Yardımcısı rolü (Müdür rolü yoksa). Kurum yöneticisi de ise İdare portalında.
//  - 'mudur' (Aşama 246): Müdür rolü (rol yetkileri açık kurumda). Kurum yöneticisi de olan müdür bu sayfayı İdare portalında görür.
//  - 'ogretmen' (Aşama 248): derse giren öğretmen (rolsüz, Öğretmen ya da Zümre Başkanı). Kurum yöneticisi Öğretmen portalında.
//             İdare (kurum yöneticisi işaretli) bugünkü ana sayfada kalır; Ölçme ve yalnız Etüt Öğretmeni Aşama 253'te kendi sayfasında.
//  - 'rehberlik' (Aşama 249): Rehberlik rolü (kurum yöneticisi, Müdür, Müdür Yrd. değilse; öğretmen rolü de varsa yine bu sayfa).
//  - 'olcme' (Aşama 253): Ölçme Değerlendirme rolü (kurum yöneticisi, Müdür, Müdür Yrd., Rehberlik değilse).
//  - 'etut' (Aşama 253): yalnız Etüt Öğretmeni rolü olan hesap.
// Aşama 257: birden çok görevi olan kişi portal seçince ekran yalnız o portalın rolleriyle çalışır (dataService.portalUygula);
// bu yüzden aşağıdaki sıra seçilen portalın ana sayfasını verir (Rehberlik portalı → 'rehberlik', Öğretmen portalı → 'ogretmen').
// Kabuklu ana sayfada üst menünün bölüm satırı gizlenir: menü solda (hayalet etiketli simgeler).
// ============================================================================
export type AnaSayfaTuru = 'sistem' | 'kurum' | 'mudur' | 'mudur_yrd' | 'rehberlik' | 'olcme' | 'etut' | 'ogretmen' | null;

export function anaSayfaTuru(): AnaSayfaTuru {
  if (dataService.getAuthSession()?.role !== 'teacher') return null;
  if (dataService.isHeadAdmin()) return 'sistem';
  const k = dataService.getMyKurum();
  // Aşama 258: bireysel (koçluk) hesabı: kişi kurumunun yöneticisi olsa da işi öğretmenliktir
  if (k.loaded && k.supported && dataService.isBireysel()) return 'ogretmen';
  if (k.loaded && k.supported && k.kurumId && dataService.yoneticiKaydi(dataService.getCurrentTeacher())) return 'kurum';
  if (k.loaded && k.supported && k.kurumId && dataService.hasRole('mudur')) return 'mudur';
  if (k.loaded && k.supported && k.kurumId && dataService.hasRole('mudur_yardimcisi')) return 'mudur_yrd';
  if (k.loaded && k.supported && k.kurumId && !dataService.isKurumAdmin() && dataService.hasRole('rehberlik')) return 'rehberlik';
  if (k.loaded && k.supported && k.kurumId && !dataService.isKurumAdmin() && dataService.hasRole('olcme_degerlendirme')) return 'olcme';
  if (k.loaded && k.supported && k.kurumId && dataService.roleEtutOnly()) return 'etut';
  if (
    k.loaded &&
    k.supported &&
    k.kurumId &&
    !dataService.isKurumAdmin() &&
    !dataService.roleEtutOnly() &&
    !dataService.hasRole('rehberlik') &&
    !dataService.hasRole('olcme_degerlendirme') &&
    dataService.roleCanTeach()
  )
    return 'ogretmen';
  // Aşama 255: eski ana sayfa (TeacherHome) kaldırıldı. Kurum bilgisi geldiyse yukarıdakilere uymayan her öğretmen hesabı
  // (sistem sahibinin kendi alanındaki kurumsuz öğretmenler dahil) öğretmen ana sayfasını görür; o sayfa yalnız açık bölümleri çizer.
  if (k.loaded) return 'ogretmen';
  return null; // kurum bilgisi henüz gelmedi: App bekleme ekranı gösterir
}
