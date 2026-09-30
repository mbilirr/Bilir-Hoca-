import { createClient } from 'npm:@supabase/supabase-js@2';

// =============================================================================
// register-student: Giriş yapmamış öğrencinin KAYIT BAŞVURUSU.
//   action 'classes' : başvuru formundaki sınıf listesi (yalnızca ad ve kimlik)
//   action 'apply'   : başvuruyu kaydeder. Öğrencinin belirlediği şifreyle bir giriş
//                      hesabı açılır ama KİLİTLİ tutulur; yönetici onaylayınca açılır,
//                      reddedince silinir. Şifre hiçbir tabloda saklanmaz.
// =============================================================================

const ALLOWED_ORIGIN_PATTERN = /^https:\/\/bilir-hoca(-[a-z0-9-]+)?\.vercel\.app$/;
const DEFAULT_ORIGIN = 'https://bilir-hoca.vercel.app';
const MIN_PASSWORD_LENGTH = 6;
const MAX_PASSWORD_LENGTH = 72;
const MAX_APPLICATIONS_PER_IP_PER_HOUR = 3;
const MAX_PENDING_APPLICATIONS = 200;
const BAN_FOREVER = '876000h';

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

function cleanText(value: unknown, max: number): string {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
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
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!supabaseUrl || !serviceKey) {
      return reply({ error: 'Sunucu yapılandırması eksik.' }, 500);
    }
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || 'apply');

    // -------------------------------------------------------------------
    // Başvuru formundaki sınıf listesi
    // -------------------------------------------------------------------
    if (action === 'classes') {
      const { data, error } = await admin.from('classes').select('id, name').order('name', { ascending: true });
      if (error) throw new HttpError(500, 'Sınıf listesi alınamadı.');
      return reply({ success: true, classes: (data || []).map((c: any) => ({ id: c.id, name: c.name })) });
    }

    if (action !== 'apply') {
      throw new HttpError(400, 'Bilinmeyen işlem.');
    }

    // Bot tuzağı: gerçek kullanıcılar bu alanı görmez / doldurmaz
    if (cleanText(body?.website, 100)) {
      return reply({ success: true });
    }

    // -------------------------------------------------------------------
    // Alan doğrulama
    // -------------------------------------------------------------------
    const name = cleanText(body?.name, 80);
    if (name.length < 3 || !/^[\p{L}][\p{L} .'-]*$/u.test(name)) {
      throw new HttpError(400, 'Lütfen adınızı ve soyadınızı (yalnızca harflerle) giriniz.');
    }
    const studentNumber = cleanText(body?.studentNumber, 20);
    if (!/^[0-9A-Za-z_-]{1,20}$/.test(studentNumber)) {
      throw new HttpError(400, 'Öğrenci numarası yalnızca rakam ve harflerden oluşmalıdır (boşluksuz).');
    }
    const password = String(body?.password ?? '');
    if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
      throw new HttpError(400, `Şifre en az ${MIN_PASSWORD_LENGTH}, en fazla ${MAX_PASSWORD_LENGTH} karakter olmalıdır.`);
    }
    const email = cleanText(body?.email, 120).toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      throw new HttpError(400, 'E-posta adresi geçersiz.');
    }
    const phone = cleanText(body?.phone, 20);
    if (phone && !/^[0-9 +()-]{7,20}$/.test(phone)) {
      throw new HttpError(400, 'Telefon numarası geçersiz.');
    }
    const requestedClass = cleanText(body?.requestedClass, 60);
    const avatarRaw = cleanText(body?.avatar, 300);
    const avatar = /^https:\/\/api\.dicebear\.com\/[\w./?=&%-]+$/.test(avatarRaw) ? avatarRaw : null;

    let classId: string | null = null;
    const requestedClassId = cleanText(body?.classId, 80);
    if (requestedClassId) {
      const { data: cls } = await admin.from('classes').select('id').eq('id', requestedClassId).maybeSingle();
      if (!cls) throw new HttpError(400, 'Seçilen sınıf bulunamadı. Lütfen listeden tekrar seçiniz.');
      classId = cls.id;
    }

    // -------------------------------------------------------------------
    // Kötüye kullanım sınırları
    // -------------------------------------------------------------------
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'bilinmiyor';
    const ipHash = await sha256Hex(`${ip}|${serviceKey.slice(-16)}`);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { count: recentCount } = await admin
      .from('student_applications')
      .select('id', { count: 'exact', head: true })
      .eq('ip_hash', ipHash)
      .gte('created_at', oneHourAgo);
    if ((recentCount || 0) >= MAX_APPLICATIONS_PER_IP_PER_HOUR) {
      throw new HttpError(429, 'Kısa sürede çok fazla başvuru yapıldı. Lütfen bir saat sonra tekrar deneyiniz.');
    }

    const { count: pendingCount } = await admin
      .from('student_applications')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');
    if ((pendingCount || 0) >= MAX_PENDING_APPLICATIONS) {
      throw new HttpError(503, 'Şu anda çok sayıda bekleyen başvuru var. Lütfen daha sonra tekrar deneyiniz veya öğretmeninize başvurunuz.');
    }

    // -------------------------------------------------------------------
    // Aynı numara kontrolü
    // -------------------------------------------------------------------
    const { data: existingStudent } = await admin
      .from('students')
      .select('id')
      .eq('student_number', studentNumber)
      .limit(1);
    if (existingStudent && existingStudent.length > 0) {
      throw new HttpError(409, 'Bu öğrenci numarasıyla kayıtlı bir öğrenci zaten var. Giriş yapmayı deneyiniz; şifrenizi bilmiyorsanız öğretmeninize başvurunuz.');
    }
    const { data: existingApp } = await admin
      .from('student_applications')
      .select('id')
      .eq('student_number', studentNumber)
      .eq('status', 'pending')
      .limit(1);
    if (existingApp && existingApp.length > 0) {
      throw new HttpError(409, 'Bu öğrenci numarasıyla yapılmış ve onay bekleyen bir başvuru zaten var.');
    }

    // -------------------------------------------------------------------
    // Kilitli giriş hesabı + başvuru kaydı
    // -------------------------------------------------------------------
    const loginEmail = `std_${studentNumber.toLowerCase().replace(/[^a-z0-9_-]/g, '')}@okul.internal.net`;
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: loginEmail,
      password,
      email_confirm: true,
      ban_duration: BAN_FOREVER,
      app_metadata: { role: 'applicant', is_admin: false },
      user_metadata: { name, application: true },
    });
    if (createError || !created?.user) {
      const exists =
        (createError as any)?.code === 'email_exists' ||
        /already (been )?registered|already exists/i.test(createError?.message || '');
      if (exists) {
        throw new HttpError(409, 'Bu öğrenci numarasıyla açılmış bir hesap zaten var. Giriş yapmayı deneyiniz veya öğretmeninize başvurunuz.');
      }
      throw new HttpError(500, 'Başvuru kaydedilemedi. Lütfen daha sonra tekrar deneyiniz.');
    }
    const authUserId = created.user.id;

    // Bazı sürümlerde oluştururken kilit uygulanmayabilir: garantiye al
    if (!created.user.banned_until) {
      const { error: banError } = await admin.auth.admin.updateUserById(authUserId, { ban_duration: BAN_FOREVER });
      if (banError) {
        await admin.auth.admin.deleteUser(authUserId).catch(() => {});
        throw new HttpError(500, 'Başvuru kaydedilemedi. Lütfen daha sonra tekrar deneyiniz.');
      }
    }

    const { error: insertError } = await admin.from('student_applications').insert({
      name,
      student_number: studentNumber,
      class_id: classId,
      requested_class: requestedClass || null,
      email: email || null,
      phone: phone || null,
      avatar,
      auth_user_id: authUserId,
      status: 'pending',
      ip_hash: ipHash,
    });
    if (insertError) {
      await admin.auth.admin.deleteUser(authUserId).catch(() => {});
      throw new HttpError(500, 'Başvuru kaydedilemedi. Lütfen daha sonra tekrar deneyiniz.');
    }

    return reply({ success: true });
  } catch (err: any) {
    const status = err instanceof HttpError ? err.status : 500;
    return reply({ error: err instanceof HttpError ? err.message : 'Sunucu içi hata oluştu.' }, status);
  }
});
