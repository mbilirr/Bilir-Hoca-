import { createClient } from 'npm:@supabase/supabase-js@2';

// =============================================================================
// create-user: Giriş hesaplarını yöneten TEK sunucu fonksiyonu.
// Yalnızca giriş yapmış yönetici ve öğretmenler çağırabilir.
//   - Yönetici: tüm öğrenci ve öğretmen hesapları
//   - Öğretmen: yalnızca yetkili olduğu sınıflardaki / kendisine atanmış öğrenciler
// İşlemler (body.action):
//   upsert (varsayılan)   : hesap oluştur / şifre belirle / giriş adını güncelle
//   bulk_upsert           : toplu öğrenci hesabı (Excel içe aktarma)
//   delete_accounts       : kayıt silinmeden önce giriş hesaplarını sil
//   set_suspended         : hesabı askıya al / aç            (yalnızca yönetici)
//   set_role              : öğretmen <-> yönetici             (yalnızca yönetici)
//   approve_application   : öğrenci başvurusunu onayla         (yalnızca yönetici)
//   reject_application    : öğrenci başvurusunu reddet         (yalnızca yönetici)
// =============================================================================

// GÜVENLİK: Yalnızca uygulamanın kendi adreslerinden gelen tarayıcı isteklerine izin verilir.
const ALLOWED_ORIGIN_PATTERN = /^https:\/\/bilir-hoca(-[a-z0-9-]+)?\.vercel\.app$/;
const DEFAULT_ORIGIN = 'https://bilir-hoca.vercel.app';
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
    const callerIsAdmin = isAdminUser(caller);
    const callerIsTeacher = !callerIsAdmin && caller.app_metadata?.role === 'teacher';
    if (!callerIsAdmin && !callerIsTeacher) {
      return reply({ error: 'Bu işlem için yetkiniz yok. Hesap işlemlerini yalnızca yönetici ve öğretmenler yapabilir.' }, 403);
    }

    const requireAdmin = () => {
      if (!callerIsAdmin) throw new HttpError(403, 'Bu işlemi yalnızca sistem yöneticisi yapabilir.');
    };

    // ---------------------------------------------------------------------
    // Yardımcılar
    // ---------------------------------------------------------------------
    const loadRow = async (type: AccountType, id: string) => {
      const columns =
        type === 'teacher'
          ? 'id, name, username, email, is_admin, status, auth_user_id'
          : 'id, name, student_number, class_id, status, auth_user_id';
      const { data, error } = await admin.from(tableFor(type)).select(columns).eq('id', id).maybeSingle();
      if (error) throw new HttpError(500, `Kayıt okunamadı: ${error.message}`);
      if (!data) throw new HttpError(404, type === 'teacher' ? 'Öğretmen kaydı bulunamadı.' : 'Öğrenci kaydı bulunamadı.');
      return data as Record<string, any>;
    };

    // Öğretmen yalnızca yetkili olduğu sınıftaki veya kendisine atanmış öğrenciyi yönetebilir
    const assertCanManage = async (type: AccountType, row: Record<string, any>) => {
      if (callerIsAdmin) return;
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
      await assertCanManage(type, row);

      const identifier = String(
        input?.identifier || (type === 'teacher' ? row.username : row.student_number) || ''
      ).trim();
      const email = generateSyntheticEmail(type, identifier);
      const displayName = String(input?.name || row.name || identifier);
      const mustChange = input?.mustChangePassword === false ? false : true;

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
          throw new HttpError(409, `"${identifier}" numarasıyla bekleyen bir öğrenci başvurusu var. Önce başvuruyu onaylayın veya reddedin.`);
        }
        if (isAdminUser(existing) || (existingRole && existingRole !== type)) {
          throw new HttpError(409, `"${identifier}" giriş adı başka türde bir hesapta kullanılıyor.`);
        }
        const { data: owner } = await admin
          .from(tableFor(type))
          .select('id, name')
          .eq('auth_user_id', existing.id)
          .neq('id', row.id)
          .limit(1);
        if (owner && owner.length > 0) {
          throw new HttpError(
            409,
            type === 'student'
              ? `"${identifier}" numarası "${owner[0].name}" adlı öğrencinin hesabında kullanılıyor.`
              : `"${identifier}" kullanıcı adı "${owner[0].name}" adlı öğretmenin hesabında kullanılıyor.`
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
            .select(type === 'teacher' ? 'id, name, auth_user_id' : 'id, name, class_id, auth_user_id')
            .eq('id', id)
            .maybeSingle();
          if (!row) {
            results.push({ id, ok: true, deleted: false });
            continue;
          }
          await assertCanManage(type, row);
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
      requireAdmin();
      const type = parseType(body?.type);
      const row = await loadRow(type, String(body?.id || ''));
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

    if (action === 'approve_application') {
      requireAdmin();
      const appId = String(body?.applicationId || '');
      const { data: app, error: appError } = await admin
        .from('student_applications')
        .select('*')
        .eq('id', appId)
        .maybeSingle();
      if (appError) throw new HttpError(500, `Başvuru okunamadı: ${appError.message}`);
      if (!app) throw new HttpError(404, 'Başvuru bulunamadı.');
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
        .select('id, name')
        .eq('student_number', studentNumber)
        .limit(1);
      if (sameNumber && sameNumber.length > 0) {
        throw new HttpError(409, `"${studentNumber}" numarası "${sameNumber[0].name}" adlı öğrenciye ait. Farklı bir numara giriniz.`);
      }

      let classId = 'class-default';
      let className = 'Atanmadı';
      const requestedClassId = String(body?.classId || app.class_id || '').trim();
      if (requestedClassId) {
        const { data: cls } = await admin.from('classes').select('id, name').eq('id', requestedClassId).maybeSingle();
        if (!cls) throw new HttpError(400, 'Seçilen sınıf bulunamadı.');
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
      requireAdmin();
      const appId = String(body?.applicationId || '');
      const { data: app } = await admin.from('student_applications').select('*').eq('id', appId).maybeSingle();
      if (!app) throw new HttpError(404, 'Başvuru bulunamadı.');
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
