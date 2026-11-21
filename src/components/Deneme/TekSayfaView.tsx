import React from 'react';
import { cx } from '../ui/kit';
import { fmtNet, fmtScore } from '../../lib/deneme/lgs';
import type { TekSayfaData } from '../../lib/deneme/tekSayfaKarne';
// Aşama 272: birleştirilmiş karnenin tasarım dili (ortak)
import { DersAd, Fark, KBolum, KKutu, KT, SeviyeCubuk, Yuzde } from './KarneTasarim';

// ============================================================================
// Aşama 135: TEK SAYFA KARNE — ekran özeti
// PDF ile aynı veriden (tekSayfaData) gelir: bilgi kutuları, ders tablosu, son 3 yıl yüzdelik dilimi,
// değerlendirme ve yanlış / boş soruların kazanımları. Tam sayfa görünüm "PDF indir" ile alınır.
// ============================================================================

const pct = (v: number) => {
  const s = v.toFixed(v < 10 ? 2 : 1).replace(/0+$/, '').replace(/\.$/, '');
  return s.replace('.', ',');
};
const TONE_DOT: Record<string, string> = { success: 'bg-success', danger: 'bg-danger', warning: 'bg-warning', info: 'bg-fg-2' };

const Kutu: React.FC<{ label: string; value: React.ReactNode; sub?: React.ReactNode; vurgu?: boolean }> = ({ label, value, sub, vurgu }) => (
  <KKutu vurgu={vurgu} className="min-w-0" etiket={label} deger={value} alt={sub ? <span className="block truncate">{sub}</span> : undefined} />
);

