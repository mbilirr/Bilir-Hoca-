// ============================================================================
// DENEME ANALİZİ (Aşama 55) — SINIF VE ZÜMRE KARNELERİ
//  * Sınıf Birleştirilmiş Karnesi: sınıfın seçilen denemelerdeki gelişimi, kurumla farkı, kurumdaki sırası,
//    öğrenci × deneme puan tablosu, en çok yükselen / düşen öğrenciler, puan dağılımı.
//  * Kazanım Isı Haritası: satır = kazanım, sütun = sınıf, hücre = başarı yüzdesi (ya da kuruma göre fark).
// Bütün hesaplar kayıtlı cevaplar ve deneme özetlerinden yapılır; yeni veri ya da SQL gerekmez.
// ============================================================================
import type { DenemeExam, DenemeResult } from '../../services/denemeService';
import { LGS_SUBJECTS, markOf, round2, type ExamQuestion, type ExamSubject } from './lgs';
import { topicLabels } from './analiz';
import { NO_TOPIC, codeCompare, kazKey, shortKazanim } from './kazanimKarne';

const avgOf = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const classKeyOf = (r: DenemeResult) => r.classId || '-';

// ============================================================================ Sınıf Birleştirilmiş Karnesi
export interface ClassExamRow {
  exam: DenemeExam;
  n: number; // katılan öğrenci
  avgScore: number | null;
  avgTotalNet: number | null;
  maxScore: number | null;
  minScore: number | null;
  avgNet: Record<string, number | null>;
  kurumScore: number | null;
  kurumNet: Record<string, number | null>;
  diff: number | null; // sınıf - kurum (puan)
  rank: number | null; // sınıfın kurumdaki sırası (ortalama puana göre)
  rankOf: number; // kurumdaki sınıf sayısı
}

export interface ClassStudentRow {
  studentId: string;
  name: string;
  scores: Array<number | null>; // deneme sırasıyla (girmediyse null)
  nets: Array<number | null>;
  attended: number;
  avg: number | null;
  avgNet: number | null;
  first: number | null;
  last: number | null;
  change: number | null; // ilk girdiği → son girdiği deneme
  best: number | null;
  rank: number; // ortalama puana göre sınıf içi sıra
}

export interface ScoreBand {
  label: string;
  min: number;
  max: number; // dahil değil
}
/** LGS puan aralıkları (yüksekten düşüğe) */
export const SCORE_BANDS: ScoreBand[] = [
  { label: '450 ve üstü', min: 450, max: 1000 },
  { label: '400 - 449', min: 400, max: 450 },
  { label: '350 - 399', min: 350, max: 400 },
  { label: '300 - 349', min: 300, max: 350 },
  { label: '250 - 299', min: 250, max: 300 },
  { label: '250 altı', min: -1000, max: 250 },
];

export interface ClassCombined {
  classId: string;
  className: string;
  exams: DenemeExam[];
  subjects: ExamSubject[];
  perExam: ClassExamRow[];
  students: ClassStudentRow[];
  risers: ClassStudentRow[];
  fallers: ClassStudentRow[];
  bands: number[][]; // [bant][deneme] öğrenci sayısı
  summary: {
    avgScore: number | null; // deneme ortalamalarının ortalaması
    kurumScore: number | null;
    diff: number | null;
    firstAvg: number | null;
    lastAvg: number | null;
    change: number | null;
    bestExam: ClassExamRow | null;
    lastRank: { rank: number; of: number } | null;
    participation: number | null; // % (girilen deneme / (öğrenci × deneme))
    studentCount: number;
  };
}

