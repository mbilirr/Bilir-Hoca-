import React, { useState } from 'react';
import { Loader2, LogOut, ShieldCheck } from 'lucide-react';
import { ikiAdimDogrula } from '../../lib/ikiAdim';
import { KodKutusu } from '../ui/KodKutusu';

// ============================================================================
// Aşama 294: girişte ikinci adım. Şifre doğru girildi; iki adımlı girişi açık hesaptan (sistem sahibi)
// kod uygulamasındaki 6 haneli kod istenir. Kod doğrulanınca sayfa yenilenir: bütün veriler kod girilmiş
// oturumla baştan okunur (kod girilmeden okunan yetkisiz yanıtlar ekranda kalmaz).
// ============================================================================
export const IkiAdimGirisi: React.FC<{ ad?: string; onCikis: () => void }> = ({ ad, onCikis }) => {
  const [kod, setKod] = useState('');
  const [mesgul, setMesgul] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  const dogrula = async (deger: string) => {
    if (mesgul) return;
    setMesgul(true);
    setHata(null);
    try {
      await ikiAdimDogrula(deger);
      // Kod girilmeden önce okunan kurum bilgisi (veritabanı o an sistem sahibi saymadı) atılır; yenilemede baştan okunur
      try {
        sessionStorage.removeItem('edu_my_kurum_v1');
      } catch {}
      window.location.reload();
    } catch (e: any) {
      setHata(e?.message || 'Kod doğrulanamadı.');
      setKod('');
      setMesgul(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas text-fg flex items-center justify-center px-4 py-10">
      <main className="w-full max-w-sm bg-surface border border-line rounded-2xl shadow-lg p-6 text-center" aria-labelledby="iki-adim-baslik">
        <div className="w-12 h-12 rounded-2xl bg-brand-soft text-brand-fg flex items-center justify-center mx-auto">
          <ShieldCheck className="w-6 h-6" />
        </div>
        {ad && <p className="mt-4 text-sm text-muted">Hoş geldiniz, {ad}</p>}
        <h1 id="iki-adim-baslik" className="mt-1 text-xl font-bold tracking-tight">
          Doğrulama kodu
        </h1>
        <p className="mt-2 text-sm text-muted">Telefonunuzdaki kod uygulamasında bilirEdu için görünen 6 haneli kodu girin.</p>

        <form
          className="mt-5 flex flex-col items-center gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void dogrula(kod);
          }}
        >
          <KodKutusu id="iki-adim-kod" value={kod} onChange={setKod} onTam={(v) => void dogrula(v)} disabled={mesgul} autoFocus hata={!!hata} />
          {hata && (
            <p role="alert" className="text-xs font-semibold text-danger-fg">
              {hata}
            </p>
          )}
          <button type="submit" id="iki-adim-dogrula" className="ui-btn ui-btn-primary w-44 justify-center" disabled={mesgul || kod.length !== 6}>
            {mesgul ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Doğrula'}
          </button>
        </form>

        <div className="mt-5 pt-4 border-t border-line flex justify-center">
          <button type="button" onClick={onCikis} className="ui-btn ui-btn-ghost ui-btn-sm w-28 justify-center text-muted">
            <LogOut className="w-3.5 h-3.5" />
            Çıkış
          </button>
        </div>
      </main>
    </div>
  );
};
