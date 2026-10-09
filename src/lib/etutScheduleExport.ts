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
        note: String(e.notes || '').trim(),
      });
      etutIds.add(e.id);
      studentIds.add(s.id);
    }
  }

  rows.sort(compareRows(opts.sort));
  return { rows, etutCount: etutIds.size, studentCount: studentIds.size, missingCount: missing.size };
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
  `Etut-Listesi_${m.allClasses ? 'Tum-Siniflar' : safeName(m.classLabel) || 'Sinif'}_${m.period === 'day' ? 'Gunluk' : 'Haftalik'}_${m.from}`;

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
