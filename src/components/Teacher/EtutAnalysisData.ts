import type { ClassGroup, Etut, Student, Teacher } from '../../types';
import { normalizeSubject } from '../../lib/subjects';
import { detectSchoolLevelFromGrade, formatClassDisplayName } from '../../constants/schoolConstants';
import { addDays, localDateStr } from './FormParts';

// ============================================================================
// Etüt Analizi: hesaplama kuralları (ekran, yazdırma ve Excel aynı yerden beslenir)
// ============================================================================

export type Level = 'Ortaokul' | 'Lise';
export type AttStatus = 'present' | 'late' | 'absent' | 'excused' | 'unrecorded' | 'upcoming';
export type Counts = Record<AttStatus, number>;

export const STATUS_ORDER: AttStatus[] = ['present', 'late', 'absent', 'excused', 'unrecorded', 'upcoming'];

export const STATUS_LABEL: Record<AttStatus, string> = {
  present: 'Geldi',
  late: 'Geç kaldı',
  absent: 'Gelmedi',
  excused: 'İzinli',
  unrecorded: 'Yoklama alınmadı',
  upcoming: 'Yaklaşan',
};

// Tablo başlıkları için kısa adlar
export const STATUS_SHORT: Record<AttStatus, string> = {
  present: 'Geldi',
  late: 'Geç',
  absent: 'Gelmedi',
  excused: 'İzinli',
  unrecorded: 'Yoklama yok',
  upcoming: 'Yaklaşan',
};

export const emptyCounts = (): Counts => ({ present: 0, late: 0, absent: 0, excused: 0, unrecorded: 0, upcoming: 0 });

const addCounts = (into: Counts, from: Counts) => {
  for (const k of STATUS_ORDER) into[k] += from[k];
};

// Tek durum kuralı: yoklama kaydı varsa o; yoksa etüt bugün veya geçmişteyse "yoklama alınmadı", ilerideyse "yaklaşan"
export function classify(etut: Etut, studentId: string, today: string): AttStatus {
  const s = etut.studentAttendance?.[studentId]?.status;
  if (s === 'present' || s === 'late' || s === 'absent' || s === 'excused') return s;
  return etut.date > today ? 'upcoming' : 'unrecorded';
}

// Tek oran kuralı: (geldi + geç) / (geldi + geç + gelmedi). Payda 0 ise oran yok (null).
export function attendanceRate(c: Counts): number | null {
  const d = c.present + c.late + c.absent;
  return d > 0 ? (c.present + c.late) / d : null;
}

export const formatRate = (r: number | null) => (r == null ? '—' : `%${Math.round(r * 100)}`);

export const rateTone = (r: number | null): 'success' | 'warning' | 'danger' | 'neutral' =>
  r == null ? 'neutral' : r >= 0.85 ? 'success' : r >= 0.6 ? 'warning' : 'danger';

// ----------------------------------------------------------------------------- Tarih aralıkları
export type DatePreset = 'thisWeek' | 'lastWeek' | 'last30' | 'thisMonth' | 'term' | 'all' | 'custom';

export const DATE_PRESETS: Array<{ value: DatePreset; label: string }> = [
  { value: 'thisWeek', label: 'Bu hafta' },
  { value: 'lastWeek', label: 'Geçen hafta' },
  { value: 'last30', label: 'Son 30 gün' },
  { value: 'thisMonth', label: 'Bu ay' },
  { value: 'term', label: 'Bu dönem' },
  { value: 'all', label: 'Tüm kayıtlar' },
  { value: 'custom', label: 'Özel aralık' },
];

export interface DateRange {
  from: string | null;
  to: string | null;
}

const parseLocal = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

