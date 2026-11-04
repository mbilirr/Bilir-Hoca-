import type { ClassGroup, Etut, Student } from '../types';
import { formatClassDisplayName } from '../constants/schoolConstants';

// ============================================================================
// Etüt listesi (Aşama 27)
// Sınıfa ve döneme (günlük / haftalık) göre: hangi öğrenci, hangi sınıfta / yerde, hangi saatte,
// hangi öğretmenle, hangi konudan etüt alıyor ve etüdün açıklaması. Excel (.xlsx) ve PDF olarak indirilir.
// Bu dosya yalnızca okuma yapar: etüt, öğrenci ya da sınıf kayıtlarını değiştirmez.
// Satır hesabı ile dosya üretimi ayrıdır; ekrandaki önizleme, Excel ve PDF aynı satırları kullanır.
// ============================================================================

export type SchedulePeriod = 'day' | 'week';
// time: gün ve saate göre · student: öğrenciye göre (her öğrencinin etütleri bir arada)
export type ScheduleSort = 'time' | 'student';

export interface ScheduleRow {
  etutId: string;
  dateYmd: string; // 2026-10-08
  dateText: string; // 08.10.2026
  dayName: string; // Perşembe
  time: string; // "10:20 – 11:00", süre yoksa "10:20", saat yoksa "Saat belirtilmedi"
  startKey: string; // sıralama anahtarı: "10:20" (saat yoksa "99:99")
  studentId: string;
  student: string;
  classId: string;
  className: string; // 8/A
  place: string; // etüt yeri (derslik)
  subject: string;
  topic: string;
  teacher: string;
  /** Aşama 152: etüdün öğretmen anahtarları (öğretmen kimliği, yoksa ad) ve adları; aynı etüdün satırları AYNI diziyi paylaşır */
  teacherKeys: string[];
  teacherNames: string[];
  note: string; // etüt açıklaması
}

export interface ScheduleResult {
  rows: ScheduleRow[];
  etutCount: number; // listeye giren etüt sayısı
  studentCount: number; // listeye giren farklı öğrenci sayısı
  missingCount: number; // etüde atanmış ama kaydına ulaşılamayan öğrenci sayısı (silinmiş / yetki dışı)
}

export interface ScheduleMeta {
  classLabel: string; // "8/A" ya da "Tüm sınıflar"
  allClasses: boolean;
  periodLabel: string; // "05.10.2026 – 11.10.2026" ya da "8 Ekim 2026 Perşembe"
  period: SchedulePeriod;
  sort: ScheduleSort;
  from: string;
  to: string;
  /** Aşama 152: öğretmen süzgeci ("Tüm öğretmenler" iken boş / 'all') */
  teacherLabel?: string;
  teacherKey?: string;
  /** Aşama 152: öğretmen tabloları PDF'inde bölme ('class' = bugünkü ders/gün + sınıf sayfaları, 'teacher' = öğretmene göre) */
  split?: 'class' | 'teacher';
  /** Aşama 152: öğretmene göre bölmede sayfa düzeni ('each' = her öğretmen ayrı sayfa, 'together' = hepsi bir arada) */
  pageMode?: 'each' | 'together';
}

export const SORT_LABEL: Record<ScheduleSort, string> = {
  time: 'Gün ve saate göre',
  student: 'Öğrenciye göre',
};

