import React, { useMemo, useState } from 'react';
import { FileSpreadsheet, FileText, KeySquare } from 'lucide-react';
import { Modal, Segmented, cx } from '../ui/kit';
import type { DenemeExam } from '../../services/denemeService';
import { dateTr } from '../../lib/deneme/karneModel';
import { downloadKarnePdf } from '../../lib/deneme/karnePdf';
import { bookletKey, downloadKeyExcel, hasBMapping, showLetter, type Booklet } from '../../lib/deneme/anahtarCikti';
import { kitapciklarOf } from '../../lib/deneme/lgs';
import { useBildirimKanali } from '../../lib/bildirim'; // Aşama 353
import { InfoTip } from '../ui/Compact'; // Aşama 215

// ============================================================================
// Aşama 91: Cevap anahtarı penceresi — A / B kitapçığı anahtarını gösterir, Excel ya da PDF olarak indirir.
// Yalnızca kayıtlı anahtarı okur; hiçbir şeyi değiştirmez (salt okunur kullanıcılar da açabilir).
// ============================================================================

const BTN = 'ui-btn ui-btn-sm w-28 justify-center';

export const CevapAnahtariModal: React.FC<{ exam: DenemeExam; open: boolean; onClose: () => void }> = ({ exam, open, onClose }) => {
  const [booklet, setBooklet] = useState<Booklet>('A');
  const [busy, setBusy] = useState<'' | 'xlsx' | 'pdf'>('');
  const setMsg = useBildirimKanali(); // Aşama 353: ortak bildirim
  const subs = exam.subjects;
  const qs = exam.questions;
  const mapped = useMemo(() => hasBMapping(subs, qs), [subs, qs]);
  // Aşama 336: 4 kitapçıklı denemede C ve D sekmeleri de görünür
  const kitaplar = useMemo(() => kitapciklarOf(qs), [qs]);
  const keys = useMemo(() => subs.map((s) => ({ s, key: bookletKey(s, qs, booklet) })), [subs, qs, booklet]);
  const file = `Cevap-Anahtari-${exam.name}`.replace(/[\\/:*?"<>|]+/g, ' ').trim();

  const run = async (kind: 'xlsx' | 'pdf') => {
    setBusy(kind);
    setMsg(null);
    try {
      if (kind === 'xlsx') {
        await downloadKeyExcel(exam.name, subs, qs, file);
      } else {
        const info = [exam.publisher, dateTr(exam.examDate), `${exam.grade}. sınıf ${exam.examType}`].filter(Boolean).join(' · ');
        const max = Math.max(0, ...subs.map((s) => s.count));
        const table = (b: Booklet) => {
          const ks = subs.map((s) => bookletKey(s, qs, b));
          return {
            kind: 'table' as const,
            head: ['Soru', ...subs.map((s) => s.short)],
            rows: Array.from({ length: max }, (_, i) => [i + 1, ...ks.map((k, j) => (i < subs[j].count ? showLetter(k[i]) : ''))]),
            align: ['center', ...subs.map(() => 'center' as const)] as Array<'center'>,
            fontSize: 8.4,
          };
        };
        await downloadKarnePdf(
          [
            ...kitaplar.flatMap((b, i) => [
              ...(i ? [{ kind: 'pagebreak' as const }] : []),
              { kind: 'title' as const, text: `${exam.name} — Cevap anahtarı`, sub: info },
              { kind: 'heading' as const, text: `${b} kitapçığı` },
              table(b),
            ]),
            { kind: 'text', text: mapped ? 'İ: iptal edilen soru (herkese doğru sayılır).' : 'Bu denemede B karşılığı girilmemiş; B kitapçığı A ile aynı sırada sayılır. İ: iptal edilen soru.' },
          ],
          `${exam.name} cevap anahtarı`,
          file
        );
      }
    } catch (e: any) {
      setMsg(e?.message || 'Dosya hazırlanamadı.');
    } finally {
      setBusy('');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      id="cevap-anahtari-modal"
      icon={KeySquare}
      title="Cevap anahtarı"
      description={exam.name}
      footer={
        <>
          <button type="button" className={cx(BTN, 'ui-btn-secondary')} onClick={onClose}>
            Kapat
          </button>
          <button type="button" className={cx(BTN, 'ui-btn-secondary')} disabled={!!busy} onClick={() => void run('xlsx')} id="anahtar-excel">
            <FileSpreadsheet /> {busy === 'xlsx' ? 'Hazırlanıyor' : 'Excel indir'}
          </button>
          <button type="button" className={cx(BTN, 'ui-btn-primary')} disabled={!!busy} onClick={() => void run('pdf')} id="anahtar-pdf">
            <FileText /> {busy === 'pdf' ? 'Hazırlanıyor' : 'PDF indir'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <Segmented
          size="sm"
          value={booklet}
          onChange={setBooklet}
          items={kitaplar.map((b) => ({ value: b, label: `${b} kitapçığı`, id: `anahtar-${b.toLowerCase()}` }))}
        />
        {booklet === 'B' && !mapped && (
          <p className="text-xs font-semibold text-warning-fg bg-warning-soft rounded-lg px-2.5 py-1.5">
            Bu denemede B karşılığı girilmemiş; B kitapçığı A ile aynı sırada sayılıyor.
          </p>
        )}
        {keys.map(({ s, key }) => (
          <div key={s.key} data-ders={s.key}>
            <p className="text-xs font-bold text-fg mb-1">
              {s.name} <span className="font-normal text-muted">· {s.count} soru</span>
            </p>
            <div className="grid grid-cols-10 gap-1">
              {key.map((a, i) => (
                <div key={i} className="flex flex-col items-center" title={`${booklet} kitapçığı ${i + 1}. soru: ${a === 'X' ? 'iptal' : a || 'girilmemiş'}`}>
                  <span className="text-3xs leading-3 text-muted tabular-nums">{i + 1}</span>
                  <span
                    className={cx(
                      'flex h-6 w-full max-w-7 items-center justify-center rounded-lg border text-xs font-black',
                      a === 'X' ? 'border-warning/40 bg-warning-soft text-warning-fg' : a ? 'border-line bg-surface-2 text-fg' : 'border-dashed border-line text-muted'
                    )}
                  >
                    {showLetter(a)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
        <p className="text-xs text-muted flex items-center gap-1">İ: iptal edilen soru (herkese doğru sayılır).<InfoTip text="Excel dosyası yayınevi düzenindedir; başka bir denemeye de yüklenebilir." /></p>
      </div>
    </Modal>
  );
};
