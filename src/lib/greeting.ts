// Ana sayfa karşılama yazısı: günün saatine göre "Günaydın / İyi günler / İyi akşamlar / İyi geceler"
export function timeGreeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 6) return 'İyi geceler';
  if (h < 12) return 'Günaydın';
  if (h < 18) return 'İyi günler';
  return 'İyi akşamlar';
}

// Tam addan ilk adı alır ve Türkçe kurallarla düzgün yazar (MUSTAFA BİLİR -> Mustafa, ali -> Ali)
export function firstNameOf(fullName: string | undefined | null, fallback = ''): string {
  const first = String(fullName || '').trim().split(/\s+/)[0] || '';
  if (!first) return fallback;
  const lower = first.toLocaleLowerCase('tr-TR');
  return lower.charAt(0).toLocaleUpperCase('tr-TR') + lower.slice(1);
}
