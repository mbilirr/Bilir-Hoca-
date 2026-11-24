// Aşama 380: Oyunlar — MEB kazanım bankasından kazanım seçici (ders ve sınıfa göre süzülür; kişisel bilgi yok)
import React, { useEffect, useMemo, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { cx } from '../../ui/kit';
import { Yukleniyor } from '../../ui/Durum';
import { listKazanimlar, type BankRow } from '../../../services/denemeService';
import { bankGradeOf, bankSubjectKey } from '../../../lib/deneme/kazanimBank';

let onbellek: Promise<BankRow[]> | null = null;
/** Banka bütün pencerelerde bir kez okunur; hata olursa bir sonraki açılışta yeniden denenir */
export function kazanimlariYukle(): Promise<BankRow[]> {
  if (!onbellek) {
    onbellek = listKazanimlar().catch((e) => {
      onbellek = null;
      throw e;
    });
  }
  return onbellek;
}

export function useKazanimBankasi(): { bank: BankRow[] | null; hata: string | null } {
  const [bank, setBank] = useState<BankRow[] | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  useEffect(() => {
    let canli = true;
    kazanimlariYukle()
      .then((b) => canli && setBank(b))
      .catch((e) => canli && setHata(e instanceof Error ? e.message : 'Kazanım bankası yüklenemedi.'));
    return () => {
      canli = false;
    };
  }, []);
  return { bank, hata };
}

/** Dersin (ad ya da anahtar) ve sınıfın kazanımları; sınıfı bilinmeyen satır her sınıfta aday kalır */
export function dersKazanimlari(bank: BankRow[], ders: string, sinif: number | null): BankRow[] {
  const k = bankSubjectKey(ders);
  if (!k) return [];
  return bank.filter((r) => {
    if (bankSubjectKey(r.subject) !== k) return false;
    if (sinif === null) return true;
    const g = bankGradeOf(r);
    return !g || g === String(sinif);
  });
}

const EN_COK_GOSTER = 120;
const norm = (v: string) => v.toLocaleLowerCase('tr-TR');

export const KazanimSecici: React.FC<{
  satirlar: BankRow[];
  secili: string[];
  onChange: (kodlar: string[]) => void;
  /** 1 = tek seçim (tıklanan seçilir, tekrar tıklanınca kalkar) */
  enCok: number;
}> = ({ satirlar, secili, onChange, enCok }) => {
  const [ara, setAra] = useState('');
  const liste = useMemo(() => {
    const q = norm(ara.trim());
    return q ? satirlar.filter((r) => norm(`${r.code} ${r.konu} ${r.text}`).includes(q)) : satirlar;
  }, [satirlar, ara]);
  const gorunen = liste.slice(0, EN_COK_GOSTER);

  const bas = (kod: string) => {
    if (secili.includes(kod)) return onChange(secili.filter((k) => k !== kod));
    if (enCok === 1) return onChange([kod]);
    if (secili.length >= enCok) return; // sınıra ulaşıldı: ek seçim eklenmez
    onChange([...secili, kod]);
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-subtle" aria-hidden />
        <input
          type="search"
          value={ara}
          onChange={(e) => setAra(e.target.value)}
          placeholder="Kazanım kodu, konu ya da kelime ara"
          aria-label="Kazanım ara"
          className="ui-field w-full pl-9"
        />
      </div>
      <ul className="max-h-56 overflow-y-auto rounded-xl border border-line divide-y divide-line bg-surface" aria-label="Kazanımlar">
        {gorunen.length === 0 && <li className="px-3 py-4 text-center text-xs text-muted">Bu ders ve sınıf için kazanım bulunamadı.</li>}
        {gorunen.map((r) => {
          const acik = secili.includes(r.code);
          return (
            <li key={r.code}>
              <button
                type="button"
                onClick={() => bas(r.code)}
                aria-pressed={acik}
                className={cx('w-full text-left px-3 py-2 flex items-start gap-2.5 transition-colors hover:bg-surface-2', acik && 'bg-brand-soft')}
              >
                <span
                  aria-hidden
                  className={cx(
                    'mt-0.5 grid place-items-center size-4 shrink-0 rounded border',
                    enCok === 1 && 'rounded-full',
                    acik ? 'bg-brand border-brand text-white' : 'border-line-strong bg-surface'
                  )}
                >
                  {acik && <Check className="w-3 h-3" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-2xs font-semibold text-muted">
                    {r.code}
                    {r.konu ? ` · ${r.konu}` : ''}
                  </span>
                  <span className="block text-xs text-fg leading-snug">{r.text}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {liste.length > EN_COK_GOSTER && <p className="text-2xs text-muted">İlk {EN_COK_GOSTER} kazanım gösteriliyor; aramayı daraltın.</p>}
    </div>
  );
};

/** Banka yüklenirken ya da yüklenemediğinde gösterilen yazı */
export const KazanimDurumu: React.FC<{ hata: string | null }> = ({ hata }) =>
  hata ? <p className="text-xs text-danger-fg">{hata}</p> : <Yukleniyor metin="Kazanımlar yükleniyor…" />;
