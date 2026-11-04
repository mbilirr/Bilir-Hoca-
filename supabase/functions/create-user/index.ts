import { createClient } from 'npm:@supabase/supabase-js@2';

// =============================================================================
// create-user: Giriş hesaplarını yöneten TEK sunucu fonksiyonu.
// Yalnızca giriş yapmış yönetici ve öğretmenler çağırabilir.
//   - Yönetici: tüm öğrenci ve öğretmen hesapları
//   - Öğretmen: yalnızca yetkili olduğu sınıflardaki / kendisine atanmış öğrenciler
// Aşama 18 (kurumlar): Tam yetki yalnızca genel yöneticide. Kurum yöneticisi yalnızca kendi kurumunun
// öğretmen ve öğrenci hesaplarını (genel yöneticinin izin verdiği ölçüde) yönetir. Öğretmenler hesap yönetemez.
// İşlemler (body.action):
//   upsert (varsayılan)   : hesap oluştur / şifre belirle / giriş adını güncelle
//   bulk_upsert           : toplu öğrenci hesabı (Excel içe aktarma)
//   delete_accounts       : kayıt silinmeden önce giriş hesaplarını sil
//   set_suspended         : hesabı askıya al / aç            (yalnızca yönetici)
//   set_role              : öğretmen <-> yönetici             (yalnızca yönetici)
//   approve_application   : öğrenci başvurusunu onayla         (genel yönetici: kurumsuz başvuru; Aşama 99b: kurum
//                           yöneticisi: kendi kurumunun bağlantısıyla gelen başvuru, öğrenci yönetimi açıksa)
//   reject_application    : öğrenci başvurusunu reddet         (aynı kural)
// =============================================================================

// GÜVENLİK: Yalnızca uygulamanın kendi adreslerinden gelen tarayıcı isteklerine izin verilir.
// Aşama 79: ana adres www.biliredu.com (ve www'suz biliredu.com). Vercel yedek adresleri: biliredu.vercel.app,
// pusulaedu.vercel.app ve bunların deneme (preview) adresleri. bilir-hoca.vercel.app silindiği için artık KABUL EDİLMEZ
// (boşa çıkan ad başkası tarafından alınabilir).
const ALLOWED_ORIGIN_PATTERN = /^https:\/\/((www\.)?biliredu\.com|(biliredu|pusulaedu)(-[a-z0-9-]+)?\.vercel\.app)$/;
const DEFAULT_ORIGIN = 'https://www.biliredu.com';
const HEAD_ADMIN_EMAIL = 'm.bilirr@gmail.com';
const MIN_PASSWORD_LENGTH = 6;
const MAX_PASSWORD_LENGTH = 72;
const BAN_FOREVER = '876000h';

type AccountType = 'student' | 'teacher';

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function buildCorsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGIN_PATTERN.test(origin) ? origin : DEFAULT_ORIGIN;
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

