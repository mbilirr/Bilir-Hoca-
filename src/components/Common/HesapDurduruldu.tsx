import React, { useEffect, useRef } from 'react';
import { PauseCircle } from 'lucide-react';

// Aşama 368: kurumu dondurulan kişinin açık oturumu. Tam ekran; arkadaki sayfa kullanılamaz.
// Oturum bu perde açılırken kapatılır (kurumDurumu.ts); düğme giriş ekranına döner.
// Neden ve not burada yazmaz (yalnız sistem sahibinde).
export const HesapDurduruldu: React.FC = () => {
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => btn.current?.focus(), []);
  return (
    <div className="min-h-screen bg-canvas grid place-items-center px-4" role="alertdialog" aria-modal="true" aria-labelledby="hesap-durduruldu-baslik" aria-describedby="hesap-durduruldu-metin" id="hesap-durduruldu">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 text-center shadow-lg">
        <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-warning-soft text-warning-fg" aria-hidden>
          <PauseCircle className="h-6 w-6" />
        </span>
        <h1 id="hesap-durduruldu-baslik" className="text-lg font-bold text-fg">
          Hesap durduruldu
        </h1>
        <p id="hesap-durduruldu-metin" className="mt-2 text-sm leading-relaxed text-fg-2">
          Kurumunuzun hesabı geçici olarak kullanıma kapatıldı. Kayıtlarınız güvende; hesap açıldığında yeniden girebilirsiniz.
        </p>
        <p className="mt-2 text-xs text-muted">Bilgi için okulunuzla görüşün.</p>
        <button ref={btn} type="button" className="ui-btn ui-btn-primary ui-btn-sm mt-5 h-8 w-44 justify-center" onClick={() => window.location.reload()}>
          Giriş Ekranına Dön
        </button>
      </div>
    </div>
  );
};
export default HesapDurduruldu;
