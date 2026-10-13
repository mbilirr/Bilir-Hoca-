// ============================================================================
// Parmak izi / yüz tanıma ile giriş (WebAuthn + PRF)
//
// Nasıl çalışır?
//  1. Kullanıcı bir kez kullanıcı adı + şifresiyle girer ve "Parmak izi ile girişi aç" der.
//  2. Cihazın kendi doğrulayıcısında (Android parmak izi, iPhone Face ID / Touch ID,
//     Windows Hello, Mac Touch ID) bu siteye özel bir "geçiş anahtarı" oluşturulur.
//  3. Geçiş anahtarının PRF eklentisinden gelen gizli değerle şifre AES-GCM ile şifrelenir
//     ve YALNIZCA bu cihazın tarayıcısında saklanır. Gizli değer parmak izi doğrulanmadan
//     elde edilemez; sunucuya / Supabase'e hiçbir şey gönderilmez, veritabanı değişikliği gerekmez.
//  4. Sonraki girişlerde parmak izi okutulunca şifre çözülür ve normal giriş yapılır.
//
// Not: Şifre değişirse kayıtlı parmak izi girişi çalışmaz; kullanıcı bir kez şifreyle girip yeniden açar.
// PRF desteklemeyen eski tarayıcılarda özellik görünmez (güvenli olmayan yedek yöntem kullanılmaz).
// ============================================================================

export type BiometricRole = 'teacher' | 'student';

export interface BiometricProfile {
  v: 1;
  role: BiometricRole;
  identifier: string; // giriş adı (öğretmen kullanıcı adı / öğrenci numarası)
  name: string; // ekranda gösterilecek ad
  credentialId: string; // base64url
  salt: string; // base64url (PRF girdisi)
  iv: string; // base64url
  cipher: string; // base64url (şifrelenmiş şifre)
  createdAt: string;
}

const STORE_KEY = (role: BiometricRole) => `edu_biometric_login_${role}_v1`;
const RP_NAME = 'Eğitim & Öğrenci Takip Sistemi';

// ---------------------------------------------------------------------------- yardımcılar
const toB64u = (buf: ArrayBuffer | Uint8Array): string => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64u = (s: string) => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const randomBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));

async function deriveAesKey(prfOutput: ArrayBuffer, salt: BufferSource): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', prfOutput, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: new TextEncoder().encode('edu-biometric-login-v1') },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

const friendlyError = (e: any, fallback: string): Error => {
  const name = String(e?.name || '');
  if (name === 'NotAllowedError') return new Error('Parmak izi doğrulaması iptal edildi ya da süresi doldu. Tekrar deneyin.');
  if (name === 'InvalidStateError') return new Error('Bu cihazda bu hesap için zaten bir parmak izi kaydı var. Önce "Parmak izini kaldır" deyip yeniden açın.');
  if (name === 'SecurityError') return new Error('Parmak izi girişi yalnızca güvenli bağlantıda (https) çalışır.');
  if (name === 'NotSupportedError') return new Error('Bu cihaz veya tarayıcı parmak izi ile girişi desteklemiyor. Safari veya Chrome\'un güncel sürümünü deneyin (Firefox desteklemeyebilir).');
  return new Error(e?.message && !/^\w+Error$/.test(e.message) ? e.message : fallback);
};

// ---------------------------------------------------------------------------- destek
/**
 * Cihaz ve tarayıcı parmak izi ile girişe uygun mu? Uygun değilse kullanıcıya gösterilecek nedeni döndürür.
 * (PRF desteği ancak kayıt sırasında kesinleşir.)
 */
export async function getBiometricSupport(): Promise<{ ok: boolean; reason: string }> {
  try {
    if (typeof window === 'undefined') return { ok: false, reason: 'Tarayıcı ortamı bulunamadı.' };
    let inFrame = false;
    try {
      inFrame = window.self !== window.top;
    } catch {
      inFrame = true;
    }
    if (inFrame) {
      return {
        ok: false,
        reason: 'Site bir önizleme penceresi (ör. Google AI Studio önizlemesi) içinde açık. Parmak izi için siteyi kendi adresinde, ayrı bir sekmede açın.',
      };
    }
    if (!window.isSecureContext) {
      return { ok: false, reason: 'Parmak izi yalnızca güvenli bağlantıda (https://… ya da bilgisayarda http://localhost) çalışır.' };
    }
    if (!window.PublicKeyCredential || !navigator.credentials || !crypto?.subtle) {
      return { ok: false, reason: 'Bu tarayıcı parmak izi ile girişi desteklemiyor. Chrome, Edge veya Safari\'nin güncel sürümünü kullanın.' };
    }
    const PKC: any = window.PublicKeyCredential;
    if (typeof PKC.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') {
      return { ok: false, reason: 'Bu tarayıcı parmak izi ile girişi desteklemiyor. Chrome, Edge veya Safari\'nin güncel sürümünü kullanın.' };
    }
    // Bu kontrol bazı tarayıcılarda (ör. Touch ID açık olsa bile) yanlışlıkla "false" dönebiliyor.
    // Bu yüzden artık engellemiyoruz: sonucu sadece deniyoruz, gerçek hata kayıt sırasında gösterilir.
    try {
      await PKC.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch {
      /* yok sayılır */
    }
    return { ok: true, reason: '' };
  } catch {
    return { ok: false, reason: 'Parmak izi desteği denetlenemedi.' };
  }
}

/** Cihazda parmak izi / yüz tanıma doğrulayıcısı var mı? */
export async function isBiometricAvailable(): Promise<boolean> {
  return (await getBiometricSupport()).ok;
}

// ---------------------------------------------------------------------------- saklama
export function getBiometricProfile(role: BiometricRole): BiometricProfile | null {
  try {
    const raw = localStorage.getItem(STORE_KEY(role));
    if (!raw) return null;
    const p = JSON.parse(raw);
    return p && p.v === 1 && p.role === role && p.credentialId && p.cipher ? (p as BiometricProfile) : null;
  } catch {
    return null;
  }
}
export function removeBiometricProfile(role: BiometricRole): void {
  try {
    localStorage.removeItem(STORE_KEY(role));
  } catch {
    /* tarayıcı depolaması yoksa yapılacak bir şey yok */
  }
}
function saveProfile(p: BiometricProfile) {
  try {
    localStorage.setItem(STORE_KEY(p.role), JSON.stringify(p));
  } catch {
    throw new Error('Tarayıcı depolamasına yazılamadı (gizli sekme olabilir). Parmak izi girişi açılamadı.');
  }
}

// ---------------------------------------------------------------------------- PRF ile gizli değer alma
async function getPrfSecret(credentialId: BufferSource, salt: BufferSource): Promise<ArrayBuffer> {
  const assertion: any = await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      allowCredentials: [{ id: credentialId, type: 'public-key', transports: ['internal', 'hybrid'] as any }],
      userVerification: 'required',
      timeout: 60000,
      extensions: { prf: { eval: { first: salt } } } as any,
    },
  });
  const res = assertion?.getClientExtensionResults?.()?.prf?.results?.first;
  if (!res) throw new Error('Bu cihaz veya tarayıcı güvenli parmak izi girişini (PRF) desteklemiyor. Chrome, Edge veya Safari\'nin güncel sürümünü kullanın.');
  return res as ArrayBuffer;
}

