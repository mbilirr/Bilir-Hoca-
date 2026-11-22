// Kullanıcı yönetimi: sayfanın ortak yardımcıları (Aşama 354d, AdminUserManagement.tsx bölündü)
import { UnifiedUser, Teacher } from '../../../types';
import { callMail, describeMailResult } from '../../../lib/mailApi';
import { ROLE_BY_CODE, sortRoles, type TeacherRole } from '../../../lib/teacherRoles';
import { lazyNamed } from '../../../lib/lazyLoad';

// Aşama 144: Excel ile toplu öğretmen ekleme (xlsx kütüphanesi yalnız pencere açılınca yüklenir)
export const TeacherExcelUploadModal = lazyNamed(() => import('../TeacherExcelUploadModal'), 'TeacherExcelUploadModal');

// Aşama 171: cinsiyeti addan doldur (ad listesi yalnız açılınca iner)
export const CinsiyetDoldurModal = lazyNamed(() => import('../CinsiyetDoldurModal'), 'CinsiyetDoldurModal');

export const ProfilResmiSecModal = lazyNamed(() => import('../../ProfilResmiSecModal'), 'ProfilResmiSecModal'); // Aşama 334
export const TeacherCredentialSendModal = lazyNamed(() => import('../TeacherCredentialSendModal'), 'TeacherCredentialSendModal');

// Aşama 149: Yönetim › Öğrenciler — öğrencilere giriş bilgisi (pencereler yalnız açılınca yüklenir)
export const StudentCredentialPickModal = lazyNamed(() => import('../StudentCredentialPickModal'), 'StudentCredentialPickModal');

export const CredentialSendModal = lazyNamed(() => import('../../Common/CredentialSendModal'), 'CredentialSendModal');

export const StudentWelcomeCredentialsModal = lazyNamed(() => import('../../Teacher/StudentWelcomeCredentialsModal'), 'StudentWelcomeCredentialsModal');

// Aşama 107: rolü gereği kurumdaki tüm öğrencileri gören unvanlar (veritabanındaki role_wide_view / kurum yöneticisi ile aynı)
export const WIDE_ROLES: TeacherRole[] = ['mudur', 'mudur_yardimcisi', 'rehberlik', 'olcme_degerlendirme'];

export const wideRoleText = (rs: TeacherRole[]) => sortRoles(rs).map((r) => ROLE_BY_CODE[r as TeacherRole]?.label || r).join(' / ');

// Aşama 11: öğretmen hesabındaki değişiklikleri öğretmene e-postayla bildirir (alıcıyı sunucu bulur)
export type TeacherMailKind = 'created' | 'updated' | 'access' | 'role' | 'suspended' | 'reactivated';

export const isTeacherAccount = (u?: UnifiedUser | null) => !!u && u.role !== 'student';

export async function notifyTeacherByMail(
  teacherId: string,
  kind: TeacherMailKind,
  extra: { changes?: Array<{ label: string; value: string; login?: boolean }>; password?: string; previousEmail?: string } = {}
) {
  const r = await callMail('teacher-account', { teacherId, kind, ...extra });
  return describeMailResult(r);
}

export const toastType = (tone: string): 'success' | 'error' | 'info' => (tone === 'success' ? 'success' : tone === 'danger' ? 'error' : 'info');

export interface AdminUserManagementProps {
  currentAdmin?: Teacher | null;
  onNavigateHome?: () => void;
  /**
   * Aşama 143 (Yönetim sayfası): liste bir kuruma ('merkez' = kurumsuz kayıtlarınız) ve bir türe (öğretmen / öğrenci) kilitlenir;
   * embedded iken büyük başlık, sayı kartları ve hızlı süzgeç düğmeleri gizlenir (Yönetim sayfası kendi başlığını gösterir).
   */
  kurumLock?: string;
  roleLock?: 'teacher' | 'student';
  embedded?: boolean;
  roleSettings?: { rehberlik_ogrenci_ekle?: boolean; olcme_ogrenci_ekle?: boolean } | null;
}
