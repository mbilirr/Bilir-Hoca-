import { supabase } from './supabase';
import { normalizeBranch } from './subjects';

// ============================================================================
// UNVANLAR VE ROLLER (Aşama 81, 82, 83)
// Roller tanımlanır ve kişilere atanır. Kurumda "Rol yetkileri" açıkken (sql/82) aşağıdaki yetki tablosu uygulanır.
// Veritabanı: teacher_roles, teacher_role_log, set_teacher_roles() — sql/81_unvan_rolleri.sql
// ============================================================================

export type TeacherRole = 'mudur' | 'mudur_yardimcisi' | 'rehberlik' | 'olcme_degerlendirme' | 'zumre_baskani' | 'ogretmen' | 'etut_ogretmeni';

export interface RoleDef {
  code: TeacherRole;
  label: string;
  short: string;
  /** rozet rengi (ui-chip-*) */
  chip: 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  description: string;
}

export const ROLE_DEFS: RoleDef[] = [
  { code: 'mudur', label: 'Müdür', short: 'Müdür', chip: 'danger', description: 'Kurumun tamamını yönetir. Yalnızca genel yönetici verebilir.' },
  { code: 'mudur_yardimcisi', label: 'Müdür Yardımcısı', short: 'Müdür Yrd.', chip: 'warning', description: 'Müdürle aynı yetkiler; Müdür rolünü veremez.' },
  { code: 'rehberlik', label: 'Rehberlik', short: 'Rehberlik', chip: 'info', description: 'Tüm öğrenciler, etüt notları; ödev ve etüt verir.' },
  { code: 'olcme_degerlendirme', label: 'Ölçme Değerlendirme', short: 'Ölçme Değ.', chip: 'success', description: 'Öğrenci düzenleme (ekleme / silme müdür izin verirse), deneme okuma ve analiz, veli duyuruları.' },
  { code: 'zumre_baskani', label: 'Zümre Başkanı', short: 'Zümre Bşk.', chip: 'brand', description: 'Kendi zümresinin çalışmalarını görür, zümre evrakını düzenler. Öğretmen rolüyle verilir.' },
  { code: 'ogretmen', label: 'Öğretmen', short: 'Öğretmen', chip: 'neutral', description: 'Dersine girdiği sınıflar ve yalnızca kendi çalışmaları.' },
  { code: 'etut_ogretmeni', label: 'Etüt Öğretmeni', short: 'Etüt Öğr.', chip: 'neutral', description: 'Yalnızca kendisine verilen etütler ve o etütteki öğrenciler.' },
];

export const ROLE_BY_CODE: Record<TeacherRole, RoleDef> = ROLE_DEFS.reduce(
  (acc, r) => ({ ...acc, [r.code]: r }),
  {} as Record<TeacherRole, RoleDef>
);

export const roleLabel = (code: string) => {
  // Aşama 83: kişiye özel bölüm izni kayıtları (bolum+homework / bolum-deneme); 143: bolum~x = rolden'e döndü
  const m = /^bolum([+~-])(.+)$/.exec(code);
  if (m) return `${sectionLabel(m[2])} bölümü ${m[1] === '+' ? 'açık' : m[1] === '-' ? 'kapalı' : 'rolden'}`;
  // Aşama 143: kişiye özel işlem izni (izin:karne_gonder, izin:karne_gonder~ = rolden'e döndü)
  const p = /^izin:([a-z_]+)(~?)$/.exec(code);
  if (p) return `${permLabel(p[1])}${p[2] ? ' (rolden)' : ''}`;
  return (ROLE_BY_CODE as Record<string, RoleDef>)[code]?.label || code;
};

