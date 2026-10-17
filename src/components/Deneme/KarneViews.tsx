import React, { useMemo, useState } from 'react';
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { ChevronDown, ChevronRight, Target, TrendingUp } from 'lucide-react';
import { Panel, cx } from '../ui/kit';
import type { DenemeExam, DenemeResult } from '../../services/denemeService';
import { LEVEL_INFO, classAverages, levelOf, targetGap, topicAnalysis, type SubjectTopics } from '../../lib/deneme/analiz';
import { fmtNet, fmtScore, round2 } from '../../lib/deneme/lgs';
import { dateTr, examShort, usedSubjects } from '../../lib/deneme/karneModel';

// ============================================================================
// Karne görünümleri (Aşama 47): öğrenci, sınıf ve sınıflar arası.
// Aynı hesaplar PDF'te de kullanılır (karneModel.ts).
// ============================================================================

export const CHART_COLORS = ['#4f46e5', '#109669', '#d97706', '#dc2626', '#0ea5e9', '#8b5cf6', '#64748b'];

const chipFor = (rate: number) => `ui-chip ui-chip-${LEVEL_INFO[levelOf(rate)].tone}`;

const tableCls = 'w-full text-left text-xs text-fg-2';
const theadCls = 'bg-surface-2/60 uppercase tracking-wider text-muted border-b border-line';
const TableBox: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={cx('bg-surface border border-line rounded-2xl overflow-hidden', className)}>
    <div className="overflow-x-auto">{children}</div>
  </div>
);

const Stat: React.FC<{ label: string; value: React.ReactNode; hint?: React.ReactNode }> = ({ label, value, hint }) => (
  <div className="rounded-xl border border-line bg-surface px-3 py-2">
    <p className="ui-eyebrow">{label}</p>
    <p className="text-lg font-bold text-fg tabular-nums">{value}</p>
    {hint && <p className="text-[11px] text-muted">{hint}</p>}
  </div>
);

const ChartBox: React.FC<{ title: string; children: React.ReactElement }> = ({ title, children }) => (
  <div className="rounded-2xl border border-line bg-surface p-3">
    <p className="text-sm font-semibold text-fg mb-2">{title}</p>
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  </div>
);

export const LevelLegend: React.FC = () => (
  <div className="flex flex-wrap gap-1.5 text-[11px]">
    {(['iyi', 'tekrar', 'etut', 'kritik'] as const).map((l) => (
      <span key={l} className={`ui-chip ui-chip-${LEVEL_INFO[l].tone}`} title={LEVEL_INFO[l].advice}>
        {LEVEL_INFO[l].label}: {l === 'iyi' ? '%70+' : l === 'tekrar' ? '%50-69' : l === 'etut' ? '%30-49' : '%30 altı'}
      </span>
    ))}
  </div>
);

