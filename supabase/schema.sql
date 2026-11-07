-- =============================================================================
-- biliredu veritabanı şeması: BAŞVURU DOSYASI (Aşama 194)
-- 7 Kasım 2026 Supabase dışa aktarımından (181a-d) üretildi; 188 ve 193 SQL'lerinin eklediği işlev / sütunlar dahil.
-- Aşama 199: initial_credentials_eski_160 yedek tablosu silindi, bu dosyadan da çıkarıldı.
-- BU DOSYAYI ÇALIŞTIRMAYIN. Değişiklikler her zaman numaralı paket SQL'leriyle yapılır; bu dosya yalnız
-- "veritabanında ne var" sorusunun cevabıdır ve şema değişince yeniden üretilir.
-- =============================================================================

-- 1) TABLOLAR

CREATE TABLE public.attendance (
  id text not null,
  date text not null,
  class_id text not null,
  subject text not null,
  records jsonb default '[]'::jsonb not null,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  created_by uuid,
  updated_at timestamp with time zone default now() not null,
  CONSTRAINT attendance_pkey PRIMARY KEY (id)
);
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx88_attendance_updated_at ON public.attendance USING btree (updated_at);
CREATE UNIQUE INDEX attendance_sinif_gun_ders_tekil ON public.attendance USING btree (class_id, date, COALESCE(subject, 'Genel'::text));
CREATE INDEX idx88_attendance_class_date ON public.attendance USING btree (class_id, date);

CREATE TABLE public.backup_log (
  id bigint default nextval('backup_log_id_seq'::regclass) not null,
  created_at timestamp with time zone default now() not null,
  created_by uuid default auth.uid(),
  created_by_name text,
  table_counts jsonb default '{}'::jsonb not null,
  CONSTRAINT backup_log_pkey PRIMARY KEY (id)
);
ALTER TABLE public.backup_log ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.classes (
  id text not null,
  name text not null,
  level integer not null,
  branch text not null,
  student_count integer default 0,
  academic_year text not null,
  description text,
  kurum_id uuid,
  updated_at timestamp with time zone default now() not null,
  CONSTRAINT classes_kurum_id_fkey FOREIGN KEY (kurum_id) REFERENCES kurumlar(id) ON DELETE SET NULL,
  CONSTRAINT classes_pkey PRIMARY KEY (id)
);
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
CREATE INDEX classes_kurum_idx ON public.classes USING btree (kurum_id);
CREATE INDEX idx193_classes_updated_at ON public.classes USING btree (updated_at);

CREATE TABLE public.deleted_records (
  id text not null,
  kind text not null,
  record_id text not null,
  deleted_at timestamp with time zone default now() not null,
  deleted_by uuid default auth.uid(),
  updated_at timestamp with time zone default now() not null,
  CONSTRAINT deleted_records_kind_check CHECK ((kind = ANY (ARRAY['student'::text, 'class'::text, 'question_log'::text]))),
  CONSTRAINT deleted_records_pkey PRIMARY KEY (id)
);
ALTER TABLE public.deleted_records ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx193_deleted_records_updated_at ON public.deleted_records USING btree (updated_at);

CREATE TABLE public.deneme_aliases (
  id text not null,
  kurum_id text,
  alias_key text not null,
  student_id text not null,
  created_by uuid default auth.uid(),
  created_at timestamp with time zone default now() not null,
  CONSTRAINT deneme_aliases_alias_key_check CHECK (((char_length(alias_key) >= 1) AND (char_length(alias_key) <= 160))),
  CONSTRAINT deneme_aliases_id_check CHECK (((char_length(id) >= 1) AND (char_length(id) <= 200))),
  CONSTRAINT deneme_aliases_pkey PRIMARY KEY (id),
  CONSTRAINT deneme_aliases_student_id_check CHECK (((char_length(student_id) >= 1) AND (char_length(student_id) <= 120)))
);
ALTER TABLE public.deneme_aliases ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.deneme_exams (
  id text not null,
  kurum_id text,
  name text not null,
  publisher text,
  exam_date date,
  grade text default '8'::text not null,
  exam_type text default 'LGS'::text not null,
  subjects jsonb default '[]'::jsonb not null,
  questions jsonb default '{}'::jsonb not null,
  scoring jsonb default '{}'::jsonb not null,
  summary jsonb default '{}'::jsonb not null,
  published boolean default false not null,
  created_by uuid default auth.uid(),
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  CONSTRAINT deneme_exams_exam_type_check CHECK ((char_length(exam_type) <= 20)),
  CONSTRAINT deneme_exams_grade_check CHECK ((char_length(grade) <= 10)),
  CONSTRAINT deneme_exams_id_check CHECK (((char_length(id) >= 1) AND (char_length(id) <= 80))),
  CONSTRAINT deneme_exams_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 200))),
  CONSTRAINT deneme_exams_pkey PRIMARY KEY (id),
  CONSTRAINT deneme_exams_publisher_check CHECK (((publisher IS NULL) OR (char_length(publisher) <= 120)))
);
ALTER TABLE public.deneme_exams ENABLE ROW LEVEL SECURITY;
CREATE INDEX deneme_exams_kurum_idx ON public.deneme_exams USING btree (kurum_id, exam_date DESC);

CREATE TABLE public.deneme_formats (
  id text not null,
  kurum_id text,
  name text not null,
  fmt_text text,
  fields jsonb default '[]'::jsonb not null,
  created_by uuid default auth.uid(),
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  CONSTRAINT deneme_formats_fmt_text_check CHECK (((fmt_text IS NULL) OR (char_length(fmt_text) <= 20000))),
  CONSTRAINT deneme_formats_id_check CHECK (((char_length(id) >= 1) AND (char_length(id) <= 80))),
  CONSTRAINT deneme_formats_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 120))),
  CONSTRAINT deneme_formats_pkey PRIMARY KEY (id)
);
ALTER TABLE public.deneme_formats ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.deneme_kazanim_eslesme (
  id bigint not null,
  kurum_id uuid,
  subject text not null,
  src_key text not null,
  code text not null,
  created_by uuid default auth.uid(),
  updated_at timestamp with time zone default now() not null,
  CONSTRAINT deneme_kazanim_eslesme_pkey PRIMARY KEY (id),
  CONSTRAINT deneme_kazanim_eslesme_tekil UNIQUE NULLS NOT DISTINCT (kurum_id, subject, src_key)
);
ALTER TABLE public.deneme_kazanim_eslesme ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.deneme_kazanimlar (
  code text not null,
  subject text not null,
  grade text,
  text text not null,
  konu text,
  alt jsonb default '[]'::jsonb not null,
  updated_at timestamp with time zone default now() not null,
  CONSTRAINT deneme_kazanimlar_code_check CHECK (((char_length(code) >= 1) AND (char_length(code) <= 60))),
  CONSTRAINT deneme_kazanimlar_grade_check CHECK (((grade IS NULL) OR (char_length(grade) <= 10))),
  CONSTRAINT deneme_kazanimlar_konu_check CHECK (((konu IS NULL) OR (char_length(konu) <= 300))),
  CONSTRAINT deneme_kazanimlar_pkey PRIMARY KEY (code),
  CONSTRAINT deneme_kazanimlar_subject_check CHECK ((char_length(subject) <= 80)),
  CONSTRAINT deneme_kazanimlar_text_check CHECK ((char_length(text) <= 2000))
);
ALTER TABLE public.deneme_kazanimlar ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.deneme_results (
  id text not null,
  exam_id text not null,
  student_id text not null,
  student_name text default ''::text not null,
  class_id text,
  class_name text,
  booklet text,
  answers jsonb default '{}'::jsonb not null,
  stats jsonb default '{}'::jsonb not null,
  total_net numeric(7,2),
  score numeric(7,3),
  matched_by text,
  optik jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  CONSTRAINT deneme_results_booklet_check CHECK (((booklet IS NULL) OR (char_length(booklet) <= 2))),
  CONSTRAINT deneme_results_class_id_check CHECK (((class_id IS NULL) OR (char_length(class_id) <= 120))),
  CONSTRAINT deneme_results_class_name_check CHECK (((class_name IS NULL) OR (char_length(class_name) <= 120))),
  CONSTRAINT deneme_results_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES deneme_exams(id) ON DELETE CASCADE,
  CONSTRAINT deneme_results_exam_id_student_id_key UNIQUE (exam_id, student_id),
  CONSTRAINT deneme_results_id_check CHECK (((char_length(id) >= 1) AND (char_length(id) <= 120))),
  CONSTRAINT deneme_results_matched_by_check CHECK (((matched_by IS NULL) OR (char_length(matched_by) <= 40))),
  CONSTRAINT deneme_results_pkey PRIMARY KEY (id),
  CONSTRAINT deneme_results_student_id_check CHECK (((char_length(student_id) >= 1) AND (char_length(student_id) <= 120))),
  CONSTRAINT deneme_results_student_name_check CHECK ((char_length(student_name) <= 160))
);
ALTER TABLE public.deneme_results ENABLE ROW LEVEL SECURITY;
CREATE INDEX deneme_results_student_idx ON public.deneme_results USING btree (student_id);

CREATE TABLE public.deneme_targets (
  student_id text not null,
  target_score numeric(7,3),
  note text,
  updated_by uuid default auth.uid(),
  updated_at timestamp with time zone default now() not null,
  CONSTRAINT deneme_targets_note_check CHECK (((note IS NULL) OR (char_length(note) <= 300))),
  CONSTRAINT deneme_targets_pkey PRIMARY KEY (student_id),
  CONSTRAINT deneme_targets_student_id_check CHECK (((char_length(student_id) >= 1) AND (char_length(student_id) <= 120))),
  CONSTRAINT deneme_targets_target_score_check CHECK (((target_score IS NULL) OR ((target_score >= (0)::numeric) AND (target_score <= (500)::numeric))))
);
ALTER TABLE public.deneme_targets ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.deneme_yillik_plan (
  id bigint not null,
  kurum_id uuid,
  subject text not null,
  code text not null,
  start_date date not null,
  egitim_yili text,
  created_by uuid default auth.uid(),
  updated_at timestamp with time zone default now() not null,
  CONSTRAINT deneme_yillik_plan_pkey PRIMARY KEY (id),
  CONSTRAINT deneme_yillik_plan_subject_check CHECK ((subject = ANY (ARRAY['fen'::text, 'mat'::text, 'sos'::text]))),
  CONSTRAINT deneme_yillik_plan_tekil UNIQUE NULLS NOT DISTINCT (kurum_id, subject, code)
);
ALTER TABLE public.deneme_yillik_plan ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.etut_teachers (
  id uuid default gen_random_uuid() not null,
  name text not null,
  subjects text[] default '{}'::text[] not null,
  email text,
  phone text,
  teacher_id text,
  active boolean default true not null,
  created_by uuid default auth.uid(),
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  kurum_id uuid,
  CONSTRAINT etut_teachers_email_check CHECK (((email IS NULL) OR (email = ''::text) OR (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'::text))),
  CONSTRAINT etut_teachers_kurum_id_fkey FOREIGN KEY (kurum_id) REFERENCES kurumlar(id) ON DELETE SET NULL,
  CONSTRAINT etut_teachers_name_check CHECK (((length(btrim(name)) >= 2) AND (length(btrim(name)) <= 120))),
  CONSTRAINT etut_teachers_pkey PRIMARY KEY (id),
  CONSTRAINT etut_teachers_teacher_id_key UNIQUE (teacher_id)
);
ALTER TABLE public.etut_teachers ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.etut_yoklama (
  etut_id text not null,
  student_id text not null,
  student_name text,
  status text not null,
  note text default ''::text not null,
  topic text default ''::text not null,
  marked_by text,
  marked_at timestamp with time zone,
  changed_at timestamp with time zone default now() not null,
  updated_by uuid,
  updated_at timestamp with time zone default now() not null,
  id text generated always as (((etut_id || '|'::text) || student_id)) stored,
  CONSTRAINT etut_yoklama_etut_id_fkey FOREIGN KEY (etut_id) REFERENCES etuts(id) ON DELETE CASCADE,
  CONSTRAINT etut_yoklama_pkey PRIMARY KEY (etut_id, student_id),
  CONSTRAINT etut_yoklama_status_check CHECK ((status = ANY (ARRAY['present'::text, 'absent'::text, 'excused'::text, 'late'::text])))
);
ALTER TABLE public.etut_yoklama ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx178_etut_yoklama_updated ON public.etut_yoklama USING btree (updated_at);
CREATE INDEX idx178_etut_yoklama_student ON public.etut_yoklama USING btree (student_id);
CREATE UNIQUE INDEX idx178_etut_yoklama_id ON public.etut_yoklama USING btree (id);

CREATE TABLE public.etuts (
  id text not null,
  subject text not null,
  topic text not null,
  date text not null,
  "time" text not null,
  duration integer default 45 not null,
  location text not null,
  notes text,
  assigned_student_ids jsonb not null,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  etut_teacher_id text,
  etut_teacher_ids text[],
  updated_at timestamp with time zone default now() not null,
  teacher_feedback text,
  user_notes text,
  attendance_taken_by jsonb,
  CONSTRAINT etuts_pkey PRIMARY KEY (id)
);
ALTER TABLE public.etuts ENABLE ROW LEVEL SECURITY;
CREATE INDEX etuts_etut_teacher_ids_idx ON public.etuts USING gin (etut_teacher_ids);
CREATE INDEX etuts_etut_teacher_id_idx ON public.etuts USING btree (etut_teacher_id);
CREATE INDEX idx111_etuts_updated_at ON public.etuts USING btree (updated_at);

CREATE TABLE public.etuts_yedek_178 (
  id text,
  subject text,
  topic text,
  date text,
  "time" text,
  duration integer,
  location text,
  notes text,
  assigned_student_ids jsonb,
  created_at timestamp with time zone,
  etut_teacher_id text,
  etut_teacher_ids text[],
  updated_at timestamp with time zone
);
ALTER TABLE public.etuts_yedek_178 ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.grades (
  id text not null,
  student_id text not null,
  class_id text not null,
  subject text not null,
  exam_type text not null,
  score numeric not null,
  max_score numeric default 100,
  date text not null,
  remarks text,
  created_by uuid,
  updated_at timestamp with time zone default now() not null,
  CONSTRAINT grades_pkey PRIMARY KEY (id)
);
ALTER TABLE public.grades ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx88_grades_updated_at ON public.grades USING btree (updated_at);
CREATE INDEX idx88_grades_student ON public.grades USING btree (student_id);

CREATE TABLE public.homework_submissions (
  id text default ('sub-'::text || (gen_random_uuid())::text) not null,
  homework_id text not null,
  student_id text not null,
  student_name text,
  status text default 'on_time'::text not null,
  check_status text,
  notes text,
  attachment_link text,
  resources jsonb default '[]'::jsonb not null,
  score numeric,
  feedback text,
  submitted_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now() not null,
  CONSTRAINT homework_submissions_check_status_check CHECK (((check_status IS NULL) OR (check_status = ANY (ARRAY['yapti'::text, 'yapmadi'::text, 'eksik'::text, 'izinli'::text, 'gelmedi'::text])))),
  CONSTRAINT homework_submissions_homework_id_fkey FOREIGN KEY (homework_id) REFERENCES homeworks(id) ON DELETE CASCADE,
  CONSTRAINT homework_submissions_pkey PRIMARY KEY (id),
  CONSTRAINT homework_submissions_status_check CHECK ((status = ANY (ARRAY['on_time'::text, 'late'::text, 'not_submitted'::text]))),
  CONSTRAINT homework_submissions_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT homework_submissions_unique UNIQUE (homework_id, student_id)
);
ALTER TABLE public.homework_submissions ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx88_subs_student ON public.homework_submissions USING btree (student_id);
CREATE INDEX idx_homework_submissions_student ON public.homework_submissions USING btree (student_id);
CREATE INDEX idx88_subs_homework ON public.homework_submissions USING btree (homework_id);
CREATE INDEX idx88_subs_updated ON public.homework_submissions USING btree (updated_at);

CREATE TABLE public.homeworks (
  id text not null,
  title text not null,
  subject text not null,
  description text not null,
  learning_outcomes jsonb default '[]'::jsonb not null,
  due_date text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  assigned_to jsonb not null,
  class_id text,
  submissions jsonb default '[]'::jsonb not null,
  teacher_id text,
  teacher_name text,
  meta jsonb default '{}'::jsonb not null,
  teacher_auth_id uuid default auth.uid(),
  target_class_ids text[] default '{}'::text[] not null,
  target_student_ids text[] default '{}'::text[] not null,
  updated_at timestamp with time zone default now(),
  CONSTRAINT homeworks_pkey PRIMARY KEY (id)
);
ALTER TABLE public.homeworks ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.initial_credentials (
  account_type text not null,
  record_id text not null,
  login_id text,
  password text,
  must_change boolean default true not null,
  set_at timestamp with time zone default now() not null,
  set_by uuid,
  changed_at timestamp with time zone,
  CONSTRAINT initial_credentials_account_type_check CHECK ((account_type = ANY (ARRAY['student'::text, 'teacher'::text]))),
  CONSTRAINT initial_credentials_pkey PRIMARY KEY (account_type, record_id)
);
ALTER TABLE public.initial_credentials ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.karne_links (
  id uuid default gen_random_uuid() not null,
  token_hash text not null,
  student_id text not null,
  kurum_id text,
  tur text not null,
  exam_key text not null,
  day text not null,
  storage_path text not null,
  created_by uuid,
  created_at timestamp with time zone default now() not null,
  expires_at timestamp with time zone not null,
  revoked_at timestamp with time zone,
  open_count integer default 0 not null,
  last_opened_at timestamp with time zone,
  CONSTRAINT karne_links_pkey PRIMARY KEY (id),
  CONSTRAINT karne_links_token_hash_key UNIQUE (token_hash)
);
ALTER TABLE public.karne_links ENABLE ROW LEVEL SECURITY;
CREATE INDEX karne_links_student_idx ON public.karne_links USING btree (student_id);
CREATE UNIQUE INDEX karne_links_gunluk_tekil ON public.karne_links USING btree (student_id, tur, exam_key, day) WHERE (revoked_at IS NULL);
CREATE INDEX karne_links_expires_idx ON public.karne_links USING btree (expires_at);

CREATE TABLE public.kurum_class_grants (
  kurum_id uuid not null,
  class_id text not null,
  created_at timestamp with time zone default now() not null,
  CONSTRAINT kurum_class_grants_kurum_id_fkey FOREIGN KEY (kurum_id) REFERENCES kurumlar(id) ON DELETE CASCADE,
  CONSTRAINT kurum_class_grants_pkey PRIMARY KEY (kurum_id, class_id)
);
ALTER TABLE public.kurum_class_grants ENABLE ROW LEVEL SECURITY;
CREATE INDEX kurum_class_grants_class_idx ON public.kurum_class_grants USING btree (class_id);

CREATE TABLE public.kurum_gecis_oturumlari (
  session_id uuid not null,
  auth_user_id uuid not null,
  kurum_id uuid not null,
  created_at timestamp with time zone default now() not null,
  CONSTRAINT kurum_gecis_oturumlari_pkey PRIMARY KEY (session_id)
);
ALTER TABLE public.kurum_gecis_oturumlari ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.kurum_mail_accounts (
  kurum_id uuid not null,
  gmail text not null,
  secret text not null,
  updated_at timestamp with time zone default now() not null,
  updated_by uuid,
  CONSTRAINT kurum_mail_accounts_kurum_id_fkey FOREIGN KEY (kurum_id) REFERENCES kurumlar(id) ON DELETE CASCADE,
  CONSTRAINT kurum_mail_accounts_pkey PRIMARY KEY (kurum_id)
);
ALTER TABLE public.kurum_mail_accounts ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.kurumlar (
  id uuid default gen_random_uuid() not null,
  name text not null,
  modules jsonb default '{"etut": true, "grades": true, "archive": true, "homework": true, "messages": true, "questions": true, "manage_students": true, "manage_teachers": true}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  roles_enabled boolean default true not null,
  role_settings jsonb default '{}'::jsonb not null,
  logo text,
  kayit_kodu text,
  kayit_acik boolean default true not null,
  grant_cred boolean default false not null,
  grant_move boolean default false not null,
  CONSTRAINT kurumlar_logo_chk CHECK (((logo IS NULL) OR ((length(logo) <= 400000) AND (logo ~ '^data:image/(png|jpeg);base64,[A-Za-z0-9+/=]+$'::text)))),
  CONSTRAINT kurumlar_name_check CHECK (((length(btrim(name)) >= 2) AND (length(btrim(name)) <= 120))),
  CONSTRAINT kurumlar_pkey PRIMARY KEY (id)
);
ALTER TABLE public.kurumlar ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX kurumlar_kayit_kodu_key ON public.kurumlar USING btree (kayit_kodu) WHERE (kayit_kodu IS NOT NULL);

CREATE TABLE public.mail_log (
  id bigint default nextval('mail_log_id_seq'::regclass) not null,
  created_at timestamp with time zone default now() not null,
  sender_auth_id uuid,
  sender_name text,
  via text,
  event text not null,
  ref_id text,
  ref_title text,
  recipient text not null,
  recipient_name text,
  recipient_role text,
  subject text,
  status text not null,
  error text,
  CONSTRAINT mail_log_pkey PRIMARY KEY (id)
);
ALTER TABLE public.mail_log ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX mail_log_once_idx ON public.mail_log USING btree (event, ref_id, recipient) WHERE ((status = ANY (ARRAY['sent'::text, 'sending'::text])) AND (event = ANY (ARRAY['homework-created'::text, 'homework-reminder'::text, 'etut-created'::text, 'etut-scheduled'::text, 'question-target'::text, 'plan-report'::text])));
CREATE INDEX mail_log_sender_idx ON public.mail_log USING btree (sender_auth_id, created_at DESC);

CREATE TABLE public.messages (
  id text not null,
  student_id text not null,
  student_name text not null,
  student_class text not null,
  student_avatar text,
  subject text not null,
  text text not null,
  link_url text,
  teacher_reply text,
  read boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  replied_at timestamp with time zone,
  kind text,
  sender_id text,
  sender_name text,
  group_id text,
  to_teacher_id text,
  to_teacher_name text,
  replied_by_id text,
  replied_by_name text,
  updated_at timestamp with time zone default now() not null,
  CONSTRAINT messages_pkey PRIMARY KEY (id)
);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx88_messages_student ON public.messages USING btree (student_id);
CREATE INDEX messages_group_id_idx ON public.messages USING btree (group_id);
CREATE INDEX idx88_messages_updated_at ON public.messages USING btree (updated_at);
CREATE INDEX idx88_messages_group ON public.messages USING btree (group_id);

CREATE TABLE public.notification_policy (
  id text default 'default'::text not null,
  policy jsonb default '{}'::jsonb not null,
  updated_at timestamp with time zone default now() not null,
  updated_by text,
  CONSTRAINT notification_policy_pkey PRIMARY KEY (id),
  CONSTRAINT notification_policy_shape CHECK (((id = 'default'::text) AND (jsonb_typeof(policy) = 'object'::text) AND (octet_length((policy)::text) <= 20000)))
);
ALTER TABLE public.notification_policy ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.ogrenci_bolum_ayar (
  id text not null,
  kurum_id text,
  class_id text,
  sections jsonb default '{}'::jsonb not null,
  updated_at timestamp with time zone default now() not null,
  updated_by uuid,
  CONSTRAINT ogrenci_bolum_ayar_pkey PRIMARY KEY (id)
);
ALTER TABLE public.ogrenci_bolum_ayar ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.push_log (
  key text not null,
  created_at timestamp with time zone default now() not null,
  CONSTRAINT push_log_pkey PRIMARY KEY (key)
);
ALTER TABLE public.push_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX push_log_created_idx ON public.push_log USING btree (created_at);

CREATE TABLE public.push_subscriptions (
  endpoint text not null,
  user_id uuid not null,
  role text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  CONSTRAINT push_subscriptions_pkey PRIMARY KEY (endpoint),
  CONSTRAINT push_subscriptions_role_check CHECK ((role = ANY (ARRAY['student'::text, 'teacher'::text]))),
  CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE INDEX push_subscriptions_user_idx ON public.push_subscriptions USING btree (user_id);

CREATE TABLE public.question_logs (
  id text not null,
  student_id text not null,
  student_name text not null,
  class_id text not null,
  class_name text not null,
  date text not null,
  entries jsonb default '[]'::jsonb not null,
  total_questions integer default 0 not null,
  total_correct integer default 0,
  total_wrong integer default 0,
  total_empty integer default 0,
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  CONSTRAINT question_logs_pkey PRIMARY KEY (id)
);
ALTER TABLE public.question_logs ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX uq_question_logs_student_date ON public.question_logs USING btree (student_id, date);
CREATE INDEX idx88_qlogs_student_date ON public.question_logs USING btree (student_id, date);
CREATE INDEX idx88_qlogs_date ON public.question_logs USING btree (date);

CREATE TABLE public.question_targets (
  id text not null,
  target_type text default 'student'::text not null,
  student_id text,
  class_id text,
  week_start_date text,
  data jsonb default '{}'::jsonb not null,
  created_by uuid default auth.uid(),
  updated_at timestamp with time zone default now() not null,
  CONSTRAINT question_targets_pkey PRIMARY KEY (id),
  CONSTRAINT question_targets_type_check CHECK ((target_type = ANY (ARRAY['student'::text, 'class'::text])))
);
ALTER TABLE public.question_targets ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_question_targets_class ON public.question_targets USING btree (class_id);
CREATE INDEX idx_question_targets_student ON public.question_targets USING btree (student_id);

CREATE TABLE public.sms_log (
  id bigint default nextval('sms_log_id_seq'::regclass) not null,
  created_at timestamp with time zone default now() not null,
  dedupe_key text not null,
  event text not null,
  ref_id text,
  recipient_role text,
  phone_masked text,
  status text default 'dry'::text not null,
  provider text,
  provider_id text,
  error text,
  hidden_at timestamp with time zone,
  CONSTRAINT sms_log_pkey PRIMARY KEY (id),
  CONSTRAINT sms_log_status_chk CHECK ((status = ANY (ARRAY['dry'::text, 'sending'::text, 'sent'::text, 'failed'::text])))
);
ALTER TABLE public.sms_log ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX sms_log_dedupe_key_uq ON public.sms_log USING btree (dedupe_key);
CREATE INDEX sms_log_created_idx ON public.sms_log USING btree (created_at DESC);

CREATE TABLE public.student_applications (
  id uuid default gen_random_uuid() not null,
  name text not null,
  student_number text not null,
  class_id text,
  requested_class text,
  email text,
  phone text,
  avatar text,
  auth_user_id uuid,
  status text default 'pending'::text not null,
  reject_reason text,
  ip_hash text,
  student_id text,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  kurum_id uuid,
  CONSTRAINT student_applications_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT student_applications_kurum_id_fkey FOREIGN KEY (kurum_id) REFERENCES kurumlar(id) ON DELETE SET NULL,
  CONSTRAINT student_applications_pkey PRIMARY KEY (id),
  CONSTRAINT student_applications_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);
ALTER TABLE public.student_applications ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_student_applications_ip ON public.student_applications USING btree (ip_hash, created_at);
CREATE INDEX idx_student_applications_status ON public.student_applications USING btree (status, created_at DESC);
CREATE INDEX idx_student_applications_number ON public.student_applications USING btree (student_number);
CREATE INDEX student_applications_kurum_status_idx ON public.student_applications USING btree (kurum_id, status);

CREATE TABLE public.student_books (
  id text not null,
  student_id text not null,
  title text not null,
  subject text,
  created_by uuid default auth.uid(),
  created_at timestamp with time zone default now() not null,
  CONSTRAINT student_books_pkey PRIMARY KEY (id),
  CONSTRAINT student_books_subject_check CHECK (((subject IS NULL) OR (length(subject) <= 60))),
  CONSTRAINT student_books_title_check CHECK (((length(btrim(title)) >= 1) AND (length(btrim(title)) <= 160)))
);
ALTER TABLE public.student_books ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX student_books_unique_idx ON public.student_books USING btree (student_id, lower(btrim(title)), COALESCE(subject, ''::text));
CREATE INDEX student_books_student_idx ON public.student_books USING btree (student_id);

CREATE TABLE public.student_contact_settings (
  id boolean default true not null,
  legacy_cleared boolean default false not null,
  cleared_at timestamp with time zone,
  CONSTRAINT student_contact_settings_id_check CHECK (id),
  CONSTRAINT student_contact_settings_pkey PRIMARY KEY (id)
);
ALTER TABLE public.student_contact_settings ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.student_contacts (
  id text not null,
  email text,
  phone text,
  parents jsonb default '[]'::jsonb not null,
  updated_at timestamp with time zone default now() not null,
  CONSTRAINT student_contacts_pkey PRIMARY KEY (id),
  CONSTRAINT student_contacts_student_fk FOREIGN KEY (id) REFERENCES students(id) ON UPDATE CASCADE ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);
ALTER TABLE public.student_contacts ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx193_student_contacts_updated_at ON public.student_contacts USING btree (updated_at);

CREATE TABLE public.student_notifications (
  id text not null,
  student_id text not null,
  type text default 'general'::text not null,
  title text not null,
  message text default ''::text not null,
  source_id text,
  source_title text,
  teacher_name text,
  link_tab text,
  created_by uuid default auth.uid(),
  created_at timestamp with time zone default now() not null,
  read_at timestamp with time zone,
  CONSTRAINT student_notifications_id_check CHECK (((char_length(id) >= 1) AND (char_length(id) <= 120))),
  CONSTRAINT student_notifications_link_tab_check CHECK (((link_tab IS NULL) OR (link_tab = ANY (ARRAY['home'::text, 'homework'::text, 'etuts'::text, 'grades'::text, 'messages'::text, 'questions'::text])))),
  CONSTRAINT student_notifications_message_check CHECK ((char_length(message) <= 2000)),
  CONSTRAINT student_notifications_pkey PRIMARY KEY (id),
  CONSTRAINT student_notifications_source_id_check CHECK (((source_id IS NULL) OR (char_length(source_id) <= 200))),
  CONSTRAINT student_notifications_source_title_check CHECK (((source_title IS NULL) OR (char_length(source_title) <= 300))),
  CONSTRAINT student_notifications_student_id_check CHECK (((char_length(student_id) >= 1) AND (char_length(student_id) <= 120))),
  CONSTRAINT student_notifications_teacher_name_check CHECK (((teacher_name IS NULL) OR (char_length(teacher_name) <= 120))),
  CONSTRAINT student_notifications_title_check CHECK (((char_length(title) >= 1) AND (char_length(title) <= 200))),
  CONSTRAINT student_notifications_type_check CHECK ((type = ANY (ARRAY['new_homework'::text, 'new_etut'::text, 'grade_added'::text, 'general'::text, 'praise'::text])))
);
ALTER TABLE public.student_notifications ENABLE ROW LEVEL SECURITY;
CREATE INDEX student_notifications_student_idx ON public.student_notifications USING btree (student_id, created_at DESC);
CREATE INDEX student_notifications_creator_idx ON public.student_notifications USING btree (created_by, created_at DESC);

CREATE TABLE public.student_sync_ping (
  student_id text not null,
  changed_at timestamp with time zone default now() not null,
  CONSTRAINT student_sync_ping_pkey PRIMARY KEY (student_id)
);
ALTER TABLE public.student_sync_ping ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.students (
  id text not null,
  name text not null,
  student_number text not null,
  class_id text not null,
  class_name text not null,
  email text,
  phone text,
  avatar text,
  registered_at timestamp with time zone default timezone('utc'::text, now()),
  auth_user_id uuid,
  status text default 'active'::text not null,
  kurum_id uuid,
  tc_hash text,
  parents jsonb default '[]'::jsonb not null,
  gender text,
  updated_at timestamp with time zone default now() not null,
  CONSTRAINT students_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL NOT VALID,
  CONSTRAINT students_auth_user_id_key UNIQUE (auth_user_id),
  CONSTRAINT students_gender_chk CHECK (((gender IS NULL) OR (gender = ANY (ARRAY['K'::text, 'E'::text])))),
  CONSTRAINT students_kurum_id_fkey FOREIGN KEY (kurum_id) REFERENCES kurumlar(id) ON DELETE SET NULL,
  CONSTRAINT students_parents_shape CHECK (((jsonb_typeof(parents) = 'array'::text) AND (jsonb_array_length(parents) <= 3) AND (octet_length((parents)::text) <= 4000))),
  CONSTRAINT students_pkey PRIMARY KEY (id)
);
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
CREATE INDEX students_tc_hash_idx ON public.students USING btree (tc_hash) WHERE (tc_hash IS NOT NULL);
CREATE INDEX students_kurum_idx ON public.students USING btree (kurum_id);
CREATE INDEX students_class_idx ON public.students USING btree (class_id);
CREATE INDEX idx193_students_updated_at ON public.students USING btree (updated_at);

CREATE TABLE public.study_plan_groups (
  id text not null,
  week_start text not null,
  kind text not null,
  class_id text,
  label text,
  teacher_id text,
  teacher_auth_id uuid,
  teacher_name text,
  mail_students boolean default false not null,
  report_sent_at timestamp with time zone,
  report_attempts integer default 0 not null,
  created_at timestamp with time zone default now() not null,
  CONSTRAINT study_plan_groups_kind_check CHECK ((kind = ANY (ARRAY['student'::text, 'students'::text, 'class'::text]))),
  CONSTRAINT study_plan_groups_label_check CHECK (((label IS NULL) OR (length(label) <= 160))),
  CONSTRAINT study_plan_groups_pkey PRIMARY KEY (id),
  CONSTRAINT study_plan_groups_teacher_name_check CHECK (((teacher_name IS NULL) OR (length(teacher_name) <= 120))),
  CONSTRAINT study_plan_groups_week_start_check CHECK ((week_start ~ '^\d{4}-\d{2}-\d{2}$'::text))
);
ALTER TABLE public.study_plan_groups ENABLE ROW LEVEL SECURITY;
CREATE INDEX study_plan_groups_pending_idx ON public.study_plan_groups USING btree (week_start) WHERE ((report_sent_at IS NULL) AND mail_students);

CREATE TABLE public.study_plan_items (
  id text not null,
  plan_id text not null,
  student_id text not null,
  week_start text not null,
  day smallint not null,
  subject text not null,
  book text,
  note text,
  "position" integer default 0 not null,
  created_by uuid default auth.uid(),
  created_by_name text,
  done_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  question_count integer,
  sent_at timestamp with time zone,
  group_id text,
  mailed_at timestamp with time zone,
  CONSTRAINT study_plan_items_book_check CHECK (((book IS NULL) OR (length(book) <= 160))),
  CONSTRAINT study_plan_items_created_by_name_check CHECK (((created_by_name IS NULL) OR (length(created_by_name) <= 120))),
  CONSTRAINT study_plan_items_day_check CHECK (((day >= 0) AND (day <= 6))),
  CONSTRAINT study_plan_items_note_check CHECK (((note IS NULL) OR (length(note) <= 1000))),
  CONSTRAINT study_plan_items_pkey PRIMARY KEY (id),
  CONSTRAINT study_plan_items_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES study_plans(id) ON DELETE CASCADE,
  CONSTRAINT study_plan_items_question_count_chk CHECK (((question_count IS NULL) OR ((question_count >= 0) AND (question_count <= 2000)))),
  CONSTRAINT study_plan_items_subject_check CHECK (((length(btrim(subject)) >= 1) AND (length(btrim(subject)) <= 60)))
);
ALTER TABLE public.study_plan_items ENABLE ROW LEVEL SECURITY;
CREATE INDEX study_plan_items_plan_idx ON public.study_plan_items USING btree (plan_id);
CREATE INDEX idx164_spi_plan_sent ON public.study_plan_items USING btree (plan_id) WHERE (sent_at IS NOT NULL);
CREATE INDEX study_plan_items_created_by_idx ON public.study_plan_items USING btree (created_by);
CREATE INDEX study_plan_items_student_week_idx ON public.study_plan_items USING btree (student_id, week_start);
CREATE INDEX idx88_plan_items_student_week ON public.study_plan_items USING btree (student_id, week_start);
CREATE INDEX idx164_spi_group ON public.study_plan_items USING btree (group_id) WHERE (group_id IS NOT NULL);

CREATE TABLE public.study_plans (
  id text not null,
  student_id text not null,
  week_start text not null,
  sent_at timestamp with time zone,
  sent_by_name text,
  created_by uuid default auth.uid(),
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  group_id text,
  mailed_at timestamp with time zone,
  week_start_day smallint default 1 not null,
  CONSTRAINT study_plans_pkey PRIMARY KEY (id),
  CONSTRAINT study_plans_sent_by_name_check CHECK (((sent_by_name IS NULL) OR (length(sent_by_name) <= 120))),
  CONSTRAINT study_plans_week_start_check CHECK ((week_start ~ '^\d{4}-\d{2}-\d{2}$'::text)),
  CONSTRAINT study_plans_week_start_day_chk CHECK (((week_start_day >= 0) AND (week_start_day <= 6)))
);
ALTER TABLE public.study_plans ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX study_plans_student_week_idx ON public.study_plans USING btree (student_id, week_start);
CREATE INDEX idx88_plans_student_week ON public.study_plans USING btree (student_id, week_start);
CREATE INDEX study_plans_group_idx ON public.study_plans USING btree (group_id);

CREATE TABLE public.teacher_class_access (
  id uuid default gen_random_uuid() not null,
  teacher_auth_id uuid not null,
  class_id text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  via_grade boolean default false not null,
  CONSTRAINT teacher_class_access_pkey PRIMARY KEY (id),
  CONSTRAINT teacher_class_access_teacher_auth_id_class_id_key UNIQUE (teacher_auth_id, class_id),
  CONSTRAINT teacher_class_access_teacher_auth_id_fkey FOREIGN KEY (teacher_auth_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE public.teacher_class_access ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_teacher_class_access_cid ON public.teacher_class_access USING btree (class_id);
CREATE INDEX idx_teacher_class_access_via_grade ON public.teacher_class_access USING btree (teacher_auth_id) WHERE via_grade;
CREATE INDEX idx_teacher_class_access_tid ON public.teacher_class_access USING btree (teacher_auth_id);

CREATE TABLE public.teacher_contacts (
  teacher_id text not null,
  phone text,
  birth_date date,
  updated_by uuid,
  updated_at timestamp with time zone default now() not null,
  CONSTRAINT teacher_contacts_birth_date_check CHECK (((birth_date IS NULL) OR ((birth_date >= '1920-01-01'::date) AND (birth_date <= '2100-01-01'::date)))),
  CONSTRAINT teacher_contacts_phone_check CHECK (((phone IS NULL) OR (phone ~ '^0[2-5][0-9]{9}$'::text))),
  CONSTRAINT teacher_contacts_pkey PRIMARY KEY (teacher_id),
  CONSTRAINT teacher_contacts_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
);
ALTER TABLE public.teacher_contacts ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.teacher_documents (
  id text default ('doc-'::text || (gen_random_uuid())::text) not null,
  title text not null,
  description text,
  category text default 'other'::text not null,
  file_format text default 'pdf'::text not null,
  file_name text default ''::text not null,
  file_size text,
  storage_path text,
  legacy_file_data text,
  subject text default 'Genel'::text not null,
  school_type text,
  grade_level text,
  academic_year text,
  tags jsonb default '[]'::jsonb not null,
  author_name text,
  uploaded_by text,
  owner_auth_id uuid default auth.uid(),
  html_preview text,
  table_sheets jsonb,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  CONSTRAINT teacher_documents_pkey PRIMARY KEY (id)
);
ALTER TABLE public.teacher_documents ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_teacher_documents_owner ON public.teacher_documents USING btree (owner_auth_id);
CREATE INDEX idx_teacher_documents_subject ON public.teacher_documents USING btree (subject);

CREATE TABLE public.teacher_grade_access (
  teacher_auth_id uuid not null,
  kurum_id uuid,
  grades integer[] default '{}'::integer[] not null,
  all_grades boolean default false not null,
  updated_by uuid,
  updated_at timestamp with time zone default now() not null,
  CONSTRAINT teacher_grade_access_pkey PRIMARY KEY (teacher_auth_id),
  CONSTRAINT teacher_grade_access_teacher_auth_id_fkey FOREIGN KEY (teacher_auth_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE public.teacher_grade_access ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_teacher_grade_access_kurum ON public.teacher_grade_access USING btree (kurum_id);

CREATE TABLE public.teacher_mail_accounts (
  teacher_auth_id uuid not null,
  gmail text not null,
  secret text not null,
  updated_at timestamp with time zone default now() not null,
  CONSTRAINT teacher_mail_accounts_pkey PRIMARY KEY (teacher_auth_id)
);
ALTER TABLE public.teacher_mail_accounts ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.teacher_role_log (
  id bigint default nextval('teacher_role_log_id_seq'::regclass) not null,
  created_at timestamp with time zone default now() not null,
  teacher_id text not null,
  teacher_name text,
  kurum_id uuid,
  added text[] default '{}'::text[] not null,
  removed text[] default '{}'::text[] not null,
  actor_auth_id uuid,
  actor_name text,
  CONSTRAINT teacher_role_log_pkey PRIMARY KEY (id)
);
ALTER TABLE public.teacher_role_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX teacher_role_log_kurum_idx ON public.teacher_role_log USING btree (kurum_id, created_at DESC);

CREATE TABLE public.teacher_roles (
  teacher_id text not null,
  role text not null,
  kurum_id uuid,
  granted_by uuid,
  granted_by_name text,
  granted_at timestamp with time zone default now() not null,
  CONSTRAINT teacher_roles_pkey PRIMARY KEY (teacher_id, role),
  CONSTRAINT teacher_roles_role_chk CHECK ((role = ANY (ARRAY['mudur'::text, 'mudur_yardimcisi'::text, 'rehberlik'::text, 'olcme_degerlendirme'::text, 'zumre_baskani'::text, 'ogretmen'::text, 'etut_ogretmeni'::text]))),
  CONSTRAINT teacher_roles_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
);
ALTER TABLE public.teacher_roles ENABLE ROW LEVEL SECURITY;
CREATE INDEX teacher_roles_kurum_idx ON public.teacher_roles USING btree (kurum_id);

CREATE TABLE public.teacher_section_access (
  teacher_id text not null,
  allow_sections text[] default '{}'::text[] not null,
  deny_sections text[] default '{}'::text[] not null,
  updated_by uuid,
  updated_by_name text,
  updated_at timestamp with time zone default now() not null,
  CONSTRAINT teacher_section_access_pkey PRIMARY KEY (teacher_id),
  CONSTRAINT teacher_section_access_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
);
ALTER TABLE public.teacher_section_access ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.teacher_student_access (
  id uuid default gen_random_uuid() not null,
  teacher_auth_id uuid not null,
  student_id text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  CONSTRAINT teacher_student_access_pkey PRIMARY KEY (id),
  CONSTRAINT teacher_student_access_teacher_auth_id_fkey FOREIGN KEY (teacher_auth_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT teacher_student_access_teacher_auth_id_student_id_key UNIQUE (teacher_auth_id, student_id)
);
ALTER TABLE public.teacher_student_access ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_teacher_student_access_tid ON public.teacher_student_access USING btree (teacher_auth_id);
CREATE INDEX idx_teacher_student_access_sid ON public.teacher_student_access USING btree (student_id);

CREATE TABLE public.teachers (
  id text not null,
  name text not null,
  username text,
  email text,
  branch text,
  avatar text,
  role text default 'teacher'::text,
  status text default 'approved'::text,
  is_admin boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  auth_user_id uuid,
  kurum_id uuid,
  gender text,
  updated_at timestamp with time zone default now() not null,
  CONSTRAINT teachers_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL NOT VALID,
  CONSTRAINT teachers_auth_user_id_key UNIQUE (auth_user_id),
  CONSTRAINT teachers_gender_chk CHECK (((gender IS NULL) OR (gender = ANY (ARRAY['K'::text, 'E'::text])))),
  CONSTRAINT teachers_kurum_id_fkey FOREIGN KEY (kurum_id) REFERENCES kurumlar(id) ON DELETE SET NULL,
  CONSTRAINT teachers_pkey PRIMARY KEY (id)
);
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
CREATE INDEX teachers_kurum_idx ON public.teachers USING btree (kurum_id);
CREATE INDEX idx193_teachers_updated_at ON public.teachers USING btree (updated_at);

CREATE TABLE public.user_seen (
  user_id uuid default auth.uid() not null,
  scope text not null,
  item_id text not null,
  seen_at timestamp with time zone default now() not null,
  CONSTRAINT user_seen_item_id_check CHECK (((char_length(item_id) >= 1) AND (char_length(item_id) <= 300))),
  CONSTRAINT user_seen_pkey PRIMARY KEY (user_id, scope, item_id),
  CONSTRAINT user_seen_scope_check CHECK (((char_length(scope) >= 1) AND (char_length(scope) <= 120)))
);
ALTER TABLE public.user_seen ENABLE ROW LEVEL SECURITY;
CREATE INDEX user_seen_scope_idx ON public.user_seen USING btree (user_id, scope, seen_at DESC);

-- 2) KURALLAR (RLS) VE TETİKLER

CREATE POLICY "attendance_admin_all" ON public.attendance AS PERMISSIVE FOR ALL TO authenticated
  USING (( SELECT is_admin() AS is_admin))
  WITH CHECK (( SELECT is_admin() AS is_admin));
CREATE POLICY "attendance_kurum_world" ON public.attendance AS RESTRICTIVE FOR ALL TO authenticated
  USING ((( SELECT rls_world_all() AS rls_world_all) OR ((created_by IS NULL) AND (( SELECT my_kurum_id() AS my_kurum_id) IS NULL)) OR (created_by = ( SELECT auth.uid() AS uid)) OR (created_by IN ( SELECT rls_kurum_teacher_auth_ids() AS rls_kurum_teacher_auth_ids))))
  WITH CHECK (record_world_ok(created_by));
CREATE POLICY "attendance_teacher_delete" ON public.attendance AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT is_teacher() AS is_teacher) AND teacher_has_class_access(class_id) AND role_record_editable(created_by)));
CREATE POLICY "attendance_teacher_insert" ON public.attendance AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT is_teacher() AS is_teacher) AND ( SELECT kurum_can('grades'::text) AS kurum_can) AND ( SELECT section_allowed('grades'::text) AS section_allowed) AND teacher_has_class_access(class_id)));
CREATE POLICY "attendance_teacher_select" ON public.attendance AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT is_teacher() AS is_teacher) AND (class_id IN ( SELECT my_class_ids() AS my_class_ids)) AND role_record_visible(created_by)));
CREATE POLICY "attendance_teacher_update" ON public.attendance AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT is_teacher() AS is_teacher) AND teacher_has_class_access(class_id) AND role_record_editable(created_by)))
  WITH CHECK ((( SELECT is_teacher() AS is_teacher) AND ( SELECT kurum_can('grades'::text) AS kurum_can) AND teacher_has_class_access(class_id)));
