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
import { sendBrowserNotification } from '../lib/browserNotifications';
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

// DATA STORE LOCAL STORAGE KEYS
const STORAGE_KEYS = {
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
};

const LEGACY_VERSIONS = ['_v5', '_v4', '_v3', '_v2', '_v1', ''];

export const PERMANENT_KEYS = {
  MASTER_STUDENTS: 'edu_sys_master_students_permanent',
  MASTER_CLASSES: 'edu_sys_master_classes_permanent',
};

// Safely clean up old versioned keys to free storage quota, but NEVER delete user data
function cleanUpLegacyKeys(): void {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.includes('_v1') || k.includes('_v2') || k.includes('_v3') || k.includes('_v4') || k.includes('_v5'))) {
        // CRITICAL: NEVER DELETE STUDENTS, CLASSES, TEACHERS OR USER DATA KEYS
        if (
          k.includes('student') ||
          k.includes('class') ||
          k.includes('teacher') ||
          k.includes('homework') ||
          k.includes('etut') ||
          k.includes('grade') ||
          k.includes('attendance') ||
          k.includes('master')
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
      try {
        localStorage.setItem(PERMANENT_KEYS.MASTER_STUDENTS, JSON.stringify(data));
      } catch {}
    }
    if (key === STORAGE_KEYS.CLASSES) {
      try {
        localStorage.setItem(PERMANENT_KEYS.MASTER_CLASSES, JSON.stringify(data));
      } catch {}
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

    const alreadyInitialized = isAlreadyInitialized();

    if (!alreadyInitialized && resilientStudents.length === 0 && resilientClasses.length === 0) {
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
      // Load strictly what is saved in storage; never wipe existing students or classes
      this.teachers = loadDataWithLegacyFallback(STORAGE_KEYS.TEACHERS, INITIAL_TEACHERS);
      if (!this.teachers || this.teachers.length === 0) {
        this.teachers = INITIAL_TEACHERS.map((t) => ({ ...t, status: 'approved' as const }));
        saveData(STORAGE_KEYS.TEACHERS, this.teachers);
      }
      this.classes = resilientClasses.length > 0 ? resilientClasses : loadDataWithLegacyFallback(STORAGE_KEYS.CLASSES, []);
      this.students = resilientStudents.length > 0 ? resilientStudents : loadDataWithLegacyFallback(STORAGE_KEYS.STUDENTS, []);
      this.homeworks = loadDataWithLegacyFallback(STORAGE_KEYS.HOMEWORK, []);
      this.submissions = loadDataWithLegacyFallback(STORAGE_KEYS.SUBMISSIONS, []);
      this.etuts = loadDataWithLegacyFallback(STORAGE_KEYS.ETUTS, []);
      this.attendance = loadDataWithLegacyFallback(STORAGE_KEYS.ATTENDANCE, []);
      this.grades = loadDataWithLegacyFallback(STORAGE_KEYS.GRADES, []);
      this.messages = loadDataWithLegacyFallback(STORAGE_KEYS.MESSAGES, []);
      this.documents = loadDataWithLegacyFallback(STORAGE_KEYS.DOCUMENTS, []);
      this.studentNotifications = loadDataWithLegacyFallback(STORAGE_KEYS.STUDENT_NOTIFICATIONS, []);
      this.sentEmails = loadDataWithLegacyFallback(STORAGE_KEYS.SENT_EMAILS, []);
      this.questionLogs = loadDataWithLegacyFallback(STORAGE_KEYS.QUESTION_LOGS, []);

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

    // Clean up any old duplicate legacy version keys to keep storage lean and prevent quota limit errors
    cleanUpLegacyKeys();

    if (this.studentNotifications.length === 0 && this.homeworks.length > 0) {
      this.seedInitialNotifications();
    }

    if (this.questionLogs.length === 0 && this.students.length > 0) {
      this.seedInitialQuestionLogs();
    }

    // Background sync with Supabase (respects deleted students)
    this.syncFromSupabase();
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
            const updated: Student = {
              ...cur,
              name: rs.name || cur.name,
              studentNumber: rs.student_number || cur.studentNumber,
              className: rs.class_name || cur.className,
              classId: rs.class_id || cur.classId,
              email: rs.email || cur.email,
              phone: rs.phone || cur.phone,
              avatar: rs.avatar || cur.avatar,
              schoolLevel: cur.schoolLevel || detectSchoolLevelFromGrade(rs.class_name) || 'Ortaokul',
            };
            if (JSON.stringify(updated) !== JSON.stringify(cur)) {
              this.students[existingIdx] = updated;
              hasChanges = true;
            }
          } else {
            const newStd: Student = {
              id: rs.id,
              name: rs.name,
              username:
                rs.student_number ||
                rs.email?.split('@')[0] ||
                rs.name.toLowerCase().replace(/\s+/g, '_'),
              email: rs.email || '',
              password: '123',
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

      // 3. Sync classes with Supabase
      const { data: remoteClasses, error: errCls } = await supabase.from('classes').select('*');
      if (!errCls && remoteClasses && remoteClasses.length > 0) {
        let classesChanged = false;
        remoteClasses.forEach((rc: any) => {
          if (this.deletedClassIds.has(rc.id)) return;
          if (!this.classes.find((c) => c.id === rc.id || c.name === rc.name)) {
            this.classes.push({
              id: rc.id,
              name: rc.name,
              branch: rc.branch || 'Genel',
              academicYear: rc.academic_year || '2026-2027',
              createdTeacherId: 'teacher-1',
            });
            classesChanged = true;
          }
        });
        if (classesChanged) {
          saveData(STORAGE_KEYS.CLASSES, this.classes);
          this.notify();
        }
      }
    } catch (e) {
      // Offline fallback is active
    }
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

  public getTeachers(): Teacher[] {
    const currentTeacher = this.getCurrentTeacher();
    if (currentTeacher?.isAdmin) {
      return [...this.teachers];
    }
    // Mask passwords for non-admins to protect privacy
    return this.teachers.map((t) => ({
      ...t,
      password: t.id === currentTeacher?.id ? t.password : undefined,
    }));
  }

  public getPendingTeachers(): Teacher[] {
    return this.teachers.filter((t) => t.status === 'pending');
  }

  public approveTeacher(teacherId: string): void {
    this.teachers = this.teachers.map((t) => (t.id === teacherId ? { ...t, status: 'approved' } : t));
    saveData(STORAGE_KEYS.TEACHERS, this.teachers);
    this.notify();
  }

  public rejectTeacher(teacherId: string): void {
    this.teachers = this.teachers.map((t) => (t.id === teacherId ? { ...t, status: 'rejected' } : t));
    saveData(STORAGE_KEYS.TEACHERS, this.teachers);
    this.notify();
  }

  public deleteTeacher(teacherId: string): void {
    this.deletedTeacherIds.add(teacherId);
    saveData(STORAGE_KEYS.DELETED_TEACHERS, Array.from(this.deletedTeacherIds));
    this.teachers = this.teachers.filter((t) => t.id !== teacherId);
    saveData(STORAGE_KEYS.TEACHERS, this.teachers);
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

      const currentSession = this.getAuthSession();
      if (currentSession?.role === 'teacher' && currentSession.user.id === teacherId) {
        this.setAuthSession({
          ...currentSession,
          user: this.teachers[idx],
        });
      }

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

      const currentSession = this.getAuthSession();
      if (currentSession?.role === 'teacher' && currentSession.user.id === teacherId) {
        this.setAuthSession({
          ...currentSession,
          user: this.teachers[idx],
        });
      }

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
    };

    this.teachers.unshift(newTeacher);
    saveData(STORAGE_KEYS.TEACHERS, this.teachers);
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
    const saved = loadData<AuthSession | null>(STORAGE_KEYS.AUTH_SESSION, null);
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
      saveData(STORAGE_KEYS.AUTH_SESSION, session);
    } else {
      try {
        localStorage.removeItem(STORAGE_KEYS.AUTH_SESSION);
      } catch (e) {
        console.error(e);
      }
    }
    this.notify();
  }

  public logout(): void {
    this.setAuthSession(null);
  }

  // --- BENİ HATIRLA / KOLAY GİRİŞ ---
  public getRememberedUser(role?: UserRole): {
    role: UserRole;
    identifier: string;
    name: string;
    avatar?: string;
    branch?: string;
    className?: string;
  } | null {
    let saved: {
      role: UserRole;
      identifier: string;
      name: string;
      avatar?: string;
      branch?: string;
      className?: string;
    } | null = null;

    if (role === 'teacher') {
      saved = loadData(STORAGE_KEYS.REMEMBER_ME_TEACHER, null);
      if (!saved) {
        const general = loadData<{ role: UserRole; identifier: string; name: string; avatar?: string; branch?: string; className?: string } | null>(STORAGE_KEYS.REMEMBER_ME, null);
        if (general?.role === 'teacher') saved = general;
      }
      // Öğretmen için kayıtlı kullanıcı yoksa varsayılan onaylı öğretmeni getir (asla öğrenci dönmez)
      if (!saved) {
        const defaultTeacher = this.teachers.find((t) => t.status === 'approved') || this.teachers[0];
        if (defaultTeacher) {
          saved = {
            role: 'teacher',
            identifier: defaultTeacher.username,
            name: defaultTeacher.name,
            avatar: defaultTeacher.avatar,
            branch: defaultTeacher.branch,
          };
        }
      }
    } else if (role === 'student') {
      saved = loadData(STORAGE_KEYS.REMEMBER_ME_STUDENT, null);
      if (!saved) {
        const general = loadData<{ role: UserRole; identifier: string; name: string; avatar?: string; branch?: string; className?: string } | null>(STORAGE_KEYS.REMEMBER_ME, null);
        if (general?.role === 'student') saved = general;
      }
    } else {
      saved = loadData(STORAGE_KEYS.REMEMBER_ME, null);
      if (!saved) {
        saved = loadData(STORAGE_KEYS.REMEMBER_ME_TEACHER, null) || loadData(STORAGE_KEYS.REMEMBER_ME_STUDENT, null);
      }
    }

    if (!saved) return null;

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
    } | null,
    targetRole?: UserRole
  ): void {
    if (data) {
      saveData(STORAGE_KEYS.REMEMBER_ME, data);
      if (data.role === 'teacher') {
        saveData(STORAGE_KEYS.REMEMBER_ME_TEACHER, data);
      } else if (data.role === 'student') {
        saveData(STORAGE_KEYS.REMEMBER_ME_STUDENT, data);
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
  public addClass(classData: Omit<ClassGroup, 'id'>, forcedTeacherId?: string): ClassGroup {
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

    saveData(STORAGE_KEYS.CLASSES, this.classes);
    this.notify();
    return newClass;
  }

  public updateClass(id: string, updates: Partial<ClassGroup>): void {
    this.classes = this.classes.map((c) => (c.id === id ? { ...c, ...updates } : c));
    saveData(STORAGE_KEYS.CLASSES, this.classes);
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
    this.notify();
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
    const studentPassword = studentData.password?.trim() || '123456';
    const newStudent: Student = {
      ...studentData,
      id: `std-${Date.now()}`,
      username: cleanUsername,
      email: studentData.email?.trim() || '',
      password: studentPassword,
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

      const newStudent: Student = {
        id: studentId,
        name: cleanName,
        username:
          item.username?.trim() ||
          item.email?.split('@')[0] ||
          cleanName.toLowerCase().replace(/\s+/g, '_'),
        email:
          item.email?.trim() ||
          `${cleanName.toLowerCase().replace(/[^a-z0-9]/g, '')}${Math.floor(10 + Math.random() * 90)}@okul.k12.tr`,
        password: item.password || '123',
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
    this.deletedStudentIds.add(id);
    saveData(STORAGE_KEYS.DELETED_STUDENTS, Array.from(this.deletedStudentIds));

    this.students = this.students.filter((s) => s.id !== id);
    this.submissions = this.submissions.filter((sub) => sub.studentId !== id);
    this.grades = this.grades.filter((g) => g.studentId !== id);
    this.messages = this.messages.filter((m) => m.studentId !== id);
    // Clean up student from etuts if specific studentIds list
    this.etuts = this.etuts.map((e) => {
      if (Array.isArray(e.assignedStudentIds)) {
        return {
          ...e,
          assignedStudentIds: e.assignedStudentIds.filter((sid) => sid !== id),
        };
      }
      return e;
    });
    // Clean up student from attendance records
    this.attendance = this.attendance.map((att) => ({
      ...att,
      records: att.records.filter((r) => r.studentId !== id),
    }));

    saveData(STORAGE_KEYS.STUDENTS, this.students);
    saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);
    saveData(STORAGE_KEYS.GRADES, this.grades);
    saveData(STORAGE_KEYS.MESSAGES, this.messages);
    saveData(STORAGE_KEYS.ETUTS, this.etuts);
    saveData(STORAGE_KEYS.ATTENDANCE, this.attendance);

    supabase.from('students').delete().eq('id', id).then();

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

    this.notify();
    return newHw;
  }

  public updateHomework(id: string, updates: Partial<Homework>): void {
    this.homeworks = this.homeworks.map((h) => (h.id === id ? { ...h, ...updates } : h));
    saveData(STORAGE_KEYS.HOMEWORK, this.homeworks);
    this.notify();
  }

  public deleteHomework(id: string): void {
    this.deletedHomeworkIds.add(id);
    saveData(STORAGE_KEYS.DELETED_HOMEWORK, Array.from(this.deletedHomeworkIds));

    this.homeworks = this.homeworks.filter((h) => h.id !== id);
    this.submissions = this.submissions.filter((s) => s.homeworkId !== id);
    saveData(STORAGE_KEYS.HOMEWORK, this.homeworks);
    saveData(STORAGE_KEYS.SUBMISSIONS, this.submissions);
    this.notify();
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
        notes: note || (checkStatus === 'yapti' ? 'Ödev tamamlandı' : checkStatus === 'eksik' ? 'Eksik ödev' : checkStatus === 'yapmadi' ? 'Ödev yapılmadı' : 'Derse gelmedi'),
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
      teacherId: etutData.teacherId || currentTeacher?.id,
      teacherName: etutData.teacherName || currentTeacher?.name || 'Öğretmen',
    };
    this.etuts.unshift(newEtut);
    saveData(STORAGE_KEYS.ETUTS, this.etuts);

    // Otomatik Öğrenci Bildirimi ve E-Posta Gönderimi
    this.dispatchEtutNotificationsAndEmails(newEtut);

    this.notify();
    return newEtut;
  }

  public updateEtut(id: string, updates: Partial<Etut>): void {
    this.etuts = this.etuts.map((e) => (e.id === id ? { ...e, ...updates } : e));
    saveData(STORAGE_KEYS.ETUTS, this.etuts);
    this.notify();
  }

  public deleteEtut(id: string): void {
    this.deletedEtutIds.add(id);
    saveData(STORAGE_KEYS.DELETED_ETUTS, Array.from(this.deletedEtutIds));

    this.etuts = this.etuts.filter((e) => e.id !== id);
    saveData(STORAGE_KEYS.ETUTS, this.etuts);
    this.notify();
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
    return record;
  }

  public deleteAttendance(id: string): void {
    this.attendance = this.attendance.filter((a) => a.id !== id);
    saveData(STORAGE_KEYS.ATTENDANCE, this.attendance);
    this.notify();
  }

  public deleteAttendanceForDate(date: string, classId: string, subject?: string): void {
    this.attendance = this.attendance.filter(
      (a) => !(a.date === date && a.classId === classId && (!subject || a.subject === subject))
    );
    saveData(STORAGE_KEYS.ATTENDANCE, this.attendance);
    this.notify();
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
    return newGrade;
  }

  public updateGrade(id: string, updates: Partial<GradeRecord>): void {
    this.grades = this.grades.map((g) => (g.id === id ? { ...g, ...updates } : g));
    saveData(STORAGE_KEYS.GRADES, this.grades);
    this.notify();
  }

  public deleteGrade(id: string): void {
    this.grades = this.grades.filter((g) => g.id !== id);
    saveData(STORAGE_KEYS.GRADES, this.grades);
    this.notify();
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
    return this.etuts.filter((etut) => {
      if (etut.assignedStudentIds === 'all') return true;
      if (Array.isArray(etut.assignedStudentIds) && etut.assignedStudentIds.includes(studentId))
        return true;
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

      // Admin teachers have full visibility of all students
      if (
        teacher?.isAdmin ||
        !teacher ||
        teacher.id === 'teacher-1' ||
        teacher.username?.toLowerCase().includes('mustafa')
      ) {
        return this.students;
      }

      // Non-admin teacher: sees students they registered OR students in classes assigned to them by admin
      const assignedClassIds = new Set(teacher?.assignedClassIds || []);
      const filtered = this.students.filter(
        (s) =>
          s.createdTeacherId === teacherId ||
          (s.classId && assignedClassIds.has(s.classId))
      );

      // Fallback: if teacher has no explicit assignments, show all students so they don't see an empty screen
      if (filtered.length === 0 && assignedClassIds.size === 0) {
        return this.students;
      }
      return filtered;
    }

    // If viewing in student context
    if (session?.role === 'student') {
      // Students should NOT see other students' personal profiles or data
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

      if (teacher?.isAdmin) {
        return this.classes;
      }

      const assignedClassIds = new Set(teacher?.assignedClassIds || []);
      return this.classes.filter(
        (c) =>
          assignedClassIds.has(c.id) ||
          c.createdTeacherId === teacherId ||
          this.students.some((s) => s.createdTeacherId === teacherId && s.classId === c.id)
      );
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

      if (teacher?.isAdmin) {
        return this.homeworks;
      }

      const visibleClasses = new Set(this.getClasses(teacherId).map((c) => c.id));
      const visibleStudents = new Set(this.getStudents(teacherId).map((s) => s.id));

      return this.homeworks.filter((hw) => {
        if (hw.teacherId === teacherId || (teacher?.name && hw.createdByName === teacher.name)) {
          return true;
        }
        if (hw.targetClassIds && hw.targetClassIds.some((cid) => visibleClasses.has(cid))) {
          return true;
        }
        if (Array.isArray(hw.assignedTo) && hw.assignedTo.some((sid) => visibleStudents.has(sid))) {
          return true;
        }
        return false;
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

    if (forTeacherId || session?.role === 'teacher') {
      const teacherId = forTeacherId || session?.user.id;
      const teacher = this.teachers.find(
        (t) => t.id === teacherId || t.username?.toLowerCase() === session?.user.username?.toLowerCase()
      );

      if (teacher?.isAdmin) {
        return this.etuts;
      }

      const visibleStudents = new Set(this.getStudents(teacherId).map((s) => s.id));
      return this.etuts.filter(
        (e) =>
          e.teacherId === teacherId ||
          (Array.isArray(e.assignedStudentIds) && e.assignedStudentIds.some((sid) => visibleStudents.has(sid)))
      );
    }

    if (session?.role === 'student') {
      const studentId = session.user.id;
      return this.etuts.filter(
        (e) =>
          e.assignedStudentIds === 'all' ||
          (Array.isArray(e.assignedStudentIds) && e.assignedStudentIds.includes(studentId))
      );
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
    if (this.students.length === 0) return;
    const hw1 = this.homeworks.find((h) => h.id === 'hw-1') || this.homeworks[0];
    const etut1 = this.etuts[0];

    const sampleStudents = this.students.slice(0, 3);
    sampleStudents.forEach((st) => {
      if (hw1) {
        const emailContent = generateHomeworkEmail({
          studentName: st.name,
          studentEmail: st.email,
          teacherName: hw1.createdByName || 'M. Bilir',
          subject: hw1.subject,
          title: hw1.title,
          description: hw1.description,
          dueDate: hw1.dueDate,
          outcomes: hw1.outcomes || [],
          resourcesCount: hw1.resources?.length || 0,
        });

        this.sentEmails.push({
          id: `email-seed-hw-${st.id}`,
          recipientEmail: st.email,
          recipientName: st.name,
          recipientRole: 'student',
          studentId: st.id,
          type: 'homework_assigned',
          subject: emailContent.subject,
          htmlContent: emailContent.html,
          textContent: emailContent.text,
          sentAt: hw1.createdAt,
          status: 'delivered',
          sourceId: hw1.id,
          sourceTitle: hw1.title,
          teacherName: hw1.createdByName || 'M. Bilir',
        });

        this.studentNotifications.push({
          id: `notif-seed-hw-${st.id}`,
          studentId: st.id,
          type: 'new_homework',
          title: `Yeni Ödev: ${hw1.subject} - ${hw1.title}`,
          message: `${hw1.createdByName || 'M. Bilir'} öğretmeniniz yeni bir ödev tanımladı. Son teslim: ${formatDueDateTurkish(hw1.dueDate)}`,
          sourceId: hw1.id,
          sourceTitle: hw1.title,
          teacherName: hw1.createdByName || 'M. Bilir',
          createdAt: hw1.createdAt,
          read: false,
          linkTab: 'homework',
          emailSent: true,
          emailRecipient: st.email,
          emailDetails: {
            subject: emailContent.subject,
            bodyHtml: emailContent.html,
            sentAt: hw1.createdAt,
          },
        });
      }

      if (etut1) {
        const emailContent = generateEtutEmail({
          studentName: st.name,
          studentEmail: st.email,
          teacherName: etut1.teacherName || 'M. Bilir',
          subject: etut1.subject,
          topic: etut1.topic,
          date: etut1.date,
          time: etut1.time,
          duration: etut1.duration,
          location: etut1.location,
          notes: etut1.notes,
        });

        this.sentEmails.push({
          id: `email-seed-etut-${st.id}`,
          recipientEmail: st.email,
          recipientName: st.name,
          recipientRole: 'student',
          studentId: st.id,
          type: 'etut_assigned',
          subject: emailContent.subject,
          htmlContent: emailContent.html,
          textContent: emailContent.text,
          sentAt: etut1.createdAt,
          status: 'delivered',
          sourceId: etut1.id,
          sourceTitle: etut1.topic,
          teacherName: etut1.teacherName || 'M. Bilir',
        });

        this.studentNotifications.push({
          id: `notif-seed-etut-${st.id}`,
          studentId: st.id,
          type: 'new_etut',
          title: `Yeni Etüt: ${etut1.subject} - ${etut1.topic}`,
          message: `${formatEtutDateTurkish(etut1.date)} saat ${etut1.time}'de (${etut1.duration} dk) etüdünüz planlandı.`,
          sourceId: etut1.id,
          sourceTitle: etut1.topic,
          teacherName: etut1.teacherName || 'M. Bilir',
          createdAt: etut1.createdAt,
          read: false,
          linkTab: 'etuts',
          emailSent: true,
          emailRecipient: st.email,
          emailDetails: {
            subject: emailContent.subject,
            bodyHtml: emailContent.html,
            sentAt: etut1.createdAt,
          },
        });
      }
    });

    saveData(STORAGE_KEYS.STUDENT_NOTIFICATIONS, this.studentNotifications);
    saveData(STORAGE_KEYS.SENT_EMAILS, this.sentEmails);
  }

  // --- QUESTION LOGS (SORU SAYISI TAKİP) ---
  public getQuestionLogs(): StudentQuestionLog[] {
    return [...this.questionLogs];
  }

  public getQuestionLogsByStudent(studentId: string): StudentQuestionLog[] {
    return this.questionLogs.filter((q) => q.studentId === studentId);
  }

  public getQuestionLogsByClass(classId: string): StudentQuestionLog[] {
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
      return newLog;
    }
  }

  public deleteQuestionLog(id: string): void {
    this.questionLogs = this.questionLogs.filter((q) => q.id !== id);
    saveData(STORAGE_KEYS.QUESTION_LOGS, this.questionLogs);
    this.notify();
  }

  public seedInitialQuestionLogs(): void {
    if (this.students.length === 0) return;

    const today = new Date();
    const studentsToSeed = this.students.slice(0, 4);

    studentsToSeed.forEach((student, sIdx) => {
      const baseDaily = sIdx === 0 ? 55 : sIdx === 1 ? 45 : 35;

      // Generate for 35 days (5 weeks) back to ensure weekly & monthly comparisons work immediately
      for (let dayOffset = 34; dayOffset >= 0; dayOffset--) {
        const logDate = new Date(today);
        logDate.setDate(today.getDate() - dayOffset);
        const dayOfWeek = logDate.getDay(); // 0 is Sunday
        const dateStr = logDate.toISOString().slice(0, 10);

        // Leave some days as zero questions (e.g. Sunday or occasional rest day)
        if (dayOfWeek === 0 && dayOffset % 2 === 0) {
          continue; // Soru çözülmeyen gün
        }
        if (dayOfWeek === 3 && dayOffset > 14 && dayOffset % 3 === 0) {
          continue; // Soru çözülmeyen gün
        }

        // Slight progressive weekly growth to show realistic progress rate
        const growthBonus = (35 - dayOffset) * 0.008;
        const factor = (0.85 + Math.sin(dayOffset) * 0.15) * (1 + growthBonus);
        const dailyTarget = Math.max(20, Math.round(baseDaily * factor));

        const matQ = Math.round(dailyTarget * 0.4);
        const fenQ = Math.round(dailyTarget * 0.3);
        const turkQ = Math.max(5, dailyTarget - matQ - fenQ);

        const entries = [
          {
            subject: 'Matematik',
            questionCount: matQ,
            correctCount: Math.round(matQ * 0.86),
            wrongCount: Math.round(matQ * 0.1),
            emptyCount: Math.max(0, matQ - Math.round(matQ * 0.86) - Math.round(matQ * 0.1)),
          },
          {
            subject: student.schoolLevel === 'Ortaokul' ? 'Fen Bilimleri' : 'Fizik',
            questionCount: fenQ,
            correctCount: Math.round(fenQ * 0.82),
            wrongCount: Math.round(fenQ * 0.12),
            emptyCount: Math.max(0, fenQ - Math.round(fenQ * 0.82) - Math.round(fenQ * 0.12)),
          },
          {
            subject: 'Türkçe',
            questionCount: turkQ,
            correctCount: Math.round(turkQ * 0.9),
            wrongCount: Math.round(turkQ * 0.06),
            emptyCount: Math.max(0, turkQ - Math.round(turkQ * 0.9) - Math.round(turkQ * 0.06)),
          },
        ];

        const totalQuestions = entries.reduce((acc, e) => acc + e.questionCount, 0);
        const totalCorrect = entries.reduce((acc, e) => acc + (e.correctCount || 0), 0);
        const totalWrong = entries.reduce((acc, e) => acc + (e.wrongCount || 0), 0);
        const totalEmpty = entries.reduce((acc, e) => acc + (e.emptyCount || 0), 0);

        this.questionLogs.push({
          id: `qlog-${student.id}-${dateStr}`,
          studentId: student.id,
          studentName: student.name,
          classId: student.classId,
          className: student.className,
          date: dateStr,
          entries,
          totalQuestions,
          totalCorrect,
          totalWrong,
          totalEmpty,
          notes: totalQuestions >= 60 ? 'Hedef soru sayısı başarıyla aşıldı.' : 'Günlük soru hedefi tamamlandı.',
          createdAt: `${dateStr}T21:00:00.000Z`,
        });
      }
    });

    saveData(STORAGE_KEYS.QUESTION_LOGS, this.questionLogs);
  }
}

export const dataService = DataService.getInstance();
