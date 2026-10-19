// ============================================================================
// DENEME ANALİZİ (Aşama 47) — KARNE İÇERİKLERİ (PDF blokları)
// Öğrenci karnesi, sınıf karnesi ve sınıflar arası karşılaştırma.
// ============================================================================
import type { DenemeExam, DenemeResult } from '../../services/denemeService';
import { LEVEL_INFO, classAverages, levelOf, targetGap, topicAnalysis, type SubjectTopics } from './analiz';
import { LGS_SUBJECTS, fmtNet, fmtScore, round2, type ExamSubject } from './lgs';
import type { PdfBlock, PdfTone } from './karnePdf';
import { examKarneData, percentile, type ExamKarneData } from './karneDetay';
import { LGS_PERCENTILE_NOTE, isLgsExam, lgsPercentiles } from './lgsYuzdelik';
import {
  FOLLOW_INFO,
  KAZ_STATUS_INFO,
  KAZ_STATUS_ORDER,
  discLabel,
  fmtDisc,
  kazanimTracking,
  selectedAverages,
  suggestionFollowUp,
  studySuggestions,
  topicHeat,
  trackingTotals,
  withEk,
  type ItemSubject,
  type KazSubject,
  type StudySuggestion,
} from './kazanimKarne';
import type { BankRow } from '../../services/denemeService';
import {
  HEAT_MIN_TOTAL,
  SCORE_BANDS,
  diffTone,
  heatInsights,
  netVsKurumTone,
  scoreVsClassTone,
  type ClassCombined,
  type ClassStudentRow,
  type HeatCell,
  type HeatOptions,
  type KazHeat,
} from './sinifKarne';

export const dateTr = (d: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || '');
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '-';
};
/** Aşama 51: denemeler yükleniş sırasıyla dizildiğinden tarih aralığı en erken-en geç tarihten hesaplanır */
export const dateRange = (exams: DenemeExam[]) => {
  const ds = exams.map((e) => e.examDate || '').filter(Boolean).sort();
  return ds.length ? `${dateTr(ds[0])} - ${dateTr(ds[ds.length - 1])}` : '-';
};
export const examShort = (e: DenemeExam) => (e.name.length > 22 ? `${e.name.slice(0, 21)}…` : e.name);

/** Denemelerde gerçekten bulunan dersler (sıra korunur) */
export function usedSubjects(exams: DenemeExam[]): ExamSubject[] {
  return LGS_SUBJECTS.filter((s) => exams.some((e) => e.subjects.some((x) => x.key === s.key)));
}

const levelTone = (rate: number): PdfTone => LEVEL_INFO[levelOf(rate)].tone;

function topicBlocks(analysis: SubjectTopics[]): PdfBlock[] {
  const blocks: PdfBlock[] = [];
  if (!analysis.length) return blocks;
  blocks.push({ kind: 'heading', text: 'Konu ve kazanım analizi' });
  blocks.push({
    kind: 'text',
    tone: 'muted',
    text: 'Başarı = doğru / soru. %70 ve üstü başarılı · %50-69 konu tekrarı ve soru taktikleri · %30-49 takviye (etüt) ve soru çözümü · %30 altı kritik (konu yeniden anlatılmalı, yoğun soru çözümü).',
  });
  for (const st of analysis) {
    const rows: Array<Array<string | number>> = [];
    const tones: Array<PdfTone | null> = [];
    for (const t of st.topics) {
      rows.push([t.label, t.questions, t.d, t.y, t.b, `%${t.rate}`, LEVEL_INFO[levelOf(t.rate)].label]);
      tones.push(levelTone(t.rate));
      for (const c of t.children) {
        rows.push([`   └ ${c.label}`, c.questions, c.d, c.y, c.b, `%${c.rate}`, LEVEL_INFO[levelOf(c.rate)].label]);
        tones.push(levelTone(c.rate));
      }
    }
    blocks.push({ kind: 'text', text: `${st.subject.name}: başarı %${st.rate} (doğru ${st.d}, yanlış ${st.y}, boş ${st.b})` });
    blocks.push({
      kind: 'table',
      head: ['Konu / alt kazanım', 'Soru', 'D', 'Y', 'B', 'Başarı', 'Durum'],
      rows,
      align: ['left', 'center', 'center', 'center', 'center', 'center', 'center'],
      widths: ['auto', 12, 10, 10, 10, 15, 17],
      rowTones: tones,
      fontSize: 7.6,
    });
  }
  return blocks;
}

function adviceBlocks(analysis: SubjectTopics[]): PdfBlock[] {
  const weak: Array<{ subject: string; label: string; rate: number }> = [];
  for (const st of analysis)
    for (const t of st.topics) {
      const nodes = t.children.length ? t.children : [t];
      for (const n of nodes) if (n.rate < 70) weak.push({ subject: st.subject.name, label: t.children.length ? `${t.label} › ${n.label}` : n.label, rate: n.rate });
    }
  if (!weak.length) return [{ kind: 'heading', text: 'Öneriler' }, { kind: 'text', tone: 'success', text: 'Bütün konularda başarı %70 ve üstünde. Düzenli tekrarla korunmalı.' }];
  weak.sort((a, b) => a.rate - b.rate);
  return [
    { kind: 'heading', text: 'Öneriler' },
    {
      kind: 'table',
      head: ['Ders', 'Konu', 'Başarı', 'Öneri'],
      rows: weak.slice(0, 40).map((w) => [w.subject, w.label, `%${w.rate}`, LEVEL_INFO[levelOf(w.rate)].advice]),
      rowTones: weak.slice(0, 40).map((w) => levelTone(w.rate)),
      widths: [24, 'auto', 15, 70],
      align: ['left', 'left', 'center', 'left'],
      fontSize: 7.4,
    },
  ];
}

