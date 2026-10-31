import React, { useEffect, useState } from 'react';
import { Mail, MessageSquare } from 'lucide-react';
import { Modal, cx } from '../ui/kit';

// ============================================================================
// Aşama 101: "Tümüne SMS" penceresi — alıcı seçimi (öğrenci / veli). Gönderim döngüsü TopluKarneGonder'de.
// Aşama 119: aynı küçük pencere e-posta için de kullanılır (kind) ve üç kapsamı gösterir:
//   seçili öğrenci → yalnız o öğrenci / velisi · sınıf → sınıfın tamamı · tüm sınıflar → herkes.
//   Veli kutusu işaretli açılır (karne çoğunlukla veliye gider); öğrenci de eklenebilir.
// ============================================================================
const BTN = 'ui-btn ui-btn-sm h-8 w-28 justify-center';

export type SmsAudience = { ogrenci: boolean; veli: boolean };
export type KarneSendKind = 'sms' | 'mail';

export const KarneSmsModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onSend: (audience: SmsAudience) => void;
  /** Başlıktaki kapsam: öğrenci adı, sınıf adı ya da "Tüm sınıflar" */
  className: string;
  count: number | null; // sonucu olan öğrenci sayısı (yüklenmediyse null)
  turName: string;
  kind?: KarneSendKind;
  /** true: tek öğrenci (sayı yazılmaz) */
  single?: boolean;
}> = ({ open, onClose, onSend, className, count, turName, kind = 'sms', single = false }) => {
  const [aud, setAud] = useState<SmsAudience>({ ogrenci: false, veli: true });
  useEffect(() => {
    if (open) setAud({ ogrenci: false, veli: true });
  }, [open]);
  const any = aud.ogrenci || aud.veli;
  const sms = kind === 'sms';
  const Icon = sms ? MessageSquare : Mail;
  const box = (key: keyof SmsAudience, label: string) => (
    <label className={cx('flex h-8 flex-1 cursor-pointer items-center gap-2 rounded-xl border px-3 text-xs font-semibold', aud[key] ? 'border-brand/40 bg-brand-soft text-fg' : 'border-line text-fg-2')}>
      <input type="checkbox" checked={aud[key]} onChange={() => setAud((a) => ({ ...a, [key]: !a[key] }))} className="accent-indigo-600" data-aud={key} />
      {label}
    </label>
  );
  const who = single ? `${className} için` : count === null ? null : `${count} öğrenci için`;
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={Icon}
      title={`${sms ? 'SMS' : 'E-posta'}: ${className}`}
      size="sm"
      id={sms ? 'karne-sms-modal' : 'karne-mail-modal'}
      footer={
        <>
          <button type="button" className={cx(BTN, 'ui-btn-secondary')} onClick={onClose}>
            Vazgeç
          </button>
          <button type="button" id={sms ? 'karne-sms-gonder' : 'karne-mail-gonder'} className={cx(BTN, 'ui-btn-primary')} disabled={!any} onClick={() => onSend(aud)}>
            <Icon className="w-3.5 h-3.5" /> Gönder
          </button>
        </>
      }
    >
      <div className="space-y-2 text-xs text-fg-2">
        <p className="font-semibold text-fg">Kime gitsin?</p>
        <div className="flex gap-2">
          {box('veli', 'Veli')}
          {box('ogrenci', 'Öğrenci')}
        </div>
        <p className="leading-relaxed">
          {who === null
            ? 'Öğrenciler yükleniyor…'
            : sms
              ? `${who} ${turName} linki gidecek · 30 gün geçerli. Her kişiye yalnızca kendi karnesinin linki gider; SMS'te ad ve puan yazmaz.`
              : `${who} ${turName} PDF ekiyle gidecek. Her kişiye yalnızca kendi karnesi gider; adresler sunucuda bulunur.`}
        </p>
      </div>
    </Modal>
  );
};
