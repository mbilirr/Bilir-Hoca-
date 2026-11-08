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
import { profilResmi, ogretmenProfilRol, cizimSecenekleri } from '../../lib/profilResmi'; // Aşama 171
import { compressImageToDataUrl } from '../../lib/imageCompressor';
import { OverlayLayer } from '../ui/kit'; // Aşama 191
import { trFold } from '../../lib/importNormalize'; // Aşama 154

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
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Kullanıcı adı giriş adıdır: yalnızca yönetici değiştirebilir
  const canEditUsername = dataService.isHeadAdmin();

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
        .toLocaleUpperCase('tr-TR') || 'MB'
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

  const handleSubmit = async (e: React.FormEvent) => {
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
      setIsSavingProfile(true);
      await dataService.saveTeacherProfile(teacher.id, {
        name: cleanName,
        ...(canEditUsername ? { username: cleanUsername } : {}),
        branch: branch.trim(),
        email: email.trim(),
        phone: phone.trim(),
        avatar: avatar.trim() || undefined,
      });

      confetti({
        particleCount: 40,
        spread: 50,
        origin: { y: 0.6 },
      });

      setSuccessMsg('Bilgileriniz kaydedildi.');
      setTimeout(() => {
        onClose();
      }, 750);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Güncelleme sırasında bir hata oluştu.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-950/85 backdrop-blur-md p-3 sm:p-5"
      onClick={onClose}
    >
      <OverlayLayer onClose={onClose} />
      <div className="min-h-full flex items-center justify-center py-4 sm:py-6">
        <div
          className="relative w-full max-w-md bg-surface border border-line rounded-2xl shadow-2xl overflow-hidden max-h-[88vh] flex flex-col animate-in fade-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 py-4 bg-surface-2/80 border-b border-line flex items-center justify-between shrink-0">
            <div className="flex items-center space-x-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                <User className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-fg">Öğretmen Bilgilerimi Güncelle</h3>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-muted hover:text-fg hover:bg-surface-3/60 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-300 text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* Profil Fotoğrafı & Öğretmen Emojileri */}
            <div className="p-4 bg-canvas/80 border border-line rounded-2xl space-y-3">
              <div className="flex items-center space-x-4">
                <div className="relative group shrink-0">
                  <div className="w-16 h-16 rounded-full ring-2 ring-line flex items-center justify-center overflow-hidden shadow-md bg-surface-2">
                    {/* Aşama 171: kendi resmi yoksa cinsiyet ve role göre çizim */}
                    <img src={profilResmi({ id: teacher.id, name, avatar, gender: teacher.gender }, ogretmenProfilRol({ ...teacher, branch }))} alt={name} className="w-full h-full object-cover" />
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute -bottom-1 -right-1 p-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full border border-surface shadow-md cursor-pointer transition-transform hover:scale-110"
                    title="Bilgisayardan Fotoğraf Seç"
                  >
                    <Camera className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-fg mb-0.5">Profil Resmi</p>
                  <p className="text-[11px] text-muted mb-2">
                    Fotoğrafınızı yükleyin ya da aşağıdaki çizimlerden birini seçin:
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
                      className="ui-btn ui-btn-sm bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm min-w-24"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Fotoğraf Yükle</span>
                    </button>
                    {avatar && (
                      <button
                        type="button"
                        onClick={() => setAvatar('')}
                        className="ui-btn ui-btn-sm text-rose-600 dark:text-rose-400 hover:text-rose-600 dark:hover:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/30 border border-rose-500/20 min-w-24"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Kaldır</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

            {/* Aşama 171: emojiler yerine çizimler (cinsiyete göre; yalnız kendi unvanının rozetli çizimi) */}
            <div className="pt-2.5 border-t border-line space-y-1.5">
              <span className="text-[11px] font-bold text-fg-2">Çizimler</span>
              <div className="grid grid-cols-6 gap-1.5" id="ogretmen-profil-cizimler">
                {cizimSecenekleri('teacher', ogretmenProfilRol({ ...teacher, branch }), teacher.gender || 'all')
                  .slice(0, 12)
                  .map((src) => (
                    <button
                      key={src}
                      type="button"
                      aria-pressed={avatar === src}
                      aria-label="Bu çizimi seç"
                      onClick={() => setAvatar(src)}
                      className={`aspect-square rounded-full p-0.5 transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                        avatar === src ? 'ring-2 ring-brand ring-offset-2 ring-offset-surface' : 'hover:ring-2 hover:ring-line-strong'
                      }`}
                    >
                      <img src={src} alt="" loading="lazy" decoding="async" className="w-full h-full rounded-full object-cover" />
                    </button>
                  ))}
              </div>
            </div>
          </div>

          {/* Adı Soyadı */}
          <div>
            <label className="block text-xs font-semibold text-fg-2 mb-1.5">
              Ad Soyad <span className="text-rose-600 dark:text-rose-400">*</span>
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Örn: Mehmet Bilir"
                className="ui-field w-full pl-9 pr-3.5"
                required
              />
            </div>
          </div>

          {/* Kullanıcı Adı */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-fg-2">
                Kullanıcı Adı <span className="text-rose-600 dark:text-rose-400">*</span>
              </label>
              <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium">Giriş yaparken kullanılır</span>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted font-bold text-xs">@</span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(trFold(e.target.value))} // Aşama 154: ş→s, ı→i
                readOnly={!canEditUsername}
                placeholder="Örn: mbilir veya mehmetb"
                className={`ui-field w-full pl-8 pr-3.5 font-mono ${
                  canEditUsername ? 'text-fg' : 'text-muted cursor-not-allowed'
                }`}
                required
              />
            </div>
            <p className="text-[11px] text-muted mt-1">
              {canEditUsername
                ? 'Giriş ekranında bu kullanıcı adı kullanılır.'
                : 'Giriş adınızdır; değiştirilmesi için yöneticinize başvurunuz.'}
            </p>
          </div>

          {/* Branş */}
          <div>
            <label className="block text-xs font-semibold text-fg-2 mb-1.5">
              Branş <span className="text-rose-600 dark:text-rose-400">*</span>
            </label>
            <div className="relative">
              <BookOpen className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                placeholder="Örn: Fen Bilgisi Öğretmeni, Matematik, Fizik..."
                className="ui-field w-full pl-9 pr-3.5"
                required
              />
            </div>
            <p className="text-[11px] text-muted mt-1">
              Örnek gösterim: <span className="text-muted">{branch ? (branch.includes('Öğretmen') ? branch : `${branch} Öğretmeni`) : 'Fen Bilgisi Öğretmeni'}</span>
            </p>
          </div>

          {/* E-Posta */}
          <div>
            <label className="block text-xs font-semibold text-fg-2 mb-1.5">
              E-Posta Adresi
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ornek@okul.com"
                className="ui-field w-full pl-9 pr-3.5"
              />
            </div>
          </div>

          {/* Telefon */}
          <div>
            <label className="block text-xs font-semibold text-fg-2 mb-1.5">
              Telefon Numarası (İsteğe Bağlı)
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="05XX XXX XX XX"
                className="ui-field w-full pl-9 pr-3.5"
              />
            </div>
          </div>

          {/* Şifre bu ekrandan değiştirilmez: profil menüsündeki "Şifre Değiştir" ekranı kullanılır */}
          <p className="pt-2 border-t border-line text-[11px] text-muted">
            Şifrenizi değiştirmek için profil menüsündeki <strong className="text-fg">"Şifre Değiştir"</strong> seçeneğini kullanınız.
          </p>

          {/* Footer Save Button */}
          <div className="pt-4 border-t border-line flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="ui-btn ui-btn-sm bg-surface-2 hover:bg-surface-3 text-fg-2 min-w-24"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={isSavingProfile}
              className="ui-btn ui-btn-sm bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white min-w-24"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSavingProfile ? 'Kaydediliyor...' : 'Bilgileri Kaydet'}</span>
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
  /** Aşama 145: basit şifreyle girildi; yeni şifre belirlenmeden kapatılamaz */
  isMandatory?: boolean;
}