// ----------------------------------------------------------------------------- Aşama 83: kişiye özel bölüm izni
export type SectionKey = 'home' | 'students' | 'homework' | 'etuts' | 'messages' | 'archive' | 'grades' | 'question_tracking' | 'deneme';
export type SectionMode = 'role' | 'allow' | 'deny';
/** Kişiye özel kayıt: bölüm anahtarları ve (Aşama 143) "izin:<anahtar>" işlem izinleri aynı dizilerde */
export interface SectionAccess {
  allow: string[];
  deny: string[];
}
export const SECTION_DEFS: Array<{ key: SectionKey; label: string }> = [
  { key: 'home', label: 'Ana Sayfa' },
  { key: 'students', label: 'Öğrenciler' },
  { key: 'homework', label: 'Ödevler ve Plan' },
  { key: 'etuts', label: 'Etütler' },
  { key: 'question_tracking', label: 'Soru Takibi' },
  { key: 'grades', label: 'Not & Yoklama' },
  { key: 'messages', label: 'Mesajlar' },
  { key: 'archive', label: 'Arşiv' },
  { key: 'deneme', label: 'Deneme Analizi' },
];
export const sectionLabel = (key: string) => SECTION_DEFS.find((d) => d.key === key)?.label || key;

// ----------------------------------------------------------------------------- Aşama 143: kişiye özel İŞLEM izinleri
// Veritabanında Bölümler ile aynı kayıtta "izin:<anahtar>" diye tutulur (sql/143). Rol yetkileri açıkken ve kişi idareden
// (kurum yöneticisi, Müdür, Müdür Yrd.) değilse uygulanır. Rolden = aşağıdaki roleOpensPerm (veritabanıyla aynı).
export type PermKey = 'karne_gonder' | 'duyuru' | 'veli_bilgi' | 'ogrenci_ekle_sil' | 'ogrenci_duzenle' | 'deneme_yonet' | 'etut_ata';
export const PERM_PREFIX = 'izin:';
export const PERM_DEFS: Array<{ key: PermKey; label: string; hint: string }> = [
  { key: 'karne_gonder', label: 'Sınav karnesi gönderme', hint: 'Deneme karnesini öğrenciye / veliye e-posta ve SMS ile gönderir' },
  { key: 'duyuru', label: 'Veli / öğrenci duyurusu', hint: 'Mesajlar › Veli / Öğrenci Duyurusu (e-posta, SMS)' },
  { key: 'veli_bilgi', label: 'Veli iletişim bilgileri', hint: 'Veli ve öğrenci telefonu / e-postasını görür' },
  { key: 'ogrenci_ekle_sil', label: 'Öğrenci ekleme / silme', hint: 'Kuruma öğrenci ekler, öğrenci siler' },
  { key: 'ogrenci_duzenle', label: 'Öğrenci düzenleme', hint: 'Öğrenci bilgisini düzenler, sınıfını değiştirir' },
  { key: 'deneme_yonet', label: 'Deneme yükleme / düzenleme', hint: 'Deneme ekler, optik okur, siler (deneme bölümü açıksa)' },
  { key: 'etut_ata', label: 'Başkası adına etüt verme', hint: 'Etütte kurumun diğer öğretmenlerini seçebilir' },
];
export const permLabel = (key: string) => PERM_DEFS.find((d) => d.key === key)?.label || key;
export const isPermEntry = (x: string) => x.startsWith(PERM_PREFIX);
/** İdare (kurum yöneticisi / Müdür / Müdür Yrd.): kişiye özel izin uygulanmaz, her işlem açıktır */
export const isIdare = (roles: string[], isAdmin?: boolean) => !!isAdmin || roles.includes('mudur') || roles.includes('mudur_yardimcisi');

/** Rolün bu işlemi açıp açmadığı (veritabanındaki 143 işlevleriyle aynı). rs = kurumun rol ayarları (bilinmiyorsa null) */
export function roleOpensPerm(
  roles: string[],
  key: PermKey,
  rs: { rehberlik_ogrenci_ekle?: boolean; olcme_ogrenci_ekle?: boolean } | null
): boolean | null {
  const reh = roles.includes('rehberlik');
  const olc = roles.includes('olcme_degerlendirme');
  switch (key) {
    case 'karne_gonder':
    case 'duyuru':
    case 'veli_bilgi':
    case 'ogrenci_duzenle':
      return reh || olc;
    case 'deneme_yonet':
      return olc;
    case 'etut_ata':
      return reh;
    case 'ogrenci_ekle_sil':
      if (!reh && !olc) return false;
      if (!rs) return null; // kurum ayarına bağlı, ayar bilinmiyor
      return (reh && rs.rehberlik_ogrenci_ekle === true) || (olc && rs.olcme_ogrenci_ekle === true);
  }
}

