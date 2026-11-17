import type { KurumModule, TeacherTabType } from '../types';

// ============================================================================
// Aşama 302: KURUM BÖLÜMLERİ VE PORTAL TANIMLARI (veri servisinden ayrıldı, ayırmanın 4. parçası)
// Kurum bölümlerinin listesi (Ödevler, Etütler…), hangi sekmenin hangi bölüme bağlı olduğu, kurum bilgisinin biçimi
// (MyKurumState), portal adları ve her portalda geçerli roller. Yalnız sabit tanımlar ve iki küçük okuma işlevi;
// kod dataService.ts'ten kelimesi kelimesine taşındı, davranış aynıdır. Ekranlar bunları eskisi gibi
// dataService'ten de alabilir (oradan yeniden dışa verilir).
// ============================================================================
// Aşama 18: kurum bölümleri (genel yöneticinin kurumlara açıp kapattığı bölümler)
export const KURUM_MODULES: Array<{ key: KurumModule; title: string; description: string }> = [
  { key: 'homework', title: 'Ödevler', description: 'Ödev verme ve ödev kontrolü' },
  { key: 'etut', title: 'Etütler', description: 'Etüt planlama ve etüt yoklaması' },
  { key: 'questions', title: 'Soru Takibi', description: 'Soru sayıları ve öğrenciye soru hedefi verme' },
  { key: 'grades', title: 'Dersler', description: 'Ders programı, ders yoklaması ve sınav notu' } /* Aşama 220 */,
  { key: 'messages', title: 'Mesajlar', description: 'Öğrenci mesajlarını cevaplama' },
  { key: 'archive', title: 'Arşiv', description: 'Plan ve zümre evrakı yükleme' },
  { key: 'manage_students', title: 'Öğrenci ve sınıf yönetimi', description: 'Kurum yöneticisi kendi sınıf ve öğrencilerini ekler, düzenler, siler' },
  { key: 'manage_teachers', title: 'Öğretmen yönetimi', description: 'Kurum yöneticisi kendi öğretmenlerini ekler, siler ve onlara sınıf yetkisi verir' },
  { key: 'deneme', title: 'Deneme Analizi', description: 'Kurum yöneticisi optik sonuçlarını yükler, karne ve kazanım analizi çıkarır (yalnızca kurum yöneticileri)' },
  // Aşama 242: yalnız açıldığı kurumda menüde ve ana sayfada görünür (Müdür / Müdür Yrd. yükler, herkes okur)
  { key: 'akademik_takvim', title: 'Akademik takvim', description: 'Yıllık öğrenci ve veli etkinlikleri (Excel ile yüklenir); ana sayfada haftanın faaliyetleri' },
];
/** Aşama 258: bireysel hesapta veritabanının sabit tuttuğu bölümler (öğretmen yönetimi kapalı, öğrenci yönetimi açık) */
const BIREYSEL_SABIT_MODULLER: KurumModule[] = ['manage_teachers', 'manage_students'];
/** Aşama 258: ekranda açılıp kapatılabilen bölümler (bireysel hesapta sabit olanlar listelenmez) */
export const kurumModulListesi = (bireysel: boolean) => (bireysel ? KURUM_MODULES.filter((m) => !BIREYSEL_SABIT_MODULLER.includes(m.key)) : KURUM_MODULES);
/** Aşama 258: kurum türü. 'bireysel' = tek öğretmenli koçluk hesabı (sql/258) */
export type KurumTur = 'kurum' | 'bireysel';

/** Aşama 259: sistem sahibinin kendi panelinde (yönetim merkezi) açık sekmeler */
export const SISTEM_SAHIBI_SEKMELERI: TeacherTabType[] = ['home', 'user_management', 'deneme'];

export const TAB_MODULES: Partial<Record<TeacherTabType, KurumModule>> = {
  homework: 'homework',
  etuts: 'etut',
  question_tracking: 'questions',
  grades: 'grades',
  messages: 'messages',
  archive: 'archive',
};

