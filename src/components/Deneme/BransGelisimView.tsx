import React from 'react';
import { BookOpen } from 'lucide-react';
import { Panel, cx } from '../ui/kit';
import { fmtScore } from '../../lib/deneme/lgs';
import { dateRange, dateTr, examShort } from '../../lib/deneme/karneModel';
import { bransTitle, type BransGelisim } from '../../lib/deneme/bransKarne';

// ============================================================================
// Aşama 130: Branş şube gelişim karnesi (ekran). Hesap lib/deneme/bransKarne.ts'te; PDF aynı veriden.
// Satır = öğrenci, sütun = deneme; hücre = dersin neti (kurum ortalamasına göre renkli).
// ============================================================================

const TONE_CELL: Record<'success' | 'danger', string> = {
  success: 'bg-success-soft text-success-fg font-bold',
  danger: 'bg-danger-soft text-danger-fg font-bold',
};
const TH = 'sticky top-0 z-20 bg-surface-2 px-1 py-2 text-center font-semibold border-b border-line';

export const BransGelisimView: React.FC<{ data: BransGelisim | null; scopeLabel: string }> = ({ data, scopeLabel }) => {
  if (!data) return <p className="text-sm text-muted">Seçilen kapsamda bu dersi içeren deneme yok.</p>;
  const { exams, counts, rows, subeAvg, kurumAvg } = data;
  return (
    <Panel
      title={bransTitle(data.subject)}
      description={`${data.className} · ${scopeLabel} (${exams.length} deneme) · ${dateRange(exams)} · Yeşil: kurum ortalamasının üstü · Kırmızı: altı · —: girmedi`}
      icon={BookOpen}
      tone="info"
      padded={false}
    >
      <div className="overflow-auto max-h-[36rem]">
        <table className="w-full text-xs text-fg-2 border-separate border-spacing-0">
          <thead className="text-muted">
            <tr>
              <th className="sticky top-0 left-0 z-30 bg-surface-2 px-2 py-2 text-center font-semibold border-b border-line w-14">No</th>
              <th className="sticky top-0 left-14 z-30 bg-surface-2 px-3 py-2 text-left font-semibold border-b border-line min-w-40">Adı Soyadı</th>
              {exams.map((e, i) => (
                <th key={e.id} className={cx(TH, 'min-w-16')} title={`${e.name} · ${dateTr(e.examDate)} · ${counts[i]} soru`}>
                  <span className="block font-normal text-[10px] truncate max-w-20 mx-auto">{examShort(e)}</span>
                  <span className="block font-normal text-[10px] tabular-nums">{dateTr(e.examDate)}</span>
                  <span className="block text-[10px] tabular-nums">{counts[i]} soru</span>
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
                    <td key={i} className="p-0.5 border-b border-line/60">
                      <span className={cx('block rounded-md py-1 text-center tabular-nums', v === null ? 'text-subtle' : t ? TONE_CELL[t] : 'text-fg')}>
                        {v === null ? '—' : fmtScore(v)}
                      </span>
                    </td>
                  );
                })}
                <td className="px-2 py-1 text-center tabular-nums font-bold text-fg border-b border-line/60">{r.avg === null ? '—' : fmtScore(r.avg)}</td>
              </tr>
            ))}
            <tr className="font-bold">
              <td className="sticky left-0 z-10 bg-info-soft px-2 py-1.5" />
              <td className="sticky left-14 z-10 bg-info-soft px-3 py-1.5 text-info-fg">Şube ortalaması</td>
              {subeAvg.map((v, i) => (
                <td key={i} className="bg-info-soft px-1 py-1.5 text-center tabular-nums text-info-fg">{fmtScore(v)}</td>
              ))}
              <td className="bg-info-soft px-2 py-1.5 text-center tabular-nums text-info-fg">{fmtScore(data.subeGenel)}</td>
            </tr>
            <tr>
              <td className="sticky left-0 z-10 bg-surface-2 px-2 py-1.5" />
              <td className="sticky left-14 z-10 bg-surface-2 px-3 py-1.5 font-semibold text-muted">Kurum ortalaması</td>
              {kurumAvg.map((v, i) => (
                <td key={i} className="bg-surface-2 px-1 py-1.5 text-center tabular-nums text-muted">{fmtScore(v)}</td>
              ))}
              <td className="bg-surface-2 px-2 py-1.5 text-center tabular-nums text-muted">{fmtScore(data.kurumGenel)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Panel>
  );
};