/** Aşama 147: kayıtta branşa göre otomatik unvan (Rehberlik branşı → Rehberlik, diğerleri → Öğretmen) */
export function roleFromBranch(branch?: string | null): TeacherRole {
  return normalizeBranch(branch) === 'Rehberlik' ? 'rehberlik' : 'ogretmen';
}

/** Rolün bu bölümü açıp açmadığı (veritabanındaki role_section_ok ile aynı) */
export function roleOpensSection(roles: string[], key: SectionKey): boolean {
  if (roles.length === 0) return true;
  if (roles.includes('mudur') || roles.includes('mudur_yardimcisi')) return true;
  const all: SectionKey[] = ['home', 'students', 'homework', 'etuts', 'messages', 'archive', 'grades', 'question_tracking', 'deneme'];
  if (roles.includes('rehberlik') && all.includes(key)) return true;
  if (roles.includes('olcme_degerlendirme') && (['home', 'students', 'messages', 'archive', 'deneme'] as SectionKey[]).includes(key)) return true;
  if ((roles.includes('ogretmen') || roles.includes('zumre_baskani')) && all.includes(key)) return true;
  if (roles.includes('etut_ogretmeni') && key === 'etuts') return true;
  return false;
}

const sectionsMissingMsg = 'Bölüm izni tablosu bulunamadı. Supabase SQL Editor\'de sql/83_mahremiyet_bolum_izni_kurum.sql dosyasını çalıştırın.';
const isSectionsMissing = (e: { message?: string; code?: string } | null) =>
  !!e && (/teacher_section_access|set_teacher_sections|schema cache|does not exist/i.test(e.message || '') || e.code === '42P01' || e.code === 'PGRST202' || e.code === 'PGRST205');

/** Görülebilen kişiye özel bölüm izinleri: öğretmen kimliği -> izinler */
export async function fetchTeacherSections(): Promise<Map<string, SectionAccess>> {
  const { data, error } = await supabase.from('teacher_section_access').select('teacher_id,allow_sections,deny_sections');
  if (error) throw new Error(isSectionsMissing(error) ? sectionsMissingMsg : error.message);
  const map = new Map<string, SectionAccess>();
  for (const r of (data || []) as Array<{ teacher_id: string; allow_sections: string[] | null; deny_sections: string[] | null }>) {
    map.set(r.teacher_id, { allow: r.allow_sections || [], deny: r.deny_sections || [] });
  }
  return map;
}

export async function saveTeacherSections(teacherId: string, access: SectionAccess): Promise<SectionAccess> {
  const { data, error } = await supabase.rpc('set_teacher_sections', { p_teacher_id: teacherId, p_allow: access.allow, p_deny: access.deny });
  if (error) throw new Error(isSectionsMissing(error) ? sectionsMissingMsg : error.message);
  const d = (data || {}) as { allow?: string[]; deny?: string[] };
  return { allow: Array.isArray(d.allow) ? d.allow : access.allow, deny: Array.isArray(d.deny) ? d.deny : access.deny };
}

/** Aşama 143: Yetkiler penceresi — bölümler + işlem izinleri tek kayıtta (sql/143 set_teacher_yetkiler) */
export async function saveTeacherYetkiler(teacherId: string, access: SectionAccess): Promise<SectionAccess> {
  const { data, error } = await supabase.rpc('set_teacher_yetkiler', { p_teacher_id: teacherId, p_allow: access.allow, p_deny: access.deny });
  if (error) {
    if (error.code === 'PGRST202' || /set_teacher_yetkiler/.test(error.message || '')) {
      throw new Error("İşlem izinleri için Supabase SQL Editor'de sql/143_kisiye_ozel_yetkiler.sql dosyasını çalıştırın.");
    }
    throw new Error(error.message);
  }
  const d = (data || {}) as { allow?: string[]; deny?: string[] };
  return { allow: Array.isArray(d.allow) ? d.allow : access.allow, deny: Array.isArray(d.deny) ? d.deny : access.deny };
}

