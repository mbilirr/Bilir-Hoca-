import React from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { Building2, CheckCircle2, Heart, Info, Lightbulb, MessageSquareText, Sparkles, Target, TrendingDown, TrendingUp, Trophy, Users } from 'lucide-react';
import { Panel, cx } from '../ui/kit';
import { LEVEL_INFO, levelOf } from '../../lib/deneme/analiz';
import { fmtNet, fmtScore } from '../../lib/deneme/lgs';
import { dateRange, dateTr, examShort } from '../../lib/deneme/karneModel';
import { LGS_PERCENTILE_NOTE } from '../../lib/deneme/lgsYuzdelik';
import { LGS_BANDS, TIER_INFO, priorityAdvice, type KurumOzet, type PriorityKarne, type PriorityTier, type VeliKarneData } from '../../lib/deneme/veliKurumKarne';

// ============================================================================
// Aşama 56: Veli Karnesi, Öncelikli Konu Karnesi, Kurum Özeti (ekran)
// Hesaplar lib/deneme/veliKurumKarne.ts'te; PDF'ler karneModel.ts'te.
// ============================================================================

const tableCls = 'w-full text-left text-xs text-fg-2';
const theadCls = 'bg-surface-2/60 uppercase tracking-wider text-muted border-b border-line';
const chipFor = (rate: number) => `ui-chip ui-chip-${LEVEL_INFO[levelOf(rate)].tone}`;
const signed = (v: number | null) => (v === null || !Number.isFinite(v) ? '—' : Math.abs(v) < 0.005 ? '0' : `${v > 0 ? '+' : '−'}${fmtScore(Math.abs(v))}`);
const TIER_CLS: Record<PriorityTier, { box: string; head: string; dot: string }> = {
  1: { box: 'border-danger/30', head: 'bg-danger-soft text-danger-fg', dot: 'bg-danger' },
  2: { box: 'border-warning/30', head: 'bg-warning-soft text-warning-fg', dot: 'bg-warning' },
  3: { box: 'border-info/30', head: 'bg-info-soft text-info-fg', dot: 'bg-info' },
};
const rgbCss = (c: [number, number, number]) => `rgb(${c[0]} ${c[1]} ${c[2]})`;

