// ============================================================================
// Aşama 304: BAĞLANTI HATASININ DİLİ
// Tarayıcılar ağ hatasını İngilizce ve farklı sözlerle verir ("Failed to fetch" Chrome, "NetworkError…" Firefox,
// "Load failed" Safari). Kayıt sırasında bağlantı yoksa kullanıcı bu teknik yazıyı değil, ne olduğunu görür.
// ============================================================================

const AG_HATASI = /Failed to fetch|NetworkError|Load failed|fetch failed|Network request failed|ERR_INTERNET_DISCONNECTED|ERR_NETWORK/i;

/** Hata bir ağ (bağlantı) hatası mı? */
export function agHatasiMi(e: unknown): boolean {
  if (!e) return false;
  const m = typeof e === 'string' ? e : String((e as { message?: unknown })?.message || '');
  return AG_HATASI.test(m) || (typeof navigator !== 'undefined' && navigator.onLine === false);
}

/** Ağ hatasında kullanıcıya gösterilecek kısa neden */
export function baglantiNedeni(): string {
  return typeof navigator !== 'undefined' && navigator.onLine === false ? 'İnternet bağlantısı yok' : 'Sunucuya ulaşılamadı';
}