export interface MyKurumState {
  loaded: boolean;
  supported: boolean; // 17 numaralı SQL çalıştırıldı mı
  head: boolean;
  kurumId: string | null;
  kurumName: string;
  kurumAdmin: boolean;
  modules: Partial<Record<KurumModule, boolean>>;
  grantedClassIds: string[];
  /** Aşama 82: kurumda rol yetkileri açık mı, oturumdaki kişinin rolleri, rol ayarları, kurum logosu, kurum maili */
  rolesEnabled: boolean;
  roles: string[];
  roleSettings: { rehberlik_ogrenci_ekle?: boolean; olcme_ogrenci_ekle?: boolean; idare_ders_verir?: boolean };
  logo: string;
  hasMail: boolean;
  /** Aşama 83: kişiye özel bölüm izinleri (rolden bağımsız açılan / kapatılan bölümler) */
  sections: { allow: string[]; deny: string[] };
  /** Aşama 158: "Açılan sınıflara giriş bilgisi" anahtarı (kurumlar.grant_cred); null = henüz bilinmiyor (158 SQL'i yok / tam okuma) */
  grantCred: boolean | null;
  /** Aşama 161: "Açılan sınıflarda sınıf değiştirme" anahtarı (kurumlar.grant_move); null = henüz bilinmiyor (161 SQL'i yok / tam okuma) */
  grantMove: boolean | null;
  /** Aşama 258: 'bireysel' = tek öğretmenli koçluk hesabı (my_kurum.kurum_tur; 258 SQL'i yoksa 'kurum') */
  tur: KurumTur;
}
export const EMPTY_KURUM_STATE: MyKurumState = {
  loaded: false,
  supported: true,
  head: false,
  kurumId: null,
  kurumName: '',
  kurumAdmin: false,
  modules: {},
  grantedClassIds: [],
  rolesEnabled: false,
  roles: [],
  roleSettings: {},
  logo: '',
  hasMail: false,
  sections: { allow: [], deny: [] },
  grantCred: null,
  grantMove: null,
  tur: 'kurum',
};
export const MY_KURUM_KEY = 'edu_my_kurum_v1';
// Aşama 243 / 257: PORTAL SEÇİMİ. Kurumda birden çok görevi olan kişi (ör. Öğretmen + Rehberlik, Öğretmen + Ölçme,
// İdare + Öğretmen, Kurum yöneticisi + Öğretmen) girişte hangi portalda çalışacağını seçer. Portal yalnız GÖRÜNÜMÜ daraltır
// (menü, ana sayfa, listeler: o portalın rolleriyle); veritabanı yetkisi kişinin bütün rolleridir.
export type PortalKod = 'idare' | 'rehberlik' | 'olcme' | 'ogretmen' | 'etut' | 'yonetici';
export const PORTAL_ADI: Record<PortalKod, string> = {
  idare: 'İdare',
  rehberlik: 'Rehberlik',
  olcme: 'Ölçme Değerlendirme',
  ogretmen: 'Öğretmen',
  etut: 'Etüt Öğretmeni',
  yonetici: 'Kurum yöneticisi',
};
/** Aşama 257: her portalda geçerli roller (yonetici: hepsi). Sıra = seçim ekranındaki sıra */
export const PORTAL_ROLLERI: Record<PortalKod, readonly string[] | null> = {
  idare: ['mudur', 'mudur_yardimcisi'],
  rehberlik: ['rehberlik'],
  olcme: ['olcme_degerlendirme'],
  ogretmen: ['ogretmen', 'zumre_baskani', 'etut_ogretmeni'],
  etut: ['etut_ogretmeni'],
  yonetici: null,
};
export const PORTAL_KEY = 'edu_portal_v1'; // sessionStorage: bu sekmedeki seçim {tid, p}
export const PORTAL_TERCIH_KEY = 'edu_portal_tercih_v1:'; // localStorage: "seçimimi hatırla" (kişi kimliğiyle)
const PORTAL_KODLARI = Object.keys(PORTAL_ROLLERI) as PortalKod[];
export function loadPortalSecim(): { tid: string; p: PortalKod } | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(PORTAL_KEY) || 'null');
    return v && typeof v.tid === 'string' && PORTAL_KODLARI.includes(v.p) ? v : null;
  } catch {
    return null;
  }
}
export function loadMyKurumCache(): Partial<MyKurumState> {
  try {
    const raw = sessionStorage.getItem(MY_KURUM_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
