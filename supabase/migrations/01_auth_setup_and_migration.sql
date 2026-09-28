-- ============================================================================
-- AŞAMA 1: SUPABASE AUTHENTICATION GEÇİŞ VE KURULUM SQL MİGRASYONU
-- Supabase Dashboard -> SQL Editor kısmına yapıştırıp "RUN" butonuna basarak çalıştırabilirsiniz.
-- ============================================================================

-- 1. Pgcrypto ve UUID uzantılarının etkinleştirilmesi
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Test hesaplarının temizlenmesi (Production temizliği)
DELETE FROM auth.users WHERE email IN ('std_999@okul.internal.net', 'test_check_999@okul.internal.net');

-- 3. Teachers ve Students tablolarının ve auth_user_id alanlarının hazırlanması
CREATE TABLE IF NOT EXISTS public.teachers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    username TEXT,
    email TEXT,
    branch TEXT,
    avatar TEXT,
    role TEXT DEFAULT 'teacher',
    status TEXT DEFAULT 'approved',
    is_admin BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    auth_user_id UUID REFERENCES auth.users(id) UNIQUE
);

ALTER TABLE IF EXISTS public.teachers 
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) UNIQUE;

ALTER TABLE IF EXISTS public.students 
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) UNIQUE;

-- 4. Önceki denemelerden kalıntı varsa public şemasındaki tabloyu sil (Güvenlik önlemi)
DROP TABLE IF EXISTS public._temp_migration_credentials;

-- 5. GEÇİCİ TABLO (TEMP TABLE): Sadece bu SQL oturumunda yaşar, REST API'ye ASLA açılmaz,
-- oturum kapandığında veritabanı tarafından otomatik olarak tamamen silinir.
DROP TABLE IF EXISTS _temp_migration_credentials;
CREATE TEMP TABLE _temp_migration_credentials (
  tip TEXT,
  isim TEXT,
  giris_kimligi TEXT,
  sentetik_eposta TEXT,
  yeni_sifre TEXT,
  auth_user_id UUID,
  eski_id TEXT
);

-- 6. BİR KEZLİK GEÇİŞ DÖNGÜSÜ: auth.users tablosuna gerçek onaylı hesap açar
DO $$
DECLARE
  rec RECORD;
  v_new_password TEXT;
  v_synthetic_email TEXT;
  v_clean_ident TEXT;
  v_auth_id UUID;
  v_encrypted_pw TEXT;
