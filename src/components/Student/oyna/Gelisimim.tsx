// ============================================================================
// Aşama 397: GELİŞİMİM — öğrenci kendi gelişimini görür (sınıfla kıyas yok).
//   • Son 4 hafta: her gün çözülen soru sayısına göre koyulaşan takvim, seri ve en uzun seri.
//   • Konularım (son 30 gün): bütün oyunlardan doğru oranı; Usta = en az 10 soruda %80; düşük konu Çalışma'da açılır.
//   • Rozetlerim: kazanılanlar ve kazanılmayanların ilerlemesi. Rozetler veritabanında verilir; burası yalnız gösterir.
// ============================================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ChevronRight } from 'lucide-react';
import { Button } from '../../ui/Button';
import { cx } from '../../ui/kit';
import { gelisimim, ROZETLER, rozetIlerleme, takvimIzgarasi, USTA_EN_AZ, USTA_ORAN, type Gelisim } from '../../../services/oyunOgrenciService';

const GUNLER = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'];
const tarihYaz = (gun: string) => new Date(gun + 'T12:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });

/** Takvim karesinin koyuluğu: o gün çözülen soruya göre 4 basamak */
function koyuluk(n: number, enCok: number): string {
  if (!n) return 'bg-surface-2';
  const o = n / Math.max(enCok, 1);
  if (o > 0.66) return 'bg-brand';
  if (o > 0.33) return 'bg-brand/70';
  return 'bg-brand/35';
}

const Baslik: React.FC<{ children: React.ReactNode; sag?: React.ReactNode }> = ({ children, sag }) => (
  <div className="flex items-baseline justify-between gap-2">
    <h3 className="text-2xs font-bold uppercase tracking-wider text-brand-fg">{children}</h3>
    {sag ? <span className="text-xs text-subtle">{sag}</span> : null}
  </div>
);

export const Gelisimim: React.FC<{ onKonu: (ders: string, konu: string) => void }> = ({ onKonu }) => {
  const [g, setG] = useState<Gelisim | null>(null);
  const [hata, setHata] = useState('');

  const yukle = useCallback(() => {
    setHata('');
    setG(null);
    gelisimim()
      .then(setG)
      .catch((e) => setHata(e instanceof Error && e.message ? e.message : 'Gelişim bilgisi alınamadı.'));
  }, []);
  useEffect(() => yukle(), [yukle]);

  const izgara = useMemo(() => (g ? takvimIzgarasi(g.bugun, g.takvim) : []), [g]);
  const enCok = useMemo(() => Math.max(0, ...izgara.map((h) => h?.n || 0)), [izgara]);
  const kazanilan = useMemo(() => new Map((g?.rozetler || []).map((r) => [r.rozet, r])), [g]);

  if (hata) {
    return (
      <div role="alert" className="ui-card space-y-3 p-5">
        <p className="flex items-start gap-2 text-sm font-semibold text-fg">
          <AlertCircle className="mt-0.5 w-4 h-4 shrink-0 text-danger-fg" aria-hidden />
          {hata}
        </p>
        <div className="flex justify-end">
          <Button onClick={yukle}>Tekrar dene</Button>
        </div>
      </div>
    );
  }
  if (!g) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted" role="status">
        <span className="w-4 h-4 rounded-full border-2 border-line-strong border-t-brand animate-spin" />
        Hazırlanıyor…
      </div>
    );
  }

  const gunSay = izgara.filter((h) => h && h.n > 0).length;

  return (
    <div className="ui-card space-y-5 p-5" id="gelisimim">
      {/* ------------------------------------------------ takvim */}
      <section className="space-y-2" aria-label="Son 4 hafta">
        <h3 className="text-sm font-bold text-fg">Son 4 hafta</h3>
        <div className="flex items-center gap-5">
          <div className="w-60 max-w-[62%] shrink-0 space-y-1">
            <div className="grid grid-cols-7 gap-1 text-center text-3xs text-subtle" aria-hidden>
              {GUNLER.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1" role="list">
              {izgara.map((h, i) =>
                h ? (
                  <span
                    key={h.gun}
                    role="listitem"
                    title={`${tarihYaz(h.gun)}: ${h.n ? `${h.n} soru` : 'oynanmadı'}`}
                    aria-label={`${tarihYaz(h.gun)}: ${h.n ? `${h.n} soru` : 'oynanmadı'}`}
                    className={cx('block aspect-square w-full rounded-lg', koyuluk(h.n, enCok), h.bugun && 'outline-2 outline-offset-1 outline-fg')}
                  />
                ) : (
                  <span key={`b${i}`} aria-hidden className="block aspect-square w-full" />
                )
              )}
            </div>
          </div>
          <dl className="min-w-0 flex-1 space-y-3">
            {(
              [
                [g.seri, 'gün seri'],
                [g.enUzunSeri, 'en uzun seri'],
                [gunSay, 'gün oynadın'],
              ] as const
            ).map(([n, ad]) => (
              <div key={ad}>
                <dt className="sr-only">{ad}</dt>
                <dd>
                  <b className="block text-2xl font-bold leading-none tabular-nums text-fg">{n}</b>
                  <span className="text-xs text-muted">{ad}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <p className="text-xs text-subtle">{gunSay ? 'Koyu kare: o gün daha çok soru çözdün. Çerçeveli kare bugün.' : 'Henüz oyun yok. Oynadığın günler burada koyulaşır.'}</p>
      </section>

      {/* ------------------------------------------------ konular */}
      <section className="space-y-1" aria-label="Konularım">
        <Baslik>Konularım (son 30 gün)</Baslik>
        {g.konular.length ? (
          <ul className="divide-y divide-line">
            {g.konular.map((k) => {
              const oran = k.toplam ? k.dogru / k.toplam : 0;
              const yuzde = Math.round(oran * 100);
              const azVeri = k.toplam < USTA_EN_AZ;
              const usta = !azVeri && oran >= USTA_ORAN;
              const dusuk = !azVeri && oran < 0.5;
              const renk = azVeri ? 'bg-line-strong' : usta ? 'bg-success' : dusuk ? 'bg-warning' : 'bg-brand';
              const yazi = azVeri ? 'text-subtle' : usta ? 'text-success-fg' : dusuk ? 'text-warning-fg' : 'text-brand-fg';
              const icerik = (
                <>
                  <span className="min-w-0">
                    <b className="block truncate text-sm font-semibold text-fg">{k.konu}</b>
                    <small className="block truncate text-xs text-subtle">
                      {k.ders} · {k.toplam} soru
                    </small>
                  </span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                    <i className={cx('block h-full rounded-full', renk)} style={{ width: `${Math.max(yuzde, 4)}%` }} />
                  </span>
                  <span className={cx('flex items-center justify-end gap-0.5 text-xs font-bold tabular-nums', yazi)}>
                    {azVeri ? 'Az veri' : usta ? 'Usta' : `%${yuzde}`}
                    {dusuk ? <ChevronRight className="w-3.5 h-3.5" aria-hidden /> : null}
                  </span>
                </>
              );
              const sinif = 'grid w-full grid-cols-[minmax(0,1fr)_5.5rem_3.75rem] items-center gap-3 py-2 text-left';
              return (
                <li key={`${k.ders}|${k.konu}`}>
                  {dusuk ? (
                    <button
                      type="button"
                      onClick={() => onKonu(k.ders, k.konu)}
                      className={cx(sinif, '-mx-2 rounded-lg px-2 transition-colors hover:bg-warning-soft focus-visible:ring-2 focus-visible:ring-brand')}
                      aria-label={`${k.konu}: yüzde ${yuzde}. Çalışma modunda aç`}
                    >
                      {icerik}
                    </button>
                  ) : (
                    <div className={sinif}>{icerik}</div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="py-2 text-sm text-muted">Oyun oynadıkça konuların burada çıkar.</p>
        )}
        <p className="text-xs text-subtle">
          Usta = en az {USTA_EN_AZ} soruda %{Math.round(USTA_ORAN * 100)}. Turuncu konuya dokununca Çalışma modunda açılır.
        </p>
      </section>

      {/* ------------------------------------------------ rozetler */}
      <section className="space-y-2" aria-label="Rozetlerim">
        <Baslik>
          Rozetlerim · {kazanilan.size} / {ROZETLER.length}
        </Baslik>
        <ul className="grid grid-cols-4 gap-2">
          {ROZETLER.map((r) => {
            const k = kazanilan.get(r.kod);
            const ilerleme = k ? null : rozetIlerleme(r.kod, g);
            const ustaKonu = r.kod === 'konu_ustasi' && k?.detay?.konu ? k.detay.konu : '';
            return (
              <li
                key={r.kod}
                id={`rozet-${r.kod}`}
                title={k ? `${r.ad}: ${new Date(k.kazanildi).toLocaleDateString('tr-TR')} tarihinde kazandın` : `${r.ad}: ${r.not}`}
                className={cx('flex min-w-0 flex-col items-center rounded-xl border border-line px-1.5 py-2.5 text-center', !k && 'opacity-55')}
              >
                <i
                  aria-hidden
                  className={cx(
                    'mb-1.5 grid h-9 w-9 place-items-center rounded-lg text-sm font-bold not-italic',
                    k ? 'bg-brand-soft text-brand-fg' : 'bg-surface-2 text-subtle'
                  )}
                >
                  {r.simge}
                </i>
                <b className="block w-full truncate text-xs font-semibold text-fg">{r.ad}</b>
                <span className="block w-full truncate text-3xs text-muted">
                  {ustaKonu || (r.kod === 'yuz_dogru' && !k ? `${Math.min(g.toplamDogru, 100)} / 100` : r.not)}
                </span>
                {ilerleme !== null ? (
                  <span className="mt-1.5 block h-1 w-full overflow-hidden rounded-full bg-surface-2" aria-hidden>
                    <span className="block h-full bg-brand" style={{ width: `${Math.round(ilerleme * 100)}%` }} />
                  </span>
                ) : null}
                <span className="sr-only">{k ? 'kazanıldı' : 'henüz kazanılmadı'}</span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
};
