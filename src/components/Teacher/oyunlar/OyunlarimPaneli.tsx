// ============================================================================
// Aşama 381: Oyunlar — "Oyunlarım" sekmesi: hazırlanan oyunların listesi; yenisini hazırla, ayrıntıyı aç
// ============================================================================
import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { Gamepad2, Plus } from 'lucide-react';
import { lazyNamed } from '../../../lib/lazyLoad';
import { EmptyState, Panel, cx } from '../../ui/kit';
import { Button } from '../../ui/Button';
import { Yukleniyor, YuklemeHatasi } from '../../ui/Durum';
import { DURUM_AD, MOD_AD, OYUN_LISTE_TABLOSU, birimAd, listOyunlar, type OyunKaydi } from '../../../services/oyunOturumService';
import { useTabloSurumu } from '../../../lib/tabloSurumu';
import { MOD_SIMGE, tarihYaz } from './ortak';

const OyunHazirla = lazyNamed<React.ComponentProps<typeof import('./OyunHazirla').OyunHazirla>>(() => import('./OyunHazirla'), 'OyunHazirla');
const OyunDetay = lazyNamed<React.ComponentProps<typeof import('./OyunDetay').OyunDetay>>(() => import('./OyunDetay'), 'OyunDetay');

export const OyunlarimPaneli: React.FC<{ yeniAc: boolean; onYeniKapandi: () => void }> = ({ yeniAc, onYeniKapandi }) => {
  const [liste, setListe] = useState<OyunKaydi[] | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [acik, setAcik] = useState<string | null>(null);
  const [baslangic, setBaslangic] = useState<import('./OyunHazirla').OyunBaslangic | null>(null);

  const yukle = useCallback(async () => {
    try {
      setListe(await listOyunlar());
      setHata(null);
    } catch (e) {
      setHata(e instanceof Error ? e.message : 'Oyunlar yüklenemedi.');
    }
  }, []);
  // Aşama 386: oyun hazırlanınca / kapatılınca / uzatılınca / silinince liste kendiliğinden tazelenir (sql/386)
  const surum = useTabloSurumu(OYUN_LISTE_TABLOSU);
  useEffect(() => {
    void yukle();
  }, [yukle, surum]);

  const secili = liste?.find((o) => o.id === acik) || null;

  return (
    <>
      {hata && <YuklemeHatasi mesaj={hata} onTekrar={yukle} />}
      {!hata && liste === null && <Yukleniyor satir={4} metin="Oyunlar yükleniyor…" />}
      {liste && (
        <Panel title="Oyunlarım" description={`${liste.length} oyun`}>
          {liste.length === 0 ? (
            <EmptyState
              icon={Gamepad2}
              title="Henüz oyun hazırlanmadı"
              description="Soru bankasından sorularını seç, öğrencilerine bir bağlantı ya da QR kod ver."
              action={
                <Button leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={() => setAcik('yeni')}>
                  Yeni oyun
                </Button>
              }
            />
          ) : (
            <ul className="space-y-2.5">
              {liste.map((o) => (
                <li key={o.id}>
                  <button type="button" onClick={() => setAcik(o.id)} className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface p-3.5 text-left transition-colors hover:bg-surface-2">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-fg" title={MOD_AD[o.mod]}>
                      {React.createElement(MOD_SIMGE[o.mod], { className: 'w-4 h-4', 'aria-hidden': true })}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-fg">{o.ad}</span>
                      <span className="block truncate text-xs text-muted">
                        {MOD_AD[o.mod]} · {o.classAd} · {o.soruSayisi} {birimAd(o.mod)} · {tarihYaz(o.createdAt)}
                      </span>
                    </span>
                    <span className={cx('shrink-0 rounded-lg px-2 py-1 text-2xs font-semibold', o.durum === 'acik' ? 'bg-success-soft text-success-fg' : o.durum === 'doldu' ? 'bg-warning-soft text-warning-fg' : 'bg-surface-2 text-fg-2')}>
                      {DURUM_AD[o.durum]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      <Suspense fallback={null}>
        {(yeniAc || acik === 'yeni') && (
          <OyunHazirla
            baslangic={baslangic}
            onClose={() => {
              setAcik(null);
              setBaslangic(null);
              onYeniKapandi();
            }}
            onCreated={(id) => {
              setBaslangic(null);
              onYeniKapandi();
              void yukle().then(() => setAcik(id));
            }}
          />
        )}
        {secili && (
          <OyunDetay
            key={secili.id}
            oyun={secili}
            onClose={() => setAcik(null)}
            onChanged={yukle}
            onZayifOyun={(b) => {
              setBaslangic(b);
              setAcik('yeni');
            }}
          />
        )}
      </Suspense>
    </>
  );
};