// ----------------------------------------------------------------------------- Aşama 50: tek deneme karnesi (PDF)
export function examKarneBlocks(data: ExamKarneData, studentName: string, className: string): PdfBlock[] {
  const { exam, subjects, topics, rank } = data;
  const pct = percentile(rank);
  const clsTotal = subjects.reduce((a, s) => a + (s.clsAvgNet ?? 0), 0);
  const kurumTotal = subjects.reduce((a, s) => a + (s.kurumAvgNet ?? 0), 0);
  const hasCls = subjects.some((s) => s.clsAvgNet !== null);
  const diff = (a: number | null, b: number | null, f: (n: number) => string) =>
    a === null || b === null || Math.abs(a - b) < 0.005 ? '-' : `${a - b > 0 ? '+' : '-'}${f(Math.abs(a - b))}`;
  const side: Array<[string, string]> = [
    ['Sınıf sırası', rank ? `${rank.cls} / ${rank.clsCount}` : '-'],
    ['Kurum sırası', rank ? `${rank.overall} / ${rank.overallCount}` : '-'],
  ];
  if (pct !== null) side.push(['Kurum içi yüzdelik', `%${pct}`]);
  // Aşama 51: geçmiş LGS yıllarına göre Türkiye geneli yüzdelik tahmini
  const lgsP = isLgsExam(exam) ? lgsPercentiles(data.score) : [];
  const lgsBlocks: PdfBlock[] = lgsP.length
    ? [
        {
          kind: 'tiles',
          items: lgsP.map((p) => ({
            label: `LGS ${p.year}${p.estimate ? ' (tahmini)' : ''}`,
            value: p.text,
            sub: 'Türkiye geneli yüzdelik dilim',
            tone: p.value <= 1 ? ('success' as const) : p.value <= 10 ? ('info' as const) : ('muted' as const),
          })),
        },
        { kind: 'text', tone: 'muted', text: `Bu puan geçmiş LGS yıllarında Türkiye genelinde yaklaşık bu yüzdelik dilimlere karşılık gelir. ${LGS_PERCENTILE_NOTE}` },
      ]
    : [];
  const blocks: PdfBlock[] = [
    {
      kind: 'hero',
      eyebrow: 'Deneme karnesi',
      title: studentName,
      sub: className || data.result.className || '',
      chips: [exam.name, dateTr(exam.examDate), exam.publisher, data.result.booklet ? `${data.result.booklet} kitapçığı` : ''],
      score: fmtScore(data.score),
      scoreLabel: 'LGS puanı',
      side,
    },
    {
      kind: 'tiles',
      items: [
        { label: 'Toplam net', value: fmtNet(data.totalNet), sub: `${hasCls ? `Sınıf ${fmtNet(round2(clsTotal))} · ` : ''}Kurum ${fmtNet(round2(kurumTotal))}` },
        { label: 'Doğru', value: String(data.totals.d), sub: `${data.totals.count} sorudan`, tone: 'success' },
        { label: 'Yanlış', value: String(data.totals.y), sub: '3 yanlış 1 doğruyu götürür', tone: 'danger' },
        { label: 'Boş', value: String(data.totals.b), tone: 'muted' },
        {
          label: 'Kurum ort. puan',
          value: fmtScore(data.kurumAvgScore),
          sub: `Fark ${diff(data.score, data.kurumAvgScore, fmtScore)}${data.clsAvgScore !== null ? ` · Sınıf ort. ${fmtScore(data.clsAvgScore)}` : ''}`,
          tone: 'info',
        },
      ],
    },
    ...lgsBlocks,
    { kind: 'heading', text: 'Ders sonuçları' },
    {
      kind: 'table',
      head: ['Ders', 'Soru', 'D', 'Y', 'B', 'Net', 'Başarı', ...(hasCls ? ['Sınıf ort.'] : []), 'Kurum ort.', 'Kuruma göre'],
      rows: [
        ...subjects.map((s) => [
          s.subject.name,
          s.count,
          s.d,
          s.y,
          s.b,
          fmtNet(s.net),
          `%${s.rate}`,
          ...(hasCls ? [fmtNet(s.clsAvgNet)] : []),
          fmtNet(s.kurumAvgNet),
          diff(s.net, s.kurumAvgNet, fmtNet),
        ]),
        [
          'Toplam',
          data.totals.count,
          data.totals.d,
          data.totals.y,
          data.totals.b,
          fmtNet(data.totalNet),
          `%${data.totals.count ? Math.round((data.totals.d / data.totals.count) * 100) : 0}`,
          ...(hasCls ? [fmtNet(round2(clsTotal))] : []),
          fmtNet(round2(kurumTotal)),
          diff(data.totalNet, round2(kurumTotal), fmtNet),
        ],
      ],
      rowTones: [...subjects.map((s) => levelTone(s.rate)), 'info'],
      align: ['left', 'center', 'center', 'center', 'center', 'center', 'center', ...(hasCls ? ['center' as const] : []), 'center', 'center'],
      fontSize: 7.8,
    },
    {
      kind: 'bar',
      title: 'Ders netleri: öğrenci, sınıf ve kurum',
      labels: subjects.map((s) => s.subject.short),
      series: [
        { name: 'Öğrenci', values: subjects.map((s) => s.net) },
        ...(hasCls ? [{ name: 'Sınıf ortalaması', values: subjects.map((s) => s.clsAvgNet ?? 0) }] : []),
        { name: 'Kurum ortalaması', values: subjects.map((s) => s.kurumAvgNet ?? 0) },
      ],
    },
    { kind: 'heading', text: 'Cevap çizelgesi' },
    {
      kind: 'answers',
      rows: subjects.map((s) => ({
        title: `${s.subject.name} · D ${s.d} · Y ${s.y} · B ${s.b} · Net ${fmtNet(s.net)}`,
        cells: s.answers.map((a) => ({ no: a.no, given: a.given, key: a.key, mark: a.mark })),
      })),
    },
    { kind: 'heading', text: 'Konu ve kazanım analizi' },
    {
      kind: 'text',
      tone: 'muted',
      text: 'Çubuk öğrencinin başarısını, dikey çizgi kurumun başarısını gösterir. Yeşil %70+ başarılı · Mavi %50-69 tekrar · Turuncu %30-49 takviye · Kırmızı %30 altı kritik.',
    },
  ];
  for (const s of subjects) {
    const list = topics.filter((t) => t.subject.key === s.subject.key);
    if (!list.length) continue;
    blocks.push({
      kind: 'rates',
      title: `${s.subject.name} (%${s.rate})`,
      items: list.map((t) => ({
        label: t.konu,
        sub: t.alt ? `${t.alt} · Sorular: ${t.questions.join(', ')}` : `Sorular: ${t.questions.join(', ')}`,
        rate: t.rate,
        marker: t.kurumRate,
        tone: levelTone(t.rate),
        right: `D${t.d} Y${t.y} B${t.b}`,
      })),
    });
  }
  const weak = topics.filter((t) => t.rate < 50 && t.konu !== 'Konusu belirtilmemiş').sort((a, b) => a.rate - b.rate);
  if (weak.length) {
    blocks.push({ kind: 'heading', text: 'Öncelikle çalışılması gereken konular' });
    blocks.push({
      kind: 'table',
      head: ['Ders', 'Konu', 'Başarı', 'Öneri'],
      rows: weak.slice(0, 15).map((w) => [w.subject.short, w.konu, `%${w.rate}`, LEVEL_INFO[levelOf(w.rate)].advice]),
      rowTones: weak.slice(0, 15).map((w) => levelTone(w.rate)),
      widths: [16, 'auto', 15, 62],
      align: ['left', 'left', 'center', 'left'],
      fontSize: 7.4,
    });
  }
  return blocks;
}

// ----------------------------------------------------------------------------- Öğrenci karnesi
export interface StudentKarneInput {
  studentName: string;
  className: string;
  exams: DenemeExam[]; // tarih sırasıyla
  results: DenemeResult[]; // öğrencinin sonuçları
  target: number | null;
  scopeLabel: string; // "Son 5 deneme" gibi
  /** Aşama 50: ayrıntılı karnesi PDF'in başına konacak deneme (boşsa en son deneme; 'none' ise konmaz) */
  detailExamId?: string;
}

