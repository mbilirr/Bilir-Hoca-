// ============================================================================
// Aşama 383: Oyunlar — soru bankasından soru seçme listesi (oyun hazırla ve tahtada oyna ortak kullanır)
// Ders süzgeci + arama + işaret kutuları; en çok `enCok` soru seçilir. Banka yüklenmeyi çağıran yapar.
// ============================================================================
import React, { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { cx } from '../../ui/kit';
import { Yukleniyor, YuklemeHatasi } from '../../ui/Durum';
import { FieldLabel, SelectBox } from '../FormParts';
import { TUR_AD, type OyunSoru, type OyunSoruTur } from '../../../services/oyunService';

const norm = (v: string) => v.toLocaleLowerCase('tr-TR');

export const SoruSecici: React.FC<{
  bank: OyunSoru[] | null;
  bankHata: string | null;
  onTekrar: () => unknown;
  tur: OyunSoruTur;
  secili: string[];
  onChange: (ids: string[]) => void;
  enCok: number;
}> = ({ bank, bankHata, onTekrar, tur, secili, onChange, enCok }) => {
  const [fDers, setFDers] = useState('');
  const [ara, setAra] = useState('');
  const uygun = useMemo(() => (bank || []).filter((s) => s.tur === tur), [bank, tur]);
  const dersler = useMemo(() => Array.from(new Set(uygun.map((s) => s.ders))).sort((a, b) => a.localeCompare(b, 'tr')), [uygun]);
  const gorunen = useMemo(() => {
    const q = norm(ara.trim());
    return uygun.filter((s) => (!fDers || s.ders === fDers) && (!q || norm(`${s.metin} ${s.cevap} ${s.konu} ${s.kazanimKodu || ''}`).includes(q)));
  }, [uygun, fDers, ara]);
  useEffect(() => setFDers(''), [tur]);

  const degistir = (id: string) => onChange(secili.includes(id) ? secili.filter((x) => x !== id) : secili.length >= enCok ? secili : [...secili, id]);
  const gorunenleriSec = () => {
    const yeni = [...secili];
    for (const s of gorunen) if (!yeni.includes(s.id) && yeni.length < enCok) yeni.push(s.id);
    onChange(yeni);
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <FieldLabel>Sorular ({TUR_AD[tur]})</FieldLabel>
        {gorunen.length > 0 && (
          <button type="button" onClick={gorunenleriSec} className="text-xs font-semibold text-brand-fg hover:underline">
            Görünenleri seç
          </button>
        )}
      </div>
      {bankHata && <YuklemeHatasi mesaj={bankHata} onTekrar={onTekrar} />}
      {!bankHata && bank === null && <Yukleniyor satir={3} metin="Soru bankası yükleniyor…" />}
      {bank && uygun.length === 0 && (
        <p className="rounded-xl bg-surface-2 px-3.5 py-3 text-xs text-muted">
          Soru bankasında {tur === 'coktan' ? 'çoktan seçmeli' : 'kelime'} soru yok. Önce "Soru bankası" sekmesinden soru ekleyin.
        </p>
      )}
      {bank && uygun.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <SelectBox aria-label="Ders" value={fDers} onChange={(e) => setFDers(e.target.value)} className="ui-field cursor-pointer w-full">
              <option value="">Bütün dersler</option>
              {dersler.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </SelectBox>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-subtle" aria-hidden />
              <input type="search" aria-label="Soru ara" value={ara} onChange={(e) => setAra(e.target.value)} placeholder="Soru ya da kazanım ara" className="ui-field w-full pl-9" />
            </div>
          </div>
          <ul className="max-h-72 space-y-1.5 overflow-y-auto rounded-xl border border-line p-1.5">
            {gorunen.length === 0 && <li className="py-6 text-center text-xs text-muted">Bu süzgece uyan soru yok.</li>}
            {gorunen.map((s) => {
              const on = secili.includes(s.id);
              return (
                <li key={s.id}>
                  <label className={cx('flex cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 text-sm', on ? 'bg-brand-soft' : 'hover:bg-surface-2')}>
                    <input type="checkbox" checked={on} onChange={() => degistir(s.id)} className="mt-1 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-2xs font-semibold text-muted">
                        {s.ders}
                        {s.sinif ? ` · ${s.sinif}. sınıf` : ''}
                        {s.kazanimKodu ? ` · ${s.kazanimKodu}` : ''}
                      </span>
                      <span className="block break-words text-fg">{s.metin}</span>
                      {s.tur === 'kelime' && <span className="block text-xs text-muted">Cevap: {s.cevap}</span>}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
};
