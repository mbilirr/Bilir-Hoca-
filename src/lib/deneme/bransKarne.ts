// ============================================================================
// Aşama 130: BRANŞ (DERS) ŞUBE GELİŞİM KARNESİ
//  Bir dersin, bir şubedeki öğrencilerinin denemeden denemeye netleri:
//  satır = öğrenci (numara, ad), sütun = deneme (ad, tarih, soru sayısı), en sonda genel ortalama;
//  altta şube ortalaması ve kurum ortalaması. Ekran ve PDF aynı veriyi kullanır.
//  "Tüm şubeler" PDF'i: aynı ders, her şube ayrı sayfada (tek dosya).
//  Yeni veri / SQL gerekmez: ders netleri sonuçlardaki stats.subjects'ten, kurum ortalaması deneme özetinden okunur.
//  Hız: tek geçişte Map ile kurulur (öğrenci × deneme döngüsünde arama yok).
// ============================================================================
import type { DenemeExam, DenemeResult } from '../../services/denemeService';
import { fmtScore, round2 } from './lgs';
import { netVsKurumTone } from './sinifKarne';
import { dateRange, dateTr, examShort } from './karneModel';
import type { PdfBlock, PdfTone } from './karnePdf';

export interface BransSubject {
  key: string;
  name: string;
  short: string;
}
export interface BransRosterEntry {
  id: string;
  name: string;
  no?: string;
}
export interface BransRow {
  studentId: string;
  no: string;
  name: string;
  nets: Array<number | null>; // deneme sırasıyla (girmediyse null)
  tones: Array<'success' | 'danger' | null>; // kurum ortalamasına göre
  avg: number | null;
  attended: number;
}
export interface BransGelisim {
  className: string;
  subject: BransSubject;
  exams: DenemeExam[];
  counts: number[]; // denemedeki soru sayısı
  rows: BransRow[];
  subeAvg: Array<number | null>;
  kurumAvg: Array<number | null>;
  subeGenel: number | null;
  kurumGenel: number | null;
}

const avgOf = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r2 = (v: number | null) => (v === null ? null : round2(v));

/** Dersi içeren denemeler (verilen sıra korunur) */
export function bransExams(exams: DenemeExam[], subjectKey: string): DenemeExam[] {
  return exams.filter((e) => e.subjects.some((s) => s.key === subjectKey));
}

/**
 * Bir şubenin branş gelişim verisi.
 * results: yalnız o şubenin sonuçları · roster: şubenin bugünkü öğrencileri (hiç girmeyen de satırda görünür)
 */
export function bransGelisim(
  examsAll: DenemeExam[],
  results: DenemeResult[],
  subject: BransSubject,
  className: string,
  roster: BransRosterEntry[] = []
): BransGelisim | null {
  const exams = bransExams(examsAll, subject.key);
  if (!exams.length) return null;
  const idx = new Map(exams.map((e, i) => [e.id, i] as const));
  const counts = exams.map((e) => e.subjects.find((s) => s.key === subject.key)?.count ?? 0);
  const kurumAvg = exams.map((e) => {
    const v = e.summary.avgNet?.[subject.key];
    return typeof v === 'number' && Number.isFinite(v) ? round2(v) : null;
  });

  const rowMap = new Map<string, BransRow>();
  const blank = (id: string, name: string, no: string): BransRow => ({ studentId: id, no, name, nets: exams.map(() => null), tones: exams.map(() => null), avg: null, attended: 0 });
  for (const s of roster) rowMap.set(s.id, blank(s.id, s.name, s.no || ''));
  const noOf = new Map(roster.map((s) => [s.id, s.no || ''] as const));

  for (const r of results) {
    const i = idx.get(r.examId);
    if (i === undefined) continue;
    const net = r.stats?.subjects?.[subject.key]?.net;
    let row = rowMap.get(r.studentId);
    if (!row) {
      row = blank(r.studentId, r.studentName, noOf.get(r.studentId) || r.optik?.number || '');
      rowMap.set(r.studentId, row);
    }
    if (typeof net === 'number' && Number.isFinite(net)) row.nets[i] = net;
  }

  const rows = Array.from(rowMap.values());
  const perExam: number[][] = exams.map(() => []);
  for (const row of rows) {
    const got: number[] = [];
    row.nets.forEach((v, i) => {
      if (v === null) return;
      got.push(v);
      perExam[i].push(v);
    });
    row.attended = got.length;
    row.avg = r2(avgOf(got));
  }
  const subeAvg = perExam.map((xs) => r2(avgOf(xs)));
  for (const row of rows) row.tones = row.nets.map((v, i) => netVsKurumTone(v, kurumAvg[i], counts[i]));
  rows.sort((a, b) => a.name.localeCompare(b.name, 'tr'));

  return {
    className,
    subject,
    exams,
    counts,
    rows,
    subeAvg,
    kurumAvg,
    subeGenel: r2(avgOf(subeAvg.filter((v): v is number => v !== null))),
    kurumGenel: r2(avgOf(kurumAvg.filter((v): v is number => v !== null))),
  };
}

