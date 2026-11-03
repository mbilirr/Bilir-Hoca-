// Aşama 145: basit şifre engeli.
// Kural (Mustafa, 3 Kasım 2026, "hafif"): en az 6 karakter kalır; ardışık (123456, abcdef), aynı karakter
// tekrarı (111111), kısa kalıp tekrarı (121212, abcabc), yaygın şifreler ve kişinin kendi numarası /
// kullanıcı adı / adı reddedilir.
// Bu dosyadaki SIFRE_KURALI bloğu supabase/functions/create-user/index.ts içinde AYNEN tekrarlanır
// (sunucu da aynı kuralı uygular, atlanamaz). Birini değiştirirseniz diğerini de değiştirin.
// Hız: ağ çağrısı yok, liste Set içinde; tek denetim mikro saniyeler sürer.

// SIFRE_KURALI_BASLA
const SIFRE_EN_AZ = 6;

const TR_HARF: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', i: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
const sifreSade = (v: string): string =>
  String(v || '')
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .toLowerCase()
    .replace(/[çğıöşüâîû]/g, (c) => TR_HARF[c] || c)
    .trim();

const SIRALAR = ['01234567890', 'abcdefghijklmnopqrstuvwxyz', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm', 'qwertzuiop', 'yxcvbnm', '1qaz2wsx3edc'];

const YAYGIN_SIFRELER = new Set<string>([
  '123123', '123321', '112233', '111222', '121314', '123654', '159753', '147258', '147258369', '159357', '102030', '010203',
  '123qwe', 'qwe123', '1q2w3e', '1q2w3e4r', '1q2w3e4r5t', 'q1w2e3', 'q1w2e3r4', 'a1b2c3', 'abc123', '123abc', 'aa123456',
  'qazwsx', 'qwerty', 'qwerty1', 'qwerty12', 'qwerty123', 'asdasd', 'asd123', 'zxczxc', 'qweasd', 'qweasdzxc', 'asdqwe',
  '696969', '131313', '777777', '555555', '000000', '987654321', '11223344', '12344321', '20202020', '19051905', '19071907',
  '19031903', '19671967', '1905', '1907', '1903',
  'password', 'password1', 'password123', 'passw0rd', 'pass123', 'admin', 'admin123', 'administrator', 'root', 'toor',
  'iloveyou', 'monkey', 'dragon', 'master', 'letmein', 'welcome', 'sunshine', 'princess', 'football', 'baseball', 'superman',
  'batman', 'starwars', 'whatever', 'freedom', 'shadow', 'michael', 'charlie', 'jordan', 'hello', 'hello123', 'trustno1',
  'sifre', 'sifre1', 'sifre12', 'sifre123', 'sifre1234', 'sifrem', 'sifrem123', 'parola', 'parola1', 'parola123', 'parolam',
  'yeni', 'yenisifre', 'yeni123', 'deneme', 'deneme1', 'deneme12', 'deneme123', 'test', 'test123', 'test1234', 'guest',
  'okul', 'okul123', 'okulum', 'ogrenci', 'ogrenci1', 'ogrenci123', 'ogretmen', 'ogretmen1', 'ogretmen123', 'hoca', 'hoca123',
  'kurum', 'kurum123', 'dershane', 'kolej', 'kolej123', 'etut', 'etut123', 'sinav', 'sinif', 'biliredu', 'biliredu123', 'bilir',
  'galatasaray', 'fenerbahce', 'besiktas', 'trabzonspor', 'cimbom', 'cimbombom', 'gs', 'fb', 'bjk', 'ts', 'aslan', 'kartal',
  'kanarya', 'fener', 'cimbom1905', 'turkiye', 'turkey', 'istanbul', 'ankara', 'izmir', 'bursa', 'antalya', 'adana', 'konya',
  'ataturk', 'mustafakemal', 'askim', 'askim123', 'seviyorum', 'seniseviyorum', 'canim', 'canim123', 'bebegim', 'hayatim',
  'annem', 'babam', 'ailem', 'kardesim', 'allah', 'bismillah', 'muhammed', 'mehmet', 'ahmet', 'mustafa', 'ali', 'ayse',
  'fatma', 'zeynep', 'elif', 'emre', 'can', 'merhaba', 'selam', 'tamam', 'evet', 'hayir', 'bilmiyorum', 'unuttum', 'gizli',
  'gizlisifre', 'kendim', 'benim', 'sensin', 'qwertyui', 'asdfgh', 'asdfghjk', 'zxcvbn', 'zxcvbnm', 'abcabc', 'aaaaaa',
]);

// Başta/sonda kalan rakam ve işaretleri atar ("sifre123!" → "sifre", "2010deniz" → "deniz")
const sifreKok = (s: string): string => s.replace(/^[^a-z]+|[^a-z]+$/g, '');

const sifreArdisik = (s: string): boolean => {
  if (s.length < 4) return false;
  for (const sira of SIRALAR) {
    const ters = sira.split('').reverse().join('');
    if (sira.includes(s) || ters.includes(s)) return true;
  }
  return false;
};

// Kısa bir kalıbın tekrarı mı? (111111, 121212, abcabc, 12341234)
const sifreTekrar = (s: string): 'tek' | 'kalip' | null => {
  if (/^(.)\1+$/.test(s)) return 'tek';
  for (let n = 2; n <= 4 && n * 2 <= s.length; n++) {
    if (s.length % n !== 0) continue;
    if (s.slice(0, n).repeat(s.length / n) === s) return 'kalip';
  }
  return null;
};

export interface SifreKisi {
  identifier?: string | null; // öğrenci numarası / kullanıcı adı
  name?: string | null; // ad soyad
}

// Şifre kurala uyuyorsa null, uymuyorsa Türkçe neden döner.
export function sifreSorunu(password: string, kisi?: SifreKisi): string | null {
  const ham = String(password || '');
  if (ham.trim().length < SIFRE_EN_AZ) return `Şifre en az ${SIFRE_EN_AZ} karakter olmalıdır.`;
  const s = sifreSade(ham).replace(/\s+/g, '');
  const tekrar = sifreTekrar(s);
  if (tekrar === 'tek') return 'Şifre aynı karakterin tekrarı olamaz (ör. 111111).';
  if (tekrar === 'kalip') return 'Şifre tekrar eden bir kalıp olamaz (ör. 121212, abcabc).';
  if (sifreArdisik(s)) return 'Şifre ardışık karakterlerden oluşamaz (ör. 123456, abcdef, qwerty).';
  const kok = sifreKok(s);
  if (YAYGIN_SIFRELER.has(s) || (kok.length >= 2 && YAYGIN_SIFRELER.has(kok)) || (kok.length >= 4 && sifreArdisik(kok))) {
    return 'Bu şifre çok yaygın ve kolay tahmin edilir. Lütfen başka bir şifre seçiniz.';
  }
  const kisisel = 'Şifre öğrenci numarası, kullanıcı adı veya ad-soyad içeremez.';
  const kimlik = sifreSade(kisi?.identifier || '').replace(/\s+/g, '');
  if (kimlik.length >= 3) {
    const tersKimlik = kimlik.split('').reverse().join('');
    if (s === kimlik || s === tersKimlik || (kimlik.length >= 4 && s.includes(kimlik))) return kisisel;
  }
  const adlar = sifreSade(kisi?.name || '')
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length >= 3);
  if (adlar.length) {
    if (adlar.join('') === s || adlar.join('') === kok) return kisisel;
    for (const ad of adlar) {
      if (kok === ad || (ad.length >= 4 && s.includes(ad))) return kisisel;
    }
  }
  return null;
}
// SIFRE_KURALI_BITIR
