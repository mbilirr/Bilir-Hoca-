import React, { useCallback, useEffect, useState } from 'react';
import { Bug, ChevronDown, Loader2, RefreshCw } from 'lucide-react';
import { hataOzeti, hataSil, type HataOzetSatiri } from '../../lib/hataKaydi';

// ============================================================================
// Aşama 293: Hata kayıtları (yalnız sistem sahibi; Yönetim › Yedek ve bakım)
// Kullanıcıların ekranında oluşan hatalar, aynı hata tek satırda: kaç kez, kaç kişide, en son ne zaman.
// Satıra basınca kod izi açılır. "Düzeltildi" o hatanın kayıtlarını siler; yeniden olursa yeniden görünür.
// ============================================================================

const GUNLER = [1, 7, 30] as const;
const zaman = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};
const KAYNAK: Record<string, string> = { ekran: 'Ekran', pencere: 'Kod', soz: 'İşlem' };

export const HataKayitlariPanel: React.FC = () => {
  const [gun, setGun] = useState<(typeof GUNLER)[number]>(7);
  const [rows, setRows] = useState<HataOzetSatiri[] | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [acik, setAcik] = useState<string | null>(null);
  const [mesgul, setMesgul] = useState<string | null>(null);

  const oku = useCallback(async () => {
    setHata(null);
    try {
      setRows(await hataOzeti(gun));
    } catch (e: any) {
      setRows([]);
      setHata(e?.message || 'Okunamadı.');
    }
  }, [gun]);
  useEffect(() => {
    setRows(null);
    void oku();
  }, [oku]);

  const sil = async (imza: string) => {
    setMesgul(imza);
    try {
      await hataSil(imza);
      setRows((r) => (r || []).filter((x) => x.imza !== imza));
    } catch (e: any) {
      setHata(e?.message || 'Silinemedi.');
    } finally {
      setMesgul(null);
    }
  };

  return (
    <section id="hata-kayitlari-panel" className="lg:col-span-2 bg-surface border border-line rounded-2xl p-5 shadow-lg space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-danger/10 border border-danger/25 text-danger-fg flex items-center justify-center shrink-0">
            <Bug className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-fg">Hata kayıtları</h2>
            <p className="text-xs text-muted">Kullanıcıların ekranında oluşan hatalar. Kişi adı ve öğrenci verisi kaydedilmez; 30 gün saklanır.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-line bg-surface-2 p-0.5" role="group" aria-label="Süre">
            {GUNLER.map((g) => (
              <button
                key={g}
                type="button"
                aria-pressed={gun === g}
                onClick={() => setGun(g)}
                className={`h-7 w-16 rounded-md text-xs font-semibold transition-colors ${gun === g ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg'}`}
              >
                {g === 1 ? 'Bugün' : `${g} gün`}
              </button>
            ))}
          </div>
          <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm w-8 !px-0 justify-center" onClick={() => void oku()} aria-label="Yenile" title="Yenile">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {hata && <p role="alert" className="text-xs font-semibold text-danger-fg bg-danger-soft rounded-xl px-3 py-2">{hata}</p>}

      {rows === null ? (
        <p className="flex items-center gap-2 text-xs text-muted py-4">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Okunuyor…
        </p>
      ) : rows.length === 0 ? (
        !hata && <p className="text-sm text-muted py-4 text-center">Bu sürede kayıtlı hata yok.</p>
      ) : (
        <ul className="divide-y divide-line border border-line rounded-xl overflow-hidden">
          {rows.map((r) => {
            const on = acik === r.imza;
            return (
              <li key={r.imza} className="bg-surface">
                <button
                  type="button"
                  aria-expanded={on}
                  onClick={() => setAcik(on ? null : r.imza)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-2/50 transition-colors"
                >
                  <span className="shrink-0 w-12 text-center text-sm font-bold tabular-nums text-fg">{r.adet}×</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-fg truncate">{r.mesaj}</span>
                    <span className="block text-xs text-muted truncate">
                      {r.kisi} kişi · {r.kurum ? `${r.kurum} kurum · ` : ''}
                      {(r.sayfalar || []).join(', ') || 'sayfa yok'} · son {zaman(r.son)}
                    </span>
                  </span>
                  <span className="hidden sm:inline-flex ui-chip w-16 justify-center shrink-0">{KAYNAK[r.kaynak || ''] || '—'}</span>
                  <ChevronDown className={`w-4 h-4 text-muted shrink-0 transition-transform ${on ? 'rotate-180' : ''}`} />
                </button>
                {on && (
                  <div className="px-3 pb-3 space-y-2">
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-fg-2">
                      <div><dt className="inline text-muted">İlk görülme: </dt><dd className="inline">{zaman(r.ilk)}</dd></div>
                      <div><dt className="inline text-muted">Rol: </dt><dd className="inline">{(r.roller || []).map((x) => (x === 'ogrenci' ? 'Öğrenci' : 'Öğretmen')).join(', ') || '—'}</dd></div>
                      <div className="sm:col-span-2 truncate"><dt className="inline text-muted">Tarayıcı (son): </dt><dd className="inline">{r.tarayici || '—'}</dd></div>
                      <div className="sm:col-span-2 truncate"><dt className="inline text-muted">Sürüm: </dt><dd className="inline">{(r.surumler || []).join(', ') || '—'}</dd></div>
                    </dl>
                    <pre className="text-[11px] leading-relaxed text-fg-2 bg-surface-2 border border-line rounded-lg p-2.5 overflow-x-auto max-h-56 whitespace-pre-wrap break-words">
                      {r.mesaj}
                      {r.yigin ? `\n\n${r.yigin}` : ''}
                    </pre>
                    <div className="flex justify-end">
                      <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm w-28 justify-center" disabled={mesgul === r.imza} onClick={() => void sil(r.imza)}>
                        {mesgul === r.imza ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Düzeltildi'}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