export function studentKarneBlocks(inp: StudentKarneInput): PdfBlock[] {
  const exams = inp.exams.filter((e) => inp.results.some((r) => r.examId === e.id));
  const rByExam = new Map(inp.results.map((r) => [r.examId, r]));
  const subs = usedSubjects(exams);
  const last = exams.length ? rByExam.get(exams[exams.length - 1].id) || null : null;
  const scores = exams.map((e) => rByExam.get(e.id)?.score ?? null);
  const valid = scores.filter((s): s is number => s !== null);
  const avg = valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
  const gap = targetGap(last?.score ?? null, inp.target);
  const detailExam = inp.detailExamId === 'none' ? undefined : exams.find((e) => e.id === inp.detailExamId) || exams[exams.length - 1];
  const detailResult = detailExam ? rByExam.get(detailExam.id) : undefined;
  const head: PdfBlock[] =
    detailExam && detailResult ? [...examKarneBlocks(examKarneData(detailExam, detailResult), inp.studentName, inp.className), { kind: 'pagebreak' }] : [];
  const blocks: PdfBlock[] = [
    ...head,
    { kind: 'title', text: head.length ? 'Deneme Gelişimi' : 'Deneme Karnesi', sub: `${inp.studentName}${inp.className ? ` · ${inp.className}` : ''}` },
    {
      kind: 'kv',
      rows: [
        ['Kapsam', `${inp.scopeLabel} (${exams.length} deneme)`],
        ['Tarih aralığı', dateRange(exams)],
        ['Son puan', fmtScore(last?.score)],
        ['Ortalama puan', fmtScore(avg)],
        ['Son sınıf sırası', last?.stats.rank ? `${last.stats.rank.cls} / ${last.stats.rank.clsCount}` : '-'],
        ['Son genel sıra', last?.stats.rank ? `${last.stats.rank.overall} / ${last.stats.rank.overallCount}` : '-'],
        ['Hedef puan', inp.target !== null ? fmtScore(inp.target) : 'Belirlenmedi'],
        ['Son toplam net', fmtNet(last?.totalNet)],
      ],
    },
  ];
  if (gap) {
    blocks.push({
      kind: 'text',
      tone: gap.points > 0 ? 'warning' : 'success',
      text:
        gap.points > 0
          ? `Hedefe ulaşmak için son denemeye göre yaklaşık ${fmtScore(gap.points)} puan daha gerekiyor. Bu, Türkçe, Matematik ve Fen'de toplam yaklaşık ${fmtNet(gap.mainNets)} net (ya da İnkılap, Din ve Yabancı Dil'de ${fmtNet(gap.otherNets)} net) artış demektir.`
          : `Tebrikler! Son denemede hedef puanın ${fmtScore(-gap.points)} puan üstündesin.`,
    });
  }
  blocks.push({ kind: 'heading', text: 'Deneme sonuçları (Doğru / Yanlış / Net)' });
  blocks.push({
    kind: 'table',
    head: ['Deneme', 'Tarih', ...subs.map((s) => `${s.short} D/Y/N`), 'Top. net', 'Puan', 'Sınıf sırası'],
    rows: exams.map((e) => {
      const r = rByExam.get(e.id)!;
      return [
        e.name,
        dateTr(e.examDate),
        ...subs.map((s) => {
          const x = r.stats.subjects?.[s.key];
          return x ? `${x.d}/${x.y}/${fmtNet(x.net)}` : '-';
        }),
        fmtNet(r.totalNet),
        fmtScore(r.score),
        r.stats.rank ? `${r.stats.rank.cls}/${r.stats.rank.clsCount}` : '-',
      ];
    }),
    align: ['left', 'center', ...subs.map(() => 'center' as const), 'center', 'center', 'center'],
    fontSize: 7.2,
  });
  if (exams.length >= 1) {
    const clsAvg = exams.map((e) => {
      const r = rByExam.get(e.id);
      const c = r?.classId ? (e.summary.classes || {})[r.classId] : undefined;
      return c ? c.avgScore : null;
    });
    const series: Array<{ name: string; values: Array<number | null> }> = [{ name: 'Puan', values: scores }];
    if (clsAvg.some((v) => v !== null)) series.push({ name: 'Sınıf ortalaması', values: clsAvg });
    if (inp.target !== null) series.push({ name: 'Hedef', values: exams.map(() => inp.target) });
    blocks.push({ kind: 'line', title: 'Puan gelişimi', labels: exams.map(examShort), series });
    blocks.push({
      kind: 'line',
      title: 'Ders netlerinin gelişimi',
      labels: exams.map(examShort),
      series: subs.map((s) => ({ name: s.short, values: exams.map((e) => rByExam.get(e.id)?.stats.subjects?.[s.key]?.net ?? null) })),
    });
  }
  // Aşama 54: seçilen denemelerin ortalaması ve konu ısı tablosu
  blocks.push(...averageBlocks(exams, inp.results, subs));
  blocks.push(...heatBlocks(exams, inp.results, subs));
  const analysis = topicAnalysis(exams, inp.results, subs);
  blocks.push(...topicBlocks(analysis));
  blocks.push(...adviceBlocks(analysis));
  blocks.push({ kind: 'text', tone: 'muted', text: 'Puanlar yaklaşık LGS puanıdır (3 yanlış 1 doğruyu götürür; ağırlıklı net × 1,13 + 194,75).' });
  return blocks;
}

// ============================================================================ Aşama 54: birleştirilmiş karne ekleri
const signed = (v: number | null, f: (n: number) => string) => (v === null || Math.abs(v) < 0.005 ? '-' : `${v > 0 ? '+' : '-'}${f(Math.abs(v))}`);

/** Seçilen denemelerin ortalaması (ders ders; sınıf ve kurum ortalamasıyla) */
export function averageBlocks(exams: DenemeExam[], results: DenemeResult[], subs: ExamSubject[]): PdfBlock[] {
  const a = selectedAverages(exams, results, subs);
  if (!a || a.n < 2) return [];
  const hasCls = a.rows.some((r) => r.clsNet !== null);
  return [
    { kind: 'heading', text: `Seçilen ${a.n} denemenin ortalaması`, sub: 'Her ders için denemelerdeki ortalama doğru, yanlış, boş ve net; en iyi ve en düşük net' },
    {
      kind: 'tiles',
      items: [
        { label: 'Ortalama puan', value: fmtScore(a.score), sub: a.clsScore !== null ? `Sınıf ort. ${fmtScore(a.clsScore)}` : undefined, tone: 'info' },
        { label: 'Ortalama toplam net', value: fmtNet(a.totalNet) },
        { label: 'Kurum ort. puan', value: fmtScore(a.kurumScore), sub: `Fark ${signed(a.score !== null && a.kurumScore !== null ? a.score - a.kurumScore : null, fmtScore)}` },
        { label: 'En iyi deneme', value: fmtScore(a.best?.score), sub: a.best ? a.best.exam.name : undefined, tone: 'success' },
        { label: 'İlk / son puan', value: `${fmtScore(a.first)} / ${fmtScore(a.last)}`, sub: `Değişim ${signed(a.first !== null && a.last !== null ? a.last - a.first : null, fmtScore)}` },
      ],
    },
    {
      kind: 'table',
      head: ['Ders', 'Ort. D', 'Ort. Y', 'Ort. B', 'Ort. net', 'Başarı', ...(hasCls ? ['Sınıf ort.'] : []), 'Kurum ort.', 'Kuruma göre', 'En iyi', 'En düşük'],
      rows: a.rows.map((r) => [
        r.subject.name,
        fmtNet(r.d),
        fmtNet(r.y),
        fmtNet(r.b),
        fmtNet(r.net),
        `%${r.rate}`,
        ...(hasCls ? [fmtNet(r.clsNet)] : []),
        fmtNet(r.kurumNet),
        signed(r.kurumNet !== null ? r.net - r.kurumNet : null, fmtNet),
        fmtNet(r.best),
        fmtNet(r.worst),
      ]),
      cellTones: a.rows.map((r) => {
        const row: Array<PdfTone | null> = [null, null, null, null, null, levelTone(r.rate)];
        return row;
      }),
      align: ['left', 'center', 'center', 'center', 'center', 'center', ...(hasCls ? ['center' as const] : []), 'center', 'center', 'center', 'center'],
      fontSize: 7.6,
    },
  ];
}

const HEAT_MAX_EXAMS = 8;

/** Konu ısı tablosu: satır kazanım, sütun deneme, hücre başarı rengi */
export function heatBlocks(examsAll: DenemeExam[], results: DenemeResult[], subs: ExamSubject[]): PdfBlock[] {
  const done = examsAll.filter((e) => results.some((r) => r.examId === e.id));
  if (!done.length) return [];
  const exams = done.slice(-HEAT_MAX_EXAMS);
  const heat = topicHeat(kazanimTracking(exams, results, subs), exams);
  if (!heat.length) return [];
  const blocks: PdfBlock[] = [
    { kind: 'pagebreak' },
    {
      kind: 'heading',
      text: 'Konu ısı tablosu',
      sub: 'Satırlar kazanımlar, sütunlar denemeler; hücre o denemedeki başarıdır. Yeşil %70+ · Mavi %50-69 · Turuncu %30-49 · Kırmızı %30 altı · "-" o denemede sorulmadı.',
    },
    { kind: 'text', tone: 'muted', text: `Sütunlar: ${exams.map((e, i) => `${i + 1}) ${e.name}`).join('  ')}${done.length > exams.length ? ` (son ${exams.length} deneme gösterilir)` : ''}` },
  ];
  for (const h of heat) {
    blocks.push({ kind: 'heading', text: h.subject.name, minFollow: 24 });
    const rows: Array<Array<string | number>> = [];
    const tones: Array<Array<PdfTone | null>> = [];
    for (const r of h.rows) {
      rows.push([r.row.short, ...r.cells.map((c) => (c === null ? '-' : `%${c}`)), `%${r.row.rate}`]);
      tones.push([null, ...r.cells.map((c) => (c === null ? null : levelTone(c))), levelTone(r.row.rate)]);
    }
    rows.push(['Ders geneli', ...h.examRates.map((c) => (c === null ? '-' : `%${c}`)), '']);
    tones.push([null, ...h.examRates.map((c) => (c === null ? null : levelTone(c))), null]);
    blocks.push({
      kind: 'table',
      head: ['Kazanım', ...exams.map((_, i) => String(i + 1)), 'Genel'],
      rows,
      cellTones: tones,
      align: ['left', ...exams.map(() => 'center' as const), 'center'],
      widths: ['auto', ...exams.map(() => 11), 13],
      fontSize: 7,
    });
  }
  return blocks;
}

