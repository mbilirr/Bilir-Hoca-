// ============================================================================
// Aşama 358: dataService katmanlarının ortak türleri ve yardımcıları (dataService.ts'ten kelimesi kelimesine
// taşındı; yalnız başlarına "export" eklendi). Ekranlar bunları eskisi gibi dataService'ten alır.
// ============================================================================
import {
  Student,
  Teacher,
  ClassGroup,
  Homework,
  HomeworkSubmission,
  Etut,
  AttendanceRecord,
  GradeRecord,
  StudentMessage,
  EtutStudentAttendance,
} from '../../types';
import { isValidEmail, isInternalLoginEmail } from '../../lib/importNormalize';
import { type EtutCommentKey } from '../bulutIslemleri';

export interface EtutTeacherOption {
  id: string; // kayıtlı öğretmen kimliği veya 'ext-<uuid>'
  name: string;
  subjects: string[];
  kind: 'system' | 'external';
  hasEmail: boolean;
  rowId: string | null;
  isMe: boolean;
}
export interface EtutTeacherRow {
  id: string;
  name: string;
  subjects: string[];
  email: string;
  phone: string;
  teacherId: string | null;
  active: boolean;
}

// INITIAL SEED DATA (Empty by default per user request, only designated admin initialized)
export const INITIAL_CLASSES: ClassGroup[] = [];

export const INITIAL_STUDENTS: Student[] = [];

export const INITIAL_HOMEWORK: Homework[] = [];

export const INITIAL_SUBMISSIONS: HomeworkSubmission[] = [];

export const INITIAL_ETUTS: Etut[] = [];

export const INITIAL_ATTENDANCE: AttendanceRecord[] = [];

export const INITIAL_GRADES: GradeRecord[] = [];

export const INITIAL_MESSAGES: StudentMessage[] = [];

// Öğretmenler yalnızca buluttan (Supabase) gelir; uygulama içine gömülü hayali öğretmen kaydı yoktur.
export const INITIAL_TEACHERS: Teacher[] = [];

// Sistemin kendi ürettiği giriş adreslerini (std_<no>@okul.internal.net, tch_<ad>@okul.internal.net,
// eski sürümlerde *@school.internal) ve biçimi bozuk adresleri tespit eder. Bunlar gerçek e-posta değildir.
// Diğer tüm geçerli adresler (okul.k12.tr, gmail vb.) korunur: otomatik e-postalar students.email'e gider.
export function isAutoOrFakeEmail(email?: string | null): boolean {
  if (!email || typeof email !== 'string') return true;
  const e = email.trim().toLowerCase();
  if (!e) return true;
  if (isInternalLoginEmail(e)) return true;
  return !isValidEmail(e);
}

export function cleanStudentEmail(email?: string | null): string {
  if (!email || isAutoOrFakeEmail(email)) {
    return '';
  }
  return email.trim().toLowerCase();
}

// DATA STORE LOCAL STORAGE KEYS
// Kurum yöneticisinin e-postası (veritabanındaki is_admin() kuralıyla aynı)
export const ADMIN_EMAIL = 'm.bilirr@gmail.com';

// Aşama 25: yöneticinin verdiği ilk giriş şifresi (09c numaralı SQL ile gelen tablo)
export interface InitialCredentialInfo {
  type: 'student' | 'teacher';
  recordId: string;
  loginId: string;
  password: string; // kullanıcı şifresini değiştirdiyse boş; Aşama 345: tek kişide yalnız "göz"e basınca dolar
  /** Aşama 345: saklı (şifreli) ilk şifre var ve kişi henüz değiştirmedi */
  sifreVar?: boolean;
  mustChange: boolean;
  setAt: string;
  changedAt: string | null;
}

// ============================================================================
// HIZ (Aşama 84): AYNI VERİYİ YENİDEN KULLAN
// Buluttan gelen liste öncekiyle aynıysa eski liste (ve değişmeyen her kayıt) aynen kullanılır.
// Böylece arka plan eşitlemesi, değişiklik yoksa ekranı yeniden çizdirmez ve önbelleğe yazmaz;
// değişiklik varsa yalnızca değişen kayıtlar yeni olur (React yalnız onları çizer).
// ============================================================================
// Aynı eşzamanlı çalışma (tek çizim / tek olay) boyunca geçerli sayaç: iş bitince bir sonraki adımda artar
let runEpoch = 0;
let runEpochQueued = false;
export const currentEpoch = (): number => {
  if (!runEpochQueued) {
    runEpochQueued = true;
    Promise.resolve().then(() => {
      runEpochQueued = false;
      runEpoch++;
    });
  }
  return runEpoch;
};
// Aşama 318: sameData, adoptList, sortByTimeDesc ve geri alma birleştirmesi listeBirlestirme.ts'te

export type GeriAlmaListe =
  | 'classes' | 'students' | 'homeworks' | 'submissions' | 'etuts' | 'attendance'
  | 'grades' | 'messages' | 'documents' | 'questionLogs' | 'weeklyQuestionTargets';
// Aşama 343: giden kutusundaki bir yazma (bkz. gidenKutusunuGonder)
export type GidenIs = {
  op: () => PromiseLike<{ error: any }>;
  rollback: () => void;
  userMessage: string;
  yazarken: Record<GeriAlmaListe, any[]>;
  deneme: number;
};

export type RealtimeTableCfg = { table: string; onEvent: (payload: any) => void; resync: () => unknown; filter?: string; optional?: boolean };
// Aşama 179: etüt yazımında hangi yorum alanlarının ve hangi öğrencilerin yoklamasının yazılacağı
export type EtutPushOpts = {
  comments?: EtutCommentKey[];
  commentsOnly?: boolean;
  attendance?: Record<string, EtutStudentAttendance>;
  attendanceOnly?: boolean;
};
export const ETUT_COMMENT_KEYS: EtutCommentKey[] = ['teacherFeedback', 'notes', 'attendanceTakenBy'];

// Aşama 193: ham satırları bellekte tutulup artımlı okunan tablolar (fetchRowsSmart)
export type RawTable = 'students' | 'student_contacts' | 'teachers' | 'classes' | 'deleted_records';

/** Aşama 261: haftalık planda bütün dersleri gören roller (sql/261 plan_subject_ok ile aynı) */
export const PLAN_GENIS_ROLLER = ['rehberlik', 'olcme_degerlendirme', 'mudur', 'mudur_yardimcisi'];

/**
 * Aşama 349b: değişiklik bildiriminin konusu. Sık değişen listeler ayrı konudur; böylece örneğin bir öğrencinin soru
 * kaydı, soru kaydı göstermeyen açık sayfaları yeniden çizdirmez. Öğrenci, sınıf, öğretmen, kurum ve yetki
 * değişiklikleri konusuz bildirilir (seyrek; her şey yenilenir).
 */
export type VeriKonusu = 'soru' | 'teslim' | 'mesaj' | 'not' | 'yoklama' | 'etut' | 'odev' | 'belge' | 'hedef';
/** Dinleyiciye değişen konular verilir; null = konusu belirsiz genel değişiklik. */
export type VeriDinleyici = (degisen: ReadonlySet<VeriKonusu> | null) => void;
export const konuKesisir = (a: ReadonlySet<VeriKonusu>, b: ReadonlySet<VeriKonusu>): boolean => {
  for (const k of a) if (b.has(k)) return true;
  return false;
};
