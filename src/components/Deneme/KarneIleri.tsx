import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarPlus, ChevronDown, ChevronRight, Info, LayoutGrid, Lightbulb, ListChecks, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { Panel, cx } from '../ui/kit';
import type { BankRow, DenemeExam, DenemeResult } from '../../services/denemeService';
import { LEVEL_INFO, levelOf, type Level } from '../../lib/deneme/analiz';
import { fmtNet, fmtScore } from '../../lib/deneme/lgs';
import { dateTr, examShort, usedSubjects } from '../../lib/deneme/karneModel';
import {
  FOLLOW_INFO,
  KAZ_RULE_LINE,
  KAZ_STATUS_INFO,
  KAZ_STATUS_ORDER,
  kazanimTracking,
  selectedAverages,
  studySuggestions,
  suggestionFollowUp,
  topicHeat,
  trackingTotals,
  withEk,
  type KazRow,
  type KazStatus,
  type KazTone,
  type StudySuggestion,
} from '../../lib/deneme/kazanimKarne';

// ============================================================================
// Aşama 54: Karne ekleri
//  * Seçilen denemelerin ortalaması ve konu ısı tablosu (birleştirilmiş öğrenci karnesi)
//  * Kazanım Takip Karnesi (kontrol listesi)
//  * Çalışma Planı Karnesi (gelecek hafta ne çalışmalı? + plana aktarma)
// ============================================================================

// Öğrenci karnesinin türü (öğretmen ve öğrenci ekranı ortak)
export type KarneTur = 'genel' | 'kazanim' | 'plan';
export const KARNE_TURLERI: Array<{ value: KarneTur; label: string }> = [
  { value: 'genel', label: 'Birleştirilmiş karne' },
  { value: 'kazanim', label: 'Kazanım takip' },
  { value: 'plan', label: 'Çalışma planı' },
];

const tableCls = 'w-full text-left text-xs text-fg-2';
const theadCls = 'bg-surface-2/60 uppercase tracking-wider text-muted border-b border-line';

const LEVEL_CELL: Record<Level, string> = {
  iyi: 'bg-success-soft text-success-fg',
  tekrar: 'bg-info-soft text-info-fg',
  etut: 'bg-warning-soft text-warning-fg',
  kritik: 'bg-danger-soft text-danger-fg',
};
export const levelCell = (rate: number) => LEVEL_CELL[levelOf(rate)];
const chipTone = (t: KazTone) => `ui-chip ui-chip-${t === 'muted' ? 'neutral' : t}`;
const chipFor = (rate: number) => `ui-chip ui-chip-${LEVEL_INFO[levelOf(rate)].tone}`;
const LEVEL_DOT: Record<Level, string> = { iyi: 'bg-success', tekrar: 'bg-info', etut: 'bg-warning', kritik: 'bg-danger' };
const levelDot = (rate: number) => LEVEL_DOT[levelOf(rate)];
const STATUS_BAR: Record<KazStatus, string> = { kazanildi: 'bg-success', gelisiyor: 'bg-info', eksik: 'bg-danger', sorulmadi: 'bg-line' };

export const HeatLegend: React.FC<{ note?: string }> = ({ note }) => (
  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
    {(['iyi', 'tekrar', 'etut', 'kritik'] as const).map((l) => (
      <span key={l} className={cx('rounded-md px-2 py-0.5 font-semibold', LEVEL_CELL[l])}>
        {LEVEL_INFO[l].label} {l === 'iyi' ? '%70+' : l === 'tekrar' ? '%50-69' : l === 'etut' ? '%30-49' : '%0-29'}
      </span>
    ))}
    <span className="rounded-md px-2 py-0.5 font-semibold bg-surface-2 text-muted">— sorulmadı</span>
    {note && <span className="text-muted">{note}</span>}
  </div>
);

const TrendIcon: React.FC<{ t: KazRow['trend'] }> = ({ t }) =>
  t === 'up' ? (
    <span className="inline-flex items-center gap-0.5 text-success-fg" title="Son denemede önceki denemelerin ortalamasından en az 15 puan yüksek">
      <TrendingUp className="w-3.5 h-3.5" /> Yükseliyor
    </span>
  ) : t === 'down' ? (
    <span className="inline-flex items-center gap-0.5 text-danger-fg" title="Son denemede önceki denemelerin ortalamasından en az 15 puan düşük">
      <TrendingDown className="w-3.5 h-3.5" /> Düşüyor
    </span>
  ) : t === 'flat' ? (
    <span className="inline-flex items-center gap-0.5 text-muted">
      <Minus className="w-3.5 h-3.5" /> Sabit
    </span>
  ) : (
    <span className="text-subtle">—</span>
  );