// ============================================================================ Aşama 54: Kazanım Takip Karnesi
const statusTone = (k: keyof typeof KAZ_STATUS_INFO): PdfTone => KAZ_STATUS_INFO[k].tone;
const trendText = (t: 'up' | 'down' | 'flat' | null) => (t === 'up' ? 'Yükseliyor' : t === 'down' ? 'Düşüyor' : t === 'flat' ? 'Sabit' : '-');

export interface KazanimKarneInput {
  studentName: string;
  className: string;
  exams: DenemeExam[];
  results: DenemeResult[];
  scopeLabel: string;
  bank?: BankRow[] | null;
}

export function kazanimKarneBlocks(inp: KazanimKarneInput): PdfBlock[] {
  const exams = inp.exams.filter((e) => inp.results.some((r) => r.examId === e.id));
  const subs = usedSubjects(exams);
  const tracking: KazSubject[] = kazanimTracking(exams, inp.results, subs, inp.bank);
  const tot = trackingTotals(tracking);
  const blocks: PdfBlock[] = [
    { kind: 'title', text: 'Kazanım Takip Karnesi', sub: `${inp.studentName}${inp.className ? ` · ${inp.className}` : ''}` },
    {
      kind: 'kv',
      rows: [
        ['Kapsam', `${inp.scopeLabel} (${exams.length} deneme)`],
        ['Tarih aralığı', dateRange(exams)],
        ['Sorulan kazanım', String(tot.asked)],
        ['Kazanılan', `${tot.counts.kazanildi} (%${tot.pctAsked})`],
      ],
    },
    {
      kind: 'tiles',
      items: KAZ_STATUS_ORDER.filter((k) => k !== 'sorulmadi' || tot.counts.sorulmadi > 0).map((k) => ({
        label: KAZ_STATUS_INFO[k].label,
        value: String(tot.counts[k]),
        sub: k === 'sorulmadi' ? 'kazanım bankasına göre' : `sorulanların ${withEk(tot.asked ? Math.round((tot.counts[k] / tot.asked) * 100) : 0, true)}`,
        tone: statusTone(k),
      })),
    },
    {
      kind: 'callout',
      title: 'Durum nasıl belirlenir?',
      tone: 'info',
      lines: [
        ...KAZ_STATUS_ORDER.map((k) => ({ label: `${KAZ_STATUS_INFO[k].label}:`, text: KAZ_STATUS_INFO[k].rule, tone: statusTone(k) })),
        'Başarı = doğru / soru. "Son" kazanımın en son sorulduğu denemedeki başarıdır. 3\'ten az soru sorulan kazanımlarda sonuç kesin değildir (*).',
      ],
    },
    {
      kind: 'stack',
      title: 'Ders ders ilerleme',
      items: tracking.map((s) => ({
        label: s.subject.name,
        sub: s.pctAll !== null ? `${s.all} kazanımın ${withEk(s.counts.sorulmadi)} henüz sorulmadı` : `${s.asked} kazanım soruldu`,
        parts: KAZ_STATUS_ORDER.map((k) => ({ value: s.counts[k], tone: statusTone(k) })),
        right: `%${s.pctAsked} kazanıldı`,
      })),
      legend: KAZ_STATUS_ORDER.map((k) => ({ label: KAZ_STATUS_INFO[k].label, tone: statusTone(k) })),
    },
  ];
  for (const s of tracking) {
    blocks.push({
      kind: 'heading',
      text: `${s.subject.name}: kazanımların ${withEk(s.pctAsked, true)} kazanıldı`,
      sub: `${s.counts.kazanildi} kazanıldı · ${s.counts.gelisiyor} gelişiyor · ${s.counts.eksik} eksik${s.counts.sorulmadi ? ` · ${s.counts.sorulmadi} henüz sorulmadı` : ''}`,
      minFollow: 24,
    });
    blocks.push({
      kind: 'table',
      head: ['#', 'Kazanım', 'Soru', 'D/Y/B', 'Genel', 'Son', 'Gidiş', 'Durum', 'Çalıştım'],
      rows: s.rows.map((r, i) => [
        i + 1,
        r.label + (r.fewData ? ' (*)' : ''),
        r.questions || '-',
        r.questions ? `${r.d}/${r.y}/${r.b}` : '-',
        r.questions ? `%${r.rate}` : '-',
        r.lastRate !== null ? `%${r.lastRate}` : '-',
        trendText(r.trend),
        KAZ_STATUS_INFO[r.status].label,
        '',
      ]),
      cellTones: s.rows.map((r) => [
        null,
        null,
        null,
        null,
        r.questions ? levelTone(r.rate) : null,
        r.lastRate !== null ? levelTone(r.lastRate) : null,
        r.trend === 'up' ? ('success' as PdfTone) : r.trend === 'down' ? ('danger' as PdfTone) : null,
        statusTone(r.status),
        null,
      ]),
      align: ['center', 'left', 'center', 'center', 'center', 'center', 'center', 'center', 'center'],
      widths: [7, 'auto', 10, 14, 13, 12, 17, 20, 15],
      fontSize: 7,
    });
  }
  blocks.push({ kind: 'text', tone: 'muted', text: '"Çalıştım" sütununu öğrenci kontrol listesi olarak kullanabilir: eksik ve gelişen kazanımlar çalışıldıkça işaretlenir; bir sonraki denemede durum yeniden hesaplanır.' });
  return blocks;
}

// ============================================================================ Aşama 54: Çalışma Planı Karnesi
export interface StudyPlanKarneInput {
  studentName: string;
  className: string;
  exams: DenemeExam[];
  results: DenemeResult[];
  scopeLabel: string;
  /** Öğretmenin seçip düzenlediği öneriler (verilmezse otomatik ilk 5) */
  suggestions?: StudySuggestion[];
}

