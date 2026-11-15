import React from 'react';
import { cx } from '../ui/kit';
import { fmtScore } from '../../lib/deneme/lgs';
import { dateRange, dateTr, denemeEtiketleri } from '../../lib/deneme/karneModel';
import { bransTitle, type BransGelisim } from '../../lib/deneme/bransKarne';
// Aşama 272: birleştirilmiş karnenin tasarım dili (ortak)
import { DersAd, KBolum, dersRgb, rgb } from './KarneTasarim';

// ============================================================================
// Aşama 130: Branş şube gelişim karnesi (ekran). Hesap lib/deneme/bransKarne.ts'te; PDF aynı veriden.
// Satır = öğrenci, sütun = deneme; hücre = dersin neti (kurum ortalamasına göre renkli).
// ============================================================================

/** Aşama 272: renkli kutu yerine renkli kalın yazı (birleştirilmiş karnenin tablo dili) */
const TONE_TEXT: Record<'success' | 'danger', string> = {
  success: 'text-success-fg font-bold',
  danger: 'text-danger-fg font-bold',
};
const TH = 'sticky top-0 z-20 bg-surface-2 px-1 py-2 text-center font-semibold border-b border-line';

export const BransGelisimView: React.FC<{ data: BransGelisim | null; scopeLabel: string }> = ({ data, scopeLabel }) => {
  if (!data) return <p className="text-sm text-muted">Seçilen kapsamda bu dersi içeren deneme yok.</p>;
  const { exams, counts, rows, subeAvg, kurumAvg } = data;
  const renk = dersRgb(data.subject.key);
  const etiket = denemeEtiketleri(exams);
  return (
    <KBolum
      tablo
      baslik={
        <>
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: rgb(renk) }} />
          <DersAd ad={bransTitle(data.subject)} renk={renk} className="font-extrabold" />
        </>
      }
      aciklama={`${data.className} · ${scopeLabel} (${exams.length} deneme) · ${dateRange(exams)} · Yeşil: kurum ortalamasının üstü · Kırmızı: altı · —: girmedi`}
    >
      <div className="max-h-[36rem] overflow-auto">
        <table className="w-full text-xs text-fg-2 border-separate border-spacing-0">
          <thead className="text-[11px] uppercase tracking-wider text-muted">
            <tr>
              <th className="sticky top-0 left-0 z-30 bg-surface-2 px-2 py-2 text-center font-semibold border-b border-line w-14">No</th>
              <th className="sticky top-0 left-14 z-30 bg-surface-2 px-3 py-2 text-left font-semibold border-b border-line min-w-40">Adı Soyadı</th>
              {exams.map((e, i) => (
                <th key={e.id} className={cx(TH, 'min-w-16')} title={`${e.name} · ${dateTr(e.examDate)} · ${counts[i]} soru`}>
                  <span className="mx-auto block max-w-20 truncate normal-case tracking-normal">{etiket[i].ust}</span>
                  <span className="block text-[10px] font-normal tabular-nums normal-case tracking-normal">{etiket[i].alt}</span>
                  <span className="block text-[10px] font-normal tabular-nums normal-case tracking-normal">{counts[i]} soru</span>
                </th>
              ))}
              <th className={cx(TH, 'px-2')}>Genel ort.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.studentId} className="group">
                <td className="sticky left-0 z-10 bg-surface group-hover:bg-surface-2 px-2 py-1 text-center tabular-nums text-muted border-b border-line/60">{r.no || '—'}</td>
                <td className="sticky left-14 z-10 bg-surface group-hover:bg-surface-2 px-3 py-1 font-semibold text-fg border-b border-line/60 whitespace-nowrap">{r.name}</td>
                {r.nets.map((v, i) => {
                  const t = r.tones[i];
                  return (
                    <td key={i} className={cx('border-b border-line/60 px-1 py-1 text-center tabular-nums', v === null ? 'text-subtle' : t ? TONE_TEXT[t] : 'text-fg')}>
                      {v === null ? '—' : fmtScore(v)}
                    </td>
                  );
                })}
                <td className="px-2 py-1 text-center tabular-nums font-bold text-fg border-b border-line/60">{r.avg === null ? '—' : fmtScore(r.avg)}</td>
              </tr>
            ))}
            <tr className="font-bold text-fg">
              <td className="sticky left-0 z-10 bg-surface-2 px-2 py-1.5" />
              <td className="sticky left-14 z-10 bg-surface-2 px-3 py-1.5">Şube ortalaması</td>
              {subeAvg.map((v, i) => (
                <td key={i} className="bg-surface-2 px-1 py-1.5 text-center tabular-nums">
                  {fmtScore(v)}
                </td>
              ))}
              <td className="bg-surface-2 px-2 py-1.5 text-center tabular-nums">{fmtScore(data.subeGenel)}</td>
            </tr>
            <tr>
              <td className="sticky left-0 z-10 bg-surface px-2 py-1.5" />
              <td className="sticky left-14 z-10 bg-surface px-3 py-1.5 font-semibold text-muted">Kurum ortalaması</td>
              {kurumAvg.map((v, i) => (
                <td key={i} className="px-1 py-1.5 text-center tabular-nums text-muted">
                  {fmtScore(v)}
                </td>
              ))}
              <td className="px-2 py-1.5 text-center tabular-nums text-muted">{fmtScore(data.kurumGenel)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </KBolum>
  );
};
