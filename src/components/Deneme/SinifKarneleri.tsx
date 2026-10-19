import React, { useMemo, useState } from 'react';
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, Cell, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceLine } from 'recharts';
import { Award, Flame, Info, LayoutGrid, Medal, TrendingDown, TrendingUp, Users } from 'lucide-react';
import { Panel, Segmented, cx } from '../ui/kit';
import { LEVEL_INFO, levelOf, type Level } from '../../lib/deneme/analiz';
import { fmtNet, fmtScore } from '../../lib/deneme/lgs';
import { dateRange, dateTr, examShort } from '../../lib/deneme/karneModel';
import {
  HEAT_MIN_TOTAL,
  SCORE_BANDS,
  diffTone,
  filterHeat,
  heatInsights,
  netVsKurumTone,
  scoreVsClassTone,
  type ClassCombined,
  type ClassStudentRow,
  type HeatCell,
  type HeatOptions,
  type KazHeat,
} from '../../lib/deneme/sinifKarne';

// ============================================================================
// Aşama 55: Sınıf Birleştirilmiş Karnesi ve Kazanım Isı Haritası (ekran)
// Hesaplar lib/deneme/sinifKarne.ts'te; PDF'ler karneModel.ts'te (aynı veriler).
// ============================================================================

const CHART = { cls: '#4f46e5', kurum: '#94a3b8', up: '#109669', down: '#dc2626' };
const tableCls = 'w-full text-left text-xs text-fg-2';
const theadCls = 'bg-surface-2/60 uppercase tracking-wider text-muted border-b border-line';

const LEVEL_CELL: Record<Level, string> = {
  iyi: 'bg-success-soft text-success-fg',
  tekrar: 'bg-info-soft text-info-fg',
  etut: 'bg-warning-soft text-warning-fg',
  kritik: 'bg-danger-soft text-danger-fg',
};
const TONE_CELL: Record<'success' | 'info' | 'warning' | 'danger', string> = {
  success: 'bg-success-soft text-success-fg',
  info: 'bg-info-soft text-info-fg',
  warning: 'bg-warning-soft text-warning-fg',
  danger: 'bg-danger-soft text-danger-fg',
};
const levelCell = (rate: number) => LEVEL_CELL[levelOf(rate)];
const chipFor = (rate: number) => `ui-chip ui-chip-${LEVEL_INFO[levelOf(rate)].tone}`;

const signed = (v: number | null, f: (n: number) => string = fmtScore) =>
  v === null || !Number.isFinite(v) ? '—' : Math.abs(v) < 0.005 ? '0' : `${v > 0 ? '+' : '−'}${f(Math.abs(v))}`;

const DeltaPill: React.FC<{ v: number | null; f?: (n: number) => string; className?: string }> = ({ v, f = fmtScore, className }) => {
  if (v === null || !Number.isFinite(v)) return <span className="text-subtle">—</span>;
  const up = v > 0.005;
  const down = v < -0.005;
  return (
    <span
      className={cx(
        'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums whitespace-nowrap',
        up ? 'bg-success-soft text-success-fg' : down ? 'bg-danger-soft text-danger-fg' : 'bg-surface-2 text-muted',
        className
      )}
    >
      {up ? <TrendingUp className="w-3 h-3" /> : down ? <TrendingDown className="w-3 h-3" /> : null}
      {signed(v, f)}
    </span>
  );
};

/** Küçük çizgi grafik (öğrencinin denemelerdeki puanı) */
export const Sparkline: React.FC<{ values: Array<number | null>; width?: number; height?: number }> = ({ values, width = 76, height = 22 }) => {
  const pts = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null);
  if (pts.length < 2) return <span className="text-[10px] text-subtle">—</span>;
  const min = Math.min(...pts.map((p) => p.v));
  const max = Math.max(...pts.map((p) => p.v));
  const span = Math.max(1, max - min);
  const n = Math.max(1, values.length - 1);
  const x = (i: number) => 2 + (i / n) * (width - 4);
  const y = (v: number) => height - 3 - ((v - min) / span) * (height - 6);
  const d = pts.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const up = pts[pts.length - 1].v >= pts[0].v;
  const last = pts[pts.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={up ? 'text-success' : 'text-danger'} aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last.i)} cy={y(last.v)} r={2.2} fill="currentColor" />
    </svg>
  );
};

