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
  const analysis = topicAnalysis(exams, inp.results, subs);
  blocks.push(...topicBlocks(analysis));
  blocks.push(...adviceBlocks(analysis));
  blocks.push({ kind: 'text', tone: 'muted', text: 'Puanlar yaklaşık LGS puanıdır (3 yanlış 1 doğruyu götürür; ağırlıklı net × 1,13 + 194,75).' });
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