export function presetRange(preset: DatePreset, today: string, custom: DateRange): DateRange {
  const t = parseLocal(today);
  const y = t.getFullYear();
  const m = t.getMonth();
  const dow = (t.getDay() + 6) % 7; // Pazartesi = 0
  switch (preset) {
    case 'thisWeek': {
      const mon = addDays(t, -dow);
      return { from: localDateStr(mon), to: localDateStr(addDays(mon, 6)) };
    }
    case 'lastWeek': {
      const mon = addDays(t, -dow - 7);
      return { from: localDateStr(mon), to: localDateStr(addDays(mon, 6)) };
    }
    case 'last30':
      return { from: localDateStr(addDays(t, -29)), to: today };
    case 'thisMonth':
      return { from: localDateStr(new Date(y, m, 1)), to: localDateStr(new Date(y, m + 1, 0)) };
    case 'term': {
      // 1. dönem: 1 Eylül – 31 Ocak, 2. dönem: 1 Şubat – 31 Ağustos
      if (m >= 8) return { from: `${y}-09-01`, to: `${y + 1}-01-31` };
      if (m === 0) return { from: `${y - 1}-09-01`, to: `${y}-01-31` };
      return { from: `${y}-02-01`, to: `${y}-08-31` };
    }
    case 'custom': {
      const from = custom.from || null;
      const to = custom.to || null;
      if (from && to && from > to) return { from: to, to: from };
      return { from, to };
    }
    default:
      return { from: null, to: null };
  }
}

export const inRange = (date: string, r: DateRange) => (!r.from || date >= r.from) && (!r.to || date <= r.to);

export const trDate = (s?: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
  return m ? `${m[3]}.${m[2]}.${m[1]}` : s || '-';
};

export const rangeLabel = (r: DateRange) =>
  r.from && r.to
    ? `${trDate(r.from)} – ${trDate(r.to)}`
    : r.from
      ? `${trDate(r.from)} ve sonrası`
      : r.to
        ? `${trDate(r.to)} ve öncesi`
        : 'Tüm tarihler';

// ----------------------------------------------------------------------------- Kademe / sınıf düzeyi
const gradeNums = (s?: string | null): number[] => {
  const out: number[] = [];
  const re = /(?:^|\D)(1[0-2]|[5-9])(?!\d)/g;
  let mm: RegExpExecArray | null;
  while ((mm = re.exec(s || ''))) out.push(Number(mm[1]));
  return out;
};

const levelFromGrades = (g: number[]): Level | undefined => {
  if (!g.length) return undefined;
  if (g.every((n) => n >= 9)) return 'Lise';
  if (g.every((n) => n <= 8)) return 'Ortaokul';
  return undefined;
};

export interface StudentInfo {
  student: Student;
  classId: string;
  classLabel: string;
  level?: Level;
  grade?: number;
}

export function buildStudentInfo(students: Student[], classes: ClassGroup[]): Map<string, StudentInfo> {
  const classById = new Map(classes.map((c) => [c.id, c]));
  const map = new Map<string, StudentInfo>();
  for (const s of students) {
    const cls = classById.get(s.classId);
    const grade = [s.gradeLevel, cls?.gradeLevel, cls?.name, s.className].map(gradeNums).find((g) => g.length)?.[0];
    const level: Level | undefined =
      s.schoolLevel ||
      cls?.schoolLevel ||
      detectSchoolLevelFromGrade(s.gradeLevel || cls?.gradeLevel || cls?.name || s.className) ||
      levelFromGrades(grade != null ? [grade] : []);
    map.set(s.id, {
      student: s,
      classId: s.classId,
      classLabel: cls ? formatClassDisplayName(cls.name, cls.branch, cls.gradeLevel) : s.className || '-',
      level,
      grade,
    });
  }
  return map;
}

export const classLabelOf = (c: ClassGroup) => formatClassDisplayName(c.name, c.branch, c.gradeLevel);

export function classLevelOf(c?: ClassGroup | null): Level | undefined {
  if (!c) return undefined;
  return c.schoolLevel || detectSchoolLevelFromGrade(c.gradeLevel || c.name) || levelFromGrades(gradeNums(c.gradeLevel || c.name));
}

// ----------------------------------------------------------------------------- Etütlerin hazırlanması
export interface PreparedEtut {
  etut: Etut;
  subject: string;
  teacherKey: string;
  teacherName: string;
  ids: Set<string> | null; // açık öğrenci listesi (yoksa null)
  isAll: boolean;
  level?: Level;
  grades: number[];
  levelUnknown: boolean; // "tüm öğrenciler" etüdü ve kademe bilgisi yok
  rollCallTaken: boolean;
  past: boolean; // bugün veya geçmişte
}

