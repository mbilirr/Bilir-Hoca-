import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Generates a clean, synthetic email compliant with Supabase GoTrue domain checks
export function generateSyntheticEmail(type: 'student' | 'teacher', identifier: string): string {
  const clean = identifier
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
  const prefix = type === 'teacher' ? 'tch' : 'std';
  return `${prefix}_${clean || 'user'}@okul.internal.net`;
}

// Generate a secure random password (8 alphanumeric characters: uppercase, lowercase, numbers)
export function generateRandomPassword(length = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let pass = '';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  for (let i = 0; i < length; i++) {
    pass += chars[array[i] % chars.length];
  }
  return pass;
}

Deno.serve(async (req: Request) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Supabase URL veya Service Role Key ortam değişkeni eksik.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Service Role yetkili Supabase Admin istemcisi
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // =========================================================================
    // 1. GÜVENLİK ADIMI: Authorization Header & JWT Token Doğrulama
    // =========================================================================
    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Yetkilendirme reddedildi: Authorization (Bearer) başlığı eksik veya geçersiz.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !userData?.user) {
      return new Response(
        JSON.stringify({ error: 'Yetkilendirme başarısız: Geçersiz veya süresi dolmuş oturum tokenı.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const callerUser = userData.user;

    // =========================================================================
    // 2. GÜVENLİK ADIMI: Gerçek Admin (Yönetici) Yetki Kontrolü
    // =========================================================================
    let isCallerAdmin = false;

    // A) Birincil Süper Yönetici E-posta Kontrolü
    if (callerUser.email?.toLowerCase() === 'm.bilirr@gmail.com') {
      isCallerAdmin = true;
    }

    // B) JWT Token App Metadata Rol ve Admin Bayrağı Kontrolü
    if (
      callerUser.app_metadata?.is_admin === true ||
      callerUser.app_metadata?.role === 'admin'
    ) {
      isCallerAdmin = true;
    }

    // C) Veritabanı Teachers Tablosundaki Admin Statüsü Kontrolü
    if (!isCallerAdmin) {
      const { data: teacherRow } = await supabaseAdmin
        .from('teachers')
        .select('is_admin, isAdmin, role, status')
        .or(`auth_user_id.eq.${callerUser.id},email.eq.${callerUser.email}`)
        .limit(1)
        .maybeSingle();

      if (
        teacherRow &&
        (teacherRow.is_admin === true || teacherRow.isAdmin === true || teacherRow.role === 'admin') &&
        teacherRow.status !== 'suspended'
      ) {
        isCallerAdmin = true;
      }
    }

    // Çağıran kişi admin değilse işlemi anında 403 ile reddet
    if (!isCallerAdmin) {
      return new Response(
        JSON.stringify({
          error: 'Erişim Engellendi (403 Forbidden): Kullanıcı hesabı oluşturma ve şifre belirleme işlemi yalnızca sistem yöneticisi (admin) tarafından gerçekleştirilebilir.',
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =========================================================================
    // 3. PARAMETRE DOĞRULAMA VE İŞLEM YÜRÜTME
    // =========================================================================
    const body = await req.json();
    const { type, id, identifier, name, password: customPassword } = body;

    if (!type || !id || !identifier) {
      return new Response(
        JSON.stringify({ error: 'Eksik parametre: type, id ve identifier zorunludur.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (type !== 'student' && type !== 'teacher') {
      return new Response(
        JSON.stringify({ error: "Geçersiz tip: type sadece 'student' veya 'teacher' olabilir." }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const email = generateSyntheticEmail(type, identifier);
    const password = customPassword?.trim() || generateRandomPassword(8);

    if (password.length < 6) {
      return new Response(
        JSON.stringify({ error: 'Şifre en az 6 karakter olmalıdır.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // RLS kurallarının (is_teacher / is_student) okuduğu rol bilgisi app_metadata'da olmalıdır.
    // (user_metadata kullanıcı tarafından değiştirilebilir ve RLS için kullanılmaz.)
    const appMetadata = { role: type, is_admin: false };

    // 4. Supabase Auth kullanıcısı oluştur veya güncelle (email_confirm: true ile anında aktif)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: appMetadata,
      user_metadata: {
        role: type,
        legacy_id: id,
        name: name || identifier,
        identifier: identifier,
        created_by_admin: callerUser.id,
      },
    });

    let authUserId: string;

    if (authError) {
      if (
        authError.message.includes('already registered') ||
        (authError as any).code === 'email_exists'
      ) {
        // Kullanıcı daha önce varsa şifresini güvenle güncelle (tüm sayfalarda ara)
        let existing: { id: string; app_metadata?: Record<string, unknown> } | undefined;
        for (let page = 1; page <= 50 && !existing; page++) {
          const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers({
            page,
            perPage: 1000,
          });
          if (listError) throw listError;
          const users = listData?.users || [];
          existing = users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
          if (users.length < 1000) break;
        }
        if (!existing) {
          throw authError;
        }
        authUserId = existing.id;
        // Yönetici hesabının rolü bu fonksiyonla asla düşürülmez
        const existingRole = (existing.app_metadata as any)?.role;
        const keepAdmin = existingRole === 'admin' || (existing.app_metadata as any)?.is_admin === true;
        const { error: updError } = await supabaseAdmin.auth.admin.updateUserById(authUserId, {
          password,
          email_confirm: true,
          app_metadata: keepAdmin ? { role: 'admin', is_admin: true } : appMetadata,
          user_metadata: {
            role: type,
            legacy_id: id,
            name: name || identifier,
            updated_by_admin: callerUser.id,
          },
        });
        if (updError) throw updError;
      } else {
        throw authError;
      }
    } else {
      authUserId = authData.user.id;
    }

    // 5. auth_user_id alanını veritabanındaki ilgili tabloya yaz
    const targetTable = type === 'teacher' ? 'teachers' : 'students';
    const { error: dbError } = await supabaseAdmin
      .from(targetTable)
      .update({ auth_user_id: authUserId })
      .eq('id', id);

    if (dbError) {
      console.warn(`Uyarı: ${targetTable}.auth_user_id güncellenemedi:`, dbError.message);
    }

    return new Response(
      JSON.stringify({
        success: true,
        type,
        id,
        auth_user_id: authUserId,
        email,
        password,
        name: name || identifier,
        createdBy: callerUser.email,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || 'Sunucu içi hata oluştu.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
