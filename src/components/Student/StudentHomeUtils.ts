import type { ClassGroup, Etut, Homework, HomeworkSubmission, Student } from '../../types';

// ============================================================================
// Öğrenci ana sayfası yardımcıları
// Tarihler her zaman YEREL saatle (Türkiye) hesaplanır; toISOString() kullanılmaz.
// ============================================================================

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * "YYYY-MM-DD", "YYYY-MM-DDTHH:mm(:ss)" (yerel) veya tam ISO ("...Z" / "+03:00") metni Date'e çevirir.
 * Yalnızca gün verilmişse o günün sonu (23:59:59) kabul edilir. Geçersizse null.
 */
export function parseLocalDateTime(value?: string | null): Date | null {
  if (!value) return null;
  const s = value.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], 23, 59, 59, 999);
  m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], m[6] ? +m[6] : 0);
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t);
}

/** Yerel tarih → YYYY-MM-DD */
export const localYmd = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** Etüdün başlangıç zamanı (yerel). */
export function etutStart(e: Etut): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(e.date || '');
  if (!m) return null;
  const t = /^(\d{1,2}):(\d{2})/.exec(e.time || '');
  return new Date(+m[1], +m[2] - 1, +m[3], t ? +t[1] : 0, t ? +t[2] : 0);
}

export function etutEnd(e: Etut): Date | null {
  const start = etutStart(e);
  if (!start) return null;
  return new Date(start.getTime() + (Number(e.duration) || 45) * 60000);
}

// ---------------------------------------------------------------------------
// Ödev durumu
// ---------------------------------------------------------------------------
export type StudentHomeworkState = 'done' | 'excused' | 'overdue' | 'open';

/**
 * Öğretmen "yapmadı / eksik / gelmedi" işaretlediğinde de teslim satırı oluşur (status: 'not_submitted'),
 * bu yüzden satırın varlığı "yapıldı" demek değildir.
 * - izinli → sayılmaz (excused)
 * - yaptı veya gerçek teslim (on_time / late) → yapıldı (öğretmen olumsuz işaretlemediyse)
 * - aksi hâlde teslim tarihi geçtiyse → gecikmiş, geçmediyse → bekliyor
 */
export function homeworkStateFor(hw: Homework, sub: HomeworkSubmission | undefined, nowMs: number): StudentHomeworkState {
  const cs = sub?.checkStatus;
  if (cs === 'izinli') return 'excused';
  const negative = cs === 'yapmadi' || cs === 'eksik' || cs === 'gelmedi';
  if (sub && !negative && (cs === 'yapti' || sub.status === 'on_time' || sub.status === 'late')) return 'done';
  const due = parseLocalDateTime(hw.dueDate);
  if (due && due.getTime() < nowMs) return 'overdue';
  return 'open';
}

// ---------------------------------------------------------------------------
// Etüt bu öğrenciye mi?
// ---------------------------------------------------------------------------
const norm = (s: string) =>
  s
    .toLocaleLowerCase('tr-TR')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

const gradeNum = (s?: string | null): number | null => {
  const m = /^\s*(\d{1,2})(?!\d)/.exec(s || '');
  return m ? +m[1] : null;
};

/**
 * Etüt bu öğrenciye ait mi?
 * - Öğrenci etüde tek tek eklenmişse veya yoklama listesinde varsa: evet.
 * - Öğrenci listesi "herkes" / boş olan (eski) etütler yalnızca etüdün sınıf/kademe bilgisi
 *   öğrencininkiyle eşleşirse gösterilir; hiçbir bilgi yoksa gösterilmez.
 */
export function isEtutForStudent(
  e: Etut,
  student: Pick<Student, 'id' | 'className' | 'gradeLevel' | 'schoolLevel' | 'classId'>,
  studentClass?: Pick<ClassGroup, 'name' | 'gradeLevel' | 'schoolLevel'> | null
): boolean {
  const assigned = e.assignedStudentIds;
  if (Array.isArray(assigned) && assigned.includes(student.id)) return true;
  if (e.studentAttendance && e.studentAttendance[student.id]) return true;

  const isOpen = assigned === 'all' || !assigned || (Array.isArray(assigned) && assigned.length === 0);
  if (!isOpen) return false;

  const myNames = [student.className, studentClass?.name].filter((x): x is string => !!x).map(norm);
  const myGrade =
    gradeNum(student.gradeLevel) ?? gradeNum(studentClass?.gradeLevel) ?? gradeNum(student.className) ?? gradeNum(studentClass?.name);
  const myLevel = student.schoolLevel || studentClass?.schoolLevel || (myGrade ? (myGrade <= 8 ? 'Ortaokul' : 'Lise') : undefined);

  const labels = (e.gradeLevel || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

  if (labels.length > 0) {
    return labels.some((label) => {
      const n = norm(label);
      if (myNames.includes(n)) return true; // ör. "8. Sınıf - A"
      if (myLevel && n === norm(myLevel)) return true; // ör. "Lise"
      const g = gradeNum(label);
      if (g === null || myGrade === null || g !== myGrade) return false;
      // Şubesiz, tüm sınıf seviyesi etiketi: "8", "8.", "8. Sınıf", "8. sınıflar"
      const rest = n
        .replace(/^\d{1,2}/, '')
        .replace(/sınıf(lar)?/g, '')
        .replace(/[.\-]/g, ' ')
        .trim();
      return rest === '';
    });
  }

  if (e.schoolLevel && myLevel) return e.schoolLevel === myLevel;
  return false;
}