export const NO_TEACHER_KEY = 'none';

export function teacherKeyOf(e: Etut): string {
  if (e.teacherId) return `id:${e.teacherId}`;
  const n = (e.teacherName || '').trim();
  return n ? `name:${n.toLocaleLowerCase('tr-TR')}` : NO_TEACHER_KEY;
}

export function prepareEtuts(etuts: Etut[], today: string): PreparedEtut[] {
  return etuts
    .filter((e) => e && typeof e.date === 'string' && e.date)
    .map((e) => {
      const isAll = e.assignedStudentIds === 'all';
      const grades = isAll ? gradeNums(e.gradeLevel) : [];
      const level = isAll ? e.schoolLevel || levelFromGrades(grades) : e.schoolLevel;
      return {
        etut: e,
        subject: normalizeSubject(e.subject) || 'Belirtilmemiş',
        teacherKey: teacherKeyOf(e),
        teacherName: (e.teacherName || '').trim() || 'Öğretmen belirtilmemiş',
        ids: Array.isArray(e.assignedStudentIds) ? new Set(e.assignedStudentIds) : null,
        isAll,
        level,
        grades,
        levelUnknown: isAll && !level && grades.length === 0,
        rollCallTaken: !!e.studentAttendance && Object.keys(e.studentAttendance).length > 0,
        past: e.date <= today,
      };
    });
}

// "Tüm öğrenciler" etüdü yalnızca kademesi / sınıf düzeyi uyan öğrencilere sayılır
export function isAssigned(pe: PreparedEtut, info: StudentInfo): boolean {
  const id = info.student.id;
  if (pe.etut.studentAttendance?.[id]) return true;
  if (pe.ids) return pe.ids.has(id);
  if (!pe.isAll) return false;
  if (pe.level && info.level && pe.level !== info.level) return false;
  if (pe.grades.length && info.grade != null && !pe.grades.includes(info.grade)) return false;
  return true;
}

export function isMine(pe: PreparedEtut, me: Teacher | null): boolean {
  if (!me) return false;
  const tid = pe.etut.teacherId;
  if (pe.etut.teacherIds && pe.etut.teacherIds.includes(me.id)) return true;
  if (tid) return tid === me.id || (!!me.auth_user_id && tid === me.auth_user_id);
  const n = (pe.etut.teacherName || '').trim().toLocaleLowerCase('tr-TR');
  return !!n && n === (me.name || '').trim().toLocaleLowerCase('tr-TR');
}

// ----------------------------------------------------------------------------- Özet rapor
export interface GroupRow {
  key: string;
  label: string;
  etutCount: number;
  counts: Counts;
  rate: number | null;
}

export interface StudentRow {
  info: StudentInfo;
  assigned: number;
  counts: Counts;
  rate: number | null;
}

export interface EtutRow {
  pe: PreparedEtut;
  assigned: number;
  counts: Counts;
  rate: number | null;
}

export interface SummaryReport {
  etutRows: EtutRow[];
  etutCount: number;
  upcomingEtuts: number;
  unrecordedEtuts: number;
  levelUnknownCount: number;
  totals: Counts;
  rate: number | null;
  bySubject: GroupRow[];
  byTeacher: GroupRow[];
  studentRows: StudentRow[];
}

const sortByDateDesc = (a: PreparedEtut, b: PreparedEtut) =>
  b.etut.date.localeCompare(a.etut.date) || (b.etut.time || '').localeCompare(a.etut.time || '');

const finishGroups = (m: Map<string, GroupRow>) =>
  Array.from(m.values())
    .map((g) => ({ ...g, rate: attendanceRate(g.counts) }))
    .sort((a, b) => b.etutCount - a.etutCount || a.label.localeCompare(b.label, 'tr'));

