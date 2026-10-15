-- ============================================================================
-- Aşama 34: TELEFON BİLDİRİMLERİ (Web Push)
-- Supabase > SQL Editor'de BİR KEZ çalıştırın. Tekrar çalıştırmak zararsızdır.
--
--  push_subscriptions : hangi cihaz (telefon/bilgisayar tarayıcısı) hangi kullanıcıya bildirim alacak
--  push_log           : aynı bildirim aynı kişiye iki kez gitmesin diye gönderim kaydı
--
-- İki tabloya da yalnızca sunucu (service_role anahtarıyla /api/push) erişir; tarayıcıdan okunamaz/yazılamaz.
-- ============================================================================

create table if not exists public.push_subscriptions (
  endpoint     text primary key,                 -- tarayıcının verdiği bildirim adresi (cihaza özel)
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         text not null check (role in ('student', 'teacher')),
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

create table if not exists public.push_log (
  key        text primary key,                   -- ör. "etut-soon:etut-123:<kullanıcı>"
  created_at timestamptz not null default now()
);
create index if not exists push_log_created_idx on public.push_log (created_at);

-- Güvenlik: RLS açık, hiçbir politika yok => yalnızca service_role erişebilir
alter table public.push_subscriptions enable row level security;
alter table public.push_log enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
revoke all on public.push_log from anon, authenticated;