// ============================================================================ Seçilen denemelerin ortalaması
export const AveragesPanel: React.FC<{ exams: DenemeExam[]; results: DenemeResult[] }> = ({ exams, results }) => {
  const subs = useMemo(() => usedSubjects(exams), [exams]);
  const a = useMemo(() => selectedAverages(exams, results, subs), [exams, results, subs]);
  if (!a || a.n < 2) return null;
  const hasCls = a.rows.some((r) => r.clsNet !== null);
  const diff = (x: number | null, y: number | null, f: (n: number) => string) => {
    if (x === null || y === null || Math.abs(x - y) < 0.005) return <span className="text-muted">—</span>;
    return <span className={cx('font-semibold tabular-nums', x > y ? 'text-success-fg' : 'text-danger-fg')}>{x > y ? `▲ ${f(x - y)}` : `▼ ${f(y - x)}`}</span>;
  };
  return (
    <Panel title={`Seçilen ${a.n} denemenin ortalaması`} description="Ders ders ortalama doğru, yanlış, boş ve net; sınıf ve kurum ortalamasıyla" icon={LayoutGrid} tone="info" id="karne-ortalama">
      <div className="space-y-3">
        <div className="grid gap-2 grid-cols-2 lg:grid-cols-5">
          <div className="rounded-xl border border-info/25 bg-info-soft px-3 py-2">
            <p className="ui-eyebrow">Ortalama puan</p>
            <p className="text-lg font-bold text-info-fg tabular-nums">{fmtScore(a.score)}</p>
            {a.clsScore !== null && <p className="text-[11px] text-muted">Sınıf ort. {fmtScore(a.clsScore)}</p>}
          </div>
          <div className="rounded-xl border border-line bg-surface px-3 py-2">
            <p className="ui-eyebrow">Ortalama toplam net</p>
            <p className="text-lg font-bold text-fg tabular-nums">{fmtNet(a.totalNet)}</p>
          </div>
          <div className="rounded-xl border border-line bg-surface px-3 py-2">
            <p className="ui-eyebrow">Kurum ort. puan</p>
            <p className="text-lg font-bold text-fg tabular-nums">{fmtScore(a.kurumScore)}</p>
            <p className="text-[11px]">{diff(a.score, a.kurumScore, fmtScore)}</p>
          </div>
          <div className="rounded-xl border border-success/25 bg-success-soft px-3 py-2">
            <p className="ui-eyebrow">En iyi deneme</p>
            <p className="text-lg font-bold text-success-fg tabular-nums">{fmtScore(a.best?.score)}</p>
            <p className="text-[11px] text-muted truncate">{a.best?.exam.name}</p>
          </div>
          <div className="rounded-xl border border-line bg-surface px-3 py-2">
            <p className="ui-eyebrow">İlk → son puan</p>
            <p className="text-lg font-bold text-fg tabular-nums">
              {fmtScore(a.first)} → {fmtScore(a.last)}
            </p>
            <p className="text-[11px]">{diff(a.last, a.first, fmtScore)}</p>
          </div>
        </div>
        <div className="bg-surface border border-line rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className={tableCls}>
              <thead className={theadCls}>
                <tr>
                  <th className="px-3 py-2 font-semibold">Ders</th>
                  <th className="px-2 py-2 font-semibold text-center">Ort. D / Y / B</th>
                  <th className="px-2 py-2 font-semibold text-center">Ort. net</th>
                  <th className="px-2 py-2 font-semibold text-center">Başarı</th>
                  {hasCls && <th className="px-2 py-2 font-semibold text-center">Sınıf ort.</th>}
                  <th className="px-2 py-2 font-semibold text-center">Kurum ort.</th>
                  <th className="px-2 py-2 font-semibold text-center">Kuruma göre</th>
                  <th className="px-3 py-2 font-semibold text-center">En iyi / en düşük</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {a.rows.map((r) => (
                  <tr key={r.subject.key} className="hover:bg-surface-2/30">
                    <td className="px-3 py-1.5 font-semibold text-fg">{r.subject.name}</td>
                    <td className="px-2 py-1.5 text-center tabular-nums whitespace-nowrap">
                      <span className="text-success-fg">{fmtNet(r.d)}</span> / <span className="text-danger-fg">{fmtNet(r.y)}</span> / <span className="text-muted">{fmtNet(r.b)}</span>
                    </td>
                    <td className="px-2 py-1.5 text-center tabular-nums font-bold text-fg">{fmtNet(r.net)}</td>
                    <td className="px-2 py-1.5 text-center">
                      <span className={chipFor(r.rate)}>%{r.rate}</span>
                    </td>
                    {hasCls && <td className="px-2 py-1.5 text-center tabular-nums">{fmtNet(r.clsNet)}</td>}
                    <td className="px-2 py-1.5 text-center tabular-nums">{fmtNet(r.kurumNet)}</td>
                    <td className="px-2 py-1.5 text-center">{diff(r.net, r.kurumNet, fmtNet)}</td>
                    <td className="px-3 py-1.5 text-center tabular-nums whitespace-nowrap">
                      <span className="text-success-fg font-semibold">{fmtNet(r.best)}</span> / <span className="text-danger-fg">{fmtNet(r.worst)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Panel>
  );
};

// ============================================================================ Konu ısı tablosu
export const HeatTablePanel: React.FC<{ exams: DenemeExam[]; results: DenemeResult[] }> = ({ exams: allExams, results }) => {
  const exams = useMemo(() => allExams.filter((e) => results.some((r) => r.examId === e.id)), [allExams, results]);
  const subs = useMemo(() => usedSubjects(exams), [exams]);
  const heat = useMemo(() => topicHeat(kazanimTracking(exams, results, subs), exams), [exams, results, subs]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  if (!heat.length) return null;
  return (
    <Panel title="Konu ısı tablosu" description="Satırlar kazanımlar, sütunlar denemeler: hangi konu hangi denemede nasıldı, tek bakışta" icon={LayoutGrid} tone="brand" id="karne-isi-tablosu">
      <div className="space-y-3">
        <HeatLegend note="Hücreye gelince soru numaraları görünür." />
        {heat.map((h, hi) => {
          const isOpen = open[h.subject.key] ?? hi === 0;
          return (
            <div key={h.subject.key} className="rounded-2xl border border-line overflow-hidden">
              <button
                type="button"
                className="flex w-full items-center gap-2 bg-surface-2/60 px-3 py-2 text-left cursor-pointer"
                onClick={() => setOpen((o) => ({ ...o, [h.subject.key]: !isOpen }))}
                aria-expanded={isOpen}
              >
                {isOpen ? <ChevronDown className="w-4 h-4 text-muted" /> : <ChevronRight className="w-4 h-4 text-muted" />}
                <span className="text-sm font-bold text-fg">{h.subject.name}</span>
                <span className="text-[11px] text-muted">{h.rows.length} kazanım</span>
                <span className="ml-auto flex gap-0.5" aria-hidden>
                  {h.examRates.map((r, i) => (
                    <span key={i} className={cx('h-3 w-3 rounded-sm', r === null ? 'bg-surface-2 border border-line' : levelDot(r))} />
                  ))}
                </span>
              </button>
              {isOpen && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-fg-2 border-collapse">
                    <thead className="text-muted border-b border-line">
                      <tr>
                        <th className="sticky left-0 z-10 bg-surface px-3 py-2 text-left font-semibold min-w-56">Kazanım</th>
                        {exams.map((e, i) => (
                          <th key={e.id} className="px-1 py-2 font-semibold text-center min-w-14" title={`${e.name} · ${dateTr(e.examDate)}`}>
                            <span className="block tabular-nums">{i + 1}</span>
                            <span className="block font-normal text-[10px] truncate max-w-16 mx-auto">{examShort(e)}</span>
                          </th>
                        ))}
                        <th className="px-2 py-2 font-semibold text-center min-w-14">Genel</th>
                      </tr>
                    </thead>
                    <tbody>
                      {h.rows.map(({ row, cells }) => (
                        <tr key={row.key} className="border-b border-line/60">
                          <td className="sticky left-0 z-10 bg-surface px-3 py-1 text-fg" title={row.label}>
                            <span className="line-clamp-2">{row.short}</span>
                          </td>
                          {cells.map((c, i) => {
                            const ap = row.per[exams[i].id];
                            return (
                              <td key={i} className="p-0.5 text-center">
                                <span
                                  className={cx('block rounded-md py-1 tabular-nums font-semibold', c === null ? 'bg-surface-2/60 text-subtle' : levelCell(c))}
                                  title={ap ? `${exams[i].name}: ${ap.questions.join(', ')}. sorular · D ${ap.d} Y ${ap.y} B ${ap.b}` : `${exams[i].name}: sorulmadı`}
                                >
                                  {c === null ? '—' : `%${c}`}
                                </span>
                              </td>
                            );
                          })}
                          <td className="p-0.5 text-center">
                            <span className={cx('block rounded-md py-1 tabular-nums font-bold', levelCell(row.rate))}>%{row.rate}</span>
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-surface-2/40">
                        <td className="sticky left-0 z-10 bg-surface-2 px-3 py-1.5 font-bold text-fg">Ders geneli</td>
                        {h.examRates.map((c, i) => (
                          <td key={i} className="p-0.5 text-center">
                            <span className={cx('block rounded-md py-1 tabular-nums font-bold', c === null ? 'text-subtle' : levelCell(c))}>{c === null ? '—' : `%${c}`}</span>
                          </td>
                        ))}
                        <td />
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Panel>
  );
};

// ============================================================================ Kazanım Takip Karnesi
type StatusFilter = 'all' | KazStatus;

export const KazanimTakipView: React.FC<{ exams: DenemeExam[]; results: DenemeResult[]; bank?: BankRow[] | null; bankLoading?: boolean }> = ({
  exams: allExams,
  results,
  bank,
  bankLoading,
}) => {
  const exams = useMemo(() => allExams.filter((e) => results.some((r) => r.examId === e.id)), [allExams, results]);
  const subs = useMemo(() => usedSubjects(exams), [exams]);
  const tracking = useMemo(() => kazanimTracking(exams, results, subs, bank), [exams, results, subs, bank]);
  const tot = trackingTotals(tracking);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  if (!tracking.length) return <p className="text-sm text-muted">Seçilen denemelerde kazanım bilgisi olan soru yok.</p>;
  const filters: Array<{ v: StatusFilter; label: string; n: number; tone: KazTone | 'brand' }> = [
    { v: 'all', label: 'Tümü', n: tot.all, tone: 'brand' },
    ...KAZ_STATUS_ORDER.filter((k) => k !== 'sorulmadi' || tot.counts.sorulmadi > 0).map((k) => ({ v: k as StatusFilter, label: KAZ_STATUS_INFO[k].label, n: tot.counts[k], tone: KAZ_STATUS_INFO[k].tone })),
  ];
  return (
    <div className="space-y-4" id="kazanim-takip">
      <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
        {KAZ_STATUS_ORDER.map((k) => {
          const tone = KAZ_STATUS_INFO[k].tone;
          const cls =
            tone === 'success'
              ? 'border-success/25 bg-success-soft text-success-fg'
              : tone === 'info'
                ? 'border-info/25 bg-info-soft text-info-fg'
                : tone === 'danger'
                  ? 'border-danger/25 bg-danger-soft text-danger-fg'
                  : 'border-line bg-surface-2/60 text-muted';
          return (
            <div key={k} className={cx('rounded-xl border px-3 py-2', cls)}>
              <p className="text-[11px] font-bold uppercase tracking-wider opacity-80">{KAZ_STATUS_INFO[k].label}</p>
              <p className="text-2xl font-black tabular-nums leading-tight">{tot.counts[k]}</p>
              <p className="text-[11px] opacity-80">
                {k === 'sorulmadi'
                  ? tot.counts.sorulmadi
                    ? 'kazanım bankasına göre'
                    : bankLoading
                      ? 'kazanım bankası okunuyor…'
                      : 'bankada eşleşen kazanım yok'
                  : `sorulan ${tot.asked} kazanımın ${withEk(tot.asked ? Math.round((tot.counts[k] / tot.asked) * 100) : 0, true)}`}
              </p>
            </div>
          );
        })}
      </div>

      <div className="flex items-start gap-2 rounded-xl bg-info-soft px-3 py-2 text-[11px] text-info-fg">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>
          <b>Durum nasıl belirlenir?</b> {KAZ_RULE_LINE}. Başarı = doğru / soru; "Son" kazanımın en son sorulduğu denemedeki başarısıdır. 3'ten az soru sorulan kazanımlar (*) ile işaretlidir: sonuç kesin değildir.
        </span>
      </div>

      <Panel title="Ders ders ilerleme" description="Her dersin kazanımlarının yüzde kaçı kazanıldı?" icon={ListChecks} tone="success">
        <div className="space-y-2.5">
          {tracking.map((s) => (
            <div key={s.subject.key} className="grid gap-1 sm:grid-cols-[12rem_1fr_9rem] sm:items-center">
              <div>
                <p className="text-sm font-semibold text-fg">{s.subject.name}</p>
                <p className="text-[11px] text-muted">{s.pctAll !== null ? `${s.all} kazanım · ${s.counts.sorulmadi} henüz sorulmadı` : `${s.asked} kazanım soruldu`}</p>
              </div>
              <div className="flex h-4 w-full overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`${s.subject.name}: ${s.counts.kazanildi} kazanıldı, ${s.counts.gelisiyor} gelişiyor, ${s.counts.eksik} eksik, ${s.counts.sorulmadi} sorulmadı`}>
                {KAZ_STATUS_ORDER.map((k) =>
                  s.counts[k] > 0 ? (
                    <span
                      key={k}
                      className={cx('h-full flex items-center justify-center text-[10px] font-bold', STATUS_BAR[k], k === 'sorulmadi' ? 'text-muted' : 'text-white')}
                      style={{ width: `${(s.counts[k] / Math.max(1, s.all)) * 100}%` }}
                      title={`${KAZ_STATUS_INFO[k].label}: ${s.counts[k]}`}
                    >
                      {(s.counts[k] / Math.max(1, s.all)) * 100 >= 8 ? s.counts[k] : ''}
                    </span>
                  ) : null
                )}
              </div>
              <p className="text-sm sm:text-right">
                <b className="text-fg tabular-nums">%{s.pctAsked}</b> <span className="text-muted text-xs">kazanıldı</span>
              </p>
            </div>
          ))}
          <div className="flex flex-wrap gap-3 pt-1 text-[11px] text-muted">
            {KAZ_STATUS_ORDER.map((k) => (
              <span key={k} className="inline-flex items-center gap-1">
                <span className={cx('h-2.5 w-2.5 rounded-sm', STATUS_BAR[k])} /> {KAZ_STATUS_INFO[k].label}
              </span>
            ))}
          </div>
        </div>
      </Panel>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Duruma göre süz">
        {filters.map((f) => (
          <button
            key={f.v}
            type="button"
            aria-pressed={filter === f.v}
            onClick={() => setFilter(f.v)}
            className={cx('ui-chip cursor-pointer border', filter === f.v ? `${f.tone === 'brand' ? 'ui-chip ui-chip-brand' : chipTone(f.tone)} border-brand/40 ring-2 ring-brand/30` : 'ui-chip-neutral border-line')}
          >
            {f.label} <b className="tabular-nums">{f.n}</b>
          </button>
        ))}
      </div>

      {tracking.map((s, si) => {
        const rows = s.rows.filter((r) => filter === 'all' || r.status === filter);
        if (!rows.length) return null;
        const isOpen = open[s.subject.key] ?? (filter !== 'all' || si === 0);
        return (
          <div key={s.subject.key} className="rounded-2xl border border-line bg-surface overflow-hidden">
            <button
              type="button"
              className="flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left cursor-pointer bg-surface-2/60"
              onClick={() => setOpen((o) => ({ ...o, [s.subject.key]: !isOpen }))}
              aria-expanded={isOpen}
            >
              {isOpen ? <ChevronDown className="w-4 h-4 text-muted" /> : <ChevronRight className="w-4 h-4 text-muted" />}
              <span className="text-sm font-bold text-fg">{s.subject.name}</span>
              <span className={chipTone(s.pctAsked >= 70 ? 'success' : s.pctAsked >= 40 ? 'info' : 'danger')}>Kazanımların {withEk(s.pctAsked, true)} kazanıldı</span>
              <span className="text-[11px] text-muted">
                {s.counts.kazanildi} kazanıldı · {s.counts.gelisiyor} gelişiyor · {s.counts.eksik} eksik{s.counts.sorulmadi ? ` · ${s.counts.sorulmadi} sorulmadı` : ''}
              </span>
            </button>
            {isOpen && (
              <div className="overflow-x-auto">
                <table className={tableCls}>
                  <thead className="text-muted border-b border-line">
                    <tr>
                      <th className="px-3 py-1.5 font-semibold">Kazanım</th>
                      <th className="px-2 py-1.5 font-semibold text-center">Denemeler</th>
                      <th className="px-2 py-1.5 font-semibold text-center">D/Y/B</th>
                      <th className="px-2 py-1.5 font-semibold text-center">Genel</th>
                      <th className="px-2 py-1.5 font-semibold text-center">Son</th>
                      <th className="px-2 py-1.5 font-semibold">Gidiş</th>
                      <th className="px-3 py-1.5 font-semibold text-center">Durum</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {rows.map((r) => (
                      <tr key={r.key} className={cx('hover:bg-surface-2/30', r.status === 'sorulmadi' && 'opacity-70')}>
                        <td className="px-3 py-1.5 text-fg">
                          <p className="font-semibold">
                            {r.label}
                            {r.fewData && <span className="text-muted font-normal" title="3'ten az soru: sonuç kesin değil"> (*)</span>}
                          </p>
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="flex justify-center gap-0.5">
                            {exams.map((e) => {
                              const ap = r.per[e.id];
                              return (
                                <span
                                  key={e.id}
                                  className={cx('h-3.5 w-3.5 rounded-sm', ap ? levelDot(ap.rate) : 'bg-surface-2 border border-line')}
                                  title={ap ? `${e.name}: %${ap.rate} (${ap.questions.join(', ')}. sorular)` : `${e.name}: sorulmadı`}
                                />
                              );
                            })}
                          </div>
                        </td>
                        <td className="px-2 py-1.5 text-center tabular-nums whitespace-nowrap">
                          {r.questions ? (
                            <>
                              <span className="text-success-fg font-semibold">{r.d}</span>/<span className="text-danger-fg font-semibold">{r.y}</span>/<span className="text-muted">{r.b}</span>
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-center">{r.questions ? <span className={chipFor(r.rate)}>%{r.rate}</span> : <span className="text-subtle">—</span>}</td>
                        <td className="px-2 py-1.5 text-center">{r.lastRate !== null ? <span className={chipFor(r.lastRate)}>%{r.lastRate}</span> : <span className="text-subtle">—</span>}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap">
                          <TrendIcon t={r.trend} />
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          <span className={chipTone(KAZ_STATUS_INFO[r.status].tone)}>{KAZ_STATUS_INFO[r.status].label}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ============================================================================ Çalışma Planı Karnesi
export const CalismaPlaniView: React.FC<{
  exams: DenemeExam[];
  results: DenemeResult[];
  /** Öğretmen: seçim ve soru sayıları düzenlenebilir, plana aktarılabilir */
  editable?: boolean;
  onTransfer?: (list: StudySuggestion[]) => void;
  /** Seçili / düzenlenmiş liste değişince (PDF için) */
  onChange?: (list: StudySuggestion[]) => void;
}> = ({ exams: allExams, results, editable, onTransfer, onChange }) => {
  const exams = useMemo(() => allExams.filter((e) => results.some((r) => r.examId === e.id)), [allExams, results]);
  const subs = useMemo(() => usedSubjects(exams), [exams]);
  const candidates = useMemo(() => studySuggestions(kazanimTracking(exams, results, subs), 10), [exams, results, subs]);
  const followUp = useMemo(() => suggestionFollowUp(exams, results, subs), [exams, results, subs]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [showMore, setShowMore] = useState(false);
  const candKey = candidates.map((c) => c.row.key).join('|');
  useEffect(() => {
    setPicked(new Set(candidates.slice(0, 5).map((c) => c.row.key)));
    setCounts({});
    setShowMore(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candKey]);
  const list = useMemo(
    () => candidates.filter((c) => picked.has(c.row.key)).map((c) => ({ ...c, questions: counts[c.row.key] ?? c.questions })),
    [candidates, picked, counts]
  );
  useEffect(() => {
    onChange?.(list);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list]);

  if (!exams.length) return <p className="text-sm text-muted">Seçilen kapsamda deneme sonucu yok.</p>;
  const shown = editable ? (showMore ? candidates : candidates.slice(0, 5)) : list;
  const totalQ = list.reduce((a, s) => a + s.questions, 0);
  const totalLoss = list.reduce((a, s) => a + s.row.perExamLoss, 0);
  const toggle = (k: string) =>
    setPicked((cur) => {
      const n = new Set(cur);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  return (
    <div className="space-y-4" id="calisma-plani">
      <div className="grid gap-2 grid-cols-1 sm:grid-cols-3">
        <div className="rounded-xl border border-warning/25 bg-warning-soft px-3 py-2 text-warning-fg">
          <p className="text-[11px] font-bold uppercase tracking-wider opacity-80">Öncelikli kazanım</p>
          <p className="text-2xl font-black tabular-nums leading-tight">{list.length}</p>
          <p className="text-[11px] opacity-80">en çok puan kaybettirenler</p>
        </div>
        <div className="rounded-xl border border-info/25 bg-info-soft px-3 py-2 text-info-fg">
          <p className="text-[11px] font-bold uppercase tracking-wider opacity-80">Haftalık soru hedefi</p>
          <p className="text-2xl font-black tabular-nums leading-tight">{totalQ}</p>
          <p className="text-[11px] opacity-80">önerilen toplam soru</p>
        </div>
        <div className="rounded-xl border border-danger/25 bg-danger-soft px-3 py-2 text-danger-fg">
          <p className="text-[11px] font-bold uppercase tracking-wider opacity-80">Kaybettirdiği puan</p>
          <p className="text-2xl font-black tabular-nums leading-tight">{fmtScore(totalLoss)}</p>
          <p className="text-[11px] opacity-80">deneme başına, yaklaşık</p>
        </div>
      </div>

      <Panel
        title="Gelecek hafta ne çalışmalı?"
        description="Seçilen denemelerde en çok puan kaybettiren kazanımlar ve önerilen soru sayıları"
        icon={Lightbulb}
        tone="warning"
        padded={false}
        actions={
          editable && onTransfer ? (
            <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" disabled={!list.length} onClick={() => onTransfer(list)} id="plana-aktar">
              <CalendarPlus /> Plana ve soru hedefine aktar
            </button>
          ) : undefined
        }
      >
        {!candidates.length ? (
          <p className="px-4 pb-4 text-sm text-success-fg">Seçilen denemelerde puan kaybettiren eksik kazanım bulunmadı. Düzenli tekrar ve deneme çözümüyle devam.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className={tableCls}>
              <thead className={theadCls}>
                <tr>
                  {editable && <th className="px-3 py-2 font-semibold w-10">Seç</th>}
                  <th className="px-3 py-2 font-semibold w-8">#</th>
                  <th className="px-2 py-2 font-semibold">Ders</th>
                  <th className="px-2 py-2 font-semibold">Kazanım</th>
                  <th className="px-2 py-2 font-semibold text-center">Son başarı</th>
                  <th className="px-2 py-2 font-semibold text-center">Puan kaybı / deneme</th>
                  <th className="px-2 py-2 font-semibold text-center">Soru</th>
                  <th className="px-3 py-2 font-semibold">Ne yapmalı?</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shown.map((c, i) => {
                  const on = picked.has(c.row.key);
                  const rate = c.row.lastRate ?? c.row.rate;
                  return (
                    <tr key={c.row.key} className={cx('align-top hover:bg-surface-2/30', editable && !on && 'opacity-55')}>
                      {editable && (
                        <td className="px-3 py-2">
                          <input type="checkbox" className="h-4 w-4 accent-[var(--color-brand,#4f46e5)] cursor-pointer" checked={on} onChange={() => toggle(c.row.key)} aria-label={`${c.row.short} seç`} />
                        </td>
                      )}
                      <td className="px-3 py-2 font-bold text-fg tabular-nums">{i + 1}</td>
                      <td className="px-2 py-2 whitespace-nowrap font-semibold text-fg">{c.subject.short}</td>
                      <td className="px-2 py-2">
                        <p className="font-semibold text-fg">{c.row.label}</p>
                        <p className="text-[11px] text-muted">{c.reason}</p>
                      </td>
                      <td className="px-2 py-2 text-center">
                        <span className={chipFor(rate)}>%{rate}</span>
                        {c.row.trend === 'down' && <p className="mt-0.5 text-[10px] text-danger-fg">düşüşte</p>}
                      </td>
                      <td className="px-2 py-2 text-center tabular-nums font-bold text-danger-fg">{fmtScore(c.row.perExamLoss)}</td>
                      <td className="px-2 py-2 text-center">
                        {editable ? (
                          <input
                            type="number"
                            min={0}
                            max={300}
                            step={5}
                            className="ui-input w-20 py-1 text-center text-xs"
                            value={counts[c.row.key] ?? c.questions}
                            onChange={(e) => setCounts((m) => ({ ...m, [c.row.key]: Math.max(0, Math.min(300, Math.round(Number(e.target.value) || 0))) }))}
                            aria-label={`${c.row.short} soru sayısı`}
                          />
                        ) : (
                          <b className="tabular-nums text-fg">{c.questions}</b>
                        )}
                      </td>
                      <td className="px-3 py-2 text-[11px] text-fg-2 min-w-48">{c.advice}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {editable && candidates.length > 5 && (
              <div className="border-t border-line px-3 py-2">
                <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={() => setShowMore((v) => !v)}>
                  {showMore ? <ChevronDown /> : <ChevronRight />} {showMore ? 'Yalnızca ilk 5 aday' : `Diğer ${candidates.length - 5} adayı da göster`}
                </button>
              </div>
            )}
          </div>
        )}
      </Panel>

      <div className="flex items-start gap-2 rounded-xl bg-info-soft px-3 py-2 text-[11px] text-info-fg">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>
          <b>Kazanımlar nasıl seçildi?</b> Her kazanımın deneme başına kaybettirdiği yaklaşık LGS puanı hesaplanır (yanlış: 1 net + 1/3 net ceza, boş: 1 net; Türkçe, Matematik ve Fen 4 katsayılı). Kazanılmış kazanımlar listeye girmez; eksik olanlar ve son denemede düşenler öne alınır. Soru sayısı: %30 altı 40, %30-49 30, %50-69 20 soru (1 katsayılı derslerde dörtte üçü).
        </span>
      </div>

      {followUp && (
        <Panel title={`Önceki önerilerin sonucu: ${followUp.exam.name}`} description="Bu denemeden önceki denemelere göre önerilecek kazanımlar bu denemede nasıl sonuçlandı?" icon={TrendingUp} tone="info" padded={false}>
          <div className="overflow-x-auto">
            <table className={tableCls}>
              <thead className={theadCls}>
                <tr>
                  <th className="px-3 py-2 font-semibold">Ders</th>
                  <th className="px-2 py-2 font-semibold">Kazanım</th>
                  <th className="px-2 py-2 font-semibold text-center">Önce</th>
                  <th className="px-2 py-2 font-semibold text-center">Bu deneme</th>
                  <th className="px-2 py-2 font-semibold text-center">Değişim</th>
                  <th className="px-3 py-2 font-semibold text-center">Sonuç</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {followUp.rows.map((r, i) => (
                  <tr key={i}>
                    <td className="px-3 py-1.5 font-semibold text-fg whitespace-nowrap">{r.subject.short}</td>
                    <td className="px-2 py-1.5 text-fg" title={r.label}>
                      {r.short}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <span className={chipFor(r.before)}>%{r.before}</span>
                    </td>
                    <td className="px-2 py-1.5 text-center">{r.after === null ? <span className="text-subtle">—</span> : <span className={chipFor(r.after)}>%{r.after}</span>}</td>
                    <td className={cx('px-2 py-1.5 text-center tabular-nums font-semibold', r.change === null ? 'text-subtle' : r.change > 0 ? 'text-success-fg' : r.change < 0 ? 'text-danger-fg' : 'text-muted')}>
                      {r.change === null ? '—' : `${r.change > 0 ? '▲ ' : r.change < 0 ? '▼ ' : ''}${Math.abs(r.change)}`}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <span className={chipTone(FOLLOW_INFO[r.verdict].tone)}>{FOLLOW_INFO[r.verdict].label}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
      {!followUp && exams.length < 2 && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted">
          <AlertTriangle className="w-3.5 h-3.5" /> Önerilerin işe yarayıp yaramadığı, en az iki denemeyi kapsayan karnede "Önceki önerilerin sonucu" bölümünde görünür.
        </p>
      )}
    </div>
  );
};
