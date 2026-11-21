import React from 'react';
import { CheckCircle2, Heart, Lightbulb, MessageSquareText, Sparkles, Target, Trophy } from 'lucide-react';
import { cx } from '../ui/kit';
import { fmtNet, fmtScore } from '../../lib/deneme/lgs';
import { dateRange, dateTr, denemeEtiketleri } from '../../lib/deneme/karneModel';
import { LGS_PERCENTILE_NOTE } from '../../lib/deneme/lgsYuzdelik';
import { LGS_BANDS, TIER_INFO, priorityAdvice, type KurumOzet, type PriorityKarne, type PriorityTier, type VeliKarneData } from '../../lib/deneme/veliKurumKarne';
// Aşama 272: birleştirilmiş karnenin tasarım dili (ortak)
import { DersAd, DersBaslik, Fark, KBolum, KCizgi, KGrafikKart, KKutu, KNot, KT, KarneBant, SeviyeCubuk, SeviyeNokta, YESIL, Yuzde, dersRgb, rgb, tint, useVurgu, type RGB } from './KarneTasarim';

// ============================================================================
// Aşama 56: Veli Karnesi, Öncelikli Konu Karnesi, Kurum Özeti (ekran)
// Hesaplar lib/deneme/veliKurumKarne.ts'te; PDF'ler karneModel.ts'te.
// ============================================================================

const signed = (v: number | null) => (v === null || !Number.isFinite(v) ? '—' : Math.abs(v) < 0.005 ? '0' : `${v > 0 ? '+' : '−'}${fmtScore(Math.abs(v))}`);
/** Ders rengi sırası (birleştirilmiş karneyle aynı: LGS ders sırası) */
const LGS_SIRA = ['tr', 'sos', 'din', 'ing', 'mat', 'fen'];

