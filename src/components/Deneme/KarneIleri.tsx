import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarPlus, ChevronDown, ChevronRight, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { cx } from '../ui/kit';
// Aşama 272: birleştirilmiş karnenin tasarım dili (ortak)
import { DersAd, Fark, IsiDaire, KAltKart, KBolum, KKutu, KNot, KT, SeviyeLejant, Yuzde, dersRgb } from './KarneTasarim';
import type { BankRow, DenemeExam, DenemeResult } from '../../services/denemeService';
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
export type KarneTur = 'genel' | 'kazanim' | 'plan' | 'oncelik' | 'veli' | 'tek'; // Aşama 135: tek = tek sayfa sonuç karnesi
export const KARNE_TURLERI: Array<{ value: KarneTur; label: string }> = [
  { value: 'genel', label: 'Birleştirilmiş karne' },
  { value: 'kazanim', label: 'Kazanım takip' },
  { value: 'plan', label: 'Çalışma planı' },
  { value: 'oncelik', label: 'Öncelikli konular' }, // Aşama 56
  { value: 'veli', label: 'Veli karnesi' }, // Aşama 56 (yalnızca öğretmen)
];

const chipTone = (t: KazTone) => `ui-chip ui-chip-${t === 'muted' ? 'neutral' : t}`;
const STATUS_BAR: Record<KazStatus, string> = { kazanildi: 'bg-success', gelisiyor: 'bg-info', eksik: 'bg-danger', sorulmadi: 'bg-line' };

