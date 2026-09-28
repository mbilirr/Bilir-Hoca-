-- ============================================================================
-- AŞAMA 2: ÖĞRETMEN ERİŞİM KONTROLÜ VE RLS GÜVENLİK POLİTİKALARI
-- (STAGE 2: ACCESS CONTROL JOIN TABLES & ROW LEVEL SECURITY POLICIES)
-- ============================================================================
-- Bu scripti Supabase Dashboard -> SQL Editor paneline yapıştırıp çalıştırabilirsiniz.

-- 1. Pgcrypto ve UUID uzantıları
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Question Logs Tablosunun Hazırlanması (Eksikse oluşturulur)
CREATE TABLE IF NOT EXISTS public.question_logs (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    student_name TEXT NOT NULL,
    class_id TEXT NOT NULL,
    class_name TEXT NOT NULL,
    date TEXT NOT NULL,
    entries JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_questions INTEGER NOT NULL DEFAULT 0,
    total_correct INTEGER DEFAULT 0,
    total_wrong INTEGER DEFAULT 0,
    total_empty INTEGER DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3. JOIN TABLOLARI: Öğretmen Sınıf ve Öğrenci Erişim Matrisi
CREATE TABLE IF NOT EXISTS public.teacher_class_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_auth_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    class_id TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(teacher_auth_id, class_id)
);

CREATE TABLE IF NOT EXISTS public.teacher_student_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_auth_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(teacher_auth_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_teacher_class_access_tid ON public.teacher_class_access(teacher_auth_id);
CREATE INDEX IF NOT EXISTS idx_teacher_class_access_cid ON public.teacher_class_access(class_id);
CREATE INDEX IF NOT EXISTS idx_teacher_student_access_tid ON public.teacher_student_access(teacher_auth_id);
CREATE INDEX IF NOT EXISTS idx_teacher_student_access_sid ON public.teacher_student_access(student_id);

-- 4. RLS YETKİ VE ERİŞİM YARDIMCI FONKSİYONLARI (SECURITY DEFINER)
-- Güvenlik standardı gereği her SECURITY DEFINER fonksiyonunda "SET search_path = public, pg_temp" açıkça tanımlanmıştır.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin') OR
    (auth.jwt() ->> 'email' = 'm.bilirr@gmail.com')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.is_teacher()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'teacher'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.is_student()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'student'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.teacher_has_class_access(p_class_id TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  IF p_class_id IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.teacher_class_access
    WHERE teacher_auth_id = auth.uid() AND class_id = p_class_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.teacher_has_student_access(p_student_id TEXT, p_class_id TEXT DEFAULT NULL)
RETURNS BOOLEAN AS $$
BEGIN
  -- 1. Öğretmene doğrudan öğrenci bazında yetki verilmiş mi?
  IF p_student_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.teacher_student_access
    WHERE teacher_auth_id = auth.uid() AND student_id = p_student_id
  ) THEN
    RETURN TRUE;
  END IF;

  -- 2. Parametre olarak gelen class_id üzerinden öğretmenin sınıf yetkisi var mı?
  IF p_class_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.teacher_class_access
    WHERE teacher_auth_id = auth.uid() AND class_id = p_class_id
  ) THEN
    RETURN TRUE;
  END IF;

  -- 3. Sınıf belirtilmemişse, öğrencinin kayıtlı olduğu sınıf üzerinden kontrol et
  IF p_student_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.students s
    JOIN public.teacher_class_access tca ON tca.class_id = s.class_id
    WHERE s.id = p_student_id AND tca.teacher_auth_id = auth.uid()
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public, pg_temp;

-- 5. ROW LEVEL SECURITY (RLS) ETKİNLEŞTİRME
ALTER TABLE public.teacher_class_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_student_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homeworks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.etuts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- 6. ESKİ ÇAKIŞAN POLİTİKALARI TEMİZLEME
DROP POLICY IF EXISTS "tc_access_admin_all" ON public.teacher_class_access;
DROP POLICY IF EXISTS "tc_access_teacher_select" ON public.teacher_class_access;
DROP POLICY IF EXISTS "ts_access_admin_all" ON public.teacher_student_access;
DROP POLICY IF EXISTS "ts_access_teacher_select" ON public.teacher_student_access;

