import {
  Student,
  Teacher,
  AuthSession,
  UserRole,
  ClassGroup,
  Homework,
  HomeworkSubmission,
  HomeworkResource,
  HomeworkCheckStatus,
  Etut,
  AttendanceRecord,
  AttendanceStatus,
  GradeRecord,
  StudentMessage,
  TeacherDocument,
  DocumentCategory,
  StudentNotification,
  SentEmailLog,
  StudentQuestionLog,
  WeeklyQuestionTarget,
  EtutStudentAttendance,
  UnifiedUser,
  SystemRole,
  UserStatus,
  StudentAccountInput,
  StudentCredential,
  StudentAccountFailure,
  StudentAccountResult,
  StudentApplication,
} from '../types';
import { supabase, invokeCreateUserEdgeFunction, invokeEdgeFunction, clearPasswordRecovery } from '../lib/supabase';
import { uploadFile, removeStoredFiles, storedPathsOf, clearSignedUrlCache } from '../lib/fileStorage';
import {
  generateHomeworkEmail,
  generateEtutEmail,
  generateStudentWelcomeEmail,
  formatDueDateTurkish,
  formatEtutDateTurkish,
} from '../lib/emailTemplates';
import { sendBrowserNotification, playNotificationChime } from '../lib/browserNotifications';
import { detectSchoolLevelFromGrade } from '../constants/schoolConstants';
import { subjectsForBranch, normalizeSubject } from '../lib/subjects';

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

// Helper to detect and clean auto-generated / fake / random placeholder emails
export function isAutoOrFakeEmail(email?: string | null): boolean {
  if (!email || typeof email !== 'string') return true;
  const e = email.trim().toLowerCase();
  if (!e) return true;

  if (
    e.endsWith('@okul.k12.tr') ||
    e.endsWith('@school.com') ||
    e.endsWith('@school.internal') ||
    e.endsWith('@student.school.internal') ||
    e.endsWith('@example.com') ||
    e.endsWith('@fake.com') ||
    e.endsWith('@test.com') ||
    e.endsWith('@dummy.com') ||
    e.includes('ogrenci.') ||
    e.includes('ogrenci_') ||
    e.includes('student.') ||
    e.includes('student_') ||
    e.includes('noemail') ||
    e.includes('temp_') ||
    e.startsWith('std_') ||
    e.startsWith('student_') ||
    e.startsWith('ogr_') ||
    !e.includes('@') ||
    !e.includes('.')
  ) {
    return true;
  }
  return false;
}

export function cleanStudentEmail(email?: string | null): string {
  if (!email || isAutoOrFakeEmail(email)) {
    return '';
  }
  return email.trim().toLowerCase();
}

// DATA STORE LOCAL STORAGE KEYS
// Kurum yöneticisinin e-postası (veritabanındaki is_admin() kuralıyla aynı)
const ADMIN_EMAIL = 'm.bilirr@gmail.com';

const STORAGE_KEYS = {
  DEVICE_ID: 'edu_sys_device_id_v6',
  IS_SEEDED: 'edu_sys_seeded_v6',
  DELETED_TEACHERS: 'edu_sys_deleted_teachers_v6',
  DELETED_STUDENTS: 'edu_sys_deleted_students_v6',
  DELETED_CLASSES: 'edu_sys_deleted_classes_v6',
  DELETED_HOMEWORK: 'edu_sys_deleted_homework_v6',
  DELETED_ETUTS: 'edu_sys_deleted_etuts_v6',
  REMEMBER_ME: 'edu_sys_remember_me_v6',
  REMEMBER_ME_TEACHER: 'edu_sys_remember_me_teacher_v6',
  REMEMBER_ME_STUDENT: 'edu_sys_remember_me_student_v6',
  TEACHERS: 'edu_sys_teachers_v6',
  AUTH_SESSION: 'edu_sys_auth_session_v6',
  CLASSES: 'edu_sys_classes_v6',
  STUDENTS: 'edu_sys_students_v6',
  HOMEWORK: 'edu_sys_homework_v6',
  SUBMISSIONS: 'edu_sys_submissions_v6',
  ETUTS: 'edu_sys_etuts_v6',
  ATTENDANCE: 'edu_sys_attendance_v6',
  GRADES: 'edu_sys_grades_v6',
  MESSAGES: 'edu_sys_messages_v6',
  DOCUMENTS: 'edu_sys_documents_v6',
  STUDENT_NOTIFICATIONS: 'edu_sys_student_notifications_v6',
  SENT_EMAILS: 'edu_sys_sent_emails_v6',
  QUESTION_LOGS: 'edu_sys_question_logs_v6',
  DELETED_QUESTION_LOGS: 'edu_sys_deleted_question_logs_v6',
  WEEKLY_QUESTION_TARGETS: 'edu_sys_weekly_question_targets_v6',
};

// =========================================================================
// GİZLİLİK (Aşama 7): Kişisel veriler tarayıcıda kalıcı tutulmaz.
// Öğrenci, not, ödev, mesaj vb. önbellekler yalnızca açık sekmede (sessionStorage) tutulur;
// sekme kapanınca ya da çıkış yapılınca silinir. Ortak kullanılan okul bilgisayarlarında
// bir sonraki kişi önceki kullanıcının verilerini göremez. Asıl veriler her zaman buluttadır.
// Kalıcı (localStorage) yalnızca kişisel veri içermeyen birkaç ayar tutulur.
// Bu dosyadaki tüm "localStorage" kullanımları aşağıdaki yönlendiriciden geçer.
// =========================================================================
const BROWSER_PERSISTENT_KEYS = new Set<string>([
  STORAGE_KEYS.DEVICE_ID,
  STORAGE_KEYS.IS_SEEDED,
  STORAGE_KEYS.REMEMBER_ME,
  STORAGE_KEYS.REMEMBER_ME_TEACHER,
  STORAGE_KEYS.REMEMBER_ME_STUDENT,
  STORAGE_KEYS.AUTH_SESSION, // oturumun kendisi sessionStorage'dadır; buradaki yalnızca eski kalıntıyı silmek içindir
]);
const isAppDataKey = (key: string) => key.startsWith('edu_sys_') && !BROWSER_PERSISTENT_KEYS.has(key);
// Eski sürümün "kalıcı yedek" kopyaları artık yazılmaz (veriler zaten buluttadır)
const isObsoleteMasterKey = (key: string) => key.startsWith('edu_sys_master_');

const browserLocalStorage: Storage | null = (() => {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
})();
const browserSessionStorage: Storage | null = (() => {
  try { return typeof window !== 'undefined' ? window.sessionStorage : null; } catch { return null; }
})();

const appStorage = {
  getItem(key: string): string | null {
    if (isObsoleteMasterKey(key)) return null;
    const store = isAppDataKey(key) ? browserSessionStorage : browserLocalStorage;
    try { return store ? store.getItem(key) : null; } catch { return null; }
  },
  setItem(key: string, value: string): void {
    if (isObsoleteMasterKey(key)) return;
    const store = isAppDataKey(key) ? browserSessionStorage : browserLocalStorage;
    store?.setItem(key, value);
  },
  removeItem(key: string): void {
    try {
      if (isAppDataKey(key)) {
        // veri anahtarı: sekmeden ve (eski sürüm kalıntısı olarak) kalıcı alandan silinir
        browserSessionStorage?.removeItem(key);
        browserLocalStorage?.removeItem(key);
      } else {
        // kalıcı ayar anahtarı (ör. eski oturum kalıntısı): yalnız kalıcı alandan silinir
        browserLocalStorage?.removeItem(key);
      }
    } catch {}
  },
  // Anahtar listesi: sekme önbelleği (eski sürüm temizliği için)
  get length(): number {
    try { return browserSessionStorage ? browserSessionStorage.length : 0; } catch { return 0; }
  },
  key(index: number): string | null {
    try { return browserSessionStorage ? browserSessionStorage.key(index) : null; } catch { return null; }
  },
};
// Bu modülde "localStorage" adı yukarıdaki yönlendiriciyi ifade eder
const localStorage = appStorage;

// Eski sürümlerden tarayıcıda kalıcı olarak kalmış kişisel veri önbelleklerini siler
function purgePersistentPersonalData(): number {
  if (!browserLocalStorage) return 0;
  let removed = 0;
  try {
    const keys: string[] = [];
    for (let i = 0; i < browserLocalStorage.length; i++) {
      const k = browserLocalStorage.key(i);
      if (k && k.startsWith('edu_sys_') && !BROWSER_PERSISTENT_KEYS.has(k)) keys.push(k);
    }
    keys.forEach((k) => {
      try { browserLocalStorage.removeItem(k); removed++; } catch {}
    });
  } catch {}
  return removed;
}

// Çıkışta sekmedeki tüm uygulama verilerini siler
function clearSessionAppData(): void {
  if (!browserSessionStorage) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < browserSessionStorage.length; i++) {
      const k = browserSessionStorage.key(i);
      if (k && k.startsWith('edu_sys_')) keys.push(k);
    }
    keys.forEach((k) => {
      try { browserSessionStorage.removeItem(k); } catch {}
    });
  } catch {}
}

// Cihaz kimliği (Hardware / Browser Fingerprint ID)
// Başka bilgisayar veya telefondan açıldığında kullanıcıların otomatik çıkmasını önler
function getLocalDeviceId(): string {
  try {
    let id = localStorage.getItem(STORAGE_KEYS.DEVICE_ID);
    if (!id) {
      id = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 10);
      localStorage.setItem(STORAGE_KEYS.DEVICE_ID, id);
    }
    return id;
  } catch {
    return 'volatile_device';
  }
}

const LEGACY_VERSIONS = ['_v5', '_v4', '_v3', '_v2', '_v1', ''];

export const PERMANENT_KEYS = {
  MASTER_STUDENTS: 'edu_sys_master_students_permanent',
  MASTER_CLASSES: 'edu_sys_master_classes_permanent',
  MASTER_TEACHERS: 'edu_sys_master_teachers_permanent',
  MASTER_ETUTS: 'edu_sys_master_etuts_permanent',
  MASTER_GRADES: 'edu_sys_master_grades_permanent',
  MASTER_HOMEWORK: 'edu_sys_master_homework_permanent',
  MASTER_ATTENDANCE: 'edu_sys_master_attendance_permanent',
  MASTER_SUBMISSIONS: 'edu_sys_master_submissions_permanent',
  MASTER_QUESTION_LOGS: 'edu_sys_master_question_logs_permanent',
  MASTER_DOCUMENTS: 'edu_sys_master_documents_permanent',
  DELETED_STUDENTS: 'edu_sys_master_deleted_students_permanent',
  DELETED_CLASSES: 'edu_sys_master_deleted_classes_permanent',
  DELETED_QUESTION_LOGS: 'edu_sys_master_deleted_question_logs_permanent',
};

// Safely clean up old versioned keys to free storage quota, but NEVER delete user data
function cleanUpLegacyKeys(): void {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.includes('_v1') || k.includes('_v2') || k.includes('_v3') || k.includes('_v4') || k.includes('_v5'))) {
        // CRITICAL: NEVER DELETE STUDENTS, CLASSES, TEACHERS, ETUTS, GRADES OR USER DATA KEYS
        if (
          k.includes('student') ||
          k.includes('class') ||
          k.includes('teacher') ||
          k.includes('homework') ||
          k.includes('submission') ||
          k.includes('etut') ||
          k.includes('grade') ||
          k.includes('not') ||
          k.includes('attendance') ||
          k.includes('document') ||
          k.includes('question') ||
          k.includes('master') ||
          k.includes('permanent') ||
          k.includes('backup')
        ) {
          continue;
        }
        keysToRemove.push(k);
      }
    }
    for (const k of keysToRemove) {
      localStorage.removeItem(k);
    }
  } catch (e) {
    console.error('Error cleaning legacy storage keys:', e);
  }
}

// Resilient student loader (Strictly prevents resurrection of deleted or legacy dummy students)
function loadStudentsWithResilience(): Student[] {
  try {
    let loaded: Student[] = [];
    const direct = localStorage.getItem(STORAGE_KEYS.STUDENTS);
    if (direct) {
      try {
        const parsed = JSON.parse(direct);
        if (Array.isArray(parsed) && parsed.length > 0) {
          loaded = parsed;
        }
      } catch (e) {
        console.warn('Direct student parse error:', e);
      }
    }

    if (loaded.length === 0) {
      const master = localStorage.getItem(PERMANENT_KEYS.MASTER_STUDENTS);
      if (master) {
        try {
          const parsed = JSON.parse(master);
          if (Array.isArray(parsed) && parsed.length > 0) {
            loaded = parsed;
          }
        } catch (e) {
          console.warn('Master student parse error:', e);
        }
      }
    }

    // Clean up obsolete legacy version keys once and for all so they never pollute or resurrect
    const studentKeysToCheck = [
      'edu_sys_students_v6',
      'edu_sys_students_v5',
      'edu_sys_students_v4',
      'edu_sys_students_v3',
      'edu_sys_students_v2',
      'edu_sys_students_v1',
      'edu_sys_students',
      'edu_sys_students_backup',
    ];
    studentKeysToCheck.forEach((k) => {
      try { localStorage.removeItem(k); } catch {}
    });

    // Load deleted student IDs to strictly prevent resurrection of deleted students
    const deletedStudentSet = new Set<string>();
    try {
      const rawDel = localStorage.getItem(STORAGE_KEYS.DELETED_STUDENTS) || localStorage.getItem(PERMANENT_KEYS.DELETED_STUDENTS);
      if (rawDel) {
        const parsedDel = JSON.parse(rawDel);
        if (Array.isArray(parsedDel)) {
          parsedDel.forEach((id: string) => deletedStudentSet.add(id));
        }
      }
    } catch {}

    const result = loaded.filter((s) => s && s.id && !deletedStudentSet.has(s.id));
    return result;
  } catch (e) {
    console.error('Error in loadStudentsWithResilience:', e);
    return [];
  }
}

// Resilient class loader (Deduplicated strictly by canonical class name, no stale resurrection)
function loadClassesWithResilience(): ClassGroup[] {
  try {
    let loaded: ClassGroup[] = [];
    const direct = localStorage.getItem(STORAGE_KEYS.CLASSES);
    if (direct) {
      try {
        const parsed = JSON.parse(direct);
        if (Array.isArray(parsed) && parsed.length > 0) {
          loaded = parsed;
        }
      } catch (e) {
        console.warn('Direct class parse error:', e);
      }
    }

    if (loaded.length === 0) {
      const master = localStorage.getItem(PERMANENT_KEYS.MASTER_CLASSES);
      if (master) {
        try {
          const parsed = JSON.parse(master);
          if (Array.isArray(parsed) && parsed.length > 0) {
            loaded = parsed;
          }
        } catch {}
      }
    }

    // Clean up obsolete legacy version keys once and for all
    const classKeysToCheck = [
      'edu_sys_classes_v6',
      'edu_sys_classes_v5',
      'edu_sys_classes_v4',
      'edu_sys_classes_v3',
      'edu_sys_classes_v2',
      'edu_sys_classes_v1',
      'edu_sys_classes',
      'edu_sys_classes_backup',
    ];
    classKeysToCheck.forEach((k) => {
      try { localStorage.removeItem(k); } catch {}
    });

    // Load deleted class IDs to strictly prevent resurrection of deleted classes
    const deletedClassSet = new Set<string>();
    try {
      const rawDel = localStorage.getItem(STORAGE_KEYS.DELETED_CLASSES) || localStorage.getItem(PERMANENT_KEYS.DELETED_CLASSES);
      if (rawDel) {
        const parsedDel = JSON.parse(rawDel);
        if (Array.isArray(parsedDel)) {
          parsedDel.forEach((id: string) => deletedClassSet.add(id));
        }
      }
    } catch {}

    // Deduplicate strictly by normalized name (e.g. only one "8/A", one "8/B", etc.)
    const normClassMap = new Map<string, ClassGroup>();
    for (const c of loaded) {
      if (!c || !c.id || deletedClassSet.has(c.id)) continue;
      const norm = (c.name || '').trim().toLowerCase().replace(/[\s\-_/\\.]/g, '');
      if (!norm || norm === 'sinif' || norm === 'atanmadi' || norm === 'tanimsiz') continue;
      if (!normClassMap.has(norm)) {
        normClassMap.set(norm, c);
      }
    }

    const result = Array.from(normClassMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name, 'tr', { numeric: true })
    );

    return result;
  } catch (e) {
    console.error('Error in loadClassesWithResilience:', e);
    return [];
  }
}

// Resilient teacher loader across versioned, master, and legacy keys
function loadTeachersWithResilience(): Teacher[] {
  try {
    let loaded: Teacher[] = [];
    const direct = localStorage.getItem(STORAGE_KEYS.TEACHERS);
    if (direct) {
      try {
        const parsed = JSON.parse(direct);
        if (Array.isArray(parsed) && parsed.length > 0) loaded = parsed;
      } catch {}
    }
    if (loaded.length === 0) {
      const master = localStorage.getItem(PERMANENT_KEYS.MASTER_TEACHERS);
      if (master) {
        try {
          const parsed = JSON.parse(master);
          if (Array.isArray(parsed) && parsed.length > 0) loaded = parsed;
        } catch {}
      }
    }
    const teacherKeys = [
      'edu_sys_teachers_v6', 'edu_sys_teachers_v5', 'edu_sys_teachers_v4',
      'edu_sys_teachers_v3', 'edu_sys_teachers_v2', 'edu_sys_teachers_v1',
      'edu_sys_teachers', 'edu_sys_teachers_backup',
    ];
    const teacherMap = new Map<string, Teacher>();
    loaded.forEach((t) => { if (t && t.id) teacherMap.set(t.id, t); });
    for (const k of teacherKeys) {
      const val = localStorage.getItem(k);
      if (val) {
        try {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed)) {
            parsed.forEach((t: Teacher) => {
              if (t && t.id && !teacherMap.has(t.id)) teacherMap.set(t.id, t);
            });
          }
        } catch {}
      }
    }
    return Array.from(teacherMap.values());
  } catch (e) {
    console.error('Error in loadTeachersWithResilience:', e);
    return [];
  }
}

// Resilient etut loader across versioned, master, and legacy keys
function loadEtutsWithResilience(): Etut[] {
  try {
    let loaded: Etut[] = [];
    const direct = localStorage.getItem(STORAGE_KEYS.ETUTS);
    if (direct) {
      try {
        const parsed = JSON.parse(direct);
        if (Array.isArray(parsed) && parsed.length > 0) loaded = parsed;
      } catch {}
    }
    if (loaded.length === 0) {
      const master = localStorage.getItem(PERMANENT_KEYS.MASTER_ETUTS);
      if (master) {
        try {
          const parsed = JSON.parse(master);
          if (Array.isArray(parsed) && parsed.length > 0) loaded = parsed;
        } catch {}
      }
    }
    const etutKeys = [
      'edu_sys_etuts_v6', 'edu_sys_etuts_v5', 'edu_sys_etuts_v4',
      'edu_sys_etuts_v3', 'edu_sys_etuts_v2', 'edu_sys_etuts_v1',
      'edu_sys_etuts', 'edu_sys_etuts_backup',
    ];
    const etutMap = new Map<string, Etut>();
    loaded.forEach((e) => { if (e && e.id) etutMap.set(e.id, e); });
    for (const k of etutKeys) {
      const val = localStorage.getItem(k);
      if (val) {
        try {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed)) {
            parsed.forEach((e: Etut) => {
              if (e && e.id && !etutMap.has(e.id)) etutMap.set(e.id, e);
            });
          }
        } catch {}
      }
    }
    return Array.from(etutMap.values());
  } catch (e) {
    console.error('Error in loadEtutsWithResilience:', e);
    return [];
  }
}

// Resilient grade loader across versioned, master, and legacy keys
function loadGradesWithResilience(): GradeRecord[] {
  try {
    let loaded: GradeRecord[] = [];
    const direct = localStorage.getItem(STORAGE_KEYS.GRADES);
    if (direct) {
      try {
        const parsed = JSON.parse(direct);
        if (Array.isArray(parsed) && parsed.length > 0) loaded = parsed;
      } catch {}
    }
    if (loaded.length === 0) {
      const master = localStorage.getItem(PERMANENT_KEYS.MASTER_GRADES);
      if (master) {
        try {
          const parsed = JSON.parse(master);
          if (Array.isArray(parsed) && parsed.length > 0) loaded = parsed;
        } catch {}
      }
    }
    const gradeKeys = [
      'edu_sys_grades_v6', 'edu_sys_grades_v5', 'edu_sys_grades_v4',
      'edu_sys_grades_v3', 'edu_sys_grades_v2', 'edu_sys_grades_v1',
      'edu_sys_grades', 'edu_sys_grades_backup',
    ];
    const gradeMap = new Map<string, GradeRecord>();
    loaded.forEach((g) => { if (g && g.id) gradeMap.set(g.id, g); });
    for (const k of gradeKeys) {
      const val = localStorage.getItem(k);
      if (val) {
        try {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed)) {
            parsed.forEach((g: GradeRecord) => {
              if (g && g.id && !gradeMap.has(g.id)) gradeMap.set(g.id, g);
            });
          }
        } catch {}
      }
    }
    return Array.from(gradeMap.values());
  } catch (e) {
    console.error('Error in loadGradesWithResilience:', e);
    return [];
  }
}

// Resilient homework loader
function loadHomeworkWithResilience(): Homework[] {
  try {
    let loaded: Homework[] = [];
    const direct = localStorage.getItem(STORAGE_KEYS.HOMEWORK);
    if (direct) {
      try {
        const parsed = JSON.parse(direct);
        if (Array.isArray(parsed) && parsed.length > 0) loaded = parsed;
      } catch {}
    }
    if (loaded.length === 0) {
      const master = localStorage.getItem(PERMANENT_KEYS.MASTER_HOMEWORK);
      if (master) {
        try {
          const parsed = JSON.parse(master);
          if (Array.isArray(parsed) && parsed.length > 0) loaded = parsed;
        } catch {}
      }
    }
    const hwKeys = [
      'edu_sys_homework_v6', 'edu_sys_homework_v5', 'edu_sys_homework_v4',
      'edu_sys_homework_v3', 'edu_sys_homework_v2', 'edu_sys_homework_v1',
      'edu_sys_homework', 'edu_sys_homework_backup',
    ];
    const hwMap = new Map<string, Homework>();
    loaded.forEach((h) => { if (h && h.id) hwMap.set(h.id, h); });
    for (const k of hwKeys) {
      const val = localStorage.getItem(k);
      if (val) {
        try {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed)) {
            parsed.forEach((h: Homework) => {
              if (h && h.id && !hwMap.has(h.id)) hwMap.set(h.id, h);
            });
          }
        } catch {}
      }
    }
    return Array.from(hwMap.values());
  } catch (e) {
    console.error('Error in loadHomeworkWithResilience:', e);
    return [];
  }
}

// Resilient attendance loader
function loadAttendanceWithResilience(): AttendanceRecord[] {
  try {
    let loaded: AttendanceRecord[] = [];
    const direct = localStorage.getItem(STORAGE_KEYS.ATTENDANCE);
    if (direct) {
      try {
        const parsed = JSON.parse(direct);
        if (Array.isArray(parsed) && parsed.length > 0) loaded = parsed;
      } catch {}
    }
    if (loaded.length === 0) {
      const master = localStorage.getItem(PERMANENT_KEYS.MASTER_ATTENDANCE);
      if (master) {
        try {
          const parsed = JSON.parse(master);
          if (Array.isArray(parsed) && parsed.length > 0) loaded = parsed;
        } catch {}
      }
    }
    const attKeys = [
      'edu_sys_attendance_v6', 'edu_sys_attendance_v5', 'edu_sys_attendance_v4',
      'edu_sys_attendance_v3', 'edu_sys_attendance_v2', 'edu_sys_attendance_v1',
      'edu_sys_attendance', 'edu_sys_attendance_backup',
    ];
    const attMap = new Map<string, AttendanceRecord>();
    loaded.forEach((a) => { if (a && a.id) attMap.set(a.id, a); });
    for (const k of attKeys) {
      const val = localStorage.getItem(k);
      if (val) {
        try {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed)) {
            parsed.forEach((a: AttendanceRecord) => {
              if (a && a.id && !attMap.has(a.id)) attMap.set(a.id, a);
            });
          }
        } catch {}
      }
    }
    return Array.from(attMap.values());
  } catch (e) {
    console.error('Error in loadAttendanceWithResilience:', e);
    return [];
  }
}

// Resilient question logs loader across versioned, master, and legacy keys
function loadQuestionLogsWithResilience(): StudentQuestionLog[] {
  try {
    const deletedIds = new Set<string>(
      loadDataWithLegacyFallback<string[]>(STORAGE_KEYS.DELETED_QUESTION_LOGS, [])
    );

    const direct = localStorage.getItem(STORAGE_KEYS.QUESTION_LOGS);
    if (direct !== null) {
      try {
        const parsed = JSON.parse(direct);
        if (Array.isArray(parsed)) {
          return parsed.filter((q) => q && q.id && !deletedIds.has(q.id));
        }
      } catch {}
    }

    const master = localStorage.getItem(PERMANENT_KEYS.MASTER_QUESTION_LOGS);
    if (master !== null) {
      try {
        const parsed = JSON.parse(master);
        if (Array.isArray(parsed)) {
          return parsed.filter((q) => q && q.id && !deletedIds.has(q.id));
        }
      } catch {}
    }

    return [];
  } catch (e) {
    console.error('Error in loadQuestionLogsWithResilience:', e);
    return [];
  }
}

// Safe storage getter and setter with multi-version fallback and auto-migration
function loadData<T>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(key);
    if (item === null || item === undefined) return defaultValue;
    return JSON.parse(item);
  } catch (e) {
    console.error(`Error loading key ${key}:`, e);
    return defaultValue;
  }
}

function loadDataWithLegacyFallback<T>(key: string, defaultValue: T): T {
  try {
    const direct = localStorage.getItem(key);
    if (direct !== null && direct !== undefined) {
      return JSON.parse(direct);
    }
    for (const ver of LEGACY_VERSIONS) {
      if (!ver) continue;
      const legacyKey = key.replace(/_v\d+$/, ver);
      if (legacyKey === key) continue;
      const legacyVal = localStorage.getItem(legacyKey);
      if (legacyVal !== null && legacyVal !== undefined) {
        const parsed = JSON.parse(legacyVal);
        try {
          localStorage.setItem(key, JSON.stringify(parsed));
        } catch {
          // ignore
        }
        return parsed;
      }
    }
  } catch (e) {
    console.error(`Error loading key with legacy fallback ${key}:`, e);
  }
  return defaultValue;
}

function isAlreadyInitialized(): boolean {
  try {
    if (localStorage.getItem(STORAGE_KEYS.IS_SEEDED) === 'true') return true;

    const seedKeys = [
      'edu_sys_seeded_v5',
      'edu_sys_seeded_v4',
      'edu_sys_seeded_v3',
      'edu_sys_seeded_v2',
      'edu_sys_seeded_v1',
      'edu_sys_seeded',
    ];
    for (const k of seedKeys) {
      if (localStorage.getItem(k) === 'true') return true;
    }

    const checkKeys = [
      STORAGE_KEYS.CLASSES,
      'edu_sys_classes_v4',
      'edu_sys_classes_v3',
      'edu_sys_classes',
      STORAGE_KEYS.TEACHERS,
      'edu_sys_teachers_v4',
      'edu_sys_teachers_v3',
      'edu_sys_teachers',
    ];
    for (const k of checkKeys) {
      const item = localStorage.getItem(k);
      if (item !== null && item !== undefined) {
        return true;
      }
    }
  } catch (e) {
    console.error('Error checking init status:', e);
  }
  return false;
}

function saveData<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    if (key === STORAGE_KEYS.STUDENTS) {
      try { localStorage.setItem(PERMANENT_KEYS.MASTER_STUDENTS, JSON.stringify(data)); } catch {}
    } else if (key === STORAGE_KEYS.CLASSES) {
      try { localStorage.setItem(PERMANENT_KEYS.MASTER_CLASSES, JSON.stringify(data)); } catch {}
    } else if (key === STORAGE_KEYS.TEACHERS) {
      try { localStorage.setItem(PERMANENT_KEYS.MASTER_TEACHERS, JSON.stringify(data)); } catch {}
    } else if (key === STORAGE_KEYS.ETUTS) {
      try { localStorage.setItem(PERMANENT_KEYS.MASTER_ETUTS, JSON.stringify(data)); } catch {}
    } else if (key === STORAGE_KEYS.GRADES) {
      try { localStorage.setItem(PERMANENT_KEYS.MASTER_GRADES, JSON.stringify(data)); } catch {}
    } else if (key === STORAGE_KEYS.HOMEWORK) {
      try { localStorage.setItem(PERMANENT_KEYS.MASTER_HOMEWORK, JSON.stringify(data)); } catch {}
    } else if (key === STORAGE_KEYS.ATTENDANCE) {
      try { localStorage.setItem(PERMANENT_KEYS.MASTER_ATTENDANCE, JSON.stringify(data)); } catch {}
    } else if (key === STORAGE_KEYS.SUBMISSIONS) {
      try { localStorage.setItem(PERMANENT_KEYS.MASTER_SUBMISSIONS, JSON.stringify(data)); } catch {}
    } else if (key === STORAGE_KEYS.QUESTION_LOGS) {
      try { localStorage.setItem(PERMANENT_KEYS.MASTER_QUESTION_LOGS, JSON.stringify(data)); } catch {}
    } else if (key === STORAGE_KEYS.DOCUMENTS) {
      try { localStorage.setItem(PERMANENT_KEYS.MASTER_DOCUMENTS, JSON.stringify(data)); } catch {}
    }
  } catch (e) {
    console.warn(`Quota or write issue when saving ${key}. Freeing legacy storage and retrying...`, e);
    try {
      cleanUpLegacyKeys();
      localStorage.setItem(key, JSON.stringify(data));
    } catch (retryErr) {
      console.error(`Persistent save error for ${key}:`, retryErr);
    }
  }
}

export class DataService {
  private static instance: DataService;

  public teachers: Teacher[] = [];
  public classes: ClassGroup[] = [];
  public students: Student[] = [];
  public homeworks: Homework[] = [];
  public submissions: HomeworkSubmission[] = [];
  public etuts: Etut[] = [];
  public attendance: AttendanceRecord[] = [];
  public grades: GradeRecord[] = [];
  public messages: StudentMessage[] = [];
  public documents: TeacherDocument[] = [];
  public studentNotifications: StudentNotification[] = [];
  public sentEmails: SentEmailLog[] = [];
  public questionLogs: StudentQuestionLog[] = [];
  public weeklyQuestionTargets: WeeklyQuestionTarget[] = [];
  public deletedTeacherIds: Set<string> = new Set();
  public deletedStudentIds: Set<string> = new Set();
  public deletedClassIds: Set<string> = new Set();
  public deletedHomeworkIds: Set<string> = new Set();
  public deletedEtutIds: Set<string> = new Set();
  public deletedQuestionLogIds: Set<string> = new Set();

  private syncPollInterval: number | null = null;
  private classSyncInterval: number | null = null;

  private listeners: (() => void)[] = [];
  private lastSyncTimestamp: number = Date.now();
  private sessionDeviceId: string = '';

  private constructor() {
    this.purgeSavedPasswords();
    this.initData();
    // Dosya açma/indirme hataları (görüntüleyici bileşenlerden) kullanıcıya gösterilir
    if (typeof window !== 'undefined') {
      window.addEventListener('app-file-error', (e: Event) => {
        const msg = (e as CustomEvent).detail;
        this.showFloatingErrorToast(`Hata: ${msg || 'Dosya açılamadı.'}`);
      });
    }
  }

  // GÜVENLİK: "Beni Hatırla" için daha önce tarayıcıya açık metin kaydedilmiş şifreleri sil.
  private purgeSavedPasswords(): void {
    if (typeof localStorage === 'undefined') return;
    ['edu_sys_remember_me_v6', 'edu_sys_remember_me_teacher_v6', 'edu_sys_remember_me_student_v6'].forEach((key) => {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && 'savedPassword' in parsed) {
          delete parsed.savedPassword;
          localStorage.setItem(key, JSON.stringify(parsed));
        }
      } catch {
        // bozuk kayıt: tamamen kaldır
        try { localStorage.removeItem(key); } catch {}
      }
    });
  }

  public static getInstance(): DataService {
    if (!DataService.instance) {
      DataService.instance = new DataService();
    }
    return DataService.instance;
  }

  private initData() {
    // Eski sürümlerin tarayıcıda kalıcı bıraktığı kişisel veri önbelleklerini temizle (Aşama 7)
    purgePersistentPersonalData();

    this.deletedTeacherIds = new Set(loadDataWithLegacyFallback<string[]>(STORAGE_KEYS.DELETED_TEACHERS, []));
    this.deletedStudentIds = new Set(loadDataWithLegacyFallback<string[]>(STORAGE_KEYS.DELETED_STUDENTS, []));
    this.deletedClassIds = new Set(loadDataWithLegacyFallback<string[]>(STORAGE_KEYS.DELETED_CLASSES, []));
    this.deletedHomeworkIds = new Set(loadDataWithLegacyFallback<string[]>(STORAGE_KEYS.DELETED_HOMEWORK, []));
    this.deletedEtutIds = new Set(loadDataWithLegacyFallback<string[]>(STORAGE_KEYS.DELETED_ETUTS, []));
    this.deletedQuestionLogIds = new Set(loadDataWithLegacyFallback<string[]>(STORAGE_KEYS.DELETED_QUESTION_LOGS, []));

    // Load resiliently across all storage keys
    const resilientStudents = loadStudentsWithResilience();
    const resilientClasses = loadClassesWithResilience();
    const resilientTeachers = loadTeachersWithResilience();
    const resilientEtuts = loadEtutsWithResilience();
    const resilientGrades = loadGradesWithResilience();
    const resilientHomework = loadHomeworkWithResilience();
    const resilientAttendance = loadAttendanceWithResilience();
    const resilientQuestionLogs = loadQuestionLogsWithResilience();

    // Load strictly what is saved in storage or fetch from central DB; NEVER seed dummy demo students or classes
    this.teachers = resilientTeachers.length > 0 ? resilientTeachers : loadDataWithLegacyFallback(STORAGE_KEYS.TEACHERS, INITIAL_TEACHERS);
      if (!this.teachers || this.teachers.length === 0) {
        this.teachers = INITIAL_TEACHERS.map((t) => ({ ...t, status: 'approved' as const }));
        saveData(STORAGE_KEYS.TEACHERS, this.teachers);
      }
      this.classes = resilientClasses.length > 0 ? resilientClasses : loadDataWithLegacyFallback(STORAGE_KEYS.CLASSES, []);
      this.students = resilientStudents.length > 0 ? resilientStudents : loadDataWithLegacyFallback(STORAGE_KEYS.STUDENTS, []);
      this.homeworks = resilientHomework.length > 0 ? resilientHomework : loadDataWithLegacyFallback(STORAGE_KEYS.HOMEWORK, []);
      this.submissions = loadDataWithLegacyFallback(STORAGE_KEYS.SUBMISSIONS, []);
      this.etuts = resilientEtuts.length > 0 ? resilientEtuts : loadDataWithLegacyFallback(STORAGE_KEYS.ETUTS, []);
      this.attendance = resilientAttendance.length > 0 ? resilientAttendance : loadDataWithLegacyFallback(STORAGE_KEYS.ATTENDANCE, []);
      this.grades = resilientGrades.length > 0 ? resilientGrades : loadDataWithLegacyFallback(STORAGE_KEYS.GRADES, []);
      this.messages = loadDataWithLegacyFallback(STORAGE_KEYS.MESSAGES, []);
      // Eski sürümler belgeleri dosya içerikleriyle birlikte tarayıcıda saklıyordu; yalnız bilgiler tutulur
      const cachedDocs: TeacherDocument[] = loadDataWithLegacyFallback(STORAGE_KEYS.DOCUMENTS, []);
      this.documents = (Array.isArray(cachedDocs) ? cachedDocs : []).map(
        ({ fileData, htmlPreview, tableSheets, ...rest }) => rest as TeacherDocument
      );
      if (Array.isArray(cachedDocs) && cachedDocs.some((d) => d && (d.fileData || d.htmlPreview || d.tableSheets))) {
        try { saveData(STORAGE_KEYS.DOCUMENTS, this.documents); } catch {}
      }
      this.studentNotifications = loadDataWithLegacyFallback(STORAGE_KEYS.STUDENT_NOTIFICATIONS, []);
      this.sentEmails = loadDataWithLegacyFallback(STORAGE_KEYS.SENT_EMAILS, []);
      this.questionLogs = resilientQuestionLogs.length > 0 ? resilientQuestionLogs : loadDataWithLegacyFallback(STORAGE_KEYS.QUESTION_LOGS, []);
      this.weeklyQuestionTargets = loadDataWithLegacyFallback(STORAGE_KEYS.WEEKLY_QUESTION_TARGETS, []);

      // Sistem tarafından otomatik yüklenen demo/seed soru kayıtlarını ve soru sayısı 0 olan boş kayıtları temizle
      const prevLogsCount = this.questionLogs.length;
      this.questionLogs = this.questionLogs.filter((q) => {
        const isAutoSeeded =
          q.id.startsWith(`qlog-${q.studentId}-`) ||
          q.id.startsWith('qlog-seed-') ||
          q.notes === 'Hedef soru sayısı başarıyla aşıldı.' ||
          q.notes === 'Günlük soru hedefi tamamlandı.';
        const hasZeroQuestions = !q.totalQuestions || q.totalQuestions <= 0;
        return !isAutoSeeded && !hasZeroQuestions;
      });
      if (this.questionLogs.length !== prevLogsCount) {
        saveData(STORAGE_KEYS.QUESTION_LOGS, this.questionLogs);
      }

      // Filter out any IDs recorded as deleted
      this.teachers = this.teachers.filter((t) => !this.deletedTeacherIds.has(t.id));
      this.classes = this.classes.filter((c) => !this.deletedClassIds.has(c.id));
      this.students = this.students.filter((s) => !this.deletedStudentIds.has(s.id));
      this.homeworks = this.homeworks.filter((h) => !this.deletedHomeworkIds.has(h.id));
      this.etuts = this.etuts.filter((e) => !this.deletedEtutIds.has(e.id));
      this.questionLogs = this.questionLogs.filter((q) => !this.deletedQuestionLogIds.has(q.id));

      // Apply any saved custom teacher profile overrides from dedicated local storage
      this.teachers = this.teachers.map((t) => {
        try {
          const specific = localStorage.getItem(`edu_sys_teacher_custom_profile_${t.id}`);
          if (specific) {
            const parsed = JSON.parse(specific);
            return { ...t, ...parsed };
          }
        } catch {
          // ignore
        }
        return t;
      });

      // Yönetici yetkisi yalnızca kayıttaki işaretten (is_admin / oturum rolü) ya da yönetici e-postasından gelir.
      // (Eskiden isme bakılıyordu; aynı isimde biri yönetici ekranlarını görebiliyordu.)
      this.teachers = this.teachers.map((t) => ({
        ...t,
        isAdmin: this.isTeacherAdmin(t),
        assignedClassIds: t.assignedClassIds || [],
      }));

      saveData(STORAGE_KEYS.TEACHERS, this.teachers);

      // Migration: Ensure students have createdTeacherId if missing (default to teacher-1)
      let studentsModified = false;
      this.students = this.students.map((s) => {
        if (!s.createdTeacherId) {
          studentsModified = true;
          return { ...s, createdTeacherId: 'teacher-1' };
        }
        return s;
      });
      if (studentsModified) {
        saveData(STORAGE_KEYS.STUDENTS, this.students);
      }

      // Migration: Ensure classes have createdTeacherId if missing
      let classesModified = false;
      this.classes = this.classes.map((c) => {
        if (!c.createdTeacherId) {
          classesModified = true;
          return { ...c, createdTeacherId: 'teacher-1' };
        }
        return c;
      });
      if (classesModified) {
        saveData(STORAGE_KEYS.CLASSES, this.classes);
      }

      saveData(STORAGE_KEYS.IS_SEEDED, 'true');

    // Migration: Önceden sistem tarafından rastgele atanmış sahte/otomatik mailleri temizle ve 54321 şifrelerini ilk girişte zorunlu güncellemeye al
    let studentsEmailCleaned = false;
    this.students = this.students.map((s) => {
      let updated = { ...s };
      let changed = false;
      const cleanedMail = cleanStudentEmail(s.email);
      if (s.email !== cleanedMail) {
        updated.email = cleanedMail;
        changed = true;
      }
      // Şifreler tarayıcıda tutulmaz (eski sürüm kalıntısı temizlenir)
      if (updated.password) {
        delete updated.password;
        changed = true;
      }
      if (changed) {
        studentsEmailCleaned = true;
        return updated;
      }
      return s;
    });
    if (studentsEmailCleaned) {
      saveData(STORAGE_KEYS.STUDENTS, this.students);
      try {
        localStorage.setItem(PERMANENT_KEYS.MASTER_STUDENTS, JSON.stringify(this.students));
      } catch {}
    }

    // Clean up any old duplicate legacy version keys to keep storage lean and prevent quota limit errors
    cleanUpLegacyKeys();

    if (this.studentNotifications.length === 0 && this.homeworks.length > 0) {
      this.seedInitialNotifications();
    }

    // Background sync with Supabase and Realtime setup
    this.setupAllRealtimeSync();
    this.revalidateAndSyncAll(true);

    // Cross-tab synchronization for teacher registrations and status changes
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key === STORAGE_KEYS.TEACHERS) {
          const reloaded = loadDataWithLegacyFallback(STORAGE_KEYS.TEACHERS, []);
          if (Array.isArray(reloaded) && reloaded.length > 0) {
            const oldPendingCount = this.teachers.filter((t) => t.status === 'pending').length;
            this.teachers = reloaded;
            const newPendingCount = this.teachers.filter((t) => t.status === 'pending').length;
            if (newPendingCount > oldPendingCount) {
              playNotificationChime();
            }
            this.notify();
          }
        }
      });

      // Telefon, tablet veya bilgisayarda ekran açıldığında ya da internet bağlantısı geldiğinde anında eşitle
      window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          this.revalidateAndSyncAll(true);
        }
      });
      window.addEventListener('online', () => {
        // İnternet geri geldi: kanallar onarılır ve veriler hemen yenilenir
        this.ensureRealtime();
        this.revalidateAndSyncAll(false);
      });
      window.addEventListener('offline', () => this.updateRealtimeHealth());
      window.addEventListener('focus', () => {
        this.revalidateAndSyncAll(true);
      });
    }
  }

  // =========================================================================
  // EŞİTLEME YÖNETİCİSİ (Aşama 6)
  // - Anlık güncelleme kanalları oturum başına BİR KEZ kurulur; kopan kanal kendiliğinden onarılır.
  // - Kanallar sağlıklıyken tam eşitleme 5 dakikada bir (güvence), değilken 30 saniyede bir yapılır.
  // - Sekmeye dönüş / odak gibi olaylarda en fazla 15 saniyede bir tam eşitleme yapılır.
  // - Aynı anda birden fazla tam eşitleme çalışmaz.
  // =========================================================================
  private realtimeChannels: Record<
    string,
    { channel: any; healthy: boolean; everSubscribed: boolean; checkTimer?: ReturnType<typeof setTimeout> }
  > = {};
  private realtimeClosing = false;
  private realtimeEnsureRunning = false;
  private lastRealtimeHealth: 'live' | 'fallback' | 'offline' = 'fallback';
  private static readonly LIVE_SAFETY_SYNC_MS = 5 * 60 * 1000;
  private static readonly FALLBACK_SYNC_MS = 30 * 1000;
  private static readonly MIN_BACKGROUND_SYNC_GAP_MS = 15 * 1000;

  // Hangi tablo değişince ne yapılacağı
  private realtimeTableConfig(): Array<{ table: string; onEvent: (payload: any) => void; resync: () => unknown }> {
    const role = this.getAuthSession()?.role;
    const list: Array<{ table: string; onEvent: (payload: any) => void; resync: () => unknown }> = [
      { table: 'students', onEvent: (p) => this.handleRemoteStudentRealtimeEvent(p), resync: () => this.syncStudentsFromSupabase(true) },
      { table: 'classes', onEvent: (p) => this.handleRemoteClassRealtimeEvent(p), resync: () => this.syncClassesFromSupabase(true) },
      { table: 'etuts', onEvent: (p) => this.handleRemoteEtutRealtimeEvent(p), resync: () => this.syncEtutsFromSupabase(true) },
      { table: 'homeworks', onEvent: (p) => this.handleRemoteHomeworkRealtimeEvent(p), resync: () => this.syncHomeworksFromSupabase(true) },
      { table: 'attendance', onEvent: (p) => this.handleRemoteAttendanceRealtimeEvent(p), resync: () => this.syncAttendanceFromSupabase(true) },
      { table: 'grades', onEvent: (p) => this.handleRemoteGradeRealtimeEvent(p), resync: () => this.syncGradesFromSupabase(true) },
      { table: 'messages', onEvent: (p) => this.handleRemoteMessageRealtimeEvent(p), resync: () => this.syncMessagesFromSupabase(true) },
      { table: 'homework_submissions', onEvent: () => this.scheduleTableRefetch('homework_submissions'), resync: () => this.syncSubmissionsFromSupabase(true) },
      { table: 'question_logs', onEvent: () => this.scheduleTableRefetch('question_logs'), resync: () => this.syncQuestionLogsFromSupabase(true) },
      { table: 'question_targets', onEvent: () => this.scheduleTableRefetch('question_targets'), resync: () => this.syncQuestionTargetsFromSupabase(true) },
    ];
    if (role === 'teacher') {
      list.push(
        { table: 'teacher_documents', onEvent: () => this.scheduleTableRefetch('teacher_documents'), resync: () => this.syncTeacherDocumentsFromSupabase(true) },
        { table: 'teachers', onEvent: () => this.scheduleTableRefetch('teachers'), resync: () => this.syncTeachersFromSupabase(true) }
      );
    }
    return list;
  }

  // Eksik ya da kopmuş kanalları kurar; çalışan kanallara dokunmaz (tekrar tekrar çağrılması güvenlidir)
  public async ensureRealtime(): Promise<void> {
    if (this.realtimeEnsureRunning) return;
    if (!this.getAuthSession()) return;
    this.realtimeEnsureRunning = true;
    try {
      if (!(await this.hasCloudSession())) return; // giriş yapılmadan kanal açılmaz (RLS zaten boş döndürür)
      this.realtimeClosing = false;
      for (const cfg of this.realtimeTableConfig()) {
        const entry = this.realtimeChannels[cfg.table];
        const state = entry?.channel?.state;
        if (entry && (state === 'joined' || state === 'joining')) continue;
        if (entry) {
          if (entry.checkTimer) clearTimeout(entry.checkTimer);
          try { supabase.removeChannel(entry.channel); } catch {}
        }
        const record = { channel: null as any, healthy: false, everSubscribed: entry?.everSubscribed || false } as {
          channel: any; healthy: boolean; everSubscribed: boolean; checkTimer?: ReturnType<typeof setTimeout>;
        };
        this.realtimeChannels[cfg.table] = record;
        try {
          record.channel = supabase
            .channel(`rt-${cfg.table}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: cfg.table }, (payload: any) => {
              try { cfg.onEvent(payload); } catch (e) { console.warn(`[Realtime] ${cfg.table} olayı işlenemedi:`, e); }
            })
            .subscribe((status: string) => this.handleChannelStatus(cfg.table, status, cfg.resync));
        } catch (e) {
          console.warn(`[Realtime] ${cfg.table} kanalı kurulamadı:`, e);
        }
      }
    } finally {
      this.realtimeEnsureRunning = false;
      this.updateRealtimeHealth();
    }
  }

  private handleChannelStatus(table: string, status: string, resync: () => unknown): void {
    const entry = this.realtimeChannels[table];
    if (!entry) return;
    if (status === 'SUBSCRIBED') {
      const isReconnect = entry.everSubscribed && !entry.healthy;
      entry.healthy = true;
      entry.everSubscribed = true;
      if (entry.checkTimer) { clearTimeout(entry.checkTimer); entry.checkTimer = undefined; }
      // Bağlantı koptuysa arada kaçan değişiklikler için yalnız bu tablo yeniden okunur
      if (isReconnect) {
        try { resync(); } catch {}
      }
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      entry.healthy = false;
      if (!this.realtimeClosing && !entry.checkTimer) {
        // Kütüphane kendisi yeniden bağlanmayı dener; 20 sn içinde olmazsa kanal yeniden kurulur
        entry.checkTimer = setTimeout(() => {
          entry.checkTimer = undefined;
          const st = entry.channel?.state;
          if (!this.realtimeClosing && st !== 'joined' && st !== 'joining') this.ensureRealtime();
        }, 20000);
      }
    }
    this.updateRealtimeHealth();
  }

  // Eşitleme durumu: 'live' (anlık), 'fallback' (aralıklı yedek kontrol), 'offline' (internet yok)
  public getRealtimeHealth(): 'live' | 'fallback' | 'offline' {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
    const entries = Object.values(this.realtimeChannels);
    if (entries.length > 0 && entries.every((e) => e.healthy)) return 'live';
    return 'fallback';
  }

  private updateRealtimeHealth(): void {
    const h = this.getRealtimeHealth();
    if (h !== this.lastRealtimeHealth) {
      this.lastRealtimeHealth = h;
      this.notify();
    }
  }

  public setupAllRealtimeSync(): void {
    this.ensureRealtime();
    this.startPeriodicSync();
  }

  public unsubscribeAllRealtime(): void {
    this.realtimeClosing = true;
    Object.values(this.realtimeChannels).forEach((entry) => {
      if (entry.checkTimer) clearTimeout(entry.checkTimer);
      try { if (entry.channel) supabase.removeChannel(entry.channel); } catch {}
    });
    this.realtimeChannels = {};
    this.updateRealtimeHealth();
  }

  // Yedek kontrol: kanallar sağlıklıysa 5 dakikada bir, değilse 30 saniyede bir tam eşitleme.
  // Sekme arka plandayken hiç istek atılmaz (geri gelince hemen eşitlenir).
  public startPeriodicSync(): void {
    if (this.syncPollInterval) return;
    if (typeof window === 'undefined') return;
    this.syncPollInterval = window.setInterval(() => {
      if (!this.getAuthSession()) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const health = this.getRealtimeHealth();
      if (health === 'offline') return;
      const age = Date.now() - this.lastFullSyncAt;
      const due = health === 'live' ? DataService.LIVE_SAFETY_SYNC_MS : DataService.FALLBACK_SYNC_MS;
      if (age >= due) this.revalidateAndSyncAll(true);
      else if (health !== 'live') this.ensureRealtime();
    }, 10000);
  }

  // Eski adlar (başka dosyalardan çağrılabilir diye korunur)
  public setupTeachersRealtimeSync() {
    this.ensureRealtime();
  }
  public startPeriodicTeachersSync() {}
  public startPeriodicEtutsSync() {}
  public startPeriodicStudentsSync() {}

  public handleRemoteStudentRealtimeEvent(payload: any) {
    try {
      const eventType = payload.eventType; // 'INSERT' | 'UPDATE' | 'DELETE'
      if (eventType === 'DELETE') {
        const oldRow = payload.old;
        if (oldRow?.id) {
          this.deletedStudentIds.add(oldRow.id);
          saveData(STORAGE_KEYS.DELETED_STUDENTS, Array.from(this.deletedStudentIds));
          this.students = this.students.filter((s) => s.id !== oldRow.id);
          saveData(STORAGE_KEYS.STUDENTS, this.students);
          try {
            localStorage.setItem(PERMANENT_KEYS.MASTER_STUDENTS, JSON.stringify(this.students));
          } catch {}
          this.notify();
        }
        return;
      }

      const row = payload.new;
      if (!row || !row.id || this.deletedStudentIds.has(row.id)) return;

      const cleanRemoteEmail = cleanStudentEmail(row.email);
      const existingIdx = this.students.findIndex((s) => s.id === row.id);

      if (existingIdx !== -1) {
        const cur = this.students[existingIdx];
        this.students[existingIdx] = {
          ...cur,
          name: row.name || cur.name,
          studentNumber: row.student_number || cur.studentNumber,
          className: row.class_name || cur.className,
          classId: row.class_id || cur.classId,
          email: cleanRemoteEmail || cur.email,
          phone: row.phone || cur.phone,
          avatar: row.avatar || cur.avatar,
          schoolLevel: cur.schoolLevel || detectSchoolLevelFromGrade(row.class_name) || 'Ortaokul',
        };
      } else {
        const newStd: Student = {
          id: row.id,
          name: row.name,
          username:
            row.student_number ||
            cleanRemoteEmail?.split('@')[0] ||
            row.name.toLowerCase().replace(/\s+/g, '_'),
          email: cleanRemoteEmail,
          mustChangePassword: false,
          className: row.class_name || 'Genel',
          classId: row.class_id || 'class-default',
          studentNumber: row.student_number || '',
          phone: row.phone || '',
          avatar:
            row.avatar ||
            `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(row.name)}`,
          createdAt: row.registered_at || new Date().toISOString(),
          status: 'active',
          createdTeacherId: 'teacher-1',
          schoolLevel: detectSchoolLevelFromGrade(row.class_name) || 'Ortaokul',
        };
        this.students.push(newStd);
      }
      saveData(STORAGE_KEYS.STUDENTS, this.students);
      try {
        localStorage.setItem(PERMANENT_KEYS.MASTER_STUDENTS, JSON.stringify(this.students));
      } catch {}
      this.notify();
    } catch (err) {
      console.warn('Error handling student realtime event:', err);
    }
  }

  public handleRemoteClassRealtimeEvent(payload: any) {
    try {
      const eventType = payload.eventType; // 'INSERT' | 'UPDATE' | 'DELETE'
      if (eventType === 'DELETE') {
        const oldRow = payload.old;
        if (oldRow?.id) {
          this.deletedClassIds.add(oldRow.id);
          saveData(STORAGE_KEYS.DELETED_CLASSES, Array.from(this.deletedClassIds));
          this.classes = this.classes.filter((c) => c.id !== oldRow.id);
          saveData(STORAGE_KEYS.CLASSES, this.classes);
          try {
            localStorage.setItem(PERMANENT_KEYS.MASTER_CLASSES, JSON.stringify(this.classes));
          } catch {}
          this.notify();
        }
        return;
      }

      const row = payload.new;
      if (!row || !row.id || this.deletedClassIds.has(row.id)) return;

      const normName = (row.name || '').trim().toLowerCase().replace(/[\s\-_/\\.]/g, '');
      if (!normName || normName === 'sinif' || normName === 'atanmadi' || normName === 'tanimsiz') return;

      const existingIdx = this.classes.findIndex(
        (c) => c.id === row.id || (c.name || '').trim().toLowerCase().replace(/[\s\-_/\\.]/g, '') === normName
      );

      const mapped: ClassGroup = {
        id: row.id,
        name: row.name,
        branch: row.branch || 'Genel',
        gradeLevel: row.level ? `${row.level}. Sınıf` : undefined,
        schoolLevel: row.level && row.level >= 9 ? 'Lise' : 'Ortaokul',
        academicYear: row.academic_year || '2026-2027',
        createdTeacherId: 'teacher-1',
      };

      if (existingIdx !== -1) {
        this.classes[existingIdx] = { ...this.classes[existingIdx], ...mapped };
      } else {
        this.classes.push(mapped);
      }
      this.classes = this.deduplicateClasses(this.classes);
      saveData(STORAGE_KEYS.CLASSES, this.classes);
      try {
        localStorage.setItem(PERMANENT_KEYS.MASTER_CLASSES, JSON.stringify(this.classes));
      } catch {}
      this.notify();
    } catch (e) {
      console.warn('Error handling class realtime event:', e);
    }
  }

  // --- TOMBSTONES SYNCHRONIZATION (CROSS-DEVICE GUARANTEE FOR DELETIONS) ---
  public async syncTombstonesToCloud(): Promise<void> {
    try {
      const payload = {
        deletedStudentIds: Array.from(this.deletedStudentIds),
        deletedClassIds: Array.from(this.deletedClassIds),
        deletedQuestionLogIds: Array.from(this.deletedQuestionLogIds),
        updatedAt: new Date().toISOString(),
      };
      await supabase.from('homeworks').upsert({
        id: '__system_sync_tombstones__',
        title: 'Tombstones Sync',
        subject: 'SystemSync',
        description: JSON.stringify(payload),
        assigned_to: '__SYSTEM__',
        due_date: '2099-12-31',
      });
    } catch (e) {
      console.warn('Error syncing tombstones to cloud:', e);
    }
  }

  public async syncTombstonesFromCloud(): Promise<void> {
    // Gerçek (Supabase Auth) oturum yoksa buluttan okuma yapma: RLS boş liste döndürür
    // ve yerel veriler yanlışlıkla silinmiş gibi görünür.
    if (!(await this.hasCloudSession())) return;
    try {
      const { data } = await supabase
        .from('homeworks')
        .select('description')
        .eq('id', '__system_sync_tombstones__')
        .maybeSingle();

      if (data && data.description) {
        try {
          const parsed = JSON.parse(data.description);
          let changed = false;
          if (Array.isArray(parsed.deletedStudentIds)) {
            parsed.deletedStudentIds.forEach((id: string) => {
              if (id && !this.deletedStudentIds.has(id)) {
                this.deletedStudentIds.add(id);
                changed = true;
              }
            });
          }
          if (Array.isArray(parsed.deletedClassIds)) {
            parsed.deletedClassIds.forEach((id: string) => {
              if (id && !this.deletedClassIds.has(id)) {
                this.deletedClassIds.add(id);
                changed = true;
              }
            });
          }
          if (Array.isArray(parsed.deletedQuestionLogIds)) {
            parsed.deletedQuestionLogIds.forEach((id: string) => {
              if (id && !this.deletedQuestionLogIds.has(id)) {
                this.deletedQuestionLogIds.add(id);
                changed = true;
              }
            });
          }
          if (changed) {
            saveData(STORAGE_KEYS.DELETED_STUDENTS, Array.from(this.deletedStudentIds));
            saveData(STORAGE_KEYS.DELETED_CLASSES, Array.from(this.deletedClassIds));
            saveData(STORAGE_KEYS.DELETED_QUESTION_LOGS, Array.from(this.deletedQuestionLogIds));
            const prevStdLen = this.students.length;
            this.students = this.students.filter((s) => !this.deletedStudentIds.has(s.id));
            if (this.students.length !== prevStdLen) {
              saveData(STORAGE_KEYS.STUDENTS, this.students);
              try {
                localStorage.setItem(PERMANENT_KEYS.MASTER_STUDENTS, JSON.stringify(this.students));
              } catch {}
            }
            const prevClsLen = this.classes.length;
            this.classes = this.classes.filter((c) => !this.deletedClassIds.has(c.id));
            if (this.classes.length !== prevClsLen) {
              saveData(STORAGE_KEYS.CLASSES, this.classes);
              try {
                localStorage.setItem(PERMANENT_KEYS.MASTER_CLASSES, JSON.stringify(this.classes));
              } catch {}
            }
            const prevQLogLen = this.questionLogs.length;
            this.questionLogs = this.questionLogs.filter((q) => !this.deletedQuestionLogIds.has(q.id));
            if (this.questionLogs.length !== prevQLogLen) {
              saveData(STORAGE_KEYS.QUESTION_LOGS, this.questionLogs);
              try {
                localStorage.setItem(PERMANENT_KEYS.MASTER_QUESTION_LOGS, JSON.stringify(this.questionLogs));
              } catch {}
            }
            this.notify();
          }
        } catch {}
      }
    } catch (e) {
      console.warn('Error fetching tombstones from cloud:', e);
    }
  }

  // Sekmeye dönüş / odak / internet geri gelince: kopuk kanallar onarılır, gerekirse eşitlenir.
  // (Eskiden tüm kanallar her seferinde kapatılıp yeniden açılıyordu; değişiklikler bu arada kaçabiliyordu.)
  public reconnectAllRealtime() {
    this.ensureRealtime();
    this.revalidateAndSyncAll(true);
  }

  public handleRemoteEtutRealtimeEvent(payload: any) {
    try {
      const eventType = payload.eventType; // 'INSERT' | 'UPDATE' | 'DELETE'
      if (eventType === 'DELETE') {
        const oldRow = payload.old;
        if (oldRow?.id) {
          this.deletedEtutIds.add(oldRow.id);
          saveData(STORAGE_KEYS.DELETED_ETUTS, Array.from(this.deletedEtutIds));
          this.etuts = this.etuts.filter((e) => e.id !== oldRow.id);
          saveData(STORAGE_KEYS.ETUTS, this.etuts);
          this.notify();
        }
        return;
      }

      const row = payload.new;
      if (!row || !row.id || this.deletedEtutIds.has(row.id)) return;

      let parsedMeta: any = {};
      try {
        if (typeof row.notes === 'object' && row.notes !== null) {
          parsedMeta = row.notes;
        } else if (typeof row.notes === 'string' && row.notes.trim().startsWith('{') && row.notes.includes('__etut_meta__')) {
          parsedMeta = JSON.parse(row.notes);
        }
      } catch (err) {}

      let incomingAssigned: 'all' | string[] = 'all';
      if (row.assigned_student_ids && Array.isArray(row.assigned_student_ids) && row.assigned_student_ids.length > 0) {
        incomingAssigned = row.assigned_student_ids;
      } else if (parsedMeta.assignedStudentIds && Array.isArray(parsedMeta.assignedStudentIds) && parsedMeta.assignedStudentIds.length > 0) {
        incomingAssigned = parsedMeta.assignedStudentIds;
      } else if (parsedMeta.studentAttendance && Object.keys(parsedMeta.studentAttendance).length > 0) {
        incomingAssigned = Object.keys(parsedMeta.studentAttendance);
      } else if (parsedMeta.assignedStudentIds === 'all' || !row.assigned_student_ids) {
        incomingAssigned = 'all';
      }

      const incomingEtut: Etut = {
        id: row.id,
        subject: row.subject,
        topic: row.topic,
        date: row.date ? row.date.trim().split('T')[0] : '',
        time: row.time || '16:00',
        duration: Number(row.duration) || parsedMeta.duration || 45,
        assignedStudentIds: incomingAssigned,
        location: row.location || 'Derslik',
        notes: parsedMeta.userNotes !== undefined ? parsedMeta.userNotes : (typeof row.notes === 'string' && !row.notes.startsWith('{') ? row.notes : ''),
        teacherFeedback: parsedMeta.teacherFeedback || '',
        createdAt: row.created_at || new Date().toISOString(),
        teacherId: row.etut_teacher_id || parsedMeta.teacherId || 'teacher-1',
        teacherName: parsedMeta.teacherName || 'Öğretmen',
        teacherBranch: parsedMeta.teacherBranch || '',
        lessonPeriod: parsedMeta.lessonPeriod || 'Ders',
        gradeLevel: parsedMeta.gradeLevel,
        schoolLevel: parsedMeta.schoolLevel,
        studentAttendance: parsedMeta.studentAttendance || {},
        createdById: parsedMeta.createdById || undefined,
        createdByName: parsedMeta.createdByName || undefined,
        recurrenceGroupId: parsedMeta.recurrenceGroupId || undefined,
      };

      const existingIdx = this.etuts.findIndex((e) => e.id === incomingEtut.id);
      if (existingIdx !== -1) {
        this.etuts[existingIdx] = {
          ...this.etuts[existingIdx],
          ...incomingEtut,
          studentAttendance: {
            ...(incomingEtut.studentAttendance || {}),
            ...(this.etuts[existingIdx].studentAttendance || {}),
          },
        };
      } else {
        this.etuts.unshift(incomingEtut);
      }

      saveData(STORAGE_KEYS.ETUTS, this.etuts);
      this.notify();
    } catch (err) {
      console.warn('[EtutRealtime] Error handling realtime etut payload:', err);
    }
  }

  // --- HOMEWORK & SYSTEM REALTIME EVENT HANDLER ---
  // Değişiklik bildirimi gelince ilgili tablo kısa bir gecikmeyle yeniden okunur (RLS süzgeciyle, eksiksiz).
  public handleRemoteHomeworkRealtimeEvent(payload: any) {
    try {
      const row = payload?.new && payload.new.id ? payload.new : null;
      // Eski belge satırı artık kullanılmıyor (belgeler teacher_documents tablosunda)
      if (row?.id === '__system_sync_documents__') return;
      if (row?.id === '__system_sync_tombstones__') {
        this.handleRemoteTombstonesPayload(row.description);
        return;
      }
      if (typeof row?.id === 'string' && row.id.startsWith('__')) return;
      this.scheduleTableRefetch('homeworks');
    } catch (e) {
      console.warn('[HomeworkRealtime] Error:', e);
    }
  }

  private refetchTimers: Record<string, ReturnType<typeof setTimeout>> = {};

  private scheduleTableRefetch(
    table: 'homeworks' | 'homework_submissions' | 'question_logs' | 'question_targets' | 'teacher_documents' | 'teachers'
  ): void {
    if (this.refetchTimers[table]) clearTimeout(this.refetchTimers[table]);
    this.refetchTimers[table] = setTimeout(() => {
      delete this.refetchTimers[table];
      if (table === 'homeworks') this.syncHomeworksFromSupabase(true);
      else if (table === 'homework_submissions') this.syncSubmissionsFromSupabase(true);
      else if (table === 'question_logs') this.syncQuestionLogsFromSupabase(true);
      else if (table === 'teacher_documents') this.syncTeacherDocumentsFromSupabase(true);
      else if (table === 'teachers') this.syncTeachersFromSupabase(true);
      else this.syncQuestionTargetsFromSupabase(true);
    }, 400);
  }

  // --- ATTENDANCE REALTIME EVENT HANDLER ---
  public handleRemoteAttendanceRealtimeEvent(payload: any) {
    try {
      const eventType = payload.eventType;
      if (eventType === 'DELETE') {
        const oldRow = payload.old;
        if (oldRow?.id) {
          this.attendance = this.attendance.filter((a) => a.id !== oldRow.id);
          saveData(STORAGE_KEYS.ATTENDANCE, this.attendance);
          this.notify();
        }
        return;
      }
      const row = payload.new;
      if (!row || !row.id) return;

      const record: AttendanceRecord = {
        id: row.id,
        classId: row.class_id,
        date: row.date,
        subject: row.subject || 'Genel',
        records: Array.isArray(row.records) ? row.records : [],
      };

      const exIdx = this.attendance.findIndex((a) => a.id === row.id);
      if (exIdx !== -1) {
        this.attendance[exIdx] = record;
      } else {
        this.attendance.unshift(record);
      }
      this.attendance.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      saveData(STORAGE_KEYS.ATTENDANCE, this.attendance);
      this.notify();
    } catch (e) {
      console.warn('[AttendanceRealtime] Error:', e);
    }
  }

  // --- GRADES REALTIME EVENT HANDLER ---
  public handleRemoteGradeRealtimeEvent(payload: any) {
    try {
      const eventType = payload.eventType;
      if (eventType === 'DELETE') {
        const oldRow = payload.old;
        if (oldRow?.id) {
          this.grades = this.grades.filter((g) => g.id !== oldRow.id);
          saveData(STORAGE_KEYS.GRADES, this.grades);
          this.notify();
        }
        return;
      }
      const row = payload.new;
      if (!row || !row.id) return;

      const grade: GradeRecord = this.gradeFromRow(row);

      const exIdx = this.grades.findIndex((g) => g.id === row.id);
      if (exIdx !== -1) {
        this.grades[exIdx] = grade;
      } else {
        this.grades.unshift(grade);
      }
      this.grades.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      saveData(STORAGE_KEYS.GRADES, this.grades);
      this.notify();
    } catch (e) {
      console.warn('[GradeRealtime] Error:', e);
    }
  }

  // --- MESSAGES REALTIME EVENT HANDLER ---
  public handleRemoteMessageRealtimeEvent(payload: any) {
    try {
      const eventType = payload.eventType;
      if (eventType === 'DELETE') {
        const oldRow = payload.old;
        if (oldRow?.id) {
          this.messages = this.messages.filter((m) => m.id !== oldRow.id);
          saveData(STORAGE_KEYS.MESSAGES, this.messages);
          this.notify();
        }
        return;
      }
      const row = payload.new;
      if (!row || !row.id) return;

      const msg: StudentMessage = {
        id: row.id,
        studentId: row.student_id,
        studentName: row.student_name,
        studentClass: row.student_class,
        studentAvatar: row.student_avatar,
        subject: row.subject,
        text: row.text,
        linkUrl: row.link_url,
        createdAt: row.created_at || new Date().toISOString(),
        read: Boolean(row.read),
        teacherReply: row.teacher_reply,
        repliedAt: row.replied_at,
      };

      const exIdx = this.messages.findIndex((m) => m.id === row.id);
      if (exIdx !== -1) {
        this.messages[exIdx] = msg;
      } else {
        this.messages.unshift(msg);
      }
      this.messages.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      saveData(STORAGE_KEYS.MESSAGES, this.messages);
      this.notify();
    } catch (e) {
      console.warn('[MessageRealtime] Error:', e);
    }
  }

  public handleRemoteTombstonesPayload(raw: string) {
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      let changed = false;
      if (Array.isArray(parsed.deletedStudentIds)) {
        parsed.deletedStudentIds.forEach((id: string) => {
          if (id && !this.deletedStudentIds.has(id)) {
            this.deletedStudentIds.add(id);
            changed = true;
          }
        });
      }
      if (Array.isArray(parsed.deletedClassIds)) {
        parsed.deletedClassIds.forEach((id: string) => {
          if (id && !this.deletedClassIds.has(id)) {
            this.deletedClassIds.add(id);
            changed = true;
          }
        });
      }
      if (Array.isArray(parsed.deletedQuestionLogIds)) {
        parsed.deletedQuestionLogIds.forEach((id: string) => {
          if (id && !this.deletedQuestionLogIds.has(id)) {
            this.deletedQuestionLogIds.add(id);
            changed = true;
          }
        });
      }
      if (changed) {
        saveData(STORAGE_KEYS.DELETED_STUDENTS, Array.from(this.deletedStudentIds));
        saveData(STORAGE_KEYS.DELETED_CLASSES, Array.from(this.deletedClassIds));
        saveData(STORAGE_KEYS.DELETED_QUESTION_LOGS, Array.from(this.deletedQuestionLogIds));
        this.students = this.students.filter((s) => !this.deletedStudentIds.has(s.id));
        this.classes = this.classes.filter((c) => !this.deletedClassIds.has(c.id));
        this.questionLogs = this.questionLogs.filter((q) => !this.deletedQuestionLogIds.has(q.id));
        saveData(STORAGE_KEYS.STUDENTS, this.students);
        saveData(STORAGE_KEYS.CLASSES, this.classes);
        saveData(STORAGE_KEYS.QUESTION_LOGS, this.questionLogs);
        try {
          localStorage.setItem(PERMANENT_KEYS.MASTER_QUESTION_LOGS, JSON.stringify(this.questionLogs));
        } catch {}
        this.notify();
      }
    } catch {}
  }

  public async pushEtutToSupabase(etut: Etut): Promise<boolean> {
    try {
      // 1. RLS Güvencesi: Yalnızca Supabase Auth ile doğrulanmış aktif bir oturum varsa buluta yaz
      const { data: sessionData } = await supabase.auth.getSession();
      const authUser = sessionData?.session?.user;
      if (!authUser) {
        // Oturum açılmamışsa (anon) RLS yazma işlemine izin vermez; sessizce yerel state korunur
        return false;
      }

      // Öğrenciler etüt ekleme veya güncelleme yetkisine sahip değildir
      const userRole = authUser.app_metadata?.role;
      if (userRole === 'student') {
        return false;
      }

      const attendanceStudentIds = Object.keys(etut.studentAttendance || {});
      let finalAssigned: string[] = [];
      if (Array.isArray(etut.assignedStudentIds)) {
        finalAssigned = Array.from(new Set([...etut.assignedStudentIds, ...attendanceStudentIds]));
      } else if (attendanceStudentIds.length > 0) {
        finalAssigned = attendanceStudentIds;
      }

      const meta = JSON.stringify({
        __etut_meta__: true,
        userNotes: etut.notes || '',
        teacherFeedback: etut.teacherFeedback || '',
        studentAttendance: etut.studentAttendance || {},
        teacherId: etut.teacherId,
        teacherName: etut.teacherName,
        teacherBranch: etut.teacherBranch || '',
        lessonPeriod: etut.lessonPeriod || 'Ders',
        duration: Number(etut.duration) || 45,
        gradeLevel: etut.gradeLevel,
        schoolLevel: etut.schoolLevel,
        assignedStudentIds: etut.assignedStudentIds,
        createdById: etut.createdById || null,
        createdByName: etut.createdByName || null,
        recurrenceGroupId: etut.recurrenceGroupId || null,
      });

      const cleanDate = etut.date ? etut.date.trim().split('T')[0] : '';

      const row: Record<string, any> = {
        id: etut.id,
        subject: etut.subject,
        topic: etut.topic,
        date: cleanDate,
        time: etut.time,
        duration: Number(etut.duration) || 45,
        location: etut.location || 'Derslik',
        assigned_student_ids: finalAssigned,
        notes: meta,
      };
      // Aşama 9: etüde atanan öğretmen ayrı sütunda (13 numaralı SQL). SQL henüz çalıştırılmadıysa sütunsuz kaydet.
      if (DataService.etutTeacherColumnAvailable) row.etut_teacher_id = etut.teacherId || null;
      let { error } = await supabase.from('etuts').upsert(row);
      if (error && row.etut_teacher_id !== undefined && /etut_teacher_id/.test(error.message || '')) {
        DataService.etutTeacherColumnAvailable = false;
        delete row.etut_teacher_id;
        ({ error } = await supabase.from('etuts').upsert(row));
      }

      if (error) {
        if (error.code === '42501' || error.message?.includes('violates row-level security policy')) {
          console.warn('[EtutSync] Etüt senkronizasyonu RLS yetki sınırına takıldı (bu kayıt için yetki yok):', error.message);
        } else {
          console.warn('[EtutSync] Etüt buluta yüklenemedi:', error.message);
        }
        return false;
      }
      return true;
    } catch (err: any) {
      console.warn('[EtutSync] Etüt senkronizasyon istisnası:', err?.message || err);
      return false;
    }
  }

  public async syncEtutsFromSupabase(isBackground = false): Promise<void> {
    // Gerçek (Supabase Auth) oturum yoksa buluttan okuma yapma: RLS boş liste döndürür
    // ve yerel veriler yanlışlıkla silinmiş gibi görünür.
    if (!(await this.hasCloudSession())) return;
    try {
      const { data: remoteEtuts, error: errEtuts } = await supabase.from('etuts').select('*');
      if (errEtuts) {
        if (!isBackground) console.warn('[EtutSync] Error fetching remote etuts:', errEtuts);
        return;
      }
      if (remoteEtuts) {
        let etutsChanged = false;
        remoteEtuts.forEach((re: any) => {
          if (this.deletedEtutIds.has(re.id)) return;
          let parsedMeta: any = {};
          try {
            if (typeof re.notes === 'object' && re.notes !== null) {
              parsedMeta = re.notes;
            } else if (typeof re.notes === 'string' && re.notes.trim().startsWith('{')) {
              parsedMeta = JSON.parse(re.notes);
            }
          } catch (err) {}

          let incomingAssigned: 'all' | string[] = 'all';
          if (re.assigned_student_ids && Array.isArray(re.assigned_student_ids) && re.assigned_student_ids.length > 0) {
            incomingAssigned = re.assigned_student_ids;
          } else if (parsedMeta.assignedStudentIds && Array.isArray(parsedMeta.assignedStudentIds) && parsedMeta.assignedStudentIds.length > 0) {
            incomingAssigned = parsedMeta.assignedStudentIds;
          } else if (parsedMeta.studentAttendance && Object.keys(parsedMeta.studentAttendance).length > 0) {
            incomingAssigned = Object.keys(parsedMeta.studentAttendance);
          } else if (parsedMeta.assignedStudentIds === 'all' || !re.assigned_student_ids) {
            incomingAssigned = 'all';
          }

          const incomingEtut: Etut = {
            id: re.id,
            subject: re.subject,
            topic: re.topic,
            date: re.date ? re.date.trim().split('T')[0] : '',
            time: re.time || '16:00',
            duration: Number(re.duration) || parsedMeta.duration || 45,
            assignedStudentIds: incomingAssigned,
            location: re.location || 'Derslik',
            notes: parsedMeta.userNotes !== undefined ? parsedMeta.userNotes : (typeof re.notes === 'string' && !re.notes.startsWith('{') ? re.notes : ''),
            teacherFeedback: parsedMeta.teacherFeedback || '',
            createdAt: re.created_at || new Date().toISOString(),
            teacherId: re.etut_teacher_id || parsedMeta.teacherId || 'teacher-1',
            teacherName: parsedMeta.teacherName || 'Öğretmen',
            teacherBranch: parsedMeta.teacherBranch || '',
            lessonPeriod: parsedMeta.lessonPeriod || 'Ders',
            gradeLevel: parsedMeta.gradeLevel,
            schoolLevel: parsedMeta.schoolLevel,
            studentAttendance: parsedMeta.studentAttendance || {},
            createdById: parsedMeta.createdById || undefined,
            createdByName: parsedMeta.createdByName || undefined,
            recurrenceGroupId: parsedMeta.recurrenceGroupId || undefined,
          };

          const existingIdx = this.etuts.findIndex((e) => e.id === re.id);
          if (existingIdx !== -1) {
            const current = this.etuts[existingIdx];
            const mergedAttendance = {
              ...(incomingEtut.studentAttendance || {}),
              ...(current.studentAttendance || {}),
            };

            const isDifferent =
              current.subject !== incomingEtut.subject ||
              current.topic !== incomingEtut.topic ||
              current.date !== incomingEtut.date ||
              current.time !== incomingEtut.time ||
              current.duration !== incomingEtut.duration ||
              current.location !== incomingEtut.location ||
              current.notes !== incomingEtut.notes ||
              current.teacherFeedback !== incomingEtut.teacherFeedback ||
              current.teacherName !== incomingEtut.teacherName ||
              current.teacherBranch !== incomingEtut.teacherBranch ||
              current.lessonPeriod !== incomingEtut.lessonPeriod ||
              JSON.stringify(current.assignedStudentIds || []) !== JSON.stringify(incomingEtut.assignedStudentIds || []) ||
              JSON.stringify(current.studentAttendance || {}) !== JSON.stringify(mergedAttendance);

            if (isDifferent) {
              this.etuts[existingIdx] = {
                ...current,
                ...incomingEtut,
                studentAttendance: mergedAttendance,
              };
              etutsChanged = true;
            }
          } else {
            this.etuts.unshift(incomingEtut);
            etutsChanged = true;
          }
        });

        // Merkezi veritabanı tek doğruluk kaynağıdır: bulutta olmayan (başka cihazdan silinmiş)
        // etütler yerelden de kaldırılır. ÖNCEKİ DAVRANIŞ bunları buluta geri yüklüyordu ve
        // bir cihazda silinen etüt diğer cihazdan tekrar "diriliyordu".
        const remoteIds = new Set(remoteEtuts.map((r: any) => r.id));
        const beforeCount = this.etuts.length;
        this.etuts = this.etuts.filter((e) => remoteIds.has(e.id));
        if (this.etuts.length !== beforeCount) {
          etutsChanged = true;
        }

        if (etutsChanged) {
          saveData(STORAGE_KEYS.ETUTS, this.etuts);
          this.notify();
        }
      }
    } catch (err) {
      if (!isBackground) console.warn('[EtutSync] Sync error:', err);
    }
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify() {
    this.lastSyncTimestamp = Date.now();
    this.listeners.forEach((l) => l());
  }

  public getSessionDeviceId(): string {
    if (!this.sessionDeviceId) {
      try {
        let devId = sessionStorage.getItem('edu_sys_device_session_id');
        if (!devId) {
          devId = 'DEV-' + Math.random().toString(36).substring(2, 7).toUpperCase();
          sessionStorage.setItem('edu_sys_device_session_id', devId);
        }
        this.sessionDeviceId = devId;
      } catch {
        this.sessionDeviceId = 'DEV-' + Math.random().toString(36).substring(2, 7).toUpperCase();
      }
    }
    return this.sessionDeviceId;
  }

  public getLastSyncTimestamp(): number {
    return this.lastSyncTimestamp;
  }

  public getLastSyncTime(): Date {
    return new Date(this.lastSyncTimestamp);
  }

  public updateSyncTimestamp() {
    this.lastSyncTimestamp = Date.now();
    this.notify();
  }

  // --- STUDENTS SUPABASE SYNC (CENTRAL DB IS SINGLE SOURCE OF TRUTH) ---
  // Öğrenci kaydının bulut satırındaki karşılığı (yalnızca tabloda bulunan sütunlar)
  private studentToRow(s: Student) {
    return {
      name: s.name,
      student_number: s.studentNumber || '',
      class_id: s.classId || 'class-default',
      class_name: s.className || 'Atanmadı',
      email: s.email || null,
      phone: s.phone || null,
      avatar: s.avatar || null,
    };
  }

  // Mevcut öğrenci satırlarını günceller. (Eskiden "upsert" kullanılıyordu; öğretmen ve öğrenci
  // rollerinde ekleme yetkisi olmadığından sessizce başarısız oluyordu.) Her satırın gerçekten
  // güncellendiği doğrulanır: yetki yoksa veritabanı hata vermeden 0 satır döndürür.
  public async syncStudentsToCloud(onlyThese?: Student[]): Promise<{ success: boolean; error?: any }> {
    try {
      const source = onlyThese ?? this.students;
      const activeStudents = source.filter((s) => s && s.id && !this.deletedStudentIds.has(s.id));
      for (const s of activeStudents) {
        const res = await this.patchStudentRow(s.id, this.studentToRow(s));
        if (!res.success) return res;
      }
      return { success: true };
    } catch (e) {
      console.warn('Error syncing students to cloud:', e);
      return { success: false, error: e };
    }
  }

  public async syncStudentToCloud(student: Student): Promise<{ success: boolean; error?: any }> {
    return this.syncStudentsToCloud([student]);
  }

  private async patchStudentRow(id: string, patch: Record<string, unknown>): Promise<{ success: boolean; error?: any }> {
    try {
      if (Object.keys(patch).length === 0) return { success: true };
      const { data, error } = await supabase.from('students').update(patch).eq('id', id).select('id');
      if (error) {
        console.warn('[StudentSync] Öğrenci güncellenemedi:', error);
        return { success: false, error };
      }
      if (!data || data.length === 0) {
        return {
          success: false,
          error: { code: '42501', message: 'Öğrenci kaydı güncellenemedi (kayıt bulunamadı veya bu öğrenci için yetkiniz yok).' },
        };
      }
      return { success: true };
    } catch (e) {
      return { success: false, error: e };
    }
  }

  public async deleteStudentFromCloud(studentId: string): Promise<{ success: boolean; error?: any }> {
    try {
      const { error } = await supabase.from('students').delete().eq('id', studentId);
      if (error) {
        console.warn('[StudentSync] Error deleting student from cloud:', error);
        return { success: false, error };
      }
      return { success: true };
    } catch (e) {
      console.warn('[StudentSync] Exception deleting student from cloud:', e);
      return { success: false, error: e };
    }
  }

  public async deleteStudentsFromCloud(studentIds: string[]): Promise<{ success: boolean; error?: any }> {
    try {
      const { error } = await this.deleteRowsVerified('students', studentIds);
      if (error) {
        console.warn('[StudentsSync] Error deleting students from cloud:', error);
        return { success: false, error };
      }
      return { success: true };
    } catch (e) {
      console.warn('[StudentsSync] Exception deleting students from cloud:', e);
      return { success: false, error: e };
    }
  }

  public async syncStudentsFromSupabase(isBackground = false): Promise<Student[]> {
    // Gerçek (Supabase Auth) oturum yoksa buluttan okuma yapma: RLS boş liste döndürür
    // ve yerel veriler yanlışlıkla silinmiş gibi görünür.
    if (!(await this.hasCloudSession())) return this.students;
    try {
      await this.syncTombstonesFromCloud();

      // 1. Fetch individual rows from students table
      const { data: remoteStudents, error: errStd } = await supabase.from('students').select('*');
      if (errStd) {
        console.warn('Error fetching students from Supabase:', errStd);
        return this.students;
      }

      const remoteStudentMap = new Map<string, any>();

      if (remoteStudents && Array.isArray(remoteStudents)) {
        remoteStudents.forEach((rs: any) => {
          if (!rs.id || this.deletedStudentIds.has(rs.id)) return;
          remoteStudentMap.set(rs.id, rs);
        });
      }

      const mergedStudentMap = new Map<string, Student>();

      // Populate from remote map
      remoteStudentMap.forEach((rs: any, id: string) => {
        if (this.deletedStudentIds.has(id)) return;
        const existing = this.students.find((s) => s.id === id);
        const cleanRemoteEmail = cleanStudentEmail(rs.email);

        const remoteSuspended = rs.status === 'suspended';
        const remoteClass = this.classes.find((c) => c.id === rs.class_id);
        if (existing) {
          mergedStudentMap.set(id, {
            ...existing,
            name: rs.name || existing.name,
            studentNumber: rs.student_number ?? existing.studentNumber,
            className: rs.class_name || existing.className,
            classId: rs.class_id || existing.classId,
            email: cleanRemoteEmail || '',
            phone: rs.phone || '',
            avatar: rs.avatar || existing.avatar,
            auth_user_id: rs.auth_user_id || undefined,
            status: remoteSuspended ? 'suspended' : 'active',
            isSuspended: remoteSuspended,
            password: undefined,
            schoolLevel: remoteClass?.schoolLevel || existing.schoolLevel || detectSchoolLevelFromGrade(rs.class_name) || 'Ortaokul',
            gradeLevel: remoteClass?.gradeLevel || existing.gradeLevel,
            branch: remoteClass?.branch || existing.branch,
          });
        } else {
          mergedStudentMap.set(id, {
            id: rs.id,
            name: rs.name,
            username: rs.student_number || cleanRemoteEmail?.split('@')[0] || rs.id,
            email: cleanRemoteEmail,
            mustChangePassword: false,
            className: rs.class_name || 'Atanmadı',
            classId: rs.class_id || 'class-default',
            studentNumber: rs.student_number || '',
            phone: rs.phone || '',
            avatar:
              rs.avatar ||
              `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(rs.name)}`,
            createdAt: rs.registered_at || new Date().toISOString(),
            status: remoteSuspended ? 'suspended' : 'active',
            isSuspended: remoteSuspended,
            auth_user_id: rs.auth_user_id || undefined,
            schoolLevel: remoteClass?.schoolLevel || detectSchoolLevelFromGrade(rs.class_name) || 'Ortaokul',
            gradeLevel: remoteClass?.gradeLevel,
            branch: remoteClass?.branch,
          });
        }
      });

      this.students = Array.from(mergedStudentMap.values());
      saveData(STORAGE_KEYS.STUDENTS, this.students);
      try {
        localStorage.setItem(PERMANENT_KEYS.MASTER_STUDENTS, JSON.stringify(this.students));
      } catch {}
      this.notify();

      return this.students;
    } catch (e) {
      if (!isBackground) console.warn('Exception in syncStudentsFromSupabase:', e);
      return this.students;
    }
  }

  // --- CENTRAL DATABASE AS SINGLE SOURCE OF TRUTH (CROSS-DEVICE SYNC) ---

  public async syncHomeworksFromSupabase(isBackground = false): Promise<Homework[]> {
    // Gerçek (Supabase Auth) oturum yoksa buluttan okuma yapma: RLS boş liste döndürür
    // ve yerel veriler yanlışlıkla silinmiş gibi görünür.
    if (!(await this.hasCloudSession())) return this.homeworks;
    try {
      const { data: remoteHws, error: errHws } = await supabase.from('homeworks').select('*');
      if (errHws) {
        if (!isBackground) console.warn('[HomeworkSync] Error fetching homeworks from Supabase:', errHws);
        return this.homeworks;
      }

      if (remoteHws && Array.isArray(remoteHws)) {
        const validHws: Homework[] = [];
        remoteHws.forEach((rh: any) => {
          if (!rh || typeof rh.id !== 'string') return;
          if (rh.id === '__system_sync_tombstones__') {
            this.handleRemoteTombstonesPayload(rh.description);
            return;
          }
          // Diğer sistem satırları (dokümanlar, eski eşitleme satırları) ödev değildir
          if (rh.id.startsWith('__') || rh.subject === 'TeacherSync' || rh.subject === 'SystemSync') return;
          validHws.push(this.homeworkFromRow(rh));
        });

        validHws.sort(
          (a, b) =>
            new Date(b.createdAt || b.dueDate || 0).getTime() -
            new Date(a.createdAt || a.dueDate || 0).getTime()
        );

        this.homeworks = validHws;
        const ids = new Set(validHws.map((h) => h.id));
        this.submissions = this.submissions.filter((s) => ids.has(s.homeworkId));
        saveData(STORAGE_KEYS.HOMEWORK, this.homeworks);
        saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);
        this.notify();
      }

      return this.homeworks;
    } catch (e) {
      if (!isBackground) console.warn('[HomeworkSync] Exception:', e);
      return this.homeworks;
    }
  }

  // Ödev teslimleri ayrı tablodan okunur (her öğrenci-ödev için tek satır)
  public async syncSubmissionsFromSupabase(isBackground = false): Promise<HomeworkSubmission[]> {
    if (!(await this.hasCloudSession())) return this.submissions;
    try {
      const { data, error } = await supabase.from('homework_submissions').select('*');
      if (error) {
        if (!isBackground) console.warn('[SubmissionSync] Error:', error);
        return this.submissions;
      }
      if (Array.isArray(data)) {
        this.submissions = data.map((r: any) => this.submissionFromRow(r));
        saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);
        this.notify();
      }
      return this.submissions;
    } catch (e) {
      if (!isBackground) console.warn('[SubmissionSync] Exception:', e);
      return this.submissions;
    }
  }

  private async refreshSubmissionsForHomework(homeworkId: string): Promise<void> {
    try {
      const { data, error } = await supabase.from('homework_submissions').select('*').eq('homework_id', homeworkId);
      if (error || !Array.isArray(data)) return;
      this.submissions = [
        ...data.map((r: any) => this.submissionFromRow(r)),
        ...this.submissions.filter((s) => s.homeworkId !== homeworkId),
      ];
      saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);
      this.notify();
    } catch {
      // bir sonraki eşitlemede düzelir
    }
  }

  public async syncAttendanceFromSupabase(isBackground = false): Promise<AttendanceRecord[]> {
    // Gerçek (Supabase Auth) oturum yoksa buluttan okuma yapma: RLS boş liste döndürür
    // ve yerel veriler yanlışlıkla silinmiş gibi görünür.
    if (!(await this.hasCloudSession())) return this.attendance;
    try {
      const { data: remoteAtt, error: errAtt } = await supabase
        .from('attendance')
        .select('*')
        .order('date', { ascending: false });

      if (errAtt) {
        if (!isBackground) console.warn('[AttendanceSync] Error:', errAtt);
        return this.attendance;
      }

      if (remoteAtt && Array.isArray(remoteAtt)) {
        this.attendance = remoteAtt.map((ra: any) => ({
          id: ra.id,
          classId: ra.class_id,
          date: ra.date,
          subject: ra.subject || 'Genel',
          records: Array.isArray(ra.records) ? ra.records : [],
        }));

        this.attendance.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        saveData(STORAGE_KEYS.ATTENDANCE, this.attendance);
        this.notify();
      }

      return this.attendance;
    } catch (e) {
      if (!isBackground) console.warn('[AttendanceSync] Exception:', e);
      return this.attendance;
    }
  }

  public async syncGradesFromSupabase(isBackground = false): Promise<GradeRecord[]> {
    // Gerçek (Supabase Auth) oturum yoksa buluttan okuma yapma: RLS boş liste döndürür
    // ve yerel veriler yanlışlıkla silinmiş gibi görünür.
    if (!(await this.hasCloudSession())) return this.grades;
    try {
      const { data: remoteGrades, error: errGrd } = await supabase
        .from('grades')
        .select('*')
        .order('date', { ascending: false });

      if (errGrd) {
        if (!isBackground) console.warn('[GradesSync] Error:', errGrd);
        return this.grades;
      }

      if (remoteGrades && Array.isArray(remoteGrades)) {
        this.grades = remoteGrades.map((rg: any) => this.gradeFromRow(rg));

        this.grades.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        saveData(STORAGE_KEYS.GRADES, this.grades);
        this.notify();
      }

      return this.grades;
    } catch (e) {
      if (!isBackground) console.warn('[GradesSync] Exception:', e);
      return this.grades;
    }
  }

  public async syncMessagesFromSupabase(isBackground = false): Promise<StudentMessage[]> {
    // Gerçek (Supabase Auth) oturum yoksa buluttan okuma yapma: RLS boş liste döndürür
    // ve yerel veriler yanlışlıkla silinmiş gibi görünür.
    if (!(await this.hasCloudSession())) return this.messages;
    try {
      const { data: remoteMsgs, error: errMsgs } = await supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: false });

      if (errMsgs) {
        if (!isBackground) console.warn('[MessagesSync] Error:', errMsgs);
        return this.messages;
      }

      if (remoteMsgs && Array.isArray(remoteMsgs)) {
        this.messages = remoteMsgs.map((rm: any) => ({
          id: rm.id,
          studentId: rm.student_id,
          studentName: rm.student_name,
          studentClass: rm.student_class,
          studentAvatar: rm.student_avatar,
          subject: rm.subject,
          text: rm.text,
          linkUrl: rm.link_url,
          createdAt: rm.created_at || new Date().toISOString(),
          read: Boolean(rm.read),
          teacherReply: rm.teacher_reply,
          repliedAt: rm.replied_at,
        }));

        this.messages.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        saveData(STORAGE_KEYS.MESSAGES, this.messages);
        this.notify();
      }

      return this.messages;
    } catch (e) {
      if (!isBackground) console.warn('[MessagesSync] Exception:', e);
      return this.messages;
    }
  }

  public async syncQuestionLogsAndTargetsFromSupabase(isBackground = false): Promise<void> {
    await Promise.allSettled([
      this.syncQuestionLogsFromSupabase(isBackground),
      this.syncQuestionTargetsFromSupabase(isBackground),
    ]);
  }

  public async syncQuestionLogsFromSupabase(isBackground = false): Promise<StudentQuestionLog[]> {
    if (!(await this.hasCloudSession())) return this.questionLogs;
    try {
      const { data, error } = await supabase.from('question_logs').select('*');
      if (error) {
        if (!isBackground) console.warn('[QuestionLogsSync] Error:', error);
        return this.questionLogs;
      }
      if (Array.isArray(data)) {
        const logs = data
          .map((r: any) => this.questionLogFromRow(r))
          .filter((l) => !this.deletedQuestionLogIds?.has(l.id));
        logs.sort(
          (a, b) =>
            new Date(b.date || b.createdAt || 0).getTime() - new Date(a.date || a.createdAt || 0).getTime()
        );
        this.questionLogs = logs;
        this.persistQuestionLogsLocal();
        this.notify();
      }
      return this.questionLogs;
    } catch (e) {
      if (!isBackground) console.warn('[QuestionLogsSync] Exception:', e);
      return this.questionLogs;
    }
  }

  public async syncQuestionTargetsFromSupabase(isBackground = false): Promise<WeeklyQuestionTarget[]> {
    if (!(await this.hasCloudSession())) return this.weeklyQuestionTargets;
    try {
      const { data, error } = await supabase.from('question_targets').select('*');
      if (error) {
        if (!isBackground) console.warn('[QuestionTargetsSync] Error:', error);
        return this.weeklyQuestionTargets;
      }
      if (Array.isArray(data)) {
        this.weeklyQuestionTargets = data.map((r: any) => this.questionTargetFromRow(r));
        saveData(STORAGE_KEYS.WEEKLY_QUESTION_TARGETS, this.weeklyQuestionTargets);
        this.notify();
      }
      return this.weeklyQuestionTargets;
    } catch (e) {
      if (!isBackground) console.warn('[QuestionTargetsSync] Exception:', e);
      return this.weeklyQuestionTargets;
    }
  }

  // Belge listesi: yalnız hafif sütunlar okunur (önizleme ve eski gömülü dosyalar açılınca ayrıca yüklenir)
  private static readonly DOCUMENT_LIST_COLUMNS =
    'id,title,description,category,file_format,file_name,file_size,storage_path,subject,school_type,grade_level,academic_year,tags,author_name,uploaded_by,owner_auth_id,created_at';

  private documentFromRow(r: any): TeacherDocument {
    return {
      id: r.id,
      title: r.title || 'Belge',
      description: r.description || undefined,
      category: (r.category || 'other') as DocumentCategory,
      fileFormat: r.file_format === 'docx' || r.file_format === 'xlsx' ? r.file_format : 'pdf',
      fileName: r.file_name || '',
      fileSize: r.file_size || '',
      storagePath: r.storage_path || undefined,
      uploadedAt: r.created_at || new Date().toISOString(),
      uploadedBy: r.uploaded_by || 'Öğretmen',
      authorName: r.author_name || undefined,
      academicYear: r.academic_year || undefined,
      schoolType: r.school_type || undefined,
      subject: r.subject || 'Genel',
      gradeLevel: r.grade_level || undefined,
      tags: Array.isArray(r.tags) ? r.tags : [],
      ownerAuthId: r.owner_auth_id || undefined,
    };
  }

  // Tarayıcıya yalnızca belge bilgileri yazılır (dosya içerikleri değil)
  private persistDocumentsLocal(): void {
    const light = this.documents.map(({ fileData, htmlPreview, tableSheets, ...rest }) => rest);
    saveData(STORAGE_KEYS.DOCUMENTS, light);
  }

  private currentAuthUid: string | null = null;

  public async syncTeacherDocumentsFromSupabase(isBackground = false): Promise<TeacherDocument[]> {
    // Gerçek (Supabase Auth) oturum yoksa buluttan okuma yapma: RLS boş liste döndürür
    // ve yerel veriler yanlışlıkla silinmiş gibi görünür.
    if (this.getAuthSession()?.role === 'student') return this.documents;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) return this.documents;
      this.currentAuthUid = sessionData.session.user?.id || null;
      const { data: rows, error } = await supabase
        .from('teacher_documents')
        .select(DataService.DOCUMENT_LIST_COLUMNS)
        .order('created_at', { ascending: false });
      if (error) {
        if (!isBackground) console.warn('[DocumentsSync] Error:', error);
        return this.documents;
      }
      this.documents = (rows || []).map((r: any) => this.documentFromRow(r));
      this.persistDocumentsLocal();
      this.notify();
      return this.documents;
    } catch (e) {
      if (!isBackground) console.warn('[DocumentsSync] Exception:', e);
      return this.documents;
    }
  }

  // =========================================================================
  // BULUT YAZMA YARDIMCILARI (Aşama 2)
  // =========================================================================

  // Bulut yazmasını bekler; hata olursa yerel değişikliği geri alır, kullanıcıya uyarı gösterir ve hata fırlatır.
  // `silent: true` ise uyarı göstermez ve hata fırlatmaz (yalnızca geri alır).
  private async runCloudWrite(
    op: () => PromiseLike<{ error: any }>,
    rollback: () => void,
    userMessage: string,
    options?: { silent?: boolean }
  ): Promise<boolean> {
    let error: any = null;
    try {
      const res = await op();
      error = res?.error || null;
    } catch (e) {
      error = e;
    }
    if (!error) return true;

    rollback();
    this.notify();
    const reason =
      error?.code === '42501'
        ? 'Bu işlem için yetkiniz yok'
        : error?.message || 'Bağlantı sorunu';
    console.warn(`[CloudWrite] ${userMessage}:`, error);
    if (options?.silent) return false;
    this.showFloatingErrorToast(`Hata: ${userMessage} (${reason}). Değişiklikler geri alındı.`);
    throw new Error(`${userMessage}: ${reason}`);
  }

  // RLS bir silmeyi engellerse Supabase hata DÖNDÜRMEZ, sadece 0 satır siler.
  // Bu yüzden silmeden sonra kayıtların gerçekten gittiği doğrulanır.
  private async deleteRowsVerified(table: string, ids: string[]): Promise<{ error: any }> {
    const cleanIds = ids.filter(Boolean);
    if (cleanIds.length === 0) return { error: null };
    const { error } = await supabase.from(table).delete().in('id', cleanIds);
    if (error) return { error };
    const { data: remaining, error: checkError } = await supabase.from(table).select('id').in('id', cleanIds);
    if (checkError) return { error: null }; // doğrulama yapılamadı; silme hatasız tamamlandı
    if (remaining && remaining.length > 0) {
      return { error: { code: '42501', message: 'Kayıt silinemedi, bu işlem için yetkiniz yok' } };
    }
    return { error: null };
  }

  // Ödevin tabloda ayrı sütunu olmayan bilgileri (kaynak linkleri vb.) 'meta' sütununda saklanır.
  // 1 MB üzerindeki gömülü dosya kabul edilmez (sessizce kaybolmasın diye hata verilir).
  private homeworkRowExtras(hw: Homework): { teacher_id: string | null; teacher_name: string | null; meta: Record<string, any> } {
    const keptResources = Array.isArray(hw.resources) ? hw.resources : [];
    this.assertInlineResourcesFit(keptResources);
    return {
      teacher_id: hw.teacherId || null,
      teacher_name: hw.teacherName || hw.createdByName || null,
      meta: {
        targetClassIds: hw.targetClassIds || [],
        isGlobalForNewStudents: hw.isGlobalForNewStudents ?? false,
        createdByName: hw.createdByName || null,
        schoolLevel: hw.schoolLevel || null,
        attachmentUrl: hw.attachmentUrl || null,
        outcomes: hw.outcomes || [],
        assignedDate: hw.assignedDate || null,
        resources: keptResources,
      },
    };
  }

  // Buluttan gelen ödev satırındaki ek bilgileri ödeve uygular. Eski satırlarda (meta yoksa) yerel değerler korunur.
  private applyHomeworkRowExtras(row: any, base: Homework): Homework {
    const meta = row?.meta && typeof row.meta === 'object' ? row.meta : {};
    const hasMeta = Object.keys(meta).length > 0;
    return {
      ...base,
      teacherId: row?.teacher_id || base.teacherId,
      teacherName: row?.teacher_name || base.teacherName,
      createdByName: meta.createdByName || row?.teacher_name || base.createdByName,
      targetClassIds: hasMeta && Array.isArray(meta.targetClassIds) ? meta.targetClassIds : base.targetClassIds,
      isGlobalForNewStudents:
        typeof meta.isGlobalForNewStudents === 'boolean' ? meta.isGlobalForNewStudents : base.isGlobalForNewStudents,
      schoolLevel: meta.schoolLevel || base.schoolLevel,
      attachmentUrl: meta.attachmentUrl || base.attachmentUrl,
      outcomes: hasMeta && Array.isArray(meta.outcomes) ? meta.outcomes : base.outcomes,
      assignedDate: meta.assignedDate || base.assignedDate,
      resources: hasMeta && Array.isArray(meta.resources) ? meta.resources : base.resources,
    };
  }

  // =========================================================================
  // ÖDEV / TESLİM / SORU KAYDI / HEDEF SATIR DÖNÜŞÜMLERİ (Aşama 4)
  // =========================================================================
  // Veritabanı satırına gömülebilecek en büyük dosya (≈1 MB). Daha büyükleri Aşama 5'te dosya deposuna taşınacak.
  public static readonly MAX_INLINE_FILE_CHARS = 1_400_000;
  public static etutTeacherColumnAvailable = true;

  private assertInlineResourcesFit(resources?: HomeworkResource[]): void {
    const tooBig = (resources || []).find(
      (r) => typeof r?.url === 'string' && r.url.startsWith('data:') && r.url.length > DataService.MAX_INLINE_FILE_CHARS
    );
    if (tooBig) {
      throw new Error(
        `"${tooBig.fileName || tooBig.title || 'Dosya'}" 1 MB sınırını aşıyor. Büyük dosyaları (video, uzun PDF) Google Drive veya YouTube bağlantısı olarak ekleyin.`
      );
    }
  }

  // Ödevin hedefi: sınıflar + (isteğe bağlı) yalnızca seçilen öğrenciler.
  // Öğrenci listesi boşsa hedef sınıfların TÜM öğrencileri (sonradan katılanlar dahil) ödevi görür.
  private homeworkTargets(hw: Homework): { classIds: string[]; studentIds: string[] } {
    const studentIds = Array.isArray(hw.assignedTo) ? Array.from(new Set(hw.assignedTo.filter(Boolean))) : [];
    let classIds = Array.from(new Set((hw.targetClassIds || []).filter(Boolean)));
    if (classIds.length === 0 && hw.classId && hw.classId !== 'class-default') classIds = [hw.classId];
    return { classIds, studentIds };
  }

  public isHomeworkForStudent(hw: Homework, student: { id: string; classId?: string }): boolean {
    if (Array.isArray(hw.assignedTo) && hw.assignedTo.length > 0) return hw.assignedTo.includes(student.id);
    const { classIds } = this.homeworkTargets(hw);
    return !!student.classId && classIds.includes(student.classId);
  }

  private homeworkToRow(hw: Homework) {
    const { classIds, studentIds } = this.homeworkTargets(hw);
    return {
      title: hw.title,
      description: hw.description || '',
      subject: hw.subject,
      due_date: hw.dueDate,
      learning_outcomes: hw.learningOutcomes || [],
      assigned_to: studentIds.length > 0 ? studentIds : 'all',
      class_id: classIds[0] || hw.classId || 'class-default',
      target_class_ids: classIds,
      target_student_ids: studentIds,
      ...this.homeworkRowExtras(hw),
    };
  }

  private homeworkFromRow(rh: any): Homework {
    const localHw = this.homeworks.find((h) => h.id === rh.id);
    const targetClassIds: string[] = Array.isArray(rh.target_class_ids) ? rh.target_class_ids.filter(Boolean) : [];
    const targetStudentIds: string[] = Array.isArray(rh.target_student_ids) ? rh.target_student_ids.filter(Boolean) : [];
    const base: Homework = {
      ...(localHw || {}),
      id: rh.id,
      title: rh.title || 'Ödev',
      description: rh.description || '',
      subject: rh.subject || 'Genel',
      learningOutcomes: Array.isArray(rh.learning_outcomes) ? rh.learning_outcomes : [],
      dueDate: rh.due_date || new Date().toISOString(),
      createdAt: rh.created_at || localHw?.createdAt || new Date().toISOString(),
      assignedDate: localHw?.assignedDate || rh.created_at || new Date().toISOString(),
      classId: targetClassIds[0] || rh.class_id || 'class-default',
      assignedTo: targetStudentIds.length > 0 ? targetStudentIds : 'all',
      teacherId: rh.teacher_id || localHw?.teacherId,
      teacherName: rh.teacher_name || localHw?.teacherName,
      teacherAuthId: rh.teacher_auth_id || undefined,
      updatedAt: rh.updated_at || undefined,
      submissions: undefined,
    };
    const withExtras = this.applyHomeworkRowExtras(rh, base);
    return {
      ...withExtras,
      targetClassIds: targetClassIds.length > 0 ? targetClassIds : withExtras.targetClassIds || [],
      assignedTo: base.assignedTo,
      isGlobalForNewStudents: false,
    };
  }

  private submissionFromRow(r: any): HomeworkSubmission {
    return {
      id: r.id,
      homeworkId: r.homework_id,
      studentId: r.student_id,
      studentName: r.student_name || this.students.find((s) => s.id === r.student_id)?.name || 'Öğrenci',
      submittedAt: r.submitted_at || r.updated_at || new Date().toISOString(),
      status: r.status === 'late' || r.status === 'not_submitted' ? r.status : 'on_time',
      checkStatus: r.check_status || undefined,
      notes: r.notes || '',
      attachmentLink: r.attachment_link || undefined,
      resources: Array.isArray(r.resources) ? r.resources : [],
      score: r.score === null || r.score === undefined ? null : Number(r.score),
      feedback: r.feedback || undefined,
    };
  }

  private questionLogToRow(q: StudentQuestionLog) {
    return {
      id: q.id,
      student_id: q.studentId,
      student_name: q.studentName || '',
      class_id: q.classId || '',
      class_name: q.className || '',
      date: q.date,
      entries: q.entries || [],
      total_questions: Math.round(Number(q.totalQuestions) || 0),
      total_correct: Math.round(Number(q.totalCorrect) || 0),
      total_wrong: Math.round(Number(q.totalWrong) || 0),
      total_empty: Math.round(Number(q.totalEmpty) || 0),
      notes: q.notes || '',
      created_at: q.createdAt || new Date().toISOString(),
    };
  }

  private questionLogFromRow(r: any): StudentQuestionLog {
    return {
      id: r.id,
      studentId: r.student_id,
      studentName: r.student_name || '',
      classId: r.class_id || '',
      className: r.class_name || '',
      date: r.date,
      entries: Array.isArray(r.entries) ? r.entries : [],
      totalQuestions: Number(r.total_questions) || 0,
      totalCorrect: Number(r.total_correct) || 0,
      totalWrong: Number(r.total_wrong) || 0,
      totalEmpty: Number(r.total_empty) || 0,
      notes: r.notes || '',
      createdAt: r.created_at || new Date().toISOString(),
    };
  }

  private isClassQuestionTarget(t: WeeklyQuestionTarget): boolean {
    return t.targetType === 'class' || (!!t.classId && !t.studentId);
  }

  private questionTargetToRow(t: WeeklyQuestionTarget) {
    const isClass = this.isClassQuestionTarget(t);
    return {
      id: t.id,
      target_type: isClass ? 'class' : 'student',
      student_id: isClass ? null : t.studentId || null,
      class_id: t.classId || null,
      week_start_date: t.weekStartDate || null,
      data: JSON.parse(JSON.stringify(t)),
      updated_at: new Date().toISOString(),
    };
  }

  private questionTargetFromRow(r: any): WeeklyQuestionTarget {
    const data = r.data && typeof r.data === 'object' ? r.data : {};
    return {
      ...data,
      id: r.id,
      targetType: r.target_type === 'class' ? 'class' : 'student',
      studentId: r.target_type === 'class' ? undefined : r.student_id || data.studentId,
      classId: r.class_id || data.classId,
      weekStartDate: r.week_start_date || data.weekStartDate,
    };
  }

  private persistQuestionLogsLocal(): void {
    saveData(STORAGE_KEYS.QUESTION_LOGS, this.questionLogs);
    try {
      localStorage.setItem(PERMANENT_KEYS.MASTER_QUESTION_LOGS, JSON.stringify(this.questionLogs));
    } catch {}
  }

  private gradeFromRow(rg: any): GradeRecord {
    const student = this.students.find((s) => s.id === rg.student_id);
    return {
      id: rg.id,
      studentId: rg.student_id,
      studentName: student?.name,
      classId: rg.class_id,
      subject: rg.subject,
      score: Number(rg.score),
      maxScore: rg.max_score !== null && rg.max_score !== undefined ? Number(rg.max_score) : undefined,
      examType: rg.exam_type || '1. Yazılı',
      date: rg.date,
      remarks: rg.remarks || undefined,
    };
  }

  private gradeToRow(g: GradeRecord) {
    return {
      id: g.id,
      student_id: g.studentId,
      class_id: g.classId || 'c-1',
      subject: g.subject,
      score: g.score,
      max_score: g.maxScore ?? 100,
      exam_type: g.examType || '1. Yazılı',
      date: g.date,
      remarks: g.remarks || null,
    };
  }

  private attendanceToRow(a: AttendanceRecord) {
    return {
      id: a.id,
      class_id: a.classId,
      date: a.date,
      subject: a.subject || 'Genel',
      records: a.records || [],
    };
  }

  private messageToRow(m: StudentMessage) {
    return {
      id: m.id,
      student_id: m.studentId,
      student_name: m.studentName,
      student_class: m.studentClass,
      student_avatar: m.studentAvatar || null,
      subject: m.subject,
      text: m.text,
      link_url: m.linkUrl || null,
      created_at: m.createdAt,
      read: m.read,
    };
  }

  // Supabase Auth oturumu (JWT) gerçekten var mı? Yoksa istekler 'anon' rolüyle gider.
  private async hasCloudSession(): Promise<boolean> {
    try {
      const { data } = await supabase.auth.getSession();
      return !!data?.session;
    } catch {
      return false;
    }
  }

  // Öğretmenin veritabanındaki erişim yetkileri (yöneticinin verdiği sınıf / öğrenci yetkileri).
  // Hangi sınıf ve öğrencilerin listeleneceği buna göre belirlenir; veritabanı kuralları (RLS) da aynı tabloları kullanır.
  private myTeacherAccess: { classIds: Set<string>; studentIds: Set<string>; loaded: boolean } = {
    classIds: new Set(),
    studentIds: new Set(),
    loaded: false,
  };

  private async syncMyTeacherAccess(): Promise<void> {
    const session = this.getAuthSession();
    if (session?.role !== 'teacher' || this.isCurrentUserAdmin()) return;
    try {
      const { data } = await supabase.auth.getSession();
      const uid = data?.session?.user?.id;
      if (!uid) return;
      const [cls, std] = await Promise.all([
        supabase.from('teacher_class_access').select('class_id').eq('teacher_auth_id', uid),
        supabase.from('teacher_student_access').select('student_id').eq('teacher_auth_id', uid),
      ]);
      if (cls.error || std.error) return;
      this.myTeacherAccess = {
        classIds: new Set((cls.data || []).map((r: any) => String(r.class_id))),
        studentIds: new Set((std.data || []).map((r: any) => String(r.student_id))),
        loaded: true,
      };
      this.notify();
    } catch {
      // bağlantı sorunu: bir sonraki eşitlemede tekrar denenir
    }
  }

  private fullSyncInFlight: Promise<void> | null = null;
  private lastFullSyncAt = 0;

  // Tüm verileri buluttan yeniler. Arka plan istekleri (odak, sekmeye dönüş, yedek kontrol) en fazla
  // 15 saniyede bir çalışır; aynı anda ikinci bir tam eşitleme başlatılmaz (çalışan beklenir).
  public async revalidateAndSyncAll(isBackground = false): Promise<void> {
    if (this.fullSyncInFlight) return this.fullSyncInFlight;
    if (isBackground && Date.now() - this.lastFullSyncAt < DataService.MIN_BACKGROUND_SYNC_GAP_MS) {
      this.ensureRealtime();
      return;
    }
    this.lastFullSyncAt = Date.now();
    this.fullSyncInFlight = this.runFullSync(isBackground).finally(() => {
      this.fullSyncInFlight = null;
    });
    return this.fullSyncInFlight;
  }

  private async runFullSync(isBackground: boolean): Promise<void> {
    try {
      this.ensureRealtime();
      this.startPeriodicSync();
      await Promise.allSettled([
        this.syncTombstonesFromCloud(),
        this.syncClassesFromSupabase(isBackground),
        this.syncStudentsFromSupabase(isBackground),
        this.syncEtutsFromSupabase(isBackground),
        this.syncHomeworksFromSupabase(isBackground),
        this.syncSubmissionsFromSupabase(isBackground),
        this.syncAttendanceFromSupabase(isBackground),
        this.syncGradesFromSupabase(isBackground),
        this.syncMessagesFromSupabase(isBackground),
        this.syncQuestionLogsAndTargetsFromSupabase(isBackground),
        this.syncTeacherDocumentsFromSupabase(isBackground),
        this.syncTeachersFromSupabase(isBackground),
        this.refreshPendingApplicationCount(),
        this.syncMyTeacherAccess(),
      ]);
      this.lastFullSyncAt = Date.now();
      this.notify();
    } catch (e) {
      if (!isBackground) console.warn('[RevalidateAndSyncAll] Error:', e);
    }
  }

  private async syncFromSupabase() {
    await this.revalidateAndSyncAll(true);
  }

  public async syncAllTeacherData(): Promise<void> {
    await this.revalidateAndSyncAll(false);
  }

  // --- AUTH & TEACHER MANAGEMENT ---
  public getCurrentTeacher(): Teacher | null {
    const session = this.getAuthSession();
    if (session?.role === 'teacher') {
      const match = this.teachers.find(
        (t) =>
          t.id === session.user.id ||
          t.username?.toLowerCase() === session.user.username?.toLowerCase()
      );
      return match || (session.user as Teacher);
    }
    return null;
  }

  // Yönetici: kayıtta yönetici işareti olan (giriş rolü 'admin' veya teachers.is_admin) ya da kurum yöneticisi
  // e-postasıyla giriş yapan öğretmen. Veritabanındaki is_admin() kuralıyla aynıdır.
  public isTeacherAdmin(teacher?: Teacher | null): boolean {
    if (!teacher) return false;
    return Boolean(teacher.isAdmin || (teacher.email || '').trim().toLowerCase() === ADMIN_EMAIL);
  }

  public isCurrentUserAdmin(): boolean {
    const session = this.getAuthSession();
    if (!session) return false;
    if (session.role !== 'teacher') return false;
    const currentTeacher = this.getCurrentTeacher();
    return this.isTeacherAdmin(currentTeacher) || this.isTeacherAdmin(session.user as Teacher);
  }

  // ===========================================================================
  // Aşama 9: Branşa göre ders sınırı ve etüt öğretmenleri
  // ===========================================================================
  // Yönetici için null (tüm dersler). Yönetici olmayan öğretmen için kendi branşının ders(ler)i.
  public getMySubjects(): string[] | null {
    if (this.isCurrentUserAdmin()) return null;
    const t = this.getCurrentTeacher();
    const list = subjectsForBranch(t?.branch);
    return list.length > 0 ? list : null;
  }

  // Etüt formu için öğretmen listesi (veritabanı yönetici olmayana yalnızca kendi branşını döndürür)
  public async getEtutTeacherOptions(): Promise<EtutTeacherOption[]> {
    const me = this.getCurrentTeacher();
    try {
      const { data, error } = await supabase.rpc('etut_teacher_options');
      if (!error && Array.isArray(data)) {
        return data.map((r: any) => ({
          id: String(r.option_id),
          name: String(r.name || ''),
          subjects: Array.isArray(r.subjects) ? r.subjects.map((x: any) => normalizeSubject(String(x))) : [],
          kind: r.kind === 'external' ? 'external' : 'system',
          hasEmail: !!r.has_email,
          rowId: r.row_id || null,
          isMe: !!r.is_me,
        }));
      }
    } catch {}
    // 13 numaralı SQL henüz çalıştırılmadıysa: yalnızca kendisi (ve yöneticiyse bildiği öğretmenler)
    const list: EtutTeacherOption[] = [];
    const seen = new Set<string>();
    const pushTeacher = (t: Teacher, isMe: boolean) => {
      if (!t?.id || seen.has(t.id) || t.status === 'pending' || t.status === 'rejected') return;
      seen.add(t.id);
      list.push({ id: t.id, name: t.name, subjects: subjectsForBranch(t.branch), kind: 'system', hasEmail: !!t.email, rowId: null, isMe });
    };
    if (me) pushTeacher(me, true);
    if (this.isCurrentUserAdmin()) this.teachers.forEach((t) => pushTeacher(t, false));
    return list;
  }

  // Yönetici: etüt öğretmenleri listesi (dış öğretmenler ve kayıtlı öğretmenlere ek dersler)
  public async listEtutTeacherRows(): Promise<EtutTeacherRow[]> {
    const { data, error } = await supabase.from('etut_teachers').select('*').order('name');
    if (error) throw new Error(error.message?.includes('etut_teachers') ? 'Etüt öğretmenleri tablosu bulunamadı (13 numaralı SQL çalıştırılmalı).' : error.message);
    return (data || []).map((r: any) => ({
      id: r.id,
      name: r.name,
      subjects: Array.isArray(r.subjects) ? r.subjects : [],
      email: r.email || '',
      phone: r.phone || '',
      teacherId: r.teacher_id || null,
      active: r.active !== false,
    }));
  }

  public async saveEtutTeacherRow(row: Partial<EtutTeacherRow> & { name: string; subjects: string[] }): Promise<void> {
    if (!this.isCurrentUserAdmin()) throw new Error('Etüt öğretmeni listesini yalnızca yönetici düzenleyebilir.');
    const payload: Record<string, any> = {
      name: row.name.trim(),
      subjects: row.subjects,
      email: (row.email || '').trim() || null,
      phone: (row.phone || '').trim() || null,
      teacher_id: row.teacherId || null,
      active: row.active !== false,
    };
    const q = row.id
      ? supabase.from('etut_teachers').update(payload).eq('id', row.id)
      : supabase.from('etut_teachers').insert(payload);
    const { error } = await q;
    if (error) {
      if (error.code === '23505') throw new Error('Bu öğretmen için zaten bir kayıt var.');
      if (error.code === '23514') throw new Error('E-posta adresi geçersiz veya ad çok kısa.');
      throw new Error(error.message);
    }
  }

  public async deleteEtutTeacherRow(id: string): Promise<void> {
    if (!this.isCurrentUserAdmin()) throw new Error('Etüt öğretmeni listesini yalnızca yönetici düzenleyebilir.');
    const { error } = await supabase.from('etut_teachers').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  public getAllTeachersInternal(): Teacher[] {
    return [...this.teachers];
  }

  public getTeachers(): Teacher[] {
    const session = this.getAuthSession();
    const currentTeacher = this.getCurrentTeacher();

    // Kurum Yöneticisi tüm öğretmenleri görebilir
    if (this.isTeacherAdmin(currentTeacher)) {
      return [...this.teachers];
    }

    // Normal öğretmen sisteme yeni/eski kayıtlı diğer hiçbir öğretmenin bilgisini GÖREMEZ. Yalnızca KENDİSİNİ görür.
    if (session?.role === 'teacher' && currentTeacher) {
      return [currentTeacher];
    }

    // Öğrenci oturumu veya diğer durumlar: şifreleri maskele
    return this.teachers.map((t) => ({
      ...t,
      password: '',
    }));
  }

  public getPendingTeachers(): Teacher[] {
    return this.teachers.filter((t) => t.status === 'pending');
  }

  public approveTeacher(teacherId: string): void {
    const teacher = this.teachers.find((t) => t.id === teacherId);
    if (teacher) {
      teacher.status = 'approved';
      saveData(STORAGE_KEYS.TEACHERS, this.teachers);
      try {
        localStorage.setItem(PERMANENT_KEYS.MASTER_TEACHERS, JSON.stringify(this.teachers));
      } catch {}
      this.syncTeacherToCloud(teacher);
      this.notify();
    }
  }

  public rejectTeacher(teacherId: string): void {
    const teacher = this.teachers.find((t) => t.id === teacherId);
    if (teacher) {
      teacher.status = 'rejected';
      saveData(STORAGE_KEYS.TEACHERS, this.teachers);
      try {
        localStorage.setItem(PERMANENT_KEYS.MASTER_TEACHERS, JSON.stringify(this.teachers));
      } catch {}
      this.syncTeacherToCloud(teacher);
      this.notify();
    }
  }

  public deleteTeacher(teacherId: string): void {
    this.deletedTeacherIds.add(teacherId);
    saveData(STORAGE_KEYS.DELETED_TEACHERS, Array.from(this.deletedTeacherIds));
    this.teachers = this.teachers.filter((t) => t.id !== teacherId);
    saveData(STORAGE_KEYS.TEACHERS, this.teachers);
    try {
      localStorage.setItem(PERMANENT_KEYS.MASTER_TEACHERS, JSON.stringify(this.teachers));
    } catch {}
    this.deleteTeacherFromCloud(teacherId);
    this.notify();
  }

  public updateTeacherClassPermissions(teacherId: string, assignedClassIds: string[]): void {
    const idx = this.teachers.findIndex((t) => t.id === teacherId);
    if (idx !== -1) {
      this.teachers[idx] = {
        ...this.teachers[idx],
        assignedClassIds,
      };
      saveData(STORAGE_KEYS.TEACHERS, this.teachers);
      try {
        localStorage.setItem(PERMANENT_KEYS.MASTER_TEACHERS, JSON.stringify(this.teachers));
      } catch {}

      const currentSession = this.getAuthSession();
      if (currentSession?.role === 'teacher' && currentSession.user.id === teacherId) {
        this.setAuthSession({
          ...currentSession,
          user: this.teachers[idx],
        });
      }

      this.syncTeacherToCloud(this.teachers[idx]);
      this.notify();
    }
  }

  public toggleTeacherAdmin(teacherId: string, isAdmin: boolean): void {
    const idx = this.teachers.findIndex((t) => t.id === teacherId);
    if (idx !== -1) {
      this.teachers[idx] = {
        ...this.teachers[idx],
        isAdmin,
      };
      saveData(STORAGE_KEYS.TEACHERS, this.teachers);
      try {
        localStorage.setItem(PERMANENT_KEYS.MASTER_TEACHERS, JSON.stringify(this.teachers));
      } catch {}

      const currentSession = this.getAuthSession();
      if (currentSession?.role === 'teacher' && currentSession.user.id === teacherId) {
        this.setAuthSession({
          ...currentSession,
          user: this.teachers[idx],
        });
      }

      this.syncTeacherToCloud(this.teachers[idx]);
      this.notify();
    }
  }

  public toggleTeacherCanViewAll(teacherId: string, canView: boolean): void {
    const idx = this.teachers.findIndex((t) => t.id === teacherId);
    if (idx !== -1) {
      this.teachers[idx] = {
        ...this.teachers[idx],
        canViewAllStudentsAndClasses: canView,
      };
      saveData(STORAGE_KEYS.TEACHERS, this.teachers);
      try {
        localStorage.setItem(PERMANENT_KEYS.MASTER_TEACHERS, JSON.stringify(this.teachers));
      } catch {}

      const currentSession = this.getAuthSession();
      if (currentSession?.role === 'teacher' && currentSession.user.id === teacherId) {
        this.setAuthSession({
          ...currentSession,
          user: this.teachers[idx],
        });
      }

      this.syncTeacherToCloud(this.teachers[idx]);
      this.notify();
    }
  }

  // =========================================================================
  // RBAC & UNIFIED USER MANAGEMENT (Sistem Yöneticisi Tam Yetkili Yönetim)
  // =========================================================================

  public getAllUnifiedUsers(): UnifiedUser[] {
    const list: UnifiedUser[] = [];

    // 1. Öğretmenler ve Yöneticiler
    this.teachers.forEach((t) => {
      if (this.deletedTeacherIds.has(t.id)) return;
      const isAdmin = this.isTeacherAdmin(t);
      const isSuspended = !!t.isSuspended || t.status === 'suspended';

      list.push({
        id: t.id,
        auth_user_id: t.auth_user_id,
        name: t.name,
        username: t.username,
        email: t.email,
        phone: t.phone || '',
        avatar: t.avatar,
        role: isAdmin ? 'admin' : 'teacher',
        status: isSuspended ? 'suspended' : (t.status || 'approved'),
        isSuspended,
        createdAt: t.createdAt || new Date().toISOString(),
        password: t.password || '',
        branch: t.branch || (isAdmin ? 'Kurum Yöneticisi' : 'Öğretmen'),
        isAdmin,
        assignedClassIds: t.assignedClassIds || [],
        canViewAllStudentsAndClasses: !!t.canViewAllStudentsAndClasses,
      });
    });

    // 2. Öğrenciler
    this.students.forEach((s) => {
      if (this.deletedStudentIds.has(s.id)) return;
      const isSuspended = !!s.isSuspended || s.status === 'suspended';

      list.push({
        id: s.id,
        auth_user_id: s.auth_user_id,
        name: s.name,
        username: s.username,
        email: s.email || '',
        phone: s.phone || '',
        avatar: s.avatar,
        role: 'student',
        status: isSuspended ? 'suspended' : (s.status || 'active'),
        isSuspended,
        createdAt: s.createdAt || new Date().toISOString(),
        password: s.password || '',
        className: s.className || 'Genel',
        classId: s.classId || 'class-default',
        studentNumber: s.studentNumber || '',
        schoolLevel: s.schoolLevel,
        gradeLevel: s.gradeLevel,
        mustChangePassword: !!s.mustChangePassword,
        authorizedTeacherIds: s.authorizedTeacherIds || [],
      });
    });

    // En yeni kayıtlar üstte olacak şekilde sırala
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  // Baş yönetici (gerçek e-posta ile giriş yapan kurum yöneticisi) mi?
  private isHeadAdminTeacher(t?: Teacher | null): boolean {
    if (!t) return false;
    return (t.email || '').toLowerCase() === 'm.bilirr@gmail.com' || t.id === 'admin-mustafa-bilir';
  }

  // Öğretmen <-> yönetici rol değişikliği: giriş hesabındaki rol (app_metadata) sunucuda değişir,
  // veritabanı kuralları (RLS) bu rolü okuduğu için yetki gerçekten değişir.
  public async adminChangeUserRole(
    userId: string,
    targetRole: SystemRole,
    _options?: { branch?: string; className?: string; classId?: string }
  ): Promise<void> {
    const teacher = this.teachers.find((t) => t.id === userId);
    if (teacher) {
      if (targetRole === 'student') {
        throw new Error('Öğretmen hesabı öğrenci hesabına dönüştürülemez. Gerekirse öğrenci için yeni bir kayıt oluşturunuz.');
      }
      if (targetRole === 'teacher' && this.isHeadAdminTeacher(teacher)) {
        throw new Error('Baş yöneticinin yönetici yetkisi kaldırılamaz.');
      }
      await invokeCreateUserEdgeFunction({
        action: 'set_role',
        id: teacher.id,
        role: targetRole === 'admin' ? 'admin' : 'teacher',
      });
      this.teachers = this.teachers.map((t) =>
        t.id === teacher.id
          ? { ...t, isAdmin: targetRole === 'admin', status: t.status === 'pending' ? 'approved' : t.status }
          : t
      );
      saveData(STORAGE_KEYS.TEACHERS, this.teachers);
      try {
        localStorage.setItem(PERMANENT_KEYS.MASTER_TEACHERS, JSON.stringify(this.teachers));
      } catch {}
      this.notify();
      return;
    }

    if (this.students.some((s) => s.id === userId)) {
      throw new Error('Öğrenci hesabı öğretmen/yönetici hesabına dönüştürülemez. Öğretmen hesabını "Yeni Öğretmen Hesabı" düğmesiyle açınız.');
    }
    throw new Error('Kullanıcı kaydı bulunamadı.');
  }

  public async adminUpdateUserProfile(
    userId: string,
    updates: Partial<UnifiedUser> & { newPassword?: string }
  ): Promise<void> {
    const newPassword = updates.newPassword?.trim() || '';

    // 1. Öğretmen / yönetici
    const teacher = this.teachers.find((t) => t.id === userId);
    if (teacher) {
      const teacherUpdates: Partial<Teacher> = {};
      if (updates.name && updates.name.trim()) teacherUpdates.name = updates.name.trim();
      if (
        updates.username &&
        updates.username.trim() &&
        updates.username.trim().toLowerCase() !== (teacher.username || '').trim().toLowerCase()
      ) {
        teacherUpdates.username = updates.username.trim().toLowerCase();
      }
      if (updates.email !== undefined) teacherUpdates.email = updates.email.trim();
      if (updates.phone !== undefined) teacherUpdates.phone = updates.phone.trim();
      if (updates.branch !== undefined) teacherUpdates.branch = updates.branch.trim();
      if (updates.avatar !== undefined) teacherUpdates.avatar = updates.avatar;
      if (updates.assignedClassIds !== undefined) teacherUpdates.assignedClassIds = updates.assignedClassIds;
      if (updates.canViewAllStudentsAndClasses !== undefined) teacherUpdates.canViewAllStudentsAndClasses = updates.canViewAllStudentsAndClasses;

      const previousUsername = teacher.username || '';
      const isHeadAdmin = this.isHeadAdminTeacher(teacher);
      if (newPassword && isHeadAdmin) {
        throw new Error('Kendi şifrenizi buradan değil, profil menüsündeki "Şifre Değiştir" ekranından değiştiriniz.');
      }
      if (teacherUpdates.username && !/^[a-z0-9_-]{3,30}$/.test(teacherUpdates.username) && !isHeadAdmin) {
        throw new Error('Kullanıcı adı 3-30 karakter olmalı; yalnızca küçük harf, rakam, - ve _ içerebilir (Türkçe karakter ve boşluk kullanılamaz).');
      }

      const updated = await this.saveTeacherProfile(userId, teacherUpdates);
      const usernameChanged = (updated.username || '') !== previousUsername;

      // Giriş adı (kullanıcı adı) veya şifre değiştiyse gerçek giriş hesabı da güncellenir.
      // Baş yönetici gerçek e-posta adresiyle giriş yaptığından kullanıcı adı onun girişini etkilemez.
      if (!isHeadAdmin && (newPassword || (usernameChanged && updated.auth_user_id))) {
        try {
          await this.syncLoginAccount('teacher', updated, newPassword || undefined);
        } catch (err: any) {
          if (usernameChanged) {
            await this.saveTeacherProfile(userId, { username: previousUsername }).catch(() => {});
          }
          throw new Error(
            `Bilgiler kaydedildi ancak giriş hesabı güncellenemedi: ${err?.message || 'bilinmeyen hata'}` +
              (usernameChanged ? ' Kullanıcı adı eski haline döndürüldü.' : '')
          );
        }
      }
      return;
    }

    // 2. Öğrenci
    const student = this.students.find((s) => s.id === userId);
    if (student) {
      const studentUpdates: Partial<Student> = {};
      if (updates.name && updates.name.trim()) studentUpdates.name = updates.name.trim();
      if (updates.email !== undefined) studentUpdates.email = cleanStudentEmail(updates.email);
      if (updates.phone !== undefined) studentUpdates.phone = updates.phone.trim();
      if (updates.studentNumber !== undefined) studentUpdates.studentNumber = updates.studentNumber.trim();
      if (updates.avatar !== undefined) studentUpdates.avatar = updates.avatar;
      if (updates.classId !== undefined) {
        studentUpdates.classId = updates.classId;
        const cls = this.classes.find((c) => c.id === updates.classId);
        if (cls) studentUpdates.className = cls.name;
      }
      if (updates.schoolLevel !== undefined) studentUpdates.schoolLevel = updates.schoolLevel;
      if (updates.gradeLevel !== undefined) studentUpdates.gradeLevel = updates.gradeLevel;

      await this.updateStudent(userId, studentUpdates, {
        newPassword: newPassword || undefined,
        mustChangePassword: updates.mustChangePassword,
      });
      return;
    }

    throw new Error('Güncellenecek kullanıcı kaydı bulunamadı.');
  }

  // Hesabı askıya alma / açma: giriş hesabı sunucuda kilitlenir (giriş yapılamaz) ve
  // kayıttaki durum tüm cihazlarda "askıda" görünür.
  public async adminToggleUserSuspension(userId: string, suspend: boolean, _reason?: string): Promise<void> {
    const teacher = this.teachers.find((t) => t.id === userId);
    const student = teacher ? undefined : this.students.find((s) => s.id === userId);
    if (!teacher && !student) throw new Error('Kullanıcı bulunamadı.');

    if (teacher && suspend && (this.isHeadAdminTeacher(teacher) || teacher.isAdmin)) {
      throw new Error('Yönetici hesabı askıya alınamaz. Önce yöneticilik yetkisini kaldırınız.');
    }

    await invokeCreateUserEdgeFunction({
      action: 'set_suspended',
      type: teacher ? 'teacher' : 'student',
      id: userId,
      suspended: suspend,
    });

    if (teacher) {
      this.teachers = this.teachers.map((t) =>
        t.id === userId ? { ...t, isSuspended: suspend, status: suspend ? 'suspended' : 'approved' } : t
      );
      saveData(STORAGE_KEYS.TEACHERS, this.teachers);
      try {
        localStorage.setItem(PERMANENT_KEYS.MASTER_TEACHERS, JSON.stringify(this.teachers));
      } catch {}
    } else {
      this.students = this.students.map((s) =>
        s.id === userId ? { ...s, isSuspended: suspend, status: suspend ? 'suspended' : 'active' } : s
      );
      saveData(STORAGE_KEYS.STUDENTS, this.students);
      try {
        localStorage.setItem(PERMANENT_KEYS.MASTER_STUDENTS, JSON.stringify(this.students));
      } catch {}
    }
    this.notify();
  }

  // =========================================================================
  // ÖĞRETMEN ERİŞİM YETKİLENDİRMESİ (YÖNETİCİ KONTROLÜNDE)
  // =========================================================================
  public async adminUpdateTeacherAuthorizations(
    teacherId: string,
    assignedClassIds: string[],
    assignedStudentIds: string[]
  ): Promise<void> {
    const teacher = this.teachers.find((t) => t.id === teacherId);
    if (!teacher) throw new Error('Öğretmen bulunamadı.');

    // 1. teacher.auth_user_id çözümleme
    let authUserId = teacher.auth_user_id;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!authUserId && uuidRegex.test(teacherId)) {
      authUserId = teacherId;
      teacher.auth_user_id = authUserId;
    }

    if (!authUserId) {
      throw new Error(
        `"${teacher.name}" kullanıcısının Supabase Auth ID'si (auth_user_id) bulunamadı. Öğretmenin veritabanında aktif bir Auth hesabı olmalıdır.`
      );
    }

    // 2. Supabase Veritabanına Yazma (Öncelikli olarak atomik PostgreSQL RPC fonksiyonu)
    let rpcExecuted = false;
    try {
      const { data, error } = await supabase.rpc('admin_set_teacher_access', {
        p_teacher_auth_id: authUserId,
        p_class_ids: assignedClassIds,
        p_student_ids: assignedStudentIds,
      });

      if (error) {
        // Fonksiyon henüz DB'de yoksa doğrudan sorgu bloğuna geç, aksi takdirde hatayı fırlat
        if (
          error.code === 'PGRST202' ||
          error.message?.includes('function') ||
          error.message?.includes('does not exist')
        ) {
          console.warn('RPC admin_set_teacher_access bulunamadı, doğrudan sorgu bloğuna geçiliyor...');
        } else {
          throw new Error(`Veritabanı yetkilendirme hatası (RPC): ${error.message}`);
        }
      } else {
        rpcExecuted = true;
      }
    } catch (rpcErr: any) {
      if (!rpcErr.message?.includes('function') && !rpcErr.message?.includes('does not exist')) {
        throw rpcErr;
      }
    }

    // RPC fonksiyonu yoksa doğrudan PostgREST DELETE + INSERT ile doğrulamalı yaz
    if (!rpcExecuted) {
      // A) Sınıf erişimlerini sil
      const { error: delClassErr } = await supabase
        .from('teacher_class_access')
        .delete()
        .eq('teacher_auth_id', authUserId);

      if (delClassErr) {
        throw new Error(`Eski sınıf yetkileri temizlenemedi: ${delClassErr.message}`);
      }

      // B) Öğrenci erişimlerini sil
      const { error: delStdErr } = await supabase
        .from('teacher_student_access')
        .delete()
        .eq('teacher_auth_id', authUserId);

      if (delStdErr) {
        throw new Error(`Eski öğrenci yetkileri temizlenemedi: ${delStdErr.message}`);
      }

      // C) Yeni sınıf erişimlerini ekle
      if (assignedClassIds.length > 0) {
        const classRows = assignedClassIds.map((cid) => ({
          teacher_auth_id: authUserId,
          class_id: cid,
        }));
        const { error: tcErr } = await supabase.from('teacher_class_access').insert(classRows);
        if (tcErr) {
          throw new Error(`Yeni sınıf yetkileri kaydedilemedi: ${tcErr.message}`);
        }
      }

      // D) Yeni öğrenci erişimlerini ekle
      if (assignedStudentIds.length > 0) {
        const studentRows = assignedStudentIds.map((sid) => ({
          teacher_auth_id: authUserId,
          student_id: sid,
        }));
        const { error: tsErr } = await supabase.from('teacher_student_access').insert(studentRows);
        if (tsErr) {
          throw new Error(`Yeni öğrenci yetkileri kaydedilemedi: ${tsErr.message}`);
        }
      }
    }

    // 3. Veritabanı başarıyla güncellendikten sonra yerel durumu güncelle
    teacher.assignedClassIds = [...assignedClassIds];
    saveData(STORAGE_KEYS.TEACHERS, this.teachers);
    try {
      localStorage.setItem(PERMANENT_KEYS.MASTER_TEACHERS, JSON.stringify(this.teachers));
    } catch {}

    // Sınıflardaki authorizedTeacherIds listesini güncelle
    for (const cls of this.classes) {
      const currentAuth: string[] = cls.authorizedTeacherIds ? [...cls.authorizedTeacherIds] : [];
      const shouldHave = assignedClassIds.includes(cls.id) || assignedClassIds.includes(cls.name);
      const has = currentAuth.includes(teacherId);

      let changed = false;
      if (shouldHave && !has) {
        currentAuth.push(teacherId);
        changed = true;
      } else if (!shouldHave && has) {
        const idx = currentAuth.indexOf(teacherId);
        if (idx !== -1) currentAuth.splice(idx, 1);
        changed = true;
      }

      if (changed) {
        cls.authorizedTeacherIds = currentAuth;
      }
    }
    saveData(STORAGE_KEYS.CLASSES, this.classes);
    try {
      localStorage.setItem(PERMANENT_KEYS.MASTER_CLASSES, JSON.stringify(this.classes));
    } catch {}

    // Öğrencilerdeki authorizedTeacherIds listesini güncelle
    for (const std of this.students) {
      const currentAuth: string[] = std.authorizedTeacherIds ? [...std.authorizedTeacherIds] : [];
      const shouldHave = assignedStudentIds.includes(std.id);
      const has = currentAuth.includes(teacherId);

      let changed = false;
      if (shouldHave && !has) {
        currentAuth.push(teacherId);
        changed = true;
      } else if (!shouldHave && has) {
        const idx = currentAuth.indexOf(teacherId);
        if (idx !== -1) currentAuth.splice(idx, 1);
        changed = true;
      }

      if (changed) {
        std.authorizedTeacherIds = currentAuth;
      }
    }
    saveData(STORAGE_KEYS.STUDENTS, this.students);
    try {
      localStorage.setItem(PERMANENT_KEYS.MASTER_STUDENTS, JSON.stringify(this.students));
    } catch {}

    this.notify();
  }

  public async getTeacherCloudAccess(teacherAuthId: string): Promise<{ classIds: string[]; studentIds: string[] }> {
    const { data: cData, error: cErr } = await supabase
      .from('teacher_class_access')
      .select('class_id')
      .eq('teacher_auth_id', teacherAuthId);

    if (cErr) {
      throw new Error(`Sınıf erişim izinleri veritabanından okunamadı: ${cErr.message}`);
    }

    const { data: sData, error: sErr } = await supabase
      .from('teacher_student_access')
      .select('student_id')
      .eq('teacher_auth_id', teacherAuthId);

    if (sErr) {
      throw new Error(`Öğrenci erişim izinleri veritabanından okunamadı: ${sErr.message}`);
    }

    return {
      classIds: cData ? cData.map((r: any) => r.class_id) : [],
      studentIds: sData ? sData.map((r: any) => r.student_id) : [],
    };
  }

  public async adminDeleteUser(userId: string): Promise<void> {
    const teacher = this.teachers.find((t) => t.id === userId);
    if (teacher) {
      if (this.isHeadAdminTeacher(teacher)) {
        throw new Error('Baş yönetici hesabı silinemez.');
      }
      if (teacher.isAdmin) {
        throw new Error('Yönetici hesabı silinemez. Önce yöneticilik yetkisini kaldırınız.');
      }
      // 1) Giriş hesabını sil (sunucu). Başarısızsa kayıt silinmez.
      const { failed } = await this.deleteLoginAccounts('teacher', [userId]);
      if (failed.length > 0) {
        throw new Error(`Öğretmenin giriş hesabı silinemedi: ${failed[0].error || 'bilinmeyen hata'}`);
      }
      // 2) Öğretmen kaydını sil ve silindiğini doğrula
      const { error } = await this.deleteRowsVerified('teachers', [userId]);
      if (error) {
        throw new Error(`Giriş hesabı silindi ancak öğretmen kaydı silinemedi: ${error.message || 'yetki hatası'}`);
      }
      this.deletedTeacherIds.add(userId);
      saveData(STORAGE_KEYS.DELETED_TEACHERS, Array.from(this.deletedTeacherIds));
      this.teachers = this.teachers.filter((t) => t.id !== userId);
      saveData(STORAGE_KEYS.TEACHERS, this.teachers);
      try {
        localStorage.setItem(PERMANENT_KEYS.MASTER_TEACHERS, JSON.stringify(this.teachers));
      } catch {}
      this.notify();
      return;
    }

    const student = this.students.find((s) => s.id === userId);
    if (student) {
      await this.deleteStudent(userId);
      return;
    }

    throw new Error('Silinecek kullanıcı bulunamadı.');
  }

  public async adminResetPassword(userId: string, tempPassword?: string): Promise<string> {
    const newPass = tempPassword || this.generatePassword();
    await this.adminUpdateUserProfile(userId, {
      newPassword: newPass,
      mustChangePassword: true,
    });
    return newPass;
  }

  // Öğretmenler kendi kendine kayıt olamaz: öğretmen hesaplarını yönetici açar.
  public registerTeacher(_data: {
    name: string;
    username: string;
    password?: string;
    email: string;
    branch?: string;
    avatar?: string;
  }): Teacher {
    throw new Error('Öğretmen kaydı kapalıdır. Öğretmen hesapları sistem yöneticisi tarafından açılır.');
  }

  // =========================================================================
  // GİRİŞ HESAPLARI (create-user sunucu fonksiyonu)
  // =========================================================================

  // Okunması kolay, karışan karakterleri (0/O, 1/l/I) içermeyen rastgele şifre
  public generatePassword(length = 8): string {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const bytes = new Uint8Array(length);
    try {
      crypto.getRandomValues(bytes);
    } catch {
      for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    let out = '';
    for (let i = 0; i < length; i++) out += chars[bytes[i] % chars.length];
    // En az bir rakam içersin
    if (!/[0-9]/.test(out)) out = out.slice(0, -1) + String(2 + (bytes[0] % 8));
    return out;
  }

  // Öğrenci numarası / kullanıcı adı giriş adresine dönüştürülebilir mi?
  public isValidLoginIdentifier(value: string): boolean {
    return /^[0-9A-Za-z_-]{1,20}$/.test((value || '').trim());
  }

  // Kaydın giriş hesabını oluşturur veya günceller (şifre verilirse şifre de belirlenir).
  // Giriş adı: öğrencide öğrenci numarası, öğretmende kullanıcı adı.
  private async syncLoginAccount(
    type: 'teacher' | 'student',
    record: Teacher | Student,
    password?: string,
    mustChangePassword?: boolean
  ): Promise<{ auth_user_id: string | null; account: boolean }> {
    if (password && password.length < DataService.MIN_PASSWORD_LENGTH) {
      throw new Error(`Şifre en az ${DataService.MIN_PASSWORD_LENGTH} karakter olmalıdır.`);
    }
    const identifier =
      type === 'teacher'
        ? ((record as Teacher).username || '').trim()
        : ((record as Student).studentNumber || '').trim();
    if (!identifier) {
      throw new Error(type === 'teacher' ? 'Öğretmenin kullanıcı adı boş olamaz.' : 'Öğrenci numarası boş olamaz (giriş için kullanılır).');
    }

    const result = await invokeCreateUserEdgeFunction({
      type,
      id: record.id,
      identifier,
      name: record.name,
      password: password || undefined,
      mustChangePassword: mustChangePassword === false ? false : undefined,
    });

    const authUserId = (result?.auth_user_id as string | null) || null;
    if (authUserId) {
      if (type === 'teacher') {
        this.teachers = this.teachers.map((t) => (t.id === record.id ? { ...t, auth_user_id: authUserId } : t));
        saveData(STORAGE_KEYS.TEACHERS, this.teachers);
      } else {
        this.students = this.students.map((s) => (s.id === record.id ? { ...s, auth_user_id: authUserId } : s));
        saveData(STORAGE_KEYS.STUDENTS, this.students);
      }
      this.notify();
    }
    return { auth_user_id: authUserId, account: !!result?.account };
  }

  // Kayıtlar silinmeden ÖNCE giriş hesaplarını siler. Sonuç kayıt bazında döner.
  private async deleteLoginAccounts(
    type: 'teacher' | 'student',
    ids: string[]
  ): Promise<{ okIds: string[]; failed: Array<{ id: string; error?: string }> }> {
    if (ids.length === 0) return { okIds: [], failed: [] };
    const okIds: string[] = [];
    const failed: Array<{ id: string; error?: string }> = [];
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const res = await invokeCreateUserEdgeFunction({ action: 'delete_accounts', type, ids: chunk });
      const results = res?.results || [];
      for (const id of chunk) {
        const r = results.find((x) => x.id === id);
        if (r && r.ok === false) failed.push({ id, error: r.error });
        else okIds.push(id);
      }
    }
    return { okIds, failed };
  }

  // Yönetici: yeni öğretmen hesabı (kayıt + giriş hesabı birlikte; biri başarısızsa hiçbiri kalmaz)
  public async createTeacherAccount(data: {
    name: string;
    username: string;
    branch?: string;
    email?: string;
    phone?: string;
    password: string;
    isAdmin?: boolean;
  }): Promise<{ teacher: Teacher; password: string }> {
    if (!this.isCurrentUserAdmin()) {
      throw new Error('Öğretmen hesabını yalnızca sistem yöneticisi açabilir.');
    }
    const name = (data.name || '').trim();
    const username = (data.username || '').trim().toLowerCase();
    const password = (data.password || '').trim();
    if (name.length < 3) throw new Error('Lütfen öğretmenin adını ve soyadını giriniz.');
    if (!/^[a-z0-9_-]{3,30}$/.test(username)) {
      throw new Error('Kullanıcı adı 3-30 karakter olmalı; yalnızca küçük harf, rakam, - ve _ içerebilir (Türkçe karakter ve boşluk kullanılamaz).');
    }
    if (password.length < DataService.MIN_PASSWORD_LENGTH) {
      throw new Error(`Şifre en az ${DataService.MIN_PASSWORD_LENGTH} karakter olmalıdır.`);
    }
    if (this.teachers.some((t) => (t.username || '').toLowerCase() === username)) {
      throw new Error(`"${username}" kullanıcı adı başka bir öğretmende kullanılıyor.`);
    }

    const teacher: Teacher = {
      id: `teacher-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      username,
      email: (data.email || '').trim(),
      branch: (data.branch || '').trim() || 'Öğretmen',
      phone: (data.phone || '').trim(),
      avatar: `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(name)}`,
      createdAt: new Date().toISOString(),
      role: 'teacher',
      status: 'approved',
      isAdmin: false,
      assignedClassIds: [],
      canViewAllStudentsAndClasses: false,
    };

    const { error: insertError } = await supabase.from('teachers').insert({
      id: teacher.id,
      name: teacher.name,
      username: teacher.username,
      email: teacher.email || null,
      branch: teacher.branch,
      avatar: teacher.avatar,
      role: 'teacher',
      status: 'approved',
      is_admin: false,
      created_at: teacher.createdAt,
    });
    if (insertError) {
      throw new Error(`Öğretmen kaydı oluşturulamadı: ${insertError.code === '42501' ? 'Bu işlem için yetkiniz yok' : insertError.message}`);
    }

    try {
      const res = await invokeCreateUserEdgeFunction({
        type: 'teacher',
        id: teacher.id,
        identifier: username,
        name,
        password,
      });
      teacher.auth_user_id = (res?.auth_user_id as string) || undefined;
    } catch (err: any) {
      await this.deleteRowsVerified('teachers', [teacher.id]).catch(() => {});
      throw new Error(`Giriş hesabı açılamadı, kayıt geri alındı: ${err?.message || 'bilinmeyen hata'}`);
    }

    if (data.isAdmin) {
      try {
        await invokeCreateUserEdgeFunction({ action: 'set_role', id: teacher.id, role: 'admin' });
        teacher.isAdmin = true;
      } catch {
        // hesap açıldı; yönetici yetkisi daha sonra verilebilir
      }
    }

    // Anlık güncelleme aynı öğretmeni daha önce eklemiş olabilir: aynı kimlik iki kez listelenmez
    this.teachers = [teacher, ...this.teachers.filter((t) => t.id !== teacher.id)];
    saveData(STORAGE_KEYS.TEACHERS, this.teachers);
    try {
      localStorage.setItem(PERMANENT_KEYS.MASTER_TEACHERS, JSON.stringify(this.teachers));
    } catch {}
    this.notify();
    return { teacher, password };
  }

  // Etüt ekranı: giriş hesabı OLMAYAN öğretmen kaydı (yalnızca ad/branş bilgisi). Yalnızca yönetici.
  public addApprovedTeacher(data: { name: string; branch: string; email?: string; phone?: string }): Teacher {
    if (!this.isCurrentUserAdmin()) {
      throw new Error('Yeni öğretmen kaydını yalnızca sistem yöneticisi ekleyebilir.');
    }
    const cleanName = data.name.trim();
    const cleanUsername = cleanName
      .toLowerCase()
      .replace(/ğ/g, 'g')
      .replace(/ü/g, 'u')
      .replace(/ş/g, 's')
      .replace(/ı/g, 'i')
      .replace(/ö/g, 'o')
      .replace(/ç/g, 'c')
      .replace(/[^a-z0-9]/g, '.');

    const newTeacher: Teacher = {
      id: `teacher-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: cleanName,
      username: cleanUsername,
      email: data.email?.trim() || '',
      branch: data.branch?.trim() || 'Genel Branş',
      phone: data.phone?.trim() || '',
      avatar: `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(cleanName)}`,
      createdAt: new Date().toISOString(),
      role: 'teacher',
      status: 'approved',
      isAdmin: false,
      assignedClassIds: [],
      canViewAllStudentsAndClasses: false,
    };

    this.teachers.unshift(newTeacher);
    saveData(STORAGE_KEYS.TEACHERS, this.teachers);
    try {
      localStorage.setItem(PERMANENT_KEYS.MASTER_TEACHERS, JSON.stringify(this.teachers));
    } catch {}
    this.syncTeacherToCloud(newTeacher);
    this.notify();
    return newTeacher;
  }

  // Yerel öğretmen kaydını, oturumu ve "beni hatırla" bilgisini günceller (bulut yazımı yapmaz)
  private applyTeacherLocal(teacherId: string, updates: Partial<Teacher>): { previous: Teacher; updated: Teacher } {
    const idx = this.teachers.findIndex((t) => t.id === teacherId);
    if (idx === -1) {
      throw new Error('Öğretmen kaydı bulunamadı.');
    }
    const previous = this.teachers[idx];
    const updated = { ...previous, ...updates };
    this.teachers[idx] = updated;
    saveData(STORAGE_KEYS.TEACHERS, this.teachers);
    try {
      localStorage.setItem(PERMANENT_KEYS.MASTER_TEACHERS, JSON.stringify(this.teachers));
    } catch {}
    try {
      localStorage.setItem(`edu_sys_teacher_custom_profile_${teacherId}`, JSON.stringify(updated));
    } catch (e) {
      console.warn('Could not write custom teacher profile override:', e);
    }

    const currentSession = this.getAuthSession();
    if (currentSession?.role === 'teacher' && currentSession.user.id === teacherId) {
      this.setAuthSession({ role: 'teacher', user: updated });
    }

    const remembered = this.getRememberedUser('teacher');
    if (
      remembered &&
      (remembered.identifier.toLowerCase() === (previous.username || '').toLowerCase() ||
        remembered.identifier.toLowerCase() === (previous.email || '').toLowerCase())
    ) {
      this.setRememberedUser({
        ...remembered,
        name: updated.name,
        branch: updated.branch,
        avatar: updated.avatar,
        identifier: updated.username || remembered.identifier,
      });
    }
    this.notify();
    return { previous, updated };
  }

  // Eski çağrılar için: yereli günceller, buluta arka planda yazar
  public updateTeacherProfile(teacherId: string, updates: Partial<Teacher>): Teacher {
    const { updated } = this.applyTeacherLocal(teacherId, updates);
    this.syncTeacherToCloud(updated);
    return updated;
  }

  // Profil kaydetme: buluta yazılmasını BEKLER; yazılamazsa yerel değişiklik geri alınır ve hata fırlatılır
  public async saveTeacherProfile(teacherId: string, updates: Partial<Teacher>): Promise<Teacher> {
    const { previous, updated } = this.applyTeacherLocal(teacherId, updates);
    const res = await this.writeTeacherRow(updated);
    if (!res.success) {
      this.applyTeacherLocal(teacherId, previous);
      const reason = res.error?.code === '42501' ? 'Bu işlem için yetkiniz yok' : res.error?.message || 'Bağlantı sorunu';
      throw new Error(`Profil bilgileri kaydedilemedi (${reason}). Değişiklikler geri alındı.`);
    }
    return updated;
  }

  public async updateTeacherPassword(_teacherId: string, oldPassword: string, newPassword: string): Promise<void> {
    // Şifre yalnızca Supabase Auth üzerinde değiştirilir (yerel kopya tutulmaz)
    await this.changeOwnPassword(oldPassword, newPassword);
  }

  // =========================================================================
  // ŞİFRE İŞLEMLERİ (Supabase Auth)
  // =========================================================================
  public static readonly MIN_PASSWORD_LENGTH = 6;

  // Sistemin öğretmen/öğrenci hesapları için ürettiği giriş adresi (create-user fonksiyonu ile aynı kural)
  private canonicalAuthEmail(type: 'teacher' | 'student', identifier: string): string {
    const clean = (identifier || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    return `${type === 'teacher' ? 'tch' : 'std'}_${clean || 'user'}@okul.internal.net`;
  }

  private translatePasswordError(message?: string): string {
    const m = (message || '').toLowerCase();
    if (m.includes('at least')) return `Şifre en az ${DataService.MIN_PASSWORD_LENGTH} karakter olmalıdır.`;
    if (m.includes('different from the old')) return 'Yeni şifreniz mevcut şifrenizden farklı olmalıdır.';
    if (m.includes('weak') || m.includes('pwned') || m.includes('leaked')) {
      return 'Bu şifre çok zayıf. Lütfen harf ve rakam içeren daha güçlü bir şifre seçiniz.';
    }
    if (m.includes('reauthentication') || m.includes('nonce')) {
      return 'Güvenlik nedeniyle yeniden giriş gerekiyor. Çıkış yapıp tekrar giriş yaptıktan sonra deneyiniz.';
    }
    if (m.includes('rate limit') || m.includes('security purposes')) {
      return 'Çok sık deneme yapıldı. Lütfen birkaç dakika sonra tekrar deneyiniz.';
    }
    return message || 'Şifre işlemi sırasında bir hata oluştu.';
  }

  // Oturumdaki kullanıcının KENDİ şifresini değiştirir. Önce eski şifre Supabase'de doğrulanır.
  public async changeOwnPassword(oldPassword: string, newPassword: string): Promise<void> {
    if (!oldPassword) throw new Error('Lütfen mevcut şifrenizi giriniz.');
    if (!newPassword || newPassword.length < DataService.MIN_PASSWORD_LENGTH) {
      throw new Error(`Yeni şifreniz en az ${DataService.MIN_PASSWORD_LENGTH} karakter olmalıdır.`);
    }
    if (oldPassword === newPassword) {
      throw new Error('Yeni şifreniz mevcut şifrenizden farklı olmalıdır.');
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const email = sessionData?.session?.user?.email;
    if (!email) {
      throw new Error('Oturumunuz bulunamadı. Lütfen çıkış yapıp tekrar giriş yapınız.');
    }

    // 1) Eski şifreyi doğrula (yanlışsa mevcut oturum bozulmaz, işlem burada durur)
    const { error: verifyError } = await supabase.auth.signInWithPassword({ email, password: oldPassword });
    if (verifyError) {
      const vm = (verifyError.message || '').toLowerCase();
      if (vm.includes('rate limit') || vm.includes('too many')) {
        throw new Error(this.translatePasswordError(verifyError.message));
      }
      throw new Error('Mevcut şifreniz hatalı. Lütfen kontrol edip tekrar deneyiniz.');
    }

    // 2) Yeni şifreyi Supabase'e yaz ("ilk girişte şifre değiştir" işaretini de kaldır)
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
      data: { must_change_password: false },
    });
    if (updateError) {
      throw new Error(this.translatePasswordError(updateError.message));
    }
  }

  // Öğrencinin "ilk girişte şifre değiştir" zorunluluğunu yerelde kaldırır (şifre yerelde saklanmaz)
  public markStudentPasswordChanged(studentId: string): void {
    this.students = this.students.map((s) =>
      s.id === studentId ? { ...s, mustChangePassword: false, password: '' } : s
    );
    saveData(STORAGE_KEYS.STUDENTS, this.students);
    try {
      localStorage.setItem(PERMANENT_KEYS.MASTER_STUDENTS, JSON.stringify(this.students));
    } catch {}
    const session = this.getAuthSession();
    if (session?.role === 'student' && session.user.id === studentId) {
      const fresh = this.students.find((s) => s.id === studentId);
      if (fresh) this.setAuthSession({ ...session, user: fresh });
    }
    this.notify();
  }

  // "Şifremi unuttum": gerçek e-posta adresine Supabase sıfırlama bağlantısı gönderir
  public async sendPasswordResetEmail(email: string): Promise<void> {
    const clean = (email || '').trim().toLowerCase();
    if (!clean.includes('@') || clean.endsWith('@okul.internal.net')) {
      throw new Error('Şifre sıfırlama bağlantısı yalnızca gerçek bir e-posta adresine gönderilebilir.');
    }
    const { error } = await supabase.auth.resetPasswordForEmail(clean, {
      redirectTo: `${window.location.origin}/`,
    });
    if (error) {
      throw new Error(this.translatePasswordError(error.message));
    }
  }

  // Sıfırlama bağlantısıyla gelen kullanıcının yeni şifresini kaydeder, ardından oturumu kapatır
  public async completePasswordRecovery(newPassword: string): Promise<void> {
    if (!newPassword || newPassword.length < DataService.MIN_PASSWORD_LENGTH) {
      throw new Error(`Yeni şifreniz en az ${DataService.MIN_PASSWORD_LENGTH} karakter olmalıdır.`);
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      throw new Error(this.translatePasswordError(error.message));
    }
    clearPasswordRecovery();
    await supabase.auth.signOut().catch(() => {});
  }

  // --- CLOUD SYNCHRONIZATION FOR TEACHERS (DIRECT public.teachers TABLE) ---

  // Öğretmen satırını buluta yazar.
  //  - Yönetici: tüm alanlarla ekler/günceller.
  //  - Öğretmen: yalnızca KENDİ satırının ad, e-posta, branş ve fotoğrafını günceller
  //    (kullanıcı adı, rol, yetki ve hesap durumu yalnızca yönetici tarafından değiştirilebilir).
  private async writeTeacherRow(teacher: Teacher): Promise<{ success: boolean; error?: any }> {
    try {
      if (this.isCurrentUserAdmin()) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const payload: any = {
          id: teacher.id,
          name: teacher.name,
          username: teacher.username || null,
          email: teacher.email || null,
          branch: teacher.branch || null,
          avatar: teacher.avatar || null,
          role: teacher.role || 'teacher',
          status: teacher.status || 'approved',
          is_admin: Boolean(teacher.isAdmin),
          created_at: teacher.createdAt || new Date().toISOString(),
        };
        if (teacher.auth_user_id && uuidRegex.test(teacher.auth_user_id)) {
          payload.auth_user_id = teacher.auth_user_id;
        }
        const { error } = await supabase.from('teachers').upsert(payload);
        return error ? { success: false, error } : { success: true };
      }

      const session = this.getAuthSession();
      if (session?.role !== 'teacher' || session.user.id !== teacher.id) {
        return { success: false, error: { code: '42501', message: 'Başka bir öğretmenin bilgilerini değiştirme yetkiniz yok' } };
      }
      const { data, error } = await supabase
        .from('teachers')
        .update({
          name: teacher.name,
          email: teacher.email || null,
          branch: teacher.branch || null,
          avatar: teacher.avatar || null,
        })
        .eq('id', teacher.id)
        .select('id');
      if (error) return { success: false, error };
      if (!data || data.length === 0) {
        return { success: false, error: { code: '42501', message: 'Kayıt güncellenemedi (yetki yok)' } };
      }
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e };
    }
  }

  public async syncTeacherToCloud(teacher: Teacher): Promise<void> {
    const res = await this.writeTeacherRow(teacher);
    if (!res.success) {
      console.warn('[TeacherSync] Öğretmen buluta yazılamadı:', res.error?.message || res.error);
    }
  }

  public async deleteTeacherFromCloud(teacherId: string): Promise<void> {
    try {
      const { error } = await supabase.from('teachers').delete().eq('id', teacherId);
      if (error) {
        console.warn('[TeacherSync] Error deleting teacher from public.teachers:', error.message);
      }
    } catch (e: any) {
      console.warn('[TeacherSync] Exception deleting teacher from cloud:', e?.message || e);
    }
  }

  public async syncAllTeachersToCloud(): Promise<void> {
    try {
      const activeTeachers = this.teachers.filter((t) => !this.deletedTeacherIds.has(t.id));
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      const payload = activeTeachers.map((teacher) => {
        const authUserId =
          teacher.auth_user_id && uuidRegex.test(teacher.auth_user_id) ? teacher.auth_user_id : null;
        const row: any = {
          id: teacher.id,
          name: teacher.name,
          username: teacher.username || null,
          email: teacher.email || null,
          branch: teacher.branch || null,
          avatar: teacher.avatar || null,
          role: teacher.role || 'teacher',
          status: teacher.status || 'approved',
          is_admin: Boolean(teacher.isAdmin),
          created_at: teacher.createdAt || new Date().toISOString(),
        };
        if (authUserId) {
          row.auth_user_id = authUserId;
        }
        return row;
      });

      if (payload.length > 0) {
        const { error } = await supabase.from('teachers').upsert(payload);
        if (error) {
          console.warn('[TeacherSync] Error in syncAllTeachersToCloud:', error.message);
        }
      }
    } catch (e: any) {
      console.warn('[TeacherSync] Exception in syncAllTeachersToCloud:', e?.message || e);
    }
  }

  public async syncTeachersFromSupabase(isBackground = false): Promise<Teacher[]> {
    // Gerçek (Supabase Auth) oturum yoksa buluttan okuma yapma: RLS boş liste döndürür
    // ve yerel veriler yanlışlıkla silinmiş gibi görünür.
    if (!(await this.hasCloudSession())) return this.teachers;
    try {
      // Doğrudan public.teachers tablosundan sorgula (homeworks hack'i kullanılmaz)
      const { data: remoteRows, error } = await supabase
        .from('teachers')
        .select('*');

      if (error) {
        if (!isBackground) {
          console.error('[TeacherSync] Error fetching teachers from public.teachers:', error.message);
        }
        return this.teachers;
      }

      if (!remoteRows || remoteRows.length === 0) {
        // Bulutta hiç öğretmen kaydı dönmediyse yerel listeye dokunma (buluta da otomatik yükleme yapma)
        return this.teachers;
      }

      let changed = false;
      let newPendingCount = 0;
      const localTeacherMap = new Map<string, Teacher>();
      this.teachers.forEach((t) => localTeacherMap.set(t.id, t));

      for (const row of remoteRows) {
        if (!row.id || this.deletedTeacherIds.has(row.id)) continue;

        const localT = localTeacherMap.get(row.id);
        const remoteIsAdmin = Boolean(row.is_admin);

        if (!localT) {
          // Yeni gelen öğretmen kaydı
          const newTeacher: Teacher = {
            id: row.id,
            auth_user_id: row.auth_user_id || undefined,
            name: row.name || 'Öğretmen',
            username: row.username || row.name || 'ogretmen',
            email: row.email || '',
            branch: row.branch || 'Öğretmen',
            avatar: row.avatar || undefined,
            role: (row.role as 'teacher') || 'teacher',
            status: (row.status as any) || 'approved',
            isAdmin: remoteIsAdmin,
            isSuspended: row.status === 'suspended',
            createdAt: row.created_at || new Date().toISOString(),
            assignedClassIds: [],
            canViewAllStudentsAndClasses: false,
          };

          this.teachers.unshift(newTeacher);
          localTeacherMap.set(row.id, newTeacher);
          changed = true;
          if (newTeacher.status === 'pending') {
            newPendingCount++;
          }
        } else {
          // Mevcut öğretmen: veritabanı verileriyle güncelle
          let updated = false;

          if (row.name && row.name !== localT.name) {
            localT.name = row.name;
            updated = true;
          }
          if (row.username && row.username !== localT.username) {
            localT.username = row.username;
            updated = true;
          }
          if (row.email && row.email !== localT.email) {
            localT.email = row.email;
            updated = true;
          }
          if (row.branch && row.branch !== localT.branch) {
            localT.branch = row.branch;
            updated = true;
          }
          if (row.avatar && row.avatar !== localT.avatar) {
            localT.avatar = row.avatar;
            updated = true;
          }
          if (row.auth_user_id && row.auth_user_id !== localT.auth_user_id) {
            localT.auth_user_id = row.auth_user_id;
            updated = true;
          }
          if (row.status && row.status !== localT.status) {
            localT.status = row.status;
            updated = true;
          }
          const remoteSuspended = row.status === 'suspended';
          if (!!localT.isSuspended !== remoteSuspended) {
            localT.isSuspended = remoteSuspended;
            updated = true;
          }
          if (localT.isAdmin !== remoteIsAdmin) {
            localT.isAdmin = remoteIsAdmin;
            updated = true;
          }

          if (updated) {
            changed = true;
            const currentSession = this.getAuthSession();
            if (currentSession?.role === 'teacher' && currentSession.user.id === row.id) {
              this.setAuthSession({
                ...currentSession,
                user: {
                  ...currentSession.user,
                  ...localT,
                },
              });
            }
          }
        }
      }

      // Merkezi veritabanı tek doğruluk kaynağıdır: yerelde olup bulutta olmayan öğretmenler
      // (ör. her yeni cihazda yerelde otomatik oluşturulan 'teacher-1' yönetici kopyası)
      // artık buluta YÜKLENMEZ, yerelden kaldırılır. Önceki davranış çift admin kaydı üretiyordu.
      const remoteIdSet = new Set(remoteRows.map((r: any) => r.id));
      const teacherCountBefore = this.teachers.length;
      this.teachers = this.teachers.filter((lt) => remoteIdSet.has(lt.id));
      if (this.teachers.length !== teacherCountBefore) {
        changed = true;
      }

      if (changed) {
        saveData(STORAGE_KEYS.TEACHERS, this.teachers);
        try {
          localStorage.setItem(PERMANENT_KEYS.MASTER_TEACHERS, JSON.stringify(this.teachers));
        } catch {}

        if (newPendingCount > 0) {
          playNotificationChime();
          sendBrowserNotification(
            'Yeni Öğretmen Kayıt Başvurusu',
            `${newPendingCount} yeni öğretmen başvurusu onay bekliyor.`
          );
        }

        this.notify();
      }

      return this.teachers;
    } catch (e: any) {
      if (!isBackground) console.error('[TeacherSync] syncTeachersFromSupabase error:', e?.message || e);
      return this.teachers;
    }
  }

  public async forceSyncTeachers(): Promise<Teacher[]> {
    return this.syncTeachersFromSupabase(false);
  }

  // Supabase giriş hatalarını kullanıcıya anlaşılır mesaja çevirir.
  // null: kullanıcı adı/şifre hatalı (çağıran genel mesaj gösterir)
  private loginErrorMessage(err: any, role: 'teacher' | 'student'): string | null {
    const m = `${err?.code || ''} ${err?.message || ''}`.toLowerCase();
    if (m.includes('banned')) {
      return role === 'student'
        ? 'Hesabınız şu anda kapalı: kayıt başvurunuz henüz onaylanmamış olabilir veya hesabınız askıya alınmıştır. Lütfen öğretmeninize veya okul yöneticinize başvurunuz.'
        : 'Hesabınız askıya alınmıştır. Lütfen kurum yöneticiniz ile iletişime geçiniz.';
    }
    if (m.includes('rate limit') || m.includes('too many')) {
      return 'Çok fazla deneme yapıldı. Lütfen birkaç dakika sonra tekrar deneyiniz.';
    }
    if (m.includes('fetch') || m.includes('network')) {
      return 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol ediniz.';
    }
    return null;
  }

  // Sırayla aday giriş adreslerini dener. Kilitli/askıdaki hesapta hemen durur.
  private async signInWithCandidates(
    emails: string[],
    password: string,
    role: 'teacher' | 'student'
  ): Promise<{ user: any } | null> {
    const tried = new Set<string>();
    for (const email of emails) {
      const clean = (email || '').trim().toLowerCase();
      if (!clean || tried.has(clean)) continue;
      tried.add(clean);
      const { data, error } = await supabase.auth.signInWithPassword({ email: clean, password });
      if (!error && data?.user) return { user: data.user };
      const friendly = this.loginErrorMessage(error, role);
      if (friendly) throw new Error(friendly);
    }
    return null;
  }

  public async authenticateTeacher(usernameOrEmail: string, password: string): Promise<Teacher | null> {
    const term = usernameOrEmail.trim().toLowerCase();

    // Aday giriş adresleri: e-posta ile giriş, sistemin kullanıcı adından ürettiği adres
    const candidates: string[] = [];
    if (term.includes('@')) {
      candidates.push(term);
    } else {
      candidates.push(this.canonicalAuthEmail('teacher', term));
      const known = this.teachers.find((t) => (t.username || '').toLowerCase() === term || t.id.toLowerCase() === term);
      if (known?.email) candidates.push(known.email);
      if (known) candidates.push(this.canonicalAuthEmail('teacher', known.username || known.id));
    }

    // Giriş YALNIZCA Supabase Auth üzerinden yapılır (yerel şifre / arka kapı yoktur).
    const signed = await this.signInWithCandidates(candidates, password, 'teacher');
    if (!signed) {
      console.warn('Supabase Auth: öğretmen girişi başarısız');
      return null;
    }
    const authUser = signed.user;

    const appRole = authUser.app_metadata?.role;
    const isAppAdmin = appRole === 'admin' || authUser.app_metadata?.is_admin === true ||
      (authUser.email || '').toLowerCase() === 'm.bilirr@gmail.com';
    if (appRole !== 'teacher' && !isAppAdmin) {
      await supabase.auth.signOut();
      throw new Error(
        appRole === 'student' || appRole === 'applicant'
          ? 'Bu bir öğrenci hesabıdır. Lütfen "Öğrenci Portalı" sekmesinden giriş yapınız.'
          : 'Bu hesabın öğretmen yetkisi bulunmuyor. Lütfen kurum yöneticinize başvurunuz.'
      );
    }

    // Veritabanındaki kendi öğretmen kaydını oku (durum ve yetki bilgisi buradan gelir)
    let row: any = null;
    try {
      const { data } = await supabase.from('teachers').select('*').eq('auth_user_id', authUser.id).maybeSingle();
      row = data || null;
    } catch {
      row = null;
    }

    let teacher = this.teachers.find(
      (t) =>
        (row && t.id === row.id) ||
        (t.auth_user_id && t.auth_user_id === authUser.id) ||
        (t.email && t.email.toLowerCase() === authUser.email?.toLowerCase())
    );

    if (row) {
      const fromRow: Teacher = {
        ...(teacher || ({} as Teacher)),
        id: row.id,
        auth_user_id: authUser.id,
        name: row.name || teacher?.name || authUser.user_metadata?.name || usernameOrEmail,
        username: row.username || teacher?.username || term,
        email: row.email || '',
        branch: row.branch || teacher?.branch || 'Öğretmen',
        avatar: row.avatar || teacher?.avatar,
        createdAt: row.created_at || teacher?.createdAt || authUser.created_at,
        role: 'teacher',
        status: row.status || 'approved',
        isSuspended: row.status === 'suspended',
        isAdmin: isAppAdmin,
        assignedClassIds: teacher?.assignedClassIds || [],
      };
      teacher = fromRow;
      const idx = this.teachers.findIndex((t) => t.id === fromRow.id);
      if (idx === -1) this.teachers.push(fromRow);
      else this.teachers[idx] = fromRow;
      saveData(STORAGE_KEYS.TEACHERS, this.teachers);
    } else if (!teacher) {
      if (!isAppAdmin) {
        await supabase.auth.signOut();
        throw new Error('Öğretmen kaydınız bulunamadı. Lütfen kurum yöneticinize başvurunuz.');
      }
      teacher = {
        id: authUser.user_metadata?.legacy_id || authUser.id,
        auth_user_id: authUser.id,
        name: authUser.user_metadata?.name || usernameOrEmail,
        username: term,
        email: authUser.email || '',
        branch: 'Kurum Yöneticisi',
        createdAt: authUser.created_at,
        role: 'teacher',
        status: 'approved',
        isAdmin: true,
        assignedClassIds: [],
      };
      this.teachers.push(teacher);
    } else {
      teacher.auth_user_id = teacher.auth_user_id || authUser.id;
      teacher.isAdmin = isAppAdmin;
    }

    if (teacher.isSuspended || teacher.status === 'suspended') {
      await supabase.auth.signOut();
      throw new Error('Hesabınız askıya alınmıştır. Lütfen kurum yöneticiniz ile iletişime geçiniz.');
    }
    if (teacher.status === 'pending' || teacher.status === 'rejected') {
      await supabase.auth.signOut();
      throw new Error('Hesabınız henüz kurum yöneticisi tarafından onaylanmamıştır. Lütfen kurum yöneticinize başvurunuz.');
    }

    return teacher;
  }

  public async authenticateStudent(identifier: string, password: string): Promise<Student | null> {
    const term = identifier.trim().toLowerCase();

    // Aday giriş adresleri: öğrenci numarası (asıl giriş adı), e-posta, bu cihazda bilinen kayıt
    const candidates: string[] = [];
    if (term.includes('@')) {
      candidates.push(term);
    } else {
      candidates.push(this.canonicalAuthEmail('student', term));
      const known = this.students.find(
        (s) =>
          s.studentNumber?.toLowerCase() === term ||
          (s.username || '').toLowerCase() === term ||
          s.id.toLowerCase() === term
      );
      if (known?.studentNumber) candidates.push(this.canonicalAuthEmail('student', known.studentNumber));
    }

    const signed = await this.signInWithCandidates(candidates, password, 'student');
    if (!signed) {
      console.warn('Supabase Auth: öğrenci girişi başarısız');
      return null;
    }
    const authUser = signed.user;
    const appRole = authUser.app_metadata?.role;

    if (appRole === 'applicant') {
      await supabase.auth.signOut();
      throw new Error('Kayıt başvurunuz henüz onaylanmadı. Yönetici onayladıktan sonra giriş yapabilirsiniz.');
    }
    if (appRole !== 'student') {
      await supabase.auth.signOut();
      throw new Error('Bu bir öğretmen/yönetici hesabıdır. Lütfen "Öğretmen" sekmesinden giriş yapınız.');
    }

    // Öğrencinin kendi kaydını veritabanından oku (sınıf, numara, durum güncel gelir)
    const { data: row, error: rowError } = await supabase
      .from('students')
      .select('*')
      .eq('auth_user_id', authUser.id)
      .maybeSingle();

    if (rowError || !row) {
      await supabase.auth.signOut();
      throw new Error(
        rowError
          ? 'Öğrenci bilgileriniz okunamadı. Lütfen internet bağlantınızı kontrol edip tekrar deneyiniz.'
          : 'Öğrenci kaydınız bulunamadı. Lütfen öğretmeninize veya okul yöneticinize başvurunuz.'
      );
    }
    if (row.status === 'suspended') {
      await supabase.auth.signOut();
      throw new Error('Hesabınız askıya alınmıştır. Lütfen öğretmeninize veya okul yöneticinize başvurunuz.');
    }

    const local = this.students.find((s) => s.id === row.id);
    const cls = this.classes.find((c) => c.id === row.class_id);
    const student: Student = {
      ...(local || ({} as Student)),
      id: row.id,
      auth_user_id: authUser.id,
      name: row.name,
      username: row.student_number || local?.username || row.id,
      studentNumber: row.student_number || '',
      email: cleanStudentEmail(row.email),
      phone: row.phone || '',
      avatar: row.avatar || local?.avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(row.name)}`,
      classId: row.class_id || 'class-default',
      className: row.class_name || 'Atanmadı',
      schoolLevel: cls?.schoolLevel || local?.schoolLevel || detectSchoolLevelFromGrade(row.class_name) || 'Ortaokul',
      gradeLevel: cls?.gradeLevel || local?.gradeLevel,
      branch: cls?.branch || local?.branch,
      createdAt: row.registered_at || local?.createdAt || new Date().toISOString(),
      status: 'active',
      isSuspended: false,
      password: undefined,
      mustChangePassword: authUser.user_metadata?.must_change_password === true,
    };

    const idx = this.students.findIndex((s) => s.id === student.id);
    if (idx === -1) this.students.push(student);
    else this.students[idx] = student;
    saveData(STORAGE_KEYS.STUDENTS, this.students);

    return student;
  }

  public getAuthSession(): AuthSession | null {
    // Sayfa kapatılıp açıldığında oturumu kapatmak için sessionStorage kullanılır
    let saved: AuthSession | null = null;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEYS.AUTH_SESSION);
      if (raw) {
        saved = JSON.parse(raw);
      }
    } catch (e) {
      console.error('SessionStorage parse error:', e);
    }

    // Eski kalıntı localStorage oturum anahtarını temizle
    try {
      localStorage.removeItem(STORAGE_KEYS.AUTH_SESSION);
    } catch {}

    if (saved && saved.user) {
      // Re-hydrate session user object from the current state so updates to name/username/branch/avatar are never lost
      if (saved.role === 'teacher') {
        const freshTeacher = this.teachers.find(
          (t) =>
            t.id === saved.user.id ||
            t.username?.toLowerCase() === (saved.user as Teacher).username?.toLowerCase() ||
            (t.email && (saved.user as Teacher).email && t.email.toLowerCase() === (saved.user as Teacher).email?.toLowerCase())
        );
        if (freshTeacher) {
          if (freshTeacher.isSuspended || freshTeacher.status === 'suspended') {
            this.logout();
            return null;
          }
          saved.user = freshTeacher;
        }

        // Apply any dedicated profile overrides stored in local storage
        try {
          const specific = localStorage.getItem(`edu_sys_teacher_custom_profile_${saved.user.id}`);
          if (specific) {
            saved.user = { ...saved.user, ...JSON.parse(specific) };
          }
        } catch {
          // ignore
        }

      } else if (saved.role === 'student') {
        const freshStudent = this.students.find(
          (s) =>
            s.id === saved.user.id ||
            s.username?.toLowerCase() === (saved.user as Student).username?.toLowerCase() ||
            (s.studentNumber && (saved.user as Student).studentNumber && s.studentNumber.toLowerCase() === (saved.user as Student).studentNumber?.toLowerCase())
        );
        if (freshStudent) {
          if (freshStudent.isSuspended || freshStudent.status === 'suspended') {
            this.logout();
            return null;
          }
          saved.user = freshStudent;
        }
      }
      return saved;
    }
    return null;
  }

  public setAuthSession(session: AuthSession | null): void {
    if (session) {
      try {
        sessionStorage.setItem(STORAGE_KEYS.AUTH_SESSION, JSON.stringify(session));
      } catch (e) {
        console.error('SessionStorage set error:', e);
      }
      // Oturum açıldığında anlık dinleyicileri bağla ve bulut veritabanından en güncel verileri çek
      this.setupAllRealtimeSync();
      this.revalidateAndSyncAll(false);
    } else {
      try {
        sessionStorage.removeItem(STORAGE_KEYS.AUTH_SESSION);
      } catch {}
      this.unsubscribeAllRealtime();
    }
    try {
      localStorage.removeItem(STORAGE_KEYS.AUTH_SESSION);
    } catch {}
    this.notify();
  }

  public logout(): void {
    this.unsubscribeAllRealtime();
    this.myTeacherAccess = { classIds: new Set(), studentIds: new Set(), loaded: false };
    this.pendingApplicationCount = 0;
    // Uygulama oturumu kapanınca Supabase oturumu da kapansın
    supabase.auth.signOut().catch(() => {});
    this.setAuthSession(null);
    try {
      sessionStorage.removeItem(STORAGE_KEYS.AUTH_SESSION);
      sessionStorage.removeItem('edu_sys_last_activity_ts');
      localStorage.removeItem(STORAGE_KEYS.AUTH_SESSION);
    } catch {}
    this.clearUserDataAfterLogout();
    this.notify();
  }

  // Gizlilik: çıkışta bu sekmedeki tüm kişisel veriler bellekten ve tarayıcıdan silinir.
  // Aynı bilgisayarda sonra giriş yapan kişi önceki kullanıcının verilerini göremez.
  private clearUserDataAfterLogout(): void {
    clearSessionAppData();
    purgePersistentPersonalData();
    clearSignedUrlCache();
    this.students = [];
    this.classes = [];
    this.teachers = [];
    this.homeworks = [];
    this.submissions = [];
    this.etuts = [];
    this.attendance = [];
    this.grades = [];
    this.messages = [];
    this.documents = [];
    this.studentNotifications = [];
    this.sentEmails = [];
    this.questionLogs = [];
    this.weeklyQuestionTargets = [];
    this.deletedTeacherIds = new Set();
    this.deletedStudentIds = new Set();
    this.deletedClassIds = new Set();
    this.deletedHomeworkIds = new Set();
    this.deletedEtutIds = new Set();
    this.deletedQuestionLogIds = new Set();
    this.documentDetailCache.clear();
    this.currentAuthUid = null;
    this.lastFullSyncAt = 0;
  }

  // --- BENİ HATIRLA / KOLAY GİRİŞ ---
  public getRememberedUser(role?: UserRole): {
    role: UserRole;
    identifier: string;
    name: string;
    avatar?: string;
    branch?: string;
    className?: string;
    savedPassword?: string;
    deviceId?: string;
  } | null {
    const currentDeviceId = getLocalDeviceId();
    let saved: {
      role: UserRole;
      identifier: string;
      name: string;
      avatar?: string;
      branch?: string;
      className?: string;
      savedPassword?: string;
      deviceId?: string;
    } | null = null;

    if (role === 'teacher') {
      saved = loadData(STORAGE_KEYS.REMEMBER_ME_TEACHER, null);
      if (!saved) {
        const general = loadData<{
          role: UserRole;
          identifier: string;
          name: string;
          avatar?: string;
          branch?: string;
          className?: string;
          savedPassword?: string;
          deviceId?: string;
        } | null>(STORAGE_KEYS.REMEMBER_ME, null);
        if (general?.role === 'teacher') saved = general;
      }
    } else if (role === 'student') {
      saved = loadData(STORAGE_KEYS.REMEMBER_ME_STUDENT, null);
      if (!saved) {
        const general = loadData<{
          role: UserRole;
          identifier: string;
          name: string;
          avatar?: string;
          branch?: string;
          className?: string;
          savedPassword?: string;
          deviceId?: string;
        } | null>(STORAGE_KEYS.REMEMBER_ME, null);
        if (general?.role === 'student') saved = general;
      }
    } else {
      saved = loadData(STORAGE_KEYS.REMEMBER_ME, null);
      if (!saved) {
        saved = loadData(STORAGE_KEYS.REMEMBER_ME_TEACHER, null) || loadData(STORAGE_KEYS.REMEMBER_ME_STUDENT, null);
      }
    }

    if (!saved) return null;

    // Cihaz Bağımlılığı Kontrolü:
    // Eğer kaydedilen bilginin deviceId'si bu cihazın benzersiz ID'si ile eşleşmiyorsa
    // veya daha önce eski sistemden kalma sahte/otomatik atanmış veri ise, KESİNLİKLE null dönülür.
    // Böylece başka bilgisayar veya telefondan açıldığında Mustafa Bilir veya başka kullanıcı asla otomatik çıkmaz!
    if (!saved.deviceId || saved.deviceId !== currentDeviceId) {
      if (role === 'teacher') {
        try { localStorage.removeItem(STORAGE_KEYS.REMEMBER_ME_TEACHER); } catch {}
      } else if (role === 'student') {
        try { localStorage.removeItem(STORAGE_KEYS.REMEMBER_ME_STUDENT); } catch {}
      } else {
        try {
          localStorage.removeItem(STORAGE_KEYS.REMEMBER_ME);
          localStorage.removeItem(STORAGE_KEYS.REMEMBER_ME_TEACHER);
          localStorage.removeItem(STORAGE_KEYS.REMEMBER_ME_STUDENT);
        } catch {}
      }
      return null;
    }

    if (saved.role === 'teacher') {
      const liveTeacher = this.teachers.find(
        (t) =>
          (t.username && t.username.toLowerCase() === saved!.identifier.toLowerCase()) ||
          (t.email && t.email.toLowerCase() === saved!.identifier.toLowerCase()) ||
          (t.name && t.name.toLowerCase() === saved!.name.toLowerCase()) ||
          t.id === saved!.identifier
      );
      if (liveTeacher) {
        return {
          role: 'teacher',
          identifier: liveTeacher.username,
          name: liveTeacher.name,
          avatar: liveTeacher.avatar,
          branch: liveTeacher.branch,
          deviceId: saved.deviceId,
        };
      }
      return null;
    } else if (saved.role === 'student') {
      const liveStudent = this.students.find(
        (s) =>
          (s.username && s.username.toLowerCase() === saved!.identifier.toLowerCase()) ||
          (s.studentNumber && s.studentNumber.toLowerCase() === saved!.identifier.toLowerCase()) ||
          (s.email && s.email.toLowerCase() === saved!.identifier.toLowerCase()) ||
          (s.name && s.name.toLowerCase() === saved!.name.toLowerCase()) ||
          s.id === saved!.identifier
      );
      if (liveStudent) {
        return {
          role: 'student',
          identifier: liveStudent.username,
          name: liveStudent.name,
          avatar: liveStudent.avatar,
          className: liveStudent.className,
          deviceId: saved.deviceId,
        };
      }
      return null;
    }

    return saved;
  }

  public getRememberedTeacher() {
    return this.getRememberedUser('teacher');
  }

  public getRememberedStudent() {
    return this.getRememberedUser('student');
  }

  public setRememberedUser(
    data: {
      role: UserRole;
      identifier: string;
      name: string;
      avatar?: string;
      branch?: string;
      className?: string;
      savedPassword?: string;
      deviceId?: string;
    } | null,
    targetRole?: UserRole
  ): void {
    if (data) {
      // GÜVENLİK: şifre asla tarayıcıya kaydedilmez; yalnızca kullanıcı adı ve görünen bilgiler hatırlanır
      const { savedPassword: _neverStored, ...safeData } = data;
      const payload = {
        ...safeData,
        deviceId: getLocalDeviceId(),
      };
      saveData(STORAGE_KEYS.REMEMBER_ME, payload);
      if (data.role === 'teacher') {
        saveData(STORAGE_KEYS.REMEMBER_ME_TEACHER, payload);
      } else if (data.role === 'student') {
        saveData(STORAGE_KEYS.REMEMBER_ME_STUDENT, payload);
      }
    } else {
      if (targetRole === 'teacher') {
        try {
          localStorage.removeItem(STORAGE_KEYS.REMEMBER_ME_TEACHER);
          const general = loadData<any>(STORAGE_KEYS.REMEMBER_ME, null);
          if (general?.role === 'teacher') {
            const studentSaved = loadData<any>(STORAGE_KEYS.REMEMBER_ME_STUDENT, null);
            if (studentSaved) {
              saveData(STORAGE_KEYS.REMEMBER_ME, studentSaved);
            } else {
              localStorage.removeItem(STORAGE_KEYS.REMEMBER_ME);
            }
          }
        } catch (e) {
          console.error(e);
        }
      } else if (targetRole === 'student') {
        try {
          localStorage.removeItem(STORAGE_KEYS.REMEMBER_ME_STUDENT);
          const general = loadData<any>(STORAGE_KEYS.REMEMBER_ME, null);
          if (general?.role === 'student') {
            const teacherSaved = loadData<any>(STORAGE_KEYS.REMEMBER_ME_TEACHER, null);
            if (teacherSaved) {
              saveData(STORAGE_KEYS.REMEMBER_ME, teacherSaved);
            } else {
              localStorage.removeItem(STORAGE_KEYS.REMEMBER_ME);
            }
          }
        } catch (e) {
          console.error(e);
        }
      } else {
        try {
          localStorage.removeItem(STORAGE_KEYS.REMEMBER_ME);
          localStorage.removeItem(STORAGE_KEYS.REMEMBER_ME_TEACHER);
          localStorage.removeItem(STORAGE_KEYS.REMEMBER_ME_STUDENT);
        } catch (e) {
          console.error(e);
        }
      }
    }
  }

  private showFloatingErrorToast(message: string): void {
    if (typeof document === 'undefined') return;
    try {
      const existing = document.getElementById('dataservice-error-toast');
      if (existing) existing.remove();

      const toast = document.createElement('div');
      toast.id = 'dataservice-error-toast';
      toast.className =
        'fixed top-5 right-5 z-50 max-w-md bg-rose-600 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center space-x-2.5 border border-rose-500 animate-in slide-in-from-top-2 text-xs font-semibold';
      // GÜVENLİK: mesaj (sunucudan gelen hata metnini içerebilir) HTML olarak değil düz metin olarak eklenir
      const svgNs = 'http://www.w3.org/2000/svg';
      const icon = document.createElementNS(svgNs, 'svg');
      icon.setAttribute('class', 'w-4 h-4 shrink-0');
      icon.setAttribute('fill', 'none');
      icon.setAttribute('stroke', 'currentColor');
      icon.setAttribute('viewBox', '0 0 24 24');
      const path = document.createElementNS(svgNs, 'path');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      path.setAttribute('stroke-width', '2');
      path.setAttribute(
        'd',
        'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z'
      );
      icon.appendChild(path);
      const text = document.createElement('span');
      text.textContent = message;
      toast.appendChild(icon);
      toast.appendChild(text);
      document.body.appendChild(toast);
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 5000);
    } catch {}
  }

  // --- CLASSES ---
  public async addClass(
    classData: Omit<ClassGroup, 'id'>,
    forcedTeacherId?: string
  ): Promise<ClassGroup & { autoAssignedCount?: number }> {
    const session = this.getAuthSession();
    const currentTeacherId =
      forcedTeacherId || (session?.role === 'teacher' ? session.user.id : undefined);

    const newClass: ClassGroup = {
      ...classData,
      id: `class-${Date.now()}`,
      createdTeacherId: currentTeacherId,
    };

    // Rollback için önceki durumların yedeğini al
    const prevClasses = [...this.classes];
    const prevStudents = [...this.students];
    const prevTeachers = JSON.parse(JSON.stringify(this.teachers));

    this.classes.push(newClass);

    // If added by a teacher, automatically add this class to their assignedClassIds
    if (currentTeacherId) {
      const t = this.teachers.find((item) => item.id === currentTeacherId);
      if (t) {
        if (!t.assignedClassIds) t.assignedClassIds = [];
        if (!t.assignedClassIds.includes(newClass.id)) {
          t.assignedClassIds.push(newClass.id);
          saveData(STORAGE_KEYS.TEACHERS, this.teachers);
        }
      }
    }

    // OTOMATİK SINIF AKTARIMI:
    // Oluşturulan sınıf ismi ile önceden kayıt olmuş öğrenciler var ise otomatik olarak bu sınıfa aktarılır
    const normalizeClassStr = (str: string | undefined | null): string => {
      if (!str) return '';
      return str
        .toLowerCase()
        .replace(/[\s\-_/\\.]/g, '')
        .replace(/şube/g, '')
        .replace(/sube/g, '')
        .replace(/sınıf/g, '')
        .replace(/sinif/g, '')
        .trim();
    };

    const targetNorm = normalizeClassStr(newClass.name);
    let autoAssignedCount = 0;

    this.students = this.students.map((s) => {
      const sNorm = normalizeClassStr(s.className);
      const isExactName = (s.className || '').trim().toLowerCase() === newClass.name.trim().toLowerCase();
      const isNormMatch = targetNorm.length > 0 && sNorm.length > 0 && sNorm === targetNorm;
      const isGradeBranchMatch =
        newClass.gradeLevel &&
        newClass.branch &&
        s.gradeLevel === newClass.gradeLevel &&
        s.branch === newClass.branch;

      if (isExactName || isNormMatch || (isGradeBranchMatch && (!s.classId || s.className === 'Atanmadı'))) {
        autoAssignedCount++;
        return {
          ...s,
          classId: newClass.id,
          className: newClass.name,
          schoolLevel: newClass.schoolLevel || s.schoolLevel,
          gradeLevel: newClass.gradeLevel || s.gradeLevel,
          branch: newClass.branch || s.branch,
        };
      }
      return s;
    });

    if (autoAssignedCount > 0) {
      saveData(STORAGE_KEYS.STUDENTS, this.students);
      try {
        localStorage.setItem(PERMANENT_KEYS.MASTER_STUDENTS, JSON.stringify(this.students));
      } catch {}
      this.syncStudentsToCloud(this.students.filter((s) => s.classId === newClass.id)).catch(() => {});
    }

    saveData(STORAGE_KEYS.CLASSES, this.classes);

    // Bulut yazmasını AWAIT et ve sonucunu doğrula:
    const cloudRes = await this.syncClassToCloud(newClass);

    if (!cloudRes.success) {
      // ROLLBACK: Buluta yazılamadıysa yerel state ve depolamayı tamamen eski haline döndür
      this.classes = prevClasses;
      this.students = prevStudents;
      this.teachers = prevTeachers;
      saveData(STORAGE_KEYS.CLASSES, this.classes);
      saveData(STORAGE_KEYS.STUDENTS, this.students);
      saveData(STORAGE_KEYS.TEACHERS, this.teachers);
      this.notify();

      const errMsg =
        cloudRes.error?.message ||
        (cloudRes.error?.code === '42501'
          ? 'Sınıf oluşturma yetkiniz bulunmamaktadır (RLS kuralı).'
          : 'Sınıf bulut veritabanına kaydedilemedi.');

      this.showFloatingErrorToast(`Hata: ${errMsg} Değişiklikler geri alındı.`);
      throw new Error(`[addClass] Sınıf buluta kaydedilemedi: ${errMsg}`);
    }

    this.notify();
    return { ...newClass, autoAssignedCount };
  }

  // Öğrencileri tek tek veya toplu olarak belirli bir sınıfa aktarma
  public async assignStudentsToClass(studentIds: string[], classId: string): Promise<number> {
    const cls = this.classes.find((c) => c.id === classId);
    if (!cls || !studentIds || studentIds.length === 0) return 0;

    // Rollback için önceki durumun yedeğini al
    const prevStudents = JSON.parse(JSON.stringify(this.students));

    let count = 0;
    this.students = this.students.map((s) => {
      if (studentIds.includes(s.id)) {
        count++;
        return {
          ...s,
          classId: cls.id,
          className: cls.name,
          schoolLevel: cls.schoolLevel || s.schoolLevel,
          gradeLevel: cls.gradeLevel || s.gradeLevel,
          branch: cls.branch || s.branch,
        };
      }
      return s;
    });

    if (count > 0) {
      saveData(STORAGE_KEYS.STUDENTS, this.students);
      try {
        localStorage.setItem(PERMANENT_KEYS.MASTER_STUDENTS, JSON.stringify(this.students));
      } catch {}

      // Sadece sınıfı değişen öğrencileri buluta senkronize et ve sonucunu doğrula
      const studentRes = await this.syncStudentsToCloud(this.students.filter((s) => studentIds.includes(s.id)));

      if (!studentRes.success) {
        // ROLLBACK: Öğrenciler buluta yazılamadıysa yerel state'i geri al
        this.students = prevStudents;
        saveData(STORAGE_KEYS.STUDENTS, this.students);
        try {
          localStorage.setItem(PERMANENT_KEYS.MASTER_STUDENTS, JSON.stringify(this.students));
        } catch {}
        this.notify();

        const errMsg =
          studentRes.error?.message ||
          (studentRes.error?.code === '42501'
            ? 'Öğrencileri sınıfa aktarma yetkiniz bulunmamaktadır (RLS kuralı).'
            : 'Öğrenci sınıf aktarımı bulut veritabanına kaydedilemedi.');

        this.showFloatingErrorToast(`Hata: ${errMsg} Değişiklikler geri alındı.`);
        throw new Error(`[assignStudentsToClass] Buluta aktarım başarısız: ${errMsg}`);
      }

      this.notify();
    }
    return count;
  }

  // Öğrenciyi sınıftan çıkarma
  public async removeStudentFromClass(studentId: string): Promise<void> {
    const prevStudents = JSON.parse(JSON.stringify(this.students));
    const targetStudent = this.students.find((s) => s.id === studentId);
    if (!targetStudent) return;

    this.students = this.students.map((s) => {
      if (s.id === studentId) {
        return {
          ...s,
          classId: '',
          className: 'Atanmadı',
        };
      }
      return s;
    });
    saveData(STORAGE_KEYS.STUDENTS, this.students);
    try {
      localStorage.setItem(PERMANENT_KEYS.MASTER_STUDENTS, JSON.stringify(this.students));
    } catch {}

    const updated = this.students.find((s) => s.id === studentId);
    const cloudRes = updated ? await this.syncStudentToCloud(updated) : { success: true };

    if (!cloudRes.success) {
      // ROLLBACK
      this.students = prevStudents;
      saveData(STORAGE_KEYS.STUDENTS, this.students);
      try {
        localStorage.setItem(PERMANENT_KEYS.MASTER_STUDENTS, JSON.stringify(this.students));
      } catch {}
      this.notify();

      const errMsg =
        cloudRes.error?.message ||
        (cloudRes.error?.code === '42501'
          ? 'Öğrenciyi sınıftan çıkarma yetkiniz bulunmamaktadır (RLS kuralı).'
          : 'Öğrenci sınıftan çıkarma işlemi bulut veritabanına kaydedilemedi.');

      this.showFloatingErrorToast(`Hata: ${errMsg} Değişiklikler geri alındı.`);
      throw new Error(`[removeStudentFromClass] Sınıftan çıkarma başarısız: ${errMsg}`);
    }

    this.notify();
  }

  public async updateClass(id: string, updates: Partial<ClassGroup>): Promise<void> {
    const prevClasses = this.classes;
    this.classes = this.classes.map((c) => (c.id === id ? { ...c, ...updates } : c));
    saveData(STORAGE_KEYS.CLASSES, this.classes);
    this.notify();
    const updated = this.classes.find((c) => c.id === id);
    if (updated) {
      await this.runCloudWrite(
        async () => {
          const res = await this.syncClassToCloud(updated);
          return { error: res.success ? null : res.error || { message: 'Sınıf kaydedilemedi' } };
        },
        () => {
          this.classes = prevClasses;
          saveData(STORAGE_KEYS.CLASSES, this.classes);
        },
        'Sınıf güncellemesi buluta kaydedilemedi'
      );
    }
  }

  public async deleteClass(id: string): Promise<void> {
    // Geri alma için önceki durumların kopyası
    const prevClassesForDelete = this.classes;
    const prevStudentsForDelete = this.students;
    const prevDeletedClassIds = new Set(this.deletedClassIds);

    this.deletedClassIds.add(id);
    saveData(STORAGE_KEYS.DELETED_CLASSES, Array.from(this.deletedClassIds));
    try {
      localStorage.setItem(PERMANENT_KEYS.DELETED_CLASSES, JSON.stringify(Array.from(this.deletedClassIds)));
    } catch {}

    this.classes = this.classes.filter((c) => c.id !== id);
    // Unassign students from this class
    this.students = this.students.map((s) => (s.classId === id ? { ...s, classId: '', className: 'Atanmadı' } : s));
    saveData(STORAGE_KEYS.CLASSES, this.classes);
    saveData(STORAGE_KEYS.STUDENTS, this.students);
    try {
      localStorage.setItem(PERMANENT_KEYS.MASTER_CLASSES, JSON.stringify(this.classes));
      localStorage.setItem(PERMANENT_KEYS.MASTER_STUDENTS, JSON.stringify(this.students));
    } catch {}

    // Clean legacy versioned keys
    [
      'edu_sys_classes_v6',
      'edu_sys_classes_v5',
      'edu_sys_classes_v4',
      'edu_sys_classes_v3',
      'edu_sys_classes_v2',
      'edu_sys_classes_v1',
      'edu_sys_classes',
      'edu_sys_classes_backup',
    ].forEach((k) => {
      try { localStorage.removeItem(k); } catch {}
    });

    // Yerel state zaten güncellendi: arayüz bulut çağrılarını beklemeden hemen güncellensin
    this.notify();

    // Buluttan silmeyi bekle ve doğrula; başarısızsa her şeyi geri al
    const { error: classDeleteError } = await this.deleteRowsVerified('classes', [id]);
    if (classDeleteError) {
      this.classes = prevClassesForDelete;
      this.students = prevStudentsForDelete;
      this.deletedClassIds = prevDeletedClassIds;
      saveData(STORAGE_KEYS.CLASSES, this.classes);
      saveData(STORAGE_KEYS.STUDENTS, this.students);
      saveData(STORAGE_KEYS.DELETED_CLASSES, Array.from(this.deletedClassIds));
      try {
        localStorage.setItem(PERMANENT_KEYS.MASTER_CLASSES, JSON.stringify(this.classes));
        localStorage.setItem(PERMANENT_KEYS.MASTER_STUDENTS, JSON.stringify(this.students));
        localStorage.setItem(PERMANENT_KEYS.DELETED_CLASSES, JSON.stringify(Array.from(this.deletedClassIds)));
      } catch {}
      this.notify();
      const reason = classDeleteError?.code === '42501' ? 'Bu işlem için yetkiniz yok' : classDeleteError?.message || 'Bağlantı sorunu';
      this.showFloatingErrorToast(`Hata: Sınıf buluttan silinemedi (${reason}). Değişiklikler geri alındı.`);
      throw new Error(`[deleteClass] Sınıf silinemedi: ${reason}`);
    }

    // Sınıftaki öğrencilerin sınıf bilgisini bulutta da temizle (başka cihazlarda eski sınıf görünmesin)
    const unassigned = this.students.filter((s) => prevStudentsForDelete.some((p) => p.id === s.id && p.classId === id));
    if (unassigned.length > 0) {
      await this.syncStudentsToCloud(unassigned);
    }

    // Sync tombstones so all devices immediately purge this class
    await this.syncTombstonesToCloud();
  }

  // --- CLOUD SYNCHRONIZATION FOR CLASSES ---
  public async syncClassToCloud(cls: ClassGroup): Promise<{ success: boolean; error?: any }> {
    try {
      const studentCount = this.students.filter((s) => s.classId === cls.id || s.className === cls.name).length;
      let levelNum = 8;
      if (cls.gradeLevel) {
        const m = cls.gradeLevel.match(/\d+/);
        if (m) levelNum = parseInt(m[0], 10);
      } else if (cls.name) {
        const m = cls.name.match(/\d+/);
        if (m) levelNum = parseInt(m[0], 10);
      }

      const { error } = await supabase.from('classes').upsert({
        id: cls.id,
        name: cls.name,
        branch: cls.branch || 'Genel',
        level: levelNum,
        student_count: studentCount,
        academic_year: cls.academicYear || '2026-2027',
      });

      if (error) {
        console.warn('Error syncing class to cloud:', error);
        return { success: false, error };
      }

      return { success: true };
    } catch (e) {
      console.warn('Exception syncing class to cloud:', e);
      return { success: false, error: e };
    }
  }

  public async deleteClassFromCloud(classId: string): Promise<void> {
    try {
      const { error } = await supabase.from('classes').delete().eq('id', classId);
      if (error) {
        console.warn('Error deleting class from cloud:', error);
      }
    } catch (e) {
      console.warn('Error deleting class from cloud:', e);
    }
  }

  public async syncAllClassesToCloud(): Promise<void> {
    try {
      const activeClasses = this.classes.filter((c) => !this.deletedClassIds.has(c.id));
      const payload = activeClasses.map((cls) => {
        let levelNum = 8;
        if (cls.gradeLevel) {
          const m = cls.gradeLevel.match(/\d+/);
          if (m) levelNum = parseInt(m[0], 10);
        } else if (cls.name) {
          const m = cls.name.match(/\d+/);
          if (m) levelNum = parseInt(m[0], 10);
        }
        return {
          id: cls.id,
          name: cls.name,
          branch: cls.branch || 'Genel',
          level: levelNum,
          student_count: this.students.filter((s) => s.classId === cls.id || s.className === cls.name).length,
          academic_year: cls.academicYear || '2026-2027',
        };
      });

      if (payload.length > 0) {
        const { error } = await supabase.from('classes').upsert(payload);
        if (error) {
          console.warn('Error syncing all classes to cloud:', error);
        }
      }
    } catch (e) {
      console.warn('Error syncing all classes to cloud:', e);
    }
  }

  public async syncClassesFromSupabase(isBackground = false): Promise<ClassGroup[]> {
    // Gerçek (Supabase Auth) oturum yoksa buluttan okuma yapma: RLS boş liste döndürür
    // ve yerel veriler yanlışlıkla silinmiş gibi görünür.
    if (!(await this.hasCloudSession())) return this.classes;
    try {
      // 0. Ensure tombstones are loaded first
      await this.syncTombstonesFromCloud();

      // 1. Fetch from Supabase classes table (Central DB is source of truth)
      const { data: remoteClasses, error: errCls } = await supabase.from('classes').select('*');
      if (errCls) {
        if (!isBackground) {
          console.warn('Error fetching classes from Supabase:', errCls);
        }
        return this.classes;
      }

      const remoteMap = new Map<string, ClassGroup>();

      if (remoteClasses && Array.isArray(remoteClasses)) {
        remoteClasses.forEach((rc: any) => {
          if (!rc.id || this.deletedClassIds.has(rc.id)) return;
          const normRcName = (rc.name || '').trim().toLowerCase().replace(/[\s\-_/\\.]/g, '');
          if (!normRcName || normRcName === 'sinif' || normRcName === 'atanmadi' || normRcName === 'tanimsiz') return;

          remoteMap.set(rc.id, {
            id: rc.id,
            name: rc.name,
            branch: rc.branch || 'Genel',
            gradeLevel: rc.level ? `${rc.level}. Sınıf` : undefined,
            schoolLevel: rc.level && rc.level >= 9 ? 'Lise' : 'Ortaokul',
            academicYear: rc.academic_year || '2026-2027',
            createdTeacherId: 'teacher-1',
          });
        });
      }

      // The central database is the single source of truth:
      // Any class deleted on computer is cleanly removed from local state on all devices!
      const deduplicatedClasses = this.deduplicateClasses(Array.from(remoteMap.values()));
      this.classes = deduplicatedClasses;
      saveData(STORAGE_KEYS.CLASSES, this.classes);
      try {
        localStorage.setItem(PERMANENT_KEYS.MASTER_CLASSES, JSON.stringify(this.classes));
      } catch {}
      this.notify();

      return this.classes;
    } catch (e) {
      if (!isBackground) console.warn('Exception in syncClassesFromSupabase:', e);
      return this.classes;
    }
  }

  // --- STUDENTS ---
  // =========================================================================
  // ÖĞRENCİ KAYDI + GİRİŞ HESABI (her zaman birlikte)
  // Öğrenci satırı eklenir, ardından sunucu fonksiyonu giriş hesabını açar.
  // Hesap açılamayan öğrencinin satırı geri silinir: "hesabı olmayan öğrenci" oluşmaz.
  // =========================================================================
  public async createStudentsWithAccounts(items: StudentAccountInput[]): Promise<StudentAccountResult> {
    const session = this.getAuthSession();
    if (session?.role !== 'teacher') {
      throw new Error('Öğrenci eklemek için öğretmen veya yönetici olarak giriş yapmalısınız.');
    }
    const currentTeacherId = session.user.id;
    const created: StudentCredential[] = [];
    const failed: StudentAccountFailure[] = [];
    const prepared: Array<{ student: Student; password: string }> = [];
    const seenNumbers = new Set<string>();

    for (const item of items) {
      const name = (item.name || '').trim().replace(/\s+/g, ' ');
      const studentNumber = (item.studentNumber || '').trim();
      const fail = (error: string) => failed.push({ name: name || '(isimsiz)', studentNumber, error });

      if (name.length < 2) { fail('Ad soyad eksik.'); continue; }
      if (!studentNumber) { fail('Öğrenci numarası zorunludur (öğrenci bu numarayla giriş yapar).'); continue; }
      if (!this.isValidLoginIdentifier(studentNumber)) { fail('Öğrenci numarası yalnızca rakam/harf içermelidir (boşluksuz, en fazla 20 karakter).'); continue; }
      const numKey = studentNumber.toLowerCase();
      if (seenNumbers.has(numKey)) { fail('Bu numara listede birden fazla kez geçiyor.'); continue; }
      const clash = this.students.find((s) => (s.studentNumber || '').trim().toLowerCase() === numKey);
      if (clash) { fail(`Bu numara "${clash.name}" adlı öğrenciye ait.`); continue; }
      const password = (item.password || '').trim() || this.generatePassword();
      if (password.length < DataService.MIN_PASSWORD_LENGTH) { fail(`Şifre en az ${DataService.MIN_PASSWORD_LENGTH} karakter olmalıdır.`); continue; }
      const cls = this.classes.find((c) => c.id === item.classId);
      if (!cls) { fail('Sınıf seçilmedi veya sınıf bulunamadı.'); continue; }
      seenNumbers.add(numKey);

      const student: Student = {
        id: `std-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name,
        username: studentNumber,
        email: cleanStudentEmail(item.email),
        classId: cls.id,
        className: cls.name,
        schoolLevel: item.schoolLevel || cls.schoolLevel,
        gradeLevel: item.gradeLevel || cls.gradeLevel,
        branch: item.branch || cls.branch,
        studentNumber,
        phone: (item.phone || '').trim(),
        avatar: item.avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(name)}`,
        createdAt: new Date().toISOString(),
        status: 'active',
        createdTeacherId: currentTeacherId,
        mustChangePassword: true,
      };
      prepared.push({ student, password });
    }

    // 1) Satırları ekle (10'arlı gruplar)
    const inserted: Array<{ student: Student; password: string }> = [];
    for (let i = 0; i < prepared.length; i += 10) {
      const chunk = prepared.slice(i, i + 10);
      const { error } = await supabase.from('students').insert(
        chunk.map(({ student }) => ({
          id: student.id,
          ...this.studentToRow(student),
          registered_at: student.createdAt,
        }))
      );
      if (error) {
        const reason =
          error.code === '42501'
            ? 'Bu sınıfa öğrenci ekleme yetkiniz yok.'
            : error.code === '23505'
            ? 'Aynı kimlikle kayıt zaten var.'
            : error.message;
        chunk.forEach(({ student }) => failed.push({ name: student.name, studentNumber: student.studentNumber || '', error: `Kayıt eklenemedi: ${reason}` }));
      } else {
        inserted.push(...chunk);
      }
    }

    // 2) Giriş hesaplarını aç (50'şerli gruplar)
    for (let i = 0; i < inserted.length; i += 50) {
      const chunk = inserted.slice(i, i + 50);
      let results: Array<{ ok: boolean; id: string; error?: string; auth_user_id?: string | null }> = [];
      try {
        const res = await invokeCreateUserEdgeFunction({
          action: 'bulk_upsert',
          type: 'student',
          items: chunk.map(({ student, password }) => ({
            id: student.id,
            identifier: student.studentNumber,
            name: student.name,
            password,
          })),
        });
        results = res?.results || [];
      } catch (err: any) {
        results = chunk.map(({ student }) => ({ ok: false, id: student.id, error: err?.message || 'Sunucu hatası' }));
      }

      const rollbackIds: string[] = [];
      for (const entry of chunk) {
        const r = results.find((x) => x.id === entry.student.id);
        if (r?.ok) {
          entry.student.auth_user_id = r.auth_user_id || undefined;
          created.push({ student: entry.student, password: entry.password });
        } else {
          rollbackIds.push(entry.student.id);
          failed.push({
            name: entry.student.name,
            studentNumber: entry.student.studentNumber || '',
            error: `Giriş hesabı açılamadı: ${r?.error || 'bilinmeyen hata'}`,
          });
        }
      }
      if (rollbackIds.length > 0) {
        await this.deleteRowsVerified('students', rollbackIds).catch(() => {});
      }
    }

    if (created.length > 0) {
      // Anlık güncelleme aynı öğrenciyi daha önce eklemiş olabilir: aynı kimlik iki kez listelenmez
      const createdIds = new Set(created.map((c) => c.student.id));
      this.students = [...created.map((c) => c.student), ...this.students.filter((s) => !createdIds.has(s.id))];
      saveData(STORAGE_KEYS.STUDENTS, this.students);
      try {
        localStorage.setItem(PERMANENT_KEYS.MASTER_STUDENTS, JSON.stringify(this.students));
      } catch {}
      this.notify();
    }
    return { created, failed };
  }

  // Tek öğrenci: kayıt + giriş hesabı. Başarısızsa hata fırlatır (hiçbir şey kalmaz).
  public async createStudentAccount(item: StudentAccountInput): Promise<StudentCredential> {
    const { created, failed } = await this.createStudentsWithAccounts([item]);
    if (created.length === 1) return created[0];
    throw new Error(failed[0]?.error || 'Öğrenci eklenemedi.');
  }

  // Eski çağrılar için uyumluluk (şifre verilmezse rastgele şifre üretilir)
  public async registerStudent(
    studentData: Omit<Student, 'id' | 'createdAt' | 'status'>,
    _forcedTeacherId?: string
  ): Promise<Student> {
    const { student } = await this.createStudentAccount({
      name: studentData.name,
      studentNumber: studentData.studentNumber || '',
      classId: studentData.classId,
      email: studentData.email,
      phone: studentData.phone,
      avatar: studentData.avatar,
      schoolLevel: studentData.schoolLevel,
      gradeLevel: studentData.gradeLevel,
      branch: studentData.branch,
      password: studentData.password,
    });
    return student;
  }

  public async registerStudentsBulk(
    studentsData: Array<Omit<Student, 'id' | 'createdAt' | 'status'> & { autoCreateClass?: boolean }>,
    _forcedTeacherId?: string
  ): Promise<Student[]> {
    const { created, failed } = await this.createStudentsWithAccounts(
      studentsData.map((d) => ({
        name: d.name,
        studentNumber: d.studentNumber || '',
        classId: d.classId,
        email: d.email,
        phone: d.phone,
        avatar: d.avatar,
        password: d.password,
      }))
    );
    if (created.length === 0 && failed.length > 0) {
      throw new Error(failed[0].error);
    }
    return created.map((c) => c.student);
  }

  // Öğretmen/yönetici: öğrencinin giriş şifresini belirler (hesap yoksa açar)
  public async setStudentPassword(studentId: string, password?: string): Promise<StudentCredential> {
    const student = this.students.find((s) => s.id === studentId);
    if (!student) throw new Error('Öğrenci bulunamadı.');
    const pw = (password || '').trim() || this.generatePassword();
    await this.syncLoginAccount('student', student, pw);
    const fresh = this.students.find((s) => s.id === studentId) || student;
    return { student: fresh, password: pw };
  }

  // Öğrenci bilgilerini günceller. Yalnızca değişen alanlar yazılır.
  // Öğrenci numarası değişirse giriş adı da (sunucuda) güncellenir; olmazsa değişiklik geri alınır.
  public async updateStudent(
    id: string,
    updates: Partial<Student>,
    options: { newPassword?: string; mustChangePassword?: boolean } = {}
  ): Promise<{ password?: string }> {
    const current = this.students.find((s) => s.id === id);
    if (!current) throw new Error('Öğrenci bulunamadı.');

    const next: Student = { ...current, ...updates };
    if (updates.email !== undefined) next.email = cleanStudentEmail(updates.email);
    if (updates.classId) {
      const cls = this.classes.find((c) => c.id === updates.classId);
      if (cls) next.className = cls.name;
    }
    if (
      updates.studentNumber !== undefined &&
      (updates.studentNumber || '').trim() !== (current.studentNumber || '').trim()
    ) {
      next.studentNumber = (updates.studentNumber || '').trim();
      if (!next.studentNumber) throw new Error('Öğrenci numarası boş bırakılamaz (öğrenci bu numarayla giriş yapar).');
      if (!this.isValidLoginIdentifier(next.studentNumber)) {
        throw new Error('Öğrenci numarası yalnızca rakam/harf içermelidir (boşluksuz, en fazla 20 karakter).');
      }
      const clash = this.students.find(
        (s) => s.id !== id && (s.studentNumber || '').trim().toLowerCase() === next.studentNumber!.toLowerCase()
      );
      if (clash) throw new Error(`"${next.studentNumber}" numarası "${clash.name}" adlı öğrenciye ait.`);
      next.username = next.studentNumber;
    }

    // Yalnızca değişen sütunlar
    const before = this.studentToRow(current);
    const after = this.studentToRow(next);
    const patch: Record<string, unknown> = {};
    (Object.keys(after) as Array<keyof typeof after>).forEach((k) => {
      if (after[k] !== before[k]) patch[k] = after[k];
    });
    const numberChanged = 'student_number' in patch;

    const prevStudents = this.students;
    this.students = this.students.map((s) => (s.id === id ? next : s));
    saveData(STORAGE_KEYS.STUDENTS, this.students);
    this.notify();

    const rollback = async (writeBack: boolean) => {
      this.students = prevStudents;
      saveData(STORAGE_KEYS.STUDENTS, this.students);
      try {
        localStorage.setItem(PERMANENT_KEYS.MASTER_STUDENTS, JSON.stringify(this.students));
      } catch {}
      this.notify();
      if (writeBack) {
        const undo: Record<string, unknown> = {};
        Object.keys(patch).forEach((k) => {
          undo[k] = (before as any)[k];
        });
        await this.patchStudentRow(id, undo).catch(() => {});
      }
    };

    const res = await this.patchStudentRow(id, patch);
    if (!res.success) {
      await rollback(false);
      const reason = res.error?.code === '42501' ? res.error?.message || 'Bu işlem için yetkiniz yok' : res.error?.message || 'Bağlantı sorunu';
      this.showFloatingErrorToast(`Hata: Öğrenci bilgileri kaydedilemedi (${reason}). Değişiklikler geri alındı.`);
      throw new Error(`Öğrenci bilgileri kaydedilemedi: ${reason}`);
    }

    const session = this.getAuthSession();
    const isStaff = session?.role === 'teacher';
    const newPassword = (options.newPassword || '').trim();
    if (isStaff && (newPassword || (numberChanged && current.auth_user_id))) {
      try {
        await this.syncLoginAccount('student', next, newPassword || undefined, options.mustChangePassword);
      } catch (err: any) {
        if (numberChanged) {
          await rollback(true);
          throw new Error(`Öğrenci numarası değiştirilemedi: ${err?.message || 'bilinmeyen hata'}. Değişiklikler geri alındı.`);
        }
        throw new Error(`Bilgiler kaydedildi ancak şifre belirlenemedi: ${err?.message || 'bilinmeyen hata'}`);
      }
    }

    try {
      localStorage.setItem(PERMANENT_KEYS.MASTER_STUDENTS, JSON.stringify(this.students));
    } catch {}
    if (session?.role === 'student' && session.user.id === id) {
      const fresh = this.students.find((s) => s.id === id);
      if (fresh) this.setAuthSession({ ...session, user: fresh });
    }
    this.notify();
    return newPassword ? { password: newPassword } : {};
  }

  // =========================================================================
  // ÖĞRENCİ KAYIT BAŞVURULARI
  // =========================================================================
  private pendingApplicationCount = 0;

  public getPendingApplicationCount(): number {
    return this.pendingApplicationCount;
  }

  // Giriş yapmamış öğrenci: başvuru formundaki sınıf listesi
  public async fetchApplicationClasses(): Promise<Array<{ id: string; name: string }>> {
    const res = await invokeEdgeFunction<{ classes?: Array<{ id: string; name: string }> }>('register-student', {
      action: 'classes',
    });
    return res?.classes || [];
  }

  // Giriş yapmamış öğrenci: kayıt başvurusu gönderir
  public async submitStudentApplication(form: {
    name: string;
    studentNumber: string;
    password: string;
    classId?: string;
    requestedClass?: string;
    email?: string;
    phone?: string;
    avatar?: string;
    website?: string;
  }): Promise<void> {
    await invokeEdgeFunction('register-student', { action: 'apply', ...form });
  }

  // Yönetici: başvuruları listeler (en yeni en üstte)
  public async fetchStudentApplications(status: 'pending' | 'all' = 'pending'): Promise<StudentApplication[]> {
    if (!this.isCurrentUserAdmin()) return [];
    let query = supabase.from('student_applications').select('*').order('created_at', { ascending: false }).limit(200);
    if (status === 'pending') query = query.eq('status', 'pending');
    const { data, error } = await query;
    if (error) throw new Error(`Başvurular okunamadı: ${error.message}`);
    const list: StudentApplication[] = (data || []).map((r: any) => ({
      id: r.id,
      name: r.name,
      studentNumber: r.student_number,
      classId: r.class_id || undefined,
      requestedClass: r.requested_class || undefined,
      email: r.email || undefined,
      phone: r.phone || undefined,
      avatar: r.avatar || undefined,
      status: r.status,
      rejectReason: r.reject_reason || undefined,
      studentId: r.student_id || undefined,
      createdAt: r.created_at,
      reviewedAt: r.reviewed_at || undefined,
    }));
    if (status === 'pending') {
      const changed = this.pendingApplicationCount !== list.length;
      this.pendingApplicationCount = list.length;
      if (changed) this.notify();
    }
    return list;
  }

  public async refreshPendingApplicationCount(): Promise<void> {
    if (!this.isCurrentUserAdmin()) return;
    try {
      await this.fetchStudentApplications('pending');
    } catch {
      // tablo henüz kurulmadıysa sessiz geç
    }
  }

  // Yönetici: başvuruyu onaylar -> öğrenci kaydı oluşur, hesap açılır
  public async approveStudentApplication(
    applicationId: string,
    options: { classId?: string; studentNumber?: string; name?: string } = {}
  ): Promise<Student> {
    const res = await invokeCreateUserEdgeFunction({
      action: 'approve_application',
      applicationId,
      classId: options.classId || undefined,
      studentNumber: options.studentNumber || undefined,
      name: options.name || undefined,
    });
    const r = res?.student || {};
    const cls = this.classes.find((c) => c.id === r.class_id);
    const student: Student = {
      id: r.id,
      name: r.name,
      username: r.student_number,
      studentNumber: r.student_number,
      classId: r.class_id,
      className: r.class_name,
      email: r.email || '',
      phone: r.phone || '',
      avatar: r.avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(r.name || 'ogrenci')}`,
      createdAt: new Date().toISOString(),
      status: 'active',
      auth_user_id: r.auth_user_id,
      schoolLevel: cls?.schoolLevel,
      gradeLevel: cls?.gradeLevel,
      branch: cls?.branch,
    };
    this.students = [student, ...this.students.filter((s) => s.id !== student.id)];
    saveData(STORAGE_KEYS.STUDENTS, this.students);
    this.pendingApplicationCount = Math.max(0, this.pendingApplicationCount - 1);
    this.notify();
    return student;
  }

  // Yönetici: başvuruyu reddeder -> kilitli giriş hesabı silinir
  public async rejectStudentApplication(applicationId: string, reason?: string): Promise<void> {
    await invokeCreateUserEdgeFunction({ action: 'reject_application', applicationId, reason: reason || undefined });
    this.pendingApplicationCount = Math.max(0, this.pendingApplicationCount - 1);
    this.notify();
  }

  public async deleteStudent(id: string): Promise<void> {
    await this.deleteStudents([id]);
  }

  public async deleteStudents(requestedIds: string[]): Promise<void> {
    if (!requestedIds || requestedIds.length === 0) return;

    // 1) Önce giriş hesaplarını sil (sunucu). Hesabı silinemeyen öğrencinin kaydı da silinmez.
    const { okIds: ids, failed: accountFailures } = await this.deleteLoginAccounts('student', requestedIds);
    const failureMessage = accountFailures.length
      ? `${accountFailures.length} öğrenci silinemedi: ${accountFailures
          .map((f) => `${this.students.find((s) => s.id === f.id)?.name || f.id} (${f.error || 'hata'})`)
          .join(', ')}`
      : '';
    if (ids.length === 0) {
      this.showFloatingErrorToast(`Hata: ${failureMessage}`);
      throw new Error(failureMessage || 'Öğrenci silinemedi.');
    }
    const idSet = new Set(ids);

    // Rollback için önceki durumların tam kopyasını al
    const prevStudents = JSON.parse(JSON.stringify(this.students));
    const prevSubmissions = JSON.parse(JSON.stringify(this.submissions));
    const prevGrades = JSON.parse(JSON.stringify(this.grades));
    const prevMessages = JSON.parse(JSON.stringify(this.messages));
    const prevEtuts = JSON.parse(JSON.stringify(this.etuts));
    const prevAttendance = JSON.parse(JSON.stringify(this.attendance));
    const prevDeletedStudentIds = new Set(this.deletedStudentIds);

    ids.forEach((id) => this.deletedStudentIds.add(id));
    saveData(STORAGE_KEYS.DELETED_STUDENTS, Array.from(this.deletedStudentIds));

    this.students = this.students.filter((s) => !idSet.has(s.id));
    this.submissions = this.submissions.filter((sub) => !idSet.has(sub.studentId));
    this.grades = this.grades.filter((g) => !idSet.has(g.studentId));
    this.messages = this.messages.filter((m) => !idSet.has(m.studentId));
    // Clean up students from etuts if specific studentIds list
    this.etuts = this.etuts.map((e) => {
      if (Array.isArray(e.assignedStudentIds)) {
        return {
          ...e,
          assignedStudentIds: e.assignedStudentIds.filter((sid) => !idSet.has(sid)),
        };
      }
      return e;
    });
    // Clean up students from attendance records
    this.attendance = this.attendance.map((att) => ({
      ...att,
      records: att.records.filter((r) => !idSet.has(r.studentId)),
    }));

    saveData(STORAGE_KEYS.STUDENTS, this.students);
    saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);
    saveData(STORAGE_KEYS.GRADES, this.grades);
    saveData(STORAGE_KEYS.MESSAGES, this.messages);
    saveData(STORAGE_KEYS.ETUTS, this.etuts);
    saveData(STORAGE_KEYS.ATTENDANCE, this.attendance);

    try {
      localStorage.setItem(PERMANENT_KEYS.MASTER_STUDENTS, JSON.stringify(this.students));
      localStorage.setItem(PERMANENT_KEYS.DELETED_STUDENTS, JSON.stringify(Array.from(this.deletedStudentIds)));
    } catch {}

    // Clean legacy versioned keys so deleted students never resurrect
    [
      'edu_sys_students_v6',
      'edu_sys_students_v5',
      'edu_sys_students_v4',
      'edu_sys_students_v3',
      'edu_sys_students_v2',
      'edu_sys_students_v1',
      'edu_sys_students',
      'edu_sys_students_backup',
    ].forEach((k) => {
      try { localStorage.removeItem(k); } catch {}
    });

    // Yerel state güncellendi: arayüz bulut çağrısını beklemeden hemen güncellensin
    this.notify();

    // Buluttan silme işlemini AWAIT et ve doğrula
    const deleteRes = await this.deleteStudentsFromCloud(ids);
    if (!deleteRes.success) {
      // ROLLBACK: Buluttan silinemezse yerel verileri geri yükle
      this.students = prevStudents;
      this.submissions = prevSubmissions;
      this.grades = prevGrades;
      this.messages = prevMessages;
      this.etuts = prevEtuts;
      this.attendance = prevAttendance;
      this.deletedStudentIds = prevDeletedStudentIds;

      saveData(STORAGE_KEYS.STUDENTS, this.students);
      saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);
      saveData(STORAGE_KEYS.GRADES, this.grades);
      saveData(STORAGE_KEYS.MESSAGES, this.messages);
      saveData(STORAGE_KEYS.ETUTS, this.etuts);
      saveData(STORAGE_KEYS.ATTENDANCE, this.attendance);
      saveData(STORAGE_KEYS.DELETED_STUDENTS, Array.from(this.deletedStudentIds));

      try {
        localStorage.setItem(PERMANENT_KEYS.MASTER_STUDENTS, JSON.stringify(this.students));
        localStorage.setItem(PERMANENT_KEYS.DELETED_STUDENTS, JSON.stringify(Array.from(this.deletedStudentIds)));
      } catch {}
      this.notify();

      const errMsg =
        deleteRes.error?.message ||
        (deleteRes.error?.code === '42501'
          ? 'Öğrenci silme yetkiniz bulunmamaktadır (RLS kuralı).'
          : 'Öğrenci bulut veritabanından silinemedi.');

      this.showFloatingErrorToast(`Hata: ${errMsg} Değişiklikler geri alındı.`);
      throw new Error(`[deleteStudents] Öğrenci silme işlemi başarısız: ${errMsg}`);
    }

    // Persist tombstones to cloud so other devices immediately purge these IDs
    await this.syncTombstonesToCloud();
    this.notify();

    if (failureMessage) {
      this.showFloatingErrorToast(`Hata: ${failureMessage}`);
      throw new Error(failureMessage);
    }
  }

  // --- HOMEWORK ---
  // Ödev kimliği yeni ödev penceresi açılırken üretilir; böylece dosyalar kaydetmeden önce
  // doğru klasöre ("odev/<kimlik>") yüklenebilir.
  public newHomeworkId(): string {
    return `hw-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  }

  public async createHomework(homeworkData: Omit<Homework, 'id' | 'createdAt'> & { id?: string }): Promise<Homework> {
    const session = this.getAuthSession();
    const currentTeacher = session?.role === 'teacher' ? (session.user as Teacher) : null;
    const nowIso = new Date().toISOString();
    const requestedId = typeof homeworkData.id === 'string' && /^hw-[\w-]{4,80}$/.test(homeworkData.id) ? homeworkData.id : null;
    const newHw: Homework = {
      ...homeworkData,
      id: requestedId && !this.homeworks.some((h) => h.id === requestedId) ? requestedId : this.newHomeworkId(),
      createdAt: nowIso,
      assignedDate: homeworkData.assignedDate || nowIso,
      teacherId: homeworkData.teacherId || currentTeacher?.id,
      teacherName: homeworkData.teacherName || currentTeacher?.name,
      createdByName: homeworkData.createdByName || currentTeacher?.name || 'Öğretmen',
      isGlobalForNewStudents: false,
      submissions: undefined,
    };
    const { classIds, studentIds } = this.homeworkTargets(newHw);
    newHw.targetClassIds = classIds;
    newHw.assignedTo = studentIds.length > 0 ? studentIds : 'all';
    newHw.classId = classIds[0] || newHw.classId;

    let row: ReturnType<DataService['homeworkToRow']>;
    try {
      if (classIds.length === 0 && studentIds.length === 0) {
        throw new Error('Ödev için en az bir sınıf veya öğrenci seçmelisiniz.');
      }
      row = this.homeworkToRow(newHw);
    } catch (e: any) {
      this.showFloatingErrorToast(`Hata: ${e?.message || e}`);
      throw e;
    }

    try {
      const { data: authData } = await supabase.auth.getSession();
      newHw.teacherAuthId = authData?.session?.user?.id;
    } catch {}

    const prevHomeworks = [...this.homeworks];
    this.homeworks = [newHw, ...this.homeworks];
    saveData(STORAGE_KEYS.HOMEWORK, this.homeworks);
    this.notify();

    await this.runCloudWrite(
      () => supabase.from('homeworks').insert({ id: newHw.id, ...row }),
      () => {
        this.homeworks = prevHomeworks;
        saveData(STORAGE_KEYS.HOMEWORK, this.homeworks);
      },
      'Ödev kaydedilemedi'
    );

    // Bildirimler yalnızca ödev gerçekten kaydedildikten sonra hazırlanır
    this.dispatchHomeworkNotificationsAndEmails(newHw);
    this.notify();
    return newHw;
  }

  public async updateHomework(id: string, updates: Partial<Homework>): Promise<void> {
    const existing = this.homeworks.find((h) => h.id === id);
    if (!existing) {
      const msg = 'Ödev bulunamadı (silinmiş olabilir). Sayfayı yenileyip tekrar deneyin.';
      this.showFloatingErrorToast(`Hata: ${msg}`);
      throw new Error(msg);
    }
    const merged: Homework = { ...existing, ...updates };
    const { classIds, studentIds } = this.homeworkTargets(merged);
    merged.targetClassIds = classIds;
    merged.assignedTo = studentIds.length > 0 ? studentIds : 'all';
    merged.classId = classIds[0] || merged.classId;

    let row: ReturnType<DataService['homeworkToRow']>;
    try {
      if (classIds.length === 0 && studentIds.length === 0) {
        throw new Error('Ödev için en az bir sınıf veya öğrenci seçmelisiniz.');
      }
      row = this.homeworkToRow(merged);
    } catch (e: any) {
      this.showFloatingErrorToast(`Hata: ${e?.message || e}`);
      throw e;
    }

    const prevHomeworks = [...this.homeworks];
    this.homeworks = this.homeworks.map((h) => (h.id === id ? merged : h));
    saveData(STORAGE_KEYS.HOMEWORK, this.homeworks);
    this.notify();

    await this.runCloudWrite(
      async () => {
        const { data, error } = await supabase.from('homeworks').update(row).eq('id', id).select('id');
        if (error) return { error };
        if (!data || data.length === 0) {
          return { error: { code: '42501', message: 'Ödevi yalnızca oluşturan öğretmen veya yönetici değiştirebilir' } };
        }
        return { error: null };
      },
      () => {
        this.homeworks = prevHomeworks;
        saveData(STORAGE_KEYS.HOMEWORK, this.homeworks);
      },
      'Ödev güncellenemedi'
    );

    // Ödevden çıkarılan depo dosyaları silinir (kayıt başarılı olduktan sonra)
    if (updates.resources !== undefined) {
      const kept = new Set(storedPathsOf(merged.resources));
      const dropped = storedPathsOf(existing.resources).filter((p) => !kept.has(p));
      if (dropped.length > 0) removeStoredFiles(dropped);
    }
  }

  public async deleteHomework(id: string): Promise<void> {
    const prevHomeworks = JSON.parse(JSON.stringify(this.homeworks));
    const prevSubmissions = JSON.parse(JSON.stringify(this.submissions));
    const prevDeletedHomeworkIds = new Set(this.deletedHomeworkIds);

    this.deletedHomeworkIds.add(id);
    saveData(STORAGE_KEYS.DELETED_HOMEWORK, Array.from(this.deletedHomeworkIds));

    this.homeworks = this.homeworks.filter((h) => h.id !== id);
    this.submissions = this.submissions.filter((s) => s.homeworkId !== id);
    saveData(STORAGE_KEYS.HOMEWORK, this.homeworks);
    saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);
    this.notify();

    // Teslim dosyaları ödev kaydı silinmeden ÖNCE silinir (öğretmenin yetkisi ödev kaydı varken geçerlidir).
    // En güncel liste veritabanından okunur (başka cihazdan yapılmış güncellemeler dahil).
    const submissionFiles = new Set(
      (prevSubmissions as HomeworkSubmission[]).filter((sb) => sb.homeworkId === id).flatMap((sb) => storedPathsOf(sb.resources))
    );
    try {
      const { data: subRows } = await supabase.from('homework_submissions').select('resources').eq('homework_id', id);
      (subRows || []).forEach((r: any) => storedPathsOf(Array.isArray(r.resources) ? r.resources : []).forEach((p) => submissionFiles.add(p)));
    } catch {}
    if (submissionFiles.size > 0) await removeStoredFiles(Array.from(submissionFiles));

    try {
      const { error } = await this.deleteRowsVerified('homeworks', [id]);
      if (error) {
        throw error;
      }
      // Ödevin kendi dosyaları kayıt silindikten sonra temizlenir (en iyi çaba)
      const hwFiles = storedPathsOf(prevHomeworks.find((h: Homework) => h.id === id)?.resources);
      if (hwFiles.length > 0) removeStoredFiles(hwFiles);
    } catch (err: any) {
      // ROLLBACK: Buluttan silinemezse yerel state'i eski haline döndür
      this.homeworks = prevHomeworks;
      this.submissions = prevSubmissions;
      this.deletedHomeworkIds = prevDeletedHomeworkIds;
      saveData(STORAGE_KEYS.HOMEWORK, this.homeworks);
      saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);
      saveData(STORAGE_KEYS.DELETED_HOMEWORK, Array.from(this.deletedHomeworkIds));
      this.notify();

      const errMsg =
        err?.message ||
        (err?.code === '42501'
          ? 'Ödev silme yetkiniz bulunmamaktadır (RLS kuralı).'
          : 'Ödev bulut veritabanından silinemedi.');

      this.showFloatingErrorToast(`Hata: ${errMsg} Değişiklikler geri alındı.`);
      throw new Error(`[deleteHomework] Ödev silinemedi: ${errMsg}`);
    }
  }

  // --- SUBMISSIONS ---
  // Öğrenci teslimi: varsa kendi satırını günceller, yoksa yeni satır açar.
  // Puan, geri bildirim ve öğretmen kontrol durumu öğrenci tarafından değiştirilemez (veritabanı kuralı).
  public async submitHomework(
    homeworkId: string,
    studentId: string,
    notes: string,
    attachmentLink?: string,
    resources?: HomeworkResource[]
  ): Promise<HomeworkSubmission> {
    const student = this.students.find((s) => s.id === studentId);
    const homework = this.homeworks.find((h) => h.id === homeworkId);
    try {
      this.assertInlineResourcesFit(resources);
    } catch (e: any) {
      this.showFloatingErrorToast(`Hata: ${e?.message || e}`);
      throw e;
    }

    const nowIso = new Date().toISOString();
    const isLate = homework ? Date.now() > new Date(homework.dueDate).getTime() : false;
    const status: 'on_time' | 'late' = isLate ? 'late' : 'on_time';
    const studentName = student?.name || 'Öğrenci';

    const payload: Record<string, any> = {
      student_name: studentName,
      status,
      notes: notes || '',
      attachment_link: attachmentLink || null,
      submitted_at: nowIso,
    };
    if (resources !== undefined) payload.resources = resources;

    const existing = this.submissions.find((s) => s.homeworkId === homeworkId && s.studentId === studentId);
    const optimistic: HomeworkSubmission = {
      ...(existing || {}),
      id: existing?.id || `sub-local-${Date.now()}`,
      homeworkId,
      studentId,
      studentName,
      submittedAt: nowIso,
      status,
      notes: notes || '',
      attachmentLink: attachmentLink || undefined,
      resources: resources !== undefined ? resources : existing?.resources || [],
      score: existing?.score ?? null,
      feedback: existing?.feedback,
      checkStatus: existing?.checkStatus,
    };

    const prevSubmissions = [...this.submissions];
    this.submissions = [
      optimistic,
      ...this.submissions.filter((s) => !(s.homeworkId === homeworkId && s.studentId === studentId)),
    ];
    saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);
    this.notify();

    let savedRow: any = null;
    const updateOwn = () =>
      supabase
        .from('homework_submissions')
        .update(payload)
        .eq('homework_id', homeworkId)
        .eq('student_id', studentId)
        .select('*');

    await this.runCloudWrite(
      async () => {
        const upd = await updateOwn();
        if (upd.error) return { error: upd.error };
        if (upd.data && upd.data.length > 0) {
          savedRow = upd.data[0];
          return { error: null };
        }
        const ins = await supabase
          .from('homework_submissions')
          .insert({ homework_id: homeworkId, student_id: studentId, resources: [], ...payload })
          .select('*');
        if (ins.error?.code === '23505') {
          // Aynı anda başka cihazdan açılmış satır: güncelle
          const retry = await updateOwn();
          if (retry.error) return { error: retry.error };
          savedRow = retry.data?.[0] || null;
          return { error: null };
        }
        if (ins.error) return { error: ins.error };
        savedRow = ins.data?.[0] || null;
        return { error: null };
      },
      () => {
        this.submissions = prevSubmissions;
        saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);
      },
      'Ödev teslimi kaydedilemedi'
    );

    const saved = savedRow ? this.submissionFromRow(savedRow) : optimistic;
    this.submissions = [
      saved,
      ...this.submissions.filter((s) => !(s.homeworkId === homeworkId && s.studentId === studentId)),
    ];
    saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);
    this.notify();

    // Öğrencinin yeni teslimde çıkardığı eski dosyalar depodan silinir
    if (resources !== undefined && existing) {
      const kept = new Set(storedPathsOf(resources));
      const dropped = storedPathsOf(existing.resources).filter((p) => !kept.has(p));
      if (dropped.length > 0) removeStoredFiles(dropped);
    }
    return saved;
  }

  public async gradeSubmission(submissionId: string, score: number, feedback: string): Promise<void> {
    const prevSubmissions = [...this.submissions];
    this.submissions = this.submissions.map((s) => (s.id === submissionId ? { ...s, score, feedback } : s));
    saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);
    this.notify();

    await this.runCloudWrite(
      async () => {
        const { data, error } = await supabase
          .from('homework_submissions')
          .update({ score, feedback })
          .eq('id', submissionId)
          .select('id');
        if (error) return { error };
        if (!data || data.length === 0) {
          return { error: { code: '42501', message: 'Teslim bulunamadı veya puanlama yetkiniz yok' } };
        }
        return { error: null };
      },
      () => {
        this.submissions = prevSubmissions;
        saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);
      },
      'Puan kaydedilemedi'
    );
  }

  private defaultCheckNote(status: HomeworkCheckStatus): string {
    switch (status) {
      case 'yapti': return 'Ödev tamamlandı';
      case 'eksik': return 'Eksik ödev';
      case 'yapmadi': return 'Ödev yapılmadı';
      case 'izinli': return 'İzinli';
      default: return 'Derse gelmedi';
    }
  }

  // Öğretmenin "Yaptı / Yapmadı / Eksik / İzinli / Gelmedi" işaretleri — tek seferde, birden çok öğrenci için.
  // Öğrencinin kendi teslim notu ve dosyaları korunur; yalnızca kontrol durumu yazılır.
  public async saveHomeworkCheckStatuses(
    homeworkId: string,
    entries: { studentId: string; checkStatus: HomeworkCheckStatus }[]
  ): Promise<void> {
    const byStudent = new Map<string, HomeworkCheckStatus>();
    entries.forEach((e) => {
      if (e?.studentId && e.checkStatus) byStudent.set(e.studentId, e.checkStatus);
    });
    if (byStudent.size === 0) return;

    const prevSubmissions = [...this.submissions];
    const nowIso = new Date().toISOString();
    const updatedLocal = new Map<string, HomeworkSubmission>();
    this.submissions.forEach((s) => {
      if (s.homeworkId === homeworkId && byStudent.has(s.studentId)) {
        const checkStatus = byStudent.get(s.studentId)!;
        updatedLocal.set(s.studentId, {
          ...s,
          checkStatus,
          status: checkStatus === 'yapti' && s.status === 'not_submitted' ? 'on_time' : s.status,
        });
      }
    });
    byStudent.forEach((checkStatus, studentId) => {
      if (updatedLocal.has(studentId)) return;
      updatedLocal.set(studentId, {
        id: `sub-local-${Date.now()}-${studentId}`,
        homeworkId,
        studentId,
        studentName: this.students.find((st) => st.id === studentId)?.name || 'Öğrenci',
        submittedAt: nowIso,
        status: checkStatus === 'yapti' ? 'on_time' : 'not_submitted',
        checkStatus,
        notes: this.defaultCheckNote(checkStatus),
      });
    });
    this.submissions = [
      ...Array.from(updatedLocal.values()),
      ...this.submissions.filter((s) => !(s.homeworkId === homeworkId && byStudent.has(s.studentId))),
    ];
    saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);
    this.notify();

    await this.runCloudWrite(
      async () => {
        // 1) Satırı olmayan öğrenciler için kayıt aç (var olan teslimlere dokunmaz)
        const baseRows = Array.from(byStudent.entries()).map(([studentId, checkStatus]) => ({
          homework_id: homeworkId,
          student_id: studentId,
          student_name: this.students.find((st) => st.id === studentId)?.name || 'Öğrenci',
          status: checkStatus === 'yapti' ? 'on_time' : 'not_submitted',
          notes: this.defaultCheckNote(checkStatus),
          check_status: checkStatus,
        }));
        const ins = await supabase
          .from('homework_submissions')
          .upsert(baseRows, { onConflict: 'homework_id,student_id', ignoreDuplicates: true });
        if (ins.error) return { error: ins.error };

        // 2) Kontrol durumlarını durum grubuna göre yaz
        const groups = new Map<HomeworkCheckStatus, string[]>();
        byStudent.forEach((checkStatus, studentId) => {
          groups.set(checkStatus, [...(groups.get(checkStatus) || []), studentId]);
        });
        for (const [checkStatus, ids] of groups) {
          const upd = await supabase
            .from('homework_submissions')
            .update({ check_status: checkStatus })
            .eq('homework_id', homeworkId)
            .in('student_id', ids)
            .select('student_id');
          if (upd.error) return { error: upd.error };
          if ((upd.data?.length || 0) < ids.length) {
            return { error: { code: '42501', message: 'Bazı öğrencilerin kontrol durumu kaydedilemedi' } };
          }
          if (checkStatus === 'yapti') {
            const st = await supabase
              .from('homework_submissions')
              .update({ status: 'on_time' })
              .eq('homework_id', homeworkId)
              .in('student_id', ids)
              .eq('status', 'not_submitted');
            if (st.error) return { error: st.error };
          }
        }
        return { error: null };
      },
      () => {
        this.submissions = prevSubmissions;
        saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);
      },
      'Ödev kontrol durumu kaydedilemedi'
    );

    await this.refreshSubmissionsForHomework(homeworkId);
  }

  public async updateHomeworkCheckStatus(
    homeworkId: string,
    studentId: string,
    checkStatus: HomeworkCheckStatus
  ): Promise<HomeworkSubmission | undefined> {
    await this.saveHomeworkCheckStatuses(homeworkId, [{ studentId, checkStatus }]);
    return this.submissions.find((s) => s.homeworkId === homeworkId && s.studentId === studentId);
  }

  // --- ETUTS ---
  public async createEtut(etutData: Omit<Etut, 'id' | 'createdAt'>): Promise<Etut> {
    const session = this.getAuthSession();
    const currentTeacher = session?.role === 'teacher' ? (session.user as Teacher) : null;
    const nowIso = new Date().toISOString();
    const newEtut: Etut = {
      ...etutData,
      id: `etut-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: nowIso,
      createdById: etutData.createdById || currentTeacher?.id,
      createdByName: etutData.createdByName || currentTeacher?.name,
      lessonPeriod: etutData.lessonPeriod || 'Ders',
      teacherId: etutData.teacherId || currentTeacher?.id,
      teacherName: etutData.teacherName || currentTeacher?.name || 'Öğretmen',
      teacherBranch: etutData.teacherBranch || currentTeacher?.branch || etutData.subject,
      duration: Number(etutData.duration) || 45,
    };
    // Rollback için önceki durumun yedeğini al
    const prevEtutsOnCreate = JSON.parse(JSON.stringify(this.etuts));

    this.etuts = [newEtut, ...this.etuts];
    saveData(STORAGE_KEYS.ETUTS, this.etuts);

    // Öğretmen ismini bu ders için kalıcı olarak kaydet
    if (newEtut.subject && newEtut.teacherName && newEtut.teacherName !== 'Öğretmen') {
      this.addTeacherToSubject(newEtut.subject, newEtut.teacherName);
      this.setLastTeacherForSubject(newEtut.subject, newEtut.teacherName);
    }

    // Otomatik Öğrenci Bildirimi ve E-Posta Gönderimi
    this.dispatchEtutNotificationsAndEmails(newEtut);
    this.notify();

    // Supabase anında bulut senkronizasyonu ile sunucu yanıtını doğrula
    const pushed = await this.pushEtutToSupabase(newEtut);

    if (!pushed) {
      // ROLLBACK: Buluta yazılamadıysa yerel state'i eski haline döndür
      this.etuts = prevEtutsOnCreate;
      saveData(STORAGE_KEYS.ETUTS, this.etuts);
      this.notify();

      this.showFloatingErrorToast(
        'Hata: Etüt buluta kaydedilemedi (yetki veya bağlantı sorunu). Değişiklikler geri alındı.'
      );
      throw new Error('[createEtut] Etüt buluta kaydedilemedi.');
    }

    return newEtut;
  }

  public async updateEtut(id: string, updates: Partial<Etut>): Promise<void> {
    const prevEtutsOnUpdate = JSON.parse(JSON.stringify(this.etuts));

    this.etuts = this.etuts.map((e) => (e.id === id ? { ...e, ...updates } : e));
    saveData(STORAGE_KEYS.ETUTS, this.etuts);

    const updated = this.etuts.find((e) => e.id === id);
    if (updated?.subject && updated?.teacherName && updated.teacherName !== 'Öğretmen') {
      this.addTeacherToSubject(updated.subject, updated.teacherName);
      this.setLastTeacherForSubject(updated.subject, updated.teacherName);
    }

    this.notify();

    // Push to Supabase with await + hata kontrolü
    if (updated) {
      const pushed = await this.pushEtutToSupabase(updated);
      if (!pushed) {
        // ROLLBACK: Buluta yazılamadıysa yerel state'i eski haline döndür
        this.etuts = prevEtutsOnUpdate;
        saveData(STORAGE_KEYS.ETUTS, this.etuts);
        this.notify();

        this.showFloatingErrorToast(
          'Hata: Etüt güncellemesi buluta kaydedilemedi. Değişiklikler geri alındı.'
        );
        throw new Error('[updateEtut] Etüt buluta güncellenemedi.');
      }
    }
  }

  public async updateEtutAttendance(
    etutId: string,
    attendanceData: Record<string, EtutStudentAttendance>
  ): Promise<void> {
    const etutIndex = this.etuts.findIndex((e) => e.id === etutId);
    if (etutIndex === -1) return;

    const prevEtutsOnAttendance = JSON.parse(JSON.stringify(this.etuts));
    const currentEtut = this.etuts[etutIndex];
    const updatedEtut: Etut = {
      ...currentEtut,
      studentAttendance: {
        ...(currentEtut.studentAttendance || {}),
        ...attendanceData,
      },
    };

    this.etuts = this.etuts.map((e, idx) => (idx === etutIndex ? updatedEtut : e));
    saveData(STORAGE_KEYS.ETUTS, this.etuts);

    // Genel devamsızlık kayıtlarına da etüt yoklamasını yansıt
    const attendanceRecordsList = Object.entries(updatedEtut.studentAttendance || {}).map(
      ([studentId, item]) => {
        const std = this.students.find((s) => s.id === studentId);
        return {
          studentId,
          studentName: std?.name || 'Öğrenci',
          status: item.status,
          note: item.note || `Etüt: ${updatedEtut.topic || updatedEtut.subject}`,
        };
      }
    );

    if (attendanceRecordsList.length > 0) {
      const etutClassId =
        this.students.find((s) => s.id === attendanceRecordsList[0]?.studentId)?.classId ||
        'class-etut-general';

      // Etüt yoklamasının asıl kaydı etütün kendisidir; genel yoklama tablosuna yazılamazsa etüt kaydı yine de devam eder
      await this.recordAttendance(
        {
          date: updatedEtut.date,
          classId: etutClassId,
          subject: `${updatedEtut.subject} (Etüt)`,
          records: attendanceRecordsList,
        },
        { silent: true }
      );
    }

    this.notify();

    // Supabase push with await + hata kontrolü
    const pushed = await this.pushEtutToSupabase(updatedEtut);
    if (!pushed) {
      // ROLLBACK: Yoklama buluta kaydedilemediyse etüt state'ini eski haline döndür
      this.etuts = prevEtutsOnAttendance;
      saveData(STORAGE_KEYS.ETUTS, this.etuts);
      this.notify();

      this.showFloatingErrorToast(
        'Hata: Etüt yoklaması buluta kaydedilemedi. Değişiklikler geri alındı.'
      );
      throw new Error('[updateEtutAttendance] Yoklama buluta kaydedilemedi.');
    }
  }

  public async deleteEtut(id: string): Promise<void> {
    const prevEtutsOnDelete = JSON.parse(JSON.stringify(this.etuts));
    const prevDeletedEtutIds = new Set(this.deletedEtutIds);

    this.deletedEtutIds.add(id);
    saveData(STORAGE_KEYS.DELETED_ETUTS, Array.from(this.deletedEtutIds));

    this.etuts = this.etuts.filter((e) => e.id !== id);
    saveData(STORAGE_KEYS.ETUTS, this.etuts);
    this.notify();

    // Supabase delete with await + hata kontrolü
    try {
      const { error } = await this.deleteRowsVerified('etuts', [id]);
      if (error) throw error;
    } catch (err: any) {
      // ROLLBACK: Buluttan silinemezse yerel state'i eski haline döndür
      this.etuts = prevEtutsOnDelete;
      this.deletedEtutIds = prevDeletedEtutIds;
      saveData(STORAGE_KEYS.ETUTS, this.etuts);
      saveData(STORAGE_KEYS.DELETED_ETUTS, Array.from(this.deletedEtutIds));
      this.notify();

      const errMsg =
        err?.message ||
        (err?.code === '42501'
          ? 'Etüt silme yetkiniz bulunmamaktadır (RLS kuralı).'
          : 'Etüt bulut veritabanından silinemedi.');

      this.showFloatingErrorToast(`Hata: ${errMsg} Değişiklikler geri alındı.`);
      throw new Error(`[deleteEtut] Etüt buluttan silinemedi: ${errMsg}`);
    }
  }

  // --- ATTENDANCE ---
  public async recordAttendance(
    attData: Omit<AttendanceRecord, 'id'>,
    options?: { silent?: boolean }
  ): Promise<AttendanceRecord> {
    const existingIndex = this.attendance.findIndex(
      (a) => a.date === attData.date && a.classId === attData.classId && a.subject === attData.subject
    );

    const record: AttendanceRecord = {
      ...attData,
      id: existingIndex >= 0 ? this.attendance[existingIndex].id : `att-${Date.now()}`,
    };

    const prevAttendance = this.attendance;
    const next = existingIndex >= 0
      ? this.attendance.map((a, i) => (i === existingIndex ? record : a))
      : [record, ...this.attendance];
    this.attendance = next.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    saveData(STORAGE_KEYS.ATTENDANCE, this.attendance);
    this.notify();

    // Merkezi veritabanı tek doğruluk kaynağıdır: bulut onayı beklenir, hata varsa geri alınır
    await this.runCloudWrite(
      () => supabase.from('attendance').upsert(this.attendanceToRow(record)),
      () => {
        this.attendance = prevAttendance;
        saveData(STORAGE_KEYS.ATTENDANCE, this.attendance);
      },
      'Yoklama buluta kaydedilemedi',
      options
    );

    return record;
  }

  public async deleteAttendance(id: string): Promise<void> {
    const prevAttendance = this.attendance;
    this.attendance = this.attendance.filter((a) => a.id !== id);
    saveData(STORAGE_KEYS.ATTENDANCE, this.attendance);
    this.notify();

    await this.runCloudWrite(
      () => this.deleteRowsVerified('attendance', [id]),
      () => {
        this.attendance = prevAttendance;
        saveData(STORAGE_KEYS.ATTENDANCE, this.attendance);
      },
      'Yoklama buluttan silinemedi'
    );
  }

  public async deleteAttendanceForDate(date: string, classId: string, subject?: string): Promise<void> {
    const toDelete = this.attendance.filter(
      (a) => a.date === date && a.classId === classId && (!subject || a.subject === subject)
    );
    this.attendance = this.attendance.filter(
      (a) => !(a.date === date && a.classId === classId && (!subject || a.subject === subject))
    );
    saveData(STORAGE_KEYS.ATTENDANCE, this.attendance);
    this.notify();

    const prevAttendanceAll = [...this.attendance, ...toDelete];
    await this.runCloudWrite(
      () => this.deleteRowsVerified('attendance', toDelete.map((a) => a.id)),
      () => {
        this.attendance = prevAttendanceAll.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        saveData(STORAGE_KEYS.ATTENDANCE, this.attendance);
      },
      'Yoklama kayıtları buluttan silinemedi'
    );
  }

  public async deleteAttendanceStudentRecord(attendanceId: string, studentId: string): Promise<void> {
    const prevAttendance = this.attendance;
    this.attendance = this.attendance.map((att) => {
      if (att.id === attendanceId) {
        return {
          ...att,
          records: att.records.filter((r) => r.studentId !== studentId),
        };
      }
      return att;
    });
    saveData(STORAGE_KEYS.ATTENDANCE, this.attendance);
    this.notify();

    const updated = this.attendance.find((a) => a.id === attendanceId);
    if (updated) {
      await this.runCloudWrite(
        () => supabase.from('attendance').update({ records: updated.records || [] }).eq('id', attendanceId),
        () => {
          this.attendance = prevAttendance;
          saveData(STORAGE_KEYS.ATTENDANCE, this.attendance);
        },
        'Yoklama güncellemesi buluta kaydedilemedi'
      );
    }
  }

  // --- GRADES ---
  public async addGrade(gradeData: Omit<GradeRecord, 'id'>): Promise<GradeRecord> {
    const student = this.students.find((s) => s.id === gradeData.studentId);
    const newGrade: GradeRecord = {
      ...gradeData,
      id: `gr-${Date.now()}`,
      studentName: student?.name,
    };
    const prevGrades = this.grades;
    this.grades = [newGrade, ...this.grades].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    saveData(STORAGE_KEYS.GRADES, this.grades);
    this.notify();

    await this.runCloudWrite(
      () => supabase.from('grades').insert(this.gradeToRow(newGrade)),
      () => {
        this.grades = prevGrades;
        saveData(STORAGE_KEYS.GRADES, this.grades);
      },
      'Not buluta kaydedilemedi'
    );

    return newGrade;
  }

  public async updateGrade(id: string, updates: Partial<GradeRecord>): Promise<void> {
    const prevGrades = this.grades;
    this.grades = this.grades
      .map((g) => (g.id === id ? { ...g, ...updates } : g))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    saveData(STORAGE_KEYS.GRADES, this.grades);
    this.notify();

    const updated = this.grades.find((g) => g.id === id);
    if (updated) {
      const { id: _id, ...changes } = this.gradeToRow(updated);
      await this.runCloudWrite(
        () => supabase.from('grades').update(changes).eq('id', id),
        () => {
          this.grades = prevGrades;
          saveData(STORAGE_KEYS.GRADES, this.grades);
        },
        'Not güncellemesi buluta kaydedilemedi'
      );
    }
  }

  public async deleteGrade(id: string): Promise<void> {
    const prevGrades = this.grades;
    this.grades = this.grades.filter((g) => g.id !== id);
    saveData(STORAGE_KEYS.GRADES, this.grades);
    this.notify();

    await this.runCloudWrite(
      () => this.deleteRowsVerified('grades', [id]),
      () => {
        this.grades = prevGrades;
        saveData(STORAGE_KEYS.GRADES, this.grades);
      },
      'Not buluttan silinemedi'
    );
  }

  // --- MESSAGES ---
  public async sendMessageToTeacher(
    studentId: string,
    subject: string,
    text: string,
    linkUrl?: string
  ): Promise<StudentMessage> {
    const student = this.students.find((s) => s.id === studentId);
    const newMsg: StudentMessage = {
      id: `msg-${Date.now()}`,
      studentId,
      studentName: student ? student.name : 'Öğrenci',
      studentClass: student ? student.className : 'Genel',
      studentAvatar: student?.avatar,
      subject,
      text,
      linkUrl,
      createdAt: new Date().toISOString(),
      read: false,
    };

    const prevMessages = this.messages;
    this.messages = [newMsg, ...this.messages].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    saveData(STORAGE_KEYS.MESSAGES, this.messages);
    this.notify();

    // Yeni mesaj: "insert" kullanılır (upsert, öğrencide olmayan güncelleme iznini de gerektirir)
    await this.runCloudWrite(
      () => supabase.from('messages').insert(this.messageToRow(newMsg)),
      () => {
        this.messages = prevMessages;
        saveData(STORAGE_KEYS.MESSAGES, this.messages);
      },
      'Mesaj gönderilemedi'
    );

    return newMsg;
  }

  public async markMessageAsRead(id: string): Promise<void> {
    const prevMessages = this.messages;
    this.messages = this.messages.map((m) => (m.id === id ? { ...m, read: true } : m));
    saveData(STORAGE_KEYS.MESSAGES, this.messages);
    this.notify();

    // "Okundu" işareti kritik değil: başarısız olursa sessizce geri alınır
    await this.runCloudWrite(
      () => supabase.from('messages').update({ read: true }).eq('id', id),
      () => {
        this.messages = prevMessages;
        saveData(STORAGE_KEYS.MESSAGES, this.messages);
      },
      'Mesaj okundu olarak işaretlenemedi',
      { silent: true }
    );
  }

  public async replyToMessage(id: string, replyText: string): Promise<void> {
    const nowIso = new Date().toISOString();
    const prevMessages = this.messages;
    this.messages = this.messages.map((m) =>
      m.id === id
        ? {
            ...m,
            teacherReply: replyText,
            repliedAt: nowIso,
            read: true,
          }
        : m
    );
    saveData(STORAGE_KEYS.MESSAGES, this.messages);
    this.notify();

    await this.runCloudWrite(
      () =>
        supabase
          .from('messages')
          .update({ teacher_reply: replyText, replied_at: nowIso, read: true })
          .eq('id', id),
      () => {
        this.messages = prevMessages;
        saveData(STORAGE_KEYS.MESSAGES, this.messages);
      },
      'Cevap buluta kaydedilemedi'
    );
  }

  public async deleteMessage(id: string): Promise<void> {
    const prevMessages = this.messages;
    this.messages = this.messages.filter((m) => m.id !== id);
    saveData(STORAGE_KEYS.MESSAGES, this.messages);
    this.notify();

    await this.runCloudWrite(
      () => this.deleteRowsVerified('messages', [id]),
      () => {
        this.messages = prevMessages;
        saveData(STORAGE_KEYS.MESSAGES, this.messages);
      },
      'Mesaj buluttan silinemedi'
    );
  }

  // --- HELPER QUERIES ---
  public getHomeworksForStudent(studentId: string): {
    homework: Homework;
    submission?: HomeworkSubmission;
    status: 'on_time' | 'late' | 'not_submitted' | 'due_soon';
    isUrgent: boolean;
  }[] {
    const student = this.students.find((s) => s.id === studentId);
    const now = new Date().getTime();

    // Students can see homework if:
    // 1) assignedTo is 'all'
    // 2) assignedTo array includes studentId
    // 3) isGlobalForNewStudents is true (any student who registers later can see all prior homework)
    // 4) targetClassIds matches student class
    const eligibleHomeworks = this.homeworks.filter((hw) =>
      this.isHomeworkForStudent(hw, { id: studentId, classId: student?.classId })
    );

    return eligibleHomeworks.map((hw) => {
      const submission = this.submissions.find(
        (s) => s.homeworkId === hw.id && s.studentId === studentId
      );

      const dueTime = new Date(hw.dueDate).getTime();
      const hoursRemaining = (dueTime - now) / (1000 * 60 * 60);

      let status: 'on_time' | 'late' | 'not_submitted' | 'due_soon' = 'not_submitted';
      const isUrgent = !submission && hoursRemaining > 0 && hoursRemaining <= 48;

      if (submission) {
        status = submission.status;
      } else if (now > dueTime) {
        status = 'not_submitted'; // overdue
      } else if (hoursRemaining <= 48) {
        status = 'due_soon';
      }

      return {
        homework: hw,
        submission,
        status,
        isUrgent,
      };
    });
  }

  public getEtutsForStudent(studentId: string): Etut[] {
    const student = this.students.find((s) => s.id === studentId);
    const studentGrade = student?.className;

    return this.etuts.filter((etut) => {
      // 1. Genel herkese açık etütler
      if (etut.assignedStudentIds === 'all') return true;
      // 2. Bireysel seçilmiş öğrenci
      if (Array.isArray(etut.assignedStudentIds) && etut.assignedStudentIds.includes(studentId))
        return true;
      // 3. Yoklama listesinde kayıtlı öğrenci
      if (etut.studentAttendance && etut.studentAttendance[studentId])
        return true;
      // 4. Öğrenci listesi boş bırakılmışsa kademe/sınıf eşleşmesi
      if (!etut.assignedStudentIds || (Array.isArray(etut.assignedStudentIds) && etut.assignedStudentIds.length === 0)) {
        if (etut.gradeLevel && studentGrade && studentGrade.toLowerCase().includes(etut.gradeLevel.split('.')[0].toLowerCase())) {
          return true;
        }
        return true; // Kademe genel etüdü
      }
      return false;
    });
  }

  public getGradesForStudent(studentId: string): GradeRecord[] {
    return this.grades.filter((g) => g.studentId === studentId);
  }

  public getAttendanceForStudent(studentId: string): {
    record: AttendanceRecord;
    status: AttendanceStatus;
    note?: string;
  }[] {
    const list: { record: AttendanceRecord; status: AttendanceStatus; note?: string }[] = [];
    this.attendance.forEach((att) => {
      const match = att.records.find((r) => r.studentId === studentId);
      if (match) {
        list.push({ record: att, status: match.status, note: match.note });
      }
    });
    return list;
  }

  public getMessagesForStudent(studentId: string): StudentMessage[] {
    return this.messages.filter((m) => m.studentId === studentId);
  }

  // Helper to strictly deduplicate classes by canonical normalized name and eliminate dummy classes
  public deduplicateClasses(classesList: ClassGroup[]): ClassGroup[] {
    const seenNorm = new Set<string>();
    const seenId = new Set<string>();
    const result: ClassGroup[] = [];

    for (const c of classesList) {
      if (!c || !c.id || this.deletedClassIds.has(c.id)) continue;
      const norm = (c.name || '').trim().toLowerCase().replace(/[\s\-_/\\.]/g, '');
      if (!norm || norm === 'sinif' || norm === 'atanmadi' || norm === 'tanimsiz') continue;
      if (seenNorm.has(norm) || seenId.has(c.id)) continue;
      seenNorm.add(norm);
      seenId.add(c.id);
      result.push(c);
    }

    return result.sort((a, b) => a.name.localeCompare(b.name, 'tr', { numeric: true }));
  }

  // --- GETTERS (SCOPED BY AUTH & ROLE PERMISSION) ---
  public getAllStudents(): Student[] {
    return [...this.students].filter((s) => !this.deletedStudentIds.has(s.id));
  }

  public getAllClasses(): ClassGroup[] {
    return this.deduplicateClasses(this.classes);
  }

  public getStudents(forTeacherId?: string): Student[] {
    const session = this.getAuthSession();

    // If viewing in teacher context
    if (forTeacherId || session?.role === 'teacher') {
      const teacherId = forTeacherId || session?.user.id;
      const teacher = this.teachers.find(
        (t) => t.id === teacherId || t.username?.toLowerCase() === session?.user.username?.toLowerCase()
      );

      // Kurum Yöneticisi tüm öğrencileri görebilir
      if (this.isTeacherAdmin(teacher) || this.isTeacherAdmin(session?.user as Teacher)) {
        return this.students.filter((s) => !this.deletedStudentIds.has(s.id));
      }

      // Yönetici bu öğretmene önceden eklenmiş tüm sınıf ve öğrenci listelerini görme izni vermişse görebilir
      if (teacher?.canViewAllStudentsAndClasses) {
        return this.students.filter((s) => !this.deletedStudentIds.has(s.id));
      }

      // Normal öğretmen: İzinli sınıflardaki öğrencileri VEYA bireysel olarak yetkilendirildiği öğrencileri görebilir
      const permittedClasses = this.getClasses(teacherId);
      const permittedClassIds = new Set(permittedClasses.map((c) => c.id));
      const permittedClassNames = new Set(
        permittedClasses.map((c) => (c.name || '').trim().toLowerCase().replace(/[\s\-_/\\.]/g, ''))
      );

      return this.students.filter((s) => {
        if (this.deletedStudentIds.has(s.id)) return false;
        if (this.myTeacherAccess.studentIds.has(s.id)) return true;
        // Bireysel öğrenci yetkilendirmesi
        if (s.authorizedTeacherIds && Array.isArray(s.authorizedTeacherIds) && s.authorizedTeacherIds.includes(teacherId!)) {
          return true;
        }
        // Sınıf bazlı yetkilendirme
        if (s.classId && permittedClassIds.has(s.classId)) return true;
        if (s.className) {
          const normS = s.className.trim().toLowerCase().replace(/[\s\-_/\\.]/g, '');
          if (permittedClassNames.has(normS)) return true;
        }
        return false;
      });
    }

    // Öğrenci oturumu: öğrenci YALNIZCA kendi bilgilerini görebilir, diğer öğrencileri göremez
    if (session?.role === 'student') {
      const studentId = session.user.id;
      return this.students.filter((s) => s.id === studentId && !this.deletedStudentIds.has(s.id));
    }

    return this.students.filter((s) => !this.deletedStudentIds.has(s.id));
  }

  public getClasses(forTeacherId?: string): ClassGroup[] {
    const session = this.getAuthSession();

    if (forTeacherId || session?.role === 'teacher') {
      const teacherId = forTeacherId || session?.user.id;
      const teacher = this.teachers.find(
        (t) => t.id === teacherId || t.username?.toLowerCase() === session?.user.username?.toLowerCase()
      );

      // Yönetici tüm sınıfları görebilir
      if (this.isTeacherAdmin(teacher) || this.isTeacherAdmin(session?.user as Teacher)) {
        return this.deduplicateClasses(this.classes);
      }

      // Yönetici bu öğretmene önceden eklenmiş sınıf listelerini görme izni vermişse görebilir
      if (teacher?.canViewAllStudentsAndClasses) {
        return this.deduplicateClasses(this.classes);
      }

      // Normal öğretmen: SADECE admin'in yetkilendirdiği (authorizedTeacherIds veya assignedClassIds içinde bulunan) sınıfları görebilir
      const rawAssigned = teacher?.assignedClassIds || [];
      const assignedClassIds = new Set(rawAssigned);

      const filtered = this.classes.filter((c) => {
        if (this.deletedClassIds.has(c.id)) return false;
        if (this.myTeacherAccess.classIds.has(c.id)) return true;
        if (c.authorizedTeacherIds && Array.isArray(c.authorizedTeacherIds) && c.authorizedTeacherIds.includes(teacherId!)) return true;
        if (assignedClassIds.has(c.id) || (c.name && assignedClassIds.has(c.name))) return true;
        return false;
      });

      return this.deduplicateClasses(filtered);
    }

    if (session?.role === 'student') {
      const student = session.user as Student;
      const filtered = this.classes.filter((c) => c.id === student.classId || c.name === student.className);
      return this.deduplicateClasses(filtered);
    }

    return this.deduplicateClasses(this.classes);
  }

  // Hızlı Sınıf Değiştirme / Aktarma (Öğrenci satırındaki açılır pencere için)
  public async updateStudentClass(studentId: string, newClassId: string): Promise<Student> {
    const studentIdx = this.students.findIndex((s) => s.id === studentId);
    if (studentIdx === -1) {
      throw new Error('Öğrenci kaydı bulunamadı.');
    }

    const prevStudents = JSON.parse(JSON.stringify(this.students));
    const currentStudent = this.students[studentIdx];
    let newClassName = 'Atanmadı';
    let newGradeLevel: string | undefined = undefined;
    let newSchoolLevel: 'İlkokul' | 'Ortaokul' | 'Lise' | undefined = currentStudent.schoolLevel;
    let newBranch: string | undefined = undefined;

    if (newClassId && newClassId !== 'unassigned' && newClassId !== 'class-default') {
      const cls = this.classes.find((c) => c.id === newClassId || c.name === newClassId);
      if (cls) {
        newClassName = cls.name;
        newGradeLevel = cls.gradeLevel;
        newSchoolLevel = cls.schoolLevel;
        newBranch = cls.branch;
      }
    } else {
      newClassId = 'class-default';
    }

    const updated: Student = {
      ...currentStudent,
      classId: newClassId,
      className: newClassName,
      gradeLevel: newGradeLevel || currentStudent.gradeLevel,
      schoolLevel: newSchoolLevel || currentStudent.schoolLevel,
      branch: newBranch || currentStudent.branch,
    };

    this.students[studentIdx] = updated;
    saveData(STORAGE_KEYS.STUDENTS, this.students);
    try {
      localStorage.setItem(PERMANENT_KEYS.MASTER_STUDENTS, JSON.stringify(this.students));
    } catch {}

    // Bulut yazmasını AWAIT et ve sonucunu kontrol et
    try {
      const res = await this.patchStudentRow(studentId, {
        class_id: newClassId,
        class_name: newClassName,
      });

      if (!res.success) {
        throw res.error || new Error('Öğrencinin sınıfı güncellenemedi.');
      }
    } catch (e: any) {
      // ROLLBACK: Buluta yazılamadıysa eski haline döndür
      this.students = prevStudents;
      saveData(STORAGE_KEYS.STUDENTS, this.students);
      try {
        localStorage.setItem(PERMANENT_KEYS.MASTER_STUDENTS, JSON.stringify(this.students));
      } catch {}
      this.notify();

      const errMsg =
        e?.message ||
        (e?.code === '42501'
          ? 'Öğrenci sınıfını güncelleme yetkiniz bulunmamaktadır (RLS kuralı).'
          : 'Öğrencinin yeni sınıfı bulut veritabanına kaydedilemedi.');

      this.showFloatingErrorToast(`Hata: ${errMsg} Değişiklikler geri alındı.`);
      throw new Error(`[updateStudentClass] Sınıf güncelleme başarısız: ${errMsg}`);
    }

    this.notify();
    return updated;
  }

  // Mükerrer / Çift Kayıt Kontrolü (Aynı öğrencinin iki kez kayıt olmasını engelleme)
  public checkDuplicateStudent(
    name: string,
    studentNumber?: string,
    className?: string,
    excludeId?: string
  ): Student | null {
    const cleanName = (name || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!cleanName) return null;
    const cleanNum = (studentNumber || '').trim();
    const cleanCls = (className || '').trim().toLowerCase();

    return (
      this.students.find((s) => {
        if (excludeId && s.id === excludeId) return false;
        if (this.deletedStudentIds.has(s.id)) return false;
        const sName = (s.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
        if (sName !== cleanName) return false;
        // Same name AND same student number
        if (cleanNum && s.studentNumber && s.studentNumber.trim() === cleanNum) return true;
        // Same name AND same class
        if (cleanCls && s.className && s.className.trim().toLowerCase() === cleanCls) return true;
        return false;
      }) || null
    );
  }

  public getHomeworks(forTeacherId?: string): Homework[] {
    const session = this.getAuthSession();

    if (forTeacherId || session?.role === 'teacher') {
      const teacherId = forTeacherId || session?.user.id;
      const teacher = this.teachers.find(
        (t) => t.id === teacherId || t.username?.toLowerCase() === session?.user.username?.toLowerCase()
      );

      // Yönetici tüm ödevleri görebilir
      if (this.isTeacherAdmin(teacher)) {
        return [...this.homeworks];
      }

      // Normal öğretmen daha önce veya başka öğretmenlerin verdiği ödevleri GÖREMEZ. YALNIZCA KENDİ verdiği ödevleri görebilir.
      return this.homeworks.filter((hw) => {
        return (
          (!!teacher?.auth_user_id && hw.teacherAuthId === teacher.auth_user_id) ||
          hw.teacherId === teacherId ||
          (!!teacher?.name && hw.createdByName === teacher.name)
        );
      });
    }

    if (session?.role === 'student') {
      const sessionStudent = session.user as Student;
      const student = this.students.find((s) => s.id === sessionStudent.id) || sessionStudent;
      return this.homeworks.filter((hw) => this.isHomeworkForStudent(hw, student));
    }

    return [...this.homeworks];
  }

  public getEtuts(forTeacherId?: string): Etut[] {
    const session = this.getAuthSession();

    // Öğretmen ve Yönetici Görünümü:
    // Bilgisayar, tablet ve telefondan açılan tüm oturumlarda kurumdaki planlı etütlerin eksiksiz görünmesi sağlanır
    if (forTeacherId || session?.role === 'teacher') {
      return [...this.etuts];
    }

    if (session?.role === 'student') {
      const studentId = session.user.id;
      const student = this.students.find((s) => s.id === studentId);
      const studentGrade = student?.className;

      return this.etuts.filter((e) => {
        // 1. Genel herkese açık etütler
        if (e.assignedStudentIds === 'all') return true;
        // 2. Bireysel seçilmiş öğrenci
        if (Array.isArray(e.assignedStudentIds) && e.assignedStudentIds.includes(studentId))
          return true;
        // 3. Yoklama listesinde kayıtlı öğrenci
        if (e.studentAttendance && e.studentAttendance[studentId])
          return true;
        // 4. Öğrenci listesi boş bırakılmışsa kademe/sınıf eşleşmesi
        if (!e.assignedStudentIds || (Array.isArray(e.assignedStudentIds) && e.assignedStudentIds.length === 0)) {
          if (e.gradeLevel && studentGrade && studentGrade.toLowerCase().includes(e.gradeLevel.split('.')[0].toLowerCase())) {
            return true;
          }
          return true;
        }
        return false;
      });
    }

    return [...this.etuts];
  }

  public getGrades(forTeacherId?: string): GradeRecord[] {
    const session = this.getAuthSession();

    if (forTeacherId || session?.role === 'teacher') {
      const teacherId = forTeacherId || session?.user.id;
      const teacher = this.teachers.find((t) => t.id === teacherId);
      if (teacher?.isAdmin) return [...this.grades];

      const visibleStudents = new Set(this.getStudents(teacherId).map((s) => s.id));
      return this.grades.filter((g) => visibleStudents.has(g.studentId));
    }

    if (session?.role === 'student') {
      return this.grades.filter((g) => g.studentId === session.user.id);
    }

    return [...this.grades];
  }

  public getAttendance(forTeacherId?: string): AttendanceRecord[] {
    const session = this.getAuthSession();

    if (forTeacherId || session?.role === 'teacher') {
      const teacherId = forTeacherId || session?.user.id;
      const teacher = this.teachers.find((t) => t.id === teacherId);
      if (teacher?.isAdmin) return [...this.attendance];

      const visibleClasses = new Set(this.getClasses(teacherId).map((c) => c.id));
      const visibleStudents = new Set(this.getStudents(teacherId).map((s) => s.id));

      return this.attendance
        .filter((a) => visibleClasses.has(a.classId))
        .map((a) => ({
          ...a,
          records: a.records.filter((r) => visibleStudents.has(r.studentId)),
        }));
    }

    if (session?.role === 'student') {
      const studentId = session.user.id;
      return this.attendance.filter((a) => a.records.some((r) => r.studentId === studentId));
    }

    return [...this.attendance];
  }

  public getMessages(forTeacherId?: string): StudentMessage[] {
    const session = this.getAuthSession();

    if (forTeacherId || session?.role === 'teacher') {
      const teacherId = forTeacherId || session?.user.id;
      const teacher = this.teachers.find((t) => t.id === teacherId);
      if (teacher?.isAdmin) return [...this.messages];

      const visibleStudents = new Set(this.getStudents(teacherId).map((s) => s.id));
      return this.messages.filter((m) => visibleStudents.has(m.studentId));
    }

    if (session?.role === 'student') {
      return this.messages.filter((m) => m.studentId === session.user.id);
    }

    return [...this.messages];
  }

  public getSubmissions(forTeacherId?: string): HomeworkSubmission[] {
    const session = this.getAuthSession();

    if (forTeacherId || session?.role === 'teacher') {
      const teacherId = forTeacherId || session?.user.id;
      const teacher = this.teachers.find((t) => t.id === teacherId);
      if (teacher?.isAdmin) return [...this.submissions];

      const visibleStudents = new Set(this.getStudents(teacherId).map((s) => s.id));
      return this.submissions.filter((sub) => visibleStudents.has(sub.studentId));
    }

    if (session?.role === 'student') {
      return this.submissions.filter((sub) => sub.studentId === session.user.id);
    }

    return [...this.submissions];
  }

  public async sendMessage(msgData: Omit<StudentMessage, 'id' | 'createdAt' | 'read'>): Promise<StudentMessage> {
    const newMsg: StudentMessage = {
      ...msgData,
      id: `msg-${Date.now()}`,
      createdAt: new Date().toISOString(),
      read: false,
    };
    const prevMessages = this.messages;
    this.messages = [newMsg, ...this.messages].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    saveData(STORAGE_KEYS.MESSAGES, this.messages);
    this.notify();

    // Yeni mesaj: "insert" kullanılır (upsert, öğrencide olmayan güncelleme iznini de gerektirir)
    await this.runCloudWrite(
      () => supabase.from('messages').insert(this.messageToRow(newMsg)),
      () => {
        this.messages = prevMessages;
        saveData(STORAGE_KEYS.MESSAGES, this.messages);
      },
      'Mesaj gönderilemedi'
    );

    return newMsg;
  }

  public getStudentHomeworkStatus(homeworkId: string, studentId: string): {
    label: string;
    emoji: string;
    badgeClass: string;
    status: 'on_time' | 'late' | 'not_submitted' | 'due_soon';
  } {
    const hw = this.homeworks.find((h) => h.id === homeworkId);
    const sub = this.submissions.find((s) => s.homeworkId === homeworkId && s.studentId === studentId);
    const now = new Date().getTime();

    if (sub) {
      if (sub.status === 'on_time') {
        return {
          label: 'Zamanında Teslim Edildi',
          emoji: '🌟',
          badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
          status: 'on_time',
        };
      } else {
        return {
          label: 'Gecikmeli Teslim',
          emoji: '⚠️',
          badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
          status: 'late',
        };
      }
    }

    if (hw) {
      const dueTime = new Date(hw.dueDate).getTime();
      const diffHours = (dueTime - now) / (1000 * 60 * 60);

      if (now > dueTime) {
        return {
          label: 'Teslim Edilmedi (Gecikti)',
          emoji: '🚨',
          badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
          status: 'not_submitted',
        };
      } else if (diffHours <= 48) {
        return {
          label: 'Yaklaşıyor (Son 48s)',
          emoji: '⏳',
          badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
          status: 'due_soon',
        };
      }
    }

    return {
      label: 'Bekliyor',
      emoji: '📝',
      badgeClass: 'bg-slate-800 text-slate-300 border-slate-700',
      status: 'not_submitted',
    };
  }

  // ==================== TEACHER DOCUMENTS ARCHIVE ====================
  public getTeacherDocuments(): TeacherDocument[] {
    return [...this.documents];
  }

  // Giriş yapan öğretmen bu belgeyi silebilir/düzenleyebilir mi? (yükleyen veya yönetici)
  public canManageDocument(doc: TeacherDocument): boolean {
    if (this.isCurrentUserAdmin()) return true;
    return !!doc.ownerAuthId && !!this.currentAuthUid && doc.ownerAuthId === this.currentAuthUid;
  }

  // Belgenin ağır içeriği (Word önizlemesi, Excel tabloları, eski gömülü dosya) yalnız açılınca yüklenir
  private documentDetailCache = new Map<string, Pick<TeacherDocument, 'htmlPreview' | 'tableSheets' | 'fileData'>>();

  public async getTeacherDocumentDetail(doc: TeacherDocument): Promise<TeacherDocument> {
    if (doc.htmlPreview || doc.tableSheets || doc.fileData) return doc;
    const cached = this.documentDetailCache.get(doc.id);
    if (cached) return { ...doc, ...cached };
    const { data, error } = await supabase
      .from('teacher_documents')
      .select('html_preview,table_sheets,legacy_file_data')
      .eq('id', doc.id)
      .maybeSingle();
    if (error) throw new Error('Belge içeriği yüklenemedi. Bağlantınızı kontrol edip tekrar deneyin.');
    const detail = {
      htmlPreview: data?.html_preview || undefined,
      tableSheets: Array.isArray(data?.table_sheets) ? data!.table_sheets : undefined,
      fileData: data?.legacy_file_data || undefined,
    };
    this.documentDetailCache.set(doc.id, detail);
    return { ...doc, ...detail };
  }

  // Yeni belge: dosya önce depoya yüklenir, sonra belge kaydı eklenir. Hata olursa yüklenen dosya silinir.
  public async addTeacherDocument(
    doc: Omit<TeacherDocument, 'id' | 'uploadedAt'>,
    file: File
  ): Promise<TeacherDocument> {
    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData?.session?.user?.id;
    if (!uid) {
      const msg = 'Oturumunuz bulunamadı. Lütfen çıkış yapıp tekrar giriş yapın.';
      this.showFloatingErrorToast(`Hata: ${msg}`);
      throw new Error(msg);
    }
    this.currentAuthUid = uid;
    const currentTeacher = this.getCurrentTeacher();

    const uploaded = await uploadFile(`belge/${uid}`, file); // hata mesajı Türkçe olarak fırlatılır
    const newDoc: TeacherDocument = {
      ...doc,
      fileData: undefined,
      id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      uploadedAt: new Date().toISOString(),
      uploadedBy: currentTeacher?.id || doc.uploadedBy || 'Öğretmen',
      authorName: doc.authorName || currentTeacher?.name || undefined,
      fileName: file.name,
      fileSize: uploaded.fileSize,
      storagePath: uploaded.path,
      ownerAuthId: uid,
    };
    const row = {
      id: newDoc.id,
      title: newDoc.title,
      description: newDoc.description || null,
      category: newDoc.category,
      file_format: newDoc.fileFormat,
      file_name: newDoc.fileName,
      file_size: newDoc.fileSize,
      storage_path: newDoc.storagePath,
      subject: newDoc.subject || 'Genel',
      school_type: newDoc.schoolType || null,
      grade_level: newDoc.gradeLevel || null,
      academic_year: newDoc.academicYear || null,
      tags: newDoc.tags || [],
      author_name: newDoc.authorName || null,
      uploaded_by: newDoc.uploadedBy || null,
      owner_auth_id: uid,
      html_preview: newDoc.htmlPreview || null,
      table_sheets: newDoc.tableSheets || null,
    };

    const prevDocs = [...this.documents];
    const { htmlPreview, tableSheets, ...lightDoc } = newDoc;
    this.documents = [lightDoc, ...this.documents];
    if (htmlPreview || tableSheets) this.documentDetailCache.set(newDoc.id, { htmlPreview, tableSheets });
    this.persistDocumentsLocal();
    this.notify();

    try {
      await this.runCloudWrite(
        () => supabase.from('teacher_documents').insert(row),
        () => {
          this.documents = prevDocs;
          this.persistDocumentsLocal();
        },
        'Belge arşive kaydedilemedi'
      );
    } catch (e) {
      removeStoredFiles([uploaded.path]);
      throw e;
    }
    return lightDoc;
  }

  public async deleteTeacherDocument(id: string): Promise<void> {
    const doc = this.documents.find((d) => d.id === id);
    const prevDocs = [...this.documents];
    this.documents = this.documents.filter((d) => d.id !== id);
    this.persistDocumentsLocal();
    this.notify();

    await this.runCloudWrite(
      () => this.deleteRowsVerified('teacher_documents', [id]),
      () => {
        this.documents = prevDocs;
        this.persistDocumentsLocal();
      },
      'Belge silinemedi (yalnızca yükleyen öğretmen veya yönetici silebilir)'
    );
    this.documentDetailCache.delete(id);
    if (doc?.storagePath) removeStoredFiles([doc.storagePath]);
  }

  // ==================== NOTIFICATIONS & EMAILS ====================
  public addStudentNotification(notification: Omit<StudentNotification, 'id' | 'createdAt' | 'read'> & { id?: string }): StudentNotification {
    const newNotif: StudentNotification = {
      id: notification.id || `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date().toISOString(),
      read: false,
      ...notification,
    };
    this.studentNotifications.unshift(newNotif);
    saveData(STORAGE_KEYS.STUDENT_NOTIFICATIONS, this.studentNotifications);
    this.notify();
    return newNotif;
  }

  public sendStudentPraise(
    studentId: string,
    data: {
      teacherName: string;
      message: string;
      date: string;
      questionCount: number;
      subjectDetails?: string;
    }
  ): StudentNotification {
    const title = `👏 Tebrikler! Öğretmeninizden Tebrik Mesajı`;
    return this.addStudentNotification({
      studentId,
      type: 'praise',
      title,
      message: data.message,
      sourceId: data.date,
      sourceTitle: `${data.date} Tarihli Soru Çözümü (${data.questionCount} Soru)`,
      teacherName: data.teacherName,
      linkTab: 'questions',
    });
  }

  public getStudentNotifications(studentId?: string): StudentNotification[] {
    if (!studentId) return this.studentNotifications;
    return this.studentNotifications.filter((n) => n.studentId === studentId);
  }

  public getUnreadNotificationsCount(studentId: string): number {
    return this.studentNotifications.filter((n) => n.studentId === studentId && !n.read).length;
  }

  public markNotificationAsRead(id: string): void {
    this.studentNotifications = this.studentNotifications.map((n) =>
      n.id === id ? { ...n, read: true } : n
    );
    saveData(STORAGE_KEYS.STUDENT_NOTIFICATIONS, this.studentNotifications);
    this.notify();
  }

  public markAllNotificationsAsRead(studentId: string): void {
    this.studentNotifications = this.studentNotifications.map((n) =>
      n.studentId === studentId ? { ...n, read: true } : n
    );
    saveData(STORAGE_KEYS.STUDENT_NOTIFICATIONS, this.studentNotifications);
    this.notify();
  }

  public deleteNotification(id: string): void {
    this.studentNotifications = this.studentNotifications.filter((n) => n.id !== id);
    saveData(STORAGE_KEYS.STUDENT_NOTIFICATIONS, this.studentNotifications);
    this.notify();
  }

  public clearStudentNotifications(studentId: string): void {
    this.studentNotifications = this.studentNotifications.filter((n) => n.studentId !== studentId);
    saveData(STORAGE_KEYS.STUDENT_NOTIFICATIONS, this.studentNotifications);
    this.notify();
  }

  public getSentEmails(studentId?: string): SentEmailLog[] {
    if (!studentId) return this.sentEmails;
    return this.sentEmails.filter((e) => e.studentId === studentId);
  }

  public deleteSentEmail(id: string): void {
    this.sentEmails = this.sentEmails.filter((e) => e.id !== id);
    saveData(STORAGE_KEYS.SENT_EMAILS, this.sentEmails);
    this.notify();
  }

  public dispatchHomeworkNotificationsAndEmails(hw: Homework): number {
    let targetStudents: Student[] = [];
    if (hw.assignedTo === 'all') {
      if (hw.targetClassIds && hw.targetClassIds.length > 0) {
        targetStudents = this.students.filter((s) => hw.targetClassIds!.includes(s.classId));
      } else {
        targetStudents = [...this.students];
      }
    } else if (Array.isArray(hw.assignedTo)) {
      targetStudents = this.students.filter((s) => hw.assignedTo.includes(s.id));
    }

    const nowIso = new Date().toISOString();
    let sentCount = 0;

    targetStudents.forEach((student) => {
      const emailContent = generateHomeworkEmail({
        studentName: student.name,
        studentEmail: student.email,
        teacherName: hw.createdByName || 'Öğretmen',
        subject: hw.subject,
        title: hw.title,
        description: hw.description,
        dueDate: hw.dueDate,
        outcomes: hw.outcomes || hw.learningOutcomes || [],
        resourcesCount: hw.resources?.length || 0,
        attachmentUrl: hw.attachmentUrl,
      });

      const emailLog: SentEmailLog = {
        id: `email-${Date.now()}-${student.id}-${Math.random().toString(36).substr(2, 4)}`,
        recipientEmail: student.email,
        recipientName: student.name,
        recipientRole: 'student',
        studentId: student.id,
        type: 'homework_assigned',
        subject: emailContent.subject,
        htmlContent: emailContent.html,
        textContent: emailContent.text,
        sentAt: nowIso,
        status: 'delivered',
        sourceId: hw.id,
        sourceTitle: hw.title,
        teacherName: hw.createdByName || 'Öğretmen',
      };
      void emailLog; // Aşama 9: gerçek e-postalar sunucudan gider (mail_log); burada sahte "gönderildi" kaydı tutulmaz

      const notif: StudentNotification = {
        id: `notif-${Date.now()}-${student.id}-${Math.random().toString(36).substr(2, 4)}`,
        studentId: student.id,
        type: 'new_homework',
        title: `Yeni Ödev: ${hw.subject} - ${hw.title}`,
        message: `${hw.createdByName || 'Öğretmeniniz'} yeni bir ödev tanımladı. Son teslim tarihi: ${formatDueDateTurkish(hw.dueDate)}`,
        sourceId: hw.id,
        sourceTitle: hw.title,
        teacherName: hw.createdByName || 'Öğretmen',
        createdAt: nowIso,
        read: false,
        linkTab: 'homework',
        emailSent: false,
        emailRecipient: student.email,
        emailDetails: {
          subject: emailContent.subject,
          bodyHtml: emailContent.html,
          sentAt: nowIso,
        },
      };
      this.studentNotifications.unshift(notif);
      sentCount++;
    });

    saveData(STORAGE_KEYS.STUDENT_NOTIFICATIONS, this.studentNotifications);
    saveData(STORAGE_KEYS.SENT_EMAILS, this.sentEmails);

    // Browser Notification chime
    const session = this.getAuthSession();
    if (session?.role === 'student' && targetStudents.some((s) => s.id === session.user.id)) {
      sendBrowserNotification(
        `📚 Yeni Ödev: ${hw.subject}`,
        `"${hw.title}" başlıklı yeni ödeviniz tanımlandı. Son teslim: ${formatDueDateTurkish(hw.dueDate)}`
      );
    }

    return sentCount;
  }

  public dispatchEtutNotificationsAndEmails(etut: Etut): number {
    let targetStudents: Student[] = [];
    if (etut.assignedStudentIds === 'all') {
      targetStudents = [...this.students];
    } else if (Array.isArray(etut.assignedStudentIds)) {
      targetStudents = this.students.filter((s) => etut.assignedStudentIds.includes(s.id));
    }

    const nowIso = new Date().toISOString();
    let sentCount = 0;

    targetStudents.forEach((student) => {
      const emailContent = generateEtutEmail({
        studentName: student.name,
        studentEmail: student.email,
        teacherName: etut.teacherName || 'Öğretmen',
        subject: etut.subject,
        topic: etut.topic,
        date: etut.date,
        time: etut.time,
        duration: etut.duration,
        location: etut.location,
        notes: etut.notes,
        teacherFeedback: etut.teacherFeedback,
      });

      const emailLog: SentEmailLog = {
        id: `email-${Date.now()}-${student.id}-${Math.random().toString(36).substr(2, 4)}`,
        recipientEmail: student.email,
        recipientName: student.name,
        recipientRole: 'student',
        studentId: student.id,
        type: 'etut_assigned',
        subject: emailContent.subject,
        htmlContent: emailContent.html,
        textContent: emailContent.text,
        sentAt: nowIso,
        status: 'delivered',
        sourceId: etut.id,
        sourceTitle: etut.topic,
        teacherName: etut.teacherName || 'Öğretmen',
      };
      void emailLog; // Aşama 9: gerçek e-postalar sunucudan gider (mail_log); burada sahte "gönderildi" kaydı tutulmaz

      const notif: StudentNotification = {
        id: `notif-${Date.now()}-${student.id}-${Math.random().toString(36).substr(2, 4)}`,
        studentId: student.id,
        type: 'new_etut',
        title: `Yeni Etüt: ${etut.subject} - ${etut.topic}`,
        message: `${formatEtutDateTurkish(etut.date)} saat ${etut.time}'de (${etut.duration} dk), ${etut.location} dersliğinde etüdünüz planlandı.`,
        sourceId: etut.id,
        sourceTitle: etut.topic,
        teacherName: etut.teacherName || 'Öğretmen',
        createdAt: nowIso,
        read: false,
        linkTab: 'etuts',
        emailSent: false,
        emailRecipient: student.email,
        emailDetails: {
          subject: emailContent.subject,
          bodyHtml: emailContent.html,
          sentAt: nowIso,
        },
      };
      this.studentNotifications.unshift(notif);
      sentCount++;
    });

    saveData(STORAGE_KEYS.STUDENT_NOTIFICATIONS, this.studentNotifications);
    saveData(STORAGE_KEYS.SENT_EMAILS, this.sentEmails);

    const session = this.getAuthSession();
    if (session?.role === 'student' && targetStudents.some((s) => s.id === session.user.id)) {
      sendBrowserNotification(
        `📅 Yeni Etüt: ${etut.subject}`,
        `"${etut.topic}" konulu etüdünüz ${etut.date} saat ${etut.time}'de planlandı.`
      );
    }

    return sentCount;
  }

  private seedInitialNotifications(): void {
    // Otomatik/rastgele dummy bildirim ve e-posta yüklemesi devre dışı bırakıldı
    return;
  }

  // --- QUESTION LOGS (SORU SAYISI TAKİP) ---
  public getQuestionLogs(): StudentQuestionLog[] {
    const session = this.getAuthSession();
    if (session?.role === 'student') {
      return this.questionLogs.filter((q) => q.studentId === session.user.id);
    }
    if (session?.role === 'teacher') {
      const teacher = this.getCurrentTeacher();
      if (this.isTeacherAdmin(teacher)) {
        return [...this.questionLogs];
      }
      const visibleStudentIds = new Set(this.getStudents(teacher?.id).map((s) => s.id));
      return this.questionLogs.filter((q) => visibleStudentIds.has(q.studentId));
    }
    return [...this.questionLogs];
  }

  public getQuestionLogsByStudent(studentId: string): StudentQuestionLog[] {
    const session = this.getAuthSession();
    if (session?.role === 'student' && session.user.id !== studentId) {
      return [];
    }
    if (session?.role === 'teacher') {
      const teacher = this.getCurrentTeacher();
      if (!this.isTeacherAdmin(teacher)) {
        const visibleStudentIds = new Set(this.getStudents(teacher?.id).map((s) => s.id));
        if (!visibleStudentIds.has(studentId)) {
          return [];
        }
      }
    }
    return this.questionLogs.filter((q) => q.studentId === studentId);
  }

  public getQuestionLogsByClass(classId: string): StudentQuestionLog[] {
    const session = this.getAuthSession();
    if (session?.role === 'student') {
      const student = session.user as Student;
      if (student.classId !== classId) return [];
      return this.questionLogs.filter((q) => q.studentId === student.id);
    }
    if (session?.role === 'teacher') {
      const teacher = this.getCurrentTeacher();
      if (!this.isTeacherAdmin(teacher)) {
        const visibleClassIds = new Set(this.getClasses(teacher?.id).map((c) => c.id));
        if (!visibleClassIds.has(classId)) {
          return [];
        }
        const visibleStudentIds = new Set(this.getStudents(teacher?.id).map((s) => s.id));
        return this.questionLogs.filter((q) => q.classId === classId && visibleStudentIds.has(q.studentId));
      }
    }
    return this.questionLogs.filter((q) => q.classId === classId);
  }

  public async saveQuestionLog(
    logData: Omit<StudentQuestionLog, 'id' | 'createdAt' | 'totalQuestions'> & {
      id?: string;
      totalQuestions?: number;
    }
  ): Promise<StudentQuestionLog> {
    let calculatedTotal = 0;
    let calculatedCorrect = 0;
    let calculatedWrong = 0;
    let calculatedEmpty = 0;

    const cleanEntries = (logData.entries || [])
      .filter((e) => (e.questionCount || 0) > 0)
      .map((e) => {
        const qc = Number(e.questionCount) || 0;
        const c = Number(e.correctCount) || 0;
        const w = Number(e.wrongCount) || 0;
        const emp = e.emptyCount !== undefined ? Number(e.emptyCount) : Math.max(0, qc - c - w);
        calculatedTotal += qc;
        calculatedCorrect += c;
        calculatedWrong += w;
        calculatedEmpty += emp;
        return {
          subject: e.subject,
          questionCount: qc,
          correctCount: c,
          wrongCount: w,
          emptyCount: emp,
          topic: e.topic || '',
        };
      });

    const finalTotal = logData.totalQuestions || calculatedTotal;
    const finalCorrect = logData.totalCorrect !== undefined ? logData.totalCorrect : calculatedCorrect;
    const finalWrong = logData.totalWrong !== undefined ? logData.totalWrong : calculatedWrong;
    const finalEmpty = logData.totalEmpty !== undefined ? logData.totalEmpty : calculatedEmpty;

    // Check if an entry exists for the same student and same date
    const existingIdx = logData.id
      ? this.questionLogs.findIndex((q) => q.id === logData.id)
      : this.questionLogs.findIndex(
          (q) => q.studentId === logData.studentId && q.date === logData.date
        );

    const prevLogs = [...this.questionLogs];
    let saved: StudentQuestionLog;
    if (existingIdx !== -1) {
      saved = {
        ...this.questionLogs[existingIdx],
        ...logData,
        entries: cleanEntries,
        totalQuestions: finalTotal,
        totalCorrect: finalCorrect,
        totalWrong: finalWrong,
        totalEmpty: finalEmpty,
        notes: logData.notes || '',
      } as StudentQuestionLog;
      const target = saved;
      this.questionLogs = this.questionLogs.map((q, i) => (i === existingIdx ? target : q));
    } else {
      saved = {
        id: logData.id || `qlog-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        studentId: logData.studentId,
        studentName: logData.studentName,
        classId: logData.classId,
        className: logData.className,
        date: logData.date,
        entries: cleanEntries,
        totalQuestions: finalTotal,
        totalCorrect: finalCorrect,
        totalWrong: finalWrong,
        totalEmpty: finalEmpty,
        notes: logData.notes || '',
        createdAt: new Date().toISOString(),
      };
      this.questionLogs = [saved, ...this.questionLogs];
    }
    this.persistQuestionLogsLocal();
    this.notify();

    await this.runCloudWrite(
      async () => {
        let res = await supabase.from('question_logs').upsert(this.questionLogToRow(saved), { onConflict: 'id' });
        if (res.error?.code === '23505') {
          // Aynı gün için başka bir cihazdan açılmış kayıt var: o kayıt güncellenir
          const { data: other } = await supabase
            .from('question_logs')
            .select('id')
            .eq('student_id', saved.studentId)
            .eq('date', saved.date)
            .maybeSingle();
          if (other?.id) {
            const oldId = saved.id;
            saved = { ...saved, id: other.id };
            const merged = saved;
            this.questionLogs = this.questionLogs
              .filter((q) => q.id !== other.id)
              .map((q) => (q.id === oldId ? merged : q));
            res = await supabase.from('question_logs').upsert(this.questionLogToRow(saved), { onConflict: 'id' });
          }
        }
        return { error: res.error };
      },
      () => {
        this.questionLogs = prevLogs;
        this.persistQuestionLogsLocal();
      },
      'Soru kaydı kaydedilemedi'
    );

    this.persistQuestionLogsLocal();
    this.notify();
    return saved;
  }

  public async deleteQuestionLog(id: string): Promise<void> {
    const prevLogs = [...this.questionLogs];
    const wasTombstoned = this.deletedQuestionLogIds.has(id);
    this.deletedQuestionLogIds.add(id);
    saveData(STORAGE_KEYS.DELETED_QUESTION_LOGS, Array.from(this.deletedQuestionLogIds));
    this.questionLogs = this.questionLogs.filter((q) => q.id !== id);
    this.persistQuestionLogsLocal();

    // Eski sürüm yerel yedeklerde kalan kopyalar da temizlenir (geri dirilmesin)
    [
      'edu_sys_question_logs_v5', 'edu_sys_question_logs_v4', 'edu_sys_question_logs_v3',
      'edu_sys_question_logs_v2', 'edu_sys_question_logs_v1', 'edu_sys_question_logs', 'edu_sys_question_logs_backup',
    ].forEach((legacyKey) => {
      try {
        const val = localStorage.getItem(legacyKey);
        if (val) {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed)) {
            localStorage.setItem(legacyKey, JSON.stringify(parsed.filter((q: any) => q.id !== id)));
          }
        }
      } catch {}
    });
    this.notify();

    await this.runCloudWrite(
      () => this.deleteRowsVerified('question_logs', [id]),
      () => {
        this.questionLogs = prevLogs;
        if (!wasTombstoned) this.deletedQuestionLogIds.delete(id);
        saveData(STORAGE_KEYS.DELETED_QUESTION_LOGS, Array.from(this.deletedQuestionLogIds));
        this.persistQuestionLogsLocal();
      },
      'Soru kaydı silinemedi'
    );
  }

  public clearAutoSeededQuestionLogs(): void {
    const prevCount = this.questionLogs.length;
    this.questionLogs = this.questionLogs.filter((q) => {
      const isAutoSeeded =
        q.id.startsWith(`qlog-${q.studentId}-`) ||
        q.id.startsWith('qlog-seed-') ||
        q.notes === 'Hedef soru sayısı başarıyla aşıldı.' ||
        q.notes === 'Günlük soru hedefi tamamlandı.';
      return !isAutoSeeded;
    });
    if (this.questionLogs.length !== prevCount) {
      saveData(STORAGE_KEYS.QUESTION_LOGS, this.questionLogs);
      this.notify();
    }
  }

  public async clearAllQuestionLogs(): Promise<void> {
    const prevLogs = [...this.questionLogs];
    const ids = this.questionLogs.map((q) => q.id);
    this.questionLogs = [];
    this.persistQuestionLogsLocal();
    this.notify();
    await this.runCloudWrite(
      async () => {
        for (let i = 0; i < ids.length; i += 100) {
          const res = await this.deleteRowsVerified('question_logs', ids.slice(i, i + 100));
          if (res.error) return res;
        }
        return { error: null };
      },
      () => {
        this.questionLogs = prevLogs;
        this.persistQuestionLogsLocal();
      },
      'Soru kayıtları silinemedi'
    );
  }

  public seedInitialQuestionLogs(): void {
    // Soru sayıları otomatik yüklenmez; kullanıcıların ve öğrencilerin kendi girdiği gerçek kayıtlar tutulur.
  }

  // --- WEEKLY & CUSTOM QUESTION TARGETS (ÖĞRENCİ VE SINIF SORU HEDEFLERİ) ---
  public getWeeklyQuestionTargets(): WeeklyQuestionTarget[] {
    const session = this.getAuthSession();
    if (session?.role === 'student') {
      return this.weeklyQuestionTargets.filter((t) => t.studentId === session.user.id);
    }
    if (session?.role === 'teacher') {
      const teacher = this.getCurrentTeacher();
      if (this.isTeacherAdmin(teacher)) {
        return [...this.weeklyQuestionTargets];
      }
      const visibleStudentIds = new Set(this.getStudents(teacher?.id).map((s) => s.id));
      const visibleClassIds = new Set(this.getClasses().map((c) => c.id));
      return this.weeklyQuestionTargets.filter(
        (t) => (t.studentId && visibleStudentIds.has(t.studentId)) || (t.classId && visibleClassIds.has(t.classId))
      );
    }
    return [...this.weeklyQuestionTargets];
  }

  public getStudentQuestionTargets(): WeeklyQuestionTarget[] {
    return this.getWeeklyQuestionTargets().filter((t) => t.targetType !== 'class' && !!t.studentId);
  }

  public getClassQuestionTargets(): WeeklyQuestionTarget[] {
    return this.weeklyQuestionTargets.filter((t) => t.targetType === 'class' || (!!t.classId && !t.studentId));
  }

  public getClassQuestionTarget(classId: string, weekStartDate?: string): WeeklyQuestionTarget | null {
    if (weekStartDate) {
      const match = this.weeklyQuestionTargets.find(
        (t) => (t.targetType === 'class' || (!t.studentId && !!t.classId)) && t.classId === classId && t.weekStartDate === weekStartDate
      );
      if (match) return match;
    }
    return (
      this.weeklyQuestionTargets.find(
        (t) => (t.targetType === 'class' || (!t.studentId && !!t.classId)) && t.classId === classId
      ) || null
    );
  }

  public getWeeklyQuestionTarget(studentId: string, weekStartDate?: string): WeeklyQuestionTarget | null {
    if (weekStartDate) {
      const match = this.weeklyQuestionTargets.find(
        (t) => t.studentId === studentId && t.weekStartDate === weekStartDate
      );
      if (match) return match;
    }
    return this.weeklyQuestionTargets.find((t) => t.studentId === studentId) || null;
  }

  // Hedefi yerel listeye işler (aynı öğrenci/sınıf + aynı hafta varsa onu günceller) ve kaydedilecek hâlini döndürür.
  private applyQuestionTargetLocally(target: WeeklyQuestionTarget): WeeklyQuestionTarget {
    const isClassTarget = this.isClassQuestionTarget(target);

    const existingIdx = this.weeklyQuestionTargets.findIndex((t) => {
      if (isClassTarget) {
        if (t.classId !== target.classId || !this.isClassQuestionTarget(t)) return false;
        if (target.weekStartDate && t.weekStartDate) {
          return t.weekStartDate === target.weekStartDate;
        }
        return true;
      }
      if (this.isClassQuestionTarget(t) || t.studentId !== target.studentId) return false;
      if (target.weekStartDate && t.weekStartDate) {
        return t.weekStartDate === target.weekStartDate;
      }
      return true;
    });

    const days = target.targetDays && target.targetDays > 0 ? target.targetDays : 7;
    const targetQ = target.targetQuestions || target.weeklyTarget || 350;
    const dailyQ = target.dailyTarget || Math.max(1, Math.round(targetQ / days));

    const normalizedTarget: WeeklyQuestionTarget = {
      ...target,
      targetType: isClassTarget ? 'class' : 'student',
      targetDays: days,
      targetPeriodLabel:
        target.targetPeriodLabel ||
        (days === 7 ? 'Haftalık (7 Gün)' : days === 1 ? '1 Günlük' : `${days} Günlük`),
      targetQuestions: targetQ,
      weeklyTarget: targetQ,
      dailyTarget: dailyQ,
    };

    let savedTarget: WeeklyQuestionTarget;
    if (existingIdx !== -1) {
      savedTarget = {
        ...this.weeklyQuestionTargets[existingIdx],
        ...normalizedTarget,
        id: this.weeklyQuestionTargets[existingIdx].id || normalizedTarget.id,
        assignedDate: target.assignedDate || new Date().toISOString(),
      };
      this.weeklyQuestionTargets = this.weeklyQuestionTargets.map((t, i) => (i === existingIdx ? savedTarget : t));
    } else {
      const generatedId = isClassTarget
        ? `class_target_${target.classId}_${target.weekStartDate || Date.now()}`
        : target.id || `target-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      savedTarget = {
        ...normalizedTarget,
        id: generatedId,
        assignedDate: target.assignedDate || new Date().toISOString(),
      };
      this.weeklyQuestionTargets = [savedTarget, ...this.weeklyQuestionTargets];
    }
    if (!savedTarget.id) {
      savedTarget.id = `target-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    }
    return savedTarget;
  }

  private async persistQuestionTargets(
    targets: WeeklyQuestionTarget[],
    prevTargets: WeeklyQuestionTarget[],
    userMessage: string
  ): Promise<void> {
    saveData(STORAGE_KEYS.WEEKLY_QUESTION_TARGETS, this.weeklyQuestionTargets);
    this.notify();
    await this.runCloudWrite(
      () =>
        supabase
          .from('question_targets')
          .upsert(targets.map((t) => this.questionTargetToRow(t)), { onConflict: 'id' }),
      () => {
        this.weeklyQuestionTargets = prevTargets;
        saveData(STORAGE_KEYS.WEEKLY_QUESTION_TARGETS, this.weeklyQuestionTargets);
      },
      userMessage
    );
  }

  public async setWeeklyQuestionTarget(target: WeeklyQuestionTarget): Promise<WeeklyQuestionTarget> {
    const prevTargets = [...this.weeklyQuestionTargets];
    const savedTarget = this.applyQuestionTargetLocally(target);
    await this.persistQuestionTargets([savedTarget], prevTargets, 'Soru hedefi kaydedilemedi');
    return savedTarget;
  }

  public async setClassQuestionTarget(
    classId: string,
    className: string,
    targetData: Partial<WeeklyQuestionTarget>,
    applyToStudents: boolean = true
  ): Promise<WeeklyQuestionTarget> {
    const days = targetData.targetDays && targetData.targetDays > 0 ? targetData.targetDays : 7;
    const targetQ = targetData.targetQuestions || targetData.weeklyTarget || 350;
    const dailyQ = targetData.dailyTarget || Math.max(1, Math.round(targetQ / days));
    const periodLabel =
      targetData.targetPeriodLabel ||
      (days === 7 ? 'Haftalık (7 Gün)' : days === 1 ? '1 Günlük' : `${days} Günlük`);
    const nowIso = new Date().toISOString();

    const prevTargets = [...this.weeklyQuestionTargets];

    // 1. Sınıf hedefi
    const savedClassTarget = this.applyQuestionTargetLocally({
      ...targetData,
      id: `class_target_${classId}_${targetData.weekStartDate || Date.now()}`,
      targetType: 'class',
      studentId: undefined,
      classId,
      className,
      targetDays: days,
      targetPeriodLabel: periodLabel,
      targetQuestions: targetQ,
      weeklyTarget: targetQ,
      dailyTarget: dailyQ,
      assignedDate: nowIso,
    });
    const toSave: WeeklyQuestionTarget[] = [savedClassTarget];

    // 2. Sınıftaki öğrencilere de aynı hedef (tek seferde kaydedilir)
    if (applyToStudents) {
      this.students
        .filter((s) => s.classId === classId)
        .forEach((std) => {
          toSave.push(
            this.applyQuestionTargetLocally({
              ...targetData,
              id: `target_${std.id}_${targetData.weekStartDate || Date.now()}`,
              targetType: 'student',
              studentId: std.id,
              studentName: std.name,
              classId,
              className,
              targetDays: days,
              targetPeriodLabel: periodLabel,
              targetQuestions: targetQ,
              weeklyTarget: targetQ,
              dailyTarget: dailyQ,
              assignedDate: nowIso,
            })
          );
        });
    }

    await this.persistQuestionTargets(toSave, prevTargets, 'Sınıf soru hedefi kaydedilemedi');
    return savedClassTarget;
  }

  private async removeQuestionTargets(
    shouldRemove: (t: WeeklyQuestionTarget) => boolean,
    userMessage: string
  ): Promise<void> {
    const prevTargets = [...this.weeklyQuestionTargets];
    const removed = this.weeklyQuestionTargets.filter(shouldRemove);
    if (removed.length === 0) return;
    this.weeklyQuestionTargets = this.weeklyQuestionTargets.filter((t) => !shouldRemove(t));
    saveData(STORAGE_KEYS.WEEKLY_QUESTION_TARGETS, this.weeklyQuestionTargets);
    this.notify();
    const ids = removed.map((t) => t.id).filter((id): id is string => !!id);
    await this.runCloudWrite(
      () => this.deleteRowsVerified('question_targets', ids),
      () => {
        this.weeklyQuestionTargets = prevTargets;
        saveData(STORAGE_KEYS.WEEKLY_QUESTION_TARGETS, this.weeklyQuestionTargets);
      },
      userMessage
    );
  }

  public async deleteClassQuestionTarget(classId: string, weekStartDate?: string): Promise<void> {
    await this.removeQuestionTargets((t) => {
      if (!this.isClassQuestionTarget(t) || t.classId !== classId) return false;
      if (weekStartDate && t.weekStartDate) return t.weekStartDate === weekStartDate;
      return true;
    }, 'Sınıf soru hedefi silinemedi');
  }

  // Öğrenci hedefini siler. Hafta verilirse yalnızca o haftanın hedefi silinir.
  public async deleteWeeklyQuestionTarget(studentIdOrId: string, weekStartDate?: string): Promise<void> {
    await this.removeQuestionTargets((t) => {
      if (t.id === studentIdOrId) return true;
      if (this.isClassQuestionTarget(t) || t.studentId !== studentIdOrId) return false;
      if (weekStartDate && t.weekStartDate) return t.weekStartDate === weekStartDate;
      return true;
    }, 'Soru hedefi silinemedi');
  }

  // =========================================================================
  // DERS BAZLI AÇILIR MENÜ (DROPDOWN) ETÜT ÖĞRETMENLERİ YÖNETİMİ
  // =========================================================================
  private static readonly AUTO_SEEDED_TEACHER_NAMES = new Set([
    'Gülderen Akgün',
    'Gül Deniz',
    'Tunahan Çetin',
    'Kemal onarıcı',
    'Kemal Onarıcı',
    'Cihan Baysal',
    'Tuğçe Özsoy',
    'Elif Şahin',
    'Zeynep Kaya',
    'Ahmet Yılmaz',
    'Murat Demir',
    'John Miller',
    'Sarah Jenkins',
    'Ali Demir',
    'Mehmet Öztürk',
    'Ayşe Yılmaz',
    'Öğretmen',
    'Sistem Öğretmeni',
    'Etüt Öğretmeni',
  ]);

  public getSubjectTeachersMap(): Record<string, string[]> {
    // Otomatik eklenen sahte ve önceden atanmış etüt öğretmenleri tamamen temizlendi
    const cleanedMap: Record<string, string[]> = {};

    try {
      const stored = localStorage.getItem('etut_subject_teachers_map');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object') {
          let wasModified = false;
          for (const [subj, teachers] of Object.entries(parsed)) {
            if (Array.isArray(teachers)) {
              const filtered = teachers.filter(
                (name) =>
                  typeof name === 'string' &&
                  name.trim() !== '' &&
                  !DataService.AUTO_SEEDED_TEACHER_NAMES.has(name.trim())
              );
              if (filtered.length !== teachers.length) {
                wasModified = true;
              }
              if (filtered.length > 0) {
                cleanedMap[subj] = Array.from(new Set(filtered));
              }
            }
          }
          if (wasModified) {
            localStorage.setItem('etut_subject_teachers_map', JSON.stringify(cleanedMap));
          }
          return cleanedMap;
        }
      }
    } catch {
      // fallback
    }
    return cleanedMap;
  }

  public getTeachersForSubject(subject: string): string[] {
    const map = this.getSubjectTeachersMap();
    const cleanSub = (subject || '').trim().toLowerCase();
    const resultTeachers: string[] = [];

    // 1. Kullanıcının daha önce bu ders için kaydettiği öğretmenler
    if (map[subject] && Array.isArray(map[subject])) {
      resultTeachers.push(...map[subject]);
    }
    const foundKey = Object.keys(map).find(
      (k) =>
        k.toLowerCase() === cleanSub ||
        cleanSub.includes(k.toLowerCase()) ||
        k.toLowerCase().includes(cleanSub)
    );
    if (foundKey && map[foundKey] && Array.isArray(map[foundKey])) {
      resultTeachers.push(...map[foundKey]);
    }

    // 2. Sistemde kayıtlı ve onaylanmış branş öğretmenleri
    if (this.teachers && this.teachers.length > 0) {
      this.teachers.forEach((t) => {
        if (!t.name || t.status === 'pending') return;
        const trimmed = t.name.trim();
        if (DataService.AUTO_SEEDED_TEACHER_NAMES.has(trimmed)) return;

        const tb = (t.branch || '').toLowerCase();
        if (!tb || tb === cleanSub || tb.includes(cleanSub) || cleanSub.includes(tb)) {
          resultTeachers.push(trimmed);
        }
      });
    }

    // 3. Oturum açmış olan öğretmen
    const session = this.getAuthSession();
    if (session?.role === 'teacher' && session.user?.name) {
      const tName = session.user.name.trim();
      if (!DataService.AUTO_SEEDED_TEACHER_NAMES.has(tName)) {
        resultTeachers.push(tName);
      }
    }

    // Tekilleştirme ve temizleme
    return Array.from(new Set(resultTeachers.filter((t) => t && !DataService.AUTO_SEEDED_TEACHER_NAMES.has(t))));
  }

  public getLastTeacherForSubject(subject: string): string {
    const cleanSub = (subject || '').trim().toLowerCase();
    try {
      const stored = localStorage.getItem(`etut_last_teacher_${cleanSub}`);
      if (stored && typeof stored === 'string') {
        const clean = stored.trim();
        if (clean && !DataService.AUTO_SEEDED_TEACHER_NAMES.has(clean)) {
          return clean;
        } else {
          localStorage.removeItem(`etut_last_teacher_${cleanSub}`);
        }
      }
    } catch {}
    const list = this.getTeachersForSubject(subject);
    return list.length > 0 ? list[0] : '';
  }

  public setLastTeacherForSubject(subject: string, teacherName: string): void {
    const clean = (teacherName || '').trim();
    if (!clean || DataService.AUTO_SEEDED_TEACHER_NAMES.has(clean)) return;
    const cleanSub = (subject || '').trim().toLowerCase();
    try {
      localStorage.setItem(`etut_last_teacher_${cleanSub}`, clean);
    } catch {}
  }

  public addTeacherToSubject(subject: string, teacherName: string): Record<string, string[]> {
    const cleanName = (teacherName || '').trim();
    if (!cleanName || DataService.AUTO_SEEDED_TEACHER_NAMES.has(cleanName)) {
      return this.getSubjectTeachersMap();
    }
    const map = this.getSubjectTeachersMap();
    const targetKey = subject.trim() || 'Genel';
    const list = map[targetKey] ? [...map[targetKey]] : [];
    if (!list.includes(cleanName)) {
      list.push(cleanName);
      map[targetKey] = list;
      try {
        localStorage.setItem('etut_subject_teachers_map', JSON.stringify(map));
      } catch {}
      this.setLastTeacherForSubject(targetKey, cleanName);
      this.notify();
    }
    return map;
  }

  public removeTeacherFromSubject(subject: string, teacherName: string): Record<string, string[]> {
    const map = this.getSubjectTeachersMap();
    const targetKey = subject.trim() || 'Genel';
    if (map[targetKey]) {
      map[targetKey] = map[targetKey].filter((t) => t !== teacherName);
      try {
        localStorage.setItem('etut_subject_teachers_map', JSON.stringify(map));
      } catch {}
      this.notify();
    }
    return map;
  }
}

export const dataService = DataService.getInstance();
