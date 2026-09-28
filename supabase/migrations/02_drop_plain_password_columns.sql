-- ============================================================================
-- AŞAMA 1 - ADIM 5: DÜZ METİN ŞİFRE SÜTUNLARINI SİLME
-- Supabase Authentication ve yeni giriş doğrulandıktan sonra çalıştırılır.
-- ============================================================================

ALTER TABLE IF EXISTS public.teachers DROP COLUMN IF EXISTS password;
ALTER TABLE IF EXISTS public.students DROP COLUMN IF EXISTS password;
