import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Camera,
  Upload,
  Link as LinkIcon,
  Sparkles,
  RotateCcw,
  Check,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Smile,
  Image as ImageIcon,
  GraduationCap,
  BookOpen,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Teacher } from '../../types';
import { dataService } from '../../services/dataService';
import { compressImageToDataUrl } from '../../lib/imageCompressor';

interface TeacherAvatarModalProps {
  isOpen: boolean;
  onClose: () => void;
  teacher: Teacher;
}

export interface TeacherEmojiPreset {
  emoji: string;
  label: string;
  category: 'Öğretmen' | 'Branş & Ders' | 'Akademi & Başarı';
  bgHex1: string;
  bgHex2: string;
}

export const createEmojiSvgDataUrl = (
  emoji: string,
  bgHex1 = '#4338ca',
  bgHex2 = '#1e40af'
) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${bgHex1}" />
        <stop offset="100%" stop-color="${bgHex2}" />
      </linearGradient>
    </defs>
    <rect width="120" height="120" rx="60" fill="url(#g)" />
    <text x="50%" y="54%" font-size="58" dominant-baseline="central" text-anchor="middle" font-family="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif">${emoji}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

export const TEACHER_EMOJI_PRESETS: TeacherEmojiPreset[] = [
  // Öğretmen & Eğitmen Karakterleri
  { emoji: '👨‍🏫', label: 'Erkek Öğretmen', category: 'Öğretmen', bgHex1: '#4338ca', bgHex2: '#1e40af' },
  { emoji: '👩‍🏫', label: 'Kadın Öğretmen', category: 'Öğretmen', bgHex1: '#7c3aed', bgHex2: '#4f46e5' },
  { emoji: '🧑‍🏫', label: 'Eğitmen', category: 'Öğretmen', bgHex1: '#2563eb', bgHex2: '#0284c7' },
  { emoji: '👨‍🎓', label: 'Akademisyen Erkek', category: 'Öğretmen', bgHex1: '#0f766e', bgHex2: '#047857' },
  { emoji: '👩‍🎓', label: 'Akademisyen Kadın', category: 'Öğretmen', bgHex1: '#9333ea', bgHex2: '#7c3aed' },
  { emoji: '🧙‍♂️', label: 'Bilge Öğretmen', category: 'Öğretmen', bgHex1: '#1e1b4b', bgHex2: '#312e81' },

  // Branş & Ders Emojileri
  { emoji: '📐', label: 'Matematik & Geometri', category: 'Branş & Ders', bgHex1: '#b45309', bgHex2: '#d97706' },
  { emoji: '🔬', label: 'Fen & Biyoloji', category: 'Branş & Ders', bgHex1: '#047857', bgHex2: '#059669' },
  { emoji: '🧪', label: 'Kimya & Deney', category: 'Branş & Ders', bgHex1: '#0e7490', bgHex2: '#06b6d4' },
  { emoji: '📚', label: 'Edebiyat & Kitap', category: 'Branş & Ders', bgHex1: '#b91c1c', bgHex2: '#dc2626' },
  { emoji: '✍️', label: 'Türkçe & Yazarlık', category: 'Branş & Ders', bgHex1: '#c2410c', bgHex2: '#ea580c' },
  { emoji: '🌍', label: 'Coğrafya & Dünya', category: 'Branş & Ders', bgHex1: '#0369a1', bgHex2: '#0284c7' },
  { emoji: '📜', label: 'Tarih & Felsefe', category: 'Branş & Ders', bgHex1: '#78350f', bgHex2: '#92400e' },
  { emoji: '💻', label: 'Bilişim & Kodlama', category: 'Branş & Ders', bgHex1: '#1e293b', bgHex2: '#334155' },
  { emoji: '🎨', label: 'Görsel Sanatlar', category: 'Branş & Ders', bgHex1: '#be185d', bgHex2: '#db2777' },
  { emoji: '🎻', label: 'Müzik Eğitimi', category: 'Branş & Ders', bgHex1: '#6d28d9', bgHex2: '#8b5cf6' },
  { emoji: '⚽', label: 'Beden Eğitimi & Spor', category: 'Branş & Ders', bgHex1: '#15803d', bgHex2: '#16a34a' },
  { emoji: '🇬🇧', label: 'Yabancı Dil & İngilizce', category: 'Branş & Ders', bgHex1: '#1d4ed8', bgHex2: '#2563eb' },
  { emoji: '🔭', label: 'Astronomi & Uzay', category: 'Branş & Ders', bgHex1: '#312e81', bgHex2: '#1e1b4b' },

  // Akademi & Başarı Emojileri
  { emoji: '🎓', label: 'Mezuniyet & Kep', category: 'Akademi & Başarı', bgHex1: '#312e81', bgHex2: '#4338ca' },
  { emoji: '🏆', label: 'Şampiyon & Kupa', category: 'Akademi & Başarı', bgHex1: '#ca8a04', bgHex2: '#eab308' },
  { emoji: '⭐', label: 'Yıldız Öğretmen', category: 'Akademi & Başarı', bgHex1: '#d97706', bgHex2: '#f59e0b' },
  { emoji: '🦉', label: 'Bilge Baykuş', category: 'Akademi & Başarı', bgHex1: '#374151', bgHex2: '#4b5563' },
  { emoji: '💡', label: 'Fikir & İlham', category: 'Akademi & Başarı', bgHex1: '#ea580c', bgHex2: '#f97316' },
  { emoji: '🧠', label: 'Analitik & Zihin', category: 'Akademi & Başarı', bgHex1: '#db2777', bgHex2: '#ec4899' },
  { emoji: '🚀', label: 'Gelecek & Vizyon', category: 'Akademi & Başarı', bgHex1: '#4f46e5', bgHex2: '#6366f1' },
  { emoji: '🎯', label: 'Hedef Odaklı', category: 'Akademi & Başarı', bgHex1: '#e11d48', bgHex2: '#f43f5e' },
  { emoji: '☀️', label: 'Pozitif & Aydınlık', category: 'Akademi & Başarı', bgHex1: '#f59e0b', bgHex2: '#fbbf24' },
];

