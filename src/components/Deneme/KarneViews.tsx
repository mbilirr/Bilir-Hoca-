import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from 'recharts';
import { Award, CheckCircle2, ChevronDown, ChevronRight, CircleSlash, Target, TrendingUp, XCircle } from 'lucide-react';
import { Panel, cx } from '../ui/kit';
import type { DenemeExam, DenemeResult } from '../../services/denemeService';
import { LEVEL_INFO, classAverages, levelOf, targetGap, topicAnalysis, type SubjectTopics } from '../../lib/deneme/analiz';
import { fmtNet, fmtScore, round2 } from '../../lib/deneme/lgs';
import { dateTr, examShort, usedSubjects } from '../../lib/deneme/karneModel';
import { examKarneData, percentile, type ExamKarneData } from '../../lib/deneme/karneDetay';
import { LGS_PERCENTILE_NOTE, isLgsExam, lgsPercentiles } from '../../lib/deneme/lgsYuzdelik';
import { AveragesPanel, HeatTablePanel } from './KarneIleri';

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

// ----------------------------------------------------------------------------- Aşama 50: tek deneme karnesi
// Başlık bandı, puan ve sıralar, ders tablosu, grafikler, cevap çizelgesi ve konu analizi.
const LEVEL_BAR: Record<string, string> = { iyi: 'bg-success', tekrar: 'bg-info', etut: 'bg-warning', kritik: 'bg-danger' };
const LEVEL_TEXT: Record<string, string> = { iyi: 'text-success-fg', tekrar: 'text-info-fg', etut: 'text-warning-fg', kritik: 'text-danger-fg' };

const RateBar: React.FC<{ rate: number; marker?: number | null; label?: string }> = ({ rate, marker, label }) => {
  const lv = levelOf(rate);
  return (
    <div className="flex items-center gap-2 min-w-36">
      <div className="relative h-2.5 flex-1 rounded-full bg-surface-2 overflow-hidden" aria-label={label || `Başarı yüzde ${rate}`}>
        <div className={cx('h-full rounded-full transition-all', LEVEL_BAR[lv])} style={{ width: `${Math.max(2, Math.min(100, rate))}%` }} />
        {marker !== null && marker !== undefined && (
          <span className="absolute top-[-2px] h-3.5 w-0.5 rounded bg-fg/70" style={{ left: `calc(${Math.max(0, Math.min(100, marker))}% - 1px)` }} title={`Kurum %${marker}`} />
        )}
      </div>
      <span className={cx('text-xs font-bold tabular-nums w-10 text-right', LEVEL_TEXT[lv])}>%{rate}</span>
    </div>
  );
};

const Delta: React.FC<{ v: number | null; digits?: 'net' | 'score' }> = ({ v, digits = 'net' }) => {
  if (v === null || !Number.isFinite(v) || Math.abs(v) < 0.005) return <span className="text-muted">—</span>;
  const f = digits === 'score' ? fmtScore(Math.abs(v)) : fmtNet(Math.abs(v));
  return <span className={cx('font-semibold tabular-nums', v > 0 ? 'text-success-fg' : 'text-danger-fg')}>{v > 0 ? `▲ ${f}` : `▼ ${f}`}</span>;
};

const markCls = (m: 'D' | 'Y' | 'B') =>
  m === 'D' ? 'bg-success text-white border-success' : m === 'Y' ? 'bg-danger text-white border-danger' : 'bg-surface-2 text-muted border-line';

