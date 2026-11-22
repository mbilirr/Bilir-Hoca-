// Deneme sihirbazı › hata ve taslak yazıları, ileri/geri düğmeleri (Aşama 363: ayrı parça)
import { ArrowLeft, ArrowRight, Save } from 'lucide-react';
import { cx } from '../../ui/kit';
import { Step, hhmm } from './ortak';
import { useSihirbazBaglam } from './useSihirbaz';

export function SihirbazAlt() {
  const { existing, startStep, step, setStep, error, saving, progress, canDraft, draftBusy, savedAt, draftNote, dirty, matching, saveDraft, leave, next, computed, doSave } = useSihirbazBaglam();
  return (
    <>
      {error && (
        <p role="alert" className="text-sm font-semibold text-danger-fg bg-danger-soft rounded-xl px-3 py-2">
          {error}
        </p>
      )}
      {draftNote && !error && (
        <p role="status" className={cx('text-xs font-semibold rounded-xl px-3 py-2', draftNote.tone === 'success' ? 'bg-success-soft text-success-fg' : 'bg-warning-soft text-warning-fg')}>
          {draftNote.text}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" disabled={saving} onClick={() => (step === 1 || (existing && step === startStep) ? leave() : setStep((step - 1) as Step))}>
          <ArrowLeft /> {step === 1 || (existing && step === startStep) ? 'Vazgeç' : 'Geri'}
        </button>
        {progress && <span className="text-xs text-muted">{progress}</span>}
        {step < 4 ? (
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            {canDraft && (
              <span className="text-xs text-muted" id="deneme-taslak-durum">
                {draftBusy ? 'Kaydediliyor…' : dirty ? 'Kaydedilmemiş değişiklik var' : savedAt ? `Kaydedildi · ${hhmm(savedAt)}` : ''}
              </span>
            )}
            {canDraft && (
              <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => void saveDraft()} disabled={draftBusy || matching} id="deneme-taslak-kaydet">
                <Save /> Kaydet
              </button>
            )}
            <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" onClick={next} disabled={matching}>
              {matching ? 'Eşleştiriliyor…' : 'Devam'} <ArrowRight />
            </button>
          </div>
        ) : (
          <button type="button" className="ui-btn ui-btn-success ui-btn-sm" disabled={saving || !computed?.list.length} onClick={() => void doSave()}>
            <Save /> {saving ? 'Kaydediliyor…' : 'Sonuçları kaydet'}
          </button>
        )}
      </div>
    </>
  );
}
export default SihirbazAlt;
