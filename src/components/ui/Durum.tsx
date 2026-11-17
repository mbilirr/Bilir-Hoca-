import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { cx } from './kit';

// ============================================================================
// Aşama 305: TEK TİP "YÜKLENİYOR" VE "OKUNAMADI" GÖRÜNÜMÜ
// - Yukleniyor: küçük dönen halka + yazı. Kısa sürede biten yüklemelerde ekranda yanıp sönmesin diye 250 ms sonra
//   yumuşakça belirir (yeri baştan ayrılır, sayfa zıplamaz). Hareket azaltma tercihinde halka dönmez.
// - YuklemeHatasi: okunamayan bölümde nedeni ve "Tekrar dene" düğmesi. Düğme deneme sürerken döner ve kilitlenir;
//   eskiden tek çare sayfayı yenilemekti.
// Boş durum için kit.tsx'teki EmptyState kullanılır.
// ============================================================================

export const Yukleniyor: React.FC<{ metin?: string; className?: string }> = ({ metin = 'Yükleniyor…', className }) => (
  <p role="status" aria-live="polite" className={cx('durum-gecikmeli inline-flex items-center gap-2 text-xs text-muted', className)}>
    <span
      aria-hidden
      className="inline-block size-3.5 shrink-0 rounded-full border-2 border-current border-r-transparent opacity-70 animate-spin motion-reduce:animate-none"
    />
    {metin}
  </p>
);

/** Deneme sürerken kilitlenen tekrar düğmesinin ortak durumu */
function useDeneme(onTekrar?: () => unknown) {
  const [deniyor, setDeniyor] = useState(false);
  const acik = useRef(true);
  useEffect(() => {
    acik.current = true; // Aşama 306: bileşen yeniden bağlanınca (geliştirme kipindeki çift bağlanma) düğme kilitli kalmasın
    return () => {
      acik.current = false;
    };
  }, []);
  const dene = async () => {
    if (!onTekrar || deniyor) return;
    setDeniyor(true);
    try {
      await onTekrar();
    } catch {
      /* hata yeni iletiyle bölümde gösterilir */
    } finally {
      if (acik.current) setDeniyor(false);
    }
  };
  return { deniyor, dene };
}

/** Ana sayfa kartları gibi dar yerlerde hata yazısının yanına konan yazı biçiminde "Tekrar dene" */
export const TekrarDugmesi: React.FC<{ onTekrar: () => unknown }> = ({ onTekrar }) => {
  const { deniyor, dene } = useDeneme(onTekrar);
  return (
    <button type="button" className="durum-tekrar" onClick={() => void dene()} disabled={deniyor} aria-busy={deniyor}>
      {deniyor ? 'Deneniyor…' : 'Tekrar dene'}
    </button>
  );
};

export const YuklemeHatasi: React.FC<{
  mesaj: React.ReactNode;
  /** Verilirse "Tekrar dene" düğmesi çıkar; söz (Promise) dönerse bitene kadar düğme kilitli kalır */
  onTekrar?: () => unknown;
  className?: string;
}> = ({ mesaj, onTekrar, className }) => {
  const { deniyor, dene } = useDeneme(onTekrar);
  return (
    <div
      role="alert"
      className={cx(
        'flex w-fit max-w-full flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-danger-soft px-3 py-2 text-xs font-semibold text-danger-fg',
        className,
      )}
    >
      <span className="min-w-0">{mesaj}</span>
      {onTekrar && (
        <button type="button" className="ui-btn ui-btn-sm ui-btn-secondary shrink-0" onClick={() => void dene()} disabled={deniyor} aria-busy={deniyor}>
          <RefreshCw className={cx('w-3.5 h-3.5', deniyor && 'animate-spin motion-reduce:animate-none')} aria-hidden />
          {deniyor ? 'Deneniyor…' : 'Tekrar dene'}
        </button>
      )}
    </div>
  );
};
