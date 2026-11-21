import React, { useMemo, useState } from 'react';
import { Award, CheckCircle2, ChevronDown, ChevronRight, CircleSlash, Target, XCircle } from 'lucide-react';
import { cx } from '../ui/kit';
import type { DenemeExam, DenemeResult } from '../../services/denemeService';
import { LEVEL_INFO, classAverages, levelOf, targetGap, topicAnalysis, type SubjectTopics } from '../../lib/deneme/analiz';
import { examScoring, fmtNet, fmtScore, puanAdi, round2, tamOturum } from '../../lib/deneme/lgs';
import { HEAT_MAX_EXAMS, dateRange, dateTr, denemeEtiketleri, gelisimPanoData, isiNoktaData, usedSubjects } from '../../lib/deneme/karneModel';
import { averageKarneData, type KarneData } from '../../lib/deneme/karneOrtalama';
import { examKarneData, percentile } from '../../lib/deneme/karneDetay';
import { LGS_PERCENTILE_NOTE, isLgsExam, lgsPercentiles } from '../../lib/deneme/lgsYuzdelik';
import { denemeKarneAdi } from '../../lib/deneme/karneAdi'; // Aşama 135
import { AveragesPanel } from './KarneIleri';
import { GelisimPano, IsiNokta, KazanimKartlari } from './KarneB'; // Aşama 141
import { birlesikKazanim, type BirlesikDers } from '../../lib/deneme/kazanimBirlesik';
// Aşama 272: bütün karneler birleştirilmiş karnenin tasarım dilini ortak dosyadan kullanır
import {
  DersAd,
  DersBaslik,
  Fark,
  KAltKart,
  KBolum,
  KCizgi,
  KGrafikKart,
  KKutu,
  KSutun,
  KT,
  KarneBant,
  SeviyeCubuk,
  SeviyeLejant,
  SeviyeNokta,
  Yuzde,
  LV_TEXT,
  dersRgb,
  tint,
  useVurgu,
  GRI,
  type RGB,
} from './KarneTasarim';

// ============================================================================
// Karne görünümleri (Aşama 47): öğrenci, sınıf ve sınıflar arası.
// Aynı hesaplar PDF'te de kullanılır (karneModel.ts).
// ============================================================================

/** Ders sütunlarının rengi: denemedeki sıraya göre (birleştirilmiş karneyle aynı) */
const subjRgb = (key: string, subs: Array<{ key: string }>): RGB => dersRgb(key, Math.max(0, subs.findIndex((s) => s.key === key)));
/** Sınıf karşılaştırma renkleri: vurgu renginin açılan tonları */
const sinifRenk = (v: RGB, i: number, n: number): RGB => tint(v, 1 - (0.7 * i) / Math.max(1, n - 1));

export const LevelLegend: React.FC = () => <SeviyeLejant />;

