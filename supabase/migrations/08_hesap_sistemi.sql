-- ============================================================================
-- 08 - HESAP SİSTEMİ (Aşama 3)
-- Supabase Dashboard -> SQL Editor'e yapıştırıp RUN ile çalıştırın.
-- Tekrar çalıştırılması güvenlidir. Mevcut öğrenci/öğretmen verisini silmez.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) ÖĞRENCİ HESAP DURUMU (askıya alma bilgisi tüm cihazlarda görünsün)
-- ----------------------------------------------------------------------------
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

-- ----------------------------------------------------------------------------
-- 2) GİRİŞ HESABI SİLİNİNCE KAYITTAKİ BAĞLANTI OTOMATİK BOŞALSIN
--    Eskiden öğrenci/öğretmen kaydına bağlı bir giriş hesabı silinemiyordu.
-- ----------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conname, c.conrelid::regclass AS tbl
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.contype = 'f'
      AND c.conrelid IN ('public.students'::regclass, 'public.teachers'::regclass)
      AND c.confrelid = 'auth.users'::regclass
      AND a.attname = 'auth_user_id'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
  END LOOP;
END $$;

ALTER TABLE public.students
  ADD CONSTRAINT students_auth_user_id_fkey
  FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL NOT VALID;

ALTER TABLE public.teachers
  ADD CONSTRAINT teachers_auth_user_id_fkey
  FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL NOT VALID;