CREATE POLICY "hm_kendi_alan" ON public.attendance AS RESTRICTIVE FOR SELECT TO authenticated
  USING (((NOT ( SELECT is_head_admin() AS is_head_admin)) OR ((created_by IN ( SELECT hm_auth_ids() AS hm_auth_ids)) OR ((created_by IS NULL) AND (class_id IN ( SELECT hm_class_ids() AS hm_class_ids))))));
CREATE TRIGGER trg_attendance_keep_owner BEFORE INSERT OR UPDATE ON public.attendance FOR EACH ROW EXECUTE FUNCTION keep_row_owner();
CREATE TRIGGER trg_zz_ping_students AFTER INSERT OR DELETE OR UPDATE ON public.attendance FOR EACH ROW EXECUTE FUNCTION bilir_ping_attendance();
CREATE TRIGGER trg_zz_touch_updated_at BEFORE INSERT OR UPDATE ON public.attendance FOR EACH ROW EXECUTE FUNCTION bilir_touch_updated_at();
CREATE POLICY "backup_log_admin_insert" ON public.backup_log AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (( SELECT is_admin() AS is_admin));
CREATE POLICY "backup_log_admin_select" ON public.backup_log AS PERMISSIVE FOR SELECT TO authenticated
  USING (( SELECT is_admin() AS is_admin));
CREATE POLICY "classes_admin_all" ON public.classes AS PERMISSIVE FOR ALL TO authenticated
  USING (( SELECT is_admin() AS is_admin))
  WITH CHECK (( SELECT is_admin() AS is_admin));
CREATE POLICY "classes_kurum_admin_delete" ON public.classes AS PERMISSIVE FOR DELETE TO authenticated
  USING (can_manage_class(id));
CREATE POLICY "classes_kurum_admin_insert" ON public.classes AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT is_kurum_admin() AS is_kurum_admin) AND ( SELECT kurum_can('manage_students'::text) AS kurum_can) AND (kurum_id = ( SELECT my_kurum_id() AS my_kurum_id))));
CREATE POLICY "classes_kurum_admin_update" ON public.classes AS PERMISSIVE FOR UPDATE TO authenticated
  USING (can_manage_class(id))
  WITH CHECK (can_manage_class(id));
CREATE POLICY "classes_kurum_select" ON public.classes AS PERMISSIVE FOR SELECT TO authenticated
  USING (((kurum_id IS NOT NULL) AND (kurum_id = ( SELECT my_admin_kurum_id() AS my_admin_kurum_id))));
CREATE POLICY "classes_student_select" ON public.classes AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT is_student() AS is_student) AND (EXISTS ( SELECT 1;
CREATE POLICY "classes_teacher_select" ON public.classes AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT is_teacher() AS is_teacher) AND (id IN ( SELECT my_class_ids() AS my_class_ids))));
CREATE POLICY "hm_kendi_alan" ON public.classes AS RESTRICTIVE FOR SELECT TO authenticated
  USING (((NOT ( SELECT is_head_admin() AS is_head_admin)) OR (kurum_id IS NULL)));
CREATE TRIGGER trg_set_class_kurum BEFORE INSERT OR UPDATE ON public.classes FOR EACH ROW EXECUTE FUNCTION set_class_kurum();
CREATE TRIGGER trg_tga_class_insert AFTER INSERT ON public.classes FOR EACH ROW EXECUTE FUNCTION tga_class_changed();
CREATE TRIGGER trg_tga_class_update AFTER UPDATE OF level, kurum_id ON public.classes FOR EACH ROW WHEN (((old.level IS DISTINCT FROM new.level) OR (old.kurum_id IS DISTINCT FROM new.kurum_id))) EXECUTE FUNCTION tga_class_changed();
CREATE TRIGGER trg_zz_touch_updated_at BEFORE INSERT OR UPDATE ON public.classes FOR EACH ROW EXECUTE FUNCTION bilir_touch_updated_at();
CREATE POLICY "deleted_records_admin_delete" ON public.deleted_records AS PERMISSIVE FOR DELETE TO authenticated
  USING (( SELECT is_admin() AS is_admin));
CREATE POLICY "deleted_records_staff_insert" ON public.deleted_records AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((( SELECT is_teacher() AS is_teacher) OR ( SELECT is_admin() AS is_admin)) AND (id = ((kind || ':'::text) || record_id)) AND tombstone_ok(kind, record_id)));
CREATE POLICY "deleted_records_staff_select" ON public.deleted_records AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT is_admin() AS is_admin) OR (( SELECT is_teacher() AS is_teacher) AND ((deleted_by = ( SELECT auth.uid() AS uid)) OR (deleted_by IN ( SELECT rls_kurum_teacher_auth_ids() AS rls_kurum_teacher_auth_ids)) OR ((deleted_by IS NULL) AND (( SELECT my_kurum_id() AS my_kurum_id) IS NULL))))));
CREATE POLICY "hm_kendi_alan" ON public.deleted_records AS RESTRICTIVE FOR SELECT TO authenticated
  USING (((NOT ( SELECT is_head_admin() AS is_head_admin)) OR ((deleted_by IS NULL) OR (deleted_by IN ( SELECT hm_auth_ids() AS hm_auth_ids)))));
CREATE TRIGGER trg_zz_touch_updated_at BEFORE INSERT OR UPDATE ON public.deleted_records FOR EACH ROW EXECUTE FUNCTION bilir_touch_updated_at();
CREATE POLICY "da_manage" ON public.deneme_aliases AS PERMISSIVE FOR ALL TO authenticated
  USING ((deneme_in_scope(kurum_id) OR (( SELECT is_head_admin() AS is_head_admin) AND (kurum_id IS NULL))))
  WITH CHECK (((( SELECT is_head_admin() AS is_head_admin) AND (kurum_id IS NULL)) OR ((kurum_id IS NOT NULL) AND deneme_in_scope(kurum_id))));
CREATE POLICY "hm_kendi_alan" ON public.deneme_aliases AS RESTRICTIVE FOR SELECT TO authenticated
  USING (((NOT ( SELECT is_head_admin() AS is_head_admin)) OR (kurum_id IS NULL)));
CREATE POLICY "de_manage" ON public.deneme_exams AS PERMISSIVE FOR ALL TO authenticated
  USING ((deneme_in_scope(kurum_id) OR (( SELECT is_head_admin() AS is_head_admin) AND (kurum_id IS NULL))))
  WITH CHECK (((( SELECT is_head_admin() AS is_head_admin) AND (kurum_id IS NULL)) OR ((kurum_id IS NOT NULL) AND deneme_in_scope(kurum_id))));
CREATE POLICY "de_role_select" ON public.deneme_exams AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT deneme_can_read() AS deneme_can_read) AND (kurum_id IS NOT NULL) AND (kurum_id = (( SELECT my_kurum_id() AS my_kurum_id))::text)));
CREATE POLICY "de_student_select" ON public.deneme_exams AS PERMISSIVE FOR SELECT TO authenticated
  USING ((published AND ( SELECT is_student() AS is_student) AND deneme_i_have_result(id)));
CREATE POLICY "df_select" ON public.deneme_formats AS PERMISSIVE FOR SELECT TO authenticated
  USING (((( SELECT is_head_admin() AS is_head_admin) AND (kurum_id IS NULL)) OR ((kurum_id IS NOT NULL) AND deneme_in_scope(kurum_id))));
CREATE POLICY "df_write" ON public.deneme_formats AS PERMISSIVE FOR ALL TO authenticated
  USING ((deneme_in_scope(kurum_id) OR (( SELECT is_head_admin() AS is_head_admin) AND (kurum_id IS NULL))))
  WITH CHECK (((( SELECT is_head_admin() AS is_head_admin) AND (kurum_id IS NULL)) OR ((kurum_id IS NOT NULL) AND deneme_in_scope(kurum_id))));
CREATE POLICY "hm_kendi_alan" ON public.deneme_formats AS RESTRICTIVE FOR SELECT TO authenticated
  USING (((NOT ( SELECT is_head_admin() AS is_head_admin)) OR (kurum_id IS NULL)));
CREATE POLICY "dke_delete" ON public.deneme_kazanim_eslesme AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT is_teacher() AS is_teacher) AND (NOT (kurum_id IS DISTINCT FROM ( SELECT my_kurum_id() AS my_kurum_id)))));
CREATE POLICY "dke_insert" ON public.deneme_kazanim_eslesme AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT is_teacher() AS is_teacher) AND (NOT (kurum_id IS DISTINCT FROM ( SELECT my_kurum_id() AS my_kurum_id)))));
CREATE POLICY "dke_select" ON public.deneme_kazanim_eslesme AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT is_teacher() AS is_teacher) AND (NOT (kurum_id IS DISTINCT FROM ( SELECT my_kurum_id() AS my_kurum_id)))));
CREATE POLICY "dke_update" ON public.deneme_kazanim_eslesme AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT is_teacher() AS is_teacher) AND (NOT (kurum_id IS DISTINCT FROM ( SELECT my_kurum_id() AS my_kurum_id)))))
  WITH CHECK ((( SELECT is_teacher() AS is_teacher) AND (NOT (kurum_id IS DISTINCT FROM ( SELECT my_kurum_id() AS my_kurum_id)))));
CREATE POLICY "dk_head_delete" ON public.deneme_kazanimlar AS PERMISSIVE FOR DELETE TO authenticated
  USING (( SELECT is_head_admin() AS is_head_admin));
CREATE POLICY "dk_head_update" ON public.deneme_kazanimlar AS PERMISSIVE FOR UPDATE TO authenticated
  USING (( SELECT is_head_admin() AS is_head_admin))
  WITH CHECK (( SELECT is_head_admin() AS is_head_admin));
CREATE POLICY "dk_insert" ON public.deneme_kazanimlar AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (( SELECT deneme_can_manage() AS deneme_can_manage));
CREATE POLICY "dk_select" ON public.deneme_kazanimlar AS PERMISSIVE FOR SELECT TO authenticated
  USING (( SELECT deneme_can_manage() AS deneme_can_manage));
CREATE POLICY "dr_manage" ON public.deneme_results AS PERMISSIVE FOR ALL TO authenticated
  USING ((exam_id IN ( SELECT rls_deneme_scope_exam_ids() AS rls_deneme_scope_exam_ids)))
  WITH CHECK (deneme_exam_in_scope(exam_id));
CREATE POLICY "dr_role_select" ON public.deneme_results AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT deneme_can_read() AS deneme_can_read) AND (EXISTS ( SELECT 1;
CREATE POLICY "dr_student_select" ON public.deneme_results AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT is_student() AS is_student) AND (student_id = ( SELECT deneme_my_student_id() AS deneme_my_student_id)) AND (exam_id IN ( SELECT rls_deneme_published_exam_ids() AS rls_deneme_published_exam_ids))));
CREATE POLICY "dt_manage" ON public.deneme_targets AS PERMISSIVE FOR ALL TO authenticated
  USING ((( SELECT is_head_admin() AS is_head_admin) OR (( SELECT deneme_can_manage() AS deneme_can_manage) AND (student_id IN ( SELECT my_student_ids() AS my_student_ids)))))
  WITH CHECK ((( SELECT is_head_admin() AS is_head_admin) OR (( SELECT deneme_can_manage() AS deneme_can_manage) AND (student_id IN ( SELECT my_student_ids() AS my_student_ids)))));
CREATE POLICY "dt_student_select" ON public.deneme_targets AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT is_student() AS is_student) AND (student_id = ( SELECT deneme_my_student_id() AS deneme_my_student_id))));
CREATE POLICY "hm_kendi_alan" ON public.deneme_targets AS RESTRICTIVE FOR SELECT TO authenticated
  USING (((NOT ( SELECT is_head_admin() AS is_head_admin)) OR (student_id IN ( SELECT hm_student_ids() AS hm_student_ids))));
CREATE POLICY "dyp_delete" ON public.deneme_yillik_plan AS PERMISSIVE FOR DELETE TO authenticated
  USING ((((kurum_id IS NULL) AND ( SELECT is_head_admin() AS is_head_admin)) OR ((kurum_id IS NOT NULL) AND (kurum_id = ( SELECT my_kurum_id() AS my_kurum_id)) AND ( SELECT is_teacher() AS is_teacher))));
CREATE POLICY "dyp_insert" ON public.deneme_yillik_plan AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((((kurum_id IS NULL) AND ( SELECT is_head_admin() AS is_head_admin)) OR ((kurum_id IS NOT NULL) AND (kurum_id = ( SELECT my_kurum_id() AS my_kurum_id)) AND ( SELECT is_teacher() AS is_teacher))));
CREATE POLICY "dyp_select" ON public.deneme_yillik_plan AS PERMISSIVE FOR SELECT TO authenticated
  USING (((( SELECT is_teacher() AS is_teacher) OR ( SELECT is_head_admin() AS is_head_admin)) AND ((kurum_id IS NULL) OR (kurum_id = ( SELECT my_kurum_id() AS my_kurum_id)))));
CREATE POLICY "dyp_update" ON public.deneme_yillik_plan AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((((kurum_id IS NULL) AND ( SELECT is_head_admin() AS is_head_admin)) OR ((kurum_id IS NOT NULL) AND (kurum_id = ( SELECT my_kurum_id() AS my_kurum_id)) AND ( SELECT is_teacher() AS is_teacher))))
  WITH CHECK ((((kurum_id IS NULL) AND ( SELECT is_head_admin() AS is_head_admin)) OR ((kurum_id IS NOT NULL) AND (kurum_id = ( SELECT my_kurum_id() AS my_kurum_id)) AND ( SELECT is_teacher() AS is_teacher))));
CREATE POLICY "etut_teachers_admin_all" ON public.etut_teachers AS PERMISSIVE FOR ALL TO authenticated
  USING (( SELECT is_admin() AS is_admin))
  WITH CHECK (( SELECT is_admin() AS is_admin));
CREATE POLICY "etut_teachers_kurum_admin_all" ON public.etut_teachers AS PERMISSIVE FOR ALL TO authenticated
  USING ((( SELECT is_kurum_admin() AS is_kurum_admin) AND (kurum_id = ( SELECT my_kurum_id() AS my_kurum_id))))
  WITH CHECK ((( SELECT is_kurum_admin() AS is_kurum_admin) AND (kurum_id = ( SELECT my_kurum_id() AS my_kurum_id)) AND ((teacher_id IS NULL) OR (EXISTS ( SELECT 1;
CREATE POLICY "hm_kendi_alan" ON public.etut_teachers AS RESTRICTIVE FOR SELECT TO authenticated
  USING (((NOT ( SELECT is_head_admin() AS is_head_admin)) OR (kurum_id IS NULL)));
CREATE TRIGGER trg_set_etut_teacher_kurum BEFORE INSERT OR UPDATE ON public.etut_teachers FOR EACH ROW EXECUTE FUNCTION set_etut_teacher_kurum();
CREATE TRIGGER trg_touch_etut_teacher BEFORE INSERT OR UPDATE ON public.etut_teachers FOR EACH ROW EXECUTE FUNCTION touch_etut_teacher();
CREATE POLICY "etut_yoklama_delete" ON public.etut_yoklama AS PERMISSIVE FOR DELETE TO authenticated
  USING (etut_yoklama_yazabilir(etut_id, student_id));
CREATE POLICY "etut_yoklama_insert" ON public.etut_yoklama AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (etut_yoklama_yazabilir(etut_id, student_id));
CREATE POLICY "etut_yoklama_select" ON public.etut_yoklama AS PERMISSIVE FOR SELECT TO authenticated
  USING ((etut_id IN ( SELECT e.id;
CREATE POLICY "etut_yoklama_update" ON public.etut_yoklama AS PERMISSIVE FOR UPDATE TO authenticated
  USING (etut_yoklama_yazabilir(etut_id, student_id))
  WITH CHECK (etut_yoklama_yazabilir(etut_id, student_id));
CREATE TRIGGER trg_etut_yoklama_once BEFORE INSERT OR UPDATE ON public.etut_yoklama FOR EACH ROW EXECUTE FUNCTION etut_yoklama_once();
CREATE TRIGGER trg_zz_etut_yoklama_ayna_del AFTER DELETE ON public.etut_yoklama REFERENCING OLD TABLE AS eski FOR EACH STATEMENT EXECUTE FUNCTION etut_yoklama_ayna();
CREATE TRIGGER trg_zz_etut_yoklama_ayna_ins AFTER INSERT ON public.etut_yoklama REFERENCING NEW TABLE AS yeni FOR EACH STATEMENT EXECUTE FUNCTION etut_yoklama_ayna();
CREATE TRIGGER trg_zz_etut_yoklama_ayna_upd AFTER UPDATE ON public.etut_yoklama REFERENCING NEW TABLE AS yeni FOR EACH STATEMENT EXECUTE FUNCTION etut_yoklama_ayna();
CREATE TRIGGER trg_zz_touch_updated_at BEFORE INSERT OR UPDATE ON public.etut_yoklama FOR EACH ROW EXECUTE FUNCTION bilir_touch_updated_at();
CREATE POLICY "etuts_admin_all" ON public.etuts AS PERMISSIVE FOR ALL TO authenticated
  USING (( SELECT is_admin() AS is_admin))
  WITH CHECK (( SELECT is_admin() AS is_admin));
CREATE POLICY "etuts_owner_select" ON public.etuts AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT is_teacher() AS is_teacher) AND etut_can_view(etut_teacher_id, etut_teacher_ids, notes)));
CREATE POLICY "etuts_teacher_delete" ON public.etuts AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT is_teacher() AS is_teacher) AND etut_owner_ok(etut_teacher_id, etut_teacher_ids, notes) AND (EXISTS ( SELECT 1;
CREATE POLICY "etuts_teacher_insert" ON public.etuts AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT is_teacher() AS is_teacher) AND ( SELECT kurum_can('etut'::text) AS kurum_can) AND (( SELECT role_can_teach() AS role_can_teach) OR ( SELECT section_explicit_allow('etuts'::text) AS section_explicit_allow) OR etut_idare_adina(etut_teacher_id, etut_teacher_ids)) AND ( SELECT section_allowed('etuts'::text) AS section_allowed) AND (NOT (EXISTS ( SELECT 1;
CREATE POLICY "etuts_teacher_update" ON public.etuts AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT is_teacher() AS is_teacher) AND etut_owner_ok(etut_teacher_id, etut_teacher_ids, notes) AND (EXISTS ( SELECT 1
  WITH CHECK ((( SELECT is_teacher() AS is_teacher) AND etut_owner_ok(etut_teacher_id, etut_teacher_ids, notes) AND (NOT (EXISTS ( SELECT 1;
CREATE POLICY "hm_kendi_alan" ON public.etuts AS RESTRICTIVE FOR SELECT TO authenticated
  USING (((NOT ( SELECT is_head_admin() AS is_head_admin)) OR ((cardinality(etut_owner_list(etut_teacher_id, etut_teacher_ids, notes)) = 0) OR (etut_owner_list(etut_teacher_id, etut_teacher_ids, notes) && ARRAY( SELECT hm_teacher_ids() AS hm_teacher_ids)))));
CREATE TRIGGER trg_etut_assign_guard BEFORE INSERT OR UPDATE OF etut_teacher_id, etut_teacher_ids ON public.etuts FOR EACH ROW EXECUTE FUNCTION etut_assign_guard();
CREATE TRIGGER trg_guard_etut_creator BEFORE INSERT OR UPDATE OF notes ON public.etuts FOR EACH ROW EXECUTE FUNCTION guard_etut_creator();
CREATE TRIGGER trg_ogr_bolum_etuts BEFORE INSERT OR UPDATE ON public.etuts FOR EACH ROW EXECUTE FUNCTION trg_ogr_bolum_etuts();
CREATE TRIGGER trg_yz_etut_kopru_once BEFORE INSERT OR UPDATE ON public.etuts FOR EACH ROW EXECUTE FUNCTION etut_kopru_once();
CREATE TRIGGER trg_yz_etut_kopru_sonra AFTER INSERT OR UPDATE ON public.etuts FOR EACH ROW EXECUTE FUNCTION etut_kopru_sonra();
CREATE TRIGGER trg_zz_ping_students AFTER INSERT OR DELETE OR UPDATE ON public.etuts FOR EACH ROW EXECUTE FUNCTION bilir_ping_etut();
CREATE TRIGGER trg_zz_touch_updated_at BEFORE INSERT OR UPDATE ON public.etuts FOR EACH ROW EXECUTE FUNCTION bilir_touch_updated_at();
CREATE POLICY "grades_admin_all" ON public.grades AS PERMISSIVE FOR ALL TO authenticated
  USING (( SELECT is_admin() AS is_admin))
  WITH CHECK (( SELECT is_admin() AS is_admin));
CREATE POLICY "grades_kurum_world" ON public.grades AS RESTRICTIVE FOR ALL TO authenticated
  USING ((( SELECT rls_world_all() AS rls_world_all) OR ((created_by IS NULL) AND (( SELECT my_kurum_id() AS my_kurum_id) IS NULL)) OR (created_by = ( SELECT auth.uid() AS uid)) OR (created_by IN ( SELECT rls_kurum_teacher_auth_ids() AS rls_kurum_teacher_auth_ids))))
  WITH CHECK (record_world_ok(created_by));
CREATE POLICY "grades_student_select" ON public.grades AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT is_student() AS is_student) AND (EXISTS ( SELECT 1;
CREATE POLICY "grades_teacher_delete" ON public.grades AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT is_teacher() AS is_teacher) AND teacher_has_student_access(student_id, class_id) AND role_record_editable(created_by)));
CREATE POLICY "grades_teacher_insert" ON public.grades AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT is_teacher() AS is_teacher) AND ( SELECT kurum_can('grades'::text) AS kurum_can) AND ( SELECT section_allowed('grades'::text) AS section_allowed) AND teacher_has_student_access(student_id, class_id)));
CREATE POLICY "grades_teacher_select" ON public.grades AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT is_teacher() AS is_teacher) AND ((student_id IN ( SELECT my_student_ids() AS my_student_ids)) OR (class_id IN ( SELECT my_class_ids() AS my_class_ids))) AND role_record_visible(created_by)));
CREATE POLICY "grades_teacher_update" ON public.grades AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT is_teacher() AS is_teacher) AND teacher_has_student_access(student_id, class_id) AND role_record_editable(created_by)))
  WITH CHECK ((( SELECT is_teacher() AS is_teacher) AND ( SELECT kurum_can('grades'::text) AS kurum_can) AND teacher_has_student_access(student_id, class_id)));
CREATE POLICY "hm_kendi_alan" ON public.grades AS RESTRICTIVE FOR SELECT TO authenticated
  USING (((NOT ( SELECT is_head_admin() AS is_head_admin)) OR ((created_by IN ( SELECT hm_auth_ids() AS hm_auth_ids)) OR ((created_by IS NULL) AND (student_id IN ( SELECT hm_student_ids() AS hm_student_ids))))));
CREATE TRIGGER trg_grades_keep_owner BEFORE INSERT OR UPDATE ON public.grades FOR EACH ROW EXECUTE FUNCTION keep_row_owner();
CREATE TRIGGER trg_zz_touch_updated_at BEFORE INSERT OR UPDATE ON public.grades FOR EACH ROW EXECUTE FUNCTION bilir_touch_updated_at();
CREATE POLICY "hm_kendi_alan" ON public.homework_submissions AS RESTRICTIVE FOR SELECT TO authenticated
  USING (((NOT ( SELECT is_head_admin() AS is_head_admin)) OR (homework_id IN ( SELECT hm_homework_ids() AS hm_homework_ids))));
CREATE POLICY "submissions_admin_all" ON public.homework_submissions AS PERMISSIVE FOR ALL TO authenticated
  USING (( SELECT is_admin() AS is_admin))
  WITH CHECK (( SELECT is_admin() AS is_admin));
CREATE POLICY "submissions_kurum_admin_select" ON public.homework_submissions AS PERMISSIVE FOR SELECT TO authenticated
  USING ((homework_id IN ( SELECT kurum_admin_homework_ids() AS kurum_admin_homework_ids)));
CREATE POLICY "submissions_role_select" ON public.homework_submissions AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT is_teacher() AS is_teacher) AND (EXISTS ( SELECT 1;
CREATE POLICY "submissions_student_insert" ON public.homework_submissions AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT is_student() AS is_student) AND (student_id = ( SELECT current_student_id() AS current_student_id)) AND (EXISTS ( SELECT 1;
CREATE POLICY "submissions_student_select" ON public.homework_submissions AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT is_student() AS is_student) AND (student_id = ( SELECT current_student_id() AS current_student_id))));
CREATE POLICY "submissions_student_update" ON public.homework_submissions AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT is_student() AS is_student) AND (student_id = ( SELECT current_student_id() AS current_student_id))))
  WITH CHECK ((( SELECT is_student() AS is_student) AND (student_id = ( SELECT current_student_id() AS current_student_id))));
CREATE POLICY "submissions_teacher_all" ON public.homework_submissions AS PERMISSIVE FOR ALL TO authenticated
  USING ((( SELECT is_teacher() AS is_teacher) AND (EXISTS ( SELECT 1
  WITH CHECK ((( SELECT is_teacher() AS is_teacher) AND (EXISTS ( SELECT 1;
CREATE TRIGGER trg_guard_homework_submission BEFORE INSERT OR UPDATE ON public.homework_submissions FOR EACH ROW EXECUTE FUNCTION guard_homework_submission();
CREATE TRIGGER trg_hs_server_submit_time BEFORE INSERT OR UPDATE ON public.homework_submissions FOR EACH ROW EXECUTE FUNCTION trg_hs_server_submit_time();
CREATE POLICY "hm_kendi_alan" ON public.homeworks AS RESTRICTIVE FOR SELECT TO authenticated
  USING (((NOT ( SELECT is_head_admin() AS is_head_admin)) OR ((teacher_auth_id IS NULL) OR (teacher_auth_id IN ( SELECT hm_auth_ids() AS hm_auth_ids)))));
CREATE POLICY "homeworks_admin_all" ON public.homeworks AS PERMISSIVE FOR ALL TO authenticated
  USING (( SELECT is_admin() AS is_admin))
  WITH CHECK (( SELECT is_admin() AS is_admin));
CREATE POLICY "homeworks_kurum_admin_select" ON public.homeworks AS PERMISSIVE FOR SELECT TO authenticated
  USING ((id IN ( SELECT kurum_admin_homework_ids() AS kurum_admin_homework_ids)));
CREATE POLICY "homeworks_role_select" ON public.homeworks AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT is_teacher() AS is_teacher) AND (teacher_auth_id IS NOT NULL) AND role_sees_owner((teacher_auth_id)::text)));
CREATE POLICY "homeworks_student_select" ON public.homeworks AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT is_student() AS is_student) AND (id !~~ '\_\_%'::text) AND (((cardinality(target_student_ids) > 0) AND (( SELECT current_student_id() AS current_student_id) = ANY (target_student_ids))) OR ((cardinality(target_student_ids) = 0) AND (( SELECT current_student_class_id() AS current_student_class_id) = ANY (target_class_ids))))));
CREATE POLICY "homeworks_teacher_delete" ON public.homeworks AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT is_teacher() AS is_teacher) AND (teacher_auth_id = ( SELECT auth.uid() AS uid)) AND (id !~~ '\_\_%'::text)));
CREATE POLICY "homeworks_teacher_insert" ON public.homeworks AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT is_teacher() AS is_teacher) AND ( SELECT kurum_can('homework'::text) AS kurum_can) AND (( SELECT role_can_teach() AS role_can_teach) OR ( SELECT section_explicit_allow('homework'::text) AS section_explicit_allow)) AND ( SELECT section_allowed('homework'::text) AS section_allowed) AND (teacher_auth_id = ( SELECT auth.uid() AS uid)) AND (id !~~ '\_\_%'::text) AND ((cardinality(target_class_ids) + cardinality(target_student_ids)) > 0) AND teacher_can_target(target_class_ids, target_student_ids)));
CREATE POLICY "homeworks_teacher_select" ON public.homeworks AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT is_teacher() AS is_teacher) AND (teacher_auth_id = ( SELECT auth.uid() AS uid))));
CREATE POLICY "homeworks_teacher_shared_rows" ON public.homeworks AS PERMISSIVE FOR ALL TO authenticated
  USING ((( SELECT is_teacher() AS is_teacher) AND (( SELECT my_kurum_id() AS my_kurum_id) IS NULL) AND (id = '__system_sync_tombstones__'::text)))
  WITH CHECK ((( SELECT is_teacher() AS is_teacher) AND (( SELECT my_kurum_id() AS my_kurum_id) IS NULL) AND (id = '__system_sync_tombstones__'::text)));
CREATE POLICY "homeworks_teacher_update" ON public.homeworks AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT is_teacher() AS is_teacher) AND (teacher_auth_id = ( SELECT auth.uid() AS uid)) AND (id !~~ '\_\_%'::text)))
  WITH CHECK ((( SELECT is_teacher() AS is_teacher) AND (teacher_auth_id = ( SELECT auth.uid() AS uid)) AND (id !~~ '\_\_%'::text) AND ((cardinality(target_class_ids) + cardinality(target_student_ids)) > 0) AND teacher_can_target(target_class_ids, target_student_ids)));
CREATE TRIGGER trg_normalize_homework_row BEFORE INSERT OR UPDATE ON public.homeworks FOR EACH ROW EXECUTE FUNCTION normalize_homework_row();
CREATE TRIGGER trg_ogr_bolum_homeworks BEFORE INSERT OR UPDATE ON public.homeworks FOR EACH ROW EXECUTE FUNCTION trg_ogr_bolum_homeworks();
CREATE POLICY "initial_credentials_head_select" ON public.initial_credentials AS PERMISSIVE FOR SELECT TO authenticated
  USING ((lower(COALESCE((( SELECT auth.jwt() AS jwt) ->> 'email'::text), ''::text)) = 'm.bilirr@gmail.com'::text));
CREATE POLICY "initial_credentials_kurum_select" ON public.initial_credentials AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1;
CREATE POLICY "kurum_grants_head_all" ON public.kurum_class_grants AS PERMISSIVE FOR ALL TO authenticated
  USING (( SELECT is_head_admin() AS is_head_admin))
  WITH CHECK (( SELECT is_head_admin() AS is_head_admin));
CREATE POLICY "kurum_grants_own_select" ON public.kurum_class_grants AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT is_teacher() AS is_teacher) AND (kurum_id = ( SELECT my_kurum_id() AS my_kurum_id))));
CREATE TRIGGER trg_tga_grant_changed AFTER INSERT OR DELETE ON public.kurum_class_grants FOR EACH ROW EXECUTE FUNCTION tga_grant_changed();
CREATE POLICY "kurumlar_head_all" ON public.kurumlar AS PERMISSIVE FOR ALL TO authenticated
  USING (( SELECT is_head_admin() AS is_head_admin))
  WITH CHECK (( SELECT is_head_admin() AS is_head_admin));
CREATE POLICY "kurumlar_own_select" ON public.kurumlar AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT is_teacher() AS is_teacher) AND (id = ( SELECT my_kurum_id() AS my_kurum_id))));
CREATE TRIGGER trg_kurum_grant_cred_guard BEFORE INSERT OR UPDATE ON public.kurumlar FOR EACH ROW EXECUTE FUNCTION kurum_grant_cred_guard();
CREATE TRIGGER trg_kurum_grant_move_guard BEFORE INSERT OR UPDATE ON public.kurumlar FOR EACH ROW EXECUTE FUNCTION kurum_grant_move_guard();
CREATE TRIGGER trg_touch_kurum BEFORE INSERT OR UPDATE ON public.kurumlar FOR EACH ROW EXECUTE FUNCTION touch_kurum();
CREATE POLICY "hm_kendi_alan" ON public.mail_log AS RESTRICTIVE FOR SELECT TO authenticated
  USING (((NOT ( SELECT is_head_admin() AS is_head_admin)) OR ((sender_auth_id IS NULL) OR (sender_auth_id IN ( SELECT hm_auth_ids() AS hm_auth_ids)))));
CREATE POLICY "mail_log_own_select" ON public.mail_log AS PERMISSIVE FOR SELECT TO authenticated
  USING (((sender_auth_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin)));