// ---------------------------------------------------------------------------- aç / kullan
/**
 * Parmak izi girişini açar. Mutlaka bir düğme tıklamasının içinden çağrılmalıdır (tarayıcı kuralı).
 * Kullanıcıdan parmak izi 1–2 kez istenebilir (kayıt + doğrulama).
 */
export async function enableBiometricLogin(opts: {
  role: BiometricRole;
  identifier: string;
  name: string;
  password: string;
}): Promise<BiometricProfile> {
  if (!(await isBiometricAvailable())) throw new Error('Bu cihazda parmak izi / yüz tanıma doğrulayıcısı bulunamadı.');
  const salt = randomBytes(32);
  let credential: any;
  try {
    credential = await navigator.credentials.create({
      publicKey: {
        challenge: randomBytes(32),
        rp: { name: RP_NAME },
        user: {
          id: randomBytes(16),
          name: `${opts.identifier}${opts.role === 'student' ? ' (öğrenci)' : ' (öğretmen)'}`,
          displayName: opts.name || opts.identifier,
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 }, // ES256
          { type: 'public-key', alg: -257 }, // RS256
        ],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
        timeout: 60000,
        attestation: 'none',
        extensions: { prf: { eval: { first: salt } } } as any,
      },
    });
  } catch (e) {
    throw friendlyError(e, 'Parmak izi kaydı oluşturulamadı.');
  }
  if (!credential) throw new Error('Parmak izi kaydı oluşturulamadı.');
  const ext = credential.getClientExtensionResults?.() || {};
  if (ext.prf && ext.prf.enabled === false) {
    throw new Error('Bu cihaz veya tarayıcı güvenli parmak izi girişini desteklemiyor. Chrome, Edge veya Safari\'nin güncel sürümünü kullanın.');
  }
  const credentialId = new Uint8Array(credential.rawId);

  // Bazı cihazlar gizli değeri kayıtta verir; vermezse bir doğrulama daha istenir
  let secret: ArrayBuffer | undefined = ext.prf?.results?.first;
  if (!secret) {
    try {
      secret = await getPrfSecret(credentialId, salt);
    } catch (e) {
      throw friendlyError(e, 'Parmak izi doğrulanamadı.');
    }
  }
  const key = await deriveAesKey(secret, salt);
  const iv = randomBytes(12);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(opts.password));
  const profile: BiometricProfile = {
    v: 1,
    role: opts.role,
    identifier: opts.identifier,
    name: opts.name,
    credentialId: toB64u(credentialId),
    salt: toB64u(salt),
    iv: toB64u(iv),
    cipher: toB64u(cipher),
    createdAt: new Date().toISOString(),
  };
  saveProfile(profile);
  return profile;
}

/** Parmak izini doğrular ve kayıtlı giriş bilgisini döndürür. Bir düğme tıklamasının içinden çağrılmalıdır. */
export async function unlockBiometricLogin(role: BiometricRole): Promise<{ identifier: string; password: string; name: string }> {
  const p = getBiometricProfile(role);
  if (!p) throw new Error('Bu cihazda kayıtlı parmak izi girişi yok.');
  let secret: ArrayBuffer;
  try {
    secret = await getPrfSecret(fromB64u(p.credentialId), fromB64u(p.salt));
  } catch (e) {
    throw friendlyError(e, 'Parmak izi doğrulanamadı.');
  }
  try {
    const key = await deriveAesKey(secret, fromB64u(p.salt));
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64u(p.iv) }, key, fromB64u(p.cipher));
    return { identifier: p.identifier, password: new TextDecoder().decode(plain), name: p.name };
  } catch {
    throw new Error('Kayıtlı parmak izi bilgisi okunamadı. Lütfen şifrenizle girip parmak izi girişini yeniden açın.');
  }
}
