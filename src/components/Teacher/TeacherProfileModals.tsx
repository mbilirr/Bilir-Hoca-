import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  User,
  Mail,
  Phone,
  BookOpen,
  Lock,
  KeyRound,
  Eye,
  EyeOff,
  Save,
  CheckCircle2,
  AlertCircle,
  Camera,
  Upload,
  Trash2,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Teacher } from '../../types';
import { dataService } from '../../services/dataService';
import { createEmojiSvgDataUrl } from './TeacherAvatarModal';
import { compressImageToDataUrl } from '../../lib/imageCompressor';

interface TeacherProfileEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  teacher: Teacher;
}

export const TeacherProfileEditModal: React.FC<TeacherProfileEditModalProps> = ({
  isOpen,
  onClose,
  teacher,
}) => {
  const [name, setName] = useState(teacher.name || '');
  const [username, setUsername] = useState(teacher.username || '');
  const [branch, setBranch] = useState(() => {
    if (!teacher.branch || teacher.branch === 'Matematik & Fen Bilimleri' || teacher.branch === 'Genel Branş') {
      return 'Fen Bilgisi Öğretmeni';
    }
    return teacher.branch;
  });
  const [email, setEmail] = useState(teacher.email || '');
  const [phone, setPhone] = useState(teacher.phone || '');
  const [avatar, setAvatar] = useState(teacher.avatar || '');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen && teacher) {
      setName(teacher.name || '');
      setUsername(teacher.username || '');
      const initialBranch =
        !teacher.branch || teacher.branch === 'Matematik & Fen Bilimleri' || teacher.branch === 'Genel Branş'
          ? 'Fen Bilgisi Öğretmeni'
          : teacher.branch;
      setBranch(initialBranch);
      setEmail(teacher.email || '');
      setPhone(teacher.phone || '');
      setAvatar(teacher.avatar || '');
      setNewPassword('');
      setErrorMsg(null);
      setSuccessMsg(null);
    }
  }, [isOpen, teacher]);

  if (!isOpen) return null;

  const initials = name
    ? name
        .split(' ')
        .filter(Boolean)
        .map((n) => n[0] || '')
        .join('')
        .slice(0, 2)
        .toUpperCase() || 'MB'
    : 'MB';

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMsg('Lütfen geçerli bir resim dosyası seçiniz (PNG, JPG, WebP).');
      return;
    }

    try {
      setErrorMsg(null);
      // Auto compress to lightweight size
      const compressedDataUrl = await compressImageToDataUrl(file, 200, 200, 0.8);
      setAvatar(compressedDataUrl);
      setSuccessMsg('Fotoğraf optimize edildi ve seçildi.');
    } catch {
      setErrorMsg('Resim yüklenirken bir hata meydana geldi.');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const cleanName = name.trim();
    const cleanUsername = username.trim().toLowerCase();

    if (!cleanName) {
      setErrorMsg('Lütfen ad ve soyad alanını doldurunuz.');
      return;
    }
    if (!cleanUsername) {
      setErrorMsg('Lütfen kullanıcı adı (giriş adı) belirleyiniz.');
      return;
    }
    if (cleanUsername.length < 3) {
      setErrorMsg('Kullanıcı adı en az 3 karakter olmalıdır.');
      return;
    }
    if (!branch.trim()) {
      setErrorMsg('Lütfen branşınızı belirtiniz (Örn: Fen Bilimleri).');
      return;
    }

    // Check if another teacher uses this username
    const otherTeacher = dataService
      .getTeachers()
      .find((t) => t.id !== teacher.id && t.username.toLowerCase() === cleanUsername);
    if (otherTeacher) {
      setErrorMsg(`'${cleanUsername}' kullanıcı adı başka bir öğretmen tarafından kullanılmaktadır. Lütfen farklı bir kullanıcı adı seçiniz.`);
      return;
    }

    try {
      dataService.updateTeacherProfile(teacher.id, {
        name: cleanName,
        username: cleanUsername,
        branch: branch.trim(),
        email: email.trim(),
        phone: phone.trim(),
        avatar: avatar.trim() || undefined,
        ...(newPassword.trim() ? { password: newPassword.trim() } : {}),
      });

      confetti({
        particleCount: 40,
        spread: 50,
        origin: { y: 0.6 },
      });

      setSuccessMsg('Kullanıcı bilgileriniz ve kullanıcı adınız başarıyla ve kalıcı olarak güncellendi.');
      setTimeout(() => {
        onClose();
      }, 750);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Güncelleme sırasında bir hata oluştu.');
    }
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-950/85 backdrop-blur-md p-3 sm:p-5"
      onClick={onClose}
    >
      <div className="min-h-full flex items-center justify-center py-4 sm:py-6">
        <div
          className="relative w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden max-h-[88vh] flex flex-col animate-in fade-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 py-4 bg-slate-800/80 border-b border-slate-700/80 flex items-center justify-between shrink-0">
            <div className="flex items-center space-x-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                <User className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Öğretmen Bilgilerimi Güncelle</h3>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-white hover:bg-slate-700/60 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
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

            {/* Profil Fotoğrafı & Öğretmen Emojileri */}
            <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-3">
              <div className="flex items-center space-x-4">
                <div className="relative group shrink-0">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 to-blue-500 ring-2 ring-indigo-400/50 flex items-center justify-center overflow-hidden shadow-md">
                    {avatar ? (
                      avatar.startsWith('http') || avatar.startsWith('data:') ? (
                        <img src={avatar} alt={name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-3xl select-none leading-none">{avatar}</span>
                      )
                    ) : (
                      <span className="text-lg font-extrabold text-white tracking-wider">{initials}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute -bottom-1 -right-1 p-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full border border-slate-900 shadow-md cursor-pointer transition-transform hover:scale-110"
                    title="Bilgisayardan Fotoğraf Seç"
                  >
                    <Camera className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-white mb-0.5">Profil Fotoğrafı & Öğretmen Emojileri</p>
                  <p className="text-[11px] text-slate-400 mb-2">
                    Bilgisayarınızdan fotoğraf yükleyin veya branşınıza uygun öğretmen emojisi seçin:
                  </p>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/jpg"
                    onChange={handleFileChange}
                    className="hidden"
                  />

                  <div className="flex items-center space-x-2 flex-wrap gap-y-1.5">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 shadow-sm transition-all cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>💻 Bilgisayardan Resim Seç</span>
                    </button>
                    {avatar && (
                      <button
                        type="button"
                        onClick={() => setAvatar('')}
                        className="px-2.5 py-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 border border-rose-500/20 rounded-xl text-xs font-medium flex items-center space-x-1 cursor-pointer transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Kaldır ({initials})</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

            {/* Öğretmen Profiline Uygun Emojiler */}
            <div className="pt-2.5 border-t border-slate-800/80 space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-bold text-slate-300">Öğretmen Profiline Uygun Emojiler</span>
              </div>
              
              {/* Emojiler Gruplu / Yatay Liste */}
              <div className="flex items-center space-x-1.5 overflow-x-auto pb-1.5 pt-0.5 scrollbar-thin">
                {[
                  { em: '👨‍🏫', name: 'Erkek Öğretmen' },
                  { em: '👩‍🏫', name: 'Kadın Öğretmen' },
                  { em: '🧑‍🏫', name: 'Eğitmen' },
                  { em: '👨‍🎓', name: 'Akademisyen' },
                  { em: '🔬', name: 'Fen & Biyoloji' },
                  { em: '🧪', name: 'Kimya & Deney' },
                  { em: '📐', name: 'Matematik & Geometri' },
                  { em: '📚', name: 'Edebiyat & Türkçe' },
                  { em: '✍️', name: 'Türkçe & Yazarlık' },
                  { em: '🌍', name: 'Coğrafya' },
                  { em: '📜', name: 'Tarih' },
                  { em: '🇬🇧', name: 'İngilizce & Dil' },
                  { em: '💻', name: 'Bilişim & Kodlama' },
                  { em: '🎨', name: 'Görsel Sanatlar' },
                  { em: '🎓', name: 'Mezuniyet & Kep' },
                  { em: '🏆', name: 'Başarı & Kupa' },
                  { em: '⭐', name: 'Yıldız Öğretmen' },
                  { em: '🦉', name: 'Bilge Baykuş' },
                  { em: '💡', name: 'Fikir & İlham' },
                  { em: '🧠', name: 'Analitik Zihin' },
                  { em: '🎯', name: 'Hedef Odaklı' },
                  { em: '🚀', name: 'Gelecek Vizyonu' },
                ].map((item) => (
                  <button
                    key={item.em}
                    type="button"
                    onClick={() => setAvatar(createEmojiSvgDataUrl(item.em))}
                    className="p-1.5 rounded-xl bg-slate-900 hover:bg-indigo-900/40 border border-slate-750 hover:border-indigo-400 text-lg leading-none transition-all cursor-pointer hover:scale-115 shrink-0 flex items-center justify-center shadow-sm"
                    title={`${item.name} (${item.em})`}
                  >
                    <span>{item.em}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Adı Soyadı */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Ad Soyad <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Örn: Mehmet Bilir"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                required
              />
            </div>
          </div>

          {/* Kullanıcı Adı */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-300">
                Kullanıcı Adı <span className="text-rose-400">*</span>
              </label>
              <span className="text-[10px] text-indigo-400 font-medium">Giriş yaparken kullanılır</span>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-slate-400 font-bold text-xs">@</span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Örn: mbilir veya mehmetb"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-8 pr-3.5 py-2.5 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                required
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Giriş ekranında veya hızlı girişte bu kullanıcı adınız geçerli olacaktır.
            </p>
          </div>

          {/* Branş */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Branş <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <BookOpen className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                placeholder="Örn: Fen Bilgisi Öğretmeni, Matematik, Fizik..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                required
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Örnek gösterim: <span className="text-slate-400">{branch ? (branch.includes('Öğretmen') ? branch : `${branch} Öğretmeni`) : 'Fen Bilgisi Öğretmeni'}</span>
            </p>
          </div>

          {/* E-Posta */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              E-Posta Adresi
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="m.bilirr@gmail.com"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
          </div>

          {/* Telefon */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Telefon Numarası (İsteğe Bağlı)
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="05XX XXX XX XX"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
          </div>

          {/* Yeni Şifre (İsteğe Bağlı) */}
          <div className="pt-2 border-t border-slate-800/80">
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Yeni Şifre Belirle <span className="text-slate-500 font-normal">(Değiştirmek istemiyorsanız boş bırakınız)</span>
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Yeni şifrenizi giriniz..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-10 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-3 text-slate-400 hover:text-slate-200"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Footer Save Button */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition-colors"
            >
              İptal
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition-colors flex items-center space-x-1.5 shadow-lg shadow-indigo-600/30 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Bilgileri Kaydet</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : null;
};

interface TeacherPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  teacher: Teacher;
}

export const TeacherPasswordModal: React.FC<TeacherPasswordModalProps> = ({
  isOpen,
  onClose,
  teacher,
}) => {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!oldPassword) {
      setErrorMsg('Lütfen mevcut şifrenizi giriniz.');
      return;
    }
    if (!newPassword) {
      setErrorMsg('Lütfen yeni şifrenizi giriniz.');
      return;
    }
    if (newPassword.length < 4) {
      setErrorMsg('Yeni şifreniz en az 4 karakter uzunluğunda olmalıdır.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('Yeni şifreler birbiriyle eşleşmiyor.');
      return;
    }

    try {
      dataService.updateTeacherPassword(teacher.id, oldPassword, newPassword);

      confetti({
        particleCount: 40,
        spread: 50,
        origin: { y: 0.6 },
      });

      setSuccessMsg('Şifreniz başarıyla güncellendi.');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        onClose();
      }, 800);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Şifre güncellenirken bir hata oluştu.');
    }
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-950/85 backdrop-blur-md p-3 sm:p-5"
      onClick={onClose}
    >
      <div className="min-h-full flex items-center justify-center py-4 sm:py-6">
        <div
          className="relative w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden max-h-[88vh] flex flex-col animate-in fade-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 py-4 bg-slate-800/80 border-b border-slate-700/80 flex items-center justify-between shrink-0">
            <div className="flex items-center space-x-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Şifre Değiştir</h3>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-white hover:bg-slate-700/60 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
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

          {/* Mevcut Şifre */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Mevcut Şifre <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type={showOld ? 'text' : 'password'}
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder="Mevcut şifreniz"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-10 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                required
              />
              <button
                type="button"
                onClick={() => setShowOld(!showOld)}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
              >
                {showOld ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Yeni Şifre */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Yeni Şifre <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Yeni şifreniz (En az 4 karakter)"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-10 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                required
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Yeni Şifre Tekrar */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Yeni Şifre (Tekrar) <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type={showNew ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Yeni şifreyi doğrulayın"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                required
              />
            </div>
          </div>

          {/* Footer Save Button */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition-colors"
            >
              İptal
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition-colors flex items-center space-x-1.5 shadow-lg shadow-indigo-600/30 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Şifreyi Güncelle</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : null;
};
