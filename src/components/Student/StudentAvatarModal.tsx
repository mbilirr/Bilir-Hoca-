import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Upload,
  Camera,
  X,
  Check,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Smile,
  Sparkles,
  Search,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Student } from '../../types';
import { dataService } from '../../services/dataService';
import { compressImageToDataUrl } from '../../lib/imageCompressor';

interface StudentAvatarModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student;
  onAvatarUpdated?: (newAvatar: string) => void;
}

export interface StudentEmojiPreset {
  emoji: string;
  label: string;
  category: 'Öğrenci & Karakter' | 'Dersler & Sanat' | 'Spor & Hareket' | 'Başarı & Motivasyon';
  bgHex1: string;
  bgHex2: string;
}

export const createStudentEmojiSvgDataUrl = (
  emoji: string,
  bgHex1 = '#4338ca',
  bgHex2 = '#1e40af'
) => {
  // Tam kare şeklinde, kenarları dolduran modern SVG (yuvarlak kırpma yok)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${bgHex1}" />
        <stop offset="100%" stop-color="${bgHex2}" />
      </linearGradient>
    </defs>
    <rect width="120" height="120" fill="url(#g)" />
    <text x="50%" y="54%" font-size="58" dominant-baseline="central" text-anchor="middle" font-family="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif">${emoji}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

export const STUDENT_EMOJI_PRESETS: StudentEmojiPreset[] = [
  // Öğrenci & Karakterler
  { emoji: '👨‍🎓', label: 'Erkek Öğrenci', category: 'Öğrenci & Karakter', bgHex1: '#4338ca', bgHex2: '#1e40af' },
  { emoji: '👩‍🎓', label: 'Kız Öğrenci', category: 'Öğrenci & Karakter', bgHex1: '#7c3aed', bgHex2: '#4f46e5' },
  { emoji: '🧑‍🎓', label: 'Akademik Genç', category: 'Öğrenci & Karakter', bgHex1: '#0284c7', bgHex2: '#0369a1' },
  { emoji: '🤓', label: 'Çalışkan & Zeki', category: 'Öğrenci & Karakter', bgHex1: '#059669', bgHex2: '#047857' },
  { emoji: '🧒', label: 'Genç Öğrenci', category: 'Öğrenci & Karakter', bgHex1: '#ea580c', bgHex2: '#c2410c' },
  { emoji: '👦', label: 'Gülümseyen Erkek', category: 'Öğrenci & Karakter', bgHex1: '#2563eb', bgHex2: '#1d4ed8' },
  { emoji: '👧', label: 'Gülümseyen Kız', category: 'Öğrenci & Karakter', bgHex1: '#db2777', bgHex2: '#be185d' },
  { emoji: '🦸‍♂️', label: 'Süper Kahraman', category: 'Öğrenci & Karakter', bgHex1: '#b91c1c', bgHex2: '#991b1b' },
  { emoji: '🦸‍♀️', label: 'Süper Kız', category: 'Öğrenci & Karakter', bgHex1: '#9333ea', bgHex2: '#7e22ce' },
  { emoji: '🥷', label: 'Hızlı Ninja', category: 'Öğrenci & Karakter', bgHex1: '#1e293b', bgHex2: '#0f172a' },
  { emoji: '🦁', label: 'Cesur Aslan', category: 'Öğrenci & Karakter', bgHex1: '#d97706', bgHex2: '#b45309' },
  { emoji: '🐬', label: 'Zeki Yunus', category: 'Öğrenci & Karakter', bgHex1: '#0891b2', bgHex2: '#0e7490' },
  { emoji: '🦉', label: 'Bilge Baykuş', category: 'Öğrenci & Karakter', bgHex1: '#475569', bgHex2: '#334155' },

  // Dersler & Sanat
  { emoji: '📚', label: 'Kitap Kurdu & Edebiyat', category: 'Dersler & Sanat', bgHex1: '#b91c1c', bgHex2: '#991b1b' },
  { emoji: '🔬', label: 'Genç Bilim İnsanı', category: 'Dersler & Sanat', bgHex1: '#047857', bgHex2: '#065f46' },
  { emoji: '🧪', label: 'Kimya & Deney', category: 'Dersler & Sanat', bgHex1: '#0891b2', bgHex2: '#0e7490' },
  { emoji: '📐', label: 'Matematik & Geometri', category: 'Dersler & Sanat', bgHex1: '#b45309', bgHex2: '#92400e' },
  { emoji: '💻', label: 'Genç Kodlamacı & Bilişim', category: 'Dersler & Sanat', bgHex1: '#1e293b', bgHex2: '#0f172a' },
  { emoji: '🎨', label: 'Ressam & Görsel Sanat', category: 'Dersler & Sanat', bgHex1: '#db2777', bgHex2: '#9d174d' },
  { emoji: '🎸', label: 'Gitar & Müzik', category: 'Dersler & Sanat', bgHex1: '#7c3aed', bgHex2: '#5b21b6' },
  { emoji: '🎹', label: 'Piyano & Melodi', category: 'Dersler & Sanat', bgHex1: '#334155', bgHex2: '#1e293b' },
  { emoji: '🎧', label: 'Müzik Dinleyen', category: 'Dersler & Sanat', bgHex1: '#4f46e5', bgHex2: '#3730a3' },
  { emoji: '🔭', label: 'Uzay Kaşifi & Astronomi', category: 'Dersler & Sanat', bgHex1: '#312e81', bgHex2: '#1e1b4b' },
  { emoji: '♟️', label: 'Satranç Ustası', category: 'Dersler & Sanat', bgHex1: '#475569', bgHex2: '#1e293b' },
  { emoji: '🌍', label: 'Dünya & Coğrafya', category: 'Dersler & Sanat', bgHex1: '#0284c7', bgHex2: '#075985' },
  { emoji: '✍️', label: 'Yazar & Şair', category: 'Dersler & Sanat', bgHex1: '#ea580c', bgHex2: '#9a3412' },

  // Spor & Hareket
  { emoji: '⚽', label: 'Futbolcu', category: 'Spor & Hareket', bgHex1: '#15803d', bgHex2: '#166534' },
  { emoji: '🏀', label: 'Basketbolcu', category: 'Spor & Hareket', bgHex1: '#ea580c', bgHex2: '#c2410c' },
  { emoji: '🏐', label: 'Voleybolcu', category: 'Spor & Hareket', bgHex1: '#ca8a04', bgHex2: '#a16207' },
  { emoji: '🎾', label: 'Tenis Yıldızı', category: 'Spor & Hareket', bgHex1: '#65a30d', bgHex2: '#4d7c0f' },
  { emoji: '🏊‍♂️', label: 'Yüzücü', category: 'Spor & Hareket', bgHex1: '#0284c7', bgHex2: '#0369a1' },
  { emoji: '🥋', label: 'Dövüş Sanatları', category: 'Spor & Hareket', bgHex1: '#b91c1c', bgHex2: '#7f1d1d' },
  { emoji: '🛹', label: 'Kaykaycı', category: 'Spor & Hareket', bgHex1: '#7c3aed', bgHex2: '#4c1d95' },

  // Başarı & Motivasyon
  { emoji: '🏆', label: 'Şampiyon Kupa', category: 'Başarı & Motivasyon', bgHex1: '#ca8a04', bgHex2: '#eab308' },
  { emoji: '🥇', label: 'Altın Madalya', category: 'Başarı & Motivasyon', bgHex1: '#d97706', bgHex2: '#b45309' },
  { emoji: '⭐', label: 'Yıldız Öğrenci', category: 'Başarı & Motivasyon', bgHex1: '#d97706', bgHex2: '#f59e0b' },
  { emoji: '🚀', label: 'Geleceğe Roket', category: 'Başarı & Motivasyon', bgHex1: '#4f46e5', bgHex2: '#4338ca' },
  { emoji: '💡', label: 'Büyük Fikir & Zeka', category: 'Başarı & Motivasyon', bgHex1: '#ea580c', bgHex2: '#f97316' },
  { emoji: '🔥', label: 'Azimli & Enerjik', category: 'Başarı & Motivasyon', bgHex1: '#dc2626', bgHex2: '#ea580c' },
  { emoji: '⚡', label: 'Hızlı & Dinamik', category: 'Başarı & Motivasyon', bgHex1: '#ca8a04', bgHex2: '#eab308' },
  { emoji: '🎯', label: 'Hedef Odaklı', category: 'Başarı & Motivasyon', bgHex1: '#e11d48', bgHex2: '#be123c' },
  { emoji: '💎', label: 'Pırlanta Öğrenci', category: 'Başarı & Motivasyon', bgHex1: '#0284c7', bgHex2: '#0e7490' },
  { emoji: '👑', label: 'Başarı Tacı', category: 'Başarı & Motivasyon', bgHex1: '#b45309', bgHex2: '#ca8a04' },
  { emoji: '🌈', label: 'Neşeli & Pozitif', category: 'Başarı & Motivasyon', bgHex1: '#7c3aed', bgHex2: '#0284c7' },
];

const STUDENT_AVATAR_PRESETS = [
  { label: 'Felix', url: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Felix' },
  { label: 'Aneka', url: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Aneka' },
  { label: 'Leo', url: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Leo' },
  { label: 'Milo', url: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Milo' },
  { label: 'Zoe', url: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Zoe' },
  { label: 'Sam', url: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Sam' },
  { label: 'Alex', url: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Alex' },
  { label: 'Jordan', url: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Jordan' },
  { label: 'Robin', url: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Robin' },
  { label: 'Taylor', url: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Taylor' },
  { label: 'Morgan', url: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Morgan' },
  { label: 'Casey', url: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Casey' },
];

const BG_COLORS = [
  { id: 'indigo', name: 'İndigo', hex1: '#4338ca', hex2: '#1e40af' },
  { id: 'violet', name: 'Menekşe', hex1: '#7c3aed', hex2: '#4f46e5' },
  { id: 'emerald', name: 'Zümrüt', hex1: '#047857', hex2: '#059669' },
  { id: 'amber', name: 'Amber', hex1: '#d97706', hex2: '#b45309' },
  { id: 'rose', name: 'Gül', hex1: '#be185d', hex2: '#9d174d' },
  { id: 'cyan', name: 'Okyanus', hex1: '#0e7490', hex2: '#0284c7' },
  { id: 'slate', name: 'Koyu Gece', hex1: '#1e293b', hex2: '#0f172a' },
];

export const StudentAvatarModal: React.FC<StudentAvatarModalProps> = ({
  isOpen,
  onClose,
  student,
  onAvatarUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'emoji' | 'preset'>('upload');
  const [emojiCategory, setEmojiCategory] = useState<'Tümü' | StudentEmojiPreset['category']>('Tümü');
  const [selectedBg, setSelectedBg] = useState(BG_COLORS[0]);
  const [activeEmoji, setActiveEmoji] = useState<string | null>('👨‍🎓');
  const [customEmoji, setCustomEmoji] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string>(student.avatar || '');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setAvatarUrl(student.avatar || '');
      setErrorMsg(null);
      setSuccessMsg(null);
      setCustomEmoji('');
      setSearchTerm('');
    }
  }, [isOpen, student]);

  if (!isOpen) return null;

  const handleSelectBg = (bg: typeof BG_COLORS[0]) => {
    setSelectedBg(bg);
    let emojiToUse = activeEmoji;
    if (!emojiToUse && avatarUrl && avatarUrl.includes('data:image/svg')) {
      try {
        const decoded = decodeURIComponent(avatarUrl);
        const match = decoded.match(/<text[^>]*>([^<]+)<\/text>/);
        if (match && match[1]) {
          emojiToUse = match[1];
          setActiveEmoji(match[1]);
        }
      } catch {
        // ignore
      }
    }

    if (emojiToUse) {
      const dataUrl = createStudentEmojiSvgDataUrl(emojiToUse, bg.hex1, bg.hex2);
      setAvatarUrl(dataUrl);
      setSuccessMsg(`Arka plan rengi "${bg.name}" olarak değiştirildi.`);
    } else {
      setSuccessMsg(`Arka plan rengi seçildi: ${bg.name}`);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMsg('Lütfen geçerli bir resim dosyası seçiniz (PNG, JPG, WebP).');
      return;
    }

    try {
      setIsProcessing(true);
      setErrorMsg(null);
      const compressedDataUrl = await compressImageToDataUrl(file, 220, 220, 0.85);
      setAvatarUrl(compressedDataUrl);
      setActiveEmoji(null);
      setSuccessMsg('Fotoğrafınız bilgisayardan seçildi! "Kaydet ve Uygula" butonuna tıklayarak onaylayabilirsiniz.');
    } catch {
      setErrorMsg('Fotoğraf işlenirken bir sorun oluştu.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSelectEmoji = (preset: StudentEmojiPreset) => {
    setActiveEmoji(preset.emoji);
    const dataUrl = createStudentEmojiSvgDataUrl(preset.emoji, selectedBg.hex1, selectedBg.hex2);
    setAvatarUrl(dataUrl);
    setSuccessMsg(`"${preset.label}" emojisi seçildi.`);
  };

  const handleApplyCustomEmoji = () => {
    if (!customEmoji.trim()) {
      setErrorMsg('Lütfen bir emoji yazınız veya klavyeden seçiniz.');
      return;
    }
    setActiveEmoji(customEmoji.trim());
    const dataUrl = createStudentEmojiSvgDataUrl(customEmoji.trim(), selectedBg.hex1, selectedBg.hex2);
    setAvatarUrl(dataUrl);
    setSuccessMsg('Özel emoji profil resmi olarak ayarlandı.');
  };

  const handleSave = () => {
    try {
      const finalAvatar = avatarUrl || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(student.name)}`;
      dataService.updateStudent(student.id, {
        avatar: finalAvatar,
      });

      if (onAvatarUpdated) {
        onAvatarUpdated(finalAvatar);
      }

      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.6 },
      });

      setSuccessMsg('Profil fotoğrafınız başarıyla güncellendi!');
      setTimeout(() => {
        onClose();
      }, 600);
    } catch {
      setErrorMsg('Fotoğraf kaydedilirken bir hata oluştu.');
    }
  };

  const handleResetToDefault = () => {
    const defaultUrl = `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(student.name)}`;
    setAvatarUrl(defaultUrl);
    setSuccessMsg('Varsayılan öğrenci avatarına dönüldü.');
  };

  const filteredEmojis = STUDENT_EMOJI_PRESETS.filter((item) => {
    const matchesCategory = emojiCategory === 'Tümü' || item.category === emojiCategory;
    const matchesSearch = !searchTerm || item.label.toLowerCase().includes(searchTerm.toLowerCase()) || item.emoji.includes(searchTerm);
    return matchesCategory && matchesSearch;
  });

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-950/80 backdrop-blur-sm p-3 sm:p-5 flex items-center justify-center animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 sm:px-6 py-4 bg-slate-850 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0 shadow-inner">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black text-white">Öğrenci Profil Resmi & Emojileri</h3>
              <p className="text-[11px] sm:text-xs text-slate-400">
                Bilgisayarınızdan fotoğraf yükleyin veya kaliteli öğrenci emojilerinden seçin
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            title="Kapat"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Live Preview Bar */}
        <div className="px-5 sm:px-6 py-3.5 bg-slate-950/70 border-b border-slate-800 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center space-x-3.5">
              <div className="relative group shrink-0">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-700 via-indigo-600 to-blue-500 ring-4 ring-indigo-500/40 shadow-xl flex items-center justify-center overflow-hidden">
                  <img
                    src={avatarUrl || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(student.name)}`}
                    alt={student.name}
                    className="w-full h-full object-cover rounded-xl"
                    onError={() => {
                      setAvatarUrl(`https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(student.name)}`);
                    }}
                  />
                </div>
                <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-lg bg-indigo-600 border-2 border-slate-900 flex items-center justify-center text-white shadow-md">
                  <Check className="w-3 h-3 stroke-[3]" />
                </span>
              </div>

              <div>
                <p className="text-sm font-black text-white flex items-center space-x-1.5">
                  <span>{student.name}</span>
                </p>
                <p className="text-xs text-indigo-300 font-medium">
                  {student.className} • No: #{student.studentNumber || student.id}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {avatarUrl.startsWith('data:image/svg')
                    ? '✨ Renkli Emoji Avatar'
                    : avatarUrl.startsWith('data:')
                    ? '💻 Bilgisayardan yüklenen fotoğraf'
                    : '🎨 Hazır Çizim Avatar'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleResetToDefault}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer shrink-0"
              title="Varsayılan çizim avatara dön"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Varsayılana Dön</span>
            </button>
          </div>
        </div>

        {/* Arka Plan Rengi / Gradyanı Değiştir (Tüm Sekmelerde Geçerli) */}
        <div className="px-5 sm:px-6 py-2.5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between gap-3 flex-wrap">
          <span className="text-xs font-bold text-slate-300 flex items-center space-x-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Arka Plan Rengi:</span>
            <span className="text-[11px] text-indigo-400 font-semibold">({selectedBg.name})</span>
          </span>
          <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
            {BG_COLORS.map((bg) => (
              <button
                key={bg.id}
                type="button"
                onClick={() => handleSelectBg(bg)}
                className={`w-6 h-6 rounded-lg transition-transform cursor-pointer shadow-sm ${
                  selectedBg.id === bg.id
                    ? 'ring-2 ring-white scale-110 shadow-indigo-500/50'
                    : 'hover:scale-105 opacity-80 hover:opacity-100'
                }`}
                style={{
                  background: `linear-gradient(135deg, ${bg.hex1}, ${bg.hex2})`,
                }}
                title={bg.name}
              />
            ))}
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="px-5 sm:px-6 pt-2 bg-slate-900 border-b border-slate-800 flex items-center space-x-2 shrink-0 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={`flex items-center space-x-2 px-3.5 py-2.5 rounded-t-xl text-xs sm:text-sm font-black border-b-2 whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'upload'
                ? 'border-indigo-400 text-indigo-300 bg-indigo-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Upload className="w-4 h-4 text-cyan-400" />
            <span>💻 Bilgisayardan Fotoğraf Yükle</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('emoji')}
            className={`flex items-center space-x-2 px-3.5 py-2.5 rounded-t-xl text-xs sm:text-sm font-black border-b-2 whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'emoji'
                ? 'border-indigo-400 text-indigo-300 bg-indigo-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Smile className="w-4 h-4 text-amber-400" />
            <span>😊 Kaliteli Emojiler ({STUDENT_EMOJI_PRESETS.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('preset')}
            className={`flex items-center space-x-2 px-3.5 py-2.5 rounded-t-xl text-xs sm:text-sm font-black border-b-2 whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'preset'
                ? 'border-indigo-400 text-indigo-300 bg-indigo-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span>🎨 Çizim Avatarlar</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1 max-h-[55vh]">
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

          {/* TAB 1: BİLGİSAYARDAN YÜKLE */}
          {activeTab === 'upload' && (
            <div className="space-y-4">
              <div className="p-5 bg-slate-950/60 border border-slate-800 rounded-2xl space-y-4 text-center">
                <div className="flex items-center justify-between text-left">
                  <div>
                    <h4 className="text-xs font-bold text-white flex items-center space-x-1.5">
                      <Upload className="w-4 h-4 text-indigo-400" />
                      <span>Bilgisayarınızdan Profil Resmi Seçin</span>
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Öğrenci veya veli vesikalık / profil fotoğrafınızı yükleyin
                    </p>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                    PNG, JPG, WebP
                  </span>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/jpg"
                  onChange={handleFileChange}
                  className="hidden"
                />

                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-8 px-4 bg-slate-900/80 hover:bg-slate-850 border-2 border-dashed border-indigo-500/40 hover:border-indigo-400 rounded-2xl text-xs font-bold text-slate-200 hover:text-white flex flex-col items-center justify-center space-y-2.5 transition-all cursor-pointer group shadow-inner"
                >
                  <div className="w-14 h-14 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform shadow-md">
                    <Upload className="w-7 h-7" />
                  </div>
                  <span className="text-sm font-black text-white">
                    {isProcessing ? 'Fotoğraf Optimize Ediliyor...' : 'Bilgisayardan Dosya Seçmek İçin Tıklayın'}
                  </span>
                  <span className="text-[11px] text-slate-400 font-normal">
                    Dosyayı bu alana tıklayarak seçin • Otomatik kırpılır ve optimize edilir
                  </span>
                </div>

                <div className="flex justify-center pt-1">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isProcessing}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center space-x-2 shadow-lg shadow-indigo-600/25 transition-all cursor-pointer"
                  >
                    <Upload className="w-4 h-4" />
                    <span>📁 Bilgisayardan Fotoğraf Seç</span>
                  </button>
                </div>
              </div>

              {avatarUrl.startsWith('data:image/') && !avatarUrl.startsWith('data:image/svg') && (
                <div className="p-3 bg-emerald-950/40 border border-emerald-500/30 rounded-xl flex items-center space-x-2.5 text-xs text-emerald-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Bilgisayarınızdan seçilen fotoğraf hazır! Aşağıdaki &quot;Kaydet ve Uygula&quot; butonuna basınız.</span>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: KALİTELİ EMOJİLER */}
          {activeTab === 'emoji' && (
            <div className="space-y-4">
              {/* Arka Plan Renk Seçimi */}
              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-300 flex items-center space-x-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Arka Plan Rengi:</span>
                </span>
                <div className="flex items-center space-x-1.5">
                  {BG_COLORS.map((bg) => (
                    <button
                      key={bg.id}
                      type="button"
                      onClick={() => handleSelectBg(bg)}
                      className={`w-6 h-6 rounded-full transition-transform cursor-pointer ring-2 ${
                        selectedBg.id === bg.id ? 'ring-white scale-110 shadow-md' : 'ring-transparent opacity-80 hover:opacity-100'
                      }`}
                      style={{ background: `linear-gradient(135deg, ${bg.hex1}, ${bg.hex2})` }}
                      title={bg.name}
                    />
                  ))}
                </div>
              </div>

              {/* Özel Emoji Girişi */}
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  placeholder="İstediğiniz emojiyi yazın (Örn: 🚀, 🦁, 🎮)"
                  value={customEmoji}
                  onChange={(e) => setCustomEmoji(e.target.value)}
                  className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  type="button"
                  onClick={handleApplyCustomEmoji}
                  className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0"
                >
                  Emojiyi Uygula
                </button>
              </div>

              {/* Kategori Filtreleri & Arama */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center space-x-1 overflow-x-auto pb-1 flex-1">
                    {(['Tümü', 'Öğrenci & Karakter', 'Dersler & Sanat', 'Spor & Hareket', 'Başarı & Motivasyon'] as const).map(
                      (cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setEmojiCategory(cat)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition-colors cursor-pointer ${
                            emojiCategory === cat
                              ? 'bg-indigo-600 text-white shadow-sm'
                              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                          }`}
                        >
                          {cat}
                        </button>
                      )
                    )}
                  </div>
                </div>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Emoji ara... (Örn: Kitap, Aslan, Kupa, Müzik)"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Emoji Kartları Izgarası */}
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2.5 max-h-56 overflow-y-auto pr-1">
                {filteredEmojis.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectEmoji(item)}
                    className="group p-2 rounded-2xl bg-slate-800/80 hover:bg-slate-750 border border-slate-700/80 hover:border-indigo-500/60 transition-all flex flex-col items-center justify-center space-y-1 cursor-pointer hover:scale-105 active:scale-95 shadow-sm"
                    title={item.label}
                  >
                    <div
                      className="w-11 h-11 rounded-full flex items-center justify-center text-2xl shadow-inner group-hover:scale-110 transition-transform"
                      style={{ background: `linear-gradient(135deg, ${selectedBg.hex1}, ${selectedBg.hex2})` }}
                    >
                      <span>{item.emoji}</span>
                    </div>
                    <span className="text-[10px] text-slate-300 font-semibold truncate w-full text-center">
                      {item.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: ÇİZİM AVATARLAR */}
          {activeTab === 'preset' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-400">
                Aşağıdaki karakterlerden birini seçerek anında profil resminiz yapabilirsiniz:
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {STUDENT_AVATAR_PRESETS.map((preset, idx) => {
                  const isSelected = avatarUrl === preset.url;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setAvatarUrl(preset.url);
                        setSuccessMsg(`${preset.label} seçildi.`);
                      }}
                      className={`p-2.5 rounded-2xl border flex flex-col items-center space-y-1.5 transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-600/20 border-indigo-400 ring-2 ring-indigo-500/50 scale-105'
                          : 'bg-slate-800/60 border-slate-700 hover:border-slate-500 hover:bg-slate-800'
                      }`}
                    >
                      <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-900 border border-slate-700/60">
                        <img src={preset.url} alt={preset.label} className="w-full h-full object-cover" />
                      </div>
                      <span className="text-[11px] font-bold text-slate-300">{preset.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="px-5 sm:px-6 py-3.5 bg-slate-850 border-t border-slate-800 flex items-center justify-end space-x-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
          >
            Vazgeç
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 rounded-xl shadow-lg shadow-indigo-600/30 flex items-center space-x-1.5 transition-all cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>Kaydet ve Uygula</span>
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : null;
};