/** Bir sınıfın sonuçlarından (results: yalnızca o sınıf) birleştirilmiş karne verisi */
export function classCombined(examsAll: DenemeExam[], results: DenemeResult[], subjects: ExamSubject[] = LGS_SUBJECTS, moverCount = 5): ClassCombined | null {
  const exams = examsAll.filter((e) => results.some((r) => r.examId === e.id));
  if (!exams.length) return null;
  const subs = subjects.filter((s) => exams.some((e) => e.subjects.some((x) => x.key === s.key)));
  const classId = results[0]?.classId || '-';
  const className = results[0]?.className || 'Sınıfsız';
  const byExam = new Map<string, DenemeResult[]>();
  for (const r of results) {
    if (!byExam.has(r.examId)) byExam.set(r.examId, []);
    byExam.get(r.examId)!.push(r);
  }

  const perExam: ClassExamRow[] = exams.map((e) => {
    const rs = byExam.get(e.id) || [];
    const scores = rs.map((r) => r.score).filter((v): v is number => typeof v === 'number');
    const avgNet: Record<string, number | null> = {};
    const kurumNet: Record<string, number | null> = {};
    for (const s of subs) {
      const v = avgOf(rs.map((r) => r.stats.subjects?.[s.key]?.net).filter((x): x is number => typeof x === 'number'));
      avgNet[s.key] = v === null ? null : round2(v);
      const k = e.summary.avgNet?.[s.key];
      kurumNet[s.key] = typeof k === 'number' ? k : null;
    }
    const avgScore = avgOf(scores);
    const kurumScore = typeof e.summary.avgScore === 'number' ? e.summary.avgScore : null;
    // kurumdaki sınıf sırası: deneme özetindeki sınıf ortalamalarına göre
    const cls = Object.entries(e.summary.classes || {})
      .filter(([, c]) => typeof c?.avgScore === 'number' && (c.count ?? 0) > 0)
      .sort((a, b) => b[1].avgScore - a[1].avgScore);
    const idx = cls.findIndex(([id]) => id === classId);
    return {
      exam: e,
      n: rs.length,
      avgScore: avgScore === null ? null : round2(avgScore),
      avgTotalNet: (() => {
        const v = avgOf(rs.map((r) => r.totalNet).filter((x): x is number => typeof x === 'number'));
        return v === null ? null : round2(v);
      })(),
      maxScore: scores.length ? Math.max(...scores) : null,
      minScore: scores.length ? Math.min(...scores) : null,
      avgNet,
      kurumScore,
      kurumNet,
      diff: avgScore !== null && kurumScore !== null ? round2(avgScore - kurumScore) : null,
      rank: idx >= 0 ? idx + 1 : null,
      rankOf: cls.length,
    };
  });

  // Öğrenci × deneme
  const sMap = new Map<string, ClassStudentRow>();
  exams.forEach((e, i) => {
    for (const r of byExam.get(e.id) || []) {
      let s = sMap.get(r.studentId);
      if (!s) {
        s = {
          studentId: r.studentId,
          name: r.studentName,
          scores: exams.map(() => null),
          nets: exams.map(() => null),
          attended: 0,
          avg: null,
          avgNet: null,
          first: null,
          last: null,
          change: null,
          best: null,
          rank: 0,
        };
        sMap.set(r.studentId, s);
      }
      s.name = r.studentName || s.name;
      s.scores[i] = typeof r.score === 'number' ? r.score : null;
      s.nets[i] = typeof r.totalNet === 'number' ? r.totalNet : null;
    }
  });
  const students = Array.from(sMap.values());
  for (const s of students) {
    const sc = s.scores.filter((v): v is number => v !== null);
    const nt = s.nets.filter((v): v is number => v !== null);
    s.attended = s.scores.filter((v) => v !== null).length;
    const a = avgOf(sc);
    const an = avgOf(nt);
    s.avg = a === null ? null : round2(a);
    s.avgNet = an === null ? null : round2(an);
    s.first = sc.length ? sc[0] : null;
    s.last = sc.length ? sc[sc.length - 1] : null;
    s.change = sc.length >= 2 ? round2(sc[sc.length - 1] - sc[0]) : null;
    s.best = sc.length ? Math.max(...sc) : null;
  }
  students.sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1) || a.name.localeCompare(b.name, 'tr'));
  students.forEach((s, i) => (s.rank = i + 1));
  const movable = students.filter((s) => s.change !== null);
  const risers = movable
    .filter((s) => (s.change ?? 0) > 0)
    .sort((a, b) => (b.change ?? 0) - (a.change ?? 0))
    .slice(0, moverCount);
  const fallers = movable
    .filter((s) => (s.change ?? 0) < 0)
    .sort((a, b) => (a.change ?? 0) - (b.change ?? 0))
    .slice(0, moverCount);

  const bands = SCORE_BANDS.map((b) => exams.map((e) => (byExam.get(e.id) || []).filter((r) => typeof r.score === 'number' && r.score >= b.min && r.score < b.max).length));

  const valid = perExam.filter((p) => p.avgScore !== null);
  const withK = perExam.filter((p) => p.avgScore !== null && p.kurumScore !== null);
  const sumAvg = avgOf(valid.map((p) => p.avgScore!));
  const sumK = avgOf(withK.map((p) => p.kurumScore!));
  const lastWithRank = [...perExam].reverse().find((p) => p.rank !== null);
  const best = valid.length ? valid.reduce((a, b) => ((b.avgScore ?? 0) > (a.avgScore ?? 0) ? b : a)) : null;
  const slots = students.length * exams.length;
  return {
    classId,
    className,
    exams,
    subjects: subs,
    perExam,
    students,
    risers,
    fallers,
    bands,
    summary: {
      avgScore: sumAvg === null ? null : round2(sumAvg),
      kurumScore: sumK === null ? null : round2(sumK),
      diff: withK.length ? round2(avgOf(withK.map((p) => p.avgScore! - p.kurumScore!))!) : null,
      firstAvg: valid.length ? valid[0].avgScore : null,
      lastAvg: valid.length ? valid[valid.length - 1].avgScore : null,
      change: valid.length >= 2 ? round2(valid[valid.length - 1].avgScore! - valid[0].avgScore!) : null,
      bestExam: best,
      lastRank: lastWithRank && lastWithRank.rank !== null ? { rank: lastWithRank.rank, of: lastWithRank.rankOf } : null,
      participation: slots ? Math.round((students.reduce((a, s) => a + s.attended, 0) / slots) * 100) : null,
      studentCount: students.length,
    },
  };
}