BEGIN
  -- A) ÖĞRETMENLERİN AKTARIMI
  FOR rec IN SELECT id, name, username, email, is_admin FROM public.teachers LOOP
    -- Sentetik e-posta ve 8 haneli rastgele yeni şifre oluştur
    -- Mustafa Bilir için doğrudan gerçek e-postası kullanılır
    IF rec.email = 'm.bilirr@gmail.com' THEN
      v_synthetic_email := 'm.bilirr@gmail.com';
    ELSE
      v_clean_ident := lower(regexp_replace(COALESCE(rec.username, rec.email, rec.id), '[^a-zA-Z0-9_-]', '', 'g'));
      v_synthetic_email := 'tch_' || v_clean_ident || '@okul.internal.net';
    END IF;

    v_new_password := substr(md5(random()::text || clock_timestamp()::text), 1, 8);
    v_encrypted_pw := crypt(v_new_password, gen_salt('bf'));

    -- Mevcut auth kullanıcısı var mı kontrol et
    SELECT id INTO v_auth_id FROM auth.users WHERE email = v_synthetic_email LIMIT 1;

    IF v_auth_id IS NULL THEN
      v_auth_id := gen_random_uuid();
      
      INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        recovery_sent_at,
        last_sign_in_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at,
        confirmation_token,
        recovery_token,
        email_change,
        email_change_token_new,
        email_change_token_current,
        phone,
        phone_change,
        phone_change_token
      ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        v_auth_id,
        'authenticated',
        'authenticated',
        v_synthetic_email,
        v_encrypted_pw,
        now(),
        now(),
        now(),
        jsonb_build_object('provider', 'email', 'providers', array['email'], 'role', CASE WHEN rec.is_admin = true THEN 'admin' ELSE 'teacher' END, 'is_admin', COALESCE(rec.is_admin, false)),
        jsonb_build_object('role', 'teacher', 'legacy_id', rec.id, 'name', rec.name, 'is_admin', COALESCE(rec.is_admin, false)),
        now(),
        now(),
        '', -- confirmation_token: açıkça boş string
        '', -- recovery_token: açıkça boş string
        '', -- email_change: açıkça boş string
        '', -- email_change_token_new: açıkça boş string
        '', -- email_change_token_current: açıkça boş string
        NULL, -- phone: NULL (auth.users UNIQUE constraint çakışmasını önlemek için)
        '', -- phone_change: açıkça boş string
        ''  -- phone_change_token: açıkça boş string
      );

      -- auth.identities kaydı (Supabase GoTrue şifre girişi için zorunlu)
      INSERT INTO auth.identities (
        id,
        user_id,
        identity_data,
        provider,
        provider_id,
        last_sign_in_at,
        created_at,
        updated_at
      ) VALUES (
        gen_random_uuid(),
        v_auth_id,
        jsonb_build_object('sub', v_auth_id::text, 'email', v_synthetic_email),
        'email',
        v_auth_id::text,
        now(),
        now(),
        now()
      );
    ELSE
      -- Var olan hesaba yeni şifre tanımla ve tüm tokenları sıfırla
      UPDATE auth.users 
      SET encrypted_password = v_encrypted_pw,
          email_confirmed_at = now(),
          confirmation_token = '',
          recovery_token = '',
          email_change = '',
          email_change_token_new = '',
          email_change_token_current = '',
          phone = NULL,
          phone_change = '',
          phone_change_token = '',
          raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', CASE WHEN rec.is_admin = true THEN 'admin' ELSE 'teacher' END, 'is_admin', COALESCE(rec.is_admin, false)),
          raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'teacher', 'name', rec.name),
          updated_at = now()
      WHERE id = v_auth_id;
    END IF;

    -- teachers tablosuna auth_user_id yaz
    UPDATE public.teachers SET auth_user_id = v_auth_id WHERE id = rec.id;

    -- Sadece geçici oturum tablosuna kaydet
    INSERT INTO _temp_migration_credentials 
      (tip, isim, giris_kimligi, sentetik_eposta, yeni_sifre, auth_user_id, eski_id)
    VALUES 
      ('Öğretmen', rec.name, COALESCE(rec.username, rec.email), v_synthetic_email, v_new_password, v_auth_id, rec.id);
  END LOOP;

  -- B) ÖĞRENCİLERİN AKTARIMI (Tüm Öğrenciler)
  FOR rec IN SELECT id, name, student_number, class_id FROM public.students LOOP
    v_clean_ident := lower(regexp_replace(COALESCE(rec.student_number, rec.id), '[^a-zA-Z0-9_-]', '', 'g'));
    v_synthetic_email := 'std_' || v_clean_ident || '@okul.internal.net';
    v_new_password := substr(md5(random()::text || clock_timestamp()::text), 1, 8);
    v_encrypted_pw := crypt(v_new_password, gen_salt('bf'));

    SELECT id INTO v_auth_id FROM auth.users WHERE email = v_synthetic_email LIMIT 1;

    IF v_auth_id IS NULL THEN
      v_auth_id := gen_random_uuid();
      
      INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        recovery_sent_at,
        last_sign_in_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at,
        confirmation_token,
        recovery_token,
        email_change,
        email_change_token_new,
        email_change_token_current,
        phone,
        phone_change,
        phone_change_token
      ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        v_auth_id,
        'authenticated',
        'authenticated',
        v_synthetic_email,
        v_encrypted_pw,
        now(),
        now(),
        now(),
        jsonb_build_object('provider', 'email', 'providers', array['email'], 'role', 'student'),
        jsonb_build_object('role', 'student', 'legacy_id', rec.id, 'name', rec.name, 'class_id', rec.class_id),
        now(),
        now(),
        '', -- confirmation_token: açıkça boş string
        '', -- recovery_token: açıkça boş string
        '', -- email_change: açıkça boş string
        '', -- email_change_token_new: açıkça boş string
        '', -- email_change_token_current: açıkça boş string
        NULL, -- phone: NULL (auth.users UNIQUE constraint çakışmasını önlemek için)
        '', -- phone_change: açıkça boş string
        ''  -- phone_change_token: açıkça boş string
      );

      INSERT INTO auth.identities (
        id,
        user_id,
        identity_data,
        provider,
        provider_id,
        last_sign_in_at,
        created_at,
        updated_at
      ) VALUES (
        gen_random_uuid(),
        v_auth_id,
        jsonb_build_object('sub', v_auth_id::text, 'email', v_synthetic_email),
        'email',
        v_auth_id::text,
        now(),
        now(),
        now()
      );
    ELSE
      UPDATE auth.users 
      SET encrypted_password = v_encrypted_pw,
          email_confirmed_at = now(),
          confirmation_token = '',
          recovery_token = '',
          email_change = '',
          email_change_token_new = '',
          email_change_token_current = '',
          phone = NULL,
          phone_change = '',
          phone_change_token = '',
          raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'student'),
          raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'student', 'name', rec.name),
          updated_at = now()
      WHERE id = v_auth_id;
    END IF;

    -- students tablosuna auth_user_id yaz
    UPDATE public.students SET auth_user_id = v_auth_id WHERE id = rec.id;

    -- Sadece geçici oturum tablosuna kaydet
    INSERT INTO _temp_migration_credentials 
      (tip, isim, giris_kimligi, sentetik_eposta, yeni_sifre, auth_user_id, eski_id)
    VALUES 
      ('Öğrenci', rec.name, rec.student_number, v_synthetic_email, v_new_password, v_auth_id, rec.id);
  END LOOP;
END $$;

-- 7. Sonuçları listele (Sadece bu SQL Editor penceresinde görünür, sağ üstteki "Download CSV" ile güvenle bilgisayarınıza indirebilirsiniz)
SELECT tip, isim, giris_kimligi, sentetik_eposta, yeni_sifre, auth_user_id, eski_id 
FROM _temp_migration_credentials 
ORDER BY tip DESC, isim ASC;
