import React, { useState } from 'react';
import { Eye, Loader2 } from 'lucide-react';
import { exitKurum, readGozu } from '../../lib/kurumGecis';

// ============================================================================
// Aşama 252: KULLANICI GÖZÜYLE BAK — ekranın en üstündeki şerit
// Sistem sahibi bir kişinin gözüyle bakarken her sayfada (öğrenci portalı, öğretmen sayfaları, ana sayfalar,
// portal seçimi) görünür. "Çık" sekmeyi sistem sahibinin kendi paneline döndürür; bakış kaydı kapanır.
// Odak renkleri: lacivert zemin, açık yazı; düğme açık zemin + lacivert yazı.
// ============================================================================

const TUR: Record<string, string> = { ogrenci: 'Öğrenci', ogretmen: 'Personel' };

export const KullaniciGozuSeridi: React.FC = () => {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const k = readGozu();
  if (!k) return null;

  const cik = async () => {
    if (busy) return;
    setBusy(true);
    setErr('');
    try {
      await exitKurum();
    } catch (e: any) {
      setBusy(false);
      setErr(e?.message || 'Dönülemedi.');
    }
  };

  return (
    <div className="bg-fg text-canvas" id="kullanici-gozu-seridi" role="region" aria-label="Kullanıcı gözüyle bakış">
      <div className="app-container flex items-center gap-3 h-11 text-xs">
        <span className="relative flex w-2 h-2 shrink-0" aria-hidden="true">
          <span className="absolute inset-0 rounded-full bg-canvas/60 animate-ping motion-reduce:animate-none" />
          <span className="relative w-2 h-2 rounded-full bg-canvas" />
        </span>
        <Eye className="w-4 h-4 shrink-0 opacity-80" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">
          <span className="opacity-70">Gözüyle bakıyorsunuz: </span>
          <strong className="font-semibold">{k.ad}</strong>
          <span className="opacity-70">
            {' '}
            · {TUR[k.tur] || ''} · {k.kurumAd}
          </span>
          <span className="hidden md:inline opacity-60"> · Yaptığınız işlemler bu kişi adına işlenir ve kayda geçer.</span>
          {err && <span className="ml-2 font-semibold text-danger-soft">{err}</span>}
        </span>
        <button
          type="button"
          id="kullanici-gozu-cik"
          className="ui-btn ui-btn-sm h-8 w-24 justify-center shrink-0 bg-canvas text-fg hover:opacity-90"
          onClick={cik}
          disabled={busy}
        >
          {busy ? 'Çıkılıyor…' : 'Çık'}
        </button>
      </div>
      {busy && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/40 backdrop-blur-[1px]" role="status" aria-live="polite">
          <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-xs font-semibold text-fg shadow-lg">
            <Loader2 className="w-4 h-4 animate-spin text-brand-fg" />
            Kendi panelinize dönülüyor…
          </div>
        </div>
      )}
    </div>
  );
};
