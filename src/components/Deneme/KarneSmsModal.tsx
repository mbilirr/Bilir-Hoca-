import React, { useEffect, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { Modal, cx } from '../ui/kit';

// ============================================================================
// Aşama 101: "Tümüne SMS" penceresi — alıcı seçimi (öğrenci / veli). Gönderim döngüsü TopluKarneGonder'de.
// ============================================================================
const BTN = 'ui-btn ui-btn-sm h-8 w-28 justify-center';

export type SmsAudience = { ogrenci: boolean; veli: boolean };

export const KarneSmsModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onSend: (audience: SmsAudience) => void;
  className: string;
  count: number | null; // sonucu olan öğrenci sayısı (yüklenmediyse null)
  turName: string;
}> = ({ open, onClose, onSend, className, count, turName }) => {
  const [aud, setAud] = useState<SmsAudience>({ ogrenci: false, veli: false });
  useEffect(() => {
    if (open) setAud({ ogrenci: false, veli: false });
  }, [open]);
  const any = aud.ogrenci || aud.veli;
  const box = (key: keyof SmsAudience, label: string) => (
    <label className={cx('flex h-8 flex-1 cursor-pointer items-center gap-2 rounded-xl border px-3 text-xs font-semibold', aud[key] ? 'border-brand/40 bg-brand-soft text-fg' : 'border-line text-fg-2')}>
      <input type="checkbox" checked={aud[key]} onChange={() => setAud((a) => ({ ...a, [key]: !a[key] }))} className="accent-indigo-600" data-aud={key} />
      {label}
    </label>
  );
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={MessageSquare}
      title={`Sınıfa SMS: ${className}`}
      size="sm"
      id="karne-sms-modal"
      footer={
        <>
          <button type="button" className={cx(BTN, 'ui-btn-secondary')} onClick={onClose}>
            Vazgeç
          </button>
          <button type="button" id="karne-sms-gonder" className={cx(BTN, 'ui-btn-primary')} disabled={!any} onClick={() => onSend(aud)}>
            <MessageSquare className="w-3.5 h-3.5" /> Gönder
          </button>
        </>
      }
    >
      <div className="space-y-2 text-xs text-fg-2">
        <p className="font-semibold text-fg">Kime gitsin?</p>
        <div className="flex gap-2">
          {box('ogrenci', 'Öğrenci')}
          {box('veli', 'Veli')}
        </div>
        <p className="leading-relaxed">
          {count === null ? 'Öğrenciler yükleniyor…' : `${count} öğrenciye ${turName} linki gidecek · 30 gün geçerli.`} Her kişiye yalnızca kendi karnesinin linki gider; SMS'te ad ve puan yazmaz.
        </p>
      </div>
    </Modal>
  );
};
