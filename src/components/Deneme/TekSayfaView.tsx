import React from 'react';
import { cx } from '../ui/kit';
import { fmtNet, fmtScore } from '../../lib/deneme/lgs';
import type { TekSayfaData } from '../../lib/deneme/tekSayfaKarne';

// ============================================================================
// Aşama 135: TEK SAYFA KARNE — ekran özeti
// PDF ile aynı veriden (tekSayfaData) gelir: bilgi kutuları, ders tablosu, son 3 yıl yüzdelik dilimi,
// değerlendirme ve yanlış / boş soruların kazanımları. Tam sayfa görünüm "PDF indir" ile alınır.
// ============================================================================

const rgb = (c: [number, number, number]) => `rgb(${c[0]} ${c[1]} ${c[2]})`;
const pct = (v: number) => {
  const s = v.toFixed(v < 10 ? 2 : 1).replace(/0+$/, '').replace(/\.$/, '');
  return s.replace('.', ',');
};
const TONE_DOT: Record<string, string> = { success: 'bg-success', danger: 'bg-danger', warning: 'bg-warning', info: 'bg-fg-2' };

const Kutu: React.FC<{ label: string; value: React.ReactNode; sub?: React.ReactNode }> = ({ label, value, sub }) => (
  <div className="rounded-xl border border-line bg-surface px-3 py-2 min-w-0">
    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</div>
    <div className="text-xl font-extrabold text-fg tabular-nums leading-tight">{value}</div>
    {sub && <div className="text-[11px] text-fg-2 truncate">{sub}</div>}
  </div>
);