DROP POLICY IF EXISTS "students_admin_all" ON public.students;
DROP POLICY IF EXISTS "students_teacher_select" ON public.students;
DROP POLICY IF EXISTS "students_teacher_insert" ON public.students;
DROP POLICY IF EXISTS "students_teacher_update" ON public.students;
DROP POLICY IF EXISTS "students_teacher_delete" ON public.students;
DROP POLICY IF EXISTS "students_student_select" ON public.students;
DROP POLICY IF EXISTS "students_student_update" ON public.students;

DROP POLICY IF EXISTS "classes_admin_all" ON public.classes;
DROP POLICY IF EXISTS "classes_teacher_select" ON public.classes;
DROP POLICY IF EXISTS "classes_student_select" ON public.classes;

DROP POLICY IF EXISTS "grades_admin_all" ON public.grades;
DROP POLICY IF EXISTS "grades_teacher_access" ON public.grades;
DROP POLICY IF EXISTS "grades_teacher_select" ON public.grades;
DROP POLICY IF EXISTS "grades_teacher_insert" ON public.grades;
DROP POLICY IF EXISTS "grades_teacher_update" ON public.grades;
DROP POLICY IF EXISTS "grades_teacher_delete" ON public.grades;
DROP POLICY IF EXISTS "grades_student_select" ON public.grades;

DROP POLICY IF EXISTS "attendance_admin_all" ON public.attendance;
DROP POLICY IF EXISTS "attendance_teacher_access" ON public.attendance;
DROP POLICY IF EXISTS "attendance_teacher_select" ON public.attendance;
DROP POLICY IF EXISTS "attendance_teacher_insert" ON public.attendance;
DROP POLICY IF EXISTS "attendance_teacher_update" ON public.attendance;
DROP POLICY IF EXISTS "attendance_teacher_delete" ON public.attendance;
DROP POLICY IF EXISTS "attendance_student_select" ON public.attendance;

DROP POLICY IF EXISTS "homeworks_admin_all" ON public.homeworks;
DROP POLICY IF EXISTS "homeworks_teacher_access" ON public.homeworks;
DROP POLICY IF EXISTS "homeworks_teacher_select" ON public.homeworks;
DROP POLICY IF EXISTS "homeworks_teacher_insert" ON public.homeworks;
DROP POLICY IF EXISTS "homeworks_teacher_update" ON public.homeworks;
DROP POLICY IF EXISTS "homeworks_teacher_delete" ON public.homeworks;
DROP POLICY IF EXISTS "homeworks_student_access" ON public.homeworks;

DROP POLICY IF EXISTS "etuts_admin_all" ON public.etuts;
DROP POLICY IF EXISTS "etuts_teacher_access" ON public.etuts;
DROP POLICY IF EXISTS "etuts_teacher_select" ON public.etuts;
DROP POLICY IF EXISTS "etuts_teacher_insert" ON public.etuts;
DROP POLICY IF EXISTS "etuts_teacher_update" ON public.etuts;
DROP POLICY IF EXISTS "etuts_teacher_delete" ON public.etuts;
DROP POLICY IF EXISTS "etuts_student_select" ON public.etuts;

DROP POLICY IF EXISTS "question_logs_admin_all" ON public.question_logs;
DROP POLICY IF EXISTS "question_logs_teacher_access" ON public.question_logs;
DROP POLICY IF EXISTS "question_logs_teacher_select" ON public.question_logs;
DROP POLICY IF EXISTS "question_logs_teacher_insert" ON public.question_logs;
DROP POLICY IF EXISTS "question_logs_teacher_update" ON public.question_logs;
DROP POLICY IF EXISTS "question_logs_teacher_delete" ON public.question_logs;
DROP POLICY IF EXISTS "question_logs_student_select" ON public.question_logs;
DROP POLICY IF EXISTS "question_logs_student_insert" ON public.question_logs;
DROP POLICY IF EXISTS "question_logs_student_update" ON public.question_logs;