// ----------------------------------------------------------------------------- Konu / kazanım analizi
export const TopicAnalysisView: React.FC<{ analysis: SubjectTopics[] }> = ({ analysis }) => {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  if (!analysis.length) return <p className="text-sm text-muted">Kazanım analizi için veri yok.</p>;
  return (
    <div className="space-y-3">
      <LevelLegend />
      {analysis.map((st) => (
        <div key={st.subject.key} className="rounded-2xl border border-line bg-surface">
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-line">
            <span className="text-sm font-semibold text-fg">{st.subject.name}</span>
            <span className={chipFor(st.rate)}>%{st.rate} başarı</span>
            <span className="text-[11px] text-muted">
              D {st.d} · Y {st.y} · B {st.b}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className={tableCls}>
              <thead className={theadCls}>
                <tr>
                  <th className="px-3 py-2 font-semibold">Konu / alt kazanım</th>
                  <th className="px-2 py-2 font-semibold text-center">Soru</th>
                  <th className="px-2 py-2 font-semibold text-center">D</th>
                  <th className="px-2 py-2 font-semibold text-center">Y</th>
                  <th className="px-2 py-2 font-semibold text-center">B</th>
                  <th className="px-2 py-2 font-semibold text-center">Başarı</th>
                  <th className="px-3 py-2 font-semibold">Öneri</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {st.topics.map((t) => {
                  const k = `${st.subject.key}|${t.key}`;
                  const isOpen = !!open[k];
                  return (
                    <React.Fragment key={k}>
                      <tr className="hover:bg-surface-2/30">
                        <td className="px-3 py-1.5 font-semibold text-fg">
                          {t.children.length > 0 ? (
                            <button type="button" className="inline-flex items-start gap-1 text-left cursor-pointer" onClick={() => setOpen((o) => ({ ...o, [k]: !isOpen }))} aria-expanded={isOpen}>
                              {isOpen ? <ChevronDown className="w-3.5 h-3.5 mt-0.5 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
                              {t.label}
                            </button>
                          ) : (
                            t.label
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-center tabular-nums">{t.questions}</td>
                        <td className="px-2 py-1.5 text-center tabular-nums text-success-fg">{t.d}</td>
                        <td className="px-2 py-1.5 text-center tabular-nums text-danger-fg">{t.y}</td>
                        <td className="px-2 py-1.5 text-center tabular-nums text-muted">{t.b}</td>
                        <td className="px-2 py-1.5 text-center">
                          <span className={chipFor(t.rate)}>%{t.rate}</span>
                        </td>
                        <td className="px-3 py-1.5 text-muted">{LEVEL_INFO[levelOf(t.rate)].advice}</td>
                      </tr>
                      {isOpen &&
                        t.children.map((c) => (
                          <tr key={`${k}|${c.key}`} className="bg-surface-2/30">
                            <td className="px-3 py-1.5 pl-8 text-fg-2">└ {c.label}</td>
                            <td className="px-2 py-1.5 text-center tabular-nums">{c.questions}</td>
                            <td className="px-2 py-1.5 text-center tabular-nums text-success-fg">{c.d}</td>
                            <td className="px-2 py-1.5 text-center tabular-nums text-danger-fg">{c.y}</td>
                            <td className="px-2 py-1.5 text-center tabular-nums text-muted">{c.b}</td>
                            <td className="px-2 py-1.5 text-center">
                              <span className={chipFor(c.rate)}>%{c.rate}</span>
                            </td>
                            <td className="px-3 py-1.5 text-muted">{LEVEL_INFO[levelOf(c.rate)].advice}</td>
                          </tr>
                        ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
};

// ----------------------------------------------------------------------------- Öğrenci karnesi
export const StudentKarneView: React.FC<{
  exams: DenemeExam[]; // tarih sırasıyla
  results: DenemeResult[];
  target: number | null;
  targetEditor?: React.ReactNode;
}> = ({ exams: allExams, results, target, targetEditor }) => {
  const rByExam = useMemo(() => new Map(results.map((r) => [r.examId, r])), [results]);
  const exams = allExams.filter((e) => rByExam.has(e.id));
  const subs = usedSubjects(exams);
  const analysis = useMemo(() => topicAnalysis(exams, results, subs), [exams, results, subs]);
  if (!exams.length) return <p className="text-sm text-muted">Seçilen kapsamda deneme sonucu yok.</p>;
  const last = rByExam.get(exams[exams.length - 1].id)!;
  const scores = exams.map((e) => rByExam.get(e.id)?.score ?? 0);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const gap = targetGap(last.score, target);
  const chartData = exams.map((e) => {
    const r = rByExam.get(e.id)!;
    const cls = r.classId ? (e.summary.classes || {})[r.classId] : undefined;
    const row: Record<string, any> = { name: examShort(e), Puan: r.score ?? null, 'Sınıf ort.': cls ? cls.avgScore : null };
    if (target !== null) row.Hedef = target;
    for (const s of subs) row[s.short] = r.stats.subjects?.[s.key]?.net ?? null;
    return row;
  });
  return (
    <div className="space-y-4">
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
        <Stat label="Son puan" value={fmtScore(last.score)} hint={dateTr(exams[exams.length - 1].examDate)} />
        <Stat label="Ortalama puan" value={fmtScore(avg)} hint={`${exams.length} deneme`} />
        <Stat label="Son sınıf sırası" value={last.stats.rank ? `${last.stats.rank.cls}/${last.stats.rank.clsCount}` : '-'} hint={last.stats.rank ? `Genel ${last.stats.rank.overall}/${last.stats.rank.overallCount}` : undefined} />
        <Stat label="Hedef puan" value={target !== null ? fmtScore(target) : '—'} hint={targetEditor ? undefined : 'Öğretmenin belirler'} />
      </div>
      {targetEditor}
      {gap && (
        <div className={cx('flex items-start gap-2 rounded-xl px-3 py-2 text-sm', gap.points > 0 ? 'bg-warning-soft text-warning-fg' : 'bg-success-soft text-success-fg')}>
          <Target className="w-4 h-4 mt-0.5 shrink-0" />
          {gap.points > 0 ? (
            <span>
              Hedefe ulaşmak için son denemeye göre yaklaşık <b>{fmtScore(gap.points)} puan</b> gerekiyor: Türkçe, Matematik ve Fen'de toplam yaklaşık <b>{fmtNet(gap.mainNets)} net</b> (ya da İnkılap, Din, Yabancı Dil'de {fmtNet(gap.otherNets)} net) artış.
            </span>
          ) : (
            <span>Tebrikler! Son denemede hedefin {fmtScore(-gap.points)} puan üstünde.</span>
          )}
        </div>
      )}

      <Panel title="Deneme sonuçları" description="Ders ders doğru / yanlış / net" icon={TrendingUp} tone="brand" padded={false}>
        <div className="overflow-x-auto">
          <table className={tableCls}>
            <thead className={theadCls}>
              <tr>
                <th className="px-3 py-2 font-semibold">Deneme</th>
                {subs.map((s) => (
                  <th key={s.key} className="px-2 py-2 font-semibold text-center" title={s.name}>
                    {s.short}
                    <span className="block normal-case tracking-normal font-normal text-[10px]">D / Y / Net</span>
                  </th>
                ))}
                <th className="px-2 py-2 font-semibold text-center">Toplam net</th>
                <th className="px-2 py-2 font-semibold text-center">Puan</th>
                <th className="px-3 py-2 font-semibold text-center">Sıra</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {exams.map((e, i) => {
                const r = rByExam.get(e.id)!;
                const prev = i > 0 ? rByExam.get(exams[i - 1].id) : undefined;
                const diff = prev && r.score !== null && prev.score !== null ? round2(r.score - prev.score) : null;
                return (
                  <tr key={e.id} className="hover:bg-surface-2/30">
                    <td className="px-3 py-1.5">
                      <p className="font-semibold text-fg">{e.name}</p>
                      <p className="text-[11px] text-muted">{dateTr(e.examDate)}</p>
                    </td>
                    {subs.map((s) => {
                      const x = r.stats.subjects?.[s.key];
                      return (
                        <td key={s.key} className="px-2 py-1.5 text-center tabular-nums whitespace-nowrap">
                          {x ? (
                            <>
                              <span className="text-success-fg">{x.d}</span> / <span className="text-danger-fg">{x.y}</span> / <b className="text-fg">{fmtNet(x.net)}</b>
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                      );
                    })}
                    <td className="px-2 py-1.5 text-center tabular-nums font-semibold text-fg">{fmtNet(r.totalNet)}</td>
                    <td className="px-2 py-1.5 text-center tabular-nums whitespace-nowrap">
                      <b className="text-fg">{fmtScore(r.score)}</b>
                      {diff !== null && diff !== 0 && <span className={cx('ml-1 text-[11px]', diff > 0 ? 'text-success-fg' : 'text-danger-fg')}>{diff > 0 ? `▲${fmtScore(diff)}` : `▼${fmtScore(-diff)}`}</span>}
                    </td>
                    <td className="px-3 py-1.5 text-center tabular-nums">{r.stats.rank ? `${r.stats.rank.cls}/${r.stats.rank.clsCount}` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-3 lg:grid-cols-2">
        <ChartBox title="Puan gelişimi">
          <LineChart data={chartData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line, #e2e8f0)" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
            <Tooltip formatter={(v: any) => fmtScore(Number(v))} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="Puan" stroke={CHART_COLORS[0]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
            <Line type="monotone" dataKey="Sınıf ort." stroke={CHART_COLORS[1]} strokeDasharray="4 3" dot={false} connectNulls />
            {target !== null && <Line type="monotone" dataKey="Hedef" stroke={CHART_COLORS[3]} strokeDasharray="2 4" dot={false} />}
          </LineChart>
        </ChartBox>
        <ChartBox title="Ders netlerinin gelişimi">
          <LineChart data={chartData} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line, #e2e8f0)" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip formatter={(v: any) => fmtNet(Number(v))} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {subs.map((s, i) => (
              <Line key={s.key} type="monotone" dataKey={s.short} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={1.8} dot={{ r: 2.5 }} connectNulls />
            ))}
          </LineChart>
        </ChartBox>
      </div>

      <Panel title="Konu ve kazanım analizi" description="Seçilen denemelerdeki bütün sorular üzerinden">
        <TopicAnalysisView analysis={analysis} />
      </Panel>
    </div>
  );
};

// ----------------------------------------------------------------------------- Sınıf karnesi
export const ClassKarneView: React.FC<{ exams: DenemeExam[]; results: DenemeResult[]; className: string }> = ({ exams: allExams, results, className }) => {
  const exams = allExams.filter((e) => results.some((r) => r.examId === e.id));
  const subs = usedSubjects(exams);
  const analysis = useMemo(() => topicAnalysis(exams, results, subs), [exams, results, subs]);
  if (!exams.length) return <p className="text-sm text-muted">Seçilen kapsamda bu sınıfın sonucu yok.</p>;
  const perExam = exams.map((e) => ({ e, ca: classAverages(results.filter((r) => r.examId === e.id), subs)[0] }));
  const data = perExam.map(({ e, ca }) => {
    const row: Record<string, any> = { name: examShort(e), [className]: ca?.avgScore ?? null, 'Kurum ort.': typeof e.summary.avgScore === 'number' ? e.summary.avgScore : null };
    for (const s of subs) row[s.short] = ca?.avgNet[s.key] ?? null;
    return row;
  });
  const byStudent = new Map<string, DenemeResult[]>();
  for (const r of results) {
    if (!byStudent.has(r.studentId)) byStudent.set(r.studentId, []);
    byStudent.get(r.studentId)!.push(r);
  }
  const ranking = Array.from(byStudent.values())
    .map((rs) => ({ name: rs[0].studentName, n: rs.length, avgScore: rs.reduce((a, r) => a + (r.score ?? 0), 0) / rs.length, avgNet: rs.reduce((a, r) => a + (r.totalNet ?? 0), 0) / rs.length }))
    .sort((a, b) => b.avgScore - a.avgScore);
  return (
    <div className="space-y-4">
      <Panel title="Deneme ortalamaları" icon={TrendingUp} tone="brand" padded={false}>
        <div className="overflow-x-auto">
          <table className={tableCls}>
            <thead className={theadCls}>
              <tr>
                <th className="px-3 py-2 font-semibold">Deneme</th>
                <th className="px-2 py-2 font-semibold text-center">Öğr.</th>
                {subs.map((s) => (
                  <th key={s.key} className="px-2 py-2 font-semibold text-center">{s.short} ort.</th>
                ))}
                <th className="px-2 py-2 font-semibold text-center">Top. net</th>
                <th className="px-2 py-2 font-semibold text-center">Ort. puan</th>
                <th className="px-3 py-2 font-semibold text-center">Kurum ort.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {perExam.map(({ e, ca }) => (
                <tr key={e.id}>
                  <td className="px-3 py-1.5">
                    <p className="font-semibold text-fg">{e.name}</p>
                    <p className="text-[11px] text-muted">{dateTr(e.examDate)}</p>
                  </td>
                  <td className="px-2 py-1.5 text-center tabular-nums">{ca?.count ?? 0}</td>
                  {subs.map((s) => (
                    <td key={s.key} className="px-2 py-1.5 text-center tabular-nums">{fmtNet(ca?.avgNet[s.key])}</td>
                  ))}
                  <td className="px-2 py-1.5 text-center tabular-nums font-semibold text-fg">{fmtNet(ca?.avgTotalNet)}</td>
                  <td className="px-2 py-1.5 text-center tabular-nums font-bold text-fg">{fmtScore(ca?.avgScore)}</td>
                  <td className="px-3 py-1.5 text-center tabular-nums text-muted">{fmtScore(e.summary.avgScore)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <div className="grid gap-3 lg:grid-cols-2">
        <ChartBox title="Ortalama puan gelişimi">
          <LineChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line, #e2e8f0)" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
            <Tooltip formatter={(v: any) => fmtScore(Number(v))} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey={className} stroke={CHART_COLORS[0]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
            <Line type="monotone" dataKey="Kurum ort." stroke={CHART_COLORS[1]} strokeDasharray="4 3" dot={false} connectNulls />
          </LineChart>
        </ChartBox>
        <ChartBox title="Ders net ortalamaları">
          <LineChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line, #e2e8f0)" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip formatter={(v: any) => fmtNet(Number(v))} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {subs.map((s, i) => (
              <Line key={s.key} type="monotone" dataKey={s.short} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={1.8} dot={{ r: 2.5 }} connectNulls />
            ))}
          </LineChart>
        </ChartBox>
      </div>
      <Panel title="Öğrenci sıralaması" description="Seçilen denemelerin ortalamasına göre" padded={false}>
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className={tableCls}>
            <thead className={cx(theadCls, 'sticky top-0')}>
              <tr>
                <th className="px-3 py-2 font-semibold w-12 text-center">Sıra</th>
                <th className="px-3 py-2 font-semibold">Öğrenci</th>
                <th className="px-2 py-2 font-semibold text-center">Deneme</th>
                <th className="px-2 py-2 font-semibold text-center">Ort. toplam net</th>
                <th className="px-3 py-2 font-semibold text-center">Ort. puan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {ranking.map((r, i) => (
                <tr key={`${r.name}-${i}`}>
                  <td className="px-3 py-1.5 text-center tabular-nums font-semibold">{i + 1}</td>
                  <td className="px-3 py-1.5 font-semibold text-fg">{r.name}</td>
                  <td className="px-2 py-1.5 text-center tabular-nums">{r.n}</td>
                  <td className="px-2 py-1.5 text-center tabular-nums">{fmtNet(r.avgNet)}</td>
                  <td className="px-3 py-1.5 text-center tabular-nums font-bold text-fg">{fmtScore(r.avgScore)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="Konu ve kazanım analizi" description="Sınıfın bütün öğrencilerinin cevapları üzerinden">
        <TopicAnalysisView analysis={analysis} />
      </Panel>
    </div>
  );
};

// ----------------------------------------------------------------------------- Sınıflar arası
export const CompareView: React.FC<{ exams: DenemeExam[]; results: DenemeResult[] }> = ({ exams, results }) => {
  const subs = usedSubjects(exams);
  const avgs = classAverages(results, subs);
  if (!avgs.length) return <p className="text-sm text-muted">Seçilen denemelerde sonuç yok.</p>;
  const scoreData = avgs.map((c) => ({ name: c.className, 'Ortalama puan': c.avgScore }));
  const netData = subs.map((s) => {
    const row: Record<string, any> = { name: s.short };
    for (const c of avgs) row[c.className] = c.avgNet[s.key];
    return row;
  });
  return (
    <div className="space-y-4">
      <TableBox>
        <table className={tableCls}>
          <thead className={theadCls}>
            <tr>
              <th className="px-3 py-2 font-semibold">Sınıf</th>
              <th className="px-2 py-2 font-semibold text-center">Sonuç</th>
              {subs.map((s) => (
                <th key={s.key} className="px-2 py-2 font-semibold text-center">{s.short} ort.</th>
              ))}
              <th className="px-2 py-2 font-semibold text-center">Top. net</th>
              <th className="px-3 py-2 font-semibold text-center">Ort. puan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {avgs.map((c) => (
              <tr key={c.classId}>
                <td className="px-3 py-1.5 font-semibold text-fg">{c.className}</td>
                <td className="px-2 py-1.5 text-center tabular-nums">{c.count}</td>
                {subs.map((s) => (
                  <td key={s.key} className="px-2 py-1.5 text-center tabular-nums">{fmtNet(c.avgNet[s.key])}</td>
                ))}
                <td className="px-2 py-1.5 text-center tabular-nums font-semibold text-fg">{fmtNet(c.avgTotalNet)}</td>
                <td className="px-3 py-1.5 text-center tabular-nums font-bold text-fg">{fmtScore(c.avgScore)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableBox>
      <div className="grid gap-3 lg:grid-cols-2">
        <ChartBox title="Ortalama puan">
          <BarChart data={scoreData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line, #e2e8f0)" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip formatter={(v: any) => fmtScore(Number(v))} />
            <Bar dataKey="Ortalama puan" fill={CHART_COLORS[0]} radius={[6, 6, 0, 0]} />
          </BarChart>
        </ChartBox>
        <ChartBox title="Ders net ortalamaları">
          <BarChart data={netData} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line, #e2e8f0)" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip formatter={(v: any) => fmtNet(Number(v))} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {avgs.slice(0, 7).map((c, i) => (
              <Bar key={c.classId} dataKey={c.className} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[4, 4, 0, 0]} />
            ))}
          </BarChart>
        </ChartBox>
      </div>
    </div>
  );
};
