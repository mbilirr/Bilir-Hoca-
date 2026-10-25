/**
 * Türkçe karakter duyarsız ve büyük/küçük harf bağımsız arama yardımcıları.
 * İ/i, I/ı, Ç/ç, Ğ/ğ, Ö/ö, Ş/ş, Ü/ü harflerini ve Unicode birleşimlerini
 * hem yerel Türkçe kurallarına hem de esnek normalize edilmiş aramalara göre kusursuz eşleştirir.
 */

// HIZ (Aşama 84): aynı metin tekrar tekrar normalleştirilmez (aramada her tuşta yüzlerce öğrenci adı)
const NORM_MAX = 5000;
const normCache = new Map<string, string>();
const lowerCache = new Map<string, string>();
const trLowerCache = new Map<string, string>();
function cached(map: Map<string, string>, key: string, make: (k: string) => string): string {
  let v = map.get(key);
  if (v === undefined) {
    if (map.size >= NORM_MAX) map.clear();
    v = make(key);
    map.set(key, v);
  }
  return v;
}

export function normalizeTurkish(text: string): string {
  if (!text) return '';
  return cached(normCache, text, normalizeTurkishRaw);
}

function normalizeTurkishRaw(text: string): string {
  return text
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Hedef metin içerisinde aranan kelimenin büyük/küçük harf veya Türkçe karakter
 * fark etmeksizin bulunup bulunmadığını kontrol eder.
 *
 * Örnekler:
 * - "İSMAİL" içinde "ismail" arandığında -> true
 * - "IŞIK" içinde "ışık" veya "isik" arandığında -> true
 * - "ALİ YILMAZ" içinde "ali" veya "yilmaz" arandığında -> true
 */
export function matchTurkishSearch(
  target: string | undefined | null,
  query: string | undefined | null
): boolean {
  if (!query || !query.trim()) return true;
  if (!target) return false;

  const rawQ = query.trim();
  const rawT = target.trim();

  // 1. Standart toLowerCase
  const lower = (k: string) => k.toLowerCase();
  if (cached(lowerCache, rawT, lower).includes(cached(lowerCache, rawQ, lower))) return true;

  // 2. Türkçe yerel toLocaleLowerCase ('tr-TR')
  try {
    const trLower = (k: string) => k.toLocaleLowerCase('tr-TR');
    if (cached(trLowerCache, rawT, trLower).includes(cached(trLowerCache, rawQ, trLower))) {
      return true;
    }
  } catch {}

  // 3. Normalize edilmiş Türkçe arama (tüm diyakritik işaretler ve karakter varyasyonları)
  return normalizeTurkish(rawT).includes(normalizeTurkish(rawQ));
}

/**
 * Türkçe alfabetik sıralama (A, B, C, Ç, D ... Z)
 */
export function turkishCompare(a: string, b: string): number {
  return (a || '').localeCompare(b || '', 'tr-TR', { sensitivity: 'base' });
}
