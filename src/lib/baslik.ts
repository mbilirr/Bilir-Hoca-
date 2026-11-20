// ============================================================================
// Aşama 331: BAŞLIK YAZIMI — bütün sitede başlıklar tek düzende (Mustafa, 20 Kas)
// Kural: her kelimenin baş harfi büyük ("Bugün Kurumda", "Hesap İşleri"); kelimenin geri kalanına dokunulmaz
// (ALİ, 8/A, LGS aynen kalır). Bağlaçlar ve soru eki küçük kalır (TDK: ve, ile, veya, ya da, da, de, ki, mi).
// Türkçe harf kuralı: i → İ, ı → I (toLocaleUpperCase('tr')).
// Soru ya da cümle olan başlığa ("Hangi haftaya?") dokunulmaz.
// Ortak başlık bileşenleri (PageHeader, Panel, Modal, AkSheet, FormSection, Karne bölümü) bunu kendisi uygular;
// sayfalardaki sabit başlıklar kaynakta bu kurala göre yazıldı.
// ============================================================================
import type { ReactNode } from 'react';

const KUCUK = new Set(['ve', 'veya', 'ile', 'ya', 'da', 'de', 'ki', 'mi', 'mı', 'mu', 'mü']);
const HARF = /\p{L}/u;

const kelime = (w: string, ilk: boolean): string => {
  const i = w.search(HARF);
  if (i < 0) return w;
  // rakamla başlayan parça (8/A, 1.) ve bağlaçlar aynen kalır
  if (/\d/.test(w.slice(0, i))) return w;
  if (!ilk && KUCUK.has(w.toLocaleLowerCase('tr'))) return w;
  return w.slice(0, i) + w[i].toLocaleUpperCase('tr') + w.slice(i + 1);
};

/** "bugün kurumda" → "Bugün Kurumda"; soru/cümle (sonu ? . !) olduğu gibi döner. */
export const baslikYaz = (s: string): string => {
  const t = s.trim();
  if (!t || /[?.!…:]$/.test(t)) return s;
  let ilk = true;
  return s
    .split(/(\s+)/)
    .map((p) => {
      if (!p || /^\s+$/.test(p)) return p;
      const r = kelime(p, ilk);
      ilk = false;
      return r;
    })
    .join('');
};

/** Başlık prop'u için: yalnız düz yazıya uygulanır, JSX olduğu gibi kalır. */
export const baslik = <T extends ReactNode>(n: T): T => (typeof n === 'string' ? (baslikYaz(n) as T) : n);