export function buildSummary(pes: PreparedEtut[], scopeStudents: StudentInfo[], classFilterActive: boolean, today: string): SummaryReport {
  const scopeMap = new Map(scopeStudents.map((i) => [i.student.id, i]));
  const agg = new Map<string, { assigned: number; counts: Counts }>();
  for (const i of scopeStudents) agg.set(i.student.id, { assigned: 0, counts: emptyCounts() });

  const totals = emptyCounts();
  const subj = new Map<string, GroupRow>();
  const teach = new Map<string, GroupRow>();
  const etutRows: EtutRow[] = [];
  let upcomingEtuts = 0;
  let unrecordedEtuts = 0;
  let levelUnknownCount = 0;

  for (const pe of [...pes].sort(sortByDateDesc)) {
    let targets: StudentInfo[];
    if (pe.isAll) {
      targets = scopeStudents.filter((i) => isAssigned(pe, i));
    } else {
      const ids = new Set<string>(pe.ids || []);
      Object.keys(pe.etut.studentAttendance || {}).forEach((k) => ids.add(k));
      targets = [];
      ids.forEach((id) => {
        const i = scopeMap.get(id);
        if (i) targets.push(i);
      });
    }
    // Sınıf seçiliyken o sınıftan kimsenin olmadığı etüt rapora girmez
    if (classFilterActive && targets.length === 0) continue;

    const counts = emptyCounts();
    for (const i of targets) {
      const st = classify(pe.etut, i.student.id, today);
      counts[st]++;
      const a = agg.get(i.student.id)!;
      a.assigned++;
      a.counts[st]++;
    }
    etutRows.push({ pe, assigned: targets.length, counts, rate: attendanceRate(counts) });
    addCounts(totals, counts);
    if (!pe.past) upcomingEtuts++;
    else if (!pe.rollCallTaken) unrecordedEtuts++;
    if (pe.levelUnknown) levelUnknownCount++;

    const s = subj.get(pe.subject) || { key: pe.subject, label: pe.subject, etutCount: 0, counts: emptyCounts(), rate: null };
    s.etutCount++;
    addCounts(s.counts, counts);
    subj.set(pe.subject, s);

    const t = teach.get(pe.teacherKey) || { key: pe.teacherKey, label: pe.teacherName, etutCount: 0, counts: emptyCounts(), rate: null };
    t.etutCount++;
    addCounts(t.counts, counts);
    teach.set(pe.teacherKey, t);
  }

  const studentRows: StudentRow[] = scopeStudents.map((info) => {
    const a = agg.get(info.student.id)!;
    return { info, assigned: a.assigned, counts: a.counts, rate: attendanceRate(a.counts) };
  });

  return {
    etutRows,
    etutCount: etutRows.length,
    upcomingEtuts,
    unrecordedEtuts,
    levelUnknownCount,
    totals,
    rate: attendanceRate(totals),
    bySubject: finishGroups(subj),
    byTeacher: finishGroups(teach),
    studentRows,
  };
}

// ----------------------------------------------------------------------------- Öğrenci raporu
export interface StudentEtutRow {
  pe: PreparedEtut;
  status: AttStatus;
  note: string;
}

export interface StudentReport {
  rows: StudentEtutRow[];
  counts: Counts;
  rate: number | null;
  levelUnknownCount: number;
}

export function buildStudentReport(pes: PreparedEtut[], info: StudentInfo, today: string): StudentReport {
  const counts = emptyCounts();
  const rows: StudentEtutRow[] = [];
  let levelUnknownCount = 0;
  for (const pe of [...pes].sort(sortByDateDesc)) {
    if (!isAssigned(pe, info)) continue;
    const status = classify(pe.etut, info.student.id, today);
    counts[status]++;
    if (pe.levelUnknown) levelUnknownCount++;
    // Aşama 23: farklı anlatılan konu da not sütununda görünür
    const rec = pe.etut.studentAttendance?.[info.student.id];
    const topic = (rec?.topic || '').trim();
    const note = (rec?.note || '').trim();
    rows.push({ pe, status, note: [topic ? `Anlatılan konu: ${topic}` : '', note].filter(Boolean).join(' · ') });
  }
  return { rows, counts, rate: attendanceRate(counts), levelUnknownCount };
}

// ----------------------------------------------------------------------------- Öğrenci sıralaması
export type StudentSort = { key: 'rate' | 'name' | 'absent' | 'assigned'; dir: 'asc' | 'desc' };

