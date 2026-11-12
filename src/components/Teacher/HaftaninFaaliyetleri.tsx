import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarRange, ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import { Panel, cx } from '../ui/kit';
import { dataService } from '../../services/dataService';
import {
  AY_ADLARI,
  AY_KISA,
  GUN_KISA_PAZAR,
  GUN_TAM_PAZAR,
  adParca,
  baslik,
  bugun,
  egitimYili,
  etkinlikler,
  gunEkle,
  pazartesi,
  siniflarYazi,
  takvimCanliDinle,
  takvimListesi,
  tarihCoz,
  tarihYaz,
  yilAraligi,
  type AktEtkinlik,
  type AktKayit,
} from '../../services/akademikTakvimService';

// ============================================================================
// Aşama 242: ANA SAYFA › HAFTANIN FAALİYETLERİ (akademik takvimden)
// Yalnız "Akademik takvim" bölümü açık kurumda görünür (diğer kurumlarda hiç çizilmez, boş kutu da çıkmaz).
// Haftanın 7 günü + sağda sıradaki etkinlikler. Takvimde değişiklik olunca anlık yenilenir.
// ============================================================================

const BTN = 'ui-btn ui-btn-sm h-8 justify-center';

/**
 * Aşama 246: takvim kayıtlarını okuyan ortak kanca (öğretmen ana sayfası ve müdür ana sayfası aynı kaynaktan okur).
 * acik=false iken hiç okumaz. Takvim değişince (başka sekme / başka kullanıcı) anlık yenilenir.
 * Dönüş: null = yükleniyor ya da kapalı; dizi = bu ve gelecek eğitim yılının etkinlikleri (tarih sırasıyla)
 */
export function useAkademikKayitlar(acik = true): AktKayit[] | null {
  const kurumId = dataService.getMyKurumId();
  const [kayitlar, setKayitlar] = useState<AktKayit[] | null>(null);
  const yukle = useCallback(async () => {
    if (!kurumId || !acik) return;
    // Bu yıl ve (yaz aylarında) gelecek yıl birlikte okunur: hafta geçişi ve "sıradakiler" yıl sınırında da doğru çalışır
    const y = egitimYili();
    try {
      setKayitlar(await takvimListesi(kurumId, yilAraligi(y).bas, yilAraligi(y + 1).bit));
    } catch {
      setKayitlar([]); // ana sayfa bozulmasın; hata takvim sayfasında gösterilir
    }
  }, [kurumId, acik]);
  useEffect(() => {
    if (!acik) setKayitlar(null);
    else void yukle();
  }, [acik, yukle]);
  useEffect(() => (acik ? takvimCanliDinle(kurumId, () => void yukle()) : undefined), [acik, kurumId, yukle]);
  return kurumId ? kayitlar : null;
}