// Sistemin giriş adresi kuralı (istemcideki canonicalAuthEmail ile birebir aynı)
export function generateSyntheticEmail(type: AccountType, identifier: string): string {
  const clean = String(identifier || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
  if (!clean) {
    throw new HttpError(
      400,
      type === 'student'
        ? 'Öğrenci numarası geçersiz. Yalnızca rakam, harf, - ve _ kullanılabilir.'
        : 'Kullanıcı adı geçersiz. Yalnızca harf, rakam, - ve _ kullanılabilir.'
    );
  }
  return `${type === 'teacher' ? 'tch' : 'std'}_${clean}@okul.internal.net`;
}

// Aşama 145: basit şifre engeli. Bu blok src/lib/sifreKurali.ts ile BİREBİR aynıdır (istemci de aynı kuralı uygular).
// Birini değiştirirseniz diğerini de değiştirin.
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

function checkPassword(password: unknown): string | undefined {
  if (password === undefined || password === null || password === '') return undefined;
  const pw = String(password);
  if (pw.length < MIN_PASSWORD_LENGTH) {
    throw new HttpError(400, `Şifre en az ${MIN_PASSWORD_LENGTH} karakter olmalıdır.`);
  }
  if (pw.length > MAX_PASSWORD_LENGTH) {
    throw new HttpError(400, `Şifre en fazla ${MAX_PASSWORD_LENGTH} karakter olabilir.`);
  }
  return pw;
}

function tableFor(type: AccountType) {
  return type === 'teacher' ? 'teachers' : 'students';
}

function parseType(value: unknown): AccountType {
  if (value !== 'student' && value !== 'teacher') {
    throw new HttpError(400, "Geçersiz tip: type sadece 'student' veya 'teacher' olabilir.");
  }
  return value;
}

function isAdminUser(user: any): boolean {
  return (
    user?.email?.toLowerCase() === HEAD_ADMIN_EMAIL ||
    user?.app_metadata?.role === 'admin' ||
    user?.app_metadata?.is_admin === true
  );
}

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req.headers.get('origin'));
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return reply({ error: 'Yalnızca POST isteği kabul edilir.' }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!supabaseUrl || !supabaseServiceKey) {
      return reply({ error: 'Supabase URL veya Service Role Key ortam değişkeni eksik.' }, 500);
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ---------------------------------------------------------------------
    // 1) Çağıranın kimliği (JWT) ve rolü
    // ---------------------------------------------------------------------
    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return reply({ error: 'Yetkilendirme reddedildi: Authorization (Bearer) başlığı eksik veya geçersiz.' }, 401);
    }
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData?.user) {
      return reply({ error: 'Yetkilendirme başarısız: Geçersiz veya süresi dolmuş oturum. Lütfen tekrar giriş yapınız.' }, 401);
    }
    const caller = userData.user;
    const callerIsHead = (caller.email || '').toLowerCase() === HEAD_ADMIN_EMAIL;

    // Kurum bilgisi (17 numaralı SQL çalıştırılmadıysa eski davranış sürer)
    let kurumSupported = true;
    let callerRow: Record<string, any> | null = null;
    {
      const r = await admin.from('teachers').select('id, is_admin, status, kurum_id').eq('auth_user_id', caller.id).maybeSingle();
      if (r.error && /kurum_id/i.test(r.error.message || '')) {
        kurumSupported = false;
        const r2 = await admin.from('teachers').select('id, is_admin, status').eq('auth_user_id', caller.id).maybeSingle();
        callerRow = (r2.data as Record<string, any>) || null;
      } else {
        callerRow = (r.data as Record<string, any>) || null;
      }
    }
    const callerKurumId: string | null = kurumSupported && callerRow?.kurum_id ? String(callerRow.kurum_id) : null;
    let callerModules: Record<string, any> = {};
    if (callerKurumId) {
      const { data: k } = await admin.from('kurumlar').select('modules').eq('id', callerKurumId).maybeSingle();
      callerModules = (k && (k as any).modules) || {};
    }
    const callerIsAdmin = kurumSupported ? callerIsHead : isAdminUser(caller);
    const callerIsKurumAdmin =
      kurumSupported &&
      !callerIsHead &&
      !!callerRow?.is_admin &&
      !!callerKurumId &&
      (callerRow?.status || 'approved') === 'approved';
    const callerRole = caller.app_metadata?.role;
    const callerIsTeacher = !callerIsAdmin && !callerIsKurumAdmin && (callerRole === 'teacher' || callerRole === 'admin');
    if (!callerIsAdmin && !callerIsKurumAdmin && !callerIsTeacher) {
      return reply({ error: 'Bu işlem için yetkiniz yok. Hesap işlemlerini yalnızca yöneticiler yapabilir.' }, 403);
    }

    const requireAdmin = () => {
      if (!callerIsAdmin) throw new HttpError(403, 'Bu işlemi yalnızca genel yönetici yapabilir.');
    };

    // ---------------------------------------------------------------------
    // Yardımcılar
    // ---------------------------------------------------------------------
    const loadRow = async (type: AccountType, id: string) => {
      const columns =
        (type === 'teacher'
          ? 'id, name, username, email, is_admin, status, auth_user_id'
          : 'id, name, student_number, class_id, status, auth_user_id') + (kurumSupported ? ', kurum_id' : '');
      const { data, error } = await admin.from(tableFor(type)).select(columns).eq('id', id).maybeSingle();
      if (error) throw new HttpError(500, `Kayıt okunamadı: ${error.message}`);
      if (!data) throw new HttpError(404, type === 'teacher' ? 'Öğretmen kaydı bulunamadı.' : 'Öğrenci kaydı bulunamadı.');
      return data as Record<string, any>;
    };

    // Aşama 108: giriş adı (numara / kullanıcı adı) tüm sistemde tektir. Çakışan kayıt başka okuldaysa adı gösterilmez,
    // yalnız "farklı numara verin" denir. Genel yönetici her şeyi görebildiği için ona ad gösterilir.
    const sameSchoolAs = (a: Record<string, any> | null | undefined, b: Record<string, any> | null | undefined) =>
      callerIsHead || !kurumSupported || String(a?.kurum_id || '') === String(b?.kurum_id || '');
    const otherSchoolMsg = (type: AccountType, identifier: string) =>
      type === 'student'
        ? `"${identifier}" numarası başka bir okulda kullanılıyor. Öğrenciye farklı bir numara verin.`
        : `"${identifier}" kullanıcı adı başka bir okulda kullanılıyor. Farklı bir kullanıcı adı verin.`;

    // Aşama 149: çağıranın KENDİ oturumuyla veritabanı kuralını sorar (ekranla aynı kural = TAM SENKRON).
    // is_kurum_admin(): kurum yöneticisi hesabı + rol yetkileri açık kurumda unvanla Müdür / Müdür Yrd.
    // kurum_student_editor() / kurum_student_adder(): Aşama 143 kişiye özel izinler (Rehberlik, Ölçme, izin:...).
    // Fonksiyon yoksa ya da hata olursa "hayır" sayılır (eski davranış).
    const rpcCache = new Map<string, Promise<boolean>>();
    const userRpc = (fn: 'is_kurum_admin' | 'kurum_student_editor' | 'kurum_student_adder'): Promise<boolean> => {
      if (!rpcCache.has(fn)) {
        rpcCache.set(
          fn,
          (async () => {
            const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
            if (!kurumSupported || callerIsHead || !callerKurumId || !anonKey) return false;
            if ((callerRow?.status || 'approved') !== 'approved') return false;
            try {
              const userClient = createClient(supabaseUrl, anonKey, {
                global: { headers: { Authorization: `Bearer ${token}` } },
                auth: { persistSession: false, autoRefreshToken: false },
              });
              const { data, error } = await userClient.rpc(fn);
              return !error && data === true;
            } catch {
              return false;
            }
          })()
        );
      }
      return rpcCache.get(fn)!;
    };
    /** Kurum idaresi: is_admin işaretli kurum yöneticisi VEYA veritabanındaki is_kurum_admin() (unvanla Müdür / Yrd.) */
    const callerIsKurumIdare = async (): Promise<boolean> => callerIsKurumAdmin || (await userRpc('is_kurum_admin'));

    // Öğretmen yalnızca yetkili olduğu sınıftaki veya kendisine atanmış öğrenciyi yönetebilir
    // Aşama 149: op 'delete' → öğrenci silmede "Öğrenci ekleme / silme" izni (kurum_student_adder) de kabul edilir.
    const assertCanManage = async (type: AccountType, row: Record<string, any>, op: 'manage' | 'delete' = 'manage') => {
      if (callerIsAdmin) return;
      const studentDeleter = type === 'student' && op === 'delete' && kurumSupported && (await userRpc('kurum_student_adder'));
      if ((await callerIsKurumIdare()) || studentDeleter) {
        const sameKurum = !!row.kurum_id && String(row.kurum_id) === callerKurumId;
        if (type === 'teacher') {
          if (callerModules.manage_teachers !== true) throw new HttpError(403, 'Kurumunuza öğretmen yönetimi izni verilmemiş.');
          if (!sameKurum || row.is_admin) throw new HttpError(403, `"${row.name}" hesabını yönetme yetkiniz yok.`);
          return;
        }
        if (callerModules.manage_students !== true) throw new HttpError(403, 'Kurumunuza öğrenci yönetimi izni verilmemiş.');
        if (!sameKurum) {
          throw new HttpError(403, `"${row.name}" kurumunuzun öğrencisi değil. Bu öğrencinin hesabını yalnızca genel yönetici yönetebilir.`);
        }
        return;
      }
      if (kurumSupported) {
        throw new HttpError(403, 'Öğrenci ve öğretmen hesaplarını yalnızca yöneticiler yönetebilir.');
      }
      if (type !== 'student') {
        throw new HttpError(403, 'Öğretmen hesaplarını yalnızca sistem yöneticisi yönetebilir.');
      }
      const { data: direct } = await admin
        .from('teacher_student_access')
        .select('id')
        .eq('teacher_auth_id', caller.id)
        .eq('student_id', row.id)
        .limit(1);
      if (direct && direct.length > 0) return;
      if (row.class_id) {
        const { data: byClass } = await admin
          .from('teacher_class_access')
          .select('id')
          .eq('teacher_auth_id', caller.id)
          .eq('class_id', row.class_id)
          .limit(1);
        if (byClass && byClass.length > 0) return;
      }
      throw new HttpError(403, `"${row.name}" için yetkiniz yok. Yalnızca yetkili olduğunuz sınıflardaki öğrencilerin hesaplarını yönetebilirsiniz.`);
    };

    // Aşama 149: öğrenci hesabı (şifre ver / hesap aç) — ekrandaki kuralla aynı (TAM SENKRON).
    // Kurumda kurum_student_editor() doğru olan kişi (kurum yöneticisi, Müdür/Yrd., Rehberlik, Ölçme, "Öğrenci düzenleme"
    // izni) kendi kurumunun öğrencisine; genel yönetici anahtarı açtıysa (kurumlar.grant_cred) kuruma AÇILAN sınıfların
    // öğrencilerine YALNIZ ŞİFRE verebilir. Silme / askıya alma bu kuraldan geçmez (assertCanManage aynen).
    const callerIsStudentEditor = async (): Promise<boolean> =>
      (await callerIsKurumIdare()) || (await userRpc('kurum_student_editor'));
    // Aşama 158: anahtar ve sınıf izni istek başına BİR kez okunur (toplu işlemde öğrenci başına 2 sorgu yerine)
    let grantCredOnP: Promise<boolean> | null = null;
    const grantCredOn = (): Promise<boolean> =>
      (grantCredOnP ??= (async () => {
        const { data: k, error: kErr } = await admin.from('kurumlar').select('grant_cred').eq('id', callerKurumId).maybeSingle();
        return !kErr && !!k && (k as any).grant_cred === true; // 149 SQL'i yoksa kapalı sayılır
      })());
    const grantedClassP = new Map<string, Promise<boolean>>();
    const grantCredClass = async (classId: unknown): Promise<boolean> => {
      if (!callerKurumId || !classId) return false;
      if (!(await grantCredOn())) return false;
      const cid = String(classId);
      if (!grantedClassP.has(cid)) {
        grantedClassP.set(
          cid,
          (async () => {
            const { data: g } = await admin
              .from('kurum_class_grants')
              .select('class_id')
              .eq('kurum_id', callerKurumId)
              .eq('class_id', cid)
              .limit(1);
            return !!(g && g.length > 0);
          })()
        );
      }
      return grantedClassP.get(cid)!;
    };
    const assertCanUpsertStudent = async (row: Record<string, any>, input: any, password: string | undefined) => {
      if (callerIsAdmin) return;
      if (!kurumSupported) return assertCanManage('student', row); // kurum öncesi eski kural
      // Hesabı olmayan öğrenciye hesap açmak (öğrenci ekleme) "Öğrenci ekleme / silme" izniyle de olur
      const isNew = !row.auth_user_id;
      if (!(await callerIsStudentEditor()) && !(isNew && (await userRpc('kurum_student_adder')))) {
        throw new HttpError(403, 'Öğrenci hesaplarını yönetme yetkiniz yok. Kurum yöneticinizden "Öğrenci düzenleme" izni isteyin.');
      }
      if (callerModules.manage_students !== true) throw new HttpError(403, 'Kurumunuza öğrenci yönetimi izni verilmemiş.');
      if (!!row.kurum_id && String(row.kurum_id) === callerKurumId) return;
      if (await grantCredClass(row.class_id)) {
        if (!password) throw new HttpError(403, `"${row.name}" için yalnızca şifre verebilirsiniz.`);
        const ident = String(input?.identifier || '').trim();
        if (ident && ident !== String(row.student_number || '').trim()) {
          throw new HttpError(403, `"${row.name}" öğrencisinin numarasını yalnızca genel yönetici değiştirebilir.`);
        }
        return;
      }
      throw new HttpError(403, `"${row.name}" kurumunuzun öğrencisi değil. Bu öğrencinin hesabını yalnızca genel yönetici yönetebilir.`);
    };

    const getAuthUser = async (id: string | null | undefined) => {
      if (!id) return null;
      const { data, error } = await admin.auth.admin.getUserById(id);
      if (error || !data?.user) return null;
      return data.user;
    };

    const findAuthUserByEmail = async (email: string) => {
      const target = email.toLowerCase();
      for (let page = 1; page <= 50; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw new HttpError(500, `Hesap listesi okunamadı: ${error.message}`);
        const users = data?.users || [];
        const found = users.find((u: any) => u.email?.toLowerCase() === target);
        if (found) return found;
        if (users.length < 1000) break;
      }
      return null;
    };

    const isEmailExistsError = (err: any) =>
      err?.code === 'email_exists' ||
      err?.status === 422 ||
      /already (been )?registered|already exists/i.test(err?.message || '');

    // ---------------------------------------------------------------------
    // HESAP OLUŞTUR / GÜNCELLE (tek kayıt)
    // ---------------------------------------------------------------------
    const upsertAccount = async (input: any) => {
      const type = parseType(input?.type);
      const id = String(input?.id || '').trim();
      if (!id) throw new HttpError(400, 'Eksik parametre: id zorunludur.');
      const password = checkPassword(input?.password);

      const row = await loadRow(type, id);
      if (type === 'student') await assertCanUpsertStudent(row, input, password); // Aşama 149
      else await assertCanManage(type, row);

      const identifier = String(
        input?.identifier || (type === 'teacher' ? row.username : row.student_number) || ''
      ).trim();
      const email = generateSyntheticEmail(type, identifier);
      const displayName = String(input?.name || row.name || identifier);
      const mustChange = input?.mustChangePassword === false ? false : true;
      // Aşama 145: basit şifre (123456, 111111, yaygın şifre, kendi numarası/adı) sunucuda da reddedilir
      if (password) {
        const kural = sifreSorunu(password, { identifier, name: String(row.name || input?.name || '') });
        if (kural) throw new HttpError(400, kural);
      }

      let linked = await getAuthUser(row.auth_user_id);

      if (linked && linked.email?.toLowerCase() === HEAD_ADMIN_EMAIL) {
        throw new HttpError(400, 'Baş yönetici hesabının şifresi buradan değiştirilemez. Profil menüsündeki "Şifre Değiştir" ekranını kullanınız.');
      }

      if (linked) {
        // Hesap zaten var: giriş adresini (numara/kullanıcı adı değiştiyse) ve şifreyi güncelle
        const updates: Record<string, unknown> = {};
        if ((linked.email || '').toLowerCase() !== email) {
          const other = await findAuthUserByEmail(email);
          if (other && other.id !== linked.id) {
            throw new HttpError(
              409,
              type === 'student'
                ? `"${identifier}" numarası başka bir öğrenci hesabında kullanılıyor.`
                : `"${identifier}" kullanıcı adı başka bir hesapta kullanılıyor.`
            );
          }
          updates.email = email;
          updates.email_confirm = true;
        }
        if (password) updates.password = password;
        const keepAdmin = isAdminUser(linked);
        updates.app_metadata = keepAdmin ? { role: 'admin', is_admin: true } : { role: type, is_admin: false };
        updates.user_metadata = {
          ...(linked.user_metadata || {}),
          role: keepAdmin ? 'admin' : type,
          legacy_id: row.id,
          name: displayName,
          ...(password ? { must_change_password: mustChange } : {}),
          updated_by: caller.id,
        };
        const { error: updError } = await admin.auth.admin.updateUserById(linked.id, updates);
        if (updError) throw new HttpError(400, `Hesap güncellenemedi: ${updError.message}`);
        return { id: row.id, auth_user_id: linked.id, email, account: true, created: false, password_set: !!password };
      }

      // Kayda bağlı hesap yok
      if (!password) {
        // Şifre verilmediyse hesap açılmaz (ör. yalnızca numara değişikliği)
        return { id: row.id, auth_user_id: null, email, account: false, created: false, password_set: false };
      }

      let authUserId: string;
      let createdNow = false;
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { role: type, is_admin: false },
        user_metadata: {
          role: type,
          legacy_id: row.id,
          name: displayName,
          must_change_password: mustChange,
          created_by: caller.id,
        },
      });

      if (createError) {
        if (!isEmailExistsError(createError)) {
          throw new HttpError(400, `Hesap oluşturulamadı: ${createError.message}`);
        }
        // Bu giriş adresiyle eski bir hesap var: sahipsizse bu kayda bağla
        const existing = await findAuthUserByEmail(email);
        if (!existing) throw new HttpError(409, 'Hesap oluşturulamadı: giriş adresi çakışması.');
        const existingRole = existing.app_metadata?.role;
        if (existingRole === 'applicant') {
          // Aşama 108: başka okulun başvurusu bu okulda görünmez; o durumda "farklı numara" uyarısı
          const { data: ap } = await admin
            .from('student_applications')
            .select('id' + (kurumSupported ? ', kurum_id' : ''))
            .eq('auth_user_id', existing.id)
            .limit(1);
          if (!sameSchoolAs(row, (ap as any[] | null)?.[0])) throw new HttpError(409, otherSchoolMsg(type, identifier));
          throw new HttpError(409, `"${identifier}" numarasıyla bekleyen bir öğrenci başvurusu var. Önce başvuruyu onaylayın veya reddedin.`);
        }
        if (isAdminUser(existing) || (existingRole && existingRole !== type)) {
          throw new HttpError(409, `"${identifier}" giriş adı başka türde bir hesapta kullanılıyor.`);
        }
        const { data: owner } = await admin
          .from(tableFor(type))
          .select('id, name' + (kurumSupported ? ', kurum_id' : ''))
          .eq('auth_user_id', existing.id)
          .neq('id', row.id)
          .limit(1);
        if (owner && owner.length > 0) {
          // Aşama 108: başka okuldaki kişinin adı gösterilmez
          if (!sameSchoolAs(row, owner[0] as any)) throw new HttpError(409, otherSchoolMsg(type, identifier));
          throw new HttpError(
            409,
            type === 'student'
              ? `"${identifier}" numarası "${(owner[0] as any).name}" adlı öğrencinin hesabında kullanılıyor.`
              : `"${identifier}" kullanıcı adı "${(owner[0] as any).name}" adlı öğretmenin hesabında kullanılıyor.`
          );
        }
        const { error: relinkError } = await admin.auth.admin.updateUserById(existing.id, {
          password,
          email_confirm: true,
          app_metadata: { role: type, is_admin: false },
          user_metadata: {
            ...(existing.user_metadata || {}),
            role: type,
            legacy_id: row.id,
            name: displayName,
            must_change_password: mustChange,
            updated_by: caller.id,
          },
          ban_duration: 'none',
        });
        if (relinkError) throw new HttpError(400, `Hesap güncellenemedi: ${relinkError.message}`);
        authUserId = existing.id;
      } else {
        authUserId = created.user.id;
        createdNow = true;
      }

      const { error: linkError } = await admin.from(tableFor(type)).update({ auth_user_id: authUserId }).eq('id', row.id);
      if (linkError) {
        if (createdNow) await admin.auth.admin.deleteUser(authUserId).catch(() => {});
        throw new HttpError(500, `Hesap kayda bağlanamadı: ${linkError.message}`);
      }

      return { id: row.id, auth_user_id: authUserId, email, account: true, created: createdNow, password_set: true };
    };

    // ---------------------------------------------------------------------
    // İŞLEM YÖNLENDİRME
    // ---------------------------------------------------------------------
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || 'upsert');

    if (action === 'upsert') {
      const result = await upsertAccount(body);
      return reply({ success: true, type: body.type, ...result, createdBy: caller.email });
    }

    if (action === 'bulk_upsert') {
      const items = Array.isArray(body?.items) ? body.items : [];
      if (items.length === 0) throw new HttpError(400, 'Toplu işlem için en az bir kayıt gönderilmelidir.');
      if (items.length > 100) throw new HttpError(400, 'Tek seferde en fazla 100 hesap işlenebilir.');
      const results = [];
      for (const item of items) {
        try {
          const res = await upsertAccount({ ...item, type: item?.type || body?.type });
          results.push({ ok: true, ...res });
        } catch (err: any) {
          results.push({ ok: false, id: item?.id, error: err?.message || 'Bilinmeyen hata' });
        }
      }
      return reply({ success: true, results });
    }

    if (action === 'delete_accounts') {
      const type = parseType(body?.type);
      const ids: string[] = Array.isArray(body?.ids) ? body.ids.map((x: unknown) => String(x)) : [];
      if (ids.length === 0) return reply({ success: true, results: [] });
      if (ids.length > 200) throw new HttpError(400, 'Tek seferde en fazla 200 hesap silinebilir.');
      const results = [];
      for (const id of ids) {
        try {
          const { data: row } = await admin
            .from(tableFor(type))
            .select(
              (type === 'teacher' ? 'id, name, is_admin, auth_user_id' : 'id, name, class_id, auth_user_id') +
                (kurumSupported ? ', kurum_id' : '')
            )
            .eq('id', id)
            .maybeSingle();
          if (!row) {
            results.push({ id, ok: true, deleted: false });
            continue;
          }
          await assertCanManage(type, row, 'delete');
          const user = await getAuthUser(row.auth_user_id);
          if (!user) {
            results.push({ id, ok: true, deleted: false });
            continue;
          }
          if (isAdminUser(user)) {
            throw new HttpError(400, 'Yönetici hesabı silinemez.');
          }
          const { error } = await admin.auth.admin.deleteUser(user.id);
          if (error) throw new HttpError(400, error.message);
          results.push({ id, ok: true, deleted: true });
        } catch (err: any) {
          results.push({ id, ok: false, error: err?.message || 'Bilinmeyen hata' });
        }
      }
      return reply({ success: true, results });
    }

    if (action === 'set_suspended') {
      const type = parseType(body?.type);
      const row = await loadRow(type, String(body?.id || ''));
      if (!callerIsAdmin) {
        if (!(await callerIsKurumIdare())) requireAdmin(); // Aşama 149: unvanla Müdür / Yrd. de
        await assertCanManage(type, row);
      }
      const suspend = body?.suspended === true;
      const user = await getAuthUser(row.auth_user_id);
      if (user && isAdminUser(user) && suspend) {
        throw new HttpError(400, 'Yönetici hesabı askıya alınamaz. Önce yöneticilik yetkisini kaldırınız.');
      }
      if (user) {
        const { error } = await admin.auth.admin.updateUserById(user.id, {
          ban_duration: suspend ? BAN_FOREVER : 'none',
        });
        if (error) throw new HttpError(400, `Hesap durumu değiştirilemedi: ${error.message}`);
      }
      const status = suspend ? 'suspended' : type === 'teacher' ? 'approved' : 'active';
      const { error: rowError } = await admin.from(tableFor(type)).update({ status }).eq('id', row.id);
      if (rowError) throw new HttpError(500, `Kayıt durumu güncellenemedi: ${rowError.message}`);
      return reply({ success: true, id: row.id, status, account: !!user });
    }

    if (action === 'set_role') {
      requireAdmin();
      const row = await loadRow('teacher', String(body?.id || ''));
      const makeAdmin = body?.role === 'admin';
      if (body?.role !== 'admin' && body?.role !== 'teacher') {
        throw new HttpError(400, "Geçersiz rol: yalnızca 'admin' veya 'teacher' olabilir.");
      }
      const user = await getAuthUser(row.auth_user_id);
      if (user?.email?.toLowerCase() === HEAD_ADMIN_EMAIL && !makeAdmin) {
        throw new HttpError(400, 'Baş yöneticinin yetkisi kaldırılamaz.');
      }
      if (user && user.id === caller.id && !makeAdmin) {
        throw new HttpError(400, 'Kendi yöneticilik yetkinizi kaldıramazsınız.');
      }
      if (user) {
        const { error } = await admin.auth.admin.updateUserById(user.id, {
          app_metadata: { role: makeAdmin ? 'admin' : 'teacher', is_admin: makeAdmin },
          user_metadata: { ...(user.user_metadata || {}), role: makeAdmin ? 'admin' : 'teacher' },
        });
        if (error) throw new HttpError(400, `Rol değiştirilemedi: ${error.message}`);
      }
      const { error: rowError } = await admin.from('teachers').update({ is_admin: makeAdmin }).eq('id', row.id);
      if (rowError) throw new HttpError(500, `Kayıt güncellenemedi: ${rowError.message}`);
      return reply({ success: true, id: row.id, role: makeAdmin ? 'admin' : 'teacher', account: !!user });
    }

    // Aşama 99b: başvuruyu kim sonuçlandırır — genel yönetici kurumsuz başvuruyu, kurum yöneticisi kendi kurumununkini
    // Kurum idaresi: kurum yöneticisi hesabı ya da (rol yetkileri açıkken) Müdür / Müdür Yrd. — veritabanındaki
    // is_kurum_admin() ile aynı kural
    const callerIsIdare = async (): Promise<boolean> => {
      if (callerIsKurumAdmin) return true;
      if (!kurumSupported || callerIsHead || !callerKurumId || !callerRow?.id || (callerRow?.status || 'approved') !== 'approved') return false;
      const [{ data: k }, { data: r }] = await Promise.all([
        admin.from('kurumlar').select('roles_enabled').eq('id', callerKurumId).maybeSingle(),
        admin.from('teacher_roles').select('role').eq('teacher_id', callerRow.id).in('role', ['mudur', 'mudur_yardimcisi']).limit(1),
      ]);
      return (k as any)?.roles_enabled === true && !!r && r.length > 0;
    };
    const assertCanReview = async (app: Record<string, any>) => {
      const appKurum = app.kurum_id ? String(app.kurum_id) : '';
      if (callerIsAdmin && !appKurum) return;
      if (appKurum && appKurum === callerKurumId && (await callerIsIdare())) {
        if (callerModules.manage_students !== true) throw new HttpError(403, 'Kurumunuza öğrenci yönetimi izni verilmemiş.');
        return;
      }
      throw new HttpError(403, appKurum ? 'Bu başvuru bir kuruma yapılmış; o kurumun yöneticisi onaylar.' : 'Bu başvuruyu yalnızca genel yönetici sonuçlandırabilir.');
    };

    if (action === 'approve_application') {
      const appId = String(body?.applicationId || '');
      const { data: app, error: appError } = await admin
        .from('student_applications')
        .select('*')
        .eq('id', appId)
        .maybeSingle();
      if (appError) throw new HttpError(500, `Başvuru okunamadı: ${appError.message}`);
      if (!app) throw new HttpError(404, 'Başvuru bulunamadı.');
      await assertCanReview(app);
      const appKurumId: string | null = app.kurum_id ? String(app.kurum_id) : null;
      if (app.status !== 'pending') throw new HttpError(409, 'Bu başvuru daha önce sonuçlandırılmış.');

      const user = await getAuthUser(app.auth_user_id);
      if (!user) {
        throw new HttpError(409, 'Başvuruya ait giriş hesabı bulunamadı. Başvuruyu reddedip öğrenciyi elle ekleyiniz.');
      }

      const studentNumber = String(body?.studentNumber || app.student_number || '').trim();
      const email = generateSyntheticEmail('student', studentNumber);
      const name = String(body?.name || app.name || '').trim() || app.name;

      const { data: sameNumber } = await admin
        .from('students')
        .select('id, name' + (kurumSupported ? ', kurum_id' : ''))
        .eq('student_number', studentNumber)
        .limit(1);
      if (sameNumber && sameNumber.length > 0) {
        // Aşama 108: başka okuldaki öğrencinin adı gösterilmez
        if (!sameSchoolAs({ kurum_id: appKurumId }, sameNumber[0] as any)) throw new HttpError(409, otherSchoolMsg('student', studentNumber));
        throw new HttpError(409, `"${studentNumber}" numarası "${(sameNumber[0] as any).name}" adlı öğrenciye ait. Farklı bir numara giriniz.`);
      }

      let classId = 'class-default';
      let className = 'Atanmadı';
      const requestedClassId = String(body?.classId || app.class_id || '').trim();
      if (requestedClassId) {
        const { data: cls } = await admin
          .from('classes')
          .select('id, name' + (kurumSupported ? ', kurum_id' : ''))
          .eq('id', requestedClassId)
          .maybeSingle();
        if (!cls) throw new HttpError(400, 'Seçilen sınıf bulunamadı.');
        // Aşama 99b: kuruma yapılan başvuruda sınıf o kurumun sınıfı olmalı
        if (appKurumId && String((cls as any).kurum_id || '') !== appKurumId) {
          throw new HttpError(400, 'Seçilen sınıf bu kurumun sınıfı değil. Kurumun sınıflarından birini seçin.');
        }
        classId = cls.id;
        className = cls.name;
      }

      if ((user.email || '').toLowerCase() !== email) {
        const other = await findAuthUserByEmail(email);
        if (other && other.id !== user.id) {
          throw new HttpError(409, `"${studentNumber}" numarası başka bir hesapta kullanılıyor.`);
        }
      }

      const studentId = `std-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
      const { error: insertError } = await admin.from('students').insert({
        id: studentId,
        name,
        student_number: studentNumber,
        class_id: classId,
        class_name: className,
        email: app.email || null,
        phone: app.phone || null,
        avatar: app.avatar || null,
        registered_at: new Date().toISOString(),
        auth_user_id: user.id,
        status: 'active',
        // Aşama 99b: sınıfsız onaylanan kurum başvurusu da kurumun öğrencisi olur (sınıflıda tetik sınıftan yazar)
        ...(appKurumId ? { kurum_id: appKurumId } : {}),
      });
      if (insertError) throw new HttpError(500, `Öğrenci kaydı oluşturulamadı: ${insertError.message}`);

      const { error: activateError } = await admin.auth.admin.updateUserById(user.id, {
        email,
        email_confirm: true,
        ban_duration: 'none',
        app_metadata: { role: 'student', is_admin: false },
        user_metadata: {
          ...(user.user_metadata || {}),
          role: 'student',
          legacy_id: studentId,
          name,
          must_change_password: false,
          application: false,
          approved_by: caller.id,
        },
      });
      if (activateError) {
        await admin.from('students').delete().eq('id', studentId);
        throw new HttpError(400, `Hesap etkinleştirilemedi: ${activateError.message}`);
      }

      await admin
        .from('student_applications')
        .update({
          status: 'approved',
          student_id: studentId,
          student_number: studentNumber,
          class_id: classId === 'class-default' ? null : classId,
          reviewed_by: caller.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', app.id);

      return reply({
        success: true,
        student: {
          id: studentId,
          name,
          student_number: studentNumber,
          class_id: classId,
          class_name: className,
          email: app.email || null,
          phone: app.phone || null,
          avatar: app.avatar || null,
          auth_user_id: user.id,
          status: 'active',
        },
      });
    }

    if (action === 'reject_application') {
      const appId = String(body?.applicationId || '');
      const { data: app } = await admin.from('student_applications').select('*').eq('id', appId).maybeSingle();
      if (!app) throw new HttpError(404, 'Başvuru bulunamadı.');
      await assertCanReview(app);
      if (app.status !== 'pending') throw new HttpError(409, 'Bu başvuru daha önce sonuçlandırılmış.');
      const user = await getAuthUser(app.auth_user_id);
      if (user && !isAdminUser(user) && user.app_metadata?.role === 'applicant') {
        await admin.auth.admin.deleteUser(user.id);
      }
      const { error } = await admin
        .from('student_applications')
        .update({
          status: 'rejected',
          reject_reason: body?.reason ? String(body.reason).slice(0, 300) : null,
          reviewed_by: caller.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', app.id);
      if (error) throw new HttpError(500, `Başvuru güncellenemedi: ${error.message}`);
      return reply({ success: true });
    }

    throw new HttpError(400, `Bilinmeyen işlem: ${action}`);
  } catch (err: any) {
    const status = err instanceof HttpError ? err.status : 500;
    return reply({ error: err?.message || 'Sunucu içi hata oluştu.' }, status);
  }
});