DROP POLICY IF EXISTS "messages_admin_all" ON public.messages;
DROP POLICY IF EXISTS "messages_teacher_access" ON public.messages;
DROP POLICY IF EXISTS "messages_teacher_select" ON public.messages;
DROP POLICY IF EXISTS "messages_teacher_insert" ON public.messages;
DROP POLICY IF EXISTS "messages_teacher_update" ON public.messages;
DROP POLICY IF EXISTS "messages_teacher_delete" ON public.messages;
DROP POLICY IF EXISTS "messages_student_select" ON public.messages;
DROP POLICY IF EXISTS "messages_student_insert" ON public.messages;

-- ============================================================================
-- 7. TABLOLAR İÇİN RLS POLİTİKALARI (HER TABLO VE İŞLEM İÇİN AYRI AYRI)
-- ============================================================================

-- A) TEACHER_CLASS_ACCESS TABLOSU
CREATE POLICY "tc_access_admin_all" ON public.teacher_class_access
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "tc_access_teacher_select" ON public.teacher_class_access
FOR SELECT TO authenticated
USING (teacher_auth_id = auth.uid());

-- B) TEACHER_STUDENT_ACCESS TABLOSU
CREATE POLICY "ts_access_admin_all" ON public.teacher_student_access
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "ts_access_teacher_select" ON public.teacher_student_access
FOR SELECT TO authenticated
USING (teacher_auth_id = auth.uid());

-- C) STUDENTS TABLOSU
-- Admin tam yetki
CREATE POLICY "students_admin_all" ON public.students
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Öğretmen: Sadece erişim izni olan sınıftaki veya öğrencileri seçebilir
CREATE POLICY "students_teacher_select" ON public.students
FOR SELECT TO authenticated
USING (
  public.is_teacher() AND public.teacher_has_student_access(id, class_id)
);

-- Öğretmen: Sadece yetkili olduğu sınıfa yeni öğrenci ekleyebilir
CREATE POLICY "students_teacher_insert" ON public.students
FOR INSERT TO authenticated
WITH CHECK (
  public.is_teacher() AND public.teacher_has_class_access(class_id)
);

-- Öğretmen: Sadece yetkili olduğu öğrenciyi güncelleyebilir
CREATE POLICY "students_teacher_update" ON public.students
FOR UPDATE TO authenticated
USING (
  public.is_teacher() AND public.teacher_has_student_access(id, class_id)
)
WITH CHECK (
  public.is_teacher() AND public.teacher_has_student_access(id, class_id)
);

-- Öğretmen: Sadece yetkili olduğu sınıftaki öğrenci kaydını silebilir
CREATE POLICY "students_teacher_delete" ON public.students
FOR DELETE TO authenticated
USING (
  public.is_teacher() AND public.teacher_has_student_access(id, class_id)
);

-- Öğrenci: Sadece kendi profilini okuyabilir
CREATE POLICY "students_student_select" ON public.students
FOR SELECT TO authenticated
USING (
  public.is_student() AND (auth_user_id = auth.uid() OR id = auth.uid()::text)
);

-- Öğrenci: Sadece kendi profilini güncelleyebilir
CREATE POLICY "students_student_update" ON public.students
FOR UPDATE TO authenticated
USING (
  public.is_student() AND (auth_user_id = auth.uid() OR id = auth.uid()::text)
)
WITH CHECK (
  public.is_student() AND (auth_user_id = auth.uid() OR id = auth.uid()::text)
);

-- D) CLASSES TABLOSU
CREATE POLICY "classes_admin_all" ON public.classes
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "classes_teacher_select" ON public.classes
FOR SELECT TO authenticated
USING (
  public.is_teacher() AND public.teacher_has_class_access(id)
);

CREATE POLICY "classes_student_select" ON public.classes
FOR SELECT TO authenticated
USING (
  public.is_student() AND EXISTS (
    SELECT 1 FROM public.students s
    WHERE (s.auth_user_id = auth.uid() OR s.id = auth.uid()::text) AND s.class_id = classes.id
  )
);

-- E) GRADES TABLOSU (NOTLAR VE DEĞERLENDİRMELER)
CREATE POLICY "grades_admin_all" ON public.grades
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "grades_teacher_select" ON public.grades
FOR SELECT TO authenticated
USING (
  public.is_teacher() AND public.teacher_has_student_access(student_id, class_id)
);