export const TeacherPasswordModal: React.FC<TeacherPasswordModalProps> = ({
  isOpen,
  onClose,
  teacher,
  isMandatory = false,
}) => {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Not: React kuralı gereği tüm hook'lar erken "return"den ÖNCE çağrılmalıdır
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
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
    if (newPassword.length < 6) {
      setErrorMsg('Yeni şifreniz en az 6 karakter uzunluğunda olmalıdır.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('Yeni şifreler birbiriyle eşleşmiyor.');
      return;
    }

    try {
      setIsSaving(true);
      // Önce mevcut şifre Supabase'de doğrulanır, doğruysa yeni şifre Supabase'e yazılır
      await dataService.updateTeacherPassword(teacher.id, oldPassword, newPassword);

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
    } finally {
      setIsSaving(false);
    }
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-950/85 backdrop-blur-md p-3 sm:p-5"
      onClick={isMandatory ? undefined : onClose}
    >
      <OverlayLayer onClose={isMandatory ? undefined : onClose} />
      <div className="min-h-full flex items-center justify-center py-4 sm:py-6">
        <div
          className="relative w-full max-w-md bg-surface border border-line rounded-2xl shadow-2xl overflow-hidden max-h-[88vh] flex flex-col animate-in fade-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 py-4 bg-surface-2/80 border-b border-line flex items-center justify-between shrink-0">
            <div className="flex items-center space-x-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-700 dark:text-amber-400">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-fg">{isMandatory ? 'Zorunlu Şifre Güncelleme' : 'Şifre Değiştir'}</h3>
                {isMandatory && (
                  <p className="text-[11px] text-muted">Şifreniz çok basit. Güvenliğiniz için yeni bir şifre belirleyiniz.</p>
                )}
              </div>
            </div>
            {!isMandatory && (
              <button
                type="button"
                onClick={onClose}
                className="p-1 text-muted hover:text-fg hover:bg-surface-3/60 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-300 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Mevcut Şifre */}
          <div>
            <label className="block text-xs font-semibold text-fg-2 mb-1.5">
              Mevcut Şifre <span className="text-rose-600 dark:text-rose-400">*</span>
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type={showOld ? 'text' : 'password'}
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder="Mevcut şifreniz"
                className="ui-field w-full pl-9 pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowOld(!showOld)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-fg"
              >
                {showOld ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Yeni Şifre */}
          <div>
            <label className="block text-xs font-semibold text-fg-2 mb-1.5">
              Yeni Şifre <span className="text-rose-600 dark:text-rose-400">*</span>
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Yeni şifreniz (En az 6 karakter)"
                className="ui-field w-full pl-9 pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-fg"
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Yeni Şifre Tekrar */}
          <div>
            <label className="block text-xs font-semibold text-fg-2 mb-1.5">
              Yeni Şifre (Tekrar) <span className="text-rose-600 dark:text-rose-400">*</span>
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type={showNew ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Yeni şifreyi doğrulayın"
                className="ui-field w-full pl-9 pr-3.5"
                required
              />
            </div>
          </div>

          {/* Footer Save Button */}
          <div className="pt-4 border-t border-line flex items-center justify-end space-x-3">
            {!isMandatory && (
              <button
                type="button"
                onClick={onClose}
                className="ui-btn ui-btn-sm bg-surface-2 hover:bg-surface-3 text-fg-2 min-w-24"
              >
                İptal
              </button>
            )}
            <button
              type="submit"
              className="ui-btn ui-btn-sm bg-indigo-600 hover:bg-indigo-500 text-white min-w-24"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSaving ? 'Kontrol ediliyor...' : 'Şifreyi Güncelle'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : null;
};
