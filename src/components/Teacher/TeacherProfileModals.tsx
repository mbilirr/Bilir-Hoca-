import React, { useState, useEffect, useRef } from 'react';
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
  const [branch, setBranch] = useState(teacher.branch || 'Fen Bilimleri');
  const [email, setEmail] = useState(teacher.email || '');
  const [phone, setPhone] = useState(teacher.phone || '');
  const [avatar, setAvatar] = useState(teacher.avatar || '');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen && teacher) {
      setName(teacher.name || '');
      setBranch(teacher.branch || 'Fen Bilimleri');
      setEmail(teacher.email || '');
      setPhone(teacher.phone || '');
      setAvatar(teacher.avatar || '');
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMsg('Lütfen geçerli bir resim dosyası seçiniz (PNG, JPG, WebP).');
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      setErrorMsg('Resim boyutu en fazla 6MB olabilir.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setAvatar(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!name.trim()) {
      setErrorMsg('Lütfen ad ve soyad alanını doldurunuz.');
      return;
    }
    if (!branch.trim()) {
      setErrorMsg('Lütfen branşınızı belirtiniz (Örn: Fen Bilimleri).');
      return;
    }

    try {
      dataService.updateTeacherProfile(teacher.id, {
        name: name.trim(),
        branch: branch.trim(),
        email: email.trim(),
        phone: phone.trim(),
        avatar: avatar.trim() || undefined,
      });

      confetti({
        particleCount: 35,
        spread: 45,
        origin: { y: 0.6 },
      });

      setSuccessMsg('Bilgileriniz başarıyla güncellendi.');
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Güncelleme sırasında bir hata oluştu.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 bg-slate-800/80 border-b border-slate-700/80 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Öğretmen Bilgilerimi Güncelle</h3>
              <p className="text-xs text-slate-400">Profil ve iletişim bilgilerinizi güncelleyin</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white hover:bg-slate-700/60 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
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

          {/* Profil Fotoğrafı (Yuvarlak MB Simgesi İçin) */}
          <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-2xl flex items-center space-x-4">
            <div className="relative group shrink-0">
              <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-indigo-600 to-blue-500 ring-2 ring-indigo-400/50 flex items-center justify-center overflow-hidden">
                {avatar ? (
                  avatar.startsWith('http') || avatar.startsWith('data:') ? (
                    <img src={avatar} alt={name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl select-none leading-none">{avatar}</span>
                  )
                ) : (
                  <span className="text-base font-extrabold text-white tracking-wider">{initials}</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute -bottom-1 -right-1 p-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full border border-slate-900 shadow-md cursor-pointer"
                title="Fotoğraf Yükle"
              >
                <Camera className="w-3 h-3" />
              </button>
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-white mb-0.5">Profil Resmi & Emojisi</p>
              <p className="text-[11px] text-slate-400 mb-2">
                Fotoğraf yükleyin veya aşağıdaki emojilerden birini seçin:
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-750 rounded-lg text-[11px] font-semibold flex items-center space-x-1 cursor-pointer"
                >
                  <Upload className="w-3 h-3 text-indigo-400" />
                  <span>Fotoğraf Seç</span>
                </button>
                {avatar && (
                  <button
                    type="button"
                    onClick={() => setAvatar('')}
                    className="px-2 py-1 text-rose-400 hover:text-rose-300 text-[11px] font-medium flex items-center space-x-1 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Kaldır ({initials})</span>
                  </button>
                )}
              </div>

              {/* Hızlı Öğretmen Emojileri */}
              <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center space-x-1.5 overflow-x-auto pb-1">
                {['👨‍🏫', '👩‍🏫', '🧑‍🏫', '🎓', '🔬', '📐', '📚', '💡', '🦉', '🏆'].map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => setAvatar(createEmojiSvgDataUrl(em))}
                    className="p-1 rounded-lg bg-slate-850 hover:bg-indigo-900/40 border border-slate-750 hover:border-indigo-400 text-sm leading-none transition-all cursor-pointer hover:scale-110"
                    title={`Öğretmen Emojisi: ${em}`}
                  >
                    {em}
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
                placeholder="Örn: Fen Bilimleri, Matematik, Fizik..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                required
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Örnek gösterim: <span className="text-slate-400">{branch ? `${branch} Öğretmeni` : 'Fen Bilimleri Öğretmeni'}</span>
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
  );
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 bg-slate-800/80 border-b border-slate-700/80 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Şifre Değiştir</h3>
              <p className="text-xs text-slate-400">Öğretmen hesabı giriş şifrenizi yenileyin</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white hover:bg-slate-700/60 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
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
            <p className="text-[10px] text-slate-500 mt-1">Varsayılan demo şifre: 1234</p>
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
  );
};
