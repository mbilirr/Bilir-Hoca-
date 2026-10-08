-- ============================================================================
-- AŞAMA 19/20 – ETÜT E-POSTASI ZAMANLAYICISI (Supabase pg_cron, ücretsiz)
-- Her 10 dakikada bir uygulamanın /api/mail?task=etut-reminders adresini çağırır.
-- Uygulama, vakti gelen (etüt saatinden 1 saat önce; saat yoksa o sabah 08:00)
-- kopyalanmış etütlerin e-postasını gönderir. Aynı e-posta ikinci kez gitmez.
--
-- Hiçbir tablo/veri değişmez; yalnızca "etut-mail-10dk" adlı bir zamanlanmış görev kurulur.
-- Bu dosya birden fazla kez çalıştırılabilir (eski görev silinip yenisi kurulur).
--
-- ZORUNLU (Aşama 20): Zamanlanmış görev adresi artık gizli anahtarsız çalışmaz.
--   1) Gizli anahtarı bu SQL Editörde üretin:  select encode(gen_random_bytes(24), 'hex');
--   2) Çıkan değeri Vercel > Settings > Environment Variables bölümüne CRON_SECRET adıyla ekleyin
--      ve Redeploy yapın.
--   3) AYNI değeri aşağıdaki v_secret satırında BURAYA_GIZLI_ANAHTAR yerine yazıp bu dosyayı çalıştırın.
--   Bu değeri kimseyle (bana da) paylaşmayın.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  v_url     TEXT := 'https://bilir-hoca.vercel.app/api/mail?task=etut-reminders';
  v_secret  TEXT := 'BURAYA_GIZLI_ANAHTAR';   -- <== Vercel'deki CRON_SECRET ile aynı değer
  v_headers JSONB;
  v_cmd     TEXT;
BEGIN
  IF v_secret IS NULL OR length(v_secret) < 16 OR v_secret = 'BURAYA_GIZLI_ANAHTAR' THEN
    RAISE EXCEPTION 'v_secret satırına CRON_SECRET değerini yazın (en az 16 karakter).';
  END IF;

  -- Eski görev varsa kaldır
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'etut-mail-10dk';

  v_headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret);

  v_cmd := format(
    'SELECT net.http_get(url := %L, headers := %L::jsonb, timeout_milliseconds := 25000);',
    v_url, v_headers::text
  );

  PERFORM cron.schedule('etut-mail-10dk', '*/10 * * * *', v_cmd);
END $$;

-- KONTROL (yalnızca okur): 1 satır, "aktif" sütunu true olmalı
SELECT jobname AS gorev, schedule AS zaman, active AS aktif
FROM cron.job
WHERE jobname = 'etut-mail-10dk';