export const TekSayfaView: React.FC<{ data: TekSayfaData | null }> = ({ data: d }) => {
  if (!d) return <p className="text-sm text-muted">Öğrenci seçilen denemeye girmemiş. Yukarıdan başka bir deneme seçin.</p>;
  const dlt = d.score !== null && d.prevScore !== null ? Math.round((d.score - d.prevScore) * 100) / 100 : null;
  const kacirilan = d.dersler.flatMap((s) => s.sorular.filter((q) => q.mark !== 'D').map((q) => ({ s, q })));
  return (
    <div className="space-y-3" id="karne-tek-ozet">
      <p className="text-xs text-muted">
        <b className="text-fg">{d.title}</b> · {d.examName} · tek sayfa karnenin özeti. Bütün soruların kazanım listesi ve grafiklerle tam sayfa için <b>PDF indir</b>.
      </p>
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-5">
        <Kutu
          vurgu
          label={d.puanAdi || 'LGS puanı'}
          value={fmtScore(d.score)}
          sub={dlt === null ? 'İlk deneme' : <span className={dlt >= 0 ? 'text-success-fg font-semibold' : 'text-danger-fg font-semibold'}>{`Önceki denemeye göre ${dlt >= 0 ? '+' : '-'}${fmtScore(Math.abs(dlt))}`}</span>}
        />
        <Kutu label="Toplam net" value={fmtNet(d.totalNet)} sub={`Sınıf ort. ${fmtNet(d.clsTotalNet)}`} />
        <Kutu
          label="D · Y · B"
          value={
            <span className="space-x-2">
              <span className="text-success-fg">{d.totals.d}</span>
              <span className="text-danger-fg">{d.totals.y}</span>
              <span className="text-muted">{d.totals.b}</span>
            </span>
          }
          sub={`${d.totals.count} soru`}
        />
        <Kutu label="Sınıf sırası" value={d.rank ? `${d.rank.cls} / ${d.rank.clsCount}` : '-'} sub={`Sınıf ort. ${fmtScore(d.clsAvgScore)}`} />
        <Kutu label="Kurum sırası" value={d.rank ? `${d.rank.overall} / ${d.rank.overallCount}` : '-'} sub={d.kurumYuzdelik !== null ? `Kurum içi yüzdelik %${d.kurumYuzdelik}` : ''} />
      </div>

      <div className={cx('grid gap-3', d.yuzdelik.length > 0 && 'lg:grid-cols-[1fr_16rem]')}>
        <KBolum tablo baslik="Ders sonuçları">
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
                <th className={KT.thc}>Sınıf ort.</th>
                <th className={KT.thc}>Sınıfa göre</th>
              </tr>
            </thead>
            <tbody className={KT.govde}>
              {d.dersler.map((s) => {
                const f = s.clsAvgNet !== null ? Math.round((s.net - s.clsAvgNet) * 100) / 100 : null; // Aşama 141: fark sınıfa göre
                return (
                  <tr key={s.key} className={KT.satir}>
                    <td className={cx(KT.td, 'whitespace-nowrap')}>
                      <DersAd ad={s.short} renk={s.color} />
                    </td>
                    <td className={KT.tdc}>{s.count}</td>
                    <td className={cx(KT.tdc, 'font-semibold text-success-fg')}>{s.d}</td>
                    <td className={cx(KT.tdc, 'font-semibold text-danger-fg')}>{s.y}</td>
                    <td className={cx(KT.tdc, 'text-muted')}>{s.b}</td>
                    <td className={cx(KT.tdc, 'font-black text-fg')}>{fmtNet(s.net)}</td>
                    <td className={KT.td}>
                      <div className="flex min-w-28 items-center gap-2">
                        <SeviyeCubuk v={s.rate} className="flex-1" />
                        <Yuzde v={s.rate} className="w-10 text-right" />
                      </div>
                    </td>
                    <td className={KT.tdc}>{fmtNet(s.clsAvgNet)}</td>
                    <td className={KT.tdc}>
                      <Fark v={f} bicim={(n) => fmtNet(n)} ok={false} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </KBolum>
        {d.yuzdelik.length > 0 && (
          <KBolum baslik="Son 3 yılda yüzdelik dilim" aciklama="Türkiye geneli yaklaşık karşılığı; küçük yüzde daha iyi dilimdir.">
            <ul className="divide-y divide-line">
              {d.yuzdelik.map((p) => (
                <li key={p.year} className="flex items-center justify-between py-1.5 text-sm">
                  <span className="font-semibold text-fg-2">{p.year}</span>
                  <span className="font-black text-fg tabular-nums">
                    {p.below ? '> ' : ''}%{pct(p.value)}
                  </span>
                </li>
              ))}
            </ul>
          </KBolum>
        )}
      </div>

      <KBolum baslik="Değerlendirme">
        <ul className="space-y-1.5">
          {d.degerlendirme.map((it, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-fg-2">
              <span className={cx('mt-1 h-2 w-2 shrink-0 rounded-full', TONE_DOT[it.tone])} />
              <span>
                <b className="text-fg">{it.label}</b> {it.text}
              </span>
            </li>
          ))}
        </ul>
      </KBolum>

      {kacirilan.length > 0 && (
        <KBolum tablo baslik={`Yanlış ve boş soruların kazanımları (${kacirilan.length})`} aciklama="Turuncu nokta: kurumun çoğunluğunun doğru yaptığı soru · K: kurumda doğru oranı">
          <table className={KT.tablo}>
            <tbody className={KT.govde}>
              {kacirilan.map(({ s, q }) => (
                <tr key={`${s.key}-${q.no}`} className={KT.satir}>
                  <td className={cx(KT.td, 'whitespace-nowrap')}>
                    <DersAd ad={`${s.short} ${q.no}`} renk={s.color} />
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5">
                    <span className={q.mark === 'Y' ? 'text-danger-fg font-semibold' : 'text-muted'}>{q.mark === 'Y' ? `Yanlış (${q.given} → ${q.key})` : `Boş (${q.key})`}</span>
                  </td>
                  <td className="px-2 py-1.5">
                    {q.kacan && <span className="inline-block w-1.5 h-1.5 rounded-full bg-warning mr-1.5 align-middle" title="Kurumun çoğunluğu doğru yaptı" />}
                    {q.kazanim}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right text-muted tabular-nums">{q.kurumRate === null ? '' : `K %${q.kurumRate}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </KBolum>
      )}
    </div>
  );
};