// ============================================================================ Veli Karnesi
/** Aşama 272: güçlü / çalışılacak konu listesi (birleştirilmiş karnenin dili: seviye noktası, ders rengi, renkli yüzde) */
const KonuListesi: React.FC<{ baslik: React.ReactNode; bos: string; list: VeliKarneData['strong'] }> = ({ baslik, bos, list }) => (
  <KBolum baslik={baslik}>
    {list.length === 0 ? (
      <p className="text-xs text-muted">{bos}</p>
    ) : (
      <ul className="divide-y divide-line">
        {list.map((t, i) => (
          <li key={i} className="flex items-start gap-2 py-2 text-sm">
            <SeviyeNokta v={t.rate} className="mt-1.5" />
            <DersAd ad={t.subject.short} renk={dersRgb(t.subject.key, Math.max(0, LGS_SIRA.indexOf(t.subject.key)))} className="shrink-0 text-xs leading-5" />
            <span className="min-w-0 flex-1 text-fg">
              {t.name}
              <span className="block text-xs text-muted">{t.hint}</span>
            </span>
            <Yuzde v={t.rate} className="shrink-0 text-xs leading-5" />
          </li>
        ))}
      </ul>
    )}
  </KBolum>
);

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
  return (
    <div className="space-y-4" id="veli-karnesi">
      <KNot>
        Veliye gidecek <b>tek sayfalık</b> karne: teknik tablo yok, sade dil. Öğretmen notunu aşağıya yazın; PDF, e-posta ve WhatsApp ile paylaşımda karneye eklenir (not kaydedilmez, yalnızca bu karneye yazılır).
      </KNot>
      <KarneBant
        ust="Veli bilgilendirme karnesi"
        baslik={studentName}
        alt={className}
        cipler={[d.lastExam.name, dateTr(d.lastExam.examDate)]}
        daire={{ etiket: 'Son puan', deger: fmtScore(d.last.score), alt: '/ 500' }}
        yan={side}
      />
      <KBolum
        baslik={
          <>
            <Sparkles className="h-4 w-4 text-brand-fg" /> Kısaca
          </>
        }
      >
        <p className="text-sm leading-relaxed text-fg">{d.sentence}</p>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {d.change !== null && (
            <KKutu etiket="Önceki denemeye göre" deger={<Fark v={d.change} bicim={(n) => fmtScore(n)} ok={false} />} alt="puan değişimi" />
          )}
          {d.exams.length > 1 && <KKutu vurgu etiket={`${d.exams.length} deneme ortalaması`} deger={fmtScore(d.avgScore)} />}
          {d.clsAvg !== null && <KKutu etiket="Sınıf ortalaması" deger={fmtScore(d.clsAvg)} />}
          {d.kurumAvg !== null && <KKutu etiket="Okul ortalaması" deger={fmtScore(d.kurumAvg)} />}
        </div>
        {d.target !== null && (
          <p className="inline-flex items-center gap-1 text-xs font-semibold text-success-fg">
            <Target className="h-3.5 w-3.5" /> Hedef {fmtScore(d.target)}
          </p>
        )}
      </KBolum>
      <KGrafikKart baslik={`Son ${d.trend.length} denemedeki puanı`} aciklama={`kalın çizgi puanı · kesik çizgi sınıf ortalaması${d.target !== null ? ' · yeşil kesik çizgi hedef' : ''}`}>
        <KCizgi
          etiketler={denemeEtiketleri(d.trend.map((t) => t.exam))}
          seriler={[
            { ad: 'Puanı', tur: 'ana', degerler: d.trend.map((t) => t.score) },
            { ad: 'Sınıf ort.', tur: 'karsi', degerler: d.trend.map((t) => t.clsAvg) },
          ]}
          hedef={d.target !== null ? { deger: d.target, ad: `Hedef ${fmtScore(d.target)}` } : null}
          bicim={(v) => fmtScore(v)}
        />
      </KGrafikKart>
      <div className="grid gap-3 md:grid-cols-2">
        <KonuListesi
          baslik={
            <>
              <CheckCircle2 className="h-4 w-4 text-success-fg" /> Güçlü olduğu konular
            </>
          }
          bos="Henüz yeterli soru sorulmadı; sonraki denemelerle belirginleşecek."
          list={d.strong}
        />
        <KonuListesi
          baslik={
            <>
              <Lightbulb className="h-4 w-4 text-warning-fg" /> Birlikte çalışılması gereken konular
            </>
          }
          bos="Belirgin bir eksik konu görünmüyor."
          list={d.improve}
        />
      </div>
      <KBolum>
        <label className="flex items-center gap-1.5 text-base font-extrabold text-fg" htmlFor="veli-not">
          <MessageSquareText className="h-4 w-4 text-brand-fg" /> Öğretmenin notu{teacherName ? ` (${teacherName})` : ''}
        </label>
        {onNote ? (
          <textarea
            id="veli-not"
            className="ui-input min-h-24 text-sm"
            maxLength={600}
            placeholder="Örn. Matematikte düzenli çalışıyor; Fen'de deney sorularında zorlanıyor. Haftada iki gün birlikte soru çözümü önerilir."
            value={note}
            onChange={(e) => onNote(e.target.value)}
          />
        ) : (
          <p className="whitespace-pre-line text-sm text-fg-2">{note || '—'}</p>
        )}
        <p className="text-xs text-muted">{note.length}/600 · Boş bırakılırsa PDF'te elle yazılabilecek boş satırlar çıkar.</p>
      </KBolum>
      <KBolum
        baslik={
          <>
            <Heart className="h-4 w-4 text-danger-fg" /> Evde nasıl destek olabilirsiniz?
          </>
        }
        aciklama="Karnede yer alır"
      >
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-fg-2">
          <li>Her gün aynı saatte, kısa ve düzenli çalışmasını destekleyin; çalışma ortamını sessiz tutun.</li>
          <li>Deneme sonrasında puandan çok yanlış yaptığı sorulara birlikte bakın.</li>
          <li>Uyku ve dinlenme düzenine dikkat edin; başarıları küçük de olsa takdir edin.</li>
        </ul>
      </KBolum>
      {d.lgs && <p className="text-xs text-muted">{LGS_PERCENTILE_NOTE}</p>}
    </div>
  );
};

// ============================================================================ Öncelikli Konu Karnesi
const TIER_TON: Record<PriorityTier, 'danger' | 'warning' | 'info'> = { 1: 'danger', 2: 'warning', 3: 'info' };
const TIER_RENK: Record<PriorityTier, RGB> = { 1: [220, 38, 38], 2: [217, 119, 6], 3: [37, 99, 235] };

