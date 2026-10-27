import React, { useEffect, useState } from 'react';
import { Building2, ArrowLeftRight, Loader2 } from 'lucide-react';
import { cx } from '../ui/kit';
import { canUseKurumSecici, enterKurum, exitKurum, gecisKurumlari, readGecis, type GecisKurum } from '../../lib/kurumGecis';

// ============================================================================
// Aşama 97: üst menüde kurum seçici (yalnızca genel yönetici) ve kurumdayken görünen uyarı şeridi.
// Liste yalnızca seçici ilk açıldığında bir kez okunur.
// ============================================================================

const Busy: React.FC<{ text: string }> = ({ text }) => (
  <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/40 backdrop-blur-[1px]" role="status" aria-live="polite">
    <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-xs font-semibold text-fg shadow-lg">
      <Loader2 className="w-4 h-4 animate-spin text-brand-fg" />
      {text}
    </div>
  </div>
);

export const KurumSecici: React.FC = () => {
  const [kurumlar, setKurumlar] = useState<GecisKurum[] | null>(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const show = canUseKurumSecici();
  const active = readGecis()?.active || null;

  const load = () => {
    if (kurumlar) return;
    gecisKurumlari()
      .then(setKurumlar)
      .catch(() => setKurumlar([]));
  };
  // Kurumdayken liste saklıdır; genel yöneticide açılış bittikten sonra bir kez okunur (açılışı yavaşlatmaz)
  useEffect(() => {
    if (!show) return;
    if (active) return load();
    const t = setTimeout(load, 2500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);
  useEffect(() => {
    if (!err) return;
    const t = setTimeout(() => setErr(''), 8000);
    return () => clearTimeout(t);
  }, [err]);

  if (!show) return null;

  const go = async (id: string) => {
    if ((active?.id || '') === id) return;
    setErr('');
    const name = (kurumlar || []).find((k) => k.id === id)?.name || '';
    setBusy(id ? `${name || 'Kurum'} açılıyor…` : 'Kendi panelinize dönülüyor…');
    try {
      if (id) await enterKurum(id);
      else await exitKurum();
    } catch (e: any) {
      setBusy('');
      setErr(e?.message || 'Geçiş yapılamadı.');
    }
  };

  return (
    <div className="relative shrink-0">
      <label
        className={cx(
          'relative flex items-center gap-1.5 h-8 rounded-lg border text-xs font-semibold cursor-pointer w-8 sm:w-44 justify-center sm:justify-start sm:px-2',
          active ? 'border-warning/50 bg-warning-soft text-warning-fg' : 'border-line bg-surface-2 text-fg-2 hover:border-line-strong'
        )}
        title="Kurumlar arası geçiş"
      >
        <Building2 className="w-4 h-4 shrink-0" />
        <span className="hidden sm:block truncate flex-1">{active ? active.name : 'Kendi panelim'}</span>
        <select
          id="kurum-secici"
          aria-label="Kurumlar arası geçiş"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          value={active?.id || ''}
          onFocus={load}
          onMouseDown={load}
          onChange={(e) => void go(e.target.value)}
          disabled={!!busy}
        >
          <option value="">Kendi panelim</option>
          {kurumlar === null && !active && <option disabled>Kurumlar yükleniyor…</option>}
          {active && !(kurumlar || []).some((k) => k.id === active.id) && <option value={active.id}>{active.name}</option>}
          {(kurumlar || []).map((k) => (
            <option key={k.id} value={k.id}>
              {k.name}
            </option>
          ))}
        </select>
      </label>
      {err && (
        <p role="alert" className="absolute right-0 top-10 z-50 w-64 rounded-lg bg-danger-soft text-danger-fg px-2.5 py-1.5 text-xs font-semibold shadow">
          {err}
        </p>
      )}
      {busy && <Busy text={busy} />}
    </div>
  );
};

/** Kurumdayken üst menünün altında görünen şerit */
export const KurumGecisSeridi: React.FC = () => {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const g = readGecis();
  if (!g?.active) return null;
  return (
    <div className="border-t border-warning/30 bg-warning-soft text-warning-fg" id="kurum-gecis-seridi">
      <div className="app-container flex flex-wrap items-center gap-2 py-1.5 text-xs">
        <ArrowLeftRight className="w-3.5 h-3.5 shrink-0" />
        <span className="min-w-0 flex-1">
          Genel yönetici olarak <strong>{g.active.name}</strong> kurumundasınız. Yaptığınız değişiklikler bu kurumun kayıtlarına,
          kurum yöneticisi adına işlenir.
          {err && <span className="ml-1 font-semibold text-danger-fg">{err}</span>}
        </span>
        <button
          type="button"
          id="kurum-gecis-don"
          className="ui-btn ui-btn-sm ui-btn-secondary h-8 w-36 justify-center"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setErr('');
            try {
              await exitKurum();
            } catch (e: any) {
              setBusy(false);
              setErr(e?.message || 'Dönülemedi.');
            }
          }}
        >
          {busy ? 'Dönülüyor…' : 'Kendi panelime dön'}
        </button>
      </div>
      {busy && <Busy text="Kendi panelinize dönülüyor…" />}
    </div>
  );
};
