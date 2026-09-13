import React, { useState } from 'react';
import { Lock, User, ShieldCheck, AlertCircle, Sparkles, ArrowRight, X } from 'lucide-react';
import { dataService } from '../../services/dataService';

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
  const rememberedUser = dataService.getRememberedUser();
  const [username, setUsername] = useState(rememberedUser?.role === 'teacher' ? rememberedUser.identifier : '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // If isOpen is explicitly passed as false, do not render
  if (isOpen !== undefined && !isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    setTimeout(() => {
      try {
        const teacher = dataService.authenticateTeacher(username.trim(), password);
        if (teacher) {
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
    }, 250);
  };

  const formContent = (
    <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl relative overflow-hidden">
      {/* Close button if modal */}
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors z-20"
        >
          <X className="w-5 h-5" />
        </button>
      )}

      {/* Decorative background glow */}
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="text-center mb-8 relative z-10">
        <div className="w-14 h-14 bg-indigo-600/20 border border-indigo-500/30 rounded-2xl flex items-center justify-center mx-auto mb-4 text-indigo-400 shadow-inner">
          <ShieldCheck className="w-7 h-7" />
        </div>
        <h2 className="text-2xl font-bold text-white tracking-tight">Yönetici & Öğretmen Girişi</h2>
        <p className="text-slate-400 text-sm mt-1.5">
          Sınıf, ödev, etüt ve öğrenci yönetimi için lütfen giriş yapın.
        </p>
      </div>

      {error && (
        <div className="mb-6 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center space-x-3 text-rose-300 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 relative z-10">
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
            Kullanıcı Adı veya E-posta
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
              <User className="w-4 h-4" />
            </div>
            <input
              type="text"
              id="teacher-username-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              placeholder="Kullanıcı adı veya e-posta"
              className="w-full pl-10 pr-4 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm transition-all"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Şifre
            </label>
          </div>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
              <Lock className="w-4 h-4" />
            </div>
            <input
              type="password"
              id="teacher-password-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full pl-10 pr-4 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm transition-all"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          id="teacher-login-submit"
          className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-semibold rounded-xl text-sm transition-all shadow-lg shadow-indigo-600/30 flex items-center justify-center space-x-2 disabled:opacity-50"
        >
          {isLoading ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <span>Giriş Yap</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      {/* Switch to Student */}
      {onSwitchToStudent && (
        <div className="mt-8 pt-6 border-t border-slate-800 text-center">
          <button
            type="button"
            onClick={() => {
              if (onClose) onClose();
              onSwitchToStudent();
            }}
            className="inline-flex items-center space-x-2 text-sm text-slate-400 hover:text-indigo-400 font-medium transition-colors"
          >
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <span>Öğrenci Portalı</span>
          </button>
        </div>
      )}
    </div>
  );

  // If opened as a modal
  if (isOpen !== undefined) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
        {formContent}
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 bg-slate-950/40">
      {formContent}
    </div>
  );
};
