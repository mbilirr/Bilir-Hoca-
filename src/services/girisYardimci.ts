// ============================================================================
// Aşama 319: VERİ SERVİSİNİ AYIRMA, 9. PARÇA — GİRİŞ YARDIMCILARI
// Kullanıcı adından giriş adresi üretme, Türkçe harf sadeleştirme, aday adreslerle sırayla giriş (robot jetonuyla),
// tek seferlik şifre üretme, eski sürümde saklanmış şifrelerin temizlenmesi.
// Kod dataService.ts'ten KELİMESİ KELİMESİNE taşındı (yalnız başlarına "export" eklendi, "this." / "DataService."
// çağrıları doğrudan çağrı oldu); davranış aynı.
// ============================================================================
import { supabase } from '../lib/supabase';
import { robotJetonu, robotKorumaAcik } from '../lib/robotKoruma'; // Aşama 309, 339
import { appStorage } from './depo';
import { loginErrorMessage, kilitMesaji } from './hataMetinleri';

// dataService.ts'teki gibi: "localStorage" adı uygulama deposunu gösterir (çıkışta kilitlenen, oturuma göre seçilen depo)
const localStorage = appStorage;

// Sistemin öğretmen/öğrenci hesapları için ürettiği giriş adresi (create-user fonksiyonu ile aynı kural)
export function canonicalAuthEmail(type: 'teacher' | 'student', identifier: string): string {
  const clean = (identifier || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  return `${type === 'teacher' ? 'tch' : 'std'}_${clean || 'user'}@okul.internal.net`;
}

// Aşama 154: girişte yazılan Türkçe harfler ASCII karşılığına çevrilir ("ayşedemir" -> "aysedemir", "İ/I" -> "i").
// Eski kural harfi SİLİYORDU ("ayşedemir" -> "ayedemir"); o adresle açılmış eski hesaplar bozulmasın diye
// giriş, önce çevrilmiş sonra eski (silinmiş) adresi dener. Yazılan ad ASCII ise ikisi aynıdır, fazladan istek olmaz.
export function trLoginFold(v: string): string {
  return (v || '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıöşüâîû]/g, (c) => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' } as Record<string, string>)[c] || c)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function generatePasswordOnce(length: number): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(length);
  try {
    crypto.getRandomValues(bytes);
  } catch {
    for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = '';
  for (let i = 0; i < length; i++) out += chars[bytes[i] % chars.length];
  // En az bir rakam içersin
  if (!/[0-9]/.test(out)) out = out.slice(0, -1) + String(2 + (bytes[0] % 8));
  return out;
}

// Aşama 332 (HIZ): kullanıcı adıyla girişte hangi adresin tuttuğu bu cihazda hatırlanır; sonraki girişte ilk o denenir.
// Eskiden ör. sistem sahibi her girişte önce iki sistem adresini (her biri ayrı robot jetonu + boşa giriş isteği) deniyordu.
// Yalnız sistemin ürettiği adresler (…@okul.internal.net) ve kodda zaten açık duran yönetici adresi saklanır; şifre saklanmaz.
const IPUCU = 'bilir_giris_ipucu_v1';
const ipucuDeposu = (): Storage | null => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};
export function girisIpucuOku(anahtar: string): string | null {
  try {
    const m = JSON.parse(ipucuDeposu()?.getItem(IPUCU) || '{}');
    const v = m && typeof m[anahtar] === 'string' ? m[anahtar] : null;
    return v || null;
  } catch {
    return null;
  }
}
export function girisIpucuYaz(anahtar: string, adres: string, izinli: (a: string) => boolean): void {
  if (!anahtar || !izinli(adres)) return;
  try {
    const d = ipucuDeposu();
    const m = JSON.parse(d?.getItem(IPUCU) || '{}') || {};
    m[anahtar] = adres;
    const k = Object.keys(m);
    if (k.length > 12) delete m[k[0]]; // cihazda en çok 12 kullanıcı adı
    d?.setItem(IPUCU, JSON.stringify(m));
  } catch {
    /* depolama kapalı */
  }
}

// Sırayla aday giriş adreslerini dener. Kilitli/askıdaki hesapta hemen durur.
export async function signInWithCandidates(
  emails: string[],
  password: string,
  role: 'teacher' | 'student'
): Promise<{ user: any; session: any } | null> {
  const tried = new Set<string>();
  for (const email of emails) {
    const clean = (email || '').trim().toLowerCase();
    if (!clean || tried.has(clean)) continue;
    tried.add(clean);
    // Aşama 309: her deneme kendi taze jetonuyla (jeton tek kullanımlık); koruma kapalıysa jetonsuz, eskisi gibi
    const captchaToken = await robotJetonu();
    const { data, error } = await supabase.auth.signInWithPassword({ email: clean, password, options: captchaToken ? { captchaToken } : undefined });
    if (!error && data?.user) return { user: data.user, session: data.session }; // Aşama 339: oturum, kilit denetimi için
    const friendly = loginErrorMessage(error, role);
    if (friendly) throw new Error(friendly);
  }
  return null;
}