-- ----------------------------------------------------------------------------
-- 3) ÖĞRENCİ KAYIT BAŞVURULARI
--    Başvuru yalnızca sunucu fonksiyonu (register-student) ile eklenir.
--    Yönetici görür; onay/red yine sunucu fonksiyonu (create-user) ile yapılır.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  student_number TEXT NOT NULL,
  class_id TEXT,
  requested_class TEXT,
  email TEXT,
  phone TEXT,
  avatar TEXT,
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reject_reason TEXT,
  ip_hash TEXT,
  student_id TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT student_applications_status_check CHECK (status IN ('pending', 'approved', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_student_applications_status ON public.student_applications (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_student_applications_number ON public.student_applications (student_number);
CREATE INDEX IF NOT EXISTS idx_student_applications_ip ON public.student_applications (ip_hash, created_at);

ALTER TABLE public.student_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "applications_admin_select" ON public.student_applications;
DROP POLICY IF EXISTS "applications_admin_delete" ON public.student_applications;

CREATE POLICY "applications_admin_select" ON public.student_applications
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "applications_admin_delete" ON public.student_applications
  FOR DELETE TO authenticated
  USING (public.is_admin());

REVOKE ALL ON public.student_applications FROM anon;

-- ----------------------------------------------------------------------------
-- 4) ÖĞRENCİ KAYDI KORUMALARI (05'teki kuralın genişletilmiş hali)
--    - Öğrenci: yalnızca ad, e-posta, telefon, fotoğraf değiştirebilir.
--    - Öğretmen: öğrencinin giriş hesabı bağlantısını ve hesap durumunu değiştiremez.
--    - Yönetici ve sunucu fonksiyonları etkilenmez.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_student_self_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user = 'authenticated' AND NOT public.is_admin() THEN
    IF public.is_student() THEN
      IF NEW.id IS DISTINCT FROM OLD.id
         OR NEW.class_id IS DISTINCT FROM OLD.class_id
         OR NEW.class_name IS DISTINCT FROM OLD.class_name
         OR NEW.student_number IS DISTINCT FROM OLD.student_number
         OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id
         OR NEW.status IS DISTINCT FROM OLD.status THEN
        RAISE EXCEPTION 'Öğrenci hesabı sınıf, öğrenci numarası veya hesap bilgisini değiştiremez.'
          USING ERRCODE = '42501';
      END IF;
    ELSE
      IF NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id
         OR NEW.status IS DISTINCT FROM OLD.status THEN
        RAISE EXCEPTION 'Giriş hesabı bağlantısı ve hesap durumu yalnızca yönetici tarafından değiştirilebilir.'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_student_self_update ON public.students;
CREATE TRIGGER trg_guard_student_self_update
  BEFORE UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.guard_student_self_update();

CREATE OR REPLACE FUNCTION public.guard_student_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user = 'authenticated' AND NOT public.is_admin() THEN
    IF NEW.auth_user_id IS NOT NULL OR COALESCE(NEW.status, 'active') <> 'active' THEN
      RAISE EXCEPTION 'Yeni öğrenci kaydı giriş hesabı bağlantısı veya hesap durumu ile oluşturulamaz.'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_student_insert ON public.students;
CREATE TRIGGER trg_guard_student_insert
  BEFORE INSERT ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.guard_student_insert();

-- ----------------------------------------------------------------------------
-- 5) ÖĞRETMEN KENDİ PROFİLİNİ GÜNCELLEYEBİLSİN (ad, branş, e-posta, fotoğraf)
--    Kullanıcı adı (giriş adı), rol, yönetici yetkisi, hesap durumu ve hesap
--    bağlantısı yalnızca yönetici tarafından değiştirilebilir.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_teacher_privileged_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user = 'authenticated' AND NOT public.is_admin() THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.is_admin IS DISTINCT FROM OLD.is_admin
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id
       OR NEW.username IS DISTINCT FROM OLD.username
       OR NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Kullanıcı adı, yönetici yetkisi, hesap onayı ve hesap bağlantısı yalnızca yönetici tarafından değiştirilebilir.'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_teacher_privileged_update ON public.teachers;
CREATE TRIGGER trg_guard_teacher_privileged_update
  BEFORE UPDATE ON public.teachers
  FOR EACH ROW EXECUTE FUNCTION public.guard_teacher_privileged_update();

DROP POLICY IF EXISTS "teachers_self_update" ON public.teachers;
CREATE POLICY "teachers_self_update" ON public.teachers
  FOR UPDATE TO authenticated
  USING (public.is_teacher() AND auth_user_id = auth.uid())
  WITH CHECK (public.is_teacher() AND auth_user_id = auth.uid());

-- Öğretmen kendi kaydını okuyabilmeli (girişte hesap durumunu kontrol etmek için).
-- Böyle bir okuma kuralı zaten varsa dokunulmaz.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'teachers'
      AND cmd IN ('SELECT', 'ALL') AND policyname <> 'teachers_admin_all'
  ) THEN
    CREATE POLICY "teachers_self_select" ON public.teachers
      FOR SELECT TO authenticated
      USING (auth_user_id = auth.uid());
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 6) KONTROL (yalnızca okur). Beklenen 10 satır:
--    2 hesap baglantisi, 3 kural, 1 sutun, 1 tablo, 3 tetikleyici
-- ----------------------------------------------------------------------------
SELECT 'sutun' AS tur, 'students.status' AS ad
WHERE EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'students' AND column_name = 'status')
UNION ALL
SELECT 'hesap baglantisi', conname FROM pg_constraint
WHERE conname IN ('students_auth_user_id_fkey', 'teachers_auth_user_id_fkey') AND confdeltype = 'n'
UNION ALL
SELECT 'tablo', 'student_applications'
WHERE to_regclass('public.student_applications') IS NOT NULL
UNION ALL
SELECT 'tetikleyici', trigger_name FROM information_schema.triggers
WHERE trigger_name IN ('trg_guard_student_self_update', 'trg_guard_student_insert', 'trg_guard_teacher_privileged_update')
  AND event_manipulation IN ('UPDATE', 'INSERT')
UNION ALL
SELECT 'kural', policyname FROM pg_policies
WHERE schemaname = 'public' AND policyname IN ('teachers_self_update', 'applications_admin_select', 'applications_admin_delete')
ORDER BY 1, 2;