const PRESET_AVATARS = [
  {
    label: 'Klasik Öğretmen 1',
    url: 'https://images.unsplash.com/photo-1568602471122-7832951cc4c5?w=200&auto=format&fit=crop&q=80',
  },
  {
    label: 'Modern Öğretmen 2',
    url: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=200&auto=format&fit=crop&q=80',
  },
  {
    label: 'Akademisyen 3',
    url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
  },
  {
    label: 'Fen & Matematik 4',
    url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80',
  },
  {
    label: 'Eğitmen 5',
    url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&auto=format&fit=crop&q=80',
  },
  {
    label: 'Edebiyat & Sanat 6',
    url: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&auto=format&fit=crop&q=80',
  },
];

export const TeacherAvatarModal: React.FC<TeacherAvatarModalProps> = ({
  isOpen,
  onClose,
  teacher,
}) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'emoji' | 'preset'>('upload');
  const [emojiCategory, setEmojiCategory] = useState<'Tümü' | 'Öğretmen' | 'Branş & Ders' | 'Akademi & Başarı'>('Tümü');
  const [avatarUrl, setAvatarUrl] = useState(teacher.avatar || '');
  const [customEmojiInput, setCustomEmojiInput] = useState('');
  const [customLinkInput, setCustomLinkInput] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setAvatarUrl(teacher.avatar || '');
      setCustomLinkInput('');
      setCustomEmojiInput('');
      setErrorMsg(null);
      setSuccessMsg(null);
    }
  }, [isOpen, teacher]);

  if (!isOpen) return null;

  const initials = teacher.name
    ? teacher.name
        .split(' ')
        .filter(Boolean)
        .map((n) => n[0] || '')
        .join('')
        .slice(0, 2)
        .toUpperCase() || 'ÖĞ'
    : 'ÖĞ';

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMsg('Lütfen geçerli bir resim dosyası seçiniz (PNG, JPG, WebP).');
      return;
    }

    try {
      setErrorMsg(null);
      // Automatically resize & compress photo to lightweight web-safe size (~15KB)
      const compressedDataUrl = await compressImageToDataUrl(file, 200, 200, 0.8);
      setAvatarUrl(compressedDataUrl);
      setSuccessMsg('Fotoğraf başarıyla işlendi ve optimize edildi! Kaydet butonuna basarak onaylayabilirsiniz.');
    } catch {
      setErrorMsg('Dosya işlenirken bir hata meydana geldi.');
    }
  };

  const handleSelectEmoji = (preset: TeacherEmojiPreset) => {
    const generatedUrl = createEmojiSvgDataUrl(preset.emoji, preset.bgHex1, preset.bgHex2);
    setAvatarUrl(generatedUrl);
    setErrorMsg(null);
    setSuccessMsg(`${preset.emoji} ${preset.label} emoji resmi seçildi.`);
  };

  const handleApplyCustomEmoji = () => {
    const trimmed = customEmojiInput.trim();
    if (!trimmed) {
      setErrorMsg('Lütfen bir emoji simgesi yazın veya yapıştırın.');
      return;
    }
    const generatedUrl = createEmojiSvgDataUrl(trimmed, '#4f46e5', '#2563eb');
    setAvatarUrl(generatedUrl);
    setCustomEmojiInput('');
    setErrorMsg(null);
    setSuccessMsg(`Özel ${trimmed} emoji resmi profilinize uygulandı!`);
  };

  const handleApplyLink = () => {
    const trimmed = customLinkInput.trim();
    if (!trimmed) {
      setErrorMsg('Lütfen geçerli bir internet resim bağlantısı (URL) girin.');
      return;
    }
    setAvatarUrl(trimmed);
    setCustomLinkInput('');
    setErrorMsg(null);
    setSuccessMsg('Görsel bağlantısı eklendi!');
  };

  const handleRemovePhoto = () => {
    setAvatarUrl('');
    setErrorMsg(null);
    setSuccessMsg(`Profil resmi kaldırıldı. Varsayılan '${initials}' baş harfleri görünecek.`);
  };

  const handleSave = () => {
    try {
      dataService.updateTeacherProfile(teacher.id, {
        avatar: avatarUrl.trim() || undefined,
      });

      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.6 },
      });

      setSuccessMsg('Profil fotoğrafınız/emojiniz başarıyla güncellendi!');
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Kayıt sırasında hata oluştu.');
    }
  };

  const filteredEmojis = emojiCategory === 'Tümü'
    ? TEACHER_EMOJI_PRESETS
    : TEACHER_EMOJI_PRESETS.filter((item) => item.category === emojiCategory);

  if (!isOpen) return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-950/80 backdrop-blur-sm p-3 sm:p-5 flex items-center justify-center animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div className="min-h-full flex items-center justify-center py-4 sm:py-6 w-full max-w-xl">
        <div
          className="relative w-full bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Modal Header */}
          <div className="px-5 sm:px-6 py-4 bg-slate-850 border-b border-slate-750 flex items-center justify-between shrink-0">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0 shadow-inner">
                <Smile className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-black text-white">Öğretmen Profil Resmi & Emojileri</h3>
                <p className="text-[11px] sm:text-xs text-slate-400">
                  Bilgisayarınızdan profil fotoğrafınızı yükleyin veya eğlenceli emojilerden seçin
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-750 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

        {/* Live Preview Card */}
        <div className="px-5 sm:px-6 py-3.5 bg-slate-950/70 border-b border-slate-800 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center space-x-3.5">
              {/* Round Avatar Preview */}
              <div className="relative group shrink-0">
                <div className="w-16 h-16 sm:w-18 sm:h-18 rounded-full bg-gradient-to-tr from-indigo-700 via-indigo-600 to-blue-500 ring-4 ring-indigo-500/40 shadow-xl flex items-center justify-center overflow-hidden">
                  {avatarUrl ? (
                    avatarUrl.startsWith('http') || avatarUrl.startsWith('data:') ? (
                      <img
                        src={avatarUrl}
                        alt={teacher.name}
                        className="w-full h-full object-cover"
                        onError={() => {
                          setErrorMsg('Resim yüklenemedi. Lütfen başka bir emoji veya resim seçiniz.');
                          setAvatarUrl('');
                        }}
                      />
                    ) : (
                      <span className="text-3xl sm:text-4xl select-none leading-none">
                        {avatarUrl}
                      </span>
                    )
                  ) : (
                    <span className="font-black text-xl sm:text-2xl text-white tracking-wider">
                      {initials}
                    </span>
                  )}
                </div>

                <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-indigo-600 border-2 border-slate-900 flex items-center justify-center text-white shadow-md">
                  <Check className="w-3 h-3 stroke-[3]" />
                </span>
              </div>

              <div>
                <p className="text-sm font-extrabold text-white flex items-center space-x-1.5">
                  <span>{teacher.name}</span>
                </p>
                <p className="text-xs text-amber-300 font-medium">
                  {teacher.branch || 'Genel Branş'} Öğretmeni
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {avatarUrl
                    ? '✓ Profil resmi seçildi (Kaydet ile onaylayın)'
                    : `Varsayılan monogram (${initials}) gösteriliyor`}
                </p>
              </div>
            </div>

            {avatarUrl && (
              <button
                type="button"
                onClick={handleRemovePhoto}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 rounded-xl text-xs font-semibold transition-colors cursor-pointer shrink-0"
                title="Resmi kaldır ve harfli simgeye dön"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Kaldır</span>
              </button>
            )}
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="px-5 sm:px-6 pt-3 bg-slate-900 border-b border-slate-800 flex space-x-2 shrink-0 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={`flex items-center space-x-2 px-3.5 py-2 rounded-t-xl text-xs sm:text-sm font-black border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'upload'
                ? 'border-indigo-400 text-indigo-300 bg-indigo-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Upload className="w-4 h-4 text-cyan-400" />
            <span>💻 Bilgisayardan Resim Seç</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('emoji')}
            className={`flex items-center space-x-2 px-3.5 py-2 rounded-t-xl text-xs sm:text-sm font-black border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'emoji'
                ? 'border-indigo-400 text-indigo-300 bg-indigo-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Smile className="w-4 h-4 text-amber-400" />
            <span>🎭 Öğretmen Emojileri ({TEACHER_EMOJI_PRESETS.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('preset')}
            className={`flex items-center space-x-2 px-3.5 py-2 rounded-t-xl text-xs sm:text-sm font-black border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'preset'
                ? 'border-indigo-400 text-indigo-300 bg-indigo-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ImageIcon className="w-4 h-4 text-emerald-400" />
            <span>🖼️ Hazır Portreler</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {/* Status feedback alerts */}
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* TAB 1: EMOJI AVATARS */}
          {activeTab === 'emoji' && (
            <div className="space-y-4">
              {/* Category Filter Pills */}
              <div className="flex items-center space-x-1.5 flex-wrap gap-y-1.5">
                {(['Tümü', 'Öğretmen', 'Branş & Ders', 'Akademi & Başarı'] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setEmojiCategory(cat)}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      emojiCategory === cat
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 ring-1 ring-indigo-400'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-750 hover:text-white border border-slate-700'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Emoji Grid */}
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5">
                {filteredEmojis.map((item, idx) => {
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSelectEmoji(item)}
                      className="group relative p-2.5 rounded-2xl bg-slate-850 hover:bg-slate-800 border border-slate-700/80 hover:border-indigo-400 transition-all hover:scale-105 flex flex-col items-center justify-center text-center cursor-pointer shadow-md hover:shadow-indigo-500/20"
                    >
                      {/* Emoji Icon Bubble with Custom Gradient */}
                      <div
                        className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center text-2xl sm:text-3xl shadow-md transition-transform group-hover:scale-110 mb-1.5"
                        style={{
                          background: `linear-gradient(135deg, ${item.bgHex1}, ${item.bgHex2})`,
                        }}
                      >
                        <span className="select-none leading-none drop-shadow-sm">{item.emoji}</span>
                      </div>
                      <span className="text-[11px] font-bold text-slate-200 line-clamp-1 leading-tight">
                        {item.label}
                      </span>
                      <span className="text-[9px] font-medium text-slate-400">
                        {item.category}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Custom Emoji Picker Input */}
              <div className="pt-3 border-t border-slate-800">
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Veya İstediğiniz Herhangi Bir Emojiyi Yazın / Yapıştırın:
                </label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    maxLength={4}
                    placeholder="Örn: 🦉, 🌟, 🎨, 🚀"
                    value={customEmojiInput}
                    onChange={(e) => setCustomEmojiInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleApplyCustomEmoji();
                      }
                    }}
                    className="w-32 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-center text-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={handleApplyCustomEmoji}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer shadow-md"
                  >
                    Emoji Olarak Uygula
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: UPLOAD & URL */}
          {activeTab === 'upload' && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-white flex items-center space-x-1.5">
                    <Upload className="w-4 h-4 text-indigo-400" />
                    <span>Bilgisayardan Resim Seç</span>
                  </label>
                  <span className="text-[10px] text-slate-400">PNG, JPG, WebP</span>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/jpg"
                  onChange={handleFileChange}
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-6 px-4 bg-slate-800/90 hover:bg-slate-750 border-2 border-dashed border-indigo-500/40 hover:border-indigo-400 rounded-2xl text-xs font-bold text-slate-200 hover:text-white flex flex-col items-center justify-center space-y-2 transition-all cursor-pointer group shadow-inner"
                >
                  <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform">
                    <Upload className="w-6 h-6" />
                  </div>
                  <span className="text-sm font-black text-white">
                    Bilgisayardan Resim Seç
                  </span>
                  <span className="text-[11px] text-slate-400 font-normal">
                    Fotoğraf dosyanızı seçmek için buraya tıklayın (Otomatik optimize edilir)
                  </span>
                </button>

                <div className="flex justify-center pt-1">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center space-x-2 shadow-md shadow-indigo-600/25 transition-all cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>📁 Bilgisayardan Dosya Seç</span>
                  </button>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800">
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  2. Veya İnternetten Görsel Bağlantısı (URL) Ekleyin
                </label>
                <div className="flex space-x-2">
                  <div className="relative flex-1">
                    <LinkIcon className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="url"
                      placeholder="https://ornek.com/fotograf.jpg"
                      value={customLinkInput}
                      onChange={(e) => setCustomLinkInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleApplyLink();
                        }
                      }}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleApplyLink}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0"
                  >
                    Uygula
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: PRESET PORTRAITS */}
          {activeTab === 'preset' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-400">
                Akademik ve profesyonel öğretmen portrelerinden tek tıkla seçim yapabilirsiniz:
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {PRESET_AVATARS.map((preset, index) => {
                  const isCurrentSelected = avatarUrl === preset.url;
                  return (
                    <button
                      key={index}
                      type="button"
                      onClick={() => {
                        setAvatarUrl(preset.url);
                        setErrorMsg(null);
                        setSuccessMsg(`${preset.label} seçildi.`);
                      }}
                      className={`relative rounded-2xl p-2 border-2 transition-all cursor-pointer group flex flex-col items-center ${
                        isCurrentSelected
                          ? 'border-indigo-400 bg-indigo-600/20 ring-2 ring-indigo-400/40 scale-102 shadow-lg shadow-indigo-500/20'
                          : 'border-slate-700 bg-slate-950/60 hover:border-slate-500 hover:scale-101'
                      }`}
                    >
                      <img
                        src={preset.url}
                        alt={preset.label}
                        className="w-20 h-20 rounded-xl object-cover shadow-sm mb-1.5"
                      />
                      <span className="text-xs font-bold text-slate-200 text-center">
                        {preset.label}
                      </span>
                      {isCurrentSelected && (
                        <div className="absolute top-2 right-2 w-5 h-5 bg-indigo-500 text-white rounded-full flex items-center justify-center shadow-md">
                          <Check className="w-3 h-3 stroke-[3]" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 sm:px-6 py-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
          >
            İptal
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white rounded-xl text-xs font-black shadow-lg shadow-indigo-600/30 transition-all flex items-center space-x-1.5 cursor-pointer hover:scale-102"
          >
            <Check className="w-4 h-4" />
            <span>Fotoğrafı / Emojiyi Kaydet</span>
          </button>
        </div>
      </div>
    </div>
  </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : null;
};