/** Sonuçları şubelere ayırır (sınav anındaki şube; Karar A3) ve her şube için veri kurar — "Tüm şubeler" PDF'i */
export function bransTumSubeler(
  exams: DenemeExam[],
  results: DenemeResult[],
  subject: BransSubject,
  classNameOf: (classId: string) => string | undefined,
  rosterOf: (classId: string) => BransRosterEntry[]
): BransGelisim[] {
  const byClass = new Map<string, DenemeResult[]>();
  for (const r of results) {
    const k = r.classId || '-';
    const list = byClass.get(k);
    if (list) list.push(r);
    else byClass.set(k, [r]);
  }
  const out: BransGelisim[] = [];
  for (const [cid, rs] of byClass) {
    if (cid === '-') continue; // sınıfsız sonuçlar şube sayfasına girmez
    const name = classNameOf(cid) || rs[0]?.className || 'Şube';
    const g = bransGelisim(exams, rs, subject, name, rosterOf(cid));
    if (g && g.rows.some((x) => x.attended > 0)) out.push(g);
  }
  return out.sort((a, b) => a.className.localeCompare(b.className, 'tr', { numeric: true }));
}

// ----------------------------------------------------------------------------- PDF
export const bransTitle = (s: BransSubject) => `${s.name} Şube Gelişim Karnesi`;

export function bransGelisimBlocks(g: BransGelisim, scopeLabel: string): PdfBlock[] {
  const n = g.exams.length;
  const head = [
    'No',
    'Adı Soyadı',
    ...g.exams.map((e, i) => `${examShort(e)}\n${dateTr(e.examDate)}\n${g.counts[i]} soru`),
    'Genel ort.',
    'Notlar',
  ];
  const rows: Array<Array<string | number>> = g.rows.map((x) => [x.no || '-', x.name, ...x.nets.map((v) => (v === null ? '-' : fmtScore(v))), fmtScore(x.avg), '']);
  const cellTones: Array<Array<PdfTone | null>> = g.rows.map((x) => [null, null, ...x.tones, null, null]);
  const rowTones: Array<PdfTone | null> = g.rows.map(() => null);
  rows.push(['', 'Şube ortalaması', ...g.subeAvg.map((v) => fmtScore(v)), fmtScore(g.subeGenel), '']);
  cellTones.push([]);
  rowTones.push('info');
  rows.push(['', 'Kurum ortalaması', ...g.kurumAvg.map((v) => fmtScore(v)), fmtScore(g.kurumGenel), '']);
  cellTones.push([]);
  rowTones.push('muted');
  return [
    { kind: 'title', text: bransTitle(g.subject), sub: `${g.className} · ${scopeLabel} (${n} deneme) · ${dateRange(g.exams)}` },
    { kind: 'text', text: 'Hücrelerde dersin neti yazılıdır. Yeşil: kurum ortalamasının üstü, kırmızı: altı (soru sayısının %5\'i kadar fark anlamlı sayılır). -: denemeye girmedi.', tone: 'muted' },
    {
      kind: 'table',
      head,
      rows,
      align: ['center', 'left', ...g.exams.map(() => 'center' as const), 'center', 'left'],
      widths: [12, 'auto', ...g.exams.map(() => 'auto' as const), 16, 34],
      fontSize: n > 8 ? 6.6 : 7.4,
      rowTones,
      toneColumn: 1,
      cellTones,
    },
  ];
}
