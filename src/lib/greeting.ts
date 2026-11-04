// Ana sayfa karşılama yazısı: günün saatine göre "Günaydın / İyi günler / İyi akşamlar / İyi geceler"
export function timeGreeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 6) return 'İyi geceler';
  if (h < 12) return 'Günaydın';
  if (h < 18) return 'İyi günler';
  return 'İyi akşamlar';
}

// Türkçe kurallarla kelimenin ilk harfi büyük, gerisi küçük (irem -> İrem, ILGAZ -> Ilgaz)
const capTr = (w: string) => {
  const lower = w.toLocaleLowerCase('tr-TR');
  return lower.charAt(0).toLocaleUpperCase('tr-TR') + lower.slice(1);
};

/** Aşama 159: her kelimenin ilk harfi büyük ("İyi akşamlar" -> "İyi Akşamlar") */
export function titleCaseTr(text: string): string {
  return String(text || '').trim().split(/\s+/).filter(Boolean).map(capTr).join(' ');
}

// Tam addan ilk adı alır ve Türkçe kurallarla düzgün yazar (MUSTAFA BİLİR -> Mustafa, ali -> Ali)
export function firstNameOf(fullName: string | undefined | null, fallback = ''): string {
  const first = String(fullName || '').trim().split(/\s+/)[0] || '';
  if (!first) return fallback;
  return capTr(first);
}

/** Aşama 159: soyadı (son kelime) dışındaki bütün adlar (ALİ KEMAL YILMAZ -> Ali Kemal; tek kelimeyse kendisi) */
export function givenNamesOf(fullName: string | undefined | null, fallback = ''): string {
  const words = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return fallback;
  return (words.length > 1 ? words.slice(0, -1) : words).map(capTr).join(' ');
}
