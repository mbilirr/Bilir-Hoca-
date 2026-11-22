import React, { useState, useEffect } from 'react';

import {
  User,
  KeyRound,
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
import { Modal } from '../ui/kit'; // Aşama 351: ortak pencere

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
    // Yalnızca pencere açılınca doldurulur; arka plan eşitlemesi yazılanları silmez.
  }, [isOpen, student.id]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
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
      };

      await dataService.updateStudent(student.id, updates);

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

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      icon={User}
      title="Öğrenci Bilgilerini Güncelle"
      description={`${student.className} • No: #${student.studentNumber || student.id}`}
      govdeClass="p-5 sm:p-6"
      footer={
        <>
          <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary min-w-24">
            Vazgeç
          </button>
          <button type="submit" form="ogrenci-profil-formu" disabled={isSaving} className="ui-btn ui-btn-primary min-w-24">
            <Check className="w-3.5 h-3.5" />
            <span>{isSaving ? 'Kaydediliyor...' : 'Bilgileri Güncelle'}</span>
          </button>
        </>
      }
    >
        <form id="ogrenci-profil-formu" onSubmit={handleSubmit} className="space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger-fg text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-xl bg-success/10 border border-success/30 text-success-fg text-xs flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-fg-2">
              Ad Soyad <span className="text-danger-fg">*</span>
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="ui-field w-full pl-10 pr-3"
                placeholder="Adınız ve Soyadınız"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-fg-2">Öğrenci Numarası (giriş adınız)</label>
              <div className="relative">
                <Hash className="w-4 h-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={studentNumber}
                  readOnly
                  aria-readonly="true"
                  title="Öğrenci numaranızı yalnızca öğretmeniniz veya okul yöneticiniz değiştirebilir"
                  className="ui-field w-full pl-10 pr-3 bg-surface-2 text-muted cursor-not-allowed"
                />
              </div>
              <p className="text-2xs text-muted">Numaranızı yalnızca öğretmeniniz değiştirebilir.</p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-fg-2">Sınıf</label>
              <div className="relative">
                <input
                  type="text"
                  disabled
                  value={student.className || 'Atanmadı'}
                  className="ui-field w-full bg-surface-2 text-muted cursor-not-allowed"
                />
              </div>
              <p className="text-2xs text-muted">Sınıfınızı öğretmeniniz belirler.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-fg-2">E-Posta Adresi</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="ui-field w-full pl-10 pr-3"
                  placeholder="ogrenci@okul.com"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-fg-2">İletişim / Veli Telefonu</label>
              <div className="relative">
                <Phone className="w-4 h-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="ui-field w-full pl-10 pr-3"
                  placeholder="05XX XXX XX XX"
                />
              </div>
            </div>
          </div>

        </form>
    </Modal>
  );
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
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setErrorMsg(null);
      setSuccessMsg(null);
    }
  }, [isOpen, isMandatory, student.password]);

  if (!isOpen) return null;

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentPassword) {
      setErrorMsg('Lütfen mevcut şifrenizi giriniz.');
      return;
    }

    if (newPassword.length < 6) {
      setErrorMsg('Yeni şifreniz en az 6 karakter uzunluğunda olmalıdır.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('Yeni şifreleriniz birbiriyle uyuşmuyor.');
      return;
    }

    try {
      setIsSaving(true);
      setErrorMsg(null);

      // Önce mevcut şifre Supabase'de doğrulanır, doğruysa yeni şifre Supabase'e yazılır
      await dataService.changeOwnPassword(currentPassword, newPassword);
      // "İlk girişte şifre değiştir" zorunluluğunu kaldır (şifre yerelde saklanmaz)
      dataService.markStudentPasswordChanged(student.id);

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

  return (
    <Modal
      open
      onClose={isMandatory ? () => {} : onClose}
      kapatma={!isMandatory}
      size="sm"
      icon={KeyRound}
      tone="warning"
      title={isMandatory ? 'Zorunlu Şifre Güncelleme' : 'Öğrenci Şifresi Değiştir'}
      description={
        isMandatory
          ? dataService.basitSifreVarMi(student.id) // Aşama 145
            ? 'Şifreniz çok basit. Güvenliğiniz için yeni bir şifre belirlemeniz zorunludur'
            : 'Sisteme ilk girişinizde güvenliğiniz için şifrenizi güncellemeniz zorunludur'
          : 'Giriş güvenliğinizi sağlamak için yeni şifrenizi belirleyin'
      }
      govdeClass="p-5 sm:p-6"
      footer={
        <>
          {!isMandatory && (
            <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary min-w-24">
              Vazgeç
            </button>
          )}
          <button type="submit" form="ogrenci-sifre-formu" disabled={isSaving} className="ui-btn ui-btn-primary min-w-24">
            <Check className="w-3.5 h-3.5" />
            <span>{isSaving ? 'Güncelleniyor...' : 'Şifreyi Değiştir'}</span>
          </button>
        </>
      }
    >
        <form id="ogrenci-sifre-formu" onSubmit={handlePasswordSubmit} className="space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger-fg text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-xl bg-success/10 border border-success/30 text-success-fg text-xs flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {(
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-fg-2">
                Mevcut Şifreniz <span className="text-danger-fg">*</span>
              </label>
              <div className="relative">
                <input
                  type={showCurrent ? 'text' : 'password'}
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="ui-field w-full pr-10"
                  placeholder="Mevcut şifrenizi girin"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="ui-input-btn right-3"
                >
                  {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-fg-2">
              Yeni Şifre <span className="text-danger-fg">*</span>
            </label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="ui-field w-full pr-10"
                placeholder="Yeni şifrenizi girin (en az 6 karakter)"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="ui-input-btn right-3"
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-fg-2">
              Yeni Şifreyi Tekrar Girin <span className="text-danger-fg">*</span>
            </label>
            <div className="relative">
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="ui-field w-full"
                placeholder="Yeni şifrenizi doğrulayın"
              />
            </div>
          </div>

          <div className="p-3 bg-canvas/60 rounded-xl border border-line flex items-start space-x-2 text-xs text-muted">
            <ShieldCheck className="w-4 h-4 text-brand-fg shrink-0 mt-0.5" />
            <span>Şifreniz güvenli bir şekilde sunucuda güncellenir. Unuttuğunuzda öğretmeninizden veya yöneticinizden şifrenizi sıfırlamasını isteyebilirsiniz.</span>
          </div>

        </form>
    </Modal>
  );
};