CREATE POLICY "grades_teacher_insert" ON public.grades
FOR INSERT TO authenticated
WITH CHECK (
  public.is_teacher() AND public.teacher_has_student_access(student_id, class_id)
);

CREATE POLICY "grades_teacher_update" ON public.grades
FOR UPDATE TO authenticated
USING (
  public.is_teacher() AND public.teacher_has_student_access(student_id, class_id)
)
WITH CHECK (
  public.is_teacher() AND public.teacher_has_student_access(student_id, class_id)
);

CREATE POLICY "grades_teacher_delete" ON public.grades
FOR DELETE TO authenticated
USING (
  public.is_teacher() AND public.teacher_has_student_access(student_id, class_id)
);

CREATE POLICY "grades_student_select" ON public.grades
FOR SELECT TO authenticated
USING (
  public.is_student() AND EXISTS (
    SELECT 1 FROM public.students s
    WHERE (s.auth_user_id = auth.uid() OR s.id = auth.uid()::text) AND s.id = grades.student_id
  )
);

-- F) ATTENDANCE TABLOSU (DEVAMSIZLIK VE YOKLAMA)
CREATE POLICY "attendance_admin_all" ON public.attendance
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "attendance_teacher_select" ON public.attendance
FOR SELECT TO authenticated
USING (
  public.is_teacher() AND public.teacher_has_class_access(class_id)
);

CREATE POLICY "attendance_teacher_insert" ON public.attendance
FOR INSERT TO authenticated
WITH CHECK (
  public.is_teacher() AND public.teacher_has_class_access(class_id)
);

CREATE POLICY "attendance_teacher_update" ON public.attendance
FOR UPDATE TO authenticated
USING (
  public.is_teacher() AND public.teacher_has_class_access(class_id)
)
WITH CHECK (
  public.is_teacher() AND public.teacher_has_class_access(class_id)
);

CREATE POLICY "attendance_teacher_delete" ON public.attendance
FOR DELETE TO authenticated
USING (
  public.is_teacher() AND public.teacher_has_class_access(class_id)
);

CREATE POLICY "attendance_student_select" ON public.attendance
FOR SELECT TO authenticated
USING (
  public.is_student() AND EXISTS (
    SELECT 1 FROM public.students s
    WHERE (s.auth_user_id = auth.uid() OR s.id = auth.uid()::text) AND s.class_id = attendance.class_id
  )
);

-- G) HOMEWORKS TABLOSU (ÖDEVLER)
CREATE POLICY "homeworks_admin_all" ON public.homeworks
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "homeworks_teacher_select" ON public.homeworks
FOR SELECT TO authenticated
USING (
  public.is_teacher() AND (public.teacher_has_class_access(class_id) OR class_id IS NULL)
);

CREATE POLICY "homeworks_teacher_insert" ON public.homeworks
FOR INSERT TO authenticated
WITH CHECK (
  public.is_teacher() AND (public.teacher_has_class_access(class_id) OR class_id IS NULL)
);

CREATE POLICY "homeworks_teacher_update" ON public.homeworks
FOR UPDATE TO authenticated
USING (
  public.is_teacher() AND (public.teacher_has_class_access(class_id) OR class_id IS NULL)
)
WITH CHECK (
  public.is_teacher() AND (public.teacher_has_class_access(class_id) OR class_id IS NULL)
);

CREATE POLICY "homeworks_teacher_delete" ON public.homeworks
FOR DELETE TO authenticated
USING (
  public.is_teacher() AND (public.teacher_has_class_access(class_id) OR class_id IS NULL)
);

CREATE POLICY "homeworks_student_access" ON public.homeworks
FOR SELECT TO authenticated
USING (
  public.is_student() AND (
    EXISTS (
      SELECT 1 FROM public.students s
      WHERE (s.auth_user_id = auth.uid() OR s.id = auth.uid()::text) AND
            (s.class_id = homeworks.class_id OR homeworks.assigned_to::text LIKE '%' || s.id || '%' OR homeworks.assigned_to::text = '"all"')
    )
  )
);

