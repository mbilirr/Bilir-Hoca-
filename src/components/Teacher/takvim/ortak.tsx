// Akademik takvim: sayfanın ortak yardımcıları ve kutu parçaları (Aşama 364, AkademikTakvim.tsx bölündü)
import React from 'react';
import { Check, Minus } from 'lucide-react';
import { cx } from '../../ui/kit';
import {
  AY_ADLARI,
  AY_KISA,
  GUN_KISA_PAZAR,
  gunAraligiYazi,
  gunEkle,
  sonGun,
  tarihCoz,
  tarihYaz,
  type AktKayit,
} from '../../../services/akademikTakvimService';

export const BTN = 'ui-btn ui-btn-sm h-8 justify-center';

// Aşama 327: birkaç gün süren etkinlikte kutuda gün aralığı ("15–19") ve gün sayısı; ay değişiyorsa ilk günün ayı
export const DtKutu: React.FC<{ tarih: string; bitis?: string; ayIcinde?: boolean; vurgu?: boolean }> = ({ tarih, bitis, ayIcinde, vurgu }) => {
  const d = tarihCoz(tarih);
  if (ayIcinde) {
    // Aşama 327: günü belli olmayan etkinlik: ay adı + "ay içi"
    return (
      <span
        className={cx('w-12 h-12 shrink-0 rounded-xl flex flex-col items-center justify-center leading-none border border-dashed', vurgu ? 'bg-brand-soft text-brand-fg border-brand' : 'bg-surface-2 text-fg border-line-strong')}
        title={`${AY_ADLARI[d.getMonth()]} içinde (günü belli değil)`}
      >
        <b className="text-sm font-bold uppercase tracking-wide">{AY_KISA[d.getMonth()]}</b>
        <span className="text-2xs font-semibold uppercase tracking-wide mt-0.5 text-muted">ay içi</span>
      </span>
    );
  }
  const e = bitis ? tarihCoz(bitis) : null;
  const gun = e ? Math.round((e.getTime() - d.getTime()) / 864e5) + 1 : 0;
  return (
    <span
      className={cx('w-12 h-12 shrink-0 rounded-xl flex flex-col items-center justify-center leading-none', vurgu ? 'bg-brand text-white' : 'bg-surface-2 text-fg')}
      title={e ? gunAraligiYazi({ tarih, bitis: bitis || '' }) : undefined}
    >
      <b className={cx('font-bold tabular-nums', e ? 'text-sm tracking-tight' : 'text-lg')}>{e ? `${d.getDate()}–${e.getDate()}` : d.getDate()}</b>
      <span className={cx('text-2xs font-semibold uppercase tracking-wide mt-0.5', vurgu ? 'text-white/80' : 'text-muted')}>
        {e ? (e.getMonth() !== d.getMonth() ? AY_KISA[d.getMonth()] : `${gun} gün`) : GUN_KISA_PAZAR[d.getDay()]}
      </span>
    </span>
  );
};

/** Aşama 327: etkinliğin sürdüğü günler (YYYY-AA-GG) */
export const gunleri = (g: Pick<AktKayit, 'tarih' | 'bitis' | 'ayIcinde'>): string[] => {
  const l: string[] = [];
  if (g.ayIcinde) return l; // günü belli değil: salon çakışması aranmaz
  for (let d = tarihCoz(g.tarih), son = sonGun(g); tarihYaz(d) <= son && l.length < 62; d = gunEkle(d, 1)) l.push(tarihYaz(d));
  return l;
};

/** Aşama 329: seçme kutusu (yarım seçimde çizgi) */
export const SecKutusu: React.FC<{ durum: boolean | 'mixed'; onClick: () => void; etiket: string; id?: string }> = ({ durum, onClick, etiket, id }) => (
  <button data-serbest="seçme kutusu"
    type="button"
    id={id}
    role="checkbox"
    aria-checked={durum}
    aria-label={etiket}
    title={etiket}
    onClick={onClick}
    className="w-9 h-9 -m-2 shrink-0 grid place-items-center rounded-lg cursor-pointer hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 transition-colors"
  >
    <span
      className={cx(
        'w-[18px] h-[18px] rounded-[5px] border grid place-items-center transition-colors',
        durum ? 'bg-brand border-brand text-white' : 'bg-surface border-line-strong'
      )}
    >
      {durum === 'mixed' ? <Minus className="w-3 h-3" strokeWidth={3} /> : durum ? <Check className="w-3 h-3" strokeWidth={3} /> : null}
    </span>
  </button>
);

/** Aşama 330: üst kutular — başlık, alt alta seçim düğmeleri (sayılı), dipte kısa not; aynı sıradaki kutular eşit boy */
export type KutuTon = 'warn' | 'ok' | 'bad';
export const Kutu: React.FC<{ baslik: string; ek?: string; not?: string; children: React.ReactNode }> = ({ baslik, ek, not, children }) => (
  <section className="rounded-2xl bg-surface border border-line shadow-card p-3 flex flex-col gap-1.5 min-w-0" aria-label={baslik}>
    <h2 className="flex items-baseline justify-between gap-2 px-0.5 pb-1 text-xs font-bold uppercase tracking-wider text-muted">
      {baslik}
      {ek && <span className="text-xs font-semibold normal-case tracking-normal text-subtle truncate">{ek}</span>}
    </h2>
    {children}
    {not && <p className="mt-auto pt-1 px-0.5 text-xs leading-snug text-subtle">{not}</p>}
  </section>
);
export const KutuSecenek: React.FC<{ id: string; etiket: string; alt?: string; n: number; ton?: KutuTon; secili: boolean; onClick: () => void }> = ({ id, etiket, alt, n, ton, secili, onClick }) => (
  <button
    type="button"
    id={id}
    aria-pressed={secili}
    onClick={onClick}
    className={cx(
      'h-8 w-full flex items-center gap-2 pl-2.5 pr-1.5 rounded-lg text-left text-xs font-semibold transition-[background-color,color,transform] duration-150 active:scale-[0.98] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
      secili ? 'bg-fg text-canvas' : 'bg-surface-2 text-fg-2 hover:bg-surface-3 hover:text-fg'
    )}
  >
    <span className="flex-1 min-w-0 truncate">
      {etiket}
      {alt && <span className={cx('hidden sm:inline ml-1 font-medium', secili ? 'opacity-60' : 'text-subtle')}>{alt}</span>}
    </span>
    <span
      className={cx(
        'min-w-7 h-[22px] px-1.5 rounded-lg grid place-items-center text-xs tabular-nums',
        secili
          ? 'bg-canvas/15'
          : !n
            ? 'bg-surface text-subtle'
            : ton === 'warn'
              ? 'bg-warning-soft text-warning-fg'
              : ton === 'ok'
                ? 'bg-success-soft text-success-fg'
                : ton === 'bad'
                  ? 'bg-danger-soft text-danger-fg'
                  : 'bg-surface text-fg'
      )}
    >
      {n}
    </span>
  </button>
);
export type Odak = '' | 'gun' | 'hafta' | 'ay' | 'dis' | 'salon' | 'kontrolEdilen' | 'kontrolEdilmeyen';
export const ODAK_ADI: Record<Exclude<Odak, ''>, string> = {
  gun: 'Bugün',
  hafta: 'Bu hafta',
  ay: 'Bu ay',
  dis: 'Okul dışı çakışmaları',
  salon: 'Konferans salonu çakışmaları',
  kontrolEdilen: 'Geçmiş · kontrol edilen',
  kontrolEdilmeyen: 'Geçmiş · kontrol edilmeyen',
};