const ChartCard: React.FC<{ title: string; hint?: string; children: React.ReactElement }> = ({ title, hint, children }) => (
  <div className="rounded-2xl border border-line bg-surface p-3">
    <p className="text-sm font-semibold text-fg">{title}</p>
    {hint && <p className="text-[11px] text-muted">{hint}</p>}
    <div className="h-56 mt-2">
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  </div>
);

// ============================================================================ Sınıf Birleştirilmiş Karnesi
type StudentSort = 'ort' | 'degisim' | 'ad';
const BAND_BAR = ['bg-emerald-600', 'bg-emerald-400', 'bg-sky-500', 'bg-amber-400', 'bg-orange-500', 'bg-rose-600'];

export const ClassCombinedView: React.FC<{ data: ClassCombined | null; scopeLabel: string }> = ({ data, scopeLabel }) => {
  const [sort, setSort] = useState<StudentSort>('ort');
  const students = useMemo(() => {
    if (!data) return [] as ClassStudentRow[];
    const list = data.students.slice();
    if (sort === 'degisim') list.sort((a, b) => (b.change ?? -9999) - (a.change ?? -9999));
    else if (sort === 'ad') list.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    return list;
  }, [data, sort]);
  if (!data) return <p className="text-sm text-muted">Seçilen kapsamda bu sınıfın sonucu yok.</p>;
  const { summary: s, perExam, subjects: subs, exams } = data;
  const chart = perExam.map((p) => ({
    name: examShort(p.exam),
    [data.className]: p.avgScore,
    'Kurum ort.': p.kurumScore,
    Fark: p.diff,
  }));

  return (
    <div className="space-y-4" id="sinif-birlesik">
      {/* Başlık bandı */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-700 via-brand to-sky-600 text-white shadow-lg">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10" aria-hidden />
        <div className="absolute -bottom-20 right-24 h-44 w-44 rounded-full bg-white/5" aria-hidden />
        <div className="relative grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/70">Sınıf birleştirilmiş karnesi</p>
            <h3 className="mt-1 text-xl sm:text-2xl font-extrabold leading-tight truncate">{data.className}</h3>
            <p className="text-sm text-white/85">
              {scopeLabel} · {exams.length} deneme · {dateRange(exams)}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
              <span className="rounded-full bg-white/15 px-2.5 py-1 font-semibold">
                <Users className="inline w-3 h-3 -mt-0.5 mr-1" />
                {s.studentCount} öğrenci
              </span>
              {s.participation !== null && <span className="rounded-full bg-white/15 px-2.5 py-1">Katılım %{s.participation}</span>}
              {s.bestExam && (
                <span className="rounded-full bg-white/15 px-2.5 py-1">
                  En iyi: {s.bestExam.exam.name} ({fmtScore(s.bestExam.avgScore)})
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-28 w-28 flex-col items-center justify-center rounded-full bg-white text-brand-fg shadow-xl ring-4 ring-white/30">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Ort. puan</span>
              <span className="text-2xl font-black tabular-nums leading-none mt-0.5">{fmtScore(s.avgScore)}</span>
              <span className="text-[10px] text-muted mt-0.5">kurum {fmtScore(s.kurumScore)}</span>
            </div>
            <div className="grid gap-1.5 text-xs">
              <div className="rounded-xl bg-white/15 px-3 py-1.5">
                <p className="text-white/70 text-[10px] uppercase tracking-wider">Kuruma göre</p>
                <p className="font-bold tabular-nums">{signed(s.diff)} puan</p>
              </div>
              <div className="rounded-xl bg-white/15 px-3 py-1.5">
                <p className="text-white/70 text-[10px] uppercase tracking-wider">İlk → son deneme</p>
                <p className="font-bold tabular-nums">{signed(s.change)} puan</p>
              </div>
              <div className="rounded-xl bg-white/15 px-3 py-1.5">
                <p className="text-white/70 text-[10px] uppercase tracking-wider">Kurumdaki sıra</p>
                <p className="font-bold tabular-nums">{s.lastRank ? `${s.lastRank.rank} / ${s.lastRank.of}` : '—'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Grafikler */}
      <div className="grid gap-3 lg:grid-cols-2">
        <ChartCard title="Ortalama puan: sınıf ve kurum" hint="Kesikli çizgi kurum ortalaması">
          <LineChart data={chart} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line, #e2e8f0)" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
            <Tooltip formatter={(v: any) => fmtScore(Number(v))} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey={data.className} stroke={CHART.cls} strokeWidth={2.4} dot={{ r: 3.5 }} activeDot={{ r: 5 }} connectNulls />
            <Line type="monotone" dataKey="Kurum ort." stroke={CHART.kurum} strokeWidth={1.8} strokeDasharray="5 4" dot={false} connectNulls />
          </LineChart>
        </ChartCard>
        <ChartCard title="Kurum ortalamasına göre fark" hint="Yeşil: sınıf kurumun üstünde · Kırmızı: altında (puan)">
          <BarChart data={chart} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line, #e2e8f0)" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip formatter={(v: any) => signed(Number(v))} />
            <ReferenceLine y={0} stroke="var(--color-line, #cbd5e1)" />
            <Bar dataKey="Fark" radius={[5, 5, 5, 5]}>
              {chart.map((c, i) => (
                <Cell key={i} fill={(c.Fark ?? 0) >= 0 ? CHART.up : CHART.down} />
              ))}
            </Bar>
          </BarChart>
        </ChartCard>
      </div>

      {/* Deneme deneme */}
      <Panel title="Deneme deneme sınıf sonuçları" description="Ders netlerinde yeşil kurumun üstü, kırmızı altı (dersin soru sayısının %5'i kadar fark)" icon={LayoutGrid} tone="brand" padded={false}>
        <div className="overflow-x-auto">
          <table className={tableCls}>
            <thead className={theadCls}>
              <tr>
                <th className="px-3 py-2 font-semibold">Deneme</th>
                <th className="px-2 py-2 font-semibold text-center">Katılım</th>
                {subs.map((x) => (
                  <th key={x.key} className="px-2 py-2 font-semibold text-center" title={x.name}>
                    {x.short}
                  </th>
                ))}
                <th className="px-2 py-2 font-semibold text-center">Top. net</th>
                <th className="px-2 py-2 font-semibold text-center">Ort. puan</th>
                <th className="px-2 py-2 font-semibold text-center">Kurum</th>
                <th className="px-2 py-2 font-semibold text-center">Fark</th>
                <th className="px-3 py-2 font-semibold text-center">Kurumda sıra</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {perExam.map((p) => (
                <tr key={p.exam.id} className="hover:bg-surface-2/30">
                  <td className="px-3 py-1.5">
                    <p className="font-semibold text-fg">{p.exam.name}</p>
                    <p className="text-[11px] text-muted">{dateTr(p.exam.examDate)}</p>
                  </td>
                  <td className="px-2 py-1.5 text-center tabular-nums">{p.n}</td>
                  {subs.map((x) => {
                    const t = netVsKurumTone(p.avgNet[x.key], p.kurumNet[x.key], x.count);
                    return (
                      <td key={x.key} className="p-0.5 text-center">
                        <span
                          className={cx('block rounded-md py-1 tabular-nums', t ? TONE_CELL[t] + ' font-semibold' : 'text-fg-2')}
                          title={`${x.name}: sınıf ${fmtNet(p.avgNet[x.key])} · kurum ${fmtNet(p.kurumNet[x.key])}`}
                        >
                          {fmtNet(p.avgNet[x.key])}
                        </span>
                      </td>
                    );
                  })}
                  <td className="px-2 py-1.5 text-center tabular-nums font-semibold text-fg">{fmtNet(p.avgTotalNet)}</td>
                  <td className="px-2 py-1.5 text-center tabular-nums font-bold text-fg">{fmtScore(p.avgScore)}</td>
                  <td className="px-2 py-1.5 text-center tabular-nums text-muted">{fmtScore(p.kurumScore)}</td>
                  <td className="px-2 py-1.5 text-center">
                    <DeltaPill v={p.diff} />
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    {p.rank !== null ? (
                      <span className={cx('ui-chip tabular-nums', p.rank === 1 ? 'ui-chip-success' : 'ui-chip-neutral')}>
                        {p.rank === 1 && <Medal className="w-3 h-3" />}
                        {p.rank} / {p.rankOf}
                      </span>
                    ) : (
                      <span className="text-subtle">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Yükselen / düşen */}
      {(data.risers.length > 0 || data.fallers.length > 0) && (
        <div className="grid gap-3 lg:grid-cols-2">
          {(
            [
              { key: 'up', title: 'En çok yükselen öğrenciler', list: data.risers, icon: TrendingUp, cls: 'border-success/30', head: 'bg-success-soft text-success-fg' },
              { key: 'down', title: 'En çok düşen öğrenciler', list: data.fallers, icon: TrendingDown, cls: 'border-danger/30', head: 'bg-danger-soft text-danger-fg' },
            ] as const
          ).map((g) => (
            <div key={g.key} className={cx('rounded-2xl border bg-surface overflow-hidden', g.cls)}>
              <p className={cx('flex items-center gap-1.5 px-3 py-2 text-sm font-bold', g.head)}>
                <g.icon className="w-4 h-4" /> {g.title}
                <span className="ml-auto text-[11px] font-normal opacity-80">ilk → son deneme</span>
              </p>
              {g.list.length === 0 ? (
                <p className="px-3 py-3 text-xs text-muted">{g.key === 'up' ? 'Puanı yükselen öğrenci yok.' : 'Puanı düşen öğrenci yok.'}</p>
              ) : (
                <ul className="divide-y divide-line">
                  {g.list.map((st, i) => (
                    <li key={st.studentId} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                      <span className="w-5 text-center font-bold text-muted tabular-nums">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate font-semibold text-fg">{st.name}</span>
                      <span className="tabular-nums text-muted whitespace-nowrap">
                        {fmtScore(st.first)} → <b className="text-fg">{fmtScore(st.last)}</b>
                      </span>
                      <Sparkline values={st.scores} width={64} height={20} />
                      <DeltaPill v={st.change} className="min-w-16 justify-center" />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Öğrenci × deneme */}
      <Panel
        title="Öğrenci × deneme puan tablosu"
        description="Yeşil: o denemede sınıf ortalamasının en az 20 puan üstü · Kırmızı: en az 20 puan altı · —: denemeye girmedi"
        icon={Award}
        tone="info"
        padded={false}
        actions={
          <Segmented
            size="sm"
            value={sort}
            onChange={setSort}
            items={[
              { value: 'ort', label: 'Ortalamaya göre' },
              { value: 'degisim', label: 'Değişime göre' },
              { value: 'ad', label: 'Ada göre' },
            ]}
          />
        }
      >
        <div className="overflow-auto max-h-[32rem]">
          <table className="w-full text-xs text-fg-2 border-separate border-spacing-0">
            <thead className="text-muted">
              <tr>
                <th className="sticky top-0 left-0 z-30 bg-surface-2 px-2 py-2 text-center font-semibold border-b border-line w-10">#</th>
                <th className="sticky top-0 left-10 z-30 bg-surface-2 px-3 py-2 text-left font-semibold border-b border-line min-w-40">Öğrenci</th>
                {exams.map((e, i) => (
                  <th key={e.id} className="sticky top-0 z-20 bg-surface-2 px-1 py-2 text-center font-semibold border-b border-line min-w-14" title={`${e.name} · ${dateTr(e.examDate)}`}>
                    <span className="block tabular-nums">{i + 1}</span>
                    <span className="block font-normal text-[10px] truncate max-w-16 mx-auto">{examShort(e)}</span>
                  </th>
                ))}
                <th className="sticky top-0 z-20 bg-surface-2 px-2 py-2 text-center font-semibold border-b border-line">Ortalama</th>
                <th className="sticky top-0 z-20 bg-surface-2 px-2 py-2 text-center font-semibold border-b border-line">İlk → son</th>
                <th className="sticky top-0 z-20 bg-surface-2 px-2 py-2 text-center font-semibold border-b border-line">Gidiş</th>
                <th className="sticky top-0 z-20 bg-surface-2 px-2 py-2 text-center font-semibold border-b border-line">Girdiği</th>
              </tr>
            </thead>
            <tbody>
              {students.map((st) => (
                <tr key={st.studentId} className="group">
                  <td className="sticky left-0 z-10 bg-surface group-hover:bg-surface-2 px-2 py-1 text-center font-bold tabular-nums border-b border-line/60">{st.rank}</td>
                  <td className="sticky left-10 z-10 bg-surface group-hover:bg-surface-2 px-3 py-1 font-semibold text-fg border-b border-line/60 whitespace-nowrap">{st.name}</td>
                  {st.scores.map((v, i) => {
                    const t = scoreVsClassTone(v, perExam[i].avgScore);
                    return (
                      <td key={i} className="p-0.5 border-b border-line/60">
                        <span
                          className={cx('block rounded-md py-1 text-center tabular-nums', v === null ? 'text-subtle' : t ? TONE_CELL[t] + ' font-bold' : 'text-fg')}
                          title={v === null ? `${exams[i].name}: girmedi` : `${exams[i].name}: ${fmtScore(v)} (sınıf ort. ${fmtScore(perExam[i].avgScore)})`}
                        >
                          {v === null ? '—' : fmtScore(v)}
                        </span>
                      </td>
                    );
                  })}
                  <td className="px-2 py-1 text-center tabular-nums font-bold text-fg border-b border-line/60">{fmtScore(st.avg)}</td>
                  <td className="px-2 py-1 text-center border-b border-line/60">
                    <DeltaPill v={st.change} />
                  </td>
                  <td className="px-2 py-1 text-center border-b border-line/60">
                    <Sparkline values={st.scores} />
                  </td>
                  <td className={cx('px-2 py-1 text-center tabular-nums border-b border-line/60', st.attended < exams.length ? 'text-warning-fg font-semibold' : 'text-muted')}>
                    {st.attended}/{exams.length}
                  </td>
                </tr>
              ))}
              <tr className="font-bold">
                <td className="sticky left-0 z-10 bg-info-soft px-2 py-1.5" />
                <td className="sticky left-10 z-10 bg-info-soft px-3 py-1.5 text-info-fg">Sınıf ortalaması</td>
                {perExam.map((p) => (
                  <td key={p.exam.id} className="bg-info-soft px-1 py-1.5 text-center tabular-nums text-info-fg">
                    {fmtScore(p.avgScore)}
                  </td>
                ))}
                <td className="bg-info-soft px-2 py-1.5 text-center tabular-nums text-info-fg">{fmtScore(s.avgScore)}</td>
                <td className="bg-info-soft px-2 py-1.5 text-center">
                  <DeltaPill v={s.change} />
                </td>
                <td className="bg-info-soft" colSpan={2} />
              </tr>
              <tr>
                <td className="sticky left-0 z-10 bg-surface-2 px-2 py-1.5" />
                <td className="sticky left-10 z-10 bg-surface-2 px-3 py-1.5 font-semibold text-muted">Kurum ortalaması</td>
                {perExam.map((p) => (
                  <td key={p.exam.id} className="bg-surface-2 px-1 py-1.5 text-center tabular-nums text-muted">
                    {fmtScore(p.kurumScore)}
                  </td>
                ))}
                <td className="bg-surface-2 px-2 py-1.5 text-center tabular-nums text-muted">{fmtScore(s.kurumScore)}</td>
                <td className="bg-surface-2" colSpan={3} />
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Puan dağılımı */}
      <Panel title="Puan dağılımı" description="Her denemede öğrencilerin puan aralıklarına dağılımı" icon={LayoutGrid} tone="success">
        <div className="space-y-2">
          {exams.map((e, ei) => {
            const total = data.bands.reduce((a, b) => a + b[ei], 0);
            return (
              <div key={e.id} className="grid gap-1 sm:grid-cols-[11rem_1fr] sm:items-center">
                <p className="text-xs font-semibold text-fg truncate" title={e.name}>
                  {e.name}
                </p>
                <div className="flex h-5 w-full overflow-hidden rounded-full bg-surface-2">
                  {SCORE_BANDS.map((b, bi) => {
                    const n = data.bands[bi][ei];
                    if (!n || !total) return null;
                    const w = (n / total) * 100;
                    return (
                      <span key={b.label} className={cx('flex h-full items-center justify-center text-[10px] font-bold text-white', BAND_BAR[bi])} style={{ width: `${w}%` }} title={`${b.label}: ${n} öğrenci`}>
                        {w >= 7 ? n : ''}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <div className="flex flex-wrap gap-3 pt-1 text-[11px] text-muted">
            {SCORE_BANDS.map((b, bi) => (
              <span key={b.label} className="inline-flex items-center gap-1">
                <span className={cx('h-2.5 w-2.5 rounded-sm', BAND_BAR[bi])} /> {b.label}
              </span>
            ))}
          </div>
        </div>
      </Panel>
    </div>
  );
};

// ============================================================================ Kazanım Isı Haritası
const HEAT_MODES: Array<{ value: HeatOptions['mode']; label: string }> = [
  { value: 'basari', label: 'Başarı %' },
  { value: 'fark', label: 'Kuruma göre fark' },
];
const HEAT_SORTS: Array<{ value: HeatOptions['sort']; label: string }> = [
  { value: 'kod', label: 'Müfredat sırası' },
  { value: 'zayif', label: 'En zayıf önce' },
  { value: 'fark', label: 'Sınıflar arası fark' },
];

const HeatCellView: React.FC<{ c: HeatCell | undefined; k: HeatCell; mode: HeatOptions['mode']; title: string }> = ({ c, k, mode, title }) => {
  if (!c || !c.total)
    return (
      <span className="block rounded-md py-1.5 text-center text-subtle bg-surface-2/50" title={`${title}: bu sınıfa bu kazanımdan soru düşmedi`}>
        —
      </span>
    );
  const few = c.total < HEAT_MIN_TOTAL;
  const diff = c.rate - k.rate;
  const tone = mode === 'fark' ? diffTone(diff) : null;
  const cls = few ? 'bg-surface-2 text-muted' : mode === 'fark' ? (tone ? TONE_CELL[tone] : 'bg-surface-2/60 text-fg-2') : levelCell(c.rate);
  return (
    <span
      className={cx('block rounded-md py-1.5 text-center tabular-nums font-semibold transition-transform hover:scale-105 hover:shadow-sm', cls, few && 'opacity-70')}
      title={`${title}\n${c.students} öğrenci · D ${c.d} · Y ${c.y} · B ${c.b}\nBaşarı %${c.rate} (kurum %${k.rate}, fark ${diff > 0 ? '+' : ''}${diff})${few ? `\n${HEAT_MIN_TOTAL}'ten az cevap: sonuç kesin değil` : ''}`}
    >
      {mode === 'fark' ? `${diff > 0 ? '+' : ''}${diff}` : `%${c.rate}`}
      {few && <sup>*</sup>}
    </span>
  );
};

export const KazanimIsiHaritasi: React.FC<{ heat: KazHeat | null; options: HeatOptions; onOptions: (o: HeatOptions) => void }> = ({ heat, options: o, onOptions }) => {
  const shown = useMemo(() => (heat ? filterHeat(heat, o) : null), [heat, o]);
  const ins = useMemo(() => (shown ? heatInsights(shown, 5) : null), [shown]);
  if (!heat || !heat.subjects.length) return <p className="text-sm text-muted">Seçilen denemelerde kazanım bilgisi olan sonuç yok.</p>;
  const set = (p: Partial<HeatOptions>) => onOptions({ ...o, ...p });
  const toggleClass = (id: string) => {
    const cur = o.classIds.length ? o.classIds : heat.classes.map((c) => c.id);
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    set({ classIds: next.length === heat.classes.length ? [] : next.length ? next : cur });
  };
  const allOn = !o.classIds.length;

  return (
    <div className="space-y-4" id="kazanim-isi-haritasi">
      {/* Süzgeçler */}
      <div className="ui-card ui-card-pad space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="ui-label" htmlFor="isi-ders">Ders</label>
            <select id="isi-ders" className="ui-input w-auto" value={o.subjectKey} onChange={(e) => set({ subjectKey: e.target.value })}>
              <option value="all">Bütün dersler</option>
              {heat.subjects.map((s) => (
                <option key={s.subject.key} value={s.subject.key}>
                  {s.subject.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="ui-label">Görünüm</p>
            <Segmented size="sm" value={o.mode} onChange={(v) => set({ mode: v })} items={HEAT_MODES} />
          </div>
          <div>
            <p className="ui-label">Sıralama</p>
            <Segmented size="sm" value={o.sort} onChange={(v) => set({ sort: v })} items={HEAT_SORTS} />
          </div>
          <label className="flex items-center gap-1.5 pb-1.5 text-xs text-fg-2 cursor-pointer">
            <input type="checkbox" className="h-4 w-4 cursor-pointer" checked={o.onlyWeak} onChange={(e) => set({ onlyWeak: e.target.checked })} />
            Yalnızca bir sınıfta %50 altı olanlar
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Sınıflar">
          <span className="text-xs font-semibold text-muted mr-1">Sınıflar:</span>
          <button type="button" aria-pressed={allOn} onClick={() => set({ classIds: [] })} className={cx('ui-chip cursor-pointer border', allOn ? 'ui-chip-brand border-brand/30' : 'ui-chip-neutral border-line')}>
            Tümü
          </button>
          {heat.classes.map((c) => {
            const on = allOn || o.classIds.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggleClass(c.id)}
                className={cx('ui-chip cursor-pointer border', on ? 'ui-chip-brand border-brand/30' : 'ui-chip-neutral border-line opacity-70')}
              >
                {c.name} <span className="opacity-70 tabular-nums">{c.students}</span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          {o.mode === 'basari' ? (
            (['iyi', 'tekrar', 'etut', 'kritik'] as const).map((l) => (
              <span key={l} className={cx('rounded-md px-2 py-0.5 font-semibold', LEVEL_CELL[l])}>
                {LEVEL_INFO[l].label} {l === 'iyi' ? '%70+' : l === 'tekrar' ? '%50-69' : l === 'etut' ? '%30-49' : '%0-29'}
              </span>
            ))
          ) : (
            <>
              <span className={cx('rounded-md px-2 py-0.5 font-semibold', TONE_CELL.success)}>+10 ve üstü</span>
              <span className={cx('rounded-md px-2 py-0.5 font-semibold', TONE_CELL.info)}>+5 / +9</span>
              <span className="rounded-md px-2 py-0.5 font-semibold bg-surface-2 text-fg-2">−4 / +4</span>
              <span className={cx('rounded-md px-2 py-0.5 font-semibold', TONE_CELL.warning)}>−5 / −9</span>
              <span className={cx('rounded-md px-2 py-0.5 font-semibold', TONE_CELL.danger)}>−10 ve altı</span>
            </>
          )}
          <span className="text-muted">· * {HEAT_MIN_TOTAL}'ten az cevap · — soru düşmedi · Hücreye gelince ayrıntı görünür</span>
        </div>
      </div>

      {/* Öne çıkanlar */}
      {ins && (ins.weakest.length > 0 || ins.widest.length > 0) && (
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="rounded-2xl border border-danger/25 bg-surface overflow-hidden">
            <p className="flex items-center gap-1.5 bg-danger-soft px-3 py-2 text-sm font-bold text-danger-fg">
              <Flame className="w-4 h-4" /> Kurumun en zayıf kazanımları
            </p>
            <ul className="divide-y divide-line">
              {ins.weakest.map((w) => (
                <li key={`${w.subject.key}-${w.row.key}`} className="flex items-start gap-2 px-3 py-1.5 text-xs" title={w.row.label}>
                  <span className="ui-chip ui-chip-neutral shrink-0">{w.subject.short}</span>
                  <span className="min-w-0 flex-1 text-fg line-clamp-2">{w.row.short}</span>
                  <span className={cx(chipFor(w.row.kurum.rate), 'shrink-0')}>%{w.row.kurum.rate}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-warning/25 bg-surface overflow-hidden">
            <p className="flex items-center gap-1.5 bg-warning-soft px-3 py-2 text-sm font-bold text-warning-fg">
              <LayoutGrid className="w-4 h-4" /> Sınıflar arası en büyük fark
            </p>
            {ins.widest.length === 0 ? (
              <p className="px-3 py-3 text-xs text-muted">Sınıflar arasında 20 puandan büyük fark yok.</p>
            ) : (
              <ul className="divide-y divide-line">
                {ins.widest.map((w) => (
                  <li key={`${w.subject.key}-${w.row.key}`} className="px-3 py-1.5 text-xs" title={w.row.label}>
                    <div className="flex items-start gap-2">
                      <span className="ui-chip ui-chip-neutral shrink-0">{w.subject.short}</span>
                      <span className="min-w-0 flex-1 text-fg line-clamp-2">{w.row.short}</span>
                      <span className="ui-chip ui-chip-warning shrink-0 tabular-nums">{w.rate} puan</span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted">{w.note}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-2xl border border-info/25 bg-surface overflow-hidden">
            <p className="flex items-center gap-1.5 bg-info-soft px-3 py-2 text-sm font-bold text-info-fg">
              <Users className="w-4 h-4" /> Her sınıfın en zayıf kazanımı
            </p>
            <ul className="divide-y divide-line max-h-64 overflow-y-auto">
              {ins.perClass.map((p) => (
                <li key={p.cls.id} className="px-3 py-1.5 text-xs">
                  <p className="font-bold text-fg">{p.cls.name}</p>
                  {p.items.length === 0 ? (
                    <p className="text-[11px] text-success-fg">%50 altında kazanım yok</p>
                  ) : (
                    p.items.slice(0, 2).map((it) => (
                      <p key={it.row.key} className="flex items-start gap-1.5 text-[11px]" title={it.row.label}>
                        <span className={cx(chipFor(it.rate), 'shrink-0')}>%{it.rate}</span>
                        <span className="text-fg-2 line-clamp-1">
                          {it.subject.short} · {it.row.short}
                        </span>
                      </p>
                    ))
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Ders ders ısı haritası */}
      {shown && shown.subjects.length === 0 && <p className="text-sm text-muted">Seçime uyan kazanım yok.</p>}
      {shown?.subjects.map((s) => (
        <Panel
          key={s.subject.key}
          title={s.subject.name}
          description={`${s.rows.length} kazanım · kurum başarısı %${s.kurumTotal.rate}`}
          icon={LayoutGrid}
          tone="brand"
          padded={false}
        >
          <div className="overflow-auto max-h-[36rem]">
            <table className="w-full text-xs text-fg-2 border-separate border-spacing-0">
              <thead className="text-muted">
                <tr>
                  <th className="sticky top-0 left-0 z-30 bg-surface-2 px-3 py-2 text-left font-semibold border-b border-line min-w-64">Kazanım</th>
                  {shown.classes.map((c) => (
                    <th key={c.id} className="sticky top-0 z-20 bg-surface-2 px-1 py-2 text-center font-semibold border-b border-line min-w-16">
                      <span className="block text-fg">{c.name}</span>
                      <span className="block font-normal text-[10px]">{c.students} öğr.</span>
                    </th>
                  ))}
                  <th className="sticky top-0 z-20 bg-surface-2 px-1 py-2 text-center font-semibold border-b border-line min-w-16">Kurum</th>
                  <th className="sticky top-0 z-20 bg-surface-2 px-2 py-2 text-center font-semibold border-b border-line" title="Sınıflar arasında en yüksek ile en düşük başarı farkı">
                    Fark
                  </th>
                </tr>
              </thead>
              <tbody>
                {s.rows.map((r) => (
                  <tr key={r.key} className="group">
                    <td className="sticky left-0 z-10 bg-surface group-hover:bg-surface-2 px-3 py-1 border-b border-line/60" title={r.label}>
                      <span className="line-clamp-2 text-fg">{r.short}</span>
                      <span className="block text-[10px] text-muted">
                        {r.questions} soru · {r.examCount} deneme
                      </span>
                    </td>
                    {shown.classes.map((c) => (
                      <td key={c.id} className="p-0.5 border-b border-line/60">
                        <HeatCellView c={r.cells[c.id]} k={r.kurum} mode={o.mode} title={`${c.name} · ${r.short}`} />
                      </td>
                    ))}
                    <td className="p-0.5 border-b border-line/60">
                      <span className={cx('block rounded-md py-1.5 text-center tabular-nums font-bold ring-1 ring-inset ring-line', levelCell(r.kurum.rate))}>%{r.kurum.rate}</span>
                    </td>
                    <td className="px-2 py-1 text-center border-b border-line/60">
                      {r.spread === null ? (
                        <span className="text-subtle">—</span>
                      ) : (
                        <span className={cx('tabular-nums font-semibold', r.spread >= 20 ? 'text-warning-fg' : 'text-muted')}>{r.spread}</span>
                      )}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="sticky left-0 z-10 bg-info-soft px-3 py-1.5 font-bold text-info-fg">Ders geneli</td>
                  {shown.classes.map((c) => (
                    <td key={c.id} className="bg-info-soft p-0.5">
                      <HeatCellView c={s.classTotals[c.id]} k={s.kurumTotal} mode={o.mode} title={`${c.name} · ${s.subject.name} geneli`} />
                    </td>
                  ))}
                  <td className="bg-info-soft p-0.5">
                    <span className={cx('block rounded-md py-1.5 text-center tabular-nums font-bold', levelCell(s.kurumTotal.rate))}>%{s.kurumTotal.rate}</span>
                  </td>
                  <td className="bg-info-soft" />
                </tr>
              </tbody>
            </table>
          </div>
        </Panel>
      ))}

      <p className="flex items-start gap-1.5 text-[11px] text-muted">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        Başarı = doğru / soru (sınıfın bütün öğrencilerinin cevapları). "Fark" sütunu sınıflar arasındaki en yüksek ve en düşük başarı arasındaki farktır; 20 ve üstü turuncu gösterilir.
        Az sayıda cevaba (*) dayanan hücreler fark ve öne çıkanlar hesabına girmez.
      </p>
    </div>
  );
};