CREATE POLICY "hm_kendi_alan" ON public.messages AS RESTRICTIVE FOR SELECT TO authenticated
  USING (((NOT ( SELECT is_head_admin() AS is_head_admin)) OR ((student_id IN ( SELECT hm_student_ids() AS hm_student_ids)) AND ((sender_id IS NULL) OR (sender_id IN ( SELECT hm_teacher_ids() AS hm_teacher_ids))))));
CREATE POLICY "messages_admin_all" ON public.messages AS PERMISSIVE FOR ALL TO authenticated
  USING (( SELECT is_admin() AS is_admin))
  WITH CHECK (( SELECT is_admin() AS is_admin));
CREATE POLICY "messages_privacy_delete" ON public.messages AS RESTRICTIVE FOR DELETE TO authenticated
  USING (((NOT ( SELECT is_teacher() AS is_teacher)) OR message_teacher_can_see(kind, sender_id, to_teacher_id, replied_by_id)));
CREATE POLICY "messages_privacy_insert" ON public.messages AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (((NOT ( SELECT is_teacher() AS is_teacher)) OR ( SELECT is_head_admin() AS is_head_admin) OR (COALESCE(kind, ''::text) <> ALL (ARRAY['announcement'::text, 'note'::text])) OR (sender_id = ANY (priv_my_teacher_ids()))));
CREATE POLICY "messages_privacy_select" ON public.messages AS RESTRICTIVE FOR SELECT TO authenticated
  USING (((NOT ( SELECT is_teacher() AS is_teacher)) OR message_teacher_can_see(kind, sender_id, to_teacher_id, replied_by_id)));
CREATE POLICY "messages_privacy_update" ON public.messages AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (((NOT ( SELECT is_teacher() AS is_teacher)) OR message_teacher_can_see(kind, sender_id, to_teacher_id, replied_by_id)))
  WITH CHECK (((NOT ( SELECT is_teacher() AS is_teacher)) OR message_teacher_can_see(kind, sender_id, to_teacher_id, replied_by_id)));
CREATE POLICY "messages_student_insert" ON public.messages AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT is_student() AS is_student) AND (kind IS NULL) AND (EXISTS ( SELECT 1;
CREATE POLICY "messages_student_select" ON public.messages AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT is_student() AS is_student) AND (EXISTS ( SELECT 1;
CREATE POLICY "messages_teacher_delete" ON public.messages AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT is_teacher() AS is_teacher) AND teacher_has_student_access(student_id, NULL::text)));
CREATE POLICY "messages_teacher_insert" ON public.messages AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT is_teacher() AS is_teacher) AND ( SELECT section_allowed('messages'::text) AS section_allowed) AND teacher_has_student_access(student_id, NULL::text)));
CREATE POLICY "messages_teacher_select" ON public.messages AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT is_teacher() AS is_teacher) AND (student_id IN ( SELECT my_student_ids() AS my_student_ids))));
CREATE POLICY "messages_teacher_update" ON public.messages AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT is_teacher() AS is_teacher) AND teacher_has_student_access(student_id, NULL::text)))
  WITH CHECK ((( SELECT is_teacher() AS is_teacher) AND ( SELECT kurum_can('messages'::text) AS kurum_can) AND teacher_has_student_access(student_id, NULL::text)));
CREATE TRIGGER trg_ogr_bolum_messages BEFORE INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION trg_ogr_bolum_messages();
CREATE TRIGGER trg_zz_touch_updated_at BEFORE INSERT OR UPDATE ON public.messages FOR EACH ROW EXECUTE FUNCTION bilir_touch_updated_at();
CREATE POLICY "notification_policy_admin_insert" ON public.notification_policy AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (( SELECT is_admin() AS is_admin));
CREATE POLICY "notification_policy_admin_select" ON public.notification_policy AS PERMISSIVE FOR SELECT TO authenticated
  USING (( SELECT is_admin() AS is_admin));
CREATE POLICY "notification_policy_admin_update" ON public.notification_policy AS PERMISSIVE FOR UPDATE TO authenticated
  USING (( SELECT is_admin() AS is_admin))
  WITH CHECK (( SELECT is_admin() AS is_admin));
CREATE POLICY "hm_kendi_alan" ON public.question_logs AS RESTRICTIVE FOR SELECT TO authenticated
  USING (((NOT ( SELECT is_head_admin() AS is_head_admin)) OR (student_id IN ( SELECT hm_student_ids() AS hm_student_ids))));
CREATE POLICY "question_logs_admin_all" ON public.question_logs AS PERMISSIVE FOR ALL TO authenticated
  USING (( SELECT is_admin() AS is_admin))
  WITH CHECK (( SELECT is_admin() AS is_admin));
CREATE POLICY "question_logs_student_all" ON public.question_logs AS PERMISSIVE FOR ALL TO authenticated
  USING ((( SELECT is_student() AS is_student) AND (student_id = ( SELECT current_student_id() AS current_student_id))))
  WITH CHECK ((( SELECT is_student() AS is_student) AND (student_id = ( SELECT current_student_id() AS current_student_id))));
CREATE POLICY "question_logs_teacher_all" ON public.question_logs AS PERMISSIVE FOR ALL TO authenticated
  USING ((( SELECT is_teacher() AS is_teacher) AND (student_id IN ( SELECT my_student_ids() AS my_student_ids))))
  WITH CHECK ((( SELECT is_teacher() AS is_teacher) AND teacher_has_student_access(student_id, NULL::text)));
CREATE POLICY "hm_kendi_alan" ON public.question_targets AS RESTRICTIVE FOR SELECT TO authenticated
  USING (((NOT ( SELECT is_head_admin() AS is_head_admin)) OR ((created_by IN ( SELECT hm_auth_ids() AS hm_auth_ids)) OR ((created_by IS NULL) AND ((student_id IN ( SELECT hm_student_ids() AS hm_student_ids)) OR ((student_id IS NULL) AND (class_id IN ( SELECT hm_class_ids() AS hm_class_ids))))))));
CREATE POLICY "question_targets_admin_all" ON public.question_targets AS PERMISSIVE FOR ALL TO authenticated
  USING (( SELECT is_admin() AS is_admin))
  WITH CHECK (( SELECT is_admin() AS is_admin));
CREATE POLICY "question_targets_kurum_world" ON public.question_targets AS RESTRICTIVE FOR ALL TO authenticated
  USING ((( SELECT rls_world_all() AS rls_world_all) OR ((created_by IS NULL) AND (( SELECT my_kurum_id() AS my_kurum_id) IS NULL)) OR (created_by = ( SELECT auth.uid() AS uid)) OR (created_by IN ( SELECT rls_kurum_teacher_auth_ids() AS rls_kurum_teacher_auth_ids))))
  WITH CHECK (record_world_ok(created_by));
CREATE POLICY "question_targets_student_select" ON public.question_targets AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT is_student() AS is_student) AND ((student_id = ( SELECT current_student_id() AS current_student_id)) OR ((student_id IS NULL) AND (class_id = ( SELECT current_student_class_id() AS current_student_class_id))))));
CREATE POLICY "question_targets_teacher_delete" ON public.question_targets AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT is_teacher() AS is_teacher) AND ((created_by = ( SELECT auth.uid() AS uid)) OR (created_by IS NULL)) AND (((student_id IS NOT NULL) AND teacher_has_student_access(student_id, NULL::text)) OR ((student_id IS NULL) AND teacher_has_class_access(class_id)))));
CREATE POLICY "question_targets_teacher_insert" ON public.question_targets AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT is_teacher() AS is_teacher) AND ( SELECT kurum_can('questions'::text) AS kurum_can) AND (( SELECT role_can_teach() AS role_can_teach) OR ( SELECT section_explicit_allow('question_tracking'::text) AS section_explicit_allow)) AND ( SELECT section_allowed('question_tracking'::text) AS section_allowed) AND (((student_id IS NOT NULL) AND teacher_has_student_access(student_id, NULL::text)) OR ((student_id IS NULL) AND teacher_has_class_access(class_id)))));
CREATE POLICY "question_targets_teacher_select" ON public.question_targets AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT is_teacher() AS is_teacher) AND (((student_id IS NOT NULL) AND (student_id IN ( SELECT my_student_ids() AS my_student_ids))) OR ((student_id IS NULL) AND (class_id IN ( SELECT my_class_ids() AS my_class_ids)))) AND ((NOT ( SELECT kurum_roles_on() AS kurum_roles_on)) OR ( SELECT is_kurum_admin() AS is_kurum_admin) OR (created_by IS NULL) OR (created_by = ( SELECT auth.uid() AS uid)) OR role_sees_owner((created_by)::text))));
CREATE POLICY "question_targets_teacher_update" ON public.question_targets AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT is_teacher() AS is_teacher) AND ((created_by = ( SELECT auth.uid() AS uid)) OR (created_by IS NULL)) AND (((student_id IS NOT NULL) AND teacher_has_student_access(student_id, NULL::text)) OR ((student_id IS NULL) AND teacher_has_class_access(class_id)))))
  WITH CHECK ((( SELECT is_teacher() AS is_teacher) AND (((student_id IS NOT NULL) AND teacher_has_student_access(student_id, NULL::text)) OR ((student_id IS NULL) AND teacher_has_class_access(class_id)))));
CREATE TRIGGER question_targets_keep_owner BEFORE INSERT OR UPDATE ON public.question_targets FOR EACH ROW EXECUTE FUNCTION question_targets_keep_owner();
CREATE TRIGGER trg_ogr_bolum_question_targets BEFORE INSERT OR UPDATE ON public.question_targets FOR EACH ROW EXECUTE FUNCTION trg_ogr_bolum_question_targets();
CREATE POLICY "applications_admin_delete" ON public.student_applications AS PERMISSIVE FOR DELETE TO authenticated
  USING (((( SELECT is_head_admin() AS is_head_admin) AND (kurum_id IS NULL)) OR ((kurum_id IS NOT NULL) AND ( SELECT is_kurum_admin() AS is_kurum_admin) AND (kurum_id = ( SELECT my_kurum_id() AS my_kurum_id)) AND ( SELECT kurum_can('manage_students'::text) AS kurum_can))));
CREATE POLICY "applications_admin_select" ON public.student_applications AS PERMISSIVE FOR SELECT TO authenticated
  USING (((( SELECT is_head_admin() AS is_head_admin) AND (kurum_id IS NULL)) OR ((kurum_id IS NOT NULL) AND ( SELECT is_kurum_admin() AS is_kurum_admin) AND (kurum_id = ( SELECT my_kurum_id() AS my_kurum_id)) AND ( SELECT kurum_can('manage_students'::text) AS kurum_can))));
CREATE POLICY "hm_kendi_alan" ON public.student_books AS RESTRICTIVE FOR SELECT TO authenticated
  USING (((NOT ( SELECT is_head_admin() AS is_head_admin)) OR (student_id IN ( SELECT hm_student_ids() AS hm_student_ids))));
CREATE POLICY "student_books_staff_delete" ON public.student_books AS PERMISSIVE FOR DELETE TO authenticated
  USING (plan_can_work(student_id));
CREATE POLICY "student_books_staff_insert" ON public.student_books AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (plan_can_work(student_id));
CREATE POLICY "student_books_staff_select" ON public.student_books AS PERMISSIVE FOR SELECT TO authenticated
  USING (((( SELECT is_teacher() AS is_teacher) OR ( SELECT is_admin() AS is_admin)) AND (( SELECT is_admin() AS is_admin) OR (student_id IN ( SELECT rls_tha_set() AS rls_tha_set)))));
CREATE POLICY "student_books_staff_update" ON public.student_books AS PERMISSIVE FOR UPDATE TO authenticated
  USING (plan_can_work(student_id))
  WITH CHECK (plan_can_work(student_id));
CREATE POLICY "hm_kendi_alan" ON public.student_contacts AS RESTRICTIVE FOR SELECT TO authenticated
  USING (((NOT ( SELECT is_head_admin() AS is_head_admin)) OR (id IN ( SELECT hm_student_ids() AS hm_student_ids))));
CREATE POLICY "student_contacts_select" ON public.student_contacts AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT contact_role_ok() AS contact_role_ok) AND (EXISTS ( SELECT 1;
CREATE POLICY "student_contacts_write" ON public.student_contacts AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT is_admin() AS is_admin) OR can_manage_student(id) OR (( SELECT is_student() AS is_student) AND (EXISTS ( SELECT 1
  WITH CHECK ((( SELECT is_admin() AS is_admin) OR can_manage_student(id) OR (( SELECT is_student() AS is_student) AND (EXISTS ( SELECT 1;
CREATE TRIGGER trg_guard_contact_parents BEFORE UPDATE ON public.student_contacts FOR EACH ROW EXECUTE FUNCTION guard_contact_parents();
CREATE TRIGGER trg_zz_touch_updated_at BEFORE INSERT OR UPDATE ON public.student_contacts FOR EACH ROW EXECUTE FUNCTION bilir_touch_updated_at();
CREATE POLICY "hm_kendi_alan" ON public.student_notifications AS RESTRICTIVE FOR SELECT TO authenticated
  USING (((NOT ( SELECT is_head_admin() AS is_head_admin)) OR ((student_id IN ( SELECT hm_student_ids() AS hm_student_ids)) AND ((created_by IS NULL) OR (created_by IN ( SELECT hm_auth_ids() AS hm_auth_ids))))));
CREATE POLICY "sn_head_admin_all" ON public.student_notifications AS PERMISSIVE FOR ALL TO authenticated
  USING (( SELECT is_head_admin() AS is_head_admin))
  WITH CHECK (( SELECT is_head_admin() AS is_head_admin));
CREATE POLICY "sn_student_delete" ON public.student_notifications AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT is_student() AS is_student) AND (EXISTS ( SELECT 1;
CREATE POLICY "sn_student_select" ON public.student_notifications AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT is_student() AS is_student) AND (EXISTS ( SELECT 1;
CREATE POLICY "sn_student_update" ON public.student_notifications AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT is_student() AS is_student) AND (EXISTS ( SELECT 1
  WITH CHECK ((( SELECT is_student() AS is_student) AND (EXISTS ( SELECT 1;
CREATE POLICY "sn_teacher_delete" ON public.student_notifications AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT is_teacher() AS is_teacher) AND (created_by = ( SELECT auth.uid() AS uid))));
CREATE POLICY "sn_teacher_insert" ON public.student_notifications AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT is_teacher() AS is_teacher) AND (created_by = ( SELECT auth.uid() AS uid)) AND (teacher_has_student_access(student_id, NULL::text) OR (student_id IN ( SELECT my_student_ids() AS my_student_ids)))));
CREATE POLICY "sn_teacher_select" ON public.student_notifications AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT is_teacher() AS is_teacher) AND (created_by = ( SELECT auth.uid() AS uid))));
CREATE POLICY "student_sync_ping_own" ON public.student_sync_ping AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT is_student() AS is_student) AND (student_id = ( SELECT current_student_id() AS current_student_id))));
CREATE POLICY "hm_kendi_alan" ON public.students AS RESTRICTIVE FOR SELECT TO authenticated
  USING (((NOT ( SELECT is_head_admin() AS is_head_admin)) OR ((kurum_id IS NULL) AND (NOT (class_id IN ( SELECT hm_kurum_class_ids() AS hm_kurum_class_ids))))));
CREATE POLICY "students_admin_all" ON public.students AS PERMISSIVE FOR ALL TO authenticated
  USING (( SELECT is_admin() AS is_admin))
  WITH CHECK (( SELECT is_admin() AS is_admin));
CREATE POLICY "students_kurum_select" ON public.students AS PERMISSIVE FOR SELECT TO authenticated
  USING (((kurum_id IS NOT NULL) AND (kurum_id = ( SELECT my_admin_kurum_id() AS my_admin_kurum_id))));
CREATE POLICY "students_manager_delete" ON public.students AS PERMISSIVE FOR DELETE TO authenticated
  USING (can_delete_student(id));
CREATE POLICY "students_manager_insert" ON public.students AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT kurum_student_adder() AS kurum_student_adder) AND ( SELECT kurum_can('manage_students'::text) AS kurum_can) AND (kurum_id = ( SELECT my_kurum_id() AS my_kurum_id)) AND ((class_id = 'class-default'::text) OR kurum_has_class(class_id))));
CREATE POLICY "students_manager_update" ON public.students AS PERMISSIVE FOR UPDATE TO authenticated
  USING (can_manage_student(id))
  WITH CHECK ((( SELECT kurum_student_editor() AS kurum_student_editor) AND ( SELECT kurum_can('manage_students'::text) AS kurum_can) AND (kurum_id = ( SELECT my_kurum_id() AS my_kurum_id)) AND ((class_id = 'class-default'::text) OR kurum_has_class(class_id))));
CREATE POLICY "students_student_select" ON public.students AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT is_student() AS is_student) AND ((auth_user_id = ( SELECT auth.uid() AS uid)) OR (id = (( SELECT auth.uid() AS uid))::text))));
CREATE POLICY "students_student_update" ON public.students AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT is_student() AS is_student) AND ((auth_user_id = ( SELECT auth.uid() AS uid)) OR (id = (( SELECT auth.uid() AS uid))::text))))
  WITH CHECK ((( SELECT is_student() AS is_student) AND ((auth_user_id = ( SELECT auth.uid() AS uid)) OR (id = (( SELECT auth.uid() AS uid))::text))));
CREATE POLICY "students_teacher_select" ON public.students AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT is_teacher() AS is_teacher) AND (id IN ( SELECT my_student_ids() AS my_student_ids))));
CREATE TRIGGER trg_guard_student_insert BEFORE INSERT ON public.students FOR EACH ROW EXECUTE FUNCTION guard_student_insert();
CREATE TRIGGER trg_guard_student_parent_contact BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION guard_student_parent_contact();
CREATE TRIGGER trg_guard_student_self_update BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION guard_student_self_update();
CREATE TRIGGER trg_set_student_kurum BEFORE INSERT OR UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION set_student_kurum();
CREATE TRIGGER trg_zz_sync_student_contact BEFORE INSERT OR UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION sync_student_contact();
CREATE TRIGGER trg_zz_touch_updated_at BEFORE INSERT OR UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION bilir_touch_updated_at();
CREATE POLICY "hm_kendi_alan" ON public.study_plan_groups AS RESTRICTIVE FOR SELECT TO authenticated
  USING (((NOT ( SELECT is_head_admin() AS is_head_admin)) OR ((teacher_auth_id IS NULL) OR (teacher_auth_id IN ( SELECT hm_auth_ids() AS hm_auth_ids)))));
CREATE POLICY "study_plan_groups_owner_select" ON public.study_plan_groups AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT is_admin() AS is_admin) OR (teacher_auth_id = ( SELECT auth.uid() AS uid))));
CREATE POLICY "hm_kendi_alan" ON public.study_plan_items AS RESTRICTIVE FOR SELECT TO authenticated
  USING (((NOT ( SELECT is_head_admin() AS is_head_admin)) OR ((created_by IN ( SELECT hm_auth_ids() AS hm_auth_ids)) OR ((created_by IS NULL) AND (student_id IN ( SELECT hm_student_ids() AS hm_student_ids))))));
CREATE POLICY "spi_privacy_delete" ON public.study_plan_items AS RESTRICTIVE FOR DELETE TO authenticated
  USING (((NOT ( SELECT is_teacher() AS is_teacher)) OR plan_item_visible((created_by)::text, created_by_name)));
CREATE POLICY "spi_privacy_insert" ON public.study_plan_items AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (((NOT ( SELECT is_teacher() AS is_teacher)) OR ( SELECT is_head_admin() AS is_head_admin) OR (created_by IS NULL) OR ((created_by)::text = (( SELECT auth.uid() AS uid))::text) OR ((created_by)::text = ANY (priv_my_teacher_ids()))));
CREATE POLICY "spi_privacy_select" ON public.study_plan_items AS RESTRICTIVE FOR SELECT TO authenticated
  USING (((NOT ( SELECT is_teacher() AS is_teacher)) OR plan_item_visible((created_by)::text, created_by_name) OR role_sees_owner((created_by)::text)));
CREATE POLICY "spi_privacy_update" ON public.study_plan_items AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (((NOT ( SELECT is_teacher() AS is_teacher)) OR plan_item_visible((created_by)::text, created_by_name)))
  WITH CHECK (((NOT ( SELECT is_teacher() AS is_teacher)) OR plan_item_visible((created_by)::text, created_by_name)));
CREATE POLICY "study_plan_items_staff_delete" ON public.study_plan_items AS PERMISSIVE FOR DELETE TO authenticated
  USING ((plan_can_work(student_id) AND plan_subject_ok(subject)));
CREATE POLICY "study_plan_items_staff_insert" ON public.study_plan_items AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((plan_can_work(student_id) AND plan_subject_ok(subject)));
CREATE POLICY "study_plan_items_staff_select" ON public.study_plan_items AS PERMISSIVE FOR SELECT TO authenticated
  USING (((( SELECT is_teacher() AS is_teacher) OR ( SELECT is_admin() AS is_admin)) AND (( SELECT is_admin() AS is_admin) OR (student_id IN ( SELECT rls_tha_set() AS rls_tha_set)) OR (student_id IN ( SELECT my_student_ids() AS my_student_ids)))));
CREATE POLICY "study_plan_items_staff_update" ON public.study_plan_items AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((plan_can_work(student_id) AND plan_subject_ok(subject)))
  WITH CHECK ((plan_can_work(student_id) AND plan_subject_ok(subject)));
CREATE POLICY "study_plan_items_student_select" ON public.study_plan_items AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT is_student() AS is_student) AND (student_id = ( SELECT current_student_id() AS current_student_id)) AND (sent_at IS NOT NULL)));
CREATE TRIGGER study_plan_items_guard BEFORE INSERT OR UPDATE ON public.study_plan_items FOR EACH ROW EXECUTE FUNCTION study_plan_items_guard();
CREATE TRIGGER trg_ogr_bolum_plan_items BEFORE INSERT OR UPDATE ON public.study_plan_items FOR EACH ROW EXECUTE FUNCTION trg_ogr_bolum_plan_items();
CREATE TRIGGER zz164_spi_insert_sent BEFORE INSERT ON public.study_plan_items FOR EACH ROW EXECUTE FUNCTION spi164_insert_sent();
CREATE TRIGGER zz164_spi_sync_header AFTER INSERT OR DELETE OR UPDATE OF sent_at ON public.study_plan_items FOR EACH ROW EXECUTE FUNCTION spi164_sync_header();
CREATE TRIGGER zz164_spi_update_guard BEFORE UPDATE ON public.study_plan_items FOR EACH ROW EXECUTE FUNCTION spi164_update_guard();
CREATE POLICY "hm_kendi_alan" ON public.study_plans AS RESTRICTIVE FOR SELECT TO authenticated
  USING (((NOT ( SELECT is_head_admin() AS is_head_admin)) OR (student_id IN ( SELECT hm_student_ids() AS hm_student_ids))));
CREATE POLICY "sp_privacy_delete" ON public.study_plans AS RESTRICTIVE FOR DELETE TO authenticated
  USING (((NOT ( SELECT is_teacher() AS is_teacher)) OR plan_all_items_visible(id)));
CREATE POLICY "sp_privacy_update" ON public.study_plans AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (((NOT ( SELECT is_teacher() AS is_teacher)) OR (sent_at IS NOT NULL) OR plan_all_items_visible(id)));
CREATE POLICY "study_plans_staff_delete" ON public.study_plans AS PERMISSIVE FOR DELETE TO authenticated
  USING ((plan_can_work(student_id) AND (NOT (EXISTS ( SELECT 1;
CREATE POLICY "study_plans_staff_insert" ON public.study_plans AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (plan_can_work(student_id));
CREATE POLICY "study_plans_staff_select" ON public.study_plans AS PERMISSIVE FOR SELECT TO authenticated
  USING (((( SELECT is_teacher() AS is_teacher) OR ( SELECT is_admin() AS is_admin)) AND (( SELECT is_admin() AS is_admin) OR (student_id IN ( SELECT rls_tha_set() AS rls_tha_set)) OR (student_id IN ( SELECT my_student_ids() AS my_student_ids)))));
CREATE POLICY "study_plans_staff_update" ON public.study_plans AS PERMISSIVE FOR UPDATE TO authenticated
  USING (plan_can_work(student_id))
  WITH CHECK (plan_can_work(student_id));
CREATE POLICY "study_plans_student_select" ON public.study_plans AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT is_student() AS is_student) AND (sent_at IS NOT NULL) AND (student_id = ( SELECT current_student_id() AS current_student_id))));
CREATE TRIGGER study_plans_guard BEFORE INSERT OR UPDATE ON public.study_plans FOR EACH ROW EXECUTE FUNCTION study_plans_guard();
CREATE POLICY "hm_kendi_alan" ON public.teacher_class_access AS RESTRICTIVE FOR SELECT TO authenticated
  USING (((NOT ( SELECT is_head_admin() AS is_head_admin)) OR (teacher_auth_id IN ( SELECT hm_auth_ids() AS hm_auth_ids))));
CREATE POLICY "tc_access_admin_all" ON public.teacher_class_access AS PERMISSIVE FOR ALL TO authenticated
  USING (( SELECT is_admin() AS is_admin))
  WITH CHECK (( SELECT is_admin() AS is_admin));
CREATE POLICY "tc_access_kurum_admin_all" ON public.teacher_class_access AS PERMISSIVE FOR ALL TO authenticated
  USING (kurum_admin_manages_teacher_auth(teacher_auth_id))
  WITH CHECK ((kurum_admin_manages_teacher_auth(teacher_auth_id) AND kurum_has_class(class_id)));
CREATE POLICY "tc_access_teacher_select" ON public.teacher_class_access AS PERMISSIVE FOR SELECT TO authenticated
  USING ((teacher_auth_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "tcon_admin_select" ON public.teacher_contacts AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT is_head_admin() AS is_head_admin) OR (( SELECT is_kurum_admin() AS is_kurum_admin) AND (EXISTS ( SELECT 1;
CREATE POLICY "tcon_self_select" ON public.teacher_contacts AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1;
CREATE POLICY "hm_kendi_alan" ON public.teacher_documents AS RESTRICTIVE FOR SELECT TO authenticated
  USING (((NOT ( SELECT is_head_admin() AS is_head_admin)) OR ((owner_auth_id IS NULL) OR (owner_auth_id IN ( SELECT hm_auth_ids() AS hm_auth_ids)))));
CREATE POLICY "teacher_documents_delete" ON public.teacher_documents AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT is_admin() AS is_admin) OR (( SELECT is_teacher() AS is_teacher) AND (owner_auth_id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "teacher_documents_insert" ON public.teacher_documents AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT is_admin() AS is_admin) OR (( SELECT is_teacher() AS is_teacher) AND ( SELECT kurum_can('archive'::text) AS kurum_can) AND ( SELECT section_allowed('archive'::text) AS section_allowed) AND (owner_auth_id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "teacher_documents_select" ON public.teacher_documents AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT is_admin() AS is_admin) OR (( SELECT is_teacher() AS is_teacher) AND ((owner_auth_id = ( SELECT auth.uid() AS uid)) OR (owner_auth_id IN ( SELECT rls_kurum_teacher_auth_ids() AS rls_kurum_teacher_auth_ids))))));
CREATE POLICY "teacher_documents_update" ON public.teacher_documents AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT is_admin() AS is_admin) OR (( SELECT is_teacher() AS is_teacher) AND (owner_auth_id = ( SELECT auth.uid() AS uid)))))
  WITH CHECK ((( SELECT is_admin() AS is_admin) OR (( SELECT is_teacher() AS is_teacher) AND (owner_auth_id = ( SELECT auth.uid() AS uid)))));
CREATE POLICY "teacher_documents_zumre_delete" ON public.teacher_documents AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT is_teacher() AS is_teacher) AND same_kurum_auth(owner_auth_id) AND (branch_subjects(subject) && my_zumre_subjects())));
CREATE POLICY "teacher_documents_zumre_update" ON public.teacher_documents AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT is_teacher() AS is_teacher) AND same_kurum_auth(owner_auth_id) AND (branch_subjects(subject) && my_zumre_subjects())))
  WITH CHECK ((( SELECT is_teacher() AS is_teacher) AND same_kurum_auth(owner_auth_id) AND (branch_subjects(subject) && my_zumre_subjects())));
CREATE TRIGGER trg_touch_teacher_document BEFORE INSERT OR UPDATE ON public.teacher_documents FOR EACH ROW EXECUTE FUNCTION touch_teacher_document();
CREATE POLICY "tga_admin_select" ON public.teacher_grade_access AS PERMISSIVE FOR SELECT TO authenticated
  USING (((( SELECT is_admin() AS is_admin) OR ( SELECT is_kurum_admin() AS is_kurum_admin)) AND (NOT (kurum_id IS DISTINCT FROM ( SELECT my_kurum_id() AS my_kurum_id)))));
CREATE POLICY "tga_self_select" ON public.teacher_grade_access AS PERMISSIVE FOR SELECT TO authenticated
  USING ((teacher_auth_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "teacher_role_log_select" ON public.teacher_role_log AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT is_head_admin() AS is_head_admin) OR (( SELECT role_manager() AS role_manager) AND (kurum_id IS NOT NULL) AND (kurum_id = ( SELECT my_kurum_id() AS my_kurum_id)))));
CREATE POLICY "teacher_roles_select" ON public.teacher_roles AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT is_head_admin() AS is_head_admin) OR (EXISTS ( SELECT 1;
CREATE POLICY "teacher_section_access_select" ON public.teacher_section_access AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT is_head_admin() AS is_head_admin) OR (EXISTS ( SELECT 1;
CREATE POLICY "hm_kendi_alan" ON public.teacher_student_access AS RESTRICTIVE FOR SELECT TO authenticated
  USING (((NOT ( SELECT is_head_admin() AS is_head_admin)) OR (teacher_auth_id IN ( SELECT hm_auth_ids() AS hm_auth_ids))));
CREATE POLICY "ts_access_admin_all" ON public.teacher_student_access AS PERMISSIVE FOR ALL TO authenticated
  USING (( SELECT is_admin() AS is_admin))
  WITH CHECK (( SELECT is_admin() AS is_admin));
CREATE POLICY "ts_access_kurum_admin_all" ON public.teacher_student_access AS PERMISSIVE FOR ALL TO authenticated
  USING (kurum_admin_manages_teacher_auth(teacher_auth_id))
  WITH CHECK ((kurum_admin_manages_teacher_auth(teacher_auth_id) AND kurum_has_student(student_id)));
CREATE POLICY "ts_access_teacher_select" ON public.teacher_student_access AS PERMISSIVE FOR SELECT TO authenticated
  USING ((teacher_auth_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "teachers_admin_all" ON public.teachers AS PERMISSIVE FOR ALL TO authenticated
  USING (( SELECT is_admin() AS is_admin))
  WITH CHECK (( SELECT is_admin() AS is_admin));
CREATE POLICY "teachers_kurum_admin_delete" ON public.teachers AS PERMISSIVE FOR DELETE TO authenticated
  USING ((( SELECT is_kurum_admin() AS is_kurum_admin) AND ( SELECT kurum_can('manage_teachers'::text) AS kurum_can) AND (kurum_id = ( SELECT my_kurum_id() AS my_kurum_id)) AND (NOT COALESCE(is_admin, false))));
CREATE POLICY "teachers_kurum_admin_insert" ON public.teachers AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((( SELECT is_kurum_admin() AS is_kurum_admin) AND ( SELECT kurum_can('manage_teachers'::text) AS kurum_can) AND (kurum_id = ( SELECT my_kurum_id() AS my_kurum_id)) AND (NOT COALESCE(is_admin, false)) AND (auth_user_id IS NULL)));
CREATE POLICY "teachers_kurum_admin_update" ON public.teachers AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT is_kurum_admin() AS is_kurum_admin) AND ( SELECT kurum_can('manage_teachers'::text) AS kurum_can) AND (kurum_id = ( SELECT my_kurum_id() AS my_kurum_id)) AND (NOT COALESCE(is_admin, false))))
  WITH CHECK (((kurum_id = ( SELECT my_kurum_id() AS my_kurum_id)) AND (NOT COALESCE(is_admin, false))));
CREATE POLICY "teachers_self_select" ON public.teachers AS PERMISSIVE FOR SELECT TO authenticated
  USING ((auth_user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "teachers_self_update" ON public.teachers AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((( SELECT is_teacher() AS is_teacher) AND (auth_user_id = ( SELECT auth.uid() AS uid))))
  WITH CHECK ((( SELECT is_teacher() AS is_teacher) AND (auth_user_id = ( SELECT auth.uid() AS uid))));
CREATE POLICY "teachers_staff_select" ON public.teachers AS PERMISSIVE FOR SELECT TO authenticated
  USING ((( SELECT is_admin() AS is_admin) OR (auth_user_id = ( SELECT auth.uid() AS uid)) OR (( SELECT is_teacher() AS is_teacher) AND (NOT (kurum_id IS DISTINCT FROM ( SELECT my_kurum_id() AS my_kurum_id))))));
CREATE TRIGGER trg_guard_teacher_privileged_update BEFORE UPDATE ON public.teachers FOR EACH ROW EXECUTE FUNCTION guard_teacher_privileged_update();
CREATE TRIGGER trg_set_teacher_kurum BEFORE INSERT ON public.teachers FOR EACH ROW EXECUTE FUNCTION set_teacher_kurum();
CREATE TRIGGER trg_teacher_admin_kurum BEFORE INSERT OR UPDATE OF is_admin, kurum_id ON public.teachers FOR EACH ROW EXECUTE FUNCTION teacher_admin_kurum();
CREATE TRIGGER trg_teacher_admin_revoked AFTER UPDATE ON public.teachers FOR EACH ROW WHEN (((old.is_admin IS TRUE) AND (new.is_admin IS NOT TRUE))) EXECUTE FUNCTION teacher_admin_revoked_close_kurum();
CREATE TRIGGER trg_zz_touch_updated_at BEFORE INSERT OR UPDATE ON public.teachers FOR EACH ROW EXECUTE FUNCTION bilir_touch_updated_at();
CREATE POLICY "user_seen_own_delete" ON public.user_seen AS PERMISSIVE FOR DELETE TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "user_seen_own_insert" ON public.user_seen AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));
CREATE POLICY "user_seen_own_select" ON public.user_seen AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_id = ( SELECT auth.uid() AS uid)));

-- 3) İŞLEVLER