// GÜVENLİK: "Beni Hatırla" için daha önce tarayıcıya açık metin kaydedilmiş şifreleri sil.
export function purgeSavedPasswords(): void {
  if (typeof localStorage === 'undefined') return;
  ['edu_sys_remember_me_v6', 'edu_sys_remember_me_teacher_v6', 'edu_sys_remember_me_student_v6'].forEach((key) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && 'savedPassword' in parsed) {
        delete parsed.savedPassword;
        localStorage.setItem(key, JSON.stringify(parsed));
      }
    } catch {
      // bozuk kayıt: tamamen kaldır
      try { localStorage.removeItem(key); } catch {}
    }
  });
}

// ============================================================================
// Aşama 339: HATALI GİRİŞ KAYDI VE HESAP KİLİDİ (sunucu: api/giris.js, SQL 339)
// Aynı hesapta 15 dakikada 5 hatalı deneme: hesap 15 dakika kilitli, yöneticiye bildirim + SMS (ayara göre).
// Şifre sunucuya gitmez; yalnız "bu kullanıcı adında şifre tutmadı" bilgisi gider.
// Sunucuya ulaşılamazsa (SQL kurulmamış, ağ) giriş eskisi gibi çalışır: kilit yok sayılır, giriş durmaz.
// Hız: başarılı girişte denetim, hesabın kendi kaydı okunurken AYNI ANDA yürür; ek bekleme olmaz.
// ============================================================================
export interface GirisKilit {
  kilitli: boolean;
  dakika: number;
}
const KILIT_YOK: GirisKilit = { kilitli: false, dakika: 0 };

// Aşama 342: metin hataMetinleri.ts'te (veritabanı kancasının hatası da aynı yazıyla gösterilir)
export { kilitMesaji };

async function girisApi(govde: Record<string, unknown>, token?: string): Promise<GirisKilit> {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const zaman = ctrl ? setTimeout(() => ctrl.abort(), 9000) : null;
  try {
    const r = await fetch('/api/giris', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(govde),
      signal: ctrl?.signal,
    });
    if (!r.ok) return KILIT_YOK;
    const d = await r.json().catch(() => null);
    return d && d.kilitli ? { kilitli: true, dakika: Number(d.dakika) || 15 } : KILIT_YOK;
  } catch {
    return KILIT_YOK;
  } finally {
    if (zaman) clearTimeout(zaman);
  }
}

/** Şifre tutmadı: kaydı gönderir; kilit düştüyse kilit mesajıyla hata fırlatır. */
export async function girisHatasiniBildir(kimlik: string, rol: 'teacher' | 'student'): Promise<void> {
  let robot: string | undefined;
  if (robotKorumaAcik()) {
    try {
      robot = (await robotJetonu()) || undefined; // tek kullanımlık taze jeton (girişteki jeton harcandı)
    } catch {
      robot = undefined;
    }
  }
  const k = await girisApi({ action: 'hata', tur: rol === 'student' ? 'ogrenci' : 'ogretmen', kimlik: (kimlik || '').trim(), robot });
  if (k.kilitli) throw new Error(kilitMesaji(k.dakika));
}

/** Şifre doğru: kilit sürüyor mu? Başarılı girişin hemen ardından başlatılır, sonuç sonra beklenir. */
export function girisKilidiDenetle(session: any): Promise<GirisKilit> {
  const token = session?.access_token;
  if (!token) return Promise.resolve(KILIT_YOK);
  return girisApi({ action: 'basari' }, token);
}

/**
 * Aşama 372 (HIZ): giriş düğmesi artık bu yanıtı BEKLEMEZ. Hesap kilidini 342'den beri veritabanı kancası zaten uygular:
 * kilitli hesap oturum anahtarı alamaz. Bu çağrı yalnız sayacı sıfırlar; arkada çalışır. Kancanın kurulu olmadığı
 * olağan dışı durumda kilit sürüyorsa yanıt geç de olsa gelince bu sekmenin oturumu kapatılır.
 */
export async function girisKilidiniUygula(p: Promise<GirisKilit>): Promise<void> {
  void p
    .then(async (k) => {
      if (k.kilitli) {
        await supabase.auth.signOut({ scope: 'local' });
        if (typeof window !== 'undefined') window.location.reload();
      }
    })
    .catch(() => {});
}
