// ============================================================================
// Aşama 135: TEK DENEMENİN KARNE ADI
// Tek bir denemeye ait karnede "Deneme karnesi" yerine denemenin kendi adı yazılır:
//   yayınevi "Hız Yayınları"  → "Hız Denemesi Karnesi"
//   yayınevi girilmemişse      → "<deneme adı> Karnesi"  (ör. "8. Sınıf LGS Deneme 8 Karnesi")
// Birden çok denemeyi kapsayan karneler (ortalama, gelişim) eskisi gibi "Deneme karnesi" kalır.
// ============================================================================

const EK = /\s*(yay[ıi]nlar[ıi]|yay[ıi]nevi|yay[ıi]nc[ıi]l[ıi]k|yay[ıi]n(lar)?|yay\.?)\s*$/i;

/** Aşama 140: grafikte denemenin kısa adı — yayınevi eki atılır: "Hız Yayınları" → "Hız", "Özdebir Yayınları" → "Özdebir".
 *  Yayınevi girilmemişse deneme adı (grafikte sığmazsa kısaltılır). */
export function denemeKisaAd(exam: { name?: string; publisher?: string } | null | undefined): string {
  const pub = String(exam?.publisher || '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(EK, '')
    .replace(/\s*denemes[iı]$/i, '')
    .trim();
  return pub || String(exam?.name || '').replace(/\s+/g, ' ').trim();
}

export function denemeKarneAdi(exam: { name?: string; publisher?: string } | null | undefined): string {
  const pub = String(exam?.publisher || '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(EK, '')
    .replace(/\s*denemes[iı]$/i, '')
    .trim();
  if (pub) return `${pub} Denemesi Karnesi`;
  const name = String(exam?.name || '').replace(/\s+/g, ' ').trim();
  if (!name) return 'Deneme Karnesi';
  return /karnes[iı]$/i.test(name) ? name : `${name} Karnesi`;
}
