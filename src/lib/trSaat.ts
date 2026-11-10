// ============================================================================
// Aşama 234: TÜRKİYE SAATİ (sunucuya göre). Ders programı ekranları "bugün" ve "şimdi"yi cihaz saatinden değil,
// sunucunun saatinden ve Europe/Istanbul saat diliminden hesaplar. Cihaz saati ileri / geri ya da başka saat
// dilimindeyse de veritabanıyla aynı gün ve saat görünür. Sunucu saati girişte ve 10 dakikada bir öğrenilir
// (dataService → ders_erisimim). Öğrenilemezse cihaz saati + İstanbul saat dilimi kullanılır.
// ============================================================================

let farkMs = 0; // sunucu - cihaz (ms)

/** Sunucu saatini öğret. gonderAt / alindiAt: isteğin gidiş ve dönüş anı (cihaz saati, ms). */
export function sunucuSaatiAyarla(sunucuMs: number, gonderAt: number, alindiAt: number): void {
  if (!Number.isFinite(sunucuMs) || sunucuMs <= 0 || alindiAt - gonderAt > 10_000) return; // çok yavaş yanıt: güvenilmez
  const fark = sunucuMs - (gonderAt + alindiAt) / 2;
  farkMs = Math.abs(fark) < 30_000 ? 0 : fark; // 30 sn altı fark önemsiz (dakika gösteriyoruz)
}

/** Sunucuya göre şu an (Date) */
export function trSimdiDate(): Date {
  return new Date(Date.now() + farkMs);
}

let gunFmt: Intl.DateTimeFormat | null = null;
let saatFmt: Intl.DateTimeFormat | null = null;

/** Türkiye'de bugünün tarihi: YYYY-AA-GG */
export function trBugun(): string {
  try {
    gunFmt = gunFmt || new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' });
    return gunFmt.format(trSimdiDate());
  } catch {
    const d = trSimdiDate();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}

/** Türkiye'de şu anki saat: SS:DD */
export function trSaat(): string {
  try {
    saatFmt = saatFmt || new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const p = saatFmt.formatToParts(trSimdiDate());
    const h = p.find((x) => x.type === 'hour')?.value || '00';
    const m = p.find((x) => x.type === 'minute')?.value || '00';
    return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
  } catch {
    const d = trSimdiDate();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}