-- H) ETUTS TABLOSU (BİREBİR ETÜTLER VE RANDEVULAR)
CREATE POLICY "etuts_admin_all" ON public.etuts
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "etuts_teacher_select" ON public.etuts
FOR SELECT TO authenticated
USING (
  public.is_teacher() AND EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(assigned_student_ids) AS sid
    WHERE public.teacher_has_student_access(sid, NULL)
  )
);

CREATE POLICY "etuts_teacher_insert" ON public.etuts
FOR INSERT TO authenticated
WITH CHECK (
  public.is_teacher() AND
  NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(assigned_student_ids) AS sid
    WHERE NOT public.teacher_has_student_access(sid, NULL)
  )
);

CREATE POLICY "etuts_teacher_update" ON public.etuts
FOR UPDATE TO authenticated
USING (
  public.is_teacher() AND EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(assigned_student_ids) AS sid
    WHERE public.teacher_has_student_access(sid, NULL)
  )
)
WITH CHECK (
  public.is_teacher() AND
  NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(assigned_student_ids) AS sid
    WHERE NOT public.teacher_has_student_access(sid, NULL)
  )
);

CREATE POLICY "etuts_teacher_delete" ON public.etuts
FOR DELETE TO authenticated
USING (
  public.is_teacher() AND EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(assigned_student_ids) AS sid
    WHERE public.teacher_has_student_access(sid, NULL)
  )
);

CREATE POLICY "etuts_student_select" ON public.etuts
FOR SELECT TO authenticated
USING (
  public.is_student() AND EXISTS (
    SELECT 1 FROM public.students s
    WHERE (s.auth_user_id = auth.uid() OR s.id = auth.uid()::text) AND
          etuts.assigned_student_ids::text LIKE '%' || s.id || '%'
  )
);

-- I) QUESTION_LOGS TABLOSU (SORU TAKİBİ VE GÜNLÜKLER)
CREATE POLICY "question_logs_admin_all" ON public.question_logs
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "question_logs_teacher_select" ON public.question_logs
FOR SELECT TO authenticated
USING (
  public.is_teacher() AND public.teacher_has_student_access(student_id, class_id)
);

CREATE POLICY "question_logs_teacher_insert" ON public.question_logs
FOR INSERT TO authenticated
WITH CHECK (
  public.is_teacher() AND public.teacher_has_student_access(student_id, class_id)
);

CREATE POLICY "question_logs_teacher_update" ON public.question_logs
FOR UPDATE TO authenticated
USING (
  public.is_teacher() AND public.teacher_has_student_access(student_id, class_id)
)
WITH CHECK (
  public.is_teacher() AND public.teacher_has_student_access(student_id, class_id)
);

CREATE POLICY "question_logs_teacher_delete" ON public.question_logs
FOR DELETE TO authenticated
USING (
  public.is_teacher() AND public.teacher_has_student_access(student_id, class_id)
);

CREATE POLICY "question_logs_student_select" ON public.question_logs
FOR SELECT TO authenticated
USING (
  public.is_student() AND EXISTS (
    SELECT 1 FROM public.students s
    WHERE (s.auth_user_id = auth.uid() OR s.id = auth.uid()::text) AND s.id = question_logs.student_id
  )
);

CREATE POLICY "question_logs_student_insert" ON public.question_logs
FOR INSERT TO authenticated
WITH CHECK (
  public.is_student() AND EXISTS (
    SELECT 1 FROM public.students s
    WHERE (s.auth_user_id = auth.uid() OR s.id = auth.uid()::text) AND s.id = question_logs.student_id
  )
);

CREATE POLICY "question_logs_student_update" ON public.question_logs
FOR UPDATE TO authenticated
USING (
  public.is_student() AND EXISTS (
    SELECT 1 FROM public.students s
    WHERE (s.auth_user_id = auth.uid() OR s.id = auth.uid()::text) AND s.id = question_logs.student_id
  )
)
WITH CHECK (
  public.is_student() AND EXISTS (
    SELECT 1 FROM public.students s
    WHERE (s.auth_user_id = auth.uid() OR s.id = auth.uid()::text) AND s.id = question_logs.student_id
  )
);

