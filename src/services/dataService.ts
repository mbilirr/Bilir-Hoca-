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
  StudentNotification,
  SentEmailLog,
  StudentQuestionLog,
  WeeklyQuestionTarget,
  EtutStudentAttendance,
  UnifiedUser,
  SystemRole,
  UserStatus,
} from '../types';
import { supabase, invokeCreateUserEdgeFunction, clearPasswordRecovery } from '../lib/supabase';
import { INITIAL_TEACHER_DOCUMENTS } from '../data/initialDocuments';
import {
  generateHomeworkEmail,
  generateEtutEmail,
  generateStudentWelcomeEmail,
  formatDueDateTurkish,
  formatEtutDateTurkish,
} from '../lib/emailTemplates';
import { sendBrowserNotification, playNotificationChime } from '../lib/browserNotifications';
import { detectSchoolLevelFromGrade } from '../constants/schoolConstants';

// INITIAL SEED DATA (Empty by default per user request, only designated admin initialized)
export const INITIAL_CLASSES: ClassGroup[] = [];

export const INITIAL_STUDENTS: Student[] = [];

export const INITIAL_HOMEWORK: Homework[] = [];

export const INITIAL_SUBMISSIONS: HomeworkSubmission[] = [];

export const INITIAL_ETUTS: Etut[] = [];

export const INITIAL_ATTENDANCE: AttendanceRecord[] = [];

export const INITIAL_GRADES: GradeRecord[] = [];

export const INITIAL_MESSAGES: StudentMessage[] = [];

