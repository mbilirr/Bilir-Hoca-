// ============================================================================
// Aşama 319: VERİ SERVİSİNİ AYIRMA, 9. PARÇA — GİRİŞ YARDIMCILARI
// Kullanıcı adından giriş adresi üretme, Türkçe harf sadeleştirme, aday adreslerle sırayla giriş (robot jetonuyla),
// tek seferlik şifre üretme, eski sürümde saklanmış şifrelerin temizlenmesi.
// Kod dataService.ts'ten KELİMESİ KELİMESİNE taşındı (yalnız başlarına "export" eklendi, "this." / "DataService."
// çağrıları doğrudan çağrı oldu); davranış aynı.
// ============================================================================
import { supabase } from '../lib/supabase';
import { robotJetonu } from '../lib/robotKoruma'; // Aşama 309
import { appStorage } from './depo';
import { loginErrorMessage } from './hataMetinleri';

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

// Sırayla aday giriş adreslerini dener. Kilitli/askıdaki hesapta hemen durur.
export async function signInWithCandidates(
  emails: string[],
  password: string,
  role: 'teacher' | 'student'
): Promise<{ user: any } | null> {
  const tried = new Set<string>();
  for (const email of emails) {
    const clean = (email || '').trim().toLowerCase();
    if (!clean || tried.has(clean)) continue;
    tried.add(clean);
    // Aşama 309: her deneme kendi taze jetonuyla (jeton tek kullanımlık); koruma kapalıysa jetonsuz, eskisi gibi
    const captchaToken = await robotJetonu();
    const { data, error } = await supabase.auth.signInWithPassword({ email: clean, password, options: captchaToken ? { captchaToken } : undefined });
    if (!error && data?.user) return { user: data.user };
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