-- J) MESSAGES TABLOSU (MESAJLAŞMA VE BİLDİRİMLER)
CREATE POLICY "messages_admin_all" ON public.messages
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "messages_teacher_select" ON public.messages
FOR SELECT TO authenticated
USING (
  public.is_teacher() AND public.teacher_has_student_access(student_id, NULL)
);

CREATE POLICY "messages_teacher_insert" ON public.messages
FOR INSERT TO authenticated
WITH CHECK (
  public.is_teacher() AND
  public.teacher_has_student_access(student_id, NULL)
);

CREATE POLICY "messages_teacher_update" ON public.messages
FOR UPDATE TO authenticated
USING (
  public.is_teacher() AND public.teacher_has_student_access(student_id, NULL)
)
WITH CHECK (
  public.is_teacher() AND public.teacher_has_student_access(student_id, NULL)
);

CREATE POLICY "messages_teacher_delete" ON public.messages
FOR DELETE TO authenticated
USING (
  public.is_teacher() AND public.teacher_has_student_access(student_id, NULL)
);

CREATE POLICY "messages_student_select" ON public.messages
FOR SELECT TO authenticated
USING (
  public.is_student() AND EXISTS (
    SELECT 1 FROM public.students s
    WHERE (s.auth_user_id = auth.uid() OR s.id = auth.uid()::text) AND s.id = messages.student_id
  )
);

CREATE POLICY "messages_student_insert" ON public.messages
FOR INSERT TO authenticated
WITH CHECK (
  public.is_student() AND EXISTS (
    SELECT 1 FROM public.students s
    WHERE (s.auth_user_id = auth.uid() OR s.id = auth.uid()::text) AND s.id = messages.student_id
  )
);

-- ============================================================================
-- 8. YÖNETİCİ İÇİN ATOMİK ERİŞİM ATAMA FONKSİYONU (RPC TRANSACTION)
-- ============================================================================
-- Sınıf ve öğrenci erişimlerini tek bir PostgreSQL transaction bloğunda atomik olarak
-- günceller. Herhangi bir adımda hata olursa tüm işlem otomatik olarak geri alınır (ROLLBACK).

CREATE OR REPLACE FUNCTION public.admin_set_teacher_access(
    p_teacher_auth_id UUID,
    p_class_ids TEXT[],
    p_student_ids TEXT[]
)
RETURNS JSONB AS $$
DECLARE
  v_class_count INTEGER := 0;
  v_student_count INTEGER := 0;
BEGIN
  -- Sadece yetkili yöneticiler çalıştırabilir
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Yetkisiz işlem: Sadece yöneticiler öğretmen erişim matrisini güncelleyebilir.';
  END IF;

  -- 1. Öğretmenin önceki erişim kayıtlarını temizle
  DELETE FROM public.teacher_class_access WHERE teacher_auth_id = p_teacher_auth_id;
  DELETE FROM public.teacher_student_access WHERE teacher_auth_id = p_teacher_auth_id;

  -- 2. Sınıf yetkilerini toplu ekle
  IF p_class_ids IS NOT NULL AND array_length(p_class_ids, 1) > 0 THEN
    INSERT INTO public.teacher_class_access (teacher_auth_id, class_id)
    SELECT p_teacher_auth_id, unnest(p_class_ids)
    ON CONFLICT (teacher_auth_id, class_id) DO NOTHING;
    GET DIAGNOSTICS v_class_count = ROW_COUNT;
  END IF;

  -- 3. Bireysel öğrenci yetkilerini toplu ekle
  IF p_student_ids IS NOT NULL AND array_length(p_student_ids, 1) > 0 THEN
    INSERT INTO public.teacher_student_access (teacher_auth_id, student_id)
    SELECT p_teacher_auth_id, unnest(p_student_ids)
    ON CONFLICT (teacher_auth_id, student_id) DO NOTHING;
    GET DIAGNOSTICS v_student_count = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'teacher_auth_id', p_teacher_auth_id,
    'assigned_classes', v_class_count,
    'assigned_students', v_student_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

