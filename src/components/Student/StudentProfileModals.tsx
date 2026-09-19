import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  User,
  KeyRound,
  X,
  Check,
  Phone,
  Mail,
  Hash,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  Eye,
  EyeOff,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Student } from '../../types';
import { dataService } from '../../services/dataService';

interface StudentProfileEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student;
  onSuccess?: (updated: Student) => void;
}

export const StudentProfileEditModal: React.FC<StudentProfileEditModalProps> = ({
  isOpen,
  onClose,
  student,
  onSuccess,
}) => {
  const [name, setName] = useState(student.name || '');
  const [email, setEmail] = useState(student.email || '');
  const [phone, setPhone] = useState(student.phone || '');
  const [studentNumber, setStudentNumber] = useState(student.studentNumber || '');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName(student.name || '');
      setEmail(student.email || '');
      setPhone(student.phone || '');
      setStudentNumber(student.studentNumber || '');
      setErrorMsg(null);
      setSuccessMsg(null);
    }
  }, [isOpen, student]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg('Öğrenci adı soyadı boş bırakılamaz.');
      return;
    }

    try {
      setIsSaving(true);
      setErrorMsg(null);

      const updates: Partial<Student> = {
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        studentNumber: studentNumber.trim() || undefined,
      };

      dataService.updateStudent(student.id, updates);

      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.6 },
      });

      setSuccessMsg('Bilgileriniz başarıyla güncellendi!');

      if (onSuccess) {
        onSuccess({ ...student, ...updates });
      }

      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Güncelleme sırasında bir hata oluştu.');
    } finally {
      setIsSaving(false);
    }
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-950/80 backdrop-blur-sm p-3 sm:p-5 flex items-center justify-center animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 bg-slate-850 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0 shadow-inner">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black text-white">Öğrenci Bilgilerini Güncelle</h3>
              <p className="text-[11px] sm:text-xs text-slate-400">
                {student.className} • No: #{student.studentNumber || student.id}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4">
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

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-300">
              Ad Soyad <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full pl-10 pr-3 py-2 bg-slate-800/80 border border-slate-700 rounded-xl text-white text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="Adınız ve Soyadınız"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-300">Öğrenci Numarası</label>
              <div className="relative">
                <Hash className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={studentNumber}
                  onChange={(e) => setStudentNumber(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 bg-slate-800/80 border border-slate-700 rounded-xl text-white text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Örn: 1042"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-300">Kullanıcı Adı (Giriş)</label>
              <div className="relative">
                <input
                  type="text"
                  disabled
                  value={student.username || ''}
                  className="w-full px-3 py-2 bg-slate-850/80 border border-slate-800 rounded-xl text-slate-400 text-xs sm:text-sm cursor-not-allowed"
                />
              </div>
              <p className="text-[10px] text-slate-500">Kullanıcı adı sistem tarafından atanır.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-300">E-Posta Adresi</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 bg-slate-800/80 border border-slate-700 rounded-xl text-white text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="ogrenci@okul.com"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-300">İletişim / Veli Telefonu</label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 bg-slate-800/80 border border-slate-700 rounded-xl text-white text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="05XX XXX XX XX"
                />
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-3 flex items-center justify-end space-x-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 rounded-xl shadow-lg shadow-indigo-600/30 flex items-center space-x-1.5 transition-all cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>{isSaving ? 'Kaydediliyor...' : 'Bilgileri Güncelle'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : null;
};

interface StudentPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student;
  isMandatory?: boolean;
  onSuccess?: () => void;
}

export const StudentPasswordModal: React.FC<StudentPasswordModalProps> = ({
  isOpen,
  onClose,
  student,
  isMandatory = false,
  onSuccess,
}) => {
  const [currentPassword, setCurrentPassword] = useState(isMandatory && student.password === '54321' ? '54321' : '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setCurrentPassword(isMandatory && student.password === '54321' ? '54321' : '');
      setNewPassword('');
      setConfirmPassword('');
      setErrorMsg(null);
      setSuccessMsg(null);
    }
  }, [isOpen, isMandatory, student.password]);

  if (!isOpen) return null;

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Check current password if student has an existing one
    if (student.password && currentPassword !== student.password) {
      setErrorMsg('Mevcut şifrenizi hatalı girdiniz.');
      return;
    }

    if (newPassword.length < 4) {
      setErrorMsg('Yeni şifreniz en az 4 karakter uzunluğunda olmalıdır.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('Yeni şifreleriniz birbiriyle uyuşmuyor.');
      return;
    }

    try {
      setIsSaving(true);
      setErrorMsg(null);

      dataService.updateStudent(student.id, {
        password: newPassword,
        mustChangePassword: false,
      });

      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.6 },
      });

      setSuccessMsg('Şifreniz başarıyla değiştirildi! Bir sonraki girişinizde bu şifreyi kullanabilirsiniz.');

      setTimeout(() => {
        onClose();
        if (onSuccess) onSuccess();
      }, 800);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Şifre güncellenirken bir hata oluştu.');
    } finally {
      setIsSaving(false);
    }
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-950/80 backdrop-blur-sm p-3 sm:p-5 flex items-center justify-center animate-in fade-in duration-200"
      onClick={isMandatory ? undefined : onClose}
    >
      <div
        className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 bg-slate-850 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 shadow-inner">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black text-white">
                {isMandatory ? 'Zorunlu Şifre Güncelleme' : 'Öğrenci Şifresi Değiştir'}
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-400">
                {isMandatory
                  ? 'Sisteme ilk girişinizde güvenliğiniz için şifrenizi güncellemeniz zorunludur'
                  : 'Giriş güvenliğinizi sağlamak için yeni şifrenizi belirleyin'}
              </p>
            </div>
          </div>
          {!isMandatory && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Form */}
        <form onSubmit={handlePasswordSubmit} className="p-5 sm:p-6 space-y-4">
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

          {student.password && (
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-300">
                Mevcut Şifreniz <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <input
                  type={showCurrent ? 'text' : 'password'}
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800/80 border border-slate-700 rounded-xl text-white text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500 pr-10"
                  placeholder="Mevcut şifrenizi girin"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-white cursor-pointer"
                >
                  {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-300">
              Yeni Şifre <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800/80 border border-slate-700 rounded-xl text-white text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500 pr-10"
                placeholder="Yeni şifrenizi girin (en az 4 karakter)"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-white cursor-pointer"
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-300">
              Yeni Şifreyi Tekrar Girin <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800/80 border border-slate-700 rounded-xl text-white text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500"
                placeholder="Yeni şifrenizi doğrulayın"
              />
            </div>
          </div>

          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 flex items-start space-x-2 text-[11px] text-slate-400">
            <ShieldCheck className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
            <span>Şifreniz güvenli bir şekilde tarayıcınızda ve veritabanında saklanır. Unuttuğunuzda öğretmeninizden şifrenizi sıfırlamasını isteyebilirsiniz.</span>
          </div>

          {/* Footer Actions */}
          <div className="pt-3 flex items-center justify-end space-x-3 border-t border-slate-800">
            {!isMandatory && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
              >
                Vazgeç
              </button>
            )}
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 rounded-xl shadow-lg shadow-amber-600/30 flex items-center space-x-1.5 transition-all cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>{isSaving ? 'Güncelleniyor...' : 'Şifreyi Değiştir'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : null;
};