/** Öğrencinin bir denemedeki puanının sınıf ortalamasına göre tonu (±20 puan) */
export function scoreVsClassTone(score: number | null, classAvg: number | null): 'success' | 'danger' | null {
  if (score === null || classAvg === null) return null;
  if (score - classAvg >= 20) return 'success';
  if (classAvg - score >= 20) return 'danger';
  return null;
}

/** Sınıf ders netinin kuruma göre tonu: soru sayısının %5'i kadar fark anlamlı sayılır */
export function netVsKurumTone(net: number | null, kurum: number | null, questionCount: number): 'success' | 'danger' | null {
  if (net === null || kurum === null) return null;
  const th = Math.max(0.5, questionCount * 0.05);
  if (net - kurum >= th) return 'success';
  if (kurum - net >= th) return 'danger';
  return null;
}

// ============================================================================ Kazanım Isı Haritası
export interface HeatCell {
  d: number;
  y: number;
  b: number;
  total: number; // değerlendirilen cevap (öğrenci × soru)
  students: number; // bu kazanımda cevabı olan farklı öğrenci
  rate: number;
}

export interface HeatClass {
  id: string;
  name: string;
  students: number;
}

export interface KazHeatRow {
  key: string;
  code?: string;
  label: string;
  short: string;
  questions: number; // farklı soru (deneme × soru)
  examCount: number;
  cells: Record<string, HeatCell | undefined>;
  kurum: HeatCell;
  spread: number | null; // sınıflar arasında en yüksek - en düşük başarı
  weakClasses: number; // %50 altı sınıf sayısı
}

export interface KazHeatSubject {
  subject: ExamSubject;
  rows: KazHeatRow[];
  classTotals: Record<string, HeatCell | undefined>; // sınıfın o dersteki genel başarısı
  kurumTotal: HeatCell;
}

export interface KazHeat {
  classes: HeatClass[];
  subjects: KazHeatSubject[];
}

const newCell = (): HeatCell => ({ d: 0, y: 0, b: 0, total: 0, students: 0, rate: 0 });
const finishCell = (c: HeatCell) => (c.rate = c.total ? Math.round((c.d / c.total) * 100) : 0);
/** Isı haritasında güvenilir sayılan en az cevap (öğrenci × soru) */
export const HEAT_MIN_TOTAL = 5;

