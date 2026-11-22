// ============================================================================
// Aşama 356 (H4): "son kimlikten sonra" (keyset) sayfalı okuma ve sıralama kuralı. Veritabanına bağlı değildir
// (sayfa getiren işlev dışarıdan verilir), böylece birim testiyle denetlenir. Kullanan: services/bulutIslemleri.ts
// ============================================================================

export type SayfaSonucu = { data: any[] | null; error: any };

/**
 * Sayfaları kimlik sırasıyla, her seferinde bir önceki sayfanın son kimliğinden sonrasını isteyerek okur.
 * Kimlik sütunu gelmezse { eksikKimlik: true } ile o ana kadar okunanları döndürür (çağıran eski yola geçer).
 */
export async function keysetIleOku(
  sayfaGetir: (sonId: unknown) => Promise<SayfaSonucu>,
  sayfa: number,
  enCok: number
): Promise<{ data: any[] | null; error: any; eksikKimlik?: boolean }> {
  const out: any[] = [];
  let son: unknown = null;
  while (out.length < enCok) {
    const r = await sayfaGetir(son);
    if (r.error) return { data: null, error: r.error };
    const rows = r.data || [];
    for (const row of rows) out.push(row);
    if (rows.length < sayfa) break;
    const sonId = rows[rows.length - 1]?.id;
    if (sonId === null || sonId === undefined) return { data: out, error: null, eksikKimlik: true };
    son = sonId;
  }
  return { data: out, error: null };
}

/** Veritabanındaki sıralamanın aynısı: sütun, eşitse kimlik artan; boş değer artanda sonda, azalanda başta. */
export function siralaSutunaGore(rows: any[], col?: string, ascending = true): any[] {
  if (!col || col === 'id') return rows;
  const kucuk = (x: any, y: any) =>
    typeof x === 'number' && typeof y === 'number' ? x - y : String(x) < String(y) ? -1 : String(x) > String(y) ? 1 : 0;
  return rows.sort((a, b) => {
    const x = a?.[col];
    const y = b?.[col];
    const xb = x === null || x === undefined;
    const yb = y === null || y === undefined;
    let c = 0;
    if (xb || yb) c = xb && yb ? 0 : xb ? (ascending ? 1 : -1) : ascending ? -1 : 1;
    else c = ascending ? kucuk(x, y) : kucuk(y, x);
    return c || kucuk(a?.id ?? '', b?.id ?? '');
  });
}