/** Onaylanan yetki tablosu (sütun sırası: Müdür/Müdür Yrd., Rehberlik, Ölçme Değ., Zümre Bşk., Öğretmen, Etüt Öğr.) */
export const MATRIX_COLUMNS = ['Müdür / Müdür Yrd.', 'Rehberlik', 'Ölçme Değ.', 'Zümre Bşk.', 'Öğretmen', 'Etüt Öğr.'];
export const PERMISSION_MATRIX: Array<{ area: string; cells: string[] }> = [
  { area: 'Öğrencileri görme', cells: ['Tümü', 'Tümü', 'Tümü', 'Zümresinin sınıfları', 'Sınıfları', 'Yalnızca kendi etüdünde'] },
  { area: 'Öğrenci ekle / sil', cells: ['Evet', 'Müdür izin verirse', 'Müdür izin verirse', '—', '—', '—'] }, // Aşama 108: Ölçme de izinle
  { area: 'Öğrenci düzenle, sınıf değiştir', cells: ['Evet', 'Evet', 'Evet', '—', '—', '—'] },
  { area: 'Sınıf ekle / sil / düzenle', cells: ['Evet', '—', '—', '—', '—', '—'] },
  { area: 'Öğretmen ekle, yetki ver', cells: ['Evet', '—', '—', '—', '—', '—'] },
  { area: 'Ödev verme / görme', cells: ['Tümü', 'Verir · tümünü görür', '—', 'Verir · zümresini görür', 'Verir · kendi', '—'] },
  { area: 'Etüt verme / görme', cells: ['Tümü', 'Verir · tümünü görür', '—', 'Zümresini görür', 'Verir · kendi', 'Kendine verilenler'] },
  { area: 'Etüt notları, öğrenci yorumları', cells: ['Tümü', 'Tümü', '—', '—', 'Kendi etütleri', 'Kendi etütleri'] },
  { area: 'Haftalık plan, soru hedefi', cells: ['Tümü', 'Tümü', '—', 'Zümresini görür', 'Kendi', '—'] },
  { area: 'Deneme okuma / düzenleme', cells: ['Evet', '—', 'Evet', '—', '—', '—'] },
  { area: 'Deneme analizi', cells: ['Tümü', 'Tümü (salt okunur)', 'Tümü', 'Zümresi', 'Sınıfları', '—'] },
  { area: 'Veli bilgileri (tel, e-posta)', cells: ['Tümü', 'Tümü', 'Tümü', '—', '—', '—'] },
  { area: 'Veli / öğrenciye e-posta, SMS', cells: ['Evet', 'Evet', 'Evet', '—', '—', '—'] },
  { area: 'Sınav karnesi gönderme (e-posta, SMS)', cells: ['Evet', 'Evet', 'Evet', '—', '—', '—'] }, // Aşama 143
  { area: 'Öğrenci listesi alma', cells: ['Tümü', 'Tümü', 'Tümü', 'Zümresinin sınıfları', 'Sınıfları', '—'] },
  { area: 'Arşiv', cells: ['Tümü', 'Görür', 'Görür', 'Zümresini düzenler', 'Görür · kendi yüklediğini düzenler', '—'] },
  { area: 'Kurum ayarları (mail, logo, isim)', cells: ['Evet', '—', '—', '—', '—', '—'] },
  { area: 'Not & yoklama', cells: ['Tümü', 'Tümünü görür', 'Tümünü görür', 'Zümresini görür', 'Yalnızca kendi girdiği', '—'] },
];
export const MATRIX_NOTES = [
  'Bir kişiye birden fazla rol verilebilir; yetkiler toplanır, en geniş olan geçerli olur.',
  'Zümre başkanı öğretmen rolüyle birlikte verilir; zümresi öğretmenin kayıtlı branşıdır.',
  'Müdür rolünü yalnızca genel yönetici verebilir; kimse kendinde olmayan bir yetkiyi veremez.',
  'Kim, kime, hangi rolü ne zaman verdi kaydı tutulur.',
  'Müdür / Müdür Yrd. bir kişiye rolünden bağımsız bir bölümü ya da işlemi (karne gönderme, duyuru, veli bilgisi, öğrenci ekleme / düzenleme, deneme yükleme, başkası adına etüt) açabilir ya da kapatabilir (Yetkiler düğmesi). İdarede her işlem açıktır.',
];

