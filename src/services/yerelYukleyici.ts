// ============================================================================
// Aşama 310: VERİ SERVİSİNİ AYIRMA, 5. PARÇA — AÇILIŞTA YEREL KAYITLARI DAYANIKLI OKUMA
// Uygulama açılırken öğrenci, sınıf, öğretmen, etüt, not, ödev, yoklama ve soru kayıtları bu cihazın deposundan
// okunur: bozuk kayıt atlanır, eski sürüm anahtarları temizlenir, silinmiş kayıt geri gelmez, sınıflar adına göre
// tekilleşir. Kod dataService.ts'ten KELİMESİ KELİMESİNE taşındı (yalnız başlarına "export" eklendi); davranış aynı.
// ============================================================================
import type { Student, Teacher, ClassGroup, Etut, GradeRecord, Homework, AttendanceRecord, StudentQuestionLog } from '../types';
import { STORAGE_KEYS, PERMANENT_KEYS, appStorage, loadDataWithLegacyFallback } from './depo';

// dataService.ts'teki gibi: "localStorage" adı uygulama deposunu gösterir (çıkışta kilitlenen, oturuma göre seçilen depo)
const localStorage = appStorage;

// Resilient student loader (Strictly prevents resurrection of deleted or legacy dummy students)
export function loadStudentsWithResilience(): Student[] {
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
export function loadClassesWithResilience(): ClassGroup[] {
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
export function loadTeachersWithResilience(): Teacher[] {
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
export function loadEtutsWithResilience(): Etut[] {
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
export function loadGradesWithResilience(): GradeRecord[] {
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
export function loadHomeworkWithResilience(): Homework[] {
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
export function loadAttendanceWithResilience(): AttendanceRecord[] {
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
export function loadQuestionLogsWithResilience(): StudentQuestionLog[] {
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

