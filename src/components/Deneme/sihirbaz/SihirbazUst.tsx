// Deneme sihirbazı › başlık satırı ve adım göstergesi (Aşama 363: ayrı parça)
import { ArrowLeft, CheckCircle2, Trash2 } from 'lucide-react';
import { cx } from '../../ui/kit';
import { STEPS, BACK_BTN } from './ortak';
import { useSihirbazBaglam } from './useSihirbaz';

export function SihirbazUst() {
  const { existing, grade, step, name, draftId, draftBusy, setDeleteAsk, leave } = useSihirbazBaglam();
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={BACK_BTN} onClick={leave} id="deneme-wizard-geri">
          <ArrowLeft /> Denemelere dön
        </button>
        <h2 className="text-base font-semibold text-fg">{existing ? `${existing.name}: Optik Yükleme` : draftId ? name.trim() || 'Yeni Deneme' : 'Yeni Deneme'}</h2>
        {/^\d+$/.test(grade) && (
          <span className="ui-chip ui-chip-info" id="deneme-wizard-sinif" title="Deneme bu sınıf düzeyine kaydedilir">
            {grade}. sınıf
          </span>
        )}
        {draftId && (
          <span className="ui-chip ui-chip-warning" id="deneme-taslak-chip">
            Taslak
          </span>
        )}
        {draftId && (
          <button type="button" className="ui-btn ui-btn-danger-soft ui-btn-sm ml-auto" disabled={draftBusy} onClick={() => setDeleteAsk(true)} id="deneme-taslak-sil">
            <Trash2 /> Taslağı sil
          </button>
        )}
      </div>

      <ol className="flex flex-wrap gap-2" aria-label="Adımlar">
        {STEPS.map((s) => (
          <li
            key={s.n}
            className={cx(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold border',
              s.n === step ? 'bg-brand-soft text-brand-fg border-brand/30' : s.n < step ? 'bg-success-soft text-success-fg border-transparent' : 'bg-surface-2 text-muted border-line'
            )}
            aria-current={s.n === step ? 'step' : undefined}
          >
            {s.n < step ? <CheckCircle2 className="w-3.5 h-3.5" /> : <span className="tabular-nums">{s.n}</span>}
            {s.title}
          </li>
        ))}
      </ol>
    </>
  );
}
export default SihirbazUst;