// ----------------------------------------------------------------------------- veri
export interface RoleLogItem {
  id: number;
  created_at: string;
  teacher_id: string;
  teacher_name: string | null;
  added: string[];
  removed: string[];
  actor_name: string | null;
}

const missingMsg = 'Rol tabloları bulunamadı. Supabase SQL Editor\'de sql/81_unvan_rolleri.sql dosyasını çalıştırın.';
const isMissing = (e: { message?: string; code?: string } | null) =>
  !!e && (/teacher_roles|teacher_role_log|set_teacher_roles|schema cache|does not exist/i.test(e.message || '') || e.code === '42P01' || e.code === 'PGRST202' || e.code === 'PGRST205');

// Aşama 100: rol kaydı değişince açık olan tüm ekranlar (Unvanlar ve Roller, kullanıcı listesi) aynı anda güncellenir
type RolesSavedListener = (teacherId: string, roles: TeacherRole[]) => void;
const rolesSavedListeners = new Set<RolesSavedListener>();
export function onTeacherRolesSaved(cb: RolesSavedListener): () => void {
  rolesSavedListeners.add(cb);
  return () => {
    rolesSavedListeners.delete(cb);
  };
}

// Aynı anda açılan iki bölüm tek sorgu paylaşır (önbellek yok, her açılışta güncel okunur)
let rolesInflight: Promise<Map<string, TeacherRole[]>> | null = null;

/** Görülebilen tüm rol kayıtları: öğretmen kimliği -> roller */
export function fetchTeacherRoles(): Promise<Map<string, TeacherRole[]>> {
  if (!rolesInflight) rolesInflight = readTeacherRoles().finally(() => (rolesInflight = null));
  return rolesInflight;
}

async function readTeacherRoles(): Promise<Map<string, TeacherRole[]>> {
  const { data, error } = await supabase.from('teacher_roles').select('teacher_id,role');
  if (error) throw new Error(isMissing(error) ? missingMsg : error.message);
  const map = new Map<string, TeacherRole[]>();
  for (const r of (data || []) as Array<{ teacher_id: string; role: TeacherRole }>) {
    map.set(r.teacher_id, [...(map.get(r.teacher_id) || []), r.role]);
  }
  return map;
}

export async function saveTeacherRoles(teacherId: string, roles: TeacherRole[]): Promise<TeacherRole[]> {
  const { data, error } = await supabase.rpc('set_teacher_roles', { p_teacher_id: teacherId, p_roles: roles });
  if (error) throw new Error(isMissing(error) ? missingMsg : error.message);
  const out = data && Array.isArray((data as any).roles) ? ((data as any).roles as TeacherRole[]) : roles;
  rolesSavedListeners.forEach((cb) => cb(teacherId, out));
  return out;
}

export async function fetchRoleLog(limit = 20): Promise<RoleLogItem[]> {
  const { data, error } = await supabase
    .from('teacher_role_log')
    .select('id,created_at,teacher_id,teacher_name,added,removed,actor_name')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(isMissing(error) ? missingMsg : error.message);
  return (data || []) as RoleLogItem[];
}

/** Rolleri tablo sırasına göre dizer */
export const sortRoles = (roles: string[]) =>
  [...roles].sort((a, b) => ROLE_DEFS.findIndex((r) => r.code === a) - ROLE_DEFS.findIndex((r) => r.code === b));