export function kazanimClassHeat(examsAll: DenemeExam[], results: DenemeResult[], subjects: ExamSubject[] = LGS_SUBJECTS): KazHeat {
  const exams = examsAll.filter((e) => results.some((r) => r.examId === e.id));
  const clsMap = new Map<string, { name: string; ids: Set<string> }>();
  for (const r of results) {
    const k = classKeyOf(r);
    if (!clsMap.has(k)) clsMap.set(k, { name: r.className || 'Sınıfsız', ids: new Set() });
    clsMap.get(k)!.ids.add(r.studentId);
  }
  const classes: HeatClass[] = Array.from(clsMap.entries())
    .map(([id, v]) => ({ id, name: v.name, students: v.ids.size }))
    .sort((a, b) => a.name.localeCompare(b.name, 'tr', { numeric: true }));
  const byExam = new Map<string, DenemeResult[]>();
  for (const r of results) {
    if (!byExam.has(r.examId)) byExam.set(r.examId, []);
    byExam.get(r.examId)!.push(r);
  }
  const out: KazHeatSubject[] = [];
  for (const sub of subjects) {
    const rows = new Map<string, KazHeatRow & { _st: Record<string, Set<string>>; _kst: Set<string>; _ex: Set<string> }>();
    const classTotals: Record<string, HeatCell | undefined> = {};
    const kurumTotal = newCell();
    for (const ex of exams) {
      if (!ex.subjects.some((s) => s.key === sub.key)) continue;
      const rs = byExam.get(ex.id) || [];
      (ex.questions[sub.key] || []).forEach((q: ExamQuestion, i: number) => {
        if (!q.answer) return;
        const { konu } = topicLabels(q);
        const code = (q.kazanimCode || '').trim() || undefined;
        const k = kazKey(code, konu);
        let row = rows.get(k);
        if (!row) {
          row = {
            key: k,
            code,
            label: konu,
            short: shortKazanim(code, q.konu, q.kazanim || (q.konu ? undefined : konu)),
            questions: 0,
            examCount: 0,
            cells: {},
            kurum: newCell(),
            spread: null,
            weakClasses: 0,
            _st: {},
            _kst: new Set(),
            _ex: new Set(),
          };
          rows.set(k, row);
        } else {
          row.label = konu;
          row.short = shortKazanim(code, q.konu, q.kazanim || (q.konu ? undefined : konu));
        }
        row.questions++;
        row._ex.add(ex.id);
        for (const r of rs) {
          const ck = classKeyOf(r);
          const m = markOf((r.answers[sub.key] || '')[i], q);
          const cell = (row.cells[ck] = row.cells[ck] || newCell());
          const ct = (classTotals[ck] = classTotals[ck] || newCell());
          for (const c of [cell, row.kurum, ct, kurumTotal]) {
            c.total++;
            if (m === 'D') c.d++;
            else if (m === 'Y') c.y++;
            else c.b++;
          }
          (row._st[ck] = row._st[ck] || new Set()).add(r.studentId);
          row._kst.add(r.studentId);
        }
      });
    }
    if (!rows.size) continue;
    const list: KazHeatRow[] = [];
    for (const row of rows.values()) {
      for (const [ck, c] of Object.entries(row.cells)) {
        if (!c) continue;
        c.students = row._st[ck]?.size ?? 0;
        finishCell(c);
      }
      row.kurum.students = row._kst.size;
      finishCell(row.kurum);
      row.examCount = row._ex.size;
      const reliable = Object.values(row.cells).filter((c): c is HeatCell => !!c && c.total >= HEAT_MIN_TOTAL);
      row.spread = reliable.length >= 2 ? Math.max(...reliable.map((c) => c.rate)) - Math.min(...reliable.map((c) => c.rate)) : null;
      row.weakClasses = reliable.filter((c) => c.rate < 50).length;
      const { _st, _kst, _ex, ...clean } = row;
      void _st;
      void _kst;
      void _ex;
      list.push(clean);
    }
    for (const c of Object.values(classTotals)) if (c) finishCell(c);
    finishCell(kurumTotal);
    list.sort((a, b) => (a.label === NO_TOPIC ? 1 : 0) - (b.label === NO_TOPIC ? 1 : 0) || codeCompare(a.code, b.code) || a.label.localeCompare(b.label, 'tr'));
    out.push({ subject: sub, rows: list, classTotals, kurumTotal });
  }
  return { classes, subjects: out };
}

export type HeatMode = 'basari' | 'fark';
export type HeatSort = 'kod' | 'zayif' | 'fark';

export interface HeatOptions {
  subjectKey: string; // 'all' ya da ders anahtarı
  classIds: string[]; // boş = bütün sınıflar
  mode: HeatMode;
  sort: HeatSort;
  onlyWeak: boolean; // yalnızca en az bir sınıfta %50 altı olan kazanımlar
}

export const DEFAULT_HEAT_OPTIONS: HeatOptions = { subjectKey: 'all', classIds: [], mode: 'basari', sort: 'kod', onlyWeak: false };