export const INITIAL_TEACHERS: Teacher[] = [
  {
    id: 'teacher-1',
    name: 'Mustafa Bilir',
    username: 'Mustafa Bilir',
    email: 'm.bilirr@gmail.com',
    branch: 'Fen Bilgisi Öğretmeni',
    avatar: 'https://images.unsplash.com/photo-1568602471122-7832951cc4c5?w=150&auto=format&fit=crop&q=80',
    createdAt: '2025-09-01T08:00:00.000Z',
    role: 'teacher',
    status: 'approved',
    isAdmin: true,
    assignedClassIds: [],
  },
];

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

  private studentRealtimeChannel: any = null;
  private classRealtimeChannel: any = null;
  private etutRealtimeChannel: any = null;
  private homeworkRealtimeChannel: any = null;
  private attendanceRealtimeChannel: any = null;
  private gradeRealtimeChannel: any = null;
  private messageRealtimeChannel: any = null;
  private syncPollInterval: number | null = null;
  private classSyncInterval: number | null = null;

  private listeners: (() => void)[] = [];
  private lastSyncTimestamp: number = Date.now();
  private sessionDeviceId: string = '';

  private constructor() {
    this.purgeSavedPasswords();
    this.initData();
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
      this.documents = loadDataWithLegacyFallback(STORAGE_KEYS.DOCUMENTS, []);
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
          if (t.isAdmin || t.id === 'teacher-1' || t.username?.toLowerCase() === 'mustafa bilir') {
            const adminData = localStorage.getItem('edu_sys_teacher_custom_profile_admin');
            if (adminData) {
              const parsed = JSON.parse(adminData);
              return { ...t, ...parsed };
            }
          }
        } catch {
          // ignore
        }
        return t;
      });

      // Migration: Ensure the designated administrator 'Mustafa Bilir' is configured as admin without overriding custom profile changes
      let adminFound = false;
      this.teachers = this.teachers.map((t) => {
        const isTargetAdmin =
          t.username.toLowerCase() === 'mustafa bilir' ||
          t.username.toLowerCase() === 'mustafabilir' ||
          t.username.toLowerCase() === 'mbilir' ||
          t.name.toLowerCase() === 'mustafa bilir' ||
          t.id === 'teacher-1' ||
          (t.email && t.email.toLowerCase() === 'm.bilirr@gmail.com');

        if (isTargetAdmin) {
          adminFound = true;
          // If branch is still the old default "Matematik & Fen Bilimleri" or "Genel Branş", migrate it to "Fen Bilgisi Öğretmeni"
          let branchToUse = t.branch;
          if (!branchToUse || branchToUse === 'Matematik & Fen Bilimleri' || branchToUse === 'Genel Branş') {
            branchToUse = 'Fen Bilgisi Öğretmeni';
          }
          return {
            ...t,
            name: t.name || 'Mustafa Bilir',
            username: t.username || 'Mustafa Bilir',
            email: t.email || 'm.bilirr@gmail.com',
            branch: branchToUse,
            isAdmin: true,
            status: 'approved' as const,
            assignedClassIds: t.assignedClassIds?.length ? t.assignedClassIds : this.classes.map((c) => c.id),
          };
        }

        // Other teachers must NOT automatically be administrators unless explicitly granted admin rights
        return {
          ...t,
          isAdmin: t.isAdmin === true && t.status === 'approved' ? true : false,
          assignedClassIds: t.assignedClassIds || [],
        };
      });

      if (!adminFound) {
        const primaryAdmin: Teacher = {
          id: 'teacher-1',
          name: 'Mustafa Bilir',
          username: 'Mustafa Bilir',
          email: 'm.bilirr@gmail.com',
          branch: 'Fen Bilgisi Öğretmeni',
          avatar: 'https://images.unsplash.com/photo-1568602471122-7832951cc4c5?w=150&auto=format&fit=crop&q=80',
          createdAt: '2025-09-01T08:00:00.000Z',
          role: 'teacher',
          status: 'approved',
          isAdmin: true,
          assignedClassIds: this.classes.map((c) => c.id),
        };
        this.teachers.unshift(primaryAdmin);
      }

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
      if (updated.password === '54321' && updated.mustChangePassword === undefined) {
        updated.mustChangePassword = true;
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
        this.revalidateAndSyncAll(true);
      });
      window.addEventListener('focus', () => {
        this.revalidateAndSyncAll(true);
      });
    }
  }

  public setupAllRealtimeSync(): void {
    this.setupStudentsRealtimeSync();
    this.setupClassesRealtimeSync();
    this.setupEtutsRealtimeSync();
    this.setupHomeworksRealtimeSync();
    this.setupAttendanceRealtimeSync();
    this.setupGradesRealtimeSync();
    this.setupMessagesRealtimeSync();
    this.startPeriodicSync();
  }

  public unsubscribeAllRealtime(): void {
    const channels = [
      this.studentRealtimeChannel,
      this.classRealtimeChannel,
      this.etutRealtimeChannel,
      this.homeworkRealtimeChannel,
      this.attendanceRealtimeChannel,
      this.gradeRealtimeChannel,
      this.messageRealtimeChannel,
    ];
    channels.forEach((ch) => {
      if (ch) {
        try { supabase.removeChannel(ch); } catch {}
      }
    });
    this.studentRealtimeChannel = null;
    this.classRealtimeChannel = null;
    this.etutRealtimeChannel = null;
    this.homeworkRealtimeChannel = null;
    this.attendanceRealtimeChannel = null;
    this.gradeRealtimeChannel = null;
    this.messageRealtimeChannel = null;

    if (this.syncPollInterval) {
      clearInterval(this.syncPollInterval);
      this.syncPollInterval = null;
    }
  }

  public startPeriodicSync(): void {
    if (this.syncPollInterval) return;
    if (typeof window !== 'undefined') {
      // Arka plan otomatik tazeleme: 30 saniyede bir hafif kontrol
      this.syncPollInterval = window.setInterval(() => {
        this.revalidateAndSyncAll(true);
      }, 30000);
    }
  }

  // --- 1. STUDENT REALTIME LISTENER ---
  public setupStudentsRealtimeSync(): void {
    try {
      if (this.studentRealtimeChannel) {
        try { supabase.removeChannel(this.studentRealtimeChannel); } catch {}
        this.studentRealtimeChannel = null;
      }
      this.studentRealtimeChannel = supabase
        .channel(`students-sync-${Date.now()}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'students' },
          (payload) => {
            this.handleRemoteStudentRealtimeEvent(payload);
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            this.syncStudentsFromSupabase(true);
          }
        });
    } catch (e) {
      console.warn('Realtime channel subscribe error for students:', e);
    }
  }

  // --- 2. ETUT REALTIME LISTENER ---
  public setupEtutsRealtimeSync(): void {
    try {
      if (this.etutRealtimeChannel) {
        try { supabase.removeChannel(this.etutRealtimeChannel); } catch {}
        this.etutRealtimeChannel = null;
      }
      this.etutRealtimeChannel = supabase
        .channel(`etuts-sync-${Date.now()}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'etuts' },
          (payload) => {
            this.handleRemoteEtutRealtimeEvent(payload);
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            this.syncEtutsFromSupabase(true);
          }
        });
    } catch (e) {
      console.warn('Realtime channel subscribe error for etuts:', e);
    }
  }

  // --- 3. HOMEWORK & SYSTEM PAYLOADS REALTIME LISTENER ---
  public setupHomeworksRealtimeSync(): void {
    try {
      if (this.homeworkRealtimeChannel) {
        try { supabase.removeChannel(this.homeworkRealtimeChannel); } catch {}
        this.homeworkRealtimeChannel = null;
      }
      this.homeworkRealtimeChannel = supabase
        .channel(`homeworks-sync-${Date.now()}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'homeworks' },
          (payload) => {
            this.handleRemoteHomeworkRealtimeEvent(payload);
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            this.syncHomeworksFromSupabase(true);
          }
        });
    } catch (e) {
      console.warn('Realtime channel subscribe error for homeworks:', e);
    }
  }

  // --- 4. ATTENDANCE REALTIME LISTENER ---
  public setupAttendanceRealtimeSync(): void {
    try {
      if (this.attendanceRealtimeChannel) {
        try { supabase.removeChannel(this.attendanceRealtimeChannel); } catch {}
        this.attendanceRealtimeChannel = null;
      }
      this.attendanceRealtimeChannel = supabase
        .channel(`attendance-sync-${Date.now()}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'attendance' },
          (payload) => {
            this.handleRemoteAttendanceRealtimeEvent(payload);
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            this.syncAttendanceFromSupabase(true);
          }
        });
    } catch (e) {
      console.warn('Realtime channel subscribe error for attendance:', e);
    }
  }

  // --- 5. GRADES REALTIME LISTENER ---
  public setupGradesRealtimeSync(): void {
    try {
      if (this.gradeRealtimeChannel) {
        try { supabase.removeChannel(this.gradeRealtimeChannel); } catch {}
        this.gradeRealtimeChannel = null;
      }
      this.gradeRealtimeChannel = supabase
        .channel(`grades-sync-${Date.now()}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'grades' },
          (payload) => {
            this.handleRemoteGradeRealtimeEvent(payload);
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            this.syncGradesFromSupabase(true);
          }
        });
    } catch (e) {
      console.warn('Realtime channel subscribe error for grades:', e);
    }
  }

  // --- 6. MESSAGES REALTIME LISTENER ---
  public setupMessagesRealtimeSync(): void {
    try {
      if (this.messageRealtimeChannel) {
        try { supabase.removeChannel(this.messageRealtimeChannel); } catch {}
        this.messageRealtimeChannel = null;
      }
      this.messageRealtimeChannel = supabase
        .channel(`messages-sync-${Date.now()}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'messages' },
          (payload) => {
            this.handleRemoteMessageRealtimeEvent(payload);
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            this.syncMessagesFromSupabase(true);
          }
        });
    } catch (e) {
      console.warn('Realtime channel subscribe error for messages:', e);
    }
  }

  public setupTeachersRealtimeSync() {
    this.setupHomeworksRealtimeSync();
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
          password: row.password || '54321',
          mustChangePassword: true,
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

  // --- REAL-TIME CLASS SYNC (MULTI-DEVICE INSTANT SYNC) ---
  public setupClassesRealtimeSync() {
    try {
      if (this.classRealtimeChannel) {
        try { supabase.removeChannel(this.classRealtimeChannel); } catch {}
        this.classRealtimeChannel = null;
      }
      this.classRealtimeChannel = supabase
        .channel(`classes-sync-${Date.now()}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'classes' },
          (payload) => {
            this.handleRemoteClassRealtimeEvent(payload);
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            this.syncClassesFromSupabase(true);
          }
        });
    } catch (e) {
      console.warn('Realtime channel subscribe error for classes:', e);
    }
  }

  public startPeriodicClassesSync() {
    if (this.classSyncInterval) return;
    if (typeof window !== 'undefined') {
      this.classSyncInterval = window.setInterval(() => {
        this.syncClassesFromSupabase(true);
      }, 4000);
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

  public reconnectAllRealtime() {
    this.unsubscribeAllRealtime();
    this.setupAllRealtimeSync();
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
        teacherId: parsedMeta.teacherId || 'teacher-1',
        teacherName: parsedMeta.teacherName || 'Öğretmen',
        teacherBranch: parsedMeta.teacherBranch || '',
        lessonPeriod: parsedMeta.lessonPeriod || 'Ders',
        gradeLevel: parsedMeta.gradeLevel,
        schoolLevel: parsedMeta.schoolLevel,
        studentAttendance: parsedMeta.studentAttendance || {},
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
  public handleRemoteHomeworkRealtimeEvent(payload: any) {
    try {
      const eventType = payload.eventType; // 'INSERT' | 'UPDATE' | 'DELETE'
      if (eventType === 'DELETE') {
        const oldRow = payload.old;
        if (oldRow?.id) {
          this.deletedHomeworkIds.add(oldRow.id);
          saveData(STORAGE_KEYS.DELETED_HOMEWORK, Array.from(this.deletedHomeworkIds));
          this.homeworks = this.homeworks.filter((h) => h.id !== oldRow.id);
          this.submissions = this.submissions.filter((s) => s.homeworkId !== oldRow.id);
          saveData(STORAGE_KEYS.HOMEWORK, this.homeworks);
          saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);
          this.notify();
        }
        return;
      }

      const row = payload.new;
      if (!row || !row.id) return;

      // Check system payloads
      if (row.id === '__system_sync_question_logs__') {
        this.handleRemoteQuestionLogsPayload(row.description);
        return;
      }
      if (row.id === '__system_sync_question_targets__') {
        this.handleRemoteQuestionTargetsPayload(row.description);
        return;
      }
      if (row.id === '__system_sync_documents__') {
        try {
          const parsed = JSON.parse(row.description);
          if (Array.isArray(parsed)) {
            this.documents = parsed;
            saveData(STORAGE_KEYS.DOCUMENTS, this.documents);
            this.notify();
          }
        } catch {}
        return;
      }
      if (row.id === '__system_sync_tombstones__') {
        this.handleRemoteTombstonesPayload(row.description);
        return;
      }
      if (typeof row.id === 'string' && row.id.startsWith('__system_sync_')) {
        return;
      }

      if (this.deletedHomeworkIds.has(row.id)) return;

      let assignedTo: 'all' | string[] = 'all';
      if (row.assigned_to) {
        if (row.assigned_to === 'all') {
          assignedTo = 'all';
        } else if (typeof row.assigned_to === 'string' && row.assigned_to.startsWith('[')) {
          try {
            assignedTo = JSON.parse(row.assigned_to);
          } catch {
            assignedTo = [row.assigned_to];
          }
        } else {
          assignedTo = [row.assigned_to];
        }
      }

      const mappedHw: Homework = {
        id: row.id,
        title: row.title || 'Ödev',
        description: row.description || '',
        subject: row.subject || 'Genel',
        learningOutcomes: Array.isArray(row.learning_outcomes) ? row.learning_outcomes : [],
        dueDate: row.due_date || new Date().toISOString(),
        createdAt: row.created_at || new Date().toISOString(),
        assignedDate: row.created_at || new Date().toISOString(),
        classId: row.class_id || (typeof assignedTo === 'string' && assignedTo !== 'all' ? assignedTo : 'class-default'),
        assignedTo,
        teacherId: row.teacher_id || 'teacher-1',
        teacherName: row.teacher_name || 'Öğretmen',
        submissions: Array.isArray(row.submissions) ? row.submissions : [],
      };

      if (Array.isArray(row.submissions) && row.submissions.length > 0) {
        row.submissions.forEach((sub: HomeworkSubmission) => {
          if (sub && sub.id) {
            const sIdx = this.submissions.findIndex((s) => s.id === sub.id);
            if (sIdx !== -1) {
              this.submissions[sIdx] = sub;
            } else {
              this.submissions.unshift(sub);
            }
          }
        });
        saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);
      }

      const exIdx = this.homeworks.findIndex((h) => h.id === row.id);
      if (exIdx !== -1) {
        this.homeworks[exIdx] = { ...this.homeworks[exIdx], ...mappedHw };
      } else {
        this.homeworks.unshift(mappedHw);
      }

      this.homeworks.sort(
        (a, b) =>
          new Date(b.createdAt || b.dueDate || 0).getTime() -
          new Date(a.createdAt || a.dueDate || 0).getTime()
      );
      saveData(STORAGE_KEYS.HOMEWORK, this.homeworks);
      this.notify();
    } catch (e) {
      console.warn('[HomeworkRealtime] Error:', e);
    }
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

      const student = this.students.find((s) => s.id === row.student_id);
      const grade: GradeRecord = {
        id: row.id,
        studentId: row.student_id,
        studentName: student?.name,
        classId: row.class_id,
        subject: row.subject,
        score: row.score,
        examType: row.exam_type || '1. Yazılı',
        date: row.date,
        remarks: row.remarks,
      };

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

  // --- QUESTION LOGS & TARGETS REALTIME DESERIALIZERS ---
  public handleRemoteQuestionLogsPayload(raw: string) {
    if (raw === undefined || raw === null) return;
    try {
      const remoteLogs: StudentQuestionLog[] = JSON.parse(raw);
      if (Array.isArray(remoteLogs)) {
        const remoteMap = new Map<string, StudentQuestionLog>();
        remoteLogs.forEach((rl) => {
          if (!this.deletedQuestionLogIds?.has(rl.id)) {
            remoteMap.set(rl.id, rl);
          }
        });

        // Retain only very recent unsaved local entries (< 15s old) that haven't been deleted
        const now = Date.now();
        const pendingLocal = this.questionLogs.filter((l) => {
          if (this.deletedQuestionLogIds?.has(l.id)) return false;
          if (remoteMap.has(l.id)) return false;
          const created = new Date(l.createdAt || l.date || 0).getTime();
          return now - created < 15000;
        });

        const merged = [...Array.from(remoteMap.values()), ...pendingLocal];
        merged.sort(
          (a, b) =>
            new Date(b.date || b.createdAt || 0).getTime() -
            new Date(a.date || a.createdAt || 0).getTime()
        );

        this.questionLogs = merged;
        saveData(STORAGE_KEYS.QUESTION_LOGS, this.questionLogs);
        try {
          localStorage.setItem(PERMANENT_KEYS.MASTER_QUESTION_LOGS, JSON.stringify(this.questionLogs));
        } catch {}
        this.notify();
      }
    } catch (e) {
      console.warn('[QuestionLogsRealtime] Error:', e);
    }
  }

  public handleRemoteQuestionTargetsPayload(raw: string) {
    if (!raw) return;
    try {
      const remoteTargets: WeeklyQuestionTarget[] = JSON.parse(raw);
      if (Array.isArray(remoteTargets) && remoteTargets.length > 0) {
        let changed = false;
        remoteTargets.forEach((rt) => {
          const exIdx = this.weeklyQuestionTargets.findIndex(
            (t) => t.id === rt.id || t.studentId === rt.studentId
          );
          if (exIdx === -1) {
            this.weeklyQuestionTargets.push(rt);
            changed = true;
          } else if (
            new Date(rt.assignedDate || 0).getTime() >=
            new Date(this.weeklyQuestionTargets[exIdx].assignedDate || 0).getTime()
          ) {
            this.weeklyQuestionTargets[exIdx] = rt;
            changed = true;
          }
        });
        if (changed) {
          saveData(STORAGE_KEYS.WEEKLY_QUESTION_TARGETS, this.weeklyQuestionTargets);
          this.notify();
        }
      }
    } catch {}
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
      });

      const cleanDate = etut.date ? etut.date.trim().split('T')[0] : '';

      const { error } = await supabase.from('etuts').upsert({
        id: etut.id,
        subject: etut.subject,
        topic: etut.topic,
        date: cleanDate,
        time: etut.time,
        duration: Number(etut.duration) || 45,
        location: etut.location || 'Derslik',
        assigned_student_ids: finalAssigned,
        notes: meta,
      });

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
            teacherId: parsedMeta.teacherId || 'teacher-1',
            teacherName: parsedMeta.teacherName || 'Öğretmen',
            teacherBranch: parsedMeta.teacherBranch || '',
            lessonPeriod: parsedMeta.lessonPeriod || 'Ders',
            gradeLevel: parsedMeta.gradeLevel,
            schoolLevel: parsedMeta.schoolLevel,
            studentAttendance: parsedMeta.studentAttendance || {},
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
  public async syncStudentsToCloud(onlyThese?: Student[]): Promise<{ success: boolean; error?: any }> {
    try {
      // Yalnızca değişen öğrencileri gönder. Tüm yerel listeyi göndermek, bu cihazda eski
      // (başka cihazdan silinmiş) öğrenci kopyaları varsa onları buluta geri yüklüyordu.
      const source = onlyThese ?? this.students;
      const activeStudents = source.filter((s) => s && s.id && !this.deletedStudentIds.has(s.id));

      // Individual student table upsert
      const payload = activeStudents.map((s) => ({
        id: s.id,
        name: s.name,
        student_number: s.studentNumber || '',
        class_id: s.classId || 'class-default',
        class_name: s.className || 'Genel',
        email: s.email || null,
        phone: s.phone || null,
        avatar: s.avatar || null,
        registered_at: s.createdAt || new Date().toISOString(),
      }));

      if (payload.length > 0) {
        const { error } = await supabase.from('students').upsert(payload);
        if (error) {
          console.warn('[StudentsSync] Error syncing students to cloud:', error);
          return { success: false, error };
        }
      }
      return { success: true };
    } catch (e) {
      console.warn('Error syncing students to cloud:', e);
      return { success: false, error: e };
    }
  }

  public async syncStudentToCloud(student: Student): Promise<{ success: boolean; error?: any }> {
    try {
      const payload = {
        id: student.id,
        name: student.name,
        student_number: student.studentNumber || '',
        class_id: student.classId || 'class-default',
        class_name: student.className || 'Genel',
        email: student.email || null,
        phone: student.phone || null,
        avatar: student.avatar || null,
        registered_at: student.createdAt || new Date().toISOString(),
      };

      const { error } = await supabase.from('students').upsert([payload]);
      if (error) {
        console.warn('[StudentSync] Error upserting student to cloud:', error);
        return { success: false, error };
      }
      return { success: true };
    } catch (e) {
      console.warn('[StudentSync] Exception syncing student to cloud:', e);
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
      const { error } = await supabase.from('students').delete().in('id', studentIds);
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

        if (existing) {
          const isLocalClassMoreSpecific =
            existing.classId &&
            existing.classId !== '' &&
            existing.classId !== 'class-default' &&
            existing.className &&
            existing.className !== 'Atanmadı' &&
            existing.className !== 'Genel';

          mergedStudentMap.set(id, {
            ...existing,
            name: rs.name || existing.name,
            studentNumber: rs.student_number || rs.studentNumber || existing.studentNumber,
            className: isLocalClassMoreSpecific ? existing.className : (rs.class_name || rs.className || existing.className),
            classId: isLocalClassMoreSpecific ? existing.classId : (rs.class_id || rs.classId || existing.classId),
            email: cleanRemoteEmail || existing.email,
            phone: rs.phone || existing.phone,
            avatar: rs.avatar || existing.avatar,
            schoolLevel: existing.schoolLevel || rs.schoolLevel || detectSchoolLevelFromGrade(rs.class_name || rs.className) || 'Ortaokul',
            gradeLevel: existing.gradeLevel || rs.gradeLevel,
            branch: existing.branch || rs.branch,
          });
        } else {
          mergedStudentMap.set(id, {
            id: rs.id,
            name: rs.name,
            username:
              rs.username ||
              rs.student_number ||
              cleanRemoteEmail?.split('@')[0] ||
              rs.name.toLowerCase().replace(/\s+/g, '_'),
            email: cleanRemoteEmail,
            password: rs.password || '54321',
            mustChangePassword: rs.mustChangePassword !== undefined ? rs.mustChangePassword : true,
            className: rs.class_name || rs.className || 'Genel',
            classId: rs.class_id || rs.classId || 'class-default',
            studentNumber: rs.student_number || rs.studentNumber || '',
            phone: rs.phone || '',
            avatar:
              rs.avatar ||
              `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(rs.name)}`,
            createdAt: rs.registered_at || rs.createdAt || new Date().toISOString(),
            status: 'active',
            createdTeacherId: rs.createdTeacherId || 'teacher-1',
            schoolLevel: rs.schoolLevel || detectSchoolLevelFromGrade(rs.class_name || rs.className) || 'Ortaokul',
            gradeLevel: rs.gradeLevel,
            branch: rs.branch,
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
        const subMap = new Map<string, HomeworkSubmission>();
        this.submissions.forEach((s) => subMap.set(s.id, s));

        remoteHws.forEach((rh: any) => {
          // Check for system sync payloads
          if (rh.id === '__system_sync_question_targets__') {
            this.handleRemoteQuestionTargetsPayload(rh.description);
            return;
          }
          if (rh.id === '__system_sync_question_logs__') {
            this.handleRemoteQuestionLogsPayload(rh.description);
            return;
          }
          if (rh.id === '__system_sync_tombstones__') {
            this.handleRemoteTombstonesPayload(rh.description);
            return;
          }
          if (
            rh.id === '__system_sync_teachers__' ||
            (typeof rh.id === 'string' && rh.id.startsWith('__teacher_sync_')) ||
            (typeof rh.id === 'string' && rh.id.startsWith('__system_sync_')) ||
            rh.subject === 'TeacherSync' ||
            rh.subject === 'SystemSync'
          ) {
            return;
          }

          if (this.deletedHomeworkIds.has(rh.id)) return;

          // Process embedded submissions
          if (Array.isArray(rh.submissions)) {
            rh.submissions.forEach((sub: HomeworkSubmission) => {
              if (sub && sub.id) subMap.set(sub.id, sub);
            });
          }

          let assignedTo: 'all' | string[] = 'all';
          if (rh.assigned_to) {
            if (rh.assigned_to === 'all') {
              assignedTo = 'all';
            } else if (typeof rh.assigned_to === 'string' && rh.assigned_to.startsWith('[')) {
              try {
                assignedTo = JSON.parse(rh.assigned_to);
              } catch {
                assignedTo = [rh.assigned_to];
              }
            } else {
              assignedTo = [rh.assigned_to];
            }
          }

          validHws.push({
            id: rh.id,
            title: rh.title || 'Ödev',
            description: rh.description || '',
            subject: rh.subject || 'Genel',
            learningOutcomes: Array.isArray(rh.learning_outcomes) ? rh.learning_outcomes : [],
            dueDate: rh.due_date || new Date().toISOString(),
            createdAt: rh.created_at || new Date().toISOString(),
            assignedDate: rh.created_at || new Date().toISOString(),
            classId: rh.class_id || (typeof assignedTo === 'string' && assignedTo !== 'all' ? assignedTo : 'class-default'),
            assignedTo,
            teacherId: rh.teacher_id || 'teacher-1',
            teacherName: rh.teacher_name || 'Öğretmen',
            submissions: Array.isArray(rh.submissions) ? rh.submissions : [],
          });
        });

        validHws.sort(
          (a, b) =>
            new Date(b.createdAt || b.dueDate || 0).getTime() -
            new Date(a.createdAt || a.dueDate || 0).getTime()
        );

        this.homeworks = validHws;
        this.submissions = Array.from(subMap.values());
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
        this.grades = remoteGrades.map((rg: any) => {
          const student = this.students.find((s) => s.id === rg.student_id);
          return {
            id: rg.id,
            studentId: rg.student_id,
            studentName: student?.name,
            classId: rg.class_id,
            subject: rg.subject,
            score: rg.score,
            examType: rg.exam_type || '1. Yazılı',
            date: rg.date,
            remarks: rg.remarks,
          };
        });

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
    // Gerçek (Supabase Auth) oturum yoksa buluttan okuma yapma: RLS boş liste döndürür
    // ve yerel veriler yanlışlıkla silinmiş gibi görünür.
    if (!(await this.hasCloudSession())) return;
    try {
      const { data: rows, error } = await supabase
        .from('homeworks')
        .select('id, description, subject')
        .in('id', ['__system_sync_question_logs__', '__system_sync_question_targets__']);

      if (error) {
        if (!isBackground) console.warn('[QuestionLogsSync] Error:', error);
        return;
      }

      if (rows && Array.isArray(rows)) {
        rows.forEach((r) => {
          if (r.id === '__system_sync_question_logs__') {
            this.handleRemoteQuestionLogsPayload(r.description);
          } else if (r.id === '__system_sync_question_targets__') {
            this.handleRemoteQuestionTargetsPayload(r.description);
          }
        });
      }
    } catch (e) {
      if (!isBackground) console.warn('[QuestionLogsSync] Exception:', e);
    }
  }

  public async syncTeacherDocumentsFromSupabase(isBackground = false): Promise<TeacherDocument[]> {
    // Gerçek (Supabase Auth) oturum yoksa buluttan okuma yapma: RLS boş liste döndürür
    // ve yerel veriler yanlışlıkla silinmiş gibi görünür.
    if (!(await this.hasCloudSession())) return this.documents;
    try {
      const { data: rows, error } = await supabase
        .from('homeworks')
        .select('description')
        .eq('id', '__system_sync_documents__');

      if (error) {
        if (!isBackground) console.warn('[DocumentsSync] Error:', error);
        return this.documents;
      }

      if (rows && rows.length > 0 && rows[0]?.description) {
        try {
          const parsed = JSON.parse(rows[0].description);
          if (Array.isArray(parsed)) {
            this.documents = parsed;
            saveData(STORAGE_KEYS.DOCUMENTS, this.documents);
            this.notify();
          }
        } catch {}
      }
      return this.documents;
    } catch (e) {
      if (!isBackground) console.warn('[DocumentsSync] Exception:', e);
      return this.documents;
    }
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

  public async revalidateAndSyncAll(isBackground = false): Promise<void> {
    try {
      this.setupAllRealtimeSync();
      await Promise.allSettled([
        this.syncTombstonesFromCloud(),
        this.syncClassesFromSupabase(isBackground),
        this.syncStudentsFromSupabase(isBackground),
        this.syncEtutsFromSupabase(isBackground),
        this.syncHomeworksFromSupabase(isBackground),
        this.syncAttendanceFromSupabase(isBackground),
        this.syncGradesFromSupabase(isBackground),
        this.syncMessagesFromSupabase(isBackground),
        this.syncQuestionLogsAndTargetsFromSupabase(isBackground),
        this.syncTeacherDocumentsFromSupabase(isBackground),
        this.syncTeachersFromSupabase(isBackground),
      ]);
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

  public isTeacherAdmin(teacher?: Teacher | null): boolean {
    if (!teacher) return false;
    return Boolean(
      teacher.isAdmin ||
      teacher.id === 'teacher-1' ||
      teacher.username?.toLowerCase() === 'mustafa bilir' ||
      teacher.name?.toLowerCase() === 'mustafa bilir' ||
      teacher.email?.toLowerCase() === 'm.bilirr@gmail.com'
    );
  }

  public isCurrentUserAdmin(): boolean {
    const session = this.getAuthSession();
    if (!session) return false;
    if (session.role !== 'teacher') return false;
    const currentTeacher = this.getCurrentTeacher();
    return this.isTeacherAdmin(currentTeacher) || this.isTeacherAdmin(session.user as Teacher);
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
      const isAdmin =
        !!t.isAdmin ||
        t.id === 'teacher-1' ||
        t.username?.toLowerCase() === 'mustafa bilir' ||
        t.name?.toLowerCase() === 'mustafa bilir';
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

  public async adminChangeUserRole(
    userId: string,
    targetRole: SystemRole,
    options?: { branch?: string; className?: string; classId?: string }
  ): Promise<void> {
    // 1. Kullanıcı şu anda öğretmen veya admin mi?
    const teacher = this.teachers.find((t) => t.id === userId);
    if (teacher) {
      const isMustafaBilir =
        teacher.username?.toLowerCase() === 'mustafa bilir' ||
        teacher.name?.toLowerCase() === 'mustafa bilir' ||
        teacher.id === 'teacher-1';

      if (targetRole === 'admin') {
        teacher.isAdmin = true;
        teacher.status = 'approved';
        teacher.isSuspended = false;
        saveData(STORAGE_KEYS.TEACHERS, this.teachers);
        await this.syncTeacherToCloud(teacher);
        this.notify();
        return;
      }

      if (targetRole === 'teacher') {
        if (isMustafaBilir) {
          throw new Error('Baş yönetici Mustafa Bilir yetkisi kaldırılamaz.');
        }
        const adminCount = this.teachers.filter(
          (t) =>
            (t.isAdmin || t.id === 'teacher-1' || t.username?.toLowerCase() === 'mustafa bilir') &&
            !this.deletedTeacherIds.has(t.id) &&
            !t.isSuspended
        ).length;
        if (adminCount <= 1) {
          throw new Error('Sistemde en az 1 aktif yönetici (admin) bulunmalıdır.');
        }

        teacher.isAdmin = false;
        teacher.status = 'approved';
        saveData(STORAGE_KEYS.TEACHERS, this.teachers);
        await this.syncTeacherToCloud(teacher);
        this.notify();
        return;
      }

      if (targetRole === 'student') {
        if (isMustafaBilir) {
          throw new Error('Baş yönetici hesabı öğrenci rolüne çevrilemez.');
        }
        const adminCount = this.teachers.filter(
          (t) =>
            (t.isAdmin || t.id === 'teacher-1' || t.username?.toLowerCase() === 'mustafa bilir') &&
            !this.deletedTeacherIds.has(t.id) &&
            !t.isSuspended
        ).length;
        if (teacher.isAdmin && adminCount <= 1) {
          throw new Error('Sistemde tek yönetici kaldığı için bu hesap öğrenciye dönüştürülemez.');
        }

        // Öğretmenden öğrenci kaydı oluştur
        const targetClass = options?.classId
          ? this.classes.find((c) => c.id === options.classId)
          : this.classes[0];

        const newStudent: Student = {
          id: `std-${Date.now()}`,
          name: teacher.name,
          username: teacher.username,
          email: teacher.email,
          password: teacher.password || '54321',
          classId: targetClass?.id || 'class-default',
          className: targetClass?.name || 'Genel',
          phone: teacher.phone,
          avatar: teacher.avatar,
          createdAt: new Date().toISOString(),
          status: 'active',
          isSuspended: false,
          createdTeacherId: 'teacher-1',
          mustChangePassword: true,
        };

        this.students.unshift(newStudent);
        saveData(STORAGE_KEYS.STUDENTS, this.students);
        try {
          localStorage.setItem(PERMANENT_KEYS.MASTER_STUDENTS, JSON.stringify(this.students));
        } catch {}

        await supabase.from('students').upsert([
          {
            id: newStudent.id,
            name: newStudent.name,
            student_number: `${Math.floor(1000 + Math.random() * 9000)}`,
            class_id: newStudent.classId,
            class_name: newStudent.className,
            email: newStudent.email || null,
            phone: newStudent.phone || null,
            avatar: newStudent.avatar || null,
            registered_at: newStudent.createdAt,
          },
        ]);

        this.deleteTeacher(teacher.id);
        this.notify();
        return;
      }
    }

    // 2. Kullanıcı şu anda öğrenci mi?
    const student = this.students.find((s) => s.id === userId);
    if (student) {
      if (targetRole === 'admin' || targetRole === 'teacher') {
        const cleanEmail =
          student.email && student.email.includes('@')
            ? student.email
            : `${student.username.toLowerCase().replace(/[^a-z0-9]/g, '')}@egitim.com`;

        const newTeacher: Teacher = {
          id: `teacher-${Date.now()}`,
          name: student.name,
          username: student.username,
          email: cleanEmail,
          password: student.password || '123456',
          branch: options?.branch || (targetRole === 'admin' ? 'Kurum Yöneticisi' : 'Öğretmen'),
          phone: student.phone,
          avatar: student.avatar,
          createdAt: new Date().toISOString(),
          role: 'teacher',
          status: 'approved',
          isAdmin: targetRole === 'admin',
          assignedClassIds: targetRole === 'admin' ? this.classes.map((c) => c.id) : [],
          canViewAllStudentsAndClasses: targetRole === 'admin',
          isSuspended: false,
        };

        this.teachers.unshift(newTeacher);
        saveData(STORAGE_KEYS.TEACHERS, this.teachers);
        try {
          localStorage.setItem(PERMANENT_KEYS.MASTER_TEACHERS, JSON.stringify(this.teachers));
        } catch {}

        await this.syncTeacherToCloud(newTeacher);
        await this.deleteStudent(student.id);
        this.notify();
        return;
      }
    }

    throw new Error('Kullanıcı kaydı bulunamadı.');
  }

  public async adminUpdateUserProfile(
    userId: string,
    updates: Partial<UnifiedUser> & { newPassword?: string }
  ): Promise<void> {
    // 1. Öğretmen kontrolü
    const teacher = this.teachers.find((t) => t.id === userId);
    if (teacher) {
      const teacherUpdates: Partial<Teacher> = {};
      if (updates.name && updates.name.trim()) teacherUpdates.name = updates.name.trim();
      if (updates.username && updates.username.trim()) teacherUpdates.username = updates.username.trim();
      if (updates.email !== undefined) teacherUpdates.email = updates.email.trim();
      if (updates.phone !== undefined) teacherUpdates.phone = updates.phone.trim();
      if (updates.branch !== undefined) teacherUpdates.branch = updates.branch.trim();
      if (updates.avatar !== undefined) teacherUpdates.avatar = updates.avatar;
      if (updates.assignedClassIds !== undefined) teacherUpdates.assignedClassIds = updates.assignedClassIds;
      if (updates.canViewAllStudentsAndClasses !== undefined) teacherUpdates.canViewAllStudentsAndClasses = updates.canViewAllStudentsAndClasses;

      this.updateTeacherProfile(userId, teacherUpdates);

      // Admin şifre belirleme: gerçek giriş şifresi Supabase Auth üzerinde değiştirilir
      if (updates.newPassword && updates.newPassword.trim()) {
        try {
          await this.adminSetUserPassword('teacher', teacher, updates.newPassword.trim());
        } catch (err: any) {
          throw new Error(`Bilgiler kaydedildi ancak şifre belirlenemedi: ${err?.message || 'bilinmeyen hata'}`);
        }
      }
      return;
    }

    // 2. Öğrenci kontrolü
    const student = this.students.find((s) => s.id === userId);
    if (student) {
      const studentUpdates: Partial<Student> = {};
      if (updates.name && updates.name.trim()) studentUpdates.name = updates.name.trim();
      if (updates.username && updates.username.trim()) studentUpdates.username = updates.username.trim();
      if (updates.email !== undefined) studentUpdates.email = cleanStudentEmail(updates.email);
      if (updates.phone !== undefined) studentUpdates.phone = updates.phone.trim();
      if (updates.studentNumber !== undefined) studentUpdates.studentNumber = updates.studentNumber.trim();
      if (updates.avatar !== undefined) studentUpdates.avatar = updates.avatar;
      if (updates.classId !== undefined) {
        studentUpdates.classId = updates.classId;
        const cls = this.classes.find((c) => c.id === updates.classId);
        if (cls) studentUpdates.className = cls.name;
      } else if (updates.className !== undefined) {
        studentUpdates.className = updates.className;
      }
      if (updates.schoolLevel !== undefined) studentUpdates.schoolLevel = updates.schoolLevel;
      if (updates.gradeLevel !== undefined) studentUpdates.gradeLevel = updates.gradeLevel;
      if (updates.mustChangePassword !== undefined) studentUpdates.mustChangePassword = updates.mustChangePassword;

      await this.updateStudent(userId, studentUpdates);

      // Admin şifre belirleme: gerçek giriş şifresi Supabase Auth üzerinde değiştirilir (hesap yoksa oluşturulur)
      if (updates.newPassword && updates.newPassword.trim()) {
        try {
          await this.adminSetUserPassword('student', student, updates.newPassword.trim());
        } catch (err: any) {
          throw new Error(`Bilgiler kaydedildi ancak şifre belirlenemedi: ${err?.message || 'bilinmeyen hata'}`);
        }
      }
      return;
    }

    throw new Error('Güncellenecek kullanıcı kaydı bulunamadı.');
  }

  public async adminToggleUserSuspension(userId: string, suspend: boolean, reason?: string): Promise<void> {
    // 1. Öğretmen / Admin
    const teacher = this.teachers.find((t) => t.id === userId);
    if (teacher) {
      const isMustafaBilir =
        teacher.username?.toLowerCase() === 'mustafa bilir' ||
        teacher.name?.toLowerCase() === 'mustafa bilir' ||
        teacher.id === 'teacher-1';

      if (isMustafaBilir && suspend) {
        throw new Error('Baş yönetici Mustafa Bilir hesabı dondurulamaz / askıya alınamaz.');
      }

      teacher.isSuspended = suspend;
      teacher.status = suspend ? 'suspended' : 'approved';
      saveData(STORAGE_KEYS.TEACHERS, this.teachers);
      try {
        localStorage.setItem(PERMANENT_KEYS.MASTER_TEACHERS, JSON.stringify(this.teachers));
      } catch {}

      await this.syncTeacherToCloud(teacher);

      // Askıya alınan hesap şu an aktif oturumda ise oturumu sonlandır
      const currentSession = this.getAuthSession();
      if (currentSession?.role === 'teacher' && currentSession.user.id === userId && suspend) {
        this.logout();
      }

      this.notify();
      return;
    }

    // 2. Öğrenci
    const student = this.students.find((s) => s.id === userId);
    if (student) {
      student.isSuspended = suspend;
      student.status = suspend ? 'suspended' : 'active';
      saveData(STORAGE_KEYS.STUDENTS, this.students);
      try {
        localStorage.setItem(PERMANENT_KEYS.MASTER_STUDENTS, JSON.stringify(this.students));
      } catch {}

      await supabase
        .from('students')
        .update({
          // status field or sync timestamp
          phone: student.phone || null,
        })
        .eq('id', student.id);

      // Askıya alınan öğrenci şu an aktif oturumda ise oturumu sonlandır
      const currentSession = this.getAuthSession();
      if (currentSession?.role === 'student' && currentSession.user.id === userId && suspend) {
        this.logout();
      }

      this.notify();
      return;
    }

    throw new Error('Kullanıcı bulunamadı.');
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
      const isMustafaBilir =
        teacher.username?.toLowerCase() === 'mustafa bilir' ||
        teacher.name?.toLowerCase() === 'mustafa bilir' ||
        teacher.id === 'teacher-1';

      if (isMustafaBilir) {
        throw new Error('Baş yönetici Mustafa Bilir hesabı silinemez.');
      }

      const adminCount = this.teachers.filter(
        (t) =>
          (t.isAdmin || t.id === 'teacher-1' || t.username?.toLowerCase() === 'mustafa bilir') &&
          !this.deletedTeacherIds.has(t.id) &&
          !t.isSuspended
      ).length;
      if (teacher.isAdmin && adminCount <= 1) {
        throw new Error('Sistemde kalan son yönetici hesabı silinemez.');
      }

      this.deleteTeacher(userId);
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
    const newPass = tempPassword || `Egitim#${Math.floor(1000 + Math.random() * 9000)}!`;
    await this.adminUpdateUserProfile(userId, {
      newPassword: newPass,
      mustChangePassword: true,
    });
    return newPass;
  }

  public registerTeacher(data: {
    name: string;
    username: string;
    password?: string;
    email: string;
    branch?: string;
    avatar?: string;
  }): Teacher {
    const cleanUsername = data.username.trim();
    const cleanEmail = data.email.trim();

    const existing = this.teachers.find(
      (t) =>
        t.username.toLowerCase() === cleanUsername.toLowerCase() ||
        (cleanEmail && t.email.toLowerCase() === cleanEmail.toLowerCase())
    );

    if (existing) {
      throw new Error('Bu kullanıcı adı veya e-posta ile kayıtlı bir öğretmen zaten mevcut.');
    }

    if (!data.password || !data.password.trim()) {
      throw new Error('Lütfen geçerli bir şifre belirleyiniz.');
    }

    const newTeacher: Teacher = {
      id: `teacher-${Date.now()}`,
      name: data.name.trim(),
      username: cleanUsername,
      password: data.password.trim(),
      email: cleanEmail,
      branch: data.branch?.trim() || 'Genel Branş',
      avatar:
        data.avatar ||
        `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(data.name)}`,
      createdAt: new Date().toISOString(),
      role: 'teacher',
      status: 'pending', // YENİ KAYITLAR YÖNETİCİ ONAYI BEKLER
      isAdmin: false,
      assignedClassIds: [],
      canViewAllStudentsAndClasses: false,
    };

    this.teachers.unshift(newTeacher);
    saveData(STORAGE_KEYS.TEACHERS, this.teachers);
    try {
      localStorage.setItem(PERMANENT_KEYS.MASTER_TEACHERS, JSON.stringify(this.teachers));
    } catch {}

    // Cross-device cloud sync: immediately send to Supabase
    this.syncTeacherToCloud(newTeacher);

    // Yönetici onay bildirimi ve zil sesi gönder
    try {
      playNotificationChime();
      sendBrowserNotification(
        'Yeni Öğretmen Kayıt Başvurusu',
        `${newTeacher.name} (${newTeacher.branch || 'Öğretmen'}) sisteme kayıt oldu. Yönetici onayı bekliyor.`
      );
    } catch {
      // ignore
    }

    this.notify();
    return newTeacher;
  }

  public addApprovedTeacher(data: { name: string; branch: string; email?: string; phone?: string }): Teacher {
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

    const cleanEmail = data.email?.trim() || '';

    const newTeacher: Teacher = {
      id: `teacher-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: cleanName,
      username: cleanUsername,
      password: '123',
      email: cleanEmail,
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

  public updateTeacherProfile(teacherId: string, updates: Partial<Teacher>): Teacher {
    const idx = this.teachers.findIndex((t) => t.id === teacherId);
    if (idx === -1) {
      throw new Error('Öğretmen kaydı bulunamadı.');
    }
    const previousTeacher = this.teachers[idx];
    const updated = { ...previousTeacher, ...updates };
    this.teachers[idx] = updated;
    saveData(STORAGE_KEYS.TEACHERS, this.teachers);
    try {
      localStorage.setItem(PERMANENT_KEYS.MASTER_TEACHERS, JSON.stringify(this.teachers));
    } catch {}

    // Save dedicated teacher profile override to protect against storage quota issues or re-migrations
    try {
      localStorage.setItem(`edu_sys_teacher_custom_profile_${teacherId}`, JSON.stringify(updated));
      if (updated.isAdmin || teacherId === 'teacher-1' || updated.username?.toLowerCase() === 'mustafa bilir') {
        localStorage.setItem('edu_sys_teacher_custom_profile_admin', JSON.stringify(updated));
      }
    } catch (e) {
      console.warn('Could not write custom teacher profile override:', e);
    }

    // Oturumdaki kullanıcıyı da anında güncelle
    const currentSession = this.getAuthSession();
    if (
      currentSession?.role === 'teacher' &&
      (currentSession.user.id === teacherId ||
        currentSession.user.username?.toLowerCase() === previousTeacher.username?.toLowerCase() ||
        (currentSession.user as Teacher).email?.toLowerCase() === previousTeacher.email?.toLowerCase())
    ) {
      this.setAuthSession({
        role: 'teacher',
        user: updated,
      });
    }

    // "Beni Hatırla" (Remembered User) verisini de güncelle ki giriş sayfası ve kartta yeni bilgiler gözüksün
    const remembered = this.getRememberedUser();
    if (
      remembered &&
      remembered.role === 'teacher' &&
      (remembered.identifier.toLowerCase() === previousTeacher.username.toLowerCase() ||
        remembered.identifier.toLowerCase() === (previousTeacher.email || '').toLowerCase() ||
        remembered.name === previousTeacher.name)
    ) {
      this.setRememberedUser({
        ...remembered,
        name: updated.name,
        branch: updated.branch,
        avatar: updated.avatar,
        identifier: updated.username || remembered.identifier,
      });
    }

    this.syncTeacherToCloud(updated);
    this.notify();
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

    // 2) Yeni şifreyi Supabase'e yaz
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
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

  // Yönetici, bir öğretmen/öğrencinin giriş şifresini belirler (hesap yoksa oluşturulur).
  // İşlem 'create-user' sunucu fonksiyonu ile Supabase Auth üzerinde yapılır.
  private async adminSetUserPassword(
    type: 'teacher' | 'student',
    record: Teacher | Student,
    newPassword: string
  ): Promise<void> {
    if (newPassword.length < DataService.MIN_PASSWORD_LENGTH) {
      throw new Error(`Yeni şifre en az ${DataService.MIN_PASSWORD_LENGTH} karakter olmalıdır.`);
    }

    if (type === 'teacher') {
      const t = record as Teacher;
      const { data: sessionData } = await supabase.auth.getSession();
      const myAuthId = sessionData?.session?.user?.id;
      const isRealEmailAccount = (t.email || '').toLowerCase() === 'm.bilirr@gmail.com';
      if (isRealEmailAccount || (myAuthId && t.auth_user_id === myAuthId)) {
        throw new Error('Kendi şifrenizi buradan değil, profil menüsündeki "Şifre Değiştir" ekranından değiştiriniz.');
      }
    }

    const identifier =
      type === 'teacher'
        ? (record as Teacher).username || record.id
        : (record as Student).studentNumber?.trim() || record.id;

    const result = await invokeCreateUserEdgeFunction({
      type,
      id: record.id,
      identifier,
      name: record.name,
      password: newPassword,
    });

    // Supabase hesabının kimliğini yerel kayda işle
    if (result?.auth_user_id) {
      if (type === 'teacher') {
        this.teachers = this.teachers.map((t) =>
          t.id === record.id ? { ...t, auth_user_id: result.auth_user_id } : t
        );
        saveData(STORAGE_KEYS.TEACHERS, this.teachers);
      } else {
        this.students = this.students.map((s) =>
          s.id === record.id ? { ...s, auth_user_id: result.auth_user_id } : s
        );
        saveData(STORAGE_KEYS.STUDENTS, this.students);
      }
      this.notify();
    }
  }

  // --- CLOUD SYNCHRONIZATION FOR TEACHERS (DIRECT public.teachers TABLE) ---

  public async syncTeacherToCloud(teacher: Teacher): Promise<void> {
    try {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const authUserId =
        teacher.auth_user_id && uuidRegex.test(teacher.auth_user_id) ? teacher.auth_user_id : null;

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

      if (authUserId) {
        payload.auth_user_id = authUserId;
      }

      const { error } = await supabase.from('teachers').upsert(payload);
      if (error) {
        console.warn('[TeacherSync] Error syncing teacher to public.teachers:', error.message);
      }
    } catch (e: any) {
      console.warn('[TeacherSync] Exception syncing teacher to cloud:', e?.message || e);
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

  public async authenticateTeacher(usernameOrEmail: string, password: string): Promise<Teacher | null> {
    const term = usernameOrEmail.trim().toLowerCase();
    const cleanTerm = term.replace(/[^a-z0-9_-]/g, '');

    // E-posta ile giriş veya kayıtlı kullanıcı adından e-postayı dinamik çözümleme
    let emailToAuth = '';
    if (term.includes('@')) {
      emailToAuth = term;
    } else {
      const existingTeacher = this.teachers.find(
        (t) => t.username.toLowerCase() === term || t.id.toLowerCase() === term
      );
      if (existingTeacher && existingTeacher.email) {
        emailToAuth = existingTeacher.email.toLowerCase();
      } else {
        emailToAuth = `tch_${cleanTerm}@okul.internal.net`;
      }
    }

    try {
      // Giriş YALNIZCA Supabase Auth signInWithPassword üzerinden yapılır.
      // Sabit kodlanmış şifre, backdoor veya yerel fallback KESİNLİKLE YOKTUR.
      let { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: emailToAuth,
        password: password,
      });

      // İlk deneme başarısızsa hesabın standart (sistemin ürettiği) giriş adresiyle bir kez daha dene
      if ((authError || !authData?.user) && !term.includes('@')) {
        const matched = this.teachers.find(
          (t) => t.username.toLowerCase() === term || t.id.toLowerCase() === term
        );
        const canonical = matched ? this.canonicalAuthEmail('teacher', matched.username || matched.id) : '';
        if (canonical && canonical !== emailToAuth) {
          ({ data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: canonical,
            password: password,
          }));
        }
      }

      if (authError || !authData?.user) {
        console.warn('Supabase Auth error (teacher):', authError?.message || 'Giriş başarısız');
        return null;
      }

      // 1. Yetkilendirme & Rol Doğrulaması:
      // Sadece authData.user.app_metadata?.role === 'teacher' veya 'admin' ise devam et.
      // Eşleşme yoksa null döndür (bu hesap gerçek bir öğretmen/yönetici hesabı değildir).
      const appRole = authData.user.app_metadata?.role;
      const isAppAdmin =
        appRole === 'admin' ||
        authData.user.app_metadata?.is_admin === true;

      const isTeacherOrAdmin = appRole === 'teacher' || isAppAdmin;

      if (!isTeacherOrAdmin) {
        console.warn('Erişim engellendi: Kullanıcının app_metadata rolü öğretmen veya admin değil:', appRole);
        await supabase.auth.signOut();
        return null;
      }

      // 2. Doğrulanan kullanıcı için yerel öğretmen profilini eşleştir
      let teacher = this.teachers.find(
        (t) =>
          (t.auth_user_id && t.auth_user_id === authData.user.id) ||
          (t.email && t.email.toLowerCase() === authData.user.email?.toLowerCase()) ||
          t.username.toLowerCase() === term
      );

      if (!teacher) {
        teacher = {
          id: authData.user.user_metadata?.legacy_id || authData.user.id,
          auth_user_id: authData.user.id,
          name: authData.user.user_metadata?.name || usernameOrEmail,
          username: usernameOrEmail,
          email: authData.user.email || '',
          branch: 'Öğretmen',
          createdAt: authData.user.created_at,
          role: 'teacher',
          status: 'approved',
          isAdmin: isAppAdmin,
          assignedClassIds: [],
        };
        this.teachers.push(teacher);
      } else {
        if (!teacher.auth_user_id) {
          teacher.auth_user_id = authData.user.id;
        }
        teacher.isAdmin = isAppAdmin;
      }

      if (teacher.isSuspended || teacher.status === 'suspended') {
        await supabase.auth.signOut();
        throw new Error('Hesabınız sistem yöneticisi tarafından dondurulmuştur / askıya alınmıştır. Lütfen kurum yöneticiniz ile iletişime geçiniz.');
      }
      if (teacher.status === 'pending') {
        await supabase.auth.signOut();
        throw new Error('Hesabınız henüz kurum yöneticisi tarafından onaylanmamıştır. Onay verildikten sonra sisteme giriş yapabilirsiniz.');
      }
      if (teacher.status === 'rejected') {
        await supabase.auth.signOut();
        throw new Error('Hesap başvurunuz onaylanmamıştır. Lütfen kurum yöneticiniz ile iletişime geçiniz.');
      }

      return teacher;
    } catch (err: any) {
      if (
        err.message?.includes('dondurulmuştur') ||
        err.message?.includes('onaylanmamıştır') ||
        err.message?.includes('onaylanmamış')
      ) {
        throw err;
      }
      console.error('authenticateTeacher error:', err);
      return null;
    }
  }

  public async authenticateStudent(identifier: string, password: string): Promise<Student | null> {
    const term = identifier.trim().toLowerCase();
    const cleanTerm = term.replace(/[^a-z0-9_-]/g, '');

    let emailToAuth = '';
    if (term.includes('@')) {
      emailToAuth = term;
    } else {
      const existingStudent = this.students.find(
        (s) =>
          s.studentNumber?.toLowerCase() === term ||
          s.username.toLowerCase() === term ||
          s.id.toLowerCase() === term
      );
      if (existingStudent && existingStudent.email) {
        emailToAuth = existingStudent.email.toLowerCase();
      } else {
        emailToAuth = `std_${cleanTerm}@okul.internal.net`;
      }
    }

    try {
      // Giriş YALNIZCA Supabase Auth signInWithPassword üzerinden yapılır.
      // Sabit kodlanmış şifre, backdoor veya yerel fallback KESİNLİKLE YOKTUR.
      let { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: emailToAuth,
        password: password,
      });

      // İlk deneme başarısızsa öğrencinin standart giriş adresiyle (öğrenci no tabanlı) bir kez daha dene
      if ((authError || !authData?.user) && !term.includes('@')) {
        const matched = this.students.find(
          (s) =>
            s.studentNumber?.toLowerCase() === term ||
            s.username.toLowerCase() === term ||
            s.id.toLowerCase() === term
        );
        const canonical = matched
          ? this.canonicalAuthEmail('student', matched.studentNumber?.trim() || matched.id)
          : '';
        if (canonical && canonical !== emailToAuth) {
          ({ data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: canonical,
            password: password,
          }));
        }
      }

      if (authError || !authData?.user) {
        console.warn('Supabase Auth error (student):', authError?.message || 'Giriş başarısız');
        return null;
      }

      // Supabase Auth başarılı oldu; veritabanı / yerel öğrenci profilini eşleştir
      let student = this.students.find(
        (s) =>
          (s.auth_user_id && s.auth_user_id === authData.user.id) ||
          (s.email && s.email.toLowerCase() === authData.user.email?.toLowerCase()) ||
          s.username.toLowerCase() === term ||
          s.studentNumber?.toLowerCase() === term
      );

      if (!student) {
        student = {
          id: authData.user.user_metadata?.legacy_id || authData.user.id,
          auth_user_id: authData.user.id,
          name: authData.user.user_metadata?.name || identifier,
          studentNumber: identifier,
          username: identifier,
          classId: authData.user.user_metadata?.class_id || 'class-default',
          className: 'Genel',
          status: 'active',
          createdAt: authData.user.created_at,
        };
      } else if (!student.auth_user_id) {
        student.auth_user_id = authData.user.id;
      }

      if (student.isSuspended || student.status === 'suspended') {
        await supabase.auth.signOut();
        throw new Error('Hesabınız sistem yöneticisi tarafından dondurulmuştur / askıya alınmıştır. Lütfen kurum yöneticiniz veya öğretmeniniz ile iletişime geçiniz.');
      }

      return student;
    } catch (err: any) {
      if (err.message?.includes('dondurulmuştur')) {
        throw err;
      }
      console.error('authenticateStudent error:', err);
      return null;
    }
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
          } else if ((saved.user as Teacher).isAdmin || saved.user.id === 'teacher-1' || (saved.user as Teacher).username?.toLowerCase() === 'mustafa bilir') {
            const adminData = localStorage.getItem('edu_sys_teacher_custom_profile_admin');
            if (adminData) {
              saved.user = { ...saved.user, ...JSON.parse(adminData) };
            }
          }
        } catch {
          // ignore
        }

        // Ensure legacy default branch is migrated to Fen Bilgisi Öğretmeni
        if ((saved.user as Teacher).branch === 'Matematik & Fen Bilimleri' || !(saved.user as Teacher).branch) {
          (saved.user as Teacher).branch = 'Fen Bilgisi Öğretmeni';
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
      this.revalidateAndSyncAll(true);
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
    // Uygulama oturumu kapanınca Supabase oturumu da kapansın
    supabase.auth.signOut().catch(() => {});
    this.setAuthSession(null);
    try {
      sessionStorage.removeItem(STORAGE_KEYS.AUTH_SESSION);
      sessionStorage.removeItem('edu_sys_last_activity_ts');
      localStorage.removeItem(STORAGE_KEYS.AUTH_SESSION);
    } catch {}
    this.notify();
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

  public updateClass(id: string, updates: Partial<ClassGroup>): void {
    this.classes = this.classes.map((c) => (c.id === id ? { ...c, ...updates } : c));
    saveData(STORAGE_KEYS.CLASSES, this.classes);
    const updated = this.classes.find((c) => c.id === id);
    if (updated) {
      this.syncClassToCloud(updated);
    }
    this.notify();
  }

  public async deleteClass(id: string): Promise<void> {
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

    // Await deletion permanently from central database
    await this.deleteClassFromCloud(id);
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
  public async registerStudent(
    studentData: Omit<Student, 'id' | 'createdAt' | 'status'>,
    forcedTeacherId?: string
  ): Promise<Student> {
    const session = this.getAuthSession();
    const currentTeacherId =
      forcedTeacherId || (session?.role === 'teacher' ? session.user.id : undefined);

    const cleanName = (studentData.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const cleanNumber = (studentData.studentNumber || '').trim();

    // Check for duplicate student registration across all platforms
    const duplicate = this.students.find((s) => {
      const sName = (s.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
      if (sName === cleanName) {
        if (cleanNumber && s.studentNumber && s.studentNumber.trim() === cleanNumber) return true;
        if (
          studentData.className &&
          s.className &&
          s.className.trim().toLowerCase() === studentData.className.trim().toLowerCase()
        ) {
          return true;
        }
      }
      return false;
    });

    if (duplicate) {
      throw new Error(
        `"${studentData.name}" isimli ve ${duplicate.className || 'sınıfı kayıtlı'} öğrenci sistemde zaten mevcuttur. Mükerrer öğrenci kaydı oluşturulamaz.`
      );
    }

    const cleanUsername = studentData.username?.trim().toLowerCase();
    if (cleanUsername && this.students.some((s) => s.username?.toLowerCase() === cleanUsername)) {
      throw new Error('Bu kullanıcı adı ile kayıtlı bir öğrenci zaten mevcut. Lütfen başka bir kullanıcı adı seçiniz.');
    }

    const classObj = this.classes.find(
      (c) => c.id === studentData.classId || c.name.toLowerCase() === (studentData.className || '').toLowerCase()
    );
    const studentPassword = studentData.password?.trim() || '54321';
    const isMustChange = studentData.mustChangePassword !== undefined
      ? studentData.mustChangePassword
      : (studentPassword === '54321');

    const newStudent: Student = {
      ...studentData,
      id: `std-${Date.now()}`,
      username: cleanUsername,
      email: cleanStudentEmail(studentData.email),
      password: studentPassword,
      mustChangePassword: isMustChange,
      className: classObj ? classObj.name : studentData.className || '12-A Sayısal',
      classId: classObj ? classObj.id : (studentData.classId || 'class-custom'),
      branch: studentData.branch?.trim() || (classObj ? classObj.branch : ''),
      studentNumber: studentData.studentNumber?.trim() || `${Math.floor(1000 + Math.random() * 9000)}`,
      createdAt: new Date().toISOString(),
      status: 'active',
      createdTeacherId: currentTeacherId,
      avatar:
        studentData.avatar ||
        `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(studentData.name)}`,
    };

    // Rollback için önceki durumların yedeğini al
    const prevStudents = JSON.parse(JSON.stringify(this.students));
    const prevSentEmails = JSON.parse(JSON.stringify(this.sentEmails));
    const prevStudentNotifications = JSON.parse(JSON.stringify(this.studentNotifications));

    this.students.unshift(newStudent);
    saveData(STORAGE_KEYS.STUDENTS, this.students);

    // Eğer öğrenci e-postası belirtilmişse, kullanıcı adı ve şifresini içeren otomatik hoş geldin maili oluştur
    if (newStudent.email && newStudent.email.includes('@')) {
      const activeTeacher = session?.role === 'teacher' ? (session.user as Teacher) : this.teachers[0];
      const teacherName = activeTeacher?.name || 'M. Bilir';
      const welcomeEmail = generateStudentWelcomeEmail({
        studentName: newStudent.name,
        studentEmail: newStudent.email,
        username: newStudent.username,
        studentNumber: newStudent.studentNumber,
        password: newStudent.password,
        className: newStudent.className,
        teacherName,
      });

      this.sentEmails.unshift({
        id: `email-welcome-${newStudent.id}`,
        recipientEmail: newStudent.email,
        recipientName: newStudent.name,
        recipientRole: 'student',
        studentId: newStudent.id,
        type: 'student_welcome',
        subject: welcomeEmail.subject,
        htmlContent: welcomeEmail.html,
        textContent: welcomeEmail.text,
        sentAt: newStudent.createdAt,
        status: 'delivered',
        sourceId: newStudent.id,
        sourceTitle: 'Sistem Kayıt ve Giriş Bilgileri',
        teacherName,
      });
      saveData(STORAGE_KEYS.SENT_EMAILS, this.sentEmails);

      this.studentNotifications.unshift({
        id: `notif-welcome-${newStudent.id}`,
        studentId: newStudent.id,
        type: 'general',
        title: '🎓 Hoş Geldiniz! Sisteme Kaydınız Tamamlandı',
        message: `Kullanıcı adınız: ${newStudent.username}, Giriş şifreniz: ${newStudent.password}. Giriş bilgileri e-posta adresinize de iletildi.`,
        sourceId: newStudent.id,
        sourceTitle: 'Hoş Geldiniz',
        teacherName,
        createdAt: newStudent.createdAt,
        read: false,
        linkTab: 'home',
        emailSent: true,
        emailRecipient: newStudent.email,
        emailDetails: {
          subject: welcomeEmail.subject,
          bodyHtml: welcomeEmail.html,
          sentAt: newStudent.createdAt,
        },
      });
      saveData(STORAGE_KEYS.STUDENT_NOTIFICATIONS, this.studentNotifications);
    }

    try {
      localStorage.setItem(PERMANENT_KEYS.MASTER_STUDENTS, JSON.stringify(this.students));
    } catch {}

    // Bulut yazmasını AWAIT et ve sonucunu doğrula
    const cloudRes = await this.syncStudentToCloud(newStudent);

    if (!cloudRes.success) {
      // ROLLBACK: Buluta yazılamadıysa yerel state ve depolamayı tamamen eski haline döndür
      this.students = prevStudents;
      this.sentEmails = prevSentEmails;
      this.studentNotifications = prevStudentNotifications;
      saveData(STORAGE_KEYS.STUDENTS, this.students);
      saveData(STORAGE_KEYS.SENT_EMAILS, this.sentEmails);
      saveData(STORAGE_KEYS.STUDENT_NOTIFICATIONS, this.studentNotifications);
      try {
        localStorage.setItem(PERMANENT_KEYS.MASTER_STUDENTS, JSON.stringify(this.students));
      } catch {}
      this.notify();

      const errMsg =
        cloudRes.error?.message ||
        (cloudRes.error?.code === '42501'
          ? 'Öğrenci kaydetme yetkiniz bulunmamaktadır (RLS kuralı).'
          : 'Öğrenci bulut veritabanına kaydedilemedi.');

      this.showFloatingErrorToast(`Hata: ${errMsg} Değişiklikler geri alındı.`);
      throw new Error(`[registerStudent] Öğrenci buluta kaydedilemedi: ${errMsg}`);
    }

    this.notify();
    return newStudent;
  }

  public async registerStudentsBulk(
    studentsData: Array<Omit<Student, 'id' | 'createdAt' | 'status'> & { autoCreateClass?: boolean }>,
    forcedTeacherId?: string
  ): Promise<Student[]> {
    const session = this.getAuthSession();
    const currentTeacherId =
      forcedTeacherId || (session?.role === 'teacher' ? session.user.id : undefined);
    const createdList: Student[] = [];
    const timestamp = Date.now();

    // Rollback için önceki durumların yedeğini al
    const prevStudents = JSON.parse(JSON.stringify(this.students));
    const prevClasses = JSON.parse(JSON.stringify(this.classes));
    const prevTeachers = JSON.parse(JSON.stringify(this.teachers));

    try {
      for (let index = 0; index < studentsData.length; index++) {
        const item = studentsData[index];
        let classObj = this.classes.find(
          (c) =>
            c.id === item.classId ||
            c.name.toLowerCase() === (item.className || '').trim().toLowerCase()
        );

        // Auto-create class if not exists and className provided using addClass()
        if (!classObj && item.className && item.className.trim() !== '') {
          const newClass = await this.addClass(
            {
              name: item.className.trim(),
              branch: 'Genel',
              academicYear: '2026-2027',
              description: 'Excel yüklemesi ile otomatik oluşturuldu',
            },
            currentTeacherId
          );
          classObj = newClass;
        }

        const finalClassId = classObj ? classObj.id : item.classId || (this.classes[0]?.id ?? '');
        const finalClassName = classObj ? classObj.name : item.className || (this.classes[0]?.name ?? 'Genel');

        const studentId = `std-${timestamp + index}-${Math.floor(Math.random() * 1000)}`;
        const cleanName = item.name.trim();

        // Excelden eklenen öğrenciler kullanıcı adı 'ad' (küçük harf, türkçe karakter normalize edilmiş)
        const rawFirstName = cleanName.split(' ')[0] || 'ogrenci';
        const cleanFirstName = rawFirstName
          .replace(/İ/g, 'i')
          .replace(/I/g, 'i')
          .toLowerCase()
          .replace(/ğ/g, 'g')
          .replace(/ü/g, 'u')
          .replace(/ş/g, 's')
          .replace(/ı/g, 'i')
          .replace(/ö/g, 'o')
          .replace(/ç/g, 'c')
          .replace(/[^a-z0-9]/g, '');
        const baseUsername = item.username?.trim().toLowerCase() || cleanFirstName || 'ogrenci';

        // Benzersiz kullanıcı adı sağlama
        let finalUsername = baseUsername;
        let counter = 1;
        while (
          this.students.some((s) => s.username?.toLowerCase() === finalUsername) ||
          createdList.some((s) => s.username?.toLowerCase() === finalUsername)
        ) {
          counter++;
          finalUsername = `${baseUsername}${counter}`;
        }

        const stdPassword = item.password?.trim() || '54321';
        const isMustChange = item.mustChangePassword !== undefined
          ? item.mustChangePassword
          : (stdPassword === '54321' || !item.password);

        const newStudent: Student = {
          id: studentId,
          name: cleanName,
          username: finalUsername,
          email: cleanStudentEmail(item.email),
          password: stdPassword,
          mustChangePassword: isMustChange,
          classId: finalClassId,
          className: finalClassName,
          studentNumber: item.studentNumber?.trim() || `${Math.floor(1000 + Math.random() * 9000)}`,
          phone: item.phone?.trim() || '',
          avatar:
            item.avatar ||
            `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(cleanName)}`,
          createdAt: new Date().toISOString(),
          status: 'active',
          createdTeacherId: currentTeacherId,
        };

        this.students.unshift(newStudent);
        createdList.push(newStudent);
      }

      saveData(STORAGE_KEYS.STUDENTS, this.students);
      try {
        localStorage.setItem(PERMANENT_KEYS.MASTER_STUDENTS, JSON.stringify(this.students));
      } catch {}

      // Await cloud sync for students (yalnızca bu işlemde oluşturulanlar)
      const cloudRes = await this.syncStudentsToCloud(createdList);
      if (!cloudRes.success) {
        // ROLLBACK
        this.students = prevStudents;
        this.classes = prevClasses;
        this.teachers = prevTeachers;
        saveData(STORAGE_KEYS.STUDENTS, this.students);
        saveData(STORAGE_KEYS.CLASSES, this.classes);
        saveData(STORAGE_KEYS.TEACHERS, this.teachers);
        try {
          localStorage.setItem(PERMANENT_KEYS.MASTER_STUDENTS, JSON.stringify(this.students));
          localStorage.setItem(PERMANENT_KEYS.MASTER_CLASSES, JSON.stringify(this.classes));
        } catch {}
        this.notify();

        const errMsg =
          cloudRes.error?.message ||
          (cloudRes.error?.code === '42501'
            ? 'Öğrencileri kaydetme yetkiniz bulunmamaktadır (RLS kuralı).'
            : 'Toplu öğrenci listesi bulut veritabanına kaydedilemedi.');

        this.showFloatingErrorToast(`Hata: ${errMsg} Değişiklikler geri alındı.`);
        throw new Error(`[registerStudentsBulk] Öğrenciler buluta kaydedilemedi: ${errMsg}`);
      }

      this.notify();
      return createdList;
    } catch (err: any) {
      // General error during loop or addClass
      this.students = prevStudents;
      this.classes = prevClasses;
      this.teachers = prevTeachers;
      saveData(STORAGE_KEYS.STUDENTS, this.students);
      saveData(STORAGE_KEYS.CLASSES, this.classes);
      saveData(STORAGE_KEYS.TEACHERS, this.teachers);
      try {
        localStorage.setItem(PERMANENT_KEYS.MASTER_STUDENTS, JSON.stringify(this.students));
        localStorage.setItem(PERMANENT_KEYS.MASTER_CLASSES, JSON.stringify(this.classes));
      } catch {}
      this.notify();
      this.showFloatingErrorToast(`Hata: ${err.message || 'Toplu öğrenci kaydı başarısız oldu.'} Değişiklikler geri alındı.`);
      throw err;
    }
  }

  public async updateStudent(id: string, updates: Partial<Student>): Promise<void> {
    const prevStudents = JSON.parse(JSON.stringify(this.students));

    if (updates.email !== undefined) {
      updates.email = cleanStudentEmail(updates.email);
    }
    if (updates.classId) {
      const cls = this.classes.find((c) => c.id === updates.classId);
      if (cls) updates.className = cls.name;
    }
    this.students = this.students.map((s) => (s.id === id ? { ...s, ...updates } : s));
    const updated = this.students.find((s) => s.id === id);
    if (!updated) return;

    saveData(STORAGE_KEYS.STUDENTS, this.students);
    try {
      localStorage.setItem(PERMANENT_KEYS.MASTER_STUDENTS, JSON.stringify(this.students));
    } catch {}

    // Bulut yazmasını AWAIT et ve sonucunu kontrol et
    const cloudRes = await this.syncStudentToCloud(updated);
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
          ? 'Öğrenci güncelleme yetkiniz bulunmamaktadır (RLS kuralı).'
          : 'Öğrenci bilgileri bulut veritabanında güncellenemedi.');

      this.showFloatingErrorToast(`Hata: ${errMsg} Değişiklikler geri alındı.`);
      throw new Error(`[updateStudent] Öğrenci bulutta güncellenemedi: ${errMsg}`);
    }

    const currentSession = this.getAuthSession();
    if (currentSession?.role === 'student' && currentSession.user.id === id) {
      this.setAuthSession({
        ...currentSession,
        user: updated,
      });
    }

    this.notify();
  }

  public async deleteStudent(id: string): Promise<void> {
    await this.deleteStudents([id]);
  }

  public async deleteStudents(ids: string[]): Promise<void> {
    if (!ids || ids.length === 0) return;
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
  }

  // --- HOMEWORK ---
  public async createHomework(homeworkData: Omit<Homework, 'id' | 'createdAt'>): Promise<Homework> {
    const session = this.getAuthSession();
    const currentTeacher = session?.role === 'teacher' ? (session.user as Teacher) : null;
    const nowIso = new Date().toISOString();
    const newHw: Homework = {
      ...homeworkData,
      id: `hw-${Date.now()}`,
      createdAt: nowIso,
      teacherId: homeworkData.teacherId || currentTeacher?.id,
      createdByName: homeworkData.createdByName || currentTeacher?.name || 'Öğretmen',
      submissions: [],
    };

    // Rollback için önceki durumların yedeğini al
    const prevHomeworks = JSON.parse(JSON.stringify(this.homeworks));
    const prevNotifications = JSON.parse(JSON.stringify(this.studentNotifications));
    const prevSentEmails = JSON.parse(JSON.stringify(this.sentEmails));

    this.homeworks.unshift(newHw);
    saveData(STORAGE_KEYS.HOMEWORK, this.homeworks);

    // Otomatik Öğrenci Bildirimi ve E-Posta Gönderimi
    this.dispatchHomeworkNotificationsAndEmails(newHw);
    this.notify();

    // Cross-device Supabase push with await confirmation
    try {
      const assignedVal = Array.isArray(newHw.assignedTo)
        ? JSON.stringify(newHw.assignedTo)
        : (newHw.assignedTo || newHw.classId || 'class-default');

      const { error } = await supabase.from('homeworks').upsert({
        id: newHw.id,
        title: newHw.title,
        description: newHw.description || '',
        subject: newHw.subject,
        assigned_to: assignedVal,
        class_id: newHw.classId || 'class-default',
        due_date: newHw.dueDate,
        learning_outcomes: newHw.learningOutcomes || [],
        submissions: [],
      });

      if (error) {
        throw error;
      }
    } catch (err: any) {
      // ROLLBACK: Buluta yazılamadıysa yerel state ve depolamayı eski haline döndür
      this.homeworks = prevHomeworks;
      this.studentNotifications = prevNotifications;
      this.sentEmails = prevSentEmails;
      saveData(STORAGE_KEYS.HOMEWORK, this.homeworks);
      saveData(STORAGE_KEYS.STUDENT_NOTIFICATIONS, this.studentNotifications);
      saveData(STORAGE_KEYS.SENT_EMAILS, this.sentEmails);
      this.notify();

      const errMsg =
        err?.message ||
        (err?.code === '42501'
          ? 'Ödev oluşturma yetkiniz bulunmamaktadır (RLS kuralı).'
          : 'Ödev bulut veritabanına kaydedilemedi.');

      this.showFloatingErrorToast(`Hata: ${errMsg} Değişiklikler geri alındı.`);
      throw new Error(`[createHomework] Ödev buluta kaydedilemedi: ${errMsg}`);
    }

    return newHw;
  }

  public async updateHomework(id: string, updates: Partial<Homework>): Promise<void> {
    const prevHomeworks = JSON.parse(JSON.stringify(this.homeworks));

    this.homeworks = this.homeworks.map((h) => (h.id === id ? { ...h, ...updates } : h));
    saveData(STORAGE_KEYS.HOMEWORK, this.homeworks);
    this.notify();

    const updated = this.homeworks.find((h) => h.id === id);
    if (updated) {
      try {
        const assignedVal = Array.isArray(updated.assignedTo)
          ? JSON.stringify(updated.assignedTo)
          : (updated.assignedTo || updated.classId || 'class-default');

        const { error } = await supabase.from('homeworks').upsert({
          id: updated.id,
          title: updated.title,
          description: updated.description || '',
          subject: updated.subject,
          assigned_to: assignedVal,
          class_id: updated.classId || 'class-default',
          due_date: updated.dueDate,
          learning_outcomes: updated.learningOutcomes || [],
          submissions: updated.submissions || this.submissions.filter((s) => s.homeworkId === id) || [],
        });

        if (error) {
          throw error;
        }
      } catch (err: any) {
        // ROLLBACK: Buluta yazılamadıysa eski haline döndür
        this.homeworks = prevHomeworks;
        saveData(STORAGE_KEYS.HOMEWORK, this.homeworks);
        this.notify();

        const errMsg =
          err?.message ||
          (err?.code === '42501'
            ? 'Ödev güncelleme yetkiniz bulunmamaktadır (RLS kuralı).'
            : 'Ödev güncellemeleri bulut veritabanına kaydedilemedi.');

        this.showFloatingErrorToast(`Hata: ${errMsg} Değişiklikler geri alındı.`);
        throw new Error(`[updateHomework] Ödev güncellenemedi: ${errMsg}`);
      }
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

    try {
      const { error } = await supabase.from('homeworks').delete().eq('id', id);
      if (error) {
        throw error;
      }
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
  public async submitHomework(
    homeworkId: string,
    studentId: string,
    notes: string,
    attachmentLink?: string,
    resources?: HomeworkResource[]
  ): Promise<HomeworkSubmission> {
    const student = this.students.find((s) => s.id === studentId);
    const homework = this.homeworks.find((h) => h.id === homeworkId);

    const isLate = homework ? new Date() > new Date(homework.dueDate) : false;
    const status: 'on_time' | 'late' = isLate ? 'late' : 'on_time';

    const prevSubmissions = JSON.parse(JSON.stringify(this.submissions));
    const prevHomeworks = JSON.parse(JSON.stringify(this.homeworks));

    const existingIndex = this.submissions.findIndex(
      (s) => s.homeworkId === homeworkId && s.studentId === studentId
    );

    const submission: HomeworkSubmission = {
      id: existingIndex >= 0 ? this.submissions[existingIndex].id : `sub-${Date.now()}`,
      homeworkId,
      studentId,
      studentName: student ? student.name : 'Öğrenci',
      submittedAt: new Date().toISOString(),
      status,
      notes,
      attachmentLink,
      resources: resources || (existingIndex >= 0 ? this.submissions[existingIndex].resources : undefined),
      score: existingIndex >= 0 ? this.submissions[existingIndex].score : null,
      feedback: existingIndex >= 0 ? this.submissions[existingIndex].feedback : undefined,
    };

    if (existingIndex >= 0) {
      this.submissions[existingIndex] = submission;
    } else {
      this.submissions.unshift(submission);
    }

    saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);

    // Update homework embedded submissions and sync to Supabase
    const hw = this.homeworks.find((h) => h.id === homeworkId);
    if (hw) {
      hw.submissions = this.submissions.filter((s) => s.homeworkId === homeworkId);
      saveData(STORAGE_KEYS.HOMEWORK, this.homeworks);

      try {
        const { error } = await supabase.from('homeworks').upsert({
          id: hw.id,
          title: hw.title,
          description: hw.description || '',
          subject: hw.subject,
          assigned_to: Array.isArray(hw.assignedTo) ? JSON.stringify(hw.assignedTo) : (hw.assignedTo || hw.classId || 'class-default'),
          class_id: hw.classId || 'class-default',
          due_date: hw.dueDate,
          submissions: hw.submissions,
        });

        if (error) {
          throw error;
        }
      } catch (err: any) {
        // ROLLBACK: Buluta yazılamadıysa yerel teslimatları ve ödevi geri al
        this.submissions = prevSubmissions;
        this.homeworks = prevHomeworks;
        saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);
        saveData(STORAGE_KEYS.HOMEWORK, this.homeworks);
        this.notify();

        const errMsg =
          err?.message ||
          (err?.code === '42501'
            ? 'Ödev teslim yetkiniz bulunmamaktadır (RLS kuralı).'
            : 'Ödev teslimi bulut veritabanına kaydedilemedi.');

        this.showFloatingErrorToast(`Hata: ${errMsg} Değişiklikler geri alındı.`);
        throw new Error(`[submitHomework] Ödev teslimi kaydedilemedi: ${errMsg}`);
      }
    }

    this.notify();
    return submission;
  }

  public async gradeSubmission(submissionId: string, score: number, feedback: string): Promise<void> {
    const prevSubmissions = JSON.parse(JSON.stringify(this.submissions));
    const prevHomeworks = JSON.parse(JSON.stringify(this.homeworks));

    this.submissions = this.submissions.map((s) =>
      s.id === submissionId ? { ...s, score, feedback } : s
    );
    saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);

    const sub = this.submissions.find((s) => s.id === submissionId);
    if (sub) {
      const hw = this.homeworks.find((h) => h.id === sub.homeworkId);
      if (hw) {
        hw.submissions = this.submissions.filter((s) => s.homeworkId === hw.id);
        saveData(STORAGE_KEYS.HOMEWORK, this.homeworks);

        try {
          const { error } = await supabase.from('homeworks').upsert({
            id: hw.id,
            title: hw.title,
            description: hw.description || '',
            subject: hw.subject,
            assigned_to: Array.isArray(hw.assignedTo) ? JSON.stringify(hw.assignedTo) : (hw.assignedTo || hw.classId || 'class-default'),
            class_id: hw.classId || 'class-default',
            due_date: hw.dueDate,
            submissions: hw.submissions,
          });

          if (error) {
            throw error;
          }
        } catch (err: any) {
          // ROLLBACK: Buluta yazılamadıysa yerel puanlamayı ve ödevi geri al
          this.submissions = prevSubmissions;
          this.homeworks = prevHomeworks;
          saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);
          saveData(STORAGE_KEYS.HOMEWORK, this.homeworks);
          this.notify();

          const errMsg =
            err?.message ||
            (err?.code === '42501'
              ? 'Ödev puanlama yetkiniz bulunmamaktadır (RLS kuralı).'
              : 'Ödev puanı bulut veritabanına kaydedilemedi.');

          this.showFloatingErrorToast(`Hata: ${errMsg} Değişiklikler geri alındı.`);
          throw new Error(`[gradeSubmission] Puanlama kaydedilemedi: ${errMsg}`);
        }
      }
    }

    this.notify();
  }

  public async updateHomeworkCheckStatus(
    homeworkId: string,
    studentId: string,
    checkStatus: HomeworkCheckStatus,
    note?: string
  ): Promise<HomeworkSubmission> {
    const student = this.students.find((s) => s.id === studentId);
    const existingIndex = this.submissions.findIndex(
      (s) => s.homeworkId === homeworkId && s.studentId === studentId
    );

    const prevSubmissions = JSON.parse(JSON.stringify(this.submissions));
    const prevHomeworks = JSON.parse(JSON.stringify(this.homeworks));

    const submissionStatus = checkStatus === 'yapti' ? 'on_time' : 'not_submitted';
    let targetSub: HomeworkSubmission;

    if (existingIndex >= 0) {
      targetSub = {
        ...this.submissions[existingIndex],
        checkStatus,
        status: checkStatus === 'yapti' ? 'on_time' : this.submissions[existingIndex].status,
        notes: note !== undefined ? note : this.submissions[existingIndex].notes,
      };
      this.submissions[existingIndex] = targetSub;
    } else {
      targetSub = {
        id: `sub-${Date.now()}-${studentId}`,
        homeworkId,
        studentId,
        studentName: student ? student.name : 'Öğrenci',
        submittedAt: new Date().toISOString(),
        status: submissionStatus,
        checkStatus,
        notes: note || (checkStatus === 'yapti' ? 'Ödev tamamlandı' : checkStatus === 'eksik' ? 'Eksik ödev' : checkStatus === 'yapmadi' ? 'Ödev yapılmadı' : checkStatus === 'izinli' ? 'İzinli' : 'Derse gelmedi'),
      };
      this.submissions.unshift(targetSub);
    }

    saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);

    const hw = this.homeworks.find((h) => h.id === homeworkId);
    if (hw) {
      hw.submissions = this.submissions.filter((s) => s.homeworkId === homeworkId);
      saveData(STORAGE_KEYS.HOMEWORK, this.homeworks);

      try {
        const { error } = await supabase.from('homeworks').upsert({
          id: hw.id,
          title: hw.title,
          description: hw.description || '',
          subject: hw.subject,
          assigned_to: Array.isArray(hw.assignedTo) ? JSON.stringify(hw.assignedTo) : (hw.assignedTo || hw.classId || 'class-default'),
          class_id: hw.classId || 'class-default',
          due_date: hw.dueDate,
          submissions: hw.submissions,
        });

        if (error) {
          throw error;
        }
      } catch (err: any) {
        // ROLLBACK: Buluta yazılamadıysa yerel kontrol durumunu ve ödevi geri al
        this.submissions = prevSubmissions;
        this.homeworks = prevHomeworks;
        saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);
        saveData(STORAGE_KEYS.HOMEWORK, this.homeworks);
        this.notify();

        const errMsg =
          err?.message ||
          (err?.code === '42501'
            ? 'Ödev kontrol durumunu güncelleme yetkiniz bulunmamaktadır (RLS kuralı).'
            : 'Ödev kontrol durumu bulut veritabanına kaydedilemedi.');

        this.showFloatingErrorToast(`Hata: ${errMsg} Değişiklikler geri alındı.`);
        throw new Error(`[updateHomeworkCheckStatus] Durum kaydedilemedi: ${errMsg}`);
      }
    }

    this.notify();
    return targetSub;
  }

  // --- ETUTS ---
  public async createEtut(etutData: Omit<Etut, 'id' | 'createdAt'>): Promise<Etut> {
    const session = this.getAuthSession();
    const currentTeacher = session?.role === 'teacher' ? (session.user as Teacher) : null;
    const nowIso = new Date().toISOString();
    const newEtut: Etut = {
      ...etutData,
      id: `etut-${Date.now()}`,
      createdAt: nowIso,
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

      await this.recordAttendance({
        date: updatedEtut.date,
        classId: etutClassId,
        subject: `${updatedEtut.subject} (Etüt)`,
        records: attendanceRecordsList,
      });
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
      const { error } = await supabase.from('etuts').delete().eq('id', id);
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
  public async recordAttendance(attData: Omit<AttendanceRecord, 'id'>): Promise<AttendanceRecord> {
    const existingIndex = this.attendance.findIndex(
      (a) => a.date === attData.date && a.classId === attData.classId && a.subject === attData.subject
    );

    const record: AttendanceRecord = {
      ...attData,
      id: existingIndex >= 0 ? this.attendance[existingIndex].id : `att-${Date.now()}`,
    };

    if (existingIndex >= 0) {
      this.attendance[existingIndex] = record;
    } else {
      this.attendance.unshift(record);
    }

    this.attendance.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    saveData(STORAGE_KEYS.ATTENDANCE, this.attendance);
    this.notify();

    // Central Database is Single Source of Truth: await remote confirmation
    try {
      const { error } = await supabase.from('attendance').upsert({
        id: record.id,
        class_id: record.classId,
        date: record.date,
        subject: record.subject || 'Genel',
        records: record.records || [],
      });
      if (error) console.error('[AttendanceSync] Error saving attendance to Supabase:', error);
    } catch (err) {
      console.error('[AttendanceSync] Exception saving attendance:', err);
    }

    return record;
  }

  public async deleteAttendance(id: string): Promise<void> {
    this.attendance = this.attendance.filter((a) => a.id !== id);
    saveData(STORAGE_KEYS.ATTENDANCE, this.attendance);
    this.notify();

    try {
      const { error } = await supabase.from('attendance').delete().eq('id', id);
      if (error) console.error('[AttendanceSync] Error deleting attendance from Supabase:', error);
    } catch (err) {
      console.error('[AttendanceSync] Exception deleting attendance:', err);
    }
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

    for (const a of toDelete) {
      try {
        await supabase.from('attendance').delete().eq('id', a.id);
      } catch (err) {
        console.error('[AttendanceSync] Exception deleting date attendance:', err);
      }
    }
  }

  public async deleteAttendanceStudentRecord(attendanceId: string, studentId: string): Promise<void> {
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
      try {
        await supabase.from('attendance').upsert({
          id: updated.id,
          class_id: updated.classId,
          date: updated.date,
          subject: updated.subject || 'Genel',
          records: updated.records || [],
        });
      } catch (err) {
        console.error('[AttendanceSync] Exception updating student attendance record:', err);
      }
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
    this.grades.unshift(newGrade);
    this.grades.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    saveData(STORAGE_KEYS.GRADES, this.grades);
    this.notify();

    try {
      const { error } = await supabase.from('grades').upsert({
        id: newGrade.id,
        student_id: newGrade.studentId,
        class_id: newGrade.classId || 'c-1',
        subject: newGrade.subject,
        score: newGrade.score,
        exam_type: newGrade.examType || '1. Yazılı',
        date: newGrade.date,
      });
      if (error) console.error('[GradesSync] Error saving grade to Supabase:', error);
    } catch (err) {
      console.error('[GradesSync] Exception saving grade:', err);
    }

    return newGrade;
  }

  public async updateGrade(id: string, updates: Partial<GradeRecord>): Promise<void> {
    this.grades = this.grades.map((g) => (g.id === id ? { ...g, ...updates } : g));
    this.grades.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    saveData(STORAGE_KEYS.GRADES, this.grades);
    this.notify();

    const updated = this.grades.find((g) => g.id === id);
    if (updated) {
      try {
        const { error } = await supabase.from('grades').upsert({
          id: updated.id,
          student_id: updated.studentId,
          class_id: updated.classId || 'c-1',
          subject: updated.subject,
          score: updated.score,
          exam_type: updated.examType || '1. Yazılı',
          date: updated.date,
        });
        if (error) console.error('[GradesSync] Error updating grade in Supabase:', error);
      } catch (err) {
        console.error('[GradesSync] Exception updating grade:', err);
      }
    }
  }

  public async deleteGrade(id: string): Promise<void> {
    this.grades = this.grades.filter((g) => g.id !== id);
    saveData(STORAGE_KEYS.GRADES, this.grades);
    this.notify();

    try {
      const { error } = await supabase.from('grades').delete().eq('id', id);
      if (error) console.error('[GradesSync] Error deleting grade from Supabase:', error);
    } catch (err) {
      console.error('[GradesSync] Exception deleting grade:', err);
    }
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

    this.messages.unshift(newMsg);
    this.messages.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    saveData(STORAGE_KEYS.MESSAGES, this.messages);
    this.notify();

    try {
      const { error } = await supabase.from('messages').upsert({
        id: newMsg.id,
        student_id: newMsg.studentId,
        student_name: newMsg.studentName,
        student_class: newMsg.studentClass,
        student_avatar: newMsg.studentAvatar,
        subject: newMsg.subject,
        text: newMsg.text,
        link_url: newMsg.linkUrl,
        created_at: newMsg.createdAt,
        read: newMsg.read,
      });
      if (error) console.error('[MessagesSync] Error sending message to Supabase:', error);
    } catch (err) {
      console.error('[MessagesSync] Exception sending message:', err);
    }

    return newMsg;
  }

  public async markMessageAsRead(id: string): Promise<void> {
    this.messages = this.messages.map((m) => (m.id === id ? { ...m, read: true } : m));
    saveData(STORAGE_KEYS.MESSAGES, this.messages);
    this.notify();

    try {
      const { error } = await supabase.from('messages').update({ read: true }).eq('id', id);
      if (error) console.error('[MessagesSync] Error updating message read status:', error);
    } catch (err) {
      console.error('[MessagesSync] Exception marking message as read:', err);
    }
  }

  public async replyToMessage(id: string, replyText: string): Promise<void> {
    const nowIso = new Date().toISOString();
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

    try {
      const { error } = await supabase.from('messages').update({
        teacher_reply: replyText,
        replied_at: nowIso,
        read: true,
      }).eq('id', id);
      if (error) console.error('[MessagesSync] Error saving reply to Supabase:', error);
    } catch (err) {
      console.error('[MessagesSync] Exception replying to message:', err);
    }
  }

  public async deleteMessage(id: string): Promise<void> {
    this.messages = this.messages.filter((m) => m.id !== id);
    saveData(STORAGE_KEYS.MESSAGES, this.messages);
    this.notify();

    try {
      const { error } = await supabase.from('messages').delete().eq('id', id);
      if (error) console.error('[MessagesSync] Error deleting message from Supabase:', error);
    } catch (err) {
      console.error('[MessagesSync] Exception deleting message:', err);
    }
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
    const eligibleHomeworks = this.homeworks.filter((hw) => {
      if (hw.isGlobalForNewStudents) return true;
      if (hw.assignedTo === 'all') return true;
      if (Array.isArray(hw.assignedTo) && hw.assignedTo.includes(studentId)) return true;
      if (student && hw.targetClassIds && hw.targetClassIds.includes(student.classId)) return true;
      return false;
    });

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
      const { error } = await supabase
        .from('students')
        .update({
          class_id: newClassId,
          class_name: newClassName,
        })
        .eq('id', studentId);

      if (error) {
        throw error;
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
        return hw.teacherId === teacherId || (teacher?.name && hw.createdByName === teacher.name);
      });
    }

    if (session?.role === 'student') {
      const student = session.user as Student;
      return this.homeworks.filter((hw) => {
        if (hw.isGlobalForNewStudents) return true;
        if (hw.targetClassIds && hw.targetClassIds.includes(student.classId)) return true;
        if (Array.isArray(hw.assignedTo) && hw.assignedTo.includes(student.id)) return true;
        if (hw.assignedTo === 'all') return true;
        return false;
      });
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
    this.messages.unshift(newMsg);
    this.messages.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    saveData(STORAGE_KEYS.MESSAGES, this.messages);
    this.notify();

    try {
      const { error } = await supabase.from('messages').upsert({
        id: newMsg.id,
        student_id: newMsg.studentId,
        student_name: newMsg.studentName,
        student_class: newMsg.studentClass,
        student_avatar: newMsg.studentAvatar,
        subject: newMsg.subject,
        text: newMsg.text,
        link_url: newMsg.linkUrl,
        created_at: newMsg.createdAt,
        read: newMsg.read,
      });
      if (error) console.error('[MessagesSync] Error sending message to Supabase:', error);
    } catch (err) {
      console.error('[MessagesSync] Exception sending message:', err);
    }

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

  public async addTeacherDocument(doc: Omit<TeacherDocument, 'id' | 'uploadedAt'>): Promise<TeacherDocument> {
    const newDoc: TeacherDocument = {
      ...doc,
      id: `doc-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      uploadedAt: new Date().toISOString(),
    };
    this.documents = [newDoc, ...this.documents];
    saveData(STORAGE_KEYS.DOCUMENTS, this.documents);
    this.notify();

    try {
      await supabase.from('homeworks').upsert({
        id: '__system_sync_documents__',
        title: 'Teacher Documents Sync',
        description: JSON.stringify(this.documents.slice(0, 100)),
        subject: 'SystemSync',
        assigned_to: '__SYSTEM__',
        due_date: '2099-12-31',
      });
    } catch (err) {
      console.warn('[DocumentsSync] Exception syncing documents:', err);
    }

    return newDoc;
  }

  public async deleteTeacherDocument(id: string): Promise<void> {
    this.documents = this.documents.filter((d) => d.id !== id);
    saveData(STORAGE_KEYS.DOCUMENTS, this.documents);
    this.notify();

    try {
      await supabase.from('homeworks').upsert({
        id: '__system_sync_documents__',
        title: 'Teacher Documents Sync',
        description: JSON.stringify(this.documents.slice(0, 100)),
        subject: 'SystemSync',
        assigned_to: '__SYSTEM__',
        due_date: '2099-12-31',
      });
    } catch (err) {
      console.warn('[DocumentsSync] Exception deleting document:', err);
    }
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
      this.sentEmails.unshift(emailLog);

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
        emailSent: true,
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
      this.sentEmails.unshift(emailLog);

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
        emailSent: true,
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

    if (existingIdx !== -1) {
      const updated: StudentQuestionLog = {
        ...this.questionLogs[existingIdx],
        ...logData,
        entries: cleanEntries,
        totalQuestions: finalTotal,
        totalCorrect: finalCorrect,
        totalWrong: finalWrong,
        totalEmpty: finalEmpty,
        notes: logData.notes || '',
      };
      this.questionLogs[existingIdx] = updated;
      saveData(STORAGE_KEYS.QUESTION_LOGS, this.questionLogs);
      this.notify();

      // Cross-device Supabase push with await confirmation
      try {
        await supabase.from('homeworks').upsert({
          id: '__system_sync_question_logs__',
          title: 'Question Logs Sync',
          description: JSON.stringify(this.questionLogs.slice(-250)),
          subject: 'SystemSync',
          assigned_to: '__SYSTEM__',
          due_date: '2099-12-31',
        });
      } catch (err) {
        console.warn('[QuestionLogsSync] Exception syncing question logs:', err);
      }

      return updated;
    } else {
      const newLog: StudentQuestionLog = {
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
      this.questionLogs.unshift(newLog);
      saveData(STORAGE_KEYS.QUESTION_LOGS, this.questionLogs);
      this.notify();

      // Cross-device Supabase push with await confirmation
      try {
        await supabase.from('homeworks').upsert({
          id: '__system_sync_question_logs__',
          title: 'Question Logs Sync',
          description: JSON.stringify(this.questionLogs.slice(-250)),
          subject: 'SystemSync',
          assigned_to: '__SYSTEM__',
          due_date: '2099-12-31',
        });
      } catch (err) {
        console.warn('[QuestionLogsSync] Exception syncing question logs:', err);
      }

      return newLog;
    }
  }

  public async deleteQuestionLog(id: string): Promise<void> {
    if (!this.deletedQuestionLogIds) {
      this.deletedQuestionLogIds = new Set<string>();
    }
    this.deletedQuestionLogIds.add(id);
    saveData(STORAGE_KEYS.DELETED_QUESTION_LOGS, Array.from(this.deletedQuestionLogIds));
    try {
      localStorage.setItem(PERMANENT_KEYS.DELETED_QUESTION_LOGS, JSON.stringify(Array.from(this.deletedQuestionLogIds)));
    } catch {}

    this.questionLogs = this.questionLogs.filter((q) => q.id !== id);
    saveData(STORAGE_KEYS.QUESTION_LOGS, this.questionLogs);
    try {
      localStorage.setItem(PERMANENT_KEYS.MASTER_QUESTION_LOGS, JSON.stringify(this.questionLogs));
    } catch {}

    // Clean legacy versioned keys so deleted question logs never resurrect
    [
      'edu_sys_question_logs_v5', 'edu_sys_question_logs_v4', 'edu_sys_question_logs_v3',
      'edu_sys_question_logs_v2', 'edu_sys_question_logs_v1', 'edu_sys_question_logs', 'edu_sys_question_logs_backup',
    ].forEach((legacyKey) => {
      try {
        const val = localStorage.getItem(legacyKey);
        if (val) {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed)) {
            const filtered = parsed.filter((q: any) => q.id !== id);
            localStorage.setItem(legacyKey, JSON.stringify(filtered));
          }
        }
      } catch {}
    });

    this.notify();

    // Cross-device Supabase push with await confirmation
    try {
      await supabase.from('homeworks').upsert({
        id: '__system_sync_question_logs__',
        title: 'Question Logs Sync',
        description: JSON.stringify(this.questionLogs.slice(-250)),
        subject: 'SystemSync',
        assigned_to: '__SYSTEM__',
        due_date: '2099-12-31',
      });
      await this.syncTombstonesToCloud();
    } catch (err) {
      console.warn('[QuestionLogsSync] Exception deleting question log:', err);
    }
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
    if (!this.deletedQuestionLogIds) {
      this.deletedQuestionLogIds = new Set<string>();
    }
    this.questionLogs.forEach((q) => this.deletedQuestionLogIds.add(q.id));
    saveData(STORAGE_KEYS.DELETED_QUESTION_LOGS, Array.from(this.deletedQuestionLogIds));
    try {
      localStorage.setItem(PERMANENT_KEYS.DELETED_QUESTION_LOGS, JSON.stringify(Array.from(this.deletedQuestionLogIds)));
    } catch {}

    this.questionLogs = [];
    saveData(STORAGE_KEYS.QUESTION_LOGS, this.questionLogs);
    try {
      localStorage.setItem(PERMANENT_KEYS.MASTER_QUESTION_LOGS, JSON.stringify([]));
    } catch {}

    [
      'edu_sys_question_logs_v5', 'edu_sys_question_logs_v4', 'edu_sys_question_logs_v3',
      'edu_sys_question_logs_v2', 'edu_sys_question_logs_v1', 'edu_sys_question_logs', 'edu_sys_question_logs_backup',
    ].forEach((legacyKey) => {
      try {
        localStorage.removeItem(legacyKey);
      } catch {}
    });

    this.notify();

    try {
      await supabase.from('homeworks').upsert({
        id: '__system_sync_question_logs__',
        title: 'Question Logs Sync',
        description: JSON.stringify([]),
        subject: 'SystemSync',
        assigned_to: '__SYSTEM__',
        due_date: '2099-12-31',
      });
      await this.syncTombstonesToCloud();
    } catch (err) {
      console.warn('[QuestionLogsSync] Exception clearing question logs:', err);
    }
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

  public async setWeeklyQuestionTarget(target: WeeklyQuestionTarget): Promise<WeeklyQuestionTarget> {
    const isClassTarget = target.targetType === 'class' || (!!target.classId && !target.studentId);
    
    const existingIdx = this.weeklyQuestionTargets.findIndex((t) => {
      if (isClassTarget) {
        if (t.classId !== target.classId || t.targetType !== 'class') return false;
        if (target.weekStartDate && t.weekStartDate) {
          return t.weekStartDate === target.weekStartDate;
        }
        return true;
      }
      if (t.studentId !== target.studentId) return false;
      if (target.weekStartDate && t.weekStartDate) {
        return t.weekStartDate === target.weekStartDate;
      }
      return true;
    });
    let savedTarget: WeeklyQuestionTarget;

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

    if (existingIdx !== -1) {
      savedTarget = {
        ...this.weeklyQuestionTargets[existingIdx],
        ...normalizedTarget,
        assignedDate: target.assignedDate || new Date().toISOString(),
      };
      this.weeklyQuestionTargets[existingIdx] = savedTarget;
    } else {
      const generatedId = isClassTarget
        ? `class_target_${target.classId}_${target.weekStartDate || Date.now()}`
        : target.id || `target-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      savedTarget = {
        ...normalizedTarget,
        id: generatedId,
        assignedDate: target.assignedDate || new Date().toISOString(),
      };
      this.weeklyQuestionTargets.unshift(savedTarget);
    }

    saveData(STORAGE_KEYS.WEEKLY_QUESTION_TARGETS, this.weeklyQuestionTargets);
    this.notify();

    // Cross-device Supabase push with await confirmation
    try {
      await supabase.from('homeworks').upsert({
        id: '__system_sync_question_targets__',
        title: 'Question Targets Sync',
        description: JSON.stringify(this.weeklyQuestionTargets),
        subject: 'SystemSync',
        assigned_to: '__SYSTEM__',
        due_date: '2099-12-31',
      });
    } catch (err) {
      console.warn('[QuestionTargetsSync] Exception syncing question targets:', err);
    }

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

    // 1. Set Class Target
    const classTarget: WeeklyQuestionTarget = {
      ...targetData,
      id: `class_target_${classId}_${targetData.weekStartDate || Date.now()}`,
      targetType: 'class',
      classId,
      className,
      targetDays: days,
      targetPeriodLabel:
        targetData.targetPeriodLabel ||
        (days === 7 ? 'Haftalık (7 Gün)' : days === 1 ? '1 Günlük' : `${days} Günlük`),
      targetQuestions: targetQ,
      weeklyTarget: targetQ,
      dailyTarget: dailyQ,
      assignedDate: new Date().toISOString(),
    };

    const savedClassTarget = await this.setWeeklyQuestionTarget(classTarget);

    // 2. Propagate target to all enrolled students in the class
    if (applyToStudents) {
      const classStudents = this.students.filter((s) => s.classId === classId);
      for (const std of classStudents) {
        await this.setWeeklyQuestionTarget({
          ...targetData,
          id: `target_${std.id}_${targetData.weekStartDate || Date.now()}`,
          targetType: 'student',
          studentId: std.id,
          studentName: std.name,
          classId: classId,
          className: className,
          targetDays: days,
          targetPeriodLabel: classTarget.targetPeriodLabel,
          targetQuestions: targetQ,
          weeklyTarget: targetQ,
          dailyTarget: dailyQ,
          assignedDate: new Date().toISOString(),
        });
      }
    }

    return savedClassTarget;
  }

  public async deleteClassQuestionTarget(classId: string, weekStartDate?: string): Promise<void> {
    const targetToDelete = this.getClassQuestionTarget(classId, weekStartDate);
    this.weeklyQuestionTargets = this.weeklyQuestionTargets.filter((t) => {
      if (t.targetType === 'class' && t.classId === classId) {
        if (weekStartDate && t.weekStartDate) {
          return t.weekStartDate !== weekStartDate;
        }
        return false;
      }
      return true;
    });
    saveData(STORAGE_KEYS.WEEKLY_QUESTION_TARGETS, this.weeklyQuestionTargets);
    this.notify();

    try {
      await supabase.from('homeworks').upsert({
        id: '__system_sync_question_targets__',
        title: 'Question Targets Sync',
        description: JSON.stringify(this.weeklyQuestionTargets),
        subject: 'SystemSync',
        assigned_to: '__SYSTEM__',
        due_date: '2099-12-31',
      });
    } catch (err) {
      console.warn('[QuestionTargetsSync] Exception deleting class question target:', err);
    }
  }

  public async deleteWeeklyQuestionTarget(studentIdOrId: string, weekStartDate?: string): Promise<void> {
    const targetToDelete = this.weeklyQuestionTargets.find((t) => {
      if (weekStartDate) {
        return (t.studentId === studentIdOrId || t.id === studentIdOrId) && t.weekStartDate === weekStartDate;
      }
      return t.id === studentIdOrId || t.studentId === studentIdOrId;
    });

    this.weeklyQuestionTargets = this.weeklyQuestionTargets.filter((t) => {
      if (weekStartDate) {
        if (t.studentId === studentIdOrId && t.weekStartDate === weekStartDate) return false;
      }
      return t.id !== studentIdOrId && t.studentId !== studentIdOrId;
    });
    saveData(STORAGE_KEYS.WEEKLY_QUESTION_TARGETS, this.weeklyQuestionTargets);
    this.notify();

    // Cross-device Supabase push with await confirmation
    try {
      await supabase.from('homeworks').upsert({
        id: '__system_sync_question_targets__',
        title: 'Question Targets Sync',
        description: JSON.stringify(this.weeklyQuestionTargets),
        subject: 'SystemSync',
        assigned_to: '__SYSTEM__',
        due_date: '2099-12-31',
      });
    } catch (err) {
      console.warn('[QuestionTargetsSync] Exception deleting question target:', err);
    }
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