/** Aşama 51: deneme puanının 2026 / 2025 / 2024 LGS'deki Türkiye geneli yüzdelik karşılığı */
export const LgsPercentileStrip: React.FC<{ exam: DenemeExam; score: number | null }> = ({ exam, score }) => {
  const list = isLgsExam(exam) ? lgsPercentiles(score) : [];
  if (!list.length) return null;
  const toneOf = (v: number) => (v <= 1 ? 'border-success/30 bg-success-soft text-success-fg' : v <= 10 ? 'border-info/30 bg-info-soft text-info-fg' : 'border-line bg-surface text-fg');
  return (
    <div className="rounded-2xl border border-line bg-surface p-3 space-y-2" id="lgs-yuzdelik">
      <div className="flex flex-wrap items-center gap-2">
        <Award className="w-4 h-4 text-brand-fg" />
        <p className="text-sm font-semibold text-fg">Bu puan geçmiş LGS'lerde Türkiye geneli hangi dilimde?</p>
        <span className="ui-chip ui-chip-neutral tabular-nums">{fmtScore(score)} puan</span>
      </div>
      <div className="grid gap-2 grid-cols-1 sm:grid-cols-3">
        {list.map((p) => (
          <div key={p.year} className={cx('rounded-xl border px-3 py-2 transition-colors', toneOf(p.value))}>
            <p className="text-[11px] font-bold uppercase tracking-wider opacity-80">
              LGS {p.year}
              {p.estimate && <span className="ml-1 normal-case font-semibold tracking-normal">(tahmini)</span>}
            </p>
            <p className="text-2xl font-black tabular-nums leading-tight">{p.text}</p>
            <p className="text-[11px] opacity-80">{p.below ? 'veri aralığının altında' : 'yüzdelik dilim'}</p>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted">{LGS_PERCENTILE_NOTE}</p>
    </div>
  );
};

export const ExamKarneCard: React.FC<{ data: ExamKarneData; studentName: string; className?: string }> = ({ data, studentName, className }) => {
  const { exam, subjects, topics, rank } = data;
  const pct = percentile(rank);
  const kurumRateOf = (key: string) => {
    const s = subjects.find((x) => x.subject.key === key);
    const rs = (s?.answers || []).map((a) => a.kurumRate).filter((x): x is number => x !== null);
    return rs.length ? Math.round(rs.reduce((a, b) => a + b, 0) / rs.length) : null;
  };
  const netData = subjects.map((s) => ({ name: s.subject.short, Öğrenci: s.net, Sınıf: s.clsAvgNet, Kurum: s.kurumAvgNet }));
  const radarData = subjects.map((s) => ({ name: s.subject.short, Öğrenci: s.rate, Kurum: kurumRateOf(s.subject.key) ?? 0 }));
  const clsTotal = subjects.reduce((a, s) => a + (s.clsAvgNet ?? 0), 0);
  const kurumTotal = subjects.reduce((a, s) => a + (s.kurumAvgNet ?? 0), 0);
  const hasCls = subjects.some((s) => s.clsAvgNet !== null);
  const ranked = topics.filter((t) => t.konu !== 'Konusu belirtilmemiş').slice().sort((a, b) => b.rate - a.rate || b.questions.length - a.questions.length);
  const strong = ranked.filter((t) => t.rate >= 70).slice(0, 4);
  const weak = ranked.filter((t) => t.rate < 50).slice(-5).reverse();
  const bySubject = subjects.map((s) => ({ s, list: topics.filter((t) => t.subject.key === s.subject.key) })).filter((x) => x.list.length);

  return (
    <div className="space-y-4" id="exam-karne">
      {/* Başlık bandı */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-700 via-brand to-sky-600 text-white shadow-lg">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10" aria-hidden />
        <div className="absolute -bottom-20 right-24 h-44 w-44 rounded-full bg-white/5" aria-hidden />
        <div className="relative grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/70">Deneme karnesi</p>
            <h3 className="mt-1 text-xl sm:text-2xl font-extrabold leading-tight truncate">{studentName}</h3>
            <p className="text-sm text-white/85">{className || data.result.className || 'Sınıf bilgisi yok'}</p>
            <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
              <span className="rounded-full bg-white/15 px-2.5 py-1 font-semibold">{exam.name}</span>
              <span className="rounded-full bg-white/15 px-2.5 py-1">{dateTr(exam.examDate)}</span>
              {exam.publisher && <span className="rounded-full bg-white/15 px-2.5 py-1">{exam.publisher}</span>}
              {data.result.booklet && <span className="rounded-full bg-white/15 px-2.5 py-1">{data.result.booklet} kitapçığı</span>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-28 w-28 flex-col items-center justify-center rounded-full bg-white text-brand-fg shadow-xl ring-4 ring-white/30">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted">LGS puanı</span>
              <span className="text-2xl font-black tabular-nums leading-none mt-0.5">{fmtScore(data.score)}</span>
              <span className="text-[10px] text-muted mt-0.5">/ 500</span>
            </div>
            <div className="grid gap-1.5 text-xs">
              <div className="rounded-xl bg-white/15 px-3 py-1.5">
                <p className="text-white/70 text-[10px] uppercase tracking-wider">Sınıf sırası</p>
                <p className="font-bold tabular-nums">{rank ? `${rank.cls} / ${rank.clsCount}` : '—'}</p>
              </div>
              <div className="rounded-xl bg-white/15 px-3 py-1.5">
                <p className="text-white/70 text-[10px] uppercase tracking-wider">Kurum sırası</p>
                <p className="font-bold tabular-nums">{rank ? `${rank.overall} / ${rank.overallCount}` : '—'}</p>
              </div>
              {pct !== null && (
                <div className="rounded-xl bg-white/15 px-3 py-1.5">
                  <p className="text-white/70 text-[10px] uppercase tracking-wider">Kurum içi yüzdelik</p>
                  <p className="font-bold tabular-nums">%{pct}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Özet kutuları */}
      <div className="grid gap-2 grid-cols-2 lg:grid-cols-5">
        <div className="rounded-2xl border border-line bg-surface p-3">
          <p className="ui-eyebrow">Toplam net</p>
          <p className="text-2xl font-black text-fg tabular-nums">{fmtNet(data.totalNet)}</p>
          <p className="text-[11px] text-muted">
            {hasCls && <>Sınıf {fmtNet(round2(clsTotal))} · </>}Kurum {fmtNet(round2(kurumTotal))}
          </p>
        </div>
        <div className="rounded-2xl border border-success/30 bg-success-soft p-3">
          <p className="ui-eyebrow text-success-fg flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> Doğru
          </p>
          <p className="text-2xl font-black text-success-fg tabular-nums">{data.totals.d}</p>
          <p className="text-[11px] text-success-fg/80">{data.totals.count} sorudan</p>
        </div>
        <div className="rounded-2xl border border-danger/30 bg-danger-soft p-3">
          <p className="ui-eyebrow text-danger-fg flex items-center gap-1">
            <XCircle className="w-3.5 h-3.5" /> Yanlış
          </p>
          <p className="text-2xl font-black text-danger-fg tabular-nums">{data.totals.y}</p>
          <p className="text-[11px] text-danger-fg/80">3 yanlış 1 doğruyu götürür</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface-2 p-3">
          <p className="ui-eyebrow flex items-center gap-1">
            <CircleSlash className="w-3.5 h-3.5" /> Boş
          </p>
          <p className="text-2xl font-black text-fg-2 tabular-nums">{data.totals.b}</p>
          <p className="text-[11px] text-muted">işaretlenmeyen</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-3 col-span-2 lg:col-span-1">
          <p className="ui-eyebrow">Ortalamalara göre</p>
          <p className="text-[12px] text-fg-2 mt-1 flex justify-between gap-2">
            <span>Sınıf ort. {fmtScore(data.clsAvgScore)}</span> <Delta v={data.score !== null && data.clsAvgScore !== null ? data.score - data.clsAvgScore : null} digits="score" />
          </p>
          <p className="text-[12px] text-fg-2 flex justify-between gap-2">
            <span>Kurum ort. {fmtScore(data.kurumAvgScore)}</span> <Delta v={data.score !== null && data.kurumAvgScore !== null ? data.score - data.kurumAvgScore : null} digits="score" />
          </p>
          {data.kurumMaxScore !== null && <p className="text-[11px] text-muted">En yüksek {fmtScore(data.kurumMaxScore)}</p>}
        </div>
      </div>

      {/* Aşama 51: geçmiş LGS yıllarına göre Türkiye geneli yüzdelik dilim */}
      <LgsPercentileStrip exam={exam} score={data.score} />

      {/* Ders tablosu */}
      <Panel title="Ders sonuçları" description="Öğrencinin neti, sınıf ve kurum ortalamasıyla" icon={TrendingUp} tone="brand" padded={false}>
        <div className="overflow-x-auto">
          <table className={tableCls}>
            <thead className={theadCls}>
              <tr>
                <th className="px-3 py-2 font-semibold">Ders</th>
                <th className="px-2 py-2 font-semibold text-center">Soru</th>
                <th className="px-2 py-2 font-semibold text-center">D</th>
                <th className="px-2 py-2 font-semibold text-center">Y</th>
                <th className="px-2 py-2 font-semibold text-center">B</th>
                <th className="px-2 py-2 font-semibold text-center">Net</th>
                <th className="px-3 py-2 font-semibold">Başarı</th>
                {hasCls && <th className="px-2 py-2 font-semibold text-center">Sınıf ort.</th>}
                <th className="px-2 py-2 font-semibold text-center">Kurum ort.</th>
                <th className="px-3 py-2 font-semibold text-center">Kuruma göre</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {subjects.map((s) => (
                <tr key={s.subject.key} className="hover:bg-surface-2/30">
                  <td className="px-3 py-2 font-semibold text-fg">{s.subject.name}</td>
                  <td className="px-2 py-2 text-center tabular-nums">{s.count}</td>
                  <td className="px-2 py-2 text-center tabular-nums font-semibold text-success-fg">{s.d}</td>
                  <td className="px-2 py-2 text-center tabular-nums font-semibold text-danger-fg">{s.y}</td>
                  <td className="px-2 py-2 text-center tabular-nums text-muted">{s.b}</td>
                  <td className="px-2 py-2 text-center tabular-nums font-black text-fg">{fmtNet(s.net)}</td>
                  <td className="px-3 py-2">
                    <RateBar rate={s.rate} />
                  </td>
                  {hasCls && <td className="px-2 py-2 text-center tabular-nums">{fmtNet(s.clsAvgNet)}</td>}
                  <td className="px-2 py-2 text-center tabular-nums">{fmtNet(s.kurumAvgNet)}</td>
                  <td className="px-3 py-2 text-center">
                    <Delta v={s.kurumAvgNet !== null ? s.net - s.kurumAvgNet : null} />
                  </td>
                </tr>
              ))}
              <tr className="bg-brand-soft/40 font-bold">
                <td className="px-3 py-2 text-fg">Toplam</td>
                <td className="px-2 py-2 text-center tabular-nums">{data.totals.count}</td>
                <td className="px-2 py-2 text-center tabular-nums text-success-fg">{data.totals.d}</td>
                <td className="px-2 py-2 text-center tabular-nums text-danger-fg">{data.totals.y}</td>
                <td className="px-2 py-2 text-center tabular-nums text-muted">{data.totals.b}</td>
                <td className="px-2 py-2 text-center tabular-nums text-fg">{fmtNet(data.totalNet)}</td>
                <td className="px-3 py-2">
                  <RateBar rate={data.totals.count ? Math.round((data.totals.d / data.totals.count) * 100) : 0} />
                </td>
                {hasCls && <td className="px-2 py-2 text-center tabular-nums">{fmtNet(round2(clsTotal))}</td>}
                <td className="px-2 py-2 text-center tabular-nums">{fmtNet(round2(kurumTotal))}</td>
                <td className="px-3 py-2 text-center">
                  <Delta v={data.totalNet !== null ? data.totalNet - kurumTotal : null} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Grafikler */}
      <div className="grid gap-3 lg:grid-cols-2">
        <ChartBox title="Ders netleri: öğrenci, sınıf, kurum">
          <BarChart data={netData} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line, #e2e8f0)" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip formatter={(v: any) => fmtNet(Number(v))} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="Öğrenci" fill={CHART_COLORS[0]} radius={[6, 6, 0, 0]} />
            {hasCls && <Bar dataKey="Sınıf" fill={CHART_COLORS[4]} radius={[6, 6, 0, 0]} />}
            <Bar dataKey="Kurum" fill={CHART_COLORS[6]} radius={[6, 6, 0, 0]} />
          </BarChart>
        </ChartBox>
        <ChartBox title="Ders başarı yüzdesi (öğrenci ve kurum)">
          <RadarChart data={radarData} outerRadius="72%">
            <PolarGrid stroke="var(--color-line, #e2e8f0)" />
            <PolarAngleAxis dataKey="name" tick={{ fontSize: 10 }} />
            <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 9 }} />
            <Radar name="Öğrenci" dataKey="Öğrenci" stroke={CHART_COLORS[0]} fill={CHART_COLORS[0]} fillOpacity={0.35} />
            <Radar name="Kurum" dataKey="Kurum" stroke={CHART_COLORS[2]} fill={CHART_COLORS[2]} fillOpacity={0.12} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Tooltip formatter={(v: any) => `%${v}`} />
          </RadarChart>
        </ChartBox>
      </div>

      {/* Güçlü / geliştirilecek konular */}
      {(strong.length > 0 || weak.length > 0) && (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-success/30 bg-success-soft/60 p-3">
            <p className="text-sm font-bold text-success-fg flex items-center gap-1.5">
              <Award className="w-4 h-4" /> Güçlü olduğun konular
            </p>
            {strong.length ? (
              <ul className="mt-2 space-y-1 text-xs text-fg-2">
                {strong.map((t) => (
                  <li key={`${t.subject.key}-${t.konu}`} className="flex justify-between gap-2">
                    <span className="min-w-0 truncate">
                      <b>{t.subject.short}</b> · {t.konu}
                    </span>
                    <span className="font-bold text-success-fg">%{t.rate}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-muted">Bu denemede %70 ve üstü başarılı konu yok.</p>
            )}
          </div>
          <div className="rounded-2xl border border-danger/30 bg-danger-soft/60 p-3">
            <p className="text-sm font-bold text-danger-fg flex items-center gap-1.5">
              <Target className="w-4 h-4" /> Öncelikle çalışman gereken konular
            </p>
            {weak.length ? (
              <ul className="mt-2 space-y-1 text-xs text-fg-2">
                {weak.map((t) => (
                  <li key={`${t.subject.key}-${t.konu}`} className="flex justify-between gap-2">
                    <span className="min-w-0 truncate">
                      <b>{t.subject.short}</b> · {t.konu}
                    </span>
                    <span className={cx('font-bold', LEVEL_TEXT[levelOf(t.rate)])}>%{t.rate}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-muted">Başarısı %50'nin altında konu yok. Tebrikler!</p>
            )}
          </div>
        </div>
      )}

      {/* Cevap çizelgesi */}
      <Panel title="Cevap çizelgesi" description="Kutudaki harf öğrencinin cevabı; altındaki küçük harf doğru cevap">
        <div className="flex flex-wrap gap-3 text-[11px] mb-3">
          <span className="inline-flex items-center gap-1">
            <span className="h-3 w-3 rounded bg-success" /> Doğru
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-3 w-3 rounded bg-danger" /> Yanlış
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-3 w-3 rounded border border-line bg-surface-2" /> Boş
          </span>
        </div>
        <div className="space-y-3">
          {subjects.map((s) => (
            <div key={s.subject.key}>
              <p className="text-xs font-bold text-fg mb-1.5">
                {s.subject.name}{' '}
                <span className="font-normal text-muted">
                  · D {s.d} · Y {s.y} · B {s.b} · Net {fmtNet(s.net)}
                </span>
              </p>
              <div className="flex flex-wrap gap-1">
                {s.answers.map((a) => (
                  <div key={a.no} className="flex w-8 flex-col items-center" title={`${a.no}. soru · cevap ${a.key || '-'}${a.kurumRate !== null ? ` · kurumda doğru oranı %${a.kurumRate}` : ''}`}>
                    <span className="text-[9px] text-muted tabular-nums">{a.no}</span>
                    <span className={cx('flex h-7 w-7 items-center justify-center rounded-lg border text-xs font-black', markCls(a.mark))}>{a.key === 'X' ? '✓' : a.given || '·'}</span>
                    <span className={cx('text-[9px] font-semibold', a.mark === 'D' ? 'text-transparent' : 'text-fg-2')}>{a.key === 'X' ? 'iptal' : a.key || '-'}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      {/* Konu ve kazanım analizi */}
      <Panel title="Konu ve kazanım analizi" description="Çizgi kurumun başarısını gösterir">
        <div className="space-y-3">
          <LevelLegend />
          {bySubject.map(({ s, list }) => (
            <div key={s.subject.key} className="rounded-2xl border border-line overflow-hidden">
              <div className="flex items-center justify-between gap-2 bg-surface-2/60 px-3 py-2">
                <span className="text-sm font-bold text-fg">{s.subject.name}</span>
                <span className={chipFor(s.rate)}>%{s.rate} başarı</span>
              </div>
              <div className="overflow-x-auto">
                <table className={tableCls}>
                  <thead className="text-muted border-b border-line">
                    <tr>
                      <th className="px-3 py-1.5 font-semibold">Konu / kazanım</th>
                      <th className="px-2 py-1.5 font-semibold text-center">Sorular</th>
                      <th className="px-2 py-1.5 font-semibold text-center">D/Y/B</th>
                      <th className="px-3 py-1.5 font-semibold">Başarı (│ kurum)</th>
                      <th className="px-3 py-1.5 font-semibold">Öneri</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {list.map((t) => (
                      <tr key={t.konu}>
                        <td className="px-3 py-1.5 text-fg">
                          <p className="font-semibold">{t.konu}</p>
                          {t.alt && <p className="text-[11px] text-muted">{t.alt}</p>}
                        </td>
                        <td className="px-2 py-1.5 text-center tabular-nums text-muted">{t.questions.join(', ')}</td>
                        <td className="px-2 py-1.5 text-center tabular-nums whitespace-nowrap">
                          <span className="text-success-fg font-semibold">{t.d}</span>/<span className="text-danger-fg font-semibold">{t.y}</span>/<span className="text-muted">{t.b}</span>
                        </td>
                        <td className="px-3 py-1.5">
                          <RateBar rate={t.rate} marker={t.kurumRate} />
                        </td>
                        <td className={cx('px-3 py-1.5 text-[11px]', LEVEL_TEXT[levelOf(t.rate)])}>{LEVEL_INFO[levelOf(t.rate)].label}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
};

// ----------------------------------------------------------------------------- Öğrenci karnesi
export const StudentKarneView: React.FC<{
  exams: DenemeExam[]; // tarih sırasıyla
  results: DenemeResult[];
  target: number | null;
  targetEditor?: React.ReactNode;
  studentName?: string;
  className?: string;
  /** Aşama 50: ayrıntılı karnesi gösterilen deneme (boşsa en son deneme) */
  detailExamId?: string;
  onDetailExamChange?: (id: string) => void;
}> = ({ exams: allExams, results, target, targetEditor, studentName, className, detailExamId, onDetailExamChange }) => {
  const rByExam = useMemo(() => new Map(results.map((r) => [r.examId, r])), [results]);
  const exams = allExams.filter((e) => rByExam.has(e.id));
  const subs = usedSubjects(exams);
  const analysis = useMemo(() => topicAnalysis(exams, results, subs), [exams, results, subs]);
  const [localDetail, setLocalDetail] = useState('');
  const detailId = (detailExamId ?? localDetail) || '';
  const detailExam = exams.find((e) => e.id === detailId) || exams[exams.length - 1];
  const detail = useMemo(() => {
    const r = detailExam ? rByExam.get(detailExam.id) : undefined;
    return detailExam && r ? examKarneData(detailExam, r) : null;
  }, [detailExam, rByExam]);
  if (!exams.length) return <p className="text-sm text-muted">Seçilen kapsamda deneme sonucu yok.</p>;
  const last = rByExam.get(exams[exams.length - 1].id)!;
  const pickDetail = (id: string) => (onDetailExamChange ? onDetailExamChange(id) : setLocalDetail(id));
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
      {detail && (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-56">
              <label className="ui-label" htmlFor="karne-detail-exam">Ayrıntılı karne</label>
              <select id="karne-detail-exam" className="ui-input" value={detailExam?.id || ''} onChange={(e) => pickDetail(e.target.value)}>
                {exams
                  .slice()
                  .reverse()
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} · {dateTr(e.examDate)}
                    </option>
                  ))}
              </select>
            </div>
            <span className="text-[11px] text-muted pb-2">Aşağıda seçilen denemenin ayrıntılı karnesi, onun altında kapsamdaki denemelerin gelişimi yer alır.</span>
          </div>
          <ExamKarneCard data={detail} studentName={studentName || detail.result.studentName} className={className} />
          <div className="flex items-center gap-2 pt-2">
            <span className="h-px flex-1 bg-line" />
            <span className="text-xs font-bold uppercase tracking-wider text-muted">Gelişim ({exams.length} deneme)</span>
            <span className="h-px flex-1 bg-line" />
          </div>
        </>
      )}
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

      {/* Aşama 54: seçilen denemelerin ortalaması */}
      <AveragesPanel exams={exams} results={results} />

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

      {/* Aşama 54: konu ısı tablosu (satır kazanım, sütun deneme) */}
      <HeatTablePanel exams={exams} results={results} />

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
