-- ============================================================================
-- Aşama 34: TELEFON BİLDİRİMİ ZAMANLAYICISI (her 10 dakikada bir)
-- Etüt hatırlatması (30 dk önce), ödev teslim hatırlatması, yoklaması alınmayan etüt,
-- günlük plan ve günlük soru sayısı hatırlatmaları bu zamanlayıcıyla gönderilir.
--
-- ÇALIŞTIRMADAN ÖNCE aşağıdaki İKİ yeri kendi bilgilerinizle değiştirin:
--   SITE_ADRESI   -> sitenizin adresi, ör. https://bilir-hoca.vercel.app   (sonunda / olmadan)
--   CRON_SIFRESI  -> Vercel'deki CRON_SECRET değeri (Settings > Environment Variables)
--
-- Supabase > SQL Editor'de BİR KEZ çalıştırın. Tekrar çalıştırırsanız eski görev silinip yenisi kurulur.
-- Kontrol: Supabase > Integrations (ya da Database) > Cron Jobs listesinde "telefon-bildirimleri" görünür.
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Daha önce kurulduysa kaldır (adı aynı olan görev)
select cron.unschedule(jobid) from cron.job where jobname = 'telefon-bildirimleri';

select cron.schedule(
  'telefon-bildirimleri',
  '*/10 * * * *',
  $$
  select net.http_get(
    url := 'SITE_ADRESI/api/push?task=tick',
    headers := jsonb_build_object('Authorization', 'Bearer CRON_SIFRESI'),
    timeout_milliseconds := 30000
  );
  $$
);

-- Gönderim kaydının 30 günden eski satırları her gece temizlenir (tablo şişmesin)
select cron.unschedule(jobid) from cron.job where jobname = 'telefon-bildirim-kayit-temizligi';
select cron.schedule(
  'telefon-bildirim-kayit-temizligi',
  '23 3 * * *',
  $$ delete from public.push_log where created_at < now() - interval '30 days'; $$
);