export function studyPlanKarneBlocks(inp: StudyPlanKarneInput): PdfBlock[] {
  const exams = inp.exams.filter((e) => inp.results.some((r) => r.examId === e.id));
  const subs = usedSubjects(exams);
  const list = inp.suggestions || studySuggestions(kazanimTracking(exams, inp.results, subs));
  const rByExam = new Map(inp.results.map((r) => [r.examId, r]));
  const lastExam = exams[exams.length - 1];
  const last = lastExam ? rByExam.get(lastExam.id) : undefined;
  const totalQ = list.reduce((a, s) => a + s.questions, 0);
  const totalLoss = list.reduce((a, s) => a + s.row.perExamLoss, 0);
  const blocks: PdfBlock[] = [
    { kind: 'title', text: 'Çalışma Planı Karnesi', sub: `${inp.studentName}${inp.className ? ` · ${inp.className}` : ''} · Gelecek hafta ne çalışmalı?` },
    {
      kind: 'kv',
      rows: [
        ['Kapsam', `${inp.scopeLabel} (${exams.length} deneme)`],
        ['Tarih aralığı', dateRange(exams)],
        ['Son deneme', lastExam ? lastExam.name : '-'],
        ['Son puan', fmtScore(last?.score)],
      ],
    },
    {
      kind: 'tiles',
      items: [
        { label: 'Öncelikli kazanım', value: String(list.length), sub: 'en çok puan kaybettirenler', tone: 'warning' },
        { label: 'Haftalık soru hedefi', value: String(totalQ), sub: 'önerilen toplam soru', tone: 'info' },
        { label: 'Kaybettirdiği puan', value: fmtScore(totalLoss), sub: 'deneme başına, yaklaşık', tone: 'danger' },
      ],
    },
    {
      kind: 'callout',
      title: 'Kazanımlar nasıl seçildi?',
      tone: 'info',
      lines: [
        'Seçilen denemelerde her kazanımın deneme başına kaybettirdiği yaklaşık LGS puanı hesaplandı (yanlış: 1 net + 1/3 net ceza, boş: 1 net; Türkçe, Matematik ve Fen 4 katsayılı).',
        'Kazanılmış kazanımlar listeye girmez. Eksik olanlar ve son denemelerde düşüş gösterenler öne alınır; yükselenler biraz geriye düşer.',
        'Soru sayısı başarıya göre önerilir: %30 altı 40 soru, %30-49 30 soru, %50-69 20 soru (İnkılap, Din ve Yabancı Dil\'de dörtte üçü).',
      ],
    },
    { kind: 'heading', text: 'Gelecek hafta çalışılacak kazanımlar' },
  ];
  if (!list.length) {
    blocks.push({ kind: 'text', tone: 'success', text: 'Seçilen denemelerde puan kaybettiren eksik kazanım bulunmadı. Düzenli tekrar ve deneme çözümüyle devam.' });
  } else {
    blocks.push({
      kind: 'table',
      head: ['#', 'Ders', 'Kazanım', 'Son başarı', 'Puan kaybı / deneme', 'Soru', 'Ne yapmalı?'],
      rows: list.map((s, i) => [i + 1, s.subject.short, s.row.label, `%${s.row.lastRate ?? s.row.rate}`, fmtScore(s.row.perExamLoss), s.questions, s.advice]),
      cellTones: list.map((s) => [null, null, null, levelTone(s.row.lastRate ?? s.row.rate), null, null, null]),
      align: ['center', 'left', 'left', 'center', 'center', 'center', 'left'],
      widths: [7, 13, 'auto', 16, 20, 12, 46],
      fontSize: 7.4,
    });
    blocks.push({ kind: 'heading', text: 'Neden bu kazanımlar?', minFollow: 12 });
    blocks.push({
      kind: 'table',
      head: ['#', 'Kazanım', 'Denemelerdeki sonuç'],
      rows: list.map((s, i) => [i + 1, s.row.short, s.reason]),
      align: ['center', 'left', 'left'],
      widths: [7, 62, 'auto'],
      fontSize: 7.2,
    });
    blocks.push({
      kind: 'table',
      head: ['Kazanım', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz', 'Çözülen'],
      rows: list.map((s) => [s.row.short, '', '', '', '', '', '', '', `/ ${s.questions}`]),
      align: ['left', 'center', 'center', 'center', 'center', 'center', 'center', 'center', 'center'],
      widths: ['auto', 11, 11, 11, 11, 11, 11, 11, 17],
      fontSize: 7.2,
    });
    blocks.push({ kind: 'text', tone: 'muted', text: 'Haftalık takip: her gün çözdüğün soru sayısını kutulara yaz; hafta sonunda toplamı "Çözülen" sütununa geçir.' });
  }
  const fu = suggestionFollowUp(exams, inp.results, subs);
  if (fu) {
    const c = (k: keyof typeof FOLLOW_INFO) => fu.rows.filter((r) => r.verdict === k).length;
    blocks.push({ kind: 'heading', text: `Önceki önerilerin sonucu: ${fu.exam.name}`, sub: 'Bu denemeden önceki denemelere göre önerilecek kazanımlar, bu denemede nasıl sonuçlandı?' });
    blocks.push({
      kind: 'table',
      head: ['Ders', 'Kazanım', 'Önce', 'Bu deneme', 'Değişim', 'Sonuç'],
      rows: fu.rows.map((r) => [r.subject.short, r.short, `%${r.before}`, r.after === null ? '-' : `%${r.after}`, r.change === null ? '-' : `${r.change > 0 ? '+' : ''}${r.change}`, FOLLOW_INFO[r.verdict].label]),
      cellTones: fu.rows.map((r) => [null, null, levelTone(r.before), r.after === null ? null : levelTone(r.after), null, FOLLOW_INFO[r.verdict].tone]),
      align: ['left', 'left', 'center', 'center', 'center', 'center'],
      widths: [13, 'auto', 14, 18, 16, 20],
      fontSize: 7.4,
    });
    blocks.push({
      kind: 'text',
      tone: 'muted',
      text: `${fu.rows.length} önerinin ${withEk(c('kazanildi'))} kazanıldı, ${withEk(c('gelisti'))} gelişti, ${withEk(c('ayni'))} değişmedi, ${withEk(c('geriledi'))} geriledi${c('sorulmadi') ? `, ${withEk(c('sorulmadi'))} bu denemede sorulmadı` : ''}.`,
    });
  }
  return blocks;
}

// ============================================================================ Aşama 54: Soru (madde) analizi PDF
export function itemAnalysisBlocks(opts: {
  exam: DenemeExam;
  data: ItemSubject[];
  groupName: string; // "Tüm kurum" ya da sınıf adı
  isGroup: boolean;
  count: number;
  kurumCount: number;
  watch: Array<{ subject: ExamSubject; item: ItemSubject['items'][number] }>;
}): PdfBlock[] {
  const { exam, data, isGroup } = opts;
  const info = [exam.publisher, dateTr(exam.examDate), `${exam.grade}. sınıf ${exam.examType}`].filter(Boolean).join(' · ');
  const blocks: PdfBlock[] = [
    { kind: 'title', text: `${exam.name} — Soru (madde) analizi`, sub: `${info} · ${opts.groupName}` },
    {
      kind: 'kv',
      rows: [
        ['İncelenen grup', `${opts.groupName} (${opts.count} öğrenci)`],
        ['Kurum', `${opts.kurumCount} öğrenci`],
      ],
    },
    {
      kind: 'callout',
      title: 'Nasıl okunur?',
      tone: 'info',
      lines: [
        { label: 'Doğru %:', text: 'Soruyu doğru yapanların oranı (güçlük). %30 altı çok zor, %90 üstü çok kolay.' },
        { label: 'Şıklar:', text: 'Her şıkkı işaretleyenlerin oranı. Yeşil doğru cevap; kırmızı en çok seçilen yanlış şık (çeldirici).' },
        { label: 'Ayırt edicilik:', text: 'Derste en başarılı %27 ile en başarısız %27 arasındaki doğru oranı farkı. 0,40+ çok iyi, 0,30-0,39 iyi, 0,20-0,29 orta, 0,20 altı zayıf; eksi değer cevap anahtarı hatasına işaret edebilir.' },
        ...(isGroup ? [{ label: 'Kurum farkı:', text: 'Sınıfın doğru oranı eksi kurumun doğru oranı. -25 ve altı: sınıf bu soruda belirgin şekilde geride.' }] : []),
      ],
    },
  ];
  if (opts.watch.length) {
    blocks.push({ kind: 'heading', text: 'Dikkat edilecek sorular' });
    blocks.push({
      kind: 'table',
      head: ['Ders', 'Soru', 'Doğru %', ...(isGroup ? ['Kurum %'] : []), 'Uyarı', 'Konu / kazanım'],
      rows: opts.watch.map((w) => [w.subject.short, w.item.no, `%${w.item.rate}`, ...(isGroup ? [`%${w.item.kurumRate}`] : []), w.item.flags.map((f) => f.text).join(' · '), w.item.konu || '-']),
      cellTones: opts.watch.map((w) => [null, null, levelTone(w.item.rate), ...(isGroup ? [null] : []), w.item.flags[0]?.tone ?? null, null]),
      align: ['left', 'center', 'center', ...(isGroup ? ['center' as const] : []), 'left', 'left'],
      widths: [14, 12, 16, ...(isGroup ? [16] : []), 80, 'auto'],
      fontSize: 7.2,
    });
  }
  for (const s of data) {
    const head = ['No', 'Cevap', 'D %', 'Y %', 'B %', ...s.options, 'Çeldirici', ...(isGroup ? ['Kurum D %', 'Fark'] : []), 'Ayırt.', 'Konu / kazanım', 'Uyarı'];
    blocks.push({ kind: 'heading', text: s.subject.name, minFollow: 24 });
    blocks.push({
      kind: 'table',
      head,
      rows: s.items.map((it) => [
        it.no,
        it.cancelled ? 'İptal' : it.answer,
        `%${it.rate}`,
        `%${it.wrongRate}`,
        `%${it.blankRate}`,
        ...s.options.map((o) => (it.n ? `%${Math.round((it.options[o] / it.n) * 100)}` : '-')),
        it.topWrong ? `${it.topWrong.option} (%${it.topWrong.pct})` : '-',
        ...(isGroup ? [`%${it.kurumRate}`, it.diff > 0 ? `+${it.diff}` : String(it.diff)] : []),
        `${fmtDisc(it.disc)}${it.disc !== null ? ` ${discLabel(it.disc).label}` : ''}`,
        [it.konu, it.alt].filter(Boolean).join(' / ') || '-',
        it.flags.map((f) => f.text).join(' · '),
      ]),
      cellTones: s.items.map((it) => {
        const row: Array<PdfTone | null> = [null, null, it.cancelled ? null : levelTone(it.rate), null, null];
        for (const o of s.options) row.push(!it.cancelled && o === it.answer ? 'success' : it.topWrong && o === it.topWrong.option && it.topWrong.pct >= 15 ? 'danger' : null);
        row.push(null);
        if (isGroup) row.push(null, it.diff <= -25 ? 'danger' : it.diff >= 15 ? 'success' : null);
        row.push(it.disc === null ? null : discLabel(it.disc).tone === 'muted' ? null : discLabel(it.disc).tone);
        row.push(null, it.flags[0]?.tone === 'muted' ? null : it.flags[0]?.tone ?? null);
        return row;
      }),
      align: head.map((_, i) => (i >= head.length - 2 ? 'left' : 'center') as 'left' | 'center'),
      widths: [
        9,
        11,
        11,
        11,
        11,
        ...s.options.map(() => 10),
        17,
        ...(isGroup ? [14, 11] : []),
        18,
        'auto',
        48,
      ],
      fontSize: 6.8,
    });
  }
  return blocks;
}

// ----------------------------------------------------------------------------- Sınıf karnesi
export interface ClassKarneInput {
  className: string;
  classId: string;
  exams: DenemeExam[];
  results: DenemeResult[]; // sınıfın sonuçları
  scopeLabel: string;
}

export function classKarneBlocks(inp: ClassKarneInput): PdfBlock[] {
  const exams = inp.exams.filter((e) => inp.results.some((r) => r.examId === e.id));
  const subs = usedSubjects(exams);
  const blocks: PdfBlock[] = [
    { kind: 'title', text: 'Sınıf Deneme Karnesi', sub: inp.className },
    {
      kind: 'kv',
      rows: [
        ['Kapsam', `${inp.scopeLabel} (${exams.length} deneme)`],
        ['Öğrenci', String(new Set(inp.results.map((r) => r.studentId)).size)],
      ],
    },
    { kind: 'heading', text: 'Deneme ortalamaları' },
  ];
  const perExam = exams.map((e) => {
    const rs = inp.results.filter((r) => r.examId === e.id);
    const ca = classAverages(rs, subs)[0];
    return { e, rs, ca };
  });
  blocks.push({
    kind: 'table',
    head: ['Deneme', 'Tarih', 'Öğr.', ...subs.map((s) => `${s.short} ort.`), 'Top. net', 'Ort. puan', 'Kurum ort.'],
    rows: perExam.map(({ e, rs, ca }) => [
      e.name,
      dateTr(e.examDate),
      rs.length,
      ...subs.map((s) => fmtNet(ca?.avgNet[s.key])),
      fmtNet(ca?.avgTotalNet),
      fmtScore(ca?.avgScore),
      fmtScore(e.summary.avgScore),
    ]),
    align: ['left', 'center', 'center', ...subs.map(() => 'center' as const), 'center', 'center', 'center'],
    fontSize: 7.2,
  });
  blocks.push({
    kind: 'line',
    title: 'Ortalama puan gelişimi',
    labels: exams.map(examShort),
    series: [
      { name: inp.className, values: perExam.map((x) => x.ca?.avgScore ?? null) },
      { name: 'Kurum ortalaması', values: exams.map((e) => (typeof e.summary.avgScore === 'number' ? e.summary.avgScore : null)) },
    ],
  });
  blocks.push({
    kind: 'line',
    title: 'Ders net ortalamalarının gelişimi',
    labels: exams.map(examShort),
    series: subs.map((s) => ({ name: s.short, values: perExam.map((x) => x.ca?.avgNet[s.key] ?? null) })),
  });

  // Öğrenci sıralaması (seçilen denemelerin ortalaması)
  const byStudent = new Map<string, DenemeResult[]>();
  for (const r of inp.results) {
    if (!byStudent.has(r.studentId)) byStudent.set(r.studentId, []);
    byStudent.get(r.studentId)!.push(r);
  }
  const lastExamId = exams.length ? exams[exams.length - 1].id : '';
  const ranking = Array.from(byStudent.values())
    .map((rs) => {
      const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
      return {
        name: rs[0].studentName,
        n: rs.length,
        avgScore: round2(avg(rs.map((r) => r.score ?? 0))),
        avgNet: round2(avg(rs.map((r) => r.totalNet ?? 0))),
        last: rs.find((r) => r.examId === lastExamId)?.score ?? null,
      };
    })
    .sort((a, b) => b.avgScore - a.avgScore);
  blocks.push({ kind: 'heading', text: 'Öğrenci sıralaması (seçilen denemelerin ortalaması)' });
  blocks.push({
    kind: 'table',
    head: ['Sıra', 'Öğrenci', 'Deneme', 'Ort. toplam net', 'Ort. puan', 'Son deneme puanı'],
    rows: ranking.map((r, i) => [i + 1, r.name, r.n, fmtNet(r.avgNet), fmtScore(r.avgScore), fmtScore(r.last)]),
    align: ['center', 'left', 'center', 'center', 'center', 'center'],
    widths: [12, 'auto', 18, 28, 24, 30],
  });
  const analysis = topicAnalysis(exams, inp.results, subs);
  blocks.push(...topicBlocks(analysis));
  blocks.push(...adviceBlocks(analysis));
  return blocks;
}

// ----------------------------------------------------------------------------- Sınıflar arası karşılaştırma
export function compareKarneBlocks(exams: DenemeExam[], results: DenemeResult[], scopeLabel: string): PdfBlock[] {
  const subs = usedSubjects(exams);
  const avgs = classAverages(results, subs);
  const blocks: PdfBlock[] = [
    { kind: 'title', text: 'Sınıflar Arası Karşılaştırma', sub: `${scopeLabel} (${exams.length} deneme)` },
    { kind: 'text', tone: 'muted', text: `Denemeler: ${exams.map((e) => `${e.name} (${dateTr(e.examDate)})`).join(', ')}` },
    {
      kind: 'table',
      head: ['Sınıf', 'Sonuç', ...subs.map((s) => `${s.short} ort.`), 'Top. net', 'Ort. puan'],
      rows: avgs.map((c) => [c.className, c.count, ...subs.map((s) => fmtNet(c.avgNet[s.key])), fmtNet(c.avgTotalNet), fmtScore(c.avgScore)]),
      align: ['left', 'center', ...subs.map(() => 'center' as const), 'center', 'center'],
      fontSize: 7.6,
    },
    { kind: 'bar', title: 'Ortalama puan', labels: avgs.map((c) => c.className), series: [{ name: 'Ortalama puan', values: avgs.map((c) => c.avgScore) }] },
    {
      kind: 'bar',
      title: 'Ders net ortalamaları',
      labels: subs.map((s) => s.short),
      series: avgs.slice(0, 7).map((c) => ({ name: c.className, values: subs.map((s) => c.avgNet[s.key]) })),
    },
  ];
  if (avgs.length > 7) blocks.push({ kind: 'text', tone: 'muted', text: 'Ders grafiğinde ilk 7 sınıf gösterilir; tüm sınıflar tablodadır.' });
  return blocks;
}

// ----------------------------------------------------------------------------- Kapsam seçimi
export type ScopeKey = 'all' | 'last3' | 'last5' | 'last10' | 'custom';
export const SCOPES: Array<{ value: ScopeKey; label: string }> = [
  { value: 'last3', label: 'Son 3' },
  { value: 'last5', label: 'Son 5' },
  { value: 'last10', label: 'Son 10' },
  { value: 'all', label: 'Tümü' },
  { value: 'custom', label: 'Seçerek' },
];
/** Tarih sırasındaki (eskiden yeniye) denemelerden kapsamdakiler */
export function pickScope<T>(sortedAsc: T[], scope: ScopeKey, isPicked: (x: T) => boolean): T[] {
  if (scope === 'all') return sortedAsc;
  if (scope === 'custom') return sortedAsc.filter(isPicked);
  const n = scope === 'last3' ? 3 : scope === 'last5' ? 5 : 10;
  return sortedAsc.slice(-n);
}
export const scopeLabel = (s: ScopeKey) => (s === 'all' ? 'Tüm denemeler' : s === 'custom' ? 'Seçilen denemeler' : `Son ${s === 'last3' ? 3 : s === 'last5' ? 5 : 10} deneme`);

// ============================================================================ Aşama 55: Sınıf Birleştirilmiş Karnesi (PDF, yatay)
const sgn = (v: number | null, f: (n: number) => string = fmtScore) => (v === null || !Number.isFinite(v) ? '-' : Math.abs(v) < 0.005 ? '0' : `${v > 0 ? '+' : '-'}${f(Math.abs(v))}`);
const signTone = (v: number | null): PdfTone | undefined => (v === null || Math.abs(v) < 0.005 ? undefined : v > 0 ? 'success' : 'danger');
const CC_MAX_EXAMS = 12;

export function classCombinedBlocks(c: ClassCombined, scopeLabel: string): PdfBlock[] {
  const s = c.summary;
  const subs = c.subjects;
  const blocks: PdfBlock[] = [
    { kind: 'title', text: 'Sınıf Birleştirilmiş Karnesi', sub: `${c.className} · ${scopeLabel} (${c.exams.length} deneme) · ${dateRange(c.exams)}` },
    {
      kind: 'tiles',
      items: [
        { label: 'Ortalama puan', value: fmtScore(s.avgScore), sub: `Kurum ortalaması ${fmtScore(s.kurumScore)}`, tone: 'info' },
        { label: 'Kuruma göre', value: sgn(s.diff), sub: 'deneme başına ortalama puan farkı', tone: signTone(s.diff) },
        { label: 'İlk → son deneme', value: sgn(s.change), sub: `${fmtScore(s.firstAvg)} → ${fmtScore(s.lastAvg)}`, tone: signTone(s.change) },
        { label: 'Kurumdaki sıra', value: s.lastRank ? `${s.lastRank.rank} / ${s.lastRank.of}` : '-', sub: 'son deneme, sınıflar arasında' },
        { label: 'Katılım', value: s.participation !== null ? `%${s.participation}` : '-', sub: `${s.studentCount} öğrenci, ${c.exams.length} deneme` },
      ],
    },
    {
      kind: 'line',
      title: 'Ortalama puan: sınıf ve kurum',
      labels: c.exams.map(examShort),
      series: [
        { name: c.className, values: c.perExam.map((p) => p.avgScore) },
        { name: 'Kurum ortalaması', values: c.perExam.map((p) => p.kurumScore) },
      ],
    },
    {
      kind: 'heading',
      text: 'Deneme deneme sınıf sonuçları',
      sub: "Ders netlerinde yeşil kurum ortalamasının üstünü, kırmızı altını gösterir (dersin soru sayısının %5'i kadar fark anlamlı sayılır).",
    },
    {
      kind: 'table',
      head: ['Deneme', 'Tarih', 'Katılım', ...subs.map((x) => `${x.short} net`), 'Top. net', 'Ort. puan', 'Kurum ort.', 'Fark', 'Kurumda sıra', 'En yüksek'],
      rows: c.perExam.map((p) => [
        p.exam.name,
        dateTr(p.exam.examDate),
        p.n,
        ...subs.map((x) => fmtNet(p.avgNet[x.key])),
        fmtNet(p.avgTotalNet),
        fmtScore(p.avgScore),
        fmtScore(p.kurumScore),
        sgn(p.diff),
        p.rank !== null ? `${p.rank} / ${p.rankOf}` : '-',
        fmtScore(p.maxScore),
      ]),
      cellTones: c.perExam.map((p) => [
        null,
        null,
        null,
        ...subs.map((x) => netVsKurumTone(p.avgNet[x.key], p.kurumNet[x.key], x.count)),
        null,
        null,
        null,
        signTone(p.diff) ?? null,
        p.rank === 1 ? ('success' as PdfTone) : null,
        null,
      ]),
      align: ['left', 'center', 'center', ...subs.map(() => 'center' as const), 'center', 'center', 'center', 'center', 'center', 'center'],
      fontSize: 7.2,
    },
  ];
  const moverTable = (list: ClassStudentRow[]): PdfBlock => ({
    kind: 'table',
    head: ['Öğrenci', 'İlk puan', 'Son puan', 'Değişim', 'Ortalama', 'Girdiği deneme'],
    rows: list.map((x) => [x.name, fmtScore(x.first), fmtScore(x.last), sgn(x.change), fmtScore(x.avg), `${x.attended} / ${c.exams.length}`]),
    cellTones: list.map((x) => [null, null, null, signTone(x.change) ?? null, null, null]),
    align: ['left', 'center', 'center', 'center', 'center', 'center'],
    widths: ['auto', 28, 28, 26, 28, 30],
    fontSize: 7.6,
  });
  if (c.risers.length || c.fallers.length) {
    blocks.push({ kind: 'heading', text: 'En çok yükselen öğrenciler', sub: 'Seçilen denemelerde girdiği ilk denemeden son denemesine puan değişimi' });
    blocks.push(c.risers.length ? moverTable(c.risers) : { kind: 'text', tone: 'muted', text: 'Puanı yükselen öğrenci yok.' });
    blocks.push({ kind: 'heading', text: 'En çok düşen öğrenciler', sub: 'Rehberlik ve veli görüşmesi için öncelikli liste' });
    blocks.push(c.fallers.length ? moverTable(c.fallers) : { kind: 'text', tone: 'muted', text: 'Puanı düşen öğrenci yok.' });
  }
  // Öğrenci × deneme puan tablosu
  const from = Math.max(0, c.exams.length - CC_MAX_EXAMS);
  const ex = c.exams.slice(from);
  const pe = c.perExam.slice(from);
  blocks.push({ kind: 'pagebreak' });
  blocks.push({
    kind: 'heading',
    text: 'Öğrenci × deneme puan tablosu',
    sub: 'Sıra: seçilen denemelerin ortalama puanına göre. Yeşil: o denemede sınıf ortalamasının en az 20 puan üstü · Kırmızı: en az 20 puan altı · "-": denemeye girmedi.',
  });
  blocks.push({ kind: 'text', tone: 'muted', text: `Sütunlar: ${ex.map((e, i) => `${i + 1}) ${e.name}`).join('  ')}${from ? ` (son ${ex.length} deneme gösterilir)` : ''}` });
  blocks.push({
    kind: 'table',
    head: ['Sıra', 'Öğrenci', ...ex.map((_, i) => String(i + 1)), 'Ortalama', 'Ort. net', 'İlk → son', 'Girdiği'],
    rows: [
      ...c.students.map((st) => [
        st.rank,
        st.name,
        ...st.scores.slice(from).map((v) => (v === null ? '-' : fmtScore(v))),
        fmtScore(st.avg),
        fmtNet(st.avgNet),
        sgn(st.change),
        `${st.attended}/${c.exams.length}`,
      ]),
      ['', 'Sınıf ortalaması', ...pe.map((p) => fmtScore(p.avgScore)), fmtScore(s.avgScore), '', sgn(s.change), ''],
      ['', 'Kurum ortalaması', ...pe.map((p) => fmtScore(p.kurumScore)), fmtScore(s.kurumScore), '', '', ''],
    ],
    cellTones: [
      ...c.students.map((st) => [
        null,
        null,
        ...st.scores.slice(from).map((v, i) => scoreVsClassTone(v, pe[i].avgScore)),
        null,
        null,
        signTone(st.change) ?? null,
        st.attended < c.exams.length ? ('warning' as PdfTone) : null,
      ]),
      [],
      [],
    ],
    rowTones: [...c.students.map(() => null), 'info', 'muted'],
    toneColumn: 1,
    align: ['center', 'left', ...ex.map(() => 'center' as const), 'center', 'center', 'center', 'center'],
    widths: [10, 'auto', ...ex.map(() => 14), 17, 15, 17, 14],
    fontSize: 7,
  });
  blocks.push({ kind: 'heading', text: 'Puan dağılımı', sub: 'Her denemede hangi puan aralığında kaç öğrenci var?' });
  blocks.push({
    kind: 'table',
    head: ['Puan aralığı', ...ex.map((_, i) => String(i + 1))],
    rows: SCORE_BANDS.map((b, bi) => [b.label, ...c.bands[bi].slice(from).map((n) => (n ? n : '-'))]),
    cellTones: SCORE_BANDS.map((_, bi) => [null, ...c.bands[bi].slice(from).map((n) => (n ? (bi <= 1 ? 'success' : bi >= 4 ? 'danger' : 'info') : null) as PdfTone | null)]),
    align: ['left', ...ex.map(() => 'center' as const)],
    widths: [32, ...ex.map(() => 16)],
    fontSize: 7.4,
  });
  blocks.push({ kind: 'text', tone: 'muted', text: 'Puanlar yaklaşık LGS puanıdır. Kurum sırası, o denemeye giren sınıfların ortalama puanına göredir.' });
  return blocks;
}