export const OncelikKarneView: React.FC<{ pk: PriorityKarne }> = ({ pk }) => {
  const tiers: PriorityTier[] = [1, 2, 3];
  if (!pk.examCount) return <p className="text-sm text-muted">Seçilen kapsamda deneme sonucu yok.</p>;
  const maxGain = Math.max(0.01, ...pk.rows.map((r) => r.gainPoints));
  return (
    <div className="space-y-4" id="oncelik-karnesi">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
        {tiers.map((t) => (
          <KKutu
            key={t}
            ton={TIER_TON[t]}
            etiket={TIER_INFO[t].label}
            deger={`${pk.tiers[t].count} konu`}
            alt={
              <>
                düzelirse <b>+{fmtNet(pk.tiers[t].gainNet)} net</b> · +{fmtScore(pk.tiers[t].gainPoints)} puan
              </>
            }
          />
        ))}
        <KKutu ton="success" etiket="Toplam kazanılabilecek" deger={`+${fmtNet(pk.totalNet)} net`} alt={`deneme başına yaklaşık +${fmtScore(pk.totalPoints)} puan`} />
      </div>
      <KNot>
        <b>Öncelik nasıl belirlenir?</b> Her konunun deneme başına kaybettirdiği net hesaplanır (yanlış: 1 + 1/3 net, boş: 1 net) ve ders katsayısıyla puana çevrilir. Konular büyükten küçüğe dizilir: toplam kaybın ilk yarısı <b>1. öncelik</b>, sonraki %30'u{' '}
        <b>2. öncelik</b>, kalanı <b>3. öncelik</b>. "+X net": konu tamamen öğrenilirse bir denemede kazanılacak yaklaşık net. Kazanılmış konular listeye girmez.
      </KNot>
      {!pk.rows.length && <p className="text-sm text-success-fg">Seçilen denemelerde puan kaybettiren eksik konu yok. Tebrikler!</p>}
      {tiers.map((t) => {
        const rows = pk.rows.filter((r) => r.tier === t);
        if (!rows.length) return null;
        return (
          <KBolum
            key={t}
            tablo
            baslik={
              <>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: rgb(TIER_RENK[t]) }} />
                <span style={{ color: rgb(TIER_RENK[t]) }}>{TIER_INFO[t].label}</span>
                <span className="text-xs font-semibold text-muted">{rows.length} konu</span>
              </>
            }
            aciklama={TIER_INFO[t].desc}
            sag={
              <span className="text-xs font-bold tabular-nums text-fg">
                +{fmtNet(pk.tiers[t].gainNet)} net · +{fmtScore(pk.tiers[t].gainPoints)} puan
              </span>
            }
          >
            <table className={KT.tablo}>
              <thead className={KT.bas}>
                <tr>
                  <th className={cx(KT.th, 'w-8')}>#</th>
                  <th className={KT.th}>Ders</th>
                  <th className={KT.th}>Konu / kazanım</th>
                  <th className={KT.thc}>Başarı</th>
                  <th className={KT.thc}>Soru / deneme</th>
                  <th className={cx(KT.th, 'min-w-44')}>Düzelirse (deneme başına)</th>
                  <th className={KT.th}>Ne yapmalı?</th>
                </tr>
              </thead>
              <tbody className={KT.govde}>
                {rows.map((r, i) => {
                  const rate = r.row.lastRate ?? r.row.rate;
                  return (
                    <tr key={r.row.key + r.subject.key} className={cx('align-top', KT.satir)}>
                      <td className={cx(KT.td, 'font-bold text-fg tabular-nums')}>{i + 1}</td>
                      <td className={cx(KT.td, 'whitespace-nowrap')}>
                        <DersAd ad={r.subject.short} renk={dersRgb(r.subject.key, Math.max(0, LGS_SIRA.indexOf(r.subject.key)))} />
                      </td>
                      <td className={cx(KT.td, 'text-fg')}>{r.row.label}</td>
                      <td className={KT.tdc}>
                        <Yuzde v={rate} />
                      </td>
                      <td className={KT.tdc}>{fmtNet(r.perExamQuestions)}</td>
                      <td className={KT.td}>
                        <div className="flex items-center gap-2">
                          <SeviyeCubuk v={Math.max(4, (r.gainPoints / maxGain) * 100)} renk={TIER_RENK[t]} className="flex-1" />
                          <span className="whitespace-nowrap font-bold text-fg tabular-nums">+{fmtNet(r.gainNet)} net</span>
                        </div>
                        <span className="text-2xs text-muted">≈ +{fmtScore(r.gainPoints)} puan · toplam kaybın %{String(r.share).replace('.', ',')} kadarı</span>
                      </td>
                      <td className={cx(KT.td, 'min-w-48 text-xs text-fg-2')}>{priorityAdvice(r)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </KBolum>
        );
      })}
    </div>
  );
};

// ============================================================================ Kurum Özeti
export const KurumOzetView: React.FC<{ k: KurumOzet | null; scopeLabel: string }> = ({ k, scopeLabel }) => {
  const vurgu = useVurgu();
  if (!k) return <p className="text-sm text-muted">Seçilen denemelerde sonuç yok.</p>;
  const s = k.summary;
  const withBands = k.perExam.filter((p) => p.bands);
  return (
    <div className="space-y-4" id="kurum-ozeti">
      <KarneBant
        ust="Kurum özeti"
        baslik="Deneme sonuçları özeti"
        alt={`${scopeLabel} · ${k.exams.length} deneme · ${dateRange(k.exams)}`}
        cipler={[`${s.students} kayıtlı öğrenci`, `${s.participants} öğrenci denemeye girdi`, s.participation !== null ? `Katılım %${s.participation}` : '']}
        daire={{ etiket: 'Ort. puan', deger: fmtScore(s.avgScore), alt: `son ${fmtScore(s.lastAvg)}` }}
        yan={[
          ['İlk → son deneme', `${signed(s.change)} puan`],
          ['Son denemede ilk %10', s.lastTop10 !== null ? `${s.lastTop10} öğrenci` : '—'],
          ['Son denemede ilk %1', s.lastTop1 !== null ? `${s.lastTop1} öğrenci` : '—'],
        ]}
      />
      <div className={cx('grid gap-3', withBands.length > 0 && 'lg:grid-cols-2')}>
        <KGrafikKart baslik="Kurum ortalaması ve en yüksek puan" aciklama="kalın çizgi kurum ortalaması · ince çizgi en yüksek puan">
          <KCizgi
            etiketler={denemeEtiketleri(k.perExam.map((p) => p.exam))}
            seriler={[
              { ad: 'Kurum ort.', tur: 'ana', degerler: k.perExam.map((p) => p.avgScore) },
              { ad: 'En yüksek', tur: 'ince', renk: YESIL, degerler: k.perExam.map((p) => p.maxScore) },
            ]}
            bicim={(v) => fmtScore(v)}
          />
        </KGrafikKart>
        {/* Aşama 272: LGS dilimi yalnız LGS türü denemede anlamlıdır; yoksa kart gösterilmez (5-7 ve LGS dışı denemeler) */}
        {withBands.length > 0 && (
          <KGrafikKart baslik="LGS yüzdelik dilim dağılımı" aciklama={k.lgsYear ? `${k.lgsYear} LGS'ye göre, tahmini` : undefined}>
            <div className="mt-2 space-y-2">
              {withBands.map((p) => {
                const total = p.bands!.reduce((a, b) => a + b, 0);
                return (
                  <div key={p.exam.id}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="truncate font-semibold text-fg">{p.exam.name}</span>
                      <span className="text-muted tabular-nums">ilk %10: {p.bands![0] + p.bands![1] + p.bands![2]}</span>
                    </div>
                    <div className="mt-0.5 flex h-3 w-full overflow-hidden rounded-full bg-surface-2">
                      {LGS_BANDS.map((b, i) => {
                        const n = p.bands![i];
                        if (!n || !total) return null;
                        const w = (n / total) * 100;
                        return (
                          <span key={b.label} className="flex h-full items-center justify-center text-3xs font-bold text-white" style={{ width: `${w}%`, background: rgb(b.rgb) }} title={`${b.label}: ${n} öğrenci`}>
                            {w >= 7 ? n : ''}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              <div className="flex flex-wrap gap-3 pt-1 text-xs text-fg-2">
                {LGS_BANDS.map((b) => (
                  <span key={b.label} className="inline-flex items-center gap-1">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: rgb(b.rgb) }} /> {b.label}
                  </span>
                ))}
              </div>
            </div>
          </KGrafikKart>
        )}
      </div>

      <KBolum tablo baslik="Deneme deneme kurum sonuçları">
        <table className={KT.tablo}>
          <thead className={KT.bas}>
            <tr>
              <th className={KT.th}>Deneme</th>
              <th className={KT.thc}>Katılım</th>
              {k.subjects.map((x, i) => (
                <DersBaslik key={x.key} ad={x.short} alt="ort. net" renk={dersRgb(x.key, i)} />
              ))}
              <th className={KT.thc}>Top. net</th>
              <th className={KT.thc}>Ort. puan</th>
              <th className={KT.thc}>En yüksek</th>
              <th className={KT.th}>En iyi sınıf</th>
            </tr>
          </thead>
          <tbody className={KT.govde}>
            {k.perExam.map((p) => (
              <tr key={p.exam.id} className={KT.satir}>
                <td className={KT.td}>
                  <p className="font-semibold text-fg">{p.exam.name}</p>
                  <p className="text-2xs text-muted">{dateTr(p.exam.examDate)}</p>
                </td>
                <td className={cx(KT.tdc, 'whitespace-nowrap')}>
                  {p.n}
                  {p.participation !== null && <span className={cx('ml-1 text-xs', p.participation < 70 ? 'font-semibold text-warning-fg' : 'text-muted')}>%{p.participation}</span>}
                </td>
                {k.subjects.map((x) => (
                  <td key={x.key} className={KT.tdc}>
                    {fmtNet(p.avgNet[x.key])}
                  </td>
                ))}
                <td className={cx(KT.tdc, 'font-bold text-fg')}>{fmtNet(p.avgTotalNet)}</td>
                <td className={cx(KT.tdc, 'font-bold text-fg')}>{fmtScore(p.avgScore)}</td>
                <td className={cx(KT.tdc, 'font-semibold text-success-fg')}>{fmtScore(p.maxScore)}</td>
                <td className={cx(KT.td, 'whitespace-nowrap')}>
                  {p.topClass ? (
                    <span className="inline-flex items-center gap-1 font-semibold text-fg">
                      <Trophy className="h-3.5 w-3.5 text-success-fg" /> {p.topClass.name} <span className="font-normal text-muted tabular-nums">· {fmtScore(p.topClass.avgScore)}</span>
                    </span>
                  ) : (
                    <span className="text-subtle">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </KBolum>

      <KBolum tablo baslik="Sınıfların sırası" aciklama="Seçilen denemelerdeki sınıf ortalamalarının ortalamasına göre">
        <table className={KT.tablo}>
          <thead className={KT.bas}>
            <tr>
              <th className={cx(KT.thc, 'w-12')}>Sıra</th>
              <th className={KT.th}>Sınıf</th>
              <th className={KT.thc}>Öğrenci</th>
              <th className={KT.thc}>Katılım</th>
              <th className={cx(KT.th, 'min-w-40')}>Ortalama puan</th>
              <th className={KT.thc}>İlk → son</th>
              <th className={KT.thc}>Ort. sıra</th>
              <th className={KT.thc}>Son denemede ilk %1</th>
            </tr>
          </thead>
          <tbody className={KT.govde}>
            {(() => {
              const scores = k.classes.map((c) => c.avgScore).filter((v): v is number => v !== null);
              const min = scores.length ? Math.min(...scores) : 0;
              const max = scores.length ? Math.max(...scores) : 1;
              return k.classes.map((c) => (
                <tr key={c.classId} className={KT.satir}>
                  <td className={KT.tdc}>
                    {c.rank ? (
                      <span
                        className={cx('inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-black tabular-nums', c.rank <= 3 ? 'text-white' : 'bg-surface-2 text-fg-2')}
                        style={c.rank <= 3 ? { background: rgb(tint(vurgu, c.rank === 1 ? 1 : c.rank === 2 ? 0.7 : 0.45)) } : undefined}
                      >
                        {c.rank}
                      </span>
                    ) : (
                      <span className="text-subtle">—</span>
                    )}
                  </td>
                  <td className={cx(KT.td, 'font-semibold text-fg')}>{c.name}</td>
                  <td className={KT.tdc}>{c.students}</td>
                  <td className={cx(KT.tdc, c.participation !== null && c.participation < 70 && 'font-bold text-warning-fg')}>{c.participation !== null ? `%${c.participation}` : '—'}</td>
                  <td className={KT.td}>
                    {c.avgScore !== null ? (
                      <div className="flex items-center gap-2">
                        <SeviyeCubuk v={max > min ? 15 + ((c.avgScore - min) / (max - min)) * 85 : 100} renk={vurgu} className="flex-1" />
                        <span className="w-12 text-right font-bold text-fg tabular-nums">{fmtScore(c.avgScore)}</span>
                      </div>
                    ) : (
                      <span className="text-subtle">sonuç yok</span>
                    )}
                  </td>
                  <td className={KT.tdc}>
                    <Fark v={c.change} bicim={(n) => fmtScore(n)} ok={false} />
                  </td>
                  <td className={KT.tdc}>{c.avgRank !== null ? fmtNet(c.avgRank) : '—'}</td>
                  <td className={KT.tdc}>{c.top1 ? <span className="font-bold text-success-fg">{c.top1}</span> : <span className="text-subtle">—</span>}</td>
                </tr>
              ));
            })()}
          </tbody>
        </table>
      </KBolum>
      <p className="text-xs text-muted">
        Katılım: sonucu olan öğrenci / kayıtlı öğrenci (%70'in altı turuncu). {LGS_PERCENTILE_NOTE}
      </p>
    </div>
  );
};
