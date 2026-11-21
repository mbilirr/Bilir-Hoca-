import React, { useEffect, useState } from 'react';
import { Hourglass, LogOut } from 'lucide-react';
import { Modal } from '../ui/kit';

// Aşama 344: boşta kalan oturum kapanmadan 1 dakika önce uyarı. "Devam et" (ya da herhangi bir hareket) süreyi yeniler.
// Süre dolunca onSure çağrılır; asıl kapatma kararı App'teki denetimdedir (bekleyen kayıt varken oturum kapanmaz).
export const OturumUyarisi: React.FC<{ bitis: number | null; onDevam: () => void; onCikis: () => void; onSure: () => void }> = ({
  bitis,
  onDevam,
  onCikis,
  onSure,
}) => {
  const [simdi, setSimdi] = useState(() => Date.now());
  useEffect(() => {
    if (!bitis) return;
    setSimdi(Date.now());
    const t = setInterval(() => setSimdi(Date.now()), 1000);
    return () => clearInterval(t);
  }, [bitis]);
  const kalan = bitis ? Math.max(0, Math.ceil((bitis - simdi) / 1000)) : 0;
  useEffect(() => {
    if (bitis && kalan === 0) onSure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bitis, kalan]);

  return (
    <Modal
      open={!!bitis}
      onClose={onDevam}
      icon={Hourglass}
      tone="warning"
      size="sm"
      title="Oturumunuz kapanmak üzere"
      layerClass="z-(--z-kritik)"
      footer={
        <>
          <button type="button" id="oturum-uyari-cikis" onClick={onCikis} className="ui-btn ui-btn-secondary ui-btn-sm h-8 w-28">
            <LogOut className="w-3.5 h-3.5" />
            Çıkış yap
          </button>
          <button type="button" id="oturum-uyari-devam" onClick={onDevam} className="ui-btn ui-btn-primary ui-btn-sm h-8 w-28">
            Devam et
          </button>
        </>
      }
    >
      <p className="text-sm text-fg-2 leading-relaxed" aria-live="polite">
        Bir süredir işlem yapılmadı. Güvenliğiniz için oturum{' '}
        <span className="font-semibold text-fg tabular-nums whitespace-nowrap" id="oturum-uyari-kalan">
          {kalan} saniye
        </span>{' '}
        sonra kapanacak.
      </p>
      <p className="text-xs text-muted mt-2">Yarım kalan ödev, etüt ve duyuru formlarınız taslak olarak saklanır.</p>
    </Modal>
  );
};
