// ============================================================================
// Aşama 294: iki adımlı giriş — sunucu denetimi (kurum.js, mail.js, push.js ortak)
// Hesapta doğrulanmış kod uygulaması varsa, sunucu işlevleri yalnız kodu girilmiş oturumu (aal2) kabul eder.
// Şifreyi bilen ama kodu giremeyen biri ekranı atlayıp bu adreslere doğrudan istek atamaz.
// İki adımlı giriş açık değilse (bugün yalnız sistem sahibi açabilir) hiçbir etkisi yoktur.
// ============================================================================

// Oturum anahtarının güven düzeyi. İmza denetimi gerekmez: anahtar az önce Supabase'e doğrulatıldı (/auth/v1/user).
function aalOf(accessToken) {
  try {
    const part = String(accessToken).split('.')[1] || '';
    const json = JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return typeof json.aal === 'string' ? json.aal : '';
  } catch {
    return '';
  }
}

/** user: /auth/v1/user yanıtı. true = kod uygulaması tanımlı ama bu oturumda kod girilmemiş */
export function ikiAdimEksik(user, accessToken) {
  const factors = (user && Array.isArray(user.factors) ? user.factors : []).filter((f) => f && f.status === 'verified');
  return factors.length > 0 && aalOf(accessToken) !== 'aal2';
}

export const IKI_ADIM_MESAJ = 'İki adımlı doğrulama gerekli. Kodu girip yeniden deneyin.';