-- admin_set_teacher_access(p_teacher_auth_id uuid, p_class_ids text[], p_student_ids text[]) [security definer]
CREATE OR REPLACE FUNCTION public.admin_set_teacher_access(p_teacher_auth_id uuid, p_class_ids text[], p_student_ids text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_class_count INTEGER := 0;
  v_student_count INTEGER := 0;
  v_bad TEXT;
BEGIN
  -- Aşama 98: genel yöneticinin kendi panelinde kurum öğretmeninin yetkileri görünmez; boş kayıtla silinmesin diye
  -- kurum öğretmenlerine yetki yalnızca kuruma geçilerek (kurum yöneticisi gözüyle) verilir.
  IF public.is_head_admin() AND EXISTS (SELECT 1 FROM public.teachers t WHERE t.auth_user_id = p_teacher_auth_id AND t.kurum_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Bu öğretmen bir kuruma bağlı. Yetkilerini üst menüdeki kurum seçiciyle o kuruma geçerek verin.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_head_admin() THEN
    IF NOT public.kurum_admin_manages_teacher_auth(p_teacher_auth_id) THEN
      RAISE EXCEPTION 'Yetkisiz işlem: Bu öğretmenin sınıf yetkilerini değiştiremezsiniz.' USING ERRCODE = '42501';
    END IF;
    SELECT x INTO v_bad FROM unnest(coalesce(p_class_ids, '{}')) x WHERE NOT public.kurum_has_class(x) LIMIT 1;
    IF v_bad IS NOT NULL THEN
      RAISE EXCEPTION 'Kurumunuza ait olmayan bir sınıf seçildi (%).', v_bad USING ERRCODE = '42501';
    END IF;
    SELECT x INTO v_bad FROM unnest(coalesce(p_student_ids, '{}')) x WHERE NOT public.kurum_has_student(x) LIMIT 1;
    IF v_bad IS NOT NULL THEN
      RAISE EXCEPTION 'Kurumunuza ait olmayan bir öğrenci seçildi (%).', v_bad USING ERRCODE = '42501';
    END IF;
  END IF;

  DELETE FROM public.teacher_class_access WHERE teacher_auth_id = p_teacher_auth_id;
  DELETE FROM public.teacher_student_access WHERE teacher_auth_id = p_teacher_auth_id;

  IF p_class_ids IS NOT NULL AND array_length(p_class_ids, 1) > 0 THEN
    INSERT INTO public.teacher_class_access (teacher_auth_id, class_id)
    SELECT p_teacher_auth_id, unnest(p_class_ids)
    ON CONFLICT (teacher_auth_id, class_id) DO NOTHING;
    GET DIAGNOSTICS v_class_count = ROW_COUNT;
  END IF;
  IF p_student_ids IS NOT NULL AND array_length(p_student_ids, 1) > 0 THEN
    INSERT INTO public.teacher_student_access (teacher_auth_id, student_id)
    SELECT p_teacher_auth_id, unnest(p_student_ids)
    ON CONFLICT (teacher_auth_id, student_id) DO NOTHING;
    GET DIAGNOSTICS v_student_count = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object('success', true, 'teacher_auth_id', p_teacher_auth_id,
                            'assigned_classes', v_class_count, 'assigned_students', v_student_count);
END $function$;

-- bilir_ping_attendance() [security definer]
CREATE OR REPLACE FUNCTION public.bilir_ping_attendance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ids text[] := '{}';
BEGIN
  IF TG_OP <> 'DELETE' AND jsonb_typeof(NEW.records) = 'array' THEN
    v_ids := v_ids || ARRAY(SELECT r ->> 'studentId' FROM jsonb_array_elements(NEW.records) r);
  END IF;
  IF TG_OP <> 'INSERT' AND jsonb_typeof(OLD.records) = 'array' THEN
    v_ids := v_ids || ARRAY(SELECT r ->> 'studentId' FROM jsonb_array_elements(OLD.records) r);
  END IF;
  PERFORM public.bilir_ping_students(v_ids);
  RETURN NULL;
EXCEPTION WHEN others THEN
  RETURN NULL; -- sinyal yazılamazsa yoklama kaydı asla engellenmez
END $function$;

-- bilir_ping_etut() [security definer]
CREATE OR REPLACE FUNCTION public.bilir_ping_etut()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ids text[] := '{}';
BEGIN
  IF TG_OP <> 'DELETE' AND jsonb_typeof(NEW.assigned_student_ids) = 'array' THEN
    v_ids := v_ids || ARRAY(SELECT jsonb_array_elements_text(NEW.assigned_student_ids));
  END IF;
  IF TG_OP <> 'INSERT' AND jsonb_typeof(OLD.assigned_student_ids) = 'array' THEN
    v_ids := v_ids || ARRAY(SELECT jsonb_array_elements_text(OLD.assigned_student_ids));
  END IF;
  PERFORM public.bilir_ping_students(v_ids);
  RETURN NULL;
EXCEPTION WHEN others THEN
  RETURN NULL; -- sinyal yazılamazsa etüt kaydı asla engellenmez
END $function$;

-- bilir_ping_students(p_ids text[]) [security definer]
CREATE OR REPLACE FUNCTION public.bilir_ping_students(p_ids text[])
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  INSERT INTO public.student_sync_ping (student_id, changed_at)
  SELECT DISTINCT x, now() FROM unnest(coalesce(p_ids, '{}'::text[])) x WHERE x IS NOT NULL AND x <> ''
  ON CONFLICT (student_id) DO UPDATE SET changed_at = excluded.changed_at
$function$;

-- bilir_touch_updated_at()
CREATE OR REPLACE FUNCTION public.bilir_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $function$;

-- branch_subjects(p_branch text)
CREATE OR REPLACE FUNCTION public.branch_subjects(p_branch text)
 RETURNS text[]
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  b TEXT := lower(translate(coalesce(p_branch, ''), 'İIıŞşĞğÜüÖöÇçÂâÎîÛû', 'iiissgguuooccaaiiuu'));
  r TEXT[] := '{}';
  raw TEXT;
BEGIN
  IF btrim(b) = '' THEN RETURN '{}'; END IF;
  IF b LIKE '%inkilap%' THEN r := array_append(r, 'T.C. İnkılap Tarihi'::text); END IF;
  IF b ~ '(^|[^a-z])fen([^a-z]|$)' OR b LIKE '%fen bil%' THEN r := array_append(r, 'Fen Bilimleri'::text); END IF;
  IF b LIKE '%matematik%' THEN r := array_append(r, 'Matematik'::text); END IF;
  IF b LIKE '%geometri%' THEN r := array_append(r, 'Geometri'::text); END IF;
  IF b LIKE '%turkce%' THEN r := array_append(r, 'Türkçe'::text); END IF;
  IF b LIKE '%edebiyat%' THEN r := array_append(r, 'Türk Dili ve Edebiyatı'::text); END IF;
  IF b LIKE '%sosyal%' THEN r := array_append(r, 'Sosyal Bilgiler'::text); END IF;
  IF b LIKE '%din kultur%' OR b LIKE '%ahlak%' OR b LIKE '%dkab%' THEN r := array_append(r, 'Din Kültürü'::text); END IF;
  IF b LIKE '%ingilizce%' OR b LIKE '%yabanci dil%' THEN r := array_append(r, 'İngilizce'::text); END IF;
  IF b LIKE '%tarih%' AND b NOT LIKE '%inkilap%' THEN r := array_append(r, 'Tarih'::text); END IF;
  IF b LIKE '%cografya%' THEN r := array_append(r, 'Coğrafya'::text); END IF;
  IF b LIKE '%fizik%' THEN r := array_append(r, 'Fizik'::text); END IF;
  IF b LIKE '%kimya%' THEN r := array_append(r, 'Kimya'::text); END IF;
  IF b LIKE '%biyoloji%' THEN r := array_append(r, 'Biyoloji'::text); END IF;
  IF b LIKE '%felsefe%' THEN r := array_append(r, 'Felsefe'::text); END IF;
  IF cardinality(r) = 0 THEN
    raw := btrim(regexp_replace(btrim(p_branch), '\s+(öğretmeni|ogretmeni|öğretmen|ogretmen)$', '', 'i'));
    IF raw <> '' THEN r := ARRAY[raw]; END IF;
  END IF;
  RETURN r;
END $function$;

-- can_delete_student(p_student_id text) [security definer]
CREATE OR REPLACE FUNCTION public.can_delete_student(p_student_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.is_head_admin()
      OR (public.kurum_student_adder() AND public.kurum_can('manage_students') AND EXISTS (
            SELECT 1 FROM public.students s
             WHERE s.id = p_student_id AND s.kurum_id IS NOT NULL AND s.kurum_id = public.my_kurum_id()))
$function$;

-- can_manage_class(p_class_id text) [security definer]
CREATE OR REPLACE FUNCTION public.can_manage_class(p_class_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.is_head_admin()
      OR (public.is_kurum_admin() AND public.kurum_can('manage_students') AND public.kurum_owns_class(p_class_id))
$function$;

-- can_manage_student(p_student_id text) [security definer]
CREATE OR REPLACE FUNCTION public.can_manage_student(p_student_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.is_head_admin()
      OR (public.kurum_student_editor() AND public.kurum_can('manage_students') AND EXISTS (
            SELECT 1 FROM public.students s
             WHERE s.id = p_student_id AND s.kurum_id IS NOT NULL AND s.kurum_id = public.my_kurum_id()))
$function$;

-- contact_role_ok() [security definer]
CREATE OR REPLACE FUNCTION public.contact_role_ok()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.is_admin()
      OR public.is_student()
      OR NOT public.kurum_roles_on()
      OR public.is_kurum_admin()
      OR CASE public.perm_mode('veli_bilgi')
           WHEN 'deny' THEN false
           WHEN 'allow' THEN true
           ELSE public.has_any_role(ARRAY['rehberlik', 'olcme_degerlendirme'])
         END
$function$;

-- current_student_class_id() [security definer]
CREATE OR REPLACE FUNCTION public.current_student_class_id()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ SELECT class_id FROM public.students WHERE auth_user_id = auth.uid() LIMIT 1 $function$;

-- current_student_id() [security definer]
CREATE OR REPLACE FUNCTION public.current_student_id()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT s.id FROM public.students s
   WHERE public.is_student() AND (s.auth_user_id = auth.uid() OR s.id = auth.uid()::text)
   LIMIT 1
$function$;

-- deneme_can_manage() [security definer]
CREATE OR REPLACE FUNCTION public.deneme_can_manage()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.is_head_admin()
      or ( (public.is_kurum_admin()
            or case public.perm_mode('deneme_yonet')
                 when 'deny' then false
                 when 'allow' then true
                 else public.has_role('olcme_degerlendirme')
               end)
           and exists ( select 1 from public.kurumlar k
                         where k.id::text = public.my_kurum_id()::text
                           and coalesce((k.modules ->> 'deneme')::boolean, false) ) )
$function$;

-- deneme_can_read() [security definer]
CREATE OR REPLACE FUNCTION public.deneme_can_read()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.deneme_can_manage()
      or ( (public.has_any_role(ARRAY['rehberlik', 'ogretmen', 'zumre_baskani', 'olcme_degerlendirme']) or public.section_explicit_allow('deneme'))
           and public.section_allowed('deneme')
           and exists ( select 1 from public.kurumlar k
                         where k.id::text = public.my_kurum_id()::text
                           and coalesce((k.modules ->> 'deneme')::boolean, false) ) )
$function$;

-- deneme_exam_in_scope(p_exam_id text) [security definer]
CREATE OR REPLACE FUNCTION public.deneme_exam_in_scope(p_exam_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists ( select 1 from public.deneme_exams e where e.id = p_exam_id
                   and (public.deneme_in_scope(e.kurum_id) or (public.is_head_admin() and e.kurum_id is null)) )
$function$;

-- deneme_exam_published(p_exam_id text) [security definer]
CREATE OR REPLACE FUNCTION public.deneme_exam_published(p_exam_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((select e.published from public.deneme_exams e where e.id = p_exam_id), false)
$function$;

-- deneme_genel_yoneticiye_tasi(p_exam_id text) [security definer]
CREATE OR REPLACE FUNCTION public.deneme_genel_yoneticiye_tasi(p_exam_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.head_gecis() THEN
    RAISE EXCEPTION 'Denemeyi yalnızca genel yönetici (kuruma geçmişken) geri alabilir.';
  END IF;
  UPDATE public.deneme_exams SET kurum_id = NULL, updated_at = now()
   WHERE id = p_exam_id AND kurum_id IS NOT NULL AND kurum_id = public.my_kurum_id()::text;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deneme bu kurumda bulunamadı.';
  END IF;
  RETURN true;
END $function$;

-- deneme_i_have_result(p_exam_id text) [security definer]
CREATE OR REPLACE FUNCTION public.deneme_i_have_result(p_exam_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists ( select 1 from public.deneme_results r
                   where r.exam_id = p_exam_id and r.student_id = public.deneme_my_student_id() )
$function$;

-- deneme_in_scope(p_kurum_id text) [security definer]
CREATE OR REPLACE FUNCTION public.deneme_in_scope(p_kurum_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.is_head_admin()
      or ( public.deneme_can_manage() and p_kurum_id is not null and p_kurum_id = public.my_kurum_id()::text )
$function$;

-- deneme_my_student_id() [security definer]
CREATE OR REPLACE FUNCTION public.deneme_my_student_id()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select s.id from public.students s
   where public.is_student() and (s.auth_user_id = auth.uid() or s.id = auth.uid()::text)
   limit 1
$function$;

-- duyuru_ok() [security definer]
CREATE OR REPLACE FUNCTION public.duyuru_ok()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT NOT public.kurum_roles_on()
      OR public.is_kurum_admin()
      OR CASE public.perm_mode('duyuru')
           WHEN 'deny' THEN false
           WHEN 'allow' THEN true
           ELSE public.has_any_role(ARRAY['rehberlik', 'olcme_degerlendirme'])
         END
$function$;

-- etut_assign_guard() [security definer]
CREATE OR REPLACE FUNCTION public.etut_assign_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_new text[] := array_remove(array[NEW.etut_teacher_id] || coalesce(NEW.etut_teacher_ids, '{}'::text[]), NULL);
  v_old text[];
  v_kurum uuid;
  v text;
BEGIN
  -- sunucu işlemleri (service_role) ve oturumsuz bakım işleri denetlenmez
  IF auth.uid() IS NULL OR public.is_head_admin() OR public.is_admin() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    v_old := array_remove(array[OLD.etut_teacher_id] || coalesce(OLD.etut_teacher_ids, '{}'::text[]), NULL);
  ELSE
    -- uygulama kaydı "upsert" ile yazar: satır zaten varsa INSERT tetiği de mevcut öğretmenlerle karşılaştırır
    SELECT array_remove(array[e.etut_teacher_id] || coalesce(e.etut_teacher_ids, '{}'::text[]), NULL)
      INTO v_old FROM public.etuts e WHERE e.id = NEW.id;
  END IF;
  IF v_old IS NOT NULL THEN
    -- öğretmen değişmiyorsa (yoklama, yorum, saat değişikliği) bugünkü kurallar geçerlidir
    IF v_new @> v_old AND v_old @> v_new THEN
      RETURN NEW;
    END IF;
  END IF;
  IF cardinality(v_new) = 0 OR v_new <@ public.priv_my_teacher_ids() THEN
    RETURN NEW;  -- kendine etüt
  END IF;
  IF NOT (public.is_kurum_admin() OR (public.kurum_roles_on() AND public.has_role('rehberlik'))) THEN
    RAISE EXCEPTION 'Başka öğretmene etüt yalnızca Rehberlik ve idare tarafından verilebilir.' USING ERRCODE = '42501';
  END IF;
  v_kurum := public.my_kurum_id();
  FOREACH v IN ARRAY v_new LOOP
    IF v = ANY (public.priv_my_teacher_ids()) THEN
      CONTINUE;
    END IF;
    -- Aşama 132: idareye (Müdür, Müdür Yrd., yönetici) etüt verilmez
    IF public.etut_idare_ogretmeni(v) THEN
      RAISE EXCEPTION 'Müdür, Müdür Yardımcısı ve yönetici hesaplarına etüt verilmez.' USING ERRCODE = '42501';
    END IF;
    IF v LIKE 'ext-%' THEN
      IF NOT EXISTS (SELECT 1 FROM public.etut_teachers e WHERE e.id::text = substr(v, 5) AND e.kurum_id IS NOT DISTINCT FROM v_kurum) THEN
        RAISE EXCEPTION 'Etüt öğretmeni bu kuruma kayıtlı değil.' USING ERRCODE = '42501';
      END IF;
    ELSIF NOT EXISTS (SELECT 1 FROM public.teachers t WHERE t.id = v AND t.kurum_id IS NOT DISTINCT FROM v_kurum) THEN
      RAISE EXCEPTION 'Etüt öğretmeni bu kuruma kayıtlı değil.' USING ERRCODE = '42501';
    END IF;
  END LOOP;
  RETURN NEW;
END $function$;

-- etut_can_view(p_teacher_id text, p_teacher_ids text[], p_notes text) [security definer]
CREATE OR REPLACE FUNCTION public.etut_can_view(p_teacher_id text, p_teacher_ids text[], p_notes text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  m jsonb;
  v_owner text;
BEGIN
  IF public.etut_owner_ok(p_teacher_id, p_teacher_ids, p_notes) THEN
    RETURN true;
  END IF;
  IF NOT public.kurum_roles_on() OR NOT public.has_role('rehberlik') THEN
    RETURN false;
  END IF;
  m := public.etut_meta(p_notes);
  FOREACH v_owner IN ARRAY array_remove(array[p_teacher_id, nullif(btrim(coalesce(m ->> 'createdById', '')), '')] || coalesce(p_teacher_ids, '{}'::text[]), null) LOOP
    IF EXISTS (
      SELECT 1 FROM public.teachers t
       WHERE (t.id = v_owner OR t.auth_user_id::text = v_owner)
         AND t.kurum_id IS NOT NULL AND t.kurum_id = public.my_kurum_id()
    ) THEN
      RETURN true;
    END IF;
  END LOOP;
  RETURN false;
END $function$;

-- etut_idare_adina(p_teacher_id text, p_teacher_ids text[]) [security definer]
CREATE OR REPLACE FUNCTION public.etut_idare_adina(p_teacher_id text, p_teacher_ids text[])
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ids text[] := array_remove(array[p_teacher_id] || coalesce(p_teacher_ids, '{}'::text[]), NULL);
  v text;
BEGIN
  IF NOT public.idare_ders_kapali() OR cardinality(v_ids) = 0 THEN
    RETURN false;
  END IF;
  IF v_ids && public.priv_my_teacher_ids() THEN
    RETURN false;
  END IF;
  FOREACH v IN ARRAY v_ids LOOP
    IF v LIKE 'ext-%' THEN
      IF NOT EXISTS (SELECT 1 FROM public.etut_teachers e WHERE e.id::text = substr(v, 5) AND e.kurum_id = public.my_kurum_id()) THEN
        RETURN false;
      END IF;
    ELSIF NOT EXISTS (SELECT 1 FROM public.teachers t WHERE t.id = v AND t.kurum_id IS NOT NULL AND t.kurum_id = public.my_kurum_id()) THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END $function$;

-- etut_idare_ogretmeni(p_teacher_id text) [security definer]
CREATE OR REPLACE FUNCTION public.etut_idare_ogretmeni(p_teacher_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.teachers t
     WHERE t.id = p_teacher_id
       AND (coalesce(t.is_admin, false)
            OR EXISTS (SELECT 1 FROM public.teacher_roles r
                        WHERE r.teacher_id = t.id AND r.role IN ('mudur', 'mudur_yardimcisi')))
  )
$function$;

-- etut_iso(p timestamp with time zone)
CREATE OR REPLACE FUNCTION public.etut_iso(p timestamp with time zone)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case when p is null then null
              else to_char(p at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end
$function$;

-- etut_kopru_once() [security definer]
CREATE OR REPLACE FUNCTION public.etut_kopru_once()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  m  jsonb;
  m0 jsonb;
  mo jsonb := '{}'::jsonb;
  v_t text;
  v_j jsonb;
  v_base jsonb;
begin
  if coalesce(current_setting('bilir.etut_kopru', true), '') = '1' then
    return new;
  end if;
  m := public.etut_meta(new.notes);
  if not (m ? '__etut_meta__') then
    return new;  -- eski düz metin notlar: dokunulmaz
  end if;
  m0 := m;
  if tg_op = 'UPDATE' then
    mo := public.etut_meta(old.notes);
  end if;

  -- teacherFeedback  <->  teacher_feedback
  if m ? 'teacherFeedback' and (tg_op = 'INSERT' or (m -> 'teacherFeedback') is distinct from (mo -> 'teacherFeedback')) then
    v_t := m ->> 'teacherFeedback';
  elsif tg_op = 'UPDATE' and new.teacher_feedback is distinct from old.teacher_feedback then
    v_t := new.teacher_feedback;
  elsif tg_op = 'UPDATE' then
    v_t := coalesce(old.teacher_feedback, mo ->> 'teacherFeedback');
  else
    v_t := new.teacher_feedback;
  end if;
  new.teacher_feedback := v_t;
  if v_t is not null then
    m := jsonb_set(m, '{teacherFeedback}', to_jsonb(v_t));
  end if;

  -- userNotes  <->  user_notes
  if m ? 'userNotes' and (tg_op = 'INSERT' or (m -> 'userNotes') is distinct from (mo -> 'userNotes')) then
    v_t := m ->> 'userNotes';
  elsif tg_op = 'UPDATE' and new.user_notes is distinct from old.user_notes then
    v_t := new.user_notes;
  elsif tg_op = 'UPDATE' then
    v_t := coalesce(old.user_notes, mo ->> 'userNotes');
  else
    v_t := new.user_notes;
  end if;
  new.user_notes := v_t;
  if v_t is not null then
    m := jsonb_set(m, '{userNotes}', to_jsonb(v_t));
  end if;

  -- attendanceTakenBy  <->  attendance_taken_by
  if m ? 'attendanceTakenBy' and (tg_op = 'INSERT' or (m -> 'attendanceTakenBy') is distinct from (mo -> 'attendanceTakenBy')) then
    v_j := nullif(m -> 'attendanceTakenBy', 'null'::jsonb);
  elsif tg_op = 'UPDATE' and new.attendance_taken_by is distinct from old.attendance_taken_by then
    v_j := new.attendance_taken_by;
  elsif tg_op = 'UPDATE' then
    v_j := coalesce(old.attendance_taken_by, nullif(mo -> 'attendanceTakenBy', 'null'::jsonb));
  else
    v_j := new.attendance_taken_by;
  end if;
  new.attendance_taken_by := v_j;
  if v_j is not null then
    m := jsonb_set(m, '{attendanceTakenBy}', v_j);
  end if;

  -- studentAttendance: eski + gelen anahtarlar korunur, geçerli kayıtlar kazanan kayıtla değişir
  if jsonb_typeof(m -> 'studentAttendance') = 'object'
     or jsonb_typeof(mo -> 'studentAttendance') = 'object'
     or exists (select 1 from public.etut_yoklama y where y.etut_id = new.id) then
    v_base := (case when jsonb_typeof(mo -> 'studentAttendance') = 'object' then mo -> 'studentAttendance' else '{}'::jsonb end)
           || (case when jsonb_typeof(m -> 'studentAttendance') = 'object' then m -> 'studentAttendance' else '{}'::jsonb end);
    m := jsonb_set(m, '{studentAttendance}',
                   v_base || public.etut_yoklama_ustune(new.id, new.assigned_student_ids,
                                                        case when jsonb_typeof(m -> 'studentAttendance') = 'object'
                                                             then m -> 'studentAttendance' else '{}'::jsonb end));
  end if;

  if m is distinct from m0 then
    new.notes := m::text;
  end if;
  return new;
end $function$;

-- etut_kopru_sonra() [security definer]
CREATE OR REPLACE FUNCTION public.etut_kopru_sonra()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  m jsonb;
begin
  if coalesce(current_setting('bilir.etut_kopru', true), '') = '1' then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.notes is not distinct from old.notes then
    return null;
  end if;
  m := public.etut_meta(new.notes);
  if jsonb_typeof(m -> 'studentAttendance') is distinct from 'object' then
    return null;
  end if;
  perform set_config('bilir.etut_kopru', '1', true);
  perform public.etut_yoklama_yaz(new.id, new.assigned_student_ids, m -> 'studentAttendance', null);
  perform set_config('bilir.etut_kopru', '', true);
  return null;
end $function$;

-- etut_meta(p_notes text)
CREATE OR REPLACE FUNCTION public.etut_meta(p_notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if p_notes is null or left(btrim(p_notes), 1) <> '{' then
    return '{}'::jsonb;
  end if;
  return p_notes::jsonb;
exception when others then
  return '{}'::jsonb;
end $function$;

-- etut_only() [security definer]
CREATE OR REPLACE FUNCTION public.etut_only()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.has_role('etut_ogretmeni')
     AND NOT public.has_any_role(ARRAY['mudur', 'mudur_yardimcisi', 'rehberlik', 'olcme_degerlendirme', 'zumre_baskani', 'ogretmen'])
$function$;

-- etut_owner_list(p_teacher_id text, p_teacher_ids text[], p_notes text)
CREATE OR REPLACE FUNCTION public.etut_owner_list(p_teacher_id text, p_teacher_ids text[], p_notes text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT array_remove(array[p_teacher_id, nullif(btrim(coalesce(public.etut_meta(p_notes) ->> 'createdById', '')), '')]
                      || coalesce(p_teacher_ids, '{}'::text[]), NULL)
$function$;

-- etut_owner_ok(p_teacher_id text, p_teacher_ids text[], p_notes text) [security definer]
CREATE OR REPLACE FUNCTION public.etut_owner_ok(p_teacher_id text, p_teacher_ids text[], p_notes text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  m jsonb := public.etut_meta(p_notes);
  v_created text := nullif(btrim(coalesce(m ->> 'createdById', '')), '');
  v_owner_ids text[];
begin
  if public.is_head_admin() then
    return true;
  end if;
  if auth.uid() is null then
    return false;
  end if;

  v_owner_ids := array_remove(array[p_teacher_id, v_created] || coalesce(p_teacher_ids, '{}'::text[]), null);

  -- a) Sahibi benim (kaydeden ya da etüt öğretmeni)
  if exists (
    select 1 from public.teachers t
     where t.auth_user_id = auth.uid()
       and coalesce(t.status, 'approved') = 'approved'
       and t.id = any (v_owner_ids)
  ) then
    return true;
  end if;

  -- b) Eski kayıtlar: kimlik yoksa öğretmen adı eşleşmesi (yalnızca kurumsuz hesaplar; başka kurumda aynı adlı kişi göremez)
  if exists (
    select 1 from public.teachers t
     where t.auth_user_id = auth.uid()
       and coalesce(t.status, 'approved') = 'approved'
       and btrim(coalesce(t.name, '')) <> ''
       and t.kurum_id is null  -- Aşama 96: sahibi yazılı olmayan eski etütler yalnızca kurumsuz (sizin) hesaplarınıza açıktır
       and (
         ( p_teacher_id is null
           and cardinality(coalesce(p_teacher_ids, '{}'::text[])) = 0
           and lower(btrim(coalesce(m ->> 'teacherName', ''))) = lower(btrim(t.name)) )
         or
         ( v_created is null
           and lower(btrim(coalesce(m ->> 'createdByName', ''))) = lower(btrim(t.name)) )
       )
  ) then
    return true;
  end if;

  -- c) Kurum yöneticisi: sahibi KENDİ kurumuna kayıtlı öğretmen
  if public.is_kurum_admin() and exists (
    select 1 from public.teachers t
     where t.id = any (v_owner_ids)
       and t.kurum_id is not null
       and t.kurum_id = public.my_kurum_id()
  ) then
    return true;
  end if;

  return false;
end $function$;

-- etut_shared_schedule() [security definer]
CREATE OR REPLACE FUNCTION public.etut_shared_schedule()
 RETURNS TABLE(id text, subject text, date text, "time" text, duration integer, location text, assigned_student_ids jsonb, etut_teacher_id text, etut_teacher_ids text[], created_at timestamp with time zone, meta jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select e.id, e.subject, e.date, e.time, e.duration, e.location, e.assigned_student_ids,
         e.etut_teacher_id, e.etut_teacher_ids, e.created_at,
         jsonb_strip_nulls(jsonb_build_object(
           'teacherId', x.m -> 'teacherId',
           'teacherName', x.m -> 'teacherName',
           'teacherIds', x.m -> 'teacherIds',
           'teacherNames', x.m -> 'teacherNames',
           'teacherBranch', x.m -> 'teacherBranch',
           'lessonPeriod', x.m -> 'lessonPeriod',
           'duration', x.m -> 'duration',
           'gradeLevel', x.m -> 'gradeLevel',
           'schoolLevel', x.m -> 'schoolLevel',
           'createdById', x.m -> 'createdById',
           'createdByName', x.m -> 'createdByName'
         )) as meta
    from public.etuts e
    cross join lateral (select public.etut_meta(e.notes) as m) x
   where public.is_teacher()
     and jsonb_typeof(coalesce(e.assigned_student_ids, '[]'::jsonb)) = 'array'
     and not public.etut_owner_ok(e.etut_teacher_id, e.etut_teacher_ids, e.notes)
     and public.etut_world_ok(e.etut_teacher_id, e.etut_teacher_ids, e.notes)  -- Aşama 96: yalnızca kendi kurumunun (ya da kurumsuzların) etütleri
     and exists (
       select 1
         from jsonb_array_elements_text(e.assigned_student_ids) sid(value)
        where sid.value in (select public.my_student_ids())
     )
$function$;

-- etut_teacher_options() [security definer]
CREATE OR REPLACE FUNCTION public.etut_teacher_options()
 RETURNS TABLE(option_id text, name text, subjects text[], kind text, has_email boolean, row_id uuid, is_me boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_head BOOLEAN := public.is_head_admin();
  v_admin BOOLEAN := public.is_head_admin() OR public.is_kurum_admin();
  -- Aşama 111: Rehberlik de kurumun tüm öğretmenlerine etüt verir. Aşama 143: kişiye özel "etut_ata" izni
  v_assign BOOLEAN := v_admin OR (public.kurum_roles_on() AND CASE public.perm_mode('etut_ata')
                                                               WHEN 'deny' THEN false
                                                               WHEN 'allow' THEN true
                                                               ELSE public.has_role('rehberlik') END);
  v_kurum UUID := public.my_kurum_id();
  v_me TEXT;
BEGIN
  IF NOT (public.is_teacher() OR v_head) THEN
    RETURN;
  END IF;
  SELECT t.id INTO v_me
    FROM public.teachers t
   WHERE t.auth_user_id = auth.uid() AND (v_head OR coalesce(t.status, 'approved') = 'approved')
   LIMIT 1;
  IF v_me IS NULL AND NOT v_head THEN
    RETURN;
  END IF;
  RETURN QUERY
  WITH opts AS (
    SELECT t.id::text AS option_id,
           t.name::text AS name,
           ARRAY(SELECT DISTINCT x FROM unnest(public.branch_subjects(t.branch) || coalesce(et.subjects, '{}'::text[])) x
                  WHERE x <> '')::text[] AS subjects,
           'system'::text AS kind,
           (coalesce(t.email, '') <> '' OR coalesce(et.email, '') <> '') AS has_email,
           et.id AS row_id,
           (t.id = v_me) AS is_me
      FROM public.teachers t
      LEFT JOIN public.etut_teachers et ON et.teacher_id = t.id
     WHERE coalesce(t.status, 'approved') = 'approved'
       AND (coalesce(et.active, true) OR t.id = v_me)
       AND t.kurum_id IS NOT DISTINCT FROM v_kurum  -- Aşama 97: genel yönetici yalnızca kendi (kurumsuz) öğretmenlerini görür
    UNION ALL
    SELECT ('ext-' || et.id::text), et.name, et.subjects, 'external'::text,
           (coalesce(et.email, '') <> ''), et.id, false
      FROM public.etut_teachers et
     WHERE et.teacher_id IS NULL AND et.active
       AND et.kurum_id IS NOT DISTINCT FROM v_kurum
  )
  SELECT o.option_id, o.name, o.subjects, o.kind, o.has_email, o.row_id, coalesce(o.is_me, false)
    FROM opts o
   WHERE (v_assign OR coalesce(o.is_me, false))  -- Aşama 111: diğer öğretmenler yalnız kendine etüt verir
     -- Aşama 132: Müdür, Müdür Yardımcısı ve yönetici hesaplarına etüt verilmez (kendisi ayara göre kendine verebilir)
     AND (coalesce(o.is_me, false) OR o.kind = 'external' OR NOT public.etut_idare_ogretmeni(o.option_id));
END $function$;

-- etut_ts(p text)
CREATE OR REPLACE FUNCTION public.etut_ts(p text)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if p is null or btrim(p) = '' then
    return null;
  end if;
  return date_trunc('milliseconds', p::timestamptz);
exception when others then
  return null;
end $function$;

-- etut_world_ok(p_teacher_id text, p_teacher_ids text[], p_notes text) [security definer]
CREATE OR REPLACE FUNCTION public.etut_world_ok(p_teacher_id text, p_teacher_ids text[], p_notes text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  m jsonb := public.etut_meta(p_notes);
  v_owners text[] := array_remove(array[p_teacher_id, nullif(btrim(coalesce(m ->> 'createdById', '')), '')] || coalesce(p_teacher_ids, '{}'::text[]), NULL);
BEGIN
  IF public.is_head_admin() THEN RETURN true; END IF;
  IF cardinality(v_owners) = 0 THEN RETURN public.my_kurum_id() IS NULL; END IF;
  RETURN EXISTS (SELECT 1 FROM public.teachers t
                  WHERE (t.id = ANY (v_owners) OR t.auth_user_id::text = ANY (v_owners))
                    AND t.kurum_id IS NOT DISTINCT FROM public.my_kurum_id());
END $function$;

-- etut_yoklama_ayna() [security definer]
CREATE OR REPLACE FUNCTION public.etut_yoklama_ayna()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_etuts text[];
  v_students text[];
begin
  if coalesce(current_setting('bilir.etut_kopru', true), '') = '1' then
    return null;  -- değişiklik zaten notes'tan geldi
  end if;

  if tg_op = 'DELETE' then
    select array_agg(distinct o.etut_id), array_agg(distinct o.student_id) into v_etuts, v_students from eski o;
  else
    select array_agg(distinct n.etut_id), array_agg(distinct n.student_id) into v_etuts, v_students from yeni n;
  end if;
  if v_etuts is null then
    return null;
  end if;

  perform set_config('bilir.etut_kopru', '1', true);
  if tg_op = 'DELETE' then
    update public.etuts e
       set notes = jsonb_set(x.m, '{studentAttendance}',
                     (case when jsonb_typeof(x.m -> 'studentAttendance') = 'object' then x.m -> 'studentAttendance' else '{}'::jsonb end)
                     - array(select o.student_id from eski o where o.etut_id = e.id)
                     || public.etut_yoklama_json(e.id))::text
      from (select e2.id, public.etut_meta(e2.notes) as m from public.etuts e2 where e2.id = any (v_etuts)) x
     where e.id = x.id and x.m ? '__etut_meta__';
  else
    update public.etuts e
       set notes = jsonb_set(x.m, '{studentAttendance}',
                     (case when jsonb_typeof(x.m -> 'studentAttendance') = 'object' then x.m -> 'studentAttendance' else '{}'::jsonb end)
                     || public.etut_yoklama_json(e.id))::text
      from (select e2.id, public.etut_meta(e2.notes) as m from public.etuts e2 where e2.id = any (v_etuts)) x
     where e.id = x.id and x.m ? '__etut_meta__';
  end if;
  perform set_config('bilir.etut_kopru', '', true);

  begin
    perform public.bilir_ping_students(v_students);  -- öğrenci ekranı anında yenilensin
  exception when others then
    null;  -- sinyal yazılamazsa yoklama kaydı asla engellenmez
  end;
  return null;
end $function$;

-- etut_yoklama_gelen(p_assigned jsonb, p_in jsonb)
CREATE OR REPLACE FUNCTION public.etut_yoklama_gelen(p_assigned jsonb, p_in jsonb)
 RETURNS TABLE(k text, name text, status text, note text, topic text, by_name text, marked_at timestamp with time zone, ts timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select x.k,
         nullif(x.v ->> 'studentName', ''),
         x.v ->> 'status',
         coalesce(x.v ->> 'note', ''),
         coalesce(x.v ->> 'topic', ''),
         nullif(btrim(coalesce(x.v ->> 'markedBy', '')), ''),
         public.etut_ts(x.v ->> 'markedAt'),
         coalesce(public.etut_ts(x.v ->> 'updatedAt'), public.etut_ts(x.v ->> 'markedAt'))
    from jsonb_each(case when jsonb_typeof(p_in) = 'object' then p_in else '{}'::jsonb end) as x(k, v)
   where jsonb_typeof(x.v) = 'object'
     and (x.v ->> 'status') in ('present', 'absent', 'excused', 'late')
     and jsonb_typeof(p_assigned) = 'array'
     and p_assigned ? x.k
$function$;

-- etut_yoklama_json(p_etut_id text)
CREATE OR REPLACE FUNCTION public.etut_yoklama_json(p_etut_id text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(jsonb_object_agg(y.student_id,
           public.etut_yoklama_kayit(y.student_id, y.student_name, y.status, y.note, y.topic,
                                     y.marked_by, y.marked_at, y.changed_at)), '{}'::jsonb)
    from public.etut_yoklama y
   where y.etut_id = p_etut_id
$function$;

-- etut_yoklama_kayit(p_sid text, p_name text, p_status text, p_note text, p_topic text, p_by text, p_at timestamp with time zone, p_changed timestamp with time zone)
CREATE OR REPLACE FUNCTION public.etut_yoklama_kayit(p_sid text, p_name text, p_status text, p_note text, p_topic text, p_by text, p_at timestamp with time zone, p_changed timestamp with time zone)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select jsonb_strip_nulls(jsonb_build_object(
    'studentId', p_sid,
    'studentName', p_name,
    'status', p_status,
    'note', coalesce(p_note, ''),
    'topic', nullif(p_topic, ''),
    'markedBy', p_by,
    'markedAt', public.etut_iso(p_at),
    'updatedAt', public.etut_iso(p_changed)
  ))
$function$;

-- etut_yoklama_once()
CREATE OR REPLACE FUNCTION public.etut_yoklama_once()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if tg_op = 'UPDATE' and (new.etut_id <> old.etut_id or new.student_id <> old.student_id) then
    raise exception 'Yoklama kaydının etüdü ya da öğrencisi değiştirilemez.' using errcode = '42501';
  end if;
  new.note := coalesce(new.note, '');
  new.topic := coalesce(new.topic, '');
  new.marked_by := nullif(btrim(coalesce(new.marked_by, '')), '');
  new.marked_at := date_trunc('milliseconds', new.marked_at);
  new.changed_at := date_trunc('milliseconds', coalesce(new.changed_at, now()));
  if tg_op = 'UPDATE' then
    if new.changed_at < old.changed_at then
      return null;  -- daha eski bir kopya yeni yoklamayı ezemez
    end if;
    if (new.student_name, new.status, new.note, new.topic, new.marked_by, new.marked_at, new.changed_at)
       is not distinct from
       (old.student_name, old.status, old.note, old.topic, old.marked_by, old.marked_at, old.changed_at) then
      return null;  -- değişiklik yok: boşuna yazma / yayın yapılmaz
    end if;
  end if;
  new.updated_by := auth.uid();
  return new;
end $function$;

-- etut_yoklama_ustune(p_etut_id text, p_assigned jsonb, p_in jsonb)
CREATE OR REPLACE FUNCTION public.etut_yoklama_ustune(p_etut_id text, p_assigned jsonb, p_in jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with i as (select * from public.etut_yoklama_gelen(p_assigned, p_in)),
       t as (select * from public.etut_yoklama y where y.etut_id = p_etut_id)
  select coalesce(jsonb_object_agg(coalesce(t.student_id, i.k),
           case when t.student_id is null
                  or (i.ts is not null and i.ts >= t.changed_at)
                then public.etut_yoklama_kayit(i.k, coalesce(i.name, t.student_name), i.status, i.note, i.topic,
                                               i.by_name, i.marked_at,
                                               coalesce(i.ts, date_trunc('milliseconds', now())))
                else public.etut_yoklama_kayit(t.student_id, t.student_name, t.status, t.note, t.topic,
                                               t.marked_by, t.marked_at, t.changed_at)
           end), '{}'::jsonb)
    from t full join i on i.k = t.student_id
$function$;

-- etut_yoklama_yaz(p_etut_id text, p_assigned jsonb, p_in jsonb, p_fallback timestamp with time zone)
CREATE OR REPLACE FUNCTION public.etut_yoklama_yaz(p_etut_id text, p_assigned jsonb, p_in jsonb, p_fallback timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  insert into public.etut_yoklama as y
         (etut_id, student_id, student_name, status, note, topic, marked_by, marked_at, changed_at)
  select p_etut_id, i.k, i.name, i.status, i.note, i.topic, i.by_name, i.marked_at,
         coalesce(i.ts, date_trunc('milliseconds', p_fallback), date_trunc('milliseconds', now()))
    from public.etut_yoklama_gelen(p_assigned, p_in) i
  on conflict (etut_id, student_id) do nothing;

  update public.etut_yoklama y
     set student_name = coalesce(i.name, y.student_name),
         status = i.status, note = i.note, topic = i.topic,
         marked_by = i.by_name, marked_at = i.marked_at, changed_at = i.ts
    from public.etut_yoklama_gelen(p_assigned, p_in) i
   where y.etut_id = p_etut_id
     and y.student_id = i.k
     and i.ts is not null
     and i.ts >= y.changed_at
     and (y.student_name, y.status, y.note, y.topic, y.marked_by, y.marked_at, y.changed_at)
         is distinct from
         (coalesce(i.name, y.student_name), i.status, i.note, i.topic, i.by_name, i.marked_at, i.ts);
end $function$;

-- etut_yoklama_yazabilir(p_etut_id text, p_student_id text)
CREATE OR REPLACE FUNCTION public.etut_yoklama_yazabilir(p_etut_id text, p_student_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select (select public.is_admin())
      or ((select public.is_teacher())
          and exists (select 1 from public.etuts e
                       where e.id = p_etut_id
                         and jsonb_typeof(e.assigned_student_ids) = 'array'
                         and e.assigned_student_ids ? p_student_id
                         and public.etut_owner_ok(e.etut_teacher_id, e.etut_teacher_ids, e.notes))
          and public.teacher_has_student_access(p_student_id, null::text))
$function$;

-- etut_zumre_rows() [security definer]
CREATE OR REPLACE FUNCTION public.etut_zumre_rows()
 RETURNS TABLE(id text, subject text, topic text, date text, "time" text, duration integer, location text, notes text, assigned_student_ids jsonb, created_at timestamp with time zone, etut_teacher_id text, etut_teacher_ids text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r record;
  m jsonb;
  att jsonb;
  v_owner text;
  v_ok boolean;
BEGIN
  IF NOT public.is_teacher() OR NOT public.kurum_roles_on() OR NOT public.has_role('zumre_baskani')
     OR public.has_role('rehberlik') OR public.is_kurum_admin() THEN
    RETURN;
  END IF;
  FOR r IN SELECT e.* FROM public.etuts e LOOP
    IF public.etut_owner_ok(r.etut_teacher_id, r.etut_teacher_ids, r.notes) THEN
      CONTINUE; -- kendi etüdü zaten tam gelir
    END IF;
    m := public.etut_meta(r.notes);
    v_ok := false;
    FOREACH v_owner IN ARRAY array_remove(array[r.etut_teacher_id, nullif(btrim(coalesce(m ->> 'createdById', '')), '')] || coalesce(r.etut_teacher_ids, '{}'::text[]), null) LOOP
      IF public.zumre_peer(v_owner) THEN
        v_ok := true;
        EXIT;
      END IF;
    END LOOP;
    CONTINUE WHEN NOT v_ok;
    m := coalesce(m, '{}'::jsonb);
    -- Aşama 178: yoklama ve etüt notu yeni yapıdan
    att := (CASE WHEN jsonb_typeof(m -> 'studentAttendance') = 'object' THEN m -> 'studentAttendance' ELSE '{}'::jsonb END)
           || public.etut_yoklama_json(r.id);
    IF att <> '{}'::jsonb OR jsonb_typeof(m -> 'studentAttendance') = 'object' THEN
      m := jsonb_set(m, '{studentAttendance}', att);
    END IF;
    IF r.user_notes IS NOT NULL THEN
      m := jsonb_set(m, '{userNotes}', to_jsonb(r.user_notes));
    END IF;
    IF r.attendance_taken_by IS NOT NULL THEN
      m := jsonb_set(m, '{attendanceTakenBy}', r.attendance_taken_by);
    END IF;
    IF jsonb_typeof(m -> 'studentAttendance') = 'object' THEN
      SELECT coalesce(jsonb_object_agg(k, CASE WHEN jsonb_typeof(v) = 'object' THEN v || '{"note": "", "topic": ""}'::jsonb ELSE v END), '{}'::jsonb)
        INTO att FROM jsonb_each(m -> 'studentAttendance') AS x(k, v);
      m := jsonb_set(m, '{studentAttendance}', att);
    END IF;
    m := m || jsonb_build_object('teacherFeedback', '', '__etut_meta__', true);
    id := r.id; subject := r.subject; topic := r.topic; date := r.date; "time" := r.time; duration := r.duration;
    location := r.location; notes := m::text; assigned_student_ids := r.assigned_student_ids; created_at := r.created_at;
    etut_teacher_id := r.etut_teacher_id; etut_teacher_ids := r.etut_teacher_ids;
    RETURN NEXT;
  END LOOP;
END $function$;

-- grade_classes_for(p_kurum uuid, p_grades integer[], p_all boolean) [security definer]
CREATE OR REPLACE FUNCTION public.grade_classes_for(p_kurum uuid, p_grades integer[], p_all boolean)
 RETURNS SETOF text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT c.id
  FROM public.classes c
  WHERE (p_all OR c.level = ANY (coalesce(p_grades, '{}')))
    AND (
      c.kurum_id IS NOT DISTINCT FROM p_kurum
      OR (p_kurum IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.kurum_class_grants g WHERE g.kurum_id = p_kurum AND g.class_id = c.id))
    );
$function$;

-- guard_contact_parents()
CREATE OR REPLACE FUNCTION public.guard_contact_parents()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF current_user = 'authenticated' AND public.is_student() AND NOT public.is_admin() THEN
    IF NEW.parents IS DISTINCT FROM OLD.parents THEN
      RAISE EXCEPTION 'Veli bilgilerini yalnızca öğretmen veya yönetici değiştirebilir.' USING ERRCODE = '42501';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $function$;

-- guard_etut_creator()
CREATE OR REPLACE FUNCTION public.guard_etut_creator()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_new JSONB;
  v_old JSONB;
  v_tid TEXT;
BEGIN
  IF current_user <> 'authenticated' OR public.is_admin() THEN
    RETURN NEW;
  END IF;
  BEGIN
    v_new := NEW.notes::jsonb;
  EXCEPTION WHEN others THEN
    RETURN NEW;
  END;
  IF v_new IS NULL OR jsonb_typeof(v_new) <> 'object' OR NOT (v_new ? '__etut_meta__') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT t.id INTO v_tid FROM public.teachers t WHERE t.auth_user_id = auth.uid() LIMIT 1;
    IF v_tid IS NOT NULL THEN
      v_new := jsonb_set(v_new, '{createdById}', to_jsonb(v_tid), true);
    ELSE
      v_new := v_new - 'createdById';
    END IF;
  ELSE
    v_old := NULL;
    BEGIN
      v_old := OLD.notes::jsonb;
    EXCEPTION WHEN others THEN
      v_old := NULL;
    END;
    IF v_old IS NOT NULL AND jsonb_typeof(v_old) = 'object' AND v_old ? 'createdById' THEN
      v_new := jsonb_set(v_new, '{createdById}', v_old -> 'createdById', true);
    ELSE
      v_new := v_new - 'createdById';
    END IF;
  END IF;
  NEW.notes := v_new::text;
  RETURN NEW;
END $function$;

-- guard_homework_submission()
CREATE OR REPLACE FUNCTION public.guard_homework_submission()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at := now();
  IF current_user = 'authenticated' AND public.is_student() AND NOT public.is_admin() THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.score IS NOT NULL OR NEW.feedback IS NOT NULL OR NEW.check_status IS NOT NULL THEN
        RAISE EXCEPTION 'Öğrenci teslimine puan veya kontrol durumu yazamaz.' USING ERRCODE = '42501';
      END IF;
    ELSE
      IF NEW.homework_id IS DISTINCT FROM OLD.homework_id
         OR NEW.student_id IS DISTINCT FROM OLD.student_id
         OR NEW.score IS DISTINCT FROM OLD.score
         OR NEW.feedback IS DISTINCT FROM OLD.feedback
         OR NEW.check_status IS DISTINCT FROM OLD.check_status THEN
        RAISE EXCEPTION 'Öğrenci teslimindeki puanı veya öğretmen kontrolünü değiştiremez.' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- guard_student_insert()
CREATE OR REPLACE FUNCTION public.guard_student_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF current_user = 'authenticated' AND NOT public.is_admin() THEN
    IF NEW.auth_user_id IS NOT NULL OR COALESCE(NEW.status, 'active') <> 'active' THEN
      RAISE EXCEPTION 'Yeni öğrenci kaydı giriş hesabı bağlantısı veya hesap durumu ile oluşturulamaz.'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- guard_student_parent_contact()
CREATE OR REPLACE FUNCTION public.guard_student_parent_contact()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF current_user = 'authenticated' AND public.is_student() AND NOT public.is_admin() THEN
    IF NEW.parents IS DISTINCT FROM OLD.parents THEN
      RAISE EXCEPTION 'Veli bilgilerini yalnızca öğretmen veya yönetici değiştirebilir.'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- guard_student_self_update()
CREATE OR REPLACE FUNCTION public.guard_student_self_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;

-- guard_teacher_privileged_update()
CREATE OR REPLACE FUNCTION public.guard_teacher_privileged_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_kurum_admin_edit BOOLEAN;
BEGIN
  IF current_user = 'authenticated' AND NOT public.is_head_admin() THEN
    v_kurum_admin_edit := public.is_kurum_admin()
      AND OLD.kurum_id IS NOT NULL AND OLD.kurum_id = public.my_kurum_id()
      AND NOT coalesce(OLD.is_admin, false)
      AND OLD.auth_user_id IS DISTINCT FROM auth.uid();
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.is_admin IS DISTINCT FROM OLD.is_admin
       OR NEW.kurum_id IS DISTINCT FROM OLD.kurum_id
       OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id
       OR NEW.role IS DISTINCT FROM OLD.role
       OR (NOT v_kurum_admin_edit AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.username IS DISTINCT FROM OLD.username)) THEN
      RAISE EXCEPTION 'Bu bilgiyi değiştirme yetkiniz yok (kullanıcı adı, yönetici yetkisi, kurum, hesap durumu).'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $function$;

-- has_any_role(p_roles text[]) [security definer]
CREATE OR REPLACE FUNCTION public.has_any_role(p_roles text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.kurum_roles_on() AND EXISTS (
    SELECT 1 FROM public.teachers t
      JOIN public.teacher_roles r ON r.teacher_id = t.id
     WHERE auth.uid() IS NOT NULL AND t.auth_user_id = auth.uid()
       AND coalesce(t.status, 'approved') = 'approved'
       AND r.role = ANY (p_roles)
  )
$function$;

-- has_role(p_role text) [security definer]
CREATE OR REPLACE FUNCTION public.has_role(p_role text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.has_any_role(ARRAY[p_role])
$function$;

-- head_gecis() [security definer]
CREATE OR REPLACE FUNCTION public.head_gecis()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE WHEN coalesce(auth.jwt() ->> 'session_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN EXISTS (SELECT 1 FROM public.kurum_gecis_oturumlari g
                  WHERE g.session_id = (auth.jwt() ->> 'session_id')::uuid
                    AND g.auth_user_id = auth.uid()
                    AND g.kurum_id = public.my_kurum_id()
                    AND g.created_at > now() - interval '7 days')
    ELSE false END
$function$;

-- hm_auth_ids() [security definer]
CREATE OR REPLACE FUNCTION public.hm_auth_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT t.auth_user_id FROM public.teachers t WHERE t.kurum_id IS NULL AND t.auth_user_id IS NOT NULL
  UNION
  SELECT auth.uid() WHERE auth.uid() IS NOT NULL
$function$;

-- hm_class_ids() [security definer]
CREATE OR REPLACE FUNCTION public.hm_class_ids()
 RETURNS SETOF text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT c.id FROM public.classes c WHERE c.kurum_id IS NULL
$function$;

-- hm_homework_ids() [security definer]
CREATE OR REPLACE FUNCTION public.hm_homework_ids()
 RETURNS SETOF text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT h.id FROM public.homeworks h
   WHERE h.teacher_auth_id IS NULL
      OR h.teacher_auth_id IN (SELECT t.auth_user_id FROM public.teachers t WHERE t.kurum_id IS NULL AND t.auth_user_id IS NOT NULL)
      OR h.teacher_auth_id = auth.uid()
$function$;

-- hm_kurum_class_ids() [security definer]
CREATE OR REPLACE FUNCTION public.hm_kurum_class_ids()
 RETURNS SETOF text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT c.id FROM public.classes c WHERE c.kurum_id IS NOT NULL
$function$;

-- hm_student_ids() [security definer]
CREATE OR REPLACE FUNCTION public.hm_student_ids()
 RETURNS SETOF text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT s.id FROM public.students s LEFT JOIN public.classes c ON c.id = s.class_id
   WHERE s.kurum_id IS NULL AND c.kurum_id IS NULL
$function$;

-- hm_teacher_ids() [security definer]
CREATE OR REPLACE FUNCTION public.hm_teacher_ids()
 RETURNS SETOF text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT t.id FROM public.teachers t WHERE t.kurum_id IS NULL
  UNION
  SELECT t.auth_user_id::text FROM public.teachers t WHERE t.kurum_id IS NULL AND t.auth_user_id IS NOT NULL
$function$;

-- homework_exists(p_homework_id text) [security definer]
CREATE OR REPLACE FUNCTION public.homework_exists(p_homework_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.homeworks WHERE id = p_homework_id)
$function$;

-- idare_ders_kapali() [security definer]
CREATE OR REPLACE FUNCTION public.idare_ders_kapali()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.is_kurum_admin()
     AND NOT public.head_gecis()
     AND NOT coalesce((SELECT (k.role_settings ->> 'idare_ders_verir')::boolean FROM public.kurumlar k WHERE k.id = public.my_kurum_id()), false)
$function$;

-- is_admin() [security definer]
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN public.is_head_admin();
END $function$;

-- is_head_admin() [security definer]
CREATE OR REPLACE FUNCTION public.is_head_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT lower(coalesce(auth.jwt() ->> 'email', '')) = 'm.bilirr@gmail.com'
$function$;

-- is_kurum_admin() [security definer]
CREATE OR REPLACE FUNCTION public.is_kurum_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT NOT public.is_head_admin() AND EXISTS (
    SELECT 1 FROM public.teachers t
     WHERE auth.uid() IS NOT NULL AND t.auth_user_id = auth.uid()
       AND t.kurum_id IS NOT NULL
       AND coalesce(t.status, 'approved') = 'approved'
       AND (
         coalesce(t.is_admin, false)
         OR (EXISTS (SELECT 1 FROM public.kurumlar k WHERE k.id = t.kurum_id AND coalesce(k.roles_enabled, false))
             AND EXISTS (SELECT 1 FROM public.teacher_roles r WHERE r.teacher_id = t.id AND r.role IN ('mudur', 'mudur_yardimcisi')))
       )
  )
$function$;

-- is_student() [security definer]
CREATE OR REPLACE FUNCTION public.is_student()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN (
    auth.jwt() -> 'app_metadata' ->> 'role' = 'student'
  );
END;
$function$;

-- is_teacher() [security definer]
CREATE OR REPLACE FUNCTION public.is_teacher()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') IN ('teacher', 'admin')
     AND lower(coalesce(auth.jwt() ->> 'email', '')) <> 'm.bilirr@gmail.com';
END $function$;

-- jsonb_to_text_array(p jsonb)
CREATE OR REPLACE FUNCTION public.jsonb_to_text_array(p jsonb)
 RETURNS text[]
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v JSONB := p;
BEGIN
  IF v IS NULL THEN RETURN '{}'; END IF;
  IF jsonb_typeof(v) = 'string' THEN
    BEGIN
      v := (v #>> '{}')::jsonb;
    EXCEPTION WHEN others THEN
      RETURN '{}';
    END;
  END IF;
  IF jsonb_typeof(v) <> 'array' THEN RETURN '{}'; END IF;
  RETURN ARRAY(SELECT e FROM jsonb_array_elements_text(v) e WHERE e IS NOT NULL AND e <> '');
EXCEPTION WHEN others THEN
  RETURN '{}';
END;
$function$;

-- karne_can_send() [security definer]
CREATE OR REPLACE FUNCTION public.karne_can_send()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.is_head_admin()
      OR ( EXISTS (SELECT 1 FROM public.kurumlar k
                    WHERE k.id::text = public.my_kurum_id()::text
                      AND coalesce((k.modules ->> 'deneme')::boolean, false))
           AND CASE public.perm_mode('karne_gonder')
                 WHEN 'deny' THEN false
                 WHEN 'allow' THEN true
                 ELSE public.is_kurum_admin() OR public.has_any_role(ARRAY['rehberlik', 'olcme_degerlendirme'])
               END )
$function$;

-- keep_row_owner() [security definer]
CREATE OR REPLACE FUNCTION public.keep_row_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(auth.uid(), NEW.created_by);
  ELSE
    -- Sahip değiştirilemez (83 öncesi sahibi bilinmeyen kayıtlar eskisi gibi ortak kalır)
    NEW.created_by := OLD.created_by;
  END IF;
  RETURN NEW;
END $function$;

-- kurum_admin_homework_ids() [security definer]
CREATE OR REPLACE FUNCTION public.kurum_admin_homework_ids()
 RETURNS SETOF text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT h.id FROM public.homeworks h
    JOIN public.teachers t ON t.auth_user_id = h.teacher_auth_id
   WHERE public.is_kurum_admin() AND t.kurum_id = public.my_kurum_id()
$function$;

-- kurum_admin_manages_teacher_auth(p_auth uuid) [security definer]
CREATE OR REPLACE FUNCTION public.kurum_admin_manages_teacher_auth(p_auth uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.is_kurum_admin() AND public.kurum_can('manage_teachers') AND EXISTS (
    SELECT 1 FROM public.teachers t
     WHERE t.auth_user_id = p_auth AND t.kurum_id = public.my_kurum_id() AND NOT coalesce(t.is_admin, false)
  )
$function$;

-- kurum_can(p_module text) [security definer]
CREATE OR REPLACE FUNCTION public.kurum_can(p_module text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_kurum UUID;
  v_ok BOOLEAN;
BEGIN
  IF public.is_head_admin() THEN RETURN TRUE; END IF;
  v_kurum := public.my_kurum_id();
  IF v_kurum IS NULL THEN RETURN TRUE; END IF;
  SELECT coalesce((k.modules ->> p_module)::boolean, false) INTO v_ok FROM public.kurumlar k WHERE k.id = v_kurum;
  RETURN coalesce(v_ok, false);
END $function$;

-- kurum_grant_cred_guard()
CREATE OR REPLACE FUNCTION public.kurum_grant_cred_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR public.is_head_admin() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.grant_cred := false;
  ELSIF NEW.grant_cred IS DISTINCT FROM OLD.grant_cred THEN
    NEW.grant_cred := OLD.grant_cred;
  END IF;
  RETURN NEW;
END
$function$;

-- kurum_grant_move_guard()
CREATE OR REPLACE FUNCTION public.kurum_grant_move_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR public.is_head_admin() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.grant_move := false;
  ELSIF NEW.grant_move IS DISTINCT FROM OLD.grant_move THEN
    NEW.grant_move := OLD.grant_move;
  END IF;
  RETURN NEW;
END
$function$;

-- kurum_has_class(p_class_id text) [security definer]
CREATE OR REPLACE FUNCTION public.kurum_has_class(p_class_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT p_class_id IS NOT NULL AND (
    public.kurum_owns_class(p_class_id)
    OR EXISTS (
      SELECT 1 FROM public.kurum_class_grants g
       WHERE g.class_id = p_class_id AND g.kurum_id = public.my_kurum_id()
    )
  )
$function$;

-- kurum_has_student(p_student_id text) [security definer]
CREATE OR REPLACE FUNCTION public.kurum_has_student(p_student_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT p_student_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.students s
     WHERE s.id = p_student_id
       AND ((s.kurum_id IS NOT NULL AND s.kurum_id = public.my_kurum_id()) OR public.kurum_has_class(s.class_id))
  )
$function$;

-- kurum_kayit_ayar(p_kurum_id uuid, p_acik boolean, p_yenile boolean) [security definer]
CREATE OR REPLACE FUNCTION public.kurum_kayit_ayar(p_kurum_id uuid, p_acik boolean DEFAULT NULL::boolean, p_yenile boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_kod text;
  v_acik boolean;
  v_alfabe text := 'abcdefghjkmnpqrstuvwxyz23456789';
  i int;
  n int := 0;
BEGIN
  IF NOT (public.is_head_admin() OR (public.is_kurum_admin() AND p_kurum_id = public.my_kurum_id())) THEN
    RAISE EXCEPTION 'Kayıt bağlantısını yalnızca kurum yöneticisi değiştirebilir.';
  END IF;
  SELECT k.kayit_kodu, k.kayit_acik INTO v_kod, v_acik FROM public.kurumlar k WHERE k.id = p_kurum_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kurum bulunamadı.';
  END IF;
  IF v_kod IS NULL OR coalesce(p_yenile, false) THEN
    LOOP
      v_kod := '';
      FOR i IN 1..8 LOOP
        v_kod := v_kod || substr(v_alfabe, 1 + floor(random() * length(v_alfabe))::int, 1);
      END LOOP;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.kurumlar WHERE kayit_kodu = v_kod);
      n := n + 1;
      IF n > 20 THEN
        RAISE EXCEPTION 'Kayıt kodu üretilemedi, tekrar deneyin.';
      END IF;
    END LOOP;
  END IF;
  IF p_acik IS NOT NULL THEN
    v_acik := p_acik;
  END IF;
  UPDATE public.kurumlar SET kayit_kodu = v_kod, kayit_acik = coalesce(v_acik, true) WHERE id = p_kurum_id;
  RETURN jsonb_build_object('kod', v_kod, 'acik', coalesce(v_acik, true));
END $function$;

-- kurum_move_granted_student(p_student_id text, p_class_id text) [security definer]
CREATE OR REPLACE FUNCTION public.kurum_move_granted_student(p_student_id text, p_class_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_kurum text := public.my_kurum_id()::text;
  v_stu record;
  v_cls record;
  v_after text;
BEGIN
  IF auth.uid() IS NULL OR v_kurum IS NULL THEN
    RAISE EXCEPTION 'Bu işlem için kurum hesabıyla giriş yapın.' USING ERRCODE = '42501';
  END IF;
  IF NOT coalesce((SELECT k.grant_move FROM public.kurumlar k WHERE k.id::text = v_kurum), false) THEN
    RAISE EXCEPTION 'Açılan sınıflarda sınıf değiştirme izni kapalı.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.kurum_student_editor() THEN
    RAISE EXCEPTION 'Öğrenci sınıfını değiştirme yetkiniz yok.' USING ERRCODE = '42501';
  END IF;

  SELECT s.id::text AS id, s.class_id::text AS class_id, s.kurum_id::text AS kurum_id
    INTO v_stu FROM public.students s WHERE s.id::text = p_student_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Öğrenci bulunamadı.' USING ERRCODE = 'P0002';
  END IF;
  -- yalnız genel yöneticinin öğrencisi (kurumun kendi öğrencisi zaten normal yolla değişir)
  IF v_stu.kurum_id IS NOT NULL
     OR NOT EXISTS (SELECT 1 FROM public.kurum_class_grants g
                     WHERE g.kurum_id::text = v_kurum AND g.class_id::text = v_stu.class_id) THEN
    RAISE EXCEPTION 'Bu öğrenci kurumunuza açılan bir sınıfta değil.' USING ERRCODE = '42501';
  END IF;

  SELECT c.id::text AS id, c.name INTO v_cls FROM public.classes c WHERE c.id::text = p_class_id;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.kurum_class_grants g
                               WHERE g.kurum_id::text = v_kurum AND g.class_id::text = p_class_id) THEN
    RAISE EXCEPTION 'Hedef sınıf kurumunuza açılmamış.' USING ERRCODE = '42501';
  END IF;

  IF v_stu.class_id = v_cls.id THEN
    RETURN jsonb_build_object('class_id', v_cls.id, 'class_name', v_cls.name);
  END IF;

  UPDATE public.students SET class_id = v_cls.id, class_name = v_cls.name WHERE id::text = p_student_id;

  -- güvenlik: bir tetik öğrencinin kurumunu değiştirdiyse işlem tümüyle geri alınır
  SELECT s.kurum_id::text INTO v_after FROM public.students s WHERE s.id::text = p_student_id;
  IF v_after IS NOT NULL THEN
    RAISE EXCEPTION 'Öğrencinin kurumu değişecekti; işlem geri alındı.' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object('class_id', v_cls.id, 'class_name', v_cls.name);
END
$function$;

-- kurum_owns_class(p_class_id text) [security definer]
CREATE OR REPLACE FUNCTION public.kurum_owns_class(p_class_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT p_class_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.classes c
     WHERE c.id = p_class_id AND c.kurum_id IS NOT NULL AND c.kurum_id = public.my_kurum_id()
  )
$function$;

-- kurum_roles_on() [security definer]
CREATE OR REPLACE FUNCTION public.kurum_roles_on()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT NOT public.is_head_admin() AND EXISTS (
    SELECT 1 FROM public.kurumlar k
     WHERE k.id = public.my_kurum_id() AND coalesce(k.roles_enabled, false)
  )
$function$;

-- kurum_set_grant_cred(p_kurum_id text, p_on boolean) [security definer]
CREATE OR REPLACE FUNCTION public.kurum_set_grant_cred(p_kurum_id text, p_on boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE n int;
BEGIN
  IF NOT public.is_head_admin() THEN
    RAISE EXCEPTION 'Bu ayarı yalnızca genel yönetici değiştirebilir.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.kurumlar SET grant_cred = coalesce(p_on, false) WHERE id::text = p_kurum_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN
    RAISE EXCEPTION 'Kurum bulunamadı.' USING ERRCODE = 'P0002';
  END IF;
  RETURN coalesce(p_on, false);
END
$function$;

-- kurum_set_grant_move(p_kurum_id text, p_on boolean) [security definer]
CREATE OR REPLACE FUNCTION public.kurum_set_grant_move(p_kurum_id text, p_on boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE n int;
BEGIN
  IF NOT public.is_head_admin() THEN
    RAISE EXCEPTION 'Bu ayarı yalnızca genel yönetici değiştirebilir.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.kurumlar SET grant_move = coalesce(p_on, false) WHERE id::text = p_kurum_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN
    RAISE EXCEPTION 'Kurum bulunamadı.' USING ERRCODE = 'P0002';
  END IF;
  RETURN coalesce(p_on, false);
END
$function$;

-- kurum_set_modules(p_kurum_id uuid, p_modules jsonb) [security definer]
CREATE OR REPLACE FUNCTION public.kurum_set_modules(p_kurum_id uuid, p_modules jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_keys text[] := ARRAY['homework', 'etut', 'questions', 'grades', 'messages', 'archive', 'manage_students', 'manage_teachers', 'deneme'];
  v_out jsonb := '{}'::jsonb;
  k text;
BEGIN
  IF NOT (public.is_head_admin() OR (public.head_gecis() AND p_kurum_id = public.my_kurum_id())) THEN
    RAISE EXCEPTION 'Kurumun bölüm izinlerini yalnızca genel yönetici değiştirebilir.';
  END IF;
  FOREACH k IN ARRAY v_keys LOOP
    v_out := v_out || jsonb_build_object(k, coalesce((p_modules ->> k)::boolean, false));
  END LOOP;
  UPDATE public.kurumlar SET modules = v_out WHERE id = p_kurum_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kurum bulunamadı.';
  END IF;
  RETURN v_out;
END $function$;

-- kurum_set_role_settings(p_kurum_id uuid, p_settings jsonb) [security definer]
CREATE OR REPLACE FUNCTION public.kurum_set_role_settings(p_kurum_id uuid, p_settings jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_clean jsonb;
BEGIN
  IF NOT (public.is_head_admin() OR (public.is_kurum_admin() AND p_kurum_id = public.my_kurum_id())) THEN
    RAISE EXCEPTION 'Bu ayarı yalnızca kurum yöneticisi (Müdür / Müdür Yardımcısı) değiştirebilir.';
  END IF;
  -- Aşama 98: gönderilmeyen ayar korunur; Aşama 108: Ölçme öğrenci ekleme ayarı eklendi
  SELECT coalesce(k.role_settings, '{}'::jsonb) INTO v_clean FROM public.kurumlar k WHERE k.id = p_kurum_id;
  v_clean := jsonb_build_object(
    'rehberlik_ogrenci_ekle', coalesce((p_settings ->> 'rehberlik_ogrenci_ekle')::boolean, (v_clean ->> 'rehberlik_ogrenci_ekle')::boolean, false),
    'olcme_ogrenci_ekle', coalesce((p_settings ->> 'olcme_ogrenci_ekle')::boolean, (v_clean ->> 'olcme_ogrenci_ekle')::boolean, false),
    'idare_ders_verir', coalesce((p_settings ->> 'idare_ders_verir')::boolean, (v_clean ->> 'idare_ders_verir')::boolean, false));
  UPDATE public.kurumlar SET role_settings = v_clean WHERE id = p_kurum_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kurum bulunamadı.';
  END IF;
  RETURN v_clean;
END $function$;

-- kurum_set_roles_enabled(p_kurum_id uuid, p_on boolean) [security definer]
CREATE OR REPLACE FUNCTION public.kurum_set_roles_enabled(p_kurum_id uuid, p_on boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT (public.is_head_admin() OR (public.head_gecis() AND p_kurum_id = public.my_kurum_id())) THEN
    RAISE EXCEPTION 'Rol yetkilerini yalnızca genel yönetici açıp kapatabilir.';
  END IF;
  UPDATE public.kurumlar SET roles_enabled = coalesce(p_on, false) WHERE id = p_kurum_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kurum bulunamadı.';
  END IF;
  RETURN coalesce(p_on, false);
END $function$;

-- kurum_student_adder() [security definer]
CREATE OR REPLACE FUNCTION public.kurum_student_adder()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.is_kurum_admin()
      OR CASE public.perm_mode('ogrenci_ekle_sil')
           WHEN 'deny' THEN false
           WHEN 'allow' THEN true
           ELSE (public.has_role('olcme_degerlendirme') AND EXISTS (
                   SELECT 1 FROM public.kurumlar k
                    WHERE k.id = public.my_kurum_id()
                      AND coalesce((k.role_settings ->> 'olcme_ogrenci_ekle')::boolean, false)))
             OR (public.has_role('rehberlik') AND EXISTS (
                   SELECT 1 FROM public.kurumlar k
                    WHERE k.id = public.my_kurum_id()
                      AND coalesce((k.role_settings ->> 'rehberlik_ogrenci_ekle')::boolean, false)))
         END
$function$;

-- kurum_student_editor() [security definer]
CREATE OR REPLACE FUNCTION public.kurum_student_editor()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.is_kurum_admin()
      OR CASE public.perm_mode('ogrenci_duzenle')
           WHEN 'deny' THEN false
           WHEN 'allow' THEN true
           ELSE public.has_any_role(ARRAY['rehberlik', 'olcme_degerlendirme'])
         END
$function$;

-- kurum_update_identity(p_kurum_id uuid, p_name text, p_logo text, p_set_logo boolean) [security definer]
CREATE OR REPLACE FUNCTION public.kurum_update_identity(p_kurum_id uuid, p_name text, p_logo text, p_set_logo boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_name text := btrim(coalesce(p_name, ''));
BEGIN
  IF NOT (public.is_head_admin() OR (public.is_kurum_admin() AND p_kurum_id = public.my_kurum_id())) THEN
    RAISE EXCEPTION 'Kurum adını ve logosunu yalnızca kurum yöneticisi (Müdür / Müdür Yardımcısı) değiştirebilir.';
  END IF;
  IF length(v_name) < 2 OR length(v_name) > 80 THEN
    RAISE EXCEPTION 'Kurum adı 2 ile 80 karakter arasında olmalıdır.';
  END IF;
  IF coalesce(p_set_logo, false) THEN
    UPDATE public.kurumlar SET name = v_name, logo = nullif(p_logo, '') WHERE id = p_kurum_id;
  ELSE
    UPDATE public.kurumlar SET name = v_name WHERE id = p_kurum_id;
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kurum bulunamadı.';
  END IF;
  RETURN jsonb_build_object('name', v_name);
END $function$;

-- mark_my_initial_password_changed() [security definer]
CREATE OR REPLACE FUNCTION public.mark_my_initial_password_changed()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  UPDATE public.initial_credentials ic
     SET password = NULL, changed_at = now()
   WHERE ic.changed_at IS NULL
     AND (
       (ic.account_type = 'student' AND ic.record_id IN (SELECT s.id::text FROM public.students s WHERE s.auth_user_id = auth.uid()))
       OR
       (ic.account_type = 'teacher' AND ic.record_id IN (SELECT t.id::text FROM public.teachers t WHERE t.auth_user_id = auth.uid()))
     );
END;
$function$;

-- message_teacher_can_see(p_kind text, p_sender_id text, p_to_teacher_id text, p_replied_by_id text) [security definer]
CREATE OR REPLACE FUNCTION public.message_teacher_can_see(p_kind text, p_sender_id text, p_to_teacher_id text, p_replied_by_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if public.is_head_admin() then
    return true;
  end if;
  if p_kind in ('announcement', 'note') then
    -- gönderen bilgisi olmayan eski duyurular eskisi gibi
    return nullif(btrim(coalesce(p_sender_id, '')), '') is null or public.priv_teacher_ok(p_sender_id);
  end if;
  -- öğrenci sorusu
  if nullif(btrim(coalesce(p_to_teacher_id, '')), '') is not null and not public.priv_teacher_ok(p_to_teacher_id) then
    return false;
  end if;
  if nullif(btrim(coalesce(p_replied_by_id, '')), '') is not null and not public.priv_teacher_ok(p_replied_by_id) then
    return false;
  end if;
  return true;
end $function$;

-- my_admin_kurum_id() [security definer]
CREATE OR REPLACE FUNCTION public.my_admin_kurum_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE WHEN public.is_kurum_admin() THEN public.my_kurum_id() END
$function$;

-- my_class_ids() [security definer]
CREATE OR REPLACE FUNCTION public.my_class_ids()
 RETURNS SETOF text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_kurum UUID := public.my_kurum_id();
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  IF public.is_kurum_admin() OR public.role_wide_view() THEN
    RETURN QUERY
      SELECT c.id FROM public.classes c WHERE c.kurum_id = v_kurum
      UNION
      SELECT g.class_id FROM public.kurum_class_grants g WHERE g.kurum_id = v_kurum;
    RETURN;
  END IF;
  IF public.etut_only() THEN
    RETURN; -- etüt öğretmeni sınıf görmez; yalnızca kendi etütlerindeki öğrencileri görür
  END IF;
  IF v_kurum IS NULL THEN
    RETURN QUERY SELECT tca.class_id FROM public.teacher_class_access tca WHERE tca.teacher_auth_id = auth.uid();
    RETURN;
  END IF;
  RETURN QUERY
    SELECT tca.class_id FROM public.teacher_class_access tca
     WHERE tca.teacher_auth_id = auth.uid()
       AND (EXISTS (SELECT 1 FROM public.classes c WHERE c.id = tca.class_id AND c.kurum_id = v_kurum)
            OR EXISTS (SELECT 1 FROM public.kurum_class_grants g WHERE g.class_id = tca.class_id AND g.kurum_id = v_kurum))
    UNION
    -- Aşama 82: zümre başkanı, zümresindeki öğretmenlerin sınıflarını görür
    SELECT DISTINCT a.class_id FROM public.teacher_class_access a
     WHERE public.has_role('zumre_baskani') AND public.zumre_class(a.class_id);
END $function$;

-- my_grant_cred() [security definer]
CREATE OR REPLACE FUNCTION public.my_grant_cred()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT coalesce((SELECT k.grant_cred FROM public.kurumlar k WHERE k.id::text = public.my_kurum_id()::text LIMIT 1), false)
$function$;

-- my_grant_move() [security definer]
CREATE OR REPLACE FUNCTION public.my_grant_move()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT coalesce((SELECT k.grant_move FROM public.kurumlar k WHERE k.id::text = public.my_kurum_id()::text LIMIT 1), false)
$function$;

-- my_kurum() [security definer]
CREATE OR REPLACE FUNCTION public.my_kurum()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_kurum UUID;
  v_out JSONB;
  v_sections JSONB;
BEGIN
  IF public.is_head_admin() THEN
    RETURN jsonb_build_object('head', true, 'kurum_id', NULL, 'kurum_admin', false);
  END IF;
  IF NOT public.is_teacher() THEN
    RETURN jsonb_build_object('head', false, 'kurum_id', NULL, 'kurum_admin', false);
  END IF;
  SELECT jsonb_build_object('allow', to_jsonb(a.allow_sections), 'deny', to_jsonb(a.deny_sections)) INTO v_sections
    FROM public.teacher_section_access a JOIN public.teachers t ON t.id = a.teacher_id
   WHERE t.auth_user_id = auth.uid() LIMIT 1;
  v_kurum := public.my_kurum_id();
  IF v_kurum IS NULL THEN
    RETURN jsonb_build_object('head', false, 'kurum_id', NULL, 'kurum_admin', false, 'roles', to_jsonb(public.my_roles()));
  END IF;
  SELECT jsonb_build_object(
           'head', false,
           'kurum_id', k.id,
           'kurum_name', k.name,
           'kurum_admin', public.is_kurum_admin(),
           'modules', k.modules,
           'granted_class_ids', coalesce((SELECT jsonb_agg(g.class_id) FROM public.kurum_class_grants g WHERE g.kurum_id = k.id), '[]'::jsonb),
           'roles_enabled', coalesce(k.roles_enabled, false),
           'role_settings', coalesce(k.role_settings, '{}'::jsonb),
           'roles', to_jsonb(public.my_roles()),
           'sections', coalesce(v_sections, jsonb_build_object('allow', '[]'::jsonb, 'deny', '[]'::jsonb)),
           'logo', k.logo,
           'has_mail', EXISTS (SELECT 1 FROM public.kurum_mail_accounts m WHERE m.kurum_id = k.id))
    INTO v_out
    FROM public.kurumlar k WHERE k.id = v_kurum;
  RETURN coalesce(v_out, jsonb_build_object('head', false, 'kurum_id', v_kurum, 'kurum_admin', false));
END $function$;

-- my_kurum_id() [security definer]
CREATE OR REPLACE FUNCTION public.my_kurum_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT t.kurum_id FROM public.teachers t
   WHERE auth.uid() IS NOT NULL AND t.auth_user_id = auth.uid()
   LIMIT 1
$function$;

-- my_kurum_state() [security definer]
CREATE OR REPLACE FUNCTION public.my_kurum_state()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v jsonb := public.my_kurum();
begin
  if v ? 'logo' then
    v := (v - 'logo') || jsonb_build_object(
      'logo_hash', encode(sha256(convert_to(coalesce(v ->> 'logo', ''), 'UTF8')), 'hex')
    );
  end if;
  -- Aşama 158: giriş bilgisi anahtarı · Aşama 161: sınıf değiştirme anahtarı (bilgi boşsa eskisi gibi boş döner)
  if v is not null then
    v := v || jsonb_build_object(
      'grant_cred', coalesce(public.my_grant_cred(), false),
      'grant_move', coalesce(public.my_grant_move(), false)
    );
  end if;
  return v;
end
$function$;

-- my_roles() [security definer]
CREATE OR REPLACE FUNCTION public.my_roles()
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT coalesce(array_agg(r.role ORDER BY r.role), '{}')
    FROM public.teacher_roles r
    JOIN public.teachers t ON t.id = r.teacher_id
   WHERE auth.uid() IS NOT NULL AND t.auth_user_id = auth.uid()
$function$;

-- my_student_ids() [security definer]
CREATE OR REPLACE FUNCTION public.my_student_ids()
 RETURNS SETOF text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_kurum UUID := public.my_kurum_id();
  v_classes TEXT[];
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  IF public.etut_only() THEN
    RETURN QUERY
      SELECT DISTINCT sid.value
        FROM public.etuts e
        CROSS JOIN LATERAL jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(coalesce(e.assigned_student_ids, '[]'::jsonb)) = 'array' THEN e.assigned_student_ids ELSE '[]'::jsonb END) sid(value)
       WHERE e.etut_teacher_id = ANY (public.priv_my_teacher_ids())
          OR coalesce(e.etut_teacher_ids, '{}'::text[]) && public.priv_my_teacher_ids();
    RETURN;
  END IF;
  v_classes := ARRAY(SELECT public.my_class_ids());
  IF public.is_kurum_admin() OR public.role_wide_view() THEN
    RETURN QUERY SELECT s.id FROM public.students s WHERE s.kurum_id = v_kurum OR s.class_id = ANY (v_classes);
    RETURN;
  END IF;
  IF v_kurum IS NULL THEN
    RETURN QUERY
      SELECT s.id FROM public.students s
       WHERE s.class_id = ANY (ARRAY(SELECT tca.class_id FROM public.teacher_class_access tca WHERE tca.teacher_auth_id = auth.uid()))
      UNION
      SELECT tsa.student_id FROM public.teacher_student_access tsa WHERE tsa.teacher_auth_id = auth.uid();
    RETURN;
  END IF;
  RETURN QUERY
    SELECT s.id FROM public.students s
     WHERE (s.class_id IN (SELECT tca.class_id FROM public.teacher_class_access tca WHERE tca.teacher_auth_id = auth.uid())
            OR s.id IN (SELECT tsa.student_id FROM public.teacher_student_access tsa WHERE tsa.teacher_auth_id = auth.uid())
            OR (public.has_role('zumre_baskani') AND s.class_id = ANY (v_classes)))
       AND (s.kurum_id = v_kurum OR s.class_id = ANY (v_classes)
            OR s.class_id IN (SELECT c.id FROM public.classes c WHERE c.kurum_id = v_kurum));
END $function$;

-- my_zumre_subjects() [security definer]
CREATE OR REPLACE FUNCTION public.my_zumre_subjects()
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE WHEN public.has_role('zumre_baskani') THEN
           public.zumre_subjects(public.branch_subjects((SELECT t.branch FROM public.teachers t WHERE t.auth_user_id = auth.uid() LIMIT 1)))
         ELSE '{}'::text[] END
$function$;

-- normalize_homework_row()
CREATE OR REPLACE FUNCTION public.normalize_homework_row()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at := now();
  IF NEW.id LIKE '\_\_%' THEN
    RETURN NEW;
  END IF;
  NEW.target_class_ids := COALESCE(NEW.target_class_ids, '{}');
  NEW.target_student_ids := COALESCE(NEW.target_student_ids, '{}');
  IF cardinality(NEW.target_class_ids) = 0 AND cardinality(NEW.target_student_ids) = 0 THEN
    NEW.target_class_ids := public.jsonb_to_text_array(NEW.meta -> 'targetClassIds');
    NEW.target_student_ids := public.jsonb_to_text_array(NEW.assigned_to);
    IF cardinality(NEW.target_class_ids) = 0 AND NEW.class_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.classes c WHERE c.id = NEW.class_id) THEN
      NEW.target_class_ids := ARRAY[NEW.class_id];
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- ogr_bolum_acik(p_bolum text, p_class_id text, p_kurum_id text) [security definer]
CREATE OR REPLACE FUNCTION public.ogr_bolum_acik(p_bolum text, p_class_id text, p_kurum_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT coalesce(
    (SELECT (a.sections ->> p_bolum)::boolean FROM public.ogrenci_bolum_ayar a
      WHERE p_class_id IS NOT NULL AND a.id = 'c:' || p_class_id AND a.sections ? p_bolum),
    (SELECT (a.sections ->> p_bolum)::boolean FROM public.ogrenci_bolum_ayar a
      WHERE a.id = 'k:' || coalesce(nullif(p_kurum_id, ''), '-') AND a.sections ? p_bolum),
    true)
$function$;

-- ogr_bolum_hata(p_bolum text, p_ad text)
CREATE OR REPLACE FUNCTION public.ogr_bolum_hata(p_bolum text, p_ad text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RAISE EXCEPTION '% bölümü bu öğrencilere kapalı (%). Yönetim > Bölümler ve sınıflar > Öğrenci bölümlerinden açılabilir.',
    CASE p_bolum WHEN 'homework' THEN 'Ödevler' WHEN 'etut' THEN 'Etütler' WHEN 'questions' THEN 'Soru Takibi'
                 WHEN 'plan' THEN 'Haftalık Plan' WHEN 'messages' THEN 'Öğretmene Soru Sor' ELSE p_bolum END,
    p_ad USING ERRCODE = '42501', HINT = 'ogrenci_bolum_kapali';
END
$function$;

-- ogr_bolum_idler(p jsonb)
CREATE OR REPLACE FUNCTION public.ogr_bolum_idler(p jsonb)
 RETURNS SETOF text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT x FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(p) = 'array' THEN p ELSE '[]'::jsonb END) x
   WHERE coalesce(x, '') <> ''
$function$;

-- ogr_bolum_ogrenci(p_bolum text, p_student_id text) [security definer]
CREATE OR REPLACE FUNCTION public.ogr_bolum_ogrenci(p_bolum text, p_student_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT coalesce((
    SELECT public.ogr_bolum_acik(p_bolum, c.id::text, CASE WHEN c.id IS NOT NULL THEN c.kurum_id::text ELSE s.kurum_id::text END)
      FROM public.students s
      LEFT JOIN public.classes c ON c.id::text = s.class_id::text
     WHERE s.id::text = p_student_id
     LIMIT 1), true)
$function$;

-- ogr_bolum_sinif(p_bolum text, p_class_id text) [security definer]
CREATE OR REPLACE FUNCTION public.ogr_bolum_sinif(p_bolum text, p_class_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.ogr_bolum_acik(p_bolum, p_class_id,
    (SELECT c.kurum_id::text FROM public.classes c WHERE c.id::text = p_class_id LIMIT 1))
$function$;

-- ogrenci_bolum_durum() [security definer]
CREATE OR REPLACE FUNCTION public.ogrenci_bolum_durum()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_kurum text := public.my_kurum_id()::text;
  v_rows jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;
  IF public.is_head_admin() AND v_kurum IS NULL THEN
    SELECT coalesce(jsonb_object_agg(a.id, a.sections), '{}'::jsonb) INTO v_rows FROM public.ogrenci_bolum_ayar a;
  ELSE
    SELECT coalesce(jsonb_object_agg(a.id, a.sections), '{}'::jsonb) INTO v_rows
      FROM public.ogrenci_bolum_ayar a
     WHERE a.id = 'k:-'
        OR (v_kurum IS NULL AND a.kurum_id IS NULL)
        OR (v_kurum IS NOT NULL AND a.kurum_id = v_kurum)
        OR (v_kurum IS NOT NULL AND a.class_id IN (SELECT g.class_id::text FROM public.kurum_class_grants g WHERE g.kurum_id::text = v_kurum));
  END IF;
  RETURN jsonb_build_object('rows', v_rows);
END
$function$;

-- ogrenci_bolum_kaydet(p_kurum_id text, p_class_id text, p_sections jsonb) [security definer]
CREATE OR REPLACE FUNCTION public.ogrenci_bolum_kaydet(p_kurum_id text, p_class_id text, p_sections jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_head boolean := public.is_head_admin();
  v_my text := public.my_kurum_id()::text;
  v_yonetici boolean := coalesce(public.is_kurum_admin(), false) OR coalesce(public.head_gecis(), false);
  v_kurum text;
  v_id text;
  v_clean jsonb := '{}'::jsonb;
  k text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Oturum bulunamadı.' USING ERRCODE = '42501';
  END IF;

  IF nullif(p_class_id, '') IS NOT NULL THEN
    SELECT c.kurum_id::text INTO v_kurum FROM public.classes c WHERE c.id::text = p_class_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Sınıf bulunamadı.' USING ERRCODE = 'P0002';
    END IF;
    v_id := 'c:' || p_class_id;
  ELSE
    v_kurum := nullif(p_kurum_id, '');
    v_id := 'k:' || coalesce(v_kurum, '-');
  END IF;

  -- yetki: genel yönetici her yer; kurum yöneticisi (ve kuruma geçmiş genel yönetici) yalnız kendi kurumu
  IF NOT (
       (v_head AND (v_my IS NULL OR v_kurum IS NULL OR v_kurum = v_my))
    OR (v_yonetici AND v_kurum IS NOT NULL AND v_kurum = v_my)
  ) THEN
    RAISE EXCEPTION 'Bu ayarı değiştirme yetkiniz yok.' USING ERRCODE = '42501';
  END IF;

  IF p_sections IS NULL THEN
    DELETE FROM public.ogrenci_bolum_ayar WHERE id = v_id;
    RETURN NULL;
  END IF;

  -- yalnız bilinen anahtarlar, yalnız true/false
  FOREACH k IN ARRAY ARRAY['homework','etut','questions','plan','grades','messages','deneme'] LOOP
    IF jsonb_typeof(p_sections -> k) = 'boolean' THEN
      v_clean := v_clean || jsonb_build_object(k, (p_sections ->> k)::boolean);
    END IF;
  END LOOP;

  INSERT INTO public.ogrenci_bolum_ayar AS a (id, kurum_id, class_id, sections, updated_at, updated_by)
  VALUES (v_id, v_kurum, nullif(p_class_id, ''), v_clean, now(), auth.uid())
  ON CONFLICT (id) DO UPDATE SET kurum_id = EXCLUDED.kurum_id, sections = EXCLUDED.sections,
                                 updated_at = now(), updated_by = auth.uid();
  RETURN v_clean;
END
$function$;

-- perm_mode(p_perm text) [security definer]
CREATE OR REPLACE FUNCTION public.perm_mode(p_perm text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
           WHEN NOT public.kurum_roles_on() OR public.is_kurum_admin() THEN NULL
           ELSE (SELECT CASE WHEN ('izin:' || p_perm) = ANY (a.deny_sections) THEN 'deny'
                             WHEN ('izin:' || p_perm) = ANY (a.allow_sections) THEN 'allow' END
                   FROM public.teacher_section_access a JOIN public.teachers t ON t.id = a.teacher_id
                  WHERE auth.uid() IS NOT NULL AND t.auth_user_id = auth.uid()
                  LIMIT 1)
         END
$function$;

-- plan_all_items_visible(p_plan_id text) [security definer]
CREATE OR REPLACE FUNCTION public.plan_all_items_visible(p_plan_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select public.is_head_admin()
      or not exists (
        select 1 from public.study_plan_items i
         where i.plan_id::text = p_plan_id
           and not public.plan_item_visible(i.created_by::text, i.created_by_name)
      )
$function$;

-- plan_can_work(p_student_id text) [security definer]
CREATE OR REPLACE FUNCTION public.plan_can_work(p_student_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT (public.is_teacher() OR public.is_admin())
     AND public.kurum_can('homework')
     AND (public.is_admin()
          OR ((public.role_can_teach() OR public.section_explicit_allow('homework')) AND public.section_allowed('homework')
              AND public.teacher_has_student_access(p_student_id, NULL::text)))
$function$;

-- plan_conflict_weeks(p_student_ids text[], p_week_start text) [security definer]
CREATE OR REPLACE FUNCTION public.plan_conflict_weeks(p_student_ids text[], p_week_start text)
 RETURNS TABLE(student_id text, week_start text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if p_week_start is null or p_week_start !~ '^\d{4}-\d{2}-\d{2}$' or p_student_ids is null or cardinality(p_student_ids) > 2000 then
    return;
  end if;
  return query
    select distinct i.student_id::text, left(i.week_start::text, 10)
      from public.study_plan_items i
     where i.student_id::text = any (p_student_ids)
       and i.week_start::date between p_week_start::date - 6 and p_week_start::date + 6
       and left(i.week_start::text, 10) <> p_week_start
       and public.priv_can_see_student(i.student_id::text);
end $function$;

-- plan_item_mine(p_created_by uuid, p_created_by_name text) [security definer]
CREATE OR REPLACE FUNCTION public.plan_item_mine(p_created_by uuid, p_created_by_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT coalesce(auth.uid() IS NOT NULL AND (
    p_created_by = auth.uid()
    OR p_created_by::text = ANY (public.priv_my_teacher_ids())
    -- sahibi kaydedilmemiş eski görev: adı benim adımsa benim; adı da yoksa yalnız genel yöneticinin
    OR (p_created_by IS NULL AND (
          (btrim(coalesce(p_created_by_name, '')) = '' AND public.is_head_admin())
          OR (btrim(coalesce(p_created_by_name, '')) <> '' AND EXISTS (
                SELECT 1 FROM public.teachers t
                 WHERE (t.auth_user_id = auth.uid() OR t.id = auth.uid()::text)
                   AND lower(btrim(coalesce(t.name, ''))) = lower(btrim(p_created_by_name))))))
  ), false)
$function$;

-- plan_item_visible(p_created_by text, p_created_by_name text) [security definer]
CREATE OR REPLACE FUNCTION public.plan_item_visible(p_created_by text, p_created_by_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_by text := nullif(btrim(coalesce(p_created_by, '')), '');
  v_name text := lower(btrim(coalesce(p_created_by_name, '')));
begin
  if public.is_head_admin() then
    return true;
  end if;
  if auth.uid() is null then
    return false;
  end if;

  if v_by is not null then
    if v_by = auth.uid()::text or v_by = any (public.priv_my_teacher_ids()) then
      return true;
    end if;
    return public.is_kurum_admin() and exists (
      select 1 from public.teachers t
       where (t.auth_user_id::text = v_by or t.id = v_by)
         and t.kurum_id is not null
         and t.kurum_id = public.my_kurum_id()
    );
  end if;

  -- Sahibi bilinmeyen eski görev
  if v_name = '' then
    return true; -- kimin eklediği hiç bilinmiyor: eskisi gibi görünür
  end if;
  if exists (
    select 1 from public.teachers t
     where (t.auth_user_id = auth.uid() or t.id = auth.uid()::text)
       and lower(btrim(coalesce(t.name, ''))) = v_name
  ) then
    return true;
  end if;
  return public.is_kurum_admin() and exists (
    select 1 from public.teachers t
     where lower(btrim(coalesce(t.name, ''))) = v_name
       and t.kurum_id is not null
       and t.kurum_id = public.my_kurum_id()
  );
end $function$;

-- plan_items_set_sent(p_student_ids text[], p_week_start text, p_send boolean, p_all boolean) [security definer]
CREATE OR REPLACE FUNCTION public.plan_items_set_sent(p_student_ids text[], p_week_start text, p_send boolean, p_all boolean DEFAULT false)
 RETURNS TABLE(student_id text, changed integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ok text[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Oturum bulunamadı.' USING ERRCODE = '42501';
  END IF;
  IF p_week_start IS NULL OR p_week_start !~ '^\d{4}-\d{2}-\d{2}$' OR p_student_ids IS NULL OR cardinality(p_student_ids) > 2000 THEN
    RAISE EXCEPTION 'Geçersiz istek.' USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_all, false) AND NOT (public.is_head_admin() OR public.is_kurum_admin()) THEN
    RAISE EXCEPTION 'Planın tamamını yalnız yöneticiler geri çekebilir.' USING ERRCODE = '42501';
  END IF;
  IF coalesce(p_all, false) AND coalesce(p_send, false) THEN
    RAISE EXCEPTION 'Başka öğretmenlerin görevleri onların adına gönderilemez.' USING ERRCODE = '42501';
  END IF;
  -- Erişim denetimi öğrenci başına BİR KEZ (görev başına değil)
  v_ok := ARRAY(SELECT DISTINCT s FROM unnest(p_student_ids) AS s WHERE s IS NOT NULL AND public.plan_can_work(s));
  IF cardinality(v_ok) = 0 THEN
    RETURN;
  END IF;
  PERFORM set_config('app.spi164_rpc', '1', true);
  RETURN QUERY
    WITH upd AS (
      UPDATE public.study_plan_items i
         SET sent_at = CASE WHEN p_send THEN now() ELSE NULL END,
             group_id = CASE WHEN p_send THEN i.group_id ELSE NULL END,
             mailed_at = CASE WHEN p_send THEN i.mailed_at ELSE NULL END
       WHERE i.student_id = ANY (v_ok)
         AND i.week_start = p_week_start
         AND (CASE WHEN p_send THEN i.sent_at IS NULL ELSE i.sent_at IS NOT NULL END)
         AND (coalesce(p_all, false) OR public.plan_item_mine(i.created_by, i.created_by_name))
      RETURNING i.student_id
    )
    SELECT u.student_id::text, count(*)::integer FROM upd u GROUP BY 1;
  PERFORM set_config('app.spi164_rpc', '', true);
END $function$;

-- plan_question_counts(p_student_ids text[], p_from text, p_to text) [security definer]
CREATE OR REPLACE FUNCTION public.plan_question_counts(p_student_ids text[], p_from text, p_to text)
 RETURNS TABLE(student_id text, week_start text, day integer, subject text, question_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if p_from is null or p_to is null or p_from !~ '^\d{4}-\d{2}-\d{2}$' or p_to !~ '^\d{4}-\d{2}-\d{2}$'
     or p_to::date < p_from::date or p_to::date - p_from::date > 62
     or p_student_ids is null or cardinality(p_student_ids) > 2000 then
    return;
  end if;
  return query
    select i.student_id::text, left(i.week_start::text, 10), coalesce(i.day, 0)::integer, coalesce(i.subject, '')::text,
           sum(i.question_count)::integer
      from public.study_plan_items i
     where i.student_id::text = any (p_student_ids)
       and i.week_start::date between p_from::date - 6 and p_to::date
       and coalesce(i.question_count, 0) > 0
       and public.priv_can_see_student(i.student_id::text)
     group by 1, 2, 3, 4;
end $function$;

-- plan_subject_ok(p_subject text) [security definer]
CREATE OR REPLACE FUNCTION public.plan_subject_ok(p_subject text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_branch TEXT;
  v_subjects TEXT[];
BEGIN
  IF public.is_head_admin() OR public.is_kurum_admin() THEN RETURN TRUE; END IF;
  SELECT t.branch INTO v_branch FROM public.teachers t WHERE t.auth_user_id = auth.uid() LIMIT 1;
  v_subjects := public.branch_subjects(v_branch);
  IF v_subjects IS NULL OR cardinality(v_subjects) = 0 THEN RETURN TRUE; END IF;
  RETURN p_subject = ANY (v_subjects);
END $function$;

-- priv_can_see_student(p_student_id text) [security definer]
CREATE OR REPLACE FUNCTION public.priv_can_see_student(p_student_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if public.is_admin() then
    return true;
  end if;
  if not public.is_teacher() then
    return false;
  end if;
  return public.teacher_has_student_access(p_student_id, null::text)
      or p_student_id in (select public.my_student_ids());
end $function$;

-- priv_my_teacher_ids() [security definer]
CREATE OR REPLACE FUNCTION public.priv_my_teacher_ids()
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(array_agg(t.id), '{}'::text[])
    from public.teachers t
   where auth.uid() is not null
     and (t.auth_user_id = auth.uid() or t.id = auth.uid()::text)
$function$;

-- priv_teacher_ok(p_teacher_id text) [security definer]
CREATE OR REPLACE FUNCTION public.priv_teacher_ok(p_teacher_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if p_teacher_id is null or btrim(p_teacher_id) = '' then
    return false;
  end if;
  if p_teacher_id = any (public.priv_my_teacher_ids()) or p_teacher_id = auth.uid()::text then
    return true;
  end if;
  if public.is_kurum_admin() and exists (
    select 1 from public.teachers t
     where (t.id = p_teacher_id or t.auth_user_id::text = p_teacher_id)
       and t.kurum_id is not null
       and t.kurum_id = public.my_kurum_id()
  ) then
    return true;
  end if;
  return false;
end $function$;

-- question_targets_keep_owner() [security definer]
CREATE OR REPLACE FUNCTION public.question_targets_keep_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(auth.uid(), NEW.created_by);
  ELSE
    -- Sahibi bilinmeyen eski kayıt ilk düzenleyene geçer; diğerlerinde sahip korunur
    NEW.created_by := COALESCE(OLD.created_by, auth.uid());
  END IF;
  RETURN NEW;
END;
$function$;

-- record_world_ok(p_owner uuid) [security definer]
CREATE OR REPLACE FUNCTION public.record_world_ok(p_owner uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.is_head_admin()
      OR NOT public.is_teacher()
      OR CASE WHEN p_owner IS NULL THEN public.my_kurum_id() IS NULL
              ELSE p_owner = auth.uid() OR EXISTS (
                     SELECT 1 FROM public.teachers t
                      WHERE t.auth_user_id = p_owner AND t.kurum_id IS NOT DISTINCT FROM public.my_kurum_id()) END
$function$;

-- rls_deneme_published_exam_ids() [security definer]
CREATE OR REPLACE FUNCTION public.rls_deneme_published_exam_ids()
 RETURNS SETOF text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select e.id from public.deneme_exams e where e.published is true
$function$;

-- rls_deneme_scope_exam_ids() [security definer]
CREATE OR REPLACE FUNCTION public.rls_deneme_scope_exam_ids()
 RETURNS SETOF text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select e.id from public.deneme_exams e
   where public.deneme_in_scope(e.kurum_id) or (public.is_head_admin() and e.kurum_id is null)
$function$;

-- rls_kurum_teacher_auth_ids() [security definer]
CREATE OR REPLACE FUNCTION public.rls_kurum_teacher_auth_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select t.auth_user_id from public.teachers t
   where t.auth_user_id is not null
     and t.kurum_id is not distinct from public.my_kurum_id()
$function$;

-- rls_plan_item_visible_keys() [security definer]
CREATE OR REPLACE FUNCTION public.rls_plan_item_visible_keys()
 RETURNS SETOF text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select d.k
    from (select distinct coalesce(created_by::text, '') as b,
                          coalesce(created_by_name, '') as n,
                          coalesce(created_by::text, '') || chr(31) || coalesce(created_by_name, '') as k
            from public.study_plan_items) d
   where public.plan_item_visible(d.b, d.n)
$function$;

-- rls_tha_set() [security definer]
CREATE OR REPLACE FUNCTION public.rls_tha_set()
 RETURNS SETOF text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_kurum uuid;
  v_tids text[];
  v_wide boolean := false;
begin
  if auth.uid() is null then
    return;
  end if;

  -- teacher_has_student_access ile aynı sıra: kurum yöneticisi -> rol sistemi -> erişim tabloları
  if public.is_kurum_admin() then
    v_wide := true;
  elsif public.kurum_roles_on() then
    if public.etut_only() then
      v_tids := public.priv_my_teacher_ids();
      return query
        select distinct x #>> '{}'
          from public.etuts e
          cross join lateral jsonb_array_elements(
            case when jsonb_typeof(coalesce(e.assigned_student_ids, '[]'::jsonb)) = 'array'
                 then e.assigned_student_ids else '[]'::jsonb end) x
         where jsonb_typeof(x) = 'string'
           and (e.etut_teacher_id = any (v_tids)
                or coalesce(e.etut_teacher_ids, '{}'::text[]) && v_tids);
      return;
    end if;
    if public.role_wide_view() then
      v_wide := true;
    end if;
  end if;

  if v_wide then
    -- kurum_has_student(öğrenci) ile aynı koşul; sınıf denetimi her sınıf için bir kez yapılır
    return query
      with kc as (
        select c.cid
          from (select distinct s2.class_id as cid from public.students s2 where s2.class_id is not null) c
         where public.kurum_has_class(c.cid)
      )
      select s.id
        from public.students s
       where s.id is not null
         and ((s.kurum_id is not null and s.kurum_id = public.my_kurum_id())
              or s.class_id in (select kc.cid from kc));
    return;
  end if;

  v_kurum := public.my_kurum_id();
  return query
    select t.sid
      from (
        select tsa.student_id as sid
          from public.teacher_student_access tsa
         where tsa.teacher_auth_id = auth.uid()
        union
        select s.id
          from public.students s
          join public.teacher_class_access tca on tca.class_id = s.class_id
         where tca.teacher_auth_id = auth.uid()
      ) t
     where t.sid is not null
       and (v_kurum is null or public.kurum_has_student(t.sid));
end $function$;

-- rls_tha_student_ids() [security definer]
CREATE OR REPLACE FUNCTION public.rls_tha_student_ids()
 RETURNS SETOF text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select d.sid
    from (select student_id as sid from public.study_plan_items
          union select student_id from public.study_plans
          union select student_id from public.student_books) d
   where d.sid is not null
     and public.teacher_has_student_access(d.sid, null::text)
$function$;

-- rls_world_all() [security definer]
CREATE OR REPLACE FUNCTION public.rls_world_all()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select public.is_head_admin() or not public.is_teacher()
$function$;

-- role_can_teach() [security definer]
CREATE OR REPLACE FUNCTION public.role_can_teach()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT NOT public.idare_ders_kapali() AND (NOT public.kurum_roles_on()
      OR public.is_kurum_admin()
      OR NOT EXISTS (
           SELECT 1 FROM public.teachers t JOIN public.teacher_roles r ON r.teacher_id = t.id
            WHERE auth.uid() IS NOT NULL AND t.auth_user_id = auth.uid())
      OR public.has_any_role(ARRAY['rehberlik', 'zumre_baskani', 'ogretmen']))
$function$;

-- role_manager() [security definer]
CREATE OR REPLACE FUNCTION public.role_manager()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT NOT public.is_head_admin() AND (
    public.is_kurum_admin()
    OR EXISTS (
      SELECT 1 FROM public.teachers t
        JOIN public.teacher_roles r ON r.teacher_id = t.id
       WHERE auth.uid() IS NOT NULL AND t.auth_user_id = auth.uid()
         AND t.kurum_id IS NOT NULL AND coalesce(t.status, 'approved') = 'approved'
         AND r.role IN ('mudur', 'mudur_yardimcisi')
    )
  )
$function$;

-- role_record_editable(p_owner uuid) [security definer]
CREATE OR REPLACE FUNCTION public.role_record_editable(p_owner uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT NOT public.kurum_roles_on()
      OR public.is_kurum_admin()
      OR p_owner IS NULL
      OR p_owner = auth.uid()
$function$;

-- role_record_visible(p_owner uuid) [security definer]
CREATE OR REPLACE FUNCTION public.role_record_visible(p_owner uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT NOT public.kurum_roles_on()
      OR public.is_kurum_admin()
      OR p_owner IS NULL
      OR p_owner = auth.uid()
      OR public.role_wide_view()
      OR public.role_sees_owner(p_owner::text)
$function$;

-- role_section_ok(p_section text) [security definer]
CREATE OR REPLACE FUNCTION public.role_section_ok(p_section text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_roles text[];
BEGIN
  SELECT coalesce(array_agg(r.role), '{}') INTO v_roles
    FROM public.teacher_roles r JOIN public.teachers t ON t.id = r.teacher_id
   WHERE auth.uid() IS NOT NULL AND t.auth_user_id = auth.uid();
  IF cardinality(v_roles) = 0 THEN
    RETURN true; -- rolü verilmemiş öğretmen: bugünkü gibi
  END IF;
  IF 'rehberlik' = ANY (v_roles) AND p_section = ANY (ARRAY['home', 'students', 'homework', 'etuts', 'messages', 'archive', 'grades', 'question_tracking', 'deneme']) THEN RETURN true; END IF;
  IF 'olcme_degerlendirme' = ANY (v_roles) AND p_section = ANY (ARRAY['home', 'students', 'messages', 'archive', 'deneme']) THEN RETURN true; END IF;
  IF (('ogretmen' = ANY (v_roles)) OR ('zumre_baskani' = ANY (v_roles)))
     AND p_section = ANY (ARRAY['home', 'students', 'homework', 'etuts', 'messages', 'archive', 'grades', 'question_tracking', 'deneme']) THEN RETURN true; END IF;
  IF 'etut_ogretmeni' = ANY (v_roles) AND p_section = 'etuts' THEN RETURN true; END IF;
  RETURN false;
END $function$;

-- role_sees_owner(p_owner text) [security definer]
CREATE OR REPLACE FUNCTION public.role_sees_owner(p_owner text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF p_owner IS NULL OR btrim(p_owner) = '' OR NOT public.kurum_roles_on() THEN
    RETURN false;
  END IF;
  IF public.has_role('rehberlik') AND EXISTS (
    SELECT 1 FROM public.teachers t
     WHERE (t.id = p_owner OR t.auth_user_id::text = p_owner)
       AND t.kurum_id IS NOT NULL AND t.kurum_id = public.my_kurum_id()
  ) THEN
    RETURN true;
  END IF;
  RETURN public.zumre_peer(p_owner);
END $function$;

-- role_wide_view() [security definer]
CREATE OR REPLACE FUNCTION public.role_wide_view()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.has_any_role(ARRAY['rehberlik', 'olcme_degerlendirme'])
$function$;

-- safe_jsonb(p text)
CREATE OR REPLACE FUNCTION public.safe_jsonb(p text)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p IS NULL OR p !~ '^\s*\{' THEN
    RETURN NULL;
  END IF;
  RETURN p::jsonb;
EXCEPTION WHEN others THEN
  RETURN NULL;
END $function$;

-- same_kurum_auth(p_auth uuid) [security definer]
CREATE OR REPLACE FUNCTION public.same_kurum_auth(p_auth uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT p_auth = auth.uid() OR EXISTS (
    SELECT 1 FROM public.teachers t
     WHERE t.auth_user_id = p_auth AND t.kurum_id IS NOT DISTINCT FROM public.my_kurum_id()
  )
$function$;

-- same_kurum_auth_text(p_auth text) [security definer]
CREATE OR REPLACE FUNCTION public.same_kurum_auth_text(p_auth text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN public.same_kurum_auth(p_auth::uuid);
EXCEPTION WHEN others THEN
  RETURN FALSE;
END $function$;

-- section_allowed(p_section text) [security definer]
CREATE OR REPLACE FUNCTION public.section_allowed(p_section text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT NOT public.kurum_roles_on()
      OR public.is_kurum_admin()
      OR (
        NOT EXISTS (
          SELECT 1 FROM public.teacher_section_access a JOIN public.teachers t ON t.id = a.teacher_id
           WHERE auth.uid() IS NOT NULL AND t.auth_user_id = auth.uid() AND p_section = ANY (a.deny_sections))
        AND (public.section_explicit_allow(p_section) OR public.role_section_ok(p_section))
      )
$function$;

-- section_explicit_allow(p_section text) [security definer]
CREATE OR REPLACE FUNCTION public.section_explicit_allow(p_section text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.kurum_roles_on() AND EXISTS (
    SELECT 1 FROM public.teacher_section_access a JOIN public.teachers t ON t.id = a.teacher_id
     WHERE auth.uid() IS NOT NULL AND t.auth_user_id = auth.uid() AND p_section = ANY (a.allow_sections)
  )
$function$;

-- set_class_kurum()
CREATE OR REPLACE FUNCTION public.set_class_kurum()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF current_user = 'authenticated' AND NOT public.is_head_admin() THEN
    IF TG_OP = 'INSERT' THEN
      NEW.kurum_id := public.my_kurum_id();
    ELSE
      NEW.kurum_id := OLD.kurum_id;
    END IF;
  END IF;
  RETURN NEW;
END $function$;

-- set_etut_teacher_kurum()
CREATE OR REPLACE FUNCTION public.set_etut_teacher_kurum()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF current_user = 'authenticated' AND NOT public.is_head_admin() THEN
    IF TG_OP = 'INSERT' THEN
      NEW.kurum_id := public.my_kurum_id();
    ELSE
      NEW.kurum_id := OLD.kurum_id;
    END IF;
  ELSIF TG_OP = 'INSERT' AND NEW.kurum_id IS NULL AND NEW.teacher_id IS NOT NULL THEN
    SELECT t.kurum_id INTO NEW.kurum_id FROM public.teachers t WHERE t.id = NEW.teacher_id;
  END IF;
  RETURN NEW;
END $function$;

-- set_student_kurum()
CREATE OR REPLACE FUNCTION public.set_student_kurum()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_found BOOLEAN;
  v_kurum UUID;
  v_my UUID;
BEGIN
  SELECT true, c.kurum_id INTO v_found, v_kurum FROM public.classes c WHERE c.id = NEW.class_id;
  IF coalesce(v_found, false) AND NEW.class_id <> 'class-default' THEN
    IF v_kurum IS NOT NULL THEN
      -- kurumun kendi sınıfı (ya da başka kurumun sınıfı: o zaman ekleme kuralı reddeder)
      NEW.kurum_id := v_kurum;
    ELSIF current_user = 'authenticated' AND NOT public.is_head_admin() THEN
      -- genel yöneticinin sınıfı: kuruma izin verilmişse öğrenci kurumun olur
      v_my := public.my_kurum_id();
      IF v_my IS NOT NULL AND EXISTS (
           SELECT 1 FROM public.kurum_class_grants g WHERE g.class_id = NEW.class_id AND g.kurum_id = v_my) THEN
        NEW.kurum_id := v_my;
      ELSIF TG_OP = 'UPDATE' THEN
        NEW.kurum_id := OLD.kurum_id;
      ELSE
        NEW.kurum_id := NULL;
      END IF;
    ELSIF TG_OP = 'UPDATE' AND OLD.kurum_id IS NOT NULL AND EXISTS (
           SELECT 1 FROM public.kurum_class_grants g WHERE g.class_id = NEW.class_id AND g.kurum_id = OLD.kurum_id) THEN
      -- genel yönetici kurum öğrencisini düzenliyor: öğrenci kurumunda kalır
      NEW.kurum_id := OLD.kurum_id;
    ELSE
      NEW.kurum_id := v_kurum;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.kurum_id := OLD.kurum_id;
  ELSIF current_user = 'authenticated' AND NOT public.is_head_admin() THEN
    NEW.kurum_id := public.my_kurum_id();
  END IF;
  RETURN NEW;
END $function$;

-- set_teacher_contact(p_teacher_id text, p_phone text, p_birth_date date) [security definer]
CREATE OR REPLACE FUNCTION public.set_teacher_contact(p_teacher_id text, p_phone text, p_birth_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_kurum uuid;
  v_auth uuid;
  v_found boolean;
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Yetkisiz işlem.';
  END IF;
  SELECT true, t.kurum_id, t.auth_user_id INTO v_found, v_kurum, v_auth
    FROM public.teachers t WHERE t.id = p_teacher_id LIMIT 1;
  IF v_found IS NULL THEN
    RAISE EXCEPTION 'Öğretmen bulunamadı.';
  END IF;
  -- Aşama 150: genel yönetici her öğretmen; kurum yöneticisi kendi kurumu; öğretmen kendisi
  IF NOT (
    v_auth = auth.uid()
    OR public.is_head_admin()
    OR (public.is_kurum_admin() AND v_kurum IS NOT DISTINCT FROM public.my_kurum_id())
  ) THEN
    RAISE EXCEPTION 'Yetkisiz işlem: bu öğretmenin bilgilerini değiştiremezsiniz.';
  END IF;

  IF v_phone IS NOT NULL AND length(v_phone) = 10 THEN v_phone := '0' || v_phone; END IF;
  IF v_phone IS NOT NULL AND v_phone !~ '^0[2-5][0-9]{9}$' THEN
    RAISE EXCEPTION 'Geçersiz telefon (örn. 0532 123 45 67).';
  END IF;

  IF v_phone IS NULL AND p_birth_date IS NULL THEN
    DELETE FROM public.teacher_contacts WHERE teacher_id = p_teacher_id;
  ELSE
    INSERT INTO public.teacher_contacts AS c (teacher_id, phone, birth_date, updated_by, updated_at)
    VALUES (p_teacher_id, v_phone, p_birth_date, auth.uid(), now())
    ON CONFLICT (teacher_id) DO UPDATE
      SET phone = EXCLUDED.phone, birth_date = EXCLUDED.birth_date,
          updated_by = EXCLUDED.updated_by, updated_at = now();
  END IF;
  RETURN jsonb_build_object('teacher_id', p_teacher_id, 'phone', v_phone, 'birth_date', p_birth_date);
END;
$function$;

-- set_teacher_grades(p_teacher_auth_id uuid, p_grades integer[], p_all boolean) [security definer]
CREATE OR REPLACE FUNCTION public.set_teacher_grades(p_teacher_auth_id uuid, p_grades integer[], p_all boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_kurum uuid;
  v_found boolean;
  v_grades int[];
  v_all boolean := coalesce(p_all, false);
  v_count integer;
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_admin() OR public.is_kurum_admin()) THEN
    RAISE EXCEPTION 'Yetkisiz işlem: kademeleri yalnızca kurum yöneticisi verebilir.';
  END IF;
  SELECT true, t.kurum_id INTO v_found, v_kurum FROM public.teachers t WHERE t.auth_user_id = p_teacher_auth_id LIMIT 1;
  IF v_found IS NULL THEN
    RAISE EXCEPTION 'Öğretmen bulunamadı.';
  END IF;
  -- Kurum ayrımı: yalnızca kendi kurumunun öğretmeni (genel yönetici kuruma geçince o kurum)
  IF v_kurum IS DISTINCT FROM public.my_kurum_id() THEN
    RAISE EXCEPTION 'Bu öğretmen sizin kurumunuzda değil.';
  END IF;

  SELECT coalesce(array_agg(DISTINCT g ORDER BY g), '{}') INTO v_grades
  FROM unnest(coalesce(p_grades, '{}')) AS g WHERE g BETWEEN 1 AND 12;

  IF v_all = false AND cardinality(v_grades) = 0 THEN
    DELETE FROM public.teacher_grade_access WHERE teacher_auth_id = p_teacher_auth_id;
  ELSE
    INSERT INTO public.teacher_grade_access AS a (teacher_auth_id, kurum_id, grades, all_grades, updated_by, updated_at)
    VALUES (p_teacher_auth_id, v_kurum, v_grades, v_all, auth.uid(), now())
    ON CONFLICT (teacher_auth_id) DO UPDATE
      SET kurum_id = EXCLUDED.kurum_id, grades = EXCLUDED.grades, all_grades = EXCLUDED.all_grades,
          updated_by = EXCLUDED.updated_by, updated_at = now();
  END IF;

  v_count := public.tga_apply(p_teacher_auth_id);
  RETURN jsonb_build_object('grades', to_jsonb(v_grades), 'all', v_all, 'classes', v_count);
END;
$function$;

-- set_teacher_kurum()
CREATE OR REPLACE FUNCTION public.set_teacher_kurum()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF current_user = 'authenticated' AND NOT public.is_head_admin() THEN
    NEW.kurum_id := public.my_kurum_id();
    NEW.is_admin := false;
  END IF;
  RETURN NEW;
END $function$;

-- set_teacher_roles(p_teacher_id text, p_roles text[]) [security definer]
CREATE OR REPLACE FUNCTION public.set_teacher_roles(p_teacher_id text, p_roles text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_allowed text[] := ARRAY['mudur', 'mudur_yardimcisi', 'rehberlik', 'olcme_degerlendirme', 'zumre_baskani', 'ogretmen', 'etut_ogretmeni'];
  v_head boolean := public.is_head_admin();
  v_target record;
  v_me_id text;
  v_me_name text;
  v_old text[];
  v_new text[];
  v_add text[];
  v_rem text[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Oturum bulunamadı. Lütfen yeniden giriş yapın.';
  END IF;

  SELECT t.id, t.name, t.kurum_id, t.branch, coalesce(t.is_admin, false) AS is_admin
    INTO v_target
    FROM public.teachers t WHERE t.id = p_teacher_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Öğretmen bulunamadı.';
  END IF;
  -- Aşama 98: genel yönetici bu kuruma geçmişse (kurum seçici) genel yönetici sayılır — yalnızca o kurumun kişileri için
  IF NOT v_head AND public.head_gecis() AND v_target.kurum_id IS NOT NULL AND v_target.kurum_id = public.my_kurum_id() THEN
    v_head := true;
  END IF;

  IF EXISTS (SELECT 1 FROM unnest(coalesce(p_roles, '{}')) x WHERE NOT (x = ANY (v_allowed))) THEN
    RAISE EXCEPTION 'Geçersiz rol seçildi.';
  END IF;
  v_new := ARRAY(SELECT DISTINCT x FROM unnest(coalesce(p_roles, '{}')) x ORDER BY x);

  -- Zümre başkanı öğretmen rolüyle birlikte verilir; zümresi kayıtlı branşıdır
  IF 'zumre_baskani' = ANY (v_new) THEN
    IF coalesce(btrim(v_target.branch), '') = '' THEN
      RAISE EXCEPTION 'Zümre başkanı rolü için öğretmenin branşı kayıtlı olmalıdır.';
    END IF;
    IF NOT ('ogretmen' = ANY (v_new)) THEN
      v_new := ARRAY(SELECT DISTINCT x FROM unnest(v_new || 'ogretmen'::text) x ORDER BY x);
    END IF;
  END IF;

  v_old := ARRAY(SELECT r.role FROM public.teacher_roles r WHERE r.teacher_id = p_teacher_id ORDER BY r.role);

  SELECT t.id, t.name INTO v_me_id, v_me_name
    FROM public.teachers t WHERE t.auth_user_id = auth.uid() LIMIT 1;

  IF NOT v_head THEN
    IF NOT public.role_manager() THEN
      RAISE EXCEPTION 'Rol vermek için yetkiniz yok.';
    END IF;
    IF v_target.kurum_id IS NULL OR v_target.kurum_id IS DISTINCT FROM public.my_kurum_id() THEN
      RAISE EXCEPTION 'Yalnızca kendi kurumunuzdaki kişilere rol verebilirsiniz.';
    END IF;
    IF v_target.id = v_me_id THEN
      RAISE EXCEPTION 'Kendi rollerinizi değiştiremezsiniz.';
    END IF;
    IF v_target.is_admin THEN
      RAISE EXCEPTION 'Kurum yöneticisinin rollerini yalnızca genel yönetici değiştirebilir.';
    END IF;
    IF ('mudur' = ANY (v_old)) OR ('mudur' = ANY (v_new)) THEN
      RAISE EXCEPTION 'Müdür rolünü yalnızca genel yönetici verebilir veya kaldırabilir.';
    END IF;
  END IF;

  v_add := ARRAY(SELECT x FROM unnest(v_new) x WHERE NOT (x = ANY (v_old)));
  v_rem := ARRAY(SELECT x FROM unnest(v_old) x WHERE NOT (x = ANY (v_new)));

  IF coalesce(array_length(v_rem, 1), 0) > 0 THEN
    DELETE FROM public.teacher_roles WHERE teacher_id = p_teacher_id AND role = ANY (v_rem);
  END IF;
  IF coalesce(array_length(v_add, 1), 0) > 0 THEN
    INSERT INTO public.teacher_roles (teacher_id, role, kurum_id, granted_by, granted_by_name)
    SELECT p_teacher_id, x, v_target.kurum_id, auth.uid(), CASE WHEN v_head THEN 'Genel yönetici' ELSE v_me_name END
      FROM unnest(v_add) x
    ON CONFLICT (teacher_id, role) DO NOTHING;
  END IF;
  -- Öğretmenin kurumu değiştiyse rol kayıtlarındaki kurum bilgisi güncellenir
  UPDATE public.teacher_roles SET kurum_id = v_target.kurum_id
   WHERE teacher_id = p_teacher_id AND kurum_id IS DISTINCT FROM v_target.kurum_id;

  IF coalesce(array_length(v_add, 1), 0) + coalesce(array_length(v_rem, 1), 0) > 0 THEN
    INSERT INTO public.teacher_role_log (teacher_id, teacher_name, kurum_id, added, removed, actor_auth_id, actor_name)
    VALUES (p_teacher_id, v_target.name, v_target.kurum_id, v_add, v_rem, auth.uid(), CASE WHEN v_head THEN 'Genel yönetici' ELSE v_me_name END);
  END IF;

  RETURN jsonb_build_object('roles', to_jsonb(v_new), 'added', to_jsonb(v_add), 'removed', to_jsonb(v_rem));
END $function$;

-- set_teacher_sections(p_teacher_id text, p_allow text[], p_deny text[]) [security definer]
CREATE OR REPLACE FUNCTION public.set_teacher_sections(p_teacher_id text, p_allow text[], p_deny text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ok text[] := ARRAY['home', 'students', 'homework', 'etuts', 'messages', 'archive', 'grades', 'question_tracking', 'deneme'];
  v_head boolean := public.is_head_admin();
  v_target record;
  v_me_id text;
  v_me_name text;
  v_allow text[];
  v_deny text[];
  v_keep_allow text[] := '{}';
  v_keep_deny text[] := '{}';
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Oturum bulunamadı. Lütfen yeniden giriş yapın.';
  END IF;
  SELECT t.id, t.name, t.kurum_id, coalesce(t.is_admin, false) AS is_admin INTO v_target
    FROM public.teachers t WHERE t.id = p_teacher_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Öğretmen bulunamadı.';
  END IF;
  IF NOT v_head AND public.head_gecis() AND v_target.kurum_id IS NOT NULL AND v_target.kurum_id = public.my_kurum_id() THEN
    v_head := true;
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(coalesce(p_allow, '{}') || coalesce(p_deny, '{}')) x WHERE NOT (x = ANY (v_ok))) THEN
    RAISE EXCEPTION 'Geçersiz bölüm seçildi.';
  END IF;
  v_allow := ARRAY(SELECT DISTINCT x FROM unnest(coalesce(p_allow, '{}')) x ORDER BY x);
  v_deny := ARRAY(SELECT DISTINCT x FROM unnest(coalesce(p_deny, '{}')) x WHERE NOT (x = ANY (v_allow)) ORDER BY x);

  SELECT t.id, t.name INTO v_me_id, v_me_name FROM public.teachers t WHERE t.auth_user_id = auth.uid() LIMIT 1;
  IF NOT v_head THEN
    IF NOT public.role_manager() THEN
      RAISE EXCEPTION 'Bölüm izni vermek için yetkiniz yok.';
    END IF;
    IF v_target.kurum_id IS NULL OR v_target.kurum_id IS DISTINCT FROM public.my_kurum_id() THEN
      RAISE EXCEPTION 'Yalnızca kendi kurumunuzdaki kişilere bölüm izni verebilirsiniz.';
    END IF;
    IF v_target.id = v_me_id THEN
      RAISE EXCEPTION 'Kendi bölüm izinlerinizi değiştiremezsiniz.';
    END IF;
    IF v_target.is_admin OR EXISTS (SELECT 1 FROM public.teacher_roles r WHERE r.teacher_id = p_teacher_id AND r.role = 'mudur') THEN
      RAISE EXCEPTION 'Kurum yöneticisinin ve Müdürün bölüm izinlerini yalnızca genel yönetici değiştirebilir.';
    END IF;
  END IF;

  -- Aşama 143: kayıttaki işlem izinleri (izin:...) aynen korunur
  SELECT ARRAY(SELECT x FROM unnest(a.allow_sections) x WHERE x LIKE 'izin:%'),
         ARRAY(SELECT x FROM unnest(a.deny_sections) x WHERE x LIKE 'izin:%')
    INTO v_keep_allow, v_keep_deny
    FROM public.teacher_section_access a WHERE a.teacher_id = p_teacher_id;
  v_keep_allow := coalesce(v_keep_allow, '{}');
  v_keep_deny := coalesce(v_keep_deny, '{}');

  IF cardinality(v_allow) + cardinality(v_keep_allow) = 0 AND cardinality(v_deny) + cardinality(v_keep_deny) = 0 THEN
    DELETE FROM public.teacher_section_access WHERE teacher_id = p_teacher_id;
  ELSE
    INSERT INTO public.teacher_section_access (teacher_id, allow_sections, deny_sections, updated_by, updated_by_name, updated_at)
    VALUES (p_teacher_id, v_allow || v_keep_allow, v_deny || v_keep_deny, auth.uid(), CASE WHEN v_head THEN 'Genel yönetici' ELSE v_me_name END, now())
    ON CONFLICT (teacher_id) DO UPDATE
      SET allow_sections = EXCLUDED.allow_sections, deny_sections = EXCLUDED.deny_sections,
          updated_by = EXCLUDED.updated_by, updated_by_name = EXCLUDED.updated_by_name, updated_at = now();
  END IF;

  INSERT INTO public.teacher_role_log (teacher_id, teacher_name, kurum_id, added, removed, actor_auth_id, actor_name)
  VALUES (p_teacher_id, v_target.name, v_target.kurum_id,
          ARRAY(SELECT 'bolum+' || x FROM unnest(v_allow) x), ARRAY(SELECT 'bolum-' || x FROM unnest(v_deny) x),
          auth.uid(), CASE WHEN v_head THEN 'Genel yönetici' ELSE v_me_name END);

  RETURN jsonb_build_object('allow', to_jsonb(v_allow), 'deny', to_jsonb(v_deny));
END $function$;

-- set_teacher_yetkiler(p_teacher_id text, p_allow text[], p_deny text[]) [security definer]
CREATE OR REPLACE FUNCTION public.set_teacher_yetkiler(p_teacher_id text, p_allow text[], p_deny text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ok text[] := ARRAY['home', 'students', 'homework', 'etuts', 'messages', 'archive', 'grades', 'question_tracking', 'deneme',
                       'izin:karne_gonder', 'izin:duyuru', 'izin:veli_bilgi', 'izin:ogrenci_ekle_sil', 'izin:ogrenci_duzenle',
                       'izin:deneme_yonet', 'izin:etut_ata'];
  v_head boolean := public.is_head_admin();
  v_target record;
  v_me_id text;
  v_me_name text;
  v_allow text[];
  v_deny text[];
  v_old_allow text[] := '{}';
  v_old_deny text[] := '{}';
  v_actor text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Oturum bulunamadı. Lütfen yeniden giriş yapın.';
  END IF;
  SELECT t.id, t.name, t.kurum_id, coalesce(t.is_admin, false) AS is_admin INTO v_target
    FROM public.teachers t WHERE t.id = p_teacher_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Öğretmen bulunamadı.';
  END IF;
  -- genel yönetici bu kuruma geçmişse (kurum seçici) genel yönetici sayılır — yalnızca o kurumun kişileri için
  IF NOT v_head AND public.head_gecis() AND v_target.kurum_id IS NOT NULL AND v_target.kurum_id = public.my_kurum_id() THEN
    v_head := true;
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(coalesce(p_allow, '{}') || coalesce(p_deny, '{}')) x WHERE NOT (x = ANY (v_ok))) THEN
    RAISE EXCEPTION 'Geçersiz bölüm ya da izin seçildi.';
  END IF;
  v_allow := ARRAY(SELECT DISTINCT x FROM unnest(coalesce(p_allow, '{}')) x ORDER BY x);
  v_deny := ARRAY(SELECT DISTINCT x FROM unnest(coalesce(p_deny, '{}')) x WHERE NOT (x = ANY (v_allow)) ORDER BY x);

  SELECT t.id, t.name INTO v_me_id, v_me_name FROM public.teachers t WHERE t.auth_user_id = auth.uid() LIMIT 1;
  IF NOT v_head THEN
    IF NOT public.role_manager() THEN
      RAISE EXCEPTION 'Yetki vermek için yetkiniz yok.';
    END IF;
    IF v_target.kurum_id IS NULL OR v_target.kurum_id IS DISTINCT FROM public.my_kurum_id() THEN
      RAISE EXCEPTION 'Yalnızca kendi kurumunuzdaki kişilere yetki verebilirsiniz.';
    END IF;
    IF v_target.id = v_me_id THEN
      RAISE EXCEPTION 'Kendi yetkilerinizi değiştiremezsiniz.';
    END IF;
    IF v_target.is_admin OR EXISTS (SELECT 1 FROM public.teacher_roles r WHERE r.teacher_id = p_teacher_id AND r.role = 'mudur') THEN
      RAISE EXCEPTION 'Kurum yöneticisinin ve Müdürün yetkilerini yalnızca genel yönetici değiştirebilir.';
    END IF;
  END IF;

  SELECT a.allow_sections, a.deny_sections INTO v_old_allow, v_old_deny
    FROM public.teacher_section_access a WHERE a.teacher_id = p_teacher_id;
  v_old_allow := coalesce(v_old_allow, '{}');
  v_old_deny := coalesce(v_old_deny, '{}');
  v_actor := CASE WHEN v_head THEN 'Genel yönetici' ELSE v_me_name END;

  IF cardinality(v_allow) = 0 AND cardinality(v_deny) = 0 THEN
    DELETE FROM public.teacher_section_access WHERE teacher_id = p_teacher_id;
  ELSE
    INSERT INTO public.teacher_section_access (teacher_id, allow_sections, deny_sections, updated_by, updated_by_name, updated_at)
    VALUES (p_teacher_id, v_allow, v_deny, auth.uid(), v_actor, now())
    ON CONFLICT (teacher_id) DO UPDATE
      SET allow_sections = EXCLUDED.allow_sections, deny_sections = EXCLUDED.deny_sections,
          updated_by = EXCLUDED.updated_by, updated_by_name = EXCLUDED.updated_by_name, updated_at = now();
  END IF;

  -- günlük: yalnızca değişenler ("izin:karne_gonder+" açıldı, "-" kapatıldı, "~" rolden)
  IF v_allow IS DISTINCT FROM v_old_allow OR v_deny IS DISTINCT FROM v_old_deny THEN
    INSERT INTO public.teacher_role_log (teacher_id, teacher_name, kurum_id, added, removed, actor_auth_id, actor_name)
    VALUES (p_teacher_id, v_target.name, v_target.kurum_id,
            ARRAY(SELECT CASE WHEN x LIKE 'izin:%' THEN x ELSE 'bolum+' || x END FROM unnest(v_allow) x WHERE NOT (x = ANY (v_old_allow)))
              || ARRAY(SELECT CASE WHEN x LIKE 'izin:%' THEN x || '~' ELSE 'bolum~' || x END FROM unnest(v_old_allow || v_old_deny) x
                        WHERE NOT (x = ANY (v_allow || v_deny))),
            ARRAY(SELECT CASE WHEN x LIKE 'izin:%' THEN x ELSE 'bolum-' || x END FROM unnest(v_deny) x WHERE NOT (x = ANY (v_old_deny))),
            auth.uid(), v_actor);
  END IF;

  RETURN jsonb_build_object('allow', to_jsonb(v_allow), 'deny', to_jsonb(v_deny));
END $function$;

-- spi164_insert_sent() [security definer]
CREATE OR REPLACE FUNCTION public.spi164_insert_sent()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW; -- sunucu / SQL Editor: olduğu gibi
  END IF;
  NEW.group_id := NULL;
  NEW.mailed_at := NULL;
  NEW.sent_at := NULL;
  IF EXISTS (
    SELECT 1 FROM public.study_plan_items x
     WHERE x.plan_id = NEW.plan_id AND x.sent_at IS NOT NULL
       AND x.created_by IS NOT DISTINCT FROM NEW.created_by
  ) THEN
    NEW.sent_at := now();
  END IF;
  RETURN NEW;
END $function$;

-- spi164_sync_header() [security definer]
CREATE OR REPLACE FUNCTION public.spi164_sync_header()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_plan text;
  v_sent timestamptz;
BEGIN
  FOR v_plan IN
    SELECT DISTINCT x FROM unnest(ARRAY[
      CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN OLD.plan_id END,
      CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN NEW.plan_id END]) AS x
     WHERE x IS NOT NULL
  LOOP
    SELECT max(i.sent_at) INTO v_sent FROM public.study_plan_items i WHERE i.plan_id = v_plan AND i.sent_at IS NOT NULL;
    UPDATE public.study_plans p SET sent_at = v_sent
     WHERE p.id = v_plan AND p.sent_at IS DISTINCT FROM v_sent;
  END LOOP;
  RETURN NULL;
END $function$;

-- spi164_update_guard() [security definer]
CREATE OR REPLACE FUNCTION public.spi164_update_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND coalesce(current_setting('app.spi164_rpc', true), '') <> '1' THEN
    NEW.sent_at := OLD.sent_at;
    NEW.group_id := OLD.group_id;
    NEW.mailed_at := OLD.mailed_at;
  END IF;
  RETURN NEW;
END $function$;

-- student_can_view_homework(p_homework_id text) [security definer]
CREATE OR REPLACE FUNCTION public.student_can_view_homework(p_homework_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.homeworks h
    WHERE h.id = p_homework_id
      AND public.current_student_id() IS NOT NULL
      AND (
        (cardinality(h.target_student_ids) > 0 AND public.current_student_id() = ANY (h.target_student_ids))
        OR (cardinality(h.target_student_ids) = 0 AND public.current_student_class_id() = ANY (h.target_class_ids))
      )
  )
$function$;

-- student_in_my_etut(p_student_id text) [security definer]
CREATE OR REPLACE FUNCTION public.student_in_my_etut(p_student_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT p_student_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.etuts e
     WHERE jsonb_typeof(coalesce(e.assigned_student_ids, '[]'::jsonb)) = 'array'
       AND e.assigned_student_ids ? p_student_id
       AND (e.etut_teacher_id = ANY (public.priv_my_teacher_ids())
            OR coalesce(e.etut_teacher_ids, '{}'::text[]) && public.priv_my_teacher_ids())
  )
$function$;

-- student_my_attendance() [security definer]
CREATE OR REPLACE FUNCTION public.student_my_attendance()
 RETURNS TABLE(id text, date text, class_id text, subject text, records jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sid TEXT := public.current_student_id();
BEGIN
  IF v_sid IS NULL THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT a.id::text, a.date::text, a.class_id::text, a.subject::text,
         coalesce((SELECT jsonb_agg(CASE WHEN jsonb_typeof(r) = 'object' THEN r - 'note' - 'topic' ELSE r END) FROM jsonb_array_elements(
                     CASE WHEN jsonb_typeof(a.records) = 'array' THEN a.records ELSE '[]'::jsonb END) r
                    WHERE r ->> 'studentId' = v_sid), '[]'::jsonb)
    FROM public.attendance a
   WHERE jsonb_typeof(a.records) = 'array'
     AND a.records @> jsonb_build_array(jsonb_build_object('studentId', v_sid))
   ORDER BY a.date DESC
   LIMIT 2000;
END $function$;

-- student_my_etuts() [security definer]
CREATE OR REPLACE FUNCTION public.student_my_etuts()
 RETURNS TABLE(id text, subject text, topic text, date text, "time" text, duration integer, location text, notes text, assigned_student_ids jsonb, created_at timestamp with time zone, etut_teacher_id text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sid TEXT := public.current_student_id();
BEGIN
  IF v_sid IS NULL THEN
    RETURN;
  END IF;
  RETURN QUERY
  WITH mine AS (
    SELECT e.*,
           public.safe_jsonb(e.notes) AS meta,
           (SELECT public.etut_yoklama_kayit(y.student_id, y.student_name, y.status, y.note, y.topic,
                                             y.marked_by, y.marked_at, y.changed_at)
              FROM public.etut_yoklama y
             WHERE y.etut_id = e.id AND y.student_id = v_sid) AS yk  -- Aşama 178
      FROM public.etuts e
     WHERE jsonb_typeof(e.assigned_student_ids) = 'array'
       AND e.assigned_student_ids ? v_sid
  ), src AS (
    SELECT m.*,
           CASE WHEN m.yk IS NOT NULL THEN m.yk
                WHEN m.meta -> 'studentAttendance' ? v_sid THEN m.meta -> 'studentAttendance' -> v_sid
                ELSE NULL END AS att
      FROM mine m
  )
  SELECT m.id::text, m.subject::text, m.topic::text, m.date::text, m."time"::text, m.duration::integer, m.location::text,
         CASE
           WHEN m.meta IS NULL THEN jsonb_build_object('__etut_meta__', true, 'userNotes', coalesce(m.notes, ''))::text
           ELSE jsonb_strip_nulls(jsonb_build_object(
                  '__etut_meta__', true,
                  'userNotes', coalesce(to_jsonb(m.user_notes), m.meta -> 'userNotes'),
                  'teacherId', m.meta -> 'teacherId',
                  'teacherName', m.meta -> 'teacherName',
                  'teacherNames', m.meta -> 'teacherNames',
                  'teacherBranch', m.meta -> 'teacherBranch',
                  'lessonPeriod', m.meta -> 'lessonPeriod',
                  'duration', m.meta -> 'duration',
                  'gradeLevel', m.meta -> 'gradeLevel',
                  'schoolLevel', m.meta -> 'schoolLevel',
                  'recurrenceGroupId', m.meta -> 'recurrenceGroupId',
                  'assignedStudentIds', jsonb_build_array(v_sid),
                  'studentAttendance', CASE WHEN m.att IS NOT NULL
                                            THEN jsonb_build_object(v_sid, CASE WHEN jsonb_typeof(m.att) = 'object'
                                                                   THEN m.att - 'note' - 'topic' - 'markedBy'
                                                                   ELSE m.att END)
                                            ELSE '{}'::jsonb END
                ))::text
         END,
         jsonb_build_array(v_sid),
         m.created_at,
         m.etut_teacher_id::text
    FROM src m
   ORDER BY m.date DESC
   LIMIT 2000;
END $function$;

-- student_my_kurum() [security definer]
CREATE OR REPLACE FUNCTION public.student_my_kurum()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT coalesce((
    SELECT jsonb_build_object('name', k.name, 'logo', k.logo)
      FROM public.students s
      LEFT JOIN public.classes c ON c.id = s.class_id
      JOIN public.kurumlar k ON k.id = coalesce(s.kurum_id, c.kurum_id)
     WHERE public.is_student() AND (s.auth_user_id = auth.uid() OR s.id = auth.uid()::text)
     LIMIT 1), '{}'::jsonb)
$function$;

-- student_my_sections() [security definer]
CREATE OR REPLACE FUNCTION public.student_my_sections()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sid text := public.current_student_id()::text;
  v_cls text;
  v_kurum text;
  v_skurum text;
  v_mods jsonb;
  v_out jsonb := '{}'::jsonb;
  k text;
  v_on boolean;
BEGIN
  IF v_sid IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT c.id::text, CASE WHEN c.id IS NOT NULL THEN c.kurum_id::text ELSE s.kurum_id::text END, s.kurum_id::text
    INTO v_cls, v_kurum, v_skurum
    FROM public.students s LEFT JOIN public.classes c ON c.id::text = s.class_id::text
   WHERE s.id::text = v_sid;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF v_skurum IS NOT NULL THEN
    SELECT k2.modules INTO v_mods FROM public.kurumlar k2 WHERE k2.id::text = v_skurum;
  END IF;
  FOREACH k IN ARRAY ARRAY['homework','etut','questions','plan','grades','messages','deneme'] LOOP
    v_on := public.ogr_bolum_acik(k, v_cls, v_kurum);
    -- kurum bölümü kapalıysa öğrencide de kapalı (plan için kurum bölümü yok)
    IF v_on AND v_mods IS NOT NULL AND k <> 'plan' AND coalesce((v_mods ->> k)::boolean, false) = false THEN
      v_on := false;
    END IF;
    v_out := v_out || jsonb_build_object(k, v_on);
  END LOOP;
  RETURN v_out;
END
$function$;

-- student_my_teachers() [security definer]
CREATE OR REPLACE FUNCTION public.student_my_teachers()
 RETURNS TABLE(id text, name text, branch text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select distinct t.id::text, t.name::text, coalesce(t.branch, '')::text
    from public.students s
    join public.teachers t on t.auth_user_id is not null
   where public.is_student()
     and (s.auth_user_id = auth.uid() or s.id = auth.uid()::text)
     and coalesce(t.status, 'approved') = 'approved'
     and (
       exists (select 1 from public.teacher_class_access a where a.teacher_auth_id = t.auth_user_id and a.class_id = s.class_id)
       or exists (select 1 from public.teacher_student_access b where b.teacher_auth_id = t.auth_user_id and b.student_id = s.id)
     )
   order by 2
$function$;

-- student_set_plan_task_done(p_item_id text, p_done boolean) [security definer]
CREATE OR REPLACE FUNCTION public.student_set_plan_task_done(p_item_id text, p_done boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_sid TEXT := public.current_student_id();
  v_done TIMESTAMPTZ;
BEGIN
  IF v_sid IS NULL THEN RAISE EXCEPTION 'Yalnızca öğrenci işaretleyebilir.'; END IF;
  UPDATE public.study_plan_items i
     SET done_at = CASE WHEN p_done THEN now() ELSE NULL END
   WHERE i.id = p_item_id AND i.student_id = v_sid
     AND i.sent_at IS NOT NULL
  RETURNING i.done_at INTO v_done;
  IF NOT FOUND THEN RAISE EXCEPTION 'Görev bulunamadı.'; END IF;
  RETURN v_done IS NOT NULL;
END $function$;

-- study_plan_items_guard() [security definer]
CREATE OR REPLACE FUNCTION public.study_plan_items_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_plan RECORD;
  v_name TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT p.student_id, p.week_start INTO v_plan FROM public.study_plans p WHERE p.id = NEW.plan_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Plan bulunamadı.'; END IF;
    NEW.student_id := v_plan.student_id;
    NEW.week_start := v_plan.week_start;
    NEW.created_by := auth.uid();
    SELECT t.name INTO v_name FROM public.teachers t WHERE t.auth_user_id = auth.uid() LIMIT 1;
    NEW.created_by_name := left(coalesce(v_name, NEW.created_by_name, ''), 120);
    NEW.done_at := NULL;
  ELSE
    NEW.plan_id := OLD.plan_id;
    NEW.student_id := OLD.student_id;
    NEW.week_start := OLD.week_start;
    NEW.created_by := OLD.created_by;
    NEW.created_by_name := OLD.created_by_name;
    IF public.is_student() OR auth.uid() IS NULL THEN
      -- Öğrenci (uygulamada ya da e-postadaki bağlantıyla) yalnız "yaptım" işaretini değiştirebilir
      NEW.day := OLD.day; NEW.subject := OLD.subject; NEW.book := OLD.book;
      NEW.note := OLD.note; NEW.position := OLD.position;
    ELSE
      NEW.done_at := OLD.done_at;
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $function$;

-- study_plans_guard() [security definer]
CREATE OR REPLACE FUNCTION public.study_plans_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_name TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
    IF auth.uid() IS NOT NULL THEN
      NEW.group_id := NULL;
      NEW.mailed_at := NULL;
    END IF;
  ELSE
    NEW.student_id := OLD.student_id;
    NEW.week_start := OLD.week_start;
    NEW.created_by := OLD.created_by;
    IF auth.uid() IS NOT NULL THEN
      NEW.group_id := OLD.group_id;
      NEW.mailed_at := OLD.mailed_at;
    END IF;
  END IF;
  IF auth.uid() IS NOT NULL AND NEW.sent_at IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.sent_at IS NULL OR NEW.sent_by_name IS DISTINCT FROM OLD.sent_by_name) THEN
    SELECT t.name INTO v_name FROM public.teachers t WHERE t.auth_user_id = auth.uid() LIMIT 1;
    NEW.sent_by_name := left(coalesce(v_name, NEW.sent_by_name, ''), 120);
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $function$;

-- sync_delta_tables() [security definer]
create or replace function public.sync_delta_tables()
returns text[]
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(array_agg(c.relname::text order by c.relname), '{}'::text[])
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and t.tgname = 'trg_zz_touch_updated_at'
     and c.relname in ('messages', 'grades', 'attendance', 'etuts', 'etut_yoklama',
                       'students', 'student_contacts', 'teachers', 'classes', 'deleted_records')
$function$;

-- sync_student_contact() [security definer]
CREATE OR REPLACE FUNCTION public.sync_student_contact()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cleared boolean;
BEGIN
  IF coalesce(current_setting('app.contacts_cleanup', true), '') = 'on' THEN
    RETURN NEW; -- 85b çalışırken: eski sütunlar boşaltılıyor, korumalı tabloya dokunulmaz
  END IF;
  SELECT coalesce(legacy_cleared, false) INTO v_cleared FROM public.student_contact_settings WHERE id;
  v_cleared := coalesce(v_cleared, false);

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.student_contacts (id, email, phone, parents)
    VALUES (NEW.id, nullif(btrim(coalesce(NEW.email, '')), ''), nullif(btrim(coalesce(NEW.phone, '')), ''), coalesce(NEW.parents, '[]'::jsonb))
    ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, phone = EXCLUDED.phone, parents = EXCLUDED.parents, updated_at = now();
    IF v_cleared THEN
      NEW.email := NULL;
      NEW.phone := NULL;
      NEW.parents := NULL;
    ELSE
      NEW.email := nullif(btrim(coalesce(NEW.email, '')), '');
      NEW.phone := nullif(btrim(coalesce(NEW.phone, '')), '');
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: yalnızca gerçekten gönderilen / değişen sütun taşınır
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RETURN NEW; -- kimlik değişimi: bağlantı (ON UPDATE CASCADE) korumalı satırı da taşır
  END IF;
  INSERT INTO public.student_contacts (id) VALUES (NEW.id) ON CONFLICT (id) DO NOTHING;
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE public.student_contacts SET email = nullif(btrim(coalesce(NEW.email, '')), ''), updated_at = now() WHERE id = NEW.id;
  END IF;
  IF NEW.phone IS DISTINCT FROM OLD.phone THEN
    UPDATE public.student_contacts SET phone = nullif(btrim(coalesce(NEW.phone, '')), ''), updated_at = now() WHERE id = NEW.id;
  END IF;
  IF NEW.parents IS DISTINCT FROM OLD.parents THEN
    UPDATE public.student_contacts SET parents = coalesce(NEW.parents, '[]'::jsonb), updated_at = now() WHERE id = NEW.id;
  END IF;
  IF v_cleared THEN
    NEW.email := NULL;
    NEW.phone := NULL;
    NEW.parents := NULL;
  ELSE
    -- boş metin ("silindi" işareti) eski sütunda boş (NULL) olarak saklanır
    IF NEW.email IS DISTINCT FROM OLD.email THEN NEW.email := nullif(btrim(coalesce(NEW.email, '')), ''); END IF;
    IF NEW.phone IS DISTINCT FROM OLD.phone THEN NEW.phone := nullif(btrim(coalesce(NEW.phone, '')), ''); END IF;
  END IF;
  RETURN NEW;
END $function$;

-- teacher_admin_kurum() [security definer]
CREATE OR REPLACE FUNCTION public.teacher_admin_kurum()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_kurum UUID;
  v_existing UUID;
BEGIN
  -- Upsert koruması: bu id'li öğretmen zaten varsa yeni kurum açma.
  -- (Gerekirse kurum, ardından çalışan UPDATE adımında açılır.)
  IF TG_OP = 'INSERT' AND EXISTS (SELECT 1 FROM public.teachers t WHERE t.id = NEW.id) THEN
    SELECT t.kurum_id INTO v_existing FROM public.teachers t WHERE t.id = NEW.id;
    IF NEW.kurum_id IS NULL AND v_existing IS NOT NULL THEN
      NEW.kurum_id := v_existing;
    END IF;
    RETURN NEW;
  END IF;

  IF coalesce(NEW.is_admin, false)
     AND NEW.kurum_id IS NULL
     AND lower(coalesce(NEW.email, '')) <> 'm.bilirr@gmail.com'
     AND NEW.id <> 'admin-mustafa-bilir'
     AND (TG_OP = 'INSERT' OR NOT coalesce(OLD.is_admin, false) OR OLD.kurum_id IS NULL) THEN
    INSERT INTO public.kurumlar(name) VALUES (left(btrim(coalesce(NEW.name, 'Yeni')) || ' Kurumu', 120))
      RETURNING id INTO v_kurum;
    NEW.kurum_id := v_kurum;
    IF NEW.auth_user_id IS NOT NULL THEN
      INSERT INTO public.kurum_class_grants(kurum_id, class_id)
      SELECT v_kurum, tca.class_id FROM public.teacher_class_access tca
       WHERE tca.teacher_auth_id = NEW.auth_user_id
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END $function$;

-- teacher_admin_revoked_close_kurum() [security definer]
CREATE OR REPLACE FUNCTION public.teacher_admin_revoked_close_kurum()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_kurum UUID := OLD.kurum_id;
BEGIN
  IF v_kurum IS NULL THEN
    RETURN NULL;
  END IF;

  -- Kurumda başka yönetici varsa kurum açık kalır
  IF EXISTS (SELECT 1 FROM public.teachers t
              WHERE t.kurum_id = v_kurum AND t.id <> NEW.id AND coalesce(t.is_admin, false)) THEN
    RETURN NULL;
  END IF;

  -- Kurumda başka öğretmen, sınıf, öğrenci ya da etüt öğretmeni varsa kurum korunur (veri kaybı olmasın)
  IF EXISTS (SELECT 1 FROM public.teachers t WHERE t.kurum_id = v_kurum AND t.id <> NEW.id)
     OR EXISTS (SELECT 1 FROM public.classes c WHERE c.kurum_id = v_kurum)
     OR EXISTS (SELECT 1 FROM public.students s WHERE s.kurum_id = v_kurum)
     OR EXISTS (SELECT 1 FROM public.etut_teachers e WHERE e.kurum_id = v_kurum) THEN
    RETURN NULL;
  END IF;

  -- Kurum boş: kurumu sil. Öğretmenin kurum bağlantısı kendiliğinden kalkar (kurumsuz olur),
  -- kuruma verilmiş izinli sınıf kayıtları da silinir (yalnızca izin kaydıdır).
  DELETE FROM public.kurumlar WHERE id = v_kurum;
  RETURN NULL;
END $function$;

-- teacher_can_target(p_class_ids text[], p_student_ids text[]) [security definer]
CREATE OR REPLACE FUNCTION public.teacher_can_target(p_class_ids text[], p_student_ids text[])
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v TEXT;
BEGIN
  FOREACH v IN ARRAY COALESCE(p_class_ids, '{}') LOOP
    IF NOT public.teacher_has_class_access(v) THEN RETURN FALSE; END IF;
  END LOOP;
  FOREACH v IN ARRAY COALESCE(p_student_ids, '{}') LOOP
    IF NOT public.teacher_has_student_access(v, NULL) THEN RETURN FALSE; END IF;
  END LOOP;
  RETURN TRUE;
END;
$function$;

-- teacher_has_class_access(p_class_id text) [security definer]
CREATE OR REPLACE FUNCTION public.teacher_has_class_access(p_class_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF p_class_id IS NULL THEN
    RETURN FALSE;
  END IF;
  IF public.is_kurum_admin() THEN
    RETURN public.kurum_has_class(p_class_id);
  END IF;
  -- Aşama 82: roller
  IF public.kurum_roles_on() THEN
    IF public.etut_only() THEN
      RETURN FALSE;
    END IF;
    IF public.role_wide_view() THEN
      RETURN public.kurum_has_class(p_class_id);
    END IF;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.teacher_class_access
     WHERE teacher_auth_id = auth.uid() AND class_id = p_class_id
  ) THEN
    RETURN FALSE;
  END IF;
  RETURN public.my_kurum_id() IS NULL OR public.kurum_has_class(p_class_id);
END $function$;

-- teacher_has_student_access(p_student_id text, p_class_id text) [security definer]
CREATE OR REPLACE FUNCTION public.teacher_has_student_access(p_student_id text, p_class_id text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_kurum UUID;
BEGIN
  IF public.is_kurum_admin() THEN
    IF p_student_id IS NOT NULL AND public.kurum_has_student(p_student_id) THEN
      RETURN TRUE;
    END IF;
    RETURN p_class_id IS NOT NULL AND public.kurum_has_class(p_class_id);
  END IF;

  -- Aşama 82: roller
  IF public.kurum_roles_on() THEN
    IF public.etut_only() THEN
      RETURN public.student_in_my_etut(p_student_id);
    END IF;
    IF public.role_wide_view() THEN
      IF p_student_id IS NOT NULL AND public.kurum_has_student(p_student_id) THEN
        RETURN TRUE;
      END IF;
      RETURN p_class_id IS NOT NULL AND public.kurum_has_class(p_class_id);
    END IF;
  END IF;

  v_kurum := public.my_kurum_id();

  IF p_student_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.teacher_student_access
     WHERE teacher_auth_id = auth.uid() AND student_id = p_student_id
  ) AND (v_kurum IS NULL OR public.kurum_has_student(p_student_id)) THEN
    RETURN TRUE;
  END IF;

  IF p_class_id IS NOT NULL AND public.teacher_has_class_access(p_class_id) THEN
    RETURN TRUE;
  END IF;

  IF p_student_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.students s
      JOIN public.teacher_class_access tca ON tca.class_id = s.class_id
     WHERE s.id = p_student_id AND tca.teacher_auth_id = auth.uid()
  ) THEN
    IF v_kurum IS NULL THEN
      RETURN TRUE;
    END IF;
    RETURN public.kurum_has_student(p_student_id);
  END IF;

  RETURN FALSE;
END $function$;

-- teacher_owns_document_file(p_path text) [security definer]
CREATE OR REPLACE FUNCTION public.teacher_owns_document_file(p_path text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.teacher_documents d
    WHERE d.storage_path = p_path
      AND (d.owner_auth_id = auth.uid()
           OR (public.same_kurum_auth(d.owner_auth_id) AND public.branch_subjects(d.subject) && public.my_zumre_subjects()))
  )
$function$;

-- teacher_owns_homework(p_homework_id text) [security definer]
CREATE OR REPLACE FUNCTION public.teacher_owns_homework(p_homework_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.homeworks
    WHERE id = p_homework_id AND teacher_auth_id = auth.uid()
  )
$function$;

-- tga_apply(p_teacher uuid) [security definer]
CREATE OR REPLACE FUNCTION public.tga_apply(p_teacher uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r public.teacher_grade_access%ROWTYPE;
  n integer := 0;
BEGIN
  SELECT * INTO r FROM public.teacher_grade_access WHERE teacher_auth_id = p_teacher;
  IF NOT FOUND THEN
    DELETE FROM public.teacher_class_access WHERE teacher_auth_id = p_teacher AND via_grade;
    RETURN 0;
  END IF;
  DELETE FROM public.teacher_class_access a
   WHERE a.teacher_auth_id = p_teacher AND a.via_grade
     AND a.class_id NOT IN (SELECT public.grade_classes_for(r.kurum_id, r.grades, r.all_grades));
  INSERT INTO public.teacher_class_access (teacher_auth_id, class_id, via_grade)
  SELECT p_teacher, x, true FROM public.grade_classes_for(r.kurum_id, r.grades, r.all_grades) AS x
  ON CONFLICT (teacher_auth_id, class_id) DO NOTHING; -- elle verilmiş sınıf elle kalır
  SELECT count(*) INTO n FROM public.teacher_class_access WHERE teacher_auth_id = p_teacher AND via_grade;
  RETURN n;
END;
$function$;

-- tga_class_changed() [security definer]
CREATE OR REPLACE FUNCTION public.tga_class_changed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    DELETE FROM public.teacher_class_access a
     USING public.teacher_grade_access r
     WHERE a.class_id = NEW.id AND a.via_grade AND r.teacher_auth_id = a.teacher_auth_id
       AND NEW.id NOT IN (SELECT public.grade_classes_for(r.kurum_id, r.grades, r.all_grades));
  END IF;
  INSERT INTO public.teacher_class_access (teacher_auth_id, class_id, via_grade)
  SELECT r.teacher_auth_id, NEW.id, true
  FROM public.teacher_grade_access r
  WHERE (r.all_grades OR NEW.level = ANY (r.grades))
    AND (r.kurum_id IS NOT DISTINCT FROM NEW.kurum_id
         OR (r.kurum_id IS NOT NULL AND EXISTS (
           SELECT 1 FROM public.kurum_class_grants g WHERE g.kurum_id = r.kurum_id AND g.class_id = NEW.id)))
  ON CONFLICT (teacher_auth_id, class_id) DO NOTHING;
  RETURN NULL;
END;
$function$;

-- tga_grant_changed() [security definer]
CREATE OR REPLACE FUNCTION public.tga_grant_changed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  k uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.kurum_id ELSE NEW.kurum_id END;
  t uuid;
BEGIN
  FOR t IN SELECT teacher_auth_id FROM public.teacher_grade_access WHERE kurum_id = k LOOP
    PERFORM public.tga_apply(t);
  END LOOP;
  RETURN NULL;
END;
$function$;

-- tombstone_ok(p_kind text, p_record_id text) [security definer]
CREATE OR REPLACE FUNCTION public.tombstone_ok(p_kind text, p_record_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.is_head_admin() OR (
    public.is_teacher() AND CASE p_kind
      WHEN 'student' THEN NOT EXISTS (SELECT 1 FROM public.students s WHERE s.id = p_record_id)
                          OR public.teacher_has_student_access(p_record_id, NULL::text) OR public.can_manage_student(p_record_id)
      WHEN 'class' THEN NOT EXISTS (SELECT 1 FROM public.classes c WHERE c.id = p_record_id)
                        OR public.teacher_has_class_access(p_record_id) OR public.can_manage_class(p_record_id)
      WHEN 'question_log' THEN NOT EXISTS (SELECT 1 FROM public.question_logs q WHERE q.id = p_record_id)
                               OR EXISTS (SELECT 1 FROM public.question_logs q WHERE q.id = p_record_id
                                           AND public.teacher_has_student_access(q.student_id, NULL::text))
      ELSE false END)
$function$;

-- touch_etut_teacher()
CREATE OR REPLACE FUNCTION public.touch_etut_teacher()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at := now();
  NEW.name := btrim(NEW.name);
  NEW.email := NULLIF(lower(btrim(coalesce(NEW.email, ''))), '');
  NEW.subjects := ARRAY(SELECT DISTINCT btrim(s) FROM unnest(coalesce(NEW.subjects, '{}')) s WHERE btrim(s) <> '');
  RETURN NEW;
END $function$;

-- touch_kurum()
CREATE OR REPLACE FUNCTION public.touch_kurum()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at := now();
  NEW.name := btrim(NEW.name);
  RETURN NEW;
END $function$;

-- touch_teacher_document()
CREATE OR REPLACE FUNCTION public.touch_teacher_document()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at := now();
  -- Öğretmen sahipliği başkasına devredemez (yalnız yönetici)
  IF TG_OP = 'UPDATE' AND current_user = 'authenticated' AND NOT public.is_admin() THEN
    NEW.owner_auth_id := OLD.owner_auth_id;
  END IF;
  IF TG_OP = 'INSERT' AND current_user = 'authenticated' AND NOT public.is_admin() THEN
    NEW.owner_auth_id := auth.uid();
  END IF;
  -- Aşama 20: dosya yolu başkasının klasörüne işaret edemez (yalnız yönetici istisnası)
  IF current_user = 'authenticated' AND NOT public.is_admin()
     AND NEW.storage_path IS NOT NULL AND NEW.storage_path <> ''
     AND (TG_OP = 'INSERT' OR NEW.storage_path IS DISTINCT FROM OLD.storage_path)
     AND NEW.storage_path NOT LIKE ('belge/' || auth.uid()::text || '/%') THEN
    RAISE EXCEPTION 'Belge dosyası yalnızca kendi klasörünüze bağlanabilir.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $function$;

-- trg_hs_server_submit_time() [security definer]
CREATE OR REPLACE FUNCTION public.trg_hs_server_submit_time()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_due_txt text;
  v_due timestamptz;
BEGIN
  -- yalnız gerçek teslim (zamanında / geç) ve teslim zamanı yazılırken
  IF NEW.status IS NULL OR NEW.status NOT IN ('on_time', 'late') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.submitted_at IS NOT DISTINCT FROM OLD.submitted_at THEN
    RETURN NEW;
  END IF;
  -- yalnız öğrencinin kendi kaydı (öğretmen / yönetici işlemleri olduğu gibi kalır)
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id::text = NEW.student_id::text AND s.auth_user_id::text = auth.uid()::text
  ) THEN
    RETURN NEW;
  END IF;

  NEW.submitted_at := now();

  SELECT h.due_date::text INTO v_due_txt FROM public.homeworks h WHERE h.id::text = NEW.homework_id::text;
  IF v_due_txt IS NULL OR btrim(v_due_txt) = '' THEN
    RETURN NEW;
  END IF;
  BEGIN
    IF v_due_txt ~ '^\d{4}-\d{2}-\d{2}$' THEN
      v_due := ((v_due_txt || ' 23:59:59')::timestamp) AT TIME ZONE 'Europe/Istanbul'; -- yalnız gün: gün sonu
    ELSIF v_due_txt ~ '[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?([+-]\d{2}(:?\d{2})?|Z)$' THEN
      v_due := v_due_txt::timestamptz;                                   -- saat dilimli
    ELSE
      v_due := (replace(v_due_txt, 'T', ' ')::timestamp) AT TIME ZONE 'Europe/Istanbul';
    END IF;
  EXCEPTION WHEN others THEN
    RETURN NEW; -- okunamayan tarih: uygulamanın yazdığı durum kalır
  END;

  NEW.status := CASE WHEN now() > v_due THEN 'late' ELSE 'on_time' END;
  RETURN NEW;
END;
$function$;

-- trg_ogr_bolum_etuts() [security definer]
CREATE OR REPLACE FUNCTION public.trg_ogr_bolum_etuts()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  n jsonb := to_jsonb(NEW);
  o jsonb;
  x text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN o := to_jsonb(OLD);
  ELSE SELECT to_jsonb(e) INTO o FROM public.etuts e WHERE e.id::text = (n ->> 'id');
  END IF;
  FOR x IN SELECT public.ogr_bolum_idler(n -> 'assigned_student_ids')
           EXCEPT SELECT public.ogr_bolum_idler(coalesce(o -> 'assigned_student_ids', '[]'::jsonb)) LOOP
    IF NOT public.ogr_bolum_ogrenci('etut', x) THEN
      PERFORM public.ogr_bolum_hata('etut', coalesce((SELECT s.name FROM public.students s WHERE s.id::text = x), x));
    END IF;
  END LOOP;
  RETURN NEW;
END
$function$;

-- trg_ogr_bolum_homeworks() [security definer]
CREATE OR REPLACE FUNCTION public.trg_ogr_bolum_homeworks()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  n jsonb := to_jsonb(NEW);
  o jsonb;
  x text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN o := to_jsonb(OLD);
  ELSE SELECT to_jsonb(h) INTO o FROM public.homeworks h WHERE h.id::text = (n ->> 'id');
  END IF;
  IF jsonb_array_length(CASE WHEN jsonb_typeof(n -> 'target_student_ids') = 'array' THEN n -> 'target_student_ids' ELSE '[]'::jsonb END) > 0 THEN
    FOR x IN SELECT public.ogr_bolum_idler(n -> 'target_student_ids')
             EXCEPT SELECT public.ogr_bolum_idler(coalesce(o -> 'target_student_ids', '[]'::jsonb)) LOOP
      IF NOT public.ogr_bolum_ogrenci('homework', x) THEN
        PERFORM public.ogr_bolum_hata('homework', coalesce((SELECT s.name FROM public.students s WHERE s.id::text = x), x));
      END IF;
    END LOOP;
  ELSE
    FOR x IN (SELECT public.ogr_bolum_idler(n -> 'target_class_ids') UNION SELECT n ->> 'class_id')
             EXCEPT (SELECT public.ogr_bolum_idler(coalesce(o -> 'target_class_ids', '[]'::jsonb)) UNION SELECT o ->> 'class_id') LOOP
      IF x IS NOT NULL AND x <> 'class-default' AND NOT public.ogr_bolum_sinif('homework', x) THEN
        PERFORM public.ogr_bolum_hata('homework', coalesce((SELECT c.name FROM public.classes c WHERE c.id::text = x), x));
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END
$function$;

-- trg_ogr_bolum_messages() [security definer]
CREATE OR REPLACE FUNCTION public.trg_ogr_bolum_messages()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  n jsonb := to_jsonb(NEW);
  v_sid text;
BEGIN
  IF auth.uid() IS NULL OR coalesce(n ->> 'kind', '') <> '' THEN RETURN NEW; END IF;
  v_sid := public.current_student_id()::text;
  IF v_sid IS NULL OR v_sid IS DISTINCT FROM (n ->> 'student_id') THEN RETURN NEW; END IF;
  IF NOT public.ogr_bolum_ogrenci('messages', v_sid) THEN
    RAISE EXCEPTION 'Öğretmene Soru Sor bölümü sınıfınıza kapalı.' USING ERRCODE = '42501', HINT = 'ogrenci_bolum_kapali';
  END IF;
  RETURN NEW;
END
$function$;

-- trg_ogr_bolum_plan_items() [security definer]
CREATE OR REPLACE FUNCTION public.trg_ogr_bolum_plan_items()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.student_id::text IS NOT DISTINCT FROM OLD.student_id::text THEN RETURN NEW; END IF;
  IF NEW.student_id IS NOT NULL AND NOT public.ogr_bolum_ogrenci('plan', NEW.student_id::text) THEN
    PERFORM public.ogr_bolum_hata('plan', coalesce((SELECT s.name FROM public.students s WHERE s.id::text = NEW.student_id::text), NEW.student_id::text));
  END IF;
  RETURN NEW;
END
$function$;

-- trg_ogr_bolum_question_targets() [security definer]
CREATE OR REPLACE FUNCTION public.trg_ogr_bolum_question_targets()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  n jsonb := to_jsonb(NEW);
  o jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN o := to_jsonb(OLD);
  ELSE SELECT to_jsonb(q) INTO o FROM public.question_targets q WHERE q.id::text = (n ->> 'id');
  END IF;
  IF o IS NOT NULL AND (o ->> 'target_type') IS NOT DISTINCT FROM (n ->> 'target_type')
     AND (o ->> 'student_id') IS NOT DISTINCT FROM (n ->> 'student_id')
     AND (o ->> 'class_id') IS NOT DISTINCT FROM (n ->> 'class_id') THEN
    RETURN NEW;
  END IF;
  IF (n ->> 'target_type') = 'class' THEN
    IF (n ->> 'class_id') IS NOT NULL AND NOT public.ogr_bolum_sinif('questions', n ->> 'class_id') THEN
      PERFORM public.ogr_bolum_hata('questions', coalesce((SELECT c.name FROM public.classes c WHERE c.id::text = n ->> 'class_id'), n ->> 'class_id'));
    END IF;
  ELSIF (n ->> 'student_id') IS NOT NULL AND NOT public.ogr_bolum_ogrenci('questions', n ->> 'student_id') THEN
    PERFORM public.ogr_bolum_hata('questions', coalesce((SELECT s.name FROM public.students s WHERE s.id::text = n ->> 'student_id'), n ->> 'student_id'));
  END IF;
  RETURN NEW;
END
$function$;

-- zumre_class(p_class_id text) [security definer]
CREATE OR REPLACE FUNCTION public.zumre_class(p_class_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_subjects text[];
BEGIN
  IF p_class_id IS NULL THEN RETURN false; END IF;
  v_subjects := public.my_zumre_subjects();
  IF v_subjects IS NULL OR cardinality(v_subjects) = 0 THEN RETURN false; END IF;
  RETURN public.kurum_has_class(p_class_id) AND EXISTS (
    SELECT 1 FROM public.teacher_class_access a
      JOIN public.teachers t ON t.auth_user_id = a.teacher_auth_id
     WHERE a.class_id = p_class_id
       AND t.kurum_id = public.my_kurum_id()
       AND public.branch_subjects(t.branch) && v_subjects
  );
END $function$;

-- zumre_peer(p_ref text) [security definer]
CREATE OR REPLACE FUNCTION public.zumre_peer(p_ref text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_subjects text[];
BEGIN
  IF p_ref IS NULL OR btrim(p_ref) = '' THEN RETURN false; END IF;
  v_subjects := public.my_zumre_subjects();
  IF v_subjects IS NULL OR cardinality(v_subjects) = 0 THEN RETURN false; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.teachers t
     WHERE (t.id = p_ref OR t.auth_user_id::text = p_ref)
       AND t.kurum_id IS NOT NULL AND t.kurum_id = public.my_kurum_id()
       AND public.branch_subjects(t.branch) && v_subjects
  );
END $function$;

-- zumre_subjects(p_subjects text[])
CREATE OR REPLACE FUNCTION public.zumre_subjects(p_subjects text[])
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  WITH groups(g) AS (
    VALUES
      (ARRAY['Fen Bilimleri', 'Fizik', 'Kimya', 'Biyoloji']::text[]),
      (ARRAY['Matematik', 'Geometri']::text[]),
      (ARRAY['Türkçe', 'Türk Dili ve Edebiyatı']::text[]),
      (ARRAY['Sosyal Bilgiler', 'T.C. İnkılap Tarihi', 'Tarih', 'Coğrafya', 'Felsefe']::text[])
  )
  SELECT ARRAY(
    SELECT DISTINCT x FROM (
      SELECT unnest(coalesce(p_subjects, '{}'::text[])) AS x
      UNION
      SELECT unnest(g) FROM groups WHERE g && coalesce(p_subjects, '{}'::text[])
    ) s WHERE x IS NOT NULL AND x <> ''
  )
$function$;

-- kurum_public_brand(p_kurum_id uuid) [security definer] (Aşama 188)
create or replace function public.kurum_public_brand(p_kurum_id uuid)
returns table (name text, logo text)
language sql
stable
security definer
set search_path = public
as $$
  select k.name, k.logo
  from public.kurumlar k
  where k.id = p_kurum_id
  limit 1;
$$;

-- 4) YETKİLER VE ANLIK YAYIN

-- anlık yayın | attendance | supabase_realtime
-- anlık yayın | classes | supabase_realtime
-- anlık yayın | deleted_records | supabase_realtime
-- anlık yayın | etut_yoklama | supabase_realtime
-- anlık yayın | etuts | supabase_realtime
-- anlık yayın | grades | supabase_realtime
-- anlık yayın | homework_submissions | supabase_realtime
-- anlık yayın | homeworks | supabase_realtime
-- anlık yayın | kurum_class_grants | supabase_realtime
-- anlık yayın | kurumlar | supabase_realtime
-- anlık yayın | messages | supabase_realtime
-- anlık yayın | question_logs | supabase_realtime
-- anlık yayın | question_targets | supabase_realtime
-- anlık yayın | student_sync_ping | supabase_realtime
-- anlık yayın | students | supabase_realtime
-- anlık yayın | teacher_class_access | supabase_realtime
-- anlık yayın | teacher_documents | supabase_realtime
-- anlık yayın | teacher_roles | supabase_realtime
-- anlık yayın | teacher_section_access | supabase_realtime
-- anlık yayın | teacher_student_access | supabase_realtime
-- anlık yayın | teachers | supabase_realtime
-- işlev yetkisi | admin_set_teacher_access(p_teacher_auth_id uuid, p_class_ids text[], p_student_ids text[]) | authenticated, anon
-- işlev yetkisi | bilir_ping_attendance() | null
-- işlev yetkisi | bilir_ping_etut() | null
-- işlev yetkisi | bilir_ping_students(p_ids text[]) | null
-- işlev yetkisi | bilir_touch_updated_at() | null
-- işlev yetkisi | branch_subjects(p_branch text) | authenticated, anon
-- işlev yetkisi | can_delete_student(p_student_id text) | authenticated
-- işlev yetkisi | can_manage_class(p_class_id text) | authenticated, anon
-- işlev yetkisi | can_manage_student(p_student_id text) | authenticated, anon
-- işlev yetkisi | contact_role_ok() | authenticated
-- işlev yetkisi | current_student_class_id() | authenticated, anon
-- işlev yetkisi | current_student_id() | authenticated
-- işlev yetkisi | deneme_can_manage() | authenticated
-- işlev yetkisi | deneme_can_read() | authenticated
-- işlev yetkisi | deneme_exam_in_scope(p_exam_id text) | authenticated
-- işlev yetkisi | deneme_exam_published(p_exam_id text) | authenticated
-- işlev yetkisi | deneme_genel_yoneticiye_tasi(p_exam_id text) | authenticated
-- işlev yetkisi | deneme_i_have_result(p_exam_id text) | authenticated
-- işlev yetkisi | deneme_in_scope(p_kurum_id text) | authenticated
-- işlev yetkisi | deneme_my_student_id() | authenticated
-- işlev yetkisi | duyuru_ok() | authenticated
-- işlev yetkisi | etut_assign_guard() | authenticated
-- işlev yetkisi | etut_can_view(p_teacher_id text, p_teacher_ids text[], p_notes text) | authenticated
-- işlev yetkisi | etut_idare_adina(p_teacher_id text, p_teacher_ids text[]) | authenticated
-- işlev yetkisi | etut_idare_ogretmeni(p_teacher_id text) | authenticated
-- işlev yetkisi | etut_iso(p timestamp with time zone) | authenticated, anon
-- işlev yetkisi | etut_kopru_once() | authenticated, anon
-- işlev yetkisi | etut_kopru_sonra() | authenticated, anon
-- işlev yetkisi | etut_meta(p_notes text) | authenticated, anon
-- işlev yetkisi | etut_only() | authenticated
-- işlev yetkisi | etut_owner_list(p_teacher_id text, p_teacher_ids text[], p_notes text) | authenticated
-- işlev yetkisi | etut_owner_ok(p_teacher_id text, p_teacher_ids text[], p_notes text) | authenticated, anon
-- işlev yetkisi | etut_shared_schedule() | authenticated
-- işlev yetkisi | etut_teacher_options() | authenticated
-- işlev yetkisi | etut_ts(p text) | authenticated, anon
-- işlev yetkisi | etut_world_ok(p_teacher_id text, p_teacher_ids text[], p_notes text) | authenticated
-- işlev yetkisi | etut_yoklama_ayna() | authenticated, anon
-- işlev yetkisi | etut_yoklama_gelen(p_assigned jsonb, p_in jsonb) | null
-- işlev yetkisi | etut_yoklama_json(p_etut_id text) | null
-- işlev yetkisi | etut_yoklama_kayit(p_sid text, p_name text, p_status text, p_note text, p_topic text, p_by text, p_at timestamp with time zone, p_changed timestamp with time zone) | authenticated, anon
-- işlev yetkisi | etut_yoklama_once() | authenticated, anon
-- işlev yetkisi | etut_yoklama_ustune(p_etut_id text, p_assigned jsonb, p_in jsonb) | null
-- işlev yetkisi | etut_yoklama_yaz(p_etut_id text, p_assigned jsonb, p_in jsonb, p_fallback timestamp with time zone) | null
-- işlev yetkisi | etut_yoklama_yazabilir(p_etut_id text, p_student_id text) | authenticated
-- işlev yetkisi | etut_zumre_rows() | authenticated
-- işlev yetkisi | grade_classes_for(p_kurum uuid, p_grades integer[], p_all boolean) | null
-- işlev yetkisi | guard_contact_parents() | authenticated, anon
-- işlev yetkisi | guard_etut_creator() | authenticated, anon
-- işlev yetkisi | guard_homework_submission() | authenticated, anon
-- işlev yetkisi | guard_student_insert() | authenticated, anon
-- işlev yetkisi | guard_student_parent_contact() | authenticated, anon
-- işlev yetkisi | guard_student_self_update() | authenticated, anon
-- işlev yetkisi | guard_teacher_privileged_update() | authenticated, anon
-- işlev yetkisi | has_any_role(p_roles text[]) | authenticated
-- işlev yetkisi | has_role(p_role text) | authenticated
-- işlev yetkisi | head_gecis() | authenticated
-- işlev yetkisi | hm_auth_ids() | authenticated
-- işlev yetkisi | hm_class_ids() | authenticated
-- işlev yetkisi | hm_homework_ids() | authenticated
-- işlev yetkisi | hm_kurum_class_ids() | authenticated
-- işlev yetkisi | hm_student_ids() | authenticated
-- işlev yetkisi | hm_teacher_ids() | authenticated
-- işlev yetkisi | homework_exists(p_homework_id text) | authenticated, anon
-- işlev yetkisi | idare_ders_kapali() | authenticated
-- işlev yetkisi | is_admin() | authenticated, anon
-- işlev yetkisi | is_head_admin() | authenticated, anon
-- işlev yetkisi | is_kurum_admin() | authenticated, anon
-- işlev yetkisi | is_student() | authenticated, anon
-- işlev yetkisi | is_teacher() | authenticated, anon
-- işlev yetkisi | jsonb_to_text_array(p jsonb) | authenticated, anon
-- işlev yetkisi | karne_can_send() | authenticated
-- işlev yetkisi | keep_row_owner() | authenticated, anon
-- işlev yetkisi | kurum_admin_homework_ids() | authenticated
-- işlev yetkisi | kurum_admin_manages_teacher_auth(p_auth uuid) | authenticated, anon
-- işlev yetkisi | kurum_can(p_module text) | authenticated, anon
-- işlev yetkisi | kurum_grant_cred_guard() | authenticated, anon
-- işlev yetkisi | kurum_grant_move_guard() | authenticated, anon
-- işlev yetkisi | kurum_has_class(p_class_id text) | authenticated, anon
-- işlev yetkisi | kurum_has_student(p_student_id text) | authenticated, anon
-- işlev yetkisi | kurum_kayit_ayar(p_kurum_id uuid, p_acik boolean, p_yenile boolean) | authenticated
-- işlev yetkisi | kurum_move_granted_student(p_student_id text, p_class_id text) | authenticated
-- işlev yetkisi | kurum_owns_class(p_class_id text) | authenticated, anon
-- işlev yetkisi | kurum_roles_on() | authenticated
-- işlev yetkisi | kurum_set_grant_cred(p_kurum_id text, p_on boolean) | authenticated
-- işlev yetkisi | kurum_set_grant_move(p_kurum_id text, p_on boolean) | authenticated
-- işlev yetkisi | kurum_set_modules(p_kurum_id uuid, p_modules jsonb) | authenticated
-- işlev yetkisi | kurum_set_role_settings(p_kurum_id uuid, p_settings jsonb) | authenticated
-- işlev yetkisi | kurum_set_roles_enabled(p_kurum_id uuid, p_on boolean) | authenticated
-- işlev yetkisi | kurum_student_adder() | authenticated
-- işlev yetkisi | kurum_student_editor() | authenticated
-- işlev yetkisi | kurum_update_identity(p_kurum_id uuid, p_name text, p_logo text, p_set_logo boolean) | authenticated
-- işlev yetkisi | mark_my_initial_password_changed() | authenticated
-- işlev yetkisi | message_teacher_can_see(p_kind text, p_sender_id text, p_to_teacher_id text, p_replied_by_id text) | authenticated, anon
-- işlev yetkisi | my_admin_kurum_id() | authenticated, anon
-- işlev yetkisi | my_class_ids() | authenticated
-- işlev yetkisi | my_grant_cred() | authenticated
-- işlev yetkisi | my_grant_move() | authenticated
-- işlev yetkisi | my_kurum() | authenticated
-- işlev yetkisi | my_kurum_id() | authenticated, anon
-- işlev yetkisi | my_kurum_state() | authenticated
-- işlev yetkisi | my_roles() | authenticated
-- işlev yetkisi | my_student_ids() | authenticated
-- işlev yetkisi | my_zumre_subjects() | authenticated
-- işlev yetkisi | normalize_homework_row() | authenticated, anon
-- işlev yetkisi | ogr_bolum_acik(p_bolum text, p_class_id text, p_kurum_id text) | authenticated
-- işlev yetkisi | ogr_bolum_hata(p_bolum text, p_ad text) | authenticated, anon
-- işlev yetkisi | ogr_bolum_idler(p jsonb) | authenticated, anon
-- işlev yetkisi | ogr_bolum_ogrenci(p_bolum text, p_student_id text) | authenticated
-- işlev yetkisi | ogr_bolum_sinif(p_bolum text, p_class_id text) | authenticated
-- işlev yetkisi | ogrenci_bolum_durum() | authenticated
-- işlev yetkisi | ogrenci_bolum_kaydet(p_kurum_id text, p_class_id text, p_sections jsonb) | authenticated
-- işlev yetkisi | perm_mode(p_perm text) | authenticated
-- işlev yetkisi | plan_all_items_visible(p_plan_id text) | authenticated, anon
-- işlev yetkisi | plan_can_work(p_student_id text) | authenticated
-- işlev yetkisi | plan_conflict_weeks(p_student_ids text[], p_week_start text) | authenticated
-- işlev yetkisi | plan_item_mine(p_created_by uuid, p_created_by_name text) | authenticated
-- işlev yetkisi | plan_item_visible(p_created_by text, p_created_by_name text) | authenticated, anon
-- işlev yetkisi | plan_items_set_sent(p_student_ids text[], p_week_start text, p_send boolean, p_all boolean) | authenticated
-- işlev yetkisi | plan_question_counts(p_student_ids text[], p_from text, p_to text) | authenticated
-- işlev yetkisi | plan_subject_ok(p_subject text) | authenticated
-- işlev yetkisi | priv_can_see_student(p_student_id text) | authenticated, anon
-- işlev yetkisi | priv_my_teacher_ids() | authenticated, anon
-- işlev yetkisi | priv_teacher_ok(p_teacher_id text) | authenticated, anon
-- işlev yetkisi | question_targets_keep_owner() | authenticated, anon
-- işlev yetkisi | record_world_ok(p_owner uuid) | authenticated
-- işlev yetkisi | rls_deneme_published_exam_ids() | authenticated
-- işlev yetkisi | rls_deneme_scope_exam_ids() | authenticated
-- işlev yetkisi | rls_kurum_teacher_auth_ids() | authenticated
-- işlev yetkisi | rls_plan_item_visible_keys() | authenticated
-- işlev yetkisi | rls_tha_set() | authenticated
-- işlev yetkisi | rls_tha_student_ids() | authenticated
-- işlev yetkisi | rls_world_all() | authenticated
-- işlev yetkisi | role_can_teach() | authenticated
-- işlev yetkisi | role_manager() | authenticated
-- işlev yetkisi | role_record_editable(p_owner uuid) | authenticated
-- işlev yetkisi | role_record_visible(p_owner uuid) | authenticated
-- işlev yetkisi | role_section_ok(p_section text) | authenticated
-- işlev yetkisi | role_sees_owner(p_owner text) | authenticated
-- işlev yetkisi | role_wide_view() | authenticated
-- işlev yetkisi | safe_jsonb(p text) | authenticated, anon
-- işlev yetkisi | same_kurum_auth(p_auth uuid) | authenticated, anon
-- işlev yetkisi | same_kurum_auth_text(p_auth text) | authenticated, anon
-- işlev yetkisi | section_allowed(p_section text) | authenticated
-- işlev yetkisi | section_explicit_allow(p_section text) | authenticated
-- işlev yetkisi | set_class_kurum() | authenticated, anon
-- işlev yetkisi | set_etut_teacher_kurum() | authenticated, anon
-- işlev yetkisi | set_student_kurum() | authenticated, anon
-- işlev yetkisi | set_teacher_contact(p_teacher_id text, p_phone text, p_birth_date date) | authenticated
-- işlev yetkisi | set_teacher_grades(p_teacher_auth_id uuid, p_grades integer[], p_all boolean) | authenticated
-- işlev yetkisi | set_teacher_kurum() | authenticated, anon
-- işlev yetkisi | set_teacher_roles(p_teacher_id text, p_roles text[]) | authenticated
-- işlev yetkisi | set_teacher_sections(p_teacher_id text, p_allow text[], p_deny text[]) | authenticated
-- işlev yetkisi | set_teacher_yetkiler(p_teacher_id text, p_allow text[], p_deny text[]) | authenticated
-- işlev yetkisi | spi164_insert_sent() | authenticated, anon
-- işlev yetkisi | spi164_sync_header() | authenticated, anon
-- işlev yetkisi | spi164_update_guard() | authenticated, anon
-- işlev yetkisi | student_can_view_homework(p_homework_id text) | authenticated, anon
-- işlev yetkisi | student_in_my_etut(p_student_id text) | authenticated
-- işlev yetkisi | student_my_attendance() | authenticated
-- işlev yetkisi | student_my_etuts() | authenticated
-- işlev yetkisi | student_my_kurum() | authenticated
-- işlev yetkisi | student_my_sections() | authenticated
-- işlev yetkisi | student_my_teachers() | authenticated
-- işlev yetkisi | student_set_plan_task_done(p_item_id text, p_done boolean) | authenticated
-- işlev yetkisi | study_plan_items_guard() | authenticated, anon
-- işlev yetkisi | study_plans_guard() | authenticated, anon
-- işlev yetkisi | sync_delta_tables() | authenticated
-- işlev yetkisi | sync_student_contact() | null
-- işlev yetkisi | teacher_admin_kurum() | authenticated, anon
-- işlev yetkisi | teacher_admin_revoked_close_kurum() | authenticated, anon
-- işlev yetkisi | teacher_can_target(p_class_ids text[], p_student_ids text[]) | authenticated, anon
-- işlev yetkisi | teacher_has_class_access(p_class_id text) | authenticated, anon
-- işlev yetkisi | teacher_has_student_access(p_student_id text, p_class_id text) | authenticated, anon
-- işlev yetkisi | teacher_owns_document_file(p_path text) | authenticated, anon
-- işlev yetkisi | teacher_owns_homework(p_homework_id text) | authenticated, anon
-- işlev yetkisi | tga_apply(p_teacher uuid) | null
-- işlev yetkisi | tga_class_changed() | null
-- işlev yetkisi | tga_grant_changed() | null
-- işlev yetkisi | tombstone_ok(p_kind text, p_record_id text) | authenticated
-- işlev yetkisi | touch_etut_teacher() | authenticated, anon
-- işlev yetkisi | touch_kurum() | authenticated, anon
-- işlev yetkisi | touch_teacher_document() | authenticated, anon
-- işlev yetkisi | trg_hs_server_submit_time() | authenticated
-- işlev yetkisi | trg_ogr_bolum_etuts() | authenticated, anon
-- işlev yetkisi | trg_ogr_bolum_homeworks() | authenticated, anon
-- işlev yetkisi | trg_ogr_bolum_messages() | authenticated, anon
-- işlev yetkisi | trg_ogr_bolum_plan_items() | authenticated, anon
-- işlev yetkisi | trg_ogr_bolum_question_targets() | authenticated, anon
-- işlev yetkisi | zumre_class(p_class_id text) | authenticated
-- işlev yetkisi | zumre_peer(p_ref text) | authenticated
-- işlev yetkisi | zumre_subjects(p_subjects text[]) | authenticated, anon
-- sütun yetkisi | deneme_aliases | null
-- sütun yetkisi | deneme_exams | null
-- sütun yetkisi | deneme_formats | null
-- sütun yetkisi | deneme_kazanim_eslesme | null
-- sütun yetkisi | deneme_kazanimlar | null
-- sütun yetkisi | deneme_results | null
-- sütun yetkisi | deneme_targets | null
-- sütun yetkisi | deneme_yillik_plan | null
-- sütun yetkisi | etut_teachers | null
-- sütun yetkisi | etut_yoklama | null
-- sütun yetkisi | etuts_yedek_178 | null
-- sütun yetkisi | etuts_yedek_178 | null
-- sütun yetkisi | initial_credentials | null
-- sütun yetkisi | karne_links | null
-- sütun yetkisi | karne_links | null
-- sütun yetkisi | kurum_class_grants | null
-- sütun yetkisi | kurum_gecis_oturumlari | null
-- sütun yetkisi | kurum_gecis_oturumlari | null
-- sütun yetkisi | kurum_mail_accounts | null
-- sütun yetkisi | kurum_mail_accounts | null
-- sütun yetkisi | kurumlar | null
-- sütun yetkisi | mail_log | null
-- sütun yetkisi | notification_policy | null
-- sütun yetkisi | ogrenci_bolum_ayar | null
-- sütun yetkisi | ogrenci_bolum_ayar | null
-- sütun yetkisi | push_log | null
-- sütun yetkisi | push_log | null
-- sütun yetkisi | push_subscriptions | null
-- sütun yetkisi | push_subscriptions | null
-- sütun yetkisi | sms_log | null
-- sütun yetkisi | sms_log | null
-- sütun yetkisi | student_applications | null
-- sütun yetkisi | student_books | null
-- sütun yetkisi | student_contact_settings | null
-- sütun yetkisi | student_contact_settings | null
-- sütun yetkisi | student_contacts | null
-- sütun yetkisi | student_notifications | null
-- sütun yetkisi | student_sync_ping | null
-- sütun yetkisi | students | anon SELECT (id, name, student_number, class_id, class_name, avatar, registered_at, auth_user_id, status, kurum_id, tc_hash, gender)
-- sütun yetkisi | students | authenticated SELECT (id, name, student_number, class_id, class_name, avatar, registered_at, auth_user_id, status, kurum_id, tc_hash, gender)
-- sütun yetkisi | study_plan_groups | null
-- sütun yetkisi | study_plan_items | null
-- sütun yetkisi | study_plans | null
-- sütun yetkisi | teacher_contacts | null
-- sütun yetkisi | teacher_grade_access | null
-- sütun yetkisi | teacher_mail_accounts | null
-- sütun yetkisi | teacher_mail_accounts | null
-- sütun yetkisi | teacher_role_log | null
-- sütun yetkisi | teacher_roles | null
-- sütun yetkisi | teacher_section_access | null
-- sütun yetkisi | user_seen | null
-- tablo yetkisi | attendance | anon: SELECT, INSERT, UPDATE, DELETE
-- tablo yetkisi | attendance | authenticated: SELECT, INSERT, UPDATE, DELETE
-- tablo yetkisi | backup_log | anon: SELECT, INSERT, UPDATE, DELETE
-- tablo yetkisi | backup_log | authenticated: SELECT, INSERT, UPDATE, DELETE
-- tablo yetkisi | classes | anon: SELECT, INSERT, UPDATE, DELETE
-- tablo yetkisi | classes | authenticated: SELECT, INSERT, UPDATE, DELETE
-- tablo yetkisi | deleted_records | anon: SELECT, INSERT, UPDATE, DELETE
-- tablo yetkisi | deleted_records | authenticated: SELECT, INSERT, UPDATE, DELETE
-- tablo yetkisi | deneme_aliases | anon: 
-- tablo yetkisi | deneme_aliases | authenticated: SELECT, INSERT, UPDATE, DELETE
-- tablo yetkisi | deneme_exams | anon: 
-- tablo yetkisi | deneme_exams | authenticated: SELECT, INSERT, UPDATE, DELETE
-- tablo yetkisi | deneme_formats | anon: 
-- tablo yetkisi | deneme_formats | authenticated: SELECT, INSERT, UPDATE, DELETE
-- tablo yetkisi | deneme_kazanim_eslesme | anon: 
-- tablo yetkisi | deneme_kazanim_eslesme | authenticated: SELECT, INSERT, UPDATE, DELETE
-- tablo yetkisi | deneme_kazanimlar | anon: 
-- tablo yetkisi | deneme_kazanimlar | authenticated: SELECT, INSERT, UPDATE, DELETE
-- tablo yetkisi | deneme_results | anon: 
-- tablo yetkisi | deneme_results | authenticated: SELECT, INSERT, UPDATE, DELETE
-- tablo yetkisi | deneme_targets | anon: 
-- tablo yetkisi | deneme_targets | authenticated: SELECT, INSERT, UPDATE, DELETE
-- tablo yetkisi | deneme_yillik_plan | anon: 
-- tablo yetkisi | deneme_yillik_plan | authenticated: SELECT, INSERT, UPDATE, DELETE
-- tablo yetkisi | etut_teachers | anon: 
-- tablo yetkisi | etut_teachers | authenticated: SELECT, INSERT, UPDATE, DELETE
-- tablo yetkisi | etut_yoklama | anon: 
-- tablo yetkisi | etut_yoklama | authenticated: SELECT, INSERT, UPDATE, DELETE
-- tablo yetkisi | etuts | anon: SELECT, INSERT, UPDATE, DELETE
-- tablo yetkisi | etuts | authenticated: SELECT, INSERT, UPDATE, DELETE
-- tablo yetkisi | etuts_yedek_178 | anon: 
-- tablo yetkisi | etuts_yedek_178 | authenticated: 
-- tablo yetkisi | grades | anon: SELECT, INSERT, UPDATE, DELETE
-- tablo yetkisi | grades | authenticated: SELECT, INSERT, UPDATE, DELETE
-- tablo yetkisi | homework_submissions | anon: SELECT, INSERT, UPDATE, DELETE
-- tablo yetkisi | homework_submissions | authenticated: SELECT, INSERT, UPDATE, DELETE
-- tablo yetkisi | homeworks | anon: SELECT, INSERT, UPDATE, DELETE
-- tablo yetkisi | homeworks | authenticated: SELECT, INSERT, UPDATE, DELETE
-- tablo yetkisi | initial_credentials | anon: 
-- tablo yetkisi | initial_credentials | authenticated: SELECT
-- tablo yetkisi | karne_links | anon: 
-- tablo yetkisi | karne_links | authenticated: 
-- tablo yetkisi | kurum_class_grants | anon: 
-- tablo yetkisi | kurum_class_grants | authenticated: SELECT, INSERT, UPDATE, DELETE
-- tablo yetkisi | kurum_gecis_oturumlari | anon: 
-- tablo yetkisi | kurum_gecis_oturumlari | authenticated: 
-- tablo yetkisi | kurum_mail_accounts | anon: 
-- tablo yetkisi | kurum_mail_accounts | authenticated: 
-- tablo yetkisi | kurumlar | anon: 
-- tablo yetkisi | kurumlar | authenticated: SELECT, INSERT, UPDATE, DELETE
-- tablo yetkisi | mail_log | anon: 
-- tablo yetkisi | mail_log | authenticated: SELECT
-- tablo yetkisi | messages | anon: SELECT, INSERT, UPDATE, DELETE
-- tablo yetkisi | messages | authenticated: SELECT, INSERT, UPDATE, DELETE
-- tablo yetkisi | notification_policy | anon: 
-- tablo yetkisi | notification_policy | authenticated: SELECT, INSERT, UPDATE, DELETE
-- tablo yetkisi | ogrenci_bolum_ayar | anon: 
-- tablo yetkisi | ogrenci_bolum_ayar | authenticated: 
-- tablo yetkisi | push_log | anon: 
-- tablo yetkisi | push_log | authenticated: 
-- tablo yetkisi | push_subscriptions | anon: 
-- tablo yetkisi | push_subscriptions | authenticated: 
-- tablo yetkisi | question_logs | anon: SELECT, INSERT, UPDATE, DELETE
-- tablo yetkisi | question_logs | authenticated: SELECT, INSERT, UPDATE, DELETE
-- tablo yetkisi | question_targets | anon: SELECT, INSERT, UPDATE, DELETE
-- tablo yetkisi | question_targets | authenticated: SELECT, INSERT, UPDATE, DELETE
-- tablo yetkisi | sms_log | anon: 
-- tablo yetkisi | sms_log | authenticated: 
-- tablo yetkisi | student_applications | anon: 
-- tablo yetkisi | student_applications | authenticated: SELECT, INSERT, UPDATE, DELETE
-- tablo yetkisi | student_books | anon: 
-- tablo yetkisi | student_books | authenticated: SELECT, INSERT, UPDATE, DELETE
-- tablo yetkisi | student_contact_settings | anon: 
-- tablo yetkisi | student_contact_settings | authenticated: 
-- tablo yetkisi | student_contacts | anon: 
-- tablo yetkisi | student_contacts | authenticated: SELECT, UPDATE
-- tablo yetkisi | student_notifications | anon: 
-- tablo yetkisi | student_notifications | authenticated: SELECT, INSERT, UPDATE, DELETE
-- tablo yetkisi | student_sync_ping | anon: 
-- tablo yetkisi | student_sync_ping | authenticated: SELECT
-- tablo yetkisi | students | anon: INSERT, UPDATE, DELETE
-- tablo yetkisi | students | authenticated: INSERT, UPDATE, DELETE
-- tablo yetkisi | study_plan_groups | anon: 
-- tablo yetkisi | study_plan_groups | authenticated: SELECT
-- tablo yetkisi | study_plan_items | anon: 
-- tablo yetkisi | study_plan_items | authenticated: SELECT, INSERT, UPDATE, DELETE
-- tablo yetkisi | study_plans | anon: 
-- tablo yetkisi | study_plans | authenticated: SELECT, INSERT, UPDATE, DELETE
-- tablo yetkisi | teacher_class_access | anon: SELECT, INSERT, UPDATE, DELETE
-- tablo yetkisi | teacher_class_access | authenticated: SELECT, INSERT, UPDATE, DELETE
-- tablo yetkisi | teacher_contacts | anon: 
-- tablo yetkisi | teacher_contacts | authenticated: SELECT
-- tablo yetkisi | teacher_documents | anon: SELECT, INSERT, UPDATE, DELETE
-- tablo yetkisi | teacher_documents | authenticated: SELECT, INSERT, UPDATE, DELETE
-- tablo yetkisi | teacher_grade_access | anon: 
-- tablo yetkisi | teacher_grade_access | authenticated: SELECT
-- tablo yetkisi | teacher_mail_accounts | anon: 
-- tablo yetkisi | teacher_mail_accounts | authenticated: 
-- tablo yetkisi | teacher_role_log | anon: 
-- tablo yetkisi | teacher_role_log | authenticated: SELECT
-- tablo yetkisi | teacher_roles | anon: 
-- tablo yetkisi | teacher_roles | authenticated: SELECT
-- tablo yetkisi | teacher_section_access | anon: 
-- tablo yetkisi | teacher_section_access | authenticated: SELECT
-- tablo yetkisi | teacher_student_access | anon: SELECT, INSERT, UPDATE, DELETE
-- tablo yetkisi | teacher_student_access | authenticated: SELECT, INSERT, UPDATE, DELETE
-- tablo yetkisi | teachers | anon: SELECT, INSERT, UPDATE, DELETE
-- tablo yetkisi | teachers | authenticated: SELECT, INSERT, UPDATE, DELETE
-- tablo yetkisi | user_seen | anon: 
-- tablo yetkisi | user_seen | authenticated: SELECT, INSERT, UPDATE, DELETE
-- sütun yetkisi | students | authenticated SELECT (updated_at)   (Aşama 193)
-- işlev yetkisi | kurum_public_brand(uuid) | anon, authenticated   (Aşama 188)
