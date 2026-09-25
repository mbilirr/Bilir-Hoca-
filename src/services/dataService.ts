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
} from '../types';
import { supabase } from '../lib/supabase';
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
    password: '8745412',
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

// Resilient student loader across all versioned, master, and backup keys
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

    const studentMap = new Map<string, Student>();
    loaded.forEach((s) => {
      if (s && s.id) studentMap.set(s.id, s);
    });

    for (const k of studentKeysToCheck) {
      const val = localStorage.getItem(k);
      if (val) {
        try {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed)) {
            parsed.forEach((s: Student) => {
              if (s && s.id && !studentMap.has(s.id)) {
                studentMap.set(s.id, s);
              }
            });
          }
        } catch {}
      }
    }

    const result = Array.from(studentMap.values());
    if (result.length > 0) {
      saveData(STORAGE_KEYS.STUDENTS, result);
      try {
        localStorage.setItem(PERMANENT_KEYS.MASTER_STUDENTS, JSON.stringify(result));
      } catch {}
      return result;
    }
    return [];
  } catch (e) {
    console.error('Error in loadStudentsWithResilience:', e);
    return [];
  }
}

// Resilient class loader across all versioned, master, and backup keys
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

    const classMap = new Map<string, ClassGroup>();
    loaded.forEach((c) => {
      if (c && c.id) classMap.set(c.id, c);
    });

    for (const k of classKeysToCheck) {
      const val = localStorage.getItem(k);
      if (val) {
        try {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed)) {
            parsed.forEach((c: ClassGroup) => {
              if (c && c.id && !classMap.has(c.id)) {
                classMap.set(c.id, c);
              }
            });
          }
        } catch {}
      }
    }

    const result = Array.from(classMap.values());
    if (result.length > 0) {
      saveData(STORAGE_KEYS.CLASSES, result);
      try {
        localStorage.setItem(PERMANENT_KEYS.MASTER_CLASSES, JSON.stringify(result));
      } catch {}
      return result;
    }
    return [];
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
    let loaded: StudentQuestionLog[] = [];
    const direct = localStorage.getItem(STORAGE_KEYS.QUESTION_LOGS);
    if (direct) {
      try {
        const parsed = JSON.parse(direct);
        if (Array.isArray(parsed) && parsed.length > 0) loaded = parsed;
      } catch {}
    }
    if (loaded.length === 0) {
      const master = localStorage.getItem(PERMANENT_KEYS.MASTER_QUESTION_LOGS);
      if (master) {
        try {
          const parsed = JSON.parse(master);
          if (Array.isArray(parsed) && parsed.length > 0) loaded = parsed;
        } catch {}
      }
    }
    const qKeys = [
      'edu_sys_question_logs_v6', 'edu_sys_question_logs_v5', 'edu_sys_question_logs_v4',
      'edu_sys_question_logs_v3', 'edu_sys_question_logs_v2', 'edu_sys_question_logs_v1',
      'edu_sys_question_logs', 'edu_sys_question_logs_backup',
    ];
    const qMap = new Map<string, StudentQuestionLog>();
    loaded.forEach((q) => { if (q && q.id) qMap.set(q.id, q); });
    for (const k of qKeys) {
      const val = localStorage.getItem(k);
      if (val) {
        try {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed)) {
            parsed.forEach((q: StudentQuestionLog) => {
              if (q && q.id && !qMap.has(q.id)) qMap.set(q.id, q);
            });
          }
        } catch {}
      }
    }
    return Array.from(qMap.values());
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

  private listeners: (() => void)[] = [];

  private constructor() {
    this.initData();
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

    // Load resiliently across all storage keys
    const resilientStudents = loadStudentsWithResilience();
    const resilientClasses = loadClassesWithResilience();
    const resilientTeachers = loadTeachersWithResilience();
    const resilientEtuts = loadEtutsWithResilience();
    const resilientGrades = loadGradesWithResilience();
    const resilientHomework = loadHomeworkWithResilience();
    const resilientAttendance = loadAttendanceWithResilience();
    const resilientQuestionLogs = loadQuestionLogsWithResilience();

    const alreadyInitialized = isAlreadyInitialized();

    if (
      !alreadyInitialized &&
      resilientStudents.length === 0 &&
      resilientClasses.length === 0 &&
      resilientTeachers.length === 0 &&
      resilientEtuts.length === 0 &&
      resilientGrades.length === 0
    ) {
      // First time initialization ONLY when completely empty
      this.teachers = INITIAL_TEACHERS.map((t) => ({ ...t, status: 'approved' as const }));
      this.classes = [...INITIAL_CLASSES];
      this.students = [...INITIAL_STUDENTS];
      this.homeworks = [...INITIAL_HOMEWORK];
      this.submissions = [...INITIAL_SUBMISSIONS];
      this.etuts = [...INITIAL_ETUTS];
      this.attendance = [...INITIAL_ATTENDANCE];
      this.grades = [...INITIAL_GRADES];
      this.messages = [...INITIAL_MESSAGES];
      this.documents = [...INITIAL_TEACHER_DOCUMENTS];

      saveData(STORAGE_KEYS.TEACHERS, this.teachers);
      saveData(STORAGE_KEYS.CLASSES, this.classes);
      saveData(STORAGE_KEYS.STUDENTS, this.students);
      saveData(STORAGE_KEYS.HOMEWORK, this.homeworks);
      saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);
      saveData(STORAGE_KEYS.ETUTS, this.etuts);
      saveData(STORAGE_KEYS.ATTENDANCE, this.attendance);
      saveData(STORAGE_KEYS.GRADES, this.grades);
      saveData(STORAGE_KEYS.MESSAGES, this.messages);
      saveData(STORAGE_KEYS.DOCUMENTS, this.documents);
      saveData(STORAGE_KEYS.IS_SEEDED, 'true');
    } else {
      // Load strictly what is saved in storage; never wipe existing students, teachers, etuts or classes
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
            password: t.password || '8745412',
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
          password: '8745412',
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
    }

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

    // Background sync with Supabase (respects deleted students)
    this.syncFromSupabase();

    // Cross-device real-time and periodic sync for teacher registrations and approvals
    this.setupTeachersRealtimeSync();
    this.startPeriodicTeachersSync();

    // Cross-device real-time and periodic sync for etuts (PC & Mobile sync)
    this.setupEtutsRealtimeSync();
    this.startPeriodicEtutsSync();

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
          this.reconnectAllRealtime();
        }
      });
      window.addEventListener('online', () => {
        this.reconnectAllRealtime();
      });
      window.addEventListener('focus', () => {
        this.syncEtutsFromSupabase(true);
      });
    }
  }

  // --- REAL-TIME TEACHER REGISTRATION & APPROVAL SYNC ---
  private teacherRealtimeChannel: any = null;
  private teacherSyncInterval: any = null;

  public setupTeachersRealtimeSync() {
    if (this.teacherRealtimeChannel) return;
    try {
      this.teacherRealtimeChannel = supabase
        .channel('teachers-realtime-sync')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'homeworks' },
          (payload) => {
            const row = (payload.new || payload.old) as any;
            if (
              row &&
              (row.id === '__system_sync_teachers__' ||
                row.subject === 'TeacherSync' ||
                (typeof row.id === 'string' && row.id.startsWith('__teacher_sync_')))
            ) {
              this.syncTeachersFromSupabase(true);
            }
          }
        )
        .subscribe();
    } catch (e) {
      console.warn('Realtime channel subscribe error for teachers:', e);
    }
  }

  public startPeriodicTeachersSync() {
    if (this.teacherSyncInterval) return;
    if (typeof window !== 'undefined') {
      // Periodic check every 4 seconds as robust fallback across different devices/browsers
      this.teacherSyncInterval = window.setInterval(() => {
        this.syncTeachersFromSupabase(true);
      }, 4000);
    }
  }

  // --- REAL-TIME & PERIODIC ETUT SYNC (PC & PHONE SYNCHRONIZATION) ---
  private etutRealtimeChannel: any = null;
  private etutSyncInterval: any = null;

  public setupEtutsRealtimeSync() {
    try {
      if (this.etutRealtimeChannel) {
        try {
          supabase.removeChannel(this.etutRealtimeChannel);
        } catch {}
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

  public startPeriodicEtutsSync() {
    if (this.etutSyncInterval) return;
    if (typeof window !== 'undefined') {
      // Hızlı bulut kontrolü (Bilgisayar, Tablet ve Telefon arasında anlık senkronizasyon için 3 saniye)
      this.etutSyncInterval = window.setInterval(() => {
        this.syncEtutsFromSupabase(true);
      }, 3000);
    }
  }

  public reconnectAllRealtime() {
    this.setupTeachersRealtimeSync();
    this.setupEtutsRealtimeSync();
    this.syncClassesFromSupabase(true);
    this.syncEtutsFromSupabase(true);
    this.syncTeachersFromSupabase(true);
    this.syncFromSupabase();
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

  public async pushEtutToSupabase(etut: Etut): Promise<boolean> {
    try {
      const attendanceStudentIds = Object.keys(etut.studentAttendance || {});
      let finalAssigned: string[] | null = null;
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
        console.error('[EtutSync] Error upserting etut to Supabase:', error);
        return false;
      }
      return true;
    } catch (err) {
      console.error('[EtutSync] Exception upserting etut to Supabase:', err);
      return false;
    }
  }

  public async syncEtutsFromSupabase(isBackground = false): Promise<void> {
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

        // Bilgisayarda önceden oluşturulup henüz Supabase'e yüklenmemiş yerel etütleri tespit et ve anında buluta yükle
        const remoteIds = new Set(remoteEtuts.map((r: any) => r.id));
        const unsyncedLocals = this.etuts.filter(
          (e) => !remoteIds.has(e.id) && !this.deletedEtutIds.has(e.id)
        );
        if (unsyncedLocals.length > 0) {
          for (const localEtut of unsyncedLocals) {
            await this.pushEtutToSupabase(localEtut);
          }
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
    this.listeners.forEach((l) => l());
  }

  // --- SUPABASE BACKGROUND SYNC ---
  private async syncFromSupabase() {
    try {
      // 0. Synchronize teachers across devices (registrations, approvals, permissions)
      await this.syncTeachersFromSupabase(true);

      // 1. Fetch remote students from Supabase
      const { data: remoteStudents, error: errStd } = await supabase.from('students').select('*');
      if (!errStd && remoteStudents && remoteStudents.length > 0) {
        let hasChanges = false;
        remoteStudents.forEach((rs: any) => {
          // If this student was deleted locally by user, do NOT re-add!
          if (this.deletedStudentIds.has(rs.id)) return;

          const existingIdx = this.students.findIndex(
            (s) => s.id === rs.id || (s.studentNumber && s.studentNumber === rs.student_number)
          );

          if (existingIdx !== -1) {
            const cur = this.students[existingIdx];
            const cleanRemoteEmail = cleanStudentEmail(rs.email);
            const updated: Student = {
              ...cur,
              name: cur.name || rs.name,
              studentNumber: cur.studentNumber || rs.student_number,
              className: cur.className || rs.class_name,
              classId: cur.classId || rs.class_id,
              email: cur.email || cleanRemoteEmail,
              phone: cur.phone || rs.phone,
              avatar: cur.avatar || rs.avatar,
              schoolLevel: cur.schoolLevel || detectSchoolLevelFromGrade(rs.class_name) || 'Ortaokul',
            };
            if (JSON.stringify(updated) !== JSON.stringify(cur)) {
              this.students[existingIdx] = updated;
              hasChanges = true;
            }
          } else {
            const cleanRemoteEmail = cleanStudentEmail(rs.email);
            const newStd: Student = {
              id: rs.id,
              name: rs.name,
              username:
                rs.student_number ||
                cleanRemoteEmail?.split('@')[0] ||
                rs.name.toLowerCase().replace(/\s+/g, '_'),
              email: cleanRemoteEmail,
              password: rs.password || '54321',
              mustChangePassword: true,
              className: rs.class_name || 'Genel',
              classId: rs.class_id || 'class-default',
              studentNumber: rs.student_number || '',
              phone: rs.phone || '',
              avatar:
                rs.avatar ||
                `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(rs.name)}`,
              createdAt: rs.registered_at || new Date().toISOString(),
              status: 'active',
              createdTeacherId: 'teacher-1',
              schoolLevel: detectSchoolLevelFromGrade(rs.class_name) || 'Ortaokul',
            };
            this.students.push(newStd);
            hasChanges = true;
          }
        });

        if (hasChanges) {
          saveData(STORAGE_KEYS.STUDENTS, this.students);
          this.notify();
        }
      }

      // 2. Upload local students to Supabase to guarantee cloud persistence
      if (this.students.length > 0) {
        const payload = this.students
          .filter((s) => !this.deletedStudentIds.has(s.id))
          .map((s) => ({
            id: s.id,
            name: s.name,
            student_number: s.studentNumber || `${Math.floor(1000 + Math.random() * 9000)}`,
            class_id: s.classId || 'class-default',
            class_name: s.className || 'Genel',
            email: s.email || null,
            phone: s.phone || null,
            avatar: s.avatar || null,
            registered_at: s.createdAt || new Date().toISOString(),
          }));

        if (payload.length > 0) {
          await supabase.from('students').upsert(payload);
        }
      }

      // 3. Sync classes with Supabase (bidirectional and auto-recovery)
      await this.syncClassesFromSupabase(true);

      // 4. Sync etuts with Supabase (Cross-device etuts & attendance)
      await this.syncEtutsFromSupabase(true);

      // 5. Sync homeworks & cross-device system payloads (question targets and logs)
      const { data: remoteHws, error: errHws } = await supabase.from('homeworks').select('*');
      if (!errHws && remoteHws && remoteHws.length > 0) {
        let hwsChanged = false;
        remoteHws.forEach((rh: any) => {
          // Check for cross-device system sync payloads
          if (rh.id === '__system_sync_question_targets__') {
            try {
              const remoteTargets: WeeklyQuestionTarget[] = JSON.parse(rh.description);
              if (Array.isArray(remoteTargets) && remoteTargets.length > 0) {
                let targetsChanged = false;
                remoteTargets.forEach((rt) => {
                  const exIdx = this.weeklyQuestionTargets.findIndex(
                    (t) => t.id === rt.id || t.studentId === rt.studentId
                  );
                  if (exIdx === -1) {
                    this.weeklyQuestionTargets.push(rt);
                    targetsChanged = true;
                  } else if (
                    new Date(rt.assignedDate).getTime() >=
                    new Date(this.weeklyQuestionTargets[exIdx].assignedDate).getTime()
                  ) {
                    this.weeklyQuestionTargets[exIdx] = rt;
                    targetsChanged = true;
                  }
                });
                if (targetsChanged) {
                  saveData(STORAGE_KEYS.WEEKLY_QUESTION_TARGETS, this.weeklyQuestionTargets);
                  this.notify();
                }
              }
            } catch (e) {}
            return;
          }

          if (rh.id === '__system_sync_question_logs__') {
            try {
              const remoteLogs: StudentQuestionLog[] = JSON.parse(rh.description);
              if (Array.isArray(remoteLogs) && remoteLogs.length > 0) {
                let logsChanged = false;
                remoteLogs.forEach((rl) => {
                  const exIdx = this.questionLogs.findIndex((l) => l.id === rl.id);
                  if (exIdx === -1) {
                    this.questionLogs.push(rl);
                    logsChanged = true;
                  }
                });
                if (logsChanged) {
                  saveData(STORAGE_KEYS.QUESTION_LOGS, this.questionLogs);
                  this.notify();
                }
              }
            } catch (e) {}
            return;
          }

          // Ignore teacher sync and system sync rows so they are not treated as student homeworks
          if (
            rh.id === '__system_sync_teachers__' ||
            rh.id.startsWith('__teacher_sync_') ||
            rh.subject === 'TeacherSync' ||
            rh.subject === 'SystemSync'
          ) {
            return;
          }

          if (this.deletedHomeworkIds.has(rh.id)) return;
          const exIdx = this.homeworks.findIndex((h) => h.id === rh.id);
          if (exIdx === -1) {
            this.homeworks.push({
              id: rh.id,
              title: rh.title,
              description: rh.description || '',
              subject: rh.subject,
              classId: rh.assigned_to || rh.class_id || 'class-default',
              dueDate: rh.due_date,
              assignedDate: rh.created_at || new Date().toISOString(),
              teacherId: 'teacher-1',
              teacherName: 'Öğretmen',
              learningOutcomes: [],
            });
            hwsChanged = true;
          }
        });
        if (hwsChanged) {
          saveData(STORAGE_KEYS.HOMEWORK, this.homeworks);
          this.notify();
        }
      }

      // Upload local homeworks to Supabase
      const realHws = this.homeworks.filter((h) => !this.deletedHomeworkIds.has(h.id));
      if (realHws.length > 0) {
        const hwPayload = realHws.map((h) => ({
          id: h.id,
          title: h.title,
          description: h.description,
          subject: h.subject,
          assigned_to: h.classId || 'class-default',
          due_date: h.dueDate,
        }));
        await supabase.from('homeworks').upsert(hwPayload);
      }

      // Upload targets & question logs sync payloads to Supabase for cross-device persistence
      if (this.weeklyQuestionTargets.length > 0) {
        await supabase.from('homeworks').upsert({
          id: '__system_sync_question_targets__',
          title: 'Question Targets Sync',
          description: JSON.stringify(this.weeklyQuestionTargets),
          subject: 'SystemSync',
          assigned_to: '__SYSTEM__',
          due_date: '2099-12-31',
        });
      }
      if (this.questionLogs.length > 0) {
        await supabase.from('homeworks').upsert({
          id: '__system_sync_question_logs__',
          title: 'Question Logs Sync',
          description: JSON.stringify(this.questionLogs.slice(-250)),
          subject: 'SystemSync',
          assigned_to: '__SYSTEM__',
          due_date: '2099-12-31',
        });
      }

      // 6. Sync attendance with Supabase
      const { data: remoteAtt, error: errAtt } = await supabase.from('attendance').select('*');
      if (!errAtt && remoteAtt && remoteAtt.length > 0) {
        let attChanged = false;
        remoteAtt.forEach((ra: any) => {
          const exIdx = this.attendance.findIndex((a) => a.id === ra.id);
          if (exIdx === -1) {
            this.attendance.push({
              id: ra.id,
              classId: ra.class_id,
              date: ra.date,
              subject: ra.subject || 'Genel',
              records: Array.isArray(ra.records) ? ra.records : [],
            });
            attChanged = true;
          }
        });
        if (attChanged) {
          saveData(STORAGE_KEYS.ATTENDANCE, this.attendance);
          this.notify();
        }
      }
      if (this.attendance.length > 0) {
        const attPayload = this.attendance.map((a) => ({
          id: a.id,
          class_id: a.classId,
          date: a.date,
          subject: a.subject || 'Genel',
          records: a.records || [],
        }));
        await supabase.from('attendance').upsert(attPayload);
      }

      // 7. Sync grades with Supabase
      const { data: remoteGrades, error: errGrd } = await supabase.from('grades').select('*');
      if (!errGrd && remoteGrades && remoteGrades.length > 0) {
        let grdChanged = false;
        remoteGrades.forEach((rg: any) => {
          const exIdx = this.grades.findIndex((g) => g.id === rg.id);
          if (exIdx === -1) {
            this.grades.push({
              id: rg.id,
              studentId: rg.student_id,
              classId: rg.class_id,
              subject: rg.subject,
              score: rg.score,
              examType: (rg.exam_type as any) || '1. Yazılı',
              date: rg.date,
            });
            grdChanged = true;
          }
        });
        if (grdChanged) {
          saveData(STORAGE_KEYS.GRADES, this.grades);
          this.notify();
        }
      }
      if (this.grades.length > 0) {
        const grdPayload = this.grades.map((g) => ({
          id: g.id,
          student_id: g.studentId,
          class_id: g.classId || 'c-1',
          subject: g.subject,
          score: g.score,
          exam_type: g.examType || 'Yazılı',
          date: g.date,
        }));
        await supabase.from('grades').upsert(grdPayload);
      }
    } catch (e) {
      // Offline fallback is active
    }
  }

  public async syncAllTeacherData(): Promise<void> {
    await this.syncFromSupabase();
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

  public updateTeacherPassword(teacherId: string, oldPassword: string, newPassword: string): void {
    const teacher = this.teachers.find((t) => t.id === teacherId);
    if (!teacher) {
      throw new Error('Öğretmen kaydı bulunamadı.');
    }
    if (teacher.password && teacher.password !== oldPassword) {
      throw new Error('Mevcut şifreniz hatalı. Lütfen kontrol edip tekrar deneyiniz.');
    }
    this.updateTeacherProfile(teacherId, { password: newPassword });
  }

  // --- CLOUD SYNCHRONIZATION FOR TEACHERS ---

  public async syncTeacherToCloud(teacher: Teacher): Promise<void> {
    try {
      // 1. Upsert individual teacher sync row in homeworks
      await supabase.from('homeworks').upsert({
        id: `__teacher_sync_${teacher.id}__`,
        title: teacher.name,
        subject: 'TeacherSync',
        description: JSON.stringify(teacher),
        assigned_to: '__SYSTEM__',
        due_date: '2099-12-31',
      });

      // 2. Also update aggregate master teacher sync row
      const activeTeachers = this.teachers.filter((t) => !this.deletedTeacherIds.has(t.id));
      await supabase.from('homeworks').upsert({
        id: '__system_sync_teachers__',
        title: 'Teachers Sync',
        subject: 'SystemSync',
        description: JSON.stringify(activeTeachers),
        assigned_to: '__SYSTEM__',
        due_date: '2099-12-31',
      });
    } catch (e) {
      console.error('Error syncing teacher to cloud:', e);
    }
  }

  public async deleteTeacherFromCloud(teacherId: string): Promise<void> {
    try {
      await supabase
        .from('homeworks')
        .delete()
        .eq('id', `__teacher_sync_${teacherId}__`);

      const activeTeachers = this.teachers.filter((t) => !this.deletedTeacherIds.has(t.id));
      await supabase.from('homeworks').upsert({
        id: '__system_sync_teachers__',
        title: 'Teachers Sync',
        subject: 'SystemSync',
        description: JSON.stringify(activeTeachers),
        assigned_to: '__SYSTEM__',
        due_date: '2099-12-31',
      });
    } catch (e) {
      console.error('Error deleting teacher from cloud:', e);
    }
  }

  public async syncAllTeachersToCloud(): Promise<void> {
    try {
      const activeTeachers = this.teachers.filter((t) => !this.deletedTeacherIds.has(t.id));
      await supabase.from('homeworks').upsert({
        id: '__system_sync_teachers__',
        title: 'Teachers Sync',
        subject: 'SystemSync',
        description: JSON.stringify(activeTeachers),
        assigned_to: '__SYSTEM__',
        due_date: '2099-12-31',
      });

      // Ensure each active teacher has an individual sync row for conflict-free multi-device operations
      for (const t of activeTeachers) {
        await supabase.from('homeworks').upsert({
          id: `__teacher_sync_${t.id}__`,
          title: t.name,
          subject: 'TeacherSync',
          description: JSON.stringify(t),
          assigned_to: '__SYSTEM__',
          due_date: '2099-12-31',
        });
      }
    } catch (e) {
      console.error('Error syncing all teachers to cloud:', e);
    }
  }

  public async syncTeachersFromSupabase(isBackground = false): Promise<Teacher[]> {
    try {
      const { data: remoteRows, error } = await supabase
        .from('homeworks')
        .select('id, description, subject, title, created_at')
        .or('id.eq.__system_sync_teachers__,subject.eq.TeacherSync,id.like.__teacher_sync_%');

      if (error) {
        if (!isBackground) console.error('Error fetching teachers from Supabase:', error);
        return this.teachers;
      }

      if (!remoteRows || remoteRows.length === 0) {
        // If Supabase has no teacher records yet, seed our local teachers to cloud
        await this.syncAllTeachersToCloud();
        return this.teachers;
      }

      const remoteTeachersMap = new Map<string, Teacher>();

      remoteRows.forEach((row: any) => {
        if (!row.description) return;
        try {
          if (row.id === '__system_sync_teachers__') {
            const list = JSON.parse(row.description);
            if (Array.isArray(list)) {
              list.forEach((t: Teacher) => {
                if (t && t.id) remoteTeachersMap.set(t.id, t);
              });
            }
          } else if (
            row.subject === 'TeacherSync' ||
            (typeof row.id === 'string' && row.id.startsWith('__teacher_sync_'))
          ) {
            const single = JSON.parse(row.description);
            if (single && single.id) {
              remoteTeachersMap.set(single.id, single);
            }
          }
        } catch (err) {
          // ignore row parse failure
        }
      });

      let changed = false;
      let newPendingCount = 0;
      const localTeacherMap = new Map<string, Teacher>();
      this.teachers.forEach((t) => localTeacherMap.set(t.id, t));

      // Process remote teachers into local state
      remoteTeachersMap.forEach((remoteT, id) => {
        if (this.deletedTeacherIds.has(id)) return;

        const localT = localTeacherMap.get(id);
        if (!localT) {
          // Newly arrived teacher registered from another PC / phone / tablet!
          this.teachers.unshift(remoteT);
          localTeacherMap.set(id, remoteT);
          changed = true;
          if (remoteT.status === 'pending') {
            newPendingCount++;
          }
        } else {
          // Existing teacher: merge status and permission updates
          let statusUpdated = false;
          let permissionsUpdated = false;

          if (remoteT.status && remoteT.status !== localT.status) {
            // If local was already approved/rejected by admin, keep local and push to cloud
            if (localT.status === 'approved' && remoteT.status === 'pending') {
              this.syncTeacherToCloud(localT);
            } else {
              localT.status = remoteT.status;
              statusUpdated = true;
            }
          }

          if (
            remoteT.assignedClassIds &&
            JSON.stringify(remoteT.assignedClassIds) !== JSON.stringify(localT.assignedClassIds)
          ) {
            localT.assignedClassIds = remoteT.assignedClassIds;
            permissionsUpdated = true;
          }

          if (remoteT.canViewAllStudentsAndClasses !== undefined) {
            if (localT.canViewAllStudentsAndClasses !== remoteT.canViewAllStudentsAndClasses) {
              localT.canViewAllStudentsAndClasses = remoteT.canViewAllStudentsAndClasses;
              permissionsUpdated = true;
            }
          }

          if (remoteT.isAdmin !== undefined && remoteT.id !== 'teacher-1') {
            if (localT.isAdmin !== remoteT.isAdmin) {
              localT.isAdmin = remoteT.isAdmin;
              permissionsUpdated = true;
            }
          }

          if (statusUpdated || permissionsUpdated) {
            changed = true;
            const currentSession = this.getAuthSession();
            if (currentSession?.role === 'teacher' && currentSession.user.id === id) {
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
      });

      // Also check if this device has registered teachers locally that are NOT yet in Supabase
      let needsUpload = false;
      for (const lt of this.teachers) {
        if (!this.deletedTeacherIds.has(lt.id) && !remoteTeachersMap.has(lt.id)) {
          needsUpload = true;
          break;
        }
      }

      if (needsUpload) {
        await this.syncAllTeachersToCloud();
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
    } catch (e) {
      if (!isBackground) console.error('syncTeachersFromSupabase error:', e);
      return this.teachers;
    }
  }

  public async forceSyncTeachers(): Promise<Teacher[]> {
    return this.syncTeachersFromSupabase(false);
  }

  public authenticateTeacher(usernameOrEmail: string, password: string): Teacher | null {
    const term = usernameOrEmail.trim().toLowerCase();
    const termNoSpaces = term.replace(/\s+/g, '');
    const teacher = this.teachers.find((t) => {
      const u = t.username.toLowerCase();
      const uNoSpaces = u.replace(/\s+/g, '');
      const e = (t.email || '').toLowerCase();
      const n = (t.name || '').toLowerCase();
      const nNoSpaces = n.replace(/\s+/g, '');
      return (
        u === term ||
        uNoSpaces === termNoSpaces ||
        e === term ||
        n === term ||
        nNoSpaces === termNoSpaces
      );
    });
    if (!teacher) return null;
    if (teacher.password && teacher.password !== password) return null;

    if (teacher.status === 'pending') {
      throw new Error('Hesabınız henüz kurum yöneticisi (Mustafa Bilir) tarafından onaylanmamıştır. Onay verildikten sonra sisteme giriş yapabilirsiniz.');
    }
    if (teacher.status === 'rejected') {
      throw new Error('Hesap başvurunuz onaylanmamıştır. Lütfen kurum yöneticiniz ile iletişime geçiniz.');
    }

    return teacher;
  }

  public authenticateStudent(identifier: string, password: string): Student | null {
    const term = identifier.trim().toLowerCase();
    const student = this.students.find(
      (s) =>
        s.username.toLowerCase() === term ||
        s.email.toLowerCase() === term ||
        s.studentNumber.toLowerCase() === term
    );
    if (!student) return null;
    if (student.password && student.password !== password) return null;
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
    } else {
      try {
        sessionStorage.removeItem(STORAGE_KEYS.AUTH_SESSION);
      } catch {}
    }
    try {
      localStorage.removeItem(STORAGE_KEYS.AUTH_SESSION);
    } catch {}
    this.notify();
  }

  public logout(): void {
    this.setAuthSession(null);
    try {
      sessionStorage.removeItem(STORAGE_KEYS.AUTH_SESSION);
    } catch {}
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
          savedPassword: saved.savedPassword,
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
          savedPassword: saved.savedPassword,
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
      const payload = {
        ...data,
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

  // --- CLASSES ---
  public addClass(
    classData: Omit<ClassGroup, 'id'>,
    forcedTeacherId?: string
  ): ClassGroup & { autoAssignedCount?: number } {
    const session = this.getAuthSession();
    const currentTeacherId =
      forcedTeacherId || (session?.role === 'teacher' ? session.user.id : undefined);

    const newClass: ClassGroup = {
      ...classData,
      id: `class-${Date.now()}`,
      createdTeacherId: currentTeacherId,
    };
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
    }

    saveData(STORAGE_KEYS.CLASSES, this.classes);
    this.syncClassToCloud(newClass);
    this.notify();
    return { ...newClass, autoAssignedCount };
  }

  // Öğrencileri tek tek veya toplu olarak belirli bir sınıfa aktarma
  public assignStudentsToClass(studentIds: string[], classId: string): number {
    const cls = this.classes.find((c) => c.id === classId);
    if (!cls || !studentIds || studentIds.length === 0) return 0;

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
      this.syncClassToCloud(cls);
      this.notify();
    }
    return count;
  }

  // Öğrenciyi sınıftan çıkarma
  public removeStudentFromClass(studentId: string): void {
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

  public deleteClass(id: string): void {
    this.deletedClassIds.add(id);
    saveData(STORAGE_KEYS.DELETED_CLASSES, Array.from(this.deletedClassIds));

    this.classes = this.classes.filter((c) => c.id !== id);
    // Unassign students from this class
    this.students = this.students.map((s) => (s.classId === id ? { ...s, classId: '', className: 'Atanmadı' } : s));
    saveData(STORAGE_KEYS.CLASSES, this.classes);
    saveData(STORAGE_KEYS.STUDENTS, this.students);
    this.deleteClassFromCloud(id);
    this.notify();
  }

  // --- CLOUD SYNCHRONIZATION FOR CLASSES ---
  public async syncClassToCloud(cls: ClassGroup): Promise<void> {
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

      await supabase.from('classes').upsert({
        id: cls.id,
        name: cls.name,
        branch: cls.branch || 'Genel',
        level: levelNum,
        student_count: studentCount,
        academic_year: cls.academicYear || '2026-2027',
      });

      const activeClasses = this.classes.filter((c) => !this.deletedClassIds.has(c.id));
      await supabase.from('homeworks').upsert({
        id: '__system_sync_classes__',
        title: 'Classes Sync',
        subject: 'SystemSync',
        description: JSON.stringify(activeClasses),
        assigned_to: '__SYSTEM__',
        due_date: '2099-12-31',
      });
    } catch (e) {
      console.warn('Error syncing class to cloud:', e);
    }
  }

  public async deleteClassFromCloud(classId: string): Promise<void> {
    try {
      await supabase.from('classes').delete().eq('id', classId);
      const activeClasses = this.classes.filter((c) => !this.deletedClassIds.has(c.id));
      await supabase.from('homeworks').upsert({
        id: '__system_sync_classes__',
        title: 'Classes Sync',
        subject: 'SystemSync',
        description: JSON.stringify(activeClasses),
        assigned_to: '__SYSTEM__',
        due_date: '2099-12-31',
      });
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
        await supabase.from('classes').upsert(payload);
      }

      await supabase.from('homeworks').upsert({
        id: '__system_sync_classes__',
        title: 'Classes Sync',
        subject: 'SystemSync',
        description: JSON.stringify(activeClasses),
        assigned_to: '__SYSTEM__',
        due_date: '2099-12-31',
      });
    } catch (e) {
      console.warn('Error syncing all classes to cloud:', e);
    }
  }

  public async syncClassesFromSupabase(isBackground = false): Promise<ClassGroup[]> {
    try {
      let changed = false;

      // 1. Fetch from Supabase classes table
      const { data: remoteClasses, error: errCls } = await supabase.from('classes').select('*');
      if (errCls && !isBackground) {
        console.warn('Error fetching classes from Supabase:', errCls);
      }

      // 2. Fetch from aggregate __system_sync_classes__ row in homeworks
      const { data: sysRows } = await supabase
        .from('homeworks')
        .select('description')
        .eq('id', '__system_sync_classes__');

      const remoteMap = new Map<string, ClassGroup>();

      if (remoteClasses && Array.isArray(remoteClasses)) {
        remoteClasses.forEach((rc: any) => {
          if (!rc.id || this.deletedClassIds.has(rc.id)) return;
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

      if (sysRows && sysRows.length > 0 && sysRows[0]?.description) {
        try {
          const parsed = JSON.parse(sysRows[0].description);
          if (Array.isArray(parsed)) {
            parsed.forEach((c: ClassGroup) => {
              if (c && c.id && !this.deletedClassIds.has(c.id)) {
                if (!remoteMap.has(c.id)) {
                  remoteMap.set(c.id, c);
                }
              }
            });
          }
        } catch {}
      }

      // 3. Auto-recover any classes that exist in student records but missing from classes!
      // (This guarantees no student ever has a missing class or 'Yok' class on iPhone or Windows)
      this.students.forEach((s) => {
        if (s.classId && s.classId !== 'class-default' && s.classId !== 'tanimsiz' && !this.deletedClassIds.has(s.classId)) {
          if (!remoteMap.has(s.classId) && !this.classes.some((c) => c.id === s.classId)) {
            const detectedName = s.className && s.className !== 'Atanmadı' ? s.className : 'Sınıf';
            const recoveredClass: ClassGroup = {
              id: s.classId,
              name: detectedName,
              branch: s.branch || 'Genel',
              gradeLevel: s.gradeLevel,
              schoolLevel: s.schoolLevel || (s.gradeLevel && parseInt(s.gradeLevel) >= 9 ? 'Lise' : 'Ortaokul'),
              academicYear: '2026-2027',
              createdTeacherId: 'teacher-1',
            };
            remoteMap.set(s.classId, recoveredClass);
          }
        }
      });

      // 4. Merge remote classes into local state
      remoteMap.forEach((rc, id) => {
        if (this.deletedClassIds.has(id)) return;
        const localIdx = this.classes.findIndex((c) => c.id === id);
        if (localIdx === -1) {
          this.classes.push(rc);
          changed = true;
        } else {
          const cur = this.classes[localIdx];
          if (cur.name !== rc.name || (rc.branch && cur.branch !== rc.branch)) {
            this.classes[localIdx] = { ...cur, ...rc };
            changed = true;
          }
        }
      });

      // 5. If this device has local classes that Supabase doesn't have, push them to cloud
      let needsUpload = false;
      for (const lc of this.classes) {
        if (!this.deletedClassIds.has(lc.id) && !remoteMap.has(lc.id)) {
          needsUpload = true;
          break;
        }
      }
      if (needsUpload) {
        await this.syncAllClassesToCloud();
      }

      if (changed) {
        saveData(STORAGE_KEYS.CLASSES, this.classes);
        try {
          localStorage.setItem(PERMANENT_KEYS.MASTER_CLASSES, JSON.stringify(this.classes));
        } catch {}
        this.notify();
      }

      return this.classes;
    } catch (e) {
      if (!isBackground) console.warn('Exception in syncClassesFromSupabase:', e);
      return this.classes;
    }
  }

  // --- STUDENTS ---
  public registerStudent(
    studentData: Omit<Student, 'id' | 'createdAt' | 'status'>,
    forcedTeacherId?: string
  ): Student {
    const session = this.getAuthSession();
    const currentTeacherId =
      forcedTeacherId || (session?.role === 'teacher' ? session.user.id : undefined);

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

    // Also attempt async upsert to Supabase with valid schema fields
    supabase
      .from('students')
      .upsert([
        {
          id: newStudent.id,
          name: newStudent.name,
          student_number: newStudent.studentNumber || `${Math.floor(1000 + Math.random() * 9000)}`,
          class_id: newStudent.classId || 'class-default',
          class_name: newStudent.className || 'Genel',
          email: newStudent.email || null,
          phone: newStudent.phone || null,
          avatar: newStudent.avatar || null,
          registered_at: newStudent.createdAt,
        },
      ])
      .then();

    this.notify();
    return newStudent;
  }

  public registerStudentsBulk(
    studentsData: Array<Omit<Student, 'id' | 'createdAt' | 'status'> & { autoCreateClass?: boolean }>,
    forcedTeacherId?: string
  ): Student[] {
    const session = this.getAuthSession();
    const currentTeacherId =
      forcedTeacherId || (session?.role === 'teacher' ? session.user.id : undefined);
    const createdList: Student[] = [];
    const timestamp = Date.now();

    studentsData.forEach((item, index) => {
      let classObj = this.classes.find(
        (c) =>
          c.id === item.classId ||
          c.name.toLowerCase() === (item.className || '').trim().toLowerCase()
      );

      // Auto-create class if not exists and className provided
      if (!classObj && item.className && item.className.trim() !== '') {
        const newClassId = `class-${timestamp + index}`;
        const newClass: ClassGroup = {
          id: newClassId,
          name: item.className.trim(),
          branch: 'Genel',
          academicYear: '2026-2027',
          description: 'Excel yüklemesi ile otomatik oluşturuldu',
          createdTeacherId: currentTeacherId,
        };
        this.classes.push(newClass);
        classObj = newClass;
        if (currentTeacherId) {
          const t = this.teachers.find((item) => item.id === currentTeacherId);
          if (t) {
            if (!t.assignedClassIds) t.assignedClassIds = [];
            if (!t.assignedClassIds.includes(newClassId)) {
              t.assignedClassIds.push(newClassId);
            }
          }
        }
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
    });

    saveData(STORAGE_KEYS.CLASSES, this.classes);
    saveData(STORAGE_KEYS.STUDENTS, this.students);
    saveData(STORAGE_KEYS.TEACHERS, this.teachers);

    // Attempt async upsert to Supabase for bulk records with matching columns
    if (createdList.length > 0) {
      const payload = createdList.map((s) => ({
        id: s.id,
        name: s.name,
        student_number: s.studentNumber || `${Math.floor(1000 + Math.random() * 9000)}`,
        class_id: s.classId || 'class-default',
        class_name: s.className || 'Genel',
        email: s.email || null,
        phone: s.phone || null,
        avatar: s.avatar || null,
        registered_at: s.createdAt,
      }));
      supabase.from('students').upsert(payload).then();
    }

    this.notify();
    return createdList;
  }

  public updateStudent(id: string, updates: Partial<Student>): void {
    if (updates.email !== undefined) {
      updates.email = cleanStudentEmail(updates.email);
    }
    if (updates.classId) {
      const cls = this.classes.find((c) => c.id === updates.classId);
      if (cls) updates.className = cls.name;
    }
    this.students = this.students.map((s) => (s.id === id ? { ...s, ...updates } : s));
    saveData(STORAGE_KEYS.STUDENTS, this.students);

    const updated = this.students.find((s) => s.id === id);
    if (updated) {
      supabase
        .from('students')
        .upsert([
          {
            id: updated.id,
            name: updated.name,
            student_number: updated.studentNumber || `${Math.floor(1000 + Math.random() * 9000)}`,
            class_id: updated.classId || 'class-default',
            class_name: updated.className || 'Genel',
            email: updated.email || null,
            phone: updated.phone || null,
            avatar: updated.avatar || null,
            registered_at: updated.createdAt || new Date().toISOString(),
          },
        ])
        .then();
    }

    const currentSession = this.getAuthSession();
    if (currentSession?.role === 'student' && currentSession.user.id === id) {
      const updatedStudent = this.students.find((s) => s.id === id);
      if (updatedStudent) {
        this.setAuthSession({
          ...currentSession,
          user: updatedStudent,
        });
      }
    }

    this.notify();
  }

  public deleteStudent(id: string): void {
    this.deleteStudents([id]);
  }

  public deleteStudents(ids: string[]): void {
    if (!ids || ids.length === 0) return;
    const idSet = new Set(ids);
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

    supabase.from('students').delete().in('id', ids).then();

    this.notify();
  }

  // --- HOMEWORK ---
  public createHomework(homeworkData: Omit<Homework, 'id' | 'createdAt'>): Homework {
    const session = this.getAuthSession();
    const currentTeacher = session?.role === 'teacher' ? (session.user as Teacher) : null;
    const newHw: Homework = {
      ...homeworkData,
      id: `hw-${Date.now()}`,
      createdAt: new Date().toISOString(),
      teacherId: homeworkData.teacherId || currentTeacher?.id,
      createdByName: homeworkData.createdByName || currentTeacher?.name || 'Öğretmen',
    };
    this.homeworks.unshift(newHw);
    saveData(STORAGE_KEYS.HOMEWORK, this.homeworks);

    // Otomatik Öğrenci Bildirimi ve E-Posta Gönderimi
    this.dispatchHomeworkNotificationsAndEmails(newHw);

    // Cross-device Supabase push
    supabase.from('homeworks').upsert({
      id: newHw.id,
      title: newHw.title,
      description: newHw.description || '',
      subject: newHw.subject,
      assigned_to: newHw.classId || 'class-default',
      due_date: newHw.dueDate,
    }).then();

    this.notify();
    return newHw;
  }

  public updateHomework(id: string, updates: Partial<Homework>): void {
    this.homeworks = this.homeworks.map((h) => (h.id === id ? { ...h, ...updates } : h));
    saveData(STORAGE_KEYS.HOMEWORK, this.homeworks);
    this.notify();

    const updated = this.homeworks.find((h) => h.id === id);
    if (updated) {
      supabase.from('homeworks').upsert({
        id: updated.id,
        title: updated.title,
        description: updated.description || '',
        subject: updated.subject,
        assigned_to: updated.classId || 'class-default',
        due_date: updated.dueDate,
      }).then();
    }
  }

  public deleteHomework(id: string): void {
    this.deletedHomeworkIds.add(id);
    saveData(STORAGE_KEYS.DELETED_HOMEWORK, Array.from(this.deletedHomeworkIds));

    this.homeworks = this.homeworks.filter((h) => h.id !== id);
    this.submissions = this.submissions.filter((s) => s.homeworkId !== id);
    saveData(STORAGE_KEYS.HOMEWORK, this.homeworks);
    saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);
    this.notify();

    supabase.from('homeworks').delete().eq('id', id).then();
  }

  // --- SUBMISSIONS ---
  public submitHomework(
    homeworkId: string,
    studentId: string,
    notes: string,
    attachmentLink?: string,
    resources?: HomeworkResource[]
  ): HomeworkSubmission {
    const student = this.students.find((s) => s.id === studentId);
    const homework = this.homeworks.find((h) => h.id === homeworkId);

    const isLate = homework ? new Date() > new Date(homework.dueDate) : false;
    const status: 'on_time' | 'late' = isLate ? 'late' : 'on_time';

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
    this.notify();
    return submission;
  }

  public gradeSubmission(submissionId: string, score: number, feedback: string): void {
    this.submissions = this.submissions.map((s) =>
      s.id === submissionId ? { ...s, score, feedback } : s
    );
    saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);
    this.notify();
  }

  public updateHomeworkCheckStatus(
    homeworkId: string,
    studentId: string,
    checkStatus: HomeworkCheckStatus,
    note?: string
  ): HomeworkSubmission {
    const student = this.students.find((s) => s.id === studentId);
    const existingIndex = this.submissions.findIndex(
      (s) => s.homeworkId === homeworkId && s.studentId === studentId
    );

    const submissionStatus = checkStatus === 'yapti' ? 'on_time' : 'not_submitted';

    if (existingIndex >= 0) {
      const updated: HomeworkSubmission = {
        ...this.submissions[existingIndex],
        checkStatus,
        status: checkStatus === 'yapti' ? 'on_time' : this.submissions[existingIndex].status,
        notes: note !== undefined ? note : this.submissions[existingIndex].notes,
      };
      this.submissions[existingIndex] = updated;
      saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);
      this.notify();
      return updated;
    } else {
      const newSub: HomeworkSubmission = {
        id: `sub-${Date.now()}-${studentId}`,
        homeworkId,
        studentId,
        studentName: student ? student.name : 'Öğrenci',
        submittedAt: new Date().toISOString(),
        status: submissionStatus,
        checkStatus,
        notes: note || (checkStatus === 'yapti' ? 'Ödev tamamlandı' : checkStatus === 'eksik' ? 'Eksik ödev' : checkStatus === 'yapmadi' ? 'Ödev yapılmadı' : checkStatus === 'izinli' ? 'İzinli' : 'Derse gelmedi'),
      };
      this.submissions.unshift(newSub);
      saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);
      this.notify();
      return newSub;
    }
  }

  // --- ETUTS ---
  public createEtut(etutData: Omit<Etut, 'id' | 'createdAt'>): Etut {
    const session = this.getAuthSession();
    const currentTeacher = session?.role === 'teacher' ? (session.user as Teacher) : null;
    const newEtut: Etut = {
      ...etutData,
      id: `etut-${Date.now()}`,
      createdAt: new Date().toISOString(),
      lessonPeriod: etutData.lessonPeriod || 'Ders',
      teacherId: etutData.teacherId || currentTeacher?.id,
      teacherName: etutData.teacherName || currentTeacher?.name || 'Öğretmen',
      teacherBranch: etutData.teacherBranch || currentTeacher?.branch || etutData.subject,
      duration: Number(etutData.duration) || 45,
    };
    this.etuts.unshift(newEtut);
    saveData(STORAGE_KEYS.ETUTS, this.etuts);

    // Öğretmen ismini bu ders için kalıcı olarak kaydet
    if (newEtut.subject && newEtut.teacherName && newEtut.teacherName !== 'Öğretmen') {
      this.addTeacherToSubject(newEtut.subject, newEtut.teacherName);
      this.setLastTeacherForSubject(newEtut.subject, newEtut.teacherName);
    }

    // Otomatik Öğrenci Bildirimi ve E-Posta Gönderimi
    this.dispatchEtutNotificationsAndEmails(newEtut);

    this.notify();

    // Supabase anında bulut senkronizasyonu - Masaüstü & Telefon arasında anında görünürlük
    this.pushEtutToSupabase(newEtut);

    return newEtut;
  }

  public updateEtut(id: string, updates: Partial<Etut>): void {
    this.etuts = this.etuts.map((e) => (e.id === id ? { ...e, ...updates } : e));
    saveData(STORAGE_KEYS.ETUTS, this.etuts);

    const updated = this.etuts.find((e) => e.id === id);
    if (updated?.subject && updated?.teacherName && updated.teacherName !== 'Öğretmen') {
      this.addTeacherToSubject(updated.subject, updated.teacherName);
      this.setLastTeacherForSubject(updated.subject, updated.teacherName);
    }

    this.notify();

    // Push to Supabase
    if (updated) {
      this.pushEtutToSupabase(updated);
    }
  }

  public updateEtutAttendance(
    etutId: string,
    attendanceData: Record<string, EtutStudentAttendance>
  ): void {
    const etutIndex = this.etuts.findIndex((e) => e.id === etutId);
    if (etutIndex === -1) return;

    const currentEtut = this.etuts[etutIndex];
    const updatedEtut: Etut = {
      ...currentEtut,
      studentAttendance: {
        ...(currentEtut.studentAttendance || {}),
        ...attendanceData,
      },
    };

    this.etuts[etutIndex] = updatedEtut;
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

      this.recordAttendance({
        date: updatedEtut.date,
        classId: etutClassId,
        subject: `${updatedEtut.subject} (Etüt)`,
        records: attendanceRecordsList,
      });
    }

    this.notify();

    // Supabase push
    this.pushEtutToSupabase(updatedEtut);
  }

  public deleteEtut(id: string): void {
    this.deletedEtutIds.add(id);
    saveData(STORAGE_KEYS.DELETED_ETUTS, Array.from(this.deletedEtutIds));

    this.etuts = this.etuts.filter((e) => e.id !== id);
    saveData(STORAGE_KEYS.ETUTS, this.etuts);
    this.notify();

    // Supabase delete
    supabase.from('etuts').delete().eq('id', id).then(({ error }) => {
      if (error) console.error('[EtutSync] Error deleting etut from Supabase:', error);
    });
  }

  // --- ATTENDANCE ---
  public recordAttendance(attData: Omit<AttendanceRecord, 'id'>): AttendanceRecord {
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

    saveData(STORAGE_KEYS.ATTENDANCE, this.attendance);
    this.notify();

    // Supabase push
    supabase.from('attendance').upsert({
      id: record.id,
      class_id: record.classId,
      date: record.date,
      subject: record.subject || 'Genel',
      records: record.records || [],
    }).then();

    return record;
  }

  public deleteAttendance(id: string): void {
    this.attendance = this.attendance.filter((a) => a.id !== id);
    saveData(STORAGE_KEYS.ATTENDANCE, this.attendance);
    this.notify();

    supabase.from('attendance').delete().eq('id', id).then();
  }

  public deleteAttendanceForDate(date: string, classId: string, subject?: string): void {
    const toDelete = this.attendance.filter(
      (a) => a.date === date && a.classId === classId && (!subject || a.subject === subject)
    );
    this.attendance = this.attendance.filter(
      (a) => !(a.date === date && a.classId === classId && (!subject || a.subject === subject))
    );
    saveData(STORAGE_KEYS.ATTENDANCE, this.attendance);
    this.notify();

    toDelete.forEach((a) => {
      supabase.from('attendance').delete().eq('id', a.id).then();
    });
  }

  public deleteAttendanceStudentRecord(attendanceId: string, studentId: string): void {
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
      supabase.from('attendance').upsert({
        id: updated.id,
        class_id: updated.classId,
        date: updated.date,
        subject: updated.subject || 'Genel',
        records: updated.records || [],
      }).then();
    }
  }

  // --- GRADES ---
  public addGrade(gradeData: Omit<GradeRecord, 'id'>): GradeRecord {
    const student = this.students.find((s) => s.id === gradeData.studentId);
    const newGrade: GradeRecord = {
      ...gradeData,
      id: `gr-${Date.now()}`,
      studentName: student?.name,
    };
    this.grades.unshift(newGrade);
    saveData(STORAGE_KEYS.GRADES, this.grades);
    this.notify();

    supabase.from('grades').upsert({
      id: newGrade.id,
      student_id: newGrade.studentId,
      class_id: newGrade.classId || 'c-1',
      subject: newGrade.subject,
      score: newGrade.score,
      exam_type: newGrade.examType || 'Yazılı',
      date: newGrade.date,
    }).then();

    return newGrade;
  }

  public updateGrade(id: string, updates: Partial<GradeRecord>): void {
    this.grades = this.grades.map((g) => (g.id === id ? { ...g, ...updates } : g));
    saveData(STORAGE_KEYS.GRADES, this.grades);
    this.notify();

    const updated = this.grades.find((g) => g.id === id);
    if (updated) {
      supabase.from('grades').upsert({
        id: updated.id,
        student_id: updated.studentId,
        class_id: updated.classId || 'c-1',
        subject: updated.subject,
        score: updated.score,
        exam_type: updated.examType || 'Yazılı',
        date: updated.date,
      }).then();
    }
  }

  public deleteGrade(id: string): void {
    this.grades = this.grades.filter((g) => g.id !== id);
    saveData(STORAGE_KEYS.GRADES, this.grades);
    this.notify();

    supabase.from('grades').delete().eq('id', id).then();
  }

  // --- MESSAGES ---
  public sendMessageToTeacher(
    studentId: string,
    subject: string,
    text: string,
    linkUrl?: string
  ): StudentMessage {
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
    saveData(STORAGE_KEYS.MESSAGES, this.messages);
    this.notify();
    return newMsg;
  }

  public markMessageAsRead(id: string): void {
    this.messages = this.messages.map((m) => (m.id === id ? { ...m, read: true } : m));
    saveData(STORAGE_KEYS.MESSAGES, this.messages);
    this.notify();
  }

  public replyToMessage(id: string, replyText: string): void {
    this.messages = this.messages.map((m) =>
      m.id === id
        ? {
            ...m,
            teacherReply: replyText,
            repliedAt: new Date().toISOString(),
            read: true,
          }
        : m
    );
    saveData(STORAGE_KEYS.MESSAGES, this.messages);
    this.notify();
  }

  public deleteMessage(id: string): void {
    this.messages = this.messages.filter((m) => m.id !== id);
    saveData(STORAGE_KEYS.MESSAGES, this.messages);
    this.notify();
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

  // --- GETTERS (SCOPED BY AUTH & ROLE PERMISSION) ---
  public getAllStudents(): Student[] {
    return [...this.students];
  }

  public getAllClasses(): ClassGroup[] {
    return [...this.classes];
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
        return this.students;
      }

      // Yönetici bu öğretmene önceden eklenmiş tüm sınıf ve öğrenci listelerini görme izni vermişse görebilir
      if (teacher?.canViewAllStudentsAndClasses) {
        return this.students;
      }

      // Normal öğretmen: İzinli sınıflardaki öğrencileri VEYA kendi eklediği öğrencileri görebilir
      const permittedClasses = this.getClasses(teacherId);
      const permittedClassIds = new Set(permittedClasses.map((c) => c.id));
      const permittedClassNames = new Set(
        permittedClasses.map((c) => (c.name || '').trim().toLowerCase().replace(/[\s\-_/\\.]/g, ''))
      );

      return this.students.filter((s) => {
        if (s.createdTeacherId && s.createdTeacherId === teacherId) return true;
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
      return this.students.filter((s) => s.id === studentId);
    }

    return this.students;
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
        return this.classes;
      }

      // Yönetici bu öğretmene önceden eklenmiş sınıf listelerini görme izni vermişse görebilir
      if (teacher?.canViewAllStudentsAndClasses) {
        return this.classes;
      }

      // Normal kullanıcı/öğretmen: Yalnızca yöneticinin izin verdiği sınıfları veya kendi oluşturduğu sınıfları görebilir
      const rawAssigned = teacher?.assignedClassIds || [];
      const assignedClassIds = new Set(rawAssigned);

      // Collect normalized names of assigned classes to handle ID mismatches across devices
      const assignedNormNames = new Set<string>();
      rawAssigned.forEach((item) => {
        assignedNormNames.add(item.trim().toLowerCase().replace(/[\s\-_/\\.]/g, ''));
        const matched = this.classes.find((c) => c.id === item || c.name === item);
        if (matched?.name) {
          assignedNormNames.add(matched.name.trim().toLowerCase().replace(/[\s\-_/\\.]/g, ''));
        }
      });

      return this.classes.filter((c) => {
        if (c.createdTeacherId && c.createdTeacherId === teacherId) return true;
        if (assignedClassIds.has(c.id) || assignedClassIds.has(c.name)) return true;
        const normName = (c.name || '').trim().toLowerCase().replace(/[\s\-_/\\.]/g, '');
        if (assignedNormNames.has(normName)) return true;
        return false;
      });
    }

    if (session?.role === 'student') {
      const student = session.user as Student;
      return this.classes.filter((c) => c.id === student.classId || c.name === student.className);
    }

    return this.classes;
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
        return this.homeworks;
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

    return this.homeworks;
  }

  public getEtuts(forTeacherId?: string): Etut[] {
    const session = this.getAuthSession();

    // Öğretmen ve Yönetici Görünümü:
    // Bilgisayar, tablet ve telefondan açılan tüm oturumlarda kurumdaki planlı etütlerin eksiksiz görünmesi sağlanır
    if (forTeacherId || session?.role === 'teacher') {
      return this.etuts;
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

    return this.etuts;
  }

  public getGrades(forTeacherId?: string): GradeRecord[] {
    const session = this.getAuthSession();

    if (forTeacherId || session?.role === 'teacher') {
      const teacherId = forTeacherId || session?.user.id;
      const teacher = this.teachers.find((t) => t.id === teacherId);
      if (teacher?.isAdmin) return this.grades;

      const visibleStudents = new Set(this.getStudents(teacherId).map((s) => s.id));
      return this.grades.filter((g) => visibleStudents.has(g.studentId));
    }

    if (session?.role === 'student') {
      return this.grades.filter((g) => g.studentId === session.user.id);
    }

    return this.grades;
  }

  public getAttendance(forTeacherId?: string): AttendanceRecord[] {
    const session = this.getAuthSession();

    if (forTeacherId || session?.role === 'teacher') {
      const teacherId = forTeacherId || session?.user.id;
      const teacher = this.teachers.find((t) => t.id === teacherId);
      if (teacher?.isAdmin) return this.attendance;

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

    return this.attendance;
  }

  public getMessages(forTeacherId?: string): StudentMessage[] {
    const session = this.getAuthSession();

    if (forTeacherId || session?.role === 'teacher') {
      const teacherId = forTeacherId || session?.user.id;
      const teacher = this.teachers.find((t) => t.id === teacherId);
      if (teacher?.isAdmin) return this.messages;

      const visibleStudents = new Set(this.getStudents(teacherId).map((s) => s.id));
      return this.messages.filter((m) => visibleStudents.has(m.studentId));
    }

    if (session?.role === 'student') {
      return this.messages.filter((m) => m.studentId === session.user.id);
    }

    return this.messages;
  }

  public getSubmissions(forTeacherId?: string): HomeworkSubmission[] {
    const session = this.getAuthSession();

    if (forTeacherId || session?.role === 'teacher') {
      const teacherId = forTeacherId || session?.user.id;
      const teacher = this.teachers.find((t) => t.id === teacherId);
      if (teacher?.isAdmin) return this.submissions;

      const visibleStudents = new Set(this.getStudents(teacherId).map((s) => s.id));
      return this.submissions.filter((sub) => visibleStudents.has(sub.studentId));
    }

    if (session?.role === 'student') {
      return this.submissions.filter((sub) => sub.studentId === session.user.id);
    }

    return this.submissions;
  }

  public sendMessage(msgData: Omit<StudentMessage, 'id' | 'createdAt' | 'read'>): StudentMessage {
    const newMsg: StudentMessage = {
      ...msgData,
      id: `msg-${Date.now()}`,
      createdAt: new Date().toISOString(),
      read: false,
    };
    this.messages.unshift(newMsg);
    saveData(STORAGE_KEYS.MESSAGES, this.messages);
    this.notify();
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
    return this.documents;
  }

  public addTeacherDocument(doc: Omit<TeacherDocument, 'id' | 'uploadedAt'>): TeacherDocument {
    const newDoc: TeacherDocument = {
      ...doc,
      id: `doc-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      uploadedAt: new Date().toISOString(),
    };
    this.documents = [newDoc, ...this.documents];
    saveData(STORAGE_KEYS.DOCUMENTS, this.documents);
    this.notify();
    return newDoc;
  }

  public deleteTeacherDocument(id: string): void {
    this.documents = this.documents.filter((d) => d.id !== id);
    saveData(STORAGE_KEYS.DOCUMENTS, this.documents);
    this.notify();
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

  public saveQuestionLog(
    logData: Omit<StudentQuestionLog, 'id' | 'createdAt' | 'totalQuestions'> & {
      id?: string;
      totalQuestions?: number;
    }
  ): StudentQuestionLog {
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

      // Cross-device Supabase push
      supabase.from('homeworks').upsert({
        id: '__system_sync_question_logs__',
        title: 'Question Logs Sync',
        description: JSON.stringify(this.questionLogs.slice(-250)),
        subject: 'SystemSync',
        assigned_to: '__SYSTEM__',
        due_date: '2099-12-31',
      }).then();

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

      // Cross-device Supabase push
      supabase.from('homeworks').upsert({
        id: '__system_sync_question_logs__',
        title: 'Question Logs Sync',
        description: JSON.stringify(this.questionLogs.slice(-250)),
        subject: 'SystemSync',
        assigned_to: '__SYSTEM__',
        due_date: '2099-12-31',
      }).then();

      return newLog;
    }
  }

  public deleteQuestionLog(id: string): void {
    this.questionLogs = this.questionLogs.filter((q) => q.id !== id);
    saveData(STORAGE_KEYS.QUESTION_LOGS, this.questionLogs);
    this.notify();

    // Cross-device Supabase push
    supabase.from('homeworks').upsert({
      id: '__system_sync_question_logs__',
      title: 'Question Logs Sync',
      description: JSON.stringify(this.questionLogs.slice(-250)),
      subject: 'SystemSync',
      assigned_to: '__SYSTEM__',
      due_date: '2099-12-31',
    }).then();
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

  public clearAllQuestionLogs(): void {
    this.questionLogs = [];
    saveData(STORAGE_KEYS.QUESTION_LOGS, this.questionLogs);
    this.notify();
  }

  public seedInitialQuestionLogs(): void {
    // Soru sayıları otomatik yüklenmez; kullanıcıların ve öğrencilerin kendi girdiği gerçek kayıtlar tutulur.
  }

  // --- WEEKLY QUESTION TARGETS (ÖĞRENCİ HAFTALIK SORU HEDEFLERİ) ---
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
      return this.weeklyQuestionTargets.filter((t) => visibleStudentIds.has(t.studentId));
    }
    return [...this.weeklyQuestionTargets];
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

  public setWeeklyQuestionTarget(target: WeeklyQuestionTarget): WeeklyQuestionTarget {
    const existingIdx = this.weeklyQuestionTargets.findIndex((t) => {
      if (t.studentId !== target.studentId) return false;
      if (target.weekStartDate && t.weekStartDate) {
        return t.weekStartDate === target.weekStartDate;
      }
      return true;
    });
    let savedTarget: WeeklyQuestionTarget;

    const normalizedTarget: WeeklyQuestionTarget = {
      ...target,
      targetQuestions: target.targetQuestions || target.weeklyTarget || 350,
      weeklyTarget: target.weeklyTarget || target.targetQuestions || 350,
      dailyTarget: target.dailyTarget || Math.round((target.targetQuestions || target.weeklyTarget || 350) / 7),
    };

    if (existingIdx !== -1) {
      savedTarget = {
        ...this.weeklyQuestionTargets[existingIdx],
        ...normalizedTarget,
        assignedDate: target.assignedDate || new Date().toISOString(),
      };
      this.weeklyQuestionTargets[existingIdx] = savedTarget;
    } else {
      savedTarget = {
        ...normalizedTarget,
        id: target.id || `target-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        assignedDate: target.assignedDate || new Date().toISOString(),
      };
      this.weeklyQuestionTargets.unshift(savedTarget);
    }

    saveData(STORAGE_KEYS.WEEKLY_QUESTION_TARGETS, this.weeklyQuestionTargets);
    this.notify();

    // Cross-device Supabase push
    supabase.from('homeworks').upsert({
      id: '__system_sync_question_targets__',
      title: 'Question Targets Sync',
      description: JSON.stringify(this.weeklyQuestionTargets),
      subject: 'SystemSync',
      assigned_to: '__SYSTEM__',
      due_date: '2099-12-31',
    }).then();

    return savedTarget;
  }

  public deleteWeeklyQuestionTarget(studentIdOrId: string, weekStartDate?: string): void {
    this.weeklyQuestionTargets = this.weeklyQuestionTargets.filter((t) => {
      if (weekStartDate) {
        if (t.studentId === studentIdOrId && t.weekStartDate === weekStartDate) return false;
      }
      return t.id !== studentIdOrId && t.studentId !== studentIdOrId;
    });
    saveData(STORAGE_KEYS.WEEKLY_QUESTION_TARGETS, this.weeklyQuestionTargets);
    this.notify();

    // Cross-device Supabase push
    supabase.from('homeworks').upsert({
      id: '__system_sync_question_targets__',
      title: 'Question Targets Sync',
      description: JSON.stringify(this.weeklyQuestionTargets),
      subject: 'SystemSync',
      assigned_to: '__SYSTEM__',
      due_date: '2099-12-31',
    }).then();
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
