-- ============================================================================
-- AŞAMA 2 - DOĞRULAMA VE TEST KURULUMU (STAGE 2 VERIFICATION & TEST SCRIPT)
-- Supabase Dashboard -> SQL Editor kısmında çalıştırılarak test hesapları ve 
-- erişim kayıtları anında hazırlanabilir.
-- ============================================================================

-- 1. Test Sınıflarını Oluştur
INSERT INTO public.classes (id, name, level, branch, academic_year)
VALUES 
  ('class-8a', '8-A', 8, 'A', '2025-2026'),
  ('class-8b', '8-B', 8, 'B', '2025-2026')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- 2. Test Öğrencilerini Oluştur
INSERT INTO public.students (id, name, student_number, class_id, class_name)
VALUES 
  ('std-test-8a-01', 'Ayşe Yılmaz (8-A)', '101', 'class-8a', '8-A'),
  ('std-test-8b-01', 'Mehmet Demir (8-B)', '201', 'class-8b', '8-B')
ON CONFLICT (id) DO UPDATE SET class_id = EXCLUDED.class_id;

-- 3. İki Farklı Gerçek Öğretmen Auth Hesabı Oluşturma Döngüsü
DO $$
DECLARE
  v_teacher1_id UUID := '11111111-aaaa-bbbb-cccc-111111111111';
  v_teacher2_id UUID := '22222222-aaaa-bbbb-cccc-222222222222';
  v_encrypted_pw_1 TEXT;
  v_encrypted_pw_2 TEXT;
BEGIN
  -- Şifreler: Teacher1 -> TeacherAlpha2026!, Teacher2 -> TeacherBeta2026!
  v_encrypted_pw_1 := crypt('TeacherAlpha2026!', gen_salt('bf'));
  v_encrypted_pw_2 := crypt('TeacherBeta2026!', gen_salt('bf'));

  -- Önce varsa eski test kayıtlarını temizle
  DELETE FROM auth.users WHERE email IN ('teacher_alpha@okul.internal.net', 'teacher_beta@okul.internal.net');

  -- Öğretmen 1: teacher_alpha@okul.internal.net (8-A sınıfına yetkili)
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    email_change_token_current, phone, phone_change, phone_change_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', v_teacher1_id, 'authenticated', 'authenticated',
    'teacher_alpha@okul.internal.net', v_encrypted_pw_1, now(),
    jsonb_build_object('provider', 'email', 'providers', array['email'], 'role', 'teacher'),
    jsonb_build_object('name', 'Ahmet Öğretmen (Alpha)', 'role', 'teacher'),
    now(), now(), '', '', '', '', '', NULL, '', ''
  );

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, created_at, updated_at)
  VALUES (
    gen_random_uuid(), v_teacher1_id,
    jsonb_build_object('sub', v_teacher1_id::text, 'email', 'teacher_alpha@okul.internal.net'),
    'email', v_teacher1_id::text, now(), now()
  );

  -- Öğretmen 2: teacher_beta@okul.internal.net (Hiçbir sınıfa yetkisi YOK)
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    email_change_token_current, phone, phone_change, phone_change_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', v_teacher2_id, 'authenticated', 'authenticated',
    'teacher_beta@okul.internal.net', v_encrypted_pw_2, now(),
    jsonb_build_object('provider', 'email', 'providers', array['email'], 'role', 'teacher'),
    jsonb_build_object('name', 'Canan Öğretmen (Beta)', 'role', 'teacher'),
    now(), now(), '', '', '', '', '', NULL, '', ''
  );

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, created_at, updated_at)
  VALUES (
    gen_random_uuid(), v_teacher2_id,
    jsonb_build_object('sub', v_teacher2_id::text, 'email', 'teacher_beta@okul.internal.net'),
    'email', v_teacher2_id::text, now(), now()
  );

  -- 4. ERİŞİM MATRİSİNİ TANIMLA:
  -- Sadece Öğretmen 1'e (teacher_alpha) 'class-8a' sınıfı yetkisi ver
  -- Öğretmen 2'ye (teacher_beta) HİÇBİR sınıf yetkisi VERME
  DELETE FROM public.teacher_class_access WHERE teacher_auth_id IN (v_teacher1_id, v_teacher2_id);
  DELETE FROM public.teacher_student_access WHERE teacher_auth_id IN (v_teacher1_id, v_teacher2_id);

  INSERT INTO public.teacher_class_access (teacher_auth_id, class_id)
  VALUES (v_teacher1_id, 'class-8a');

END $$;

-- 5. Tanımlanan Yetkileri Görüntüle
SELECT 
  tca.id, 
  u.email AS ogretmen_eposta, 
  tca.class_id AS erisilen_sinif, 
  c.name AS sinif_adi
FROM public.teacher_class_access tca
JOIN auth.users u ON u.id = tca.teacher_auth_id
LEFT JOIN public.classes c ON c.id = tca.class_id;
