/**
 * Türkçe karakter duyarsız ve büyük/küçük harf bağımsız arama yardımcıları.
 * İ/i, I/ı, Ç/ç, Ğ/ğ, Ö/ö, Ş/ş, Ü/ü harflerini ve Unicode birleşimlerini
 * hem yerel Türkçe kurallarına hem de esnek normalize edilmiş aramalara göre kusursuz eşleştirir.
 */

export function normalizeTurkish(text: string): string {
  if (!text) return '';
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
  if (rawT.toLowerCase().includes(rawQ.toLowerCase())) return true;

  // 2. Türkçe yerel toLocaleLowerCase ('tr-TR')
  try {
    if (rawT.toLocaleLowerCase('tr-TR').includes(rawQ.toLocaleLowerCase('tr-TR'))) {
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