// ============================================================================ Aşama 55: Kazanım Isı Haritası (PDF, yatay)
const HEAT_PDF_COLS = 12;
const heatModeLabel = (m: HeatOptions['mode']) => (m === 'fark' ? 'Kuruma göre fark (puan)' : 'Başarı yüzdesi');
const heatSortLabel = (s: HeatOptions['sort']) => (s === 'zayif' ? 'En zayıf kazanım önce' : s === 'fark' ? 'Sınıflar arası fark büyükten küçüğe' : 'Müfredat (kazanım kodu) sırası');

export function kazanimHeatBlocks(h: KazHeat, o: HeatOptions, scopeLabel: string, exams: DenemeExam[]): PdfBlock[] {
  const ins = heatInsights(h, 6);
  const blocks: PdfBlock[] = [
    { kind: 'title', text: 'Kazanım Isı Haritası', sub: `${scopeLabel} (${exams.length} deneme) · ${dateRange(exams)}` },
    {
      kind: 'kv',
      rows: [
        ['Ders', o.subjectKey === 'all' ? 'Bütün dersler' : h.subjects[0]?.subject.name || '-'],
        ['Görünüm', heatModeLabel(o.mode)],
        ['Sınıflar', h.classes.map((c) => c.name).join(', ')],
        ['Sıralama', `${heatSortLabel(o.sort)}${o.onlyWeak ? ' · yalnızca en az bir sınıfta %50 altı' : ''}`],
      ],
    },
    {
      kind: 'callout',
      title: 'Nasıl okunur?',
      tone: 'info',
      lines: [
        o.mode === 'fark'
          ? { label: 'Hücre:', text: 'Sınıfın başarı yüzdesi eksi kurumun başarı yüzdesi. Yeşil +10 ve üstü, mavi +5..+9, turuncu -5..-9, kırmızı -10 ve altı.' }
          : { label: 'Hücre:', text: 'Sınıfın o kazanımdaki başarısı (doğru / soru). Yeşil %70+ başarılı · Mavi %50-69 tekrar · Turuncu %30-49 takviye · Kırmızı %30 altı kritik.' },
        { label: 'Fark:', text: 'Sınıflar arasında en yüksek ile en düşük başarı arasındaki fark. 20 puan ve üstü fark, aynı kazanımın sınıflarda farklı işlendiğine işaret edebilir.' },
        { label: '* ve -:', text: "* 5'ten az cevaba dayanır (sonuç kesin değil). - o sınıfa bu kazanımdan soru düşmedi." },
      ],
    },
  ];
  // Öne çıkanlar
  if (ins.weakest.length) {
    blocks.push({ kind: 'heading', text: 'Kurumun en zayıf kazanımları' });
    blocks.push({
      kind: 'table',
      head: ['Ders', 'Kazanım', 'Kurum başarısı', 'Soru', '%50 altı sınıf'],
      rows: ins.weakest.map((w) => [w.subject.short, w.row.label, `%${w.row.kurum.rate}`, w.row.questions, `${w.row.weakClasses} / ${h.classes.length}`]),
      cellTones: ins.weakest.map((w) => [null, null, levelTone(w.row.kurum.rate), null, null]),
      align: ['left', 'left', 'center', 'center', 'center'],
      widths: [16, 'auto', 26, 14, 26],
      fontSize: 7.4,
    });
  }
  if (ins.widest.length) {
    blocks.push({ kind: 'heading', text: 'Sınıflar arasında en büyük fark olan kazanımlar', sub: 'Zümrede yöntem paylaşımı için' });
    blocks.push({
      kind: 'table',
      head: ['Ders', 'Kazanım', 'Fark', 'En yüksek / en düşük sınıf'],
      rows: ins.widest.map((w) => [w.subject.short, w.row.label, `${w.rate} puan`, w.note]),
      align: ['left', 'left', 'center', 'left'],
      widths: [16, 'auto', 20, 60],
      fontSize: 7.4,
    });
  }
  const pc = ins.perClass.filter((p) => p.items.length);
  if (pc.length) {
    blocks.push({ kind: 'heading', text: 'Her sınıfın en zayıf kazanımları (%50 altı)', sub: 'Ek ders / etüt planlamasına girdi' });
    const rows: Array<Array<string | number>> = [];
    const tones: Array<Array<PdfTone | null>> = [];
    for (const p of pc)
      p.items.forEach((it, i) => {
        rows.push([i === 0 ? p.cls.name : '', it.subject.short, it.row.label, `%${it.rate}`, `%${it.row.kurum.rate}`, sgn(it.rate - it.row.kurum.rate, (n) => String(Math.round(n)))]);
        tones.push([null, null, null, levelTone(it.rate), null, (diffTone(it.rate - it.row.kurum.rate) as PdfTone | null) ?? null]);
      });
    blocks.push({
      kind: 'table',
      head: ['Sınıf', 'Ders', 'Kazanım', 'Sınıf', 'Kurum', 'Fark'],
      rows,
      cellTones: tones,
      align: ['left', 'left', 'left', 'center', 'center', 'center'],
      widths: [18, 14, 'auto', 16, 16, 14],
      fontSize: 7.2,
    });
  }
  // Ders ders ısı haritası (12'den çok sınıf varsa sınıflar parça parça)
  for (const s of h.subjects) {
    for (let from = 0; from < Math.max(1, h.classes.length); from += HEAT_PDF_COLS) {
      const cls = h.classes.slice(from, from + HEAT_PDF_COLS);
      const part = h.classes.length > HEAT_PDF_COLS ? ` (${from + 1}-${from + cls.length}. sınıflar)` : '';
      blocks.push({ kind: 'pagebreak' });
      blocks.push({
        kind: 'heading',
        text: `${s.subject.name}${part}`,
        sub: `${s.rows.length} kazanım · kurum başarısı %${s.kurumTotal.rate} · ${heatModeLabel(o.mode)}`,
        minFollow: 24,
      });
      const cellText = (c: HeatCell | undefined, k: HeatCell) => {
        if (!c || !c.total) return '-';
        const star = c.total < HEAT_MIN_TOTAL ? '*' : '';
        if (o.mode === 'fark') {
          const d = c.rate - k.rate;
          return `${d > 0 ? '+' : ''}${d}${star}`;
        }
        return `%${c.rate}${star}`;
      };
      const cellTone = (c: HeatCell | undefined, k: HeatCell): PdfTone | null => {
        if (!c || !c.total || c.total < HEAT_MIN_TOTAL) return null;
        return o.mode === 'fark' ? ((diffTone(c.rate - k.rate) as PdfTone | null) ?? null) : levelTone(c.rate);
      };
      blocks.push({
        kind: 'table',
        head: ['Kazanım', ...cls.map((c) => c.name), 'Kurum', 'Fark'],
        rows: [
          ...s.rows.map((r) => [r.short, ...cls.map((c) => cellText(r.cells[c.id], r.kurum)), `%${r.kurum.rate}`, r.spread === null ? '-' : r.spread]),
          ['Ders geneli', ...cls.map((c) => cellText(s.classTotals[c.id], s.kurumTotal)), `%${s.kurumTotal.rate}`, ''],
        ],
        cellTones: [
          ...s.rows.map((r) => [null, ...cls.map((c) => cellTone(r.cells[c.id], r.kurum)), levelTone(r.kurum.rate), (r.spread ?? 0) >= 20 ? ('warning' as PdfTone) : null]),
          [null, ...cls.map((c) => cellTone(s.classTotals[c.id], s.kurumTotal)), levelTone(s.kurumTotal.rate), null],
        ],
        align: ['left', ...cls.map(() => 'center' as const), 'center', 'center'],
        widths: ['auto', ...cls.map(() => 15), 15, 12],
        fontSize: 6.8,
      });
    }
  }
  return blocks;
}