const Hero: React.FC<{ eyebrow: string; title: string; sub: string; chips: string[]; circleLabel: string; circleValue: string; circleSub?: string; side: Array<[string, string]> }> = ({
  eyebrow,
  title,
  sub,
  chips,
  circleLabel,
  circleValue,
  circleSub,
  side,
}) => (
  <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-700 via-brand to-sky-600 text-white shadow-lg">
    <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10" aria-hidden />
    <div className="absolute -bottom-20 right-24 h-44 w-44 rounded-full bg-white/5" aria-hidden />
    <div className="relative grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/70">{eyebrow}</p>
        <h3 className="mt-1 text-xl sm:text-2xl font-extrabold leading-tight truncate">{title}</h3>
        <p className="text-sm text-white/85">{sub}</p>
        <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
          {chips.filter(Boolean).map((c) => (
            <span key={c} className="rounded-full bg-white/15 px-2.5 py-1 font-semibold">
              {c}
            </span>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex h-28 w-28 flex-col items-center justify-center rounded-full bg-white text-brand-fg shadow-xl ring-4 ring-white/30">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted">{circleLabel}</span>
          <span className="text-2xl font-black tabular-nums leading-none mt-0.5">{circleValue}</span>
          {circleSub && <span className="text-[10px] text-muted mt-0.5">{circleSub}</span>}
        </div>
        <div className="grid gap-1.5 text-xs">
          {side.map(([k, v]) => (
            <div key={k} className="rounded-xl bg-white/15 px-3 py-1.5">
              <p className="text-white/70 text-[10px] uppercase tracking-wider">{k}</p>
              <p className="font-bold tabular-nums">{v}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

// ============================================================================ Veli Karnesi
export const VeliKarneView: React.FC<{
  data: VeliKarneData | null;
  studentName: string;
  className: string;
  note: string;
  onNote?: (v: string) => void;
  teacherName?: string;
}> = ({ data: d, studentName, className, note, onNote, teacherName }) => {
  if (!d) return <p className="text-sm text-muted">Seçilen kapsamda deneme sonucu yok.</p>;
  const side: Array<[string, string]> = [
    ['Sınıf sırası', d.rank ? `${d.rank.cls} / ${d.rank.clsCount}` : '—'],
    ['Okul sırası', d.rank ? `${d.rank.overall} / ${d.rank.overallCount}` : '—'],
  ];
  if (d.lgs) side.push([`LGS ${d.lgs.year} dilimi`, d.lgs.text]);
  const chart = d.trend.map((t) => ({ name: examShort(t.exam), Puanı: t.score, 'Sınıf ort.': t.clsAvg, ...(d.target !== null ? { Hedef: d.target } : {}) }));
  return (
    <div className="space-y-4" id="veli-karnesi">
      <div className="flex items-start gap-2 rounded-xl bg-info-soft px-3 py-2 text-[11px] text-info-fg">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>
          Veliye gidecek <b>tek sayfalık</b> karne: teknik tablo yok, sade dil. Öğretmen notunu aşağıya yazın; PDF, e-posta ve WhatsApp ile paylaşımda karneye eklenir (not kaydedilmez, yalnızca bu karneye yazılır).
        </span>
      </div>
      <Hero
        eyebrow="Veli bilgilendirme karnesi"
        title={studentName}
        sub={className}
        chips={[d.lastExam.name, dateTr(d.lastExam.examDate)]}
        circleLabel="Son puan"
        circleValue={fmtScore(d.last.score)}
        circleSub="/ 500"
        side={side}
      />
      <div className="rounded-2xl border border-info/25 bg-info-soft/50 p-4">
        <p className="flex items-center gap-1.5 text-sm font-bold text-info-fg">
          <Sparkles className="w-4 h-4" /> Kısaca
        </p>
        <p className="mt-1 text-sm text-fg leading-relaxed">{d.sentence}</p>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
          {d.change !== null && (
            <span className={cx('ui-chip', d.change > 0 ? 'ui-chip-success' : d.change < 0 ? 'ui-chip-danger' : 'ui-chip-neutral')}>
              {d.change > 0 ? <TrendingUp className="w-3 h-3" /> : d.change < 0 ? <TrendingDown className="w-3 h-3" /> : null} Önceki denemeye göre {signed(d.change)}
            </span>
          )}
          {d.exams.length > 1 && <span className="ui-chip ui-chip-neutral">{d.exams.length} deneme ortalaması {fmtScore(d.avgScore)}</span>}
          {d.clsAvg !== null && <span className="ui-chip ui-chip-neutral">Sınıf ortalaması {fmtScore(d.clsAvg)}</span>}
          {d.kurumAvg !== null && <span className="ui-chip ui-chip-neutral">Okul ortalaması {fmtScore(d.kurumAvg)}</span>}
          {d.target !== null && (
            <span className="ui-chip ui-chip-brand">
              <Target className="w-3 h-3" /> Hedef {fmtScore(d.target)}
            </span>
          )}
        </div>
      </div>
      <div className="rounded-2xl border border-line bg-surface p-3">
        <p className="text-sm font-semibold text-fg">Son {d.trend.length} denemedeki puanı</p>
        <div className="h-52 mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chart} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line, #e2e8f0)" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
              <Tooltip formatter={(v: any) => fmtScore(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="Puanı" stroke="#4f46e5" strokeWidth={2.6} dot={{ r: 4 }} activeDot={{ r: 6 }} connectNulls />
              <Line type="monotone" dataKey="Sınıf ort." stroke="#94a3b8" strokeWidth={1.6} strokeDasharray="5 4" dot={false} connectNulls />
              {d.target !== null && <Line type="monotone" dataKey="Hedef" stroke="#dc2626" strokeWidth={1.4} strokeDasharray="2 4" dot={false} />}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-success/30 bg-surface overflow-hidden">
          <p className="flex items-center gap-1.5 bg-success-soft px-3 py-2 text-sm font-bold text-success-fg">
            <CheckCircle2 className="w-4 h-4" /> Güçlü olduğu konular
          </p>
          {d.strong.length === 0 ? (
            <p className="px-3 py-3 text-xs text-muted">Henüz yeterli soru sorulmadı; sonraki denemelerle belirginleşecek.</p>
          ) : (
            <ul className="divide-y divide-line">
              {d.strong.map((t, i) => (
                <li key={i} className="flex items-start gap-2 px-3 py-2 text-sm">
                  <span className="ui-chip ui-chip-neutral shrink-0">{t.subject.short}</span>
                  <span className="min-w-0 flex-1 text-fg">
                    {t.name}
                    <span className="block text-[11px] text-muted">{t.hint}</span>
                  </span>
                  <span className={cx(chipFor(t.rate), 'shrink-0')}>%{t.rate}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-2xl border border-warning/30 bg-surface overflow-hidden">
          <p className="flex items-center gap-1.5 bg-warning-soft px-3 py-2 text-sm font-bold text-warning-fg">
            <Lightbulb className="w-4 h-4" /> Birlikte çalışılması gereken konular
          </p>
          {d.improve.length === 0 ? (
            <p className="px-3 py-3 text-xs text-muted">Belirgin bir eksik konu görünmüyor.</p>
          ) : (
            <ul className="divide-y divide-line">
              {d.improve.map((t, i) => (
                <li key={i} className="flex items-start gap-2 px-3 py-2 text-sm">
                  <span className="ui-chip ui-chip-neutral shrink-0">{t.subject.short}</span>
                  <span className="min-w-0 flex-1 text-fg">
                    {t.name}
                    <span className="block text-[11px] text-muted">{t.hint}</span>
                  </span>
                  <span className={cx(chipFor(t.rate), 'shrink-0')}>%{t.rate}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="rounded-2xl border border-line bg-surface p-3">
        <label className="flex items-center gap-1.5 text-sm font-bold text-fg" htmlFor="veli-not">
          <MessageSquareText className="w-4 h-4 text-brand-fg" /> Öğretmenin notu{teacherName ? ` (${teacherName})` : ''}
        </label>
        {onNote ? (
          <textarea
            id="veli-not"
            className="ui-input mt-2 min-h-24 text-sm"
            maxLength={600}
            placeholder="Örn. Matematikte düzenli çalışıyor; Fen'de deney sorularında zorlanıyor. Haftada iki gün birlikte soru çözümü önerilir."
            value={note}
            onChange={(e) => onNote(e.target.value)}
          />
        ) : (
          <p className="mt-1 text-sm text-fg-2 whitespace-pre-line">{note || '—'}</p>
        )}
        <p className="mt-1 text-[11px] text-muted">{note.length}/600 · Boş bırakılırsa PDF'te elle yazılabilecek boş satırlar çıkar.</p>
      </div>
      <div className="rounded-2xl border border-line bg-surface-2/40 p-3 text-xs text-fg-2">
        <p className="flex items-center gap-1.5 font-bold text-fg">
          <Heart className="w-4 h-4 text-danger-fg" /> Evde nasıl destek olabilirsiniz? (karnede yer alır)
        </p>
        <ul className="mt-1 list-disc pl-5 space-y-0.5">
          <li>Her gün aynı saatte, kısa ve düzenli çalışmasını destekleyin; çalışma ortamını sessiz tutun.</li>
          <li>Deneme sonrasında puandan çok yanlış yaptığı sorulara birlikte bakın.</li>
          <li>Uyku ve dinlenme düzenine dikkat edin; başarıları küçük de olsa takdir edin.</li>
        </ul>
      </div>
      {d.lgs && <p className="text-[11px] text-muted">{LGS_PERCENTILE_NOTE}</p>}
    </div>
  );
};

// ============================================================================ Öncelikli Konu Karnesi
export const OncelikKarneView: React.FC<{ pk: PriorityKarne }> = ({ pk }) => {
  const tiers: PriorityTier[] = [1, 2, 3];
  if (!pk.examCount) return <p className="text-sm text-muted">Seçilen kapsamda deneme sonucu yok.</p>;
  const maxGain = Math.max(0.01, ...pk.rows.map((r) => r.gainPoints));
  return (
    <div className="space-y-4" id="oncelik-karnesi">
      <div className="grid gap-2 grid-cols-1 sm:grid-cols-4">
        {tiers.map((t) => (
          <div key={t} className={cx('rounded-xl border px-3 py-2', TIER_CLS[t].box, TIER_CLS[t].head)}>
            <p className="text-[11px] font-bold uppercase tracking-wider opacity-80">{TIER_INFO[t].label}</p>
            <p className="text-2xl font-black tabular-nums leading-tight">{pk.tiers[t].count} konu</p>
            <p className="text-[11px] opacity-90">
              düzelirse <b>+{fmtNet(pk.tiers[t].gainNet)} net</b> · +{fmtScore(pk.tiers[t].gainPoints)} puan
            </p>
          </div>
        ))}
        <div className="rounded-xl border border-success/30 bg-success-soft px-3 py-2 text-success-fg">
          <p className="text-[11px] font-bold uppercase tracking-wider opacity-80">Toplam kazanılabilecek</p>
          <p className="text-2xl font-black tabular-nums leading-tight">+{fmtNet(pk.totalNet)} net</p>
          <p className="text-[11px] opacity-90">deneme başına yaklaşık +{fmtScore(pk.totalPoints)} puan</p>
        </div>
      </div>
      <div className="flex items-start gap-2 rounded-xl bg-info-soft px-3 py-2 text-[11px] text-info-fg">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>
          <b>Öncelik nasıl belirlenir?</b> Her konunun deneme başına kaybettirdiği net hesaplanır (yanlış: 1 + 1/3 net, boş: 1 net) ve ders katsayısıyla puana çevrilir. Konular büyükten küçüğe dizilir: toplam kaybın ilk yarısı <b>1. öncelik</b>, sonraki %30'u{' '}
          <b>2. öncelik</b>, kalanı <b>3. öncelik</b>. "+X net": konu tamamen öğrenilirse bir denemede kazanılacak yaklaşık net. Kazanılmış konular listeye girmez.
        </span>
      </div>
      {!pk.rows.length && <p className="text-sm text-success-fg">Seçilen denemelerde puan kaybettiren eksik konu yok. Tebrikler!</p>}
      {tiers.map((t) => {
        const rows = pk.rows.filter((r) => r.tier === t);
        if (!rows.length) return null;
        return (
          <div key={t} className={cx('rounded-2xl border bg-surface overflow-hidden', TIER_CLS[t].box)}>
            <div className={cx('flex flex-wrap items-center gap-2 px-3 py-2', TIER_CLS[t].head)}>
              <span className="text-sm font-black">{TIER_INFO[t].label}</span>
              <span className="text-xs font-semibold">{rows.length} konu</span>
              <span className="text-[11px] opacity-90">{TIER_INFO[t].desc}</span>
              <span className="ml-auto text-xs font-bold tabular-nums">
                +{fmtNet(pk.tiers[t].gainNet)} net · +{fmtScore(pk.tiers[t].gainPoints)} puan
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className={tableCls}>
                <thead className="text-muted border-b border-line">
                  <tr>
                    <th className="px-3 py-1.5 font-semibold w-8">#</th>
                    <th className="px-2 py-1.5 font-semibold">Ders</th>
                    <th className="px-2 py-1.5 font-semibold">Konu / kazanım</th>
                    <th className="px-2 py-1.5 font-semibold text-center">Başarı</th>
                    <th className="px-2 py-1.5 font-semibold text-center">Soru / deneme</th>
                    <th className="px-2 py-1.5 font-semibold min-w-44">Düzelirse (deneme başına)</th>
                    <th className="px-3 py-1.5 font-semibold">Ne yapmalı?</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((r, i) => {
                    const rate = r.row.lastRate ?? r.row.rate;
                    return (
                      <tr key={r.row.key + r.subject.key} className="align-top hover:bg-surface-2/30">
                        <td className="px-3 py-1.5 font-bold text-fg tabular-nums">{i + 1}</td>
                        <td className="px-2 py-1.5 font-semibold text-fg whitespace-nowrap">{r.subject.short}</td>
                        <td className="px-2 py-1.5 text-fg">{r.row.label}</td>
                        <td className="px-2 py-1.5 text-center">
                          <span className={chipFor(rate)}>%{rate}</span>
                        </td>
                        <td className="px-2 py-1.5 text-center tabular-nums">{fmtNet(r.perExamQuestions)}</td>
                        <td className="px-2 py-1.5">
                          <div className="flex items-center gap-2">
                            <div className="h-2 flex-1 rounded-full bg-surface-2 overflow-hidden">
                              <div className={cx('h-full rounded-full', TIER_CLS[t].dot)} style={{ width: `${Math.max(4, (r.gainPoints / maxGain) * 100)}%` }} />
                            </div>
                            <span className="tabular-nums font-bold text-fg whitespace-nowrap">+{fmtNet(r.gainNet)} net</span>
                          </div>
                          <span className="text-[10px] text-muted">≈ +{fmtScore(r.gainPoints)} puan · toplam kaybın %{String(r.share).replace('.', ',')} kadarı</span>
                        </td>
                        <td className="px-3 py-1.5 text-[11px] text-fg-2 min-w-48">{priorityAdvice(r)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ============================================================================ Kurum Özeti
export const KurumOzetView: React.FC<{ k: KurumOzet | null; scopeLabel: string }> = ({ k, scopeLabel }) => {
  if (!k) return <p className="text-sm text-muted">Seçilen denemelerde sonuç yok.</p>;
  const s = k.summary;
  const chart = k.perExam.map((p) => ({ name: examShort(p.exam), 'Kurum ort.': p.avgScore, 'En yüksek': p.maxScore }));
  const withBands = k.perExam.filter((p) => p.bands);
  return (
    <div className="space-y-4" id="kurum-ozeti">
      <Hero
        eyebrow="Kurum özeti"
        title="Deneme sonuçları özeti"
        sub={`${scopeLabel} · ${k.exams.length} deneme · ${dateRange(k.exams)}`}
        chips={[`${s.students} kayıtlı öğrenci`, `${s.participants} öğrenci denemeye girdi`, s.participation !== null ? `Katılım %${s.participation}` : '']}
        circleLabel="Ort. puan"
        circleValue={fmtScore(s.avgScore)}
        circleSub={`son ${fmtScore(s.lastAvg)}`}
        side={[
          ['İlk → son deneme', `${signed(s.change)} puan`],
          ['Son denemede ilk %10', s.lastTop10 !== null ? `${s.lastTop10} öğrenci` : '—'],
          ['Son denemede ilk %1', s.lastTop1 !== null ? `${s.lastTop1} öğrenci` : '—'],
        ]}
      />
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-line bg-surface p-3">
          <p className="text-sm font-semibold text-fg">Kurum ortalaması ve en yüksek puan</p>
          <div className="h-56 mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line, #e2e8f0)" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
                <Tooltip formatter={(v: any) => fmtScore(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="Kurum ort." stroke="#4f46e5" strokeWidth={2.4} dot={{ r: 3.5 }} connectNulls />
                <Line type="monotone" dataKey="En yüksek" stroke="#109669" strokeWidth={1.6} strokeDasharray="5 4" dot={{ r: 2.5 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-3">
          <p className="text-sm font-semibold text-fg">LGS yüzdelik dilim dağılımı{k.lgsYear ? ` (${k.lgsYear} LGS'ye göre, tahmini)` : ''}</p>
          {!withBands.length ? (
            <p className="mt-2 text-xs text-muted">Seçilen denemelerde LGS türünde deneme yok.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {withBands.map((p) => {
                const total = p.bands!.reduce((a, b) => a + b, 0);
                return (
                  <div key={p.exam.id}>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-fg truncate">{p.exam.name}</span>
                      <span className="text-muted tabular-nums">ilk %10: {p.bands![0] + p.bands![1] + p.bands![2]}</span>
                    </div>
                    <div className="mt-0.5 flex h-4 w-full overflow-hidden rounded-full bg-surface-2">
                      {LGS_BANDS.map((b, i) => {
                        const n = p.bands![i];
                        if (!n || !total) return null;
                        const w = (n / total) * 100;
                        return (
                          <span key={b.label} className="flex h-full items-center justify-center text-[10px] font-bold text-white" style={{ width: `${w}%`, background: rgbCss(b.rgb) }} title={`${b.label}: ${n} öğrenci`}>
                            {w >= 7 ? n : ''}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              <div className="flex flex-wrap gap-3 pt-1 text-[11px] text-muted">
                {LGS_BANDS.map((b) => (
                  <span key={b.label} className="inline-flex items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: rgbCss(b.rgb) }} /> {b.label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <Panel title="Deneme deneme kurum sonuçları" icon={Building2} tone="brand" padded={false}>
        <div className="overflow-x-auto">
          <table className={tableCls}>
            <thead className={theadCls}>
              <tr>
                <th className="px-3 py-2 font-semibold">Deneme</th>
                <th className="px-2 py-2 font-semibold text-center">Katılım</th>
                {k.subjects.map((x) => (
                  <th key={x.key} className="px-2 py-2 font-semibold text-center" title={x.name}>
                    {x.short}
                  </th>
                ))}
                <th className="px-2 py-2 font-semibold text-center">Top. net</th>
                <th className="px-2 py-2 font-semibold text-center">Ort. puan</th>
                <th className="px-2 py-2 font-semibold text-center">En yüksek</th>
                <th className="px-3 py-2 font-semibold">En iyi sınıf</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {k.perExam.map((p) => (
                <tr key={p.exam.id} className="hover:bg-surface-2/30">
                  <td className="px-3 py-1.5">
                    <p className="font-semibold text-fg">{p.exam.name}</p>
                    <p className="text-[11px] text-muted">{dateTr(p.exam.examDate)}</p>
                  </td>
                  <td className="px-2 py-1.5 text-center tabular-nums whitespace-nowrap">
                    {p.n}
                    {p.participation !== null && <span className={cx('ml-1 text-[11px]', p.participation < 70 ? 'text-warning-fg font-semibold' : 'text-muted')}>%{p.participation}</span>}
                  </td>
                  {k.subjects.map((x) => (
                    <td key={x.key} className="px-2 py-1.5 text-center tabular-nums">
                      {fmtNet(p.avgNet[x.key])}
                    </td>
                  ))}
                  <td className="px-2 py-1.5 text-center tabular-nums font-semibold text-fg">{fmtNet(p.avgTotalNet)}</td>
                  <td className="px-2 py-1.5 text-center tabular-nums font-bold text-fg">{fmtScore(p.avgScore)}</td>
                  <td className="px-2 py-1.5 text-center tabular-nums text-success-fg font-semibold">{fmtScore(p.maxScore)}</td>
                  <td className="px-3 py-1.5">
                    {p.topClass ? (
                      <span className="ui-chip ui-chip-success">
                        <Trophy className="w-3 h-3" /> {p.topClass.name} · {fmtScore(p.topClass.avgScore)}
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

      <Panel title="Sınıfların sırası" description="Seçilen denemelerdeki sınıf ortalamalarının ortalamasına göre" icon={Users} tone="success" padded={false}>
        <div className="overflow-x-auto">
          <table className={tableCls}>
            <thead className={theadCls}>
              <tr>
                <th className="px-3 py-2 font-semibold text-center w-12">Sıra</th>
                <th className="px-3 py-2 font-semibold">Sınıf</th>
                <th className="px-2 py-2 font-semibold text-center">Öğrenci</th>
                <th className="px-2 py-2 font-semibold text-center">Katılım</th>
                <th className="px-2 py-2 font-semibold min-w-40">Ortalama puan</th>
                <th className="px-2 py-2 font-semibold text-center">İlk → son</th>
                <th className="px-2 py-2 font-semibold text-center">Ort. sıra</th>
                <th className="px-3 py-2 font-semibold text-center">Son denemede ilk %1</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(() => {
                const scores = k.classes.map((c) => c.avgScore).filter((v): v is number => v !== null);
                const min = scores.length ? Math.min(...scores) : 0;
                const max = scores.length ? Math.max(...scores) : 1;
                return k.classes.map((c) => (
                  <tr key={c.classId} className="hover:bg-surface-2/30">
                    <td className="px-3 py-1.5 text-center">
                      {c.rank ? (
                        <span
                          className={cx(
                            'inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-black tabular-nums',
                            c.rank === 1 ? 'bg-amber-400 text-white' : c.rank === 2 ? 'bg-slate-400 text-white' : c.rank === 3 ? 'bg-orange-400 text-white' : 'bg-surface-2 text-fg-2'
                          )}
                        >
                          {c.rank}
                        </span>
                      ) : (
                        <span className="text-subtle">—</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 font-semibold text-fg">{c.name}</td>
                    <td className="px-2 py-1.5 text-center tabular-nums">{c.students}</td>
                    <td className={cx('px-2 py-1.5 text-center tabular-nums', c.participation !== null && c.participation < 70 ? 'text-warning-fg font-bold' : '')}>
                      {c.participation !== null ? `%${c.participation}` : '—'}
                    </td>
                    <td className="px-2 py-1.5">
                      {c.avgScore !== null ? (
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 rounded-full bg-surface-2 overflow-hidden">
                            <div className="h-full rounded-full bg-brand" style={{ width: `${max > min ? 15 + ((c.avgScore - min) / (max - min)) * 85 : 100}%` }} />
                          </div>
                          <span className="tabular-nums font-bold text-fg w-12 text-right">{fmtScore(c.avgScore)}</span>
                        </div>
                      ) : (
                        <span className="text-subtle">sonuç yok</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      {c.change === null ? (
                        <span className="text-subtle">—</span>
                      ) : (
                        <span className={cx('inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums', c.change > 0 ? 'bg-success-soft text-success-fg' : c.change < 0 ? 'bg-danger-soft text-danger-fg' : 'bg-surface-2 text-muted')}>
                          {c.change > 0 ? <TrendingUp className="w-3 h-3" /> : c.change < 0 ? <TrendingDown className="w-3 h-3" /> : null}
                          {signed(c.change)}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-center tabular-nums">{c.avgRank !== null ? fmtNet(c.avgRank) : '—'}</td>
                    <td className="px-3 py-1.5 text-center tabular-nums">{c.top1 ? <span className="ui-chip ui-chip-success">{c.top1}</span> : <span className="text-subtle">—</span>}</td>
                  </tr>
                ));
              })()}
            </tbody>
          </table>
        </div>
      </Panel>
      <p className="text-[11px] text-muted">
        Katılım: sonucu olan öğrenci / kayıtlı öğrenci (%70'in altı turuncu). {LGS_PERCENTILE_NOTE}
      </p>
    </div>
  );
};
