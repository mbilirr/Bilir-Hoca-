// ============================================================================
// DENEME ANALİZİ (Aşama 115) — ORTALAMA SIRALAMA
// Son 3 / Son 5 / seçilen denemelerin ortalamasıyla öğrenci sıralaması: toplu (genel sıra) ve sınıf sınıf
// (sınıf sırası). Ortalama, öğrencinin kapsamda GİRDİĞİ denemeler üzerinden alınır; kaç denemeye girdiği
// ayrı sütunda yazılır. Sıralama puana göre (eşitlikte toplam net), eşit puan aynı sırayı alır.
// Hız: tek geçişte öğrenci başına toplama (Map), sıralama bir kez; Excel yazıcısı (fflate) yalnız indirirken iner.
// ============================================================================
import type { ClassGroup, Student } from '../../types';
import type { DenemeExam, DenemeResult } from '../../services/denemeService';
import type { ExamSubject } from './lgs';
import { round2 } from './lgs';
import { dateTr } from './karneModel';
import { downloadStyledXlsx, safeSheetName, type Cell, type CellStyle, type StyledSheet } from '../xlsxStyled';

export interface SiraRow {
  studentId: string;
  name: string;
  no: string;
  classId: string;
  className: string;
  taken: number; // girdiği deneme sayısı
  nets: Record<string, number | null>; // ders anahtarı → ortalama net
  totalNet: number | null;
  score: number | null;
  overall: number; // genel sıra
  cls: number; // sınıf sırası
}

export interface SiraResult {
  subjects: ExamSubject[];
  rows: SiraRow[]; // genel sıraya göre
  examCount: number;
}

const collator = new Intl.Collator('tr', { numeric: true, sensitivity: 'base' });

/** Kapsamdaki denemelerde geçen dersler (ilk geçtiği sırayla) */
export function usedSubjectsOf(exams: DenemeExam[]): ExamSubject[] {
  const out: ExamSubject[] = [];
  const seen = new Set<string>();
  for (const e of exams)
    for (const s of e.subjects || []) {
      if (seen.has(s.key)) continue;
      seen.add(s.key);
      out.push(s);
    }
  return out;
}

export function buildSiralama(exams: DenemeExam[], results: DenemeResult[], students: Student[], classes: ClassGroup[]): SiraResult {
  const subjects = usedSubjectsOf(exams);
  const examIds = new Set(exams.map((e) => e.id));
  const order = new Map(exams.map((e, i) => [e.id, i] as const)); // eskiden yeniye
  const stuById = new Map(students.map((s) => [s.id, s] as const));
  const clsName = new Map(classes.map((c) => [c.id, c.name] as const));

  type Acc = { r: DenemeResult; lastIdx: number; n: number; scoreSum: number; scoreN: number; netSum: number; netN: number; sub: Record<string, { s: number; n: number }> };
  const acc = new Map<string, Acc>();
  const seenPair = new Set<string>();
  for (const r of results) {
    if (!examIds.has(r.examId) || !r.studentId) continue;
    const pk = `${r.examId}|${r.studentId}`;
    if (seenPair.has(pk)) continue; // aynı denemede çift sonuç sayılmaz
    seenPair.add(pk);
    let a = acc.get(r.studentId);
    if (!a) acc.set(r.studentId, (a = { r, lastIdx: -1, n: 0, scoreSum: 0, scoreN: 0, netSum: 0, netN: 0, sub: {} }));
    const idx = order.get(r.examId) ?? 0;
    if (idx > a.lastIdx) {
      a.lastIdx = idx;
      a.r = r; // en son denemedeki ad / sınıf
    }
    a.n++;
    if (typeof r.score === 'number' && Number.isFinite(r.score)) {
      a.scoreSum += r.score;
      a.scoreN++;
    }
    if (typeof r.totalNet === 'number' && Number.isFinite(r.totalNet)) {
      a.netSum += r.totalNet;
      a.netN++;
    }
    const st = r.stats?.subjects || {};
    for (const k in st) {
      const net = st[k]?.net;
      if (typeof net !== 'number' || !Number.isFinite(net)) continue;
      const x = a.sub[k] || (a.sub[k] = { s: 0, n: 0 });
      x.s += net;
      x.n++;
    }
  }

  const rows: SiraRow[] = [];
  acc.forEach((a, sid) => {
    const s = stuById.get(sid);
    const classId = s?.classId || a.r.classId || '';
    const nets: Record<string, number | null> = {};
    for (const sub of subjects) {
      const x = a.sub[sub.key];
      nets[sub.key] = x && x.n ? round2(x.s / x.n) : null;
    }
    rows.push({
      studentId: sid,
      name: (s?.name || a.r.studentName || '').trim() || '-',
      no: String(s?.studentNumber || '').trim(),
      classId,
      className: (classId && clsName.get(classId)) || s?.className || a.r.className || 'Sınıfsız',
      taken: a.n,
      nets,
      totalNet: a.netN ? round2(a.netSum / a.netN) : null,
      score: a.scoreN ? Math.round((a.scoreSum / a.scoreN) * 1000) / 1000 : null,
      overall: 0,
      cls: 0,
    });
  });

  const byScore = (x: SiraRow, y: SiraRow) => (y.score ?? -1) - (x.score ?? -1) || (y.totalNet ?? -1) - (x.totalNet ?? -1) || collator.compare(x.name, y.name);
  rows.sort(byScore);
  const rankIn = (list: SiraRow[], set: (r: SiraRow, n: number) => void) => {
    let prev: string | null = null;
    let rank = 0;
    list.forEach((r, i) => {
      const k = `${r.score ?? ''}|${r.totalNet ?? ''}`;
      if (k !== prev) rank = i + 1;
      prev = k;
      set(r, rank);
    });
  };
  rankIn(rows, (r, n) => (r.overall = n));
  const byClass = new Map<string, SiraRow[]>();
  for (const r of rows) {
    const k = r.classId || r.className;
    let l = byClass.get(k);
    if (!l) byClass.set(k, (l = []));
    l.push(r); // genel sıraya göre zaten dizili
  }
  byClass.forEach((l) => rankIn(l, (r, n) => (r.cls = n)));
  return { subjects, rows, examCount: exams.length };
}

