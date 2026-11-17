// =============================================================================
// Aşama 325: şube adı tek harf (A, B, Ç…) ya da kelime (ZÜMRÜT, VENÜS, JÜPİTER…) olabilir.
// Sınıf adı her zaman "sınıf/ŞUBE" biçimindedir: "8/A", "5/JÜPİTER". Bu dosya hiçbir şeye bağlı değildir
// (sınıf adı okuyan bütün yerler aynı kuralı kullansın diye ortak).
// =============================================================================

/** Şube adında geçebilen harfler (Türkçe dahil) */
export const SUBE_HARF = 'A-Za-zÇĞİÖŞÜçğıöşüÂâÎîÛû';
/** Şube adı en çok bu kadar harf */
export const SUBE_EN_UZUN = 20;
const TEK_KELIME = new RegExp(`^[${SUBE_HARF}]{1,${SUBE_EN_UZUN}}$`);

/** Formda önerilen şubeler (yazarak kelime de girilebilir) */
export const SUBE_ONERILERI = ['A', 'B', 'C', 'Ç', 'D', 'E', 'F', 'G', 'H'];

/** "a", "A Şubesi", "Şube Zümrüt", "zümrüt" → "A" / "ZÜMRÜT". Tek kelime değilse, rakam ya da işaret varsa ''. */
export function subeAdi(raw?: string | null): string {
  const s = String(raw ?? '')
    .replace(/şube(si)?|sube(si)?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return TEK_KELIME.test(s) ? s.toLocaleUpperCase('tr-TR') : '';
}

/**
 * Kayıtlı sınıfın şubesi. Eskiden şubesi okunamayan Excel sınıflarına yer tutucu olarak "Genel" yazılıyordu;
 * o gerçek bir şube sayılmaz (yoksa "5/G" diye gösteriliyordu), şube sınıf adından okunur.
 */
export function kayitliSube(branch?: string | null): string {
  const s = subeAdi(branch);
  return s === 'GENEL' ? '' : s;
}

/** Sınıf adı yazısından sınıf ve şube: "5/Jüpiter", "5-JÜPİTER", "5 Zümrüt", "8A", "8. Sınıf - Şube A" */
export function siniftanSube(text?: string | null): { grade?: number; branch?: string; rest: string } {
  const t = String(text ?? '')
    .replace(/\(?\s*[şŞsS][uU][bB][eE][sS][iİıI][zZ]\s*\)?/g, ' ') // "(şubesiz)" / "ŞUBESİZ" şube adı değildir
    .replace(/sınıfı|sınıf|sinifi|sinif|SINIFI|SINIF|şubesi|şube|ŞUBESİ|subesi|sube/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const m = new RegExp(`^(\\d{1,2})\\s*\\.?\\s*[-–—/\\\\_]?\\s*([${SUBE_HARF}]+)?(?:\\s+(.*))?$`).exec(t);
  if (!m) return { rest: t };
  const grade = parseInt(m[1], 10);
  if (!(grade >= 1 && grade <= 12)) return { rest: t };
  const word = m[2] || '';
  if (word && word.length > SUBE_EN_UZUN) return { grade, rest: [word, m[3] || ''].join(' ').trim() };
  return { grade, branch: word ? word.toLocaleUpperCase('tr-TR') : undefined, rest: (m[3] || '').trim() };
}