export function sortStudentRows(rows: StudentRow[], sort: StudentSort): StudentRow[] {
  const byName = (a: StudentRow, b: StudentRow) => a.info.student.name.localeCompare(b.info.student.name, 'tr');
  const mul = sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (sort.key === 'name') return mul * byName(a, b);
    if (sort.key === 'rate') {
      // Oranı olmayanlar her zaman en sonda
      if (a.rate == null && b.rate == null) return byName(a, b);
      if (a.rate == null) return 1;
      if (b.rate == null) return -1;
      return mul * (a.rate - b.rate) || byName(a, b);
    }
    const va = sort.key === 'absent' ? a.counts.absent : a.assigned;
    const vb = sort.key === 'absent' ? b.counts.absent : b.assigned;
    return mul * (va - vb) || byName(a, b);
  });
}

// ----------------------------------------------------------------------------- Yazdırma / Excel tabloları
export interface ReportTable {
  title: string;
  head: string[];
  rows: Array<Array<string | number>>;
  numericFrom?: number; // bu sütundan itibaren sayısal (sağa yaslı)
}

const statusCells = (c: Counts) => STATUS_ORDER.map((k) => c[k]);
const statusHead = STATUS_ORDER.map((k) => STATUS_SHORT[k]);

export const studentTable = (rows: StudentRow[]): ReportTable => ({
  title: 'Öğrenci bazında katılım',
  head: ['#', 'Öğrenci', 'No', 'Sınıf', 'Atanan', ...statusHead, 'Katılım'],
  rows: rows.map((r, i) => [
    i + 1,
    r.info.student.name,
    r.info.student.studentNumber || '-',
    r.info.classLabel,
    r.assigned,
    ...statusCells(r.counts),
    formatRate(r.rate),
  ]),
  numericFrom: 4,
});

export const groupTable = (title: string, firstCol: string, rows: GroupRow[]): ReportTable => ({
  title,
  head: [firstCol, 'Etüt', ...statusHead, 'Katılım'],
  rows: rows.map((r) => [r.label, r.etutCount, ...statusCells(r.counts), formatRate(r.rate)]),
  numericFrom: 1,
});

export const etutTable = (rows: EtutRow[]): ReportTable => ({
  title: 'Etüt listesi',
  head: ['Tarih', 'Saat', 'Ders', 'Öğretmen', 'Konu', 'Öğrenci', ...statusHead, 'Katılım'],
  rows: rows.map((r) => [
    trDate(r.pe.etut.date),
    r.pe.etut.time || '-',
    r.pe.subject,
    r.pe.teacherName,
    r.pe.etut.topic || '-',
    r.assigned,
    ...statusCells(r.counts),
    formatRate(r.rate),
  ]),
  numericFrom: 5,
});

export const studentEtutTable = (rows: StudentEtutRow[]): ReportTable => ({
  title: 'Etüt geçmişi',
  head: ['Tarih', 'Saat', 'Ders', 'Öğretmen', 'Konu', 'Durum', 'Not'],
  rows: rows.map((r) => [
    trDate(r.pe.etut.date),
    r.pe.etut.time || '-',
    r.pe.subject,
    r.pe.teacherName,
    r.pe.etut.topic || '-',
    STATUS_LABEL[r.status],
    r.note || '',
  ]),
});

export const countsPairs = (c: Counts): Array<[string, string]> => STATUS_ORDER.map((k) => [STATUS_LABEL[k], String(c[k])]);

export const fileSafe = (s: string) =>
  s
    .replace(/[ğĞ]/g, (ch) => (ch === 'ğ' ? 'g' : 'G'))
    .replace(/[üÜ]/g, (ch) => (ch === 'ü' ? 'u' : 'U'))
    .replace(/[şŞ]/g, (ch) => (ch === 'ş' ? 's' : 'S'))
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'I')
    .replace(/[öÖ]/g, (ch) => (ch === 'ö' ? 'o' : 'O'))
    .replace(/[çÇ]/g, (ch) => (ch === 'ç' ? 'c' : 'C'))
    .replace(/[^A-Za-z0-9-]+/g, '_')
    .replace(/^_+|_+$/g, '');