// ----------------------------------------------------------------------------- Excel
/**
 * duzen 'toplu': tek sayfa, genel sıraya göre. 'sinif': her sınıf ayrı sayfa, sınıf sırasına göre.
 * Sayılar Excel'de sayı olarak yazılır (sıralanabilir / formül kurulabilir).
 * Aşama 120: satırlar bir beyaz, bir açık renk (zebra); tablo başlığı kalın ve gri zeminli.
 */
export async function downloadSiralamaExcel(
  res: SiraResult,
  opts: { duzen: 'toplu' | 'sinif'; classId: string; scopeLabel: string; grade: string; exams: DenemeExam[]; fileBase: string }
): Promise<void> {
  const used = new Set<string>();
  const subs = res.subjects;
  const head = ['Sıra', 'Genel Sıra', 'Sınıf Sırası', 'Öğrenci No', 'Öğrenci', 'Sınıf', 'Deneme', ...subs.map((s) => `${s.short} Net`), 'Toplam Net', 'Puan'];
  const cols = head.map((h, i) => (i === 4 ? 26 : i === 0 ? 7 : Math.max(9, h.length + 2)));
  const num = (v: number | null) => (v === null ? '' : v);
  const meta: Cell[][] = [
    [{ v: 'Kapsam', s: 'bold' }, `${opts.scopeLabel} (ortalama)`],
    [{ v: 'Kademe', s: 'bold' }, opts.grade ? `${opts.grade}. sınıf` : '-'],
    [{ v: 'Denemeler', s: 'bold' }, opts.exams.map((e) => `${e.name} (${dateTr(e.examDate)})`).join(' · ')],
    [{ v: 'Not', s: 'bold' }, 'Ortalama, öğrencinin girdiği denemeler üzerinden alınır; "Deneme" sütunu girdiği / toplam deneme sayısıdır.'],
    [{ v: 'Hazırlanma', s: 'bold' }, new Date().toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })],
  ];
  const sheet = (name: string, title: string, list: SiraRow[], pick: (r: SiraRow) => number): StyledSheet => {
    const rows: Cell[][] = [[{ v: title, s: 'title' }], ...meta, [], head.map((h) => ({ v: h, s: 'head' as const }))];
    list.forEach((r, i) => {
      const s: CellStyle = i % 2 ? 'zebra' : 'plain'; // bir satır beyaz, bir satır renkli
      const vals: Array<string | number> = [pick(r), r.overall, r.cls, r.no, r.name, r.className, `${r.taken}/${res.examCount}`, ...subs.map((x) => num(r.nets[x.key])), num(r.totalNet), num(r.score === null ? null : round2(r.score))];
      rows.push(vals.map((v) => ({ v, s })));
    });
    return { name, rows, cols };
  };
  const sheets: StyledSheet[] = [];
  const shown = opts.classId === 'all' ? res.rows : res.rows.filter((r) => r.classId === opts.classId);
  if (opts.duzen === 'toplu') {
    const title = opts.classId === 'all' ? 'TOPLU SIRALAMA' : `${shown[0]?.className || 'Sınıf'} SIRALAMASI`;
    sheets.push(sheet(safeSheetName(opts.classId === 'all' ? 'Toplu Sıralama' : shown[0]?.className || 'Sınıf', used), title, shown, (r) => (opts.classId === 'all' ? r.overall : r.cls)));
  } else {
    const groups = new Map<string, SiraRow[]>();
    for (const r of shown) {
      let l = groups.get(r.className);
      if (!l) groups.set(r.className, (l = []));
      l.push(r);
    }
    Array.from(groups.keys())
      .sort(collator.compare)
      .forEach((name) => {
        const list = groups.get(name)!.slice().sort((a, b) => a.cls - b.cls || collator.compare(a.name, b.name));
        sheets.push(sheet(safeSheetName(name, used), `${name} SINIF SIRALAMASI`, list, (r) => r.cls));
      });
  }
  await downloadStyledXlsx(`${opts.fileBase}.xlsx`, sheets);
}
