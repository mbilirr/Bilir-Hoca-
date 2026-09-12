import React, { useState } from 'react';
import { Database, Check, Copy, X, Terminal, Server, ShieldCheck, Sparkles } from 'lucide-react';
import { SUPABASE_CONFIG } from '../lib/supabase';

interface SupabaseGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SupabaseGuideModal: React.FC<SupabaseGuideModalProps> = ({ isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const sqlSchema = `-- Supabase SQL Kurulum Tabloları
-- Bu SQL kodlarını Supabase Dashboard -> SQL Editor kısmına yapıştırıp "RUN" butonuna basarak tüm tabloları oluşturabilirsiniz.

-- 1. Students Table
CREATE TABLE IF NOT EXISTS public.students (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    student_number TEXT NOT NULL,
    class_id TEXT NOT NULL,
    class_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    avatar TEXT,
    registered_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. Classes Table
CREATE TABLE IF NOT EXISTS public.classes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    level INTEGER NOT NULL,
    branch TEXT NOT NULL,
    student_count INTEGER DEFAULT 0,
    academic_year TEXT NOT NULL
);

-- 3. Homeworks Table (Kazanım Odaklı Ödev Çizelgesi)
CREATE TABLE IF NOT EXISTS public.homeworks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    subject TEXT NOT NULL,
    description TEXT NOT NULL,
    learning_outcomes JSONB NOT NULL DEFAULT '[]'::jsonb,
    due_date TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    assigned_to JSONB NOT NULL, -- 'all' stringi veya student_id array'i
    class_id TEXT,
    submissions JSONB NOT NULL DEFAULT '[]'::jsonb
);

-- 4. Etuts Table (Ders, Konu, Öğrenci Bazlı Etüt Çizelgesi)
CREATE TABLE IF NOT EXISTS public.etuts (
    id TEXT PRIMARY KEY,
    subject TEXT NOT NULL,
    topic TEXT NOT NULL,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    duration INTEGER NOT NULL DEFAULT 45,
    location TEXT NOT NULL,
    notes TEXT,
    assigned_student_ids JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 5. Grades Table (Ders Notları)
CREATE TABLE IF NOT EXISTS public.grades (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    class_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    exam_type TEXT NOT NULL,
    score NUMERIC NOT NULL,
    max_score NUMERIC DEFAULT 100,
    date TEXT NOT NULL,
    remarks TEXT
);

-- 6. Attendance Table (Ders Devamsızlık Kayıtları)
CREATE TABLE IF NOT EXISTS public.attendance (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    class_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    records JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 7. Messages Table (Öğrenci - Öğretmen Özel Mesajlaşma)
CREATE TABLE IF NOT EXISTS public.messages (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    student_name TEXT NOT NULL,
    student_class TEXT NOT NULL,
    student_avatar TEXT,
    subject TEXT NOT NULL,
    text TEXT NOT NULL,
    link_url TEXT,
    teacher_reply TEXT,
    read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    replied_at TIMESTAMP WITH TIME ZONE
);

-- Row Level Security (RLS) Etkinleştirme
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homeworks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.etuts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Anonymous Access Policy (Demo ve Hızlı Entegrasyon için)
CREATE POLICY "Public Read/Write All" ON public.students FOR ALL USING (true);
CREATE POLICY "Public Read/Write All" ON public.homeworks FOR ALL USING (true);
CREATE POLICY "Public Read/Write All" ON public.etuts FOR ALL USING (true);
CREATE POLICY "Public Read/Write All" ON public.grades FOR ALL USING (true);
CREATE POLICY "Public Read/Write All" ON public.attendance FOR ALL USING (true);
CREATE POLICY "Public Read/Write All" ON public.messages FOR ALL USING (true);
`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(sqlSchema);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Supabase Veritabanı & Entegrasyon</h3>
              <p className="text-xs text-slate-400">Bulut veritabanı şeması ve canlı senkronizasyon</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Current Config Info */}
          <div className="p-4 bg-slate-950/60 rounded-2xl border border-slate-800 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Aktif Supabase URL:</span>
              <span className="font-mono text-emerald-400 font-bold">{SUPABASE_CONFIG.url}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Aktif Anon Key:</span>
              <span className="font-mono text-slate-300 text-[11px] truncate max-w-md">
                {SUPABASE_CONFIG.anonKey.slice(0, 24)}...
              </span>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-slate-800/80">
              <span className="text-slate-400">Durum:</span>
              <span className="inline-flex items-center space-x-1 text-emerald-400 font-semibold">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Çift Yönlü Senkronizasyon + Yerel Yedekleme Aktif</span>
              </span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center space-x-2">
                <Terminal className="w-4 h-4 text-indigo-400" />
                <span>Supabase SQL Kurulum Komutları</span>
              </label>

              <button
                onClick={copyToClipboard}
                className="flex items-center space-x-1.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow transition-all"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Kopyalandı!' : 'SQL Kodunu Kopyala'}</span>
              </button>
            </div>

            <pre className="p-4 bg-slate-950 rounded-2xl border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto max-h-72 leading-relaxed">
              {sqlSchema}
            </pre>
          </div>

          <div className="p-4 bg-indigo-950/20 border border-indigo-500/30 rounded-2xl text-xs text-indigo-200 space-y-1">
            <p className="font-bold text-indigo-300">💡 Nasıl Uygulanır?</p>
            <p>
              1. <strong>app.supabase.com</strong> adresinde projenizi açın.<br />
              2. Sol menüden <strong>SQL Editor</strong> &apos;e tıklayın.<br />
              3. Yukarıdaki kodu kopyalayıp editöre yapıştırın ve <strong>RUN</strong> butonuna basın.<br />
              4. Sistem otomatik olarak tüm öğrencileri, kazanımlı ödevleri, etütleri ve yoklamaları senkronize edecektir.
            </p>
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={onClose}
              className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold"
            >
              Kapat
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
