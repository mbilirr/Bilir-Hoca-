import React, { useState } from 'react';
import { Lock, User, ShieldCheck, AlertCircle, ArrowRight, X } from 'lucide-react';
import { dataService } from '../../services/dataService';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';

interface TeacherLoginProps {
  isOpen?: boolean;
  onClose?: () => void;
  onSuccess: () => void;
  onSwitchToStudent?: () => void;
}

export const TeacherLogin: React.FC<TeacherLoginProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onSwitchToStudent,
}) => {
  const rememberedUser = dataService.getRememberedUser('teacher');
  const [username, setUsername] = useState(rememberedUser?.identifier || '');
  const [password, setPassword] = useState(rememberedUser?.savedPassword || '');
  const [rememberMe, setRememberMe] = useState(Boolean(rememberedUser));
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // If isOpen is explicitly passed as false, do not render
  if (isOpen !== undefined && !isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const teacher = await dataService.authenticateTeacher(username.trim(), password);
      if (teacher) {
        if (rememberMe) {
          dataService.setRememberedUser({
            role: 'teacher',
            identifier: teacher.username,
            name: teacher.name,
            avatar: teacher.avatar,
            branch: teacher.branch,
            savedPassword: password,
          });
        } else {
          dataService.setRememberedUser(null, 'teacher');
        }
        dataService.setAuthSession({
          role: 'teacher',
          user: teacher,
        });
        setIsLoading(false);
        onSuccess();
        if (onClose) onClose();
      } else {
        setIsLoading(false);
        setError('Geçersiz kullanıcı adı veya şifre! Lütfen kontrol ediniz.');
      }
    } catch (err: unknown) {
      setIsLoading(false);
      setError(err instanceof Error ? err.message : 'Giriş yapılamadı.');
    }
  };

  const isModalMode = isOpen !== undefined;

  const formCard = (
    <div
      className={`w-full max-w-md ${
        isModalMode ? 'bg-white shadow-2xl' : 'bg-white/95 backdrop-blur-sm shadow-xl'
      } border border-slate-200 rounded-2xl p-6 sm:p-8 relative overflow-hidden`}
    >
      {/* Close button if modal */}
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors z-20 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      )}

      <div className="text-center mb-6 relative z-10">
        <div className="w-12 h-12 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-3 text-indigo-600 shadow-sm">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
          Yönetici & Öğretmen Girişi
        </h2>
        <p className="text-slate-500 text-xs sm:text-sm mt-1">
          Sınıf, ödev, etüt ve öğrenci yönetimi için lütfen giriş yapın.
        </p>
      </div>

      {error && (
        <div className="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-center space-x-3 text-red-700 text-xs sm:text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-500" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 relative z-10">
        <Input
          id="teacher-username-input"
          label="Kullanıcı Adı veya E-posta"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          placeholder="Kullanıcı adı veya e-posta"
          leftIcon={<User className="w-4 h-4" />}
        />

        <Input
          id="teacher-password-input"
          label="Şifre"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          placeholder="••••••••"
          leftIcon={<Lock className="w-4 h-4" />}
        />

        {/* Beni Hatırla Checkbox */}
        <div className="flex items-center justify-between py-1">
          <label className="flex items-center space-x-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 accent-indigo-600 cursor-pointer"
            />
            <span className="text-xs text-slate-600 font-medium">Bu cihazda beni hatırla</span>
          </label>
        </div>

        <Button
          type="submit"
          id="teacher-login-submit"
          variant="primary"
          size="md"
          isLoading={isLoading}
          loadingText="Giriş Yapılıyor..."
          rightIcon={<ArrowRight className="w-4 h-4" />}
          className="w-full py-2.5"
        >
          Giriş Yap
        </Button>
      </form>

      {/* Switch to Student */}
      {onSwitchToStudent && (
        <div className="mt-6 pt-5 border-t border-slate-100 text-center">
          <button
            type="button"
            onClick={() => {
              if (onClose) onClose();
              onSwitchToStudent();
            }}
            className="inline-flex items-center space-x-1.5 text-xs sm:text-sm text-slate-500 hover:text-indigo-600 font-medium transition-colors cursor-pointer"
          >
            <span>Öğrenci Portalı Girişi</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );

  // If opened as a modal (modal modu aynen korunur)
  if (isModalMode) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
        {formCard}
      </div>
    );
  }

  // Tam sayfa render edildiği durum (isOpen === undefined dalı)
  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 bg-gradient-to-br from-slate-50 via-white to-indigo-50/60 relative overflow-hidden">
      {/* DEKORATİF STATİK RENK LEKELERİ (ANİMASYONSUZ, SABİT) */}
      <div className="absolute -top-24 -left-24 w-72 h-72 md:w-96 md:h-96 bg-indigo-200/40 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/4 -right-20 w-64 h-64 md:w-80 md:h-80 bg-amber-100/50 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 left-1/4 w-72 h-72 md:w-96 md:h-96 bg-emerald-100/40 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 w-full flex justify-center">{formCard}</div>
    </div>
  );
};