export const HaftaninFaaliyetleri: React.FC<{ onTakvim: () => void }> = ({ onTakvim }) => {
  const kurumId = dataService.getMyKurumId();
  const kayitlar = useAkademikKayitlar(true);
  const [kaydir, setKaydir] = useState(0);

  const bu = bugun();
  const bugunS = tarihYaz(bu);
  const buPzt = pazartesi(bu);
  const pzt = gunEkle(buPzt, kaydir * 7);
  const paz = gunEkle(pzt, 6);
  const hepsi = useMemo(() => etkinlikler(kayitlar || []), [kayitlar]);
  const icinde = (g: AktEtkinlik, a: Date, b: Date) => g.tarih >= tarihYaz(a) && g.tarih <= tarihYaz(b);
  const hafta = hepsi.filter((g) => icinde(g, pzt, paz));
  const sonraki = hepsi.find((g) => g.tarih > tarihYaz(paz));
  const siradakiler = hepsi.filter((g) => g.tarih >= bugunS).slice(0, 4);

  if (!kurumId || kayitlar === null) return null;

  const aralik = (a: Date, b: Date) =>
    a.getMonth() === b.getMonth() ? `${a.getDate()}–${b.getDate()} ${AY_ADLARI[b.getMonth()]}` : `${a.getDate()} ${AY_ADLARI[a.getMonth()]} – ${b.getDate()} ${AY_ADLARI[b.getMonth()]}`;
  const ne = kaydir === 0 ? 'bu hafta' : `${Math.abs(kaydir)} hafta ${kaydir > 0 ? 'sonra' : 'önce'}`;
  const kalan = (s: string) => {
    const n = Math.round((tarihCoz(s).getTime() - tarihCoz(bugunS).getTime()) / 864e5);
    return n === 0 ? 'Bugün' : n === 1 ? 'Yarın' : n < 7 ? GUN_TAM_PAZAR[tarihCoz(s).getDay()] : `${n} gün`;
  };
  const tarihYazi = (s: string) => {
    const d = tarihCoz(s);
    return `${d.getDate()} ${AY_ADLARI[d.getMonth()]} ${GUN_TAM_PAZAR[d.getDay()]}`;
  };

  return (
    <Panel
      id="home-akademik-takvim"
      icon={CalendarRange}
      tone="brand"
      title="Haftanın faaliyetleri"
      description={`Akademik takvim · ${aralik(pzt, paz)} · ${ne}`}
      actions={
        <div className="flex items-center gap-1.5" role="group" aria-label="Hafta seç">
          <button type="button" className="ui-btn ui-btn-secondary ui-btn-icon h-8 w-8" aria-label="Önceki hafta" onClick={() => setKaydir((k) => k - 1)}>
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button type="button" className={cx(BTN, 'w-24 ui-btn-secondary')} disabled={kaydir === 0} onClick={() => setKaydir(0)}>
            Bu hafta
          </button>
          <button type="button" className="ui-btn ui-btn-secondary ui-btn-icon h-8 w-8" aria-label="Sonraki hafta" onClick={() => setKaydir((k) => k + 1)}>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-1 @4xl:grid-cols-[minmax(0,1fr)_17rem] gap-5">
        <div className="min-w-0">
          <div className="grid grid-flow-col auto-cols-[44%] sm:auto-cols-auto sm:grid-flow-row sm:grid-cols-[repeat(5,minmax(0,1fr))_repeat(2,minmax(0,0.65fr))] gap-2 overflow-x-auto sm:overflow-visible">
            {Array.from({ length: 7 }, (_, i) => {
              const d = gunEkle(pzt, i);
              const ds = tarihYaz(d);
              const gun = hafta.filter((g) => g.tarih === ds);
              const sonu = i > 4;
              return (
                <div
                  key={ds}
                  className={cx(
                    'rounded-xl p-2.5 min-h-32 flex flex-col gap-1.5 border',
                    ds === bugunS ? 'bg-surface border-brand ring-4 ring-brand-soft' : sonu ? 'border-dashed border-line' : 'bg-surface-2 border-transparent',
                    ds < bugunS && 'opacity-60'
                  )}
                >
                  <div className="flex items-baseline justify-between">
                    <span className={cx('text-[11px] font-semibold uppercase tracking-wide', ds === bugunS ? 'text-brand-fg' : 'text-muted')}>
                      {ds === bugunS ? 'Bugün' : GUN_KISA_PAZAR[d.getDay()]}
                    </span>
                    <b className="text-lg font-bold tabular-nums text-fg">{d.getDate()}</b>
                  </div>
                  {gun.map((g) => {
                    const [ana, konu] = adParca(g.ad);
                    return (
                      <button
                        key={g.key}
                        type="button"
                        onClick={onTakvim}
                        title={baslik(g.ad)}
                        className={cx(
                          'text-left rounded-lg bg-surface px-2 py-1.5 border-l-[3px] hover:-translate-y-px transition-transform cursor-pointer',
                          g.kapsam === 'veli' ? 'border-warning' : 'border-brand'
                        )}
                      >
                        <b className="block text-xs font-semibold text-fg leading-tight line-clamp-2">{ana}</b>
                        {konu && <span className="block text-[11px] text-fg-2 leading-tight line-clamp-2 mt-0.5">{konu}</span>}
                        <span className="flex items-center gap-1 text-[11px] text-muted mt-0.5 truncate">
                          {g.yer === 'dis' && <MapPin className="w-3 h-3 shrink-0" />}
                          {siniflarYazi(g.siniflar)}
                          {g.kapsam === 'veli' && ' · veli'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
          {!hafta.length && (
            <div className="mt-2 flex flex-wrap items-center gap-3 rounded-xl bg-surface-2 px-4 py-3 text-xs text-fg-2">
              <span className="flex-1 min-w-0">
                {hepsi.length ? 'Bu hafta takvimde etkinlik yok.' : 'Akademik takvim henüz yüklenmedi.'}
                {sonraki && (
                  <>
                    {' '}
                    Sıradaki: <b className="text-fg">{tarihYazi(sonraki.tarih)}</b>, {baslik(sonraki.ad)}
                  </>
                )}
              </span>
              {sonraki ? (
                <button
                  type="button"
                  className={cx(BTN, 'w-28 ui-btn-secondary')}
                  onClick={() => setKaydir(Math.round((pazartesi(tarihCoz(sonraki.tarih)).getTime() - buPzt.getTime()) / 6048e5))}
                >
                  O haftaya git
                </button>
              ) : (
                <button type="button" className={cx(BTN, 'w-28 ui-btn-secondary')} onClick={onTakvim}>
                  Takvime git
                </button>
              )}
            </div>
          )}
        </div>

        <aside className="@4xl:border-l @4xl:border-line @4xl:pl-5 border-t @4xl:border-t-0 border-line pt-4 @4xl:pt-0 flex flex-col gap-2 min-w-0" aria-label="Sıradaki etkinlikler">
          <p className="ui-eyebrow">Sıradakiler</p>
          {siradakiler.length ? (
            <ul className="divide-y divide-line">
              {siradakiler.map((g) => {
                const d = tarihCoz(g.tarih);
                return (
                  <li key={g.key} className="flex items-center gap-3 py-2">
                    <span className="w-10 h-11 rounded-lg bg-surface-2 flex flex-col items-center justify-center leading-none shrink-0">
                      <b className="text-base font-bold tabular-nums text-fg">{d.getDate()}</b>
                      <span className="text-[9px] font-bold uppercase tracking-wide text-muted mt-0.5">{GUN_KISA_PAZAR[d.getDay()]}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <b className="block text-xs font-semibold text-fg truncate" title={baslik(g.ad)}>
                        {baslik(g.ad)}
                      </b>
                      <span className="block text-[11px] text-muted truncate">
                        {AY_KISA[d.getMonth()]} · {siniflarYazi(g.siniflar)} · {g.yer === 'dis' ? 'okul dışı' : 'okul içi'}
                      </span>
                    </span>
                    <span className="text-[11px] font-bold text-brand-fg whitespace-nowrap">{kalan(g.tarih)}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-xs text-subtle py-2">Yaklaşan etkinlik yok</p>
          )}
          <button type="button" onClick={onTakvim} className="mt-auto self-start text-xs font-semibold text-brand-fg hover:underline inline-flex items-center gap-1 cursor-pointer" id="home-akt-tum">
            Tüm takvim <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </aside>
      </div>
    </Panel>
  );
};