export const TekSayfaView: React.FC<{ data: TekSayfaData | null }> = ({ data: d }) => {
  if (!d) return <p className="text-sm text-muted">Öğrenci seçilen denemeye girmemiş. Yukarıdan başka bir deneme seçin.</p>;
  const dlt = d.score !== null && d.prevScore !== null ? Math.round((d.score - d.prevScore) * 100) / 100 : null;
  const kacirilan = d.dersler.flatMap((s) => s.sorular.filter((q) => q.mark !== 'D').map((q) => ({ s, q })));
  return (
    <div className="space-y-3" id="karne-tek-ozet">
      <p className="text-[11px] text-muted">
        <b className="text-fg">{d.title}</b> · {d.examName} · tek sayfa karnenin özeti. Bütün soruların kazanım listesi ve grafiklerle tam sayfa için <b>PDF indir</b>.
      </p>
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-5">
        <Kutu
          label="LGS puanı"
          value={fmtScore(d.score)}
          sub={dlt === null ? 'İlk deneme' : <span className={dlt >= 0 ? 'text-success-fg font-semibold' : 'text-danger-fg font-semibold'}>{`Önceki denemeye göre ${dlt >= 0 ? '+' : '-'}${fmtScore(Math.abs(dlt))}`}</span>}
        />
        <Kutu label="Toplam net" value={fmtNet(d.totalNet)} sub={`Kurum ort. ${fmtNet(d.kurumTotalNet)}`} />
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
        <Kutu label="Kurum sırası" value={d.rank ? `${d.rank.overall} / ${d.rank.overallCount}` : '-'} sub={`Kurum ort. ${fmtScore(d.kurumAvgScore)}`} />
      </div>

      <div className={cx('grid gap-3', d.yuzdelik.length > 0 && 'lg:grid-cols-[1fr_16rem]')}>
        <div className="ui-card overflow-x-auto">
          <table className="w-full text-xs text-fg-2">
            <thead>
              <tr className="text-[11px] uppercase text-muted border-b border-line">
                <th className="text-left px-3 py-2">Ders</th>
                <th className="px-2">Soru</th>
                <th className="px-2">D</th>
                <th className="px-2">Y</th>
                <th className="px-2">B</th>
                <th className="px-2">Net</th>
                <th className="px-2">Başarı</th>
                <th className="px-2">Sınıf ort.</th>
                <th className="px-2">Kurum ort.</th>
                <th className="px-2">Fark</th>
              </tr>
            </thead>
            <tbody>
              {d.dersler.map((s) => {
                const f = s.kurumAvgNet !== null ? Math.round((s.net - s.kurumAvgNet) * 100) / 100 : null;
                return (
                  <tr key={s.key} className="border-b border-line text-center">
                    <td className="text-left px-3 py-1.5 font-semibold text-fg whitespace-nowrap">
                      <span className="inline-block w-1.5 h-3 rounded-sm mr-1.5 align-[-1px]" style={{ background: rgb(s.color) }} />
                      {s.short}
                    </td>
                    <td>{s.count}</td>
                    <td className="text-success-fg font-semibold">{s.d}</td>
                    <td className="text-danger-fg font-semibold">{s.y}</td>
                    <td className="text-muted">{s.b}</td>
                    <td className="font-bold text-fg">{fmtNet(s.net)}</td>
                    <td>%{s.rate}</td>
                    <td>{fmtNet(s.clsAvgNet)}</td>
                    <td>{fmtNet(s.kurumAvgNet)}</td>
                    <td className={cx('font-semibold', f === null ? '' : f >= 0 ? 'text-success-fg' : 'text-danger-fg')}>{f === null ? '-' : `${f >= 0 ? '+' : ''}${fmtNet(f)}`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {d.yuzdelik.length > 0 && (
          <div className="ui-card ui-card-pad space-y-1.5">
            <div className="text-xs font-bold text-fg">Son 3 yılda yüzdelik dilim</div>
            {d.yuzdelik.map((p) => (
              <div key={p.year} className="flex items-center justify-between text-sm">
                <span className="font-semibold text-fg-2">{p.year}</span>
                <span className="font-extrabold text-fg tabular-nums">
                  {p.below ? '> ' : ''}%{pct(p.value)}
                </span>
              </div>
            ))}
            <p className="text-[11px] text-muted">Türkiye geneli yaklaşık karşılığı; küçük yüzde daha iyi dilimdir.</p>
          </div>
        )}
      </div>

      <div className="ui-card ui-card-pad space-y-1.5">
        <div className="text-xs font-bold text-fg">Değerlendirme</div>
        {d.degerlendirme.map((it, i) => (
          <div key={i} className="flex items-start gap-2 text-xs text-fg-2">
            <span className={cx('mt-1 w-2 h-2 rounded-full shrink-0', TONE_DOT[it.tone])} />
            <span>
              <b className="text-fg">{it.label}</b> {it.text}
            </span>
          </div>
        ))}
      </div>

      {kacirilan.length > 0 && (
        <div className="ui-card overflow-x-auto">
          <div className="px-3 pt-2 text-xs font-bold text-fg">Yanlış ve boş soruların kazanımları ({kacirilan.length})</div>
          <table className="w-full text-xs text-fg-2 mt-1">
            <tbody>
              {kacirilan.map(({ s, q }) => (
                <tr key={`${s.key}-${q.no}`} className="border-t border-line">
                  <td className="px-3 py-1 whitespace-nowrap font-semibold" style={{ color: rgb(s.color) }}>
                    {s.short} {q.no}
                  </td>
                  <td className="px-2 whitespace-nowrap">
                    <span className={q.mark === 'Y' ? 'text-danger-fg font-semibold' : 'text-muted'}>{q.mark === 'Y' ? `Yanlış (${q.given} → ${q.key})` : `Boş (${q.key})`}</span>
                  </td>
                  <td className="px-2 py-1">
                    {q.kacan && <span className="inline-block w-1.5 h-1.5 rounded-full bg-warning mr-1.5 align-middle" title="Kurumun çoğunluğu doğru yaptı" />}
                    {q.kazanim}
                  </td>
                  <td className="px-3 text-right text-muted whitespace-nowrap">{q.kurumRate === null ? '' : `K %${q.kurumRate}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