export const HeatLegend: React.FC<{ note?: string }> = ({ note }) => <SeviyeLejant sorulmadi not={note} />;

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
  const diff = (x: number | null, y: number | null, f: (n: number) => string) => <Fark v={x === null || y === null ? null : x - y} bicim={f} ok={false} />;
  return (
    <KBolum baslik={`Seçilen ${a.n} denemenin ortalaması`} aciklama="Ders ders ortalama doğru, yanlış, boş ve net; sınıf ortalamasıyla" id="karne-ortalama">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <KKutu vurgu etiket="Ortalama puan" deger={fmtScore(a.score)} alt={a.clsScore !== null ? `Sınıf ort. ${fmtScore(a.clsScore)}` : undefined} />
        <KKutu etiket="Ortalama toplam net" deger={fmtNet(a.totalNet)} />
        <KKutu ton="success" etiket="En iyi deneme" deger={fmtScore(a.best?.score)} alt={<span className="block truncate">{a.best?.exam.name}</span>} />
        <KKutu etiket="İlk → son puan" deger={`${fmtScore(a.first)} → ${fmtScore(a.last)}`}>
          <p className="text-xs">{diff(a.last, a.first, fmtScore)}</p>
        </KKutu>
      </div>
      <div className="overflow-hidden rounded-2xl border border-line">
        <div className="overflow-x-auto">
          <table className={KT.tablo}>
            <thead className={KT.bas}>
              <tr>
                <th className={KT.th}>Ders</th>
                <th className={KT.thc}>Ort. D / Y / B</th>
                <th className={KT.thc}>Ort. net</th>
                <th className={KT.thc}>Başarı</th>
                {hasCls && <th className={KT.thc}>Sınıf ort.</th>}
                {hasCls && <th className={KT.thc}>Sınıfa göre</th>}
                <th className={KT.thc}>En iyi / en düşük</th>
              </tr>
            </thead>
            <tbody className={KT.govde}>
              {a.rows.map((r, i) => (
                <tr key={r.subject.key} className={KT.satir}>
                  <td className={KT.td}>
                    <DersAd ad={r.subject.name} renk={dersRgb(r.subject.key, i)} />
                  </td>
                  <td className={cx(KT.tdc, 'whitespace-nowrap')}>
                    <span className="text-success-fg">{fmtNet(r.d)}</span> / <span className="text-danger-fg">{fmtNet(r.y)}</span> / <span className="text-muted">{fmtNet(r.b)}</span>
                  </td>
                  <td className={cx(KT.tdc, 'font-bold text-fg')}>{fmtNet(r.net)}</td>
                  <td className={KT.tdc}>
                    <Yuzde v={r.rate} />
                  </td>
                  {hasCls && <td className={KT.tdc}>{fmtNet(r.clsNet)}</td>}
                  {hasCls && <td className={KT.tdc}>{diff(r.net, r.clsNet, fmtNet)}</td>}
                  <td className={cx(KT.tdc, 'whitespace-nowrap')}>
                    <span className="font-semibold text-success-fg">{fmtNet(r.best)}</span> / <span className="text-danger-fg">{fmtNet(r.worst)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </KBolum>
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
    <KBolum baslik="Konu ısı tablosu" aciklama="Satırlar kazanımlar, sütunlar denemeler: hangi konu hangi denemede nasıldı, tek bakışta" id="karne-isi-tablosu">
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
                <span className="text-xs text-muted">{h.rows.length} kazanım</span>
                <span className="ml-auto flex gap-0.5" aria-hidden>
                  {h.examRates.map((r, i) => (
                    <IsiDaire key={i} v={r} kucuk />
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
                            <span className="block font-normal text-2xs truncate max-w-16 mx-auto">{examShort(e)}</span>
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
                                <IsiDaire v={c} title={ap ? `${exams[i].name}: ${ap.questions.join(', ')}. sorular · D ${ap.d} Y ${ap.y} B ${ap.b}` : `${exams[i].name}: sorulmadı`} />
                              </td>
                            );
                          })}
                          <td className="p-0.5 text-center">
                            <Yuzde v={row.rate} />
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-surface-2/40">
                        <td className="sticky left-0 z-10 bg-surface-2 px-3 py-1.5 font-bold text-fg">Ders geneli</td>
                        {h.examRates.map((c, i) => (
                          <td key={i} className="p-0.5 text-center">
                            <Yuzde v={c} />
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
    </KBolum>
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
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {KAZ_STATUS_ORDER.map((k) => {
          const tone = KAZ_STATUS_INFO[k].tone;
          return (
            <KKutu
              key={k}
              ton={tone === 'success' || tone === 'info' || tone === 'danger' ? tone : undefined}
              etiket={KAZ_STATUS_INFO[k].label}
              deger={tot.counts[k]}
              alt={
                k === 'sorulmadi'
                  ? tot.counts.sorulmadi
                    ? 'kazanım bankasına göre'
                    : bankLoading
                      ? 'kazanım bankası okunuyor…'
                      : 'bankada eşleşen kazanım yok'
                  : `sorulan ${tot.asked} kazanımın ${withEk(tot.asked ? Math.round((tot.counts[k] / tot.asked) * 100) : 0, true)}`
              }
            />
          );
        })}
      </div>

      <KNot>
        <b>Durum nasıl belirlenir?</b> {KAZ_RULE_LINE}. Başarı = doğru / soru; "Son" kazanımın en son sorulduğu denemedeki başarısıdır. 3'ten az soru sorulan kazanımlar (*) ile işaretlidir: sonuç kesin değildir.
      </KNot>

      <KBolum baslik="Ders ders ilerleme" aciklama="Her dersin kazanımlarının yüzde kaçı kazanıldı?">
        <div className="space-y-2.5">
          {tracking.map((s, si) => (
            <div key={s.subject.key} className="grid gap-1 sm:grid-cols-[12rem_1fr_9rem] sm:items-center">
              <div>
                <DersAd ad={s.subject.name} renk={dersRgb(s.subject.key, si)} className="text-sm" />
                <p className="text-xs text-muted">{s.pctAll !== null ? `${s.all} kazanım · ${s.counts.sorulmadi} henüz sorulmadı` : `${s.asked} kazanım soruldu`}</p>
              </div>
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`${s.subject.name}: ${s.counts.kazanildi} kazanıldı, ${s.counts.gelisiyor} gelişiyor, ${s.counts.eksik} eksik, ${s.counts.sorulmadi} sorulmadı`}>
                {KAZ_STATUS_ORDER.map((k) =>
                  s.counts[k] > 0 ? (
                    <span
                      key={k}
                      className={cx('flex h-full items-center justify-center text-3xs font-bold', STATUS_BAR[k], k === 'sorulmadi' ? 'text-muted' : 'text-white')}
                      style={{ width: `${(s.counts[k] / Math.max(1, s.all)) * 100}%` }}
                      title={`${KAZ_STATUS_INFO[k].label}: ${s.counts[k]}`}
                    >
                      {(s.counts[k] / Math.max(1, s.all)) * 100 >= 8 ? s.counts[k] : ''}
                    </span>
                  ) : null
                )}
              </div>
              <p className="text-sm sm:text-right">
                <Yuzde v={s.pctAsked} /> <span className="text-xs text-muted">kazanıldı</span>
              </p>
            </div>
          ))}
          <div className="flex flex-wrap gap-3 pt-1 text-xs text-fg-2">
            {KAZ_STATUS_ORDER.map((k) => (
              <span key={k} className="inline-flex items-center gap-1">
                <span className={cx('h-2.5 w-2.5 rounded-full', STATUS_BAR[k])} /> {KAZ_STATUS_INFO[k].label}
              </span>
            ))}
          </div>
        </div>
      </KBolum>

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
          <KAltKart key={s.subject.key} renk={dersRgb(s.subject.key, si)} className="shadow-sm">
            <button
              type="button"
              className="flex w-full cursor-pointer flex-wrap items-center gap-2 px-3 py-2.5 text-left"
              onClick={() => setOpen((o) => ({ ...o, [s.subject.key]: !isOpen }))}
              aria-expanded={isOpen}
            >
              {isOpen ? <ChevronDown className="h-4 w-4 text-muted" /> : <ChevronRight className="h-4 w-4 text-muted" />}
              <DersAd ad={s.subject.name} renk={dersRgb(s.subject.key, si)} className="text-sm font-extrabold" />
              <span className={chipTone(s.pctAsked >= 70 ? 'success' : s.pctAsked >= 40 ? 'info' : 'danger')}>Kazanımların {withEk(s.pctAsked, true)} kazanıldı</span>
              <span className="text-xs text-muted">
                {s.counts.kazanildi} kazanıldı · {s.counts.gelisiyor} gelişiyor · {s.counts.eksik} eksik{s.counts.sorulmadi ? ` · ${s.counts.sorulmadi} sorulmadı` : ''}
              </span>
            </button>
            {isOpen && (
              <div className="overflow-x-auto border-t border-line">
                <table className={KT.tablo}>
                  <thead className={KT.bas}>
                    <tr>
                      <th className={KT.th}>Kazanım</th>
                      <th className={KT.thc}>Denemeler</th>
                      <th className={KT.thc}>D/Y/B</th>
                      <th className={KT.thc}>Genel</th>
                      <th className={KT.thc}>Son</th>
                      <th className={KT.th}>Gidiş</th>
                      <th className={KT.thc}>Durum</th>
                    </tr>
                  </thead>
                  <tbody className={KT.govde}>
                    {rows.map((r) => (
                      <tr key={r.key} className={cx(KT.satir, r.status === 'sorulmadi' && 'opacity-70')}>
                        <td className={cx(KT.td, 'text-fg')}>
                          <p className="font-semibold">
                            {r.label}
                            {r.fewData && <span className="text-muted font-normal" title="3'ten az soru: sonuç kesin değil"> (*)</span>}
                          </p>
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="flex justify-center gap-0.5">
                            {exams.map((e) => {
                              const ap = r.per[e.id];
                              return <IsiDaire key={e.id} v={ap ? ap.rate : null} kucuk title={ap ? `${e.name}: %${ap.rate} (${ap.questions.join(', ')}. sorular)` : `${e.name}: sorulmadı`} />;
                            })}
                          </div>
                        </td>
                        <td className={cx(KT.tdc, 'whitespace-nowrap')}>
                          {r.questions ? (
                            <>
                              <span className="text-success-fg font-semibold">{r.d}</span>/<span className="text-danger-fg font-semibold">{r.y}</span>/<span className="text-muted">{r.b}</span>
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className={KT.tdc}>
                          <Yuzde v={r.questions ? r.rate : null} />
                        </td>
                        <td className={KT.tdc}>
                          <Yuzde v={r.lastRate} />
                        </td>
                        <td className={cx(KT.td, 'whitespace-nowrap')}>
                          <TrendIcon t={r.trend} />
                        </td>
                        <td className={KT.tdc}>
                          <span className={chipTone(KAZ_STATUS_INFO[r.status].tone)}>{KAZ_STATUS_INFO[r.status].label}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </KAltKart>
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
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <KKutu ton="warning" etiket="Öncelikli kazanım" deger={list.length} alt="en çok puan kaybettirenler" />
        <KKutu vurgu etiket="Haftalık soru hedefi" deger={totalQ} alt="önerilen toplam soru" />
        <KKutu ton="danger" etiket="Kaybettirdiği puan" deger={fmtScore(totalLoss)} alt="deneme başına, yaklaşık" />
      </div>

      <KBolum
        tablo
        baslik="Gelecek hafta ne çalışmalı?"
        aciklama="Seçilen denemelerde en çok puan kaybettiren kazanımlar ve önerilen soru sayıları"
        sag={
          editable && onTransfer ? (
            <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" disabled={!list.length} onClick={() => onTransfer(list)} id="plana-aktar">
              <CalendarPlus /> Plana ve soru hedefine aktar
            </button>
          ) : undefined
        }
      >
        {!candidates.length ? (
          <p className="px-4 py-4 text-sm text-success-fg">Seçilen denemelerde puan kaybettiren eksik kazanım bulunmadı. Düzenli tekrar ve deneme çözümüyle devam.</p>
        ) : (
          <div>
            <table className={KT.tablo}>
              <thead className={KT.bas}>
                <tr>
                  {editable && <th className={cx(KT.th, 'w-10')}>Seç</th>}
                  <th className={cx(KT.th, 'w-8')}>#</th>
                  <th className={KT.th}>Ders</th>
                  <th className={KT.th}>Kazanım</th>
                  <th className={KT.thc}>Son başarı</th>
                  <th className={KT.thc}>Puan kaybı / deneme</th>
                  <th className={KT.thc}>Soru</th>
                  <th className={KT.th}>Ne yapmalı?</th>
                </tr>
              </thead>
              <tbody className={KT.govde}>
                {shown.map((c, i) => {
                  const on = picked.has(c.row.key);
                  const rate = c.row.lastRate ?? c.row.rate;
                  return (
                    <tr key={c.row.key} className={cx('align-top', KT.satir, editable && !on && 'opacity-55')}>
                      {editable && (
                        <td className="px-3 py-2">
                          <input type="checkbox" className="h-4 w-4 accent-[var(--color-brand,#4f46e5)] cursor-pointer" checked={on} onChange={() => toggle(c.row.key)} aria-label={`${c.row.short} seç`} />
                        </td>
                      )}
                      <td className="px-3 py-2 font-bold text-fg tabular-nums">{i + 1}</td>
                      <td className="whitespace-nowrap px-2 py-2">
                        <DersAd ad={c.subject.short} renk={dersRgb(c.subject.key, subs.findIndex((x) => x.key === c.subject.key))} />
                      </td>
                      <td className="px-2 py-2">
                        <p className="font-semibold text-fg">{c.row.label}</p>
                        <p className="text-xs text-muted">{c.reason}</p>
                      </td>
                      <td className="px-2 py-2 text-center">
                        <Yuzde v={rate} />
                        {c.row.trend === 'down' && <p className="mt-0.5 text-2xs text-danger-fg">düşüşte</p>}
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
                      <td className="px-3 py-2 text-xs text-fg-2 min-w-48">{c.advice}</td>
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
      </KBolum>

      <KNot>
        <>
          <b>Kazanımlar nasıl seçildi?</b> Her kazanımın deneme başına kaybettirdiği yaklaşık puan hesaplanır (yanlış: 1 net + yanlış cezası, boş: 1 net; Türkçe, Matematik ve Fen 4 katsayılı). Kazanılmış kazanımlar listeye girmez; eksik olanlar ve son denemede düşenler öne alınır. Soru sayısı: %30 altı 40, %30-49 30, %50-69 20 soru (1 katsayılı derslerde dörtte üçü).
        </>
      </KNot>

      {followUp && (
        <KBolum tablo baslik={`Önceki önerilerin sonucu: ${followUp.exam.name}`} aciklama="Bu denemeden önceki denemelere göre önerilecek kazanımlar bu denemede nasıl sonuçlandı?">
          <table className={KT.tablo}>
            <thead className={KT.bas}>
              <tr>
                <th className={KT.th}>Ders</th>
                <th className={KT.th}>Kazanım</th>
                <th className={KT.thc}>Önce</th>
                <th className={KT.thc}>Bu deneme</th>
                <th className={KT.thc}>Değişim</th>
                <th className={KT.thc}>Sonuç</th>
              </tr>
            </thead>
            <tbody className={KT.govde}>
              {followUp.rows.map((r, i) => (
                <tr key={i} className={KT.satir}>
                  <td className={cx(KT.td, 'whitespace-nowrap')}>
                    <DersAd ad={r.subject.short} renk={dersRgb(r.subject.key, subs.findIndex((x) => x.key === r.subject.key))} />
                  </td>
                  <td className={cx(KT.td, 'text-fg')} title={r.label}>
                    {r.short}
                  </td>
                  <td className={KT.tdc}>
                    <Yuzde v={r.before} />
                  </td>
                  <td className={KT.tdc}>
                    <Yuzde v={r.after} />
                  </td>
                  <td className={KT.tdc}>
                    <Fark v={r.change} bicim={(n) => String(n)} ok={false} />
                  </td>
                  <td className={KT.tdc}>
                    <span className={chipTone(FOLLOW_INFO[r.verdict].tone)}>{FOLLOW_INFO[r.verdict].label}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </KBolum>
      )}
      {!followUp && exams.length < 2 && (
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <AlertTriangle className="w-3.5 h-3.5" /> Önerilerin işe yarayıp yaramadığı, en az iki denemeyi kapsayan karnede "Önceki önerilerin sonucu" bölümünde görünür.
        </p>
      )}
    </div>
  );
};
