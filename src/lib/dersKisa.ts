// ============================================================================
// Aşama 240: ders ve kişi kısaltmaları — ders kartlarında kısa, simetrik etiketler için ortak yardımcılar.
// (ProgramPanel 237d ile aynı kural.) Tam metin her zaman title / aria-label'da verilir.
// ============================================================================

/** "Fen Bilimleri" → "F.B", "Fen Soru Çözüm" → "F.S.Ç", "Matematik" → "Mat" */
export function dersKisa(ders: string): string {
  const k = ders.trim().split(/\s+/).filter(Boolean);
  if (k.length > 1) return k.map((w) => w.charAt(0).toLocaleUpperCase('tr')).join('.');
  const w = k[0] || '';
  return w.charAt(0).toLocaleUpperCase('tr') + w.slice(1, 3);
}

/** Aynı listede iki ders aynı kısaltmaya düşerse tam adı döndürür (karışmasın) */
export function dersKisaListede(ders: string, liste: string[]): string {
  const k = dersKisa(ders);
  return liste.some((x) => x !== ders && dersKisa(x) === k) ? ders : k;
}

/** "Gülderen AKGÜN" → "G.A." */
export function basHarf(ad: string): string {
  return ad
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => `${w.charAt(0).toLocaleUpperCase('tr')}.`)
    .join('');
}

/** "09:40" → dakika */
export function dakika(s: string | null | undefined): number {
  const [h, m] = String(s || '').split(':').map((x) => Number(x));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}
