// ============================================================================
// Aşama 407: Kitaptan soru — eklenecek sorular. Her satırda kesilen görsel, sayfa / soru numarası, okunan yazı
// ve tek dokunuşla doğru şık (A-D). Satıra dokununca o sayfa açılır ve kutusu seçilir.
// ============================================================================
import React from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { Button } from '../../../ui/Button';
import { cx } from '../../../ui/kit';
import { HARFLER } from '../../../../lib/oyunKitap';
import type { KesimKutusu } from '../../../../lib/oyunGorsel';

export interface Taslak {
  id: string;
  sayfa: number;
  kutu: KesimKutusu;
  /** kesilen görsel (JPEG data URL); kesilirken null */
  gorsel: string | null;
  /** kitapta yazan soru numarası (bulunamazsa null) */
  no: number | null;
  metin: string;
  siklar: string[];
  dogru: number | null;
  okuma: 'bekliyor' | 'okuyor' | 'bitti' | 'olmadi';
  /** kutu her değiştiğinde artar; eski okuma sonucu yeni kutuya yazılmaz */
  surum: number;
}

export const taslakEtiketi = (t: Taslak, sira: number) => (t.no ? String(t.no) : `#${sira + 1}`);

export const TaslakListesi: React.FC<{
  taslaklar: Taslak[];
  secili: string | null;
  onAc: (t: Taslak) => void;
  onDogru: (id: string, i: number) => void;
  onSil: (id: string) => void;
}> = ({ taslaklar, secili, onAc, onDogru, onSil }) => (
  <ul className="space-y-2" aria-label="Eklenecek sorular">
    {taslaklar.map((t, sira) => (
      <li
        key={t.id}
        id={`taslak-${t.id}`}
        className={cx(
          'rounded-xl border p-2 transition-colors',
          secili === t.id ? 'border-brand bg-brand-soft/40' : t.dogru === null ? 'border-warning/60 bg-surface' : 'border-line bg-surface'
        )}
      >
        <div className="flex items-start gap-2.5">
          <button
            type="button"
            onClick={() => onAc(t)}
            className="h-14 w-20 shrink-0 overflow-hidden rounded-lg border border-line bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            aria-label={`Sayfa ${t.sayfa}, ${taslakEtiketi(t, sira)}. soruyu sayfada göster`}
          >
            {t.gorsel ? <img src={t.gorsel} alt="" className="h-full w-full object-cover object-top" /> : <span className="block h-full w-full bg-surface-2" />}
          </button>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-2xs font-semibold text-subtle">
              <span className="tabular-nums">
                Sayfa {t.sayfa} · {t.no ? `${t.no}. soru` : 'numarasız'}
              </span>
              {t.okuma === 'okuyor' || t.okuma === 'bekliyor' ? <Loader2 className="w-3 h-3 animate-spin" aria-label="Yazı okunuyor" /> : null}
            </p>
            <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-fg" title={t.metin || undefined}>
              {t.metin || (t.okuma === 'olmadi' ? 'Yazı okunamadı; görsel olduğu gibi eklenir.' : 'Yazı okunuyor…')}
            </p>
          </div>
          <Button variant="ghost" size="sm" ikon aria-label="Soruyu kaldır" title="Kaldır" onClick={() => onSil(t.id)}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
        <div role="radiogroup" aria-label="Doğru şık" className="mt-2 grid grid-cols-4 gap-1.5">
          {HARFLER.map((h, i) => (
            <button key={h} type="button" role="radio" aria-checked={t.dogru === i} onClick={() => onDogru(t.id, i)} className="ui-secim w-full">
              {h}
            </button>
          ))}
        </div>
      </li>
    ))}
  </ul>
);