// ----------------------------------------------------------------------------- Tarih yardımcıları (yerel saat)
const pad2 = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const todayYmd = () => ymd(new Date());
export function parseYmd(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date();
}
export function addDaysYmd(s: string, days: number): string {
  const d = parseYmd(s);
  d.setDate(d.getDate() + days);
  return ymd(d);
}
const weekStartOf = (s: string) => {
  const d = parseYmd(s);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Pazartesi
  return ymd(d);
};
const DAY_NAMES = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
export const dayNameOf = (s: string) => DAY_NAMES[(parseYmd(s).getDay() + 6) % 7];
export const shortDate = (s: string) => {
  const d = parseYmd(s);
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
};
export const longDate = (s: string) => {
  const d = parseYmd(s);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} ${dayNameOf(s)}`;
};

// Seçilen güne göre dönem aralığı: günlük = o gün, haftalık = o günün haftası (Pazartesi – Pazar)
export function periodRange(period: SchedulePeriod, anchor: string): { from: string; to: string; label: string } {
  if (period === 'day') return { from: anchor, to: anchor, label: longDate(anchor) };
  const from = weekStartOf(anchor);
  const to = addDaysYmd(from, 6);
  return { from, to, label: `${shortDate(from)} – ${shortDate(to)}` };
}

// ----------------------------------------------------------------------------- Satırları hazırla
const TIME_RE = /^(\d{1,2}):(\d{2})/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function timeParts(time: string): { startKey: string; start: string; startMin: number } | null {
  const m = TIME_RE.exec(String(time || '').trim());
  if (!m) return null;
  const h = +m[1];
  const mi = +m[2];
  if (h > 23 || mi > 59) return null;
  return { startKey: `${pad2(h)}:${pad2(mi)}`, start: `${pad2(h)}:${pad2(mi)}`, startMin: h * 60 + mi };
}
// Süre bilinmiyorsa bitiş tahmin edilmez; yalnızca başlangıç saati yazılır
function timeText(time: string, duration: number): string {
  const p = timeParts(time);
  if (!p) return 'Saat belirtilmedi';
  const dur = Number(duration);
  if (!dur || dur <= 0) return p.start;
  const end = p.startMin + dur;
  return `${p.start} – ${pad2(Math.floor(end / 60) % 24)}:${pad2(end % 60)}`;
}

export function classLabelOf(c: ClassGroup): string {
  const f = formatClassDisplayName(c.name, c.branch, c.gradeLevel);
  return f === '-' ? c.name || '' : f;
}

// Türkçe sıralama (Ç, Ğ, İ, Ö, Ş, Ü doğru yerde; "8/A" < "9/A" < "10/A"). Nesne bir kez kurulur: her karşılaştırmada yeniden kurmak çok yavaştır.
const collator = new Intl.Collator('tr', { numeric: true, sensitivity: 'base' });
const tr = (a: string, b: string) => collator.compare(a, b);
// Tarih (YYYY-MM-DD), saat (SS:DD) ve kimlikler için düz karşılaştırma
const cs = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function compareRows(sort: ScheduleSort) {
  return sort === 'student'
    ? (a: ScheduleRow, b: ScheduleRow) =>
        tr(a.className, b.className) || tr(a.student, b.student) || cs(a.studentId, b.studentId) || cs(a.dateYmd, b.dateYmd) || cs(a.startKey, b.startKey) || cs(a.etutId, b.etutId)
    : (a: ScheduleRow, b: ScheduleRow) =>
        cs(a.dateYmd, b.dateYmd) || cs(a.startKey, b.startKey) || tr(a.className, b.className) || tr(a.student, b.student) || cs(a.studentId, b.studentId) || cs(a.etutId, b.etutId);
}

// Aşama 152: etüdün öğretmenleri (kimlik + ad). Kimlik yoksa ad anahtar olur; hiç öğretmen yoksa "-".
function teacherKeysOf(e: Etut): { keys: string[]; names: string[] } {
  const ids = (e.teacherIds && e.teacherIds.length ? e.teacherIds : e.teacherId ? [e.teacherId] : []).map((x) => String(x || '').trim()).filter(Boolean);
  const nameList = (e.teacherNames && e.teacherNames.length ? e.teacherNames : e.teacherName ? [e.teacherName] : []).map((n) => String(n || '').trim()).filter(Boolean);
  const keys: string[] = [];
  const names: string[] = [];
  if (ids.length) {
    ids.forEach((id, i) => {
      if (keys.includes(id)) return;
      keys.push(id);
      names.push(nameList[i] || (ids.length === 1 ? nameList.join(', ') : '') || '-');
    });
  } else {
    for (const n of nameList) {
      const k = `ad:${n.toLocaleLowerCase('tr-TR')}`;
      if (keys.includes(k)) continue;
      keys.push(k);
      names.push(n);
    }
  }
  if (!keys.length) return { keys: ['-'], names: ['Öğretmen belirtilmemiş'] };
  return { keys, names };
}

export function buildSchedule(
  etuts: Etut[],
  students: Student[],
  classes: ClassGroup[],
  opts: { from: string; to: string; classId: string; sort: ScheduleSort } // classId: 'all' ya da sınıf kimliği
): ScheduleResult {
  const byId = new Map(students.map((s) => [s.id, s]));
  const classById = new Map(classes.map((c) => [c.id, c]));
  const rows: ScheduleRow[] = [];
  const etutIds = new Set<string>();
  const studentIds = new Set<string>();
  const missing = new Set<string>();

  for (const e of etuts) {
    if (!e || String(e.id).startsWith('__')) continue;
    const date = String(e.date || '').slice(0, 10);
    if (!DATE_RE.test(date) || date < opts.from || date > opts.to) continue;

    // Etüde atanan öğrenciler (etüt listesi ekranıyla aynı kural: "all" = tüm öğrenciler). Aynı öğrenci bir kez sayılır.
    let assigned: Student[];
    if (e.assignedStudentIds === 'all') {
      assigned = students;
    } else {
      assigned = [];
      const seen = new Set<string>();
      for (const id of Array.isArray(e.assignedStudentIds) ? e.assignedStudentIds : []) {
        if (seen.has(id)) continue;
        seen.add(id);
        const s = byId.get(id);
        if (s) assigned.push(s);
        else missing.add(`${e.id}:${id}`);
      }
    }

    const teacherList = e.teacherNames && e.teacherNames.length ? e.teacherNames : e.teacherName ? [e.teacherName] : [];
    const teacher = Array.from(new Set(teacherList.map((n) => String(n || '').trim()).filter(Boolean))).join(', ') || '-';
    const tk = teacherKeysOf(e);
    const tp = timeParts(e.time);

    for (const s of assigned) {
      if (opts.classId !== 'all' && s.classId !== opts.classId) continue;
      const cg = classById.get(s.classId);
      const className = cg ? classLabelOf(cg) : (() => { const f = formatClassDisplayName(s.className, s.branch, s.gradeLevel); return f === '-' ? '' : f; })();
      rows.push({
        etutId: e.id,
        dateYmd: date,
        dateText: shortDate(date),
        dayName: dayNameOf(date),
        time: timeText(e.time, e.duration),
        startKey: tp ? tp.startKey : '99:99',
        studentId: s.id,
        student: String(s.name || '').trim() || '-',
        classId: s.classId,
        className,
        place: String(e.location || '').trim(),
        subject: String(e.subject || '').trim(),
        topic: String(e.topic || '').trim(),
        teacher,
        teacherKeys: tk.keys,
        teacherNames: tk.names,
        note: String(e.notes || '').trim(),
      });
      etutIds.add(e.id);
      studentIds.add(s.id);
    }
  }

  rows.sort(compareRows(opts.sort));
  return { rows, etutCount: etutIds.size, studentCount: studentIds.size, missingCount: missing.size };
}

// ----------------------------------------------------------------------------- Aşama 152: öğretmen süzgeci
export interface TeacherOption {
  key: string;
  name: string;
}
/** Satırlardaki öğretmenler (tek geçiş, Türkçe sıralı). Birden çok öğretmenli etütte her öğretmen ayrı seçenektir. */
export function teacherOptionsOf(rows: ScheduleRow[]): TeacherOption[] {
  const m = new Map<string, string>();
  let last: string[] | null = null; // aynı etüdün satırları aynı diziyi paylaşır: bir kez işlenir
  for (const r of rows) {
    if (r.teacherKeys === last) continue;
    last = r.teacherKeys;
    r.teacherKeys.forEach((k, i) => {
      if (!m.has(k)) m.set(k, r.teacherNames[i] || '-');
    });
  }
  return Array.from(m, ([key, name]) => ({ key, name })).sort((a, b) => tr(a.name, b.name) || cs(a.key, b.key));
}
/** Seçilen öğretmenin satırları; sayılar yeniden hesaplanır. 'all' ise sonuç aynen döner. */
export function filterScheduleByTeacher(res: ScheduleResult, teacherKey: string): ScheduleResult {
  if (teacherKey === 'all') return res;
  const rows = res.rows.filter((r) => r.teacherKeys.includes(teacherKey));
  const etutIds = new Set<string>();
  const studentIds = new Set<string>();
  for (const r of rows) {
    etutIds.add(r.etutId);
    studentIds.add(r.studentId);
  }
  return { rows, etutCount: etutIds.size, studentCount: studentIds.size, missingCount: res.missingCount };
}

// Tüm sınıflar seçiliyken çıktı sınıf sınıf bölünür (her sınıf ayrı sayfa / sayfa). Tek sınıfta tek bölüm olur.
export interface ScheduleSection {
  key: string;
  title: string; // "8/A"
  rows: ScheduleRow[];
}
export function splitSections(rows: ScheduleRow[], meta: Pick<ScheduleMeta, 'allClasses' | 'classLabel' | 'sort'>): ScheduleSection[] {
  if (!meta.allClasses) return [{ key: 'tek', title: meta.classLabel, rows }];
  const map = new Map<string, ScheduleSection>();
  for (const r of rows) {
    const key = r.classId || '-';
    let sec = map.get(key);
    if (!sec) {
      sec = { key, title: r.className || 'Sınıfsız', rows: [] };
      map.set(key, sec);
    }
    sec.rows.push(r);
  }
  const cmp = compareRows(meta.sort);
  const list = Array.from(map.values());
  list.forEach((s) => s.rows.sort(cmp));
  list.sort((a, b) => tr(a.title, b.title) || cs(a.key, b.key));
  // Hiç satır yoksa bile tek bir boş bölüm döner (PDF'te boş sayfa yerine "Bu seçimde etüt yok" yazısı çıksın)
  return list.length ? list : [{ key: 'bos', title: meta.classLabel, rows: [] }];
}

// ----------------------------------------------------------------------------- Dosya adı
const safeName = (s: string) =>
  s
    .replace(/[\\/]+/g, '-')
    .replace(/[ğĞ]/g, (ch) => (ch === 'ğ' ? 'g' : 'G'))
    .replace(/[üÜ]/g, (ch) => (ch === 'ü' ? 'u' : 'U'))
    .replace(/[şŞ]/g, (ch) => (ch === 'ş' ? 's' : 'S'))
    .replace(/[öÖ]/g, (ch) => (ch === 'ö' ? 'o' : 'O'))
    .replace(/[çÇ]/g, (ch) => (ch === 'ç' ? 'c' : 'C'))
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'I')
    .replace(/[^\w\- ]+/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 40);
export const scheduleFileBase = (m: ScheduleMeta) =>
  `Etut-Listesi_${m.allClasses ? 'Tum-Siniflar' : safeName(m.classLabel) || 'Sinif'}${m.teacherLabel ? `_${safeName(m.teacherLabel)}` : ''}_${m.period === 'day' ? 'Gunluk' : 'Haftalik'}_${m.from}`;

// ----------------------------------------------------------------------------- Excel
export const EXCEL_HEAD = ['Tarih', 'Gün', 'Saat', 'Öğrenci', 'Sınıf', 'Etüt yeri', 'Ders', 'Konu', 'Öğretmen', 'Açıklama'];
const excelCells = (r: ScheduleRow): string[] => [r.dateText, r.dayName, r.time, r.student, r.className, r.place, r.subject, r.topic, r.teacher, r.note];

// Excel sayfa adı: en fazla 31 karakter, \ / ? * [ ] : yasak, tekrar olmasın
function sheetName(raw: string, used: Set<string>): string {
  const base = (raw.replace(/[\\/?*[\]:]+/g, '-').trim() || 'Sayfa').slice(0, 31);
  let name = base;
  let n = 2;
  while (used.has(name.toLocaleLowerCase('tr'))) name = `${base.slice(0, 31 - String(n).length - 1)} ${n++}`;
  used.add(name.toLocaleLowerCase('tr'));
  return name;
}

// Her sayfanın içeriği (saf veri): bilgi satırları + başlık + satırlar. Test edilebilsin diye ayrı tutuldu.
export function excelSheets(rows: ScheduleRow[], meta: ScheduleMeta, preparedAt: string): Array<{ name: string; aoa: string[][]; headRow: number; dataCount: number }> {
  const make = (title: string, classLabel: string, list: ScheduleRow[]) => {
    const aoa: string[][] = [
      ['Etüt Listesi', title],
      ['Sınıf', classLabel],
      [meta.period === 'day' ? 'Gün' : 'Hafta', meta.periodLabel],
      ['Sıralama', SORT_LABEL[meta.sort]],
      ['Kayıt sayısı', String(list.length)],
      ['Hazırlanma', preparedAt],
      [],
    ];
    const headRow = aoa.length;
    aoa.push([...EXCEL_HEAD]);
    if (list.length) list.forEach((r) => aoa.push(excelCells(r)));
    else aoa.push(['Bu seçimde etüt yok']);
    return { aoa, headRow, dataCount: list.length };
  };
  const used = new Set<string>();
  const out: Array<{ name: string; aoa: string[][]; headRow: number; dataCount: number }> = [];
  if (!meta.allClasses) {
    out.push({ name: sheetName('Etüt Listesi', used), ...make(meta.classLabel, meta.classLabel, rows) });
    return out;
  }
  out.push({ name: sheetName('Tüm Sınıflar', used), ...make('Tüm sınıflar', 'Tüm sınıflar', rows) });
  for (const sec of splitSections(rows, meta)) out.push({ name: sheetName(sec.title, used), ...make(sec.title, sec.title, sec.rows) });
  return out;
}

export async function downloadScheduleExcel(rows: ScheduleResult['rows'], meta: ScheduleMeta): Promise<void> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const preparedAt = new Date().toLocaleString('tr-TR', { dateStyle: 'long', timeStyle: 'short' });
  for (const sh of excelSheets(rows, meta, preparedAt)) {
    const ws = XLSX.utils.aoa_to_sheet(sh.aoa);
    ws['!cols'] = EXCEL_HEAD.map((h, i) => {
      const longest = Math.max(h.length, ...sh.aoa.slice(sh.headRow + 1, sh.headRow + 501).map((r) => String(r[i] ?? '').length));
      return { wch: Math.min(Math.max(longest + 2, 8), i === 9 ? 60 : 36) };
    });
    if (sh.dataCount > 0) {
      ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: sh.headRow, c: 0 }, e: { r: sh.headRow + sh.dataCount, c: EXCEL_HEAD.length - 1 } }) };
    }
    XLSX.utils.book_append_sheet(wb, ws, sh.name);
  }
  XLSX.writeFile(wb, `${scheduleFileBase(meta)}.xlsx`);
}

// ----------------------------------------------------------------------------- PDF (A4 yatay)
interface PdfCol {
  head: string;
  width: number | 'auto';
  value: (r: ScheduleRow) => string;
  bold?: boolean;
  center?: boolean;
}
// time: günün başlık satırı var, tarih sütunu yok · student: öğrencinin başlık satırı var, öğrenci sütunu yok
export function pdfColumns(sort: ScheduleSort): PdfCol[] {
  const common: PdfCol[] = [
    { head: 'Sınıf', width: 14, value: (r) => r.className || '-', center: true },
    { head: 'Etüt yeri', width: 24, value: (r) => r.place || '-' },
    { head: 'Ders', width: 26, value: (r) => r.subject || '-' },
    { head: 'Konu', width: 42, value: (r) => r.topic || '-' },
    { head: 'Öğretmen', width: 34, value: (r) => r.teacher || '-' },
    { head: 'Açıklama', width: 'auto', value: (r) => r.note },
  ];
  return sort === 'student'
    ? [{ head: 'Tarih', width: 30, value: (r) => `${r.dateText} ${r.dayName}` }, { head: 'Saat', width: 26, value: (r) => r.time, bold: true }, ...common]
    : [{ head: 'Saat', width: 26, value: (r) => r.time, bold: true }, { head: 'Öğrenci', width: 42, value: (r) => r.student, bold: true }, ...common];
}
// Başlık satırı grupları: time → gün, student → öğrenci
export function groupKeyOf(r: ScheduleRow, sort: ScheduleSort): { key: string; label: string } {
  return sort === 'student'
    ? { key: r.studentId, label: `${r.student}${r.className ? `  ·  ${r.className}` : ''}` }
    : { key: r.dateYmd, label: longDate(r.dateYmd) };
}

export async function downloadSchedulePdf(rows: ScheduleResult['rows'], meta: ScheduleMeta): Promise<void> {
  const [{ jsPDF }, autoTableMod, fonts, analytics] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('./pdfFonts'),
    import('../utils/questionAnalytics'),
  ]);
  const autoTable = autoTableMod.default;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const fontOk = fonts.registerTurkishPdfFont(doc);
  const F = fontOk ? fonts.PDF_FONT : 'helvetica';
  const t = (s: unknown) => (fontOk ? analytics.cleanForPdfFont(s) : String(s ?? '').replace(/[^\x20-\x7E]/g, ''));
  const pageW = doc.internal.pageSize.getWidth();
  const M = 10;
  const cols = pdfColumns(meta.sort);
  const sections = splitSections(rows, meta);

  sections.forEach((sec, si) => {
    if (si > 0) doc.addPage();
    doc.setFont(F, 'bold');
    doc.setFontSize(16);
    doc.setTextColor(30, 27, 75);
    doc.text(t(meta.allClasses ? `Etüt Listesi – ${sec.title}` : 'Etüt Listesi'), M, 14);
    doc.setFont(F, 'normal');
    doc.setFontSize(10);
    doc.setTextColor(55, 65, 81);
    doc.text(
      t(`Sınıf: ${meta.allClasses ? sec.title : meta.classLabel}   ·   ${meta.period === 'day' ? 'Gün' : 'Hafta'}: ${meta.periodLabel}   ·   Sıralama: ${SORT_LABEL[meta.sort]}   ·   Kayıt: ${sec.rows.length}`),
      M,
      20
    );
    doc.setDrawColor(199, 210, 254);
    doc.line(M, 23, pageW - M, 23);

    const body: any[] = [];
    let last = '';
    for (const r of sec.rows) {
      const g = groupKeyOf(r, meta.sort);
      if (g.key !== last) {
        last = g.key;
        body.push([{ content: t(g.label), colSpan: cols.length, styles: { fontStyle: 'bold', fillColor: [238, 242, 255], textColor: [30, 27, 75] } }]);
      }
      body.push(cols.map((c) => t(c.value(r))));
    }
    if (!sec.rows.length) body.push([{ content: t('Bu seçimde etüt yok.'), colSpan: cols.length, styles: { textColor: [156, 163, 175] } }]);

    const columnStyles: Record<number, any> = {};
    cols.forEach((c, i) => {
      columnStyles[i] = { cellWidth: c.width, ...(c.bold ? { fontStyle: 'bold' } : {}), ...(c.center ? { halign: 'center' } : {}) };
    });
    autoTable(doc, {
      startY: 26,
      margin: { left: M, right: M, top: 14, bottom: 14 },
      head: [cols.map((c) => t(c.head))],
      body,
      theme: 'grid',
      styles: { font: F, fontSize: 8.4, cellPadding: 1.8, textColor: [55, 65, 81], lineColor: [209, 213, 219], lineWidth: 0.15, valign: 'middle', overflow: 'linebreak' },
      headStyles: { font: F, fillColor: [67, 56, 202], textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles,
      rowPageBreak: 'avoid',
    });
  });

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont(F, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(156, 163, 175);
    const h = doc.internal.pageSize.getHeight();
    doc.text(t(`${new Date().toLocaleDateString('tr-TR')} tarihinde hazırlandı`), M, h - 6);
    doc.text(t(`${p} / ${pages}`), pageW - M, h - 6, { align: 'right' });
  }
  doc.save(`${scheduleFileBase(meta)}.pdf`);
}

// ============================================================================
// Aşama 32b: ÖĞRETMENE GÖRE GRUPLU ETÜT LİSTESİ (PDF, A4 dikey)
// Her ders + gün ayrı sayfa: en üstte "FEN BİLİMLERİ DERSİ ETÜTÜ", altında tarih ve gün.
// Sonra her etüt (öğretmen) için ayrı tablo: Öğretmen, etüt saati ve yeri, etüt konusu ve altında öğrenciler.
// Öğrencilerin karşısına konu yazılmaz. Satırlar ekrandaki önizleme ve diğer listelerle aynı kaynaktan gelir.
// ============================================================================
export interface TeacherBlock {
  etutId: string;
  teacher: string; // "Ayşe Yılmaz" ya da birden çok öğretmen "A, B"
  time: string; // "10:20 – 11:00"
  startKey: string;
  place: string;
  topic: string;
  students: Array<{ id: string; name: string; className: string }>;
  /** Aşama 152: tablonun üst bilgi satırları (verilmezse Öğretmen · Etüt saati ve yeri · Etüt konusu) */
  lines?: Array<[string, string]>;
}
export interface SubjectDayPage {
  key: string;
  subject: string;
  dateYmd: string;
  title: string; // "FEN BİLİMLERİ DERSİ ETÜTÜ"
  dateLabel: string; // "13 Ekim 2026 Salı"
  blocks: TeacherBlock[];
  /** Aşama 57: "Tüm sınıflar" seçiliyken sayfanın sınıfı (her sayfada yalnızca bir sınıf) */
  classLabel?: string;
}

/** Ders adından sayfa başlığı: "Fen Bilimleri" → "FEN BİLİMLERİ DERSİ ETÜTÜ" */
export function subjectTitle(subject: string): string {
  const s = String(subject || '').trim();
  if (!s) return 'ETÜT LİSTESİ';
  const up = s.toLocaleUpperCase('tr-TR');
  return /DERS[İI]$/.test(up) ? `${up} ETÜTÜ` : `${up} DERSİ ETÜTÜ`;
}

export function buildTeacherPages(rows: ScheduleRow[]): SubjectDayPage[] {
  const pages = new Map<string, SubjectDayPage>();
  const blocks = new Map<string, TeacherBlock>();
  for (const r of rows) {
    const pk = `${r.dateYmd}|${r.subject.toLocaleLowerCase('tr-TR')}`;
    let page = pages.get(pk);
    if (!page) {
      page = { key: pk, subject: r.subject, dateYmd: r.dateYmd, title: subjectTitle(r.subject), dateLabel: longDate(r.dateYmd), blocks: [] };
      pages.set(pk, page);
    }
    let block = blocks.get(r.etutId);
    if (!block) {
      block = { etutId: r.etutId, teacher: r.teacher || '-', time: r.time, startKey: r.startKey, place: r.place, topic: r.topic, students: [] };
      blocks.set(r.etutId, block);
      page.blocks.push(block);
    }
    if (!block.students.some((s) => s.id === r.studentId)) block.students.push({ id: r.studentId, name: r.student, className: r.className });
  }
  const list = Array.from(pages.values());
  for (const p of list) {
    p.blocks.sort((a, b) => cs(a.startKey, b.startKey) || tr(a.teacher, b.teacher) || cs(a.etutId, b.etutId));
    for (const b of p.blocks) b.students.sort((x, y) => tr(x.className, y.className) || tr(x.name, y.name) || cs(x.id, y.id));
  }
  return list.sort((a, b) => cs(a.dateYmd, b.dateYmd) || tr(a.subject, b.subject));
}

/**
 * Aşama 57: "Tüm sınıflar" seçiliyken liste sınıf sınıf bölünür: her sayfada yalnızca BİR sınıfın öğrencileri olur
 * (sınıf → gün → ders sırasıyla). Tek sınıf seçiliyken eskisi gibi ders/gün sayfaları.
 */
export function buildTeacherPagesFor(rows: ScheduleRow[], meta: Pick<ScheduleMeta, 'allClasses' | 'classLabel' | 'sort'>): SubjectDayPage[] {
  if (!meta.allClasses) return buildTeacherPages(rows);
  return splitSections(rows, meta).flatMap((sec) => buildTeacherPages(sec.rows).map((p) => ({ ...p, key: `${sec.key}|${p.key}`, classLabel: sec.title })));
}

// ----------------------------------------------------------------------------- Aşama 152: öğretmene göre bölme
// Her öğretmen bir bölüm; bölümde o öğretmenin dönemdeki etütleri (tarih → saat sırası). Bir etüt sınıflara BÖLÜNMEZ:
// farklı sınıflardan öğrenciler tek tabloda, sınıflarıyla birlikte. Birden çok öğretmenli etüt her öğretmenin bölümünde çıkar.
export interface TeacherSection {
  key: string;
  name: string;
  blocks: TeacherBlock[];
  dateYmd: string[]; // bloklarla aynı sırada (sıralama için)
}
export function buildTeacherSections(rows: ScheduleRow[], opts: { onlyKey?: string; together: boolean }): TeacherSection[] {
  const sections = new Map<string, TeacherSection>();
  const blocks = new Map<string, TeacherBlock & { _date: string; _subject: string }>();
  for (const r of rows) {
    r.teacherKeys.forEach((key, i) => {
      if (opts.onlyKey && opts.onlyKey !== 'all' && key !== opts.onlyKey) return;
      let sec = sections.get(key);
      if (!sec) sections.set(key, (sec = { key, name: r.teacherNames[i] || '-', blocks: [], dateYmd: [] }));
      const bk = `${key}|${r.etutId}`;
      let b = blocks.get(bk);
      if (!b) {
        const lines: Array<[string, string]> = [];
        // Hepsi bir aradayken her tablo kendi öğretmenini taşır; ayrı sayfada öğretmen sayfa başlığındadır (yalnız ortak öğretmenler yazılır)
        if (opts.together) lines.push(['Öğretmen', r.teacher || sec.name]);
        else if (r.teacherKeys.length > 1) lines.push(['Öğretmenler', r.teacher]);
        lines.push(['Tarih ve ders', `${r.dateText} ${r.dayName}${r.subject ? `  ·  ${r.subject}` : ''}`]);
        lines.push(['Etüt saati ve yeri', [r.time, r.place].filter(Boolean).join('  ·  ')]);
        lines.push(['Etüt konusu', r.topic]);
        b = { etutId: r.etutId, teacher: r.teacher || '-', time: r.time, startKey: r.startKey, place: r.place, topic: r.topic, students: [], lines, _date: r.dateYmd, _subject: r.subject };
        blocks.set(bk, b);
        sec.blocks.push(b);
      }
      if (!b.students.some((st) => st.id === r.studentId)) b.students.push({ id: r.studentId, name: r.student, className: r.className });
    });
  }
  const list = Array.from(sections.values());
  for (const sec of list) {
    const bs = sec.blocks as Array<TeacherBlock & { _date: string; _subject: string }>;
    bs.sort((a, b) => cs(a._date, b._date) || cs(a.startKey, b.startKey) || tr(a._subject, b._subject) || cs(a.etutId, b.etutId));
    for (const b of bs) b.students.sort((x, y) => tr(x.className, y.className) || tr(x.name, y.name) || cs(x.id, y.id));
    sec.dateYmd = bs.map((b) => b._date);
  }
  return list.sort((a, b) => tr(a.name, b.name) || cs(a.key, b.key));
}
/** Ayrı sayfa düzeninde öğretmen bölümü bir sayfa olur: başlık "AD SOYAD · ETÜT LİSTESİ", altında dönem. */
export function teacherSectionPages(sections: TeacherSection[], periodLabel: string): SubjectDayPage[] {
  return sections.map((sec) => ({
    key: `ogr|${sec.key}`,
    subject: '',
    dateYmd: sec.dateYmd[0] || '',
    title: `${sec.name.toLocaleUpperCase('tr-TR')} · ETÜT LİSTESİ`,
    dateLabel: periodLabel,
    blocks: sec.blocks,
  }));
}

export const teacherListFileBase = (m: ScheduleMeta) =>
  `Etut-Ogretmen-Listesi_${
    m.split === 'teacher'
      ? safeName(m.teacherLabel || '') || 'Tum-Ogretmenler'
      : `${m.allClasses ? 'Tum-Siniflar' : safeName(m.classLabel) || 'Sinif'}${m.teacherLabel ? `_${safeName(m.teacherLabel)}` : ''}`
  }${m.split === 'teacher' && !m.allClasses ? `_${safeName(m.classLabel)}` : ''}_${m.period === 'day' ? 'Gunluk' : 'Haftalik'}_${m.from}${
    m.split === 'teacher' && m.pageMode === 'together' ? '_Bir-arada' : ''
  }`;

// Aşama 32c: her ders/gün listesi TEK A4 sayfaya sığdırılır.
// Sırasıyla denenir: tek sütun 10 pt → ... → 7 pt, sonra iki sütun 10 pt → ... → 5.5 pt.
// Her deneme ayrı bir taslak PDF'e gerçekten çizilir; sayfa taşmadıysa o ayar kullanılır.
// Hiçbiri sığmazsa (çok kalabalık liste) tek sütun 7 pt ile basılır ve liste sonraki sayfada devam eder (hiçbir öğrenci kaybolmaz).
export interface TeacherPdfFit {
  cols: 1 | 2;
  fontSize: number;
}
export const TEACHER_PDF_FITS: TeacherPdfFit[] = [
  ...[10, 9.5, 9, 8.5, 8, 7.5, 7].map((fontSize) => ({ cols: 1 as const, fontSize })),
  ...[10, 9.5, 9, 8.5, 8, 7.5, 7, 6.5, 6, 5.5].map((fontSize) => ({ cols: 2 as const, fontSize })),
];

export async function downloadTeacherGroupedPdf(rows: ScheduleResult['rows'], meta: ScheduleMeta): Promise<void> {
  const [{ jsPDF }, autoTableMod, fonts, analytics] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('./pdfFonts'),
    import('../utils/questionAnalytics'),
  ]);
  const autoTable = autoTableMod.default;
  const newDoc = () => {
    const d = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const ok = fonts.registerTurkishPdfFont(d);
    return { d, ok };
  };
  // Aşama 152: öğretmene göre bölmede bölümler öğretmen öğretmen (etüt sınıflara bölünmez)
  const byTeacher = meta.split === 'teacher';
  const together = byTeacher && meta.pageMode === 'together';
  const sections = byTeacher ? buildTeacherSections(rows, { onlyKey: meta.teacherKey, together }) : [];
  const pages = byTeacher ? (together ? [] : teacherSectionPages(sections, meta.periodLabel)) : buildTeacherPagesFor(rows, meta); // Aşama 57: tüm sınıflarda her sayfa tek sınıf
  const M = 12;

  // Bir etüt tablosunu (x, y) noktasına çizer; tablonun bittiği y'yi döner. Sınıfa göre listede Aşama 32c'deki tabloyla birebir aynıdır.
  const drawBlock = (doc: any, F: string, t: (v: unknown) => string, b: TeacherBlock, x: number, y: number, colW: number, fit: TeacherPdfFit): number => {
    const pageW = doc.internal.pageSize.getWidth();
    const fs = fit.fontSize;
    const k = fs / 10;
    const pad = Math.max(0.8, 2 * k);
    const info = (label: string, value: string, strong = false): any[] => [
      {
        content: t(`${label}: ${value || '-'}`),
        colSpan: 3,
        styles: { halign: 'left', fontStyle: 'bold', fillColor: strong ? [199, 210, 254] : [238, 242, 255], textColor: [30, 27, 75], fontSize: fs },
      },
    ];
    const body: any[] = b.students.length
      ? b.students.map((st, i) => [String(i + 1), t(st.name), t(st.className || '-')])
      : [[{ content: t('Bu etüde öğrenci atanmamış.'), colSpan: 3, styles: { textColor: [156, 163, 175] } }]];
    const headLines = b.lines
      ? b.lines.map(([l, v], i) => info(l, v, i === 0 && l === 'Öğretmen'))
      : [info('Öğretmen', b.teacher), info('Etüt saati ve yeri', [b.time, b.place].filter(Boolean).join('  ·  ')), info('Etüt konusu', b.topic)];
    autoTable(doc, {
      startY: y,
      margin: { left: x, right: pageW - x - colW, top: 12, bottom: 12 },
      tableWidth: colW,
      head: <any[]>[...headLines, [t('Sıra'), t('Öğrenci (Ad Soyad)'), t('Sınıf')]],
      body,
      theme: 'grid',
      showHead: 'everyPage',
      pageBreak: 'auto',
      styles: { font: F, fontSize: fs, cellPadding: pad, textColor: [31, 41, 55], lineColor: [209, 213, 219], lineWidth: 0.15, valign: 'middle', overflow: 'linebreak' },
      headStyles: { font: F, fillColor: [67, 56, 202], textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: Math.max(7, 12 * k), halign: 'center' },
        1: { cellWidth: 'auto', fontStyle: 'bold' },
        2: { cellWidth: Math.max(14, (fit.cols === 2 ? 20 : 28) * k), halign: 'center' },
      },
      rowPageBreak: 'avoid',
    });
    return doc.lastAutoTable?.finalY || y;
  };

  // Bir ders/gün sayfasını verilen ayarla `doc`un SON sayfasına çizer. Taşma olduysa false döner.
  // trial = true: taslak denemesi, taşınca hemen durur. trial = false: gerçek çizim, taşsa da bütün bloklar çizilir.
  const drawPage = (doc: any, fontOk: boolean, p: SubjectDayPage, fit: TeacherPdfFit, trial: boolean): boolean => {
    const F = fontOk ? fonts.PDF_FONT : 'helvetica';
    const t = (v: unknown) => (fontOk ? analytics.cleanForPdfFont(v) : String(v ?? '').replace(/[^\x20-\x7E]/g, ''));
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const startPages = doc.getNumberOfPages();
    const fs = fit.fontSize;
    const k = fs / 10; // başlık ve boşluklar puntoyla orantılı küçülür

    // Başlık: ders adı, tarih ve gün
    doc.setFont(F, 'bold');
    doc.setFontSize(Math.max(12, 17 * k));
    doc.setTextColor(30, 27, 75);
    doc.text(t(p.title), pageW / 2, 14 + 2 * k, { align: 'center' });
    doc.setFont(F, 'normal');
    doc.setFontSize(Math.max(9, 11.5 * k));
    doc.setTextColor(55, 65, 81);
    let top = 20 + 3 * k;
    doc.text(t(p.dateLabel), pageW / 2, top, { align: 'center' });
    // Aşama 57: sayfanın sınıfı (tüm sınıflarda her sayfa bir sınıf; tek sınıfta seçilen sınıf)
    const clsLabel = p.classLabel || (!meta.allClasses ? meta.classLabel : '');
    if (clsLabel) {
      top += 4.5 * k + 1;
      if (p.classLabel) {
        doc.setFont(F, 'bold');
        doc.setFontSize(Math.max(9, 11 * k));
        doc.setTextColor(67, 56, 202);
      } else {
        doc.setFontSize(Math.max(7.5, 9 * k));
        doc.setTextColor(107, 114, 128);
      }
      doc.text(t(`Sınıf: ${clsLabel}`), pageW / 2, top, { align: 'center' });
      doc.setFont(F, 'normal');
    }
    top += 3;
    doc.setDrawColor(199, 210, 254);
    doc.line(M, top, pageW - M, top);
    top += 4;

    const gap = 6;
    const colW = fit.cols === 2 ? (pageW - 2 * M - gap) / 2 : pageW - 2 * M;
    const colX = fit.cols === 2 ? [M, M + colW + gap] : [M];
    const colY = colX.map(() => top);
    const blockGap = Math.max(3, 7 * k);

    for (const b of p.blocks) {
      // Bloğu en kısa sütuna koy
      const ci = colY.length === 2 && colY[1] < colY[0] ? 1 : 0;
      drawBlock(doc, F, t, b, colX[ci], colY[ci], colW, fit);
      if (trial && doc.getNumberOfPages() > startPages) return false; // taştı
      colY[ci] = (doc.lastAutoTable?.finalY || colY[ci]) + blockGap;
    }
    if (doc.getNumberOfPages() > startPages) return false;
    // Alt bilgi için yer kalsın
    return Math.max(...colY) - blockGap <= pageH - 10;
  };

  // Her sayfa için sığan EN BÜYÜK ayarı bul (taslak PDF'lerde dene). Liste büyükten küçüğe sıralı olduğu için
  // önce ilk ayar denenir (çoğu liste ilk denemede sığar), sığmazsa ikili arama ile birkaç denemede bulunur.
  const tryFit = (p: SubjectDayPage, fit: TeacherPdfFit) => {
    const { d, ok } = newDoc();
    return drawPage(d, ok, p, fit, true);
  };
  const SINGLE_FALLBACK: TeacherPdfFit = { cols: 1, fontSize: 7 };
  const fitFor = (p: SubjectDayPage): { fit: TeacherPdfFit; fits: boolean } => {
    if (tryFit(p, TEACHER_PDF_FITS[0])) return { fit: TEACHER_PDF_FITS[0], fits: true };
    let lo = 1;
    let hi = TEACHER_PDF_FITS.length - 1;
    if (!tryFit(p, TEACHER_PDF_FITS[hi])) return { fit: SINGLE_FALLBACK, fits: false };
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tryFit(p, TEACHER_PDF_FITS[mid])) hi = mid;
      else lo = mid + 1;
    }
    return { fit: TEACHER_PDF_FITS[hi], fits: true };
  };

  // ---- Aşama 152: "Hepsi bir arada" — tüm öğretmenlerin tabloları art arda, sayfa sayfa (iki sütuna kadar).
  // Önce her tablonun yüksekliği taslak belgede ölçülür (10 pt, tek ve iki sütun genişliğinde), yazı boyuyla orantılı
  // varsayılarak her ayar için sayfa sayısı hesaplanır: EN AZ sayfa, eşitse EN BÜYÜK yazı seçilir (7 pt altına inilmez).
  // Seçilen ayarla tablolar yeniden ölçülür ve gerçek yerleşim bu ölçülerle yapılır; tablo iki sayfa arasında bölünmez
  // (bir sütundan uzun tek tablo hariç: o yeni sayfada başlar, kendi kendine devam eder). Hiçbir öğrenci kaybolmaz.
  const togetherBlocks = together ? sections.flatMap((sec) => sec.blocks) : [];
  const togetherTitle = meta.teacherLabel ? `${meta.teacherLabel.toLocaleUpperCase('tr-TR')} · ETÜT LİSTESİ` : 'ETÜT LİSTESİ · ÖĞRETMENLERE GÖRE';
  const togetherHeader = (doc: any, F: string, t: (v: unknown) => string, k: number): number => {
    const pageW = doc.internal.pageSize.getWidth();
    doc.setFont(F, 'bold');
    doc.setFontSize(Math.max(12, 17 * k));
    doc.setTextColor(30, 27, 75);
    doc.text(t(togetherTitle), pageW / 2, 14 + 2 * k, { align: 'center' });
    doc.setFont(F, 'normal');
    doc.setFontSize(Math.max(9, 11.5 * k));
    doc.setTextColor(55, 65, 81);
    let top = 20 + 3 * k;
    doc.text(t(meta.periodLabel), pageW / 2, top, { align: 'center' });
    if (!meta.allClasses) {
      top += 4.5 * k + 1;
      doc.setFontSize(Math.max(7.5, 9 * k));
      doc.setTextColor(107, 114, 128);
      doc.text(t(`Sınıf: ${meta.classLabel}`), pageW / 2, top, { align: 'center' });
    }
    top += 3;
    doc.setDrawColor(199, 210, 254);
    doc.line(M, top, pageW - M, top);
    return top + 4;
  };
  const geom = (doc: any, fit: TeacherPdfFit) => {
    const pageW = doc.internal.pageSize.getWidth();
    const gap = 6;
    const colW = fit.cols === 2 ? (pageW - 2 * M - gap) / 2 : pageW - 2 * M;
    const colX = fit.cols === 2 ? [M, M + colW + gap] : [M];
    return { colW, colX, blockGap: Math.max(3, 7 * (fit.fontSize / 10)), bottom: doc.internal.pageSize.getHeight() - 12 };
  };
  // Taslak belgede her tabloyu boş bir sayfanın tepesine çizip yüksekliğini ölçer (sayfa taşarsa taşan kısım eklenir)
  const measureBlocks = (fit: TeacherPdfFit): number[] => {
    const { d, ok } = newDoc();
    const F = ok ? fonts.PDF_FONT : 'helvetica';
    const t = (v: unknown) => (ok ? analytics.cleanForPdfFont(v) : String(v ?? '').replace(/[^\x20-\x7E]/g, ''));
    const g = geom(d, fit);
    const usable = g.bottom - 12;
    return togetherBlocks.map((b, i) => {
      if (i > 0) d.addPage();
      const before = d.getNumberOfPages();
      const end = drawBlock(d, F, t, b, M, 12, g.colW, fit);
      const extra = d.getNumberOfPages() - before;
      if (extra > 0) for (let j = 0; j < extra; j++) d.addPage(); // sonraki ölçüm temiz sayfada başlasın
      return extra * usable + (end - 12);
    });
  };
  // Yerleşim: her tablo en kısa sütuna; sığmazsa yeni sayfa. Sonuç: her tablonun sayfası/sütunu/y'si ve toplam sayfa.
  const layoutTogether = (heights: number[], fit: TeacherPdfFit, firstTop: number, colX: number[], blockGap: number, bottom: number) => {
    const place: Array<{ page: number; x: number; y: number; tall: boolean }> = [];
    let page = 0;
    let colY = colX.map(() => firstTop);
    let pageTop = firstTop;
    for (const h of heights) {
      let ci = colY.length === 2 && colY[1] < colY[0] ? 1 : 0;
      if (colY[ci] + h > bottom && colY[ci] > pageTop + 0.01) {
        page++;
        pageTop = 12;
        colY = colX.map(() => 12);
        ci = 0;
      }
      const tall = colY[ci] + h > bottom;
      place.push({ page, x: colX[ci], y: colY[ci], tall });
      if (tall) {
        // Uzun tablo kendi kendine sonraki sayfalara taşar; bittiği sayfada sonraki tablolar altından devam eder
        const usable = bottom - 12;
        const over = colY[ci] + h - bottom;
        const more = Math.ceil(over / usable);
        page += more;
        pageTop = 12;
        const endY = 12 + (over - (more - 1) * usable) + blockGap;
        colY = colX.map(() => endY);
      } else colY[ci] += h + blockGap;
    }
    return { place, pages: page + 1 };
  };
  const drawTogether = (doc: any, fontOk: boolean) => {
    const F = fontOk ? fonts.PDF_FONT : 'helvetica';
    const t = (v: unknown) => (fontOk ? analytics.cleanForPdfFont(v) : String(v ?? '').replace(/[^\x20-\x7E]/g, ''));
    const g10 = { 1: measureBlocks({ cols: 1, fontSize: 10 }), 2: measureBlocks({ cols: 2, fontSize: 10 }) };
    // Başlık yüksekliği yazı boyuna bağlı: ayar başına taslakta hesaplanmaz, formülle bulunur (togetherHeader ile aynı)
    const headTop = (k: number) => 20 + 3 * k + (!meta.allClasses ? 4.5 * k + 1 : 0) + 7;
    let best: { fit: TeacherPdfFit; pages: number } | null = null;
    for (const fit of TEACHER_PDF_FITS) {
      if (fit.fontSize < 7) continue;
      const k = fit.fontSize / 10;
      const g = geom(doc, fit);
      const est = layoutTogether(g10[fit.cols].map((h) => h * k), fit, headTop(k), g.colX, g.blockGap, g.bottom).pages;
      if (!best || est < best.pages || (est === best.pages && fit.fontSize > best.fit.fontSize)) best = { fit, pages: est };
    }
    const fit = best ? best.fit : SINGLE_FALLBACK;
    const k = fit.fontSize / 10;
    const g = geom(doc, fit);
    const heights = measureBlocks(fit); // seçilen ayarda gerçek ölçüler
    const top = togetherHeader(doc, F, t, k);
    const { place } = layoutTogether(heights, fit, top, g.colX, g.blockGap, g.bottom);
    togetherBlocks.forEach((b, i) => {
      const pl = place[i];
      while (doc.getNumberOfPages() < pl.page + 1) doc.addPage();
      doc.setPage(pl.page + 1);
      drawBlock(doc, F, t, b, pl.x, pl.y, g.colW, fit);
    });
  };

  const { d: doc, ok: fontOk } = newDoc();
  const F = fontOk ? fonts.PDF_FONT : 'helvetica';
  const t = (v: unknown) => (fontOk ? analytics.cleanForPdfFont(v) : String(v ?? '').replace(/[^\x20-\x7E]/g, ''));
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  if (together ? !togetherBlocks.length : !pages.length) {
    doc.setFont(F, 'normal');
    doc.setFontSize(12);
    doc.text(t('Bu seçimde etüt yok.'), pageW / 2, 30, { align: 'center' });
  } else if (together) {
    drawTogether(doc, fontOk);
  }
  pages.forEach((p, pi) => {
    if (pi > 0) doc.addPage();
    const { fit } = fitFor(p);
    drawPage(doc, fontOk, p, fit, false);
  });

  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont(F, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(156, 163, 175);
    doc.text(t(`${new Date().toLocaleDateString('tr-TR')} tarihinde hazırlandı`), M, pageH - 5);
    doc.text(t(`${i} / ${total}`), pageW - M, pageH - 5, { align: 'right' });
  }
  doc.save(`${teacherListFileBase(meta)}.pdf`);
}
