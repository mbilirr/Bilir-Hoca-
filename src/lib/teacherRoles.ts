import { supabase } from './supabase';

// ============================================================================
// UNVANLAR VE ROLLER (Aşama 81 — 1. aşama)
// Roller tanımlanır ve kişilere atanır. Bu aşamada kimsenin yetkisi değişmez; aşağıdaki yetki tablosu
// sonraki aşamalarda uygulanacak kuralların onaylanmış hâlidir (ekranda bilgi olarak gösterilir).
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
  { code: 'olcme_degerlendirme', label: 'Ölçme Değerlendirme', short: 'Ölçme Değ.', chip: 'success', description: 'Öğrenci işlemleri, deneme okuma ve analiz, veli duyuruları.' },
  { code: 'zumre_baskani', label: 'Zümre Başkanı', short: 'Zümre Bşk.', chip: 'brand', description: 'Kendi zümresinin çalışmalarını görür, zümre evrakını düzenler. Öğretmen rolüyle verilir.' },
  { code: 'ogretmen', label: 'Öğretmen', short: 'Öğretmen', chip: 'neutral', description: 'Dersine girdiği sınıflar ve yalnızca kendi çalışmaları.' },
  { code: 'etut_ogretmeni', label: 'Etüt Öğretmeni', short: 'Etüt Öğr.', chip: 'neutral', description: 'Yalnızca kendisine verilen etütler ve o etütteki öğrenciler.' },
];

export const ROLE_BY_CODE: Record<TeacherRole, RoleDef> = ROLE_DEFS.reduce(
  (acc, r) => ({ ...acc, [r.code]: r }),
  {} as Record<TeacherRole, RoleDef>
);

export const roleLabel = (code: string) => (ROLE_BY_CODE as Record<string, RoleDef>)[code]?.label || code;

/** Onaylanan yetki tablosu (sütun sırası: Müdür/Müdür Yrd., Rehberlik, Ölçme Değ., Zümre Bşk., Öğretmen, Etüt Öğr.) */
export const MATRIX_COLUMNS = ['Müdür / Müdür Yrd.', 'Rehberlik', 'Ölçme Değ.', 'Zümre Bşk.', 'Öğretmen', 'Etüt Öğr.'];
export const PERMISSION_MATRIX: Array<{ area: string; cells: string[] }> = [
  { area: 'Öğrencileri görme', cells: ['Tümü', 'Tümü', 'Tümü', 'Zümresinin sınıfları', 'Sınıfları', 'Yalnızca kendi etüdünde'] },
  { area: 'Öğrenci ekle / sil', cells: ['Evet', 'Müdür izin verirse', 'Evet', '—', '—', '—'] },
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
  { area: 'Öğrenci listesi alma', cells: ['Tümü', 'Tümü', 'Tümü', 'Zümresinin sınıfları', 'Sınıfları', '—'] },
  { area: 'Arşiv', cells: ['Tümü', 'Görür', 'Görür', 'Zümresini düzenler', 'Görür · kendi yüklediğini düzenler', '—'] },
  { area: 'Kurum ayarları (mail, logo, isim)', cells: ['Evet', '—', '—', '—', '—', '—'] },
];
export const MATRIX_NOTES = [
  'Bir kişiye birden fazla rol verilebilir; yetkiler toplanır, en geniş olan geçerli olur.',
  'Zümre başkanı öğretmen rolüyle birlikte verilir; zümresi öğretmenin kayıtlı branşıdır.',
  'Müdür rolünü yalnızca genel yönetici verebilir; kimse kendinde olmayan bir yetkiyi veremez.',
  'Kim, kime, hangi rolü ne zaman verdi kaydı tutulur.',
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

/** Görülebilen tüm rol kayıtları: öğretmen kimliği -> roller */
export async function fetchTeacherRoles(): Promise<Map<string, TeacherRole[]>> {
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