/** Seçeneklere göre süzülmüş ve sıralanmış ısı haritası */
export function filterHeat(h: KazHeat, o: HeatOptions): KazHeat {
  const classes = o.classIds.length ? h.classes.filter((c) => o.classIds.includes(c.id)) : h.classes;
  const ids = classes.map((c) => c.id);
  const subjects = h.subjects
    .filter((s) => o.subjectKey === 'all' || s.subject.key === o.subjectKey)
    .map((s) => {
      // fark ve zayıf sınıf sayısı yalnızca seçili sınıflara göre yeniden hesaplanır
      let rows = s.rows.map((r) => {
        const reliable = ids.map((id) => r.cells[id]).filter((c): c is HeatCell => !!c && c.total >= HEAT_MIN_TOTAL);
        return {
          ...r,
          spread: reliable.length >= 2 ? Math.max(...reliable.map((c) => c.rate)) - Math.min(...reliable.map((c) => c.rate)) : null,
          weakClasses: reliable.filter((c) => c.rate < 50).length,
        };
      });
      if (o.onlyWeak) rows = rows.filter((r) => ids.some((id) => (r.cells[id]?.total ?? 0) >= HEAT_MIN_TOTAL && (r.cells[id]?.rate ?? 100) < 50));
      if (o.sort === 'zayif') rows = [...rows].sort((a, b) => a.kurum.rate - b.kurum.rate || b.questions - a.questions);
      else if (o.sort === 'fark') rows = [...rows].sort((a, b) => (b.spread ?? -1) - (a.spread ?? -1));
      return { ...s, rows };
    })
    .filter((s) => s.rows.length > 0);
  return { classes, subjects };
}

/** Kuruma göre farkın tonu (başarı yüzdesi farkı, puan) */
export function diffTone(diff: number): 'success' | 'info' | 'warning' | 'danger' | null {
  if (diff >= 10) return 'success';
  if (diff >= 5) return 'info';
  if (diff <= -10) return 'danger';
  if (diff <= -5) return 'warning';
  return null;
}

export interface HeatInsight {
  subject: ExamSubject;
  row: KazHeatRow;
  classId?: string;
  className?: string;
  rate: number;
  note: string;
}

/** Zümre için öne çıkanlar: kurumun en zayıf kazanımları, sınıflar arası en büyük farklar, her sınıfın en zayıf kazanımı */
export function heatInsights(h: KazHeat, max = 5): { weakest: HeatInsight[]; widest: HeatInsight[]; perClass: Array<{ cls: HeatClass; items: HeatInsight[] }> } {
  const all: Array<{ subject: ExamSubject; row: KazHeatRow }> = [];
  for (const s of h.subjects) for (const r of s.rows) if (r.label !== NO_TOPIC && r.kurum.total >= HEAT_MIN_TOTAL) all.push({ subject: s.subject, row: r });
  const weakest = [...all]
    .sort((a, b) => a.row.kurum.rate - b.row.kurum.rate || b.row.questions - a.row.questions)
    .slice(0, max)
    .map((x) => ({ ...x, rate: x.row.kurum.rate, note: `Kurum %${x.row.kurum.rate} · ${x.row.questions} soru` }));
  const widest = all
    .filter((x) => (x.row.spread ?? 0) >= 20)
    .sort((a, b) => (b.row.spread ?? 0) - (a.row.spread ?? 0))
    .slice(0, max)
    .map((x) => {
      const cells = h.classes
        .map((c) => ({ c, cell: x.row.cells[c.id] }))
        .filter((v): v is { c: HeatClass; cell: HeatCell } => !!v.cell && v.cell.total >= HEAT_MIN_TOTAL);
      if (cells.length < 2) return null;
      const hi = cells.reduce((a, b) => (b.cell.rate > a.cell.rate ? b : a));
      const lo = cells.reduce((a, b) => (b.cell.rate < a.cell.rate ? b : a));
      return { ...x, rate: x.row.spread ?? 0, note: `${hi.c.name} %${hi.cell.rate} · ${lo.c.name} %${lo.cell.rate}` } as HeatInsight;
    })
    .filter((x): x is HeatInsight => x !== null);
  const perClass = h.classes.map((cls) => {
    const items = all
      .filter((x) => (x.row.cells[cls.id]?.total ?? 0) >= HEAT_MIN_TOTAL)
      .map((x) => ({ ...x, classId: cls.id, className: cls.name, rate: x.row.cells[cls.id]!.rate, note: `Kurum %${x.row.kurum.rate}` }))
      .filter((x) => x.rate < 50)
      .sort((a, b) => a.rate - b.rate || a.rate - a.row.kurum.rate - (b.rate - b.row.kurum.rate))
      .slice(0, 3);
    return { cls, items };
  });
  return { weakest, widest, perClass };
}
