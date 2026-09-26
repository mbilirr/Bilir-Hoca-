-- ============================================================================
-- EDU SYS: ROL TABANLI YETKİLENDİRME (RBAC) VE GÜVENLİK KURALLARI (RLS POLICIES)
-- Supabase SQL Editor üzerinden doğrudan çalıştırılabilir.
-- ============================================================================

-- 1. Rol Tanımları (ENUM)
DO $$ BEGIN
    CREATE TYPE user_role_enum AS ENUM ('admin', 'teacher', 'student', 'user');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Auth Meta & Custom Claims Entegrasyonu
-- Supabase Auth JWT token'ına 'role' ve 'is_admin' claim'lerini ekleyen fonksiyon
CREATE OR REPLACE FUNCTION public.handle_user_claims()
RETURNS trigger AS $$
DECLARE
  v_role TEXT := 'student';
  v_is_admin BOOLEAN := false;
BEGIN
  -- Öğretmen veya Admin tablosunu kontrol et
  IF EXISTS (
    SELECT 1 FROM public.teachers 
    WHERE id = NEW.id AND is_admin = true
  ) OR NEW.email = 'm.bilirr@gmail.com' THEN
    v_role := 'admin';
    v_is_admin := true;
  ELSIF EXISTS (
    SELECT 1 FROM public.teachers 
    WHERE id = NEW.id
  ) THEN
    v_role := 'teacher';
    v_is_admin := false;
  END IF;

  -- Custom Claim'leri JWT app_metadata içine enjekte et
  NEW.raw_app_meta_data := COALESCE(NEW.raw_app_meta_data, '{}'::jsonb) || 
    jsonb_build_object(
      'role', v_role,
      'is_admin', v_is_admin
    );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Row Level Security (RLS) Etkinleştirme
ALTER TABLE IF EXISTS public.teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.homeworks ENABLE ROW LEVEL SECURITY;

-- 4. Güvenlik Politikaları (Security Rules)

-- A) TEACHERS Tablosu Politikaları
-- Herkes aktif öğretmenlerin genel bilgilerini okuyabilir
DROP POLICY IF EXISTS "Public can view active teachers" ON public.teachers;
CREATE POLICY "Public can view active teachers" 
ON public.teachers FOR SELECT 
USING (status = 'approved' AND (is_suspended IS NULL OR is_suspended = false));

-- Yalnızca Adminler tüm öğretmenleri yönetebilir (Oluşturma, Güncelleme, Silme, Rol Değiştirme)
DROP POLICY IF EXISTS "Admins have full access to teachers" ON public.teachers;
CREATE POLICY "Admins have full access to teachers" 
ON public.teachers FOR ALL 
USING (
  (auth.jwt() ->> 'role' = 'admin') OR 
  ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true) OR
  (auth.jwt() ->> 'email' = 'm.bilirr@gmail.com')
);

-- B) STUDENTS Tablosu Politikaları
-- Öğretmenler ve Adminler öğrencileri okuyabilir
DROP POLICY IF EXISTS "Teachers and Admins can view students" ON public.students;
CREATE POLICY "Teachers and Admins can view students" 
ON public.students FOR SELECT 
USING (
  (auth.jwt() ->> 'role' IN ('admin', 'teacher')) OR
  (id = auth.uid()::text) -- Öğrenci kendi profilini görebilir
);

-- Adminler tüm öğrencileri güncelleyebilir, dondurabilir veya silebilir
DROP POLICY IF EXISTS "Admins have full control over students" ON public.students;
CREATE POLICY "Admins have full control over students" 
ON public.students FOR ALL 
USING (
  (auth.jwt() ->> 'role' = 'admin') OR 
  ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true) OR
  (auth.jwt() ->> 'email' = 'm.bilirr@gmail.com')
);

-- C) Askıya Alınmış Kullanıcıların Girişini Engelleme Kontrolü
CREATE OR REPLACE FUNCTION public.check_user_suspended()
RETURNS boolean AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.teachers 
    WHERE id = auth.uid()::text AND (is_suspended = true OR status = 'suspended')
  ) OR EXISTS (
    SELECT 1 FROM public.students 
    WHERE id = auth.uid()::text AND (is_suspended = true OR status = 'suspended')
  ) THEN
    RAISE EXCEPTION 'Hesabınız yönetici tarafından dondurulmuştur.';
  END IF;
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