// ----------------------------------------------------------------------------- Konu / kazanım analizi
export const TopicAnalysisView: React.FC<{ analysis: SubjectTopics[] }> = ({ analysis }) => {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  if (!analysis.length) return <p className="text-sm text-muted">Kazanım analizi için veri yok.</p>;
  return (
    <div className="space-y-3">
      <SeviyeLejant />
      {analysis.map((st, si) => (
        <KAltKart key={st.subject.key} renk={dersRgb(st.subject.key, si)}>
          <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
            <DersAd ad={st.subject.name} renk={dersRgb(st.subject.key, si)} className="text-sm font-extrabold" />
            <Yuzde v={st.rate} className="text-sm" />
            <span className="text-xs text-muted tabular-nums">
              D {st.d} · Y {st.y} · B {st.b}
            </span>
          </div>
          <div className="overflow-x-auto border-t border-line">
            <table className={KT.tablo}>
              <thead className={KT.bas}>
                <tr>
                  <th className={KT.th}>Konu / alt kazanım</th>
                  <th className={KT.thc}>Soru</th>
                  <th className={KT.thc}>D</th>
                  <th className={KT.thc}>Y</th>
                  <th className={KT.thc}>B</th>
                  <th className={KT.thc}>Başarı</th>
                  <th className={KT.th}>Öneri</th>
                </tr>
              </thead>
              <tbody className={KT.govde}>
                {st.topics.map((t) => {
                  const k = `${st.subject.key}|${t.key}`;
                  const isOpen = !!open[k];
                  return (
                    <React.Fragment key={k}>
                      <tr className={KT.satir}>
                        <td className={cx(KT.td, 'text-fg')}>
                          <span className="flex items-start gap-1.5">
                            <SeviyeNokta v={t.rate} className="mt-1" />
                            {t.children.length > 0 ? (
                              <button type="button" className="inline-flex cursor-pointer items-start gap-1 text-left" onClick={() => setOpen((o) => ({ ...o, [k]: !isOpen }))} aria-expanded={isOpen}>
                                {isOpen ? <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                                {t.label}
                              </button>
                            ) : (
                              t.label
                            )}
                          </span>
                        </td>
                        <td className={KT.tdc}>{t.questions}</td>
                        <td className={cx(KT.tdc, 'text-success-fg')}>{t.d}</td>
                        <td className={cx(KT.tdc, 'text-danger-fg')}>{t.y}</td>
                        <td className={cx(KT.tdc, 'text-muted')}>{t.b}</td>
                        <td className={KT.tdc}>
                          <Yuzde v={t.rate} />
                        </td>
                        <td className={cx(KT.td, 'text-muted')}>{LEVEL_INFO[levelOf(t.rate)].advice}</td>
                      </tr>
                      {isOpen &&
                        t.children.map((c) => (
                          <tr key={`${k}|${c.key}`} className="bg-surface-2/30">
                            <td className={cx(KT.td, 'pl-8 text-fg-2')}>└ {c.label}</td>
                            <td className={KT.tdc}>{c.questions}</td>
                            <td className={cx(KT.tdc, 'text-success-fg')}>{c.d}</td>
                            <td className={cx(KT.tdc, 'text-danger-fg')}>{c.y}</td>
                            <td className={cx(KT.tdc, 'text-muted')}>{c.b}</td>
                            <td className={KT.tdc}>
                              <Yuzde v={c.rate} />
                            </td>
                            <td className={cx(KT.td, 'text-muted')}>{LEVEL_INFO[levelOf(c.rate)].advice}</td>
                          </tr>
                        ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </KAltKart>
      ))}
    </div>
  );
};

// ----------------------------------------------------------------------------- Aşama 50: tek deneme karnesi
// Başlık bandı, puan ve sıralar, ders tablosu, grafikler, cevap çizelgesi ve konu analizi.
const RateBar: React.FC<{ rate: number; marker?: number | null }> = ({ rate, marker }) => (
  <div className="flex min-w-36 items-center gap-2" aria-label={`Başarı yüzde ${rate}`}>
    <SeviyeCubuk v={rate} kurum={marker} className="flex-1" />
    <Yuzde v={rate} className="w-10 text-right" />
  </div>
);

const Delta: React.FC<{ v: number | null; digits?: 'net' | 'score' }> = ({ v, digits = 'net' }) => (
  <Fark v={v} ok={false} bicim={(n) => (digits === 'score' ? fmtScore(n) : fmtNet(n))} />
);

const markCls = (m: 'D' | 'Y' | 'B') =>
  m === 'D' ? 'bg-success text-white border-success' : m === 'Y' ? 'bg-danger text-white border-danger' : 'bg-surface-2 text-muted border-line';

/** Aşama 51: deneme puanının 2026 / 2025 / 2024 LGS'deki Türkiye geneli yüzdelik karşılığı */
export const LgsPercentileStrip: React.FC<{ exam: DenemeExam; score: number | null }> = ({ exam, score }) => {
  const list = isLgsExam(exam) ? lgsPercentiles(score) : [];
  if (!list.length) return null;
  return (
    <KBolum id="lgs-yuzdelik" baslik="Bu puan geçmiş LGS'lerde Türkiye geneli hangi dilimde?" aciklama={LGS_PERCENTILE_NOTE} sag={<span className="ui-chip ui-chip-neutral tabular-nums">{fmtScore(score)} puan</span>}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {list.map((p) => (
          <KKutu
            key={p.year}
            etiket={
              <>
                <Award className="h-3.5 w-3.5" /> LGS {p.year}
                {p.estimate && <span className="normal-case tracking-normal">(tahmini)</span>}
              </>
            }
            deger={p.text}
            alt={p.below ? 'veri aralığının altında' : 'yüzdelik dilim'}
            ton={p.value <= 1 ? 'success' : p.value <= 10 ? 'info' : undefined}
          />
        ))}
      </div>
    </KBolum>
  );
};

/** Aşama 141: birlesik verilirse "Konu ve kazanım analizi" B tasarımında tek bölüm (bu deneme + seçilen denemelerin toplamı) */
export const ExamKarneCard: React.FC<{ data: KarneData; studentName: string; className?: string; birlesik?: { dersler: BirlesikDers[]; n: number } }> = ({ data, studentName, className, birlesik }) => {
  const { exam, subjects, topics, rank } = data;
  // Aşama 92: ortalama karnede D / Y / B ortalamadır (ondalıklı)
  const avg = data.avg;
  const N = (v: number) => (avg ? fmtNet(v) : v);
  const pct = percentile(rank);
  // Aşama 141: kurum ortalamaları karneden kalktı (sınıf ortalaması, kurum sırası ve yüzdelik kalır)
  const clsTotal = subjects.reduce((a, s) => a + (s.clsAvgNet ?? 0), 0);
  const hasCls = subjects.some((s) => s.clsAvgNet !== null);
  const ranked = topics.filter((t) => t.konu !== 'Konusu belirtilmemiş').slice().sort((a, b) => b.rate - a.rate || b.questions.length - a.questions.length);
  const strong = ranked.filter((t) => t.rate >= 70).slice(0, 4);
  const weak = ranked.filter((t) => t.rate < 50).slice(-5).reverse();
  const bySubject = subjects.map((s) => ({ s, list: topics.filter((t) => t.subject.key === s.subject.key) })).filter((x) => x.list.length);
  const subs = subjects.map((s) => s.subject);
  const renkOf = (key: string) => subjRgb(key, subs);
  // Aşama 272: başlık bandı ortak (kurum logosunun renkleri, PDF ile aynı)
  const yan: Array<[string, string]> = [
    [avg ? 'Ort. sınıf sırası' : 'Sınıf sırası', rank ? `${rank.cls} / ${rank.clsCount}` : '—'],
    [avg ? 'Ort. kurum sırası' : 'Kurum sırası', rank ? `${rank.overall} / ${rank.overallCount}` : '—'],
  ];
  if (pct !== null) yan.push(['Kurum içi yüzdelik', `%${pct}`]);

  return (
    <div className="space-y-4" id="exam-karne">
      <KarneBant
        ust={avg ? 'Ortalama deneme karnesi' : denemeKarneAdi(exam)}
        baslik={studentName}
        alt={className || data.result.className || 'Sınıf bilgisi yok'}
        cipler={
          avg
            ? [avg.scopeLabel, `${avg.n} denemenin ortalaması`, avg.range]
            : [exam.name, dateTr(exam.examDate), exam.publisher, data.result.booklet ? `${data.result.booklet} kitapçığı` : '']
        }
        daire={{ etiket: avg ? `Ort. ${puanAdi(exam.grade).toLocaleLowerCase('tr-TR')}` : puanAdi(exam.grade), deger: fmtScore(data.score), alt: '/ 500' }}
        yan={yan}
      />

      {/* Özet kutuları */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        <KKutu vurgu etiket={avg ? 'Ort. toplam net' : 'Toplam net'} deger={fmtNet(data.totalNet)} alt={hasCls ? <>Sınıf ort. {fmtNet(round2(clsTotal))}</> : `${data.totals.count} sorudan`} />
        <KKutu
          ton="success"
          etiket={
            <>
              <CheckCircle2 className="h-3.5 w-3.5" /> {avg ? 'Ort. doğru' : 'Doğru'}
            </>
          }
          deger={N(data.totals.d)}
          alt={avg ? `deneme başına ${data.totals.count} sorudan` : `${data.totals.count} sorudan`}
        />
        <KKutu
          ton="danger"
          etiket={
            <>
              <XCircle className="h-3.5 w-3.5" /> {avg ? 'Ort. yanlış' : 'Yanlış'}
            </>
          }
          deger={N(data.totals.y)}
          alt="3 yanlış 1 doğruyu götürür"
        />
        <KKutu
          etiket={
            <>
              <CircleSlash className="h-3.5 w-3.5" /> {avg ? 'Ort. boş' : 'Boş'}
            </>
          }
          deger={N(data.totals.b)}
          alt="işaretlenmeyen"
        />
        <KKutu className="col-span-2 lg:col-span-1" etiket="Sınıf ortalamasına göre" deger={<Delta v={data.score !== null && data.clsAvgScore !== null ? data.score - data.clsAvgScore : null} digits="score" />}>
          <p className="text-xs text-muted">Sınıf ort. {fmtScore(data.clsAvgScore)}</p>
          {data.kurumMaxScore !== null && <p className="text-xs text-muted">En yüksek {fmtScore(data.kurumMaxScore)}</p>}
        </KKutu>
      </div>

      {/* Aşama 51: geçmiş LGS yıllarına göre Türkiye geneli yüzdelik dilim */}
      <LgsPercentileStrip exam={exam} score={data.score} />

      {/* Ders tablosu */}
      <KBolum tablo baslik="Ders sonuçları" aciklama={avg ? `${avg.n} denemenin ortalaması; sınıf ortalamasıyla` : 'Öğrencinin neti, sınıf ortalamasıyla'}>
        <table className={KT.tablo}>
          <thead className={KT.bas}>
            <tr>
              <th className={KT.th}>Ders</th>
              <th className={KT.thc}>Soru</th>
              <th className={KT.thc}>D</th>
              <th className={KT.thc}>Y</th>
              <th className={KT.thc}>B</th>
              <th className={KT.thc}>Net</th>
              <th className={KT.th}>Başarı</th>
              {hasCls && <th className={KT.thc}>Sınıf ort.</th>}
              {hasCls && <th className={KT.thc}>Sınıfa göre</th>}
            </tr>
          </thead>
          <tbody className={KT.govde}>
            {subjects.map((s) => (
              <tr key={s.subject.key} className={KT.satir}>
                <td className={cx(KT.td, 'py-2')}>
                  <DersAd ad={s.subject.name} renk={renkOf(s.subject.key)} />
                </td>
                <td className={KT.tdc}>{s.count}</td>
                <td className={cx(KT.tdc, 'font-semibold text-success-fg')}>{N(s.d)}</td>
                <td className={cx(KT.tdc, 'font-semibold text-danger-fg')}>{N(s.y)}</td>
                <td className={cx(KT.tdc, 'text-muted')}>{N(s.b)}</td>
                <td className={cx(KT.tdc, 'font-black text-fg')}>{fmtNet(s.net)}</td>
                <td className={KT.td}>
                  <RateBar rate={s.rate} />
                </td>
                {hasCls && <td className={KT.tdc}>{fmtNet(s.clsAvgNet)}</td>}
                {hasCls && (
                  <td className={KT.tdc}>
                    <Delta v={s.clsAvgNet !== null ? s.net - s.clsAvgNet : null} />
                  </td>
                )}
              </tr>
            ))}
            <tr className={KT.toplam}>
              <td className={cx(KT.td, 'py-2')}>Toplam</td>
              <td className={KT.tdc}>{data.totals.count}</td>
              <td className={cx(KT.tdc, 'text-success-fg')}>{N(data.totals.d)}</td>
              <td className={cx(KT.tdc, 'text-danger-fg')}>{N(data.totals.y)}</td>
              <td className={cx(KT.tdc, 'text-muted')}>{N(data.totals.b)}</td>
              <td className={KT.tdc}>{fmtNet(data.totalNet)}</td>
              <td className={KT.td}>
                <RateBar rate={data.totals.count ? Math.round((data.totals.d / data.totals.count) * 100) : 0} />
              </td>
              {hasCls && <td className={KT.tdc}>{fmtNet(round2(clsTotal))}</td>}
              {hasCls && (
                <td className={KT.tdc}>
                  <Delta v={data.totalNet !== null ? data.totalNet - clsTotal : null} />
                </td>
              )}
            </tr>
          </tbody>
        </table>
      </KBolum>

      {/* Grafikler (Aşama 272: birleştirilmiş karnenin SVG grafik dili; ders renkleri) */}
      <div className="grid gap-3 lg:grid-cols-2">
        <KGrafikKart baslik={hasCls ? 'Ders netleri' : 'Ders netleri'} aciklama={hasCls ? 'renkli sütun öğrenci · gri sütun sınıf ortalaması' : undefined}>
          <KSutun
            etiketler={subjects.map((s) => ({ ust: s.subject.short }))}
            seriler={[
              { ad: 'Öğrenci', degerler: subjects.map((s) => s.net), renkler: subjects.map((s) => renkOf(s.subject.key)) },
              ...(hasCls ? [{ ad: 'Sınıf', degerler: subjects.map((s) => s.clsAvgNet), renk: GRI }] : []),
            ]}
            bicim={(v) => fmtNet(v)}
          />
        </KGrafikKart>
        <KGrafikKart baslik="Ders başarı yüzdesi" aciklama="çubuk başarıyı, renk seviyeyi gösterir">
          <ul className="mt-2 space-y-2.5">
            {subjects.map((s) => (
              <li key={s.subject.key} className="grid grid-cols-[7.5rem_1fr_2.75rem] items-center gap-2 text-xs">
                <DersAd ad={s.subject.short} renk={renkOf(s.subject.key)} className="truncate" />
                <SeviyeCubuk v={s.rate} />
                <Yuzde v={s.rate} className="text-right" />
              </li>
            ))}
          </ul>
          <div className="mt-3">
            <SeviyeLejant />
          </div>
        </KGrafikKart>
      </div>

      {/* Güçlü / geliştirilecek konular */}
      {(strong.length > 0 || weak.length > 0) && (
        <div className="grid gap-3 md:grid-cols-2">
          <KBolum
            baslik={
              <>
                <Award className="h-4 w-4 text-success-fg" /> Güçlü olduğun konular
              </>
            }
          >
            {strong.length ? (
              <ul className="divide-y divide-line text-xs text-fg-2">
                {strong.map((t) => (
                  <li key={`${t.subject.key}-${t.konu}`} className="flex items-center justify-between gap-2 py-1.5">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <SeviyeNokta v={t.rate} />
                      <DersAd ad={t.subject.short} renk={renkOf(t.subject.key)} />
                      <span className="truncate">{t.konu}</span>
                    </span>
                    <Yuzde v={t.rate} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted">{avg ? 'Bu denemelerde' : 'Bu denemede'} %70 ve üstü başarılı konu yok.</p>
            )}
          </KBolum>
          <KBolum
            baslik={
              <>
                <Target className="h-4 w-4 text-danger-fg" /> Öncelikle çalışman gereken konular
              </>
            }
          >
            {weak.length ? (
              <ul className="divide-y divide-line text-xs text-fg-2">
                {weak.map((t) => (
                  <li key={`${t.subject.key}-${t.konu}`} className="flex items-center justify-between gap-2 py-1.5">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <SeviyeNokta v={t.rate} />
                      <DersAd ad={t.subject.short} renk={renkOf(t.subject.key)} />
                      <span className="truncate">{t.konu}</span>
                    </span>
                    <Yuzde v={t.rate} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted">Başarısı %50'nin altında konu yok. Tebrikler!</p>
            )}
          </KBolum>
        </div>
      )}

      {/* Cevap çizelgesi (ortalama karnede yok) */}
      {!avg && (
        <KBolum baslik="Cevap çizelgesi" aciklama="Kutudaki harf öğrencinin cevabı; altındaki küçük harf doğru cevap">
          <div className="flex flex-wrap gap-3 text-xs text-fg-2">
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
                <p className="mb-1.5 text-xs">
                  <DersAd ad={s.subject.name} renk={renkOf(s.subject.key)} />{' '}
                  <span className="text-muted tabular-nums">
                    · D {s.d} · Y {s.y} · B {s.b} · Net {fmtNet(s.net)}
                  </span>
                </p>
                <div className="flex flex-wrap gap-1">
                  {s.answers.map((a) => (
                    <div key={a.no} className="flex w-8 flex-col items-center" title={`${a.no}. soru · cevap ${a.key || '-'}${a.kurumRate !== null ? ` · kurumda doğru oranı %${a.kurumRate}` : ''}`}>
                      <span className="text-3xs text-muted tabular-nums">{a.no}</span>
                      <span className={cx('flex h-7 w-7 items-center justify-center rounded-lg border text-xs font-black', markCls(a.mark))}>{a.key === 'X' ? '✓' : a.given || '·'}</span>
                      <span className={cx('text-3xs font-semibold', a.mark === 'D' ? 'text-transparent' : 'text-fg-2')}>{a.key === 'X' ? 'iptal' : a.key || '-'}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </KBolum>
      )}

      {/* Konu ve kazanım analizi (Aşama 141: birleşik veriyle B tasarımı — iki bölüm tek bölüm) */}
      {birlesik ? (
        <KazanimKartlari dersler={birlesik.dersler} n={birlesik.n} />
      ) : (
        <KBolum baslik="Konu ve kazanım analizi" aciklama={avg ? `${avg.n} denemedeki bütün sorular üzerinden; siyah çizgi kurumun başarısıdır` : 'Siyah çizgi kurumun başarısıdır'}>
          <SeviyeLejant kurum />
          {bySubject.map(({ s, list }) => (
            <KAltKart key={s.subject.key} renk={renkOf(s.subject.key)}>
              <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                <DersAd ad={s.subject.name} renk={renkOf(s.subject.key)} className="text-sm font-extrabold" />
                <Yuzde v={s.rate} className="text-sm" />
              </div>
              <div className="overflow-x-auto border-t border-line">
                <table className={KT.tablo}>
                  <thead className={KT.bas}>
                    <tr>
                      <th className={KT.th}>Konu / kazanım</th>
                      <th className={KT.thc}>Sorular</th>
                      <th className={KT.thc}>D/Y/B</th>
                      <th className={KT.th}>Başarı</th>
                      <th className={KT.th}>Öneri</th>
                    </tr>
                  </thead>
                  <tbody className={KT.govde}>
                    {list.map((t) => (
                      <tr key={t.konu} className={KT.satir}>
                        <td className={cx(KT.td, 'text-fg')}>
                          <p className="font-semibold">{t.konu}</p>
                          {t.alt && <p className="text-xs text-muted">{t.alt}</p>}
                        </td>
                        <td className={cx(KT.tdc, 'text-muted')}>{avg ? `${t.questions.length} soru` : t.questions.join(', ')}</td>
                        <td className={cx(KT.tdc, 'whitespace-nowrap')}>
                          <span className="font-semibold text-success-fg">{t.d}</span>/<span className="font-semibold text-danger-fg">{t.y}</span>/<span className="text-muted">{t.b}</span>
                        </td>
                        <td className={KT.td}>
                          <RateBar rate={t.rate} marker={t.kurumRate} />
                        </td>
                        <td className={cx(KT.td, 'text-xs font-semibold')}>
                          <span className={LV_TEXT[levelOf(t.rate)]}>{LEVEL_INFO[levelOf(t.rate)].label}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </KAltKart>
          ))}
        </KBolum>
      )}
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
  /** Aşama 50: ayrıntılı karnesi gösterilen deneme. Aşama 92: boş ya da 'avg' ise kapsamdaki denemelerin ortalaması */
  detailExamId?: string;
  onDetailExamChange?: (id: string) => void;
  /** Aşama 92: ortalama karnenin kapsam adı ("Son 3 deneme") */
  scopeLabel?: string;
}> = ({ exams: allExams, results, target, targetEditor, studentName, className, detailExamId, onDetailExamChange, scopeLabel }) => {
  const rByExam = useMemo(() => new Map(results.map((r) => [r.examId, r])), [results]);
  const exams = allExams.filter((e) => rByExam.has(e.id));
  const subs = usedSubjects(exams);
  const analysis = useMemo(() => topicAnalysis(exams, results, subs), [exams, results, subs]);
  const [localDetail, setLocalDetail] = useState('');
  const detailId = (detailExamId ?? localDetail) || '';
  // Aşama 92: 2 ve daha çok denemede varsayılan karne seçilen denemelerin ortalamasıdır; tek deneme de seçilebilir
  const picked = exams.find((e) => e.id === detailId);
  const useAvg = exams.length >= 2 && !picked;
  const detailExam = picked || exams[exams.length - 1];
  const avgLabel = scopeLabel || 'Seçilen denemeler';
  const detail = useMemo<KarneData | null>(() => {
    if (useAvg) return averageKarneData(exams, results, avgLabel, dateRange(exams));
    const r = detailExam ? rByExam.get(detailExam.id) : undefined;
    return detailExam && r ? examKarneData(detailExam, r) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useAvg, detailExam, rByExam, results, avgLabel, exams.length]);
  // Aşama 141: B tasarımı verileri (PDF ile aynı)
  const birlesik = useMemo(() => ({ dersler: birlesikKazanim(detail, analysis, exams.length), n: exams.length }), [detail, analysis, exams.length]);
  const heatExams = exams.slice(-HEAT_MAX_EXAMS);
  const isi = useMemo(() => (exams.length ? isiNoktaData(heatExams, results, subs) : null), [heatExams.map((e) => e.id).join(), results, subs]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!exams.length) return <p className="text-sm text-muted">Seçilen kapsamda deneme sonucu yok.</p>;
  const last = rByExam.get(exams[exams.length - 1].id)!;
  const pickDetail = (id: string) => (onDetailExamChange ? onDetailExamChange(id) : setLocalDetail(id));
  const scores = exams.map((e) => rByExam.get(e.id)?.score ?? 0);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const gap = targetGap(last.score, target, examScoring(exams[exams.length - 1])); // Aşama 271
  return (
    <div className="space-y-4">
      {detail && (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-56">
              <label className="ui-label" htmlFor="karne-detail-exam">Karne</label>
              <select id="karne-detail-exam" className="ui-input" value={useAvg ? 'avg' : detailExam?.id || ''} onChange={(e) => pickDetail(e.target.value)}>
                {exams.length >= 2 && <option value="avg">{avgLabel}: {exams.length} denemenin ortalaması</option>}
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
            <span className="text-xs text-muted pb-2">
              {useAvg ? 'Karne seçilen denemelerin ortalamasıyla hazırlanır; tek bir denemenin karnesi için listeden deneme seçin.' : 'Aşağıda seçilen denemenin ayrıntılı karnesi, onun altında kapsamdaki denemelerin gelişimi yer alır.'}
            </span>
          </div>
          <ExamKarneCard data={detail} studentName={studentName || detail.result.studentName} className={className} birlesik={birlesik} />
          <div className="flex items-center gap-2 pt-2">
            <span className="h-px flex-1 bg-line" />
            <span className="text-xs font-bold uppercase tracking-wider text-muted">Gelişim ({exams.length} deneme)</span>
            <span className="h-px flex-1 bg-line" />
          </div>
        </>
      )}
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

      {/* Aşama 141: gelişim panosu (B tasarımı) — eski özet kutuları, deneme tablosu ve iki çizgi grafiğinin yerine */}
      <GelisimPano data={gelisimPanoData(exams, rByExam, subs, target, avg)} />

      {/* Aşama 54: seçilen denemelerin ortalaması (Aşama 92: ortalama karne gösterilirken tekrar edilmez) */}
      {!useAvg && <AveragesPanel exams={exams} results={results} />}

      {/* Aşama 54: konu ısı tablosu. Aşama 141: renkli daireler (B tasarımı); konu analizi yukarıdaki karnede tek bölüm */}
      {isi && <IsiNokta data={isi} adlar={heatExams.map((e) => e.name)} fazla={exams.length - heatExams.length} />}
      {!detail && <KazanimKartlari dersler={birlesik.dersler} n={birlesik.n} />}
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
  const etiketler = denemeEtiketleri(exams);
  const byStudent = new Map<string, DenemeResult[]>();
  for (const r of results) {
    if (!byStudent.has(r.studentId)) byStudent.set(r.studentId, []);
    byStudent.get(r.studentId)!.push(r);
  }
  const ranking = Array.from(byStudent.values())
    .map((rs) => {
      const tam = rs.filter(tamOturum); // Aşama 289: eksik oturumlu deneme ortalamaya girmez
      const bol = Math.max(1, tam.length);
      return { name: rs[0].studentName, n: rs.length, avgScore: tam.reduce((a, r) => a + (r.score ?? 0), 0) / bol, avgNet: tam.reduce((a, r) => a + (r.totalNet ?? 0), 0) / bol };
    })
    .sort((a, b) => b.avgScore - a.avgScore);
  return (
    <div className="space-y-4">
      <KBolum tablo baslik="Deneme ortalamaları">
        <table className={KT.tablo}>
          <thead className={KT.bas}>
            <tr>
              <th className={KT.th}>Deneme</th>
              <th className={KT.thc}>Öğr.</th>
              {subs.map((s, i) => (
                <DersBaslik key={s.key} ad={s.short} alt="ort. net" renk={dersRgb(s.key, i)} />
              ))}
              <th className={KT.thc}>Top. net</th>
              <th className={KT.thc}>Ort. puan</th>
              <th className={KT.thc}>Kurum ort.</th>
            </tr>
          </thead>
          <tbody className={KT.govde}>
            {perExam.map(({ e, ca }) => (
              <tr key={e.id} className={KT.satir}>
                <td className={KT.td}>
                  <p className="font-semibold text-fg">{e.name}</p>
                  <p className="text-2xs text-muted">{dateTr(e.examDate)}</p>
                </td>
                <td className={KT.tdc}>{ca?.count ?? 0}</td>
                {subs.map((s) => (
                  <td key={s.key} className={KT.tdc}>
                    {fmtNet(ca?.avgNet[s.key])}
                  </td>
                ))}
                <td className={cx(KT.tdc, 'font-bold text-fg')}>{fmtNet(ca?.avgTotalNet)}</td>
                <td className={cx(KT.tdc, 'font-bold text-fg')}>{fmtScore(ca?.avgScore)}</td>
                <td className={cx(KT.tdc, 'text-muted')}>{fmtScore(e.summary.avgScore)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </KBolum>
      <div className="grid gap-3 lg:grid-cols-2">
        <KGrafikKart baslik="Ortalama puan gelişimi" aciklama={`kalın çizgi ${className} · kesik çizgi kurum ortalaması`}>
          <KCizgi
            etiketler={etiketler}
            seriler={[
              { ad: className, tur: 'ana', degerler: perExam.map(({ ca }) => ca?.avgScore ?? null) },
              { ad: 'Kurum ort.', tur: 'karsi', degerler: exams.map((e) => (typeof e.summary.avgScore === 'number' ? e.summary.avgScore : null)) },
            ]}
            bicim={(v) => fmtScore(v)}
          />
        </KGrafikKart>
        <KGrafikKart baslik="Ders net ortalamaları" aciklama="her ders kendi renginde">
          <KCizgi etiketler={etiketler} seriler={subs.map((s, i) => ({ ad: s.short, tur: 'ince' as const, renk: dersRgb(s.key, i), degerler: perExam.map(({ ca }) => ca?.avgNet[s.key] ?? null) }))} bicim={(v) => fmtNet(v)} lejant />
        </KGrafikKart>
      </div>
      <KBolum tablo baslik="Öğrenci sıralaması" aciklama="Seçilen denemelerin ortalamasına göre">
        <div className="max-h-96 overflow-y-auto">
          <table className={KT.tablo}>
            <thead className={cx(KT.bas, 'sticky top-0 z-10')}>
              <tr>
                <th className={cx(KT.thc, 'w-12')}>Sıra</th>
                <th className={KT.th}>Öğrenci</th>
                <th className={KT.thc}>Deneme</th>
                <th className={KT.thc}>Ort. toplam net</th>
                <th className={KT.thc}>Ort. puan</th>
              </tr>
            </thead>
            <tbody className={KT.govde}>
              {ranking.map((r, i) => (
                <tr key={`${r.name}-${i}`} className={KT.satir}>
                  <td className={cx(KT.tdc, 'font-semibold')}>{i + 1}</td>
                  <td className={cx(KT.td, 'font-semibold text-fg')}>{r.name}</td>
                  <td className={KT.tdc}>{r.n}</td>
                  <td className={KT.tdc}>{fmtNet(r.avgNet)}</td>
                  <td className={cx(KT.tdc, 'font-bold text-fg')}>{fmtScore(r.avgScore)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </KBolum>
      <KBolum baslik="Konu ve kazanım analizi" aciklama="Sınıfın bütün öğrencilerinin cevapları üzerinden">
        <TopicAnalysisView analysis={analysis} />
      </KBolum>
    </div>
  );
};

// ----------------------------------------------------------------------------- Sınıflar arası
export const CompareView: React.FC<{ exams: DenemeExam[]; results: DenemeResult[] }> = ({ exams, results }) => {
  const vurgu = useVurgu();
  const subs = usedSubjects(exams);
  const avgs = classAverages(results, subs);
  if (!avgs.length) return <p className="text-sm text-muted">Seçilen denemelerde sonuç yok.</p>;
  const shown = avgs.slice(0, 7);
  return (
    <div className="space-y-4">
      <KBolum tablo baslik="Sınıfların ortalamaları">
        <table className={KT.tablo}>
          <thead className={KT.bas}>
            <tr>
              <th className={KT.th}>Sınıf</th>
              <th className={KT.thc}>Sonuç</th>
              {subs.map((s, i) => (
                <DersBaslik key={s.key} ad={s.short} alt="ort. net" renk={dersRgb(s.key, i)} />
              ))}
              <th className={KT.thc}>Top. net</th>
              <th className={KT.thc}>Ort. puan</th>
            </tr>
          </thead>
          <tbody className={KT.govde}>
            {avgs.map((c) => (
              <tr key={c.classId} className={KT.satir}>
                <td className={cx(KT.td, 'font-semibold text-fg')}>{c.className}</td>
                <td className={KT.tdc}>{c.count}</td>
                {subs.map((s) => (
                  <td key={s.key} className={KT.tdc}>
                    {fmtNet(c.avgNet[s.key])}
                  </td>
                ))}
                <td className={cx(KT.tdc, 'font-bold text-fg')}>{fmtNet(c.avgTotalNet)}</td>
                <td className={cx(KT.tdc, 'font-bold text-fg')}>{fmtScore(c.avgScore)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </KBolum>
      <div className="grid gap-3 lg:grid-cols-2">
        <KGrafikKart baslik="Ortalama puan">
          <KSutun etiketler={avgs.map((c) => ({ ust: c.className }))} seriler={[{ ad: 'Ortalama puan', degerler: avgs.map((c) => c.avgScore) }]} bicim={(v) => fmtScore(v)} />
        </KGrafikKart>
        <KGrafikKart baslik="Ders net ortalamaları" aciklama="sınıflar vurgu renginin tonlarıyla">
          <KSutun
            etiketler={subs.map((s) => ({ ust: s.short }))}
            seriler={shown.map((c, i) => ({ ad: c.className, renk: sinifRenk(vurgu, i, shown.length), degerler: subs.map((s) => c.avgNet[s.key] ?? null) }))}
            bicim={(v) => fmtNet(v)}
            lejant
          />
        </KGrafikKart>
      </div>
    </div>
  );
};
